# Contributing to Islet

Islet is owned and maintained by [Mohammed Anas Asif](https://github.com/MohammedAnasAsif), who reviews and merges all pull requests.

Thanks for helping. A few things keep Islet easy to work on:

- **Plain JavaScript, no build step.** The UI is ES modules loaded straight from `src/renderer`. The main process is CommonJS.
- **Works on any OS for UI work.** Run `npm run preview -- --serve` and open `http://localhost:5179/settings/index.html` (or `/island/index.html?open=1`, `/dock/index.html`, `/wallpaper/index.html?scene=aurora`). Sample data comes from `src/renderer/shared/bridge.js`.
- **No registry writes, ever.** If a feature seems to need one, open an issue first so we can find another way.
- **Undo everything.** Anything that changes Windows (the taskbar, the desktop layer) must be reverted in `before-quit` and by `Islet.exe --restore`.

## Before you open a pull request

```bash
npm run lint      # syntax-check all files
npm test          # unit tests
npm run preview   # renders every screen; fails on any console error
```

If you're on Windows, also run `npm start` and try your change for real, and run `npm run smoke:win`.

## Adding things

- **A scene:** add an entry to `SCENES` in `src/renderer/wallpaper/scenes.js`, with a name, a note, a CSS `swatch` for the thumbnail and a fragment shader. `R` is the resolution and `T` is the time in seconds. Keep it light: it runs all day.
- **A glass surface:** add a `[data-surface='name']` block to `src/renderer/shared/theme.css` and an entry to `SURFACES` in `src/renderer/shared/util.js`.
- **A widget:** add a case to `renderWidget` in `src/renderer/wallpaper/widgets.js`, add it to `WIDGET_TYPES`, and add a default item in `src/renderer/shared/defaults.json`.
- **An IPC call:** add the channel to the allow-list in `src/preload/preload.js` and handle it in `src/main/main.js`. Validate every argument in the main process.

## Reporting a Windows problem

Please include your Windows build (`winver`) and the details from Settings → About. The desktop and taskbar internals differ between Windows releases, so the build number matters most.
