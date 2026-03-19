import fs from 'fs/promises';
import path from 'path';
import { query } from '../db.js';
import { sendEmail } from '../email.js';
import { emailLog } from '../utils/email-log.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;
const FOURTEEN_DAYS = 14 * ONE_DAY;
const THIRTY_DAYS = 30 * ONE_DAY;
const ONE_YEAR = 365 * ONE_DAY;

/**
 * 1. Startup recovery: send any messages stuck in 'pending' whose scheduled time has passed.
 */
async function startupRecovery() {
  try {
    const now = Date.now();
    const result = await query(
      `SELECT m.*, ea.address as from_address_account, ea.display_name as from_name_account
       FROM email_messages m
       JOIN email_accounts ea ON ea.id = m.account_id
       WHERE m.send_status = 'pending' AND m.scheduled_send_at <= $1`,
      [now]
    );

    if (result.rows.length === 0) {
      await emailLog('info', 'cron', 'Startup recovery: no pending messages to send');
      return;
    }

    await emailLog('info', 'cron', `Startup recovery: found ${result.rows.length} pending message(s)`);

    for (const msg of result.rows) {
      try {
        const toAddresses = Array.isArray(msg.to_addresses) ? msg.to_addresses : JSON.parse(msg.to_addresses || '[]');
        const toList = toAddresses.map(a => (typeof a === 'string' ? a : a.email || a.address)).join(', ');

        const success = await sendEmail({
          to: toList,
          subject: msg.subject || '(no subject)',
          html: msg.body_html || msg.body_text || '',
        });

        if (success) {
          await query(
            `UPDATE email_messages SET send_status = 'sent', sent_at = $1, updated_at = $1 WHERE id = $2`,
            [Date.now(), msg.id]
          );
          await emailLog('info', 'cron', `Startup recovery: sent message ${msg.id} to ${toList}`);
        } else {
          await query(
            `UPDATE email_messages SET send_status = 'failed', send_error = 'Startup recovery send failed', updated_at = $1 WHERE id = $2`,
            [Date.now(), msg.id]
          );
          await emailLog('error', 'cron', `Startup recovery: failed to send message ${msg.id}`);
        }
      } catch (err) {
        await query(
          `UPDATE email_messages SET send_status = 'failed', send_error = $1, updated_at = $2 WHERE id = $3`,
          [err.message, Date.now(), msg.id]
        );
        await emailLog('error', 'cron', `Startup recovery error for message ${msg.id}: ${err.message}`);
      }
    }
  } catch (err) {
    await emailLog('error', 'cron', `Startup recovery failed: ${err.message}`);
  }
}

/**
 * 2. Trash purge: delete messages in trash folders older than 30 days.
 */
async function trashPurge() {
  try {
    const cutoff = Date.now() - THIRTY_DAYS;
    const result = await query(
      `DELETE FROM email_messages
       WHERE folder_id IN (SELECT id FROM email_folders WHERE type = 'trash')
         AND updated_at < $1`,
      [cutoff]
    );
    const count = result.rowCount;
    await emailLog('info', 'cron', `Trash purge: deleted ${count} message(s)`);
  } catch (err) {
    await emailLog('error', 'cron', `Trash purge failed: ${err.message}`);
  }
}

/**
 * 3. Auto-reply cleanup: clear auto-reply log entries older than 30 days.
 */
async function autoReplyCleanup() {
  try {
    const cutoff = Date.now() - THIRTY_DAYS;
    const result = await query(
      'DELETE FROM email_auto_reply_log WHERE replied_at < $1',
      [cutoff]
    );
    await emailLog('info', 'cron', `Auto-reply cleanup: removed ${result.rowCount} entries`);
  } catch (err) {
    await emailLog('error', 'cron', `Auto-reply cleanup failed: ${err.message}`);
  }
}

/**
 * 4. Quota recalc: recalculate used_mb for each account from actual message size_bytes sums.
 */
async function quotaRecalc() {
  try {
    const result = await query(
      `UPDATE email_accounts ea
       SET used_mb = COALESCE(sub.total_bytes, 0) / (1024.0 * 1024.0),
           updated_at = $1
       FROM (
         SELECT account_id, SUM(size_bytes) as total_bytes
         FROM email_messages
         GROUP BY account_id
       ) sub
       WHERE ea.id = sub.account_id`,
      [Date.now()]
    );

    // Also zero out accounts with no messages
    await query(
      `UPDATE email_accounts SET used_mb = 0, updated_at = $1
       WHERE id NOT IN (SELECT DISTINCT account_id FROM email_messages)`,
      [Date.now()]
    );

    await emailLog('info', 'cron', `Quota recalc: updated ${result.rowCount} account(s)`);
  } catch (err) {
    await emailLog('error', 'cron', `Quota recalc failed: ${err.message}`);
  }
}

