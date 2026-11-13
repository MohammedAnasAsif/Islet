'use strict';
// Exercises the Win32 layer on a real Windows machine (CI runs this on
// windows-latest). It only reads state; it does not change the taskbar.
const native = require('../src/main/native/win32');
const { floatGeometry } = require('../src/main/native/taskbar');

function step(name, fn) {
  try {
    const v = fn();
    console.log(`ok   ${name}:`, typeof v === 'object' ? JSON.stringify(v) : v);
    return v;
  } catch (e) {
    console.error(`FAIL ${name}:`, e && e.stack || e);
    process.exitCode = 1;
  }
}

if (process.platform !== 'win32') { console.log('Not Windows, nothing to do.'); process.exit(0); }
if (!native.available) { console.error('Native layer did not load:', native.reason); process.exit(1); }

const bars = step('taskbars()', () => native.taskbars());
if (bars && bars[0]) {
  step('taskbar rect', () => native.rectOf(bars[0]));
  step('taskbar class', () => native.className(bars[0]));
  step('taskbar dpi', () => native.GetDpiForWindow(bars[0]));
  step('taskbar region box', () => native.regionBox(bars[0]));
  step('float geometry', () => { const r = native.rectOf(bars[0]); return floatGeometry(r.right - r.left, r.bottom - r.top, 1, { sideMargin: 12, vertMargin: 4, radius: 16, width: 100 }); });
}
step('appBarState()', () => native.appBarState());
step('desktop wallpaper path', () => native.getDesktopWallpaperPath());
step('wallpaper host', () => native.findWallpaperHost());
step('foregroundState()', () => native.foregroundState(process.pid));
step('listAppWindows()', () => native.listAppWindows(process.pid).slice(0, 5).map((w) => ({ title: w.title, exe: w.exe })));
console.log(process.exitCode ? 'Smoke test FAILED' : 'Smoke test passed');
