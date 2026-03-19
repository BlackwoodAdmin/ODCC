import { query } from '../db.js';

/**
 * Log to the email_system_logs table.
 * @param {'error'|'warn'|'info'} level
 * @param {string} category - 'inbound'|'outbound'|'forward'|'auto_reply'|'bounce'|'cron'|'quota'|'rate_limit'|'disk'
 * @param {string} message
 * @param {object|null} details
 */
export async function emailLog(level, category, message, details = null) {
  try {
    await query(
      'INSERT INTO email_system_logs (level, category, message, details, created_at) VALUES ($1, $2, $3, $4, $5)',
      [level, category, message, details ? JSON.stringify(details) : null, Date.now()]
    );
  } catch (err) {
    // Fallback to console if DB write fails
    console.error('[EmailLog] Failed to write log:', err.message, { level, category, message });
  }
}
