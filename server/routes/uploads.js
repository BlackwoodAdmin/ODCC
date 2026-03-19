import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import fs from 'fs/promises';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

const router = Router();

router.post('/image', authenticateToken, requireRole('admin', 'contributor'), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No valid image file provided. Accepted formats: JPEG, PNG, WebP.' });

    // Validate actual file content via sharp metadata (magic bytes)
    let metadata;
    try {
      metadata = await sharp(req.file.buffer, { limitInputPixels: 25_000_000 }).metadata();
    } catch {
      return res.status(400).json({ error: 'Invalid image file. Could not read image data.' });
    }

    if (!['jpeg', 'png', 'webp', 'gif', 'tiff'].includes(metadata.format)) {
      return res.status(400).json({ error: 'Unsupported image format.' });
    }

    // Convert to WebP and resize
    const processed = await sharp(req.file.buffer, { limitInputPixels: 25_000_000 })
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const outputMeta = await sharp(processed).metadata();
    const hex = crypto.randomBytes(4).toString('hex');
    const filename = `img_${Date.now()}_${hex}.webp`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    // Verify output path is within uploads dir
    const resolved = path.resolve(outputPath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
      return res.status(500).json({ error: 'Invalid output path' });
    }

    await fs.writeFile(outputPath, processed);

    res.json({ url: `/uploads/${filename}`, width: outputMeta.width, height: outputMeta.height });
  } catch (err) {
    if (err.code === 'ENOSPC') {
      return res.status(507).json({ error: 'Server disk is full. Contact administrator.' });
    }
    console.error('[Uploads] Image upload failed:', err);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

export default router;
