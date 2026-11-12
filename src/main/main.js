'use strict';
const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog,
  protocol, globalShortcut, powerMonitor, Notification, net, systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const { Store } = require('./store');
const native = require('./native/win32');
const { TaskbarController } = require('./native/taskbar');
const { Helper } = require('./helpers/helper');
const { CpuSampler, memory, searchCity, fetchWeather, setRunAtStartup } = require('./services');
const proto = require('./protocol');

const DEV = process.argv.includes('--dev');
const IS_WIN = process.platform === 'win32';
const WIN_BUILD = IS_WIN ? parseInt(os.release().split('.')[2] || '0', 10) : 0;
const GLASS_SUPPORTED = IS_WIN && WIN_BUILD >= 22621; // Windows 11 22H2+ system backdrops
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const APP_URL = (p) => `islet://app/${p}`;

proto.registerSchemes(protocol);
app.setAppUserModelId('dev.islet.app');

// ---------------------------------------------------------------------------
// Single instance + recovery flag
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (argv.includes('--restore')) restoreEverything();
    openSettings();
  });
}

let store, taskbar, helper, tray;
const wins = { island: null, dock: null, wallpaper: null, settings: null, arrange: null };
const state = {
  media: { active: false },
  system: { cpu: 0, gpu: null, ram: memory(), net: { down: 0, up: 0 }, history: { cpu: [], gpu: [], ram: [] } },
  weather: null,
  dock: [],
  fg: { covered: false, maximized: false, fullscreen: false },
  wallpaperPaused: false,
  onBattery: false,
  accent: null,
};
let wallpaperAttached = false;
let appBar = { registered: false, msg: 0 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const alive = (w) => w && !w.isDestroyed();
function broadcast(channel, payload) {
  for (const w of Object.values(wins)) if (alive(w)) w.webContents.send(channel, payload);
}
function primary() { return screen.getPrimaryDisplay(); }

function baseWebPrefs(extra = {}) {
  return { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, ...extra };
}

function hardenContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => { if (!url.startsWith('islet://')) e.preventDefault(); });
  contents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', contents.getURL(), d.reason));
  if (DEV) {
    contents.on('console-message', (e, level, message, line, source) => {
      const lvl = e.level ?? level, msg = e.message ?? message;
      if (lvl === 'warning' || lvl === 'error' || lvl >= 2) console.log(`[ui:${lvl}] ${contents.getURL()} ${msg} ${e.lineNumber ?? line ?? ''} ${e.sourceId ?? source ?? ''}`);
    });
  }
}

function isAllowedMedia(p) {
  const s = store.get();
  const allowed = new Set([s.wallpaper.file, ...s.wallpaper.library.map((x) => x.path)].filter(Boolean).map((x) => path.normalize(x)));
  if (IS_WIN && native.available) {
    const wp = native.getDesktopWallpaperPath();
    if (wp) allowed.add(path.normalize(wp));
  }
  return allowed.has(p);
}

