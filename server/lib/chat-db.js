// Data-access layer for live chat (visitor <-> admin handoff). Plain SQL, no
// caching — the DB is the source of truth; real-time delivery happens in
// chat-bus.js. All timestamps are Unix milliseconds (house style).
import crypto from 'crypto';
import { query } from '../db.js';

/** Visitor routes answer 410 this long after a chat ends (leaked-id containment). */
export const ENDED_GRACE_MS = 15 * 60 * 1000;
/** Server backstop for unclaimed chats. The CLIENT's 5-minute timer must always
 *  fire first — it drives the "no one picked up" copy — so this is 10 minutes. */
export const WAITING_MAX_MS = 10 * 60 * 1000;
export const CONNECTED_IDLE_MAX_MS = 30 * 60 * 1000;
export const FALLBACK_EMAIL_AFTER_MS = 2 * 60 * 1000;
export const RETENTION_MS = (parseInt(process.env.CHAT_RETENTION_DAYS) || 60) * 24 * 60 * 60 * 1000;

/** Strip control/bidi characters and cap length. NOT HTML escaping — anything
 *  rendered into HTML (the fallback email) must escape separately. */
export function sanitizeChatText(text, max = 4000) {
  return String(text ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‎‏‪-‮⁦-⁩]/g, '')
    .slice(0, max)
    .trim();
}

export function isChatSessionGone(session, now = Date.now()) {
  return session.status === 'ended' && session.ended_at !== null && now - Number(session.ended_at) > ENDED_GRACE_MS;
}

// ---------------------------------------------------------------- sessions

export async function createChatSession({ pageUrl, userAgent, chatHistory }, now = Date.now()) {
  const { rows } = await query(
    `INSERT INTO chat_sessions (id, status, page_url, user_agent, chat_history, created_at, updated_at, last_activity_at)
     VALUES ($1, 'waiting', $2, $3, $4, $5, $5, $5) RETURNING *`,
    [crypto.randomUUID(), pageUrl || null, userAgent || null, JSON.stringify(chatHistory || []), now]
  );
  return rows[0];
}

export async function getChatSession(id) {
  const { rows } = await query('SELECT * FROM chat_sessions WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getChatMessages(sessionId) {
  const { rows } = await query(
    'SELECT id, session_id, sender, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY id ASC',
    [sessionId]
  );
  return rows;
}

export async function addChatMessage(sessionId, sender, content, now = Date.now()) {
  const { rows } = await query(
    `INSERT INTO chat_messages (session_id, sender, content, created_at) VALUES ($1, $2, $3, $4)
     RETURNING id, session_id, sender, content, created_at`,
    [sessionId, sender, content, now]
  );
  await query('UPDATE chat_sessions SET last_activity_at = $1, updated_at = $1 WHERE id = $2', [now, sessionId]);
  return rows[0];
}

/** Atomic claim: waiting -> connected. Returns the row, or null when another
 *  admin already claimed it (the route answers 409). */
export async function claimChatSession(id, now = Date.now()) {
  const { rows } = await query(
    `UPDATE chat_sessions SET status = 'connected', connected_at = COALESCE(connected_at, $2),
       updated_at = $2, last_activity_at = $2
     WHERE id = $1 AND status = 'waiting' RETURNING *`,
    [id, now]
  );
  return rows[0] || null;
}

/** End a session once; later calls are no-ops (returns null). */
export async function endChatSession(id, reason, now = Date.now()) {
  const { rows } = await query(
    `UPDATE chat_sessions SET status = 'ended', end_reason = $2, ended_at = $3, updated_at = $3
     WHERE id = $1 AND status != 'ended' RETURNING *`,
    [id, reason, now]
  );
  return rows[0] || null;
}

export async function listAdminSessions({ limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM chat_messages m WHERE m.session_id = s.id) AS message_count
     FROM chat_sessions s
     ORDER BY CASE s.status WHEN 'waiting' THEN 0 WHEN 'connected' THEN 1 ELSE 2 END, s.created_at DESC
     LIMIT $1`,
    [Math.min(200, limit)]
  );
  return rows;
}

// ---------------------------------------------------------------- presence

export async function getPresence() {
  const { rows } = await query('SELECT available FROM chat_agent_presence WHERE id = 1');
  return rows[0]?.available === true;
}

export async function setPresence(available, now = Date.now()) {
  await query(
    `INSERT INTO chat_agent_presence (id, available, updated_at) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET available = $1, updated_at = $2`,
    [!!available, now]
  );
  return !!available;
}

// ---------------------------------------------------------------- sweeps

/** Waiting sessions past the email threshold that have not been emailed. */
export async function findFallbackEmailCandidates(now = Date.now()) {
  const { rows } = await query(
    `SELECT * FROM chat_sessions WHERE status = 'waiting' AND fallback_email_at IS NULL AND created_at < $1`,
    [now - FALLBACK_EMAIL_AFTER_MS]
  );
  return rows;
}

/** Send-then-mark claim: set only after a successful send so a SendGrid
 *  failure retries next tick (bounded by the status='waiting' filter). */
export async function markFallbackEmailSent(id, now = Date.now()) {
  await query('UPDATE chat_sessions SET fallback_email_at = $2 WHERE id = $1', [id, now]);
}

export async function endStaleWaitingSessions(now = Date.now()) {
  const { rows } = await query(
    `UPDATE chat_sessions SET status = 'ended', end_reason = 'timeout', ended_at = $1, updated_at = $1
     WHERE status = 'waiting' AND created_at < $2 RETURNING id`,
    [now, now - WAITING_MAX_MS]
  );
  return rows.map((r) => r.id);
}

export async function endIdleConnectedSessions(now = Date.now()) {
  const { rows } = await query(
    `UPDATE chat_sessions SET status = 'ended', end_reason = 'timeout', ended_at = $1, updated_at = $1
     WHERE status = 'connected' AND last_activity_at < $2 RETURNING id`,
    [now, now - CONNECTED_IDLE_MAX_MS]
  );
  return rows.map((r) => r.id);
}

export async function purgeOldSessions(now = Date.now()) {
  const { rowCount } = await query(
    `DELETE FROM chat_sessions WHERE status = 'ended' AND ended_at < $1`,
    [now - RETENTION_MS]
  );
  return rowCount;
}
