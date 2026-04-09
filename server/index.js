import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase, query } from './db.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import eventRoutes from './routes/events.js';
import commentRoutes from './routes/comments.js';
import contactRoutes from './routes/contact.js';
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
import { initDonationCrons } from './cron/donation-cleanup.js';
import { requireOriginCheck } from './middleware/origin-check.js';

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
app.use('/api/contact', requireOriginCheck, contactRoutes);
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

// Serve public/ for AI-generated images and other static assets
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1d' }));
const distPath = path.join(__dirname, '..', 'dist');

// Hashed Vite assets (js/css) — immutable, cache forever
app.use('/assets', express.static(path.join(distPath, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

// Other dist files (index.html, etc.) — always revalidate
app.use(express.static(distPath, {
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-cache');
  },
}));

// Read index.html template once at startup for blog OGP injection
const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');

// Blog post route with OGP meta tags — injects OG tags into the real index.html
app.get('/blog/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await query(
      'SELECT title, excerpt, featured_image FROM posts WHERE slug = $1 AND status = $2',
      [slug, 'published']
    );

    res.set('Cache-Control', 'no-cache');

    if (result.rows.length === 0) {
      return res.type('html').send(indexHtml);
    }

    const post = result.rows[0];
    const siteUrl = 'https://opendoorchristian.church';
    const postUrl = `${siteUrl}/blog/${slug}`;

    let ogImage = `${siteUrl}/uploads/church-header.jpg`;
    let ogImageType = 'image/jpeg';
    if (post.featured_image) {
      ogImage = post.featured_image.startsWith('http')
        ? post.featured_image
        : `${siteUrl}${post.featured_image}`;
      const ext = post.featured_image.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') ogImageType = 'image/jpeg';
      else if (ext === 'png') ogImageType = 'image/png';
      else if (ext === 'gif') ogImageType = 'image/gif';
    }

    const ogTitle = escapeHtml(post.title || 'Blog Post');
    const ogDescription = escapeHtml(post.excerpt || 'Read this post');

    const ogTags = `
  <title>${ogTitle} - Open Door Christian Church</title>
  <meta name="description" content="${ogDescription}" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:type" content="${ogImageType}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${postUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDescription}" />
  <meta name="twitter:image" content="${ogImage}" />`;

    // Strip existing title, OG, and Twitter meta tags, then inject post-specific ones
    let html = indexHtml.replace(/<title>[^<]*<\/title>/, '');
    html = html.replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="description")[^>]*\/?\s*>\s*/g, '');
    html = html.replace('</head>', ogTags + '\n</head>');

    res.type('html').send(html);
  } catch (error) {
    console.error('Blog post SSR error:', error);
    res.type('html').send(indexHtml);
  }
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(distPath, 'index.html'));
});

// Helper function to escape HTML special characters
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function start() {
  await initializeDatabase();
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