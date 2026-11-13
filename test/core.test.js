'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Store, merge, setPath } = require('../src/main/store');
const { floatGeometry, regionMatches } = require('../src/main/native/taskbar');
const { parseRange } = require('../src/main/protocol');
const { describeWeather, fetchWeather, searchCity } = require('../src/main/services');

test('store: defaults, set, patch and persistence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'islet-'));
  const s = new Store(dir);
  assert.equal(s.get('taskbar.mode'), 'off');
  assert.equal(s.get('wallpaper.enabled'), false);
  let changes = 0;
  s.on('change', () => changes++);
  s.set('appearance.surface', 'rose');
  s.patch({ 'taskbar.mode': 'float', 'wallpaper.scene': 'aurora' });
  assert.equal(changes, 2);
  s.flush();
  const again = new Store(dir);
  assert.equal(again.get('appearance.surface'), 'rose');
  assert.equal(again.get('taskbar.mode'), 'float');
  assert.equal(again.get('wallpaper.scene'), 'aurora');
  // new default keys appear for old settings files
  assert.equal(typeof again.get('widgets.weather.units'), 'string');
});

test('store: corrupt file is kept aside, defaults used', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'islet-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ nope');
  const s = new Store(dir);
  assert.equal(s.get('taskbar.mode'), 'off');
  assert.ok(fs.existsSync(path.join(dir, 'settings.json.broken')));
});

test('store: refuses prototype pollution keys', () => {
  assert.throws(() => setPath({}, '__proto__.x', 1));
  assert.throws(() => setPath({}, 'a.constructor.b', 1));
});

test('merge replaces arrays and keeps nested defaults', () => {
  const out = merge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { b: 5 }, list: [9] });
  assert.deepEqual(out, { a: { b: 5, c: 2 }, list: [9] });
});

test('floating taskbar geometry', () => {
  const g = floatGeometry(1920, 48, 1, { sideMargin: 12, vertMargin: 4, radius: 16, width: 100 });
  assert.deepEqual(g, { x1: 12, y1: 4, x2: 1909, y2: 45, radius: 16 });
  const hi = floatGeometry(3840, 96, 2, { sideMargin: 12, vertMargin: 4, radius: 40, width: 50 });
  assert.equal(hi.x1, 960 + 24);
  assert.equal(hi.x2, 2880 - 24 + 1);
  assert.ok(hi.radius <= (hi.y2 - hi.y1) / 2, 'radius never exceeds half the height');
});

test('region check tells our shape apart from Windows\' own', () => {
  const geo = floatGeometry(1024, 48, 1, { sideMargin: 12, vertMargin: 4, radius: 16, width: 100 });
  assert.equal(regionMatches(null, geo), false);
  assert.equal(regionMatches({ left: 0, top: 0, right: 1024, bottom: 48 }, geo), false, 'stock full-size region');
  assert.equal(regionMatches({ left: 12, top: 4, right: 1012, bottom: 44 }, geo), true);
});

test('HTTP range parsing for video wallpapers', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=0-5000', 1000), { start: 0, end: 999 });
  assert.equal(parseRange('bytes=2000-', 1000), 'invalid');
  assert.equal(parseRange(null, 1000), null);
});

test('weather codes map to labels and night icons', () => {
  assert.deepEqual(describeWeather(0, 1), { label: 'Clear', icon: 'sun' });
  assert.deepEqual(describeWeather(0, 0), { label: 'Clear', icon: 'moon' });
  assert.equal(describeWeather(95, 1).icon, 'storm');
  assert.equal(describeWeather(1234, 1).label, '—');
});

test('weather + city search parse Open-Meteo responses', async () => {
  const fake = async (url) => ({
    ok: true,
    json: async () => url.includes('geocoding')
      ? { results: [{ name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.5, longitude: 73.8 }] }
      : {
        current: { temperature_2m: 27.6, apparent_temperature: 29.2, weather_code: 2, is_day: 1, relative_humidity_2m: 60, wind_speed_10m: 8.4 },
        daily: { time: ['d0', 'd1', 'd2', 'd3'], temperature_2m_max: [30.2, 29, 28, 27], temperature_2m_min: [20.4, 19, 18, 17], weather_code: [2, 61, 3, 0] },
      },
  });
  const cities = await searchCity(fake, 'Pune');
  assert.equal(cities[0].label, 'Pune, Maharashtra, India');
  const w = await fetchWeather(fake, { lat: 18.5, lon: 73.8, units: 'metric' });
  assert.equal(w.temp, 28);
  assert.equal(w.high, 30);
  assert.equal(w.icon, 'partly');
  assert.equal(w.days.length, 3);
  assert.equal(w.days[0].icon, 'rain');
});

test('native layer is optional off Windows', () => {
  const native = require('../src/main/native/win32');
  if (process.platform !== 'win32') assert.equal(native.available, false);
});
