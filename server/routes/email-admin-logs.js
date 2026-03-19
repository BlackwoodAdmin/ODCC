import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /admin/logs — list system logs with filtering and pagination
 */
router.get('/admin/logs', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      level,
      category,
      page = 1,
      limit = 50,
      search,
      startDate,
      endDate,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (level) {
      params.push(level);
      conditions.push(`level = $${params.length}`);
    }

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`message ILIKE $${params.length}`);
    }

    if (startDate) {
      params.push(parseInt(startDate));
      conditions.push(`created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(parseInt(endDate));
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM email_system_logs ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);

    // Get paginated logs
    const logsResult = await query(
      `SELECT * FROM email_system_logs ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      logs: logsResult.rows,
      total,
      page: pageNum,
      totalPages,
    });
  } catch (err) {
    console.error('[AdminLogs] List error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * DELETE /admin/logs — bulk delete logs
 *
 * Body options:
 *   { logIds: [1, 2, 3] }                          — delete specific logs
 *   { deleteAll: true, filters: { ... } }           — delete matching filters
 *   { deleteAll: true }                              — purge entire table
 */
router.delete('/admin/logs', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { logIds, deleteAll, filters } = req.body;

    let result;

    if (logIds && Array.isArray(logIds) && logIds.length > 0) {
      // Delete specific log entries
      const placeholders = logIds.map((_, i) => `$${i + 1}`).join(', ');
      result = await query(
        `DELETE FROM email_system_logs WHERE id IN (${placeholders})`,
        logIds
      );
    } else if (deleteAll) {
      if (filters && typeof filters === 'object') {
        // Delete with filters
        const conditions = [];
        const params = [];

        if (filters.level) {
          params.push(filters.level);
          conditions.push(`level = $${params.length}`);
        }

        if (filters.category) {
          params.push(filters.category);
          conditions.push(`category = $${params.length}`);
        }

        if (filters.startDate) {
          params.push(parseInt(filters.startDate));
          conditions.push(`created_at >= $${params.length}`);
        }

        if (filters.endDate) {
          params.push(parseInt(filters.endDate));
          conditions.push(`created_at <= $${params.length}`);
        }

        const whereClause = conditions.length > 0
          ? `WHERE ${conditions.join(' AND ')}`
          : '';

        result = await query(
          `DELETE FROM email_system_logs ${whereClause}`,
          params
        );
      } else {
        // Purge entire table
        result = await query('DELETE FROM email_system_logs');
      }
    } else {
      return res.status(400).json({ error: 'Provide logIds array or deleteAll flag' });
    }

    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('[AdminLogs] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete logs' });
  }
});

// POST alias for delete (browsers may not send body with DELETE)
router.post('/admin/logs/delete', authenticateToken, requireRole('admin'), async (req, res) => {
  // Reuse the DELETE handler logic
  try {
    const { logIds, deleteAll, filters } = req.body;
    let result;
    if (logIds && Array.isArray(logIds) && logIds.length > 0) {
      const placeholders = logIds.map((_, i) => `$${i + 1}`).join(', ');
      result = await query(`DELETE FROM email_system_logs WHERE id IN (${placeholders})`, logIds);
    } else if (deleteAll) {
      if (filters && typeof filters === 'object' && Object.keys(filters).length > 0) {
        const conditions = [];
        const params = [];
        if (filters.level) { params.push(filters.level); conditions.push(`level = $${params.length}`); }
        if (filters.category) { params.push(filters.category); conditions.push(`category = $${params.length}`); }
        if (filters.startDate) { params.push(parseInt(filters.startDate)); conditions.push(`created_at >= $${params.length}`); }
        if (filters.endDate) { params.push(parseInt(filters.endDate)); conditions.push(`created_at <= $${params.length}`); }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        result = await query(`DELETE FROM email_system_logs ${whereClause}`, params);
      } else {
        result = await query('DELETE FROM email_system_logs');
      }
    } else {
      return res.status(400).json({ error: 'Provide logIds array or deleteAll flag' });
    }
    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('[AdminLogs] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete logs' });
  }
});

/**
 * GET /admin/logs/summary — summary stats for the admin dashboard
 */
router.get('/admin/logs/summary', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const [errorCount, warnCount, lastInbound, lastOutbound, totalLogs] = await Promise.all([
      query(
        `SELECT COUNT(*) as count FROM email_system_logs WHERE level = 'error' AND created_at >= $1`,
        [oneDayAgo]
      ),
      query(
        `SELECT COUNT(*) as count FROM email_system_logs WHERE level = 'warn' AND created_at >= $1`,
        [oneDayAgo]
      ),
      query(
        `SELECT created_at FROM email_system_logs WHERE category = 'inbound' ORDER BY created_at DESC LIMIT 1`
      ),
      query(
        `SELECT created_at FROM email_system_logs WHERE category = 'outbound' ORDER BY created_at DESC LIMIT 1`
      ),
      query(
        `SELECT COUNT(*) as count FROM email_system_logs`
      ),
    ]);

    res.json({
      errorCount24h: parseInt(errorCount.rows[0].count),
      warnCount24h: parseInt(warnCount.rows[0].count),
      lastInbound: lastInbound.rows[0]?.created_at || null,
      lastOutbound: lastOutbound.rows[0]?.created_at || null,
      totalLogs: parseInt(totalLogs.rows[0].count),
    });
  } catch (err) {
    console.error('[AdminLogs] Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch log summary' });
  }
});

export default router;
