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
import bulletinNoteRoutes from './routes/bulletin-notes.js';
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
app.use('/api/bulletin-notes', bulletinNoteRoutes);
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
  <meta property="fb:app_id" content="949925117923722" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDescription}" />
  <meta name="twitter:image" content="${ogImage}" />`;

    // Strip existing title, OG, and Twitter meta tags, then inject post-specific ones
    let html = indexHtml.replace(/<title>[^<]*<\/title>/, '');
    html = html.replace(/<meta\s+(?:property="(?:og|fb):[^"]*"|name="twitter:[^"]*"|name="description")[^>]*\/?\s*>\s*/g, '');
    html = html.replace('</head>', ogTags + '\n</head>');

    res.type('html').send(html);
  } catch (error) {
    console.error('Blog post SSR error:', error);
    res.type('html').send(indexHtml);
  }
});

// Static-page OG tag injection. Without this, every public page below
// falls through to the SPA catch-all and gets the homepage's OG tags,
// so social shares show homepage imagery regardless of which page was
// shared. The /blog/:slug handler above stays separate because its
// values are dynamic (per-post).
const SITE_URL = 'https://opendoorchristian.church';
const DEFAULT_OG_IMAGE = `${SITE_URL}/uploads/church-header.jpg`;

function renderWithOg({ title, description, image = DEFAULT_OG_IMAGE, type = 'website', urlPath }) {
  const ogImageType = image.toLowerCase().endsWith('.png') ? 'image/png'
    : image.toLowerCase().endsWith('.gif') ? 'image/gif' : 'image/jpeg';
  const ogTitle = escapeHtml(title);
  const ogDescription = escapeHtml(description);
  const ogTags = `
  <title>${ogTitle}</title>
  <meta name="description" content="${ogDescription}" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:type" content="${ogImageType}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:url" content="${SITE_URL}${urlPath}" />
  <meta property="fb:app_id" content="949925117923722" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDescription}" />
  <meta name="twitter:image" content="${image}" />`;
  let html = indexHtml.replace(/<title>[^<]*<\/title>/, '');
  html = html.replace(/<meta\s+(?:property="(?:og|fb):[^"]*"|name="twitter:[^"]*"|name="description")[^>]*\/?\s*>\s*/g, '');
  return html.replace('</head>', ogTags + '\n</head>');
}

const STATIC_OG_PAGES = [
  {
    path: '/about',
    title: 'About Our Church - Open Door Christian Church',
    description: 'Founded in 1986, Open Door Christian Church serves DeLand, Florida with Scripture-based, Christ-centered worship — including our beloved drive-in service on 87.9 FM.',
  },
  {
    path: '/services',
    title: 'Service Times - Open Door Christian Church',
    description: 'Join us for worship at Open Door Christian Church in DeLand, Florida. Communion every Sunday and our unique drive-in service tradition.',
  },
  {
    path: '/events',
    title: 'Events - Open Door Christian Church',
    description: 'See upcoming worship services, community events, and fellowship opportunities at Open Door Christian Church in DeLand, Florida.',
  },
  {
    path: '/blog',
    title: 'Blog - Open Door Christian Church',
    description: 'Read the latest from Open Door Christian Church — sermons, devotionals, community news, and reflections on faith.',
  },
  {
    path: '/give',
    title: 'Give - Open Door Christian Church',
    description: 'Support the ministry of Open Door Christian Church through online giving. Your generosity helps us serve DeLand and beyond.',
  },
  {
    path: '/contact',
    title: 'Contact Us - Open Door Christian Church',
    description: 'Get in touch with Open Door Christian Church in DeLand, Florida. Submit a prayer request or send us a message.',
  },
  {
    path: '/joy-ladies-circle',
    title: 'J.O.Y. Ladies Circle - Open Door Christian Church',
    description: 'Jesus · Others · Yourself. All women are welcome at the J.O.Y. Ladies Circle of Open Door Christian Church in DeLand, Florida.',
  },
  {
    path: '/our-pastor',
    title: 'Meet Pastor Stephen Presley - Open Door Christian Church',
    description: 'Pastor Stephen Presley serves Open Door Christian Church in DeLand, Florida — a calling forty years in the making.',
    image: `${SITE_URL}/our-pastor.jpg`,
    type: 'profile',
  },
];

for (const page of STATIC_OG_PAGES) {
  app.get(page.path, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(renderWithOg({
      title: page.title,
      description: page.description,
      image: page.image,
      type: page.type,
      urlPath: page.path,
    }));
  });
}

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