import { connect } from '../shared/bridge.js';
import { icon } from '../shared/icons.js';
import { $, $$, esc, applyAppearance, SURFACES } from '../shared/util.js';
import { SCENES } from '../wallpaper/scenes.js';
import { WIDGET_TYPES, CLOCK_STYLES } from '../wallpaper/widgets.js';

const api = await connect();
let settings = await api.invoke('settings:get');
const info = await api.invoke('app:info');
let accent = (await api.invoke('state:get')).accent || null;

document.body.classList.toggle('has-material', !!info.glass);
$('.ver').textContent = 'v' + info.version;
const onWindows = info.platform === 'win32';
if (onWindows && !info.native) {
  $('.status').classList.add('warn');
  $('.status-text').textContent = 'Limited mode (native layer off)';
}

// ------------------------------------------------------------------ helpers
const getPath = (key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), settings);
function setLocal(key, v) {
  const ks = key.split('.');
  let o = settings;
  ks.slice(0, -1).forEach((k) => (o = o[k]));
  o[ks.at(-1)] = v;
}
function set(key, v) { setLocal(key, v); api.invoke('settings:set', key, v); afterLocalChange(); }
function patch(changes) { Object.entries(changes).forEach(([k, v]) => setLocal(k, v)); api.invoke('settings:patch', changes); afterLocalChange(); }

let binds = [];
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

