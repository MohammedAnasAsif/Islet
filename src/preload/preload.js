'use strict';
// The only bridge between Islet's UI pages and the main process.
// Pages get a small, allow-listed API; no Node access.
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'settings:get', 'settings:set', 'settings:patch', 'settings:reset', 'state:get',
  'media', 'shell', 'island:interactive', 'dock:interactive', 'dock:activate', 'dock:launch', 'dock:context',
  'wallpaper:add-files', 'wallpaper:remove', 'wallpaper:windows-path', 'weather:search', 'weather:refresh',
  'arrange:open', 'arrange:done', 'icon:get', 'pin:add', 'notify', 'open-external', 'app:info', 'accent:set',
]);
const EVENTS = new Set([
  'settings', 'media', 'system', 'weather', 'dock:windows', 'fg', 'wallpaper:paused', 'island:toggle', 'nav', 'accent',
]);

contextBridge.exposeInMainWorld('islet', {
  invoke(channel, ...args) {
    if (!INVOKE.has(channel)) return Promise.reject(new Error('Blocked channel: ' + channel));
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, cb) {
    if (!EVENTS.has(channel)) throw new Error('Blocked event: ' + channel);
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
  platform: process.platform,
});
