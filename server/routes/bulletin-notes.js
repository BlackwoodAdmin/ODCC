import { Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { SANITIZE_OPTIONS } from '../data/sanitize-config.js';

const router = Router();

// Validate `YYYY-MM-DD` and reject anything that isn't a Sunday in UTC.
// Returns the validated string or null. Same shape as parseInt — caller decides 400.
function parseWeekStart(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) return null; // catches Feb 30 etc.
  if (date.getUTCDay() !== 0) return null; // 0 = Sunday
  return raw;
}

function stripHtml(html) {
  // Insert a space at every tag boundary so block-level elements don't
  // concatenate into one word ("AnnouncementsPotluck") after stripping.
  const spaced = (html || '').replace(/<\/?[^>]+>/g, ' ');
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

router.use(authenticateToken, requireRole('admin', 'contributor'));

// List recent weeks. Single query, no pagination — at one row per week,
// LIMIT 200 is ~4 years of history.
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         to_char(b.week_start, 'YYYY-MM-DD') AS week_start,
         b.updated_at,
         u.name AS updated_by_name,
         (length(b.content) > 0) AS has_content,
         b.content
       FROM bulletin_notes b
       LEFT JOIN users u ON u.id = b.updated_by
       ORDER BY b.week_start DESC
       LIMIT 200`
    );
    const rows = result.rows.map(r => ({
      week_start: r.week_start,
      updated_at: r.updated_at,
      updated_by_name: r.updated_by_name,
      has_content: r.has_content,
      preview: stripHtml(r.content).slice(0, 120),
    }));
    res.json({ notes: rows });
  } catch (err) {
    console.error('[BulletinNotes] List failed:', err);
    res.status(500).json({ error: 'Failed to fetch bulletin notes' });
  }
});

router.get('/:weekStart', async (req, res) => {
  const weekStart = parseWeekStart(req.params.weekStart);
  if (!weekStart) return res.status(400).json({ error: 'weekStart must be a Sunday in YYYY-MM-DD format' });
  try {
    const result = await query(
      `SELECT
         to_char(b.week_start, 'YYYY-MM-DD') AS week_start,
         b.content,
         b.updated_at,
         b.created_at,
         u.name AS updated_by_name
       FROM bulletin_notes b
       LEFT JOIN users u ON u.id = b.updated_by
       WHERE b.week_start = $1::date`,
      [weekStart]
    );
    if (!result.rows.length) {
      return res.json({ note: { week_start: weekStart, content: '', updated_at: null, updated_by_name: null } });
    }
    res.json({ note: result.rows[0] });
  } catch (err) {
    console.error('[BulletinNotes] Fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch bulletin note' });
  }
});

// Upsert. Any contributor may edit any week — intentional, this is a
// single-row-per-week shared resource.
// Optional `expected_updated_at` body field enables optimistic concurrency:
// if the row's current updated_at is newer than what the client loaded,
// return 409 with the latest row.
router.put('/:weekStart', async (req, res) => {
  const weekStart = parseWeekStart(req.params.weekStart);
  if (!weekStart) return res.status(400).json({ error: 'weekStart must be a Sunday in YYYY-MM-DD format' });
  const { content = '', expected_updated_at } = req.body || {};
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });

  const cleanContent = sanitizeHtml(content, SANITIZE_OPTIONS);
  const now = Date.now();

  try {
    if (expected_updated_at !== undefined && expected_updated_at !== null) {
      const existing = await query(
        `SELECT updated_at,
                to_char(week_start, 'YYYY-MM-DD') AS week_start,
                content
         FROM bulletin_notes WHERE week_start = $1::date`,
        [weekStart]
      );
      if (existing.rows.length) {
        const serverUpdatedAt = Number(existing.rows[0].updated_at);
        const expected = Number(expected_updated_at);
        if (serverUpdatedAt !== expected) {
          const latest = await query(
            `SELECT
               to_char(b.week_start, 'YYYY-MM-DD') AS week_start,
               b.content,
               b.updated_at,
               b.created_at,
               u.name AS updated_by_name
             FROM bulletin_notes b
             LEFT JOIN users u ON u.id = b.updated_by
             WHERE b.week_start = $1::date`,
            [weekStart]
          );
          return res.status(409).json({ error: 'conflict', note: latest.rows[0] });
        }
      }
    }

    const result = await query(
      `INSERT INTO bulletin_notes (week_start, content, updated_by, created_at, updated_at)
       VALUES ($1::date, $2, $3, $4, $4)
       ON CONFLICT (week_start) DO UPDATE
         SET content = EXCLUDED.content,
             updated_by = EXCLUDED.updated_by,
             updated_at = EXCLUDED.updated_at
       RETURNING
         to_char(week_start, 'YYYY-MM-DD') AS week_start,
         content,
         updated_at,
         created_at,
         updated_by`,
      [weekStart, cleanContent, req.user.id, now]
    );
    const row = result.rows[0];
    const userRow = await query('SELECT name FROM users WHERE id = $1', [row.updated_by]);
    res.json({
      note: {
        week_start: row.week_start,
        content: row.content,
        updated_at: row.updated_at,
        created_at: row.created_at,
        updated_by_name: userRow.rows[0]?.name || null,
      },
    });
  } catch (err) {
    console.error('[BulletinNotes] Save failed:', err);
    res.status(500).json({ error: 'Failed to save bulletin note' });
  }
});

router.delete('/:weekStart', requireRole('admin'), async (req, res) => {
  const weekStart = parseWeekStart(req.params.weekStart);
  if (!weekStart) return res.status(400).json({ error: 'weekStart must be a Sunday in YYYY-MM-DD format' });
  try {
    await query('DELETE FROM bulletin_notes WHERE week_start = $1::date', [weekStart]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[BulletinNotes] Delete failed:', err);
    res.status(500).json({ error: 'Failed to delete bulletin note' });
  }
});

export default router;
