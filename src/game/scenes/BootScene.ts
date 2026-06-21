import Phaser from 'phaser';
import { CARS, COLORS, carTextureKey } from '../../config';
import { drawCar } from '../CarArt';

/**
 * BootScene — bakes every runtime texture procedurally, then launches GameScene.
 *
 * Two visual registers share one canvas: the cars and arena surfaces are drawn at
 * high resolution and flagged LINEAR so they read as smooth, glossy die-cast toys
 * and real tarmac; the FX stamps (skid, smoke, pixel) stay at NEAREST so the
 * pixel-crisp juice is unaffected.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    // Queue any car that ships a realistic top-down sprite (CC0 / AI). Missing or
    // failed loads simply fall back to procedural art in makeCarTextures().
    for (const model of CARS) {
      if (model.spriteAsset) this.load.image(carTextureKey(model.id), model.spriteAsset);
    }
    // CC0 prop/obstacle sprites (Kenney racing pack). Arena falls back to its
    // procedural prop art for any key that didn't load.
    for (const [key, url] of BootScene.PROP_ASSETS) this.load.image(key, url);
    // Real (CC0) seamless asphalt floor; procedural tarmac is the fallback.
    this.load.image('asphalt', 'assets/track/asphalt.png');
    // A failed sprite load must not abort boot — fall through to procedural art.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`[boot] sprite failed to load (${file.key}); using procedural fallback`);
    });
  }

  /** Prop sprite texture keys → asset URLs (under public/). */
  private static readonly PROP_ASSETS: ReadonlyArray<[string, string]> = [
    ['prop-tires', 'assets/props/tires.png'],
    ['prop-tires-white', 'assets/props/tires-white.png'],
    // ponytail: no prop-barrier PNG — drawProp falls back to the procedural
    // 'barrier' texture (concrete + amber chevrons), which reads far better.
    ['prop-cone', 'assets/props/cone.png'],
    ['prop-barrel', 'assets/props/barrel.png'],
    ['prop-parked-1', 'assets/props/parked-1.png'],
    ['prop-parked-2', 'assets/props/parked-2.png'],
    ['prop-parked-3', 'assets/props/parked-3.png'],
    ['prop-parked-4', 'assets/props/parked-4.png'],
    ['prop-parked-5', 'assets/props/parked-5.png'],
  ];

  create(): void {
    this.makeCarTextures();
    this.applyPropFilters();
    this.makeCarShadow();
    this.makeSkidTexture();
    this.makeSmokeTexture();
    this.makeAsphaltTexture();
    this.makeGrassTexture();
    this.makeTireStackTexture();
    this.makeBarrierTexture();
    this.makePixelTexture();
    this.scene.start('game');
  }

  /** A smooth top-down sprite per car: a loaded realistic sprite if one shipped,
   *  else procedurally drawn art. Either way it's LINEAR-filtered so it reads
   *  smooth, not blocky. Points +x at rotation 0. */
  private makeCarTextures(): void {
    const L = 200;
    const W = 100;
    for (const model of CARS) {
      const key = carTextureKey(model.id);
      if (this.textures.exists(key)) {
        // a real sprite loaded in preload() — keep it, just smooth it
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
        continue;
      }
      const g = this.add.graphics();
      drawCar(g, model, L, W);
      g.generateTexture(key, L, W);
      g.destroy();
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  /** Smooth (LINEAR) filtering for any prop sprite that loaded. */
  private applyPropFilters(): void {
    for (const [key] of BootScene.PROP_ASSETS) {
      if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  /** Soft elliptical drop shadow that sits under the car (rotates with it). */
  private makeCarShadow(): void {
    const size = 240;
    const g = this.add.graphics();
    const c = size / 2;
    for (let i = 9; i >= 1; i--) {
      const f = i / 9;
      g.fillStyle(0x000000, 0.05);
      g.fillEllipse(c, c, size * f, size * 0.52 * f);
    }
    g.generateTexture('car-shadow', size, size);
    g.destroy();
    this.textures.get('car-shadow').setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** Single tire-mark stamp — a small dark soft blob (stays NEAREST/crisp). */
  private makeSkidTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.tireMark, 1);
    g.fillCircle(3, 3, 2.4);
    g.generateTexture('skid', 6, 6);
    g.destroy();
  }

  /** Soft smoke puff (radial alpha falloff via stacked circles). */
  private makeSmokeTexture(): void {
    const size = 32;
    const g = this.add.graphics();
    const cx = size / 2;
    const steps = 6;
    for (let i = steps; i >= 1; i--) {
      const r = (size / 2) * (i / steps);
      g.fillStyle(COLORS.smoke, 0.12);
      g.fillCircle(cx, cx, r);
    }
    g.generateTexture('smoke', size, size);
    g.destroy();
  }

  /** Real CC0 asphalt if it loaded; otherwise a procedural wet-tarmac fallback. */
  private makeAsphaltTexture(): void {
    if (this.textures.exists('asphalt')) {
      this.textures.get('asphalt').setFilter(Phaser.Textures.FilterMode.LINEAR);
      return;
    }
    const size = 256;
    const g = this.add.graphics();
    g.fillStyle(COLORS.surface, 1);
    g.fillRect(0, 0, size, size);
    // dense fine grain
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const light = Math.random() > 0.5;
      g.fillStyle(light ? COLORS.grid : COLORS.void, 0.08 + Math.random() * 0.12);
      const s = 1 + Math.random() * 2;
      g.fillRect(x, y, s, s);
    }
    // coarser steel aggregate flecks (catching the cold light)
    for (let i = 0; i < 140; i++) {
      g.fillStyle(COLORS.steel, 0.45 + Math.random() * 0.3);
      g.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 2, 2 + Math.random() * 2);
    }
    // faint directional scuffs
    for (let i = 0; i < 24; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 8 + Math.random() * 30;
      g.lineStyle(1, Math.random() > 0.5 ? COLORS.void : COLORS.grid, 0.12);
      g.lineBetween(x, y, x + len, y + (Math.random() - 0.5) * 6);
    }
    // darker oil patches (where wet pools darkest)
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 12 + Math.random() * 30;
      for (let k = 3; k >= 1; k--) {
        g.fillStyle(COLORS.void, 0.07);
        g.fillCircle(x, y, r * (k / 3));
      }
    }
    // wet sheen — long faint specular streaks (kept low-alpha so the tile seams
    // don't read as a grid when repeated across the lot)
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 20 + Math.random() * 60;
      g.lineStyle(1 + Math.random(), COLORS.wet, 0.04 + Math.random() * 0.04);
      g.lineBetween(x, y, x + len, y + (Math.random() - 0.5) * 3);
    }
    // a couple of reflective puddle highlights (soft teal core)
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 8 + Math.random() * 16;
      for (let k = 3; k >= 1; k--) {
        g.fillStyle(COLORS.wet, 0.03);
        g.fillEllipse(x, y, r * (k / 3) * 2.2, r * (k / 3));
      }
    }
    g.generateTexture('asphalt', size, size);
    g.destroy();
  }

  /** Night-toned grass field tile (dark green base + fine mottling), tiled. */
  private makeGrassTexture(): void {
    const size = 256;
    const g = this.add.graphics();
    g.fillStyle(0x1c2a1a, 1); // dark green base (fits the night palette)
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      g.fillStyle(Math.random() > 0.5 ? 0x24351f : 0x141f12, 0.1 + Math.random() * 0.16);
      const s = 1 + Math.random() * 2;
      g.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0x101a0e, 0.05);
      g.fillCircle(Math.random() * size, Math.random() * size, 10 + Math.random() * 30);
    }
    g.generateTexture('grass', size, size);
    g.destroy();
    this.textures.get('grass').setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** Stacked-tires obstacle (concentric treads, hub, neon rim) for pillars. */
  private makeTireStackTexture(): void {
    const size = 128;
    const g = this.add.graphics();
    const c = size / 2;
    g.fillStyle(0x16161f, 1);
    g.fillCircle(c, c, c - 3);
    g.lineStyle(2, 0x2a2a38, 0.9);
    for (let r = c - 9; r > 12; r -= 9) g.strokeCircle(c, c, r);
    g.fillStyle(0x0a0a10, 1);
    g.fillCircle(c, c, c * 0.16);
    g.fillStyle(0x3a3a4a, 0.45);
    g.fillCircle(c - c * 0.22, c - c * 0.22, c * 0.18);
    g.lineStyle(3, COLORS.cyan, 0.55);
    g.strokeCircle(c, c, c - 4);
    g.generateTexture('tirestack', size, size);
    g.destroy();
    this.textures.get('tirestack').setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** Concrete hazard barrier with amber chevrons + top-edge shading. */
  private makeBarrierTexture(): void {
    const w = 256;
    const h = 40;
    const g = this.add.graphics();
    g.fillGradientStyle(0x2a313a, 0x2a313a, 0x141a20, 0x141a20, 1, 1, 1, 1);
    g.fillRoundedRect(0, 0, w, h, 5);
    // diagonal hazard chevrons — solid amber stripe with a darker edge so each
    // chevron reads as a beveled reflective panel under the night lights.
    const sw = 16;
    const gap = 14;
    for (let x = -h; x < w; x += sw + gap) {
      const pts = [
        new Phaser.Math.Vector2(x, h),
        new Phaser.Math.Vector2(x + sw, h),
        new Phaser.Math.Vector2(x + sw + h, 0),
        new Phaser.Math.Vector2(x + h, 0),
      ];
      g.fillStyle(COLORS.amber, 0.92);
      g.fillPoints(pts, true);
      g.lineStyle(1.5, 0x1a120a, 0.5);
      g.strokePoints(pts, true);
    }
    // reflective sheen band across the middle + top highlight + outline
    g.fillStyle(0xffffff, 0.1);
    g.fillRect(0, h * 0.32, w, h * 0.18);
    g.fillStyle(0x3a444e, 0.55);
    g.fillRect(0, 0, w, 4);
    g.lineStyle(2, 0x0a0e12, 1);
    g.strokeRoundedRect(1, 1, w - 2, h - 2, 5);
    g.generateTexture('barrier', w, h);
    g.destroy();
    this.textures.get('barrier').setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** 1x1 white pixel for tints/speed-lines. */
  private makePixelTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('pixel', 1, 1);
    g.destroy();
  }
}