/**
 * 5. Daily send count reset: reset daily_send_count to 0 on all accounts.
 */
async function dailySendCountReset() {
  try {
    const result = await query(
      'UPDATE email_accounts SET daily_send_count = 0, updated_at = $1',
      [Date.now()]
    );
    await emailLog('info', 'cron', `Daily send count reset: updated ${result.rowCount} account(s)`);
  } catch (err) {
    await emailLog('error', 'cron', `Daily send count reset failed: ${err.message}`);
  }
}

/**
 * 6. Temp file cleanup: remove files in data/tmp/ older than 1 hour.
 */
async function tempFileCleanup() {
  try {
    const tmpDir = path.join(DATA_DIR, 'tmp');

    let entries;
    try {
      entries = await fs.readdir(tmpDir);
    } catch {
      // tmp directory doesn't exist, nothing to clean
      return;
    }

    const now = Date.now();
    let removed = 0;

    for (const entry of entries) {
      const filePath = path.join(tmpDir, entry);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > ONE_HOUR) {
          await fs.rm(filePath, { recursive: true, force: true });
          removed++;
        }
      } catch {
        // File may have been removed between readdir and stat
      }
    }

    if (removed > 0) {
      await emailLog('info', 'cron', `Temp file cleanup: removed ${removed} file(s)`);
    }
  } catch (err) {
    await emailLog('error', 'cron', `Temp file cleanup failed: ${err.message}`);
  }
}

/**
 * 7. Expired auto-reply disable: disable auto-replies whose end_date has passed.
 */
async function expiredAutoReplyDisable() {
  try {
    const now = Date.now();
    const result = await query(
      `UPDATE email_auto_replies SET is_enabled = false, updated_at = $1
       WHERE is_enabled = true AND end_date IS NOT NULL AND end_date < $2`,
      [now, now]
    );
    if (result.rowCount > 0) {
      await emailLog('info', 'cron', `Expired auto-reply disable: disabled ${result.rowCount} auto-reply rule(s)`);
    }
  } catch (err) {
    await emailLog('error', 'cron', `Expired auto-reply disable failed: ${err.message}`);
  }
}

/**
 * 8. Audit log trim: delete audit log entries older than 1 year.
 */
async function auditLogTrim() {
  try {
    const cutoff = Date.now() - ONE_YEAR;
    const result = await query(
      'DELETE FROM email_audit_log WHERE created_at < $1',
      [cutoff]
    );
    await emailLog('info', 'cron', `Audit log trim: deleted ${result.rowCount} entries`);
  } catch (err) {
    await emailLog('error', 'cron', `Audit log trim failed: ${err.message}`);
  }
}

/**
 * 9. Email system log prune: delete logs older than 7 days.
 */
async function systemLogPrune() {
  try {
    const cutoff = Date.now() - 7 * ONE_DAY;
    const result = await query(
      'DELETE FROM email_system_logs WHERE created_at < $1',
      [cutoff]
    );
    await emailLog('info', 'cron', `System log prune: deleted ${result.rowCount} entries`);
  } catch (err) {
    await emailLog('error', 'cron', `System log prune failed: ${err.message}`);
  }
}

/**
 * Initialize all email cron jobs.
 * Call this once on server startup.
 */
export function initEmailCrons() {
  // Run startup recovery immediately
  startupRecovery();

  // Daily jobs (24h interval)
  setInterval(trashPurge, ONE_DAY);
  setInterval(autoReplyCleanup, ONE_DAY);
  setInterval(quotaRecalc, ONE_DAY);
  setInterval(dailySendCountReset, ONE_DAY);

  // Hourly jobs
  setInterval(tempFileCleanup, ONE_HOUR);
  setInterval(expiredAutoReplyDisable, ONE_HOUR);

  // Monthly-ish (run weekly, trims entries older than 1 year)
  setInterval(auditLogTrim, 7 * ONE_DAY);

  // Biweekly-ish (14-day interval)
  setInterval(systemLogPrune, FOURTEEN_DAYS);

  emailLog('info', 'cron', 'Email cron jobs initialized');
}
