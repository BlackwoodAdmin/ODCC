import { Router } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

const DATA_BASE = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// GET /attachments/:attachId — download attachment
router.get('/attachments/:attachId', authenticateToken, async (req, res) => {
  try {
    const { attachId } = req.params;

    // Look up attachment → message → account
    const result = await query(
      `SELECT a.filename, a.content_type, a.storage_path, a.is_blocked, a.size_bytes,
              ea.user_id
       FROM email_attachments a
       JOIN email_messages m ON m.id = a.message_id
       JOIN email_accounts ea ON ea.id = m.account_id
       WHERE a.id = $1`,
      [attachId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const attachment = result.rows[0];

    // Verify ownership: user must own the account (or be admin)
    if (req.user.role !== 'admin' && attachment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Resolve storage_path against the data base directory and validate no traversal
    let resolvedPath;
    if (path.isAbsolute(attachment.storage_path)) {
      resolvedPath = path.resolve(attachment.storage_path);
    } else {
      resolvedPath = path.resolve(DATA_BASE, attachment.storage_path);
    }
    if (!resolvedPath.startsWith(path.resolve(DATA_BASE) + path.sep)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify file exists on disk
    try {
      await stat(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'Attachment file not found on disk' });
    }

    // Set headers based on blocked status
    if (attachment.is_blocked) {
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
    } else {
      res.set('Content-Type', attachment.content_type || 'application/octet-stream');
      res.set('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.filename)}"`);
    }

    res.set('Content-Length', attachment.size_bytes);

    const stream = createReadStream(resolvedPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read attachment' });
      }
    });
    stream.pipe(res);
  } catch {
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

export default router;
