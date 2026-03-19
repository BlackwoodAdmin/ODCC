import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, requireRole, revokeUserTokens } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const result = await query('SELECT id,email,name,role,created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    res.json({ users: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, role } = req.body;
    const now = Date.now();
    const result = await query(
      'UPDATE users SET name=COALESCE($1,name), role=COALESCE($2,role), updated_at=$3 WHERE id=$4 RETURNING id,email,name,role',
      [name, role, now, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    // Revoke existing JWTs if role was changed
    if (role) revokeUserTokens(parseInt(req.params.id));
    res.json({ user: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;