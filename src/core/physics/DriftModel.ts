import type { PhysicsConfig } from '../../config';
import { tireLateralForce } from './TireModel';
import type { CarState, DriveInput } from './types';

/**
 * DriftModel — integrates one car forward in time using a simplified bicycle
 * model with a per-axle slip/grip tire layer. This is the engine-agnostic core
 * of the "feel"; it knows nothing about Phaser, rendering, scoring or modes.
 *
 * Per step we:
 *   1. ease the steering toward its (speed-sensitive) target,
 *   2. split the car's velocity into forward / lateral components,
 *   3. shift weight front/rear from longitudinal acceleration,
 *   4. compute each axle's slip angle and the grip available to it,
 *   5. ask the tire model for lateral force, add engine/brake/drag/handbrake,
 *   6. integrate translation and yaw, then settle low-speed jitter.
 *
 * Call `step` repeatedly with a small fixed `dt` (see RUNTIME.fixedStep) for a
 * stable, frame-rate-independent result.
 */
export class DriftModel {
  /** Smoothed longitudinal load shift (+ = weight moved rearward). */
  private weightShift = 0;
  /** Longitudinal acceleration from the previous step (feeds weight transfer). */
  private prevALong = 0;

  /** Reference "gravity" used to normalize accel→weight-transfer (px/s^2). */
  private static readonly GRAVITY_REF = 900;
  /** Axle load is clamped here so a tire never fully unloads or doubles up. */
  private static readonly LOAD_MIN = 0.1;
  private static readonly LOAD_MAX = 0.9;
  /** Floor on |vLong| so slip-angle atan2 stays finite near standstill. */
  private static readonly LONG_EPS = 12;
  /** Counter-steer assist gains: how far to point the wheels along travel per
   *  rad of slip, and how strongly to damp the yaw rate. Kept gentle so the
   *  assist stabilises the slide without setting up its own oscillation. */
  private static readonly ASSIST_SLIP = 0.7;
  private static readonly ASSIST_YAW = 0.04;
  /** Extra rolling resistance applied per (1 - surface) when off the racing
   *  surface (grass run-off), so running wide bleeds speed as well as grip. */
  private static readonly GRASS_DRAG = 3.0;

  /** Reset internal accumulators (e.g. on respawn). */
  reset(): void {
    this.weightShift = 0;
    this.prevALong = 0;
  }

