# Neo Bomber Arena

Local multiplayer SNES-style Bomberman clone for desktop web.

## Stack

- TypeScript
- Phaser 3
- Vite
- Vitest

## Scripts

- `npm run dev` start local dev server
- `npm run build` type-check + production build
- `npm run test` run simulation tests
- `npm run test:soak` run deterministic 60-rematch soak test
- `npm run lint` run eslint
- `npm run check` lint + test + build
- `npm run generate:assets` generate valid baseline external theme assets (PNG + WAV)
- `npm run validate:assets` strict external asset validation (signatures, frame counts, non-empty files)
- `npm run check:release` full check + strict asset validation (set `SOAK_TESTS=1` to also run soak test)

## External Theme Assets

Drop final assets in [`public/assets/final`](public/assets/final) using these files:

- `tileset.png` spritesheet frames:
  `0 empty`, `1 hard`, `2 soft`, `3 sudden death`, `4 empty alt`, `5 hard alt`, `6 soft alt`, `7 sudden alt`
- `players.png` spritesheet frames:
  4 palette blocks x 8 directional frames each (32 total). Per block:
  `0 down idle`, `1 down walk`, `2 up idle`, `3 up walk`, `4 left idle`, `5 left walk`, `6 right idle`, `7 right walk`
- `bombs.png` spritesheet frames: `0 idle`, `1 lit`
- `flames.png` spritesheet frames: `0 frame A`, `1 frame B`
- `powerups.png` spritesheet frames:
  `0 extraBomb`, `1 flameUp`, `2 fullFire`, `3 speedUp`, `4 kick`, `5 glove`, `6 powerBomb`, `7 skull`
- Audio files (any one format per key): `.ogg` or `.mp3` or `.m4a` or `.wav`
  - `bgm-battle.{ogg|mp3|m4a|wav}`
  - `sfx-place.{ogg|mp3|m4a|wav}`
  - `sfx-blast.{ogg|mp3|m4a|wav}`
  - `sfx-pickup.{ogg|mp3|m4a|wav}`

If any required visual sheet is missing or invalid, the game auto-falls back to generated retro sprites.
If audio files are missing, unsupported, or invalid, it auto-falls back to synth SFX.

## Controls

- Title: `Up/Down` select, `Enter` confirm, `S` settings
- Settings: `Up/Down` select, `Left/Right` adjust or back, `Enter` apply, `Esc` back
- Lobby: `Up/Down` select row, `Left/Right` toggle Human/Bot or change CPU difficulty, `Enter` continue, `S` settings
- Map Select: `Up/Down` select row, `Left/Right` change map/timer/set, `Enter` start, `S` settings
- Match:
  - Player 1: `WASD` + `Space`
  - Player 2: Arrow keys + `Enter`
  - Player 3: `IJKL` + `U`
  - Player 4: Numpad `8456` + `0`
  - Gamepads: auto-mapped by slot index
  - `P` pause, `F` fullscreen, `Esc` map select
- Results: `Up/Down` select action, `Left/Right` or `Enter` confirm

## Set Flow

- Match rules now support `Single`, `Best of 3`, and `Best of 5` set formats.
- The battle HUD top bar shows the live set score for all player slots.
- `Enter` from results advances to the next round until a player wins the set, then starts a fresh set with the same rules.

## Deterministic Test Hooks

- `window.render_game_to_text()` returns JSON state snapshot.
- `window.advanceTime(ms)` steps simulation deterministically by fixed ticks.
- `window.export_replay_json()` exports seed + input-frame replay JSON for bug repros.
- `window.import_replay_json(payload)` imports replay JSON and starts a replay run (or queues it until battle scene is active).
