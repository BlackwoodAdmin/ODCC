// Registers every SSR-rendered route plus the catch-all. Shared between
// server/index.js and the integration tests, so tests exercise the real
// route logic. Order matters: static-page table, then /blog/:slug, then the
// file-404 guard, then the catch-all.
import { ssrHandler, renderPage, renderShell, renderNotFound, SITE_URL } from './ssr.js';
import { SSR_PAGES, DEFAULT_HEAD } from './ssr-pages.js';
import { getPostBySlug, getApprovedComments } from './lib/page-data.js';
import { isKnownSpaPath, ASSET_PATH_RE } from './spa-routes.js';

export function registerSsrRoutes(app) {
  // Server-side rendered public pages (head tags + full body + preloaded
  // data). Until initSsr succeeds — or on any failure — these serve the SPA
  // shell, which is the pre-SSR behavior. See server/ssr.js.
  for (const page of SSR_PAGES) {
    app.get(page.path, ssrHandler({ head: page.head, loader: page.loader }));
  }

  // Jr Chili Cook-Off (Fall Festival 2026) is retired, but the URL was on
  // printed flyers and shared posts — keep it alive as a redirect.
  app.get('/chili-cookoff', (_req, res) => res.redirect(301, '/events'));

  // Blog posts: per-post head (OG tags for social sharing previews) + SSR
  // body with the post and its approved comments preloaded.
  app.get('/blog/:slug', (req, res) => {
    (async () => {
      const { slug } = req.params;
      const post = await getPostBySlug(slug, { publishedOnly: true });
      if (!post) return renderNotFound(req, res);

      let ogImage = `${SITE_URL}/uploads/church-header.webp`;
      if (post.featured_image) {
        ogImage = post.featured_image.startsWith('http')
          ? post.featured_image
          : `${SITE_URL}${post.featured_image}`;
      }

      return renderPage(req, res, {
        head: {
          title: `${post.title || 'Blog Post'} - Open Door Christian Church`,
          description: post.excerpt || 'Read this post',
          image: ogImage,
          type: 'article',
          urlPath: `/blog/${slug}`,
        },
        loader: async () => ({
          [`/posts/${slug}`]: { post },
          [`/comments/post/${slug}`]: { comments: (await getApprovedComments(slug)) || [] },
        }),
      });
    })().catch(err => {
      console.error(`[SSR] /blog/${req.params.slug} failed:`, err);
      if (!res.headersSent) renderShell(req, res, { status: 200, kind: 'fallback' });
    });
  });

  // File-looking requests that no static handler served (missing bundle,
  // image, font, robots.txt …): plain 404. Serving the app shell here would
  // hand browsers HTML where they expect a script or image.
  app.get(ASSET_PATH_RE, (_req, res) => {
    res.status(404).type('text').send('Not found');
  });

  // Catch-all. Dashboard routes get the plain shell by design (auth lives in
  // localStorage, so the server can't render them). Other known client routes
  // (login, register, password reset, unsubscribe) are SSR'd with the default
  // head + noindex, matching robots.txt. Anything else is a real 404: SSR'd
  // Not Found page with a 404 status.
  app.get('*', (req, res) => {
    if (req.path.startsWith('/dashboard')) {
      return renderShell(req, res, { status: 200 });
    }
    if (isKnownSpaPath(req.path)) {
      return renderPage(req, res, { head: { ...DEFAULT_HEAD, urlPath: req.path, noindex: true } })
        .catch(err => {
          console.error(`[SSR] catch-all failed for ${req.path}:`, err);
          if (!res.headersSent) renderShell(req, res, { status: 200, kind: 'fallback' });
        });
    }
    renderNotFound(req, res);
  });
}
