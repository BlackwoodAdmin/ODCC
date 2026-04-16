import jwt from 'jsonwebtoken';

export function signToken(user, { expiresIn = '7d' } = {}) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

export function authHeader(user) {
  return { Authorization: `Bearer ${signToken(user)}` };
}
