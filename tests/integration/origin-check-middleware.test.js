import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireOriginCheck } from '../../server/middleware/origin-check.js';

const SITE_URL = process.env.SITE_URL; // loaded from .env.test — http://localhost:3000

function app() {
  const app = express();
  app.use(requireOriginCheck);
  app.get('/r', (_req, res) => res.json({ ok: true }));
  app.post('/r', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireOriginCheck (CSRF protection)', () => {
  it('allows GET requests regardless of origin', async () => {
    const res = await request(app()).get('/r').set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
  });

  it('allows POST when both Origin and Referer are absent (curl/Postman)', async () => {
    const res = await request(app()).post('/r');
    expect(res.status).toBe(200);
  });

  it('allows POST when Origin matches SITE_URL', async () => {
    const res = await request(app()).post('/r').set('Origin', SITE_URL);
    expect(res.status).toBe(200);
  });

  it('rejects POST when Origin does not match SITE_URL', async () => {
    const res = await request(app()).post('/r').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('allows POST when Referer matches SITE_URL origin', async () => {
    const res = await request(app()).post('/r').set('Referer', `${SITE_URL}/some/path`);
    expect(res.status).toBe(200);
  });

  it('rejects POST when Referer is from a different origin', async () => {
    const res = await request(app()).post('/r').set('Referer', 'https://evil.example/x');
    expect(res.status).toBe(403);
  });

  it('rejects POST when Referer is malformed', async () => {
    const res = await request(app()).post('/r').set('Referer', 'not a url');
    expect(res.status).toBe(403);
  });

  it('prefers Origin over Referer when both are set', async () => {
    // Origin matches, Referer mismatches — should allow
    const res = await request(app())
      .post('/r')
      .set('Origin', SITE_URL)
      .set('Referer', 'https://evil.example/x');
    expect(res.status).toBe(200);

    // Origin mismatches, Referer matches — should reject on Origin
    const res2 = await request(app())
      .post('/r')
      .set('Origin', 'https://evil.example')
      .set('Referer', `${SITE_URL}/x`);
    expect(res2.status).toBe(403);
  });
});
