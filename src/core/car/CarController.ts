import { RUNTIME, type PhysicsConfig } from '../../config';
import type { CarEvent, CarEventSink } from '../events';
import { DriftModel, createCarState, NEUTRAL_INPUT, type CarState, type DriveInput } from '../physics';

/**
 * CarController — the bridge between raw physics and the rest of the game.
 *
 * It owns a CarState and a DriftModel, advances the sim in fixed substeps for
 * stability, exposes a read-only state snapshot, and — crucially — watches that
 * state to emit high-level {@link CarEvent}s (drift start/stop, switchback,
 * spin). Modes subscribe to those events and read the state; they never touch
 * the physics directly. Still engine-agnostic: no Phaser in here.
 */
export class CarController {
  private readonly model = new DriftModel();
  private state: CarState;
  private input: DriveInput = { ...NEUTRAL_INPUT };
  private config: PhysicsConfig;
  private readonly sinks = new Set<CarEventSink>();

  private accumulator = 0;
  private elapsedMs = 0;
  /** Grip multiplier from the ground surface under the car (1 = full asphalt,
   *  <1 = grass run-off). Set by the scene from the arena each frame. */
  private surfaceGrip = 1;

  // drift-event tracking
  private wasDrifting = false;
  private driftStartMs = 0;
  private peakSlipDeg = 0;
  private lastDriftDir: -1 | 0 | 1 = 0;
  private spinAccum = 0;
  private prevHeading = 0;

  constructor(config: PhysicsConfig, x = 0, y = 0, heading = 0) {
    this.config = config;
    this.state = createCarState(x, y, heading);
    this.prevHeading = heading;
  }

  /** Swap the active physics config (e.g. preset change). Shares the reference
   *  so live edits from the dev panel take effect immediately. */
  setConfig(config: PhysicsConfig): void {
    this.config = config;
  }

  /** Set the ground-surface grip multiplier for upcoming steps (1 = asphalt). */
  setSurfaceGrip(grip: number): void {
    this.surfaceGrip = grip < 0 ? 0 : grip > 1 ? 1 : grip;
  }

  /** Set driver intent for the next update(s). Values are clamped defensively. */
  setInput(input: DriveInput): void {
    this.input.throttle = clamp01(input.throttle);
    this.input.brake = clamp01(input.brake);
    this.input.steer = clamp(input.steer, -1, 1);
    this.input.handbrake = input.handbrake;
  }

  /** Subscribe to car events. Returns an unsubscribe function. */
  onEvent(sink: CarEventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  /** The current read-only car state. Do not mutate. */
  getState(): Readonly<CarState> {
    return this.state;
  }

  /** Reset the car to a pose and clear motion + accumulators. */
  respawn(x: number, y: number, heading = 0): void {
    this.state = createCarState(x, y, heading);
    this.model.reset();
    this.input = { ...NEUTRAL_INPUT };
    this.accumulator = 0;
    this.wasDrifting = false;
    this.peakSlipDeg = 0;
    this.lastDriftDir = 0;
    this.spinAccum = 0;
    this.prevHeading = heading;
  }

  /**
   * Advance the simulation by `dtSeconds` of wall-clock time. The sim itself
   * runs in fixed RUNTIME.fixedStep slices so feel is frame-rate independent.
   */
  update(dtSeconds: number): void {
    // clamp to avoid the "spiral of death" if the tab stalls
    const dt = Math.min(dtSeconds, 0.1);
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= RUNTIME.fixedStep && steps < RUNTIME.maxSubSteps) {
      this.elapsedMs += RUNTIME.fixedStep * 1000;
      this.model.step(this.state, this.input, this.config, RUNTIME.fixedStep, this.surfaceGrip);
      this.accumulator -= RUNTIME.fixedStep;
      steps++;
    }
    // if we hit the substep cap, drop the backlog rather than fast-forwarding
    if (steps >= RUNTIME.maxSubSteps) this.accumulator = 0;

    if (steps > 0) this.detectEvents();
  }

