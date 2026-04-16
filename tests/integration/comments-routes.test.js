import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { query, resetTables, createUser } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { buildTestApp } from '../helpers/app.js';

const { default: commentsRoutes } = await import('../../server/routes/comments.js');

const app = buildTestApp({ routes: { '/api/comments': { router: commentsRoutes } } });

let admin, contributor, subscriber, postId;

beforeEach(async () => {
  await resetTables(['comments', 'posts', 'users']);
  admin = await createUser({ email: 'admin@test.local', role: 'admin' });
  contributor = await createUser({ email: 'contrib@test.local', role: 'contributor' });
  subscriber = await createUser({ email: 'sub@test.local', role: 'subscriber' });

  const now = Date.now();
  const { rows } = await query(
    `INSERT INTO posts (title, slug, content, author_id, status, published_at, created_at, updated_at)
     VALUES ('Hello', 'hello', 'body', $1, 'published', $2, $2, $2) RETURNING id`,
    [admin.id, now]
  );
  postId = rows[0].id;
});

async function insertComment({ content = 'Nice post', name = 'Anon', email = 'a@b.c', approved = true }) {
  const { rows } = await query(
    `INSERT INTO comments (post_id, author_name, author_email, content, approved, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [postId, name, email, content, approved, Date.now()]
  );
  return rows[0];
}

describe('GET /api/comments/post/:slug', () => {
  it('returns only approved comments', async () => {
    await insertComment({ content: 'approved', approved: true });
    await insertComment({ content: 'pending', approved: false });

    const res = await request(app).get('/api/comments/post/hello');
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].content).toBe('approved');
  });

  it('returns 404 for unknown post', async () => {
    const res = await request(app).get('/api/comments/post/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/comments/post/:slug', () => {
  it('auto-approves comments from admin users', async () => {
    const res = await request(app)
      .post('/api/comments/post/hello')
      .set(authHeader(admin))
      .send({ content: 'admin says hi' });
    expect(res.status).toBe(201);
    expect(res.body.comment.approved).toBe(true);
    expect(res.body.comment.author_name).toBe(admin.name);
  });

  it('auto-approves comments from contributor users', async () => {
    const res = await request(app)
      .post('/api/comments/post/hello')
      .set(authHeader(contributor))
      .send({ content: 'contrib says hi' });
    expect(res.status).toBe(201);
    expect(res.body.comment.approved).toBe(true);
  });

  it('holds comments from subscribers for moderation', async () => {
    const res = await request(app)
      .post('/api/comments/post/hello')
      .set(authHeader(subscriber))
      .send({ content: 'sub says hi' });
    expect(res.status).toBe(201);
    expect(res.body.comment.approved).toBe(false);
  });

  it('sanitizes HTML in content', async () => {
    const res = await request(app)
      .post('/api/comments/post/hello')
      .set(authHeader(admin))
      .send({ content: 'hello <script>alert(1)</script> there' });
    expect(res.status).toBe(201);
    expect(res.body.comment.content).not.toContain('<script>');
    expect(res.body.comment.content).toContain('hello');
  });

  it('requires content for anonymous commenters', async () => {
    // Anonymous comments run through requireTurnstile; with TURNSTILE_SECRET_KEY
    // unset in non-production it passes through, so the missing-content branch triggers.
    const res = await request(app)
      .post('/api/comments/post/hello')
      .send({ author_name: 'A', author_email: 'a@b.c' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown post slug', async () => {
    const res = await request(app)
      .post('/api/comments/post/unknown')
      .set(authHeader(admin))
      .send({ content: 'hi' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/comments/pending', () => {
  it('admin sees only unapproved comments', async () => {
    await insertComment({ content: 'approved', approved: true });
    await insertComment({ content: 'pending', approved: false });

    const res = await request(app).get('/api/comments/pending').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].content).toBe('pending');
  });

  it('rejects non-admins', async () => {
    const res = await request(app).get('/api/comments/pending').set(authHeader(contributor));
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated', async () => {
    const res = await request(app).get('/api/comments/pending');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/comments/:id/approve', () => {
  it('approves a pending comment', async () => {
    const c = await insertComment({ approved: false });
    const res = await request(app)
      .put(`/api/comments/${c.id}/approve`)
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.comment.approved).toBe(true);
  });

  it('returns 404 for unknown comment', async () => {
    const res = await request(app)
      .put('/api/comments/999999/approve')
      .set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  it('rejects non-admins', async () => {
    const c = await insertComment({ approved: false });
    const res = await request(app)
      .put(`/api/comments/${c.id}/approve`)
      .set(authHeader(contributor));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/comments/:id', () => {
  it('admin can delete a comment', async () => {
    const c = await insertComment({});
    const res = await request(app).delete(`/api/comments/${c.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    const { rows } = await query('SELECT id FROM comments WHERE id=$1', [c.id]);
    expect(rows).toHaveLength(0);
  });

  it('rejects non-admins', async () => {
    const c = await insertComment({});
    const res = await request(app).delete(`/api/comments/${c.id}`).set(authHeader(contributor));
    expect(res.status).toBe(403);
  });
});
