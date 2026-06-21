import Phaser from 'phaser';
import type { CarModel, CarShape } from '../config';

/**
 * CarArt — draws a glossy, top-down "Hot Wheels" car into a Graphics object so it
 * can be baked to a texture. The car points +x (nose right) at rotation 0, to
 * match the sim's heading convention. Drawn at high resolution and displayed with
 * LINEAR filtering, so it reads as a smooth die-cast toy, not a pixel rectangle.
 *
 * Layering (bottom→top): wheels → body (with a gloss gradient across its width) →
 * hood/trunk panel lines → cabin glass + roof → racing stripes → lights → outline.
 * The silhouette (taper, cabin, wing, scoop) varies per model.shape.
 */

interface ShapeSpec {
  rearHalf: number; // body half-width at the rear axle, as a fraction of W
  frontHalf: number; // body half-width at the nose
  cabinFront: number; // cabin start, fraction of body length (0 tail → 1 nose)
  cabinRear: number;
  rearAxle: number; // axle x positions, fraction of body length
  frontAxle: number;
  taper: number; // 0 = boxy, 1 = sleek taper
  wing: boolean; // rear wing bar
  scoop: boolean; // hood scoop
}

function spec(shape: CarShape): ShapeSpec {
  switch (shape) {
    case 'super':
      return { rearHalf: 0.46, frontHalf: 0.33, cabinFront: 0.36, cabinRear: 0.62, rearAxle: 0.2, frontAxle: 0.8, taper: 1, wing: true, scoop: false };
    case 'muscle':
      return { rearHalf: 0.45, frontHalf: 0.42, cabinFront: 0.38, cabinRear: 0.66, rearAxle: 0.21, frontAxle: 0.79, taper: 0.35, wing: false, scoop: true };
    case 'compact':
      return { rearHalf: 0.45, frontHalf: 0.41, cabinFront: 0.3, cabinRear: 0.72, rearAxle: 0.23, frontAxle: 0.77, taper: 0.55, wing: false, scoop: false };
    case 'sport':
    default:
      return { rearHalf: 0.41, frontHalf: 0.3, cabinFront: 0.33, cabinRear: 0.66, rearAxle: 0.2, frontAxle: 0.8, taper: 1, wing: false, scoop: false };
  }
}

