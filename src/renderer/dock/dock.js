import { connect } from '../shared/bridge.js';
import { icon } from '../shared/icons.js';
import { $, $$, esc, applyAppearance } from '../shared/util.js';

const api = await connect();
let settings = await api.invoke('settings:get');
const st = await api.invoke('state:get');
let groups = st.dock || [];
let accent = st.accent || null;
const dock = $('#dock');
const tip = $('#tip');

$('[data-shell="start"]').innerHTML = icon('start', 22);
$('[data-shell="search"]').innerHTML = icon('search', 20);
$('[data-shell="quickSettings"]').innerHTML = icon('sliders', 18);

const base = (p) => String(p || '').split(/[\\/]/).pop().toLowerCase();
const iconCache = new Map();

function avatar(name) {
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `<span class="avatar" style="background:linear-gradient(145deg,hsl(${hue} 70% 58%),hsl(${(hue + 40) % 360} 70% 42%))">${esc((name || '?').trim().charAt(0).toUpperCase())}</span>`;
}

async function iconFor(target) {
  if (!target) return null;
  if (iconCache.has(target)) return iconCache.get(target);
  const p = api.invoke('icon:get', target).catch(() => null);
  iconCache.set(target, p);
  return p;
}

function matches(pin, g) {
  if (!g.exe || pin.kind === 'uri') return false;
  const t = pin.target.toLowerCase();
  return t.includes('\\') || t.includes('/') ? t === g.exe.toLowerCase() : base(t) === base(g.exe);
}

/** Pinned apps first (lit up when running), then other running apps. */
function buildItems() {
  const pins = settings.taskbar.dock.pins || [];
  const used = new Set();
  const items = pins.map((pin) => {
    const g = groups.find((x) => !used.has(x.key) && matches(pin, x));
    if (g) used.add(g.key);
    return { id: 'pin:' + pin.id, pin, group: g, name: pin.name || g?.name, target: pin.kind === 'uri' ? null : pin.target };
  });
  for (const g of groups) if (!used.has(g.key)) items.push({ id: 'run:' + g.key, group: g, name: g.name, target: g.exe });
  return items;
}

let lastSig = '';
async function renderApps() {
  const items = buildItems();
  const sig = JSON.stringify(items.map((i) => [i.id, i.group?.windows.length, i.group?.active, i.name]));
  if (sig === lastSig) return;
  lastSig = sig;
  const box = $('.apps');
  box.innerHTML = items.map((it) => {
    const n = it.group?.windows.length || 0;
    const pips = n ? `<span class="pips">${'<i></i>'.repeat(Math.min(n, 3))}</span>` : '';
    const inner = it.pin?.kind === 'uri' ? icon(it.pin.target.startsWith('ms-settings') ? 'gear' : 'sparkles', 24) : avatar(it.name);
    return `<button class="item app${it.group?.active ? ' active' : ''}" data-id="${esc(it.id)}">${inner}${pips}</button>`;
  }).join('');
  // swap in real app icons as they load
  for (const it of items) {
    if (!it.target) continue;
    iconFor(it.target).then((url) => {
      if (!url) return;
      const btn = box.querySelector(`[data-id="${CSS.escape(it.id)}"]`);
      const av = btn && btn.querySelector('.avatar');
      if (av) av.outerHTML = `<img src="${url}" alt="">`;
    });
  }
  renderApps.items = items;
}

const cycle = new Map();
dock.addEventListener('click', (e) => {
  const sh = e.target.closest('[data-shell]');
  if (sh) { api.invoke('shell', sh.dataset.shell); return; }
  const b = e.target.closest('.app');
  if (!b) return;
  const it = renderApps.items.find((x) => x.id === b.dataset.id);
  if (!it) return;
  const wins = it.group?.windows || [];
  if (!wins.length) { if (it.pin) api.invoke('dock:launch', it.pin); return; }
  let i = 0;
  if (wins.length > 1) { i = ((cycle.get(it.id) ?? -1) + 1) % wins.length; cycle.set(it.id, i); }
  api.invoke('dock:activate', wins[i].hwnd);
});
dock.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  const b = e.target.closest('.app');
  const it = b && renderApps.items.find((x) => x.id === b.dataset.id);
  if (it) api.invoke('dock:launch', it.pin || { target: it.target, kind: 'path' });
});
dock.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const b = e.target.closest('.app');
  const it = b && renderApps.items.find((x) => x.id === b.dataset.id);
  api.invoke('dock:context', it ? { name: it.name, exe: it.group?.exe, pinTarget: it.pin?.target, key: it.group?.key } : {});
});

// tooltips
dock.addEventListener('mouseover', (e) => {
  const b = e.target.closest('.item, .clock');
  if (!b) return;
  let text = b.dataset.tip || '';
  let sub = '';
  if (b.classList.contains('app')) {
    const it = renderApps.items.find((x) => x.id === b.dataset.id);
    text = it?.name || '';
    const w = it?.group?.windows || [];
    sub = w.length === 1 && w[0].title !== text ? w[0].title : w.length > 1 ? `${w.length} windows` : '';
  }
  if (!text) return;
  tip.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
  const r = b.getBoundingClientRect();
  tip.classList.add('on');
  const tw = tip.offsetWidth;
  tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
  tip.style.bottom = (innerHeight - r.top + 10) + 'px';
});
dock.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest?.('.item, .clock')) tip.classList.remove('on'); });

// only the bar itself catches the mouse; the rest of the window is click-through
// The main process makes only the bar clickable (it polls the cursor against
// this rectangle); everything else in the window stays click-through.
let lastHit = '';
function reportHitArea() {
  const r = dock.getBoundingClientRect();
  const rect = { x: Math.round(r.left) - 2, y: Math.round(r.top) - 2, w: Math.round(r.width) + 4, h: Math.round(r.height) + 4 };
  const key = JSON.stringify(rect);
  if (key !== lastHit) { lastHit = key; api.invoke('hit:rects', [rect]); }
}
new ResizeObserver(reportHitArea).observe(dock);
window.addEventListener('resize', reportHitArea);
api.on('hover', (inside) => { if (!inside) tip.classList.remove('on'); });

function renderClock() {
  const now = new Date();
  $('.c-time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('.c-date').textContent = now.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function applySettings() {
  applyAppearance(settings.appearance, settings.appearance.accent === 'auto' ? accent : null);
  const d = settings.taskbar.dock;
  dock.style.setProperty('--size', (d.size || 44) + 'px');
  $('.search').style.display = d.showSearch ? '' : 'none';
  $('.clock').style.display = d.showClock ? '' : 'none';
  lastSig = '';
  renderApps();
}

api.on('settings', (s) => { settings = s; applySettings(); });
api.on('accent', (a) => { accent = a; applyAppearance(settings.appearance, settings.appearance.accent === 'auto' ? accent : null); });
api.on('dock:windows', (g) => { groups = g; renderApps(); });

applySettings();
renderClock();
setInterval(renderClock, 1000 * 5);
void $$;
