/**
 * Rollback: restore blog post content from plain text backup.
 *
 * Use this if:
 * - The migration produced bad output
 * - You need to roll back to the old rendering code (\n -> <br>)
 *
 * After running this, redeploy the old code version.
 *
 * Usage: node server/scripts/rollback-blog-content.js
 */
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function rollback() {
  const result = await pool.query(
    "SELECT COUNT(*) FROM posts WHERE content_plain_backup IS NOT NULL"
  );
  const count = parseInt(result.rows[0].count);

  if (count === 0) {
    console.log('[Rollback] No posts have backup content. Nothing to rollback.');
    await pool.end();
    return;
  }

  console.log(`[Rollback] Restoring ${count} posts from content_plain_backup...`);

  await pool.query(`
    UPDATE posts
    SET content = content_plain_backup, content_format = 'text'
    WHERE content_plain_backup IS NOT NULL
  `);

  console.log(`[Rollback] Done. ${count} posts restored to plain text.`);
  console.log('[Rollback] Redeploy the old code version that uses \\n -> <br> rendering.');

  await pool.end();
}

rollback().catch(err => {
  console.error('[Rollback] Fatal error:', err);
  process.exit(1);
});
