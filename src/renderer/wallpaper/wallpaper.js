import { connect } from '../shared/bridge.js';
import { icon } from '../shared/icons.js';
import { $, $$, applyAppearance, clamp } from '../shared/util.js';
import { SceneRenderer, SCENES } from './scenes.js';
import { renderWidget } from './widgets.js';

const api = await connect();
const q = new URLSearchParams(location.search);
const ARRANGE = q.get('mode') === 'arrange';
document.body.classList.toggle('arrange', ARRANGE);
$('#arrange-bar').hidden = !ARRANGE;

let settings = await api.invoke('settings:get');
const st = await api.invoke('state:get');
const data = { media: st.media, system: st.system, weather: st.weather };
let paused = !!st.paused;
let accent = st.accent || null;
if (q.get('scene')) { settings.wallpaper.enabled = true; settings.wallpaper.kind = 'scene'; settings.wallpaper.scene = q.get('scene'); }

const scene = new SceneRenderer($('#scene'));
const video = $('#video');
const image = $('#image');
const mediaUrl = (p) => 'islet://media/?p=' + encodeURIComponent(p);

// ------------------------------------------------------------ background
let bgKey = '';
async function applyBackground() {
  const w = settings.wallpaper;
  let kind = w.enabled ? w.kind : 'windows';
  if ((kind === 'video' || kind === 'image') && !w.file) kind = 'scene';
  const key = JSON.stringify([kind, w.scene, w.file, w.fit]);
  scene.fps = w.fps; scene.quality = w.quality;
  $('#dim').style.opacity = String((w.dim || 0) / 100);
  video.style.objectFit = image.style.objectFit = w.fit === 'contain' ? 'contain' : 'cover';
  if (key === bgKey) { applyPause(); return; }
  bgKey = key;

  if (kind === 'windows') {
    const res = (await api.invoke('wallpaper:windows-path')) || {};
    document.body.style.background = res.color || '#000';
    document.body.dataset.kind = res.url ? 'image' : 'none';
    if (res.url && image.src !== res.url) image.src = res.url;
    stopVideo(); scene.stop();
    return;
  }
  document.body.dataset.kind = kind;
  if (kind === 'scene') {
    stopVideo();
    // No WebGL (old GPU, VM, remote desktop): fall back to a still gradient.
    document.body.style.background = (SCENES[w.scene] || SCENES.silk).swatch;
    if (scene.ok) { try { scene.setScene(w.scene); } catch (e) { console.error('scene failed', e); } }
  } else if (kind === 'video') {
    scene.stop();
    document.body.style.background = '#000';
    video.src = mediaUrl(w.file);
  } else {
    scene.stop(); stopVideo();
    document.body.style.background = '#000';
    image.src = mediaUrl(w.file);
  }
  applyPause();
}

function stopVideo() { video.pause(); video.removeAttribute('src'); video.load(); }

function applyPause() {
  const kind = document.body.dataset.kind;
  const run = !paused || ARRANGE;
  if (kind === 'scene') run ? scene.start() : (scene.stop(), scene.draw());
  if (kind === 'video') run ? video.play().catch(() => {}) : video.pause();
}

window.addEventListener('resize', () => scene.draw());

// ------------------------------------------------------------ widgets
const wrap = $('#widgets');
function visibleItems() {
  return settings.widgets.enabled ? settings.widgets.items.filter((i) => i.on) : [];
}

function layoutWidgets() {
  const items = visibleItems();
  const ids = new Set(items.map((i) => i.id));
  $$('.widget', wrap).forEach((n) => { if (!ids.has(n.dataset.id)) n.remove(); });
  for (const it of items) {
    let n = wrap.querySelector(`.widget[data-id="${it.id}"]`);
    if (!n) {
      n = document.createElement('div');
      n.className = 'widget';
      n.dataset.id = it.id;
      n.innerHTML = '<div class="w-body"></div>' + (ARRANGE ? `<div class="w-tools">
        <button data-tool="smaller" title="Smaller">${icon('minus', 13)}</button>
        <button data-tool="bigger" title="Bigger">${icon('plus', 13)}</button>
        <button data-tool="hide" title="Hide widget">${icon('x', 13)}</button></div>` : '');
      wrap.appendChild(n);
    }
    n.style.left = it.x + '%';
    n.style.top = it.y + '%';
    n.style.setProperty('--scale', String(it.scale || 1));
  }
  paintWidgets();
}

