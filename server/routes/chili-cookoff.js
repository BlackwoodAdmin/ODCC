import { Router } from 'express';
import { query, pool } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { requireTurnstile } from '../middleware/turnstile.js';
import { sendChiliCookoffConfirmation, sendChiliCookoffNotification } from '../email.js';

// Jr Chili Cook-Off sign-up — Free Family Fall Festival, Saturday Oct 17 2026.
// Public: status + online registration (Turnstile + origin check at mount).
// Admin: roster management, check-in numbering, CSV export, settings.

const router = Router();
const adminOnly = [authenticateToken, requireRole('admin')];

export const SETTINGS_KEY = 'chili_cookoff';
export const DEFAULT_SETTINGS = Object.freeze({
  registration_open: true,
  deadline: '2026-10-12T23:59:59-04:00', // Oct 12, 11:59 PM Eastern (flyer's pre-registration deadline)
  capacity: null,                         // null = unlimited
});

const NOTIFY_TO = process.env.CHILI_COOKOFF_NOTIFY_EMAIL || 'hello@opendoorchristian.church';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOSED_MESSAGES = {
  closed: 'Online registration is currently closed. Questions? Email hello@opendoorchristian.church.',
  deadline: 'Pre-registration closed on October 12. Walk-ins are welcome on festival day if there is space — bring your chili by 11:45 AM.',
  full: 'Pre-registration is full. Walk-ins are welcome on festival day if there is space — bring your chili by 11:45 AM.',
};

export function divisionForAge(age) {
  return age <= 12 ? 'junior' : 'teen';
}

// ── Settings / status ────────────────────────────────────────────────────────

async function getSettings() {
  const { rows } = await query('SELECT value FROM site_settings WHERE key = $1', [SETTINGS_KEY]);
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value || {}) };
}

async function getStatus() {
  const settings = await getSettings();
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM chili_cookoff_entries');
  const count = rows[0].count;
  let reason = null;
  if (!settings.registration_open) reason = 'closed';
  else if (settings.deadline && Date.now() > Date.parse(settings.deadline)) reason = 'deadline';
  else if (settings.capacity != null && count >= settings.capacity) reason = 'full';
  return {
    open: reason === null,
    reason,
    message: reason ? CLOSED_MESSAGES[reason] : null,
    deadline: settings.deadline,
    capacity: settings.capacity,
    count,
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

function str(v) {
  if (typeof v === 'string') return v.trim();
  return v == null ? '' : String(v).trim();
}

/**
 * Validate a registration payload. Returns { error } on the first problem,
 * otherwise { values } ready for INSERT/UPDATE.
 */
export function validateEntry(body = {}, { requireConsent = true } = {}) {
  const cook_first_name = str(body.cook_first_name);
  const chili_name = str(body.chili_name);
  const parent_name = str(body.parent_name);
  const parent_email = str(body.parent_email).toLowerCase();
  const parent_phone = str(body.parent_phone);
  const notes = str(body.notes);
  const age = typeof body.age === 'number' ? body.age : Number.parseInt(str(body.age), 10);

  if (!cook_first_name) return { error: "The junior cook's first name is required" };
  if (cook_first_name.length > 100) return { error: 'First name is too long (max 100 characters)' };
  if (!Number.isInteger(age) || age < 7 || age > 19) return { error: 'Age must be a whole number from 7 to 19' };
  if (!chili_name) return { error: 'Chili name is required' };
  if (chili_name.length > 150) return { error: 'Chili name is too long (max 150 characters)' };
  if (!parent_name) return { error: 'Parent/guardian name is required' };
  if (parent_name.length > 150) return { error: 'Parent/guardian name is too long (max 150 characters)' };
  if (!parent_email || parent_email.length > 255 || !EMAIL_RE.test(parent_email)) return { error: 'A valid parent/guardian email is required' };
  if (parent_phone.length > 20) return { error: 'Phone number is too long (max 20 characters)' };
  if (notes.length > 500) return { error: 'Notes are too long (max 500 characters)' };
  if (requireConsent && !(body.consent === true || body.consent === 'true')) {
    return { error: 'Parent/guardian consent is required' };
  }

  return {
    values: {
      cook_first_name,
      age,
      division: divisionForAge(age),
      chili_name,
      parent_name,
      parent_email,
      parent_phone: parent_phone || null,
      notes: notes || null,
    },
  };
}

function isUniqueViolation(err) {
  return err?.code === '23505';
}

function duplicateMessage(values) {
  return `${values.cook_first_name} is already registered under ${values.parent_email}. Need to change something? Email hello@opendoorchristian.church.`;
}

async function insertEntry(values, source) {
  const now = Date.now();
  const { rows } = await query(
    `INSERT INTO chili_cookoff_entries
       (cook_first_name, age, division, chili_name, parent_name, parent_email, parent_phone, notes, source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING *`,
    [values.cook_first_name, values.age, values.division, values.chili_name, values.parent_name,
     values.parent_email, values.parent_phone, values.notes, source, now]
  );
  return rows[0];
}

// ── Public ───────────────────────────────────────────────────────────────────

router.get('/status', async (_req, res) => {
  try {
    res.json(await getStatus());
  } catch (err) {
    console.error('[ChiliCookoff] Status error:', err.message);
    res.status(500).json({ error: 'Failed to load registration status' });
  }
});

router.post('/entries', requireTurnstile, async (req, res) => {
  try {
    const status = await getStatus();
    if (!status.open) return res.status(403).json({ error: status.message, reason: status.reason });

    const { error, values } = validateEntry(req.body, { requireConsent: true });
    if (error) return res.status(400).json({ error });

    let entry;
    try {
      entry = await insertEntry(values, 'online');
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: duplicateMessage(values) });
      throw err;
    }

    // Emails are best-effort; the registration is already saved.
    sendChiliCookoffConfirmation({
      to: entry.parent_email,
      parentName: entry.parent_name,
      cookName: entry.cook_first_name,
      chiliName: entry.chili_name,
      division: entry.division,
    }).catch((err) => console.error('[ChiliCookoff] Confirmation email failed:', err.message));
    sendChiliCookoffNotification({ to: NOTIFY_TO, entry })
      .catch((err) => console.error('[ChiliCookoff] Notification email failed:', err.message));

    res.status(201).json({
      success: true,
      id: entry.id,
      division: entry.division,
      message: `${entry.cook_first_name} is registered! A confirmation is on its way to ${entry.parent_email}.`,
    });
  } catch (err) {
    console.error('[ChiliCookoff] Create error:', err.message);
    res.status(500).json({ error: 'Failed to submit registration' });
  }
});

