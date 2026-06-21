/**
 * PhysicsConfig — every tunable number for the drift model lives here.
 *
 * UNITS: the model is "acceleration-normalized". Distances/velocities are in
 * pixels and px/s. Forces are expressed directly as accelerations (px/s^2) at a
 * reference `mass` of 1.0, so at mass=1 a `enginePower` of 760 means "760 px/s^2
 * of forward push at full throttle". `mass` is a relative feel multiplier around
 * 1.0: it slows longitudinal acceleration and yaw response without touching raw
 * tire grip, which is exactly the knob a tuner wants ("make it feel heavier").
 *
 * Nothing in core/ hardcodes a physics number — it all flows from one of these
 * objects, picked from PHYSICS_PRESETS and (optionally) live-edited via the dev
 * Tweakpane panel.
 */
export interface PhysicsConfig {
  // ── mass & geometry ──────────────────────────────────────────────────────
  /** Relative inertia multiplier (~1.0 = stock). Higher = heavier, lazier. */
  mass: number;
  /** Yaw responsiveness multiplier (~1.0). Lower = the car rotates/snaps faster.
   *  Scaled internally by a geometry-derived reference inertia, so this stays
   *  a small, intuitive number regardless of the wheelbase. */
  yawInertia: number;
  /** Distance between front and rear axles (px). Sets the wheelbase look/feel. */
  wheelBase: number;
  /** CG → front axle distance (px). With cgToRear, sets weight bias geometry. */
  cgToFront: number;
  /** CG → rear axle distance (px). */
  cgToRear: number;
  /** Static front load fraction (0..1). 0.5 = balanced; <0.5 = rear-heavy. */
  weightBalance: number;
  /** CG height proxy — scales how violently accel/brake shifts weight. */
  cgHeight: number;

  // ── engine & longitudinal ────────────────────────────────────────────────
  /** Forward acceleration at full throttle (px/s^2, at mass 1). */
  enginePower: number;
  /** Reverse acceleration (px/s^2). */
  reversePower: number;
  /** Foot-brake deceleration (px/s^2). */
  brakeStrength: number;
  /** Soft top speed (px/s); drag is balanced against engine to land near here. */
  topSpeed: number;
  /** Quadratic aero drag coefficient (per (px/s)^2). */
  dragCoef: number;
  /** Linear rolling resistance (per px/s). */
  rollResist: number;
  /** Engine-braking deceleration when off throttle (px/s^2). */
  idleDecel: number;

  // ── steering ─────────────────────────────────────────────────────────────
  /** Max front-wheel steer angle (radians). */
  maxSteer: number;
  /** How fast the steer angle chases the input target (per second). */
  steerRate: number;
  /** How fast steer returns to center when input released (per second). */
  steerReturnRate: number;
  /** Fraction of steer authority removed at top speed (0..1) — calms twitch. */
  steerSpeedReduction: number;

  // ── tires / grip ─────────────────────────────────────────────────────────
  /** Master lateral-grip multiplier applied to both axles. */
  baseGrip: number;
  /** Peak lateral acceleration the FRONT axle can generate (px/s^2). */
  frontGripMax: number;
  /** Peak lateral acceleration the REAR axle can generate (px/s^2). */
  rearGripMax: number;
  /** Front tire stiffness (Pacejka B) — how sharply grip ramps with slip. */
  tireStiffnessFront: number;
  /** Rear tire stiffness (Pacejka B). */
  tireStiffnessRear: number;
  /** Tire curve shape (Pacejka C, ~1.3–1.6): how much grip FALLS OFF past the
   *  peak. Higher = the tire gives up more in a slide → drifts hold longer. */
  tireShape: number;
  /** Grip lost at high speed (0..1 fraction at topSpeed). */
  gripSpeedFalloff: number;
  /** How strongly axle load scales its grip (0 = load-independent, 1 = linear). */
  loadSensitivity: number;

