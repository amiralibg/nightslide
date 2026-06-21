# NIGHTSLIDE

A top-down 2D pixel-art drift game with a sim-influenced handling model. The
launch mode is a **Drift Scoring Arena** (chain drifts → combo multiplier → high
score); the codebase is architected so additional modes (Time Trial, Gymkhana,
Survival) drop in as isolated plug-ins without touching the physics or rendering
core.

Two visual layers, kept deliberately distinct:

- **Game canvas** — crisp top-down pixel art (nearest-neighbour scaling, no
  blur) with in-game juice: tire marks, smoke, speed lines, screen shake.
- **Site shell** — a premium DOM layer around the canvas (landing, mode select,
  HUD, pause/results, transitions). Retro game / ultra-modern shell is the
  intended contrast. Art direction: **midnight street / wet asphalt** — sodium
  amber as the primary light (street lamps, drift glow, score), a teal/ice
  secondary for speed, and electric steel-blue UI accents over neutral charcoal
  surfaces and reflective tarmac. One palette, [`palette.ts`](src/config/palette.ts)
  (token keys kept for compatibility, values repointed), mirrored into the
  shell's CSS `:root`, so the two layers never drift apart.

## Stack

- **Vite 8** + **TypeScript 6** (strict)
- **Phaser 4.1** (WebGL/Beam renderer) for the game canvas
- **GSAP** for shell/UI motion (Phase 4)
- **Howler.js** for sound (Phase 2+)
- **Tweakpane** for the dev-only physics tuning panel (stripped from prod builds)

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

### Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle / Brake-Reverse | `W` / `S` (or ↑/↓) | RT / LT |
| Steer | `A` / `D` (or ←/→) | Left stick |
| Handbrake | `Space` | A |
| Reset car | `T` | — |
| Toggle dev tuning panel | `` ` `` (backquote) | — |
| Pause | `Esc` / `P` | Start |

The dev tuning panel (Tweakpane, dev builds only) exposes **every** physics
constant live, plus telemetry (speed, slip angle, drift state, axle loads, tire
saturation) and the named presets (`arcade`, `grippy`, `loose`).

## Architecture — the mode system (for future-me)

Everything shared lives in `src/core/` (physics, car, input, events — and later
camera/fx/audio/arena). Each game mode is an **isolated plug-in** under
`src/modes/` that implements one interface, [`GameMode`](src/modes/GameMode.ts).

The **dependency rule is one-directional**: `modes → core → config`, and
`shell`/`game` wire them together. **`core/` never imports from `modes/` or
`shell/`.** The game scene ([`GameScene`](src/game/scenes/GameScene.ts)) is
*mode-agnostic*: it owns the car, physics, camera and FX, then drives whatever
`GameMode` it was handed — talking to it only through the interface. A mode
consumes read-only car state + car events and emits declarative **HUD/results
models**; the shell renders whatever the active mode's HUD model describes.

**To add a mode later** (e.g. Time Trial): write one new file under `src/modes/`
that implements `GameMode`, then register it in
[`ModeLoader`](src/game/ModeLoader.ts) and add a mode-select entry. Nothing in
`core/` changes. That's the whole point.

```
src/
  config/   # all tunable constants: physics presets, palette, runtime, scoring
  core/
    physics/  # engine-agnostic drift math (TireModel + DriftModel integrator)
    car/      # CarController — runs the model, exposes state, emits car events
    input/    # InputManager — action-mapped keyboard + gamepad + (stub) touch
    events/   # CarEvent union (driftStart/End, switchback, spin, crash…)
    arena/    # Arena (data-driven playfield) + CollisionSystem (circle-vs-AABB)
    camera/   # CameraDirector — follow, look-ahead, drift + impact shake
    fx/       # TireMarks (pooled, fading), Smoke, SpeedLines
    audio/    # AudioManager — procedural engine/screech/impact + global mute
  modes/
    GameMode.ts   # the contract every mode implements + HUD/Results models
    NoopMode.ts   # the Phase 0/1 "Free Drive" sandbox
    scoring/      # DriftScoringArena (Phase 3)
  game/     # Phaser bootstrap, mode-agnostic scene, mode loader, event bus
  shell/    # DOM UI: HUD now; landing/mode-select/results + transitions (Phase 4)
  debug/    # dev-only Tweakpane tuning panel (dynamic-imported, dev-gated)
  main.ts
