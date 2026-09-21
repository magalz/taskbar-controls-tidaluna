# Taskbar Controls for TidaLuna

Compact floating playback toolbar + Windows taskbar thumbnail controls for
[TidaLuna](https://github.com/Inrixia/TidaLuna).

## Install in TIDAL

Luna Settings → Plugins → Install from URL:

```text
https://magalz.github.io/taskbar-controls-tidaluna/magalz.toolbar-controls.mjs
```

The `.json` manifest lives next to it (`magalz.toolbar-controls.json`); Luna
fetches both from the same base URL.

## What it adds

- Restart / previous track (first click restarts, second click <3s goes previous)
- Play/pause, next track
- Rewind / advance 10 seconds
- Track title + artist, elapsed / duration, progress bar
- Restore-window button (enabled when the Luna host exposes the taskbar
  capability, otherwise disabled with an explanatory tooltip)

With the host taskbar capability present, the same transport actions register
as Windows taskbar thumbnail buttons, so playback stays controllable while
TIDAL is minimized. Without it, the in-window toolbar is the full experience.

## Host capability note

Thumbnail buttons + window restore require the generic host capability
(`__Luna.taskbar.*` + `__Luna.window.restore`), proposed upstream to
`Inrixia/TidaLuna`. The plugin is capability-detected and works on any Luna
build — taskbar controls are strictly additive. Icons are PNG data URLs
rendered at runtime on an offscreen canvas (Electron `nativeImage` decodes
PNG/JPEG only).

## Develop

```bash
pnpm install
pnpm test
pnpm build
```

Artifacts land in `dist/`:

```text
dist/magalz.toolbar-controls.mjs
dist/magalz.toolbar-controls.json
```

Serve `dist/` over HTTP for local testing and install the `.mjs` URL in Luna
Settings.
