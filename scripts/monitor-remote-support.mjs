// Browser test of the Remote Support page, run hourly by
// .github/workflows/remote-support-monitor.yml against the live site.
// Usage: node scripts/monitor-remote-support.mjs [base URL, default https://arborcomputers.com]
//
// It loads the real page and its real scripts, but answers StartControl's side itself,
// so no codes are ever sent to StartControl. It checks that a customer who enters a code:
//   1. gets the agent file when our helper works,
//   2. is sent straight to StartControl when our helper is broken,
//   3. always sees the backup "official StartControl portal" link,
//   4. on a Mac, gets the same code flow and a working Calling Card applet link.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = (process.argv[2] || 'https://arborcomputers.com').replace(/\/$/, '');
const CODE = '123456789';
const problems = [];

const browser = await chromium.launch();
async function run(name, helper, check, os = 'windows') {
  const page = await browser.newPage({ acceptDownloads: true });
  let posted = null;
  await page.route('https://startcontrol.com/**', (r) => {
    posted = r.request().postData() || '';
    r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>StartControl (test)</h1>' });
  });
  await page.route('**/api/remote-support/', helper);
  try {
    await page.goto(`${base}/remote-support/`, { waitUntil: 'networkidle', timeout: 30000 });
    if (os !== 'windows') await page.click(`[data-sc-os="${os === 'mac-card' ? 'mac' : os}"]`);
    if (os !== 'mac-card') await page.fill(`#sc-${os}-pin`, CODE);
    await check(page, () => posted);
  } catch (e) {
    problems.push(`${name}: ${e.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

await run('helper works', (r) => r.fulfill({
  status: 200, body: 'test',
  headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="agent.exe"' },
}), async (page) => {
  const download = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#sc-windows button.sc-submit:visible');
  const name = (await download).suggestedFilename();
  if (name !== 'agent.exe') throw new Error(`downloaded "${name}" instead of the agent`);
});

await run('helper broken', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }), async (page, posted) => {
  await page.click('#sc-windows button.sc-submit:visible');
  await page.waitForURL('https://startcontrol.com/**', { timeout: 15000 });
  if (!posted()?.includes(`pincode=${CODE}`)) throw new Error('fallback reached StartControl without the code');
});

await run('backup link', (r) => r.abort(), async (page) => {
  const link = page.locator('.sc-backup a[href="https://startcontrol.com/pin.php"]');
  await link.waitFor({ state: 'visible', timeout: 10000 });
});

// Mac: same code flow (sends isMac=1), plus the Calling Card applet link.
await run('Mac: helper works', (r) => r.fulfill({
  status: 200, body: 'test',
  headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="agent.dmg"' },
}), async (page) => {
  const download = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#sc-mac button.sc-submit:visible');
  const name = (await download).suggestedFilename();
  if (name !== 'agent.dmg') throw new Error(`downloaded "${name}" instead of the agent`);
}, 'mac');

await run('Mac: helper broken', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }), async (page, posted) => {
  await page.click('#sc-mac button.sc-submit:visible');
  await page.waitForURL('https://startcontrol.com/**', { timeout: 15000 });
  const body = posted() || '';
  if (!body.includes(`pincode=${CODE}`) || !body.includes('isMac=1')) throw new Error(`fallback sent "${body}" (needs the code and isMac=1)`);
}, 'mac');

await run('Mac: Calling Card applet link', (r) => r.abort(), async (page) => {
  await page.locator('#sc-mac label', { hasText: 'Calling Card' }).click();
  const link = page.locator('#sc-mac a.sc-download-link');
  await link.waitFor({ state: 'visible', timeout: 10000 });
  const href = await link.getAttribute('href');
  if (!/^https:\/\/[^/]+\/.*\.zip$/.test(href || '')) throw new Error(`applet link is "${href}"`);
  console.log(`MAC_APPLET_URL=${href}`);
  if (!(await page.locator('.sc-backup').isVisible())) throw new Error('backup StartControl link not visible on the Mac tab');
}, 'mac-card');

await browser.close();
if (problems.length) {
  console.error('Remote support page FAILED:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`Remote support page works on ${base}`);
