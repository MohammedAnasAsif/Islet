'use strict';
// Tiny log file at %APPDATA%\Islet\islet.log (rotated at 1 MB) so problems on
// a real desktop can be diagnosed. Mirrors console output; no network, ever.
const fs = require('fs');
const path = require('path');
const util = require('util');

let file = null;
const MAX = 1024 * 1024;

function write(level, args) {
  if (!file) return;
  const line = `${new Date().toISOString()} ${level} ${args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack : util.inspect(a, { depth: 3, breakLength: 160 }))).join(' ')}\n`;
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX) fs.renameSync(file, file + '.old');
    fs.appendFileSync(file, line);
  } catch { /* never let logging break the app */ }
}

const orig = { log: console.log, warn: console.warn, error: console.error };

function init(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  file = path.join(dir, 'islet.log');
  console.log = (...a) => { orig.log(...a); write('INFO ', a); };
  console.warn = (...a) => { orig.warn(...a); write('WARN ', a); };
  console.error = (...a) => { orig.error(...a); write('ERROR', a); };
}

module.exports = {
  init,
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
  get file() { return file; },
};
