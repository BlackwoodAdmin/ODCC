import express from 'express';
import cors from 'cors';
import { requireOriginCheck } from '../../server/middleware/origin-check.js';

// Lightweight Express app for integration tests. Mirrors middleware from
// server/index.js that affects request handling, but skips static files,
// dist/index.html reading, and the `/blog/:slug` SSR route.
export function buildTestApp({ routes = {} } = {}) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
  app.use(express.json({
    limit: '26mb',
    verify: (req, _res, buf) => {
      if (req.url.startsWith('/api/email/events/')) {
        req.rawBody = buf.toString('utf-8');
      }
      if (req.url === '/api/donations/webhook') {
        req.rawBody = buf.toString('utf-8');
      }
    },
  }));

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Routes to mount. Each entry is { path, router, originCheck? }
  for (const [path, { router, originCheck }] of Object.entries(routes)) {
    if (originCheck) app.use(path, requireOriginCheck, router);
    else app.use(path, router);
  }

  return app;
}
