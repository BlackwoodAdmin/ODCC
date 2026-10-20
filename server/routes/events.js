import { Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { SANITIZE_OPTIONS } from '../data/sanitize-config.js';
import { getPublicEvents } from '../lib/page-data.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { month, year, days } = req.query;
    const events = await getPublicEvents({ days, month, year });
    res.json({ events });
  } catch (err) {
    console.error('Events fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.get('/all', authenticateToken, requireRole('admin','contributor'), async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await query('SELECT e.*, u.name as author_name FROM events e JOIN users u ON e.author_id=u.id ORDER BY e.event_date DESC');
    } else {
      result = await query('SELECT e.*, u.name as author_name FROM events e JOIN users u ON e.author_id=u.id WHERE e.author_id=$1 ORDER BY e.event_date DESC', [req.user.id]);
    }
    res.json({ events: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post('/', authenticateToken, requireRole('admin','contributor'), async (req, res) => {
  try {
    const { title, description, location, event_date, event_time, end_date, end_time, recurrence, day_of_week, week_of_month } = req.body;
    const cleanDescription = description ? sanitizeHtml(description, SANITIZE_OPTIONS) : description;
    const now = Date.now();
    const result = await query(
      'INSERT INTO events (title,description,location,event_date,event_time,end_date,end_time,recurrence,day_of_week,week_of_month,author_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
      [title, cleanDescription, location, event_date, event_time || null, end_date || event_date, end_time || null, recurrence || null, day_of_week ?? null, week_of_month ?? null, req.user.id, now, now]
    );
    res.status(201).json({ event: result.rows[0] });
  } catch (err) {
    console.error('Event create error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.put('/:id', authenticateToken, requireRole('admin','contributor'), async (req, res) => {
  try {
    const ev = await query('SELECT * FROM events WHERE id=$1', [req.params.id]);
    if (!ev.rows.length) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && ev.rows[0].author_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    const { title, description, location, event_date, event_time, end_date, end_time, recurrence, day_of_week, week_of_month } = req.body;
    const cleanDescription = description ? sanitizeHtml(description, SANITIZE_OPTIONS) : description;
    const now = Date.now();
    const result = await query(
      'UPDATE events SET title=$1,description=$2,location=$3,event_date=$4,event_time=$5,end_date=$6,end_time=$7,recurrence=$8,day_of_week=$9,week_of_month=$10,updated_at=$11 WHERE id=$12 RETURNING *',
      [title, cleanDescription, location, event_date, event_time, end_date, end_time, recurrence || null, day_of_week ?? null, week_of_month ?? null, now, req.params.id]
    );
    res.json({ event: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM events WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;