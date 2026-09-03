import { Router } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { verifyAttachmentSignature, SIGNED_ATTACHMENT_TTL_MS } from '../utils/attachment-token.js';

const router = Router();

const DATA_BASE = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/**
 * Accept either the normal JWT bearer token or a signed URL (?exp=&sig=).
 * Signed URLs are minted by the message renderer for inline images too large
 * to embed as data: URIs; the sandboxed message iframe cannot send headers.
 */
function authenticateAttachmentRequest(req, res, next) {
  const { exp, sig } = req.query;
  if (exp !== undefined || sig !== undefined) {
    if (verifyAttachmentSignature(req.params.attachId, exp, sig)) {
      req.signedAccess = true;
      return next();
    }
    return res.status(401).json({ error: 'Invalid or expired attachment link' });
  }
  return authenticateToken(req, res, next);
}

// GET /attachments/:attachId — download attachment
router.get('/attachments/:attachId', authenticateAttachmentRequest, async (req, res) => {
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

    // Verify ownership: user must own the account (or be admin). A valid
    // signed URL was minted for an already-authorized viewer, so it stands in.
    if (!req.signedAccess && req.user.role !== 'admin' && attachment.user_id !== req.user.id) {
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
    if (req.signedAccess) {
      // Let the browser reuse the image for the life of the link; the global
      // /api no-store would otherwise refetch multi-MB images on every render.
      res.set('Cache-Control', `private, max-age=${Math.floor(SIGNED_ATTACHMENT_TTL_MS / 1000)}`);
    }

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
