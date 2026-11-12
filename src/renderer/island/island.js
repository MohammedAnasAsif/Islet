import { connect } from '../shared/bridge.js';
import { icon } from '../shared/icons.js';
import { $, $$, esc, fmtTime, fmtRate, isoWeek, accentFromImage, applyAppearance } from '../shared/util.js';

const api = await connect();
const el = $('#island');
const q = new URLSearchParams(location.search);

let settings = await api.invoke('settings:get');
const initial = await api.invoke('state:get');
let media = initial.media || { active: false };
let system = initial.system;
let weather = initial.weather;
let fg = initial.fg || {};
let accentRgb = null;

const TABS = [
  { id: 'music', icon: 'music', label: 'Now playing' },
  { id: 'overview', icon: 'overview', label: 'Overview' },
  { id: 'quick', icon: 'grid', label: 'Quick actions' },
];

// ---------------------------------------------------------------- static UI
$('.tabs').innerHTML = TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}" title="${t.label}">${icon(t.icon, 17)}</button>`).join('');
$('[data-action="settings"]').innerHTML = icon('gear', 17);
$('[data-media="prev"]').innerHTML = icon('prev', 18);
$('[data-media="next"]').innerHTML = icon('next', 18);
$('[data-media="volDown"]').innerHTML = icon('minus', 12);
$('[data-media="volUp"]').innerHTML = icon('plus', 12);
$('.vol-ic').innerHTML = icon('volume', 14);
$('[data-focus="minus"]').innerHTML = icon('minus', 12);
$('[data-focus="plus"]').innerHTML = icon('plus', 12);
$('[data-focus="reset"]').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5"/></svg>';
$('.net .down').innerHTML = icon('down', 11) + '<b></b>';
$('.net .up').innerHTML = icon('up', 11) + '<b></b>';

const QUICK = [
  { id: 'snip', icon: 'snip', label: 'Snip' },
  { id: 'taskView', icon: 'taskview', label: 'Task view' },
  { id: 'notifications', icon: 'bell', label: 'Alerts' },
  { id: 'quickSettings', icon: 'sliders', label: 'Quick settings' },
  { id: 'arrange', icon: 'layout', label: 'Arrange widgets' },
  { id: 'wallpaper-next', icon: 'image', label: 'Next wallpaper' },
  { id: 'wallpaper-toggle', icon: 'sparkles', label: 'Live wallpaper' },
  { id: 'lock', icon: 'lock', label: 'Lock' },
];
function renderQuick() {
  $('.quick').innerHTML = QUICK.map((a) => {
    const on = a.id === 'wallpaper-toggle' && settings.wallpaper.enabled;
    return `<button class="q${on ? ' on' : ''}" data-shell="${a.id}">${icon(a.icon, 19)}<span>${a.label}</span></button>`;
  }).join('');
}

// ---------------------------------------------------------------- state machine
let state = 'rest';
let tab = settings.island.openTab === 'last' ? settings.island.lastTab : settings.island.openTab;
if (q.get('tab')) tab = q.get('tab');
let hoverTimer = null, leaveTimer = null, openedByKey = false;

function restKind() {
  if (focus.running) return 'focus';
  if (media.active && (media.playing || media.title)) return 'media';
  return 'clock';
}

function setSize() {
  const round = (settings.appearance.radius ?? 75) / 100;
  let w, h, r;
  if (state === 'open') {
    w = 440;
    h = $('.open').offsetHeight;
    r = 10 + 22 * round;
  } else if (state === 'slim') {
    w = 130; h = 6; r = 3;
  } else {
    const k = restKind();
    w = k === 'media' ? 228 : 118;
    h = k === 'media' ? 34 : 30;
    r = Math.max(6, (h / 2) * round);
  }
  el.style.setProperty('--w', w + 'px');
  el.style.setProperty('--h', h + 'px');
  el.style.setProperty('--r', r + 'px');
}

