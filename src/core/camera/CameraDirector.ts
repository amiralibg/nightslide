import Phaser from 'phaser';
import { CAMERA } from '../../config';
import type { CarState } from '../physics';

/**
 * CameraDirector — the drift-aware camera. It follows the car, leans ahead in
 * the travel direction at speed, eases the zoom out as you go faster, and shakes:
 * a continuous shimmer that scales with how hard you're sliding, plus an impulse
 * kick on impacts. All feel constants live in CAMERA (config/fx.ts).
 */
export class CameraDirector {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private currentZoom: number;

  private impactTimer = 0; // ms remaining
  private impactMag = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly target: Phaser.GameObjects.GameObject & { x: number; y: number },
  ) {
    this.cam = scene.cameras.main;
    this.currentZoom = CAMERA.baseZoom;
  }

  start(bounds: { width: number; height: number }): void {
    this.cam.setBounds(0, 0, bounds.width, bounds.height);
    this.cam.setZoom(CAMERA.baseZoom);
    this.cam.roundPixels = true;
    this.cam.startFollow(this.target, true, CAMERA.followLerp, CAMERA.followLerp);
  }

  /** Trigger an impulse shake scaled by impact speed (px/s). */
  impact(impactSpeed: number): void {
    const mag = Math.min(CAMERA.maxImpactShake, impactSpeed * CAMERA.impactShakeScale);
    if (mag <= this.impactMag * (this.impactTimer / CAMERA.impactShakeMs)) return; // don't cut a bigger one short
    this.impactMag = mag;
    this.impactTimer = CAMERA.impactShakeMs;
  }

  update(s: Readonly<CarState>, topSpeed: number, dt: number): void {
    const speedNorm = clamp(s.speed / topSpeed, 0, 1);

    // look-ahead in the travel direction
    if (s.speed > 1) {
      const inv = 1 / s.speed;
      const amt = CAMERA.lookAhead * speedNorm;
      this.cam.setFollowOffset(-s.velocityX * inv * amt, -s.velocityY * inv * amt);
    }

    // ease zoom out with speed
    const targetZoom = CAMERA.baseZoom * (1 - CAMERA.speedZoomOut * speedNorm);
    this.currentZoom += (targetZoom - this.currentZoom) * Math.min(1, dt * 4);
    this.cam.setZoom(this.currentZoom);

    // shake: max of drift shimmer and decaying impact kick
    const driftShake = CAMERA.maxDriftShake * clamp(Math.abs(s.slipAngle) / CAMERA.driftShakeSlipRef, 0, 1) * speedNorm;
    let impactShake = 0;
    if (this.impactTimer > 0) {
      this.impactTimer -= dt * 1000;
      impactShake = this.impactMag * clamp(this.impactTimer / CAMERA.impactShakeMs, 0, 1);
    }
    const total = Math.max(driftShake, impactShake);
    if (total > 0.0004) this.cam.shake(90, total, true);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
