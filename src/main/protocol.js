'use strict';
// islet://app/...   -> files in src/renderer (the UI)
// islet://media/?p= -> a local wallpaper file the user picked (allow-listed),
//                      streamed with HTTP Range support so videos loop/seek.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const RENDERER = path.join(__dirname, '..', 'renderer');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8',
};
const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

function registerSchemes(protocol) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'islet', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m) return null;
  let start = m[1] === '' ? null : parseInt(m[1], 10);
  let end = m[2] === '' ? null : parseInt(m[2], 10);
  if (start === null && end === null) return null;
  if (start === null) { start = Math.max(0, size - end); end = size - 1; }
  if (end === null || end >= size) end = size - 1;
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

function fileResponse(file, request) {
  let stat;
  try { stat = fs.statSync(file); } catch { return new Response('Not found', { status: 404 }); }
  if (!stat.isFile()) return new Response('Not found', { status: 404 });
  const type = mimeOf(file);
  const range = parseRange(request.headers.get('range'), stat.size);
  if (range === 'invalid') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
  if (range) {
    const body = Readable.toWeb(fs.createReadStream(file, { start: range.start, end: range.end }));
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
      },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(stat.size) },
  });
}

/** @param isAllowedMedia (absPath) => boolean */
function handle(protocol, isAllowedMedia) {
  protocol.handle('islet', (request) => {
    const url = new URL(request.url);
    if (url.host === 'app') {
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.normalize(path.join(RENDERER, rel));
      if (!file.startsWith(RENDERER + path.sep)) return new Response('Forbidden', { status: 403 });
      return fileResponse(file, request);
    }
    if (url.host === 'media') {
      const p = url.searchParams.get('p') || '';
      if (!p || !isAllowedMedia(path.normalize(p))) return new Response('Forbidden', { status: 403 });
      return fileResponse(path.normalize(p), request);
    }
    return new Response('Not found', { status: 404 });
  });
}

const mediaUrl = (p) => (p ? 'islet://media/?p=' + encodeURIComponent(p) : '');

module.exports = { registerSchemes, handle, mediaUrl, parseRange };
