const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || "Don't Get Played <hello@apexaccs.org>";
const SITE_URL = process.env.SITE_URL || 'https://token.apexaccs.org';

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
    payload.headers = { 'List-Unsubscribe': `<mailto:${fromAddress()}?subject=unsubscribe>` };
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

function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1A1D23;padding:24px 32px">
          <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.04em">DON'T GET&nbsp;<span style="font-weight:300">PLAYED</span></span>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1A1D23">${esc(title)}</h1>
          <div style="font-size:14.5px;line-height:1.65;color:#3f4550">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #eee;color:#9aa0a8;font-size:12px">
          TOKEN2049 Security Room - Apex x Stone Venture - Oct 6, 2026 - The Singapore EDITION
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

function approveEmail(account) {
  const sophosNote = account.sophosOptIn
    ? `<p>You also flagged interest in a free Sophos AV subscription + MDR - claim it with one click from the Sophos section once you're in.</p>`
    : '';
  const html = shell('Your badge is approved', `
      <p>Hi ${esc(account.name)},</p>
      <p>Good news - your registration for <b>Don't Get Played</b> has been approved. Your pass is ready in your dashboard.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;background:#f7f8fa;border-radius:10px">
        <tr><td style="padding:16px 18px;font-size:13.5px">
          <div><b>Date</b> &nbsp;Tue, Oct 6, 2026</div>
          <div style="margin-top:6px"><b>Time</b> &nbsp;16:00 &ndash; 21:00 SGT</div>
          <div style="margin-top:6px"><b>Venue</b> &nbsp;The Singapore EDITION</div>
          <div style="margin-top:6px"><b>Ref</b> &nbsp;${esc(account.ref)}</div>
        </td></tr>
      </table>
      ${sophosNote}
      <p style="margin-top:24px"><a href="${SITE_URL}/#ticket" style="display:inline-block;background:#1A1D23;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:14px">View my pass</a></p>
    `);
  return { subject: "Your badge is approved - Don't Get Played", html };
}

function sophosSentEmail(account) {
  const html = shell('Your Sophos subscription is on its way', `
      <p>Hi ${esc(account.name)},</p>
      <p>We've handed your free 1-year Sophos Intercept X + MDR subscription over to Sophos. You'll receive a separate email directly from Sophos with your activation link and setup instructions - this note is just the heads up from the Don't Get Played team.</p>
      <p>If you don't see it shortly, check your spam folder, or reach out to us on Telegram.</p>
    `);
  return { subject: 'Your Sophos subscription is on its way', html };
}

function blastEmail(subject, bodyHtml) {
  return { subject, html: shell(subject, bodyHtml) };
}

module.exports = { sendEmail, approveEmail, sophosSentEmail, blastEmail, esc, stripHtml };
