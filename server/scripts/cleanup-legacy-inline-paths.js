/**
 * One-time cleanup: rewrite legacy inline-image references in stored email HTML.
 *
 * Older versions of server/routes/email-inbound.js rewrote `cid:<content_id>`
 * references in body_html to `/data/attachments/<uuid>/<basename>` — a path
 * that Express never served. The current message-fetch path resolves both
 * `cid:` and that legacy form to data URIs at read time. After this script
 * runs once in production, the legacy regex branch in email-messages.js
 * (rewriteInlineImages → pathMap) can be deleted.
 *
 * Usage:  node server/scripts/cleanup-legacy-inline-paths.js
 *         node server/scripts/cleanup-legacy-inline-paths.js --dry-run
 *
 * Idempotent. Only updates rows whose body_html contains '/data/attachments/'.
 */
import 'dotenv/config';
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');

function regexEscape(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let scanned = 0;
  let rewritten = 0;
  let unresolved = 0;

  try {
    const messages = await client.query(
      `SELECT id, body_html FROM email_messages
       WHERE body_html IS NOT NULL AND body_html LIKE '%/data/attachments/%'`
    );
    console.log(`[Cleanup] ${messages.rowCount} candidate messages`);

    for (const msg of messages.rows) {
      scanned++;
      const atts = await client.query(
        `SELECT content_id, storage_path FROM email_attachments
         WHERE message_id = $1 AND content_id IS NOT NULL AND storage_path IS NOT NULL`,
        [msg.id]
      );

      let html = msg.body_html;
      let changed = false;

      for (const att of atts.rows) {
        // storage_path is "attachments/<uuid>/<basename>"; the in-HTML legacy
        // form is "/data/attachments/<uuid>/<basename>".
        const inHtmlPath = '/data/' + String(att.storage_path).replace(/^\/+/, '');
        const re = new RegExp(regexEscape(inHtmlPath), 'g');
        if (!re.test(html)) continue;
        // Function form of replace — content IDs cannot contain `$` issues
        // here (we're substituting with the literal cid: form), but use it
        // for consistency.
        html = html.replace(re, () => `cid:${att.content_id}`);
        changed = true;
      }

      // If the row still contains '/data/attachments/' after rewrites, the
      // attachment row(s) needed to resolve it are missing — log and skip.
      if (html.includes('/data/attachments/')) {
        unresolved++;
        console.log(`[Cleanup] message ${msg.id}: unresolved /data/attachments/ refs (missing attachment rows)`);
      }

      if (!changed) continue;
      rewritten++;
      if (DRY_RUN) continue;
      await client.query('UPDATE email_messages SET body_html = $1 WHERE id = $2', [html, msg.id]);
    }

    console.log(`[Cleanup] scanned=${scanned} rewritten=${rewritten} unresolved=${unresolved} dryRun=${DRY_RUN}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[Cleanup] fatal:', err);
  process.exit(1);
});
