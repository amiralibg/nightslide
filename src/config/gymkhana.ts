/**
 * Gymkhana courses — a tight, technical gate run scored on STYLE (drift), PER
 * ARENA. The line you take matters as much as finishing. Each map authors its own
 * gate weave; the scoring params are shared.
 */
export interface GymGate {
  x: number;
  y: number;
}

export interface GymkhanaConfig {
  gates: GymGate[];
  gateRadius: number;
  startSpeed: number;
  /** Style points/sec at reference slip × speed. */
  basePointsPerSec: number;
  slipRef: number;
  speedRef: number;
  /** Cumulative drift seconds per +1 style multiplier. */
  multiplierStepSec: number;
  maxMultiplier: number;
  /** Flat bonus for clearing a gate (× current multiplier). */
  gateBonus: number;
  bestStorageKey: string;
}

const SCORING = {
  basePointsPerSec: 130,
  slipRef: 0.6,
  speedRef: 420,
  multiplierStepSec: 1.6,
  maxMultiplier: 8,
  gateBonus: 350,
};

/** Drift Arena — a figure-8-ish weave around the tire stacks at ~(700,596)/(1100,596). */
const driftArena: GymkhanaConfig = {
  gates: [
    { x: 900, y: 720 },
    { x: 560, y: 560 },
    { x: 900, y: 430 },
    { x: 1244, y: 560 },
    { x: 900, y: 720 },
    { x: 1240, y: 920 },
    { x: 560, y: 920 },
    { x: 900, y: 1010 },
  ],
  gateRadius: 72,
  startSpeed: 25,
  ...SCORING,
  bestStorageKey: 'nightslide:best-gymkhana-drift',
};

/** Parking Lot — slalom the lanes between the parked rows. */
const parkingLot: GymkhanaConfig = {
  gates: [
    { x: 1000, y: 1180 },
    { x: 400, y: 900 },
    { x: 1000, y: 880 },
    { x: 1600, y: 880 },
    { x: 1600, y: 520 },
    { x: 1000, y: 520 },
    { x: 400, y: 200 },
  ],
  gateRadius: 64,
  startSpeed: 25,
  ...SCORING,
  bestStorageKey: 'nightslide:best-gymkhana-parking',
};

export const GYMKHANA_COURSES: Record<string, GymkhanaConfig> = {
  'drift-arena': driftArena,
  'parking-lot': parkingLot,
};

/** The Gymkhana course for an arena (falls back to the Drift Arena). */
export function gymkhanaCourse(arenaId: string): GymkhanaConfig {
  return GYMKHANA_COURSES[arenaId] ?? driftArena;
}
