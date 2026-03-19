import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getTestDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-12345';

export function generateTestToken(userId = 1, role = 'member') {
  return jwt.sign({ id: userId, email: 'test@example.com', role, name: 'Test User' }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function generateExpiredToken() {
  return jwt.sign({ id: 1, email: 'test@example.com', role: 'member' }, JWT_SECRET, {
    expiresIn: '-1h',
  });
}

export function generateInvalidSignatureToken() {
  return jwt.sign({ id: 1, email: 'test@example.com', role: 'member' }, 'wrong-secret', {
    expiresIn: '7d',
  });
}

export function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

export async function createTestUser(data = {}) {
  const db = getTestDb();
  const email = data.email || `user_${Date.now()}@example.com`;
  const password = data.password || 'password123';
  const hash = await bcrypt.hash(password, 10);
  const role = data.role || 'member';
  const name = data.name || 'Test User';

  const result = await db.query(
    'INSERT INTO users (email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role',
    [email, hash, name, role, Date.now(), Date.now()]
  );

  const user = result.rows[0];
  const token = generateTestToken(user.id, role);
  return { user, token, password };
}