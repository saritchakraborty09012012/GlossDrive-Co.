# LINE DETAIL CO. — Car Wash Service Website

A cinematic, scroll-driven marketing site for a premium car-wash / detailing brand. The hero is a **300-frame looping video player** built from a sequential image sequence (no `<video>` tag), complete with a themed car-wash loader, media-player controls, background audio, and full-page sections (services, process, stats, packages, testimonials, booking).

---

## Features

### Hero sequence player
- **300 sequential JPEG frames** (`public/images/ezgif-frame-001.jpg` … `-300.jpg`) played like a video at **30 fps**.
- **Loops forever** until paused — no end card / replay button.
- **First scroll gesture** (wheel / touch / key) while at `scrollY 0` is consumed to auto-play the sequence; later wheel events are suppressed for ~650 ms so the page doesn’t jump mid-cue.
- **Up-scroll at top does NOT restart** the sequence (intentional).

### Media-player controls
- Play / pause toggle
- Time readout `00:00 / 00:10` synced to frame index
- **Seek bar** — click / drag / keyboard seeking
- Current frame index badge
- **Mute** button (`#btnMute`)
- Fullscreen toggle

### Loader
- 2D car-wash animation that stays on screen until **all 300 images settle** (`loaded >= TOTAL`; network errors also count as settled).
- Phase labels cycle through: `PRE-SOAK → SNOW FOAM → BRUSHING → RINSING → DRY & SHINE → READY`.

### Audio
- `public/audio/track.mp3` (source file: root-level MP3, copied into `public/audio/`).
- Loops in sync with the frame sequence (frame → time mapping).
- Pauses automatically when the tab is hidden; mute state persists via the player button.

### Intro section (“WATER CAN’T STICK.”)
- Frames **142–179** cropped to the water-droplet panel, stabilized with `vidstabtransform`, then frame-interpolated with `minterpol` to **109 smooth slow-mo frames** (`public/images/beads-slow/slow-001..109.jpg`).
- Played back at `SEQ_MS=50` (~20 fps) while the section is in view.
- Media card slides in from the left on first section enter (`.in`) and exits to the right when passed (`.out`), one direction per entry. IntersectionObserver watches the parent `#about` so the card’s own `translateX` doesn’t break entry detection.
- **No 4K upscale** — frames are plain 440×420 stabilized + interpolated (upscaling caused vibration).

### Sections & chrome
- Always-visible top nav (including on the home/hero), mobile menu.
- Services, process timeline, animated stats counters, package cards, testimonial slider, booking form, footer.
- **SPECIMEN** typographic watermarks (`::before`) on quotes, nav, footer, and booking — tuned opacities so they read as texture, not noise.
- Reveal-on-scroll animations and a section progress rail.
- Fully offline-safe: **no external fonts / CDNs**; all image URLs are relative (`images/...`).

### Mobile (≤ 640 px)
- Compact header (reduced padding, smaller logo/buttons).
- Hero `height: auto` with `padding-top: 56px` so the video starts below the header.
- Player uses `aspect-ratio: 16/9` (no full-screen letterbox).
- Only the primary scroll-hint bubble is shown.

---

## Getting started

```bash
# install dev deps (playwright-core, for tests only)
npm install

# serve the site at http://localhost:3000
npm start

# simulate slow image responses (useful for debugging the loader)
npm start:slow

# run the Playwright test suite (57 checks)
npm test
```

Requires **Node.js**. The static site itself is plain HTML/CSS/JS under `public/` and can also be opened via `file://` (some browser APIs work better over HTTP).

---

## Project structure

```
.
├── public/
│   ├── index.html            # all markup: loader, hero player, sections, booking form
│   ├── styles.css            # layout, SPECIMEN watermarks, mobile breakpoints
│   ├── script.js             # loader, 30fps loop player, audio, scroll/nav/reveals
│   ├── audio/
│   │   └── track.mp3         # looping background track
│   └── images/
│       ├── ezgif-frame-001..300.jpg   # hero sequence frames
│       ├── beads/                     # earlier crop/stabilize pass (superseded)
│       └── beads-slow/                # slow-mo intro sequence (109 frames)
├── server.js                 # tiny static server (+ optional image delay)
├── test/
│   └── test.js               # Playwright suite: player, loader, a11y, mobile
├── package.json
└── README.md
```

---

## Technical notes

| Topic | Detail |
| --- | --- |
| Frame playback | `requestAnimationFrame` advancing one frame every `1/30 s`; wraps with `(frame + adv) % TOTAL` for seamless looping |
| Audio sync | `syncAudioToFrame()` maps `frame → currentTime`; `audioPlay()` / pause on visibilitychange |
| Debug handle | `window.__player = { state(), play(), stop(), seek(i) }` for tests |
| Fonts | System / local only — no webfont fetches |
| Tests | Run via `cmd /c npm test` on Windows if the `npm.ps1` shim misbehaves |
| FFmpeg (asset regen) | Used offline to crop / stabilize (`vidstabtransform`, option name is `input=`) / interpolate frames; intermediates live under a gitignored temp dir |

---

## Controls cheat-sheet

| Action | Input |
| --- | --- |
| Start playback | First scroll / swipe / key press while at the top |
| Pause / resume | Player pause button or space (when player focused) |
| Seek | Click or drag the progress bar; arrow keys |
| Mute | Speaker button (`#btnMute`) |
| Fullscreen | Expand button on the player |
| Booking | Fill the form in the **Book** section and submit |

---

## License

See [LICENSE](./LICENSE).
