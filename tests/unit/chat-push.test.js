import { describe, it, expect, beforeAll } from 'vitest';
import {
  createPushReceiptToken, verifyPushReceiptToken, buildPushPayload, RECEIPT_TTL_MS,
} from '../../server/lib/chat-push.js';

beforeAll(() => {
  // receiptSecret derives from the VAPID private key at call time.
  if (!process.env.VAPID_PRIVATE_KEY) process.env.VAPID_PRIVATE_KEY = 'test-vapid-private-key';
});

describe('push receipt tokens', () => {
  it('round-trips', () => {
    const token = createPushReceiptToken('abc-123');
    const verified = verifyPushReceiptToken(token);
    expect(verified?.sessionId).toBe('abc-123');
  });

  it('expires after RECEIPT_TTL_MS and rejects far-future timestamps', () => {
    const old = createPushReceiptToken('abc-123', Date.now() - RECEIPT_TTL_MS - 1000);
    expect(verifyPushReceiptToken(old)).toBe(null);
    const future = createPushReceiptToken('abc-123', Date.now() + 5 * 60 * 1000);
    expect(verifyPushReceiptToken(future)).toBe(null);
  });

  it('rejects tampering and garbage', () => {
    const token = createPushReceiptToken('abc-123');
    const [sid, sentAt, sig] = token.split('.');
    expect(verifyPushReceiptToken(`other.${sentAt}.${sig}`)).toBe(null);
    expect(verifyPushReceiptToken(`${sid}.${Number(sentAt) + 5}.${sig}`)).toBe(null);
    expect(verifyPushReceiptToken('garbage')).toBe(null);
    expect(verifyPushReceiptToken('')).toBe(null);
  });

  it('push payload never carries visitor text — fixed title, page path only', () => {
    const payload = buildPushPayload('abc-123', '/new-here<script>');
    expect(payload.title).toBe('Website visitor waiting');
    expect(payload.body).toBe('New chat from /new-here<script>'.slice(0, 95));
    expect(payload.url).toBe('/dashboard/chats');
    expect(typeof payload.receipt).toBe('string');
    const test = buildPushPayload('test', '/dashboard/chats');
    expect(test.body).toContain('working');
  });
});
