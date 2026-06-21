import Phaser from 'phaser';
import { COLORS, FX } from '../../config';
import type { CarState } from '../physics';

/**
 * Smoke — tire smoke puffed from the rear contact patch while the rear slides,
 * scaled by how hard the tire is let go and how fast we're going.
 */
export class Smoke {
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, depth: number) {
    this.emitter = scene.add
      .particles(0, 0, 'smoke', {
        lifespan: 620,
        speed: { min: 8, max: 40 },
        scale: { start: 0.45, end: 1.5 },
        alpha: { start: 0.5, end: 0 },
        frequency: -1, // manual emission only
        tint: COLORS.smoke,
        blendMode: Phaser.BlendModes.SCREEN,
      })
      .setDepth(depth);
  }

  /** Emit smoke appropriate to the car's current slide, at the rear axle. */
  update(s: Readonly<CarState>, rearX: number, rearY: number): void {
    if (s.rearSlipSaturation < FX.smokeSlipThreshold || s.speed < FX.smokeMinSpeed) return;
    const intensity = (s.rearSlipSaturation - FX.smokeSlipThreshold) / (1 - FX.smokeSlipThreshold);
    const count = 1 + Math.floor(intensity * (FX.smokeMaxPerFrame - 1));
    this.emitter.emitParticleAt(rearX, rearY, count);
  }
}