function toggle(key) {
  const el = h('<label class="toggle"><input type="checkbox"><span></span></label>');
  const i = el.querySelector('input');
  const sync = () => (i.checked = !!getPath(key));
  i.addEventListener('change', () => set(key, i.checked));
  binds.push(sync); sync();
  return el;
}
function slider(key, min, max, step, fmt = (v) => v) {
  const el = h(`<div class="slider"><input type="range" min="${min}" max="${max}" step="${step}"><output></output></div>`);
  const i = el.querySelector('input'), o = el.querySelector('output');
  const sync = () => { i.value = getPath(key); o.textContent = fmt(+i.value); };
  i.addEventListener('input', () => { o.textContent = fmt(+i.value); setLocal(key, +i.value); afterLocalChange(true); });
  i.addEventListener('change', () => set(key, +i.value));
  binds.push(sync); sync();
  return el;
}
function seg(key, options) {
  const el = h('<div class="seg"></div>');
  el.innerHTML = options.map(([v, label]) => `<button data-v="${esc(v)}">${esc(label)}</button>`).join('');
  const sync = () => $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === String(getPath(key))));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const opt = options.find(([v]) => String(v) === b.dataset.v);
    set(key, opt[0]); sync();
  });
  binds.push(sync); sync();
  return el;
}
function row(title, desc, control) {
  const el = h(`<div class="row"><div class="txt"><div class="t">${title}</div>${desc ? `<div class="d">${desc}</div>` : ''}</div></div>`);
  if (control) el.appendChild(control);
  return el;
}
function group(...rows) { const g = h('<div class="group"></div>'); rows.filter(Boolean).forEach((r) => g.appendChild(r)); return g; }
function button(label, cls, onClick, ic) { const b = h(`<button class="btn ${cls || ''}">${ic ? icon(ic, 15) : ''}${esc(label)}</button>`); b.addEventListener('click', onClick); return b; }
function note(html, ic = 'shield') { return h(`<div class="note">${icon(ic, 16)}<div>${html}</div></div>`); }
function heading(text) { return h(`<h2>${esc(text)}</h2>`); }
let toastTimer;
function toast(msg) { const t = $('.toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200); }

// ------------------------------------------------------------------ sections
function glassControls(container, { compact = false } = {}) {
  const preview = h(`<div class="preview"><iframe src="../island/index.html?open=1&tab=music&preview=1" title="Island preview"></iframe><span class="cap">Live preview</span></div>`);
  container.appendChild(preview);
  const frame = preview.querySelector('iframe');
  const push = () => { try { frame.contentWindow.postMessage({ type: 'islet:preview', settings: structuredClone(settings) }, '*'); } catch {} };
  frame.addEventListener('load', () => setTimeout(push, 300));
  previewPushers.push(push);

  container.appendChild(heading('Surface'));
  const g = h('<div class="group"></div>');
  const grid = h('<div class="surfaces"></div>');
  grid.innerHTML = SURFACES.map((s) => `<button class="surf" data-s="${s.id}" title="${esc(s.note)}"><div class="pill glass" data-surface="${s.id}"></div><span>${esc(s.name)}</span></button>`).join('');
  // each swatch renders with its own surface variables
  $$('.pill', grid).forEach((p) => { p.closest('.surf').dataset.surfaceWrap = p.dataset.surface; });
  const syncS = () => $$('.surf', grid).forEach((b) => b.classList.toggle('on', b.dataset.s === settings.appearance.surface));
  grid.addEventListener('click', (e) => { const b = e.target.closest('.surf'); if (b) { set('appearance.surface', b.dataset.s); syncS(); } });
  binds.push(syncS); syncS();
  g.appendChild(grid);
  container.appendChild(g);

  container.appendChild(heading('Shape and colour'));
  container.appendChild(group(
    row('Corners', 'How round the island, dock and widgets are, from square to fully round.', slider('appearance.radius', 0, 100, 1, (v) => v + '%')),
    !compact && row('Glass blur', 'How strongly widgets blur the wallpaper behind them.', slider('appearance.blur', 0, 48, 1, (v) => v + 'px')),
    row('Accent colour', 'Follow the album art of what is playing, or pick one colour.', (() => {
      const wrap = h('<div style="display:flex;gap:10px;align-items:center"></div>');
      wrap.appendChild(seg('appearance.accent', [['auto', 'From album art'], ['custom', 'Custom']]));
      const c = h('<input type="color" title="Custom accent">');
      const sync = () => { c.value = settings.appearance.customAccent; };
      c.addEventListener('input', () => { setLocal('appearance.customAccent', c.value); afterLocalChange(true); });
      c.addEventListener('change', () => patch({ 'appearance.customAccent': c.value, 'appearance.accent': 'custom' }));
      binds.push(sync); sync();
      wrap.appendChild(c);
      return wrap;
    })()),
    !compact && row('Accent glow', 'A soft coloured halo around the island while music plays.', toggle('appearance.glow')),
  ));
  if (!compact) {
    container.appendChild(note('<b>How the glass works.</b> Widgets live inside the wallpaper layer, so their frosted glass really blurs the live wallpaper behind them. The Settings window uses Windows 11\'s own Acrylic material. The island floats above every app, where web content can\'t blur the screen, so it uses a tinted glass that stays readable on any background.', 'sparkles'));
  }
}

function islandControls(container) {
  container.appendChild(group(
    row('Show the island', 'The glass pill at the top of your screen with music, calendar, timer, weather and stats.', toggle('island.enabled')),
    row('Open on hover', 'Expand when the pointer rests on the island. You can always click it instead.', toggle('island.expandOnHover')),
    row('Hover delay', 'How long to rest the pointer before it opens.', slider('island.hoverDelay', 0, 800, 20, (v) => v + ' ms')),
    row('When the island opens', 'Start on the last card you used, or always on one.', seg('island.openTab', [['last', 'Last card'], ['music', 'Music'], ['overview', 'Overview']])),
  ));
  container.appendChild(heading('Getting out of the way'));
  container.appendChild(group(
    row('Slim strip under maximised windows', 'Shrinks to a thin line so it never covers browser tabs. Hover the line to open it.', toggle('general.slimWhenMaximized')),
    row('Hide in fullscreen apps', 'Hides the island (and the dock) during games, videos and presentations.', toggle('general.hideOnFullscreen')),
    row('Keyboard shortcut', 'Open or close the island from anywhere.', seg('general.hotkey', [['Control+Alt+Space', 'Ctrl + Alt + Space'], ['Alt+Shift+I', 'Alt + Shift + I'], ['', 'Off']])),
  ));
  container.appendChild(note('<b>Music works with any player</b> that shows up in Windows\' volume flyout: Spotify, YouTube in Edge or Chrome, Media Player, Apple Music and more. Islet reads it through Windows\' own media controls.', 'music'));
}

function taskbarControls(container, { compact = false } = {}) {
  const modes = [
    ['off', 'Windows default', 'Leave the taskbar exactly as it is.'],
    ['float', 'Floating', 'Your real taskbar, inset with rounded corners. Same buttons, tray and everything.'],
    ['dock', 'Islet glass dock', 'A centred glass dock with your apps and a clock. Windows\' taskbar is hidden while Islet runs.'],
  ];
  const cards = h('<div class="cards"></div>');
  cards.innerHTML = modes.map(([id, name, desc]) => `<button class="card-opt" data-m="${id}"><div class="mock-screen ${id}"><div class="tb"></div></div><b>${name}</b><small>${desc}</small></button>`).join('');
  const sync = () => $$('.card-opt', cards).forEach((b) => b.classList.toggle('on', b.dataset.m === settings.taskbar.mode));
  cards.addEventListener('click', (e) => { const b = e.target.closest('.card-opt'); if (b) { set('taskbar.mode', b.dataset.m); sync(); } });
  binds.push(sync); sync();
  container.appendChild(cards);

  const mode = settings.taskbar.mode;
  if (mode === 'float' && !compact) {
    container.appendChild(heading('Floating taskbar'));
    container.appendChild(group(
      row('Side margin', 'Gap between the taskbar and the screen edges.', slider('taskbar.float.sideMargin', 0, 120, 1, (v) => v + ' px')),
      row('Top and bottom margin', 'A little air above and below the bar.', slider('taskbar.float.vertMargin', 0, 10, 1, (v) => v + ' px')),
      row('Corner radius', '', slider('taskbar.float.radius', 0, 24, 1, (v) => v + ' px')),
      row('Width', 'Narrow it to float in the middle. Below 100% the tray and clock may be cut off.', slider('taskbar.float.width', 40, 100, 1, (v) => v + '%')),
    ));
  }
  if (mode === 'dock' && !compact) {
    container.appendChild(heading('Glass dock'));
    container.appendChild(group(
      row('Icon size', '', slider('taskbar.dock.size', 32, 64, 2, (v) => v + ' px')),
      row('Search button', 'Opens Windows Search.', toggle('taskbar.dock.showSearch')),
      row('Clock', 'Click it for notifications and the calendar.', toggle('taskbar.dock.showClock')),
      row('Keep windows above the dock', 'Maximised windows stop at the dock instead of sliding under it.', toggle('taskbar.dock.reserveSpace')),
      row('Hide in fullscreen apps', '', toggle('taskbar.dock.hideOnFullscreen')),
    ));
    container.appendChild(heading('Pinned apps'));
    const pins = h('<div class="group"><div class="row col"><div class="pins"></div></div></div>');
    const list = $('.pins', pins);
    list.innerHTML = settings.taskbar.dock.pins.map((p) => `<span class="pin">${esc(p.name || p.target)}<button data-unpin="${esc(p.id)}" title="Unpin">${icon('x', 12)}</button></span>`).join('') || '<span class="d">Nothing pinned yet.</span>';
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-unpin]'); if (!b) return;
      set('taskbar.dock.pins', settings.taskbar.dock.pins.filter((p) => p.id !== b.dataset.unpin));
      renderPage();
    });
    const addRow = h('<div class="row"><div class="txt"><div class="d">Right-click a running app in the dock to pin it, or add any app or shortcut here.</div></div></div>');
    addRow.appendChild(button('Add an app…', '', async () => { if (await api.invoke('pin:add')) { settings = await api.invoke('settings:get'); renderPage(); } }, 'plus'));
    pins.appendChild(addRow);
    container.appendChild(pins);
  }
  if (!compact) {
    container.appendChild(note('<b>No registry edits, nothing injected.</b> Floating mode reshapes the taskbar with a window region, the dock uses Windows\' official auto-hide setting, and both are undone the moment Islet quits. If anything ever looks stuck, use <b>Restore Windows taskbar</b> in the tray menu or run <kbd>Islet.exe --restore</kbd>.', 'shield'));
  }
  if (!onWindows) container.appendChild(note('Taskbar changes only apply on Windows 11. You are viewing a preview.', 'sparkles'));
}

