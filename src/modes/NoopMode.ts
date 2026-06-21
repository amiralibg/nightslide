import type { CarEvent, CarState } from '../core';
import { EMPTY_HUD, type GameMode, type HUDModel, type ModeContext, type ResultsModel } from './GameMode';

/**
 * NoopMode — the Phase 0/1 sandbox. It implements the full GameMode contract but
 * imposes no objectives: drive freely while we tune the drift feel. It surfaces
 * a little live telemetry (speed / slip / drift state) so the slide is readable
 * even without the dev panel open. Never "completes".
 *
 * It exists to prove the scene is genuinely mode-agnostic: the exact same scene
 * will later load DriftScoringArena with zero changes.
 */
export class NoopMode implements GameMode {
  readonly id = 'sandbox';
  readonly displayName = 'Free Drive';

  private car!: Readonly<CarState>;

  onEnter(ctx: ModeContext): void {
    this.car = ctx.car.getState();
  }

  onExit(): void {
    // nothing to tear down
  }

  update(_dt: number, car: Readonly<CarState>): void {
    this.car = car;
  }

  onCarEvent(_event: CarEvent): void {
    // sandbox ignores events
  }

  getHUD(): HUDModel {
    if (!this.car) return EMPTY_HUD;
    return {
      widgets: [
        { kind: 'stat', label: 'SPEED', value: `${Math.round(this.car.speed)}` },
        { kind: 'stat', label: 'SLIP', value: `${Math.round(Math.abs(this.car.slipAngleDeg))}°`, emphasis: this.car.isDrifting },
        { kind: 'banner', text: this.car.isDrifting ? 'DRIFTING' : 'FREE DRIVE', tone: this.car.isDrifting ? 'good' : 'neutral' },
      ],
    };
  }

  getResults(): ResultsModel {
    return { title: 'Free Drive', stats: [] };
  }

  isComplete(): boolean {
    return false;
  }
}
