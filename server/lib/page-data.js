// Shared data access for public pages — used by both the API routes and the
// SSR page loaders, so both always serve identical shapes.
import { query } from '../db.js';

export function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Month/year as the client's nowET() sees them (America/New_York) — for the
// SSR events loader, whose data key must match the client's initial state.
// The events API keeps its historical server-local default instead.
export function currentMonthET() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function fmtDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getNthDayOfMonth(year, month, dayOfWeek, n) {
  const first = new Date(Date.UTC(year, month, 1));
  let day = 1 + ((dayOfWeek - first.getUTCDay() + 7) % 7);
  day += (n - 1) * 7;
  const result = new Date(Date.UTC(year, month, day));
  if (result.getUTCMonth() !== month) return null;
  return result;
}

export function expandRecurringEvents(events, startDate, endDate) {
  const expanded = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');

  for (const event of events) {
    if (event.recurrence === 'weekly' && event.day_of_week !== null) {
      const d = new Date(start);
      while (d.getUTCDay() !== event.day_of_week && d <= end) {
        d.setUTCDate(d.getUTCDate() + 1);
      }
      while (d <= end) {
        expanded.push({
          ...event,
          event_date: fmtDate(d),
          _occurrence: true,
        });
        d.setUTCDate(d.getUTCDate() + 7);
      }
    } else if (event.recurrence === 'monthly' && event.day_of_week !== null && event.week_of_month !== null) {
      let y = start.getUTCFullYear();
      let m = start.getUTCMonth();
      const endY = end.getUTCFullYear();
      const endM = end.getUTCMonth();
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
      const eventDateStr = event.event_date instanceof Date
        ? fmtDate(event.event_date)
        : String(event.event_date).split('T')[0];
      const eventDate = new Date(eventDateStr + 'T12:00:00Z');
      if (eventDate >= start && eventDate <= end) {
        expanded.push({
          ...event,
          event_date: eventDateStr,
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

// days: range from today (ET) to today+days. Otherwise month/year, padded to
// full calendar weeks; missing month/year default to server-local now (the
// API's historical behavior — SSR passes currentMonthET() explicitly).
export async function getPublicEvents({ days, month, year } = {}) {
  let startStr, endStr;

  if (days) {
    const today = todayET();
    const startDate = new Date(today + 'T00:00:00Z');
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + parseInt(days));
    startStr = today;
    endStr = fmtDate(endDate);
  } else {
    const now = new Date();
    const m = parseInt(month) || (now.getMonth() + 1);
    const y = parseInt(year) || now.getFullYear();
    const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
    const lastOfMonth = new Date(Date.UTC(y, m, 0));
    const startDate = new Date(firstOfMonth);
    startDate.setUTCDate(startDate.getUTCDate() - startDate.getUTCDay());
    const endDate = new Date(lastOfMonth);
    endDate.setUTCDate(endDate.getUTCDate() + (6 - endDate.getUTCDay()));
    startStr = fmtDate(startDate);
    endStr = fmtDate(endDate);
  }

  const result = await query(
    `SELECT e.*, u.name as author_name FROM events e
     JOIN users u ON e.author_id=u.id
     WHERE e.recurrence IN ('weekly', 'monthly')
        OR (DATE(e.event_date) >= $1::date AND DATE(e.event_date) <= $2::date)
     ORDER BY e.event_date ASC`,
    [startStr, endStr]
  );

  return expandRecurringEvents(result.rows, startStr, endStr);
}

export async function getPublishedPosts({ page = 1, limit = 10 } = {}) {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const offset = (safePage - 1) * safeLimit;
  const result = await query(
    `SELECT p.*, u.name as author_name FROM posts p JOIN users u ON p.author_id=u.id WHERE p.status='published' ORDER BY p.published_at DESC LIMIT $1 OFFSET $2`,
    [safeLimit, offset]
  );
  const count = await query("SELECT COUNT(*) FROM posts WHERE status='published'");
  return { posts: result.rows, total: parseInt(count.rows[0].count), page: safePage, limit: safeLimit };
}

export async function getPostBySlug(slug, { publishedOnly = false } = {}) {
  const result = await query(
    `SELECT p.*, u.name as author_name FROM posts p JOIN users u ON p.author_id=u.id WHERE p.slug=$1${publishedOnly ? " AND p.status='published'" : ''}`,
    [slug]
  );
  return result.rows[0] || null;
}

// null = post not found (the API maps that to 404)
export async function getApprovedComments(slug) {
  const post = await query('SELECT id FROM posts WHERE slug=$1', [slug]);
  if (!post.rows.length) return null;
  const result = await query(
    'SELECT id, post_id, author_name, content, created_at FROM comments WHERE post_id=$1 AND approved=true ORDER BY created_at DESC',
    [post.rows[0].id]
  );
  return result.rows;
}
