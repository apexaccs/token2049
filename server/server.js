require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const db = require('./db');
const auth = require('./auth');
const email = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_ROOT = path.join(__dirname, '..');
const SITE_URL = process.env.SITE_URL || '';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const TICKET_LABELS = { standard: 'Standard', vip: 'VIP', speaker: 'Speaker', partner: 'Apex Partner', stone: 'Stone Partner' };
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + (IMAGE_EXT[file.mimetype] || ''))
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!IMAGE_EXT[file.mimetype])
});

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

function isSecure(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ═══════════════════ public: registration + account ═══════════════════ */

app.post('/api/register', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email_ = String(b.email || '').trim();
  let tg = String(b.tg || '').trim();
  const ticketKey = String(b.ticketKey || '');
  const fields = b.fields && typeof b.fields === 'object' ? b.fields : {};
  const chains = Array.isArray(b.chains) ? b.chains.filter(c => typeof c === 'string') : [];

  const problems = [];
  if (!name) problems.push('name');
  if (!tg) problems.push('telegram username');
  if (!emailRe.test(email_)) problems.push('a valid email');
  if (!TICKET_LABELS[ticketKey]) problems.push('ticket type');
  if (fields.tg_joined !== 'yes') problems.push('confirmation that you joined the Telegram group');
  if (!fields.role) problems.push('role');
  if (!fields.experience) problems.push('experience');
  if (!fields.scam_exp) problems.push('scam experience answer');
  if (!fields.interest) problems.push('interest');
  if (!chains.length) problems.push('at least one chain');
  if (problems.length) return res.status(400).json({ error: 'invalid_registration', missing: problems });

  if (!tg.startsWith('@')) tg = '@' + tg;

  const account = db.createRegistration({
    name, email: email_, tg, ticket: TICKET_LABELS[ticketKey], ticketKey, fields, chains
  });
  res.status(201).json({ account });
});

app.get('/api/account/lookup', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'missing_query' });
  const byRef = q.toUpperCase().startsWith('DGP-') ? db.getByRef(q) : null;
  const tgQuery = q.startsWith('@') ? q : '@' + q;
  const account = byRef || db.getByRef(q) || db.getByTg(tgQuery) || db.getByTg(q);
  if (!account) return res.status(404).json({ error: 'not_found' });
  res.json({ account });
});

app.get('/api/account/:id', (req, res) => {
  const account = db.getById(req.params.id);
  if (!account) return res.status(404).json({ error: 'not_found' });
  res.json({ account });
});

app.post('/api/account/:id/confirm-ticket', (req, res) => {
  const account = db.getById(req.params.id);
  if (!account) return res.status(404).json({ error: 'not_found' });
  const tos = req.body && req.body.tos === true;
  const sophosOptIn = !!(req.body && req.body.sophosOptIn);
  if (!tos) return res.status(400).json({ error: 'tos_required' });
  const updated = db.confirmTicket(account.id, { tos, sophosOptIn });
  res.json({ account: updated });
});

app.post('/api/account/:id/apply-sophos', (req, res) => {
  const account = db.getById(req.params.id);
  if (!account) return res.status(404).json({ error: 'not_found' });
  if (account.status !== 'approved' || !account.ticketConfirmed) return res.status(403).json({ error: 'not_approved' });
  const { account: updated } = db.applySophos(account.id);
  res.json({ account: updated });
});

/* ═══════════════════════════ admin: auth ═══════════════════════════════ */

app.post('/api/admin/login', (req, res) => {
  const ok = auth.checkPassword(req.body && req.body.password);
  if (!ok) return res.status(401).json({ error: 'wrong_password' });
  auth.issueSession(res, isSecure(req));
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { auth.clearSession(res); res.json({ ok: true }); });
app.get('/api/admin/session', auth.requireAdmin, (req, res) => res.json({ ok: true }));

/* ═════════════════════ admin: registrations + blast ═══════════════════ */

app.get('/api/admin/registrations', auth.requireAdmin, (req, res) => {
  res.json({ registrations: db.getAll() });
});

app.patch('/api/admin/registrations/:ref', auth.requireAdmin, async (req, res) => {
  const ref = req.params.ref;
  let account = db.getByRef(ref);
  if (!account) return res.status(404).json({ error: 'not_found' });

  const { status, sophosStatus } = req.body || {};
  const emailsToSend = [];

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    account = db.setStatus(ref, status);
    if (status === 'approved') emailsToSend.push(email.approveEmail(account));
  }
  if (sophosStatus !== undefined && ['pending', 'sent', null].includes(sophosStatus)) {
    account = db.setSophosStatus(ref, sophosStatus);
    if (sophosStatus === 'sent') emailsToSend.push(email.sophosSentEmail(account));
  }

  res.json({ account });

  for (const msg of emailsToSend) {
    try { await email.sendEmail({ to: account.email, ...msg }); }
    catch (err) { console.error('[email] failed to send', msg.subject, 'to', account.email, err.message); }
  }
});

app.post('/api/admin/upload-image', auth.requireAdmin, (req, res) => {
  upload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message || 'upload_failed' });
    if (!req.file) return res.status(400).json({ error: 'no_image' });
    res.json({ url: (SITE_URL || '') + '/uploads/' + req.file.filename });
  });
});

app.post('/api/admin/blast', auth.requireAdmin, async (req, res) => {
  const subject = String((req.body && req.body.subject) || '').trim();
  const bodyRaw = String((req.body && req.body.body) || '').trim();
  const isHtml = !!(req.body && req.body.html);
  const audience = ['all', 'approved', 'pending', 'sophos', 'specific'].includes(req.body && req.body.audience) ? req.body.audience : 'all';
  if (!subject || !bodyRaw) return res.status(400).json({ error: 'missing_subject_or_body' });

  let recipients;
  if (audience === 'specific') {
    const list = Array.isArray(req.body.emails) ? req.body.emails : String(req.body.emails || '').split(/[\s,;]+/);
    recipients = [...new Set(list.map(e => String(e).trim()).filter(e => emailRe.test(e)))];
    if (!recipients.length) return res.status(400).json({ error: 'no_valid_recipients' });
  } else {
    recipients = db.emailsForAudience(audience);
  }

  const bodyHtml = isHtml ? bodyRaw : email.esc(bodyRaw).replace(/\n/g, '<br>');
  const { subject: subj, html } = email.blastEmail(subject, bodyHtml);

  res.json({ queued: recipients.length });

  const CHUNK = 20;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    await Promise.all(chunk.map(to =>
      email.sendEmail({ to, subject: subj, html, bulk: true }).catch(err => console.error('[blast] failed to', to, err.message))
    ));
  }
});

/* ═══════════════════════════ static site ═══════════════════════════════ */

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d' }));
app.use(express.static(SITE_ROOT, { extensions: ['html'] }));

app.listen(PORT, () => console.log(`Don't Get Played server listening on :${PORT}`));