  // ── weight transfer ──────────────────────────────────────────────────────
  /** Longitudinal accel → load-shift gain. Braking loads the front, throttle the rear. */
  weightTransferGain: number;
  /** Smoothing rate of the load shift toward its target (per second). */
  weightTransferRate: number;
  /** Max load fraction that can shift off the static balance (0..0.5). */
  maxWeightTransfer: number;

  // ── handbrake & drift aids ───────────────────────────────────────────────
  /** Rear grip multiplier while the handbrake is held (low = tail breaks free). */
  handbrakeGripMult: number;
  /** Extra rear longitudinal deceleration from the handbrake (px/s^2). */
  handbrakeForce: number;
  /** Power oversteer (friction-circle proxy): fraction of rear lateral grip
   *  REMOVED at full throttle. The rear spins up under power and keeps sliding,
   *  so you hold a drift on the gas and lift to straighten. 0 = none, 1 = full. */
  throttleSteerHold: number;
  /** Floor on the rear grip multiplier after power/handbrake loosening, so the
   *  rear never fully vanishes (which would make it un-catchable). */
  minRearGrip: number;
  /** Snap-back: straightening the wheel mid-slide boosts front grip (0..1). */
  straightenGripBoost: number;
  /** Counter-steer assist (0..1): how strongly the car auto-points its front
   *  wheels along the travel direction when sliding. This is what makes a drift
   *  HOLDABLE — it zeroes front slip so the car pivots at a steady angle instead
   *  of spinning or gripping back; you steer to tighten/open and to transition.
   *  0 = raw/unassisted (twitchy), ~0.8 = forgiving arcade drift. */
  driftAssist: number;

  // ── stability ────────────────────────────────────────────────────────────
  /** Yaw-rate damping (per second) — kills oscillation/spin-out jitter. */
  yawDamp: number;
  /** Below this speed (px/s) lateral velocity is bled off to stop low-speed jitter. */
  lowSpeedThreshold: number;
  /** Hard ceiling on speed (px/s). */
  velocityClamp: number;
  /** Hard ceiling on yaw rate (rad/s). */
  maxAngularVelocity: number;

  // ── drift detection (physics readouts the scoring mode reads) ────────────
  /** Body slip angle (rad) above which the car counts as "drifting". */
  driftSlipThreshold: number;
  /** Minimum speed (px/s) for a slide to count as a drift. */
  driftSpeedThreshold: number;
}

/** The arcade default — provokable, catchable, forgiving. The starting point. */
const arcade: PhysicsConfig = {
  mass: 1.0,
  yawInertia: 1.1,
  wheelBase: 48,
  cgToFront: 24,
  cgToRear: 24,
  weightBalance: 0.5,
  cgHeight: 18,

  enginePower: 760,
  reversePower: 360,
  brakeStrength: 1300,
  topSpeed: 540,
  dragCoef: 0.0026,
  rollResist: 0.9,
  idleDecel: 240,

  maxSteer: 0.62,
  steerRate: 6.5,
  steerReturnRate: 9.0,
  steerSpeedReduction: 0.55,

  baseGrip: 1.0,
  frontGripMax: 1150,
  rearGripMax: 1080,
  tireStiffnessFront: 6.0,
  tireStiffnessRear: 5.0,
  tireShape: 1.45,
  gripSpeedFalloff: 0.12,
  loadSensitivity: 0.7,

  weightTransferGain: 0.35,
  weightTransferRate: 9.0,
  maxWeightTransfer: 0.32,

  handbrakeGripMult: 0.28,
  handbrakeForce: 520,
  throttleSteerHold: 0.25,
  minRearGrip: 0.3,
  straightenGripBoost: 0.25,
  driftAssist: 0.5,

  yawDamp: 2.6,
  lowSpeedThreshold: 14,
  velocityClamp: 640,
  maxAngularVelocity: 7.0,

  driftSlipThreshold: 0.18,
  driftSpeedThreshold: 90,
};

