// Signed, IP-bound, purpose-scoped tokens for the assistant/chat routes.
//
// Two token types exist and MUST never verify as each other (a visitor's own
// chat-session token must not open the admin console stream):
//   - 'chat-session'  — issued to any visitor after a Turnstile pass; stands in
//     for the single-use Turnstile token on later assistant/escalate calls.
//   - 'admin-stream'  — a 60-second ticket minted by a Bearer-authed admin call,
//     accepted only by the admin SSE route (EventSource cannot send headers).
// Separation is enforced twice: the purpose is inside the signed payload AND
// each purpose signs with its own key derived from JWT_SECRET.
import crypto from 'crypto';

export const CHAT_SESSION_PURPOSE = 'chat-session-v1';
export const ADMIN_STREAM_PURPOSE = 'admin-stream-ticket-v1';

export const CHAT_SESSION_TTL_MS = 30 * 60 * 1000;
export const ADMIN_STREAM_TTL_MS = 60 * 1000;

function keyFor(purpose) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(`chat-token:${purpose}`).digest();
}

function sign(payloadB64, purpose) {
  const key = keyFor(purpose);
  if (!key) return null;
  return crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
}

export function createToken(purpose, ip, ttlMs) {
  const ttl = ttlMs ?? (purpose === ADMIN_STREAM_PURPOSE ? ADMIN_STREAM_TTL_MS : CHAT_SESSION_TTL_MS);
  const payload = { p: purpose, ip: ip || '', exp: Date.now() + ttl };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(payloadB64, purpose);
  if (!sig) return null;
  return `${payloadB64}.${sig}`;
}

export function verifyToken(token, purpose, ip) {
  if (typeof token !== 'string' || token.length > 2048) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64, purpose);
  if (!expected) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (payload?.p !== purpose) return false;
  if (payload.ip !== (ip || '')) return false;
  if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return false;
  return true;
}
