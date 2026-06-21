/**
 * Tunable constants for the presentation layers — camera feel, in-game FX, and
 * audio mix. Kept out of physics so feel-of-motion and feel-of-handling tune
 * independently. Nothing here affects the simulation.
 */

export const CAMERA = {
  /** Follow lerp (0..1 per frame-ish); lower = floatier, smoother. */
  followLerp: 0.12,
  /** Max look-ahead offset (px) in the travel direction at top speed. */
  lookAhead: 90,
  /** Camera zoom at rest and the fraction pulled back at top speed. With a
   *  full-window RESIZE canvas, this is what keeps the pixels chunky and the car
   *  a readable size; the visible arena slice grows/shrinks with the window. */
  baseZoom: 2.0,
  speedZoomOut: 0.08, // zoom fraction removed at top speed (0 = none)
  /** Continuous drift shake at full slip+speed (Phaser shake intensity units). */
  maxDriftShake: 0.0035,
  /** Slip (rad) treated as "full" drift shake. */
  driftShakeSlipRef: 0.8,
  /** Impulse shake on impacts: duration ms + intensity per (impact px/s). */
  impactShakeMs: 220,
  impactShakeScale: 0.00012,
  maxImpactShake: 0.016,
} as const;

export const FX = {
  // tire marks
  markMinSpeed: 50, // px/s below which no rubber is laid
  markBaseAlpha: 0.22,
  markSatAlpha: 0.4, // extra alpha scaled by rear-tire saturation
  markMaxAlpha: 0.6,
  markFadePerSec: 0.06, // global rubber fade rate (0 = permanent)

  // drift smoke
  smokeMinSpeed: 80,
  smokeSlipThreshold: 0.4, // rear saturation to start puffing
  smokeMaxPerFrame: 3,

  // speed lines (screen-space)
  speedLineThreshold: 0.55, // fraction of top speed to start streaking
  speedLineMaxPerFrame: 3,
  speedLinePool: 60,
} as const;

export const COLLISION = {
  /** Impact speed (px/s) above which a hit registers as a scrape (wallContact). */
  wallContactSpeed: 70,
  /** Impact speed (px/s) above which a hit registers as a crash (breaks combos). */
  crashSpeed: 240,
} as const;

export const AUDIO = {
  master: 0.6,
  /** Engine tone Hz at idle / at top speed (procedural oscillator). */
  engineIdleHz: 60,
  engineTopHz: 230,
  engineGain: 0.05,
  /** Tire screech (filtered noise) gain at full slip. */
  screechGain: 0.12,
  /** Impact thud gain per (impact px/s), clamped. */
  impactGain: 0.0008,
  maxImpactGain: 0.5,
} as const;
