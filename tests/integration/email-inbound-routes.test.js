import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { query, resetTables, createUser } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';

// Keep attachment writes out of the repo's data/ directory.
process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'odcc-inbound-'));

const { default: emailInboundRoutes } = await import('../../server/routes/email-inbound.js');

const app = buildTestApp({ routes: { '/api/email': { router: emailInboundRoutes } } });

const TOKEN = process.env.INBOUND_WEBHOOK_SECRET;
const ACCOUNT_ADDRESS = 'hello@church.test';

// Regression coverage for oversized inbound mail. SendGrid posts the raw MIME
// message as one text field; a photo attachment pushes that field well past
// multer's 1 MB default fieldSize, which used to 500 before the handler ran.

/** Build a raw MIME message carrying a base64 "photo" of roughly `photoBytes`. */
function rawMimeWithPhoto(photoBytes) {
  const photo = Buffer.alloc(photoBytes, 0xab).toString('base64').match(/.{1,76}/g).join('\r\n');
  return [
    'From: Steve Tester <sender@example.com>',
    `To: ${ACCOUNT_ADDRESS}`,
    'Subject: Photo from my phone',
    'Message-ID: <photo-1@example.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="outer"',
    '',
    '--outer',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Here is the photo.',
    '--outer',
    'Content-Type: image/jpeg; name="photo.jpg"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="photo.jpg"',
    '',
    photo,
    '--outer--',
    '',
  ].join('\r\n');
}

function postInbound(token, rawMime, overrides = {}) {
  return request(app)
    .post(`/api/email/inbound/${token}`)
    .field('from', 'Steve Tester <sender@example.com>')
    .field('to', ACCOUNT_ADDRESS)
    .field('subject', 'Photo from my phone')
    .field('spam_score', '0.1')
    .field('envelope', JSON.stringify({ to: [ACCOUNT_ADDRESS], from: 'sender@example.com' }))
    .field('email', rawMime)
    .field('charsets', '{}')
    .field('SPF', 'pass');
}

let accountId;

beforeAll(async () => {
  await resetTables(['email_system_logs', 'email_attachments', 'email_messages', 'email_folders', 'email_contacts', 'email_accounts', 'users']);
  const owner = await createUser({ email: 'owner@test.local', role: 'subscriber' });
  const now = Date.now();
  const acct = await query(
    `INSERT INTO email_accounts (address, display_name, user_id, created_at, updated_at)
     VALUES ($1, 'Hello', $2, $3, $3) RETURNING id`,
    [ACCOUNT_ADDRESS, owner.id, now]
  );
  accountId = acct.rows[0].id;
});

describe('POST /api/email/inbound/:token with a large raw MIME field', () => {
  it('has a webhook secret configured for the test run', () => {
    expect(TOKEN).toBeTruthy();
  });

  it('reaches the handler (403 for a bad token) instead of failing in multer', async () => {
    const res = await postInbound('not-the-token', rawMimeWithPhoto(1_500_000));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('delivers a ~2 MB photo email to the inbox with its attachment', async () => {
    const res = await postInbound(TOKEN, rawMimeWithPhoto(2_000_000));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const msgs = await query(
      `SELECT m.id, m.subject, m.from_address, m.size_bytes, f.name AS folder
       FROM email_messages m LEFT JOIN email_folders f ON f.id = m.folder_id
       WHERE m.account_id = $1 AND m.direction = 'inbound'`,
      [accountId]
    );
    expect(msgs.rows).toHaveLength(1);
    expect(msgs.rows[0].folder).toBe('Inbox');
    expect(msgs.rows[0].subject).toBe('Photo from my phone');
    expect(msgs.rows[0].from_address).toBe('sender@example.com');
    expect(msgs.rows[0].size_bytes).toBeGreaterThan(1_900_000);

    const atts = await query('SELECT * FROM email_attachments WHERE message_id = $1', [msgs.rows[0].id]);
    expect(atts.rows).toHaveLength(1);
    expect(atts.rows[0].filename).toBe('photo.jpg');
    expect(Number(atts.rows[0].size_bytes)).toBe(2_000_000);

    const errors = await query(`SELECT * FROM email_system_logs WHERE level = 'error'`);
    expect(errors.rows).toHaveLength(0);
  });
});
