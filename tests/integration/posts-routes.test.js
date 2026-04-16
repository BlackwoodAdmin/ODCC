import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { query, resetTables, createUser } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { buildTestApp } from '../helpers/app.js';

const { default: postsRoutes } = await import('../../server/routes/posts.js');

const app = buildTestApp({ routes: { '/api/posts': { router: postsRoutes } } });

let admin, contributor, other;

beforeEach(async () => {
  await resetTables(['posts', 'users']);
  admin = await createUser({ email: 'admin@test.local', role: 'admin' });
  contributor = await createUser({ email: 'contributor@test.local', role: 'contributor' });
  other = await createUser({ email: 'other@test.local', role: 'contributor' });
});

async function createPost({ authorId, title = 'Hello World', status = 'published', slug = 'hello-world' }) {
  const now = Date.now();
  const { rows } = await query(
    `INSERT INTO posts (title, slug, content, excerpt, author_id, status, published_at, created_at, updated_at)
     VALUES ($1, $2, 'body', 'excerpt', $3, $4, $5, $6, $6) RETURNING *`,
    [title, slug, authorId, status, status === 'published' ? now : null, now]
  );
  return rows[0];
}

describe('GET /api/posts', () => {
  it('returns only published posts', async () => {
    await createPost({ authorId: admin.id, title: 'Published', slug: 'published' });
    await createPost({ authorId: admin.id, title: 'Draft', slug: 'draft', status: 'draft' });

    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].slug).toBe('published');
  });

  it('supports pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await createPost({ authorId: admin.id, title: `P${i}`, slug: `p${i}` });
    }
    const res = await request(app).get('/api/posts?limit=2&page=1');
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });
});

describe('GET /api/posts/:slug', () => {
  it('returns a post by slug', async () => {
    await createPost({ authorId: admin.id, slug: 'hello' });
    const res = await request(app).get('/api/posts/hello');
    expect(res.status).toBe(200);
    expect(res.body.post.slug).toBe('hello');
    expect(res.body.post.author_name).toBe(admin.name);
  });

  it('returns 404 for unknown slug', async () => {
    const res = await request(app).get('/api/posts/nope');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/posts/all', () => {
  it('admin sees all posts', async () => {
    await createPost({ authorId: admin.id, slug: 'a' });
    await createPost({ authorId: contributor.id, slug: 'b' });

    const res = await request(app).get('/api/posts/all').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
  });

  it('contributor only sees their own posts', async () => {
    await createPost({ authorId: admin.id, slug: 'a' });
    await createPost({ authorId: contributor.id, slug: 'b' });

    const res = await request(app).get('/api/posts/all').set(authHeader(contributor));
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].slug).toBe('b');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/posts/all');
    expect(res.status).toBe(401);
  });

  it('rejects subscribers', async () => {
    const subscriber = await createUser({ email: 'sub@test.local', role: 'subscriber' });
    const res = await request(app).get('/api/posts/all').set(authHeader(subscriber));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/posts', () => {
  it('creates a post as admin', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set(authHeader(admin))
      .send({ title: 'New Post', content: '<p>Body</p>', excerpt: 'x', status: 'published' });
    expect(res.status).toBe(201);
    expect(res.body.post.slug).toBe('new-post');
    expect(res.body.post.status).toBe('published');
    expect(res.body.post.published_at).toBeTruthy();
  });

  it('auto-increments slug when duplicate exists', async () => {
    await createPost({ authorId: admin.id, slug: 'duplicate' });

    const res = await request(app)
      .post('/api/posts')
      .set(authHeader(admin))
      .send({ title: 'Duplicate', content: '<p>x</p>', status: 'draft' });
    expect(res.status).toBe(201);
    expect(res.body.post.slug).toBe('duplicate-2');
  });

  it('sanitizes HTML content', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set(authHeader(admin))
      .send({ title: 'XSS', content: '<p>hi</p><script>alert(1)</script>', status: 'draft' });
    expect(res.status).toBe(201);
    expect(res.body.post.content).not.toContain('<script>');
  });

  it('rejects unauthenticated', async () => {
    const res = await request(app).post('/api/posts').send({ title: 'x', content: '<p>x</p>' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/posts/:id', () => {
  it('admin can edit any post', async () => {
    const post = await createPost({ authorId: contributor.id });
    const res = await request(app)
      .put(`/api/posts/${post.id}`)
      .set(authHeader(admin))
      .send({ title: 'Edited', content: '<p>new</p>' });
    expect(res.status).toBe(200);
    expect(res.body.post.title).toBe('Edited');
  });

  it('contributor cannot edit someone else’s post', async () => {
    const post = await createPost({ authorId: other.id });
    const res = await request(app)
      .put(`/api/posts/${post.id}`)
      .set(authHeader(contributor))
      .send({ title: 'hack' });
    expect(res.status).toBe(403);
  });

  it('contributor can edit their own post', async () => {
    const post = await createPost({ authorId: contributor.id });
    const res = await request(app)
      .put(`/api/posts/${post.id}`)
      .set(authHeader(contributor))
      .send({ title: 'Mine' });
    expect(res.status).toBe(200);
    expect(res.body.post.title).toBe('Mine');
  });

  it('returns 404 for unknown post', async () => {
    const res = await request(app)
      .put('/api/posts/999999')
      .set(authHeader(admin))
      .send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/posts/:id', () => {
  it('admin can delete a post', async () => {
    const post = await createPost({ authorId: admin.id });
    const res = await request(app).delete(`/api/posts/${post.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    const { rows } = await query('SELECT id FROM posts WHERE id=$1', [post.id]);
    expect(rows).toHaveLength(0);
  });

  it('contributor cannot delete', async () => {
    const post = await createPost({ authorId: contributor.id });
    const res = await request(app).delete(`/api/posts/${post.id}`).set(authHeader(contributor));
    expect(res.status).toBe(403);
  });
});