function paintWidgets(only) {
  for (const it of visibleItems()) {
    if (only && !only.includes(it.type)) continue;
    const body = wrap.querySelector(`.widget[data-id="${it.id}"] .w-body`);
    if (body) { const html = renderWidget(it, data); if (body.innerHTML !== html) body.innerHTML = html; }
  }
}

// ------------------------------------------------------------ arrange mode
if (ARRANGE) {
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => {
    const tool = e.target.closest('[data-tool]');
    const node = e.target.closest('.widget');
    if (!node) return;
    const items = structuredClone(settings.widgets.items);
    const it = items.find((i) => i.id === node.dataset.id);
    if (tool) {
      if (tool.dataset.tool === 'hide') it.on = false;
      else it.scale = clamp(Math.round(((it.scale || 1) + (tool.dataset.tool === 'bigger' ? 0.1 : -0.1)) * 10) / 10, 0.6, 2);
      save(items);
      return;
    }
    drag = { node, id: it.id, sx: e.clientX, sy: e.clientY, x: it.x, y: it.y };
    node.classList.add('dragging');
    node.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const nx = clamp(drag.x + ((e.clientX - drag.sx) / innerWidth) * 100, 2, 98);
    const ny = clamp(drag.y + ((e.clientY - drag.sy) / innerHeight) * 100, 2, 98);
    // gentle snap to the centre lines
    drag.nx = Math.abs(nx - 50) < 1.2 ? 50 : nx;
    drag.ny = Math.abs(ny - 50) < 1.2 ? 50 : ny;
    drag.node.style.left = drag.nx + '%';
    drag.node.style.top = drag.ny + '%';
  });
  const end = () => {
    if (!drag) return;
    drag.node.classList.remove('dragging');
    if (drag.nx != null) {
      const items = structuredClone(settings.widgets.items);
      const it = items.find((i) => i.id === drag.id);
      it.x = Math.round(drag.nx * 10) / 10; it.y = Math.round(drag.ny * 10) / 10;
      save(items);
    }
    drag = null;
  };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
  $('#arrange-bar').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-arrange]');
    if (!b) return;
    if (b.dataset.arrange === 'done') api.invoke('arrange:done');
    if (b.dataset.arrange === 'reset') {
      const defaults = await (await fetch('../shared/defaults.json')).json();
      const on = new Map(settings.widgets.items.map((i) => [i.id, i.on]));
      save(defaults.widgets.items.map((i) => ({ ...i, on: on.has(i.id) ? on.get(i.id) : i.on })));
    }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') api.invoke('arrange:done'); });
}

function save(items) {
  settings.widgets.items = items;
  layoutWidgets();
  api.invoke('settings:set', 'widgets.items', items);
}

// ------------------------------------------------------------ wiring
function applySettings() {
  applyAppearance(settings.appearance, settings.appearance.accent === 'auto' ? accent : null);
  document.body.dataset.glass = settings.widgets.glass ? '1' : '0';
  applyBackground();
  layoutWidgets();
}

api.on('settings', (s) => { settings = s; applySettings(); });
api.on('media', (m) => { data.media = m; paintWidgets(['media']); });
api.on('system', (s) => { data.system = s; paintWidgets(['system']); });
api.on('weather', (w) => { data.weather = w; paintWidgets(['weather']); });
api.on('accent', (a) => { accent = a; applyAppearance(settings.appearance, settings.appearance.accent === 'auto' ? accent : null); });
api.on('wallpaper:paused', (p) => { paused = p; applyPause(); });

applySettings();
setInterval(() => paintWidgets(['clock', 'calendar']), 1000);
// Pick up Windows slideshow / Spotlight changes when showing the normal wallpaper.
setInterval(() => { if (!settings.wallpaper.enabled) { bgKey = ''; applyBackground(); } }, 5 * 60 * 1000);
