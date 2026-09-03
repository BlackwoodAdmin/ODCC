import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import crypto from 'crypto';
import { query, resetTables, createUser } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { buildTestApp } from '../helpers/app.js';

// Attachment files live under DATA_DIR; both routers read it at import time.
const DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'odcc-inline-'));
process.env.DATA_DIR = DATA_DIR;

const { default: emailMessageRoutes } = await import('../../server/routes/email-messages.js');
const { default: emailAttachmentRoutes } = await import('../../server/routes/email-attachments.js');
const { signedAttachmentUrl } = await import('../../server/utils/attachment-token.js');

// Mount in the same order as server/index.js: the messages router comes
// first. Its router-wide auth guard must not swallow signed attachment
// requests that belong to the router mounted after it.
const app = buildTestApp({
  routes: {
    '/api/email': { router: emailMessageRoutes },
    '/api/email/': { router: emailAttachmentRoutes },
  },
});

// Regression coverage for inline (cid:) images. Small ones are embedded as
// data: URIs. Ones over the embed cap used to be dropped AND hidden from the
// attachment list, so a 2.5 MB phone photo vanished from the message entirely.
// They are now referenced by a signed URL the sandboxed iframe can load.

const SMALL_BYTES = 100 * 1024;
const BIG_BYTES = 2 * 1024 * 1024; // over the 1.5 MB per-image embed cap
const CID_SMALL = 'small-image@yahoo';
const CID_BIG = 'ECCD80AC-BIG-IMAGE@yahoo'; // mixed case: matching must be case-insensitive
const CID_MISSING = 'gone@yahoo';

let owner, stranger, admin, accountId, messageId, ids = {};

async function writeAttachment({ name, bytes, contentType, contentId, onDisk = true }) {
  const dir = crypto.randomUUID();
  const storagePath = `attachments/${dir}/${name}`;
  if (onDisk) {
    await fs.mkdir(path.join(DATA_DIR, 'attachments', dir), { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, storagePath), Buffer.alloc(bytes, 0x42));
  }
  const { rows } = await query(
    `INSERT INTO email_attachments (message_id, filename, content_type, size_bytes, storage_path, content_id, is_blocked, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7) RETURNING id`,
    [messageId, name, contentType, bytes, storagePath, contentId, Date.now()]
  );
  return rows[0].id;
}

beforeAll(async () => {
  await resetTables(['email_system_logs', 'email_attachments', 'email_messages', 'email_folders', 'email_accounts', 'users']);
  owner = await createUser({ email: 'owner@test.local', role: 'subscriber' });
  stranger = await createUser({ email: 'stranger@test.local', role: 'subscriber' });
  admin = await createUser({ email: 'admin@test.local', role: 'admin' });

  const now = Date.now();
  const acct = await query(
    `INSERT INTO email_accounts (address, user_id, created_at, updated_at) VALUES ('hello@church.test', $1, $2, $2) RETURNING id`,
    [owner.id, now]
  );
  accountId = acct.rows[0].id;
  const inbox = await query(
    `INSERT INTO email_folders (account_id, name, type, created_at) VALUES ($1, 'Inbox', 'inbox', $2) RETURNING id`,
    [accountId, now]
  );

  const bodyHtml = [
    '<div>Hi</div>',
    `<img id="a" src="cid:${CID_SMALL}" style="width:100px">`,
    `<img id="b" src="cid:${CID_BIG.toLowerCase()}" style="width:100px">`,
    `<img id="c" src="cid:${CID_MISSING}">`,
  ].join('');
  const msg = await query(
    `INSERT INTO email_messages (account_id, folder_id, message_id, from_address, to_addresses, subject, body_text, body_html,
                                 is_read, direction, received_at, created_at, updated_at)
     VALUES ($1, $2, '<m1@yahoo>', 'gaut2tch@yahoo.com', '[{"address":"hello@church.test"}]', '', 'Hi', $3,
             FALSE, 'inbound', $4, $4, $4) RETURNING id`,
    [accountId, inbox.rows[0].id, bodyHtml, now]
  );
  messageId = msg.rows[0].id;

  ids.small = await writeAttachment({ name: 'small.png', bytes: SMALL_BYTES, contentType: 'image/png', contentId: CID_SMALL });
  ids.big = await writeAttachment({ name: '1000083421.png', bytes: BIG_BYTES, contentType: 'image/png', contentId: CID_BIG });
  ids.missing = await writeAttachment({ name: 'gone.png', bytes: 5000, contentType: 'image/png', contentId: CID_MISSING, onDisk: false });
  ids.pdf = await writeAttachment({ name: 'flyer.pdf', bytes: 3000, contentType: 'application/pdf', contentId: null });
});

