import Phaser from 'phaser';
import { COLORS, FX } from '../../config';

interface Streak {
  x: number;
  y: number;
  len: number;
  alpha: number;
  active: boolean;
}

/**
 * SpeedLines — screen-space velocity streaks that rush past at high speed. They
 * live in camera space (scrollFactor 0) and stream opposite to the travel
 * direction, so the world reads as blowing by. Pooled + drawn with one Graphics.
 */
export class SpeedLines {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly pool: Streak[] = [];
  private w: number;
  private h: number;

  /** Screen-space streak speed at full velocity (px/s). */
  private static readonly STREAK_SPEED = 1400;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
  ) {
    this.w = scene.scale.width;
    this.h = scene.scale.height;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    for (let i = 0; i < FX.speedLinePool; i++) this.pool.push({ x: 0, y: 0, len: 0, alpha: 0, active: false });
  }

  /**
   * @param speedFrac  0..1 fraction of top speed.
   * @param dirX,dirY  unit travel direction (world == screen for axes).
   */
  update(speedFrac: number, dirX: number, dirY: number, dt: number): void {
    // track the live canvas size (the RESIZE scale mode changes it with the window)
    this.w = this.scene.scale.width;
    this.h = this.scene.scale.height;
    const over = speedFrac - FX.speedLineThreshold;
    const intensity = over > 0 ? over / (1 - FX.speedLineThreshold) : 0;

    // spawn
    if (intensity > 0) {
      const spawn = Math.random() < intensity * FX.speedLineMaxPerFrame ? 1 : 0;
      for (let n = 0; n < spawn + (intensity > 0.6 ? 1 : 0); n++) this.spawn(intensity);
    }

    // integrate + draw
    const move = SpeedLines.STREAK_SPEED * speedFrac * dt;
    this.g.clear();
    for (const s of this.pool) {
      if (!s.active) continue;
      // travel opposite to the car's motion
      s.x -= dirX * move;
      s.y -= dirY * move;
      s.alpha -= dt * 1.6;
      if (s.alpha <= 0 || s.x < -40 || s.x > this.w + 40 || s.y < -40 || s.y > this.h + 40) {
        s.active = false;
        continue;
      }
      this.g.lineStyle(1, COLORS.cyan, Math.min(0.4, s.alpha) * intensity);
      this.g.lineBetween(s.x, s.y, s.x + dirX * s.len, s.y + dirY * s.len);
    }
  }

  clear(): void {
    this.g.clear();
    for (const s of this.pool) s.active = false;
  }

  private spawn(intensity: number): void {
    const s = this.pool.find((p) => !p.active);
    if (!s) return;
    s.x = Math.random() * this.w;
    s.y = Math.random() * this.h;
    s.len = 16 + intensity * 40;
    s.alpha = 0.5 + Math.random() * 0.4;
    s.active = true;
  }
}
