'use strict';
// Runs islet-helper.ps1 and turns its JSON lines into events.
const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

function scriptPath() {
  // Inside a packaged app the script is unpacked next to app.asar.
  return path.join(__dirname, 'islet-helper.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

class Helper extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.buf = '';
    this.retries = 0;
    this.stopped = false;
    this.lastArt = '';
  }

  start() {
    if (process.platform !== 'win32' || this.proc) return;
    this.stopped = false;
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    this.proc = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath()], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => this._onData(chunk));
    this.proc.on('exit', () => {
      this.proc = null;
      if (this.stopped) return;
      // Back off if PowerShell keeps failing (e.g. blocked by policy).
      const delay = Math.min(60000, 2000 * 2 ** this.retries++);
      setTimeout(() => this.start(), delay);
    });
    this.proc.on('error', (e) => console.error('[helper]', e.message));
  }

  _onData(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try {
        const msg = JSON.parse(line);
        this.retries = 0;
        if (msg.media) {
          if (msg.media.art) this.lastArt = msg.media.art;
          else if (msg.media.active) msg.media.art = this.lastArt;
          if (!msg.media.active) this.lastArt = '';
          this.emit('media', msg.media);
        }
        this.emit('system', { gpu: msg.gpu, net: msg.net });
      } catch { /* ignore partial lines */ }
    }
  }

  command(cmd) {
    if (this.proc && this.proc.stdin.writable) this.proc.stdin.write(cmd + '\n');
  }

  stop() {
    this.stopped = true;
    if (this.proc) { try { this.proc.stdin.end(); } catch {} setTimeout(() => this.proc && this.proc.kill(), 1500); }
  }
}

module.exports = { Helper };
