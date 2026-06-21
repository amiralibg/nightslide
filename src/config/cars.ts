import type { PhysicsConfig } from './physics';

/**
 * Car roster — each model is data: a silhouette + colours (for the procedurally
 * drawn art in game/CarArt.ts) AND a `handling` profile that overrides the base
 * `drift` preset so each car FEELS distinct, not just looks distinct. The scene
 * applies these on top of the default preset when a car is selected.
 * Texture-key based, so an AI sprite could later replace a model's texture with
 * zero gameplay changes.
 */
export type CarShape = 'sport' | 'super' | 'muscle' | 'compact';

export interface CarModel {
  id: string;
  name: string;
  shape: CarShape;
  /** One-line character blurb for the garage. */
  blurb: string;
  /** Main body colour (0xRRGGBB) — realistic automotive paint. */
  body: number;
  /** Livery / accent (stripes, tail lights). */
  accent: number;
  /** Window glass tint. */
  glass: number;
  /** Physics overrides applied over the base drift preset (per-car feel). */
  handling: Partial<PhysicsConfig>;
  /**
   * Optional path to a realistic top-down sprite (under /assets/cars/, nose +x,
   * flat-lit). If present and it loads, it replaces the procedural art for this
   * car; otherwise CarArt.ts draws it. Lets CC0/AI sprites drop in per-car with
   * no gameplay change.
   */
  spriteAsset?: string;
  /** Credit cost to unlock (0 / absent = free from the start). See src/progress. */
  cost?: number;
}

export const CARS: CarModel[] = [
  {
    id: 'viper',
    name: 'Nightviper',
    shape: 'sport',
    blurb: 'Balanced all-rounder',
    body: 0xd22d2d, // racing red
    accent: 0xeef0f2, // white stripe
    glass: 0x0e1418,
    spriteAsset: 'assets/cars/viper.png',
    handling: {}, // the baseline drift feel
  },
  {
    id: 'bolt',
    name: 'Voltbolt',
    shape: 'super',
    blurb: 'Fast & planted',
    body: 0x2057c9, // electric blue
    accent: 0xc8d4e0, // silver
    glass: 0x0b1018,
    spriteAsset: 'assets/cars/bolt.png',
    cost: 2800,
    handling: {
      topSpeed: 630,
      enginePower: 960,
      frontGripMax: 1460,
      rearGripMax: 990,
      handbrakeGripMult: 0.4,
      throttleSteerHold: 0.36,
      yawInertia: 1.3,
      driftAssist: 0.68,
    },
  },
  {
    id: 'brute',
    name: 'Brute',
    shape: 'muscle',
    blurb: 'Drift spec — loose & tail-happy',
    body: 0x3b4250, // gunmetal graphite
    accent: 0xff7a1a, // orange drift livery
    glass: 0x10151b,
    spriteAsset: 'assets/cars/brute.png',
    cost: 4500,
    handling: {
      // THE drift car — this exact profile is the user-approved perfect drift feel.
      mass: 1.35,
      enginePower: 1020,
      brakeStrength: 1100,
      topSpeed: 545,
      rearGripMax: 760,
      yawInertia: 1.45,
      throttleSteerHold: 0.55,
      handbrakeGripMult: 0.28,
      maxAngularVelocity: 4.7,
    },
  },
  {
    id: 'pip',
    name: 'Pip',
    shape: 'compact',
    blurb: 'Light & flickable',
    body: 0xe8b007, // sunflower
    accent: 0x222831, // black trim
    glass: 0x141414,
    spriteAsset: 'assets/cars/pip.png',
    cost: 1200,
    handling: {
      mass: 0.82,
      topSpeed: 485,
      enginePower: 770,
      yawInertia: 0.85,
      steerRate: 7.5,
      maxSteer: 0.66,
      rearGripMax: 820,
      driftAssist: 0.8,
      maxAngularVelocity: 6.0,
    },
  },
];

export const DEFAULT_CAR = 'viper';

export function carById(id: string): CarModel {
  return CARS.find((c) => c.id === id) ?? CARS[0]!;
}

/** Phaser texture key for a model's drawn sprite. */
export function carTextureKey(id: string): string {
  return `car-${id}`;
}
