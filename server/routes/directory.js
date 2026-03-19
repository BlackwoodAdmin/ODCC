import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, phone, profile_image, directory_phone
       FROM users
       WHERE directory_listed = TRUE AND password_hash IS NOT NULL
       ORDER BY name ASC`
    );

    const members = result.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.directory_phone ? u.phone : null,
      profile_image: u.profile_image,
    }));

    res.json({ members });
  } catch (err) {
    console.error('Directory fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch directory' });
  }
});

export default router;
