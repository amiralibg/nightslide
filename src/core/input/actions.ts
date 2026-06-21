/**
 * Action map — input is described in terms of *actions*, never raw keys, so the
 * keyboard, gamepad and touch sources can all feed the same game logic and be
 * remapped in one place.
 */

/** Continuous driving intent, sampled every frame. */
export interface DriveActions {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  handbrake: boolean;
}

/** Discrete, edge-triggered UI/system actions. */
export type DiscreteAction = 'pause' | 'restart' | 'resetCar' | 'toggleDebug' | 'mute';

/** Default keyboard bindings (KeyboardEvent.code names; primary + alt). */
export const KEY_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  pause: ['Escape', 'KeyP'],
  restart: ['KeyR'],
  resetCar: ['KeyT'],
  toggleDebug: ['Backquote'],
  mute: ['KeyM'],
} as const;