function getMessage(user = owner) {
  return request(app).get(`/api/email/accounts/${accountId}/messages/${messageId}`).set(authHeader(user));
}

describe('GET message with inline images', () => {
  it('embeds small images, links oversized ones, leaves missing ones unresolved', async () => {
    const res = await getMessage();
    expect(res.status).toBe(200);
    const html = res.body.message.body_html;

    expect(html).toMatch(new RegExp(`id="a" src="data:image/png;base64,`));
    expect(html).toMatch(new RegExp(`id="b" src="/api/email/attachments/${ids.big}\\?exp=\\d+&sig=[0-9a-f]{64}"`));
    expect(html).toContain(`id="c" src="cid:${CID_MISSING}"`);
    expect(html).not.toContain(`cid:${CID_SMALL}`);
    expect(html).not.toContain(`cid:${CID_BIG.toLowerCase()}`);
  });

  it('hides resolved inline images from the attachment list but keeps the rest', async () => {
    const res = await getMessage();
    const listed = res.body.attachments.map(a => a.filename).sort();
    expect(listed).toEqual(['flyer.pdf', 'gone.png']);
  });
});

describe('GET /api/email/attachments/:id via signed URL', () => {
  async function signedUrlFromBody() {
    const res = await getMessage();
    const m = res.body.message.body_html.match(/id="b" src="([^"]+)"/);
    return m[1];
  }

  it('serves the oversized image with no bearer token', async () => {
    const url = await signedUrlFromBody();
    const res = await request(app).get(url).buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(res.headers['cache-control']).toMatch(/private, max-age=\d+/);
    expect(res.body.length).toBe(BIG_BYTES);
  });

  it('rejects a tampered signature', async () => {
    const url = await signedUrlFromBody();
    const tampered = url.replace(/sig=([0-9a-f])/, (_, c) => `sig=${c === 'a' ? 'b' : 'a'}`);
    const res = await request(app).get(tampered);
    expect(res.status).toBe(401);
  });

  it('rejects a signature minted for a different attachment', async () => {
    const url = await signedUrlFromBody();
    const res = await request(app).get(url.replace(`/attachments/${ids.big}?`, `/attachments/${ids.pdf}?`));
    expect(res.status).toBe(401);
  });

  it('rejects an expired link', async () => {
    const expired = signedAttachmentUrl(ids.big, -1000);
    const res = await request(app).get(expired);
    expect(res.status).toBe(401);
  });

  it('still requires a bearer token when no signature is present', async () => {
    const res = await request(app).get(`/api/email/attachments/${ids.big}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/email/attachments/:id via bearer token (unchanged)', () => {
  it('allows the owner and an admin, denies another user', async () => {
    const own = await request(app).get(`/api/email/attachments/${ids.pdf}`).set(authHeader(owner));
    expect(own.status).toBe(200);
    const adm = await request(app).get(`/api/email/attachments/${ids.pdf}`).set(authHeader(admin));
    expect(adm.status).toBe(200);
    const other = await request(app).get(`/api/email/attachments/${ids.pdf}`).set(authHeader(stranger));
    expect(other.status).toBe(403);
  });
});
