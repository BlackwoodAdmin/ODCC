import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Load test environment
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-12345';
process.env.SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || 'SG.test-key';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_123456789';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || 'test-turnstile-secret';
process.env.SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

// Global test database pool
let globalTestDb = null;

// Initialize test database connection
beforeAll(async () => {
  try {
    const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.warn('⚠️  TEST_DATABASE_URL not set, skipping database tests');
      return;
    }
    globalTestDb = new Pool({
      connectionString: dbUrl,
      max: 1,
    });
    await globalTestDb.query('SELECT NOW()');
    globalThis.testDb = globalTestDb;
    console.log('✅ Test database connected');
  } catch (err) {
    console.warn('⚠️  Could not connect to test database:', err.message);
    globalTestDb = null;
  }
});

// Clean database after each test
afterEach(async () => {
  if (globalTestDb) {
    try {
      // Truncate tables in order of foreign keys
      const tables = [
        'password_reset_tokens',
        'donation_messages',
        'donations',
        'email_messages',
        'email_audit_log',
        'email_rate_limits',
        'posts',
        'comments',
        'users',
      ];
      for (const table of tables) {
        try {
          await globalTestDb.query(`TRUNCATE TABLE ${table} CASCADE`);
        } catch {}
      }
    } catch (err) {
      // Silently fail if cleanup doesn't work
    }
  }
});

// Close database connection
afterAll(async () => {
  if (globalTestDb) {
    await globalTestDb.end().catch(() => {});
  }
});

// Global mocks for external services
vi.mock('sendgrid', () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn().mockResolvedValue([{ statusCode: 202 }]),
  },
}));

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    paymentIntents: {
      create: vi.fn().mockResolvedValue({ client_secret: 'pi_test_secret', id: 'pi_123' }),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({ id: 'sub_123', status: 'active' }),
      cancel: vi.fn().mockResolvedValue({ id: 'sub_123', status: 'canceled' }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  })),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Generated content' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      },
    },
  })),
}));