const mediaUrl = (p) => 'islet://media/?p=' + encodeURIComponent(p);
function wallpaperControls(container, { compact = false } = {}) {
  container.appendChild(group(
    row('Live wallpaper', 'Plays behind your desktop icons. Turn it off to keep your normal Windows wallpaper.', toggle('wallpaper.enabled')),
  ));
  container.appendChild(heading('Built-in scenes'));
  const w = settings.wallpaper;
  const gal = h('<div class="gallery"></div>');
  gal.innerHTML = Object.entries(SCENES).map(([id, s]) => `
    <button class="wp${w.enabled && w.kind === 'scene' && w.scene === id ? ' on' : ''}" data-scene="${id}" title="${esc(s.note)}">
      <div class="thumb" style="background:${s.swatch}"></div>
      <span class="label">${esc(s.name)}<em>Live</em></span></button>`).join('');
  container.appendChild(gal);

  container.appendChild(heading('Your videos, GIFs and pictures'));
  const lib = h('<div class="gallery"></div>');
  lib.innerHTML = w.library.map((it) => `
    <button class="wp${w.enabled && w.kind !== 'scene' && w.file === it.path ? ' on' : ''}" data-file="${esc(it.path)}" data-kind="${it.kind}" title="${esc(it.path)}">
      ${it.kind === 'video' ? `<video src="${mediaUrl(it.path)}#t=1" muted preload="metadata"></video>` : `<img src="${mediaUrl(it.path)}" alt="">`}
      <span class="label">${esc(it.name)}<em>${it.kind === 'video' ? 'Video' : /\.gif$/i.test(it.path) ? 'GIF' : 'Image'}</em></span>
      <span class="rm" data-rm="${esc(it.path)}" title="Remove from library">${icon('x', 13)}</span></button>`).join('') +
    `<button class="wp add" data-add="1">${icon('plus', 22)}Add video, GIF<br>or picture</button>`;
  container.appendChild(lib);

  const onPick = async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { e.stopPropagation(); await api.invoke('wallpaper:remove', rm.dataset.rm); settings = await api.invoke('settings:get'); renderPage(); return; }
    const b = e.target.closest('.wp'); if (!b) return;
    if (b.dataset.add) { if (await api.invoke('wallpaper:add-files')) { settings = await api.invoke('settings:get'); renderPage(); toast('Wallpaper added'); } return; }
    if (b.dataset.scene) patch({ 'wallpaper.enabled': true, 'wallpaper.kind': 'scene', 'wallpaper.scene': b.dataset.scene });
    else patch({ 'wallpaper.enabled': true, 'wallpaper.kind': b.dataset.kind, 'wallpaper.file': b.dataset.file });
    renderPage();
  };
  gal.addEventListener('click', onPick);
  lib.addEventListener('click', onPick);

  if (compact) return;
  container.appendChild(heading('Playback'));
  container.appendChild(group(
    row('Pause when an app covers the desktop', 'Stops when a window is maximised or fullscreen, so games and work get the GPU.', toggle('wallpaper.pauseWhenCovered')),
    row('Pause on battery', 'Saves power when your laptop is unplugged.', toggle('wallpaper.pauseOnBattery')),
    row('Frame rate', 'Lower is lighter. 30 looks smooth for most scenes.', seg('wallpaper.fps', [[15, '15'], [30, '30'], [60, '60']])),
    row('Scene quality', 'Render scale for built-in scenes. Lower uses less GPU.', slider('wallpaper.quality', 0.3, 1, 0.05, (v) => Math.round(v * 100) + '%')),
    row('Fit', 'For videos and pictures.', seg('wallpaper.fit', [['cover', 'Fill'], ['contain', 'Fit']])),
    row('Dim', 'Darken the wallpaper so icons and widgets stand out.', slider('wallpaper.dim', 0, 70, 1, (v) => v + '%')),
    row('Mute video sound', '', toggle('wallpaper.muted')),
  ));
}

