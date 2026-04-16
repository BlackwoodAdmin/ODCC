import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { query, resetTables, createUser } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { buildTestApp } from '../helpers/app.js';

const { default: contactRoutes } = await import('../../server/routes/contact.js');

const app = buildTestApp({ routes: { '/api/contact': { router: contactRoutes } } });

let admin;

beforeEach(async () => {
  await resetTables(['contact_submissions', 'users']);
  admin = await createUser({ email: 'admin@test.local', role: 'admin' });
});

describe('POST /api/contact', () => {
  it('accepts a valid contact submission', async () => {
    const res = await request(app).post('/api/contact').send({
      name: 'Jane', email: 'jane@test.local', phone: '555-1212', message: 'Hi there',
    });
    expect(res.status).toBe(201);
    const { rows } = await query('SELECT name, email, phone, message FROM contact_submissions');
    expect(rows).toEqual([{ name: 'Jane', email: 'jane@test.local', phone: '555-1212', message: 'Hi there' }]);
  });

  it('requires name, email, and message', async () => {
    const res = await request(app).post('/api/contact').send({ name: 'x', email: 'x@test.local' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/contact').send({
      name: 'x', email: 'notanemail', message: 'hi',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('rejects messages over 5000 characters', async () => {
    const res = await request(app).post('/api/contact').send({
      name: 'x', email: 'x@test.local', message: 'a'.repeat(5001),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/contact/prayer', () => {
  it('stores the submission with type=prayer', async () => {
    const res = await request(app).post('/api/contact/prayer').send({
      name: 'Jane', email: 'jane@test.local', message: 'Please pray',
    });
    expect(res.status).toBe(201);
    const { rows } = await query('SELECT type FROM contact_submissions');
    expect(rows).toEqual([{ type: 'prayer' }]);
  });

  it('requires all fields', async () => {
    const res = await request(app).post('/api/contact/prayer').send({
      name: 'x', email: 'x@test.local',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/contact (admin)', () => {
  beforeEach(async () => {
    await query(
      `INSERT INTO contact_submissions (name, email, message, created_at) VALUES
        ('A', 'a@test.local', 'm1', 100), ('B', 'b@test.local', 'm2', 200)`
    );
  });

  it('admin can list submissions (newest first)', async () => {
    const res = await request(app).get('/api/contact').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.messages.map(m => m.name)).toEqual(['B', 'A']);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/contact');
    expect(res.status).toBe(401);
  });

  it('rejects non-admins', async () => {
    const sub = await createUser({ email: 'sub@test.local', role: 'subscriber' });
    const res = await request(app).get('/api/contact').set(authHeader(sub));
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/contact/:id/read and /read-all', () => {
  it('marks a single submission read', async () => {
    const { rows: [row] } = await query(
      `INSERT INTO contact_submissions (name, email, message, created_at) VALUES ('A', 'a@test.local', 'm', $1) RETURNING id`,
      [Date.now()]
    );
    const res = await request(app).put(`/api/contact/${row.id}/read`).set(authHeader(admin));
    expect(res.status).toBe(200);
    const { rows } = await query('SELECT read FROM contact_submissions WHERE id=$1', [row.id]);
    expect(rows[0].read).toBe(true);
  });

  it('marks all unread submissions as read', async () => {
    await query(
      `INSERT INTO contact_submissions (name, email, message, created_at) VALUES
        ('A', 'a@test.local', 'm1', 100), ('B', 'b@test.local', 'm2', 200)`
    );
    const res = await request(app).put('/api/contact/read-all').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM contact_submissions WHERE read=true');
    expect(rows[0].c).toBe(2);
  });
});

describe('DELETE /api/contact/:id', () => {
  it('admin can delete', async () => {
    const { rows: [row] } = await query(
      `INSERT INTO contact_submissions (name, email, message, created_at) VALUES ('A', 'a@test.local', 'm', $1) RETURNING id`,
      [Date.now()]
    );
    const res = await request(app).delete(`/api/contact/${row.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    const { rows } = await query('SELECT id FROM contact_submissions WHERE id=$1', [row.id]);
    expect(rows).toHaveLength(0);
  });
});
