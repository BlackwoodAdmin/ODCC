import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import sanitizeHtml from 'sanitize-html';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { SANITIZE_OPTIONS } from '../data/sanitize-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'public', 'uploads'),
    filename: (req, file, cb) => cb(null, `post_${Date.now()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype))
});

const router = Router();

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT p.*, u.name as author_name FROM posts p JOIN users u ON p.author_id=u.id WHERE p.status='published' ORDER BY p.published_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const count = await query("SELECT COUNT(*) FROM posts WHERE status='published'");
    res.json({ posts: result.rows, total: parseInt(count.rows[0].count), page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

router.get('/all', authenticateToken, requireRole('admin','contributor'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    let result;
    if (req.user.role === 'admin') {
      result = await query('SELECT p.*, u.name as author_name FROM posts p JOIN users u ON p.author_id=u.id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    } else {
      result = await query('SELECT p.*, u.name as author_name FROM posts p JOIN users u ON p.author_id=u.id WHERE p.author_id=$1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3', [req.user.id, limit, offset]);
    }
    res.json({ posts: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const result = await query(
      'SELECT p.*, u.name as author_name FROM posts p JOIN users u ON p.author_id=u.id WHERE p.slug=$1',
      [req.params.slug]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json({ post: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

router.post('/', authenticateToken, requireRole('admin','contributor'), upload.single('image'), async (req, res) => {
  try {
    const { title, content, excerpt, status = 'draft', slug: customSlug, published_at: customPublishedAt } = req.body;
    const cleanContent = sanitizeHtml(content, SANITIZE_OPTIONS);
    const slug = customSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const now = Date.now();
    const publishedAt = customPublishedAt ? parseInt(customPublishedAt) : (status === 'published' ? now : null);
    // Handle slug collisions by appending -2, -3, etc.
    let finalSlug = slug;
    const existing = await query('SELECT slug FROM posts WHERE slug LIKE $1', [slug + '%']);
    if (existing.rows.length) {
      const taken = new Set(existing.rows.map(r => r.slug));
      if (taken.has(slug)) {
        let suffix = 2;
        while (taken.has(`${slug}-${suffix}`)) suffix++;
        finalSlug = `${slug}-${suffix}`;
      }
    }
    const result = await query(
      'INSERT INTO posts (title,slug,content,excerpt,featured_image,author_id,status,published_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [title, finalSlug, cleanContent, excerpt, image, req.user.id, status, publishedAt, now, now]
    );
    res.status(201).json({ post: result.rows[0] });
  } catch (err) {
    if (err.code === '23505' && err.constraint?.includes('slug')) {
      return res.status(409).json({ error: 'A post with a similar title already exists. Please change the title.' });
    }
    res.status(500).json({ error: 'Failed to create post' });
  }
});

router.put('/:id', authenticateToken, requireRole('admin','contributor'), upload.single('image'), async (req, res) => {
  try {
    const post = await query('SELECT * FROM posts WHERE id=$1', [req.params.id]);
    if (!post.rows.length) return res.status(404).json({ error: 'Post not found' });
    if (req.user.role !== 'admin' && post.rows[0].author_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    const { title, content, excerpt, status, slug: customSlug, published_at: customPublishedAt } = req.body;
    const cleanContent = content ? sanitizeHtml(content, SANITIZE_OPTIONS) : post.rows[0].content;
    let slug = customSlug || (title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : post.rows[0].slug);
    const image = req.file ? `/uploads/${req.file.filename}` : post.rows[0].featured_image;
    const now = Date.now();
    const publishedAt = customPublishedAt ? parseInt(customPublishedAt) : (status === 'published' && !post.rows[0].published_at ? now : post.rows[0].published_at);
    
    // Only check for slug collisions if slug is being changed
    if (slug !== post.rows[0].slug) {
      const existing = await query('SELECT id, slug FROM posts WHERE slug LIKE $1 AND id != $2', [slug + '%', req.params.id]);
      if (existing.rows.length) {
        const taken = new Set(existing.rows.map(r => r.slug));
        if (taken.has(slug)) {
          let suffix = 2;
          while (taken.has(`${slug}-${suffix}`)) suffix++;
          slug = `${slug}-${suffix}`;
        }
      }
    }
    
    const result = await query(
      'UPDATE posts SET title=$1,slug=$2,content=$3,excerpt=$4,featured_image=$5,status=$6,published_at=$7,updated_at=$8 WHERE id=$9 RETURNING *',
      [title || post.rows[0].title, slug, cleanContent, excerpt || post.rows[0].excerpt, image, status || post.rows[0].status, publishedAt, now, req.params.id]
    );
    res.json({ post: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

export default router;