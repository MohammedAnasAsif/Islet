'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');

// ---- CPU / RAM (pure Node, no extra processes) -----------------------------
class CpuSampler {
  constructor() { this.prev = this._snap(); }
  _snap() {
    let idle = 0, total = 0;
    for (const c of os.cpus()) {
      for (const v of Object.values(c.times)) total += v;
      idle += c.times.idle;
    }
    return { idle, total };
  }
  sample() {
    const now = this._snap();
    const dIdle = now.idle - this.prev.idle, dTotal = now.total - this.prev.total;
    this.prev = now;
    return dTotal > 0 ? Math.round(1000 * (1 - dIdle / dTotal)) / 10 : 0;
  }
}

function memory() {
  const total = os.totalmem(), free = os.freemem();
  return { usedPct: Math.round(1000 * (1 - free / total)) / 10, usedGB: +((total - free) / 1073741824).toFixed(1), totalGB: +(total / 1073741824).toFixed(1) };
}

// ---- Weather: Open-Meteo (free, no API key) --------------------------------
// https://open-meteo.com — data under CC BY 4.0.
const WMO = {
  0: ['Clear', 'sun'], 1: ['Mostly clear', 'sun'], 2: ['Partly cloudy', 'partly'], 3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Fog', 'fog'], 51: ['Drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'], 57: ['Freezing drizzle', 'drizzle'], 61: ['Light rain', 'rain'], 63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'], 66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'], 71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'], 80: ['Showers', 'rain'], 81: ['Showers', 'rain'],
  82: ['Heavy showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'], 95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm', 'storm'], 99: ['Thunderstorm', 'storm'],
};

function describeWeather(code, isDay) {
  const [label, icon] = WMO[code] || ['—', 'cloud'];
  return { label, icon: !isDay && (icon === 'sun' || icon === 'partly') ? (icon === 'sun' ? 'moon' : 'partly-night') : icon };
}

async function fetchJson(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchCity(fetchImpl, query) {
  const q = encodeURIComponent(String(query).slice(0, 80));
  const data = await fetchJson(fetchImpl, `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=6&language=en&format=json`);
  return (data.results || []).map((r) => ({
    name: r.name, country: r.country || '', admin: r.admin1 || '', lat: r.latitude, lon: r.longitude,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
  }));
}

async function fetchWeather(fetchImpl, { lat, lon, units }) {
  const temp = units === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m' +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=4&timezone=auto${temp}`;
  const d = await fetchJson(fetchImpl, url);
  const c = d.current;
  return {
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    wind: Math.round(c.wind_speed_10m),
    ...describeWeather(c.weather_code, c.is_day),
    high: Math.round(d.daily.temperature_2m_max[0]),
    low: Math.round(d.daily.temperature_2m_min[0]),
    days: d.daily.time.slice(1).map((t, i) => ({
      date: t, high: Math.round(d.daily.temperature_2m_max[i + 1]), low: Math.round(d.daily.temperature_2m_min[i + 1]),
      ...describeWeather(d.daily.weather_code[i + 1], 1),
    })),
    unit: units === 'imperial' ? '°F' : '°C',
    updated: Date.now(),
  };
}

// ---- Run at startup: a shortcut in the Startup folder (not the Run key) -----
function startupShortcutPath(app) {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Islet.lnk');
}

function setRunAtStartup(app, shell, enabled) {
  if (process.platform !== 'win32') return false;
  const lnk = startupShortcutPath(app);
  if (!enabled) { try { fs.unlinkSync(lnk); } catch {} return true; }
  const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const args = app.isPackaged ? '--hidden' : `"${app.getAppPath()}" --hidden`;
  return shell.writeShortcutLink(lnk, 'replace', { target, args, description: 'Islet', cwd: path.dirname(target) });
}

module.exports = { CpuSampler, memory, searchCity, fetchWeather, describeWeather, setRunAtStartup, startupShortcutPath };