function widgetControls(container, { compact = false } = {}) {
  const top = h('<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap"></div>');
  top.appendChild(button('Arrange on desktop', 'primary', () => api.invoke('arrange:open'), 'layout'));
  container.appendChild(top);
  container.appendChild(group(
    row('Show desktop widgets', 'Widgets sit on the desktop behind your icons, on top of the wallpaper.', toggle('widgets.enabled')),
    !compact && row('Frosted glass', 'Blur the wallpaper behind each widget. Turn off for a solid card.', toggle('widgets.glass')),
  ));
  container.appendChild(heading('Widgets'));
  const list = h('<div class="group wlist"></div>');
  const icons = { clock: 'timer', weather: 'partly', system: 'cpu', calendar: 'calendar', media: 'music' };
  settings.widgets.items.forEach((it, idx) => {
    const t = WIDGET_TYPES[it.type];
    const r = h(`<div class="row"><span class="ic-box">${icon(icons[it.type], 18)}</span><div class="txt"><div class="t">${t.name}</div><div class="d">${t.note}</div></div></div>`);
    if (it.type === 'clock') {
      const s = h('<div class="seg"></div>');
      s.innerHTML = CLOCK_STYLES.map((c) => `<button data-v="${c.id}" class="${(it.style || 'wide') === c.id ? 'on' : ''}">${c.name}</button>`).join('');
      s.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const items = structuredClone(settings.widgets.items); items[idx].style = b.dataset.v;
        set('widgets.items', items);
        $$('button', s).forEach((x) => x.classList.toggle('on', x === b));
      });
      r.appendChild(s);
    }
    const tg = h('<label class="toggle"><input type="checkbox"><span></span></label>');
    const input = tg.querySelector('input');
    input.checked = !!it.on;
    input.addEventListener('change', () => { const items = structuredClone(settings.widgets.items); items[idx].on = input.checked; set('widgets.items', items); });
    r.appendChild(tg);
    list.appendChild(r);
  });
  container.appendChild(list);

  container.appendChild(heading('Weather'));
  const city = h(`<div class="city"><input type="text" placeholder="Type your city…" spellcheck="false"><div class="results" hidden></div></div>`);
  const input = $('input', city), results = $('.results', city);
  input.value = settings.widgets.weather.city || '';
  let tmr;
  input.addEventListener('input', () => {
    clearTimeout(tmr);
    tmr = setTimeout(async () => {
      const qv = input.value.trim();
      if (qv.length < 2) { results.hidden = true; return; }
      const res = await api.invoke('weather:search', qv);
      if (!Array.isArray(res) || !res.length) { results.innerHTML = `<button disabled>${res?.error ? 'Could not reach the weather service' : 'No places found'}</button>`; results.hidden = false; return; }
      results.innerHTML = res.map((r, i) => `<button data-i="${i}">${esc(r.label)}</button>`).join('');
      results.hidden = false;
      results.onclick = (e) => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        const r = res[+b.dataset.i];
        patch({ 'widgets.weather.city': r.name, 'widgets.weather.lat': r.lat, 'widgets.weather.lon': r.lon });
        input.value = r.name; results.hidden = true;
        toast(`Weather set to ${r.label}`);
      };
    }, 300);
  });
  input.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 200));
  container.appendChild(group(
    row('City', 'Forecasts from Open-Meteo: free, no account, no API key.', city),
    row('Units', '', seg('widgets.weather.units', [['metric', '°C'], ['imperial', '°F']])),
  ));
}

