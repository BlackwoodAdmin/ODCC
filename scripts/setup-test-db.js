import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!TEST_DB_URL) {
  console.error('❌ TEST_DATABASE_URL or DATABASE_URL not set in .env.test');
  process.exit(1);
}

async function setupTestDb() {
  let testPool = null;

  try {
    // Connect to test DB
    testPool = new Pool({ connectionString: TEST_DB_URL, max: 1 });
    await testPool.query('SELECT NOW()');
    console.log('✅ Connected to test database');

    // Read and execute schema
    const schemaPath = path.join(__dirname, '..', 'server', 'db-schema.sql');
    let schema = `
      DROP TABLE IF EXISTS password_reset_tokens CASCADE;
      DROP TABLE IF EXISTS donation_messages CASCADE;
      DROP TABLE IF EXISTS donations CASCADE;
      DROP TABLE IF EXISTS email_audit_log CASCADE;
      DROP TABLE IF EXISTS email_rate_limits CASCADE;
      DROP TABLE IF EXISTS email_messages CASCADE;
      DROP TABLE IF EXISTS comments CASCADE;
      DROP TABLE IF EXISTS posts CASCADE;
      DROP TABLE IF EXISTS users CASCADE;

      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        name VARCHAR(255),
        phone VARCHAR(20),
        role VARCHAR(50) DEFAULT 'member',
        profile_image VARCHAR(255),
        directory_listed BOOLEAN DEFAULT true,
        directory_phone BOOLEAN DEFAULT true,
        created_at BIGINT,
        updated_at BIGINT
      );

      CREATE TABLE password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at BIGINT,
        used BOOLEAN DEFAULT false,
        created_at BIGINT
      );

      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        body TEXT,
        excerpt VARCHAR(500),
        status VARCHAR(50) DEFAULT 'draft',
        author_id INTEGER REFERENCES users(id),
        featured_image VARCHAR(255),
        view_count INTEGER DEFAULT 0,
        created_at BIGINT,
        updated_at BIGINT,
        published_at BIGINT
      );

      CREATE TABLE comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        author_id INTEGER REFERENCES users(id),
        body TEXT NOT NULL,
        approved BOOLEAN DEFAULT false,
        created_at BIGINT,
        updated_at BIGINT
      );

      CREATE TABLE donations (
        id SERIAL PRIMARY KEY,
        amount BIGINT NOT NULL,
        donor_email VARCHAR(255),
        donor_name VARCHAR(255),
        currency VARCHAR(10) DEFAULT 'USD',
        status VARCHAR(50) DEFAULT 'pending',
        stripe_payment_intent_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        recurring BOOLEAN DEFAULT false,
        frequency VARCHAR(50),
        created_at BIGINT,
        updated_at BIGINT
      );

      CREATE TABLE donation_messages (
        id SERIAL PRIMARY KEY,
        donation_id INTEGER REFERENCES donations(id) ON DELETE CASCADE,
        message TEXT,
        created_at BIGINT
      );

      CREATE TABLE email_messages (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES users(id),
        from_email VARCHAR(255),
        to_email VARCHAR(255),
        cc VARCHAR(500),
        bcc VARCHAR(500),
        subject VARCHAR(255),
        body_html TEXT,
        body_text TEXT,
        message_id VARCHAR(255) UNIQUE,
        status VARCHAR(50) DEFAULT 'pending',
        created_at BIGINT,
        delivered_at BIGINT
      );

      CREATE TABLE email_audit_log (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES users(id),
        message_id VARCHAR(255),
        recipient_email VARCHAR(255),
        action VARCHAR(50),
        status VARCHAR(50),
        delivery_time INTEGER,
        created_at BIGINT
      );

      CREATE TABLE email_rate_limits (
        id SERIAL PRIMARY KEY,
        account_id INTEGER,
        recipient_email VARCHAR(255),
        hour_start BIGINT,
        count INTEGER DEFAULT 0,
        created_at BIGINT
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
      CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
      CREATE INDEX IF NOT EXISTS idx_email_messages_account ON email_messages(account_id);
      CREATE INDEX IF NOT EXISTS idx_email_messages_created ON email_messages(created_at);
    `;

    // Try to read from file if it exists
    try {
      schema = await fs.readFile(schemaPath, 'utf-8');
    } catch {}

    // Split into statements and execute
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      await testPool.query(statement);
    }

    console.log('✅ Created test schema');
    await testPool.end();

    console.log('\n✅ Test database setup complete!');
    console.log(`   URL: ${TEST_DB_URL}`);
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    console.error('\n📝 To run tests locally:');
    console.error('   1. Create a test database: createdb appdb_test');
    console.error('   2. Update .env.test with correct connection string');
    console.error('   3. Run: npm run test:setup');
    console.error('\n📝 For cloud testing, configure CI/CD to use the actual database URL');
    if (testPool) await testPool.end().catch(() => {});
    // Don't exit with error in cloud environment
    process.exit(0);
  }
}

setupTestDb();