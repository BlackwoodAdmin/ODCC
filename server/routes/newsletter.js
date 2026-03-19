import { Router } from 'express';
import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { query } from '../db.js';
import { sendWelcomeEmail, sendNewsletter, generateUnsubscribeUrl } from '../email.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { requireTurnstile } from '../middleware/turnstile.js';
import { requireOriginCheck } from '../middleware/origin-check.js';
import { SANITIZE_OPTIONS } from '../data/sanitize-config.js';
import { wrapEmailHtml } from '../data/email-template-wrapper.js';

const router = Router();

const UNSUBSCRIBE_SECRET = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;
const SITE_URL = process.env.SITE_URL || 'https://opendoorchristian.church';

function generateUnsubscribeToken(email) {
  return crypto.createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update('newsletter-unsubscribe:' + email.toLowerCase())
    .digest('hex');
}

/** Rewrite relative image URLs to absolute for email clients */
function absolutifyImageUrls(html) {
  return html.replace(/src\s*=\s*(["'])\/uploads\//g, `src=$1${SITE_URL}/uploads/`);
}

function sanitizeBody(html) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function htmlToPlainText(html) {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n\n');
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)');
  text = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

// Subscribe (existing, updated with re-subscribe support)
router.post('/', requireOriginCheck, requireTurnstile, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const existing = await query('SELECT id, role, newsletter_opted_out FROM users WHERE email=$1', [email]);
    if (existing.rows.length) {
      const user = existing.rows[0];
      if (user.newsletter_opted_out) {
        await query('UPDATE users SET newsletter_opted_out = FALSE, updated_at = $1 WHERE id = $2', [Date.now(), user.id]);
        return res.json({ success: true, message: "Welcome back! You've been re-subscribed to our newsletter." });
      }
      return res.json({ success: true, message: 'You are already subscribed!' });
    }

    const now = Date.now();
    await query(
      'INSERT INTO users (email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [email, null, email.split('@')[0], 'subscriber', now, now]
    );

    sendWelcomeEmail(email, email.split('@')[0]).catch(err => {
      console.error('[Newsletter] Failed to send welcome email:', err);
    });

    res.status(201).json({ success: true, message: 'Successfully subscribed!' });
  } catch {
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe GET
router.get('/unsubscribe', async (req, res) => {
  try {
    const { email, token } = req.query;
    if (!email || !token || email.length > 254) {
      return res.redirect('/unsubscribe?error=true');
    }

    const expected = generateUnsubscribeToken(email);
    try {
      const tokenBuf = Buffer.from(token, 'hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        return res.redirect('/unsubscribe?error=true');
      }
    } catch {
      return res.redirect('/unsubscribe?error=true');
    }

    await query('UPDATE users SET newsletter_opted_out = TRUE, updated_at = $1 WHERE LOWER(email) = $2', [Date.now(), email.toLowerCase()]);
    res.redirect('/unsubscribe?success=true');
  } catch {
    res.redirect('/unsubscribe?error=true');
  }
});

// Unsubscribe POST (RFC 8058 one-click)
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token || email.length > 254) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const expected = generateUnsubscribeToken(email);
    try {
      const tokenBuf = Buffer.from(token, 'hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        return res.status(400).json({ error: 'Invalid request' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid request' });
    }

    await query('UPDATE users SET newsletter_opted_out = TRUE, updated_at = $1 WHERE LOWER(email) = $2', [Date.now(), email.toLowerCase()]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

// Get email template wrapper for client-side preview
router.get('/template', authenticateToken, requireRole('admin'), (req, res) => {
  res.setHeader('Cache-Control', 'max-age=300');
  res.json({ template: wrapEmailHtml('{{CONTENT}}') });
});

// Get fully rendered preview of a campaign
router.get('/campaigns/:id/preview', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM newsletters WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Campaign not found' });
    const html = wrapEmailHtml(absolutifyImageUrls(result.rows[0].body_html));
    res.json({ html });
  } catch {
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// List campaigns
router.get('/campaigns', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM newsletters ORDER BY updated_at DESC');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get single campaign
router.get('/campaigns/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM newsletters WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Campaign not found' });

    const subscriberCount = await query(
      "SELECT COUNT(*) FROM users WHERE role IN ('subscriber','contributor','admin') AND newsletter_opted_out = FALSE"
    );
    res.json({ ...result.rows[0], subscriber_count: parseInt(subscriberCount.rows[0].count) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Create campaign
router.post('/campaigns', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { subject, body_html } = req.body;
    if (!subject || !body_html) return res.status(400).json({ error: 'Subject and body are required' });
    if (body_html.length > 500 * 1024) return res.status(400).json({ error: 'Body too large (max 500KB)' });

    const sanitized = sanitizeBody(body_html);
    const bodyText = htmlToPlainText(sanitized);
    const now = Date.now();

    const result = await query(
      'INSERT INTO newsletters (subject, body_html, body_text, author_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [subject, sanitized, bodyText, req.user.id, now, now]
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign (draft only)
router.put('/campaigns/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, body_html } = req.body;
    if (!subject || !body_html) return res.status(400).json({ error: 'Subject and body are required' });
    if (body_html.length > 500 * 1024) return res.status(400).json({ error: 'Body too large (max 500KB)' });

    const sanitized = sanitizeBody(body_html);
    const bodyText = htmlToPlainText(sanitized);
    const result = await query(
      "UPDATE newsletters SET subject = $1, body_html = $2, body_text = $3, updated_at = $4 WHERE id = $5 AND status = 'draft' RETURNING *",
      [subject, sanitized, bodyText, Date.now(), id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Campaign not found or not editable' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign (draft or failed only)
router.delete('/campaigns/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      "DELETE FROM newsletters WHERE id = $1 AND status IN ('draft', 'failed') RETURNING id",
      [id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Campaign not found or cannot be deleted (sent campaigns are preserved)' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Send campaign
router.post('/campaigns/:id/send', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    if (!process.env.SITE_URL) {
      return res.status(400).json({ error: 'Cannot send newsletter: SITE_URL environment variable is not configured. Newsletter images require absolute URLs.' });
    }

    const { id } = req.params;

    // Atomic status guard — accepts draft, sending (stuck retry), and failed (retry)
    const guard = await query(
      "UPDATE newsletters SET status = 'sending', updated_at = $1 WHERE id = $2 AND status IN ('draft', 'sending', 'failed') RETURNING *",
      [Date.now(), id]
    );
    if (!guard.rows.length) return res.status(400).json({ error: 'Campaign not found or already sent' });

    const campaign = guard.rows[0];

    // Get active subscribers
    const subscribers = await query(
      "SELECT id, email, name FROM users WHERE role IN ('subscriber','contributor','admin') AND newsletter_opted_out = FALSE"
    );
    if (!subscribers.rows.length) {
      await query("UPDATE newsletters SET status = 'draft', updated_at = $1 WHERE id = $2", [Date.now(), id]);
      return res.status(400).json({ error: 'No active subscribers' });
    }

    // Insert newsletter_sends rows (skip existing for retry)
    for (const sub of subscribers.rows) {
      await query(
        "INSERT INTO newsletter_sends (newsletter_id, user_id, status) VALUES ($1, $2, 'pending') ON CONFLICT (newsletter_id, user_id) DO NOTHING",
        [id, sub.id]
      );
    }

    // Respond immediately with 202
    res.status(202).json({ success: true, message: 'Newsletter send started', recipient_count: subscribers.rows.length });

    // Background send with error boundary
    (async () => {
      try {
        // Get pending/failed sends
        const pending = await query(
          `SELECT ns.id, ns.user_id, u.email, u.name
           FROM newsletter_sends ns JOIN users u ON u.id = ns.user_id
           WHERE ns.newsletter_id = $1 AND ns.status IN ('pending', 'failed')`,
          [id]
        );

        const BATCH_SIZE = 1000;
        let totalSent = 0;
        let totalFailed = 0;

        for (let i = 0; i < pending.rows.length; i += BATCH_SIZE) {
          const batch = pending.rows.slice(i, i + BATCH_SIZE);

          try {
            // Build personalizations with per-recipient unsubscribe URLs
            const personalizations = batch.map(recipient => {
              const unsubUrl = generateUnsubscribeUrl(recipient.email);
              return {
                to: [{ email: recipient.email, name: recipient.name || undefined }],
                headers: {
                  'List-Unsubscribe': `<${unsubUrl}>`,
                  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
                substitutions: {
                  '{{unsubscribe_url}}': unsubUrl,
                },
              };
            });

            const success = await sendNewsletter(
              personalizations,
              campaign.subject,
              absolutifyImageUrls(campaign.body_html),
              campaign.body_text
            );

            const now = Date.now();
            const sendIds = batch.map(r => r.id);

            if (success) {
              await query(
                `UPDATE newsletter_sends SET status = 'sent', sent_at = $1 WHERE id = ANY($2)`,
                [now, sendIds]
              );
              totalSent += batch.length;
            } else {
              await query(
                `UPDATE newsletter_sends SET status = 'failed', error = 'SendGrid API error' WHERE id = ANY($1)`,
                [sendIds]
              );
              totalFailed += batch.length;
            }

            // Update campaign counts incrementally
            await query(
              'UPDATE newsletters SET sent_count = $1, failed_count = $2, updated_at = $3 WHERE id = $4',
              [totalSent, totalFailed, now, id]
            );
          } catch (batchErr) {
            console.error(`[Newsletter] Batch error for campaign #${id}:`, batchErr);
            const sendIds = batch.map(r => r.id);
            await query(
              `UPDATE newsletter_sends SET status = 'failed', error = $1 WHERE id = ANY($2)`,
              [batchErr.message, sendIds]
            );
            totalFailed += batch.length;
            await query(
              'UPDATE newsletters SET sent_count = $1, failed_count = $2, updated_at = $3 WHERE id = $4',
              [totalSent, totalFailed, Date.now(), id]
            );
          }
        }

        // Final status
        const finalStatus = totalFailed === pending.rows.length ? 'failed' : 'sent';
        await query(
          'UPDATE newsletters SET status = $1, sent_at = $2, sent_count = $3, failed_count = $4, updated_at = $5 WHERE id = $6',
          [finalStatus, Date.now(), totalSent, totalFailed, Date.now(), id]
        );
        console.log(`[Newsletter] Campaign #${id} complete: ${totalSent} sent, ${totalFailed} failed`);
      } catch (err) {
        console.error(`[Newsletter] Fatal error sending campaign #${id}:`, err);
        await query(
          "UPDATE newsletters SET status = 'failed', updated_at = $1 WHERE id = $2",
          [Date.now(), id]
        ).catch(() => {});
      }
    })();
  } catch {
    res.status(500).json({ error: 'Failed to start send' });
  }
});

// Test send — sends to admin's own email (req.user.email)
router.post('/campaigns/:id/test', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await query('SELECT * FROM newsletters WHERE id = $1', [id]);
    if (!campaign.rows.length) return res.status(404).json({ error: 'Campaign not found' });

    const c = campaign.rows[0];
    const unsubUrl = generateUnsubscribeUrl(req.user.email);

    const success = await sendNewsletter(
      [{
        to: [{ email: req.user.email }],
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        substitutions: { '{{unsubscribe_url}}': unsubUrl },
      }],
      `[TEST] ${c.subject}`,
      absolutifyImageUrls(c.body_html),
      c.body_text
    );

    if (success) {
      res.json({ success: true, message: `Test email sent to ${req.user.email}` });
    } else {
      res.status(500).json({ error: 'Failed to send test email' });
    }
  } catch {
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Get subscriber count
router.get('/subscribers/count', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      "SELECT COUNT(*) FROM users WHERE role IN ('subscriber','contributor','admin') AND newsletter_opted_out = FALSE"
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch {
    res.status(500).json({ error: 'Failed to get subscriber count' });
  }
});

// Stuck campaign check (called on startup)
export async function checkStuckCampaigns() {
  try {
    const result = await query("SELECT id, subject FROM newsletters WHERE status = 'sending'");
    for (const campaign of result.rows) {
      console.warn(`[Newsletter] Campaign #${campaign.id} ("${campaign.subject}") stuck in 'sending' — may need manual retry`);
    }
  } catch (err) {
    console.error('[Newsletter] Failed to check stuck campaigns:', err);
  }
}

export default router;
