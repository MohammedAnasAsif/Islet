export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtRate(bytesPerSec) {
  const b = bytesPerSec || 0;
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB/s';
  if (b >= 1024) return Math.round(b / 1024) + ' KB/s';
  return Math.round(b) + ' B/s';
}

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

/** Average a picture's colours (skipping near-black/white) to theme the UI. */
export function accentFromImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 24;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
          if (max < 40 || min > 225 || max - min < 28) continue; // skip dull pixels
          const w = (max - min) / 255;
          r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        if (!n) return resolve(null);
        resolve(boost([r / n, g / n, b / n]));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function boost([r, g, b]) {
  // Push saturation/brightness up so the accent reads on dark glass.
  const max = Math.max(r, g, b) || 1;
  const k = 235 / max;
  return [r, g, b].map((v) => Math.round(Math.min(255, v * k)));
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [124, 156, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Apply appearance settings to <html> as data attributes / CSS variables. */
export function applyAppearance(app, accentRgb) {
  const root = document.documentElement;
  root.dataset.surface = app.surface;
  root.dataset.glow = app.glow ? '1' : '0';
  root.style.setProperty('--round', String((app.radius ?? 75) / 100));
  root.style.setProperty('--blur', `${app.blur ?? 22}px`);
  const rgb = app.accent === 'custom' || !accentRgb ? hexToRgb(app.customAccent) : accentRgb;
  root.style.setProperty('--accent-rgb', rgb.join(','));
}

export const SURFACES = [
  { id: 'frost', name: 'Frost glass', note: 'Smoky see-through glass' },
  { id: 'clear', name: 'Clear glass', note: 'Lighter, brighter glass' },
  { id: 'midnight', name: 'Midnight', note: 'Deep blue-black' },
  { id: 'oled', name: 'OLED black', note: 'True black, saves power' },
  { id: 'graphite', name: 'Graphite', note: 'Soft grey' },
  { id: 'rose', name: 'Rose', note: 'Tinted glass' },
  { id: 'lilac', name: 'Lilac', note: 'Tinted glass' },
  { id: 'peach', name: 'Peach', note: 'Tinted glass' },
  { id: 'mint', name: 'Mint', note: 'Tinted glass' },
  { id: 'candy', name: 'Candy glass', note: 'Iridescent glass' },
];

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
