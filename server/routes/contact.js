import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { requireTurnstile } from '../middleware/turnstile.js';

const router = Router();

router.post('/', requireTurnstile, async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message required' });
    if (name.length > 255) return res.status(400).json({ error: 'Name too long (max 255 characters)' });
    if (email.length > 255 || !email.includes('@') || !email.includes('.')) return res.status(400).json({ error: 'Invalid email address' });
    if (phone && phone.length > 20) return res.status(400).json({ error: 'Phone number too long (max 20 characters)' });
    if (message.length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
    await query(
      'INSERT INTO contact_submissions (name,email,phone,message,created_at) VALUES ($1,$2,$3,$4,$5)',
      [name, email, phone || null, message, Date.now()]
    );
    res.status(201).json({ success: true, message: 'Thank you for your message. We will be in touch soon.' });
  } catch {
    res.status(500).json({ error: 'Failed to submit message' });
  }
});

router.post('/prayer', requireTurnstile, async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'All fields are required' });
    if (name.length > 255) return res.status(400).json({ error: 'Name too long (max 255 characters)' });
    if (email.length > 255 || !email.includes('@') || !email.includes('.')) return res.status(400).json({ error: 'Invalid email address' });
    if (message.length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
    await query(
      'INSERT INTO contact_submissions (name, email, phone, message, type, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, email, null, message, 'prayer', Date.now()]
    );
    res.status(201).json({ success: true, message: 'Your prayer request has been received. We are praying with you.' });
  } catch {
    res.status(500).json({ error: 'Failed to submit prayer request' });
  }
});

router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const result = await query('SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    res.json({ messages: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.put('/read-all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query('UPDATE contact_submissions SET read=true WHERE read=false');
    res.json({ success: true, updated: result.rowCount });
  } catch {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.put('/:id/read', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('UPDATE contact_submissions SET read=true WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM contact_submissions WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;