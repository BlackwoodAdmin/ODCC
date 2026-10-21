import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/stats', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [posts, events, users, comments, messages, donations] = await Promise.all([
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='published') as published, COUNT(*) FILTER (WHERE status='draft') as draft FROM posts"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE event_date >= CURRENT_DATE) as upcoming FROM events"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE role='admin') as admins, COUNT(*) FILTER (WHERE role='contributor') as contributors, COUNT(*) FILTER (WHERE role='subscriber') as subscribers FROM users"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE approved=true) as approved, COUNT(*) FILTER (WHERE approved=false) as pending FROM comments"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE read=false) as unread FROM contact_submissions"),
      query("SELECT COUNT(*) as total, COALESCE(SUM(amount_cents), 0) as total_cents, COUNT(*) FILTER (WHERE type = 'recurring') as recurring_count FROM donations WHERE status = 'completed'")
    ]);
    res.json({
      posts: posts.rows[0],
      events: events.rows[0],
      users: users.rows[0],
      comments: comments.rows[0],
      messages: messages.rows[0],
      donations: donations.rows[0]
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;