import Phaser from 'phaser';
import { COLORS, RUNTIME, type ArenaConfig, type SolidRect, type TrackSpec } from '../../config';

type Pt = { x: number; y: number };

/**
 * Arena — turns an ArenaConfig (pure data) into the playfield: a tiled asphalt
 * floor, a neon perimeter, optional racing curbs, and the solid props. It also
 * exposes the collider set + inset bounds the CollisionSystem needs. Visuals
 * only; no simulation.
 *
 * Every game object it creates is tracked so the whole arena can be torn down
 * with {@link destroy} — that's what lets the scene swap maps in place (no scene
 * restart, which would trip the boot/ready hand-off).
 */
export class Arena {
  readonly width: number;
  readonly height: number;
  readonly spawn: { x: number; y: number; heading: number };

  /** Inner bounds the car centre is kept within (perimeter wall + car radius). */
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };

  private readonly props: SolidRect[];
  /** Everything added to the scene, for teardown on map switch. */
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  // circuit geometry (only populated when the arena has a `track`)
  private centerline: { x: number; y: number }[] = [];
  private outer: { x: number; y: number }[] = [];
  private inner: { x: number; y: number }[] = [];
  private trackHalf = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: ArenaConfig,
  ) {
    this.width = config.width;
    this.height = config.height;
    this.spawn = config.spawn;
    this.props = config.props;
    const inset = config.wallThickness + RUNTIME.carCollisionRadius;
    this.bounds = {
      minX: inset,
      minY: inset,
      maxX: config.width - inset,
      maxY: config.height - inset,
    };
  }

  /** The solid rectangles for collision (props only; perimeter is via bounds). */
  getColliders(): readonly SolidRect[] {
    return this.props;
  }

  /** Build the static visuals. Call once after construction. */
  build(): void {
    if (this.config.track) {
      this.buildTrack();
      return;
    }
    const { width, height, wallThickness } = this.config;

    // real (CC0) asphalt floor, tinted down into the night palette (tiled).
    // tileScale shrinks the texture so the aggregate reads as fine grain, not boulders.
    const floor = this.scene.add.tileSprite(0, 0, width, height, 'asphalt').setOrigin(0, 0).setDepth(0);
    floor.setTint(0x8b929c);
    floor.setTileScale(0.16, 0.16);
    this.track(floor);

    // painted floor markings (parking stalls etc.) sit just above the tarmac
    if (this.config.lines?.length) this.drawLines(this.config.lines);

    // perimeter wall band (dark concrete with an inner shadow line)
    const walls = this.scene.add.graphics().setDepth(3);
    walls.fillStyle(COLORS.void, 1);
    walls.fillRect(0, 0, width, wallThickness);
    walls.fillRect(0, height - wallThickness, width, wallThickness);
    walls.fillRect(0, 0, wallThickness, height);
    walls.fillRect(width - wallThickness, 0, wallThickness, height);
    walls.fillStyle(0x000000, 0.35); // soft inner shadow cast onto the track
    const sh = 10;
    walls.fillRect(wallThickness, wallThickness, width - wallThickness * 2, sh);
    walls.fillRect(wallThickness, height - wallThickness - sh, width - wallThickness * 2, sh);
    walls.fillRect(wallThickness, wallThickness, sh, height - wallThickness * 2);
    walls.fillRect(width - wallThickness - sh, wallThickness, sh, height - wallThickness * 2);
    this.track(walls);

    if (this.config.curbs !== false) this.drawCurbs(width, height, wallThickness);

    // props
    for (const p of this.props) this.drawProp(p);
  }

  /** Tear down every object this arena created (for switching maps in place). */
  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }

  /** Grip multiplier of the ground under (x,y): 1 on the racing surface, lower on
   *  grass run-off (with a thin blend band). Non-circuit arenas are all grip. */
  surfaceGrip(x: number, y: number): number {
    if (!this.centerline.length) return 1;
    let best = Infinity;
    for (const p of this.centerline) {
      const dx = x - p.x;
      const dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best);
    const edge = this.trackHalf;
    const band = 70;
    if (d <= edge) return 1;
    if (d >= edge + band) return Arena.GRASS_GRIP;
    return 1 - ((d - edge) / band) * (1 - Arena.GRASS_GRIP);
  }

  /** The sampled circuit centerline (for lap checkpoints etc.); empty for lots. */
  getCenterline(): readonly Pt[] {
    return this.centerline;
  }

  private static readonly GRASS_GRIP = 0.42;

  // ── circuit build ─────────────────────────────────────────────────────────────
  private buildTrack(): void {
    const { width, height } = this.config;
    this.computeRibbon(this.config.track!);

    // grass field
    this.track(this.scene.add.tileSprite(0, 0, width, height, 'grass').setOrigin(0, 0).setDepth(0));

    // asphalt ribbon — filled directly as a strip of quads along the centerline
    // (robust in the Beam renderer; a geometry-masked tile doesn't clip here)
    const ribbon = this.scene.add.graphics().setDepth(1);
    const m = this.centerline.length;
    ribbon.fillStyle(0x4c535d, 1); // matches the tinted lot asphalt tone
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      ribbon.fillPoints(vpts([this.outer[i]!, this.outer[j]!, this.inner[j]!, this.inner[i]!]), true);
    }
    // fine aggregate grain so it reads like the lot asphalt (not a flat slab)
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      for (let k = 0; k < 10; k++) {
        const t = Math.random();
        const u = Math.random();
        const ax = lerp(this.inner[i]!.x, this.outer[i]!.x, t);
        const ay = lerp(this.inner[i]!.y, this.outer[i]!.y, t);
        const bx = lerp(this.inner[j]!.x, this.outer[j]!.x, t);
        const by = lerp(this.inner[j]!.y, this.outer[j]!.y, t);
        ribbon.fillStyle(Math.random() > 0.5 ? 0x3c424b : 0x5b636e, 0.5);
        ribbon.fillRect(lerp(ax, bx, u) - 1, lerp(ay, by, u) - 1, 2, 2);
      }
    }
    // faint dashed centre line
    ribbon.lineStyle(2, 0x767d88, 0.3);
    for (let i = 0; i < m; i += 2) {
      const a = this.centerline[i]!;
      const b = this.centerline[(i + 1) % m]!;
      ribbon.lineBetween(a.x, a.y, b.x, b.y);
    }
    this.track(ribbon);

    this.drawTrackCurbs();
    this.drawStartFinish();

    for (const p of this.props) this.drawProp(p);
  }

  /** Sample a smooth closed centerline (Catmull-Rom) + its edge polylines. */
  private computeRibbon(track: TrackSpec): void {
    const cps = track.centerline;
    const n = cps.length;
    const STEP = 10;
    const c: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = cps[(i - 1 + n) % n]!;
      const p1 = cps[i]!;
      const p2 = cps[(i + 1) % n]!;
      const p3 = cps[(i + 2) % n]!;
      for (let s = 0; s < STEP; s++) c.push(catmullRom(p0, p1, p2, p3, s / STEP));
    }
    this.centerline = c;
    this.trackHalf = track.width / 2;
    const m = c.length;
    this.outer = [];
    this.inner = [];
    for (let i = 0; i < m; i++) {
      const prev = c[(i - 1 + m) % m]!;
      const next = c[(i + 1) % m]!;
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const nx = -ty; // left normal
      const ny = tx;
      this.outer.push({ x: c[i]!.x + nx * this.trackHalf, y: c[i]!.y + ny * this.trackHalf });
      this.inner.push({ x: c[i]!.x - nx * this.trackHalf, y: c[i]!.y - ny * this.trackHalf });
    }
  }

  /** Red/white kerbs running along both edges of the ribbon, drawn as thick
   *  alternating-colour line segments that hug the edge polyline (robust — no
   *  quad winding artefacts at corners). */
  private drawTrackCurbs(): void {
    const g = this.scene.add.graphics().setDepth(2);
    this.track(g);
    const kerbW = 10;
    const stripe = (edge: Pt[]) => {
      const m = edge.length;
      for (let i = 0; i < m; i++) {
        const a = edge[i]!;
        const b = edge[(i + 1) % m]!;
        g.lineStyle(kerbW, i % 2 === 0 ? COLORS.danger : COLORS.textHi, 0.85);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    };
    stripe(this.outer);
    stripe(this.inner);
  }

  /** Checkered start/finish band across the ribbon nearest the spawn. */
  private drawStartFinish(): void {
    const m = this.centerline.length;
    const idx = this.nearestIndex(this.spawn.x, this.spawn.y);
    const a = this.inner[idx]!;
    const b = this.outer[idx]!;
    const dir = norm({
      x: this.centerline[(idx + 1) % m]!.x - this.centerline[idx]!.x,
      y: this.centerline[(idx + 1) % m]!.y - this.centerline[idx]!.y,
    });
    const g = this.scene.add.graphics().setDepth(2);
    this.track(g);
    const cells = 7;
    const off = 9;
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < cells; k++) {
        const t0 = k / cells;
        const t1 = (k + 1) / cells;
        const sx = dir.x * off * r;
        const sy = dir.y * off * r;
        const p0 = { x: lerp(a.x, b.x, t0) + sx, y: lerp(a.y, b.y, t0) + sy };
        const p1 = { x: lerp(a.x, b.x, t1) + sx, y: lerp(a.y, b.y, t1) + sy };
        g.fillStyle((k + r) % 2 === 0 ? 0xffffff : 0x111418, 0.95);
        g.fillPoints(vpts([p0, p1, { x: p1.x + dir.x * off, y: p1.y + dir.y * off }, { x: p0.x + dir.x * off, y: p0.y + dir.y * off }]), true);
      }
    }
  }

  private nearestIndex(x: number, y: number): number {
    let bi = 0;
    let best = Infinity;
    for (let i = 0; i < this.centerline.length; i++) {
      const dx = x - this.centerline[i]!.x;
      const dy = y - this.centerline[i]!.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        bi = i;
      }
    }
    return bi;
  }

  /** Track a created object so it can be destroyed later; returns it for chaining. */
  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.push(obj);
    return obj;
  }

  /** Painted floor lines (parking stalls), in one graphics object at floor level. */
  private drawLines(lines: readonly { x1: number; y1: number; x2: number; y2: number }[]): void {
    const g = this.scene.add.graphics().setDepth(1);
    g.lineStyle(3, COLORS.textMid, 0.4);
    for (const l of lines) g.lineBetween(l.x1, l.y1, l.x2, l.y2);
    this.track(g);
  }

  /** Red/white racetrack curb running along the inner edge of the perimeter. */
  private drawCurbs(width: number, height: number, wall: number): void {
    const g = this.scene.add.graphics().setDepth(2);
    this.track(g);
    const cw = 12; // curb width
    const seg = 34; // stripe length
    const inner = wall;
    const drawRun = (x0: number, y0: number, horizontal: boolean, length: number) => {
      let d = 0;
      let i = 0;
      while (d < length) {
        const len = Math.min(seg, length - d);
        g.fillStyle(i % 2 === 0 ? COLORS.danger : COLORS.textHi, 0.55);
        if (horizontal) g.fillRect(x0 + d, y0, len, cw);
        else g.fillRect(x0, y0 + d, cw, len);
        d += len;
        i++;
      }
    };
    drawRun(inner, inner, true, width - inner * 2); // top
    drawRun(inner, height - inner - cw, true, width - inner * 2); // bottom
    drawRun(inner, inner, false, height - inner * 2); // left
    drawRun(width - inner - cw, inner, false, height - inner * 2); // right
  }

  private drawProp(p: SolidRect): void {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    // a real prop sprite (CC0 model) overrides the procedural kind art
    if (p.sprite && this.scene.textures.exists(p.sprite)) {
      const scale = p.spriteScale ?? 1;
      const w = p.w * scale;
      const h = p.h * scale;
      this.track(this.scene.add.ellipse(cx + 3, cy + 5, w * 0.92, h * 0.7, 0x000000, 0.28).setDepth(3));
      const img = this.scene.add.image(cx, cy, p.sprite).setDepth(4).setDisplaySize(w, h);
      if (p.rot) img.setAngle(p.rot);
      this.track(img);
      return;
    }
    if (p.kind === 'pillar') {
      // stacked tires — sized to the collider, plus a soft shadow
      this.track(this.scene.add.ellipse(cx + 4, cy + 5, p.w * 1.05, p.h * 1.05, 0x000000, 0.3).setDepth(3));
      this.track(this.scene.add.image(cx, cy, 'tirestack').setDisplaySize(p.w * 1.18, p.h * 1.18).setDepth(4));
    } else if (p.kind === 'wall') {
      // plain concrete block (track infield / parking bumper) + shadow
      this.track(this.scene.add.rectangle(cx + 4, cy + 6, p.w, p.h, 0x000000, 0.3).setDepth(3));
      const body = this.scene.add
        .rectangle(cx, cy, p.w, p.h, 0x222932)
        .setStrokeStyle(2, 0x0a0e12)
        .setDepth(4);
      this.track(body);
      // top-edge highlight so it reads as a raised slab
      this.track(this.scene.add.rectangle(cx, p.y + 3, p.w - 4, 4, 0x3a444e, 0.6).setDepth(4));
    } else {
      // concrete hazard barrier (texture stretched to the collider) + shadow
      this.track(this.scene.add.rectangle(cx + 4, cy + 6, p.w, p.h, 0x000000, 0.3).setDepth(3));
      this.track(this.scene.add.image(cx, cy, 'barrier').setDisplaySize(p.w, p.h).setDepth(4));
    }
  }
}

// ── geometry helpers (circuit ribbon) ─────────────────────────────────────────────
/** Centripetal-ish Catmull-Rom interpolation between p1→p2 (t in 0..1). */
function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function norm(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/** Plain points → Phaser Vector2[] for fillPoints. */
function vpts(pts: Pt[]): Phaser.Math.Vector2[] {
  return pts.map((p) => new Phaser.Math.Vector2(p.x, p.y));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