/** Grippy: planted GT feel. Harder to break loose, snaps back quickly. */
const grippy: PhysicsConfig = {
  ...arcade,
  frontGripMax: 1450,
  rearGripMax: 1420,
  tireStiffnessFront: 7.5,
  tireStiffnessRear: 7.0,
  handbrakeGripMult: 0.4,
  weightTransferGain: 0.28,
  straightenGripBoost: 0.35,
  driftSlipThreshold: 0.22,
};

/** Loose: tail-happy hooligan. Low rear grip, easy to swing and to spin. */
const loose: PhysicsConfig = {
  ...arcade,
  rearGripMax: 880,
  tireStiffnessRear: 4.0,
  handbrakeGripMult: 0.18,
  throttleSteerHold: 0.32,
  weightTransferGain: 0.45,
  yawDamp: 2.1,
  driftSlipThreshold: 0.15,
};

/**
 * Drift: tuned for a SUSTAINED, STEERABLE slide — the headline feel. The
 * falloff tire (high `tireShape`) is the key: the rear gives up grip the more it
 * slides, so once it steps out it KEEPS sliding instead of snapping back, and
 * you hold the angle with counter-steer + throttle.
 *   • tail-happy rear (low peak grip) that lets go and stays out,
 *   • strong, biting front for counter-steer authority,
 *   • throttle-on hold so power sustains the slide,
 *   • moderate yaw damping — catchable, but not so stiff it grips back,
 *   • almost no auto-straighten, so the car keeps its angle until YOU correct it,
 *   • light drag + strong engine so the drift doesn't bleed speed and die.
 */
const drift: PhysicsConfig = {
  ...arcade,
  yawInertia: 1.15,

  enginePower: 880,
  brakeStrength: 1200,
  topSpeed: 560,
  dragCoef: 0.0019,
  rollResist: 0.2, // lighter rolling resistance so the car carries momentum
  idleDecel: 45, // gentle off-throttle engine braking — the car coasts, drifts hold

  maxSteer: 0.6, // gentler max lock so steering nudges the drift, not grip-snaps it
  steerRate: 5.5, // smoother onset — no instant bite
  steerReturnRate: 6.0,
  steerSpeedReduction: 0.6, // steering tapers at speed so it can't turn too sharp mid-drift

  frontGripMax: 1320,
  rearGripMax: 860, // looser than stock so the tail steps out and stays out
  tireStiffnessFront: 6.2,
  tireStiffnessRear: 6.4, // peak grip fairly early, then into the falloff
  tireShape: 1.6, // falloff so the rear gives up grip in a slide
  gripSpeedFalloff: 0.08,
  loadSensitivity: 0.55,

  weightTransferGain: 0.42,
  maxWeightTransfer: 0.34,

  handbrakeGripMult: 0.32,
  handbrakeForce: 460,
  throttleSteerHold: 0.42, // power loosens the rear → hold the drift on the gas
  minRearGrip: 0.3,
  straightenGripBoost: 0.05,
  driftAssist: 0.7, // forgiving auto counter-steer so the slide is holdable

  // generous yaw damping keeps the loose tail catchable instead of snapping round
  yawDamp: 3.8,
  velocityClamp: 660,
  maxAngularVelocity: 5.0,

  driftSlipThreshold: 0.14,
  driftSpeedThreshold: 85,
};

export const PHYSICS_PRESETS = { arcade, grippy, loose, drift } as const;
export type PhysicsPresetName = keyof typeof PHYSICS_PRESETS;
// 'drift' is tuned for a long, controllable slide — the intended feel.
export const DEFAULT_PRESET: PhysicsPresetName = 'drift';

/** Returns a mutable copy of a preset (so the dev panel can edit it freely). */
export function clonePhysics(name: PhysicsPresetName): PhysicsConfig {
  return { ...PHYSICS_PRESETS[name] };
}
