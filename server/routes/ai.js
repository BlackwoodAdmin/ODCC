import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

const router = Router();

const AI_TEXT_MODEL = process.env.AI_TEXT_MODEL || 'gpt-4o-mini';

// Load email templates for newsletter AI generation
let emailTemplates = {};
try {
  const templatesPath = path.join(__dirname, '..', 'data', 'email-templates.json');
  emailTemplates = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
} catch {
  console.warn('[AI] Could not load email-templates.json');
}

// --- In-memory rate limiting (resets on restart, acceptable for 2 admins) ---
const rateLimits = new Map();

function rateLimit(maxPerHour) {
  return (req, res, next) => {
    const userId = req.user.id;
    const hourBucket = Math.floor(Date.now() / 3600000);
    const key = `${userId}:${hourBucket}:${req.route.path}`;
    const entry = rateLimits.get(key) || { count: 0 };
    if (entry.count >= maxPerHour) {
      return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    }
    entry.count++;
    rateLimits.set(key, entry);
    if (rateLimits.size > 500) {
      for (const [k] of rateLimits) {
        const bucket = parseInt(k.split(':')[1]);
        if (bucket < hourBucket) rateLimits.delete(k);
      }
    }
    next();
  };
}

// --- Initialize OpenAI client ---
let openaiClient = null;
let openaiReady = false;
(async () => {
  if (process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = (await import('openai')).default;
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      openaiReady = true;
      console.log('[AI] OpenAI client initialized');
    } catch (err) {
      console.error('[AI] Failed to initialize OpenAI:', err.message);
    }
  }
})();

// --- Status endpoint ---
router.get('/status', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({ available: !!process.env.OPENAI_API_KEY && openaiReady });
});

// --- Middleware: check API key ---
function requireOpenAI(req, res, next) {
  if (!process.env.OPENAI_API_KEY || !openaiClient) {
    return res.status(501).json({ error: 'AI features not configured' });
  }
  next();
}

