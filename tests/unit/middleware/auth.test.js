import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateToken, optionalAuth, requireRole } from '@server/middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-do-not-use-in-production-must-be-64-chars-minimum';

describe('authenticateToken middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should allow request with valid Bearer token', () => {
    const token = jwt.sign({ id: 1, email: 'test@example.com', role: 'member' }, JWT_SECRET, { expiresIn: '7d' });
    req.headers.authorization = `Bearer ${token}`;

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(1);
  });

  it('should reject missing token with 401', () => {
    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject malformed Authorization header', () => {
    req.headers.authorization = 'NotBearer token';

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should reject expired token with 401', () => {
    const token = jwt.sign({ id: 1, email: 'test@example.com' }, JWT_SECRET, { expiresIn: '-1h' });
    req.headers.authorization = `Bearer ${token}`;

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should reject invalid signature with 401', () => {
    const wrongSecret = 'wrong-secret-that-is-at-least-64-characters-long-for-testing-purposes-here';
    const token = jwt.sign({ id: 1 }, wrongSecret, { expiresIn: '7d' });
    req.headers.authorization = `Bearer ${token}`;

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('optionalAuth middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {};
    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should attach user to req if valid token present', () => {
    const token = jwt.sign({ id: 1, email: 'test@example.com' }, JWT_SECRET, { expiresIn: '7d' });
    req.headers.authorization = `Bearer ${token}`;

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(1);
  });

  it('should proceed without user if no token', () => {
    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('should ignore invalid tokens (no error thrown)', () => {
    req.headers.authorization = `Bearer invalid.token.here`;

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});

describe('requireRole middleware', () => {
  let req, res, next;

  beforeEach(() => {
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should allow request if user has required role', () => {
    const middleware = requireRole('admin');
    req = { user: { id: 1, role: 'admin' } };

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject with 403 if user lacks required role', () => {
    const middleware = requireRole('admin');
    req = { user: { id: 1, role: 'member' } };

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should reject with 401 if no user authenticated', () => {
    const middleware = requireRole('admin');
    req = {};

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should support multiple allowed roles', () => {
    const middleware = requireRole('admin', 'moderator');
    req = { user: { id: 1, role: 'moderator' } };

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
})