function render() {
  el.dataset.state = state;
  el.dataset.rest = restKind();
  el.classList.toggle('playing', !!(media.active && media.playing));
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  $$('.panel').forEach((p) => p.classList.toggle('on', p.dataset.tab === tab));
  setSize();
}

function restingState() {
  return settings.general.slimWhenMaximized && fg.maximized ? 'slim' : 'rest';
}

function open(byKey = false) {
  clearTimeout(leaveTimer);
  openedByKey = byKey;
  api.invoke('island:interactive', true);
  state = 'open';
  render();
  drawWave();
  if (byKey) leaveTimer = setTimeout(() => { if (openedByKey) close(); }, 7000);
}

function close() {
  state = restingState();
  render();
  api.invoke('island:interactive', false);
}

el.addEventListener('mouseenter', () => {
  clearTimeout(leaveTimer);
  openedByKey = false;
  api.invoke('island:interactive', true);
  if (state !== 'open' && settings.island.expandOnHover) {
    hoverTimer = setTimeout(open, settings.island.hoverDelay ?? 140);
  }
});
el.addEventListener('mouseleave', () => {
  clearTimeout(hoverTimer);
  if (q.get('preview')) return; // the settings preview stays open
  leaveTimer = setTimeout(close, state === 'open' ? 320 : 0);
});
el.addEventListener('click', (e) => {
  if (state !== 'open' && !e.target.closest('button')) open();
});
api.on('island:toggle', () => (state === 'open' ? close() : open(true)));

$('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab;
  render();
  drawWave();
  if (settings.island.openTab === 'last') api.invoke('settings:set', 'island.lastTab', tab);
});

document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-media]');
  if (m) { api.invoke('media', m.dataset.media); if (m.dataset.media === 'toggle' && media.active) { media.playing = !media.playing; renderMedia(); } }
  const s = e.target.closest('[data-shell]');
  if (s) api.invoke('shell', s.dataset.shell);
  if (e.target.closest('[data-action="settings"]')) api.invoke('shell', 'settings');
  const f = e.target.closest('[data-focus]');
  if (f) focusAction(f.dataset.focus);
});

// ---------------------------------------------------------------- clock / calendar
function renderClock() {
  const now = new Date();
  $('.rest-time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('.cal-day').textContent = now.getDate();
  $('.cal-wd').textContent = now.toLocaleDateString([], { weekday: 'short' });
  $('.cal-mon').textContent = now.toLocaleDateString([], { month: 'short' });
  $('.cal-week').textContent = 'Week ' + isoWeek(now);
  const start = new Date(now); start.setDate(now.getDate() - now.getDay());
  let html = '';
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); html += `<span>${d.toLocaleDateString([], { weekday: 'narrow' })}</span>`; }
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); html += `<b class="${d.toDateString() === now.toDateString() ? 'today' : ''}">${d.getDate()}</b>`; }
  $('.cal-row').innerHTML = html;
}

// ---------------------------------------------------------------- media
let waveSeed = [];
function seedWave(text) {
  let h = 2166136261;
  for (const ch of text || 'islet') h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  waveSeed = Array.from({ length: 72 }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    const env = 0.55 + 0.45 * Math.sin((i / 72) * Math.PI);
    return 0.18 + r * 0.82 * env;
  });
}