// ------------------------------------------------------------------ pages
const STEPS = [
  { id: 'app', title: 'Get the app', icon: 'check' },
  { id: 'glass', title: 'Glass', icon: 'layers' },
  { id: 'taskbar', title: 'Taskbar', icon: 'dock' },
  { id: 'wallpaper', title: 'Live wallpaper', icon: 'image' },
  { id: 'widgets', title: 'Widgets', icon: 'overview' },
];
let stepIdx = 0;
try { stepIdx = Math.min(4, +sessionStorage.getItem('islet.step') || 0); } catch {}
const visited = new Set([0]);

const PAGES = {
  start: {
    label: 'Start here', icon: 'sparkles', deps: ['taskbar.mode', 'wallpaper', 'onboarded'],
    render(el) {
      el.innerHTML = `<div class="eyebrow">Welcome</div><h1>Five steps to a glass desktop</h1>
        <p class="lede">Turn stock Windows 11 into a glass setup with a floating island, a floating taskbar, a live wallpaper and widgets. Every change can be undone, and nothing touches the registry.</p>`;
      const stepper = h('<div class="stepper"></div>');
      stepper.innerHTML = STEPS.map((s, i) => `<button data-i="${i}" class="${i === stepIdx ? 'on' : ''} ${visited.has(i) && i !== stepIdx ? 'done' : ''}"><em>STEP ${i + 1}</em><b>${s.title}</b></button>`).join('');
      stepper.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) goStep(+b.dataset.i); });
      el.appendChild(stepper);
      const body = h('<div></div>');
      const s = STEPS[stepIdx].id;
      if (s === 'app') {
        body.appendChild(h(`<div class="hero-done"><span class="big">${icon('check', 22)}</span><div><b>Islet is installed and running.</b><div class="d" style="color:var(--dim);margin-top:4px">Look at the top of your screen: that glass pill is the island. Hover it to open music, calendar, timer, weather and stats.</div></div></div>`));
        body.appendChild(heading('Basics'));
        body.appendChild(group(
          row('Start Islet when I sign in', 'Adds a shortcut to your Startup folder. No registry Run key.', toggle('general.runAtStartup')),
          row('Open the island from anywhere', 'Press <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Space</kbd>. You can change this later.', null),
        ));
      }
      if (s === 'glass') glassControls(body, { compact: true });
      if (s === 'taskbar') taskbarControls(body, { compact: true });
      if (s === 'wallpaper') wallpaperControls(body, { compact: true });
      if (s === 'widgets') widgetControls(body, { compact: true });
      el.appendChild(body);

      const nav = h('<div class="wizard-nav"></div>');
      const back = button('Back', 'ghost', () => goStep(stepIdx - 1), 'arrowLeft');
      back.style.visibility = stepIdx === 0 ? 'hidden' : 'visible';
      nav.appendChild(back);
      nav.appendChild(h(`<div class="dots">${STEPS.map((_, i) => `<i class="${i === stepIdx ? 'on' : ''}"></i>`).join('')}</div>`));
      const last = stepIdx === STEPS.length - 1;
      nav.appendChild(button(last ? 'Finish' : 'Next', 'primary', () => {
        if (!last) return goStep(stepIdx + 1);
        set('onboarded', true);
        toast('All set. Enjoy your new desktop!');
        go('glass');
      }, last ? 'check' : 'arrowRight'));
      el.appendChild(nav);
    },
  },
  glass: { label: 'Glass', icon: 'layers', step: 2, deps: [], render(el) { intro(el, 'Step 2', 'Glass', 'Pick how the island, dock and widgets look: smoky or clear glass, solid, or tinted.'); glassControls(el); } },
  island: { label: 'Island', icon: 'island', deps: [], render(el) { intro(el, 'Island', 'The island', 'A small glass pill at the top of the screen that opens into cards when you need them.'); islandControls(el); } },
  taskbar: { label: 'Taskbar', icon: 'dock', step: 3, deps: ['taskbar.mode', 'taskbar.dock.pins'], render(el) { intro(el, 'Step 3', 'Taskbar', 'Float Windows\' own taskbar, or swap it for Islet\'s glass dock.'); taskbarControls(el); } },
  wallpaper: { label: 'Live wallpaper', icon: 'image', step: 4, deps: ['wallpaper.library', 'wallpaper.kind', 'wallpaper.scene', 'wallpaper.file', 'wallpaper.enabled'], render(el) { intro(el, 'Step 4', 'Live wallpaper', 'Animated scenes, or your own videos, GIFs and pictures, playing behind your desktop icons.'); wallpaperControls(el); } },
  widgets: { label: 'Widgets', icon: 'overview', step: 5, deps: ['widgets.items'], render(el) { intro(el, 'Step 5', 'Widgets', 'A big clock, weather, system stats, a calendar and now playing, right on the desktop.'); widgetControls(el); } },
  general: {
    label: 'General', icon: 'gear', deps: [], render(el) {
      intro(el, 'Settings', 'General', '');
      el.appendChild(group(
        row('Start Islet when I sign in', 'Uses a shortcut in your Startup folder, not the registry.', toggle('general.runAtStartup')),
        row('Hide the island and dock in fullscreen apps', '', toggle('general.hideOnFullscreen')),
      ));
      el.appendChild(heading('Undo and reset'));
      const restore = row('Restore Windows taskbar', 'Switch back to the normal taskbar right now.', button('Restore', '', () => { set('taskbar.mode', 'off'); toast('Windows taskbar restored'); }, 'dock'));
      const reset = row('Reset all settings', 'Puts every option back to its default. Your wallpaper library is cleared too.', button('Reset', 'danger', async () => { await api.invoke('settings:reset'); settings = await api.invoke('settings:get'); renderPage(); toast('Settings reset'); }));
      const quit = row('Quit Islet', 'Closes Islet and undoes everything it changed.', button('Quit', '', () => api.invoke('shell', 'quit'), 'power'));
      el.appendChild(group(restore, reset, quit));
    },
  },
  about: {
    label: 'About', icon: 'shield', deps: [], render(el) {
      intro(el, 'About', 'Islet', 'Free and open source under the MIT licence. Islet has no accounts, no ads and no telemetry. The only network request it makes is the weather forecast, and only once you pick a city.');
      el.appendChild(group(h(`<div class="kv">
        <span>Version</span><code>${esc(info.version)}</code>
        <span>Windows build</span><code>${esc(info.windowsBuild || '—')}</code>
        <span>System glass</span><code>${info.glass ? 'Acrylic available' : 'Not available (needs Windows 11 22H2+)'}</code>
        <span>Native layer</span><code>${info.native ? 'Loaded' : esc(info.nativeReason || 'Off')}</code>
        <span>Wallpaper layer</span><code>${info.wallpaperAttached ? 'Behind desktop icons' : 'Not attached'}</code>
        <span>Settings file</span><code>${esc(info.settingsPath)}</code>
      </div>`)));
      el.appendChild(heading('Built with'));
      el.appendChild(group(h(`<div class="kv">
        <span>Electron</span><code>MIT</code>
        <span>koffi</span><code>MIT (Win32 calls without a compiler)</code>
        <span>Open-Meteo</span><code>Weather data, CC BY 4.0</code>
        <span>Michroma font</span><code>SIL Open Font License 1.1</code>
      </div>`)));
    },
  },
};
const NAV = [['Setup', ['start', 'glass', 'taskbar', 'wallpaper', 'widgets']], ['Customise', ['island']], ['App', ['general', 'about']]];

