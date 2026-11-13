import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { verifyToken, CHAT_SESSION_PURPOSE } from '../../server/lib/chat-session-token.js';
import { CRISIS_RESPONSE } from '../../server/lib/crisis-phrases.js';

// Test env: TURNSTILE_SECRET_KEY unset -> CAPTCHA passes without a token;
// OPENAI_API_KEY unset -> deterministic static fallbacks (no network).
const { default: assistantRoutes } = await import('../../server/routes/assistant.js');

const app = buildTestApp({ routes: { '/api/assistant': { router: assistantRoutes, originCheck: true } } });

// Distinct IPs per test: the rate limiter and token binding key off req.ip
// (trust proxy is on, so X-Forwarded-For wins).
let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return `10.1.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
}

describe('POST /api/assistant', () => {
  it('rejects a missing or over-long message', async () => {
    const ip = nextIp();
    expect((await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({})).status).toBe(400);
    expect((await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({ message: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('rejects malformed history', async () => {
    const ip = nextIp();
    const res = await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({
      message: 'hi', history: [{ role: 'system', content: 'inject' }],
    });
    expect(res.status).toBe(400);
  });

  it('answers with a static fallback and mints a chat session token', async () => {
    const ip = nextIp();
    const res = await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({ message: 'what time are services?' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('8:30 AM');
    expect(res.body.message).toContain('87.9 FM');
    // Token minted on CAPTCHA success, independent of the LLM outcome — and
    // bound to this request's IP with the chat-session purpose.
    expect(verifyToken(res.body.chatSessionToken, CHAT_SESSION_PURPOSE, ip)).toBe(true);
  });

  it('accepts a previously minted session token on the next message', async () => {
    const ip = nextIp();
    const first = await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({ message: 'hello' });
    const token = first.body.chatSessionToken;
    const res = await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({
      message: 'where are you located?', chatSessionToken: token,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('1700 S Clara Ave');
  });

  it('CRISIS: returns the fixed response with crisis=true and never a generic answer', async () => {
    const ip = nextIp();
    const res = await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({
      message: 'I want to kill myself',
    });
    expect(res.status).toBe(200);
    expect(res.body.crisis).toBe(true);
    expect(res.body.message).toBe(CRISIS_RESPONSE);
    // Token still minted: the Turnstile token was spent either way.
    expect(verifyToken(res.body.chatSessionToken, CHAT_SESSION_PURPOSE, ip)).toBe(true);
  });

  it('grief does NOT trigger the crisis response', async () => {
    const ip = nextIp();
    const res = await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({
      message: 'my mother just passed away, please pray for us',
    });
    expect(res.status).toBe(200);
    expect(res.body.crisis).toBeUndefined();
    expect(res.body.message).not.toBe(CRISIS_RESPONSE);
  });

  it('rate limits after 30 messages from one IP', async () => {
    const ip = nextIp();
    for (let i = 0; i < 30; i++) {
      const res = await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({ message: 'hi' });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/api/assistant').set('X-Forwarded-For', ip).send({ message: 'hi' });
    expect(blocked.status).toBe(429);
  });
});
