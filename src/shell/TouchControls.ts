import type Phaser from 'phaser';
import { GAME_EVENTS, type DriveActions } from '../game';

/**
 * On-screen touch controls for mobile — a split layout that fits a drift game
 * far better than a 2-axis stick: the LEFT thumb steers (relative horizontal
 * drag → analog −1..1), the RIGHT thumb pins throttle + triggers the handbrake
 * (the drift initiator). Throttle is a held button, not part of the steer axis,
 * so the player never fights diagonals.
 *
 * Pure DOM. It talks to the game only over the bus (cmdTouchDrive /
 * cmdTouchAction) — it never reaches into the scene. Shown only on touch
 * devices and only during a live run.
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly drive: Partial<DriveActions> = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private steerOrigin = 0;

  /** Pixels of horizontal drag for full lock. */
  private static readonly FULL_LOCK_PX = 90;

  constructor(parent: HTMLElement, private readonly bus: Phaser.Events.EventEmitter) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls touch-controls--hidden';
    this.root.innerHTML = `
      <div class="tc-steer" aria-label="Steer">
        <div class="tc-steer__knob"></div>
        <span class="tc-steer__hint">STEER</span>
      </div>
      <button class="tc-pause" aria-label="Pause">II</button>
      <div class="tc-pedals">
        <button class="tc-btn tc-btn--hand" aria-label="Handbrake">DRIFT</button>
        <button class="tc-btn tc-btn--rev" aria-label="Brake / reverse">REV</button>
        <button class="tc-btn tc-btn--gas" aria-label="Throttle">GAS</button>
      </div>`;
    parent.appendChild(this.root);

    this.wireSteer(this.root.querySelector('.tc-steer') as HTMLElement);
    this.wireHold(this.root.querySelector('.tc-btn--gas') as HTMLElement, 'throttle', 1);
    this.wireHold(this.root.querySelector('.tc-btn--rev') as HTMLElement, 'brake', 1);
    this.wireHold(this.root.querySelector('.tc-btn--hand') as HTMLElement, 'handbrake', true);
    (this.root.querySelector('.tc-pause') as HTMLElement).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.bus.emit(GAME_EVENTS.cmdTouchAction, 'pause');
    });
  }

  /** Show only when this is a touch device. */
  static isTouch(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  setVisible(show: boolean): void {
    this.root.classList.toggle('touch-controls--hidden', !show);
    // lets the HUD reflow its bottom corners up, out of the thumbs' way
    document.body.classList.toggle('touch-active', show);
    if (!show) this.reset(); // drop any held input when leaving the run
  }

  private reset(): void {
    this.drive.throttle = 0;
    this.drive.brake = 0;
    this.drive.steer = 0;
    this.drive.handbrake = false;
    this.emit();
    (this.root.querySelector('.tc-steer__knob') as HTMLElement).style.transform = 'translateX(0)';
  }

  private emit(): void {
    this.bus.emit(GAME_EVENTS.cmdTouchDrive, { ...this.drive });
  }

  /** Relative-drag steering: touch anywhere in the pad, slide left/right. */
  private wireSteer(pad: HTMLElement): void {
    const knob = pad.querySelector('.tc-steer__knob') as HTMLElement;
    let active = -1; // pointerId
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = e.pointerId;
      this.steerOrigin = e.clientX;
      pad.setPointerCapture(e.pointerId);
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== active) return;
      const dx = e.clientX - this.steerOrigin;
      const s = Math.max(-1, Math.min(1, dx / TouchControls.FULL_LOCK_PX));
      this.drive.steer = s;
      knob.style.transform = `translateX(${s * 40}px)`;
      this.emit();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = -1;
      this.drive.steer = 0;
      knob.style.transform = 'translateX(0)';
      this.emit();
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  /** A button that sets `key` while held. */
  private wireHold<K extends keyof DriveActions>(btn: HTMLElement, key: K, on: DriveActions[K]): void {
    const press = (e: PointerEvent) => {
      e.preventDefault();
      this.drive[key] = on;
      btn.classList.add('tc-btn--on');
      this.emit();
    };
    const release = () => {
      this.drive[key] = (typeof on === 'number' ? 0 : false) as DriveActions[K];
      btn.classList.remove('tc-btn--on');
      this.emit();
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  }
}
