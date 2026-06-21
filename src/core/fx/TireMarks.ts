import Phaser from 'phaser';
import { COLORS, FX } from '../../config';

/**
 * TireMarks — a pooled, fading ring buffer of rubber stamps.
 *
 * We deliberately avoid a RenderTexture here: in Phaser 4 RenderTexture/Dynamic-
 * Texture draws are buffered until an explicit `render()` and the GameObject
 * wrapper's auto-flush proved unreliable. A capped pool of small Image stamps is
 * simpler, renders predictably, and is exactly what the brief asks for ("pool
 * particles, cap trail length") — plus it gives us real per-mark fade for free.
 */
export class TireMarks {
  private readonly pool: Phaser.GameObjects.Image[];
  private readonly life: Float32Array;
  private readonly maxAlpha: Float32Array;
  private head = 0;

  // last stamp position per wheel, to fill gaps at speed
  private readonly last = [
    { x: 0, y: 0, valid: false },
    { x: 0, y: 0, valid: false },
  ];

  private static readonly SPACING = 4; // px between stamps
  private static readonly MAX_FILL = 4; // cap interpolated stamps per wheel/frame

  constructor(
    scene: Phaser.Scene,
    depth: number,
    private readonly capacity = 900,
    private readonly lifetime = 1 / FX.markFadePerSec, // seconds to fully fade
  ) {
    this.pool = new Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxAlpha = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = scene.add
        .image(0, 0, 'skid')
        .setTint(COLORS.tireMark)
        .setDepth(depth)
        .setActive(false)
        .setVisible(false);
    }
  }

  /** Lay marks for one wheel this frame (with gap fill from the last position). */
  stampWheel(wheel: 0 | 1, x: number, y: number, alpha: number): void {
    const l = this.last[wheel]!;
    if (l.valid) {
      const dist = Math.hypot(x - l.x, y - l.y);
      const steps = Math.min(TireMarks.MAX_FILL, Math.floor(dist / TireMarks.SPACING));
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1);
        this.put(l.x + (x - l.x) * t, l.y + (y - l.y) * t, alpha);
      }
    }
    this.put(x, y, alpha);
    l.x = x;
    l.y = y;
    l.valid = true;
  }

  /** Call when the car stops sliding so the next slide starts a fresh streak. */
  liftWheel(wheel: 0 | 1): void {
    this.last[wheel]!.valid = false;
  }

  /** Fade all live marks; recycle the dead ones. Call once per frame. */
  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i]! <= 0) continue;
      const remaining = (this.life[i] -= dt);
      const img = this.pool[i]!;
      if (remaining <= 0) {
        img.setActive(false).setVisible(false);
      } else {
        img.setAlpha(this.maxAlpha[i]! * (remaining / this.lifetime));
      }
    }
  }

  /** Wipe every mark immediately (on respawn / restart). */
  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.life[i] = 0;
      this.pool[i]!.setActive(false).setVisible(false);
    }
    this.last[0]!.valid = false;
    this.last[1]!.valid = false;
  }

  private put(x: number, y: number, alpha: number): void {
    const i = this.head;
    const img = this.pool[i]!;
    img.setPosition(x, y).setAlpha(alpha).setActive(true).setVisible(true);
    this.life[i] = this.lifetime;
    this.maxAlpha[i] = alpha;
    this.head = (this.head + 1) % this.capacity;
  }
}
