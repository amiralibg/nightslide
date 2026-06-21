import Phaser from 'phaser';
import { COLORS, gymkhanaCourse, type GymkhanaConfig } from '../../config';
import type { CarEvent, CarState } from '../../core';
import { EMPTY_HUD, type GameMode, type HUDModel, type ModeContext, type ResultsModel } from '../GameMode';

/**
 * Gymkhana — a trick course. Pass the gates in order, but you're scored on STYLE:
 * drift points (slip × speed) accrue continuously, multiplied by a combo that
 * climbs the longer you stay sideways and resets if you crash. Clearing a gate
 * banks a bonus. Finish the course → results. Rewards a clean, committed line.
 *
 * Combines Time Trial's gate structure with drift scoring — yet it's still a
 * single mode file (its own gates + spawned rings), no core changes.
 */
export class Gymkhana implements GameMode {
  readonly id = 'gymkhana';
  readonly displayName = 'Gymkhana';

  private ctx!: ModeContext;
  private course!: GymkhanaConfig;
  private readonly gateObjs: Phaser.GameObjects.Arc[] = [];

  private started = false;
  private finished = false;
  private nextGate = 0;
  private score = 0;
  private best = 0;
  private chainDriftSec = 0;
  private multiplier = 1;

  onEnter(ctx: ModeContext): void {
    this.ctx = ctx;
    this.course = gymkhanaCourse(ctx.arenaId);
    this.best = this.loadBest();
    this.started = false;
    this.finished = false;
    this.nextGate = 0;
    this.score = 0;
    this.chainDriftSec = 0;
    this.multiplier = 1;
    this.spawnGates();
    this.recolorGates();
  }

  onExit(): void {
    for (const g of this.gateObjs) g.destroy();
    this.gateObjs.length = 0;
  }

  update(dt: number, car: Readonly<CarState>): void {
    if (this.finished) return;
    if (!this.started) {
      if (car.speed > this.course.startSpeed) this.started = true;
      else return;
    }

    // style points + combo
    if (car.isDrifting) {
      this.chainDriftSec += dt;
      const slipF = clamp(Math.abs(car.slipAngle) / this.course.slipRef, 0, 1.4);
      const speedF = clamp(car.speed / this.course.speedRef, 0, 1.4);
      this.multiplier = Math.min(this.course.maxMultiplier, 1 + Math.floor(this.chainDriftSec / this.course.multiplierStepSec));
      this.score += this.course.basePointsPerSec * slipF * speedF * this.multiplier * dt;
    }

    // gates
    const gate = this.course.gates[this.nextGate];
    if (gate && Math.hypot(car.x - gate.x, car.y - gate.y) < this.course.gateRadius) {
      this.score += this.course.gateBonus * this.multiplier;
      this.nextGate++;
      this.recolorGates();
      if (this.nextGate >= this.course.gates.length) this.finish();
      else this.ctx.emitJuice({ kind: 'scorePopup', amount: Math.round(this.course.gateBonus * this.multiplier), label: 'GATE', tone: 'bonus' });
    }
  }

  onCarEvent(event: CarEvent): void {
    if (this.finished) return;
    // crashing kills the style combo
    if (event.type === 'crash') {
      if (this.multiplier > 1) this.ctx.emitJuice({ kind: 'scorePopup', amount: 0, label: 'COMBO LOST', tone: 'bad' });
      this.chainDriftSec = 0;
      this.multiplier = 1;
    }
  }

  getHUD(): HUDModel {
    if (!this.ctx) return EMPTY_HUD;
    return {
      widgets: [
        { kind: 'score', label: 'STYLE', value: Math.round(this.score) },
        { kind: 'multiplier', value: this.multiplier, timer01: this.multiplier > 1 ? 1 : 0 },
        { kind: 'stat', label: 'GATE', value: `${Math.min(this.nextGate + 1, this.course.gates.length)}/${this.course.gates.length}` },
        { kind: 'stat', label: 'BEST', value: this.best > 0 ? formatNum(this.best) : '—' },
      ],
    };
  }

  getResults(): ResultsModel {
    const total = Math.round(this.score);
    const isNewBest = this.finished && total >= this.best && total > 0;
    return {
      title: 'Gymkhana',
      score: total,
      isNewBest,
      stats: [
        { label: 'Style', value: formatNum(total), highlight: true },
        { label: 'Best', value: this.best > 0 ? formatNum(this.best) : '—' },
        { label: 'Gates', value: `${this.nextGate}/${this.course.gates.length}` },
      ],
    };
  }

  isComplete(): boolean {
    return this.finished;
  }

  private finish(): void {
    this.finished = true;
    const total = Math.round(this.score);
    if (total > this.best) {
      this.best = total;
      this.saveBest(total);
    }
    this.ctx.emitJuice({ kind: 'scorePopup', amount: total, label: 'CLEAR!', tone: 'big' });
    this.ctx.emitJuice({ kind: 'slowmo', scale: 0.5, ms: 360 });
  }

  private spawnGates(): void {
    this.course.gates.forEach((g) => {
      const ring = this.ctx.scene.add.circle(g.x, g.y, this.course.gateRadius).setStrokeStyle(4, COLORS.violet, 0.55).setDepth(5);
      ring.setFillStyle(COLORS.violet, 0.04);
      this.gateObjs.push(ring);
    });
  }

  private recolorGates(): void {
    this.gateObjs.forEach((ring, i) => {
      if (i < this.nextGate) ring.setStrokeStyle(3, COLORS.green, 0.3);
      else if (i === this.nextGate) ring.setStrokeStyle(5, COLORS.magenta, 0.95);
      else ring.setStrokeStyle(3, COLORS.violet, 0.4);
    });
  }

  private loadBest(): number {
    try {
      return Number(localStorage.getItem(this.course.bestStorageKey)) || 0;
    } catch {
      return 0;
    }
  }
  private saveBest(value: number): void {
    try {
      localStorage.setItem(this.course.bestStorageKey, String(value));
    } catch {
      /* storage unavailable */
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
function formatNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
