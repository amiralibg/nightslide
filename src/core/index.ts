/**
 * core/ — everything shared and engine-facing: the drift physics, the car
 * controller, input, events (and later camera, fx, audio, arena).
 *
 * DEPENDENCY RULE: core must never import from `modes/` or `shell/`.
 * Dependencies point inward only (modes → core → config). This is what lets a
 * new mode be a single new file.
 */
export * from './physics';
export * from './car';
export * from './input';
export * from './events';
export * from './arena';
export * from './camera';
export * from './fx';
export * from './audio';