async function renderMedia() {
  const a = media.active;
  $('.np-title').textContent = a ? media.title || 'Unknown title' : 'Nothing playing';
  $('.np-artist').textContent = a ? [media.artist, media.album].filter(Boolean).join(' · ') || appName(media.app) : 'Play something in any app';
  $('.rest-title').textContent = a ? media.title || '' : '';
  const art = a && media.art ? media.art : '';
  for (const img of [$('.np-art img'), $('.rest-art')]) if (img.getAttribute('src') !== art) img.setAttribute('src', art);
  $('.np-app').innerHTML = a ? icon('music', 11) : '';
  $('[data-media="toggle"]').innerHTML = icon(a && media.playing ? 'pause' : 'play', 22);
  $('.np-pos').textContent = fmtTime(media.position);
  $('.np-left').textContent = '-' + fmtTime((media.duration || 0) - (media.position || 0));
  const key = `${media.title}|${media.artist}`;
  if (key !== renderMedia.key) {
    renderMedia.key = key;
    seedWave(key);
    if (settings.appearance.accent === 'auto') {
      accentRgb = await accentFromImage(art);
      applyAppearance(settings.appearance, accentRgb);
      api.invoke('accent:set', accentRgb);
    }
  }
  render();
  drawWave();
}

function appName(id) {
  if (!id) return '';
  return id.split(/[\\!]/).pop().replace(/\.exe$/i, '').replace(/[._]/g, ' ');
}

const wave = $('.wave');
let raf = 0;
function drawWave(t = performance.now()) {
  cancelAnimationFrame(raf);
  if (state !== 'open' || tab !== 'music') return;
  const dpr = devicePixelRatio || 1;
  const w = wave.clientWidth, h = wave.clientHeight;
  if (wave.width !== w * dpr) { wave.width = w * dpr; wave.height = h * dpr; }
  const ctx = wave.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!waveSeed.length) seedWave('islet');
  const n = waveSeed.length, gap = 2, bw = (w - gap * (n - 1)) / n;
  const frac = media.active && media.duration ? (media.position || 0) / media.duration : 0;
  const style = getComputedStyle(document.documentElement);
  const acc = `rgb(${style.getPropertyValue('--accent-rgb')})`;
  const dim = style.getPropertyValue('--s-line') || 'rgba(255,255,255,.12)';
  const live = media.active && media.playing;
  for (let i = 0; i < n; i++) {
    const wob = live ? 0.12 * Math.sin(t / 260 + i * 0.7) : 0;
    const v = Math.max(0.12, Math.min(1, waveSeed[i] + wob));
    const bh = v * h;
    ctx.fillStyle = i / n <= frac ? acc : dim;
    const x = i * (bw + gap), y = (h - bh) / 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, bw, bh, bw / 2) : ctx.rect(x, y, bw, bh);
    ctx.fill();
  }
  if (live) raf = requestAnimationFrame((nt) => setTimeout(() => drawWave(nt), 30));
}

wave.addEventListener('pointerdown', (e) => {
  if (!media.active || !media.duration) return;
  const r = wave.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  media.position = frac * media.duration;
  api.invoke('media', 'seek', media.position);
  renderMedia();
});

// ---------------------------------------------------------------- weather + system
function renderWeather() {
  if (!weather) {
    $('.wx-temp').textContent = '--°';
    $('.wx-ic').innerHTML = icon('partly', 26);
    $('.wx-label').textContent = 'Set your city in settings';
    $('.wx-hl').textContent = '';
    return;
  }
  $('.wx-temp').textContent = `${weather.temp}°`;
  $('.wx-ic').innerHTML = icon(weather.icon, 26);
  $('.wx-label').textContent = weather.label;
  $('.wx-hl').textContent = `H ${weather.high}° L ${weather.low}°`;
}

function renderSystem() {
  if (!system) return;
  const set = (k, pct, txt) => {
    const m = $(`.meter[data-k="${k}"]`);
    m.querySelector('b').style.width = `${pct == null ? 0 : pct}%`;
    m.querySelector('em').textContent = txt;
  };
  set('cpu', system.cpu, `${Math.round(system.cpu)}%`);
  set('gpu', system.gpu, system.gpu == null ? '–' : `${Math.round(system.gpu)}%`);
  set('ram', system.ram?.usedPct, `${Math.round(system.ram?.usedPct || 0)}%`);
  $('.net .down b').textContent = fmtRate(system.net?.down);
  $('.net .up b').textContent = fmtRate(system.net?.up);
}

