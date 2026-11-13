// Live chat: visitor <-> admin handoff. Mounted at /api/chat with
// requireOriginCheck (public mutations) in server/index.js.
//
// The session UUID is the visitor's only credential; visitor routes answer 410
// fifteen minutes after a chat ends. The admin SSE stream authenticates with a
// 60-second purpose-scoped ticket (EventSource cannot send Bearer headers);
// every other admin route uses the normal JWT middleware.
import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import {
  createChatSession, getChatSession, getChatMessages, addChatMessage,
  claimChatSession, endChatSession, listAdminSessions,
  getPresence, getPresenceRow, setPresence, isChatSessionGone, sanitizeChatText,
  getPresenceSchedule, setPresenceSchedule, setScheduleOverride, runExclusive,
  listPushSubscriptions, replacePushSubscriptions, deletePushSubscription, markPushDelivered,
} from '../lib/chat-db.js';
import {
  openSseStream, writeEvent, addVisitorStream, addAdminStream,
  publishMessage, publishStatus, publishSessionCreated, publishPresence,
  publishTyping, streamCounts,
} from '../lib/chat-bus.js';
import {
  SCHEDULE_TIMEZONE, isValidDays, computeScheduledAvailability,
} from '../lib/presence-schedule.js';
import {
  isPushConfigured, sendNewChatPush, verifyPushReceiptToken,
} from '../lib/chat-push.js';
import { getLastSweep } from '../cron/chat-maintenance.js';
import { getAssistantOverrides, setAssistantOverrides } from '../lib/assistant-context.js';
import {
  createToken, verifyToken,
  CHAT_SESSION_PURPOSE, ADMIN_STREAM_PURPOSE,
} from '../lib/chat-session-token.js';
import { isCrisisMessage, CRISIS_RESPONSE } from '../lib/crisis-phrases.js';

const router = Router();

const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4000;
const MAX_MESSAGE_CHARS = 4000;

// ---------------------------------------------------------------- rate limits
// In-memory, namespaced keys (single process). { limit, windowMs } per bucket.
const rateLimits = new Map();
function rateLimited(name, ip, limit, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs);
  const key = `${name}:${ip}:${bucket}`;
  const entry = rateLimits.get(key) || { count: 0 };
  if (entry.count >= limit) return true;
  entry.count++;
  rateLimits.set(key, entry);
  if (rateLimits.size > 5000) {
    const now = Date.now();
    for (const [k] of rateLimits) {
      const [, , b] = k.split(':');
      // Entries from a bucket at least two windows old can never match again.
      if (parseInt(b) < Math.floor(now / windowMs) - 1) rateLimits.delete(k);
    }
  }
  return false;
}

function rejected(reason, ip, detail) {
  console.warn(`[Chat] escalate rejected reason=${reason} ip=${ip}${detail ? ` (${detail})` : ''}`);
}

// ---------------------------------------------------------------- public

