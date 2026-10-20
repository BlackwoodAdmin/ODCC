// Server-side rendering of the public React pages. Fail-safe by design:
// if anything here is broken (missing bundle, stale template, render or
// loader error), responses fall back to the SPA shell — exactly the
// pre-SSR behavior — and say so in the X-SSR header.
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

export const SITE_URL = 'https://opendoorchristian.church';
const DEFAULT_OG_IMAGE = `${SITE_URL}/uploads/church-header.webp`;
const FB_APP_ID = '949925117923722';
const OUTLET = '<!--ssr-outlet-->';
// Sentinel path the 404 body is prerendered with; swapped per request.
const NOT_FOUND_SENTINEL = '/__not-found__';

const CACHE_TTL_MS = parseInt(process.env.SSR_CACHE_TTL_MS || '0', 10) || 0;
const CACHE_MAX_ENTRIES = 200;

const state = {
  ready: false,
  template: null,       // dist/index.html, verbatim
  shellHtml: null,      // template with the outlet marker stripped — never throws to build
  entry: null,          // the imported dist-ssr/entry-server.js module
  notFoundBody: null,   // prerendered 404 app HTML with the sentinel path
  cache: new Map(),     // path -> { html, expires }
};

export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// JSON that is safe to embed in a <script> tag: < cannot close the tag
// or open a comment, and U+2028/2029 are invalid in JS source.
export function serializeForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}

// The curated per-page head block (same tag set the pre-SSR OG injection
// produced). data-rh="true" lets react-helmet-async adopt these tags on
// hydration instead of adding duplicates.
export function buildHeadTags({ title, description, image = DEFAULT_OG_IMAGE, type = 'website', urlPath, noindex = false }) {
  const ogImageType = image.toLowerCase().endsWith('.png') ? 'image/png'
    : image.toLowerCase().endsWith('.gif') ? 'image/gif'
    : image.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const ogTitle = escapeHtml(title);
  const ogDescription = escapeHtml(description);
  const ogUrl = `${SITE_URL}${escapeHtml(urlPath)}`;
  return `
  <title data-rh="true">${ogTitle}</title>
  <meta data-rh="true" name="description" content="${ogDescription}" />
  <meta data-rh="true" property="og:title" content="${ogTitle}" />
  <meta data-rh="true" property="og:description" content="${ogDescription}" />
  <meta data-rh="true" property="og:image" content="${image}" />
  <meta data-rh="true" property="og:image:type" content="${ogImageType}" />
  <meta data-rh="true" property="og:type" content="${type}" />
  <meta data-rh="true" property="og:url" content="${ogUrl}" />
  <meta data-rh="true" property="fb:app_id" content="${FB_APP_ID}" />
  <meta data-rh="true" name="twitter:card" content="summary_large_image" />
  <meta data-rh="true" name="twitter:title" content="${ogTitle}" />
  <meta data-rh="true" name="twitter:description" content="${ogDescription}" />
  <meta data-rh="true" name="twitter:image" content="${image}" />${noindex ? '\n  <meta data-rh="true" name="robots" content="noindex" />' : ''}`;
}

// Strip the template's default title/OG/description tags and inject this
// page's head (and, when present, the initial-data script) before </head>.
function applyHead(html, headTags, initialDataJson) {
  if (!headTags) return html;
  let out = html.replace(/<title>[^<]*<\/title>/, '');
  out = out.replace(/<meta\s+(?:property="(?:og|fb):[^"]*"|name="twitter:[^"]*"|name="description")[^>]*\/?\s*>\s*/g, '');
  const dataScript = initialDataJson ? `\n  <script>window.__INITIAL_DATA__=${initialDataJson}</script>` : '';
  return out.replace('</head>', headTags + dataScript + '\n</head>');
}

export function applyTemplate({ headTags, appHtml, initialDataJson }) {
  if (!state.template.includes(OUTLET)) {
    throw new Error('ssr-outlet marker missing from dist/index.html');
  }
  const withHead = applyHead(state.template, headTags, initialDataJson);
  return withHead.replace(OUTLET, appHtml);
}

function cacheGet(key) {
  const hit = state.cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) { state.cache.delete(key); return null; }
  return hit.html;
}

function cacheSet(key, html) {
  if (state.cache.size >= CACHE_MAX_ENTRIES) {
    state.cache.delete(state.cache.keys().next().value);
  }
  state.cache.set(key, { html, expires: Date.now() + CACHE_TTL_MS });
}

// The SPA shell (today's behavior). `kind` distinguishes intentional shells
// (dashboard) from SSR failures in the X-SSR header. Guaranteed non-throwing.
export function renderShell(req, res, { status = 200, head = null, kind = 'shell' } = {}) {
  res.set('Cache-Control', 'no-cache');
  res.set('X-SSR', kind);
  let html = state.shellHtml;
  if (!html) {
    // dist/index.html never loaded — the site has no assets either; say so
    // without crashing.
    return res.status(503).type('html').send('<!doctype html><title>Starting up</title><p>The site is temporarily unavailable.</p>');
  }
  if (head) {
    try { html = applyHead(html, buildHeadTags(head)); } catch { html = state.shellHtml; }
  }
  res.status(status).type('html').send(html);
}

