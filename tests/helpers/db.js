import { pool, query } from '../../server/db.js';
import bcrypt from 'bcryptjs';

export { pool, query };

// Reset the tables a suite mutates. Pass a subset to keep it fast.
export async function resetTables(tables) {
  if (!tables?.length) return;
  await pool.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}

export async function createUser({
  email = 'user@test.local',
  name = 'Test User',
  role = 'subscriber',
  password = 'password123',
} = {}) {
  const passwordHash = await bcrypt.hash(password, 4);
  const now = Date.now();
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING id, email, name, role`,
    [email, passwordHash, name, role, now]
  );
  return { ...rows[0], password };
}
