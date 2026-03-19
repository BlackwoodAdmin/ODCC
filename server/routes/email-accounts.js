import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { emailLog } from '../utils/email-log.js';

const router = Router();

const SYSTEM_FOLDERS = [
  { name: 'Inbox', type: 'inbox', sort_order: 0 },
  { name: 'Sent', type: 'sent', sort_order: 1 },
  { name: 'Drafts', type: 'drafts', sort_order: 2 },
  { name: 'Trash', type: 'trash', sort_order: 3 },
  { name: 'Archive', type: 'archive', sort_order: 4 },
  { name: 'Spam', type: 'spam', sort_order: 5 },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── User's own accounts (any authenticated user) ─────────────────────────────

router.get('/my-accounts', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT ea.id, ea.address, ea.display_name, ea.forwarding_mode, ea.quota_mb, ea.used_mb,
              ea.is_active, ea.auto_reply_allowed, ea.daily_send_limit, ea.signature_html
       FROM email_accounts ea
       WHERE ea.user_id = $1 AND ea.is_active = TRUE
       ORDER BY ea.address`,
      [req.user.id]
    );
    res.json({ success: true, accounts: result.rows });
  } catch (err) {
    console.error('[Email] Failed to get user accounts:', err);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// ── Account Management (admin only) ──────────────────────────────────────────

// GET /accounts — list all accounts with user info
router.get('/accounts', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(`
      SELECT ea.*,
             u.name AS user_name, u.email AS user_email,
             (SELECT COUNT(*) FROM email_aliases WHERE account_id = ea.id) AS alias_count,
             (SELECT COUNT(*) FROM email_messages WHERE account_id = ea.id AND is_read = FALSE) AS unread_count
      FROM email_accounts ea
      LEFT JOIN users u ON ea.user_id = u.id
      ORDER BY ea.created_at DESC
    `);
    res.json({ accounts: result.rows });
  } catch (err) {
    await emailLog('error', 'admin', 'Failed to list email accounts', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch email accounts' });
  }
});

// POST /accounts — create account
router.post('/accounts', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      address,
      display_name,
      user_id,
      forwarding_address,
      forwarding_mode,
      signature_html,
      auto_reply_allowed,
      quota_mb,
      is_catch_all,
      is_active,
      daily_send_limit,
    } = req.body;

    // Validate address
    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Email address is required' });
    }
    const normalizedAddress = address.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedAddress)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    // Check uniqueness against email_accounts
    const existing = await query(
      'SELECT id FROM email_accounts WHERE LOWER(address) = $1',
      [normalizedAddress]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email address already exists' });
    }

    // Check uniqueness against email_aliases
    const existingAlias = await query(
      'SELECT id FROM email_aliases WHERE LOWER(alias_address) = $1',
      [normalizedAddress]
    );
    if (existingAlias.rows.length > 0) {
      return res.status(409).json({ error: 'Address is already in use as an alias' });
    }

    // If catch-all, verify no other catch-all exists
    if (is_catch_all) {
      const catchAll = await query(
        'SELECT id, address FROM email_accounts WHERE is_catch_all = TRUE'
      );
      if (catchAll.rows.length > 0) {
        return res.status(409).json({
          error: `A catch-all account already exists: ${catchAll.rows[0].address}`,
        });
      }
    }

    // Validate user_id if provided
    if (user_id != null) {
      const userCheck = await query('SELECT id FROM users WHERE id = $1', [user_id]);
      if (userCheck.rows.length === 0) {
        return res.status(400).json({ error: 'User not found' });
      }
    }

    const now = Date.now();

    const result = await query(
      `INSERT INTO email_accounts
        (address, display_name, user_id, forwarding_address, forwarding_mode,
         signature_html, auto_reply_allowed, quota_mb, is_catch_all, is_active,
         daily_send_limit, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        normalizedAddress,
        display_name || null,
        user_id || null,
        forwarding_address || null,
        forwarding_mode || 'none',
        signature_html || null,
        auto_reply_allowed ?? false,
        quota_mb ?? 500,
        is_catch_all ?? false,
        is_active ?? true,
        daily_send_limit ?? 100,
        now,
        now,
      ]
    );

    const account = result.rows[0];

    // Create system folders
    for (const folder of SYSTEM_FOLDERS) {
      await query(
        'INSERT INTO email_folders (account_id, name, type, sort_order, created_at) VALUES ($1,$2,$3,$4,$5)',
        [account.id, folder.name, folder.type, folder.sort_order, now]
      );
    }

    await emailLog('info', 'admin', `Email account created: ${normalizedAddress}`, {
      account_id: account.id,
      admin_user_id: req.user.id,
    });

    res.status(201).json({ account });
  } catch (err) {
    await emailLog('error', 'admin', 'Failed to create email account', { error: err.message });
    res.status(500).json({ error: 'Failed to create email account' });
  }
});

