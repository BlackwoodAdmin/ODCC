/**
 * Client-side routes the React app can render. Mirrors the <Route path="…">
 * list in src/App.jsx; tests/unit/spa-routes.test.js fails if the two drift.
 *
 * The server uses this to answer unknown URLs with a real 404 status while
 * still serving the app shell, so browsers, crawlers, and link checkers see
 * "Not Found" and React renders the friendly Not Found page.
 */
export const SPA_ROUTE_PATTERNS = [
  '/',
  '/about',
  '/our-pastor',
  '/services',
  '/events',
  '/blog',
  '/blog/:id',
  '/give',
  '/contact',
  '/chili-cookoff',
  '/joy-ladies-circle',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/unsubscribe',
  '/dashboard',
  '/dashboard/posts',
  '/dashboard/events',
  '/dashboard/bulletin',
  '/dashboard/bulletin/:weekStart',
  '/dashboard/users',
  '/dashboard/comments',
  '/dashboard/messages',
  '/dashboard/chili-cookoff',
  '/dashboard/newsletter',
  '/dashboard/email',
  '/dashboard/email/:accountId',
  '/dashboard/profile',
  '/dashboard/directory',
  '/dashboard/donations',
  '/dashboard/admin/donations',
  '/dashboard/admin/email',
  '/dashboard/admin/email/monitoring',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MATCHERS = SPA_ROUTE_PATTERNS.map((pattern) => {
  const body = pattern
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeRegex(seg)))
    .join('/');
  return new RegExp(`^${body}/?$`);
});

/** True when the pathname (no query string) is a route the SPA renders. */
export function isKnownSpaPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return false;
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch { /* keep raw */ }
  return MATCHERS.some((re) => re.test(decoded));
}

/**
 * Requests for things that look like files (bundles, images, fonts, feeds)
 * that no static handler served. These must never get the app shell.
 */
export const ASSET_PATH_RE = /^\/(assets|uploads)\/|\.(js|mjs|css|map|png|jpe?g|gif|webp|svg|ico|txt|xml|json|woff2?|ttf|otf|pdf|html?)$/i;
