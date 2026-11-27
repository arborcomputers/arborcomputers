// Runs as Vercel's build step (vercel.json "buildCommand"). If anything the site
// needs to work is missing, the deploy fails and the live site stays as it was.
//
// Remote support: /remote-support/ sends the technician's code to
// /api/remote-support/, which fetches the StartControl agent. If that function is
// missing, customers can't download the agent (this happened in Nov 2026).
import fs from 'node:fs';

const problems = [];
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);

for (const fn of ['api/forms.mjs', 'api/remote-support.mjs']) {
  const src = read(fn);
  if (!src) problems.push(`${fn} is missing`);
  else if (!/export\s+async\s+function\s+POST\b/.test(src)) problems.push(`${fn} has no POST handler`);
}

const page = read('public/remote-support/index.html');
if (!page) {
  problems.push('public/remote-support/index.html is missing');
} else {
  if (!page.includes('https://startcontrol.com/pin.php')) problems.push('remote support page no longer posts to StartControl');
  const scripts = [...new Set(page.match(/\/_next\/static\/[^"\\]+\.js/g) || [])];
  for (const s of scripts) if (!fs.existsSync(`public${s}`)) problems.push(`remote support page loads ${s}, which is missing`);
  const handler = scripts.map((s) => read(`public${s}`) || '').find((js) => js.includes('/api/remote-support/'));
  if (!handler) problems.push('no script on the remote support page sends codes to /api/remote-support/');
  else if (!handler.includes('HTMLFormElement.prototype.submit')) problems.push('remote support script lost its direct-to-StartControl fallback');
  else if (!handler.includes('sc-backup')) problems.push('remote support script lost the backup StartControl link');
}

const config = JSON.parse(read('vercel.json'));
const csp = config.headers?.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value || '';
if (!/form-action[^;]*https:\/\/startcontrol\.com/.test(csp)) problems.push('security headers block forms posting to startcontrol.com');
if (!config.rewrites?.some((r) => r.source === '/api/remote-support/')) problems.push('vercel.json is missing the /api/remote-support/ rewrite');

if (problems.length) {
  console.error('Site check FAILED, not deploying:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('Site check passed.');