```

## The drift model

A custom arcade model with a slip/grip tire layer (not off-the-shelf rigid-body
physics — Matter/Arcade are reserved for world collisions later). It's a
simplified **bicycle model**: velocity is split into forward/lateral components,
each axle computes a **slip angle**, and a `tanh` tire curve turns slip into
lateral force that saturates at a grip limit — that saturation *is* the slide.
**Weight transfer** shifts grip front/rear under brake/throttle, the **handbrake**
breaks the rear axle loose, **counter-steer** emerges naturally from the front
slip angle, and **throttle-on-exit** holds the slide. All of it is driven by the
single [`PhysicsConfig`](src/config/physics.ts) object. See the heavily-commented
[`DriftModel`](src/core/physics/DriftModel.ts) for the math.

## Status

- **Phase 0 — Scaffold:** done. Vite+TS strict, Phaser 4 boot, folder structure,
  `GameMode` contract + sandbox stub, Tweakpane wired and dev-gated.
- **Phase 1 — Feel:** done. Car + custom drift physics + full tuning panel. The
  tire model is a Pacejka-style **peak-then-falloff** curve, with a friction-circle
  **power-oversteer** (throttle loosens the rear) and a **counter-steer assist**
  that points the wheels along travel so a slide holds at a steady angle — you can
  hold a drift and run figure-eights. Default feel is the `drift` preset.
- **Phase 2 — World & juice:** done. Data-driven arena (asphalt floor, neon
  perimeter, pillars + barriers), circle-vs-AABB collisions with crash/scrape
  events, drift-aware camera (look-ahead + drift/impact shake), pooled fading tire
  marks, slip-scaled smoke, screen-space speed lines, and procedural engine /
  screech / impact audio with a global mute.
- **Phase 3 — Drift Scoring Arena:** done. `DriftScoringArena` against the
  `GameMode` contract: continuous slip×speed scoring, a climbing combo multiplier,
  grace-window banking, crash/scrape chain breaks, switchback / 360 / near-miss
  bonuses, and big-bank juice (slow-mo + shake). Animated HUD (GSAP score-roll +
  multiplier punch + draining combo bar) and floating score pop-ups, all rendered
  from the mode's declarative HUD model + juice cues. Session best persists.
- **Phase 4 — Awwwards shell:** done. Intro reveal (not a spinner), landing,
  mode select with the future modes as "coming soon" cards, in-run HUD, pause +
  results screens, GSAP transitions between every screen, a custom cursor with
  hover micro-interactions, synthesised UI sound, and an attract-mode living
  background (the car drifts behind the menus). The scene runs a small
  attract/running/paused state machine driven entirely by shell→game commands on
  the bus.
- **Visual pass:** glossy top-down "Hot Wheels" cars drawn procedurally
  ([CarArt.ts](src/game/CarArt.ts)) from a [roster](src/config/cars.ts) of 4
  models (distinct silhouettes + liveries), each baked to a LINEAR-filtered
  texture so it reads smooth, not blocky — pick yours in the mode-select
  **Garage**. The arena uses grainy tarmac, stacked-tire pillars, hazard
  barriers, red/white racetrack curbs and car/prop shadows. Texture-key based, so
  AI-generated art can drop in later with no gameplay changes.
- **Per-car handling:** each car carries a `handling` profile over the `drift`
  base — Nightviper balanced, Voltbolt fast & planted, Brute heavy & tail-happy,
  Pip light & flickable — so they feel different, not just look different.
- **Four launch modes:** Drift Arena, Time Trial, Gymkhana (style through a gate
  course) and Survival (drift to keep your energy bar alive) — each a single
  `modes/` file, no `core/` changes.
- **Phase 5 — Polish & extensibility proof:** done. **Time Trial** added as a
  second mode — a single file ([`TimeTrial`](src/modes/timeTrial/TimeTrial.ts)) +
  a gate-course config + one `registerMode` line + flipping its mode-select card.
  **Zero changes to `core/`**: it reuses the generic `GameMode` contract (the
  `timer` HUD widget, `isComplete()`, and the `headline` results field), spawns
  its own gates, times the run and persists a best — proving a new mode is just
  one new file.
