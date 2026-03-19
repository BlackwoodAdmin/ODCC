/**
 * One-time migration: convert blog post content from plain text to HTML.
 *
 * IMPORTANT:
 * - Run on a pg_dump copy first to inspect results
 * - Run BEFORE deploying the new rendering code (which drops \n-><br> conversion)
 * - This script is idempotent — it only processes posts with content_format = 'text'
 *
 * Usage: node server/scripts/migrate-blog-content.js
 */
import 'dotenv/config';
import pg from 'pg';
import sanitizeHtml from 'sanitize-html';
import { SANITIZE_OPTIONS } from '../data/sanitize-config.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();

  try {
    // Step 1: Add content_format column
    console.log('[Migration] Step 1: Adding content_format column...');
    await client.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'text'");

    // Step 2: Add backup column and back up existing content
    console.log('[Migration] Step 2: Backing up existing content...');
    await client.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_plain_backup TEXT');
    await client.query("UPDATE posts SET content_plain_backup = content WHERE content_format = 'text' AND content_plain_backup IS NULL");

    // Step 3: HTML-encode plain text, then convert to HTML structure
    // CRITICAL: Encode &, <, > BEFORE wrapping in <p> tags to prevent data loss
    console.log('[Migration] Step 3: Converting plain text to HTML...');
    await client.query(`
      UPDATE posts
      SET content = '<p>' || REPLACE(REPLACE(
          REPLACE(REPLACE(REPLACE(content, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
          E'\\n\\n', '</p><p>'), E'\\n', '<br>') || '</p>'
      WHERE content_format = 'text'
    `);

    // Step 4: Sanitize all converted content inside a transaction
    // content_format is only set to 'html' after successful sanitization
    console.log('[Migration] Step 4: Sanitizing converted content...');
    await client.query('BEGIN');
    try {
      const result = await client.query("SELECT id, content FROM posts WHERE content_format = 'text'");
      console.log(`[Migration] Processing ${result.rows.length} posts...`);

      for (const post of result.rows) {
        const clean = sanitizeHtml(post.content, SANITIZE_OPTIONS);
        await client.query(
          "UPDATE posts SET content = $1, content_format = 'html' WHERE id = $2",
          [clean, post.id]
        );
      }
      await client.query('COMMIT');
      console.log(`[Migration] Successfully migrated ${result.rows.length} posts.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Migration] Sanitization failed, rolled back:', err);
      throw err;
    }

    // Step 5: Verify
    const remaining = await client.query("SELECT COUNT(*) FROM posts WHERE content_format = 'text'");
    const migrated = await client.query("SELECT COUNT(*) FROM posts WHERE content_format = 'html'");
    console.log(`[Migration] Complete: ${migrated.rows[0].count} migrated, ${remaining.rows[0].count} remaining (should be 0).`);
    console.log('[Migration] Visually inspect posts on the site before deploying new rendering code.');
    console.log('[Migration] The content_plain_backup column can be dropped after verification.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('[Migration] Fatal error:', err);
  process.exit(1);
});
