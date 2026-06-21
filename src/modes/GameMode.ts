import type Phaser from 'phaser';
import type { CarController, CarEvent, CarState } from '../core';

/**
 * GameMode — the contract every game mode implements. This is the hinge the
 * whole "add modes later" requirement turns on.
 *
 * The game scene is MODE-AGNOSTIC: it owns the car, physics, camera, FX and the
 * HUD surface, then hands a {@link ModeContext} to whatever mode is active. The
 * mode consumes car state + events and emits HUD/score/results MODELS. The shell
 * renders whatever the active mode's HUD model describes — it doesn't know which
 * mode is running either.
 *
 * Adding Time Trial / Gymkhana / Survival later means writing ONE new file that
 * implements this interface and registering it in the mode list. Nothing in
 * `core/` changes.
 */
export interface GameMode {
  /** Stable id (used in URLs/registry). */
  readonly id: string;
  /** Human-facing name for menus and results. */
  readonly displayName: string;

  // ── lifecycle ──────────────────────────────────────────────────────────────
  /** Set up objectives, spawn props, reset run state. Called once on entry. */
  onEnter(ctx: ModeContext): void;
  /** Tear down anything created in onEnter. */
  onExit(ctx: ModeContext): void;
  /** Per-frame rules. `dt` is seconds; `car` is the current read-only state. */
  update(dt: number, car: Readonly<CarState>, ctx: ModeContext): void;
  /** React to high-level car events (drift start/stop, switchback, crash…). */
  onCarEvent(event: CarEvent): void;

  // ── presentation ────────────────────────────────────────────────────────────
  /** The declarative HUD model for the shell to render this frame. */
  getHUD(): HUDModel;
  /** End-of-run summary for the results screen. */
  getResults(): ResultsModel;

  /** Win/lose/end condition. The scene shows results when this turns true. */
  isComplete(): boolean;
}

/**
 * What the scene hands every mode: the live car, the scene (for spawning mode
 * objects), and a typed event bus to the shell. Kept intentionally small — the
 * surface a mode is allowed to touch.
 */
export interface ModeContext {
  /** The Phaser scene, for spawning mode-specific objects (gates, props…). */
  scene: Phaser.Scene;
  /** The car under control (read state, subscribe to events, respawn). */
  car: CarController;
  /** Event bus the shell listens on (HUD updates, run lifecycle, juice cues). */
  bus: Phaser.Events.EventEmitter;
  /** Fire a presentation cue (score pop, slow-mo, shake). The scene + shell
   *  realise it so modes never touch the camera or DOM directly. */
  emitJuice: (cue: JuiceCue) => void;
  /** Monotonic run time in ms since the mode entered. */
  now: number;
  /** The id of the arena/map the run is on (so modes can pick a per-map course). */
  arenaId: string;
}

/**
 * Declarative presentation cue a mode can fire via {@link ModeContext.emitJuice}.
 * The scene handles motion/time cues (slow-mo, shake); the shell handles the
 * on-screen pops. Modes describe the feedback, they don't implement it.
 */
export type JuiceCue =
  | { kind: 'scorePopup'; amount: number; label?: string; tone?: 'normal' | 'big' | 'bonus' | 'bad' }
  | { kind: 'slowmo'; scale: number; ms: number }
  | { kind: 'shake'; intensity: number };

// ── declarative HUD model ─────────────────────────────────────────────────────
//
// Modes describe their HUD as a list of widgets; the shell switches on `kind` to
// render each. New modes reuse these widgets; a genuinely new readout is an
// additive change to the shell renderer, never a change to core or other modes.

export type HUDWidget =
  | { kind: 'score'; label: string; value: number }
  | { kind: 'multiplier'; value: number; timer01: number } // combo timer bar, 0..1
  | { kind: 'stat'; label: string; value: string; emphasis?: boolean }
  | { kind: 'timer'; label: string; ms: number }
  | { kind: 'gauge'; label: string; value01: number; tone?: 'good' | 'bad' } // labelled bar (e.g. survival energy)
  | { kind: 'banner'; text: string; tone?: 'good' | 'bad' | 'neutral' };

export interface HUDModel {
  widgets: HUDWidget[];
}

// ── declarative results model ─────────────────────────────────────────────────
export interface ResultsModel {
  title: string;
  /** Numeric headline (e.g. a score), rendered with thousands separators. */
  score?: number;
  /** Pre-formatted headline string (e.g. a lap time); takes precedence over `score`. */
  headline?: string;
  isNewBest?: boolean;
  stats: Array<{ label: string; value: string; highlight?: boolean }>;
}

/** Empty HUD helper for modes (or phases) that render nothing yet. */
export const EMPTY_HUD: HUDModel = { widgets: [] };
