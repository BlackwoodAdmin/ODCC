import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { query, resetTables, createUser } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';

vi.mock('../../server/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendDonationReceipt: vi.fn().mockResolvedValue(true),
  sendDonationFailedNotification: vi.fn().mockResolvedValue(true),
}));

const { default: authRoutes } = await import('../../server/routes/auth.js');

const app = buildTestApp({ routes: { '/api/auth': { router: authRoutes } } });

beforeEach(async () => {
  await resetTables(['password_reset_tokens', 'users']);
});

describe('POST /api/auth/register', () => {
  it('creates a new subscriber account and returns a JWT', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'new@test.local',
      password: 'supersecret',
      name: 'New User',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'new@test.local', role: 'subscriber' });
  });

  it('rejects when fields are missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.c' });
    expect(res.status).toBe(400);
  });

  it('rejects short passwords', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'x@test.local', password: '123', name: 'X',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 6/);
  });

  it('rejects duplicate emails that already have a password set', async () => {
    await createUser({ email: 'dupe@test.local' });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dupe@test.local', password: 'password123', name: 'Dupe',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already registered/);
  });

  it('lets a passwordless user claim their account by registering', async () => {
    // Subscribers added via newsletter have no password_hash
    const now = Date.now();
    await query(
      `INSERT INTO users (email, name, role, created_at, updated_at) VALUES ($1, $2, 'subscriber', $3, $3)`,
      ['claim@test.local', 'Claim Me', now]
    );

    const res = await request(app).post('/api/auth/register').send({
      email: 'claim@test.local', password: 'newpassword', name: 'Claim Me',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await createUser({ email: 'user@test.local', password: 'password123' });
    const res = await request(app).post('/api/auth/login').send({
      email: 'user@test.local', password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects wrong password', async () => {
    await createUser({ email: 'user@test.local', password: 'password123' });
    const res = await request(app).post('/api/auth/login').send({
      email: 'user@test.local', password: 'wrong',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 for unknown email (does not leak existence)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@test.local', password: 'password123',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects login for passwordless subscribers with a helpful message', async () => {
    const now = Date.now();
    await query(
      `INSERT INTO users (email, name, role, created_at, updated_at) VALUES ($1, $2, 'subscriber', $3, $3)`,
      ['passwordless@test.local', 'No Pw', now]
    );
    const res = await request(app).post('/api/auth/login').send({
      email: 'passwordless@test.local', password: 'anything',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/register first/);
  });

  it('requires both email and password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.c' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/forgot-password + /reset-password', () => {
  it('silently succeeds for unknown email (does not leak existence)', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If that email/);
  });

  it('creates a reset token for a known user and resets password end-to-end', async () => {
    await createUser({ email: 'reset@test.local', password: 'oldpassword' });

    const forgotRes = await request(app).post('/api/auth/forgot-password').send({ email: 'reset@test.local' });
    expect(forgotRes.status).toBe(200);

    const { rows } = await query('SELECT token FROM password_reset_tokens WHERE used=FALSE');
    expect(rows).toHaveLength(1);
    const token = rows[0].token;

    const resetRes = await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword' });
    expect(resetRes.status).toBe(200);

    // Verify new password works
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'reset@test.local', password: 'newpassword',
    });
    expect(loginRes.status).toBe(200);

    // Token should be marked used
    const { rows: tokens } = await query('SELECT used FROM password_reset_tokens WHERE token=$1', [token]);
    expect(tokens[0].used).toBe(true);
  });

  it('rejects an expired reset token and marks it used', async () => {
    const user = await createUser({ email: 'expired@test.local' });
    const expiredTs = Date.now() - 1000;
    await query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, used, created_at) VALUES ($1, 'expired-token', $2, FALSE, $3)`,
      [user.id, expiredTs, Date.now()]
    );

    const res = await request(app).post('/api/auth/reset-password').send({ token: 'expired-token', password: 'newpassword' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);

    const { rows } = await query('SELECT used FROM password_reset_tokens WHERE token=$1', ['expired-token']);
    expect(rows[0].used).toBe(true);
  });

  it('rejects an unknown or already-used reset token', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'does-not-exist', password: 'newpassword' });
    expect(res.status).toBe(400);
  });

  it('invalidates older tokens when a new one is requested', async () => {
    const user = await createUser({ email: 'multi@test.local' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'multi@test.local' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'multi@test.local' });

    const { rows } = await query('SELECT used FROM password_reset_tokens WHERE user_id=$1 ORDER BY created_at', [user.id]);
    expect(rows).toHaveLength(2);
    expect(rows[0].used).toBe(true);   // older one invalidated
    expect(rows[1].used).toBe(false);  // newest still usable
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user', async () => {
    const { signToken } = await import('../helpers/auth.js');
    const user = await createUser({ email: 'me@test.local' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: 'me@test.local' });
  });

  it('rejects without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
