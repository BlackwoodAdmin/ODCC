import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import sharp from 'sharp';
import { query } from '../db.js';
import { JWT_SECRET } from '../config.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireTurnstile } from '../middleware/turnstile.js';
import { sendPasswordResetEmail } from '../email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

const router = Router();

// --- Rate limiting ---
const loginAttempts = new Map(); // ip -> { count, resetAt }
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW = 15 * 60 * 1000; // 15 minutes

const resetAttempts = new Map(); // email -> { count, resetAt }
const RESET_LIMIT = 3;
const RESET_WINDOW = 60 * 60 * 1000; // 1 hour

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of loginAttempts) {
    if (now > val.resetAt) loginAttempts.delete(key);
  }
  for (const [key, val] of resetAttempts) {
    if (now > val.resetAt) resetAttempts.delete(key);
  }
}, 10 * 60 * 1000);

function checkRateLimit(map, key, limit, windowMs) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

router.post('/register', requireTurnstile, async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const trimmedPhone = phone ? phone.trim().substring(0, 20) : null;

    const exists = await query('SELECT id, password_hash, role FROM users WHERE email=$1', [email]);

    if (exists.rows.length) {
      const existing = exists.rows[0];

      // If subscriber with no password, let them set one
      if (!existing.password_hash) {
        const hash = await bcrypt.hash(password, 10);
        const result = await query(
          'UPDATE users SET password_hash=$1, name=$2, phone=$3, updated_at=$4 WHERE id=$5 RETURNING id, email, name, role',
          [hash, name, trimmedPhone, Date.now(), existing.id]
        );
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ success: true, token, user });
      }

      return res.status(400).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const result = await query(
      'INSERT INTO users (email,password_hash,name,phone,role,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,email,name,role',
      [email, hash, name, trimmedPhone, 'subscriber', now, now]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', requireTurnstile, async (req, res) => {
  try {
    if (!checkRateLimit(loginAttempts, req.ip, LOGIN_LIMIT, LOGIN_WINDOW)) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    if (!user.password_hash) return res.status(401).json({ error: 'Please register first to set a password' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT id,email,name,role,phone,profile_image,directory_listed,directory_phone,created_at FROM users WHERE id=$1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, currentPassword, newPassword, directory_listed, directory_phone } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const trimmedName = name.trim().substring(0, 255);
    const trimmedPhone = phone ? phone.trim().substring(0, 20) : null;
    const dirListed = directory_listed !== false;
    const dirPhone = directory_phone !== false;

    // If changing password, verify current password first
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password is required to set a new password' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

      const userResult = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
      if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });

      const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

      const hash = await bcrypt.hash(newPassword, 10);
      const result = await query(
        'UPDATE users SET name=$1, phone=$2, password_hash=$3, directory_listed=$4, directory_phone=$5, updated_at=$6 WHERE id=$7 RETURNING id,email,name,role,phone,profile_image,directory_listed,directory_phone',
        [trimmedName, trimmedPhone, hash, dirListed, dirPhone, Date.now(), req.user.id]
      );
      return res.json({ success: true, user: result.rows[0] });
    }

    const result = await query(
      'UPDATE users SET name=$1, phone=$2, directory_listed=$3, directory_phone=$4, updated_at=$5 WHERE id=$6 RETURNING id,email,name,role,phone,profile_image,directory_listed,directory_phone',
      [trimmedName, trimmedPhone, dirListed, dirPhone, Date.now(), req.user.id]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/profile/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No valid image. Accepted: JPEG, PNG, WebP (max 3MB).' });

    let metadata;
    try {
      metadata = await sharp(req.file.buffer, { limitInputPixels: 25_000_000 }).metadata();
    } catch {
      return res.status(400).json({ error: 'Invalid image file.' });
    }
    if (!['jpeg', 'png', 'webp', 'gif', 'tiff'].includes(metadata.format)) {
      return res.status(400).json({ error: 'Unsupported image format.' });
    }

    const processed = await sharp(req.file.buffer, { limitInputPixels: 25_000_000 })
      .resize({ width: 400, height: 400, fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    const hex = crypto.randomBytes(4).toString('hex');
    const filename = `avatar_${req.user.id}_${hex}.webp`;
    const outputPath = path.join(UPLOADS_DIR, filename);
    const resolved = path.resolve(outputPath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
      return res.status(500).json({ error: 'Invalid output path' });
    }

    // Delete old avatar if exists
    const old = await query('SELECT profile_image FROM users WHERE id=$1', [req.user.id]);
    if (old.rows[0]?.profile_image) {
      const oldPath = path.join(UPLOADS_DIR, path.basename(old.rows[0].profile_image));
      await fs.unlink(oldPath).catch(() => {});
    }

    await fs.writeFile(outputPath, processed);
    const url = `/uploads/${filename}`;
    await query('UPDATE users SET profile_image=$1, updated_at=$2 WHERE id=$3', [url, Date.now(), req.user.id]);
    res.json({ success: true, url });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

router.post('/forgot-password', requireTurnstile, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!checkRateLimit(resetAttempts, email.toLowerCase(), RESET_LIMIT, RESET_WINDOW)) {
      return res.status(429).json({ error: 'Too many reset requests. Please try again later.' });
    }

    const result = await query('SELECT id FROM users WHERE email=$1', [email]);
    if (!result.rows.length) {
      // Don't reveal whether email exists
      return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    const userId = result.rows[0].id;

    await query('UPDATE password_reset_tokens SET used=TRUE WHERE user_id=$1 AND used=FALSE', [userId]);

    const token = crypto.randomBytes(48).toString('base64url');
    const expiresAt = Date.now() + 3600000;

    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at, used, created_at) VALUES ($1, $2, $3, FALSE, $4)',
      [userId, token, expiresAt, Date.now()]
    );

    // Send email (non-blocking — don't fail the request if email fails)
    sendPasswordResetEmail(email, token).catch(err => {
      console.error('[Auth] Failed to send reset email:', err);
    });

    res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const result = await query(
      'SELECT user_id, expires_at FROM password_reset_tokens WHERE token=$1 AND used=FALSE',
      [token]
    );

    if (!result.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const { user_id, expires_at } = result.rows[0];

    if (Date.now() > Number(expires_at)) {
      await query('UPDATE password_reset_tokens SET used=TRUE WHERE token=$1', [token]);
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash=$1, updated_at=$2 WHERE id=$3', [hash, Date.now(), user_id]);
    await query('UPDATE password_reset_tokens SET used=TRUE WHERE token=$1', [token]);

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