// PUT /accounts/:id — update account
router.put('/accounts/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    if (isNaN(accountId)) return res.status(400).json({ error: 'Invalid account ID' });

    const {
      display_name,
      user_id,
      forwarding_address,
      forwarding_mode,
      signature_html,
      auto_reply_allowed,
      quota_mb,
      is_catch_all,
      is_active,
      daily_send_limit,
    } = req.body;

    // Check account exists
    const existing = await query('SELECT * FROM email_accounts WHERE id = $1', [accountId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const current = existing.rows[0];

    // If enabling catch-all, check no other account has it
    if (is_catch_all && !current.is_catch_all) {
      const catchAll = await query(
        'SELECT id, address FROM email_accounts WHERE is_catch_all = TRUE AND id != $1',
        [accountId]
      );
      if (catchAll.rows.length > 0) {
        return res.status(409).json({
          error: `A catch-all account already exists: ${catchAll.rows[0].address}`,
        });
      }
    }

    // Validate user_id if provided
    if (user_id != null) {
      const userCheck = await query('SELECT id FROM users WHERE id = $1', [user_id]);
      if (userCheck.rows.length === 0) {
        return res.status(400).json({ error: 'User not found' });
      }
    }

    const now = Date.now();

    const result = await query(
      `UPDATE email_accounts SET
        display_name = COALESCE($1, display_name),
        user_id = $2,
        forwarding_address = COALESCE($3, forwarding_address),
        forwarding_mode = COALESCE($4, forwarding_mode),
        signature_html = COALESCE($5, signature_html),
        auto_reply_allowed = COALESCE($6, auto_reply_allowed),
        quota_mb = COALESCE($7, quota_mb),
        is_catch_all = COALESCE($8, is_catch_all),
        is_active = COALESCE($9, is_active),
        daily_send_limit = COALESCE($10, daily_send_limit),
        updated_at = $11
       WHERE id = $12
       RETURNING *`,
      [
        display_name,
        user_id !== undefined ? (user_id || null) : current.user_id,
        forwarding_address,
        forwarding_mode,
        signature_html,
        auto_reply_allowed,
        quota_mb,
        is_catch_all,
        is_active,
        daily_send_limit,
        now,
        accountId,
      ]
    );

    await emailLog('info', 'admin', `Email account updated: ${result.rows[0].address}`, {
      account_id: accountId,
      admin_user_id: req.user.id,
    });

    res.json({ account: result.rows[0] });
  } catch (err) {
    await emailLog('error', 'admin', 'Failed to update email account', { error: err.message });
    res.status(500).json({ error: 'Failed to update email account' });
  }
});

// DELETE /accounts/:id — delete account + all related data
router.delete('/accounts/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    if (isNaN(accountId)) return res.status(400).json({ error: 'Invalid account ID' });

    // Check account exists and get address for logging
    const existing = await query('SELECT id, address FROM email_accounts WHERE id = $1', [accountId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const address = existing.rows[0].address;

    // Collect attachment storage paths before deleting (for disk cleanup)
    const attachments = await query(
      `SELECT ea.storage_path FROM email_attachments ea
       JOIN email_messages em ON ea.message_id = em.id
       WHERE em.account_id = $1`,
      [accountId]
    );
    const attachmentPaths = attachments.rows.map((r) => r.storage_path);

    // Delete in dependency order (cascades handle most, but be explicit for clarity)
    // email_attachments cascade from email_messages
    // email_messages, email_folders, email_aliases, email_contacts cascade from email_accounts
    // email_auto_replies, email_auto_reply_log cascade from email_accounts
    // But email_audit_log does NOT cascade (ON DELETE reference, not CASCADE) — delete manually
    await query('DELETE FROM email_audit_log WHERE account_id = $1', [accountId]);
    await query('DELETE FROM email_auto_reply_log WHERE account_id = $1', [accountId]);
    await query('DELETE FROM email_auto_replies WHERE account_id = $1', [accountId]);
    await query('DELETE FROM email_contacts WHERE account_id = $1', [accountId]);
    await query('DELETE FROM email_aliases WHERE account_id = $1', [accountId]);
    // Messages (and their attachments via cascade)
    await query('DELETE FROM email_messages WHERE account_id = $1', [accountId]);
    await query('DELETE FROM email_folders WHERE account_id = $1', [accountId]);
    // Finally, delete the account itself
    await query('DELETE FROM email_accounts WHERE id = $1', [accountId]);

    await emailLog('info', 'admin', `Email account deleted: ${address}`, {
      account_id: accountId,
      admin_user_id: req.user.id,
      attachment_paths_to_clean: attachmentPaths.length,
    });

    res.json({
      success: true,
      cleanup: attachmentPaths.length > 0
        ? { message: `${attachmentPaths.length} attachment file(s) need manual cleanup from disk`, paths: attachmentPaths }
        : null,
    });
  } catch (err) {
    await emailLog('error', 'admin', 'Failed to delete email account', { error: err.message });
    res.status(500).json({ error: 'Failed to delete email account' });
  }
});

