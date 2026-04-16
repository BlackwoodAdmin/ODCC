// Runs once before any tests. Loads .env.test and bootstraps schema.
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.test') });

if (!process.env.DATABASE_URL?.includes('odcc_test')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not point to the test DB. Got: ${process.env.DATABASE_URL}`
  );
}

const { initializeDatabase, pool } = await import('../server/db.js');
await initializeDatabase();

// Clean all tables once at start of test run. Per-suite resets happen via helpers/db.js.
await pool.query(`
  TRUNCATE TABLE
    stripe_webhook_events, donations, donation_subscriptions,
    comments, posts, events,
    newsletter_sends, newsletters,
    contact_submissions,
    password_reset_tokens,
    email_audit_log, email_system_logs, email_auto_reply_log,
    email_attachments, email_messages, email_folders, email_contacts,
    email_auto_replies, email_aliases, email_accounts,
    users
  RESTART IDENTITY CASCADE
`);
