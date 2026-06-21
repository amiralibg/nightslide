/**
 * Time Trial courses — an ordered list of gate centres the car must pass through,
 * PER ARENA (each map authors its own line). Pure data, like everything else in
 * config/. The circuit course is lap-based: the gates are checkpoints around the
 * loop and you run `laps` of them.
 */
export interface Gate {
  x: number;
  y: number;
}

export interface TimeTrialConfig {
  gates: Gate[];
  /** Pass radius (px) — within this of the next gate counts as crossing it. */
  gateRadius: number;
  /** Car must be moving faster than this (px/s) for the clock to start. */
  startSpeed: number;
  bestStorageKey: string;
  /** Number of laps of the gate loop (default 1 = run the sequence once). */
  laps?: number;
}

/** Parking Lot — a tight weave through the lanes between the parked rows. */
const parkingLot: TimeTrialConfig = {
  gates: [
    { x: 1000, y: 1180 },
    { x: 360, y: 880 },
    { x: 1640, y: 880 },
    { x: 1640, y: 520 },
    { x: 360, y: 520 },
    { x: 1000, y: 180 },
  ],
  gateRadius: 56,
  startSpeed: 25,
  bestStorageKey: 'nightslide:best-time-parking',
};

/** Grand Prix — checkpoints on the racing line; run 2 laps across start/finish. */
const circuit: TimeTrialConfig = {
  gates: [
    { x: 2150, y: 1500 },
    { x: 2540, y: 950 },
    { x: 2200, y: 400 },
    { x: 1300, y: 400 },
    { x: 520, y: 440 },
    { x: 340, y: 760 },
    { x: 700, y: 1520 }, // back across the start/finish line → lap complete
  ],
  gateRadius: 100, // = track half-width: drive the line through it
  startSpeed: 25,
  bestStorageKey: 'nightslide:best-time-circuit',
  laps: 2,
};

export const TIME_TRIAL_COURSES: Record<string, TimeTrialConfig> = {
  'parking-lot': parkingLot,
  circuit,
};

/** The Time Trial course for an arena (falls back to the parking lot). */
export function timeTrialCourse(arenaId: string): TimeTrialConfig {
  return TIME_TRIAL_COURSES[arenaId] ?? parkingLot;
}