// ── Admin ────────────────────────────────────────────────────────────────────

router.get('/entries', ...adminOnly, async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    if (req.query.division === 'junior' || req.query.division === 'teen') {
      params.push(req.query.division);
      conditions.push(`division = $${params.length}`);
    }
    const q = str(req.query.q);
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(cook_first_name ILIKE $${params.length} OR chili_name ILIKE $${params.length} OR parent_name ILIKE $${params.length} OR parent_email ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [entries, counts] = await Promise.all([
      query(`SELECT * FROM chili_cookoff_entries ${where} ORDER BY division, entry_number NULLS LAST, created_at DESC`, params),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE division = 'junior')::int AS junior,
                    COUNT(*) FILTER (WHERE division = 'teen')::int AS teen,
                    COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS checked_in
             FROM chili_cookoff_entries`),
    ]);
    res.json({ entries: entries.rows, counts: counts.rows[0] });
  } catch (err) {
    console.error('[ChiliCookoff] List error:', err.message);
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// Must be registered before '/entries/:id' so "export.csv" is not read as an id.
router.get('/entries/export.csv', ...adminOnly, async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM chili_cookoff_entries ORDER BY division, entry_number NULLS LAST, cook_first_name');
    const fmt = (ms) => (ms ? new Date(Number(ms)).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '');
    const cell = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Entry #', 'Division', 'Cook', 'Age', 'Chili', 'Parent/Guardian', 'Email', 'Phone', 'Notes', 'Source', 'Registered (ET)', 'Checked In (ET)'];
    const lines = rows.map((r) => [
      r.entry_number, r.division === 'junior' ? 'Ages 7-12' : 'Ages 13-19', r.cook_first_name, r.age, r.chili_name,
      r.parent_name, r.parent_email, r.parent_phone, r.notes, r.source, fmt(r.created_at), fmt(r.checked_in_at),
    ].map(cell).join(','));
    const csv = '﻿' + [header.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="jr-chili-cookoff-entries.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[ChiliCookoff] Export error:', err.message);
    res.status(500).json({ error: 'Failed to export entries' });
  }
});

router.post('/entries/walkin', ...adminOnly, async (req, res) => {
  try {
    const { error, values } = validateEntry(req.body, { requireConsent: false });
    if (error) return res.status(400).json({ error });
    try {
      const entry = await insertEntry(values, 'walkin');
      return res.status(201).json({ entry });
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: duplicateMessage(values) });
      throw err;
    }
  } catch (err) {
    console.error('[ChiliCookoff] Walk-in error:', err.message);
    res.status(500).json({ error: 'Failed to add walk-in entry' });
  }
});

function parseId(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid entry id' });
    return null;
  }
  return id;
}

router.put('/entries/:id', ...adminOnly, async (req, res) => {
  const id = parseId(req, res);
  if (!id) return;
  try {
    const { error, values } = validateEntry(req.body, { requireConsent: false });
    if (error) return res.status(400).json({ error });
    try {
      const { rows } = await query(
        `UPDATE chili_cookoff_entries
         SET cook_first_name = $1, age = $2, division = $3, chili_name = $4, parent_name = $5,
             parent_email = $6, parent_phone = $7, notes = $8, updated_at = $9
         WHERE id = $10 RETURNING *`,
        [values.cook_first_name, values.age, values.division, values.chili_name, values.parent_name,
         values.parent_email, values.parent_phone, values.notes, Date.now(), id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
      res.json({ entry: rows[0] });
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: duplicateMessage(values) });
      throw err;
    }
  } catch (err) {
    console.error('[ChiliCookoff] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// Check-in assigns the next entry number within the division (1, 2, 3 ...)
// so voting cups can be labelled. Idempotent: a second check-in keeps the number.
router.put('/entries/:id/check-in', ...adminOnly, async (req, res) => {
  const id = parseId(req, res);
  if (!id) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE chili_cookoff_entries IN SHARE ROW EXCLUSIVE MODE');
    const current = await client.query('SELECT * FROM chili_cookoff_entries WHERE id = $1', [id]);
    if (!current.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Entry not found' });
    }
    const entry = current.rows[0];
    let entryNumber = entry.entry_number;
    if (entryNumber == null) {
      const max = await client.query(
        'SELECT COALESCE(MAX(entry_number), 0) + 1 AS next FROM chili_cookoff_entries WHERE division = $1',
        [entry.division]
      );
      entryNumber = max.rows[0].next;
    }
    const now = Date.now();
    const updated = await client.query(
      `UPDATE chili_cookoff_entries
       SET entry_number = $1, checked_in_at = COALESCE(checked_in_at, $2), updated_at = $2
       WHERE id = $3 RETURNING *`,
      [entryNumber, now, id]
    );
    await client.query('COMMIT');
    res.json({ entry: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ChiliCookoff] Check-in error:', err.message);
    res.status(500).json({ error: 'Failed to check in entry' });
  } finally {
    client.release();
  }
});

router.put('/entries/:id/undo-check-in', ...adminOnly, async (req, res) => {
  const id = parseId(req, res);
  if (!id) return;
  try {
    const { rows } = await query(
      'UPDATE chili_cookoff_entries SET entry_number = NULL, checked_in_at = NULL, updated_at = $1 WHERE id = $2 RETURNING *',
      [Date.now(), id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry: rows[0] });
  } catch (err) {
    console.error('[ChiliCookoff] Undo check-in error:', err.message);
    res.status(500).json({ error: 'Failed to undo check-in' });
  }
});

router.delete('/entries/:id', ...adminOnly, async (req, res) => {
  const id = parseId(req, res);
  if (!id) return;
  try {
    const { rowCount } = await query('DELETE FROM chili_cookoff_entries WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[ChiliCookoff] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// Bulk delete after the event. Requires an explicit confirmation string.
router.delete('/entries', ...adminOnly, async (req, res) => {
  try {
    if (req.body?.confirm !== 'DELETE') {
      return res.status(400).json({ error: 'Send { "confirm": "DELETE" } to remove every entry' });
    }
    const { rowCount } = await query('DELETE FROM chili_cookoff_entries');
    res.json({ success: true, deleted: rowCount });
  } catch (err) {
    console.error('[ChiliCookoff] Delete-all error:', err.message);
    res.status(500).json({ error: 'Failed to delete entries' });
  }
});

router.get('/settings', ...adminOnly, async (_req, res) => {
  try {
    res.json({ settings: await getSettings(), status: await getStatus() });
  } catch (err) {
    console.error('[ChiliCookoff] Settings error:', err.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/settings', ...adminOnly, async (req, res) => {
  try {
    const current = await getSettings();
    const next = { ...current };
    const body = req.body || {};

    if (body.registration_open !== undefined) {
      if (typeof body.registration_open !== 'boolean') return res.status(400).json({ error: 'registration_open must be true or false' });
      next.registration_open = body.registration_open;
    }
    if (body.deadline !== undefined) {
      if (body.deadline === null || body.deadline === '') next.deadline = null;
      else if (typeof body.deadline !== 'string' || Number.isNaN(Date.parse(body.deadline))) return res.status(400).json({ error: 'deadline must be an ISO date-time or null' });
      else next.deadline = body.deadline;
    }
    if (body.capacity !== undefined) {
      if (body.capacity === null || body.capacity === '') next.capacity = null;
      else {
        const cap = Number(body.capacity);
        if (!Number.isInteger(cap) || cap < 1) return res.status(400).json({ error: 'capacity must be a positive whole number or empty' });
        next.capacity = cap;
      }
    }

    await query(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [SETTINGS_KEY, JSON.stringify(next), Date.now()]
    );
    res.json({ settings: next, status: await getStatus() });
  } catch (err) {
    console.error('[ChiliCookoff] Save settings error:', err.message);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default router;
