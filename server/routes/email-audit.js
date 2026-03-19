import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /accounts/:id/audit — admin only, list audit log entries
router.get('/accounts/:id/audit', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const accountId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const { action, startDate, endDate } = req.query;

    // Build WHERE clauses
    const conditions = ['al.account_id = $1'];
    const params = [accountId];
    let paramIndex = 2;

    if (action) {
      conditions.push(`al.action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`al.created_at >= $${paramIndex}`);
      params.push(parseInt(startDate));
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`al.created_at <= $${paramIndex}`);
      params.push(parseInt(endDate));
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM email_audit_log al WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const result = await query(
      `SELECT al.id, al.account_id, al.user_id, al.action, al.message_id,
              al.details, al.ip_address, al.created_at,
              u.name AS user_name, u.email AS user_email
       FROM email_audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.json({
      entries: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;