  /**
   * Advance `s` by one fixed step `dt` (seconds), mutating it in place.
   * `input` is the already-normalized driver intent for this step.
   */
  step(s: CarState, input: DriveInput, c: PhysicsConfig, dt: number, surface = 1): void {
    const speed = s.speed;
    const speedFrac = clamp(speed / c.topSpeed, 0, 1);

    // ── 1. steering: ease toward a target angle ─────────────────────────────
    // The PLAYER's steering is deliberately gentle (and tapers with speed) so an
    // input nudges the drift angle instead of biting into a sharp grip-turn that
    // breaks the slide. The counter-steer ASSIST, however, keeps full authority:
    // when sliding it points the wheels toward the travel direction (≈ the body
    // slip angle) and damps the yaw, so the car pivots at a steady angle (a held
    // drift) rather than spinning or snapping straight. The player steers on top
    // to tighten, open, or flick the car into the opposite drift.
    const playerLimit = c.maxSteer * (1 - c.steerSpeedReduction * speedFrac);
    let targetSteer = input.steer * playerLimit;
    if (c.driftAssist > 0 && speed > 60) {
      const autoSteer = clamp(
        s.slipAngle * DriftModel.ASSIST_SLIP - s.angularVelocity * DriftModel.ASSIST_YAW,
        -c.maxSteer,
        c.maxSteer,
      );
      targetSteer = clamp(targetSteer + c.driftAssist * autoSteer, -c.maxSteer * 1.5, c.maxSteer * 1.5);
    }
    const steerChase = Math.abs(input.steer) > 0.01 ? c.steerRate : c.steerReturnRate;
    s.steerAngle += (targetSteer - s.steerAngle) * Math.min(1, steerChase * dt);
    const delta = s.steerAngle;

    // ── 2. decompose world velocity into the car's local frame ──────────────
    const cos = Math.cos(s.heading);
    const sin = Math.sin(s.heading);
    // forward = (cos, sin); right = forward rotated +90° = (-sin, cos)
    const vLong = s.velocityX * cos + s.velocityY * sin;
    const vLat = -s.velocityX * sin + s.velocityY * cos;
    const r = s.angularVelocity;

    const absLong = Math.max(Math.abs(vLong), DriftModel.LONG_EPS);
    const dirLong = vLong >= 0 ? 1 : -1;

    // body slip magnitude (how sideways we already are) — drives the drift aids
    const slipMag = Math.abs(Math.atan2(vLat, absLong));
    const driftFactor = clamp((slipMag - c.driftSlipThreshold) / 0.5, 0, 1);

    // ── 3. weight transfer: braking loads the front, throttle loads the rear ─
    const transferTarget = clamp(
      c.weightTransferGain *
        (this.prevALong / DriftModel.GRAVITY_REF) *
        ((c.cgHeight * 2) / c.wheelBase),
      -c.maxWeightTransfer,
      c.maxWeightTransfer,
    );
    this.weightShift += (transferTarget - this.weightShift) * Math.min(1, c.weightTransferRate * dt);
    const loadFront = clamp(c.weightBalance - this.weightShift, DriftModel.LOAD_MIN, DriftModel.LOAD_MAX);
    const loadRear = clamp(1 - c.weightBalance + this.weightShift, DriftModel.LOAD_MIN, DriftModel.LOAD_MAX);

    // ── 4. slip angles per axle (front includes the steered wheel angle) ────
    const frontSlip = Math.atan2(vLat + c.cgToFront * r, absLong) - delta * dirLong;
    const rearSlip = Math.atan2(vLat - c.cgToRear * r, absLong);

    // ── 5. grip available to each axle (speed, load, and driver aids) ───────
    const gripSpeedMult = Math.max(0.4, 1 - c.gripSpeedFalloff * speedFrac);
    const loadMultF = 1 + c.loadSensitivity * (loadFront / c.weightBalance - 1);
    const loadMultR = 1 + c.loadSensitivity * (loadRear / (1 - c.weightBalance) - 1);

    let peakF = c.frontGripMax * c.baseGrip * gripSpeedMult * loadMultF * surface;
    let peakR = c.rearGripMax * c.baseGrip * gripSpeedMult * loadMultR * surface;

    // snap-back: straightening the wheel mid-slide hands grip back to the front
    const steerCentered = 1 - clamp(Math.abs(input.steer), 0, 1);
    peakF *= 1 + c.straightenGripBoost * steerCentered * driftFactor;

    // rear friction circle (proxy): throttle spins the rear up and the handbrake
    // locks it, both eating into its lateral grip — PERSISTENTLY, so the slide
    // sustains on the gas (lift off and the rear grips back to straighten). Note
    // this barely matters in a straight line (no lateral demand) but turns power
    // into oversteer mid-corner, which is the drift.
    let rearScale = 1 - c.throttleSteerHold * input.throttle;
    if (input.handbrake) rearScale *= c.handbrakeGripMult;
    peakR *= Math.max(c.minRearGrip, rearScale);

    // ── 6. tire lateral forces (the slide lives here) ───────────────────────
    const fFront = tireLateralForce(frontSlip, peakF, c.tireStiffnessFront, c.tireShape);
    const fRear = tireLateralForce(rearSlip, peakR, c.tireStiffnessRear, c.tireShape);
    // A tire can only generate slip-angle force while rolling: fade lateral grip
    // in from a standstill so steering can't spin a parked car in place.
    const rollGrip = clamp(speed / 40, 0, 1);
    const latFront = fFront.latAccel * rollGrip;
    const latRear = fRear.latAccel * rollGrip;

    // ── 7. longitudinal forces: engine, brake/reverse, drag, handbrake ──────
    let driveAccel = 0;
    if (input.throttle > 0) driveAccel += input.throttle * c.enginePower;
    let brakeAccel = 0;
    if (input.brake > 0) {
      if (vLong > 5) brakeAccel = input.brake * c.brakeStrength; // slowing down
      else driveAccel -= input.brake * c.reversePower; // brake doubles as reverse
    }
    const engineBrake = input.throttle <= 0 && input.brake <= 0 ? c.idleDecel : 0;
    const handbrakeDecel = input.handbrake ? c.handbrakeForce : 0;
    const grassRoll = (1 - surface) * DriftModel.GRASS_DRAG; // run-off drag
    const dragAccel = c.dragCoef * vLong * Math.abs(vLong) + (c.rollResist + grassRoll) * vLong; // signed, opposes motion
    const resist = (brakeAccel + engineBrake + handbrakeDecel) * dirLong + dragAccel;

    let fLong = driveAccel - resist;
    fLong += -latFront * Math.sin(delta); // steered front force has a fore/aft component
    const fLat = latFront * Math.cos(delta) + latRear;

    // ── 8. integrate translation ────────────────────────────────────────────
    const aLong = fLong / c.mass;
    const aLat = fLat / c.mass;
    this.prevALong = aLong;

    const ax = aLong * cos - aLat * sin;
    const ay = aLong * sin + aLat * cos;
    s.velocityX += ax * dt;
    s.velocityY += ay * dt;

    // ── 9. yaw: torque from the lateral forces about the CG, with damping ────
    // Tire "forces" here are accelerations (px/s^2); multiplied by the moment
    // arms (px) the torque is in px^2/s^2. To turn that into an angular
    // acceleration (rad/s^2) we divide by a geometric reference inertia (~px^2,
    // the product of the axle distances). `yawInertia` is then just a ~1.0
    // responsiveness multiplier on top — higher = lazier rotation.
    const torque = c.cgToFront * latFront * Math.cos(delta) - c.cgToRear * latRear;
    const refInertia = Math.max(1, c.cgToFront * c.cgToRear);
    const angAccel = torque / (c.yawInertia * refInertia * c.mass) - c.yawDamp * r;
    let newR = r + angAccel * dt;
    newR = clamp(newR, -c.maxAngularVelocity, c.maxAngularVelocity);
    s.angularVelocity = newR;
    s.heading = wrapAngle(s.heading + newR * dt);

    // ── 10. settle low-speed jitter so the car parks cleanly ────────────────
    let newSpeed = Math.hypot(s.velocityX, s.velocityY);
    if (newSpeed < c.lowSpeedThreshold) {
      const blend = newSpeed / c.lowSpeedThreshold; // → 0 as we stop
      // bleed off lateral slop and residual yaw as we come to rest
      const ncos = Math.cos(s.heading);
      const nsin = Math.sin(s.heading);
      const fwd = s.velocityX * ncos + s.velocityY * nsin;
      let lat = -s.velocityX * nsin + s.velocityY * ncos;
      lat *= blend;
      s.velocityX = fwd * ncos - lat * nsin;
      s.velocityY = fwd * nsin + lat * ncos;
      s.angularVelocity *= blend;
      newSpeed = Math.hypot(s.velocityX, s.velocityY);
    }

    // hard speed ceiling
    if (newSpeed > c.velocityClamp) {
      const k = c.velocityClamp / newSpeed;
      s.velocityX *= k;
      s.velocityY *= k;
      newSpeed = c.velocityClamp;
    }

    // ── 11. publish derived state for modes / FX / HUD ──────────────────────
    s.x += s.velocityX * dt;
    s.y += s.velocityY * dt;
    s.speed = newSpeed;

    const fcos = Math.cos(s.heading);
    const fsin = Math.sin(s.heading);
    const finalLong = s.velocityX * fcos + s.velocityY * fsin;
    const finalLat = -s.velocityX * fsin + s.velocityY * fcos;
    s.localVelLong = finalLong;
    s.localVelLat = finalLat;

    const slip = newSpeed > 1 ? Math.atan2(finalLat, Math.abs(finalLong)) : 0;
    s.slipAngle = slip;
    s.slipAngleDeg = (slip * 180) / Math.PI;
    s.driftDirection = Math.abs(finalLat) < 2 ? 0 : finalLat > 0 ? 1 : -1;
    s.isDrifting =
      finalLong > 0 &&
      newSpeed > c.driftSpeedThreshold &&
      Math.abs(slip) > c.driftSlipThreshold;

    s.frontSlipSaturation = fFront.saturation;
    s.rearSlipSaturation = fRear.saturation;
    s.loadFront = loadFront;
    s.loadRear = loadRear;

    s.throttle = input.throttle;
    s.brake = input.brake;
    s.handbrake = input.handbrake;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Wrap an angle to (-π, π]. */
function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  a = a % twoPi;
  if (a > Math.PI) a -= twoPi;
  else if (a <= -Math.PI) a += twoPi;
  return a;
}
