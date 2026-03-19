import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Find the Nth occurrence of a given day_of_week in a month.
 * Returns null if that occurrence doesn't exist (e.g. 5th Saturday).
 */
function getNthDayOfMonth(year, month, dayOfWeek, n) {
  const first = new Date(year, month, 1);
  let day = 1 + ((dayOfWeek - first.getDay() + 7) % 7);
  day += (n - 1) * 7;
  const result = new Date(year, month, day);
  if (result.getMonth() !== month) return null;
  return result;
}

/**
 * Expand recurring events into individual occurrences for a date range.
 * Weekly events repeat on their day_of_week every week.
 * Monthly events repeat on the Nth day_of_week of every month
 * (e.g. "1st Saturday" each month).
 */
function expandRecurringEvents(events, startDate, endDate) {
  const expanded = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const event of events) {
    if (event.recurrence === 'weekly' && event.day_of_week !== null) {
      const d = new Date(start);
      while (d.getDay() !== event.day_of_week && d <= end) {
        d.setDate(d.getDate() + 1);
      }
      while (d <= end) {
        expanded.push({
          ...event,
          event_date: fmtDate(d),
          _occurrence: true,
        });
        d.setDate(d.getDate() + 7);
      }
    } else if (event.recurrence === 'monthly' && event.day_of_week !== null && event.week_of_month !== null) {
      // Iterate each month in the range
      let y = start.getFullYear();
      let m = start.getMonth();
      const endY = end.getFullYear();
      const endM = end.getMonth();
      while (y < endY || (y === endY && m <= endM)) {
        const d = getNthDayOfMonth(y, m, event.day_of_week, event.week_of_month);
        if (d && d >= start && d <= end) {
          expanded.push({
            ...event,
            event_date: fmtDate(d),
            _occurrence: true,
          });
        }
        m++;
        if (m > 11) { m = 0; y++; }
      }
    } else {
      const eventDate = new Date(event.event_date);
      if (eventDate >= start && eventDate <= end) {
        expanded.push({
          ...event,
          event_date: fmtDate(eventDate),
        });
      }
    }
  }

  expanded.sort((a, b) => {
    const cmp = a.event_date.localeCompare(b.event_date);
    if (cmp !== 0) return cmp;
    return (a.event_time || '').localeCompare(b.event_time || '');
  });

  return expanded;
}

router.get('/', async (req, res) => {
  try {
    const { month, year, days } = req.query;

    let startStr, endStr;

    if (days) {
      // Upcoming mode: from today (ET) for N days
      const today = todayET();
      const startDate = new Date(today + 'T00:00:00');
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + parseInt(days));
      startStr = today;
      endStr = fmtDate(endDate);
    } else {
      // Calendar mode: full month with surrounding partial weeks
      const now = new Date();
      const m = parseInt(month) || (now.getMonth() + 1);
      const y = parseInt(year) || now.getFullYear();
      const firstOfMonth = new Date(y, m - 1, 1);
      const lastOfMonth = new Date(y, m, 0);
      const startDate = new Date(firstOfMonth);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      const endDate = new Date(lastOfMonth);
      endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
      startStr = fmtDate(startDate);
      endStr = fmtDate(endDate);
    }

    const result = await query(
      `SELECT e.*, u.name as author_name FROM events e
       JOIN users u ON e.author_id=u.id
       WHERE e.recurrence IN ('weekly', 'monthly')
          OR (e.event_date >= $1 AND e.event_date <= $2)
       ORDER BY e.event_date ASC`,
      [startStr, endStr]
    );

    const expanded = expandRecurringEvents(result.rows, startStr, endStr);
    res.json({ events: expanded });
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
    const now = Date.now();
    const result = await query(
      'INSERT INTO events (title,description,location,event_date,event_time,end_date,end_time,recurrence,day_of_week,week_of_month,author_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
      [title, description, location, event_date, event_time || null, end_date || event_date, end_time || null, recurrence || null, day_of_week ?? null, week_of_month ?? null, req.user.id, now, now]
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
    const now = Date.now();
    const result = await query(
      'UPDATE events SET title=$1,description=$2,location=$3,event_date=$4,event_time=$5,end_date=$6,end_time=$7,recurrence=$8,day_of_week=$9,week_of_month=$10,updated_at=$11 WHERE id=$12 RETURNING *',
      [title, description, location, event_date, event_time, end_date, end_time, recurrence || null, day_of_week ?? null, week_of_month ?? null, now, req.params.id]
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
