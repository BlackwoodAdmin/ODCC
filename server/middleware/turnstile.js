export async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRITICAL: TURNSTILE_SECRET_KEY not set in production — rejecting request');
      return { success: false, code: 'TURNSTILE_FAILED', error: 'CAPTCHA not configured' };
    }
    return { success: true };
  }

  if (!token) {
    return { success: false, code: 'TURNSTILE_REQUIRED', error: 'CAPTCHA verification required' };
  }

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, remoteip: remoteIp || '' }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    console.error('Turnstile API error:', res.status, res.statusText);
    return { success: false, code: 'TURNSTILE_FAILED', error: 'CAPTCHA service unavailable' };
  }

  const data = await res.json();
  return {
    success: data.success === true,
    code: data.success ? null : 'TURNSTILE_FAILED',
    error: data.success ? null : 'CAPTCHA verification failed. Please try again.',
  };
}

export function requireTurnstile(req, res, next) {
  verifyTurnstile(req.body.turnstileToken, req.ip)
    .then(result => result.success ? next() : res.status(400).json({ error: result.error, code: result.code }))
    .catch(() => res.status(500).json({ error: 'CAPTCHA verification error', code: 'TURNSTILE_FAILED' }));
}
