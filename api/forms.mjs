// Website form handler: contact, consultation and service-page forms POST here.
// The page script expects JSON back: { ok, message, delivered }.
//
// Settings are the project's Vercel environment variables (already set):
//   FORM_DELIVERY_ENABLED   "false" to accept forms without emailing them
//   FORM_PROVIDER           email provider: resend (default), postmark or sendgrid
//   FORM_PROVIDER_API_KEY   provider API key
//   FORM_FROM_EMAIL         sender, e.g. "Arbor Computers <forms@arborcomputers.com>"
//   FORM_TO_EMAIL           where requests go (comma-separated for several)
//   FORM_SEND_CONFIRMATION  "true" to also send the visitor a short confirmation
//   FORM_ALLOWED_ORIGINS    comma-separated origins allowed to post
//   FORM_RATE_LIMIT_MAX / FORM_RATE_LIMIT_WINDOW_SECONDS   per-IP limit
//   FORM_REQUIRE_TURNSTILE  "false" to skip the Cloudflare check
//   TURNSTILE_SECRET_KEY    Cloudflare Turnstile secret

const PHONE = '734.707.1122';
const env = (k, d = '') => (process.env[k] ?? d).trim();
const isOn = (k, d) => { const v = env(k, d).toLowerCase(); return v === 'true' || v === '1' || v === 'yes'; };
const list = (k) => env(k).split(',').map((s) => s.trim()).filter(Boolean);

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, message) => json(status, { ok: false, message });

const LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone', company: 'Company', service: 'Service', topic: 'Topic',
  scope: 'Scope', budget: 'Budget', purpose: 'Purpose', message: 'Message',
  form_context: 'Form', source_path: 'Page',
};
const SKIP = new Set(['turnstile_token', 'cf-turnstile-response', 'website', 'form_started_at']);

// Best-effort per-IP limit (each function instance keeps its own counts).
const hits = new Map();
function limited(ip) {
  const max = Number(env('FORM_RATE_LIMIT_MAX', '5')) || 5;
  const windowMs = (Number(env('FORM_RATE_LIMIT_WINDOW_SECONDS', '600')) || 600) * 1000;
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => String(s ?? '').slice(0, n);

async function verifyTurnstile(token, ip) {
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    return (await r.json()).success === true;
  } catch { return false; }
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  const provider = env('FORM_PROVIDER', 'resend').toLowerCase();
  const key = env('FORM_PROVIDER_API_KEY');
  const from = env('FORM_FROM_EMAIL');
  let r;
  if (provider === 'postmark') {
    r = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'X-Postmark-Server-Token': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ From: from, To: to.join(','), Subject: subject, HtmlBody: html, TextBody: text, ReplyTo: replyTo, MessageStream: 'outbound' }),
    });
  } else if (provider === 'sendgrid') {
    r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: to.map((email) => ({ email })) }],
        from: { email: from.replace(/.*<|>.*/g, '') || from },
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        subject, content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
      }),
    });
  } else {
    r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
  }
  if (!r.ok) throw new Error(`${provider} ${r.status}: ${clip(await r.text(), 300)}`);
}

export async function POST(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = list('FORM_ALLOWED_ORIGINS');
  if (allowed.length && origin && !allowed.includes(origin)) return fail(403, `This form can't be sent from here. Please call ${PHONE}.`);

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return fail(429, `Too many requests. Please wait a few minutes and try again, or call ${PHONE}.`);

  let form;
  try { form = await request.formData(); } catch { return fail(400, `We could not read your request. Please try again or call ${PHONE}.`); }

  // Spam traps: hidden honeypot field, or a form submitted inhumanly fast. Pretend success.
  const started = Number(form.get('form_started_at'));
  if (clip(form.get('website'), 200) || (started && Date.now() - started < 2500)) return json(200, { ok: true, delivered: false });

  if (isOn('FORM_REQUIRE_TURNSTILE', 'true') && env('TURNSTILE_SECRET_KEY')) {
    const token = form.get('turnstile_token') || form.get('cf-turnstile-response');
    if (!(await verifyTurnstile(token, ip))) return fail(400, 'Please complete the security check before sending your request.');
  }

  const fields = [];
  for (const [k, v] of form.entries()) {
    if (SKIP.has(k) || typeof v !== 'string' || !v.trim()) continue;
    fields.push([LABELS[k] || k.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), clip(v.trim(), 5000), k]);
  }
  const get = (k) => clip(form.get(k), 300).trim();
  const name = get('name');
  const email = get('email');
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(400, 'Please enter your name and a valid email address.');
  }

  if (!isOn('FORM_DELIVERY_ENABLED', 'true')) {
    return json(200, { ok: true, delivered: false, message: `Thanks, your request was received. For anything urgent, call ${PHONE}.` });
  }
  const to = list('FORM_TO_EMAIL');
  if (!to.length || !env('FORM_PROVIDER_API_KEY') || !env('FORM_FROM_EMAIL')) {
    console.error('forms: email delivery is not configured');
    return fail(503, `We could not send your request right now. Please call ${PHONE}.`);
  }

  const context = get('form_context') || 'website';
  const subject = clip(`New ${context.replace(/[-_]+/g, ' ')} request from ${name}`, 200);
  const rows = fields.filter(([, , k]) => k !== 'message')
    .map(([l, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;white-space:nowrap">${esc(l)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('');
  const message = get('message') ? clip(form.get('message'), 5000) : '';
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#0f172a"><h2 style="margin:0 0 12px">${esc(subject)}</h2><table>${rows}</table>${
    message ? `<h3 style="margin:20px 0 6px">Message</h3><p style="white-space:pre-wrap;margin:0">${esc(message)}</p>` : ''}</div>`;
  const text = `${subject}\n\n${fields.map(([l, v]) => `${l}: ${v}`).join('\n')}`;

  try {
    await sendEmail({ to, subject, html, text, replyTo: email });
  } catch (e) {
    console.error('forms: send failed', e.message);
    return fail(502, `We could not send your request right now. Please try again or call ${PHONE}.`);
  }

  if (isOn('FORM_SEND_CONFIRMATION', 'false')) {
    const thanks = `Hi ${name},\n\nThanks for contacting Arbor Computers. We received your request and will follow up soon.\nFor anything urgent, call ${PHONE}.\n\nArbor Computers\n3201 E. Eisenhower Pkwy, Ann Arbor, MI 48108`;
    await sendEmail({ to: [email], subject: 'We received your request – Arbor Computers', text: thanks,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;white-space:pre-wrap">${esc(thanks)}</div>` }).catch((e) => console.error('forms: confirmation failed', e.message));
  }

  return json(200, { ok: true, delivered: true, message: 'Thanks, your request was sent to Arbor Computers. We’ll follow up using the contact information you provided.' });
}

export function GET() {
  return fail(405, 'Method not allowed');
}
