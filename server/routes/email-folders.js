import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

const SYSTEM_FOLDER_TYPES = ['inbox', 'sent', 'drafts', 'trash', 'archive', 'spam'];

/** Verify the requesting user owns the email account (or is admin). */
async function verifyAccountOwnership(req, res) {
  const accountId = req.params.id;
  if (req.user.role === 'admin') return accountId;

  const result = await query(
    'SELECT id FROM email_accounts WHERE id = $1 AND user_id = $2',
    [accountId, req.user.id]
  );
  if (!result.rows.length) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return accountId;
}

// GET /accounts/:id/folders — list folders with unread counts
router.get('/accounts/:id/folders', authenticateToken, async (req, res) => {
  try {
    const accountId = await verifyAccountOwnership(req, res);
    if (!accountId) return;

    const result = await query(
      `SELECT f.id, f.name, f.type, f.sort_order, f.created_at,
              COUNT(m.id) FILTER (WHERE m.is_read = FALSE) AS unread_count
       FROM email_folders f
       LEFT JOIN email_messages m ON m.folder_id = f.id
       WHERE f.account_id = $1
       GROUP BY f.id
       ORDER BY f.sort_order ASC, f.name ASC`,
      [accountId]
    );

    res.json({ folders: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// POST /accounts/:id/folders — create custom folder
router.post('/accounts/:id/folders', authenticateToken, async (req, res) => {
  try {
    const accountId = await verifyAccountOwnership(req, res);
    if (!accountId) return;

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const trimmedName = name.trim();

    // Prevent creating folders with system folder names
    if (SYSTEM_FOLDER_TYPES.includes(trimmedName.toLowerCase())) {
      return res.status(400).json({ error: 'Cannot create folder with a system folder name' });
    }

    const now = Date.now();
    const result = await query(
      `INSERT INTO email_folders (account_id, name, type, sort_order, created_at)
       VALUES ($1, $2, 'custom', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM email_folders WHERE account_id = $1), $3)
       RETURNING id, name, type, sort_order, created_at`,
      [accountId, trimmedName, now]
    );

    res.status(201).json({ folder: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A folder with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PUT /accounts/:id/folders/:folderId — rename folder (only custom type)
router.put('/accounts/:id/folders/:folderId', authenticateToken, async (req, res) => {
  try {
    const accountId = await verifyAccountOwnership(req, res);
    if (!accountId) return;

    const { folderId } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const trimmedName = name.trim();

    // Prevent renaming to a system folder name
    if (SYSTEM_FOLDER_TYPES.includes(trimmedName.toLowerCase())) {
      return res.status(400).json({ error: 'Cannot rename folder to a system folder name' });
    }

    // Verify folder exists and is custom type
    const folder = await query(
      'SELECT id, type FROM email_folders WHERE id = $1 AND account_id = $2',
      [folderId, accountId]
    );

    if (!folder.rows.length) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (folder.rows[0].type !== 'custom') {
      return res.status(400).json({ error: 'System folders cannot be renamed' });
    }

    const result = await query(
      'UPDATE email_folders SET name = $1 WHERE id = $2 AND account_id = $3 RETURNING id, name, type, sort_order, created_at',
      [trimmedName, folderId, accountId]
    );

    res.json({ folder: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A folder with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to rename folder' });
  }
});

// DELETE /accounts/:id/folders/:folderId — delete custom folder (move messages to inbox)
router.delete('/accounts/:id/folders/:folderId', authenticateToken, async (req, res) => {
  try {
    const accountId = await verifyAccountOwnership(req, res);
    if (!accountId) return;

    const { folderId } = req.params;

    // Verify folder exists and is custom type
    const folder = await query(
      'SELECT id, type FROM email_folders WHERE id = $1 AND account_id = $2',
      [folderId, accountId]
    );

    if (!folder.rows.length) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (folder.rows[0].type !== 'custom') {
      return res.status(400).json({ error: 'System folders cannot be deleted' });
    }

    // Find inbox folder to move messages to
    const inbox = await query(
      "SELECT id FROM email_folders WHERE account_id = $1 AND type = 'inbox'",
      [accountId]
    );

    if (inbox.rows.length) {
      // Move messages from deleted folder to inbox
      await query(
        'UPDATE email_messages SET folder_id = $1, updated_at = $2 WHERE folder_id = $3 AND account_id = $4',
        [inbox.rows[0].id, Date.now(), folderId, accountId]
      );
    }

    await query('DELETE FROM email_folders WHERE id = $1 AND account_id = $2', [folderId, accountId]);

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

export default router;
