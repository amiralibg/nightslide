import { KEY_BINDINGS, type DiscreteAction, type DriveActions } from './actions';

/**
 * InputManager — action-mapped input from keyboard, gamepad and (stubbed) touch.
 *
 * Deliberately engine-agnostic: it reads the DOM keyboard and the Gamepad API
 * directly rather than going through Phaser, so the same manager could drive any
 * renderer. Game code asks for *actions* (throttle/steer/handbrake/pause), never
 * raw keys.
 *
 *   • {@link sampleDrive} — call every frame for continuous driving intent.
 *   • {@link pollDiscrete} — call once per frame for edge-triggered UI actions
 *     (pause/restart/etc); it also advances internal edge state.
 *   • {@link setTouchActions} / {@link pressTouchAction} — hooks for the Phase 4
 *     on-screen touch controls.
 */
export class InputManager {
  private readonly keysDown = new Set<string>();
  private readonly keysJustPressed = new Set<string>();
  private touch: Partial<DriveActions> = {};
  private readonly touchDiscrete = new Set<DiscreteAction>();

  private prevPadButtons: boolean[] = [];
  private gamepadIndex: number | null = null;

  private static readonly STICK_DEADZONE = 0.12;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.isBound(e.code)) e.preventDefault();
    if (!e.repeat && !this.keysDown.has(e.code)) this.keysJustPressed.add(e.code);
    this.keysDown.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
  };
  private readonly onPadConnect = (e: GamepadEvent) => {
    this.gamepadIndex = e.gamepad.index;
  };
  private readonly onPadDisconnect = (e: GamepadEvent) => {
    if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('gamepadconnected', this.onPadConnect);
    window.addEventListener('gamepaddisconnected', this.onPadDisconnect);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('gamepadconnected', this.onPadConnect);
    window.removeEventListener('gamepaddisconnected', this.onPadDisconnect);
  }

  /** Combined continuous driving intent for this frame. */
  sampleDrive(): DriveActions {
    // keyboard (digital)
    const kThrottle = this.anyDown(KEY_BINDINGS.throttle) ? 1 : 0;
    const kBrake = this.anyDown(KEY_BINDINGS.brake) ? 1 : 0;
    const kSteer = (this.anyDown(KEY_BINDINGS.right) ? 1 : 0) - (this.anyDown(KEY_BINDINGS.left) ? 1 : 0);
    const kHand = this.anyDown(KEY_BINDINGS.handbrake);

    // gamepad (analog) — standard mapping: LS x = steer, RT = throttle, LT = brake, A = handbrake
    const pad = this.getPad();
    let gThrottle = 0;
    let gBrake = 0;
    let gSteer = 0;
    let gHand = false;
    if (pad) {
      gThrottle = pad.buttons[7]?.value ?? 0;
      gBrake = pad.buttons[6]?.value ?? 0;
      const sx = pad.axes[0] ?? 0;
      gSteer = Math.abs(sx) > InputManager.STICK_DEADZONE ? sx : 0;
      gHand = pad.buttons[0]?.pressed ?? false;
    }

    // touch (stub) overrides when present
    const t = this.touch;

    return {
      throttle: clamp01(Math.max(kThrottle, gThrottle, t.throttle ?? 0)),
      brake: clamp01(Math.max(kBrake, gBrake, t.brake ?? 0)),
      steer: clamp(pick(t.steer, gSteer, kSteer), -1, 1),
      handbrake: kHand || gHand || !!t.handbrake,
    };
  }

  /** Edge-triggered UI/system actions that fired since the last call. */
  pollDiscrete(): ReadonlySet<DiscreteAction> {
    const out = new Set<DiscreteAction>();

    const check = (action: DiscreteAction, codes: readonly string[]) => {
      for (const c of codes) if (this.keysJustPressed.has(c)) out.add(action);
    };
    check('pause', KEY_BINDINGS.pause);
    check('restart', KEY_BINDINGS.restart);
    check('resetCar', KEY_BINDINGS.resetCar);
    check('toggleDebug', KEY_BINDINGS.toggleDebug);
    check('mute', KEY_BINDINGS.mute);

    // gamepad edges: Start (9) = pause, Select/Back (8) = restart
    const pad = this.getPad();
    if (pad) {
      if (this.padEdge(pad, 9)) out.add('pause');
      if (this.padEdge(pad, 8)) out.add('restart');
      this.prevPadButtons = pad.buttons.map((b) => b.pressed);
    }

    // touch-issued discretes
    for (const a of this.touchDiscrete) out.add(a);
    this.touchDiscrete.clear();

    this.keysJustPressed.clear();
    return out;
  }

  /** Phase 4 touch hook: set continuous touch intent (merged each frame). */
  setTouchActions(actions: Partial<DriveActions>): void {
    this.touch = actions;
  }

  /** Phase 4 touch hook: queue a discrete action from an on-screen button. */
  pressTouchAction(action: DiscreteAction): void {
    this.touchDiscrete.add(action);
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private anyDown(codes: readonly string[]): boolean {
    for (const c of codes) if (this.keysDown.has(c)) return true;
    return false;
  }

  private isBound(code: string): boolean {
    for (const codes of Object.values(KEY_BINDINGS)) {
      if ((codes as readonly string[]).includes(code)) return true;
    }
    return false;
  }

  private getPad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    if (this.gamepadIndex !== null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    // fall back to the first connected pad
    for (const p of pads) if (p) return p;
    return null;
  }

  private padEdge(pad: Gamepad, index: number): boolean {
    const now = pad.buttons[index]?.pressed ?? false;
    const prev = this.prevPadButtons[index] ?? false;
    return now && !prev;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
/** First defined / non-zero of the candidates (touch > gamepad > keyboard). */
function pick(touch: number | undefined, gamepad: number, keyboard: number): number {
  if (touch !== undefined && touch !== 0) return touch;
  if (gamepad !== 0) return gamepad;
  return keyboard;
}
