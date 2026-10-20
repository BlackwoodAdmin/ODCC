import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './db.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import eventRoutes from './routes/events.js';
import commentRoutes from './routes/comments.js';
import contactRoutes from './routes/contact.js';
import chiliCookoffRoutes from './routes/chili-cookoff.js';
import sitemapRoutes from './routes/sitemap.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import newsletterRoutes, { checkStuckCampaigns } from './routes/newsletter.js';
import uploadsRoutes from './routes/uploads.js';
import aiRoutes from './routes/ai.js';
import emailInboundRoutes from './routes/email-inbound.js';
import emailEventsRoutes from './routes/email-events.js';
import emailAccountRoutes from './routes/email-accounts.js';
import emailMessageRoutes from './routes/email-messages.js';
import emailFolderRoutes from './routes/email-folders.js';
import emailContactRoutes from './routes/email-contacts.js';
import emailAutoReplyRoutes from './routes/email-auto-reply.js';
import emailAttachmentRoutes from './routes/email-attachments.js';
import emailAuditRoutes from './routes/email-audit.js';
import emailAdminLogRoutes from './routes/email-admin-logs.js';
import { initEmailCrons } from './cron/email-cron.js';
import donationRoutes from './routes/donations.js';
import directoryRoutes from './routes/directory.js';
import bulletinNoteRoutes from './routes/bulletin-notes.js';
import { initDonationCrons } from './cron/donation-cleanup.js';
import { requireOriginCheck } from './middleware/origin-check.js';
import { initSsr } from './ssr.js';
import { registerSsrRoutes } from './ssr-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'https://opendoorchristian.church' }));
app.use(express.json({
  limit: '26mb',
  verify: (req, _res, buf) => {
    // Capture raw body for SendGrid ECDSA webhook signature verification
    if (req.url.startsWith('/api/email/events/')) {
      req.rawBody = buf.toString('utf-8');
    }
    // Capture raw body for Stripe webhook signature verification
    if (req.url === '/api/donations/webhook') {
      req.rawBody = buf.toString('utf-8');
    }
  },
}));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads'), {
  maxAge: '1d',
}));

// Ensure data directories exist
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
for (const sub of ['attachments', 'tmp']) {
  const dir = path.join(dataDir, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Log all AI requests for debugging
app.use('/api/ai', (req, res, next) => {
  const start = Date.now();
  console.log(`[AI:REQ] ${req.method} ${req.originalUrl} from ${req.ip}`);
  const origJson = res.json.bind(res);
  res.json = (body) => {
    console.log(`[AI:RES] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    return origJson(body);
  };
  res.on('finish', () => {
    if (!res.headersSent || res.statusCode >= 400) {
      console.log(`[AI:FIN] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// Cache-Control: never cache API responses
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Existing routes (origin check on public mutation routers for CSRF protection)
app.use('/api/auth', requireOriginCheck, authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/bulletin-notes', bulletinNoteRoutes);
app.use('/api/contact', requireOriginCheck, contactRoutes);
app.use('/api/chili-cookoff', requireOriginCheck, chiliCookoffRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/ai', aiRoutes);

// Email routes
app.use('/api/email', emailInboundRoutes);
app.use('/api/email', emailEventsRoutes);
app.use('/api/email', emailAccountRoutes);
app.use('/api/email', emailMessageRoutes);
app.use('/api/email', emailFolderRoutes);
app.use('/api/email', emailContactRoutes);
app.use('/api/email', emailAutoReplyRoutes);
app.use('/api/email', emailAttachmentRoutes);
app.use('/api/email', emailAuditRoutes);
app.use('/api/email', emailAdminLogRoutes);

// Donation routes (origin check on public create-payment-intent; webhook excluded — has Stripe sig)
app.use('/api/donations', requireOriginCheck, donationRoutes);

// Anything under /api that no router handled: JSON 404, never the SPA shell.
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// /sitemap.xml (dynamic: public pages + published posts). robots.txt is a
// static file in public/. Both must sit ahead of the file-404 handler below.
app.use(sitemapRoutes);

// Serve public/ for AI-generated images and other static assets.
// index:false everywhere: a stray index.html must never shadow the SSR routes.
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1d', index: false }));
const distPath = path.join(__dirname, '..', 'dist');

// Hashed Vite assets (js/css) — immutable, cache forever
app.use('/assets', express.static(path.join(distPath, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

// Other dist files — always revalidate. index:false so GET / reaches the SSR
// route below instead of being answered with the raw template.
app.use(express.static(distPath, {
  maxAge: 0,
  index: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-cache');
  },
}));

// Server-side rendered public pages + /blog/:slug + file-404 guard +
// catch-all. Shared with the integration tests — see server/ssr-routes.js.
registerSsrRoutes(app);

async function start() {
  await initializeDatabase();
  await initSsr({ distDir: distPath });
  initEmailCrons();
  initDonationCrons();
  checkStuckCampaigns();
  if (process.env.NODE_ENV === 'production' && !process.env.TURNSTILE_SECRET_KEY) {
    console.error('CRITICAL: TURNSTILE_SECRET_KEY not set — all public forms will reject requests');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
    console.warn('WARNING: STRIPE_SECRET_KEY not set — donation endpoints will return 503');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('WARNING: STRIPE_WEBHOOK_SECRET not set — webhook verification will fail');
  }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start().catch(err => { console.error('Start failed:', err.message); });