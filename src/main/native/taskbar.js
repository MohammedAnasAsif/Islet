'use strict';
// Taskbar modes
//   off   – Windows' taskbar untouched.
//   float – reshape Windows' own taskbar into a rounded, inset bar using a
//           window region (the RoundedTB technique). Nothing is injected.
//   dock  – auto-hide + hide Windows' taskbar (official AppBar API) so the
//           Islet glass dock can take its place.
// Every change is undone on exit, and `Islet.exe --restore` undoes it too.

class TaskbarController {
  constructor(native, store) {
    this.n = native;
    this.store = store;
    this.mode = 'off';
    this.cfg = null;
    this.applied = new Map(); // hwnd -> signature of the region we set
    this.timer = null;
  }

  get supported() { return !!this.n.available; }

  apply(taskbarCfg) {
    if (!this.supported) return;
    const next = taskbarCfg.mode;
    if (next !== this.mode) this._leave(this.mode);
    this.mode = next;
    this.cfg = taskbarCfg;
    this.applied.clear();
    if (next === 'off') { this._stopTimer(); this._markTouched(false); return; }
    this._markTouched(true);
    if (next === 'dock') this._enterDock();
    this._tick();
    this._startTimer(next === 'dock' ? 400 : 1500);
  }

  restore() {
    if (!this.supported) return;
    this._stopTimer();
    this._leave(this.mode);
    this.mode = 'off';
    this._markTouched(false);
  }

  /** Recovery path for `--restore` or after a crash: show and un-shape everything. */
  forceRestore() {
    if (!this.supported) return;
    for (const h of this.n.taskbars()) { this.n.clearRegion(h); this.n.showWindowNoActivate(h); }
    const prev = this.store.get('runtime.prevAppBarState');
    if (typeof prev === 'number') this.n.setAppBarState(prev);
    this.store.patch({ 'runtime.prevAppBarState': null, 'runtime.taskbarTouched': false });
  }

  // -- internals ----------------------------------------------------------
  _markTouched(v) {
    if (this.store.get('runtime.taskbarTouched') !== v) this.store.set('runtime.taskbarTouched', v);
  }

  _startTimer(ms) {
    this._stopTimer();
    this.timer = setInterval(() => { try { this._tick(); } catch (e) { console.error('[taskbar]', e); } }, ms);
  }
  _stopTimer() { clearInterval(this.timer); this.timer = null; }

  _tick() {
    if (this.mode === 'float') this._applyFloat();
    else if (this.mode === 'dock') this._keepHidden();
  }

  _applyFloat() {
    const f = this.cfg.float;
    for (const h of this.n.taskbars()) {
      const r = this.n.rectOf(h);
      if (!r) continue;
      const w = r.right - r.left, hgt = r.bottom - r.top;
      const s = (this.n.GetDpiForWindow(h) || 96) / 96;
      const sig = `${w}x${hgt}@${s}:${f.sideMargin},${f.vertMargin},${f.radius},${f.width}`;
      // Re-apply when size/DPI changed, or Explorer dropped our region.
      if (this.applied.get(h) === sig && this.n.hasRegion(h)) continue;
      const geo = floatGeometry(w, hgt, s, f);
      if (this.n.setRoundRegion(h, geo.x1, geo.y1, geo.x2, geo.y2, geo.radius)) this.applied.set(h, sig);
    }
  }

  _enterDock() {
    if (this.store.get('runtime.prevAppBarState') == null) {
      this.store.set('runtime.prevAppBarState', this.n.appBarState());
    }
    const prev = this.store.get('runtime.prevAppBarState') || 0;
    this.n.setAppBarState(this.n.ABS_AUTOHIDE | (prev & this.n.ABS_ALWAYSONTOP));
    this._keepHidden();
  }

  _keepHidden() {
    for (const h of this.n.taskbars()) if (this.n.IsWindowVisible(h)) this.n.hideWindow(h);
  }

  _leave(mode) {
    if (mode === 'float') {
      for (const h of this.n.taskbars()) this.n.clearRegion(h);
    } else if (mode === 'dock') {
      for (const h of this.n.taskbars()) this.n.showWindowNoActivate(h);
      const prev = this.store.get('runtime.prevAppBarState');
      this.n.setAppBarState(typeof prev === 'number' ? prev : 0);
      this.store.set('runtime.prevAppBarState', null);
    }
    this.applied.clear();
  }
}

/**
 * Region (in taskbar-window pixels) for the floating look.
 * Pure function so it can be unit-tested on any OS.
 */
function floatGeometry(w, h, scale, f) {
  const side = Math.round(f.sideMargin * scale);
  const vert = Math.round(f.vertMargin * scale);
  const width = Math.max(0.2, Math.min(1, (f.width || 100) / 100));
  const barW = Math.round(w * width);
  const x1 = Math.round((w - barW) / 2) + side;
  const x2 = Math.round((w + barW) / 2) - side + 1;
  const y1 = vert;
  const y2 = h - vert + 1;
  const maxR = Math.floor((y2 - y1) / 2);
  const radius = Math.min(maxR, Math.round(f.radius * scale));
  return { x1, y1, x2, y2, radius };
}

module.exports = { TaskbarController, floatGeometry };
