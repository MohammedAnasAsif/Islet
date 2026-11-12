// Desktop widgets. They are drawn inside the wallpaper layer, so their glass
// genuinely blurs whatever wallpaper (video, scene, image) is behind them.
import { icon } from '../shared/icons.js';
import { esc, fmtRate, fmtTime } from '../shared/util.js';

export const WIDGET_TYPES = {
  clock: { name: 'Clock', note: 'Big spaced-out day, date and time' },
  weather: { name: 'Weather', note: 'Now, high and low (Open-Meteo)' },
  system: { name: 'System', note: 'CPU, GPU, RAM and network' },
  calendar: { name: 'Calendar', note: 'This month at a glance' },
  media: { name: 'Now playing', note: 'Track, artist and progress' },
};

export const CLOCK_STYLES = [
  { id: 'wide', name: 'Wide' },
  { id: 'stack', name: 'Stacked' },
  { id: 'minimal', name: 'Minimal' },
];

function spark(values, w = 96, h = 22) {
  if (!values || values.length < 2) return '';
  const max = 100, n = values.length;
  const pts = values.map((v, i) => `${(i / (n - 1)) * w},${h - (Math.min(max, v) / max) * (h - 2) - 1}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
}

export function renderWidget(item, data) {
  const now = new Date();
  switch (item.type) {
    case 'clock': {
      const style = item.style || 'wide';
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (style === 'stack') {
        return `<div class="w-clock stack"><div class="t">${esc(time.replace(/\s?[AP]M$/i, ''))}</div>
          <div class="d">${esc(now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }))}</div></div>`;
      }
      if (style === 'minimal') {
        return `<div class="w-clock minimal"><div class="t">${esc(time)}</div></div>`;
      }
      const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      const date = `${now.getDate()} ${now.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()}, ${now.getFullYear()}.`;
      return `<div class="w-clock wide"><div class="day">${esc(day)}</div><div class="date">${esc(date)}</div><div class="time">- ${esc(time)} -</div></div>`;
    }
    case 'weather': {
      const w = data.weather;
      if (!w) return `<div class="card w-weather empty">${icon('partly', 22)}<span>Add your city in<br>Islet → Widgets</span></div>`;
      return `<div class="card w-weather">
        <div class="row"><span class="temp">${w.temp}°</span>${icon(w.icon, 26)}</div>
        <div class="row sub"><span>${esc(w.label)}</span><span>H ${w.high}° L ${w.low}°</span></div></div>`;
    }
    case 'system': {
      const s = data.system || {};
      const bar = (label, v, hist) => `<div class="m"><span>${label}</span>${spark(hist)}<b>${v == null ? '–' : Math.round(v) + '%'}</b></div>`;
      return `<div class="card w-system">
        ${bar('CPU', s.cpu, s.history?.cpu)}
        ${bar('GPU', s.gpu, s.history?.gpu)}
        ${bar('RAM', s.ram?.usedPct, s.history?.ram)}
        <div class="net"><span>${icon('down', 11)}${fmtRate(s.net?.down)}</span><span>${icon('up', 11)}${fmtRate(s.net?.up)}</span></div></div>`;
    }
    case 'calendar': {
      const y = now.getFullYear(), m = now.getMonth();
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < 7; i++) cells += `<i>${new Date(2026, 1, i + 1).toLocaleDateString([], { weekday: 'narrow' })}</i>`;
      for (let i = 0; i < first; i++) cells += '<span></span>';
      for (let d = 1; d <= days; d++) cells += `<span class="${d === now.getDate() ? 'today' : ''}">${d}</span>`;
      return `<div class="card w-calendar"><div class="head">${esc(now.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</div><div class="grid">${cells}</div></div>`;
    }
    case 'media': {
      const md = data.media || {};
      if (!md.active) return `<div class="card w-media empty">${icon('music', 20)}<span>Nothing playing</span></div>`;
      const frac = md.duration ? Math.min(1, (md.position || 0) / md.duration) : 0;
      return `<div class="card w-media">
        ${md.art ? `<img src="${esc(md.art)}" alt="">` : `<div class="noart">${icon('music', 20)}</div>`}
        <div class="meta"><b>${esc(md.title || '')}</b><span>${esc(md.artist || '')}</span>
        <div class="prog"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
        <div class="times"><span>${fmtTime(md.position)}</span><span>${fmtTime(md.duration)}</span></div></div></div>`;
    }
    default:
      return '';
  }
}
