/**
 * Web Push to the admin's phone — plain Chrome, no installed app.
 *
 * VAPID keys come from the environment (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT). Every stored subscription gets the payload with TTL 600 (a
 * phone that was offline must not get a "new chat" an hour after the sweep
 * ended it) and urgency high. A 404/410 from the push service means the
 * subscription is gone and the row is deleted; any other failure increments
 * `failures`. The push body is a fixed title plus the already-sanitized page
 * path — nothing a visitor typed ever reaches the lock screen.
 *
 * Delivery receipts: a push-service 201 only means "queued", so the payload
 * carries a signed receipt token that the service worker echoes to
 * POST /api/chat/push/receipt after it SHOWS the notification. The token is
 * an HMAC keyed by a derivation of VAPID_PRIVATE_KEY (no extra secret to
 * provision; push cannot work without that key anyway) over
 * `sessionId.sentAt`, valid RECEIPT_TTL_MS. Only the push service and the
 * subscribed browser ever see the payload, so a valid echo proves the
 * notification reached the phone.
 */
import crypto from 'crypto';
import { listPushSubscriptions, deletePushSubscription, recordPushResult } from './chat-db.js';

export const PUSH_TTL_SECONDS = 600;
export const RECEIPT_TTL_MS = 15 * 60 * 1000;

export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let webPush = null;
let vapidApplied = false;
async function getWebPush() {
  if (!webPush) {
    // web-push v4 is pure ESM (named exports, no default); older versions are
    // CJS where the default-interop carries the API. Accept both shapes.
    const mod = await import('web-push');
    webPush = mod.default ?? mod;
  }
  if (!vapidApplied) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:hello@opendoorchristian.church',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    vapidApplied = true;
  }
  return webPush;
}

function endpointHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'invalid';
  }
}

function receiptSecret() {
  const key = process.env.VAPID_PRIVATE_KEY;
  if (!key) return null;
  // Domain-separated derivation so the VAPID key never doubles as a bare HMAC secret.
  return crypto.createHash('sha256').update(`odcc-push-receipt:${key}`).digest('hex');
}

function receiptSignature(secret, sessionId, sentAt) {
  return crypto.createHmac('sha256', secret).update(`${sessionId}.${sentAt}`).digest('base64url');
}

/** `<sessionId>.<sentAt>.<sig>`; sessionId is a UUID or 'test', so the dots are unambiguous. */
export function createPushReceiptToken(sessionId, sentAt = Date.now()) {
  const secret = receiptSecret();
  if (!secret) return null;
  return `${sessionId}.${sentAt}.${receiptSignature(secret, sessionId, sentAt)}`;
}

/** Returns { sessionId, sentAt } the receipt vouches for, or null. */
export function verifyPushReceiptToken(token, now = Date.now()) {
  const secret = receiptSecret();
  if (!secret || typeof token !== 'string' || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [sessionId, sentAtRaw, signature] = parts;
  const sentAt = Number(sentAtRaw);
  if (!sessionId || !Number.isFinite(sentAt)) return null;
  if (now - sentAt > RECEIPT_TTL_MS || sentAt - now > 60 * 1000) return null;
  try {
    const expected = Buffer.from(receiptSignature(secret, sessionId, sentAt), 'base64url');
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  } catch {
    return null;
  }
  return { sessionId, sentAt };
}

/** The payload the service worker renders. sessionId 'test' is the console's test button. */
export function buildPushPayload(sessionId, pagePath, sentAt = Date.now()) {
  const receipt = createPushReceiptToken(sessionId, sentAt) ?? undefined;
  if (sessionId === 'test') {
    return { title: 'Open Door Chat', body: 'Phone notifications are working.', sessionId, url: '/dashboard/chats', receipt };
  }
  return {
    title: 'Website visitor waiting',
    body: `New chat from ${String(pagePath || '/').slice(0, 80)}`,
    sessionId,
    url: '/dashboard/chats',
    receipt,
  };
}

export async function sendNewChatPush(sessionId, pagePath) {
  if (!isPushConfigured()) {
    console.log(`[ChatPush] skipped session=${sessionId} reason=not-configured`);
    return { sent: 0, failed: 0, skipped: true };
  }
  const subscriptions = await listPushSubscriptions();
  if (subscriptions.length === 0) {
    console.log(`[ChatPush] skipped session=${sessionId} reason=no-subscriptions`);
    return { sent: 0, failed: 0, skipped: true };
  }

  const push = await getWebPush();
  const payload = JSON.stringify(buildPushPayload(sessionId, pagePath));
  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    const host = endpointHost(subscription.endpoint);
    try {
      await push.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
        { TTL: PUSH_TTL_SECONDS, urgency: 'high' },
      );
      sent += 1;
      await recordPushResult(subscription.endpoint, true);
    } catch (error) {
      failed += 1;
      const status = error?.statusCode;
      if (status === 404 || status === 410) {
        await deletePushSubscription(subscription.endpoint);
        console.log(`[ChatPush] pruned endpoint=${host} status=${status}`);
      } else {
        await recordPushResult(subscription.endpoint, false);
        console.error(`[ChatPush] failed endpoint=${host} status=${status ?? 'n/a'}:`, error?.message || error);
      }
    }
  }

  console.log(`[ChatPush] sent session=${sessionId} subs=${sent} failed=${failed}`);
  return { sent, failed, skipped: false };
}
