const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
if (JWT_SECRET.length < 64) throw new Error('JWT_SECRET must be at least 64 characters');

export { JWT_SECRET };