// GET /api/chat/presence — no cache; one indexed single-row SELECT.
router.get('/presence', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ available: await getPresence() });
  } catch {
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// POST /api/chat/escalate — a visitor asks for a person.
router.post('/escalate', async (req, res) => {
  try {
    const ip = req.ip;
    if (rateLimited('escalate', ip, 5, 10 * 60 * 1000)) {
      rejected('rate-limited', ip);
      return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
    }

    const { pageUrl, userAgent, chatHistory, turnstileToken, chatSessionToken } = req.body || {};

    // A valid chat-session token (earned on a prior CAPTCHA pass) stands in
    // for a fresh single-use Turnstile token.
    const hasSession = typeof chatSessionToken === 'string' && verifyToken(chatSessionToken, CHAT_SESSION_PURPOSE, ip);
    if (!hasSession) {
      const result = await verifyTurnstile(turnstileToken, ip);
      if (!result.success) {
        rejected('captcha', ip);
        return res.status(400).json({ error: result.error, code: result.code, requireCaptcha: true });
      }
    }

    if (pageUrl !== undefined && typeof pageUrl !== 'string') {
      rejected('schema', ip, 'pageUrl');
      return res.status(400).json({ error: 'Invalid request' });
    }
    let history = [];
    if (chatHistory !== undefined) {
      if (!Array.isArray(chatHistory) || chatHistory.length > MAX_HISTORY_TURNS) {
        rejected('schema', ip, 'chatHistory');
        return res.status(400).json({ error: 'Invalid request' });
      }
      for (const turn of chatHistory) {
        if (!turn || (turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.content !== 'string') {
          rejected('schema', ip, 'chatHistory turn');
          return res.status(400).json({ error: 'Invalid request' });
        }
      }
      history = chatHistory.map((t) => ({ role: t.role, content: sanitizeChatText(t.content, MAX_TURN_CHARS) }));
    }

    // Presence gate reads the DB directly — never a cache.
    if (!(await getPresence())) {
      rejected('unavailable', ip);
      return res.status(503).json({ error: 'No one is available for live chat right now.', reason: 'unavailable' });
    }

    const session = await createChatSession({
      pageUrl: sanitizeChatText(pageUrl || '', 512),
      userAgent: sanitizeChatText(userAgent || '', 512) || null,
      chatHistory: history,
    });
    publishSessionCreated(session);
    // The fallback-email "queue" is the cron's `waiting AND fallback_email_at
    // IS NULL` filter; the phone alert goes out now, off the response path.
    sendNewChatPush(session.id, session.page_url || '/').catch((err) => {
      console.error('[Chat] escalate push failed:', err.message || err);
    });

    res.status(201).json({ sessionId: session.id, status: 'waiting' });
  } catch (err) {
    console.error('[Chat] escalate failed:', err.message || err);
    res.status(500).json({ error: 'Failed to start live chat' });
  }
});

/** Load a session for a visitor route: null answered with 404/410. */
async function visitorSession(req, res) {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  const session = await getChatSession(id);
  if (!session) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  if (isChatSessionGone(session)) {
    res.status(410).json({ error: 'This chat has ended.' });
    return null;
  }
  return session;
}

// GET /api/chat/session/:id — the reconnect probe.
router.get('/session/:id', async (req, res) => {
  try {
    const session = await visitorSession(req, res);
    if (!session) return;
    const messages = await getChatMessages(session.id);
    res.set('Cache-Control', 'no-store');
    res.json({
      session: {
        id: session.id,
        status: session.status,
        endReason: session.end_reason,
        createdAt: Number(session.created_at),
      },
      messages,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load chat' });
  }
});

// GET /api/chat/session/:id/events — visitor SSE.
router.get('/session/:id/events', async (req, res) => {
  try {
    if (rateLimited('chat-stream', req.ip, 30, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many stream opens' });
    }
    const session = await visitorSession(req, res);
    if (!session) return;

    let remove = null;
    const ok = openSseStream(req, res, { onClose: () => remove?.() });
    if (!ok) return;
    remove = addVisitorStream(session.id, res);

    // Full snapshot on every open: anything missed while disconnected replays.
    const messages = await getChatMessages(session.id);
    writeEvent(res, 'snapshot', {
      session: { id: session.id, status: session.status, endReason: session.end_reason, createdAt: Number(session.created_at) },
      messages,
    });
  } catch (err) {
    console.error('[Chat] visitor stream failed:', err.message || err);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
  }
});

// POST /api/chat/session/:id/messages — visitor sends a message.
router.post('/session/:id/messages', async (req, res) => {
  try {
    if (rateLimited('chat-msg', req.ip, 60, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many messages' });
    }
    const session = await visitorSession(req, res);
    if (!session) return;
    if (session.status === 'ended') return res.status(410).json({ error: 'This chat has ended.' });

    const content = sanitizeChatText(req.body?.content, MAX_MESSAGE_CHARS);
    if (!content) return res.status(400).json({ error: 'Message required' });

    const message = await addChatMessage(session.id, 'user', content);
    publishMessage(message);

    // Deterministic crisis layer runs in EVERY state: a match inserts a
    // system message that rides the normal snapshot/SSE path to both the
    // visitor's banner and the admin console.
    if (isCrisisMessage(content)) {
      const systemMessage = await addChatMessage(session.id, 'system', CRISIS_RESPONSE);
      publishMessage(systemMessage);
    }

    res.status(201).json({ success: true, id: message.id });
  } catch {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/chat/push/receipt — PUBLIC, rate-limited: the service worker
// echoes the signed receipt token after it SHOWS a notification. A valid
// token proves the alert reached the phone (a push-service 201 only means
// "queued"). The token is minted by us and HMAC-verified, so no auth needed.
router.post('/push/receipt', async (req, res) => {
  try {
    if (rateLimited('push-receipt', req.ip, 30, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many receipts' });
    }
    const verified = verifyPushReceiptToken(req.body?.receipt);
    if (!verified) return res.status(400).json({ error: 'Invalid receipt' });
    await markPushDelivered(verified.sessionId);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to record receipt' });
  }
});

// POST /api/chat/session/:id/end — visitor ends (or their timeout fires).
router.post('/session/:id/end', async (req, res) => {
  try {
    const session = await visitorSession(req, res);
    if (!session) return;
    const reason = req.body?.reason === 'timeout' ? 'timeout' : 'visitor_ended';
    const ended = await endChatSession(session.id, reason);
    if (ended) publishStatus(session.id, 'ended', reason);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to end chat' });
  }
});

// ---------------------------------------------------------------- admin

const admin = [authenticateToken, requireRole('admin')];

// POST /api/chat/admin/events-ticket — Bearer-authed mint of the 60-s stream
// ticket. The 7-day JWT itself must never appear in a query string.
router.post('/admin/events-ticket', ...admin, (req, res) => {
  const ticket = createToken(ADMIN_STREAM_PURPOSE, req.ip);
  if (!ticket) return res.status(500).json({ error: 'Ticket signing unavailable' });
  res.json({ ticket });
});

// GET /api/chat/admin/events?ticket=… — console SSE. Ticket-only auth.
router.get('/admin/events', async (req, res) => {
  try {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    if (!verifyToken(ticket, ADMIN_STREAM_PURPOSE, req.ip)) {
      return res.status(401).json({ error: 'Invalid or expired stream ticket' });
    }
    let remove = null;
    const ok = openSseStream(req, res, { onClose: () => remove?.() });
    if (!ok) return;
    remove = addAdminStream(res);

    writeEvent(res, 'snapshot', {
      sessions: await listAdminSessions(),
      presence: { available: await getPresence() },
    });
  } catch (err) {
    console.error('[Chat] admin stream failed:', err.message || err);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
  }
});

router.get('/admin/sessions', ...admin, async (_req, res) => {
  try {
    res.json({ sessions: await listAdminSessions() });
  } catch {
    res.status(500).json({ error: 'Failed to list chats' });
  }
});

router.get('/admin/sessions/:id', ...admin, async (req, res) => {
  try {
    const session = await getChatSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json({ session, messages: await getChatMessages(session.id) });
  } catch {
    res.status(500).json({ error: 'Failed to load chat' });
  }
});

// Atomic: only one admin wins a waiting session; the loser gets 409.
router.post('/admin/sessions/:id/claim', ...admin, async (req, res) => {
  try {
    const session = await claimChatSession(req.params.id);
    if (!session) {
      const current = await getChatSession(req.params.id);
      if (!current) return res.status(404).json({ error: 'Not found' });
      return res.status(409).json({ error: 'Already claimed or ended', status: current.status });
    }
    publishStatus(session.id, 'connected');
    res.json({ success: true, session });
  } catch {
    res.status(500).json({ error: 'Failed to claim chat' });
  }
});

router.post('/admin/sessions/:id/messages', ...admin, async (req, res) => {
  try {
    const session = await getChatSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (session.status === 'ended') return res.status(410).json({ error: 'Chat has ended' });
    const content = sanitizeChatText(req.body?.content, MAX_MESSAGE_CHARS);
    if (!content) return res.status(400).json({ error: 'Message required' });
    const message = await addChatMessage(session.id, 'agent', content);
    publishMessage(message);
    res.status(201).json({ success: true, id: message.id });
  } catch {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.post('/admin/sessions/:id/end', ...admin, async (req, res) => {
  try {
    const ended = await endChatSession(req.params.id, 'agent_ended');
    if (ended) publishStatus(ended.id, 'ended', 'agent_ended');
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to end chat' });
  }
});

// Manual toggle. When the schedule is enabled, snapshot the CURRENT scheduled
// state as the override so this tap holds until the next scheduled boundary
// (manual-wins-until-next-boundary), then the schedule resumes. Serialized
// with the scheduler tick so the tap can't be clobbered.
router.put('/admin/presence', ...admin, async (req, res) => {
  try {
    const available = await runExclusive(async () => {
      const value = await setPresence(req.body?.available === true, Date.now(), req.ip);
      try {
        const schedule = await getPresenceSchedule();
        if (schedule.enabled && schedule.daysValid) {
          await setScheduleOverride(computeScheduledAvailability(schedule.days, Date.now()));
        }
      } catch (err) {
        console.error('[Chat] override snapshot failed:', err.message);
      }
      return value;
    });
    console.log(`[Chat] presence available=${available} ip=${req.ip}`);
    publishPresence(available);
    res.json({ success: true, available });
  } catch {
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// ------------------------------------------------- weekly schedule (admin)

function serializeSchedule(schedule) {
  return {
    enabled: schedule.enabled,
    timezone: SCHEDULE_TIMEZONE,
    days: schedule.days,
    daysValid: schedule.daysValid,
    overrideActive: schedule.overrideDesired !== null,
    desiredNow: computeScheduledAvailability(schedule.days, Date.now()),
  };
}

router.get('/admin/schedule', ...admin, async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(serializeSchedule(await getPresenceSchedule()));
  } catch {
    res.status(500).json({ error: 'Failed to read schedule' });
  }
});

// Saving clears any manual override and immediately reconciles presence.
// The timezone is fixed in code (Eastern) and not accepted from the client.
router.put('/admin/schedule', ...admin, async (req, res) => {
  try {
    const { enabled, days } = req.body || {};
    if (typeof enabled !== 'boolean' || !isValidDays(days)) {
      return res.status(400).json({ error: 'Invalid schedule: 7 days, HH:MM times, open before close' });
    }
    const schedule = await runExclusive(async () => {
      await setPresenceSchedule(enabled, days);
      if (enabled) {
        const desired = computeScheduledAvailability(days, Date.now());
        if (desired !== (await getPresence())) {
          await setPresence(desired, Date.now(), 'schedule');
          publishPresence(desired);
        }
      }
      return getPresenceSchedule();
    });
    console.log(`[Chat] schedule saved enabled=${enabled} ip=${req.ip}`);
    res.json(serializeSchedule(schedule));
  } catch {
    res.status(500).json({ error: 'Failed to save schedule' });
  }
});

// ------------------------------------------------- agent typing (admin)

router.post('/admin/sessions/:id/typing', ...admin, async (req, res) => {
  try {
    publishTyping(req.params.id, req.body?.typing === true);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

// ------------------------------------------------- phone push (admin)

// The VAPID public key, fetched at runtime (not baked into the bundle).
router.get('/admin/push/config', ...admin, (_req, res) => {
  res.json({ configured: isPushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// One phone: subscribing replaces every stored row.
router.post('/admin/push/subscribe', ...admin, async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 1024 ||
        typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    await replacePushSubscriptions({
      endpoint, p256dh: keys.p256dh, auth: keys.auth,
      userAgent: sanitizeChatText(userAgent || '', 256) || null,
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

router.post('/admin/push/unsubscribe', ...admin, async (req, res) => {
  try {
    if (typeof req.body?.endpoint === 'string') await deletePushSubscription(req.body.endpoint);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

router.post('/admin/push/test', ...admin, async (_req, res) => {
  try {
    const result = await sendNewChatPush('test', '/dashboard/chats');
    res.json({ result });
  } catch {
    res.status(500).json({ error: 'Test push failed' });
  }
});

// ------------------------------------------------- health (admin)

router.get('/admin/health', ...admin, async (_req, res) => {
  try {
    const [push, presence] = await Promise.all([listPushSubscriptions(), getPresenceRow()]);
    res.set('Cache-Control', 'no-store');
    res.json({
      now: Date.now(),
      pushConfigured: isPushConfigured(),
      subscribers: streamCounts(),
      sweep: getLastSweep(),
      push: push.map((p) => ({
        id: p.id,
        endpointHost: (() => { try { return new URL(p.endpoint).host; } catch { return 'invalid'; } })(),
        createdAt: Number(p.created_at),
        lastSuccessAt: p.last_success_at === null ? null : Number(p.last_success_at),
        lastDeliveredAt: p.last_delivered_at === null ? null : Number(p.last_delivered_at),
        failures: p.failures,
      })),
      presence: {
        available: presence.available === true,
        updatedAt: presence.updated_at === null ? null : Number(presence.updated_at),
        updatedFrom: presence.updated_from,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to read health' });
  }
});

// ------------------------------------------------- assistant settings (admin)

// DB overrides for the assistant's knowledge profile and guidelines — edits
// take effect within a minute, no deploy needed. Blank string = use built-in.
router.get('/admin/assistant-settings', ...admin, async (_req, res) => {
  try {
    res.json(await getAssistantOverrides());
  } catch {
    res.status(500).json({ error: 'Failed to read assistant settings' });
  }
});

router.put('/admin/assistant-settings', ...admin, async (req, res) => {
  try {
    const { profileOverride, guidelinesOverride } = req.body || {};
    if ((profileOverride !== undefined && typeof profileOverride !== 'string') ||
        (guidelinesOverride !== undefined && typeof guidelinesOverride !== 'string') ||
        (profileOverride || '').length > 60000 || (guidelinesOverride || '').length > 20000) {
      return res.status(400).json({ error: 'Invalid settings' });
    }
    await setAssistantOverrides({ profileOverride, guidelinesOverride });
    console.log(`[Chat] assistant settings saved ip=${req.ip}`);
    res.json(await getAssistantOverrides());
  } catch {
    res.status(500).json({ error: 'Failed to save assistant settings' });
  }
});

export default router;
