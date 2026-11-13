Islet turns a stock Windows 11 desktop into a glass setup in five quick steps. It's by [Mohammed Anas Asif](https://github.com/MohammedAnasAsif).

## What's fixed in this version

- **Island and dock clicks now land.** Before, hovering worked but most clicks passed through to the window behind, so the island's tabs didn't switch and the dock didn't open apps.
- **The dock brings apps to the front reliably.** Clicking an app that's already in front minimises it, like the Windows taskbar.
- **Snip, Alerts and Quick settings** now open through Windows' own shortcuts. Start, Search and Task view use a more reliable way of sending keys.
- **The live wallpaper now shows on Windows 11 24H2 and later.** Before, it attached but stayed hidden, so your old wallpaper still showed.
- **New log file** (Settings → About → Open log folder) to help pin down problems.

## Download

- **`Islet-Setup-…-x64.exe`**: installer, per-user, no admin needed
- **`Islet-…-win-x64-portable.zip`**: portable, nothing installed; unzip it and run `Islet.exe`

Windows may show "Windows protected your PC" because the app isn't code-signed yet. Click **More info → Run anyway**.

No Rainmeter, no registry edits, no telemetry. Everything is undone when you quit, and `Islet.exe --restore` puts the taskbar back if it's ever needed.

Please report anything that looks off in [Issues](https://github.com/MohammedAnasAsif/Islet/issues). Include your Windows build from `winver`, and attach `islet.log` if you can.