// ---------------------------------------------------------------------------
// Island (the floating glass pill at the top of the screen)
// ---------------------------------------------------------------------------
const ISLAND_W = 560, ISLAND_H = 420;
function createIsland() {
  if (alive(wins.island)) return;
  const b = primary().bounds;
  const w = new BrowserWindow({
    width: ISLAND_W, height: ISLAND_H, x: Math.round(b.x + (b.width - ISLAND_W) / 2), y: b.y,
    frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false,
    backgroundColor: '#00000000', title: 'Islet Island',
    webPreferences: baseWebPrefs({ backgroundThrottling: false }),
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setIgnoreMouseEvents(true, { forward: true });
  w.setVisibleOnAllWorkspaces(true);
  hardenContents(w.webContents);
  w.loadURL(APP_URL('island/index.html'));
  w.once('ready-to-show', () => w.showInactive());
  w.on('closed', () => { wins.island = null; });
  wins.island = w;
}

function positionIsland() {
  if (!alive(wins.island)) return;
  const b = primary().bounds;
  wins.island.setBounds({ width: ISLAND_W, height: ISLAND_H, x: Math.round(b.x + (b.width - ISLAND_W) / 2), y: b.y });
}

// ---------------------------------------------------------------------------
// Dock (Islet's own floating glass taskbar)
// ---------------------------------------------------------------------------
const DOCK_EXTRA = 64; // transparent room above the bar for tooltips
function dockHeights() {
  const size = store.get('taskbar.dock.size') || 44;
  const bar = size + 16;        // icon + padding
  const gap = 10;               // floating gap above the screen edge
  return { bar, gap, reserve: bar + gap * 2, window: bar + gap + DOCK_EXTRA };
}

function createDock() {
  if (alive(wins.dock)) return;
  const d = primary();
  const h = dockHeights();
  const w = new BrowserWindow({
    width: d.bounds.width, height: h.window, x: d.bounds.x, y: d.bounds.y + d.bounds.height - h.window,
    frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false,
    backgroundColor: '#00000000', title: 'Islet Dock',
    webPreferences: baseWebPrefs({ backgroundThrottling: false }),
  });
  w.setAlwaysOnTop(true, 'pop-up-menu');
  w.setIgnoreMouseEvents(true, { forward: true });
  hardenContents(w.webContents);
  w.loadURL(APP_URL('dock/index.html'));
  w.once('ready-to-show', () => { w.showInactive(); registerAppBar(); });
  w.on('closed', () => { wins.dock = null; });
  wins.dock = w;
  startDockPolling();
}

function positionDock() {
  if (!alive(wins.dock)) return;
  const d = primary();
  const h = dockHeights();
  wins.dock.setBounds({ width: d.bounds.width, height: h.window, x: d.bounds.x, y: d.bounds.y + d.bounds.height - h.window });
  if (appBar.registered) setAppBarPos();
}

const readPtr = (buf) => (buf && buf.length >= 8 ? Number(buf.readBigInt64LE(0)) : buf ? buf.readInt32LE(0) : 0);

function registerAppBar() {
  if (!native.available || !alive(wins.dock) || appBar.registered) return;
  if (!store.get('taskbar.dock.reserveSpace')) return;
  const hwnd = native.hwndOf(wins.dock);
  appBar.msg = native.appBarRegister(hwnd);
  appBar.registered = true;
  wins.dock.hookWindowMessage(appBar.msg, (wParam, lParam) => {
    const code = readPtr(wParam);
    if (code === 1) setAppBarPos();                // ABN_POSCHANGED
    if (code === 2) {                               // ABN_FULLSCREENAPP
      const full = readPtr(lParam) !== 0;
      if (store.get('taskbar.dock.hideOnFullscreen') && alive(wins.dock)) full ? wins.dock.hide() : wins.dock.showInactive();
    }
  });
  setAppBarPos();
}

function setAppBarPos() {
  if (!appBar.registered || !alive(wins.dock)) return;
  const d = primary();
  const phys = screen.dipToScreenRect(null, d.bounds);
  const reserve = Math.round(dockHeights().reserve * d.scaleFactor);
  native.appBarSetBottom(native.hwndOf(wins.dock),
    { left: phys.x, top: phys.y, right: phys.x + phys.width, bottom: phys.y + phys.height }, reserve);
  // The shell may move us; put the (taller, transparent) window back.
  const h = dockHeights();
  wins.dock.setBounds({ width: d.bounds.width, height: h.window, x: d.bounds.x, y: d.bounds.y + d.bounds.height - h.window });
}

function unregisterAppBar() {
  if (!appBar.registered) return;
  try {
    if (alive(wins.dock)) { wins.dock.unhookWindowMessage(appBar.msg); native.appBarRemove(native.hwndOf(wins.dock)); }
  } catch (e) { console.error('[appbar]', e); }
  appBar.registered = false;
}

function destroyDock() {
  unregisterAppBar();
  stopDockPolling();
  if (alive(wins.dock)) wins.dock.destroy();
  wins.dock = null;
}

let dockTimer = null, lastDockSig = '';
function startDockPolling() {
  stopDockPolling();
  const poll = () => {
    if (!native.available) return;
    try {
      const list = native.listAppWindows(process.pid);
      const fg = state.fg.hwnd;
      const groups = new Map();
      for (const win of list) {
        const k = (win.exe || win.title).toLowerCase();
        if (!groups.has(k)) groups.set(k, { key: k, exe: win.exe, name: prettyName(win.exe, win.title), windows: [], active: false });
        const g = groups.get(k);
        g.windows.push({ hwnd: win.hwnd, title: win.title, minimized: win.minimized });
        if (win.hwnd === fg) g.active = true;
      }
      const arr = [...groups.values()];
      const sig = JSON.stringify(arr);
      if (sig !== lastDockSig) { lastDockSig = sig; state.dock = arr; broadcast('dock:windows', arr); }
    } catch (e) { console.error('[dock]', e); }
  };
  poll();
  dockTimer = setInterval(poll, 1000);
}
function stopDockPolling() { clearInterval(dockTimer); dockTimer = null; }

function prettyName(exe, title) {
  if (!exe) return title;
  const base = path.basename(exe, path.extname(exe));
  const known = { explorer: 'File Explorer', msedge: 'Microsoft Edge', chrome: 'Google Chrome', firefox: 'Firefox', code: 'Visual Studio Code', applicationframehost: title, windowsterminal: 'Terminal' };
  return known[base.toLowerCase()] || base.charAt(0).toUpperCase() + base.slice(1);
}

// ---------------------------------------------------------------------------
// Live wallpaper (+ desktop widgets, which render inside it)
// ---------------------------------------------------------------------------
function physicalBoundsRelativeToVirtualScreen(display) {
  const all = screen.getAllDisplays().map((d) => screen.dipToScreenRect(null, d.bounds));
  const vx = Math.min(...all.map((r) => r.x)), vy = Math.min(...all.map((r) => r.y));
  const r = screen.dipToScreenRect(null, display.bounds);
  return { x: r.x - vx, y: r.y - vy, width: r.width, height: r.height };
}

function wallpaperWanted() {
  const s = store.get();
  return s.wallpaper.enabled || (s.widgets.enabled && s.widgets.items.some((i) => i.on));
}

function createWallpaper() {
  if (alive(wins.wallpaper)) return;
  if (!IS_WIN && !DEV) return; // the desktop layer only exists on Windows
  const d = primary();
  const w = new BrowserWindow({
    ...d.bounds, frame: false, show: false, skipTaskbar: true, focusable: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false, backgroundColor: '#000000',
    title: 'Islet Wallpaper', webPreferences: baseWebPrefs({ backgroundThrottling: false }),
  });
  hardenContents(w.webContents);
  w.webContents.setAudioMuted(store.get('wallpaper.muted'));
  w.loadURL(APP_URL('wallpaper/index.html'));
  w.once('ready-to-show', () => {
    w.showInactive();
    if (native.available) {
      const res = native.attachToDesktop(native.hwndOf(w), physicalBoundsRelativeToVirtualScreen(d));
      wallpaperAttached = res.ok;
      if (!res.ok) {
        console.warn('[wallpaper] could not attach behind icons:', res.reason, '- using bottom-most window');
        native.sendToBottom(native.hwndOf(w));
      }
    }
  });
  w.on('focus', () => { if (native.available && !wallpaperAttached) native.sendToBottom(native.hwndOf(w)); });
  w.on('closed', () => { wins.wallpaper = null; wallpaperAttached = false; });
  wins.wallpaper = w;
}

function positionWallpaper() {
  const w = wins.wallpaper;
  if (!alive(w)) return;
  const d = primary();
  if (wallpaperAttached) native.moveChild(native.hwndOf(w), physicalBoundsRelativeToVirtualScreen(d));
  else w.setBounds(d.bounds);
}

function destroyWallpaper() {
  const w = wins.wallpaper;
  if (!alive(w)) return;
  if (native.available && wallpaperAttached) {
    const hwnd = native.hwndOf(w);
    w.destroy();
    native.refreshDesktopWallpaper();
    void hwnd;
  } else {
    w.destroy();
  }
  wins.wallpaper = null;
  wallpaperAttached = false;
}

function updateWallpaperPause() {
  const s = store.get('wallpaper');
  const paused = (s.pauseWhenCovered && state.fg.covered) || (s.pauseOnBattery && state.onBattery);
  if (paused !== state.wallpaperPaused) {
    state.wallpaperPaused = paused;
    broadcast('wallpaper:paused', paused);
  }
}

// ---------------------------------------------------------------------------
// Arrange widgets overlay
// ---------------------------------------------------------------------------
function openArrange() {
  if (alive(wins.arrange)) { wins.arrange.focus(); return; }
  const d = primary();
  const w = new BrowserWindow({
    ...d.bounds, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, show: false, backgroundColor: '#00000000', title: 'Arrange widgets',
    webPreferences: baseWebPrefs(),
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  hardenContents(w.webContents);
  w.loadURL(APP_URL('wallpaper/index.html?mode=arrange'));
  w.once('ready-to-show', () => { w.show(); w.focus(); });
  w.on('closed', () => { wins.arrange = null; });
  wins.arrange = w;
}

// ---------------------------------------------------------------------------
// Settings window (system acrylic glass on Windows 11)
// ---------------------------------------------------------------------------
function openSettings(section) {
  if (alive(wins.settings)) {
    if (wins.settings.isMinimized()) wins.settings.restore();
    wins.settings.show(); wins.settings.focus();
    if (section) wins.settings.webContents.send('nav', section);
    return;
  }
  const w = new BrowserWindow({
    width: 1060, height: 720, minWidth: 880, minHeight: 580, show: false, title: 'Islet',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e8eaf0', height: 44 },
    backgroundMaterial: GLASS_SUPPORTED ? 'acrylic' : undefined,
    backgroundColor: GLASS_SUPPORTED ? '#00000000' : '#101218',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: baseWebPrefs(),
  });
  hardenContents(w.webContents);
  w.loadURL(APP_URL('settings/index.html' + (section ? `#${section}` : '')));
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => { wins.settings = null; });
  wins.settings = w;
}

// ---------------------------------------------------------------------------
// Apply settings -> windows / taskbar / startup
// ---------------------------------------------------------------------------
function applyAll(next, prev) {
  // Island
  if (next.island.enabled) createIsland(); else if (alive(wins.island)) wins.island.destroy();

  // Taskbar
  const tbChanged = !prev || JSON.stringify(prev.taskbar) !== JSON.stringify(next.taskbar);
  if (tbChanged) {
    if (next.taskbar.mode === 'dock') {
      const sizeChanged = prev && prev.taskbar.dock.size !== next.taskbar.dock.size;
      const reserveChanged = prev && prev.taskbar.dock.reserveSpace !== next.taskbar.dock.reserveSpace;
      if (reserveChanged) { unregisterAppBar(); }
      createDock();
      if (sizeChanged) positionDock();
      if (reserveChanged && next.taskbar.dock.reserveSpace) registerAppBar();
    } else {
      destroyDock();
    }
    taskbar.apply(next.taskbar);
  }

  // Wallpaper + widgets
  if (wallpaperWanted()) createWallpaper(); else destroyWallpaper();
  if (alive(wins.wallpaper)) wins.wallpaper.webContents.setAudioMuted(next.wallpaper.muted);
  if (prev && (prev.wallpaper.pauseWhenCovered !== next.wallpaper.pauseWhenCovered || prev.wallpaper.pauseOnBattery !== next.wallpaper.pauseOnBattery)) updateWallpaperPause();

  // Startup shortcut
  if (!prev || prev.general.runAtStartup !== next.general.runAtStartup) {
    if (prev || next.general.runAtStartup) setRunAtStartup(app, shell, next.general.runAtStartup);
  }

  // Hotkey
  if (!prev || prev.general.hotkey !== next.general.hotkey) registerHotkey(next.general.hotkey, prev && prev.general.hotkey);

  // Weather location
  if (!prev || JSON.stringify(prev.widgets.weather) !== JSON.stringify(next.widgets.weather)) refreshWeather();

  refreshTray();
}

function registerHotkey(accel, old) {
  try { if (old) globalShortcut.unregister(old); } catch {}
  if (!accel) return;
  try {
    globalShortcut.register(accel, () => { if (alive(wins.island)) wins.island.webContents.send('island:toggle'); });
  } catch (e) { console.warn('[hotkey]', e.message); }
}

// ---------------------------------------------------------------------------
// Pollers: foreground app, system stats, weather
// ---------------------------------------------------------------------------
let fgTimer = null;
function startForegroundPolling() {
  if (!native.available) return;
  fgTimer = setInterval(() => {
    try {
      const f = native.foregroundState(process.pid);
      const coversPrimary = f.primary !== false;
      const next = {
        hwnd: f.hwnd,
        maximized: !!(f.maximized && coversPrimary),
        fullscreen: !!(f.fullscreen && coversPrimary),
        covered: !!((f.maximized || f.fullscreen) && coversPrimary),
      };
      const changed = next.covered !== state.fg.covered || next.maximized !== state.fg.maximized || next.fullscreen !== state.fg.fullscreen;
      state.fg = next;
      if (!changed) return;
      broadcast('fg', next);
      updateWallpaperPause();
      const g = store.get('general');
      if (alive(wins.island)) {
        if (g.hideOnFullscreen && next.fullscreen) wins.island.hide();
        else if (!wins.island.isVisible()) wins.island.showInactive();
      }
      if (alive(wins.dock) && store.get('taskbar.dock.hideOnFullscreen')) {
        if (next.fullscreen) wins.dock.hide(); else if (!wins.dock.isVisible()) wins.dock.showInactive();
      }
    } catch (e) { console.error('[fg]', e); }
  }, 700);
}

const cpu = new CpuSampler();
const push = (arr, v, n = 40) => { arr.push(v); if (arr.length > n) arr.shift(); };
function startSystemPolling() {
  setInterval(() => {
    const s = state.system;
    s.cpu = cpu.sample();
    s.ram = memory();
    push(s.history.cpu, s.cpu);
    push(s.history.ram, s.ram.usedPct);
    push(s.history.gpu, s.gpu == null ? 0 : s.gpu);
    s.battery = state.onBattery;
    broadcast('system', s);
  }, 2000);
}

let weatherTimer = null;
async function refreshWeather() {
  clearTimeout(weatherTimer);
  weatherTimer = setTimeout(refreshWeather, 20 * 60 * 1000);
  const w = store.get('widgets.weather');
  if (w.lat == null || w.lon == null) { state.weather = null; broadcast('weather', null); return; }
  try {
    state.weather = { ...(await fetchWeather(net.fetch, w)), city: w.city };
    broadcast('weather', state.weather);
  } catch (e) {
    console.warn('[weather]', e.message);
    weatherTimer = setTimeout(refreshWeather, 2 * 60 * 1000);
  }
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, IS_WIN ? 'tray.ico' : 'tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Islet');
  tray.on('click', () => openSettings());
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  const s = store.get();
  const setMode = (mode) => store.set('taskbar.mode', mode);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Islet settings', click: () => openSettings() },
    { label: 'Arrange widgets…', click: openArrange, enabled: s.widgets.enabled },
    { type: 'separator' },
    { label: 'Island', type: 'checkbox', checked: s.island.enabled, click: (i) => store.set('island.enabled', i.checked) },
    { label: 'Live wallpaper', type: 'checkbox', checked: s.wallpaper.enabled, click: (i) => store.set('wallpaper.enabled', i.checked) },
    { label: 'Widgets', type: 'checkbox', checked: s.widgets.enabled, click: (i) => store.set('widgets.enabled', i.checked) },
    {
      label: 'Taskbar', submenu: [
        { label: 'Windows default', type: 'radio', checked: s.taskbar.mode === 'off', click: () => setMode('off') },
        { label: 'Floating (reshape Windows taskbar)', type: 'radio', checked: s.taskbar.mode === 'float', click: () => setMode('float') },
        { label: 'Islet glass dock', type: 'radio', checked: s.taskbar.mode === 'dock', click: () => setMode('dock') },
      ],
    },
    { label: 'Restore Windows taskbar now', click: () => { store.set('taskbar.mode', 'off'); taskbar.forceRestore(); } },
    { type: 'separator' },
    { label: 'Quit Islet', click: () => app.quit() },
  ]));
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
const SETTABLE = /^(onboarded|general|appearance|island|taskbar|wallpaper|widgets)(\.|$)/;
const iconCache = new Map();

