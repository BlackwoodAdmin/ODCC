import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import { query, pool } from '../db.js';
import { sendEmail } from '../email.js';
import { emailLog } from '../utils/email-log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TMP_DIR = IS_PRODUCTION ? '/home/appuser/app/data/tmp' : path.join(__dirname, '..', '..', 'data', 'tmp');
const ATTACHMENTS_BASE = IS_PRODUCTION ? '/home/appuser/app/data/attachments' : path.join(__dirname, '..', '..', 'data', 'attachments');

const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.scr', '.ps1', '.vbs', '.msi', '.dll', '.com', '.pif']);
const MAX_HTML_BYTES = 1024 * 1024; // 1 MB
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 100;

// ---------------------------------------------------------------------------
// Multer config — disk storage, 25 MB limit
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(TMP_DIR, { recursive: true });
      cb(null, TMP_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomUUID()}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/email/inbound/:token
// ---------------------------------------------------------------------------
router.post('/inbound/:token', upload.any(), async (req, res) => {
  const tempFiles = [];
  try {
    // ------------------------------------------------------------------
    // 1. Validate webhook secret token
    // ------------------------------------------------------------------
    const expectedToken = process.env.INBOUND_WEBHOOK_SECRET;
    if (!expectedToken) {
      await emailLog('warn', 'inbound', 'Inbound webhook rejected: no secret configured');
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const tokenBuf = Buffer.from(req.params.token);
      const expectedBuf = Buffer.from(expectedToken);
      if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        await emailLog('warn', 'inbound', 'Inbound webhook rejected: invalid token');
        return res.status(403).json({ error: 'Forbidden' });
      }
    } catch {
      await emailLog('warn', 'inbound', 'Inbound webhook rejected: invalid token');
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Collect temp files for cleanup
    if (req.files && req.files.length) {
      for (const f of req.files) {
        tempFiles.push(f.path);
      }
    }

    // ------------------------------------------------------------------
    // 2. Extract SendGrid multipart fields
    // ------------------------------------------------------------------
    const sgFrom = req.body.from || '';
    const sgTo = req.body.to || '';
    const sgCc = req.body.cc || '';
    const sgSubject = req.body.subject || '';
    const sgText = req.body.text || '';
    const sgHtml = req.body.html || '';
    const sgRawMime = req.body.email || '';
    const sgSpamScore = parseFloat(req.body.spam_score) || 0;
    const sgEnvelope = req.body.envelope || '{}';

    // ------------------------------------------------------------------
    // 3. Parse raw MIME for threading headers + proper encoding
    // ------------------------------------------------------------------
    let parsedMime = null;
    if (sgRawMime) {
      try {
        parsedMime = await simpleParser(sgRawMime);
      } catch (err) {
        await emailLog('warn', 'inbound', 'Failed to parse raw MIME', { error: err.message });
      }
    }

    const mimeMessageId = parsedMime?.messageId || null;
    const mimeInReplyTo = parsedMime?.inReplyTo || null;
    const mimeReferences = parsedMime?.references || []; // array of Message-IDs
    const mimeFrom = parsedMime?.from?.value?.[0] || null;

    // Use parsed values where available, fall back to SendGrid fields
    const fromAddress = mimeFrom?.address || parseEmailAddress(sgFrom);
    const fromName = mimeFrom?.name || parseEmailName(sgFrom);
    const subject = parsedMime?.subject || sgSubject;
    const bodyText = parsedMime?.text || sgText;
    let bodyHtml = parsedMime?.html || sgHtml || '';

    // ------------------------------------------------------------------
    // 4. Recipient resolution via envelope.to
    // ------------------------------------------------------------------
    let envelope;
    try {
      envelope = JSON.parse(sgEnvelope);
    } catch {
      envelope = { to: [], from: sgFrom };
    }

    const envelopeTo = Array.isArray(envelope.to) ? envelope.to : (envelope.to ? [envelope.to] : []);

    if (!envelopeTo.length) {
      await emailLog('warn', 'inbound', 'No envelope recipients found, dropping', { from: fromAddress, subject });
      return res.status(200).json({ ok: true });
    }

    // Build to/cc address arrays for storage
    const toAddresses = parseAddressList(sgTo);
    const ccAddresses = parseAddressList(sgCc);

    // Resolve each recipient
    const processedAccounts = new Set();

    for (const recipientAddr of envelopeTo) {
      const addr = recipientAddr.toLowerCase().trim();

      // Look up email_accounts by address
      let accountResult = await query(
        'SELECT * FROM email_accounts WHERE LOWER(address) = $1 AND is_active = TRUE',
        [addr]
      );

      // Check email_aliases
      if (!accountResult.rows.length) {
        accountResult = await query(
          `SELECT ea.* FROM email_accounts ea
           JOIN email_aliases al ON al.account_id = ea.id
           WHERE LOWER(al.alias_address) = $1 AND ea.is_active = TRUE`,
          [addr]
        );
      }

      // Fall back to catch-all
      if (!accountResult.rows.length) {
        accountResult = await query(
          'SELECT * FROM email_accounts WHERE is_catch_all = TRUE AND is_active = TRUE LIMIT 1'
        );
      }

      // ------------------------------------------------------------------
      // 5. No matching account — drop silently, log warning
      // ------------------------------------------------------------------
      if (!accountResult.rows.length) {
        await emailLog('warn', 'inbound', 'No matching account for recipient, dropping', {
          recipient: addr, from: fromAddress, subject,
        });
        continue;
      }

      const account = accountResult.rows[0];

      // Skip if already processed this account (multiple recipients to same account)
      if (processedAccounts.has(account.id)) continue;
      processedAccounts.add(account.id);

      // ------------------------------------------------------------------
      // Inbound rate limiting — 100 emails in 5 minutes per account
      // ------------------------------------------------------------------
      const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
      const rateResult = await query(
        `SELECT COUNT(*)::int AS cnt FROM email_messages
         WHERE account_id = $1 AND direction = 'inbound' AND received_at > $2`,
        [account.id, windowStart]
      );
      if (rateResult.rows[0].cnt >= RATE_LIMIT_MAX) {
        await emailLog('warn', 'rate_limit', 'Inbound rate limit exceeded, dropping', {
          account_id: account.id, address: account.address, from: fromAddress, count: rateResult.rows[0].cnt,
        });
        continue;
      }

      // ------------------------------------------------------------------
      // 6. Idempotency — check if message_id already exists for this account
      // ------------------------------------------------------------------
      if (mimeMessageId) {
        const dupCheck = await query(
          'SELECT id FROM email_messages WHERE account_id = $1 AND message_id = $2',
          [account.id, mimeMessageId]
        );
        if (dupCheck.rows.length) {
          await emailLog('info', 'inbound', 'Duplicate message_id, skipping', {
            account_id: account.id, message_id: mimeMessageId,
          });
          continue;
        }
      }

      // ------------------------------------------------------------------
      // 7. Spam check — route to Spam folder if spam_score > 5.0
      // ------------------------------------------------------------------
      const isSpam = sgSpamScore > 5.0;

      // Determine target folder
      const targetFolderName = isSpam ? 'Spam' : 'Inbox';
      let folderResult = await query(
        'SELECT id FROM email_folders WHERE account_id = $1 AND name = $2',
        [account.id, targetFolderName]
      );
      if (!folderResult.rows.length) {
        // Auto-create the folder
        folderResult = await query(
          `INSERT INTO email_folders (account_id, name, type, sort_order, created_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [account.id, targetFolderName, targetFolderName.toLowerCase(), targetFolderName === 'Inbox' ? 0 : 90, Date.now()]
        );
      }
      const folderId = folderResult.rows[0].id;

      // ------------------------------------------------------------------
      // 8. Threading — compute thread_id from References / In-Reply-To
      // ------------------------------------------------------------------
      const referencesArray = Array.isArray(mimeReferences) ? mimeReferences : (mimeReferences ? [mimeReferences] : []);
      const referencesHeader = referencesArray.length ? referencesArray.join(' ') : null;

      let threadId = null;
      if (referencesArray.length) {
        // Earliest Message-ID in References chain
        threadId = referencesArray[0];
      } else if (mimeInReplyTo) {
        threadId = mimeInReplyTo;
      } else if (mimeMessageId) {
        threadId = mimeMessageId;
      }

      // ------------------------------------------------------------------
      // 9. Attachments — save to temp, block dangerous extensions, rewrite CID
      // ------------------------------------------------------------------
      const attachmentRecords = [];
      const attachmentUuid = crypto.randomUUID();
      const finalAttachmentDir = path.join(ATTACHMENTS_BASE, attachmentUuid);

      // Process multer files
      if (req.files && req.files.length) {
        for (const file of req.files) {
          const ext = path.extname(file.originalname || '').toLowerCase();
          const isBlocked = BLOCKED_EXTENSIONS.has(ext);

          attachmentRecords.push({
            filename: file.originalname || file.fieldname,
            content_type: file.mimetype || 'application/octet-stream',
            size_bytes: file.size,
            temp_path: file.path,
            final_path: path.join(finalAttachmentDir, file.filename),
            storage_path: `attachments/${attachmentUuid}/${file.filename}`,
            content_id: null,
            is_blocked: isBlocked,
          });
        }
      }

      // Process MIME attachments (for inline CID images and attachments not in multer)
      if (parsedMime?.attachments?.length) {
        for (const att of parsedMime.attachments) {
          // Check if this attachment was already handled by multer (by filename match)
          const alreadyHandled = attachmentRecords.some(
            (r) => r.filename === att.filename && Math.abs(r.size_bytes - att.size) < 100
          );
          if (alreadyHandled) {
            // If it has a CID, update the existing record
            if (att.contentId) {
              const existing = attachmentRecords.find(
                (r) => r.filename === att.filename && Math.abs(r.size_bytes - att.size) < 100
              );
              if (existing) existing.content_id = att.contentId.replace(/[<>]/g, '');
            }
            continue;
          }

          // Save MIME attachment to temp
          if (att.content) {
            const attFilename = `${Date.now()}-${crypto.randomUUID()}-${att.filename || 'attachment'}`;
            const tmpPath = path.join(TMP_DIR, attFilename);
            await fs.writeFile(tmpPath, att.content);
            tempFiles.push(tmpPath);

            const ext = path.extname(att.filename || '').toLowerCase();
            const isBlocked = BLOCKED_EXTENSIONS.has(ext);
            const contentId = att.contentId ? att.contentId.replace(/[<>]/g, '') : null;

            attachmentRecords.push({
              filename: att.filename || 'attachment',
              content_type: att.contentType || 'application/octet-stream',
              size_bytes: att.size,
              temp_path: tmpPath,
              final_path: path.join(finalAttachmentDir, attFilename),
              storage_path: `attachments/${attachmentUuid}/${attFilename}`,
              content_id: contentId,
              is_blocked: isBlocked,
            });
          }
        }
      }

      // Rewrite inline CID image references in HTML
      for (const att of attachmentRecords) {
        if (att.content_id && bodyHtml) {
          bodyHtml = bodyHtml.replace(
            new RegExp(`cid:${escapeRegExp(att.content_id)}`, 'gi'),
            `/data/attachments/${attachmentUuid}/${path.basename(att.final_path)}`
          );
        }
      }

      // ------------------------------------------------------------------
      // 10. Calculate size_bytes
      // ------------------------------------------------------------------
      const textBytes = Buffer.byteLength(bodyText || '', 'utf8');
      const htmlBytes = Buffer.byteLength(bodyHtml || '', 'utf8');
      const attachmentBytes = attachmentRecords.reduce((sum, a) => sum + a.size_bytes, 0);
      const sizeBytes = textBytes + htmlBytes + attachmentBytes;

      // ------------------------------------------------------------------
      // 11. Quota check — if used_mb + new_size > quota_mb, drop
      // ------------------------------------------------------------------
      const newSizeMb = sizeBytes / (1024 * 1024);
      const usedMb = parseFloat(account.used_mb) || 0;
      const quotaMb = account.quota_mb || 500;
      if (usedMb + newSizeMb > quotaMb) {
        await emailLog('warn', 'quota', 'Quota exceeded, dropping inbound email', {
          account_id: account.id, address: account.address, from: fromAddress,
          used_mb: usedMb, new_size_mb: newSizeMb.toFixed(4), quota_mb: quotaMb,
        });
        continue;
      }

      // ------------------------------------------------------------------
      // 12. Sanitize HTML — cap at 1 MB
      // ------------------------------------------------------------------
      if (bodyHtml) {
        if (Buffer.byteLength(bodyHtml, 'utf8') > MAX_HTML_BYTES) {
          bodyHtml = bodyHtml.slice(0, MAX_HTML_BYTES);
        }
        bodyHtml = sanitizeHtml(bodyHtml, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'style', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption', 'colgroup', 'col', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'center', 'font']),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            '*': ['style', 'class', 'id', 'dir', 'align', 'valign', 'width', 'height', 'bgcolor'],
            img: ['src', 'alt', 'width', 'height', 'style', 'class'],
            a: ['href', 'target', 'rel', 'style', 'class'],
            font: ['color', 'size', 'face'],
            td: ['colspan', 'rowspan', 'style', 'width', 'height', 'align', 'valign', 'bgcolor'],
            th: ['colspan', 'rowspan', 'style', 'width', 'height', 'align', 'valign', 'bgcolor'],
            table: ['border', 'cellpadding', 'cellspacing', 'style', 'width', 'height', 'align', 'bgcolor'],
          },
          allowedSchemes: ['http', 'https', 'mailto'],
          allowVulnerableTags: true,
        });
      }

      // ------------------------------------------------------------------
      // 13–18. Database transaction
      // ------------------------------------------------------------------
      const now = Date.now();

      const txClient = await pool.connect();
      try {
        await txClient.query('BEGIN');

        // ------------------------------------------------------------------
        // 14. Save message to appropriate folder
        // ------------------------------------------------------------------
        const msgInsert = await txClient.query(
          `INSERT INTO email_messages (
            account_id, folder_id, message_id, in_reply_to, references_header,
            thread_id, from_address, from_name, to_addresses, cc_addresses,
            subject, body_text, body_html, is_read, spam_score, direction,
            size_bytes, received_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20
          ) RETURNING id`,
          [
            account.id, folderId, mimeMessageId, mimeInReplyTo, referencesHeader,
            threadId, fromAddress, fromName, JSON.stringify(toAddresses), JSON.stringify(ccAddresses),
            subject, bodyText, bodyHtml || null, false, sgSpamScore, 'inbound',
            sizeBytes, now, now, now,
          ]
        );
        const messageDbId = msgInsert.rows[0].id;

        // ------------------------------------------------------------------
        // 15. Save attachment records
        // ------------------------------------------------------------------
        for (const att of attachmentRecords) {
          await txClient.query(
            `INSERT INTO email_attachments (
              message_id, filename, content_type, size_bytes, storage_path, content_id, is_blocked, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [messageDbId, att.filename, att.content_type, att.size_bytes, att.storage_path, att.content_id, att.is_blocked, now]
          );
        }

        // ------------------------------------------------------------------
        // 16. Contact auto-collect — upsert sender (skip for spam)
        // ------------------------------------------------------------------
        if (!isSpam && fromAddress) {
          await txClient.query(
            `INSERT INTO email_contacts (account_id, email, name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (account_id, email) DO UPDATE SET
               name = COALESCE(NULLIF(EXCLUDED.name, ''), email_contacts.name),
               updated_at = EXCLUDED.updated_at`,
            [account.id, fromAddress.toLowerCase(), fromName || null, now, now]
          );
        }

        // ------------------------------------------------------------------
        // 17. Update used_mb on account
        // ------------------------------------------------------------------
        await txClient.query(
          'UPDATE email_accounts SET used_mb = used_mb + $1, updated_at = $2 WHERE id = $3',
          [newSizeMb, now, account.id]
        );

        // ------------------------------------------------------------------
        // 18. COMMIT
        // ------------------------------------------------------------------
        await txClient.query('COMMIT');

        // ------------------------------------------------------------------
        // 19. Move attachments from temp to final path
        // ------------------------------------------------------------------
        if (attachmentRecords.length) {
          await fs.mkdir(finalAttachmentDir, { recursive: true });
          for (const att of attachmentRecords) {
            try {
              await fs.rename(att.temp_path, att.final_path);
              // Remove from tempFiles since it's been moved successfully
              const idx = tempFiles.indexOf(att.temp_path);
              if (idx !== -1) tempFiles.splice(idx, 1);
            } catch (mvErr) {
              // rename fails cross-device — fall back to copy+delete
              try {
                await fs.copyFile(att.temp_path, att.final_path);
                const idx = tempFiles.indexOf(att.temp_path);
                if (idx !== -1) tempFiles.splice(idx, 1);
                await fs.unlink(att.temp_path).catch(() => {});
              } catch (cpErr) {
                await emailLog('error', 'inbound', 'Failed to move attachment to final path', {
                  temp: att.temp_path, final: att.final_path, error: cpErr.message,
                });
              }
            }
          }
        }

        // ------------------------------------------------------------------
        // 20. Forwarding
        // ------------------------------------------------------------------
        if (account.forwarding_address && account.forwarding_mode !== 'none') {
          try {
            await sendEmail({
              to: account.forwarding_address,
              subject: `Fwd: ${subject || '(no subject)'}`,
              html: bodyHtml || `<pre>${escapeHtml(bodyText || '')}</pre>`,
            });
            await emailLog('info', 'forward', 'Forwarded inbound email', {
              account_id: account.id, to: account.forwarding_address, message_id: mimeMessageId,
            });
          } catch (fwdErr) {
            await emailLog('error', 'forward', 'Forwarding failed', {
              account_id: account.id, to: account.forwarding_address, error: fwdErr.message,
            });
            // Continue — don't fail the whole inbound flow
          }
        }

        // ------------------------------------------------------------------
        // 21. Auto-reply
        // ------------------------------------------------------------------
        if (account.auto_reply_allowed && fromAddress) {
          await processAutoReply(account, fromAddress, parsedMime, now);
        }

        // ------------------------------------------------------------------
        // 22. Log audit entry
        // ------------------------------------------------------------------
        await query(
          `INSERT INTO email_audit_log (account_id, action, message_id, details, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            account.id,
            'inbound_received',
            messageDbId,
            JSON.stringify({
              from: fromAddress,
              subject,
              size_bytes: sizeBytes,
              spam_score: sgSpamScore,
              folder: targetFolderName,
              attachments: attachmentRecords.length,
              forwarded: !!(account.forwarding_address && account.forwarding_mode !== 'none'),
            }),
            now,
          ]
        );

      } catch (txErr) {
        await txClient.query('ROLLBACK').catch(() => {});
        await emailLog('error', 'inbound', 'Transaction failed for inbound email', {
          account_id: account.id, from: fromAddress, subject, error: txErr.message,
        });
      } finally {
        txClient.release();
      }
    } // end for-each recipient

    // Always return 200 to SendGrid to prevent retries
    return res.status(200).json({ ok: true });

  } catch (err) {
    await emailLog('error', 'inbound', 'Unhandled error in inbound webhook', {
      error: err.message, stack: err.stack,
    });
    // Still return 200 to SendGrid to avoid infinite retries
    return res.status(200).json({ ok: true });

  } finally {
    // ------------------------------------------------------------------
    // Temp file cleanup — always remove temp files
    // ------------------------------------------------------------------
    for (const tmpPath of tempFiles) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Already moved or cleaned up — ignore
      }
    }
  }
});

// ===========================================================================
// Auto-reply processing
// ===========================================================================
export async function processAutoReply(account, senderAddress, parsedMime, now) {
  try {
    // Fetch auto-reply config
    const arResult = await query(
      'SELECT * FROM email_auto_replies WHERE account_id = $1 AND is_enabled = TRUE',
      [account.id]
    );
    if (!arResult.rows.length) return;

    const autoReply = arResult.rows[0];

    // Check date range
    if (autoReply.start_date && now < autoReply.start_date) return;
    if (autoReply.end_date && now > autoReply.end_date) return;

    // Suppress for noreply addresses
    const senderLower = senderAddress.toLowerCase();
    if (senderLower.startsWith('noreply@') || senderLower.startsWith('no-reply@')) return;

    // Suppress for mailing list / bulk mail
    if (parsedMime) {
      const headers = parsedMime.headers;
      if (headers) {
        const listUnsub = headers.get('list-unsubscribe');
        if (listUnsub) return;

        const precedence = headers.get('precedence');
        if (precedence && (precedence === 'bulk' || precedence === 'list')) return;
      }
    }

    // Check if already replied to this sender (reply_once_per_sender)
    if (autoReply.reply_once_per_sender) {
      const logCheck = await query(
        'SELECT id FROM email_auto_reply_log WHERE account_id = $1 AND sender_address = $2',
        [account.id, senderLower]
      );
      if (logCheck.rows.length) return;
    }

    // Send auto-reply
    const sent = await sendEmail({
      to: senderAddress,
      subject: autoReply.subject || 'Out of Office',
      html: autoReply.body_html,
    });

    // Log to email_auto_reply_log only on success
    if (sent) {
      await query(
        `INSERT INTO email_auto_reply_log (account_id, sender_address, replied_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (account_id, sender_address) DO UPDATE SET replied_at = EXCLUDED.replied_at`,
        [account.id, senderLower, now]
      );
      await emailLog('info', 'auto_reply', 'Auto-reply sent', {
        account_id: account.id, to: senderAddress,
      });
    }
  } catch (arErr) {
    await emailLog('error', 'auto_reply', 'Auto-reply failed', {
      account_id: account.id, to: senderAddress, error: arErr.message,
    });
    // Don't throw — auto-reply failures should not block inbound processing
  }
}

// ===========================================================================
// Helper functions
// ===========================================================================

/**
 * Parse an email address from a "Name <addr>" or plain "addr" string.
 */
function parseEmailAddress(raw) {
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

/**
 * Parse display name from a "Name <addr>" string.
 */
function parseEmailName(raw) {
  if (!raw) return null;
  const match = raw.match(/^(.+?)\s*<[^>]+>$/);
  return match ? match[1].replace(/^["']|["']$/g, '').trim() : null;
}

/**
 * Parse a comma-separated address list into [{address, name}] format.
 */
function parseAddressList(raw) {
  if (!raw) return [];
  // Split on commas not inside angle brackets
  const parts = raw.split(/,(?=(?:[^<]*<[^>]*>)*[^<]*$)/);
  return parts.map((part) => {
    const address = parseEmailAddress(part);
    const name = parseEmailName(part);
    return { address, name };
  }).filter((p) => p.address);
}

/**
 * Escape a string for use in a RegExp.
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Basic HTML entity escaping for plain text fallback.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default router;
