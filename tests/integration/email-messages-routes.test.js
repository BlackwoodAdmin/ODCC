import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { query, resetTables, createUser } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { buildTestApp } from '../helpers/app.js';

const { default: emailMessageRoutes } = await import('../../server/routes/email-messages.js');

const app = buildTestApp({ routes: { '/api/email': { router: emailMessageRoutes } } });

// Regression coverage for the message list endpoint's pagination contract.
// The dashboard reads `pagination.total` to decide whether to show the pager;
// if this shape drifts, older messages become unreachable in the UI.

const TOTAL_MESSAGES = 60;
const THREAD_ID = '<thread-root@test.local>';
const THREAD_SIZE = 3;

let owner, otherUser, admin, accountId, inboxId, sentId;

beforeAll(async () => {
  await resetTables(['email_messages', 'email_folders', 'email_accounts', 'users']);
  owner = await createUser({ email: 'owner@test.local', role: 'subscriber' });
  otherUser = await createUser({ email: 'other@test.local', role: 'subscriber' });
  admin = await createUser({ email: 'admin@test.local', role: 'admin' });

  const now = Date.now();
  const acct = await query(
    `INSERT INTO email_accounts (address, display_name, user_id, created_at, updated_at)
     VALUES ('owner@church.test', 'Owner', $1, $2, $2) RETURNING id`,
    [owner.id, now]
  );
  accountId = acct.rows[0].id;

  const inbox = await query(
    `INSERT INTO email_folders (account_id, name, type, created_at) VALUES ($1, 'Inbox', 'inbox', $2) RETURNING id`,
    [accountId, now]
  );
  inboxId = inbox.rows[0].id;
  const sent = await query(
    `INSERT INTO email_folders (account_id, name, type, created_at) VALUES ($1, 'Sent', 'sent', $2) RETURNING id`,
    [accountId, now]
  );
  sentId = sent.rows[0].id;

  // Message i is received i minutes ago, so i=0 is the newest.
  // The first THREAD_SIZE messages share a thread; the rest are standalone.
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    const receivedAt = now - i * 60_000;
    const threadId = i < THREAD_SIZE ? THREAD_ID : null;
    await query(
      `INSERT INTO email_messages
         (account_id, folder_id, message_id, thread_id, from_address, from_name, to_addresses,
          subject, body_text, is_read, direction, received_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'sender@example.com', 'Sender', '[{"address":"owner@church.test"}]',
               $5, 'body', $6, 'inbound', $7, $7, $7)`,
      [accountId, inboxId, `<msg-${i}@test.local>`, threadId, `Message ${i}`, i % 2 === 0, receivedAt]
    );
  }

  // One message in Sent so folder filtering is exercised.
  await query(
    `INSERT INTO email_messages
       (account_id, folder_id, message_id, from_address, to_addresses, subject, body_text,
        direction, sent_at, created_at, updated_at)
     VALUES ($1, $2, '<sent-1@test.local>', 'owner@church.test', '[{"address":"x@example.com"}]',
             'Sent one', 'body', 'outbound', $3, $3, $3)`,
    [accountId, sentId, now]
  );
});

function list(params, user = owner) {
  const qs = new URLSearchParams({ folderId: String(inboxId), ...params });
  return request(app)
    .get(`/api/email/accounts/${accountId}/messages?${qs}`)
    .set(authHeader(user));
}

describe('GET /api/email/accounts/:id/messages (flat)', () => {
  it('returns the first page with pagination metadata under `pagination`', async () => {
    const res = await list({ page: 1, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(50);
    expect(res.body.pagination).toEqual({ page: 1, limit: 50, total: TOTAL_MESSAGES, totalPages: 2 });
    expect(res.body.messages[0].subject).toBe('Message 0');
  });

  it('returns the remaining older messages on page 2', async () => {
    const res = await list({ page: 2, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(10);
    expect(res.body.pagination).toMatchObject({ page: 2, total: TOTAL_MESSAGES, totalPages: 2 });
    const subjects = res.body.messages.map(m => m.subject);
    expect(subjects[0]).toBe('Message 50');
    expect(subjects.at(-1)).toBe('Message 59');
    expect(subjects).not.toContain('Message 0');
  });

  it('does not overlap between consecutive pages', async () => {
    const [p1, p2, p3] = await Promise.all([
      list({ page: 1, limit: 25 }),
      list({ page: 2, limit: 25 }),
      list({ page: 3, limit: 25 }),
    ]);
    const ids = [...p1.body.messages, ...p2.body.messages, ...p3.body.messages].map(m => m.id);
    expect(ids).toHaveLength(TOTAL_MESSAGES);
    expect(new Set(ids).size).toBe(TOTAL_MESSAGES);
    expect(p3.body.pagination.totalPages).toBe(3);
  });

  it('clamps limit to 100 and page to at least 1', async () => {
    const res = await list({ page: 0, limit: 500 });
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(100);
    expect(res.body.messages).toHaveLength(TOTAL_MESSAGES);
  });

  it('returns an empty page past the end but keeps the total', async () => {
    const res = await list({ page: 9, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(0);
    expect(res.body.pagination.total).toBe(TOTAL_MESSAGES);
  });

  it('scopes the count to the requested folder', async () => {
    const res = await list({ folderId: String(sentId), page: 1, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });
});

describe('GET /api/email/accounts/:id/messages (threaded)', () => {
  const threadCount = TOTAL_MESSAGES - THREAD_SIZE + 1;

  it('counts threads, not messages, in the total', async () => {
    const res = await list({ threaded: 'true', page: 1, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 1, limit: 50, total: threadCount, totalPages: 2 });
    expect(res.body.messages).toHaveLength(50);

    const thread = res.body.messages.find(m => m.thread_id === THREAD_ID);
    expect(thread).toBeDefined();
    expect(Number(thread.thread_count)).toBe(THREAD_SIZE);
    expect(thread.subject).toBe('Message 0'); // latest message represents the thread
  });

  it('pages the remaining threads', async () => {
    const res = await list({ threaded: 'true', page: 2, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(threadCount - 50);
    expect(res.body.messages.every(m => m.thread_id === null)).toBe(true);
  });
});

describe('GET /api/email/accounts/:id/messages (access)', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get(`/api/email/accounts/${accountId}/messages`);
    expect(res.status).toBe(401);
  });

  it('hides accounts the user does not own', async () => {
    const res = await list({ page: 1 }, otherUser);
    expect(res.status).toBe(404);
  });

  it('lets admins list any account', async () => {
    const res = await list({ page: 2, limit: 50 }, admin);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(10);
  });
});