function registerIpc() {
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set', (_e, key, value) => {
    if (typeof key !== 'string' || !SETTABLE.test(key)) throw new Error('Not allowed: ' + key);
    store.set(key, value);
    return true;
  });
  ipcMain.handle('settings:patch', (_e, changes) => {
    for (const k of Object.keys(changes || {})) if (!SETTABLE.test(k)) throw new Error('Not allowed: ' + k);
    store.patch(changes);
    return true;
  });
  ipcMain.handle('settings:reset', (_e, section) => {
    if (section && !['appearance', 'island', 'taskbar', 'wallpaper', 'widgets', 'general'].includes(section)) return false;
    store.reset(section || undefined);
    return true;
  });

  ipcMain.handle('state:get', () => ({ ...state, paused: state.wallpaperPaused }));
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(), platform: process.platform, windowsBuild: WIN_BUILD, glass: GLASS_SUPPORTED,
    native: native.available, nativeReason: native.reason || null, electron: process.versions.electron,
    wallpaperAttached, settingsPath: store.file,
  }));

  ipcMain.handle('media', (_e, cmd, arg) => {
    const viaHelper = helper.proc && state.media.active;
    if (cmd === 'seek') { if (viaHelper) helper.command(`seek ${Number(arg) || 0}`); return; }
    const map = { toggle: 'playPause', next: 'next', prev: 'prev', volUp: 'volUp', volDown: 'volDown', mute: 'mute' };
    if (viaHelper && ['toggle', 'next', 'prev'].includes(cmd)) helper.command(cmd);
    else if (native.available && map[cmd]) native.shell[map[cmd]]();
  });

  ipcMain.handle('shell', (_e, action) => {
    if (action === 'settings') return openSettings();
    if (action === 'arrange') return openArrange();
    if (action === 'quit') return app.quit();
    if (action === 'wallpaper-toggle') return store.set('wallpaper.enabled', !store.get('wallpaper.enabled'));
    if (action === 'wallpaper-next') return nextWallpaper();
    const allowed = ['start', 'search', 'taskView', 'notifications', 'quickSettings', 'snip', 'lock'];
    if (native.available && allowed.includes(action)) native.shell[action]();
  });

  ipcMain.handle('island:interactive', (_e, on) => {
    if (alive(wins.island)) wins.island.setIgnoreMouseEvents(!on, { forward: true });
  });
  ipcMain.handle('dock:interactive', (_e, on) => {
    if (alive(wins.dock)) wins.dock.setIgnoreMouseEvents(!on, { forward: true });
  });

  ipcMain.handle('dock:activate', (_e, hwnd) => native.available && native.activateWindow(Number(hwnd)));
  ipcMain.handle('dock:launch', (_e, target) => launch(target));
  ipcMain.handle('dock:context', (e, info) => dockContextMenu(e.sender, info || {}));
  ipcMain.handle('pin:add', async () => {
    const res = await dialog.showOpenDialog(wins.settings || undefined, {
      title: 'Pin an app to the Islet dock', properties: ['openFile'],
      filters: [{ name: 'Apps and shortcuts', extensions: ['exe', 'lnk'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const p = res.filePaths[0];
    addPin({ target: p, kind: 'path', name: path.basename(p, path.extname(p)) });
    return true;
  });

  ipcMain.handle('icon:get', async (_e, exe) => {
    if (typeof exe !== 'string' || !exe) return null;
    if (iconCache.has(exe)) return iconCache.get(exe);
    let file = exe;
    if (IS_WIN && !path.isAbsolute(file)) {
      const root = process.env.SystemRoot || 'C:\\Windows';
      file = [path.join(root, file), path.join(root, 'System32', file)].find((p) => fs.existsSync(p)) || file;
    }
    try {
      const img = await app.getFileIcon(file, { size: 'large' });
      const url = img.isEmpty() ? null : img.toDataURL();
      iconCache.set(exe, url);
      return url;
    } catch { iconCache.set(exe, null); return null; }
  });

  ipcMain.handle('wallpaper:add-files', async () => {
    const res = await dialog.showOpenDialog(wins.settings || undefined, {
      title: 'Add wallpapers', properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Videos, GIFs and images', extensions: ['mp4', 'webm', 'mkv', 'mov', 'gif', 'jpg', 'jpeg', 'png', 'webp', 'bmp'] },
      ],
    });
    if (res.canceled) return null;
    const lib = store.get('wallpaper.library');
    for (const p of res.filePaths) {
      if (lib.some((x) => x.path === p)) continue;
      const ext = path.extname(p).toLowerCase();
      const kind = ['.mp4', '.webm', '.mkv', '.mov'].includes(ext) ? 'video' : 'image';
      lib.push({ path: p, kind, name: path.basename(p, ext) });
    }
    const last = res.filePaths[res.filePaths.length - 1];
    const lastKind = lib.find((x) => x.path === last)?.kind || 'image';
    store.patch({ 'wallpaper.library': lib, 'wallpaper.file': last, 'wallpaper.kind': lastKind, 'wallpaper.enabled': true });
    return true;
  });
  ipcMain.handle('wallpaper:remove', (_e, p) => {
    const s = store.get('wallpaper');
    const lib = s.library.filter((x) => x.path !== p);
    const changes = { 'wallpaper.library': lib };
    if (s.file === p) { changes['wallpaper.file'] = ''; changes['wallpaper.kind'] = 'scene'; }
    store.patch(changes);
  });
  // The user's normal Windows wallpaper, shown under the widgets when the
  // live wallpaper is off (or a solid colour if they use one).
  ipcMain.handle('wallpaper:windows-path', () => {
    const p = native.available ? native.getDesktopWallpaperPath() : '';
    let color = '#000000';
    try { if (IS_WIN) color = '#' + systemPreferences.getColor('desktop').replace('#', '').slice(0, 6); } catch {}
    return { url: p && fs.existsSync(p) ? proto.mediaUrl(p) + '&v=' + Math.round(fs.statSync(p).mtimeMs) : '', color };
  });

  ipcMain.handle('weather:search', async (_e, q) => {
    if (typeof q !== 'string' || q.trim().length < 2) return [];
    try { return await searchCity(net.fetch, q.trim()); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('weather:refresh', () => refreshWeather());

  ipcMain.handle('arrange:open', () => openArrange());
  ipcMain.handle('arrange:done', () => { if (alive(wins.arrange)) wins.arrange.close(); });

  // The island picks an accent from the album art; share it with the dock,
  // widgets and settings so everything matches.
  ipcMain.handle('accent:set', (_e, rgb) => {
    const ok = Array.isArray(rgb) && rgb.length === 3 && rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
    state.accent = ok ? rgb : null;
    broadcast('accent', state.accent);
  });

  ipcMain.handle('notify', (_e, { title, body } = {}) => {
    if (Notification.isSupported()) new Notification({ title: String(title || 'Islet'), body: String(body || ''), silent: false }).show();
  });
  ipcMain.handle('open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
}

function nextWallpaper() {
  const s = store.get('wallpaper');
  const scenes = ['silk', 'aurora', 'ember', 'lagoon'];
  const items = [...scenes.map((id) => ({ kind: 'scene', id })), ...s.library.map((l) => ({ kind: l.kind, id: l.path }))];
  const cur = items.findIndex((i) => (s.kind === 'scene' ? i.kind === 'scene' && i.id === s.scene : i.id === s.file));
  const n = items[(cur + 1) % items.length];
  if (n.kind === 'scene') store.patch({ 'wallpaper.kind': 'scene', 'wallpaper.scene': n.id, 'wallpaper.enabled': true });
  else store.patch({ 'wallpaper.kind': n.kind, 'wallpaper.file': n.id, 'wallpaper.enabled': true });
}

function addPin(pin) {
  const pins = store.get('taskbar.dock.pins');
  if (pins.some((p) => p.target.toLowerCase() === pin.target.toLowerCase())) return;
  pins.push({ id: 'p' + Date.now().toString(36), ...pin });
  store.set('taskbar.dock.pins', pins);
}

function launch(target) {
  if (!target || typeof target !== 'object') return;
  const t = String(target.target || '');
  if (!t) return;
  if (target.kind === 'uri') {
    if (/^(ms-settings:|https:|ms-windows-store:|mailto:)/i.test(t)) shell.openExternal(t);
    return;
  }
  // Only launch things the user pinned, or an app that is already running.
  const pins = store.get('taskbar.dock.pins').map((p) => p.target.toLowerCase());
  const running = state.dock.map((g) => (g.exe || '').toLowerCase());
  if (!pins.includes(t.toLowerCase()) && !running.includes(t.toLowerCase())) return;
  if (/\.lnk$/i.test(t) || path.isAbsolute(t)) {
    if (/\.lnk$/i.test(t)) return shell.openPath(t);
    return spawn(t, [], { detached: true, stdio: 'ignore', cwd: path.dirname(t) }).unref();
  }
  spawn(t, [], { detached: true, stdio: 'ignore' }).unref();
}

function dockContextMenu(sender, info) {
  const pins = store.get('taskbar.dock.pins');
  const target = info.pinTarget || info.exe;
  const pinned = target && pins.find((p) => p.target.toLowerCase() === String(target).toLowerCase());
  const group = state.dock.find((g) => g.key === info.key);
  const items = [];
  if (info.name) items.push({ label: info.name, enabled: false }, { type: 'separator' });
  if (target) items.push({ label: 'Open new window', click: () => launch(pinned || { target, kind: 'path' }) });
  if (pinned) items.push({ label: 'Unpin from dock', click: () => store.set('taskbar.dock.pins', pins.filter((p) => p !== pinned)) });
  else if (info.exe) items.push({ label: 'Pin to dock', click: () => addPin({ target: info.exe, kind: 'path', name: info.name || path.basename(info.exe, '.exe') }) });
  if (group && group.windows.length) {
    items.push({ type: 'separator' });
    items.push({ label: group.windows.length > 1 ? `Close all ${group.windows.length} windows` : 'Close window', click: () => group.windows.forEach((w) => native.closeWindow(w.hwnd)) });
  }
  items.push({ type: 'separator' }, { label: 'Dock settings', click: () => openSettings('taskbar') });
  const win = BrowserWindow.fromWebContents(sender);
  Menu.buildFromTemplate(items).popup({ window: win });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
function restoreEverything() {
  try { taskbar && taskbar.restore(); } catch (e) { console.error(e); }
  try { taskbar && taskbar.forceRestore(); } catch (e) { console.error(e); }
  unregisterAppBar();
  destroyWallpaper();
}

app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  taskbar = new TaskbarController(native, store);

  if (process.argv.includes('--restore')) {
    taskbar.forceRestore();
    store.set('taskbar.mode', 'off');
    store.flush();
    app.quit();
    return;
  }
  // A previous run crashed while the taskbar was modified: clean up first.
  if (store.get('runtime.taskbarTouched')) taskbar.forceRestore();

  proto.handle(protocol, isAllowedMedia);
  registerIpc();

  helper = new Helper();
  helper.on('media', (m) => { state.media = m; broadcast('media', m); });
  helper.on('system', (s) => { state.system.gpu = s.gpu; state.system.net = s.net || state.system.net; });
  helper.start();

  state.onBattery = powerMonitor.isOnBatteryPower ? powerMonitor.isOnBatteryPower() : false;
  powerMonitor.on('on-battery', () => { state.onBattery = true; updateWallpaperPause(); });
  powerMonitor.on('on-ac', () => { state.onBattery = false; updateWallpaperPause(); });
  powerMonitor.on('resume', () => { positionWallpaper(); refreshWeather(); });

  store.on('change', (next, prev) => {
    broadcast('settings', next);
    try { applyAll(next, prev); } catch (e) { console.error('[apply]', e); }
  });

  createTray();
  applyAll(store.get(), null);
  startForegroundPolling();
  startSystemPolling();

  const onDisplays = () => { positionIsland(); positionDock(); positionWallpaper(); };
  screen.on('display-metrics-changed', onDisplays);
  screen.on('display-added', onDisplays);
  screen.on('display-removed', onDisplays);

  // Dev aid: ISLET_CAPTURE=<dir> saves a PNG of every window after start-up.
  if (DEV && process.env.ISLET_CAPTURE) {
    setTimeout(async () => {
      for (const [name, w] of Object.entries(wins)) {
        if (!alive(w)) continue;
        try { fs.writeFileSync(path.join(process.env.ISLET_CAPTURE, name + '.png'), (await w.webContents.capturePage()).toPNG()); } catch (e) { console.error('[capture]', name, e.message); }
      }
      console.log('[capture] done');
    }, 6000);
  }

  const hidden = process.argv.includes('--hidden');
  if (!store.get('onboarded') || (!hidden && !process.argv.includes('--background'))) openSettings(store.get('onboarded') ? undefined : 'start');
});

// Islet lives in the tray; closing the settings window must not quit it.
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  restoreEverything();
  helper && helper.stop();
  try { store && store.flush(); } catch {}
});

process.on('uncaughtException', (err) => {
  // Log and keep running. If Islet ever dies with the taskbar modified, the
  // next launch (or `Islet.exe --restore`) puts it back automatically.
  console.error('[islet] uncaught', err);
});