export function drawCar(g: Phaser.GameObjects.Graphics, model: CarModel, L: number, W: number): void {
  const s = spec(model.shape);
  const cy = W / 2;
  const tailX = L * 0.07;
  const noseX = L * 0.95;
  const span = noseX - tailX;
  const rearHalf = W * s.rearHalf;
  const frontHalf = W * s.frontHalf;

  const bodyLight = shade(model.body, 1.4);
  const bodyMid = model.body;
  const bodyDark = shade(model.body, 0.55);
  const tire = 0x0a0a10;
  const rim = 0x4a4658;

  // ── rear wing (drawn first so the body sits in front of it) ────────────────
  if (s.wing) {
    g.fillStyle(bodyDark, 1);
    g.fillRoundedRect(tailX - L * 0.03, cy - rearHalf * 1.15, L * 0.07, rearHalf * 2.3, 4);
  }

  // ── wheels (poke out past the body edge; body overlaps their inner half) ───
  const wheelW = L * 0.15;
  const wheelH = W * 0.16;
  const drawWheel = (ax: number, sideHalf: number, dir: 1 | -1) => {
    const x = tailX + span * ax - wheelW / 2;
    const yMid = cy + dir * (sideHalf - wheelH * 0.15);
    g.fillStyle(tire, 1);
    g.fillRoundedRect(x, yMid - wheelH / 2, wheelW, wheelH, 3);
    g.fillStyle(rim, 1);
    g.fillRoundedRect(x + wheelW * 0.3, yMid - wheelH * 0.18, wheelW * 0.4, wheelH * 0.36, 2);
  };
  const rearHalfAtAxle = widthAt(s.rearAxle, rearHalf, frontHalf, s.taper);
  const frontHalfAtAxle = widthAt(s.frontAxle, rearHalf, frontHalf, s.taper);
  drawWheel(s.rearAxle, rearHalfAtAxle, -1);
  drawWheel(s.rearAxle, rearHalfAtAxle, 1);
  drawWheel(s.frontAxle, frontHalfAtAxle, -1);
  drawWheel(s.frontAxle, frontHalfAtAxle, 1);

  // ── body silhouette ────────────────────────────────────────────────────────
  const body = bodyOutline(tailX, span, cy, rearHalf, frontHalf, s.taper);
  g.fillGradientStyle(bodyLight, bodyLight, bodyDark, bodyDark, 1, 1, 1, 1);
  g.fillPoints(body, true);

  // panel lines (hood + trunk seams)
  g.lineStyle(1.5, bodyDark, 0.5);
  g.lineBetween(tailX + span * 0.7, cy - frontHalf * 0.6, tailX + span * 0.7, cy + frontHalf * 0.6);
  g.lineBetween(tailX + span * 0.28, cy - rearHalf * 0.6, tailX + span * 0.28, cy + rearHalf * 0.6);

  // hood scoop
  if (s.scoop) {
    g.fillStyle(bodyDark, 1);
    g.fillRoundedRect(tailX + span * 0.78, cy - W * 0.12, L * 0.1, W * 0.24, 3);
  }

  // ── cabin: glass tub, then a body-coloured roof over the middle ────────────
  const cabX0 = tailX + span * s.cabinFront;
  const cabX1 = tailX + span * s.cabinRear;
  const cabHalf = W * 0.27;
  g.fillStyle(model.glass, 1);
  g.fillRoundedRect(cabX0, cy - cabHalf, cabX1 - cabX0, cabHalf * 2, 6);
  // windshield sheen (front edge of the canopy)
  g.fillStyle(shade(model.glass, 2.6), 0.5);
  g.fillRoundedRect(cabX1 - (cabX1 - cabX0) * 0.32, cy - cabHalf * 0.8, (cabX1 - cabX0) * 0.22, cabHalf * 1.6, 4);
  // roof band (body colour) splitting front windshield from rear glass
  const roofMid = (cabX0 + cabX1) / 2;
  g.fillGradientStyle(bodyLight, bodyLight, bodyMid, bodyMid, 1, 1, 1, 1);
  g.fillRoundedRect(roofMid - span * 0.06, cy - cabHalf * 0.92, span * 0.12, cabHalf * 1.84, 4);

  // ── side mirrors (small nubs at the cabin's front corners) ──────────────────
  const mx = cabX1 - (cabX1 - cabX0) * 0.18;
  const mHalf = widthAt((mx - tailX) / span, rearHalf, frontHalf, s.taper);
  g.fillStyle(bodyDark, 1);
  g.fillRoundedRect(mx, cy - mHalf - W * 0.05, L * 0.05, W * 0.07, 2);
  g.fillRoundedRect(mx, cy + mHalf - W * 0.02, L * 0.05, W * 0.07, 2);

  // ── clear-coat specular sheen down the upper flank (wet/glossy read) ─────────
  g.fillStyle(shade(model.body, 1.85), 0.16);
  g.fillRoundedRect(tailX + span * 0.14, cy - rearHalf * 0.46, span * 0.66, W * 0.05, 3);

  // ── racing stripes (nose→tail, accent) ─────────────────────────────────────
  g.fillStyle(model.accent, 0.9);
  g.fillRect(tailX, cy - W * 0.06, span, W * 0.035);
  g.fillRect(tailX, cy + W * 0.025, span, W * 0.035);

  // ── lights ─────────────────────────────────────────────────────────────────
  g.fillStyle(0xfdfbff, 1); // headlights
  g.fillRoundedRect(noseX - L * 0.05, cy - frontHalf * 0.8, L * 0.045, W * 0.12, 2);
  g.fillRoundedRect(noseX - L * 0.05, cy + frontHalf * 0.8 - W * 0.12, L * 0.045, W * 0.12, 2);
  g.fillStyle(model.accent, 1); // tail lights
  g.fillRoundedRect(tailX + L * 0.005, cy - rearHalf * 0.7, L * 0.03, rearHalf * 1.4, 2);

  // ── outline for definition ──────────────────────────────────────────────────
  g.lineStyle(2, shade(model.body, 0.35), 1);
  g.strokePoints(body, true, true);
}

// ── helpers ─────────────────────────────────────────────────────────────────────
function bodyOutline(tailX: number, span: number, cy: number, rearHalf: number, frontHalf: number, taper: number): Phaser.Math.Vector2[] {
  const N = 22;
  const top: Phaser.Math.Vector2[] = [];
  const bot: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = tailX + span * t;
    const half = widthAt(t, rearHalf, frontHalf, taper);
    top.push(new Phaser.Math.Vector2(x, cy - half));
    bot.push(new Phaser.Math.Vector2(x, cy + half));
  }
  return top.concat(bot.reverse());
}

/** Body half-width along the length (t: 0 tail → 1 nose), with rounded ends. */
function widthAt(t: number, rearHalf: number, frontHalf: number, taper: number): number {
  const base = rearHalf + (frontHalf - rearHalf) * smoothstep(t) * taper + (frontHalf - rearHalf) * t * (1 - taper);
  let endFactor = 1;
  if (t < 0.12) endFactor = Math.sqrt(t / 0.12);
  else if (t > 0.88) endFactor = Math.sqrt((1 - t) / 0.12);
  return Math.max(0, base) * endFactor;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Multiply RGB by `f` (f<1 darkens, f>1 lightens), clamped per channel. */
function shade(color: number, f: number): number {
  const r = clampByte(((color >> 16) & 0xff) * f);
  const g = clampByte(((color >> 8) & 0xff) * f);
  const b = clampByte((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}
function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
