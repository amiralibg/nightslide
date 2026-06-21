# NIGHTSLIDE — Gamification & Progression (design)

> **Status: design only.** Nothing here is built yet. This is the agreed plan for a
> progression layer, written so it can be implemented incrementally without
> touching `core/` and without breaking the mode/HUD contract.

## Goal

Give the player a reason to keep coming back: every run pays out, the payout
unlocks cars and maps, and lightweight challenges point at things worth trying.
Keep it honest and skill-driven — progression *surfaces* the game's depth (cars,
maps, modes), it doesn't gate the fun behind a grind.

## Design principles

- **One run, one reward.** Every completed run grants XP + credits, scaled by how
  well you drove. No empty runs.
- **Unlocks are content you already have.** We gate the existing cars/maps, not
  pay-to-win stats. The default car (Nightviper) and map (Drift Arena) are always
  unlocked so a new player can play immediately.
- **Additive to the architecture.** Progression is a `shell`-side concern. It reads
  the things the game already emits (`GAME_EVENTS.results`, `GAME_EVENTS.carEvent`)
  and persists to `localStorage`. `core/` and the modes do not change.

## Data model (persisted to `localStorage`)

A single versioned profile blob, owned by a new `src/progress/` module:

```ts
interface Profile {
  version: 1;
  xp: number;            // lifetime XP → drives level
  credits: number;       // spendable soft currency
  unlocked: {            // ids unlocked beyond the always-free defaults
    cars: string[];
    arenas: string[];
  };
  bests: Record<string, number>;   // key `${modeId}:${arenaId}` → best score / -time
  lifetime: {
    runs: number;
    totalDriftScore: number;
    longestComboX: number;
    distanceM: number;
  };
  challenges: ChallengeState;       // see below
  achievements: string[];           // earned achievement ids
}
```

- `level` is derived from `xp` (pure function, not stored): e.g.
  `level = floor( (sqrt(1 + 8*xp/BASE) - 1) / 2 )` — a gentle quadratic curve.
- Storage key `nightslide:profile`. Keep the existing `nightslide:best*` keys
  working by migrating them into `bests` on first load.
- One module, two responsibilities: `ProfileStore` (load/save/migrate) and
  `Progression` (pure rules: payouts, level curve, unlock checks).

## Earning loop

On `GAME_EVENTS.results` the shell computes a payout from the `ResultsModel` the
mode already produces:

- **XP** = base + performance bonus (score-based for scoring modes; time-based for
  Time Trial; style for Gymkhana; survival time for Survival). Normalise per mode so
  no single mode dominates.
- **Credits** ≈ XP × a small factor, with a *first-clear* and *new-best* bonus.
- Show the payout **on the results screen** (animated count-up reusing the GSAP
  patterns already in `shell/Hud.ts`): `+XP`, `+credits`, and any level-up /
  unlock toast.

## Unlocks

- Each `CarModel` / `ArenaConfig` gets an optional `unlock?: { level?: number;
  credits?: number }` (additive config field; absent = always free).
- The **garage** and **map picker** (already built in `shell/screens.ts`) render
  locked chips dimmed with the requirement ("Lv 4" / "1,200 cr") and a lock glyph;
  clicking a buyable locked chip spends credits, an unaffordable one nudges.
- Default car + default map have no `unlock` → always available.

## Challenges (daily / weekly)

- A small pool of declarative objectives evaluated from data the game already
  emits — e.g. "bank a ×10 combo" (combo from the scoring HUD model / car events),
  "clear Speedway under N s" (Time Trial result), "land 3 360s in one run"
  (`carEvent` spins). Each has a `reward` in XP/credits.
- `ChallengeState` tracks the active set + completion + a roll timestamp; reroll
  daily/weekly on load. Evaluation hooks the same `results`/`carEvent` listeners.

## Achievements / mastery

- Per-car and per-map milestones (e.g. "Brute: bank 100k in one run",
  "Speedway: sub-30s lap"). Pure derived checks against `lifetime` + `bests`; award
  ids into `achievements`. Surface as a grid in the profile panel.

## Progress UI

- A **Profile / Garage** panel built with the existing shell screen + GSAP
  transition system: level bar (XP to next), credit balance, next unlock, active
  challenges, achievement grid.
- Reachable from the landing or mode-select header. Reuses `ui.ts` button/cursor
  patterns; locked-state styling added to the existing `.car-chip` / `.map-chip`.

## Integration points that already exist

| Need | Existing hook |
| --- | --- |
| Run payout input | `GAME_EVENTS.results` → `ResultsModel` |
| Challenge/achievement signals | `GAME_EVENTS.carEvent` (drift/switchback/360/near-miss/crash), `GAME_EVENTS.hud` combo |
| Car / map selection | garage + map strips in `shell/screens.ts`, `Nav.selectCar/selectArena` |
| Persistence precedent | modes already persist bests to `localStorage` |

**No `core/` changes. No mode changes.** Modes keep emitting the same declarative
models; progression is a pure consumer + a few additive config fields.

## Suggested build order

1. `ProfileStore` + `Progression` module + `localStorage` migration of existing bests. (no UI)
2. Results-screen payout + level-up/unlock toast (XP/credits visible).
3. `unlock` config field + locked-chip rendering in garage/map picker + spend flow.
4. Profile/Garage panel (level bar, credits, next unlock).
5. Challenges, then achievements.

## Open questions (to tune during build)

- XP/credit curve + per-mode normalisation (needs playtesting).
- Unlock costs / order (which car/map first).
- Daily vs weekly cadence; offline reroll handling.
