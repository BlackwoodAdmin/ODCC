import { describe, it, expect } from 'vitest';
import {
  createToken, verifyToken,
  CHAT_SESSION_PURPOSE, ADMIN_STREAM_PURPOSE,
} from '../../server/lib/chat-session-token.js';

const IP = '203.0.113.7';

describe('chat session tokens', () => {
  it('round-trips for the same purpose and IP', () => {
    const token = createToken(CHAT_SESSION_PURPOSE, IP);
    expect(token).toBeTruthy();
    expect(verifyToken(token, CHAT_SESSION_PURPOSE, IP)).toBe(true);
  });

  it('is bound to the IP', () => {
    const token = createToken(CHAT_SESSION_PURPOSE, IP);
    expect(verifyToken(token, CHAT_SESSION_PURPOSE, '198.51.100.9')).toBe(false);
  });

  it('expires', () => {
    const token = createToken(CHAT_SESSION_PURPOSE, IP, -1000);
    expect(verifyToken(token, CHAT_SESSION_PURPOSE, IP)).toBe(false);
  });

  it('rejects garbage and tampering', () => {
    expect(verifyToken('not-a-token', CHAT_SESSION_PURPOSE, IP)).toBe(false);
    expect(verifyToken('', CHAT_SESSION_PURPOSE, IP)).toBe(false);
    expect(verifyToken(null, CHAT_SESSION_PURPOSE, IP)).toBe(false);
    const token = createToken(CHAT_SESSION_PURPOSE, IP);
    const [payload, sig] = token.split('.');
    expect(verifyToken(`${payload}x.${sig}`, CHAT_SESSION_PURPOSE, IP)).toBe(false);
    expect(verifyToken(`${payload}.${sig.slice(0, -2)}aa`, CHAT_SESSION_PURPOSE, IP)).toBe(false);
  });

  it('DOMAIN SEPARATION: a visitor chat-session token never verifies as an admin stream ticket (and vice versa)', () => {
    const visitorToken = createToken(CHAT_SESSION_PURPOSE, IP);
    const adminTicket = createToken(ADMIN_STREAM_PURPOSE, IP);
    // The attack from the plan: a Turnstile-passing visitor's own token
    // presented at GET /admin/events?ticket=…
    expect(verifyToken(visitorToken, ADMIN_STREAM_PURPOSE, IP)).toBe(false);
    expect(verifyToken(adminTicket, CHAT_SESSION_PURPOSE, IP)).toBe(false);
    // Each still works for its own purpose.
    expect(verifyToken(visitorToken, CHAT_SESSION_PURPOSE, IP)).toBe(true);
    expect(verifyToken(adminTicket, ADMIN_STREAM_PURPOSE, IP)).toBe(true);
  });

  it('admin tickets are short-lived (≤ 60 s exp set at mint)', () => {
    const ticket = createToken(ADMIN_STREAM_PURPOSE, IP);
    const payload = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString());
    expect(payload.exp - Date.now()).toBeLessThanOrEqual(60 * 1000 + 500);
    // Reusable within its TTL (stateless): two verifies both pass.
    expect(verifyToken(ticket, ADMIN_STREAM_PURPOSE, IP)).toBe(true);
    expect(verifyToken(ticket, ADMIN_STREAM_PURPOSE, IP)).toBe(true);
  });
});
