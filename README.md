# AI at ACCIONA: vertical video series (18 episodes)

Episode 01 is **IAWARD**. It's a 45-second, 1080 × 1920 (9:16) animated explainer built with HTML, Canvas and JavaScript. The series template (timing, chapters, palette, typography, safe areas, subtitles, transitions, opening/closing) is kept separate from the episode content, so each new episode only needs a new config file.

## Deliverables

| File | What it is |
|---|---|
| `dist/iaward-ep01.mp4` | 1080 × 1920, 30 fps, H.264, 45.0 s. **Silent: no audio track** (see "Audio" below). |
| `dist/iaward-ep01-standalone.html` | Single self-contained file (fonts, engine, config inlined). Opens offline by double-clicking it. |
| `index.html` | Development player. Loads the editable source files below. |
| `episodes/ep01-iaward.config.js` | **Editable IAWARD configuration**: all text, timings, narration, captions, visual data and evidence notes. |
| `dist/iaward-ep01-narration.md` | English narration script (100 words) with timings, voice direction and sound notes. |
| `dist/iaward-ep01.srt` | Synchronised English subtitles. |
| `dist/validation-report.md` | Output of the automated checks (27/27). |

## Preview

1. Open `index.html` (or the standalone file) in Chrome, Edge, Safari or Firefox. No server or network is needed.
2. Controls sit outside the 9:16 frame: **Play/Pause**, **Restart**, the **timeline scrubber**, buttons to jump to a chapter, **Phone preview 360×640**, a **Safe areas** overlay, and **Recording mode**.
3. Keyboard: `Space` plays or pauses, `←`/`→` step one frame, `Home` restarts, `R` toggles recording mode, `Esc` exits it.
4. URL options: `?t=22.5` (start at a time), `?record=1` (recording mode), `?record=1&native=1` (exact 1080 × 1920 pixels), `?safe=1`, `?autoplay=1`, `?episode=ep02-name` (load another config).

Every frame is a pure function of time `t`, so seeking, pausing and restarting always stay in sync with the subtitles.

## Export

- **MP4 (frame-accurate, recommended):** `node tools/render-mp4.mjs dist/iaward-ep01.mp4`. It renders all 1,350 frames in headless Chromium (Playwright) and encodes H.264 with ffmpeg. You need Node 18+, ffmpeg and Playwright (`npm i -D playwright`, then `npx playwright install chromium`).
- **WebM from the browser:** the "Record WebM (real time)" button captures the canvas while it plays. It saves a **.webm** file (silent, real-time capture, quality depends on the machine). Don't rename it to .mp4; convert it with `ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p out.mp4` if needed.
- **Screen recording:** press `R` (recording mode), restart, and capture the window with OBS or QuickTime at 1080 × 1920 or larger.
- **Single frame:** "Save frame PNG" saves the current frame at full resolution.

### Audio

No narration or music is embedded. A reliable synthetic voice wasn't available in this build environment, and browser speech synthesis isn't frame-synchronised. The video is designed to make sense with the sound off: every message is on screen and subtitles are burned in. To add a voice-over, record `dist/iaward-ep01-narration.md` against the SRT timings, then mux:

```bash
ffmpeg -i dist/iaward-ep01.mp4 -i voice_and_music.wav -c:v copy -c:a aac -b:a 192k -shortest iaward-ep01-with-audio.mp4
```

## Edit or create an episode

1. Copy `episodes/ep01-iaward.config.js` to `episodes/ep02-<project>.config.js`.
2. Edit the fields: `episodeNumber`, `totalEpisodes`, `projectTitle`, `company`, `division`, `businessContext`, `openingVisual`, `projectDescription`, `need`, `workflow`, `value`, `nextSteps`, `narration`, `captions`, `visualAssets`, `evidenceNotes`.
3. Preview with `index.html?episode=ep02-<project>`.
4. Build and check: `node tools/build.mjs episodes/ep02-<project>.config.js` and `node tools/validate.mjs`.

Times in the config are absolute seconds on the fixed timeline:

| Opening | The project | The need | How it works | Value | What's next | Closing |
|---|---|---|---|---|---|---|
| 0–4 s | 4–11 s | 11–17 s | 17–30 s | 30–37 s | 37–43 s | 43–45 s |

### What stays fixed (`src/series.js`)
Chapter timing, labels and order; palette (#050507 / #101116 / white / #D6D9E0 / red #E52529 / cyan); Inter typography and sizes (title 140, messages 92→76, chapter 54, subtitles 52, labels ≥ 42 px); safe area (L 90, R 180, T 160, B 340 px); subtitle box; red slash wipe at every cut; the opening/closing title composition.

### What changes per project: the visual library (`src/engine.js`, `VISUALS`)
Each chapter's `visual.type` picks a module, and the module draws from config data only:

| Type | Used for | Data |
|---|---|---|
| `documentSwarm` | opening and closing | hero card text, satellite document kinds |
| `stagePipeline` | the project | stages (`label`, `sub`, `destination`) |
| `clutterToFlow` | the need | friction labels, resolved label |
| `agentApprovalFlow` | how it works | agent steps; an **optional** `checkpoint` per step |
| `auditTrail` | value | steps, records (`state`, `by`) |
| `futureExpansion` | what's next | planned badge, labels, checkpoints |

Human approval checkpoints only appear where a config step defines a `checkpoint`. They are IAWARD content, not a series rule, so don't copy them into another project unless its sources support them. To add a new metaphor, add a function to `VISUALS` and reference its name in the config.

## Validation (`node tools/validate.mjs`)

It samples every 1/15 s and checks:
- exact 45 s duration and contiguous chapters
- chapter order on screen
- type sizes, safe area and text overlaps
- subtitles at most 2 lines and below the main visual
- main messages of 3–7 words, one at a time
- caption pace, and subtitles matching the narration word for word
- English only
- no metrics or live-integration claims
- "Corporate ERP" wording, and future work labelled as planned
- **every decision checkpoint waits for an explicit buyer "Approve"** ("Approved" never appears before the buyer acts)
- seek and restart determinism

## Sources and accuracy

The approved project information in the brief is the primary source. The attachments were used only to understand the process:
- **Proposal p. 7** (Source-to-Pay diagram). Gave the request → offers → negotiation → award flow, the buyer approval diamonds, and the "traceability of activities" band.
- **Technical-functional deck slides 6–9.** Gave the specialised agents and the human gates where the flow stops until the buyer validates (supplier list, negotiation scripts, award recommendation). The buyer can approve or adjust.
- **Follow-up deck.** Confirms integrations, other geographies and agent learning are post-pilot items.

The video never shows supplier names, budgets, fees, staffing estimates, dates, KPIs, technical stack or infrastructure, team members, or the robot mascot. Suppliers ("Supplier A/B/C") and the purchase request ("PR-0001, Formwork panels") are fictional, and the card is labelled "Illustrative example". The ERP appears as a workflow destination, not a live interface, and no SAP integration is shown. No usable ACCIONA logo asset was available (only raster copies with dark lettering inside third-party slides), so the clean text treatment "ACCIONA" is used. Full notes are in `evidenceNotes` in the config.

Fonts: Inter (SIL Open Font License, see `assets/fonts/LICENSE-Inter.txt`), subset and embedded in `src/fonts.js` (regenerate with `node tools/embed-fonts.mjs`).