// GET /accounts/:id/quota — get quota usage
router.get('/accounts/:id/quota', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    if (isNaN(accountId)) return res.status(400).json({ error: 'Invalid account ID' });

    const account = await query(
      'SELECT id, address, quota_mb, used_mb FROM email_accounts WHERE id = $1',
      [accountId]
    );
    if (account.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Calculate actual usage from message sizes + attachment sizes
    const messageSize = await query(
      'SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM email_messages WHERE account_id = $1',
      [accountId]
    );
    const attachmentSize = await query(
      `SELECT COALESCE(SUM(ea.size_bytes), 0) AS total_bytes FROM email_attachments ea
       JOIN email_messages em ON ea.message_id = em.id
       WHERE em.account_id = $1`,
      [accountId]
    );

    const totalBytes = parseInt(messageSize.rows[0].total_bytes) + parseInt(attachmentSize.rows[0].total_bytes);
    const usedMb = parseFloat((totalBytes / (1024 * 1024)).toFixed(2));
    const quotaMb = parseFloat(account.rows[0].quota_mb);

    const messageCount = await query(
      'SELECT COUNT(*) AS count FROM email_messages WHERE account_id = $1',
      [accountId]
    );
    const attachmentCount = await query(
      `SELECT COUNT(*) AS count FROM email_attachments ea
       JOIN email_messages em ON ea.message_id = em.id
       WHERE em.account_id = $1`,
      [accountId]
    );

    res.json({
      account_id: accountId,
      address: account.rows[0].address,
      quota_mb: quotaMb,
      used_mb: usedMb,
      available_mb: parseFloat((quotaMb - usedMb).toFixed(2)),
      usage_percent: parseFloat(((usedMb / quotaMb) * 100).toFixed(1)),
      message_count: parseInt(messageCount.rows[0].count),
      attachment_count: parseInt(attachmentCount.rows[0].count),
      total_bytes: totalBytes,
    });
  } catch (err) {
    await emailLog('error', 'quota', 'Failed to get quota usage', { error: err.message });
    res.status(500).json({ error: 'Failed to get quota usage' });
  }
});

// ── Aliases (admin only) ─────────────────────────────────────────────────────

// POST /accounts/:id/aliases — add alias
router.post('/accounts/:id/aliases', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    if (isNaN(accountId)) return res.status(400).json({ error: 'Invalid account ID' });

    const { alias_address } = req.body;
    if (!alias_address || typeof alias_address !== 'string') {
      return res.status(400).json({ error: 'Alias address is required' });
    }

    const normalizedAlias = alias_address.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedAlias)) {
      return res.status(400).json({ error: 'Invalid alias email format' });
    }

    // Check account exists
    const account = await query('SELECT id, address FROM email_accounts WHERE id = $1', [accountId]);
    if (account.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Check alias is unique across email_accounts
    const existingAccount = await query(
      'SELECT id FROM email_accounts WHERE LOWER(address) = $1',
      [normalizedAlias]
    );
    if (existingAccount.rows.length > 0) {
      return res.status(409).json({ error: 'Address is already in use as an email account' });
    }

    // Check alias is unique across email_aliases
    const existingAlias = await query(
      'SELECT id FROM email_aliases WHERE LOWER(alias_address) = $1',
      [normalizedAlias]
    );
    if (existingAlias.rows.length > 0) {
      return res.status(409).json({ error: 'Alias address is already in use' });
    }

    const now = Date.now();
    const result = await query(
      'INSERT INTO email_aliases (alias_address, account_id, created_at) VALUES ($1,$2,$3) RETURNING *',
      [normalizedAlias, accountId, now]
    );

    await emailLog('info', 'admin', `Alias added: ${normalizedAlias} -> ${account.rows[0].address}`, {
      alias_id: result.rows[0].id,
      account_id: accountId,
      admin_user_id: req.user.id,
    });

    res.status(201).json({ alias: result.rows[0] });
  } catch (err) {
    await emailLog('error', 'admin', 'Failed to add alias', { error: err.message });
    res.status(500).json({ error: 'Failed to add alias' });
  }
});

// DELETE /accounts/:id/aliases/:aliasId — remove alias
router.delete('/accounts/:id/aliases/:aliasId', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const aliasId = parseInt(req.params.aliasId);
    if (isNaN(accountId) || isNaN(aliasId)) {
      return res.status(400).json({ error: 'Invalid account or alias ID' });
    }

    // Verify alias belongs to this account
    const existing = await query(
      'SELECT id, alias_address FROM email_aliases WHERE id = $1 AND account_id = $2',
      [aliasId, accountId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Alias not found for this account' });
    }

    await query('DELETE FROM email_aliases WHERE id = $1', [aliasId]);

    await emailLog('info', 'admin', `Alias removed: ${existing.rows[0].alias_address}`, {
      alias_id: aliasId,
      account_id: accountId,
      admin_user_id: req.user.id,
    });

    res.json({ success: true });
  } catch (err) {
    await emailLog('error', 'admin', 'Failed to remove alias', { error: err.message });
    res.status(500).json({ error: 'Failed to remove alias' });
  }
});

export default router;
