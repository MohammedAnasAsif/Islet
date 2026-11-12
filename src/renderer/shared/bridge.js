// Gives every page the same API. Inside Islet it is the real preload bridge;
// in a normal browser (npm run preview, or a contributor on macOS/Linux) it is
// a mock with sample data so the UI can be designed anywhere.

export async function connect() {
  if (window.islet) return window.islet;
  return createMock();
}

const q = new URLSearchParams(location.search);

function artSvg(a, b) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><radialGradient id="g" cx="30%" cy="30%" r="90%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="120" height="120" fill="url(#g)"/><circle cx="78" cy="70" r="26" fill="#fff" opacity=".18"/><circle cx="40" cy="44" r="14" fill="#fff" opacity=".22"/></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

async function createMock() {
  const res = await fetch(new URL('./defaults.json', import.meta.url));
  const settings = await res.json();
  settings.onboarded = q.get('onboarded') !== '0';
  if (q.get('surface')) settings.appearance.surface = q.get('surface');
  if (q.get('dock')) settings.taskbar.mode = 'dock';
  if (q.get('widgets') === '0') settings.widgets.enabled = false;
  if (q.get('wallpaper')) { settings.wallpaper.enabled = true; settings.wallpaper.scene = q.get('wallpaper'); }
  settings.widgets.weather = { city: 'Bengaluru', lat: 12.97, lon: 77.59, units: 'metric' };

  const listeners = new Map();
  const emit = (ch, p) => (listeners.get(ch) || []).forEach((cb) => cb(p));
  const setPath = (obj, key, v) => { const ks = key.split('.'); let o = obj; ks.slice(0, -1).forEach((k) => (o = o[k] ??= {})); o[ks.at(-1)] = v; };

  const media = {
    active: q.get('media') !== '0', playing: true, title: 'Glass Horizon', artist: 'Mira Okafor', album: 'Low Tide',
    position: 64, duration: 214, art: artSvg('#ff5a7a', '#5b1029'), app: 'Spotify.exe',
  };
  const hist = (base, amp) => Array.from({ length: 40 }, (_, i) => Math.max(2, Math.min(98, base + Math.sin(i / 3) * amp + (i % 7) * 1.3)));
  const system = {
    cpu: 12, gpu: 23, ram: { usedPct: 41, usedGB: 13.1, totalGB: 32 }, net: { down: 182000, up: 21000 }, battery: false,
    history: { cpu: hist(14, 8), gpu: hist(24, 10), ram: hist(41, 2) },
  };
  const weather = {
    temp: 28, feels: 30, humidity: 62, wind: 9, label: 'Partly cloudy', icon: 'partly', high: 29, low: 21, unit: '°C', city: 'Bengaluru',
    days: [
      { date: '2026-11-13', high: 28, low: 20, label: 'Showers', icon: 'rain' },
      { date: '2026-11-14', high: 27, low: 20, label: 'Cloudy', icon: 'cloud' },
      { date: '2026-11-15', high: 29, low: 21, label: 'Clear', icon: 'sun' },
    ],
  };
  const dock = [
    { key: 'c:\\windows\\explorer.exe', exe: 'C:\\Windows\\explorer.exe', name: 'File Explorer', active: false, windows: [{ hwnd: 1, title: 'Downloads' }] },
    { key: 'msedge', exe: 'msedge.exe', name: 'Microsoft Edge', active: true, windows: [{ hwnd: 2, title: 'Islet on GitHub' }] },
    { key: 'code', exe: 'Code.exe', name: 'Visual Studio Code', active: false, windows: [{ hwnd: 3, title: 'island.js' }, { hwnd: 4, title: 'dock.js' }] },
    { key: 'spotify', exe: 'Spotify.exe', name: 'Spotify', active: false, windows: [{ hwnd: 5, title: 'Spotify' }] },
    { key: 'terminal', exe: 'WindowsTerminal.exe', name: 'Terminal', active: false, windows: [{ hwnd: 6, title: 'pwsh' }] },
  ];

  // The settings page drives its live island preview through postMessage.
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'islet:preview' && e.data.settings) {
      Object.assign(settings, structuredClone(e.data.settings));
      emit('settings', structuredClone(settings));
    }
  });

  setInterval(() => {
    if (media.active && media.playing) { media.position = (media.position + 1) % media.duration; emit('media', { ...media }); }
  }, 1000);

  const handlers = {
    'settings:get': () => structuredClone(settings),
    'settings:set': (k, v) => { setPath(settings, k, v); emit('settings', structuredClone(settings)); return true; },
    'settings:patch': (c) => { Object.entries(c).forEach(([k, v]) => setPath(settings, k, v)); emit('settings', structuredClone(settings)); return true; },
    'settings:reset': () => true,
    'state:get': () => ({ media: { ...media }, system, weather, dock, fg: { covered: false, maximized: q.get('slim') === '1', fullscreen: false }, paused: false }),
    'app:info': () => ({ version: '0.1.0', platform: 'preview', windowsBuild: 26100, glass: false, native: false, electron: '-', wallpaperAttached: false, settingsPath: '%APPDATA%\\Islet\\settings.json' }),
    media: (cmd) => { if (cmd === 'toggle') media.playing = !media.playing; emit('media', { ...media }); },
    'weather:search': (qq) => [{ label: `${qq}, Karnataka, India`, name: qq, lat: 12.97, lon: 77.59 }, { label: `${qq}, Ontario, Canada`, name: qq, lat: 43.6, lon: -79.4 }],
    'icon:get': () => null,
    'wallpaper:windows-path': () => ({ url: '', color: '#1b2a4a' }),
  };

  return {
    mock: true,
    platform: 'preview',
    async invoke(ch, ...args) { return handlers[ch] ? handlers[ch](...args) : null; },
    on(ch, cb) { if (!listeners.has(ch)) listeners.set(ch, []); listeners.get(ch).push(cb); return () => {}; },
  };
}
