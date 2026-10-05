const crypto = require('crypto');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || "Don't Get Played <hello@apexaccs.org>";
const SITE_URL = process.env.SITE_URL || 'https://token.apexaccs.org';
const UNSUB_SECRET = process.env.ADMIN_SECRET || 'insecure-dev-secret';

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** best-effort HTML → plain text, for the multipart fallback every send includes */
function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const fromAddress = () => {
  const m = RESEND_FROM.match(/<([^>]+)>/);
  return m ? m[1] : RESEND_FROM;
};

/** Signed, no backend state needed to verify - anyone with the link can only
    unsubscribe the one address it was signed for. */
function unsubToken(email) {
  return crypto.createHmac('sha256', UNSUB_SECRET).update(String(email).toLowerCase()).digest('hex').slice(0, 32);
}
function unsubUrl(email) {
  return `${SITE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken(email)}`;
}
function verifyUnsubToken(email, token) {
  const expected = unsubToken(email);
  const a = Buffer.from(String(token || '')), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** thin wrapper around the Resend REST API - no SDK dependency, just fetch.
    Always sends a plain-text alternative alongside the HTML: mail with no
    text part reads as more spam-like to most inbox filters. */
async function sendEmail({ to, subject, html, text, bulk = false }) {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set - skipping send to', to, '-', subject);
    return { skipped: true };
  }
  const payload = {
    from: RESEND_FROM, to, subject, html,
    text: text || stripHtml(html),
    reply_to: fromAddress()
  };
  if (bulk) {
    // RFC 8058 one-click unsubscribe - both a working HTTPS link (for true
    // one-click clients) and a mailto fallback, in one header as the spec allows
    payload.headers = {
      'List-Unsubscribe': `<${unsubUrl(to)}>, <mailto:${fromAddress()}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
  return res.json();
}

/** Deliberately plain: a heavily "templated" marketing look (dark header bar,
    nested card tables, filled button) reads worse to spam filters and to
    Gmail's tab classifier than a simple, personal-looking email does. */
function shell(bodyHtml, { to = null } = {}) {
  const footer = to
    ? `Don't Get Played · Apex &amp; Stone Venture<br>You're receiving this because you registered for the event. <a href="${unsubUrl(to)}" style="color:#6b7280">Unsubscribe</a>`
    : `Don't Get Played · Apex &amp; Stone Venture · Oct 11, 2026`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1d23">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;padding:28px 20px">
      <tr><td style="font-size:15px;line-height:1.7">${bodyHtml}</td></tr>
      <tr><td style="padding-top:28px;margin-top:8px;border-top:1px solid #eee;font-size:12px;color:#9aa0a8;line-height:1.6">${footer}</td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
}

function approveEmail(account) {
  const sophosNote = account.sophosOptIn
    ? `<p>You also flagged interest in a free antivirus subscription with managed detection and response - claim it with one click from the Sophos section once you're in.</p>`
    : '';
  const html = shell(`
      <p>Hi ${esc(account.name)},</p>
      <p>Good news - your registration for <b>Don't Get Played</b> has been approved. Your pass is ready in your dashboard.</p>
      <p>
        <b>Date</b> Sun, Oct 11, 2026<br>
        <b>Time</b> 18:00 &ndash; 22:00 SGT<br>
        <b>Venue</b> The Singapore EDITION<br>
        <b>Ref</b> ${esc(account.ref)}
      </p>
      ${sophosNote}
      <p><a href="${SITE_URL}/#ticket">View my pass &rarr;</a></p>
    `);
  return { subject: "Your badge is approved - Don't Get Played", html };
}

function sophosSentEmail(account) {
  const html = shell(`
      <p>Hi ${esc(account.name)},</p>
      <p>We've handed your free 1-year antivirus + managed detection and response subscription over to our security partner. You'll receive a separate email directly from them with your activation link and setup instructions - this note is just the heads up from the Don't Get Played team.</p>
      <p>If you don't see it shortly, check your spam folder, or reach out to us on Telegram.</p>
    `);
  return { subject: 'Your antivirus subscription is on its way', html };
}

function blastEmail(subject, bodyHtml, toEmail) {
  return { subject, html: shell(bodyHtml, { to: toEmail }) };
}

module.exports = { sendEmail, approveEmail, sophosSentEmail, blastEmail, esc, stripHtml, verifyUnsubToken };
