import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { query, resetTables, createUser } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { buildTestApp } from '../helpers/app.js';
import { createToken, CHAT_SESSION_PURPOSE } from '../../server/lib/chat-session-token.js';
import { CRISIS_RESPONSE } from '../../server/lib/crisis-phrases.js';
import {
  findFallbackEmailCandidates, endStaleWaitingSessions, endIdleConnectedSessions,
  purgeOldSessions, WAITING_MAX_MS, CONNECTED_IDLE_MAX_MS, RETENTION_MS, ENDED_GRACE_MS,
} from '../../server/lib/chat-db.js';
import { transcriptHtml } from '../../server/cron/chat-maintenance.js';

const { default: chatRoutes } = await import('../../server/routes/chat.js');

const app = buildTestApp({ routes: { '/api/chat': { router: chatRoutes, originCheck: true } } });

let admin;
let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return `10.2.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
}

async function setAvailable(value = true) {
  await request(app).put('/api/chat/admin/presence').set(authHeader(admin)).send({ available: value });
}

async function escalate(ip, overrides = {}) {
  return request(app).post('/api/chat/escalate').set('X-Forwarded-For', ip).send({
    pageUrl: '/new-here',
    userAgent: 'test-agent',
    chatHistory: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi there' }],
    ...overrides,
  });
}

beforeEach(async () => {
  await resetTables(['chat_messages', 'chat_sessions', 'chat_agent_presence', 'users']);
  admin = await createUser({ email: 'admin@test.local', role: 'admin' });
});

describe('presence', () => {
  it('defaults to unavailable and toggles via the admin route', async () => {
    expect((await request(app).get('/api/chat/presence')).body.available).toBe(false);
    await setAvailable(true);
    expect((await request(app).get('/api/chat/presence')).body.available).toBe(true);
    await setAvailable(false);
    expect((await request(app).get('/api/chat/presence')).body.available).toBe(false);
  });

  it('rejects non-admin presence changes', async () => {
    const sub = await createUser({ email: 'sub@test.local', role: 'subscriber' });
    const res = await request(app).put('/api/chat/admin/presence').set(authHeader(sub)).send({ available: true });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/chat/escalate', () => {
  it('503 with reason=unavailable when no one is available (presence gate reads the DB)', async () => {
    const res = await escalate(nextIp());
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('unavailable');
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM chat_sessions');
    expect(rows[0].c).toBe(0);
  });

  it('creates a waiting session with sanitized history when available', async () => {
    await setAvailable();
    const res = await escalate(nextIp(), {
      chatHistory: [{ role: 'user', content: 'hi‮there' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.status).toBe('waiting');
    const { rows } = await query('SELECT * FROM chat_sessions');
    expect(rows[0].status).toBe('waiting');
    expect(rows[0].fallback_email_at).toBe(null);
    expect(rows[0].chat_history[0].content).toBe('hithere'); // bidi override stripped
  });

  it('rejects malformed history with 400', async () => {
    await setAvailable();
    const res = await escalate(nextIp(), { chatHistory: [{ role: 'system', content: 'x' }] });
    expect(res.status).toBe(400);
  });

  it('rate limits after 5 attempts from one IP', async () => {
    await setAvailable();
    const ip = nextIp();
    for (let i = 0; i < 5; i++) expect((await escalate(ip)).status).toBe(201);
    expect((await escalate(ip)).status).toBe(429);
  });
});

describe('visitor session routes', () => {
  let sessionId;
  let ip;
  beforeEach(async () => {
    await setAvailable();
    ip = nextIp();
    sessionId = (await escalate(ip)).body.sessionId;
  });

  it('GET /session/:id probe returns session + messages; unknown ids 404', async () => {
    const res = await request(app).get(`/api/chat/session/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('waiting');
    expect(typeof res.body.session.createdAt).toBe('number');
    expect(res.body.messages).toEqual([]);

    expect((await request(app).get('/api/chat/session/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await request(app).get('/api/chat/session/not-a-uuid')).status).toBe(404);
  });

  it('visitor can send a message; it lands in the transcript', async () => {
    const res = await request(app).post(`/api/chat/session/${sessionId}/messages`).set('X-Forwarded-For', ip).send({ content: 'anyone there?' });
    expect(res.status).toBe(201);
    const probe = await request(app).get(`/api/chat/session/${sessionId}`);
    expect(probe.body.messages).toHaveLength(1);
    expect(probe.body.messages[0]).toMatchObject({ sender: 'user', content: 'anyone there?' });
  });

  it('CRISIS in live chat inserts a system message with the fixed response', async () => {
    await request(app).post(`/api/chat/session/${sessionId}/messages`).set('X-Forwarded-For', ip).send({ content: 'I want to hurt myself, can I talk to someone' });
    const probe = await request(app).get(`/api/chat/session/${sessionId}`);
    expect(probe.body.messages).toHaveLength(2);
    expect(probe.body.messages[1].sender).toBe('system');
    expect(probe.body.messages[1].content).toBe(CRISIS_RESPONSE);
  });

  it('visitor end marks visitor_ended; timeout reason is whitelisted', async () => {
    await request(app).post(`/api/chat/session/${sessionId}/end`).send({});
    let { rows } = await query('SELECT status, end_reason FROM chat_sessions WHERE id=$1', [sessionId]);
    expect(rows[0]).toEqual({ status: 'ended', end_reason: 'visitor_ended' });

    const second = (await escalate(nextIp())).body.sessionId;
    await request(app).post(`/api/chat/session/${second}/end`).send({ reason: 'timeout' });
    ({ rows } = await query('SELECT end_reason FROM chat_sessions WHERE id=$1', [second]));
    expect(rows[0].end_reason).toBe('timeout');
  });

  it('answers 410 past the 15-minute post-end grace, 200 within it', async () => {
    await request(app).post(`/api/chat/session/${sessionId}/end`).send({});
    expect((await request(app).get(`/api/chat/session/${sessionId}`)).status).toBe(200);
    await query('UPDATE chat_sessions SET ended_at = $2 WHERE id = $1', [sessionId, Date.now() - ENDED_GRACE_MS - 1000]);
    expect((await request(app).get(`/api/chat/session/${sessionId}`)).status).toBe(410);
    expect((await request(app).post(`/api/chat/session/${sessionId}/messages`).send({ content: 'hi' })).status).toBe(410);
  });
});

