/**
 * Survival tuning. Energy constantly drains; drifting refills it; contact hurts.
 * When it hits zero the run ends. Score is time survived.
 */
export interface SurvivalConfig {
  maxEnergy: number;
  /** Passive drain per second. */
  drainPerSec: number;
  /** Energy gained per second at reference slip × speed while drifting. */
  refillPerSec: number;
  /** Energy lost on a hard crash. */
  crashPenalty: number;
  /** Energy lost on a wall scrape. */
  wallPenalty: number;
  slipRef: number;
  speedRef: number;
  bestStorageKey: string;
}

export const SURVIVAL: SurvivalConfig = {
  maxEnergy: 100,
  drainPerSec: 11,
  refillPerSec: 30,
  crashPenalty: 32,
  wallPenalty: 12,
  slipRef: 0.6,
  speedRef: 400,
  bestStorageKey: 'nightslide:best-survival',
};
