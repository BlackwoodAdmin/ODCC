import { Router } from 'express';
import crypto from 'crypto';
import sgMail from '@sendgrid/mail';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { emailLog } from '../utils/email-log.js';

const router = Router();

// ── Module-level pending-send map ────────────────────────────────────────────
// Maps messageId → setTimeout handle so cancel-send can clear it.
// Exported for cron startup recovery.
export const pendingSends = new Map();

// ── Size limit ───────────────────────────────────────────────────────────────
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024; // 25 MB

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureSendGrid() {
  const key = process.env.SENDGRID_API_KEY;
  if (key) sgMail.setApiKey(key);
  return !!key;
}

/**
 * Verify the requesting user owns the account (or is admin).
 * Attaches `req.emailAccount` on success.
 */
async function verifyAccountAccess(req, res) {
  const accountId = parseInt(req.params.id, 10);
  if (isNaN(accountId)) {
    res.status(400).json({ error: 'Invalid account ID' });
    return false;
  }

  if (req.user.role === 'admin') {
    const acct = await query('SELECT * FROM email_accounts WHERE id = $1', [accountId]);
    if (!acct.rows.length) {
      res.status(404).json({ error: 'Account not found' });
      return false;
    }
    req.emailAccount = acct.rows[0];
    return true;
  }

  const acct = await query(
    'SELECT * FROM email_accounts WHERE id = $1 AND user_id = $2',
    [accountId, req.user.id]
  );
  if (!acct.rows.length) {
    res.status(404).json({ error: 'Account not found' });
    return false;
  }
  req.emailAccount = acct.rows[0];
  return true;
}

/**
 * Generate an RFC 2822 compliant Message-ID.
 */
function generateMessageId(domain) {
  return `<${crypto.randomUUID()}@${domain}>`;
}

/**
 * Extract domain from an email address.
 */
function extractDomain(address) {
  return address.split('@')[1] || 'localhost';
}

/**
 * Upsert recipients into email_contacts for auto-collect.
 */
async function autoCollectContacts(accountId, recipients) {
  const now = Date.now();
  for (const r of recipients) {
    const email = typeof r === 'string' ? r : r.email;
    const name = typeof r === 'string' ? null : r.name || null;
    if (!email) continue;
    try {
      await query(
        `INSERT INTO email_contacts (account_id, email, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id, email) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, email_contacts.name),
           updated_at = EXCLUDED.updated_at`,
        [accountId, email.toLowerCase(), name, now, now]
      );
    } catch (err) {
      // Non-critical — log and continue
      console.error('[EmailMessages] Contact auto-collect failed:', err.message);
    }
  }
}

/**
 * Log to email_audit_log.
 */