// --- POST /api/ai/generate — text generation (non-streaming JSON response) ---
router.post('/generate',
  authenticateToken, requireRole('admin'), requireOpenAI, rateLimit(60),
  async (req, res) => {
    const { type, prompt, currentContent, action } = req.body;

    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required' });
    if (prompt.length > 2000) return res.status(400).json({ error: 'prompt too long (max 2000 chars)' });
    if (currentContent && currentContent.length > 50000) return res.status(400).json({ error: 'currentContent too long (max 50000 chars)' });
    if (!['newsletter', 'blog'].includes(type)) return res.status(400).json({ error: 'type must be "newsletter" or "blog"' });
    if (!['write', 'rewrite', 'improve', 'shorten', 'expand'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

    let systemPrompt;
    if (type === 'newsletter') {
      systemPrompt = `You generate email-safe HTML using table-based layout and inline styles for newsletters. Content is for Open Door Christian Church (DeLand, FL).

Use these table-based patterns for layout (inline styles required for email):
- Headings: <table width="100%"><tr><td style="padding:20px 0 8px;font-size:22px;font-weight:bold;color:#1f2937;">Heading</td></tr></table>
- Text blocks: <table width="100%"><tr><td style="padding:16px 0;color:#4b5563;font-size:15px;line-height:1.6;">Text here</td></tr></table>
- Buttons: <table width="100%"><tr><td align="center" style="padding:20px 0;"><table><tr><td style="background:#7C9A72;border-radius:8px;"><a href="URL" style="display:inline-block;padding:14px 36px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;">Button Text</a></td></tr></table></td></tr></table>
- Dividers: <table width="100%"><tr><td style="padding:20px 0;"><hr style="border:none;border-top:1px solid #e5e7eb;" /></td></tr></table>

IMAGES: Do NOT include any image tags or image placeholders. Images will be added separately by the user. Focus only on text content and layout.

Output ONLY the body content HTML, not a full email document. Do not include <html>, <head>, or <body> tags.`;
    } else {
      systemPrompt = 'You generate clean HTML for blog posts. Use semantic tags (h2, h3, p, ul, ol, blockquote, img). Content is for Open Door Christian Church\'s blog (DeLand, FL). Output ONLY the HTML content, no surrounding document tags.';
    }

    const actionInstructions = {
      write: 'Generate new content based on the user\'s description.',
      rewrite: 'Completely rewrite the existing content with a fresh approach while keeping the core message.',
      improve: 'Improve the existing content — better wording, clearer structure, more engaging tone.',
      shorten: 'Condense the existing content while preserving the key points.',
      expand: 'Expand the existing content with more detail, examples, or supporting points.',
    };
    systemPrompt += `\n\nAction: ${actionInstructions[action]}`;

    const messages = [{ role: 'system', content: systemPrompt }];
    if (currentContent && action !== 'write') {
      messages.push({ role: 'user', content: `Here is the existing content:\n\n${currentContent}\n\nUser request: ${prompt}` });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    try {
      console.log('[AI] Generate request:', { type, action, promptLength: prompt.length });
      const response = await openaiClient.chat.completions.create({
        model: AI_TEXT_MODEL,
        messages,
        max_tokens: 4096,
      });

      const content = response.choices?.[0]?.message?.content || '';
      console.log('[AI] Generate complete:', { contentLength: content.length });
      res.json({ content });
    } catch (err) {
      console.error('[AI] Generate error:', err.message || err);
      if (err.status === 429) {
        return res.status(429).json({ error: 'Rate limited by AI provider. Try again later.' });
      }
      res.status(502).json({ error: 'AI service temporarily unavailable' });
    }
  }
);

// --- POST /api/ai/generate-image — DALL-E 3 image generation ---
router.post('/generate-image',
  authenticateToken, requireRole('admin'), requireOpenAI, rateLimit(20),
  async (req, res) => {
    const { prompt, size } = req.body;

    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required' });
    if (prompt.length > 2000) return res.status(400).json({ error: 'prompt too long (max 2000 chars)' });
    const allowedSizes = ['1024x1024', '1792x1024', '1024x1792'];
    if (size && !allowedSizes.includes(size)) return res.status(400).json({ error: `size must be one of: ${allowedSizes.join(', ')}` });

    const fullPrompt = `${prompt}. Warm, inviting, suitable for a church community. No text in the image.`;

    try {
      console.log('[AI] Image generation request:', { promptLength: prompt.length, size });
      const response = await openaiClient.images.generate({
        model: 'dall-e-3',
        prompt: fullPrompt,
        n: 1,
        size: size || '1024x1024',
      });

      const imageUrl = response.data[0]?.url;
      if (!imageUrl) return res.status(502).json({ error: 'AI service returned no image' });

      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) return res.status(502).json({ error: 'Failed to download generated image' });

      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

      const sharp = (await import('sharp')).default;
      let processed;
      try {
        processed = await sharp(imageBuffer, { limitInputPixels: 25_000_000 })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        return res.status(502).json({ error: 'Generated image was invalid' });
      }

      const outputMeta = await sharp(processed).metadata();
      const hex = crypto.randomBytes(4).toString('hex');
      const filename = `ai_${Date.now()}_${hex}.webp`;
      const outputPath = path.join(UPLOADS_DIR, filename);

      const resolved = path.resolve(outputPath);
      if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
        return res.status(500).json({ error: 'Invalid output path' });
      }

      const { writeFile } = await import('fs/promises');
      await writeFile(outputPath, processed);

      console.log('[AI] Image generated:', filename);
      res.json({ url: `/uploads/${filename}`, width: outputMeta.width, height: outputMeta.height });
    } catch (err) {
      console.error('[AI] Image generation error:', err.message || err);
      if (err.status === 429) {
        return res.status(429).json({ error: 'Rate limited by AI provider. Try again later.', retryAfter: err.headers?.['retry-after'] });
      }
      if (err.status === 400 && err.message?.includes('content_policy')) {
        return res.status(422).json({ error: `Content policy rejection: ${err.message}` });
      }
      res.status(502).json({ error: 'AI image generation temporarily unavailable' });
    }
  }
);

// --- POST /api/ai/suggest-images — suggest image prompts based on content ---
router.post('/suggest-images',
  authenticateToken, requireRole('admin'), requireOpenAI, rateLimit(60),
  async (req, res) => {
    const { content } = req.body;

    if (!content || typeof content !== 'string') return res.status(400).json({ error: 'content is required' });
    if (content.length > 50000) return res.status(400).json({ error: 'content too long (max 50000 chars)' });

    try {
      const response = await openaiClient.chat.completions.create({
        model: AI_TEXT_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You analyze newsletter or blog content and suggest 2-3 relevant image prompts for DALL-E image generation. Each suggestion should be a detailed, visual description suitable for AI image generation. Return a JSON object with this exact structure: {"suggestions": [{"prompt": "detailed visual description...", "placement": "hero"}, {"prompt": "...", "placement": "inline"}]}. placement is either "hero" (banner/header image) or "inline" (within content).'
          },
          {
            role: 'user',
            content: `Suggest image prompts for this church newsletter/blog content:\n\n${content.substring(0, 5000)}`
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      });

      const text = response.choices[0]?.message?.content || '{}';
      console.log('[AI] Suggest images raw response:', text.substring(0, 300));
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return res.status(502).json({ error: 'AI returned invalid response' });
      }

      // Extract suggestions array — model may use different key names
      let suggestions = [];
      if (Array.isArray(parsed)) {
        suggestions = parsed;
      } else if (typeof parsed === 'object') {
        const firstArrayVal = Object.values(parsed).find(v => Array.isArray(v));
        suggestions = firstArrayVal || [];
      }
      res.json({ suggestions: suggestions.slice(0, 3) });
    } catch (err) {
      console.error('[AI] Suggest images error:', err.message || err);
      if (err.status === 429) {
        return res.status(429).json({ error: 'Rate limited. Try again later.' });
      }
      res.status(502).json({ error: 'AI service temporarily unavailable' });
    }
  }
);

export default router;
