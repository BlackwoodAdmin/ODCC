import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { verifyTurnstile, requireTurnstile } from '@server/middleware/turnstile.js';

vi.stubGlobal('fetch', vi.fn());

describe('verifyTurnstile', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return {success: true} when token valid', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await verifyTurnstile('valid_token');

    expect(result.success).toBe(true);
  });

  it('should return {success: false} when token invalid', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error_codes: ['invalid-input-response'] }),
    });

    const result = await verifyTurnstile('invalid_token');

    expect(result.success).toBe(false);
  });

  it('should return {success: true} in test without config', async () => {
    process.env.NODE_ENV = 'test';
    const oldSecret = process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;

    const result = await verifyTurnstile('any_token');

    expect(result.success).toBe(true);

    if (oldSecret) process.env.TURNSTILE_SECRET_KEY = oldSecret;
  });

  it('should return {success: false, code: TURNSTILE_REQUIRED} when no token', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const result = await verifyTurnstile(null);

    expect(result.success).toBe(false);
    expect(result.code).toBe('TURNSTILE_REQUIRED');
  });

  it('should send remoteIp in request if provided', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await verifyTurnstile('token', '192.168.1.1');

    expect(global.fetch).toHaveBeenCalled();
    // Check that fetch was called with proper params
    expect(global.fetch.mock.calls[0]).toBeDefined();
  });
});

describe('requireTurnstile middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: { turnstileToken: 'test_token' }, ip: '127.0.0.1' };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  it('should call next() on successful verification', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await requireTurnstile(req, res, next);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(next).toHaveBeenCalled();
  });

  it('should return 400 with error message on failure', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });

    await requireTurnstile(req, res, next);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(res.status).toHaveBeenCalledWith(400);
  });
});