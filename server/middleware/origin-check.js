const SITE_URL = process.env.SITE_URL || 'https://opendoorchristian.church';

/**
 * Origin/Referer validation middleware for CSRF protection.
 * Lenient mode: allows requests where both headers are absent (curl, Postman, privacy browsers).
 * Rejects only when a header IS present but doesn't match SITE_URL.
 */
export function requireOriginCheck(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  // Lenient: if both are absent, allow through
  if (!origin && !referer) {
    return next();
  }

  // Check Origin header first (most reliable)
  if (origin) {
    if (origin === SITE_URL || origin === SITE_URL.replace(/\/$/, '')) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Fall back to Referer
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin === SITE_URL || refererOrigin === SITE_URL.replace(/\/$/, '')) {
        return next();
      }
    } catch {
      // Malformed referer — reject
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}
