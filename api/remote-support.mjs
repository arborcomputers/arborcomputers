// Remote support download: the /remote-support/ page POSTs the technician's code here.
// We pass it to StartControl (N-able Take Control) and hand the support agent back.
//
// The page script (public/_next/static/.../1avnofjcbceud.js) accepts either:
//   - JSON { ok: true, url }      -> browser goes to url (a direct download link)
//   - JSON { ok: false, message } -> message is shown under the form
//   - any other body              -> saved as a file, name from Content-Disposition

const PHONE = '734-707-1122';
const STARTCONTROL = 'https://startcontrol.com/pin.php?Lang=en';
const FIELDS = ['pincode', 'conn_op', 'part1', 'part2', 'part3', 'part4', 'isMac', 'isLinux', 'linuxType'];
const FILE_LINK = /\.(exe|msi|zip|dmg|pkg|rpm|deb)(\?|$)|download/i;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, message) => json(status, { ok: false, message });

// Find a download link in an HTML reply (meta refresh, JS redirect or a plain link).
function linkIn(html, base) {
  const found = [
    /http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i,
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /href=["']([^"']+\.(?:exe|msi|zip|dmg|pkg|rpm|deb)(?:\?[^"']*)?)["']/i,
  ].map((re) => re.exec(html)?.[1]).find(Boolean);
  if (!found) return null;
  try {
    const url = new URL(found.replace(/&amp;/g, '&'), base);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

export async function POST(request) {
  let form;
  try { form = await request.formData(); } catch { return fail(400, 'Please enter the code from your technician.'); }

  const body = new URLSearchParams();
  for (const k of FIELDS) {
    const v = form.get(k);
    if (typeof v === 'string' && v.trim()) body.set(k, v.trim().slice(0, 20));
  }
  if (body.has('pincode')) body.set('pincode', body.get('pincode').replace(/\D/g, ''));
  const hasPin = /^\d{9}$/.test(body.get('pincode') || '');
  const hasCard = ['part1', 'part2', 'part3', 'part4'].every((k) => body.has(k));
  if (!hasPin && !hasCard) return fail(400, 'Enter the complete code provided by your technician.');

  let res;
  try {
    res = await fetch(STARTCONTROL, {
      method: 'POST',
      body,
      redirect: 'follow',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': request.headers.get('user-agent') || 'Mozilla/5.0',
        'accept-language': request.headers.get('accept-language') || 'en',
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error('remote-support: StartControl unreachable', e.message);
    return fail(502, `We couldn't reach the remote support service. Please try again or call ${PHONE}.`);
  }

  const type = res.headers.get('content-type') || '';
  const disposition = res.headers.get('content-disposition') || '';
  const isFile = /attachment|filename=/i.test(disposition) || (type && !/text\/html|application\/json/i.test(type));

  if (res.ok && isFile) {
    // Landed on a plain download link: let the browser fetch it straight from StartControl.
    if (res.redirected && res.url && res.url.startsWith('https://')) {
      res.body?.cancel();
      return json(200, { ok: true, url: res.url });
    }
    const headers = { 'content-type': type || 'application/octet-stream', 'cache-control': 'no-store' };
    if (disposition) headers['content-disposition'] = disposition;
    const length = res.headers.get('content-length');
    if (length) headers['content-length'] = length;
    return new Response(res.body, { status: 200, headers });
  }

  const html = await res.text().catch(() => '');
  const link = res.ok ? linkIn(html, res.url || STARTCONTROL) : null;
  if (link && FILE_LINK.test(new URL(link).pathname + new URL(link).search)) return json(200, { ok: true, url: link });

  // Anything else (a wrong or expired code, an outage, or a reply we don't recognise):
  // answer 502 so the page sends the customer straight to StartControl's own page,
  // which shows its own message or starts the download.
  console.error('remote-support: no download from StartControl', res.status, res.url, html.replace(/\s+/g, ' ').slice(0, 500));
  return fail(502, `Opening StartControl directly. If nothing downloads, call ${PHONE}.`);
}

export function GET() {
  return fail(405, 'Method not allowed');
}
