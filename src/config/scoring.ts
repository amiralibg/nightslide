/**
 * ScoringConfig — every number the Drift Scoring Arena uses. Like physics, the
 * scoring rules are data so balance is reproducible and tunable in one place.
 *
 * Drift detection itself lives in PhysicsConfig (driftSlipThreshold /
 * driftSpeedThreshold) — the scoring mode reads `CarState.isDrifting`.
 */
export interface ScoringConfig {
  /** Base score per second at reference slip × speed (before the multiplier). */
  basePointsPerSec: number;
  /** Slip angle (rad) that counts as a "full" slip factor. */
  slipRef: number;
  /** Speed (px/s) that counts as a "full" speed factor. */
  speedRef: number;
  /** Slip/speed factors are clamped here (allow a little overdrive past 1). */
  maxFactor: number;

  /** Cumulative active-drift seconds needed to climb one multiplier step. */
  multiplierStepSec: number;
  /** Multiplier ceiling. */
  maxMultiplier: number;
  /** Straighten grace (ms) before an unbroken chain banks. */
  graceWindowMs: number;

  // bonuses (raw points added into the current chain)
  switchbackBonus: number;
  spinBonus: number;
  nearMissBonus: number;

  // near-miss detection
  /** Gap window (px, beyond the car radius) that counts as a near miss. */
  nearMissBand: number;
  /** Minimum speed (px/s) for a near miss to register. */
  nearMissSpeed: number;
  /** Debounce between near-miss awards (ms). */
  nearMissCooldownMs: number;

  // juice
  /** Banked amount that triggers the slow-mo / big-pop juice. */
  bigBankThreshold: number;
  slowmoScale: number;
  slowmoMs: number;

  /** localStorage key for the session/persistent best. */
  bestStorageKey: string;
}

export const SCORING: ScoringConfig = {
  basePointsPerSec: 120,
  slipRef: 0.7,
  speedRef: 420,
  maxFactor: 1.4,

  multiplierStepSec: 1.6,
  maxMultiplier: 10,
  graceWindowMs: 900,

  switchbackBonus: 250,
  spinBonus: 600,
  nearMissBonus: 180,

  nearMissBand: 34,
  nearMissSpeed: 160,
  nearMissCooldownMs: 320,

  bigBankThreshold: 3000,
  slowmoScale: 0.45,
  slowmoMs: 320,

  bestStorageKey: 'nightslide:best',
};
