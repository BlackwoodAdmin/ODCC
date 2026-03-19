import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { JWT_SECRET } from '../config.js';

// In-memory revocation map: userId -> timestamp (ms) when tokens issued before should be rejected
const revokedAt = new Map();

export function revokeUserTokens(userId) {
  revokedAt.set(userId, Date.now());
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Check if token was issued before a revocation event
    const revoked = revokedAt.get(decoded.id);
    if (revoked && decoded.iat * 1000 < revoked) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const revoked = revokedAt.get(decoded.id);
      if (!revoked || decoded.iat * 1000 >= revoked) {
        req.user = decoded;
      }
    } catch {}
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}
