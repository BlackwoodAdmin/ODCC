// Data-access layer for live chat (visitor <-> admin handoff). Plain SQL, no
// caching — the DB is the source of truth; real-time delivery happens in
// chat-bus.js. All timestamps are Unix milliseconds (house style).
import crypto from 'crypto';
import { query } from '../db.js';
import { DEFAULT_DAYS, isValidDays } from './presence-schedule.js';

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

export async function getPresenceRow() {
  const { rows } = await query('SELECT available, updated_at, updated_from FROM chat_agent_presence WHERE id = 1');
  return rows[0] || { available: false, updated_at: null, updated_from: null };
}

export async function setPresence(available, now = Date.now(), from = null) {
  await query(
    `INSERT INTO chat_agent_presence (id, available, updated_at, updated_from) VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET available = $1, updated_at = $2, updated_from = COALESCE($3, chat_agent_presence.updated_from)`,
    [!!available, now, from]
  );
  return !!available;
}

// ------------------------------------------------- weekly presence schedule

/** Serialize schedule reads/writes against the 60-s scheduler tick so a
 *  manual tap can't be clobbered. Single process, so a promise chain is the
 *  whole mutex. */
let scheduleChain = Promise.resolve();
export function runExclusive(fn) {
  const run = scheduleChain.then(fn, fn);
  scheduleChain = run.catch(() => {});
  return run;
}

/** Always returns a usable shape; `daysValid` is false when the stored jsonb
 *  was malformed (the scheduler then does nothing until re-saved). */
export async function getPresenceSchedule() {
  const { rows } = await query('SELECT enabled, days, override_desired FROM chat_presence_schedule WHERE id = 1');
  if (!rows[0]) {
    return { enabled: false, days: DEFAULT_DAYS, daysValid: true, overrideDesired: null };
  }
  const days = rows[0].days;
  const daysValid = isValidDays(days);
  return {
    enabled: rows[0].enabled === true,
    days: daysValid ? days : DEFAULT_DAYS,
    daysValid,
    overrideDesired: rows[0].override_desired === null ? null : rows[0].override_desired === true,
  };
}

/** Saving a schedule clears any manual override (the admin just stated intent). */
export async function setPresenceSchedule(enabled, days, now = Date.now()) {
  await query(
    `INSERT INTO chat_presence_schedule (id, enabled, days, override_desired, updated_at)
     VALUES (1, $1, $2, NULL, $3)
     ON CONFLICT (id) DO UPDATE SET enabled = $1, days = $2, override_desired = NULL, updated_at = $3`,
    [!!enabled, JSON.stringify(days), now]
  );
}

/** Snapshot of the scheduled state at a manual tap (null clears the override). */
export async function setScheduleOverride(desired, now = Date.now()) {
  await query(
    `UPDATE chat_presence_schedule SET override_desired = $1, updated_at = $2 WHERE id = 1`,
    [desired, now]
  );
}

// ---------------------------------------------------------- push subscriptions

export async function listPushSubscriptions() {
  const { rows } = await query(
    'SELECT id, endpoint, p256dh, auth, user_agent, created_at, last_success_at, last_delivered_at, failures FROM chat_push_subscriptions ORDER BY id'
  );
  return rows;
}

/** One phone: subscribing replaces every stored row (reference behavior). */
export async function replacePushSubscriptions({ endpoint, p256dh, auth, userAgent }, now = Date.now()) {
  await query('DELETE FROM chat_push_subscriptions');
  await query(
    `INSERT INTO chat_push_subscriptions (endpoint, p256dh, auth, user_agent, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [endpoint, p256dh, auth, userAgent || null, now]
  );
}

export async function deletePushSubscription(endpoint) {
  await query('DELETE FROM chat_push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function recordPushResult(endpoint, success, now = Date.now()) {
  if (success) {
    await query('UPDATE chat_push_subscriptions SET last_success_at = $2, failures = 0 WHERE endpoint = $1', [endpoint, now]);
  } else {
    await query('UPDATE chat_push_subscriptions SET failures = failures + 1 WHERE endpoint = $1', [endpoint]);
  }
}

/** A verified receipt: the notification was SHOWN on the phone. */
export async function markPushDelivered(sessionId, now = Date.now()) {
  await query('UPDATE chat_push_subscriptions SET last_delivered_at = $1', [now]);
  if (sessionId && sessionId !== 'test') {
    await query('UPDATE chat_sessions SET push_delivered_at = $1 WHERE id = $2', [now, sessionId]);
  }
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
