const crypto = require('crypto');

const SECRET = process.env.ADMIN_SECRET || '';
const COOKIE_NAME = 'dgp_admin';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (!SECRET) {
  console.warn('[auth] ADMIN_SECRET is not set — admin sessions will not be secure. Set it in .env before going live.');
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET || 'insecure-dev-secret').update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET || 'insecure-dev-secret').update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}

function issueSession(res, secure) {
  const token = sign({ exp: Date.now() + TTL_MS });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!secure,
    maxAge: TTL_MS,
    path: '/'
  });
}
function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}
function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const payload = verify(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  next();
}
function checkPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(pw || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { issueSession, clearSession, requireAdmin, checkPassword, COOKIE_NAME };
