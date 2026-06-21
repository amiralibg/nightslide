import type { SolidRect } from '../../config';
import type { CarController } from '../car';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * CollisionSystem — resolves the car (a circle) against the static world: the
 * perimeter bounds and the arena's solid rectangles. Pure math + the car
 * controller; engine-agnostic. The car's bespoke handling stays authoritative —
 * we just push it out of overlaps and reflect the inbound velocity, then report
 * the impact speed so FX/scoring can react (scrape vs crash).
 */
export class CollisionSystem {
  constructor(
    private readonly colliders: readonly SolidRect[],
    private readonly bounds: Bounds,
  ) {}

  /** Resolve all collisions for this frame; returns the hardest impact (px/s). */
  resolve(car: CarController): number {
    // perimeter first (clamp avoids any chance of tunnelling out of the arena)
    let impact = car.clampToBounds(this.bounds.minX, this.bounds.minY, this.bounds.maxX, this.bounds.maxY);

    // then each solid prop, as circle-vs-AABB
    const { x: cx, y: cy, radius } = car.getCollisionCircle();
    for (const r of this.colliders) {
      const nearestX = clamp(cx, r.x, r.x + r.w);
      const nearestY = clamp(cy, r.y, r.y + r.h);
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;

      let nx: number;
      let ny: number;
      let pen: number;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        ny = dy / d;
        pen = radius - d;
      } else {
        // centre is inside the rect — eject along the least-penetration axis
        const left = cx - r.x;
        const right = r.x + r.w - cx;
        const top = cy - r.y;
        const bottom = r.y + r.h - cy;
        const minPen = Math.min(left, right, top, bottom);
        if (minPen === left) {
          nx = -1; ny = 0;
        } else if (minPen === right) {
          nx = 1; ny = 0;
        } else if (minPen === top) {
          nx = 0; ny = -1;
        } else {
          nx = 0; ny = 1;
        }
        pen = minPen + radius;
      }
      impact = Math.max(impact, car.applyCollision(nx, ny, pen));
    }
    return impact;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
