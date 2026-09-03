import crypto from 'crypto';
import { JWT_SECRET } from '../config.js';

/**
 * Short-lived signed URLs for email attachments.
 *
 * Inline images in a message body are normally embedded as data: URIs, but
 * that is capped per image and per message to keep the JSON payload sane.
 * Images over the cap are referenced by URL instead. The message viewer
 * renders the body in a sandboxed iframe, which cannot attach the JWT header
 * to an <img> request, so the URL carries its own HMAC signature and expiry.
 */
export const SIGNED_ATTACHMENT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function mac(attachmentId, exp) {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`attachment:${String(Number(attachmentId))}:${String(Number(exp))}`)
    .digest('hex');
}

export function signedAttachmentUrl(attachmentId, ttlMs = SIGNED_ATTACHMENT_TTL_MS) {
  const exp = Date.now() + ttlMs;
  return `/api/email/attachments/${Number(attachmentId)}?exp=${exp}&sig=${mac(attachmentId, exp)}`;
}

export function verifyAttachmentSignature(attachmentId, exp, sig) {
  const expNum = Number(exp);
  if (!Number.isInteger(Number(attachmentId))) return false;
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = Buffer.from(mac(attachmentId, expNum), 'hex');
  const given = Buffer.from(sig, 'hex');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
