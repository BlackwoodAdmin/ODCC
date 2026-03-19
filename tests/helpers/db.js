import { Pool } from 'pg';

let testPool = null;

export function getTestDb() {
  if (!testPool) {
    testPool = globalThis.testDb;
  }
  return testPool;
}

export async function cleanupTestDb() {
  const db = getTestDb();
  try {
    await db.query('TRUNCATE TABLE password_reset_tokens CASCADE');
    await db.query('TRUNCATE TABLE donation_messages CASCADE');
    await db.query('TRUNCATE TABLE donations CASCADE');
    await db.query('TRUNCATE TABLE email_messages CASCADE');
    await db.query('TRUNCATE TABLE email_audit_log CASCADE');
    await db.query('TRUNCATE TABLE email_rate_limits CASCADE');
    await db.query('TRUNCATE TABLE posts CASCADE');
    await db.query('TRUNCATE TABLE comments CASCADE');
    await db.query('TRUNCATE TABLE users CASCADE');
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

export async function seedTestData(fixtures) {
  const db = getTestDb();
  const results = {};
  try {
    for (const [key, data] of Object.entries(fixtures)) {
      if (data.type === 'user') {
        const result = await db.query(
          'INSERT INTO users (email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [data.email, data.password_hash, data.name, data.role || 'member', Date.now(), Date.now()]
        );
        results[key] = result.rows[0];
      } else if (data.type === 'post') {
        const result = await db.query(
          'INSERT INTO posts (title, slug, body, status, author_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [data.title, data.slug, data.body, data.status || 'published', data.author_id, Date.now(), Date.now()]
        );
        results[key] = result.rows[0];
      }
    }
  } catch (err) {
    console.error('Seed error:', err);
  }
  return results;
}

export async function queryTestDb(sql, params) {
  const db = getTestDb();
  return db.query(sql, params);
}

export async function getTestUser(id) {
  const db = getTestDb();
  const result = await db.query('SELECT * FROM users WHERE id=$1', [id]);
  return result.rows[0] || null;
}

export async function getTestPost(id) {
  const db = getTestDb();
  const result = await db.query('SELECT * FROM posts WHERE id=$1', [id]);
  return result.rows[0] || null;
}