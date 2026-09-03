import { Router } from 'express';
import { query } from '../db.js';

// sitemap.xml — public pages plus every published blog post. Rebuilt at most
// once every CACHE_TTL_MS so crawlers cannot turn it into a database load.

const SITE_URL = (process.env.SITE_URL || 'https://opendoorchristian.church').replace(/\/+$/, '');
const CACHE_TTL_MS = 5 * 60 * 1000;

// Public, indexable pages. Login/registration/password/unsubscribe pages are
// deliberately absent (they are also disallowed in public/robots.txt).
const STATIC_PAGES = ['/', '/about', '/our-pastor', '/services', '/events', '/blog', '/give', '/contact', '/joy-ladies-circle'];

// Fall Festival 2026 sign-up: listed through festival day, then drops off.
const CHILI_COOKOFF_LAST_DAY = '2026-10-17';

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString().slice(0, 10);
}

/**
 * Pure builder so it can be unit tested. `posts` are { slug, published_at, updated_at }.
 */
export function buildSitemapXml({ posts = [], siteUrl = SITE_URL, today = todayET() } = {}) {
  const entries = [];
  const latestPost = posts.reduce((max, p) => Math.max(max, Number(p.updated_at) || 0, Number(p.published_at) || 0), 0);

  for (const path of STATIC_PAGES) {
    entries.push({ loc: `${siteUrl}${path}`, lastmod: path === '/blog' && latestPost ? isoDate(latestPost) : null });
  }
  if (today <= CHILI_COOKOFF_LAST_DAY) {
    entries.push({ loc: `${siteUrl}/chili-cookoff`, lastmod: null });
  }
  for (const p of posts) {
    if (!p.slug) continue;
    entries.push({ loc: `${siteUrl}/blog/${p.slug}`, lastmod: isoDate(p.updated_at) || isoDate(p.published_at) });
  }

  const body = entries.map((e) =>
    `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}\n  </url>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

let cache = { xml: null, expiresAt: 0 };

export function clearSitemapCache() {
  cache = { xml: null, expiresAt: 0 };
}

const router = Router();

router.get('/sitemap.xml', async (_req, res) => {
  try {
    if (!cache.xml || Date.now() > cache.expiresAt) {
      const { rows } = await query(
        "SELECT slug, published_at, updated_at FROM posts WHERE status = 'published' ORDER BY published_at DESC NULLS LAST, id DESC"
      );
      cache = { xml: buildSitemapXml({ posts: rows }), expiresAt: Date.now() + CACHE_TTL_MS };
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.type('application/xml').send(cache.xml);
  } catch (err) {
    console.error('[Sitemap] Build error:', err.message);
    res.status(500).type('text').send('Sitemap unavailable');
  }
});

export default router;