describe('admin console routes', () => {
  let sessionId;
  beforeEach(async () => {
    await setAvailable();
    sessionId = (await escalate(nextIp())).body.sessionId;
  });

  it('lists sessions, waiting first, with pre-handoff history on the detail view', async () => {
    const list = await request(app).get('/api/chat/admin/sessions').set(authHeader(admin));
    expect(list.status).toBe(200);
    expect(list.body.sessions[0].id).toBe(sessionId);

    const detail = await request(app).get(`/api/chat/admin/sessions/${sessionId}`).set(authHeader(admin));
    expect(detail.body.session.chat_history).toHaveLength(2);
  });

  it('ATOMIC CLAIM: first admin wins, second gets 409', async () => {
    const first = await request(app).post(`/api/chat/admin/sessions/${sessionId}/claim`).set(authHeader(admin));
    expect(first.status).toBe(200);
    expect(first.body.session.status).toBe('connected');

    const second = await request(app).post(`/api/chat/admin/sessions/${sessionId}/claim`).set(authHeader(admin));
    expect(second.status).toBe(409);
  });

  it('admin reply lands as an agent message; admin end marks agent_ended', async () => {
    await request(app).post(`/api/chat/admin/sessions/${sessionId}/claim`).set(authHeader(admin));
    const msg = await request(app).post(`/api/chat/admin/sessions/${sessionId}/messages`).set(authHeader(admin)).send({ content: 'Hi, this is Steve!' });
    expect(msg.status).toBe(201);

    const probe = await request(app).get(`/api/chat/session/${sessionId}`);
    expect(probe.body.messages[0]).toMatchObject({ sender: 'agent', content: 'Hi, this is Steve!' });

    await request(app).post(`/api/chat/admin/sessions/${sessionId}/end`).set(authHeader(admin));
    const { rows } = await query('SELECT status, end_reason FROM chat_sessions WHERE id=$1', [sessionId]);
    expect(rows[0]).toEqual({ status: 'ended', end_reason: 'agent_ended' });
  });

  it('admin routes reject non-admins and anonymous callers', async () => {
    const sub = await createUser({ email: 'sub2@test.local', role: 'subscriber' });
    expect((await request(app).get('/api/chat/admin/sessions')).status).toBe(401);
    expect((await request(app).get('/api/chat/admin/sessions').set(authHeader(sub))).status).toBe(403);
    expect((await request(app).post('/api/chat/admin/events-ticket').set(authHeader(sub))).status).toBe(403);
  });
});

