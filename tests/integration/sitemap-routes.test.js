import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { query, resetTables, createUser } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';

const { default: sitemapRoutes, buildSitemapXml, clearSitemapCache } = await import('../../server/routes/sitemap.js');

const app = buildTestApp({ routes: { '/': { router: sitemapRoutes } } });
const SITE = (process.env.SITE_URL || '').replace(/\/+$/, '');

let author;

async function insertPost({ slug, status = 'published', publishedAt = Date.now(), updatedAt = publishedAt }) {
  await query(
    `INSERT INTO posts (title, slug, content, author_id, status, published_at, created_at, updated_at)
     VALUES ($1, $2, 'body', $3, $4, $5, $5, $6)`,
    [slug, slug, author.id, status, publishedAt, updatedAt]
  );
}

beforeEach(async () => {
  await resetTables(['posts', 'users']);
  author = await createUser({ email: 'author@test.local', role: 'admin' });
  clearSitemapCache();
});

describe('buildSitemapXml', () => {
  it('lists static pages, published posts with lastmod, and escapes XML', () => {
    const xml = buildSitemapXml({
      siteUrl: 'https://example.org',
      today: '2026-09-03',
      posts: [
        { slug: 'hello-world', published_at: Date.UTC(2026, 7, 1), updated_at: Date.UTC(2026, 7, 15) },
        { slug: 'a&b', published_at: Date.UTC(2026, 6, 4), updated_at: null },
      ],
    });
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    expect(xml).toContain('<loc>https://example.org/</loc>');
    expect(xml).toContain('<loc>https://example.org/about</loc>');
    expect(xml).toContain('<loc>https://example.org/chili-cookoff</loc>');
    expect(xml).toContain('<loc>https://example.org/blog/hello-world</loc>\n    <lastmod>2026-08-15</lastmod>');
    expect(xml).toContain('<loc>https://example.org/blog/a&amp;b</loc>\n    <lastmod>2026-07-04</lastmod>');
    // /blog itself carries the newest post date
    expect(xml).toContain('<loc>https://example.org/blog</loc>\n    <lastmod>2026-08-15</lastmod>');
    expect(xml).not.toContain('/login');
    expect(xml).not.toContain('/dashboard');
  });

  it('drops the Fall Festival page after festival day', () => {
    const xml = buildSitemapXml({ siteUrl: 'https://example.org', today: '2026-10-18', posts: [] });
    expect(xml).not.toContain('/chili-cookoff');
  });
});

describe('GET /sitemap.xml', () => {
  it('serves XML with published posts only', async () => {
    await insertPost({ slug: 'public-post', publishedAt: Date.UTC(2026, 8, 1) });
    await insertPost({ slug: 'secret-draft', status: 'draft' });
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain(`<loc>${SITE}/blog/public-post</loc>`);
    expect(res.text).toContain('<lastmod>2026-09-01</lastmod>');
    expect(res.text).not.toContain('secret-draft');
    expect(res.text).toContain(`<loc>${SITE}/</loc>`);
  });

  it('caches between requests until cleared', async () => {
    await insertPost({ slug: 'first' });
    expect((await request(app).get('/sitemap.xml')).text).toContain('/blog/first');
    await insertPost({ slug: 'second' });
    expect((await request(app).get('/sitemap.xml')).text).not.toContain('/blog/second');
    clearSitemapCache();
    expect((await request(app).get('/sitemap.xml')).text).toContain('/blog/second');
  });
});
