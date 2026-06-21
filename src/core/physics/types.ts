/**
 * Engine-agnostic physics types. Nothing here imports Phaser — the drift model
 * is pure math so it can be unit-tested and reused regardless of renderer.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** The control inputs the physics step consumes (already normalized). */
export interface DriveInput {
  /** Throttle, 0..1. */
  throttle: number;
  /** Foot brake, 0..1. */
  brake: number;
  /** Steering, -1 (full left) .. +1 (full right). */
  steer: number;
  /** Handbrake engaged this step. */
  handbrake: boolean;
}

export const NEUTRAL_INPUT: DriveInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
};

/**
 * CarState — the full, read-only snapshot of the car after a physics step.
 * Modes, the camera, FX, audio and the HUD all read from this; none of them
 * mutate it. `slipAngle` is the headline value the drift scoring reads.
 */
export interface CarState {
  // pose
  x: number;
  y: number;
  /** Body heading (rad). Direction the chassis points, not necessarily travel. */
  heading: number;

  // motion (world space)
  velocityX: number;
  velocityY: number;
  /** Speed magnitude (px/s). */
  speed: number;
  /** Yaw rate (rad/s). */
  angularVelocity: number;

  // car-local velocity decomposition
  /** Forward velocity component (px/s); negative = reversing. */
  localVelLong: number;
  /** Lateral velocity component (px/s); sign = slide direction. */
  localVelLat: number;

  // the drift
  /** Body slip angle (rad): angle between heading and travel direction. */
  slipAngle: number;
  /** Same, in degrees, for HUD/debug convenience. */
  slipAngleDeg: number;
  /** -1 sliding left, +1 sliding right, 0 effectively straight. */
  driftDirection: -1 | 0 | 1;
  /** True while slip angle and speed exceed the drift thresholds. */
  isDrifting: boolean;

  // tire telemetry (0..1 each) — drives smoke/screech intensity in FX/audio
  frontSlipSaturation: number;
  rearSlipSaturation: number;
  /** Front/rear current load fractions after weight transfer. */
  loadFront: number;
  loadRear: number;

  // echoed inputs (handy for HUD/debug/audio)
  steerAngle: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
}

/** Allocates a fresh CarState at a spawn pose. */
export function createCarState(x = 0, y = 0, heading = 0): CarState {
  return {
    x,
    y,
    heading,
    velocityX: 0,
    velocityY: 0,
    speed: 0,
    angularVelocity: 0,
    localVelLong: 0,
    localVelLat: 0,
    slipAngle: 0,
    slipAngleDeg: 0,
    driftDirection: 0,
    isDrifting: false,
    frontSlipSaturation: 0,
    rearSlipSaturation: 0,
    loadFront: 0.5,
    loadRear: 0.5,
    steerAngle: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
  };
}
