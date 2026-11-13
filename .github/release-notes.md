Islet turns a stock Windows 11 desktop into a glass setup in five quick steps. It's by [Mohammed Anas Asif](https://github.com/MohammedAnasAsif).

## What's fixed in this version

- **The island and dock no longer disappear.** Windows sometimes wrongly reports that a fullscreen app is running, and Islet hid the island and dock for it. Islet now checks for itself and treats only real fullscreen apps (games, videos, presentations) as fullscreen. A maximised window no longer counts.
- **The live wallpaper attaches without briefly appearing as a full-screen window,** which is what set off that wrong signal. It now also fits the screen exactly, with no strip of the old wallpaper along an edge.
- Since 0.1.2: Start, Search, Task view, notifications and Quick settings open from the dock. Since 0.1.1: island and dock clicks land, Snip works, and the live wallpaper and widgets show on Windows 11 24H2 and later.

## Download

- **`Islet-Setup-…-x64.exe`**: installer, per-user, no admin needed
- **`Islet-…-win-x64-portable.zip`**: portable, nothing installed; unzip it and run `Islet.exe`

Windows may show "Windows protected your PC" because the app isn't code-signed yet. Click **More info → Run anyway**.

No Rainmeter, no registry edits, no telemetry. Everything is undone when you quit, and `Islet.exe --restore` puts the taskbar back if it's ever needed.

Please report anything that looks off in [Issues](https://github.com/MohammedAnasAsif/Islet/issues). Include your Windows build from `winver`, and attach `islet.log` if you can.
