import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { emailLog } from '../utils/email-log.js';

const router = Router();

/** Verify the requesting user owns the email account (or is admin). Returns account row or null. */
async function verifyAccountAccess(req, res) {
  const accountId = req.params.id;

  const accountQuery = req.user.role === 'admin'
    ? 'SELECT id, auto_reply_allowed FROM email_accounts WHERE id = $1'
    : 'SELECT id, auto_reply_allowed FROM email_accounts WHERE id = $1 AND user_id = $2';

  const params = req.user.role === 'admin' ? [accountId] : [accountId, req.user.id];
  const result = await query(accountQuery, params);

  if (!result.rows.length) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return result.rows[0];
}

// GET /accounts/:id/auto-reply — get config
router.get('/accounts/:id/auto-reply', authenticateToken, async (req, res) => {
  try {
    const account = await verifyAccountAccess(req, res);
    if (!account) return;

    const result = await query(
      `SELECT id, is_enabled, subject, body_html, start_date, end_date,
              reply_once_per_sender, created_at, updated_at
       FROM email_auto_replies
       WHERE account_id = $1`,
      [account.id]
    );

    res.json({
      auto_reply_allowed: account.auto_reply_allowed,
      config: result.rows[0] || null,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch auto-reply config' });
  }
});

// PUT /accounts/:id/auto-reply — update config
router.put('/accounts/:id/auto-reply', authenticateToken, async (req, res) => {
  try {
    const account = await verifyAccountAccess(req, res);
    if (!account) return;

    if (!account.auto_reply_allowed) {
      return res.status(403).json({ error: 'Auto-reply is not allowed for this account' });
    }

    const { is_enabled, subject, body_html, start_date, end_date, reply_once_per_sender } = req.body;

    if (body_html === undefined || body_html === null || !body_html.trim()) {
      return res.status(400).json({ error: 'Auto-reply body is required' });
    }

    const now = Date.now();
    const result = await query(
      `INSERT INTO email_auto_replies (account_id, is_enabled, subject, body_html, start_date, end_date, reply_once_per_sender, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (account_id)
       DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         subject = EXCLUDED.subject,
         body_html = EXCLUDED.body_html,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         reply_once_per_sender = EXCLUDED.reply_once_per_sender,
         updated_at = EXCLUDED.updated_at
       RETURNING id, is_enabled, subject, body_html, start_date, end_date, reply_once_per_sender, created_at, updated_at`,
      [
        account.id,
        is_enabled ?? false,
        subject || 'Out of Office',
        body_html.trim(),
        start_date || null,
        end_date || null,
        reply_once_per_sender ?? true,
        now,
      ]
    );

    await emailLog('info', 'auto_reply', `Auto-reply config updated for account ${account.id}`, {
      account_id: account.id,
      is_enabled: is_enabled ?? false,
      user_id: req.user.id,
    });

    res.json({ config: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to update auto-reply config' });
  }
});

export default router;