  /** Inspect the post-step state and emit high-level events on transitions. */
  private detectEvents(): void {
    const s = this.state;
    const t = this.elapsedMs;

    // spin: accumulate heading change while drifting; a full turn = a spin bonus
    if (s.isDrifting) {
      this.spinAccum += angleDelta(this.prevHeading, s.heading);
      if (Math.abs(this.spinAccum) >= Math.PI * 2) {
        this.emit({ type: 'spin', time: t });
        this.spinAccum -= Math.sign(this.spinAccum) * Math.PI * 2;
      }
    }
    this.prevHeading = s.heading;

    // drift start / end edges
    if (s.isDrifting && !this.wasDrifting) {
      this.driftStartMs = t;
      this.peakSlipDeg = Math.abs(s.slipAngleDeg);
      this.lastDriftDir = s.driftDirection;
      this.emit({
        type: 'driftStart',
        direction: s.driftDirection === -1 ? -1 : 1,
        speed: s.speed,
        slipAngle: s.slipAngle,
        time: t,
      });
    } else if (s.isDrifting && this.wasDrifting) {
      this.peakSlipDeg = Math.max(this.peakSlipDeg, Math.abs(s.slipAngleDeg));
      // switchback: the slide reversed direction without dropping out of a drift
      if (s.driftDirection !== 0 && this.lastDriftDir !== 0 && s.driftDirection !== this.lastDriftDir) {
        this.emit({ type: 'switchback', time: t });
        this.lastDriftDir = s.driftDirection;
      } else if (s.driftDirection !== 0) {
        this.lastDriftDir = s.driftDirection;
      }
    } else if (!s.isDrifting && this.wasDrifting) {
      this.emit({ type: 'driftEnd', durationMs: t - this.driftStartMs, peakSlipDeg: this.peakSlipDeg, time: t });
      this.spinAccum = 0;
      this.lastDriftDir = 0;
    }

    this.wasDrifting = s.isDrifting;
  }

  /**
   * Keep the car inside an axis-aligned box, bouncing it off the edges. Returns
   * the impact speed if an edge was hit this call (else 0) so the caller can
   * trigger FX / a wallContact event. A placeholder until the Phase 2 arena
   * collision layer; it lives here because it's car response, not arena knowledge.
   */
  clampToBounds(minX: number, minY: number, maxX: number, maxY: number, bounce = 0.35): number {
    const s = this.state;
    let impact = 0;
    if (s.x < minX) {
      s.x = minX;
      if (s.velocityX < 0) {
        impact = Math.max(impact, -s.velocityX);
        s.velocityX *= -bounce;
      }
    } else if (s.x > maxX) {
      s.x = maxX;
      if (s.velocityX > 0) {
        impact = Math.max(impact, s.velocityX);
        s.velocityX *= -bounce;
      }
    }
    if (s.y < minY) {
      s.y = minY;
      if (s.velocityY < 0) {
        impact = Math.max(impact, -s.velocityY);
        s.velocityY *= -bounce;
      }
    } else if (s.y > maxY) {
      s.y = maxY;
      if (s.velocityY > 0) {
        impact = Math.max(impact, s.velocityY);
        s.velocityY *= -bounce;
      }
    }
    if (impact > 0) s.speed = Math.hypot(s.velocityX, s.velocityY);
    return impact;
  }

  /** The car's collision circle in world space (used by the arena collision system). */
  getCollisionCircle(): { x: number; y: number; radius: number } {
    return { x: this.state.x, y: this.state.y, radius: RUNTIME.carCollisionRadius };
  }

  /**
   * Resolve a static-collider hit: push the car out along an outward normal by
   * `penetration` px and reflect the inbound velocity with restitution. Returns
   * the inbound impact speed (px/s) so the caller can scale FX / pick crash vs
   * scrape. (nx, ny) must be a unit normal pointing OUT of the surface.
   */
  applyCollision(nx: number, ny: number, penetration: number, restitution = 0.35): number {
    const s = this.state;
    s.x += nx * penetration;
    s.y += ny * penetration;
    const vn = s.velocityX * nx + s.velocityY * ny; // velocity along the normal
    if (vn < 0) {
      // moving into the surface — remove that component and bounce a little
      s.velocityX -= (1 + restitution) * vn * nx;
      s.velocityY -= (1 + restitution) * vn * ny;
      s.speed = Math.hypot(s.velocityX, s.velocityY);
      return -vn;
    }
    return 0;
  }

  /** Inject an externally-detected event (e.g. wall/crash from the collision
   *  layer) so it reaches modes through the same channel. */
  reportEvent(event: CarEvent): void {
    this.emit(event);
  }

  private emit(event: CarEvent): void {
    for (const sink of this.sinks) sink(event);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
/** Shortest signed delta from a → b (handles the ±π wrap). */
function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
