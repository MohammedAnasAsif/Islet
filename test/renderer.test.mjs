import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const { renderWidget, WIDGET_TYPES } = await import('../src/renderer/wallpaper/widgets.js');
const { esc, fmtTime, fmtRate, isoWeek, hexToRgb, SURFACES } = await import('../src/renderer/shared/util.js');
const { SCENES } = await import('../src/renderer/wallpaper/scenes.js');
const { icon, iconNames } = await import('../src/renderer/shared/icons.js');

test('widgets render for every type, with and without data', () => {
  const data = {
    weather: { temp: 28, icon: 'partly', label: 'Partly cloudy', high: 29, low: 21 },
    system: { cpu: 12, gpu: null, ram: { usedPct: 41 }, net: { down: 2048, up: 10 }, history: { cpu: [1, 2, 3], gpu: [], ram: [4, 5] } },
    media: { active: true, title: '<b>x</b>', artist: 'A', position: 30, duration: 60 },
  };
  for (const type of Object.keys(WIDGET_TYPES)) {
    assert.ok(renderWidget({ type }, data).length > 20, type);
    assert.ok(renderWidget({ type }, {}).length > 20, type + ' empty');
  }
  assert.match(renderWidget({ type: 'media' }, data), /&lt;b&gt;x&lt;\/b&gt;/, 'titles are escaped');
  assert.match(renderWidget({ type: 'system' }, data), /GPU<\/span>.*–/s, 'missing GPU shows a dash');
  assert.match(renderWidget({ type: 'clock', style: 'wide' }, data), /class="day"/);
});

test('formatting helpers', () => {
  assert.equal(esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
  assert.equal(fmtTime(65), '1:05');
  assert.equal(fmtTime(-3), '0:00');
  assert.equal(fmtRate(500), '500 B/s');
  assert.equal(fmtRate(2048), '2 KB/s');
  assert.equal(fmtRate(5 * 1048576), '5.0 MB/s');
  assert.equal(isoWeek(new Date(2026, 10, 12)), 46);
  assert.deepEqual(hexToRgb('#ff8000'), [255, 128, 0]);
});

test('every surface has CSS, every scene has a shader, every icon draws', () => {
  const css = readFileSync(new URL('../src/renderer/shared/theme.css', import.meta.url), 'utf8');
  for (const s of SURFACES) assert.ok(css.includes(`[data-surface='${s.id}']`), s.id);
  for (const [id, s] of Object.entries(SCENES)) {
    assert.match(s.frag, /void main\(\)/, id);
    assert.ok(s.name && s.swatch, id);
  }
  for (const n of iconNames) assert.match(icon(n), /^<svg/);
});