function intro(el, eyebrow, title, lede) {
  el.innerHTML = `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : '<div style="height:14px"></div>'}`;
}

let current = (location.hash || '').slice(1) || (settings.onboarded ? 'glass' : 'start');
if (!PAGES[current]) current = 'start';
let previewPushers = [];
let depSnap = '';

function renderNav() {
  $('.nav').innerHTML = NAV.map(([sec, ids]) => `<div class="sec">${sec}</div>` + ids.map((id) => {
    const p = PAGES[id];
    return `<a href="#${id}" data-p="${id}" class="${id === current ? 'on' : ''}">${icon(p.icon, 17)}<span>${p.label}</span>${p.step ? `<span class="step">${p.step}</span>` : ''}</a>`;
  }).join('')).join('');
}

function snapDeps() { return JSON.stringify((PAGES[current].deps || []).map(getPath)); }

function renderPage() {
  binds = [];
  previewPushers = [];
  const el = $('.page');
  const scroll = $('.main').scrollTop;
  el.innerHTML = '';
  PAGES[current].render(el);
  depSnap = snapDeps();
  $('.main').scrollTop = scroll;
}

function go(id) {
  if (!PAGES[id]) return;
  current = id;
  history.replaceState(null, '', '#' + id);
  renderNav();
  renderPage();
  $('.main').scrollTop = 0;
}
function goStep(i) {
  stepIdx = Math.max(0, Math.min(STEPS.length - 1, i));
  visited.add(stepIdx);
  try { sessionStorage.setItem('islet.step', String(stepIdx)); } catch {}
  renderPage();
  $('.main').scrollTop = 0;
}

$('.nav').addEventListener('click', (e) => { const a = e.target.closest('[data-p]'); if (a) { e.preventDefault(); go(a.dataset.p); } });
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id !== current) go(id); });
api.on('nav', (id) => go(id));

function afterLocalChange(lightweight = false) {
  applyAppearance(settings.appearance, settings.appearance.accent === 'auto' ? accent : null);
  previewPushers.forEach((p) => p());
  if (!lightweight) binds.forEach((b) => b());
}

api.on('settings', (s) => {
  settings = s;
  afterLocalChange();
  if (snapDeps() !== depSnap) renderPage();
});
api.on('accent', (a) => { accent = a; afterLocalChange(true); });

applyAppearance(settings.appearance, settings.appearance.accent === 'auto' ? accent : null);
renderNav();
renderPage();
