import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export { pool };
export const query = (text, params) => pool.query(text, params);

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'subscriber' CHECK (role IN ('subscriber','contributor','admin')),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      slug VARCHAR(500) UNIQUE NOT NULL,
      content TEXT NOT NULL,
      excerpt VARCHAR(1000),
      featured_image VARCHAR(500),
      recurrence VARCHAR(20),
      day_of_week INTEGER,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
      published_at BIGINT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_name VARCHAR(255) NOT NULL,
      author_email VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      approved BOOLEAN DEFAULT FALSE,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      description TEXT NOT NULL,
      location VARCHAR(500) NOT NULL,
      event_date DATE NOT NULL,
      event_time TIME,
      end_date DATE,
      end_time TIME,
      image VARCHAR(500),
      recurrence VARCHAR(20),
      day_of_week INTEGER,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      message TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at BIGINT NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_accounts (
      id SERIAL PRIMARY KEY,
      address VARCHAR(255) NOT NULL UNIQUE,
      display_name VARCHAR(255),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_role VARCHAR(20),
      forwarding_address VARCHAR(255),
      forwarding_mode VARCHAR(20) DEFAULT 'none',
      signature_html TEXT,
      auto_reply_allowed BOOLEAN DEFAULT FALSE,
      quota_mb INTEGER DEFAULT 500,
      used_mb NUMERIC(10,2) DEFAULT 0,
      is_catch_all BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      daily_send_count INTEGER DEFAULT 0,
      daily_send_limit INTEGER DEFAULT 100,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_aliases (
      id SERIAL PRIMARY KEY,
      alias_address VARCHAR(255) NOT NULL UNIQUE,
      account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_folders (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'custom',
      sort_order INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL,
      UNIQUE(account_id, name)
    );

    CREATE TABLE IF NOT EXISTS email_messages (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      folder_id INTEGER REFERENCES email_folders(id) ON DELETE SET NULL,
      message_id VARCHAR(512),
      in_reply_to VARCHAR(512),
      references_header TEXT,
      thread_id VARCHAR(512),
      from_address VARCHAR(255) NOT NULL,
      from_name VARCHAR(255),
      to_addresses JSONB NOT NULL DEFAULT '[]',
      cc_addresses JSONB DEFAULT '[]',
      bcc_addresses JSONB DEFAULT '[]',
      subject VARCHAR(1000),
      body_text TEXT,
      body_html TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      is_starred BOOLEAN DEFAULT FALSE,
      is_draft BOOLEAN DEFAULT FALSE,
      priority VARCHAR(10) DEFAULT 'normal',
      size_bytes INTEGER DEFAULT 0,
      spam_score NUMERIC(5,2),
      direction VARCHAR(10) NOT NULL,
      send_status VARCHAR(20),
      send_error TEXT,
      scheduled_send_at BIGINT,
      sent_at BIGINT,
      received_at BIGINT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_attachments (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
      filename VARCHAR(500) NOT NULL,
      content_type VARCHAR(255),
      size_bytes INTEGER NOT NULL,
      storage_path VARCHAR(1000) NOT NULL,
      content_id VARCHAR(255),
      is_blocked BOOLEAN DEFAULT FALSE,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_contacts (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      notes TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE(account_id, email)
    );

    CREATE TABLE IF NOT EXISTS email_auto_replies (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      is_enabled BOOLEAN DEFAULT FALSE,
      subject VARCHAR(500) DEFAULT 'Out of Office',
      body_html TEXT NOT NULL,
      start_date BIGINT,
      end_date BIGINT,
      reply_once_per_sender BOOLEAN DEFAULT TRUE,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE(account_id)
    );

    CREATE TABLE IF NOT EXISTS email_auto_reply_log (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      sender_address VARCHAR(255) NOT NULL,
      replied_at BIGINT NOT NULL,
      UNIQUE(account_id, sender_address)
    );

    CREATE TABLE IF NOT EXISTS email_audit_log (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES email_accounts(id),
      user_id INTEGER REFERENCES users(id),
      action VARCHAR(50) NOT NULL,
      message_id INTEGER REFERENCES email_messages(id),
      details JSONB,
      ip_address VARCHAR(45),
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_system_logs (
      id SERIAL PRIMARY KEY,
      level VARCHAR(10) NOT NULL,
      category VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      details JSONB,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS newsletters (
      id SERIAL PRIMARY KEY,
      subject VARCHAR(500) NOT NULL,
      body_html TEXT NOT NULL,
      body_text TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
      sent_at BIGINT,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS newsletter_sends (
      id SERIAL PRIMARY KEY,
      newsletter_id INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      error TEXT,
      sent_at BIGINT,
      UNIQUE(newsletter_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_newsletter_sends_status ON newsletter_sends(newsletter_id, status);

    CREATE TABLE IF NOT EXISTS donations (
      id SERIAL PRIMARY KEY,
      stripe_payment_intent_id VARCHAR(255) UNIQUE,
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      donor_name VARCHAR(255) NOT NULL,
      donor_email VARCHAR(255) NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'usd',
      type VARCHAR(20) NOT NULL CHECK (type IN ('one_time', 'recurring')),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'canceled')),
      receipt_sent BOOLEAN DEFAULT FALSE,
      receipt_number VARCHAR(50) UNIQUE,
      note VARCHAR(500),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donation_subscriptions (
      id SERIAL PRIMARY KEY,
      stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
      stripe_customer_id VARCHAR(255) NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      donor_name VARCHAR(255) NOT NULL,
      donor_email VARCHAR(255) NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'usd',
      status VARCHAR(20) NOT NULL DEFAULT 'incomplete'
        CHECK (status IN ('incomplete', 'incomplete_expired', 'active', 'canceled', 'past_due', 'unpaid', 'paused')),
      current_period_end BIGINT,
      canceled_at BIGINT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id SERIAL PRIMARY KEY,
      stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      processed_at BIGINT NOT NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
    CREATE INDEX IF NOT EXISTS idx_events_author ON events(author_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

    CREATE INDEX IF NOT EXISTS idx_email_messages_account_folder ON email_messages(account_id, folder_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_email_messages_received ON email_messages(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_messages_unread ON email_messages(account_id, folder_id) WHERE is_read = FALSE;
    CREATE INDEX IF NOT EXISTS idx_email_attachments_message ON email_attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_email_auto_reply_log_replied ON email_auto_reply_log(replied_at);
    CREATE INDEX IF NOT EXISTS idx_email_audit_account ON email_audit_log(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_system_logs_level ON email_system_logs(level, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_system_logs_category ON email_system_logs(category, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_system_logs_created ON email_system_logs(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_donations_email ON donations(donor_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id);
    CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
    CREATE INDEX IF NOT EXISTS idx_donations_created ON donations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_donations_subscription ON donations(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_donation_subs_email ON donation_subscriptions(donor_email);
    CREATE INDEX IF NOT EXISTS idx_donation_subs_status ON donation_subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_donation_subs_customer ON donation_subscriptions(stripe_customer_id);
  `);

  // These indexes use expressions/WHERE clauses not supported by IF NOT EXISTS in all PG versions
  // Use try/catch to avoid errors on re-runs
  const conditionalIndexes = [
    `CREATE UNIQUE INDEX idx_email_messages_account_message_id ON email_messages(account_id, message_id) WHERE message_id IS NOT NULL`,
    `CREATE UNIQUE INDEX idx_email_accounts_catch_all ON email_accounts((TRUE)) WHERE is_catch_all = TRUE`,
    `CREATE INDEX idx_email_messages_search ON email_messages USING gin(to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(body_text,'')))`,
  ];
  for (const sql of conditionalIndexes) {
    try { await pool.query(sql); } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }
  }
  // Schema migrations (safe to re-run)
  try { await pool.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS week_of_month INTEGER'); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS newsletter_opted_out BOOLEAN DEFAULT FALSE'); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'text'"); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_plain_backup TEXT'); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query("ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'contact'"); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)'); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS directory_listed BOOLEAN DEFAULT TRUE'); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS directory_phone BOOLEAN DEFAULT TRUE'); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500)'); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  try { await pool.query('ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS assigned_role VARCHAR(20)'); } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }
  // Allow NULL password_hash for newsletter-only subscribers
  try { await pool.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL'); } catch (e) {
    // Ignore if already nullable
  }

  console.log('Database initialized');
}

// Seed function removed — production DB is managed manually.
// To create an admin user on a fresh database, use:
//   node -e "import('./server/db.js').then(({query})=>import('bcryptjs').then(b=>b.hash('YOUR_PASSWORD',10).then(h=>query('INSERT INTO users (email,password_hash,name,role,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)',['admin@odcc.org',h,'Church Admin','admin',Date.now()]).then(()=>{console.log('Done');process.exit()}))))"
export async function seedDatabase() {
  // no-op — kept as export to avoid breaking server/index.js import
}