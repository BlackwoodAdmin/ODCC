import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/** Verify the requesting user owns the email account (or is admin). */
async function verifyAccountOwnership(req, res) {
  const accountId = req.params.id;
  if (req.user.role === 'admin') return accountId;

  const result = await query(
    'SELECT id FROM email_accounts WHERE id = $1 AND user_id = $2',
    [accountId, req.user.id]
  );
  if (!result.rows.length) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return accountId;
}

// GET /accounts/:id/contacts — list contacts (with search via ILIKE on email+name)
router.get('/accounts/:id/contacts', authenticateToken, async (req, res) => {
  try {
    const accountId = await verifyAccountOwnership(req, res);
    if (!accountId) return;

    const { search } = req.query;
    let sql = 'SELECT id, email, name, notes, created_at, updated_at FROM email_contacts WHERE account_id = $1';
    const params = [accountId];

    if (search && search.trim()) {
      sql += ' AND (email ILIKE $2 OR name ILIKE $2)';
      params.push(`%${search.trim()}%`);
    }

    sql += ' ORDER BY name ASC, email ASC';

    const result = await query(sql, params);
    res.json({ contacts: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// POST /accounts/:id/contacts — add contact
router.post('/accounts/:id/contacts', authenticateToken, async (req, res) => {
  try {
    const accountId = await verifyAccountOwnership(req, res);
    if (!accountId) return;

    const { email, name, notes } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const now = Date.now();
    const result = await query(
      `INSERT INTO email_contacts (account_id, email, name, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING id, email, name, notes, created_at, updated_at`,
      [accountId, email.trim().toLowerCase(), name?.trim() || null, notes?.trim() || null, now]
    );

    res.status(201).json({ contact: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Contact with this email already exists' });
    }
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// PUT /accounts/:id/contacts/:cid — update contact
router.put('/accounts/:id/contacts/:cid', authenticateToken, async (req, res) => {
  try {
    const accountId = await verifyAccountOwnership(req, res);
    if (!accountId) return;

    const { cid } = req.params;
    const { email, name, notes } = req.body;
    const now = Date.now();

    const result = await query(
      `UPDATE email_contacts
       SET email = COALESCE($1, email),
           name = COALESCE($2, name),
           notes = COALESCE($3, notes),
           updated_at = $4
       WHERE id = $5 AND account_id = $6
       RETURNING id, email, name, notes, created_at, updated_at`,
      [
        email?.trim().toLowerCase() || null,
        name?.trim() || null,
        notes?.trim() || null,
        now,
        cid,
        accountId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ contact: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Contact with this email already exists' });
    }
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /accounts/:id/contacts/:cid — delete contact
router.delete('/accounts/:id/contacts/:cid', authenticateToken, async (req, res) => {
  try {
    const accountId = await verifyAccountOwnership(req, res);
    if (!accountId) return;

    const { cid } = req.params;
    const result = await query(
      'DELETE FROM email_contacts WHERE id = $1 AND account_id = $2 RETURNING id',
      [cid, accountId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
