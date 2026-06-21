import type { CarController, CarEvent } from '../core';
import type { PhysicsConfig, PhysicsPresetName } from '../config';

/**
 * Event names on the global game bus (`game.events`). This is the seam between
 * the Phaser game and the DOM shell / dev tools: the shell never reaches into
 * the scene, it just listens here.
 */
export const GAME_EVENTS = {
  /** Fired once when the GameScene is up; payload: {@link GameReadyPayload}. */
  ready: 'nightslide:ready',
  /** Per-frame HUD model from the active mode; payload: HUDModel. */
  hud: 'nightslide:hud',
  /** Per-frame car telemetry for the persistent driving instruments (speedo /
   *  drift gauge), independent of the active mode; payload: {@link TelemetryPayload}. */
  telemetry: 'nightslide:telemetry',
  /** A high-level car event; payload: CarEvent. */
  carEvent: 'nightslide:carEvent',
  /** Debug panel toggle requested; no payload. */
  toggleDebug: 'nightslide:toggleDebug',
  /** game → shell: the player hit pause in-run; no payload. */
  pause: 'nightslide:pause',
  /** game → shell: run finished; payload: ResultsModel. */
  results: 'nightslide:results',
  /** mode → scene/shell: a presentation cue; payload: JuiceCue. */
  juice: 'nightslide:juice',

  // ── shell → game commands ──────────────────────────────────────────────────
  /** Start/replay a mode; payload: { modeId }. */
  cmdStart: 'nightslide:cmd:start',
  /** Resume a paused run. */
  cmdResume: 'nightslide:cmd:resume',
  /** Restart the current mode from scratch. */
  cmdRestart: 'nightslide:cmd:restart',
  /** End the run now and surface results. */
  cmdEndRun: 'nightslide:cmd:endRun',
  /** Drop back to the menu/attract background (no results). */
  cmdToMenu: 'nightslide:cmd:toMenu',
  /** Live-load an arena for the attract/menu background; payload: { arenaId }. */
  cmdSelectArena: 'nightslide:cmd:selectArena',
  /** On-screen touch controls → game: continuous drive intent; payload: Partial<DriveActions>. */
  cmdTouchDrive: 'nightslide:cmd:touchDrive',
  /** On-screen touch controls → game: a discrete action (e.g. pause); payload: DiscreteAction. */
  cmdTouchAction: 'nightslide:cmd:touchAction',
  /** shell → game: play a UI sfx; payload: UiSoundName. */
  uiSound: 'nightslide:ui:sound',
} as const;

/** UI sound effects the shell can request (synthesised by the AudioManager). */
export type UiSoundName = 'hover' | 'confirm' | 'back' | 'whoosh';

/** Payload for {@link GAME_EVENTS.cmdStart}. */
export interface StartCommand {
  modeId: string;
  /** Optional car model id to switch to before the run. */
  carId?: string;
  /** Optional arena/map id to load before the run. */
  arenaId?: string;
}

/** Per-frame driving telemetry for the persistent HUD instruments. Emitted by the
 *  scene from the car state every frame so the speedometer/drift gauge work in any
 *  mode without touching the mode/HUD contract. */
export interface TelemetryPayload {
  /** Speed as a fraction of the current car's top speed (0..1). */
  speed01: number;
  /** Display speed (faux km/h), already rounded. */
  speedKmh: number;
  /** Rear-axle slip saturation (0..1) — how hard the car is sliding. */
  slip01: number;
  /** Whether the car is currently in a scored drift. */
  drifting: boolean;
}

/** Handed to the shell / dev panel when the game is ready to wire up. */
export interface GameReadyPayload {
  /** The live, mutable physics config (dev panel edits this in place). */
  config: PhysicsConfig;
  /** The car controller (for telemetry readouts). */
  car: CarController;
  /** Copy a named preset into the live config object (keeps the reference). */
  applyPreset: (name: PhysicsPresetName) => void;
}

// Re-export the model types the shell consumes, so it imports from one place.
export type { HUDModel, HUDWidget, ResultsModel, JuiceCue } from '../modes';
export type { DriveActions, DiscreteAction } from '../core';
export type { CarEvent };