// ---------------------------------------------------------------- focus timer
const FOCUS_KEY = 'islet.focus';
let focus = { focusMin: 25, breakMin: 5, mode: 'focus', running: false, remaining: 25 * 60, endsAt: 0 };
try { Object.assign(focus, JSON.parse(localStorage.getItem(FOCUS_KEY) || '{}')); } catch {}
const saveFocus = () => { try { localStorage.setItem(FOCUS_KEY, JSON.stringify(focus)); } catch {} };
const focusTotal = () => (focus.mode === 'focus' ? focus.focusMin : focus.breakMin) * 60;

function focusAction(a) {
  if (a === 'toggle') {
    if (focus.running) { focus.remaining = Math.max(0, (focus.endsAt - Date.now()) / 1000); focus.running = false; }
    else { focus.endsAt = Date.now() + focus.remaining * 1000; focus.running = true; }
  } else if (a === 'plus' || a === 'minus') {
    const d = a === 'plus' ? 5 : -5;
    if (focus.mode === 'focus') focus.focusMin = Math.min(120, Math.max(5, focus.focusMin + d));
    else focus.breakMin = Math.min(60, Math.max(5, focus.breakMin + d));
    if (!focus.running) focus.remaining = focusTotal();
    else focus.endsAt += d * 60000;
  } else if (a === 'reset') {
    focus.running = false; focus.mode = 'focus'; focus.remaining = focus.focusMin * 60;
  }
  saveFocus();
  renderFocus();
  render();
}

function renderFocus() {
  if (focus.running) {
    focus.remaining = Math.max(0, (focus.endsAt - Date.now()) / 1000);
    if (focus.remaining <= 0) {
      const wasFocus = focus.mode === 'focus';
      api.invoke('notify', { title: wasFocus ? 'Focus session done' : 'Break is over', body: wasFocus ? `Take ${focus.breakMin} minutes.` : 'Ready for another round?' });
      focus.mode = wasFocus ? 'break' : 'focus';
      focus.running = false;
      focus.remaining = focusTotal();
      saveFocus();
      render();
    }
  }
  const txt = fmtTime(focus.remaining).padStart(5, '0');
  $('.ring-time').textContent = txt;
  $('.rest-focus-time').textContent = txt;
  const frac = 1 - focus.remaining / focusTotal();
  $('.ring-fg').style.strokeDashoffset = String(119.4 * (1 - frac));
  $('.mini-ring-fg').style.strokeDashoffset = String(47.1 * (1 - frac));
  $('.focus-meta b').textContent = focus.mode === 'focus' ? 'Focus timer' : 'Break';
  $('.focus-sub').textContent = `${focus.focusMin} + ${focus.breakMin} min`;
  $('[data-focus="toggle"]').innerHTML = icon(focus.running ? 'pause' : 'play', 11);
}

// ---------------------------------------------------------------- wiring
function applySettings() {
  applyAppearance(settings.appearance, settings.appearance.accent === 'auto' ? accentRgb : null);
  if (state !== 'open') state = restingState();
  renderQuick();
  render();
}

api.on('settings', (s) => { settings = s; applySettings(); });
api.on('media', (m) => {
  const was = restKind();
  media = m;
  renderMedia();
  if (restKind() !== was) render();
});
api.on('system', (s) => { system = s; renderSystem(); });
api.on('weather', (w) => { weather = w; renderWeather(); });
api.on('fg', (f) => { fg = f; if (state !== 'open') { state = restingState(); render(); } });

// Keep the island hugging its content (tab switches, async data, fonts).
new ResizeObserver(() => { if (state === 'open') setSize(); }).observe($('.open'));

applySettings();
renderClock();
renderMedia();
renderWeather();
renderSystem();
renderFocus();
setInterval(() => { renderClock(); renderFocus(); }, 1000);
if (q.get('open')) open();
void esc;