export async function renderPage(req, res, { status = 200, head, loader } = {}) {
  if (!state.ready) return renderShell(req, res, { status, head, kind: 'fallback' });
  try {
    const cacheable = CACHE_TTL_MS > 0 && status === 200 && Object.keys(req.query).length === 0;
    if (cacheable) {
      const cached = cacheGet(req.path);
      if (cached) {
        res.set('Cache-Control', 'no-cache');
        res.set('X-SSR', 'cache');
        return res.status(status).type('html').send(cached);
      }
    }
    const initialData = loader ? await loader(req) : {};
    const json = serializeForScript(initialData);
    // Render from the JSON round-trip so the server render sees exactly what
    // the hydrating client will (no pg Date objects vs ISO strings).
    const { html: appHtml } = state.entry.render(req.originalUrl, JSON.parse(json));
    const page = applyTemplate({
      headTags: head ? buildHeadTags(head) : null,
      appHtml,
      initialDataJson: Object.keys(initialData).length ? json : null,
    });
    if (cacheable) cacheSet(req.path, page);
    res.set('Cache-Control', 'no-cache');
    res.set('X-SSR', 'hit');
    res.status(status).type('html').send(page);
  } catch (err) {
    console.error(`[SSR] render failed for ${req.path}:`, err);
    if (!res.headersSent) renderShell(req, res, { status, head, kind: 'fallback' });
  }
}

// Express 4 does not catch async rejections (an unhandled one kills the
// process on modern Node), so every SSR route goes through this wrapper.
export function ssrHandler(opts) {
  return (req, res) => {
    renderPage(req, res, opts).catch(err => {
      console.error(`[SSR] handler failed for ${req.path}:`, err);
      if (!res.headersSent) renderShell(req, res, { status: opts?.status || 200, kind: 'fallback' });
    });
  };
}

const NOT_FOUND_HEAD = {
  title: 'Page Not Found - Open Door Christian Church',
  description: "We couldn't find that page. Visit Open Door Christian Church in DeLand, Florida for service times, events, and more.",
  noindex: true,
};

// 404s are the one path where attackers control the cache key space, so the
// body is rendered once per boot with a sentinel path and reused; only the
// head and the displayed path vary per request (string ops).
export function renderNotFound(req, res) {
  try {
    if (!state.ready || !state.notFoundBody) {
      return renderShell(req, res, { status: 404, head: { ...NOT_FOUND_HEAD, urlPath: req.path }, kind: state.ready ? 'hit' : 'fallback' });
    }
    const appHtml = state.notFoundBody.replaceAll(NOT_FOUND_SENTINEL, escapeHtml(req.path));
    const page = applyTemplate({
      headTags: buildHeadTags({ ...NOT_FOUND_HEAD, urlPath: req.path }),
      appHtml,
      initialDataJson: null,
    });
    res.set('Cache-Control', 'no-cache');
    res.set('X-SSR', 'hit');
    res.status(404).type('html').send(page);
  } catch (err) {
    console.error(`[SSR] 404 render failed for ${req.path}:`, err);
    if (!res.headersSent) renderShell(req, res, { status: 404, kind: 'fallback' });
  }
}

// Called from start() before listen. Never throws: every failure logs and
// leaves ready=false, so all routes serve the shell (pre-SSR behavior).
// Tests inject `entry` (the vitest-transformed src/entry-server.jsx module)
// instead of loading the built bundle from disk.
export async function initSsr({ distDir, entryPath, entry } = {}) {
  const dist = distDir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  try {
    state.template = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8');
    state.shellHtml = state.template.replace(OUTLET, '');
  } catch (err) {
    console.error('[SSR] disabled: could not read dist/index.html:', err.message);
    return state;
  }
  if (!state.template.includes(OUTLET)) {
    console.error('[SSR] disabled: dist/index.html has no <!--ssr-outlet--> marker (stale build?)');
    return state;
  }
  if (entry) {
    state.entry = entry;
  } else {
    const entryFile = entryPath || path.join(dist, '..', 'dist-ssr', 'entry-server.js');
    try {
      state.entry = await import(pathToFileURL(path.resolve(entryFile)).href);
    } catch (err) {
      console.error('[SSR] disabled: could not load SSR bundle:', err.message);
      return state;
    }
  }
  // Partial deploys (dist/ without dist-ssr/, or a skipped restart) would
  // silently hydration-mismatch every page; refuse to SSR instead.
  const templateBuildId = state.template.match(/<meta name="build-id" content="([^"]*)"/)?.[1];
  const entryBuildId = state.entry.BUILD_ID;
  if (!templateBuildId || templateBuildId !== entryBuildId) {
    console.error(`[SSR] disabled: build-id mismatch (client "${templateBuildId}" vs server "${entryBuildId}") — rsync both dist/ and dist-ssr/, then restart`);
    return state;
  }
  try {
    state.notFoundBody = state.entry.render(NOT_FOUND_SENTINEL, {}).html;
  } catch (err) {
    console.error('[SSR] disabled: test render failed:', err.message);
    return state;
  }
  state.ready = true;
  console.log(`[SSR] ready (build ${entryBuildId}, cache TTL ${CACHE_TTL_MS}ms)`);
  return state;
}
