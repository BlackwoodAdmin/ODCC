import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireTurnstile } from '../../server/middleware/turnstile.js';

function appWithTurnstile() {
  const app = express();
  app.use(express.json());
  app.post('/protected', requireTurnstile, (_req, res) => res.json({ ok: true }));
  return app;
}

const originalSecret = process.env.TURNSTILE_SECRET_KEY;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  vi.unstubAllGlobals();
});

describe('requireTurnstile', () => {
  it('passes through in non-production when secret is unset', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = 'test';

    const res = await request(appWithTurnstile()).post('/protected').send({});
    expect(res.status).toBe(200);
  });

  it('rejects in production when secret is unset', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = 'production';

    const res = await request(appWithTurnstile()).post('/protected').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TURNSTILE_FAILED');
  });

  it('rejects when secret is set but no token provided', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'any-secret';

    const res = await request(appWithTurnstile()).post('/protected').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TURNSTILE_REQUIRED');
  });

  it('passes through when Cloudflare verifies the token successfully', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'any-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(appWithTurnstile())
      .post('/protected')
      .send({ turnstileToken: 'good-token' });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects when Cloudflare reports the token as invalid', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'any-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }));

    const res = await request(appWithTurnstile())
      .post('/protected')
      .send({ turnstileToken: 'bad-token' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TURNSTILE_FAILED');
  });

  it('rejects when Cloudflare API is unreachable (non-OK response)', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'any-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    const res = await request(appWithTurnstile())
      .post('/protected')
      .send({ turnstileToken: 'any' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TURNSTILE_FAILED');
  });

  it('returns 500 when fetch throws (network error)', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'any-secret';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await request(appWithTurnstile())
      .post('/protected')
      .send({ turnstileToken: 'any' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('TURNSTILE_FAILED');
  });
});
