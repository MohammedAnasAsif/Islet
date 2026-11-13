Islet turns a stock Windows 11 desktop into a glass setup in five quick steps. It's by [Mohammed Anas Asif](https://github.com/MohammedAnasAsif).

## What's fixed in this version

- **Start, Search, Task view, notifications and Quick settings now open from the glass dock.** These menus belong to Windows' own taskbar, which Islet hides in dock mode, so they had nowhere to open. Islet now lets the (auto-hidden) taskbar exist while one of them is open, then hides it again.
- Also includes everything from 0.1.1: island and dock clicks land, the dock switches apps, Snip works, the 24H2 desktop layer is handled, and there's a log file in Settings → About.

## Download

- **`Islet-Setup-…-x64.exe`**: installer, per-user, no admin needed
- **`Islet-…-win-x64-portable.zip`**: portable, nothing installed; unzip it and run `Islet.exe`

Windows may show "Windows protected your PC" because the app isn't code-signed yet. Click **More info → Run anyway**.

No Rainmeter, no registry edits, no telemetry. Everything is undone when you quit, and `Islet.exe --restore` puts the taskbar back if it's ever needed.

Please report anything that looks off in [Issues](https://github.com/MohammedAnasAsif/Islet/issues). Include your Windows build from `winver`, and attach `islet.log` if you can.
