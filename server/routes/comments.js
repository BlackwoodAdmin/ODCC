import { Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../middleware/auth.js';
import { requireTurnstile } from '../middleware/turnstile.js';

const router = Router();

router.get('/post/:slug', async (req, res) => {
  try {
    const post = await query('SELECT id FROM posts WHERE slug=$1', [req.params.slug]);
    if (!post.rows.length) return res.status(404).json({ error: 'Post not found' });
    const result = await query(
      'SELECT id, post_id, author_name, content, created_at FROM comments WHERE post_id=$1 AND approved=true ORDER BY created_at DESC',
      [post.rows[0].id]
    );
    res.json({ comments: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.post('/post/:slug', optionalAuth, (req, res, next) => {
  if (req.user) return next();
  requireTurnstile(req, res, next);
}, async (req, res) => {
  try {
    const post = await query('SELECT id FROM posts WHERE slug=$1', [req.params.slug]);
    if (!post.rows.length) return res.status(404).json({ error: 'Post not found' });
    const { content, author_name, author_email } = req.body;
    const name = req.user ? req.user.name : author_name;
    const email = req.user ? req.user.email : author_email;
    if (!content || !name || !email) return res.status(400).json({ error: 'Content, name, and email required' });
    const cleanContent = sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} });
    const approved = req.user && ['admin', 'contributor'].includes(req.user.role);
    const result = await query(
      'INSERT INTO comments (post_id,author_name,author_email,content,approved,created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [post.rows[0].id, name, email, cleanContent, approved, Date.now()]
    );
    res.status(201).json({ comment: result.rows[0], message: approved ? 'Comment posted' : 'Comment submitted for moderation' });
  } catch {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

router.get('/pending', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const result = await query(
      'SELECT c.*, p.title as post_title, p.slug as post_slug FROM comments c JOIN posts p ON c.post_id=p.id WHERE c.approved=false ORDER BY c.created_at ASC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json({ comments: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const result = await query(
      'SELECT c.*, p.title as post_title, p.slug as post_slug FROM comments c JOIN posts p ON c.post_id=p.id ORDER BY c.created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json({ comments: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.put('/:id/approve', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query('UPDATE comments SET approved=true WHERE id=$1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Comment not found' });
    res.json({ comment: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to approve comment' });
  }
});

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM comments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;