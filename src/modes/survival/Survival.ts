import { SURVIVAL } from '../../config';
import type { CarEvent, CarState } from '../../core';
import { EMPTY_HUD, type GameMode, type HUDModel, type ModeContext, type ResultsModel } from '../GameMode';

/**
 * Survival — "hold the combo, don't die." An energy bar drains constantly; only
 * drifting refills it (the harder the slide, the more it pays); contact drains
 * it. When energy hits zero the run ends. Score is time survived.
 *
 * Another single-file GameMode: no gates, no scene objects, just the shared
 * contract (a `gauge` HUD widget + `isComplete()` + `headline` results).
 */
export class Survival implements GameMode {
  readonly id = 'survival';
  readonly displayName = 'Survival';

  private ctx!: ModeContext;
  private energy = SURVIVAL.maxEnergy;
  private aliveMs = 0;
  private started = false;
  private dead = false;
  private best = 0;
  private lowWarned = false;

  onEnter(ctx: ModeContext): void {
    this.ctx = ctx;
    this.best = this.loadBest();
    this.energy = SURVIVAL.maxEnergy;
    this.aliveMs = 0;
    this.started = false;
    this.dead = false;
    this.lowWarned = false;
  }

  onExit(): void {
    /* nothing to tear down */
  }

  update(dt: number, car: Readonly<CarState>): void {
    if (this.dead) return;
    if (!this.started) {
      if (car.speed > 30) this.started = true;
      else return;
    }

    this.aliveMs += dt * 1000;

    // drain always; drifting refills (scaled by slip × speed)
    this.energy -= SURVIVAL.drainPerSec * dt;
    if (car.isDrifting) {
      const slipF = clamp(Math.abs(car.slipAngle) / SURVIVAL.slipRef, 0, 1.3);
      const speedF = clamp(car.speed / SURVIVAL.speedRef, 0, 1.3);
      this.energy += SURVIVAL.refillPerSec * slipF * speedF * dt;
    }
    this.energy = clamp(this.energy, 0, SURVIVAL.maxEnergy);

    if (this.energy < 25 && !this.lowWarned) {
      this.lowWarned = true;
      this.ctx.emitJuice({ kind: 'scorePopup', amount: 0, label: 'KEEP DRIFTING!', tone: 'bad' });
    } else if (this.energy > 45) {
      this.lowWarned = false;
    }

    if (this.energy <= 0) this.die();
  }

  onCarEvent(event: CarEvent): void {
    if (this.dead) return;
    if (event.type === 'crash') this.energy = Math.max(0, this.energy - SURVIVAL.crashPenalty);
    else if (event.type === 'wallContact') this.energy = Math.max(0, this.energy - SURVIVAL.wallPenalty);
  }

  getHUD(): HUDModel {
    if (!this.ctx) return EMPTY_HUD;
    return {
      widgets: [
        { kind: 'timer', label: 'ALIVE', ms: this.aliveMs },
        { kind: 'gauge', label: 'ENERGY', value01: this.energy / SURVIVAL.maxEnergy, tone: this.energy < 30 ? 'bad' : 'good' },
        { kind: 'stat', label: 'BEST', value: this.best > 0 ? formatTime(this.best) : '—' },
      ],
    };
  }

  getResults(): ResultsModel {
    const isNewBest = this.dead && this.aliveMs >= this.best && this.aliveMs > 0;
    return {
      title: 'Survival',
      headline: formatTime(this.aliveMs),
      isNewBest,
      stats: [
        { label: 'Survived', value: formatTime(this.aliveMs), highlight: true },
        { label: 'Best', value: this.best > 0 ? formatTime(this.best) : '—' },
      ],
    };
  }

  isComplete(): boolean {
    return this.dead;
  }

  private die(): void {
    this.dead = true;
    if (this.aliveMs > this.best) {
      this.best = this.aliveMs;
      this.saveBest(this.best);
    }
    this.ctx.emitJuice({ kind: 'scorePopup', amount: 0, label: 'WIPED OUT', tone: 'bad' });
    this.ctx.emitJuice({ kind: 'slowmo', scale: 0.4, ms: 420 });
  }

  private loadBest(): number {
    try {
      return Number(localStorage.getItem(SURVIVAL.bestStorageKey)) || 0;
    } catch {
      return 0;
    }
  }
  private saveBest(value: number): void {
    try {
      localStorage.setItem(SURVIVAL.bestStorageKey, String(value));
    } catch {
      /* storage unavailable */
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
