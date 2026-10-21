// End-to-end SSR: the real route table + renderers (server/ssr-routes.js)
// against the test database, with the vitest-transformed entry injected.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { query, resetTables, createUser } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { initSsr } from '../../server/ssr.js';
import { registerSsrRoutes } from '../../server/ssr-routes.js';
import * as entry from '../../src/entry-server.jsx';

const FIXTURE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="build-id" content="dev" />
  <title>Default Title</title>
  <meta name="description" content="Default description" />
</head>
<body>
  <div id="root"><!--ssr-outlet--></div>
</body>
</html>`;

const app = buildTestApp({});
registerSsrRoutes(app);

let admin;

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-int-'));
  fs.writeFileSync(path.join(dir, 'index.html'), FIXTURE_TEMPLATE);
  const state = await initSsr({ distDir: dir, entry });
  expect(state.ready).toBe(true);
});

beforeEach(async () => {
  await resetTables(['comments', 'posts', 'events', 'users']);
  admin = await createUser({ email: 'ssr-admin@test.local', role: 'admin' });
  const now = Date.now();
  await query(
    `INSERT INTO posts (title, slug, content, excerpt, author_id, status, published_at, created_at, updated_at)
     VALUES ('Integration SSR Post', 'integration-ssr-post', '<p>The rendered <strong>post body</strong>.</p>', 'Integration excerpt', $1, 'published', $2, $2, $2),
            ('Secret Draft Post', 'secret-draft-post', '<p>draft body</p>', 'draft excerpt', $1, 'draft', NULL, $2, $2)`,
    [admin.id, now]
  );
  const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await query(
    `INSERT INTO events (title, description, location, event_date, event_time, end_date, recurrence, author_id, created_at, updated_at)
     VALUES ('Integration SSR Event', 'event description', 'Chapel', $1, '10:00', $1, NULL, $2, $3, $3)`,
    [soon, admin.id, Date.now()]
  );
});

describe('SSR pages', () => {
  it('serves the homepage with rendered content and initial data', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['x-ssr']).toBe('hit');
    expect(res.text).toContain('Integration SSR Post');
    expect(res.text).toContain('Integration SSR Event');
    expect(res.text).toContain('window.__INITIAL_DATA__=');
    expect(res.text).not.toContain('ssr-outlet');
  });

  it('serves a published blog post with its body rendered', async () => {
    const res = await request(app).get('/blog/integration-ssr-post');
    expect(res.status).toBe(200);
    expect(res.headers['x-ssr']).toBe('hit');
    expect(res.text).toContain('<strong>post body</strong>');
    expect(res.text).toContain('<title data-rh="true">Integration SSR Post - Open Door Christian Church</title>');
  });

  it('404s draft posts with a noindex NotFound page', async () => {
    const res = await request(app).get('/blog/secret-draft-post');
    expect(res.status).toBe(404);
    expect(res.text).toContain('noindex');
    expect(res.text).not.toContain('draft body');
  });

  it('serves the dashboard as the plain shell', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.headers['x-ssr']).toBe('shell');
    expect(res.text).toContain('<div id="root"></div>');
  });

  it('redirects the retired chili cook-off page to /events', async () => {
    const res = await request(app).get('/chili-cookoff');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/events');
  });

  it('SSRs unknown URLs as a 404 NotFound page', async () => {
    const res = await request(app).get('/definitely-not-a-page');
    expect(res.status).toBe(404);
    expect(res.headers['x-ssr']).toBe('hit');
    expect(res.text).toContain('find that page');
    expect(res.text).toContain('/definitely-not-a-page');
  });

  it('SSRs auxiliary public pages via the catch-all with noindex', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.headers['x-ssr']).toBe('hit');
    expect(res.text).toContain('noindex');
    expect(res.text).toContain('Login');
  });
});
