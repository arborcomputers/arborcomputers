// Local preview server: serves ./public like Vercel does (dir/index.html,
// /_next/image -> original file, 404.html). Usage: node scripts/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('public');
const port = Number(process.argv[2] || 3000);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json',
  '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.mp4':'video/mp4', '.woff2':'font/woff2', '.xml':'application/xml', '.txt':'text/plain' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p.startsWith('/_next/image')) p = u.searchParams.get('url') || '/';
  if (p.startsWith('/api/')) { res.writeHead(200, {'content-type':'application/json'}); return res.end('{"ok":true,"message":"(local preview: form not sent)"}'); }
  let f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404, {'content-type':types['.html']}); return fs.createReadStream(path.join(root, '404.html')).pipe(res); }
  res.writeHead(200, {'content-type': types[path.extname(f).toLowerCase()] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
