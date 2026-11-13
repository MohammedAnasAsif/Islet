'use strict';
// Thin Win32 layer built on koffi (a prebuilt FFI, no compiler needed).
// Everything here uses public, documented (or long-stable) Windows APIs.
// Nothing writes to the registry.
//
// On macOS/Linux this module exports { available: false } so the UI can be
// developed and previewed on any OS.

const isWin = process.platform === 'win32';

let api = { available: false, reason: 'not-windows' };
if (isWin) {
  try {
    api = build();
  } catch (err) {
    console.error('[islet] native layer failed to load:', err);
    api = { available: false, reason: String(err && err.message || err) };
  }
}
module.exports = api;

function build() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const gdi32 = koffi.load('gdi32.dll');
  const shell32 = koffi.load('shell32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const dwmapi = koffi.load('dwmapi.dll');

  // ---- Types -------------------------------------------------------------
  const RECT = koffi.struct('ISLET_RECT', {
    left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t',
  });
  const MONITORINFO = koffi.struct('ISLET_MONITORINFO', {
    cbSize: 'uint32_t', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32_t',
  });
  const APPBARDATA = koffi.struct('ISLET_APPBARDATA', {
    cbSize: 'uint32_t', hWnd: 'intptr_t', uCallbackMessage: 'uint32_t',
    uEdge: 'uint32_t', rc: RECT, lParam: 'intptr_t',
  });
  koffi.proto('bool __stdcall ISLET_ENUMPROC(intptr_t hwnd, intptr_t lParam)');
  // INPUT for SendInput (keyboard member of the union, padded to its full size)
  const KEYBDINPUT = koffi.struct('ISLET_KEYBDINPUT', {
    wVk: 'uint16_t', wScan: 'uint16_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t',
  });
  const INPUT = koffi.struct('ISLET_INPUT', {
    type: 'uint32_t', ki: KEYBDINPUT, _pad: koffi.array('uint8_t', process.arch === 'ia32' ? 4 : 8),
  });

  // ---- Functions ---------------------------------------------------------
  const f = (lib, sig) => lib.func(sig);
  const FindWindowW = f(user32, 'intptr_t __stdcall FindWindowW(str16 cls, str16 title)');
  const FindWindowExW = f(user32, 'intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 cls, str16 title)');
  const SendMessageTimeoutW = f(user32, 'intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wp, intptr_t lp, uint32_t flags, uint32_t timeout, void *result)');
  const PostMessageW = f(user32, 'bool __stdcall PostMessageW(intptr_t hwnd, uint32_t msg, uintptr_t wp, intptr_t lp)');
  const EnumWindows = f(user32, 'bool __stdcall EnumWindows(ISLET_ENUMPROC *cb, intptr_t lParam)');
  const SetParent = f(user32, 'intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)');
  const GetClassNameW = f(user32, 'int __stdcall GetClassNameW(intptr_t hwnd, void *buf, int max)');
  const GetWindowTextW = f(user32, 'int __stdcall GetWindowTextW(intptr_t hwnd, void *buf, int max)');
  const IsWindow = f(user32, 'bool __stdcall IsWindow(intptr_t hwnd)');
  const IsWindowVisible = f(user32, 'bool __stdcall IsWindowVisible(intptr_t hwnd)');
  const IsIconic = f(user32, 'bool __stdcall IsIconic(intptr_t hwnd)');
  const IsZoomed = f(user32, 'bool __stdcall IsZoomed(intptr_t hwnd)');
  const GetWindowLongPtrW = f(user32, 'intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)');
  const SetWindowLongPtrW = f(user32, 'intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)');
  const SetLayeredWindowAttributes = f(user32, 'bool __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint32_t key, uint8_t alpha, uint32_t flags)');
  const SendInput = f(user32, 'uint32_t __stdcall SendInput(uint32_t count, ISLET_INPUT *inputs, int size)');
  const MapVirtualKeyW = f(user32, 'uint32_t __stdcall MapVirtualKeyW(uint32_t code, uint32_t mapType)');
  const GetWindow = f(user32, 'intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)');
  const GetForegroundWindow = f(user32, 'intptr_t __stdcall GetForegroundWindow()');
  const SetForegroundWindow = f(user32, 'bool __stdcall SetForegroundWindow(intptr_t hwnd)');
  const ShowWindow = f(user32, 'bool __stdcall ShowWindow(intptr_t hwnd, int cmd)');
  const GetWindowRect = f(user32, 'bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ ISLET_RECT *rect)');
  const SetWindowPos = f(user32, 'bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)');
  const MonitorFromWindow = f(user32, 'intptr_t __stdcall MonitorFromWindow(intptr_t hwnd, uint32_t flags)');
  const GetMonitorInfoW = f(user32, 'bool __stdcall GetMonitorInfoW(intptr_t mon, _Inout_ ISLET_MONITORINFO *info)');
  const SetWindowRgn = f(user32, 'int __stdcall SetWindowRgn(intptr_t hwnd, intptr_t rgn, bool redraw)');
  const GetWindowRgnBox = f(user32, 'int __stdcall GetWindowRgnBox(intptr_t hwnd, _Out_ ISLET_RECT *rect)');
  const GetDpiForWindow = f(user32, 'uint32_t __stdcall GetDpiForWindow(intptr_t hwnd)');
  const GetWindowThreadProcessId = f(user32, 'uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)');
  const keybd_event = f(user32, 'void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)');
  const LockWorkStation = f(user32, 'bool __stdcall LockWorkStation()');
  const RegisterWindowMessageW = f(user32, 'uint32_t __stdcall RegisterWindowMessageW(str16 name)');
  const SPI_Buffer = f(user32, 'bool __stdcall SystemParametersInfoW(uint32_t action, uint32_t param, void *pv, uint32_t winIni)');
  const CreateRoundRectRgn = f(gdi32, 'intptr_t __stdcall CreateRoundRectRgn(int x1, int y1, int x2, int y2, int w, int h)');
  const DeleteObject = f(gdi32, 'bool __stdcall DeleteObject(intptr_t obj)');
  const SHAppBarMessage = f(shell32, 'uintptr_t __stdcall SHAppBarMessage(uint32_t msg, _Inout_ ISLET_APPBARDATA *data)');
  const QueryUserNotificationState = f(shell32, 'int32_t __stdcall SHQueryUserNotificationState(_Out_ int32_t *state)');
  const OpenProcess = f(kernel32, 'intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)');
  const QueryFullProcessImageNameW = f(kernel32, 'bool __stdcall QueryFullProcessImageNameW(intptr_t proc, uint32_t flags, void *buf, _Inout_ uint32_t *size)');
  const CloseHandle = f(kernel32, 'bool __stdcall CloseHandle(intptr_t h)');
  const DwmGetWindowAttribute = f(dwmapi, 'int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, void *buf, uint32_t size)');

  // ---- Constants ---------------------------------------------------------
  const GWL_EXSTYLE = -20, GWL_STYLE = -16;
  const WS_CHILD = 0x40000000, WS_POPUP = 0x80000000, WS_EX_LAYERED = 0x80000, LWA_ALPHA = 0x2;
  const WS_EX_TOOLWINDOW = 0x80;
  const WS_EX_NOACTIVATE = 0x08000000;
  const GW_OWNER = 4;
  const SW_HIDE = 0, SW_SHOWNA = 8, SW_RESTORE = 9, SW_MINIMIZE = 6;
  const SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
  const HWND_BOTTOM = 1;
  const MONITOR_DEFAULTTONEAREST = 2;
  const DWMWA_CLOAKED = 14;
  const SMTO_NORMAL = 0;
  const WM_CLOSE = 0x10;
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const SPI_GETDESKWALLPAPER = 0x73, SPI_SETDESKWALLPAPER = 0x14;
  const KEYEVENTF_KEYUP = 0x2, KEYEVENTF_EXTENDEDKEY = 0x1;
  const ABM = { NEW: 0, REMOVE: 1, QUERYPOS: 2, SETPOS: 3, GETSTATE: 4, GETTASKBARPOS: 5, SETSTATE: 10 };
  const ABS_AUTOHIDE = 1, ABS_ALWAYSONTOP = 2;
  const ABE_BOTTOM = 3;

  // ---- Helpers -----------------------------------------------------------
  const strBuf = Buffer.alloc(1024);
  function readStr(fn, hwnd) {
    const n = fn(hwnd, strBuf, 512);
    return n > 0 ? strBuf.toString('utf16le', 0, n * 2) : '';
  }
  const className = (h) => readStr(GetClassNameW, h);
  const windowTitle = (h) => readStr(GetWindowTextW, h);

  function rectOf(h) {
    const r = {};
    return GetWindowRect(h, r) ? r : null;
  }

  function monitorOf(h) {
    const mon = MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST);
    const zero = { left: 0, top: 0, right: 0, bottom: 0 };
    const info = { cbSize: koffi.sizeof(MONITORINFO), rcMonitor: { ...zero }, rcWork: { ...zero }, dwFlags: 0 };
    if (!mon || !GetMonitorInfoW(mon, info)) return null;
    return { monitor: info.rcMonitor, work: info.rcWork, primary: (info.dwFlags & 1) === 1 };
  }

  function isCloaked(h) {
    const b = Buffer.alloc(4);
    return DwmGetWindowAttribute(h, DWMWA_CLOAKED, b, 4) === 0 && b.readUInt32LE(0) !== 0;
  }

  const exeCache = new Map();
  function exePathOf(pid) {
    if (exeCache.has(pid)) return exeCache.get(pid);
    let out = '';
    const ph = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (ph) {
      const buf = Buffer.alloc(2048);
      const size = [1024];
      if (QueryFullProcessImageNameW(ph, 0, buf, size)) out = buf.toString('utf16le', 0, size[0] * 2);
      CloseHandle(ph);
    }
    if (exeCache.size > 500) exeCache.clear();
    exeCache.set(pid, out);
    return out;
  }

  function pidOf(h) {
    const out = [0];
    GetWindowThreadProcessId(h, out);
    return out[0];
  }

  function enumTopLevel(cb) {
    EnumWindows((hwnd) => cb(hwnd) !== false, 0);
  }

  // Keys Windows treats as "extended" (they need the flag to be recognised).
  const EXTENDED = new Set([0x5B, 0x5C, 0xAD, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2, 0xB3]);
  const INPUT_KEYBOARD = 1;
  function sendKey(vk, up) {
    let flags = (up ? KEYEVENTF_KEYUP : 0) | (EXTENDED.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0);
    const input = { type: INPUT_KEYBOARD, ki: { wVk: vk, wScan: MapVirtualKeyW(vk, 0) & 0xff, dwFlags: flags, time: 0, dwExtraInfo: 0 }, _pad: [0, 0, 0, 0, 0, 0, 0, 0].slice(0, process.arch === 'ia32' ? 4 : 8) };
    const sent = SendInput(1, input, koffi.sizeof(INPUT));
    if (sent !== 1) keybd_event(vk, 0, flags, 0); // fallback to the legacy call
  }
  function key(vk) { sendKey(vk, false); sendKey(vk, true); }
  function chord(vks) {
    for (const vk of vks) sendKey(vk, false);
    for (const vk of [...vks].reverse()) sendKey(vk, true);
  }

  // ---- Desktop wallpaper layer ("WorkerW") -------------------------------
  // Asks Explorer to split the desktop into an icon layer and a wallpaper
  // layer, then returns where a wallpaper window should be parented.
  // Handles both the classic layout and the Windows 11 24H2+ layout.
  function findWallpaperHost() {
    const progman = FindWindowW('Progman', null);
    if (!progman) return null;
    SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, SMTO_NORMAL, 1000, null);
    SendMessageTimeoutW(progman, 0x052C, 0, 0, SMTO_NORMAL, 1000, null);

    let iconHost = 0, defView = 0;
    enumTopLevel((h) => {
      const dv = FindWindowExW(h, 0, 'SHELLDLL_DefView', null);
      if (dv) { iconHost = h; defView = dv; return false; }
      return true;
    });

    // 24H2+: icons (DefView) and the WorkerW both live inside Progman.
    if (iconHost === progman) {
      const worker = FindWindowExW(progman, 0, 'WorkerW', null);
      return { layout: 'progman', parent: progman, insertAfter: defView, worker };
    }
    // Classic: a separate top-level WorkerW sits right behind the icon host.
    const worker = iconHost ? FindWindowExW(0, iconHost, 'WorkerW', null) : 0;
    if (worker) return { layout: 'workerw', parent: worker, insertAfter: 0, worker };
    return null;
  }

  function attachToDesktop(hwnd, bounds) {
    const host = findWallpaperHost();
    if (!host) return { ok: false, reason: 'no-host' };
    if (host.layout === 'progman') {
      // Windows 11 24H2+: Progman composes its children itself, so the
      // wallpaper must be a real child window and layered, or it stays invisible.
      const u32 = (v) => Number(BigInt.asUintN(32, BigInt(v)));
      const style = u32(GetWindowLongPtrW(hwnd, GWL_STYLE));
      SetWindowLongPtrW(hwnd, GWL_STYLE, ((style & ~WS_POPUP) | WS_CHILD) >>> 0);
      const ex = u32(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
      SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (ex | WS_EX_LAYERED) >>> 0);
      SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    }
    SetParent(hwnd, host.parent);
    // Coordinates inside the host are relative to the virtual screen origin.
    const { x, y, width, height } = bounds;
    if (host.layout === 'progman') {
      SetWindowPos(hwnd, host.insertAfter, x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    } else {
      SetWindowPos(hwnd, 0, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }
    const r = rectOf(hwnd);
    return { ok: true, layout: host.layout, parent: host.parent, insertAfter: host.insertAfter, worker: host.worker, rect: r, visible: IsWindowVisible(hwnd) };
  }

  function moveChild(hwnd, bounds) {
    SetWindowPos(hwnd, 0, bounds.x, bounds.y, bounds.width, bounds.height, SWP_NOZORDER | SWP_NOACTIVATE);
  }

  function sendToBottom(hwnd) {
    SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }

  function detachFromDesktop(hwnd) {
    if (IsWindow(hwnd)) SetParent(hwnd, 0);
    refreshDesktopWallpaper();
  }

  function getDesktopWallpaperPath() {
    const buf = Buffer.alloc(1040);
    if (!SPI_Buffer(SPI_GETDESKWALLPAPER, 520, buf, 0)) return '';
    const s = buf.toString('utf16le');
    return s.slice(0, s.indexOf('\0') < 0 ? undefined : s.indexOf('\0'));
  }

  // Re-applies the current wallpaper so Explorer repaints after we leave.
  // winIni = 0 means "this session only": nothing is persisted.
  function refreshDesktopWallpaper() {
    const p = getDesktopWallpaperPath();
    if (!p) return;
    const buf = Buffer.from(p + '\0', 'utf16le');
    SPI_Buffer(SPI_SETDESKWALLPAPER, 0, buf, 0);
  }

  // ---- Taskbar ----------------------------------------------------------
  function taskbars() {
    const list = [];
    const main = FindWindowW('Shell_TrayWnd', null);
    if (main) list.push(main);
    for (let h = 0; ;) {
      h = FindWindowExW(0, h, 'Shell_SecondaryTrayWnd', null);
      if (!h) break;
      list.push(h);
    }
    return list;
  }

  function setRoundRegion(hwnd, x1, y1, x2, y2, radius) {
    const rgn = CreateRoundRectRgn(x1, y1, x2, y2, radius * 2, radius * 2);
    if (!rgn) return false;
    if (!SetWindowRgn(hwnd, rgn, true)) { DeleteObject(rgn); return false; }
    return true; // the system now owns rgn
  }

  function clearRegion(hwnd) { SetWindowRgn(hwnd, 0, true); }

  // Bounding box of the window's current region, or null when it has none.
  // (Windows can give the stock taskbar a region of its own, so callers
  // compare the box with the shape they set rather than just checking for one.)
  function regionBox(hwnd) {
    const r = {};
    return GetWindowRgnBox(hwnd, r) > 1 ? r : null; // 0 = ERROR (no region), 1 = NULLREGION
  }

  function appBarState() {
    const d = { cbSize: koffi.sizeof(APPBARDATA), hWnd: 0, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
    return Number(SHAppBarMessage(ABM.GETSTATE, d));
  }

  // Official shell API for the "Automatically hide the taskbar" behaviour.
  function setAppBarState(state) {
    const tb = FindWindowW('Shell_TrayWnd', null);
    const d = { cbSize: koffi.sizeof(APPBARDATA), hWnd: tb, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: state };
    SHAppBarMessage(ABM.SETSTATE, d);
  }

  function hideWindow(h) { ShowWindow(h, SW_HIDE); }
  function showWindowNoActivate(h) { ShowWindow(h, SW_SHOWNA); }

  // ---- Our own AppBar (reserves screen space for the dock) ---------------
  let appBarMsg = 0;
  function appBarRegister(hwnd) {
    if (!appBarMsg) appBarMsg = RegisterWindowMessageW('IsletAppBarMessage');
    const d = { cbSize: koffi.sizeof(APPBARDATA), hWnd: hwnd, uCallbackMessage: appBarMsg, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
    SHAppBarMessage(ABM.NEW, d);
    return appBarMsg;
  }
  function appBarSetBottom(hwnd, monitorRect, height) {
    const d = {
      cbSize: koffi.sizeof(APPBARDATA), hWnd: hwnd, uCallbackMessage: appBarMsg, uEdge: ABE_BOTTOM,
      rc: { left: monitorRect.left, top: monitorRect.bottom - height, right: monitorRect.right, bottom: monitorRect.bottom }, lParam: 0,
    };
    SHAppBarMessage(ABM.QUERYPOS, d);
    d.rc.top = d.rc.bottom - height;
    SHAppBarMessage(ABM.SETPOS, d);
    return d.rc;
  }
  function appBarRemove(hwnd) {
    const d = { cbSize: koffi.sizeof(APPBARDATA), hWnd: hwnd, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
    SHAppBarMessage(ABM.REMOVE, d);
  }

  // ---- App windows (for the dock) ----------------------------------------
  const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow']);

  function listAppWindows(skipPid) {
    const out = [];
    enumTopLevel((h) => {
      if (!IsWindowVisible(h) || GetWindow(h, GW_OWNER)) return true;
      const ex = Number(GetWindowLongPtrW(h, GWL_EXSTYLE));
      if (ex & WS_EX_TOOLWINDOW || ex & WS_EX_NOACTIVATE) return true;
      if (isCloaked(h)) return true;
      const title = windowTitle(h);
      if (!title) return true;
      if (SHELL_CLASSES.has(className(h))) return true;
      const pid = pidOf(h);
      if (pid === skipPid) return true;
      out.push({ hwnd: h, title, pid, exe: exePathOf(pid), minimized: IsIconic(h) });
      return true;
    });
    return out;
  }

  // lastApp: the app that was in front before the dock was clicked (the dock
  // itself is the foreground window at this point). Clicking it again minimises.
  function activateWindow(h, lastApp = 0) {
    if (!IsWindow(h)) return false;
    if (IsIconic(h)) { ShowWindow(h, SW_RESTORE); }
    else if (h === lastApp || GetForegroundWindow() === h) { ShowWindow(h, SW_MINIMIZE); return true; }
    // Tapping Alt lets a background process hand focus to another window.
    key(0x12);
    return SetForegroundWindow(h);
  }

  function closeWindow(h) { return PostMessageW(h, WM_CLOSE, 0, 0); }

  // ---- What is in front? -------------------------------------------------
  // Used to pause the wallpaper and slim the island when an app covers it.
  function foregroundState(ownPid) {
    const h = GetForegroundWindow();
    const res = { hwnd: h, maximized: false, fullscreen: false, desktop: false, own: false };
    let quns = [0];
    if (QueryUserNotificationState(quns) === 0) {
      // 2 = busy (fullscreen app), 3 = D3D fullscreen, 4 = presentation mode
      if ([2, 3, 4].includes(quns[0])) res.fullscreen = true;
    }
    if (!h) return res;
    const cls = className(h);
    if (cls === 'Progman' || cls === 'WorkerW') { res.desktop = true; return res; }
    if (pidOf(h) === ownPid) { res.own = true; return res; }
    if (SHELL_CLASSES.has(cls)) return res;
    res.maximized = IsZoomed(h);
    const r = rectOf(h), m = monitorOf(h);
    if (r && m) {
      const mr = m.monitor;
      if (r.left <= mr.left && r.top <= mr.top && r.right >= mr.right && r.bottom >= mr.bottom) res.fullscreen = true;
      res.primary = m.primary;
    }
    return res;
  }

  // ---- Keys --------------------------------------------------------------
  const VK = {
    LWIN: 0x5B, SHIFT: 0x10, CONTROL: 0x11, MENU: 0x12, TAB: 0x09, S: 0x53, A: 0x41, N: 0x4E,
    MEDIA_NEXT: 0xB0, MEDIA_PREV: 0xB1, MEDIA_PLAY_PAUSE: 0xB3,
    VOLUME_MUTE: 0xAD, VOLUME_DOWN: 0xAE, VOLUME_UP: 0xAF,
  };
  const shell = {
    start: () => key(VK.LWIN),
    search: () => chord([VK.LWIN, VK.S]),
    taskView: () => chord([VK.LWIN, VK.TAB]),
    notifications: () => chord([VK.LWIN, VK.N]),
    quickSettings: () => chord([VK.LWIN, VK.A]),
    snip: () => chord([VK.LWIN, VK.SHIFT, VK.S]),
    lock: () => LockWorkStation(),
    playPause: () => key(VK.MEDIA_PLAY_PAUSE, true),
    next: () => key(VK.MEDIA_NEXT, true),
    prev: () => key(VK.MEDIA_PREV, true),
    volUp: () => key(VK.VOLUME_UP, true),
    volDown: () => key(VK.VOLUME_DOWN, true),
    mute: () => key(VK.VOLUME_MUTE, true),
  };

  const hwndOf = (win) => {
    const b = win.getNativeWindowHandle();
    return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0);
  };

  return {
    available: true,
    inputSize: koffi.sizeof(INPUT),
    hwndOf, className, windowTitle, rectOf, monitorOf, GetDpiForWindow, IsWindow, IsWindowVisible,
    attachToDesktop, detachFromDesktop, moveChild, sendToBottom, findWallpaperHost,
    getDesktopWallpaperPath, refreshDesktopWallpaper,
    taskbars, setRoundRegion, clearRegion, regionBox, appBarState, setAppBarState,
    hideWindow, showWindowNoActivate, ABS_AUTOHIDE, ABS_ALWAYSONTOP,
    appBarRegister, appBarSetBottom, appBarRemove,
    listAppWindows, activateWindow, closeWindow, foregroundState,
    shell,
  };
}
