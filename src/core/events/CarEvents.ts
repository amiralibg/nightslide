/**
 * CarEvent — the discriminated union of things a car can do that a GameMode
 * might care about. The CarController emits these; modes react to them in
 * `onCarEvent`. New event kinds are additive: add a variant here, handle it in
 * the modes that care, ignore it everywhere else.
 */

export type CarEvent =
  | { type: 'driftStart'; direction: -1 | 1; speed: number; slipAngle: number; time: number }
  | { type: 'driftEnd'; durationMs: number; peakSlipDeg: number; time: number }
  | { type: 'switchback'; time: number } // slide flipped left↔right without dropping
  | { type: 'spin'; time: number } // accumulated a full 360° of rotation
  | { type: 'nearMiss'; gap: number; time: number } // skimmed a wall/prop without touching
  | { type: 'wallContact'; impactSpeed: number; time: number } // glancing scrape
  | { type: 'crash'; impactSpeed: number; time: number }; // hard hit that breaks the chain

export type CarEventType = CarEvent['type'];

/** A function that receives car events (a mode's `onCarEvent`, the FX bus, etc.). */
export type CarEventSink = (event: CarEvent) => void;