async function auditLog(accountId, userId, action, messageId, details, ip) {
  try {
    await query(
      `INSERT INTO email_audit_log (account_id, user_id, action, message_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [accountId, userId, action, messageId, details ? JSON.stringify(details) : null, ip, Date.now()]
    );
  } catch (err) {
    console.error('[EmailMessages] Audit log failed:', err.message);
  }
}

/**
 * Get the Drafts folder ID for an account (creates if missing).
 */
async function getDraftsFolderId(accountId) {
  const result = await query(
    "SELECT id FROM email_folders WHERE account_id = $1 AND type = 'drafts'",
    [accountId]
  );
  if (result.rows.length) return result.rows[0].id;
  const ins = await query(
    "INSERT INTO email_folders (account_id, name, type, sort_order, created_at) VALUES ($1, 'Drafts', 'drafts', 2, $2) RETURNING id",
    [accountId, Date.now()]
  );
  return ins.rows[0].id;
}

/**
 * Get the Sent folder ID for an account (creates if missing).
 */
async function getSentFolderId(accountId) {
  const result = await query(
    "SELECT id FROM email_folders WHERE account_id = $1 AND type = 'sent'",
    [accountId]
  );
  if (result.rows.length) return result.rows[0].id;
  const ins = await query(
    "INSERT INTO email_folders (account_id, name, type, sort_order, created_at) VALUES ($1, 'Sent', 'sent', 3, $2) RETURNING id",
    [accountId, Date.now()]
  );
  return ins.rows[0].id;
}

/**
 * Get the Trash folder ID for an account (creates if missing).
 */
async function getTrashFolderId(accountId) {
  const result = await query(
    "SELECT id FROM email_folders WHERE account_id = $1 AND type = 'trash'",
    [accountId]
  );
  if (result.rows.length) return result.rows[0].id;
  const ins = await query(
    "INSERT INTO email_folders (account_id, name, type, sort_order, created_at) VALUES ($1, 'Trash', 'trash', 5, $2) RETURNING id",
    [accountId, Date.now()]
  );
  return ins.rows[0].id;
}

/**
 * Get the Archive folder ID for an account (creates if missing).
 */
async function getArchiveFolderId(accountId) {
  const result = await query(
    "SELECT id FROM email_folders WHERE account_id = $1 AND type = 'archive'",
    [accountId]
  );
  if (result.rows.length) return result.rows[0].id;
  const ins = await query(
    "INSERT INTO email_folders (account_id, name, type, sort_order, created_at) VALUES ($1, 'Archive', 'archive', 4, $2) RETURNING id",
    [accountId, Date.now()]
  );
  return ins.rows[0].id;
}

/**
 * Collect all email addresses from to/cc/bcc arrays.
 */
function collectAllRecipients(to, cc, bcc) {
  const all = [];
  for (const list of [to, cc, bcc]) {
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      const email = typeof r === 'string' ? r : r.email;
      if (email) all.push(r);
    }
  }
  return all;
}

/**
 * Core send logic — called by the undo-send timeout and reply/forward.
 * Sends via SendGrid, updates DB status, increments daily count, collects contacts.
 */
async function executeSend(messageId, accountId, userId, ip) {
  const msgResult = await query('SELECT * FROM email_messages WHERE id = $1 AND account_id = $2', [messageId, accountId]);
  if (!msgResult.rows.length) return;
  const msg = msgResult.rows[0];

  // If cancelled or already sent, bail
  if (msg.send_status !== 'pending') {
    pendingSends.delete(messageId);
    return;
  }

  if (!ensureSendGrid()) {
    await query(
      "UPDATE email_messages SET send_status = 'failed', send_error = $1, updated_at = $2 WHERE id = $3",
      ['SendGrid API key not configured', Date.now(), messageId]
    );
    await emailLog('error', 'outbound', 'SendGrid not configured', { messageId });
    pendingSends.delete(messageId);
    return;
  }

  const acctResult = await query('SELECT * FROM email_accounts WHERE id = $1', [accountId]);
  if (!acctResult.rows.length) {
    pendingSends.delete(messageId);
    return;
  }
  const account = acctResult.rows[0];

  // Build SendGrid message
  const toAddrs = (msg.to_addresses || []).map(r => (typeof r === 'string' ? r : r.address || r.email)).filter(Boolean);
  const ccAddrs = (msg.cc_addresses || []).map(r => (typeof r === 'string' ? r : r.address || r.email)).filter(Boolean);
  const bccAddrs = (msg.bcc_addresses || []).map(r => (typeof r === 'string' ? r : r.address || r.email)).filter(Boolean);

  const sgMsg = {
    to: toAddrs,
    from: { email: account.address, name: account.display_name || account.address },
    replyTo: { email: account.address, name: account.display_name || account.address },
    subject: msg.subject || '(no subject)',
    ...(msg.body_html ? { html: msg.body_html } : {}),
    ...(msg.body_text ? { text: msg.body_text } : {}),
    headers: {},
  };

  if (ccAddrs.length) sgMsg.cc = ccAddrs;
  if (bccAddrs.length) sgMsg.bcc = bccAddrs;
  if (msg.message_id) sgMsg.headers['Message-ID'] = msg.message_id;
  if (msg.in_reply_to) sgMsg.headers['In-Reply-To'] = msg.in_reply_to;
  if (msg.references_header) sgMsg.headers['References'] = msg.references_header;

  // Attempt send with one retry for transient failures
  let sent = false;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await sgMail.send(sgMsg);
      sent = true;
      break;
    } catch (err) {
      lastError = err;
      const status = err?.code || err?.response?.statusCode;
      // Permanent failure (4xx) — no retry
      if (status >= 400 && status < 500) break;
      // Transient failure (5xx, 429) — retry once after 5s backoff
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  const now = Date.now();
  if (sent) {
    // Move to Sent folder
    const sentFolderId = await getSentFolderId(accountId);
    await query(
      `UPDATE email_messages
       SET send_status = 'sent', sent_at = $1, folder_id = $2, is_draft = FALSE, updated_at = $3
       WHERE id = $4`,
      [now, sentFolderId, now, messageId]
    );

    // Increment daily send count
    await query(
      'UPDATE email_accounts SET daily_send_count = daily_send_count + 1, updated_at = $1 WHERE id = $2',
      [now, accountId]
    );

    // Auto-collect contacts
    const allRecipients = collectAllRecipients(msg.to_addresses, msg.cc_addresses, msg.bcc_addresses);
    await autoCollectContacts(accountId, allRecipients);

    await auditLog(accountId, userId, 'send', messageId, { to: toAddrs, subject: msg.subject }, ip);
    await emailLog('info', 'outbound', `Message sent: ${msg.subject}`, { messageId, to: toAddrs });
  } else {
    const errorMsg = lastError?.response?.body?.errors?.[0]?.message || lastError?.message || 'Unknown send error';
    await query(
      "UPDATE email_messages SET send_status = 'failed', send_error = $1, updated_at = $2 WHERE id = $3",
      [errorMsg, now, messageId]
    );
    await auditLog(accountId, userId, 'send_failed', messageId, { error: errorMsg }, ip);
    await emailLog('error', 'outbound', `Send failed: ${errorMsg}`, { messageId, to: toAddrs });
  }

  pendingSends.delete(messageId);
}

/**
 * Schedule a pending send with undo-send delay.
 */
function scheduleSend(messageId, accountId, userId, ip) {
  const handle = setTimeout(() => {
    executeSend(messageId, accountId, userId, ip).catch(err => {
      console.error('[EmailMessages] executeSend error:', err.message);
    });
  }, 10000);
  pendingSends.set(messageId, handle);
}

/**
 * Estimate message size in bytes from body + subject.
 */
function estimateMessageSize(body_html, body_text, subject) {
  let size = 0;
  if (body_html) size += Buffer.byteLength(body_html, 'utf8');
  if (body_text) size += Buffer.byteLength(body_text, 'utf8');
  if (subject) size += Buffer.byteLength(subject, 'utf8');
  return size;
}

// ── All routes require JWT auth ──────────────────────────────────────────────
router.use(authenticateToken);

// ── GET /accounts/:id/messages ───────────────────────────────────────────────
// List messages. Query params: folderId, page, limit, search
router.get('/accounts/:id/messages', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);

    const folderId = req.query.folderId ? parseInt(req.query.folderId, 10) : null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || null;

    const conditions = ['m.account_id = $1'];
    const params = [accountId];
    let paramIdx = 2;

    if (folderId) {
      conditions.push(`m.folder_id = $${paramIdx}`);
      params.push(folderId);
      paramIdx++;
    }

    if (search) {
      conditions.push(
        `to_tsvector('english', coalesce(m.subject,'') || ' ' || coalesce(m.body_text,'')) @@ plainto_tsquery('english', $${paramIdx})`
      );
      params.push(search);
      paramIdx++;
    }

    const where = conditions.join(' AND ');
    const threaded = req.query.threaded === 'true';

    if (threaded) {
      // Threaded view: group by thread_id, return latest message per thread with count.
      // The folder filter determines which threads appear (those with at least one message in the folder).
      // The thread_count/thread_unread subqueries count ALL messages in the thread across folders.
      const countResult = await query(
        `SELECT COUNT(DISTINCT COALESCE(m.thread_id, m.message_id, m.id::text)) AS total FROM email_messages m WHERE ${where}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const messagesResult = await query(
        `SELECT * FROM (
           SELECT DISTINCT ON (COALESCE(m.thread_id, m.message_id, m.id::text))
                  m.id, m.folder_id, m.message_id, m.thread_id,
                  m.from_address, m.from_name, m.to_addresses, m.cc_addresses,
                  m.subject, m.is_read, m.is_starred, m.is_draft, m.priority,
                  m.size_bytes, m.direction, m.send_status,
                  m.sent_at, m.received_at, m.created_at, m.updated_at,
                  f.name AS folder_name, f.type AS folder_type,
                  (SELECT COUNT(*) FROM email_messages m2
                   WHERE m2.account_id = m.account_id
                     AND COALESCE(m2.thread_id, m2.message_id, m2.id::text) = COALESCE(m.thread_id, m.message_id, m.id::text)
                  ) AS thread_count,
                  (SELECT COUNT(*) FROM email_messages m3
                   WHERE m3.account_id = m.account_id
                     AND COALESCE(m3.thread_id, m3.message_id, m3.id::text) = COALESCE(m.thread_id, m.message_id, m.id::text)
                     AND m3.is_read = FALSE
                  ) AS thread_unread
           FROM email_messages m
           LEFT JOIN email_folders f ON f.id = m.folder_id
           WHERE ${where}
           ORDER BY COALESCE(m.thread_id, m.message_id, m.id::text),
                    COALESCE(m.received_at, m.created_at) DESC
         ) t
         ORDER BY COALESCE(t.received_at, t.created_at) DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      );

      res.json({
        messages: messagesResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } else {
      // Flat view (existing behavior)
      const countResult = await query(
        `SELECT COUNT(*) AS total FROM email_messages m WHERE ${where}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const messagesResult = await query(
        `SELECT m.id, m.folder_id, m.message_id, m.thread_id,
                m.from_address, m.from_name, m.to_addresses, m.cc_addresses,
                m.subject, m.is_read, m.is_starred, m.is_draft, m.priority,
                m.size_bytes, m.direction, m.send_status,
                m.sent_at, m.received_at, m.created_at, m.updated_at,
                f.name AS folder_name, f.type AS folder_type
         FROM email_messages m
         LEFT JOIN email_folders f ON f.id = m.folder_id
         WHERE ${where}
         ORDER BY COALESCE(m.received_at, m.created_at) DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      );

      res.json({
        messages: messagesResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  } catch (err) {
    console.error('[EmailMessages] List error:', err.message);
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

// ── GET /accounts/:id/threads/:threadId ──────────────────────────────────────
// Get all messages in a thread, ordered chronologically (oldest first).
router.get('/accounts/:id/threads/:threadId', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);
    const threadId = req.params.threadId;

    const result = await query(
      `SELECT m.id, m.folder_id, m.message_id, m.thread_id, m.in_reply_to,
              m.from_address, m.from_name, m.to_addresses, m.cc_addresses,
              m.subject, m.body_text, m.body_html,
              m.is_read, m.is_starred, m.is_draft, m.priority,
              m.size_bytes, m.direction, m.send_status,
              m.sent_at, m.received_at, m.created_at, m.updated_at,
              f.name AS folder_name, f.type AS folder_type
       FROM email_messages m
       LEFT JOIN email_folders f ON f.id = m.folder_id
       WHERE m.account_id = $1
         AND COALESCE(m.thread_id, m.message_id, m.id::text) = $2
       ORDER BY COALESCE(m.received_at, m.created_at) ASC`,
      [accountId, threadId]
    );

    // Mark all unread messages as read
    if (result.rows.some(m => !m.is_read)) {
      const unreadIds = result.rows.filter(m => !m.is_read).map(m => m.id);
      await query(
        `UPDATE email_messages SET is_read = TRUE, updated_at = $1 WHERE id = ANY($2)`,
        [Date.now(), unreadIds]
      );
    }

    res.json({ messages: result.rows });
  } catch (err) {
    console.error('[EmailMessages] Thread error:', err.message);
    res.status(500).json({ error: 'Failed to load thread' });
  }
});

// ── GET /accounts/:id/messages/:msgId ────────────────────────────────────────
// Get single message. Marks as read if unread.
router.get('/accounts/:id/messages/:msgId', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);
    const msgId = parseInt(req.params.msgId, 10);
    if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message ID' });

    const result = await query(
      `SELECT m.*, f.name AS folder_name, f.type AS folder_type
       FROM email_messages m
       LEFT JOIN email_folders f ON f.id = m.folder_id
       WHERE m.id = $1 AND m.account_id = $2`,
      [msgId, accountId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Message not found' });

    const message = result.rows[0];

    // Mark as read if unread
    if (!message.is_read) {
      const now = Date.now();
      await query(
        'UPDATE email_messages SET is_read = TRUE, updated_at = $1 WHERE id = $2',
        [now, msgId]
      );
      message.is_read = true;
      message.updated_at = now;
    }

    // Fetch attachments
    const attachments = await query(
      'SELECT id, filename, content_type, size_bytes, content_id, is_blocked, created_at FROM email_attachments WHERE message_id = $1',
      [msgId]
    );

    res.json({ message, attachments: attachments.rows });
  } catch (err) {
    console.error('[EmailMessages] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get message' });
  }
});

// ── POST /accounts/:id/messages ──────────────────────────────────────────────
// Compose & send (or save draft). Body: { to, cc, bcc, subject, body_html, body_text, draft }
router.post('/accounts/:id/messages', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);
    const account = req.emailAccount;
    const { to, cc, bcc, subject, body_html, body_text, draft } = req.body;
    const now = Date.now();

    // Validate recipients for non-draft
    if (!draft) {
      if (!to || !Array.isArray(to) || to.length === 0) {
        return res.status(400).json({ error: 'At least one recipient (to) is required' });
      }
    }

    // Size limit check
    const sizeBytes = estimateMessageSize(body_html, body_text, subject);
    if (sizeBytes > MAX_MESSAGE_BYTES) {
      return res.status(413).json({ error: 'Message exceeds 25 MB size limit' });
    }

    // If sending (not draft), check rate limit
    if (!draft) {
      if (account.daily_send_count >= account.daily_send_limit) {
        await emailLog('warn', 'rate_limit', `Send rate limit reached for account ${accountId}`, {
          accountId,
          count: account.daily_send_count,
          limit: account.daily_send_limit,
        });
        return res.status(429).json({ error: 'Daily send limit reached. Try again tomorrow.' });
      }

      // Warn at 80% threshold
      if (account.daily_send_count >= account.daily_send_limit * 0.8) {
        await emailLog('warn', 'rate_limit', `Account ${accountId} at 80% of daily send limit`, {
          accountId,
          count: account.daily_send_count,
          limit: account.daily_send_limit,
        });
      }
    }

    const domain = extractDomain(account.address);
    const msgIdHeader = generateMessageId(domain);

    const folderId = draft
      ? await getDraftsFolderId(accountId)
      : await getSentFolderId(accountId);

    const result = await query(
      `INSERT INTO email_messages (
         account_id, folder_id, message_id, from_address, from_name,
         to_addresses, cc_addresses, bcc_addresses, subject,
         body_text, body_html, is_draft, size_bytes, direction,
         send_status, scheduled_send_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        accountId,
        folderId,
        msgIdHeader,
        account.address,
        account.display_name || null,
        JSON.stringify(to || []),
        JSON.stringify(cc || []),
        JSON.stringify(bcc || []),
        subject || null,
        body_text || null,
        body_html || null,
        !!draft,
        sizeBytes,
        'outbound',
        draft ? null : 'pending',
        draft ? null : now + 10000,
        now,
        now,
      ]
    );

    const message = result.rows[0];

    if (draft) {
      await auditLog(accountId, req.user.id, 'draft_saved', message.id, null, req.ip);
      return res.status(201).json({ message });
    }

    // Schedule undo-send
    scheduleSend(message.id, accountId, req.user.id, req.ip);
    await auditLog(accountId, req.user.id, 'send_scheduled', message.id, { scheduledAt: now + 10000 }, req.ip);

    res.status(201).json({
      message,
      undoAvailable: true,
      undoExpiresAt: now + 10000,
    });
  } catch (err) {
    console.error('[EmailMessages] Compose error:', err.message);
    res.status(500).json({ error: 'Failed to compose message' });
  }
});

// ── PUT /accounts/:id/messages/:msgId ────────────────────────────────────────
// Update message: move folder, star, read status, edit draft.
// Body (all optional): { folderId, is_starred, is_read, subject, body_html, body_text, to, cc, bcc }
router.put('/accounts/:id/messages/:msgId', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);
    const msgId = parseInt(req.params.msgId, 10);
    if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message ID' });

    // Verify message belongs to account
    const existing = await query(
      'SELECT * FROM email_messages WHERE id = $1 AND account_id = $2',
      [msgId, accountId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Message not found' });

    const msg = existing.rows[0];
    const now = Date.now();
    const sets = [];
    const params = [];
    let paramIdx = 1;

    // Folder move
    if (req.body.folderId !== undefined) {
      sets.push(`folder_id = $${paramIdx}`);
      params.push(req.body.folderId);
      paramIdx++;
    }

    // Star
    if (req.body.is_starred !== undefined) {
      sets.push(`is_starred = $${paramIdx}`);
      params.push(!!req.body.is_starred);
      paramIdx++;
    }

    // Read status
    if (req.body.is_read !== undefined) {
      sets.push(`is_read = $${paramIdx}`);
      params.push(!!req.body.is_read);
      paramIdx++;
    }

    // Draft edits — only allow if message is a draft
    if (msg.is_draft) {
      if (req.body.subject !== undefined) {
        sets.push(`subject = $${paramIdx}`);
        params.push(req.body.subject);
        paramIdx++;
      }
      if (req.body.body_html !== undefined) {
        sets.push(`body_html = $${paramIdx}`);
        params.push(req.body.body_html);
        paramIdx++;
      }
      if (req.body.body_text !== undefined) {
        sets.push(`body_text = $${paramIdx}`);
        params.push(req.body.body_text);
        paramIdx++;
      }
      if (req.body.to !== undefined) {
        sets.push(`to_addresses = $${paramIdx}`);
        params.push(JSON.stringify(req.body.to));
        paramIdx++;
      }
      if (req.body.cc !== undefined) {
        sets.push(`cc_addresses = $${paramIdx}`);
        params.push(JSON.stringify(req.body.cc));
        paramIdx++;
      }
      if (req.body.bcc !== undefined) {
        sets.push(`bcc_addresses = $${paramIdx}`);
        params.push(JSON.stringify(req.body.bcc));
        paramIdx++;
      }

      // Recalculate size
      const newHtml = req.body.body_html !== undefined ? req.body.body_html : msg.body_html;
      const newText = req.body.body_text !== undefined ? req.body.body_text : msg.body_text;
      const newSubject = req.body.subject !== undefined ? req.body.subject : msg.subject;
      sets.push(`size_bytes = $${paramIdx}`);
      params.push(estimateMessageSize(newHtml, newText, newSubject));
      paramIdx++;
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    sets.push(`updated_at = $${paramIdx}`);
    params.push(now);
    paramIdx++;

    params.push(msgId);
    params.push(accountId);

    const result = await query(
      `UPDATE email_messages SET ${sets.join(', ')} WHERE id = $${paramIdx - 1} AND account_id = $${paramIdx} RETURNING *`,
      params
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Message not found' });

    await auditLog(accountId, req.user.id, 'message_updated', msgId, { fields: Object.keys(req.body) }, req.ip);
    res.json({ message: result.rows[0] });
  } catch (err) {
    console.error('[EmailMessages] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// ── DELETE /accounts/:id/messages/:msgId ─────────────────────────────────────
// Move to trash. If already in trash, permanently delete.
router.delete('/accounts/:id/messages/:msgId', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);
    const msgId = parseInt(req.params.msgId, 10);
    if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message ID' });

    const existing = await query(
      `SELECT m.id, m.folder_id, f.type AS folder_type
       FROM email_messages m
       LEFT JOIN email_folders f ON f.id = m.folder_id
       WHERE m.id = $1 AND m.account_id = $2`,
      [msgId, accountId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Message not found' });

    const msg = existing.rows[0];

    if (msg.folder_type === 'trash') {
      // Permanent delete
      await query('DELETE FROM email_messages WHERE id = $1', [msgId]);
      await auditLog(accountId, req.user.id, 'message_deleted_permanent', msgId, null, req.ip);
      return res.json({ deleted: true, permanent: true });
    }

    // Move to trash
    const trashFolderId = await getTrashFolderId(accountId);
    const now = Date.now();
    await query(
      'UPDATE email_messages SET folder_id = $1, updated_at = $2 WHERE id = $3',
      [trashFolderId, now, msgId]
    );

    await auditLog(accountId, req.user.id, 'message_trashed', msgId, null, req.ip);
    res.json({ deleted: true, permanent: false });
  } catch (err) {
    console.error('[EmailMessages] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ── POST /accounts/:id/messages/bulk ─────────────────────────────────────────
// Bulk actions: { action, messageIds, folderId (for 'move') }
// Actions: delete, move, read, unread, star, unstar, archive
router.post('/accounts/:id/messages/bulk', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);
    const { action, messageIds, folderId } = req.body;

    if (!action || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'action and messageIds[] are required' });
    }

    const validActions = ['delete', 'move', 'read', 'unread', 'star', 'unstar', 'archive'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    // Sanitize IDs
    const ids = messageIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (ids.length === 0) return res.status(400).json({ error: 'No valid message IDs' });

    const now = Date.now();
    // Build placeholders: $2, $3, $4, ...
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    const baseParams = [accountId, ...ids];

    let affected = 0;

    switch (action) {
      case 'delete': {
        // Move to trash. Messages already in trash get permanently deleted.
        const trashFolderId = await getTrashFolderId(accountId);

        // Permanently delete messages already in trash
        const permResult = await query(
          `DELETE FROM email_messages
           WHERE account_id = $1 AND id IN (${placeholders}) AND folder_id = $${ids.length + 2}`,
          [...baseParams, trashFolderId]
        );
        affected += permResult.rowCount;

        // Move remaining to trash
        const moveResult = await query(
          `UPDATE email_messages SET folder_id = $${ids.length + 2}, updated_at = $${ids.length + 3}
           WHERE account_id = $1 AND id IN (${placeholders})`,
          [...baseParams, trashFolderId, now]
        );
        affected += moveResult.rowCount;
        break;
      }

      case 'move': {
        if (!folderId) return res.status(400).json({ error: 'folderId required for move action' });
        const result = await query(
          `UPDATE email_messages SET folder_id = $${ids.length + 2}, updated_at = $${ids.length + 3}
           WHERE account_id = $1 AND id IN (${placeholders})`,
          [...baseParams, folderId, now]
        );
        affected = result.rowCount;
        break;
      }

      case 'read': {
        const result = await query(
          `UPDATE email_messages SET is_read = TRUE, updated_at = $${ids.length + 2}
           WHERE account_id = $1 AND id IN (${placeholders})`,
          [...baseParams, now]
        );
        affected = result.rowCount;
        break;
      }

      case 'unread': {
        const result = await query(
          `UPDATE email_messages SET is_read = FALSE, updated_at = $${ids.length + 2}
           WHERE account_id = $1 AND id IN (${placeholders})`,
          [...baseParams, now]
        );
        affected = result.rowCount;
        break;
      }

      case 'star': {
        const result = await query(
          `UPDATE email_messages SET is_starred = TRUE, updated_at = $${ids.length + 2}
           WHERE account_id = $1 AND id IN (${placeholders})`,
          [...baseParams, now]
        );
        affected = result.rowCount;
        break;
      }

      case 'unstar': {
        const result = await query(
          `UPDATE email_messages SET is_starred = FALSE, updated_at = $${ids.length + 2}
           WHERE account_id = $1 AND id IN (${placeholders})`,
          [...baseParams, now]
        );
        affected = result.rowCount;
        break;
      }

      case 'archive': {
        const archiveFolderId = await getArchiveFolderId(accountId);
        const result = await query(
          `UPDATE email_messages SET folder_id = $${ids.length + 2}, updated_at = $${ids.length + 3}
           WHERE account_id = $1 AND id IN (${placeholders})`,
          [...baseParams, archiveFolderId, now]
        );
        affected = result.rowCount;
        break;
      }
    }

    await auditLog(accountId, req.user.id, `bulk_${action}`, null, { messageIds: ids, affected }, req.ip);
    res.json({ action, affected });
  } catch (err) {
    console.error('[EmailMessages] Bulk error:', err.message);
    res.status(500).json({ error: 'Failed to perform bulk action' });
  }
});

// ── POST /accounts/:id/messages/:msgId/reply ─────────────────────────────────
router.post('/accounts/:id/messages/:msgId/reply', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    await handleReply(req, res, 'reply');
  } catch (err) {
    console.error('[EmailMessages] Reply error:', err.message);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// ── POST /accounts/:id/messages/:msgId/reply-all ─────────────────────────────
router.post('/accounts/:id/messages/:msgId/reply-all', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    await handleReply(req, res, 'reply-all');
  } catch (err) {
    console.error('[EmailMessages] Reply-all error:', err.message);
    res.status(500).json({ error: 'Failed to send reply-all' });
  }
});

// ── POST /accounts/:id/messages/:msgId/forward ──────────────────────────────
router.post('/accounts/:id/messages/:msgId/forward', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    await handleReply(req, res, 'forward');
  } catch (err) {
    console.error('[EmailMessages] Forward error:', err.message);
    res.status(500).json({ error: 'Failed to forward message' });
  }
});

/**
 * Shared handler for reply, reply-all, and forward.
 */
async function handleReply(req, res, mode) {
  const accountId = parseInt(req.params.id, 10);
  const msgId = parseInt(req.params.msgId, 10);
  if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message ID' });

  const account = req.emailAccount;

  // Fetch original message
  const origResult = await query(
    'SELECT * FROM email_messages WHERE id = $1 AND account_id = $2',
    [msgId, accountId]
  );
  if (!origResult.rows.length) return res.status(404).json({ error: 'Original message not found' });
  const orig = origResult.rows[0];

  const { subject, body_html, body_text, to: forwardTo, cc: forwardCc, bcc: forwardBcc } = req.body;

  // Build recipients based on mode
  let toAddrs, ccAddrs, bccAddrs;
  const selfAddress = account.address.toLowerCase();

  if (mode === 'reply') {
    // Reply to original sender
    toAddrs = [{ email: orig.from_address, name: orig.from_name || null }];
    ccAddrs = [];
    bccAddrs = [];
  } else if (mode === 'reply-all') {
    // Reply to: original from + original to + original cc, minus self
    const allTo = [
      { email: orig.from_address, name: orig.from_name || null },
      ...(orig.to_addresses || []),
    ];
    const allCc = [...(orig.cc_addresses || [])];

    // Deduplicate and remove self
    const seen = new Set();
    toAddrs = [];
    for (const r of allTo) {
      const email = (typeof r === 'string' ? r : r.email || '').toLowerCase();
      if (email && email !== selfAddress && !seen.has(email)) {
        seen.add(email);
        toAddrs.push(typeof r === 'string' ? { email: r } : r);
      }
    }
    ccAddrs = [];
    for (const r of allCc) {
      const email = (typeof r === 'string' ? r : r.email || '').toLowerCase();
      if (email && email !== selfAddress && !seen.has(email)) {
        seen.add(email);
        ccAddrs.push(typeof r === 'string' ? { email: r } : r);
      }
    }
    bccAddrs = [];
  } else {
    // Forward — user specifies new recipients
    if (!forwardTo || !Array.isArray(forwardTo) || forwardTo.length === 0) {
      return res.status(400).json({ error: 'At least one recipient (to) is required for forwarding' });
    }
    toAddrs = forwardTo;
    ccAddrs = forwardCc || [];
    bccAddrs = forwardBcc || [];
  }

  // Rate limit check
  if (account.daily_send_count >= account.daily_send_limit) {
    await emailLog('warn', 'rate_limit', `Send rate limit reached for account ${accountId}`, {
      accountId,
      count: account.daily_send_count,
      limit: account.daily_send_limit,
    });
    return res.status(429).json({ error: 'Daily send limit reached. Try again tomorrow.' });
  }

  if (account.daily_send_count >= account.daily_send_limit * 0.8) {
    await emailLog('warn', 'rate_limit', `Account ${accountId} at 80% of daily send limit`, {
      accountId,
      count: account.daily_send_count,
      limit: account.daily_send_limit,
    });
  }

  // Size limit check
  const sizeBytes = estimateMessageSize(body_html, body_text, subject);
  if (sizeBytes > MAX_MESSAGE_BYTES) {
    return res.status(413).json({ error: 'Message exceeds 25 MB size limit' });
  }

  // Build threading headers
  const domain = extractDomain(account.address);
  const newMessageId = generateMessageId(domain);
  const inReplyTo = mode !== 'forward' ? (orig.message_id || null) : null;

  let referencesHeader = null;
  if (mode !== 'forward') {
    const existingRefs = orig.references_header ? orig.references_header.trim() : '';
    const origMsgId = orig.message_id || '';
    referencesHeader = existingRefs
      ? `${existingRefs} ${origMsgId}`.trim()
      : origMsgId;
  }

  // Build subject line
  let replySubject = subject;
  if (!replySubject) {
    const origSubject = orig.subject || '';
    if (mode === 'forward') {
      replySubject = origSubject.match(/^Fwd:/i) ? origSubject : `Fwd: ${origSubject}`;
    } else {
      replySubject = origSubject.match(/^Re:/i) ? origSubject : `Re: ${origSubject}`;
    }
  }

  const now = Date.now();
  const result = await query(
    `INSERT INTO email_messages (
       account_id, folder_id, message_id, in_reply_to, references_header, thread_id,
       from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
       subject, body_text, body_html, is_draft, size_bytes, direction,
       send_status, scheduled_send_at, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [
      accountId,
      await getSentFolderId(accountId),
      newMessageId,
      inReplyTo,
      referencesHeader || null,
      orig.thread_id || orig.message_id || null,
      account.address,
      account.display_name || null,
      JSON.stringify(toAddrs),
      JSON.stringify(ccAddrs),
      JSON.stringify(bccAddrs),
      replySubject,
      body_text || null,
      body_html || null,
      false,
      sizeBytes,
      'outbound',
      'pending',
      now + 10000,
      now,
      now,
    ]
  );

  const message = result.rows[0];

  // Schedule undo-send
  scheduleSend(message.id, accountId, req.user.id, req.ip);
  await auditLog(accountId, req.user.id, `${mode}_scheduled`, message.id, { originalId: msgId }, req.ip);

  res.status(201).json({
    message,
    undoAvailable: true,
    undoExpiresAt: now + 10000,
  });
}

// ── POST /accounts/:id/messages/:msgId/cancel-send ───────────────────────────
// Cancel a pending send within the undo window.
router.post('/accounts/:id/messages/:msgId/cancel-send', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);
    const msgId = parseInt(req.params.msgId, 10);
    if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message ID' });

    // Verify message exists and is pending
    const existing = await query(
      "SELECT id, send_status FROM email_messages WHERE id = $1 AND account_id = $2",
      [msgId, accountId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Message not found' });
    if (existing.rows[0].send_status !== 'pending') {
      return res.status(409).json({ error: 'Message is not in pending send status' });
    }

    // Clear the timeout
    const handle = pendingSends.get(msgId);
    if (handle) {
      clearTimeout(handle);
      pendingSends.delete(msgId);
    }

    // Update message: cancel send, move to drafts
    const draftsFolderId = await getDraftsFolderId(accountId);
    const now = Date.now();
    await query(
      `UPDATE email_messages
       SET send_status = 'cancelled', is_draft = TRUE, folder_id = $1,
           scheduled_send_at = NULL, updated_at = $2
       WHERE id = $3`,
      [draftsFolderId, now, msgId]
    );

    await auditLog(accountId, req.user.id, 'send_cancelled', msgId, null, req.ip);
    await emailLog('info', 'outbound', `Send cancelled for message ${msgId}`, { messageId: msgId });

    res.json({ cancelled: true });
  } catch (err) {
    console.error('[EmailMessages] Cancel-send error:', err.message);
    res.status(500).json({ error: 'Failed to cancel send' });
  }
});

// ── GET /accounts/:id/notifications ──────────────────────────────────────────
// Returns unread counts per folder and new message IDs since a given timestamp.
// Query param: since (bigint Unix ms)
router.get('/accounts/:id/notifications', async (req, res) => {
  try {
    if (!(await verifyAccountAccess(req, res))) return;
    const accountId = parseInt(req.params.id, 10);
    const since = req.query.since ? parseInt(req.query.since, 10) : null;

    // Unread counts per folder
    const unreadResult = await query(
      `SELECT f.id AS folder_id, f.name AS folder_name, f.type AS folder_type,
              COUNT(m.id) AS unread_count
       FROM email_folders f
       LEFT JOIN email_messages m ON m.folder_id = f.id AND m.is_read = FALSE
       WHERE f.account_id = $1
       GROUP BY f.id, f.name, f.type
       ORDER BY f.sort_order`,
      [accountId]
    );

    // Total unread across all folders
    const totalResult = await query(
      'SELECT COUNT(*) AS total FROM email_messages WHERE account_id = $1 AND is_read = FALSE',
      [accountId]
    );

    let newMessages = [];
    if (since && !isNaN(since)) {
      const newResult = await query(
        `SELECT id, folder_id, from_address, from_name, subject, received_at, created_at
         FROM email_messages
         WHERE account_id = $1 AND created_at > $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [accountId, since]
      );
      newMessages = newResult.rows;
    }

    res.json({
      totalUnread: parseInt(totalResult.rows[0].total, 10),
      folders: unreadResult.rows.map(f => ({
        folderId: f.folder_id,
        folderName: f.folder_name,
        folderType: f.folder_type,
        unreadCount: parseInt(f.unread_count, 10),
      })),
      newMessages,
    });
  } catch (err) {
    console.error('[EmailMessages] Notifications error:', err.message);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

export default router;