describe('admin stream ticket auth', () => {
  it('Bearer call mints a ticket; the events route rejects missing/garbage tickets', async () => {
    const minted = await request(app).post('/api/chat/admin/events-ticket').set(authHeader(admin)).set('X-Forwarded-For', '10.9.9.9');
    expect(minted.status).toBe(200);
    expect(typeof minted.body.ticket).toBe('string');

    expect((await request(app).get('/api/chat/admin/events')).status).toBe(401);
    expect((await request(app).get('/api/chat/admin/events?ticket=garbage')).status).toBe(401);
  });

  it('DOMAIN SEPARATION: a visitor chat-session token is rejected as a stream ticket', async () => {
    const ip = '10.9.9.10';
    const visitorToken = createToken(CHAT_SESSION_PURPOSE, ip);
    const res = await request(app)
      .get(`/api/chat/admin/events?ticket=${encodeURIComponent(visitorToken)}`)
      .set('X-Forwarded-For', ip);
    expect(res.status).toBe(401);
  });
});

describe('maintenance sweeps (DAL)', () => {
  beforeEach(async () => setAvailable());

  it('finds fallback-email candidates only past the 2-minute mark and only unmailed', async () => {
    const fresh = (await escalate(nextIp())).body.sessionId;
    const stale = (await escalate(nextIp())).body.sessionId;
    await query('UPDATE chat_sessions SET created_at = $2 WHERE id = $1', [stale, Date.now() - 3 * 60 * 1000]);

    let candidates = await findFallbackEmailCandidates();
    expect(candidates.map((s) => s.id)).toEqual([stale]);

    await query('UPDATE chat_sessions SET fallback_email_at = $2 WHERE id = $1', [stale, Date.now()]);
    candidates = await findFallbackEmailCandidates();
    expect(candidates).toEqual([]);
    expect(fresh).toBeTruthy();
  });

  it('ends waiting sessions only past the 10-minute backstop (the client 5-minute timer fires first)', async () => {
    const s = (await escalate(nextIp())).body.sessionId;
    await query('UPDATE chat_sessions SET created_at = $2 WHERE id = $1', [s, Date.now() - 6 * 60 * 1000]);
    expect(await endStaleWaitingSessions()).toEqual([]); // 6 min: NOT ended

    await query('UPDATE chat_sessions SET created_at = $2 WHERE id = $1', [s, Date.now() - WAITING_MAX_MS - 1000]);
    expect(await endStaleWaitingSessions()).toEqual([s]);
    const { rows } = await query('SELECT status, end_reason FROM chat_sessions WHERE id=$1', [s]);
    expect(rows[0]).toEqual({ status: 'ended', end_reason: 'timeout' });
  });

  it('ends idle connected sessions and purges past retention', async () => {
    const s = (await escalate(nextIp())).body.sessionId;
    await request(app).post(`/api/chat/admin/sessions/${s}/claim`).set(authHeader(admin));
    await query('UPDATE chat_sessions SET last_activity_at = $2 WHERE id = $1', [s, Date.now() - CONNECTED_IDLE_MAX_MS - 1000]);
    expect(await endIdleConnectedSessions()).toEqual([s]);

    await query('UPDATE chat_sessions SET ended_at = $2 WHERE id = $1', [s, Date.now() - RETENTION_MS - 1000]);
    expect(await purgeOldSessions()).toBe(1);
    expect((await query('SELECT COUNT(*)::int AS c FROM chat_sessions')).rows[0].c).toBe(0);
  });
});

describe('fallback email transcript', () => {
  it('HTML-escapes attacker-controlled text (the sanitizer is NOT HTML safety)', () => {
    const html = transcriptHtml(
      [{ role: 'user', content: '<img src=x onerror=alert(1)>' }],
      [{ sender: 'user', content: 'a & b <script>evil()</script>' }]
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('a &amp; b &lt;script&gt;evil()&lt;/script&gt;');
  });
});
