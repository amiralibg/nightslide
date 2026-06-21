/**
 * config/ — the single home for every tunable constant in NIGHTSLIDE.
 * Physics presets, the color system, and (later) scoring rules live here so
 * game feel is reproducible and nothing is hardcoded inside logic.
 */
export * from './palette';
export * from './physics';
export * from './arenas';
export * from './fx';
export * from './scoring';
export * from './timeTrial';
export * from './cars';
export * from './survival';
export * from './gymkhana';

/** Global feel/runtime constants that don't belong to a single subsystem. */
export const RUNTIME = {
  /** Fixed physics timestep (s). The sim is integrated in slices of this size. */
  fixedStep: 1 / 120,
  /** Max physics substeps per frame — caps the spiral-of-death after a stall. */
  maxSubSteps: 5,
  /** Internal design resolution of the game canvas (scaled up, pixel-crisp). */
  gameWidth: 640,
  gameHeight: 360,
  /** Default camera zoom for the pixel layer. */
  cameraZoom: 1,
  /** Car collision circle radius (px) used by the arena collision system. */
  carCollisionRadius: 15,
} as const;
