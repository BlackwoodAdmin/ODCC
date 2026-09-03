import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SPA_ROUTE_PATTERNS, isKnownSpaPath, ASSET_PATH_RE } from '../../server/spa-routes.js';

describe('SPA route manifest', () => {
  it('matches the <Route path> list in src/App.jsx exactly', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const inApp = [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*');
    expect([...new Set(inApp)].sort()).toEqual([...SPA_ROUTE_PATTERNS].sort());
  });

  it('has a catch-all Not Found route in src/App.jsx', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(src).toMatch(/<Route\s+path="\*"\s+element=\{<NotFound \/>\}/);
  });
});

describe('isKnownSpaPath', () => {
  it.each([
    '/', '/about', '/about/', '/events', '/chili-cookoff', '/blog', '/blog/some-post-slug', '/blog/v2.0-update',
    '/dashboard', '/dashboard/email/5', '/dashboard/bulletin/2026-09-01', '/dashboard/admin/email/monitoring',
    '/blog/caf%C3%A9-night',
  ])('accepts %s', (p) => expect(isKnownSpaPath(p)).toBe(true));

  it.each([
    '/nope', '/this-page-does-not-exist', '/blog/a/b', '/dashboard/nope', '/dashboard/email/5/extra',
    '/about/team', '/api/anything', '/assets/index.js', '', 'about', '/BLOG',
  ])('rejects %s', (p) => expect(isKnownSpaPath(p)).toBe(false));
});

describe('ASSET_PATH_RE', () => {
  it.each(['/assets/missing.js', '/uploads/gone.webp', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/fonts/x.woff2', '/old-page.html'])(
    'treats %s as a file request', (p) => expect(ASSET_PATH_RE.test(p)).toBe(true)
  );
  it.each(['/about', '/blog/v2.0-update', '/dashboard/bulletin/2026-09-01', '/chili-cookoff'])(
    'does not treat %s as a file request', (p) => expect(ASSET_PATH_RE.test(p)).toBe(false)
  );
});
