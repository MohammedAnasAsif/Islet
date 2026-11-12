// Renders Islet's UI in a headless browser with mock data and saves
// screenshots to docs/screenshots. Works on any OS:
//   npm run preview            (needs: npm i -D playwright, or a global one)
//   node scripts/preview.mjs --serve   (just serve the UI on :5179)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererDir = path.join(root, 'src', 'renderer');
const previewDir = path.join(root, 'scripts', 'preview');
const outDir = path.join(root, 'docs', 'screenshots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  const base = p.startsWith('/preview/') ? previewDir : rendererDir;
  p = p.replace(/^\/preview\//, '/');
  const file = path.normalize(path.join(base, p));
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
});

await new Promise((r) => server.listen(5179, r));
const base = 'http://localhost:5179';
console.log('Serving Islet UI at', base);
if (process.argv.includes('--serve')) await new Promise(() => {});

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const shots = [
  // name, url, viewport, wait(ms)
  ['desktop-hero', `/preview/desktop.html?wallpaper=ember&island=open&tab=music`, { width: 1600, height: 900 }, 2600],
  ['desktop-silk', `/preview/desktop.html?wallpaper=silk&island=rest`, { width: 1600, height: 900 }, 2600],
  ['desktop-aurora-overview', `/preview/desktop.html?wallpaper=aurora&island=open&tab=overview&surface=frost`, { width: 1600, height: 900 }, 2600],
  ['desktop-lagoon-quick', `/preview/desktop.html?wallpaper=lagoon&island=open&tab=quick&surface=candy`, { width: 1600, height: 900 }, 2600],
  ['island-surfaces', `/preview/surfaces.html`, { width: 1400, height: 560 }, 1200],
  ['settings-start', `/settings/index.html?onboarded=0#start`, { width: 1100, height: 760 }, 1200],
  ['settings-glass', `/settings/index.html#glass`, { width: 1100, height: 760 }, 1200],
  ['settings-taskbar', `/settings/index.html#taskbar`, { width: 1100, height: 760 }, 1200],
  ['settings-wallpaper', `/settings/index.html#wallpaper`, { width: 1100, height: 760 }, 2200],
  ['settings-widgets', `/settings/index.html#widgets`, { width: 1100, height: 760 }, 1200],
  ['arrange', `/preview/desktop.html?wallpaper=ember&arrange=1&island=none`, { width: 1600, height: 900 }, 2400],
];

let failed = 0;
for (const [name, url, viewport, wait] of shots) {
  if (only && !name.includes(only)) continue;
  const page = await browser.newPage({ viewport, deviceScaleFactor: process.argv.includes('--hidpi') ? 2 : 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + url);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  if (errors.length) { failed++; console.log(`✗ ${name}\n   ${errors.join('\n   ')}`); }
  else console.log(`✓ ${name}`);
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
