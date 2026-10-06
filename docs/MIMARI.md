# Mimari — İstanbul'un Fethi (engineering guide)

> Game design: `docs/TASARIM.md` (Turkish). This file is the engineering contract every
> contributor (human or agent) follows. Code & comments in English; **all player-facing
> text in Turkish** (correct diacritics: ç ğ ı İ ö ş ü).

## Stack & commands

- **Vite + TypeScript + Phaser 3.90 (WebGL)** for the map; **Preact** DOM overlay for UI.
  Steam later via Electron (same build).
- `npm run typecheck` · `npx vitest run` · `npm run build`
- Screenshots (headless Chromium/SwiftShader):
  `npx vite build --outDir <dir> && node scripts/shoot.mjs --dist <dir> --scenario bombardiman --ui 0 --zoom 3 --wait 3000 --size 1280x720 --out <dir>/shots`
  Scenarios: `yeni-oyun hisar-insaat kis-hazirlik kusatma-gun1 bombardiman gece-onarim deniz-savasi gemiler-karadan lagim kule son-hucum zafer yenilgi` (+ `title`).
  URL params: `?scenario=…&t=<dayFrac 0..1>&zoom=1..4&ui=0&speed=0..3&lm=<landmark id>`.
  Day fraction: 0 = dawn (05:00), 0.3 ≈ 12:00, 0.6 ≈ 19:20 (dusk), 0.8 ≈ 00:10 (night).
  Debug in page: `window.__game.tick(n)`, `__game.setDayFrac(f)`, `__game.store`.

## Folder ownership

| Path | Owner |
|---|---|
| `src/core/*`, `src/game/*`, `src/art/*`, `src/data/*`, `scripts/*` | core (contract — see edit policy) |
| `src/features/<id>/**` | that feature |
| `src/ui/hud/**` | ui-hud |
| `src/ui/screens/**`, `src/ui/App.tsx`, `src/styles/**` | ui-screens |
| `tests/<feature>*.test.ts` | that feature |

**Edit policy for shared contract files:** you may APPEND new entries to
`src/core/bus.ts` (GameEvents) and `src/core/flags.ts` (FLAG) inside a comment block
naming your feature. Re-Read the file immediately before an Edit (others edit too).
Never rename/remove existing entries. Do not edit `core/state.ts`, `core/defs.ts`,
`core/feature.ts`, `game/*` — keep extra data in your feature's private state
(`featureState(state, id, init)`) and extra def fields in your own types.
Cross-feature APIs live in `src/features/<id>/api.ts`; signatures there are contracts.

## Architecture

- **GameState** (`core/state.ts`) is the single JSON-serializable truth. Shared entities:
  sections (walls), groups, cannons, ships, mines, buildings, resources, morale, divan,
  galata, relief, byz, flags, events, log, stats, outcome. Private per-feature state in
  `state.features[id]`.
- **Simulation** (`game/Simulation.ts`): fixed step `SIM_STEP = 0.1` sim-seconds.
  `ctx.dtSec` for movement/animation pacing, `ctx.dtDays` for economy/calendar.
  Time scale: hazırlık 1 week ≈ 60 s, kuşatma 1 day ≈ 180 s (at 1×). Core owns time,
  phase transitions (`yola-cik` → march 13 days → kuşatma), outcome → end screen.
- **Determinism:** sim code uses `ctx.rng` only (never `Math.random`). Render may use Math.random.
- **Commands** (`core/commands.ts`): UI → sim. Feature-specific: `{t:'ozel', feature, action, payload}`.
- **Bus** (`core/bus.ts`): sim → render/audio/UI notifications. Listeners never mutate state.
  The bus is recreated on every scene restart; register listeners in `createRender`.
- **Feature hooks** (`core/feature.ts`): `generateTextures`, `initState`, `simTick`,
  `handleCommand`, `createRender`, `updateRender`, `applyScenario`.
- **Render rules:** render state is rebuilt on each `createRender` (scene restarts on new
  game) — keep render objects in closures/instances created there, never module globals.
  Sync sprites from state by entity id every frame (create/update/destroy). Never mutate
  state in render. Cull: only create/animate sprites near the camera `worldView`.
- **Depth:** `core/layers.ts`. Ground-standing objects: `setDepth(footWorldY)`.
- **Coordinates:** tiles (tx east, ty south; north = screen up-right). `world.toWorld(tx,ty)`
  gives the tile CENTER in world pixels (height-aware). `data/landmarks.ts` +
  `data/geography.ts` hold real coordinates; use `landmarkTile(id)`.
- **FX** (`core/fx.ts`): call `rc.fx.*` with world-pixel coordinates (atmosphere implements).
- **Picking/orders:** `rc.addPickable({pick, pickRect})`, `rc.addOrderHandler(fn)`.
  Selection lives in `store.ui.selection`. Placement mode `store.ui.placement`.

## Art direction ("Sea of Stars"-level pixel art, isometric)

- 2:1 isometric, tile 32×16, height step 4 px. Pixel-perfect: integer zoom only, no
  rotation/scaling of sprites, no anti-aliasing, `PixelCanvas` for all art.
- **Palette:** `art/palette.ts` only. Ramps are hue-shifted (cool shadows, warm lights).
- **Light from the upper-left** for every sprite: left faces lit, right faces shaded,
  tops brightest; cast shadows fall to the lower-right (soft, 1-step darker, dithered edge).
- Outlines: characters/props get a selective dark outline (`P.outline`), terrain none.
- Readable silhouettes at zoom 1; detail rewards zoom 3–4.
- **Life everywhere:** flags flutter, smoke rises, water shimmers, people walk, birds
  fly. Static = dead. Every sprite that can animate should (2–8 frames, 6–12 fps).
- Scale guide: soldier 7×13 px (frame 16×20), tent 16–24 px, outer wall 10–14 px tall,
  inner wall 18–24 px, wall towers 28–40 px, Galata Tower ~56 px, Ayasofya dome ~60 px,
  kadırga ~56×28, Genoese carrack ~44×52, Şahi bombard barrel ~36 px.
- Historical accuracy: 1453 Ayasofya has **no minarets**; Galata Tower had a conical
  roof; Theodosian walls = limestone with **red brick bands**, double wall + moat;
  Blachernae section single wall. Ottoman banners: red, white, green (no crescent-star
  national flag — that is later). Byzantine Palaiologan flag: gold double-headed eagle on
  red, or red cross with four B's on gold. Genoa: red cross on white. Venice: lion of
  St Mark (gold on red).

## Performance budget

60 fps at 1920×1080, zoom 1, during a full assault. Pool sprites & particles; cap
particle counts; bake static things into textures; avoid per-frame allocations in hot loops.

## Testing

- Pure sim logic gets vitest tests in `tests/<feature>.test.ts` (no Phaser imports in
  sim/data files — keep Phaser in `render*.ts` / `art*.ts` files).
- Visual work must be checked with screenshots (Read the PNGs!) before finishing.
