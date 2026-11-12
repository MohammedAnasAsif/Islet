// Syntax-checks every JS file (main process as CommonJS, UI as ES modules)
// and validates JSON. No dependencies.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'islet-check-'));
let bad = 0;

for (const f of walk(path.join(root, 'src')).concat(walk(path.join(root, 'scripts')))) {
  const rel = path.relative(root, f);
  try {
    if (f.endsWith('.json')) JSON.parse(fs.readFileSync(f, 'utf8'));
    else if (f.endsWith('.mjs') || (f.endsWith('.js') && rel.startsWith(path.join('src', 'renderer')))) {
      const copy = path.join(tmp, rel.replace(/[\\/]/g, '_').replace(/\.js$/, '.mjs'));
      fs.copyFileSync(f, copy);
      execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' });
    } else if (f.endsWith('.js')) {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } else continue;
    console.log('ok  ', rel);
  } catch (e) {
    bad++;
    console.error('FAIL', rel, '\n', String(e.stderr || e.message));
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
