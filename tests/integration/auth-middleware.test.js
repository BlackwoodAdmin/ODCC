import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  authenticateToken,
  optionalAuth,
  requireRole,
  revokeUserTokens,
} from '../../server/middleware/auth.js';
import { signToken } from '../helpers/auth.js';

function appWith(...middlewares) {
  const app = express();
  app.get('/protected', ...middlewares, (req, res) => res.json({ user: req.user || null }));
  return app;
}

describe('authenticateToken', () => {
  it('rejects requests with no Authorization header', async () => {
    const res = await request(appWith(authenticateToken)).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('rejects a malformed token', async () => {
    const res = await request(appWith(authenticateToken))
      .get('/protected')
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = jwt.sign({ id: 1, role: 'admin' }, 'wrong-secret-wrong-secret-wrong-secret-wrong-secret-wrong-sec');
    const res = await request(appWith(authenticateToken))
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const token = signToken({ id: 1, role: 'admin', email: 'a@b.c', name: 'x' }, { expiresIn: '-1s' });
    const res = await request(appWith(authenticateToken))
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('accepts a valid token and attaches req.user', async () => {
    const token = signToken({ id: 42, role: 'admin', email: 'a@b.c', name: 'Admin' });
    const res = await request(appWith(authenticateToken))
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 42, role: 'admin' });
  });

  it('rejects tokens issued before a revocation event', async () => {
    // Sign a token with iat well in the past
    const pastIat = Math.floor(Date.now() / 1000) - 3600;
    const token = jwt.sign(
      { id: 99, role: 'subscriber', email: 'x@y.z', name: 'X', iat: pastIat },
      process.env.JWT_SECRET
    );
    revokeUserTokens(99);  // sets revokedAt to Date.now(), which is after iat

    const res = await request(appWith(authenticateToken))
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token revoked');
  });
});

describe('optionalAuth', () => {
  it('attaches req.user when token is valid', async () => {
    const token = signToken({ id: 1, role: 'subscriber', email: 'a@b.c', name: 'A' });
    const res = await request(appWith(optionalAuth))
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 1 });
  });

  it('allows request through with no token (req.user undefined)', async () => {
    const res = await request(appWith(optionalAuth)).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it('allows request through with invalid token (does not error)', async () => {
    const res = await request(appWith(optionalAuth))
      .get('/protected')
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
});

describe('requireRole', () => {
  it('rejects when user is not authenticated', async () => {
    const res = await request(appWith(requireRole('admin'))).get('/protected');
    expect(res.status).toBe(401);
  });

  it('rejects when role does not match', async () => {
    const token = signToken({ id: 1, role: 'subscriber', email: 'a@b.c', name: 'A' });
    const res = await request(appWith(authenticateToken, requireRole('admin')))
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('allows when role matches one of the allowed roles', async () => {
    const token = signToken({ id: 1, role: 'contributor', email: 'a@b.c', name: 'A' });
    const res = await request(appWith(authenticateToken, requireRole('admin', 'contributor')))
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
