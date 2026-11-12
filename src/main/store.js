'use strict';
// Settings live in one JSON file under %APPDATA%\Islet\settings.json.
// Nothing is written to the Windows registry.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const DEFAULTS = require('../renderer/shared/defaults.json');

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Deep-merge `src` onto `base`. Arrays and primitives in src replace base. */
function merge(base, src) {
  if (!isObj(base) || !isObj(src)) return src === undefined ? clone(base) : clone(src);
  const out = clone(base);
  for (const [k, v] of Object.entries(src)) {
    out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : clone(v);
  }
  return out;
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  if (keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) {
    throw new Error('Invalid settings key');
  }
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!isObj(o[k])) o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

class Store extends EventEmitter {
  constructor(dir) {
    super();
    this.file = path.join(dir, 'settings.json');
    this.data = clone(DEFAULTS);
    this._timer = null;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = merge(DEFAULTS, raw);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // Corrupt file: keep a copy for the user and start fresh.
        try { fs.copyFileSync(this.file, this.file + '.broken'); } catch {}
      }
    }
  }

  get(key) {
    return clone(key ? getPath(this.data, key) : this.data);
  }

  set(key, value) {
    const prev = clone(this.data);
    setPath(this.data, key, clone(value));
    this._save();
    this.emit('change', this.get(), prev, key);
  }

  /** Apply several dotted keys at once: { 'a.b': 1, 'c': 2 } */
  patch(changes) {
    const prev = clone(this.data);
    for (const [k, v] of Object.entries(changes)) setPath(this.data, k, clone(v));
    this._save();
    this.emit('change', this.get(), prev, Object.keys(changes).join(','));
  }

  reset(section) {
    const prev = clone(this.data);
    if (section) this.data[section] = clone(DEFAULTS[section]);
    else this.data = merge(clone(DEFAULTS), { onboarded: true, runtime: this.data.runtime });
    this._save();
    this.emit('change', this.get(), prev, section || '*');
  }

  _save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this._timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, merge, getPath, setPath, DEFAULTS };
