import Phaser from 'phaser';
import { COLORS, timeTrialCourse, type TimeTrialConfig } from '../../config';
import type { CarEvent, CarState } from '../../core';
import { EMPTY_HUD, type GameMode, type HUDModel, type ModeContext, type ResultsModel } from '../GameMode';

/**
 * TimeTrial — drive through the gates in order, fastest time wins. The course is
 * resolved PER ARENA from `ctx.arenaId` (each map authors its own line); the
 * circuit course is lap-based (checkpoints around the loop, run N laps). It spawns
 * its own gate objects, reads CarState to detect crossings, and reports its own
 * HUD/results — still one self-contained file, no core/scene changes.
 */
export class TimeTrial implements GameMode {
  readonly id = 'timetrial';
  readonly displayName = 'Time Trial';

  private ctx!: ModeContext;
  private course!: TimeTrialConfig;
  private readonly gateObjs: Phaser.GameObjects.Arc[] = [];

  private started = false;
  private finished = false;
  private startNow = 0;
  private elapsedMs = 0;
  private nextGate = 0;
  private lap = 0;
  private best = 0;

  onEnter(ctx: ModeContext): void {
    this.ctx = ctx;
    this.course = timeTrialCourse(ctx.arenaId);
    this.best = this.loadBest();
    this.started = false;
    this.finished = false;
    this.elapsedMs = 0;
    this.nextGate = 0;
    this.lap = 0;
    this.spawnGates();
    this.recolorGates();
  }

  onExit(): void {
    for (const g of this.gateObjs) g.destroy();
    this.gateObjs.length = 0;
  }

  update(_dt: number, car: Readonly<CarState>, ctx: ModeContext): void {
    if (this.finished) return;

    if (!this.started) {
      if (car.speed > this.course.startSpeed) {
        this.started = true;
        this.startNow = ctx.now;
      } else {
        return; // clock waits for the first move
      }
    }

    this.elapsedMs = ctx.now - this.startNow;

    const gate = this.course.gates[this.nextGate];
    if (gate && Math.hypot(car.x - gate.x, car.y - gate.y) < this.course.gateRadius) {
      this.nextGate++;
      this.recolorGates();
      if (this.nextGate >= this.course.gates.length) {
        const laps = this.course.laps ?? 1;
        this.lap++;
        if (this.lap >= laps) {
          this.finish();
        } else {
          this.nextGate = 0;
          this.recolorGates();
          ctx.emitJuice({ kind: 'scorePopup', amount: 0, label: `LAP ${this.lap + 1}/${laps}`, tone: 'big' });
        }
      } else {
        ctx.emitJuice({ kind: 'scorePopup', amount: 0, label: 'GATE', tone: 'bonus' });
      }
    }
  }

  onCarEvent(_event: CarEvent): void {
    // Time Trial doesn't penalise contact — purely a clock against gates.
  }

  getHUD(): HUDModel {
    if (!this.ctx) return EMPTY_HUD;
    const len = this.course.gates.length;
    const laps = this.course.laps ?? 1;
    const widgets: HUDModel['widgets'] = [{ kind: 'timer', label: 'TIME', ms: this.elapsedMs }];
    if (laps > 1) {
      widgets.push({ kind: 'stat', label: 'LAP', value: `${Math.min(this.lap + 1, laps)}/${laps}`, emphasis: this.started && !this.finished });
    }
    widgets.push(
      { kind: 'stat', label: 'GATE', value: `${Math.min(this.nextGate + 1, len)}/${len}`, emphasis: laps <= 1 && this.started && !this.finished },
      { kind: 'stat', label: 'BEST', value: this.best > 0 ? formatTime(this.best) : '—' },
    );
    return { widgets };
  }

  getResults(): ResultsModel {
    const isNewBest = this.finished && (this.best === 0 || this.elapsedMs <= this.best);
    const laps = this.course.laps ?? 1;
    return {
      title: 'Time Trial',
      headline: formatTime(this.finished ? this.elapsedMs : 0),
      isNewBest,
      stats: [
        { label: 'Time', value: formatTime(this.elapsedMs), highlight: true },
        { label: 'Best', value: this.best > 0 ? formatTime(this.best) : '—' },
        laps > 1
          ? { label: 'Laps', value: `${this.lap}/${laps}` }
          : { label: 'Gates', value: `${this.nextGate}/${this.course.gates.length}` },
      ],
    };
  }

  isComplete(): boolean {
    return this.finished;
  }

  // ── internals ─────────────────────────────────────────────────────────────────
  private finish(): void {
    this.finished = true;
    if (this.best === 0 || this.elapsedMs < this.best) {
      this.best = this.elapsedMs;
      this.saveBest(this.best);
    }
    this.ctx.emitJuice({ kind: 'scorePopup', amount: 0, label: 'FINISH', tone: 'big' });
    this.ctx.emitJuice({ kind: 'slowmo', scale: 0.5, ms: 360 });
  }

  private spawnGates(): void {
    this.course.gates.forEach((g) => {
      const ring = this.ctx.scene.add.circle(g.x, g.y, this.course.gateRadius).setStrokeStyle(4, COLORS.violet, 0.6).setDepth(5);
      ring.setFillStyle(COLORS.violet, 0.04);
      this.gateObjs.push(ring);
    });
  }

  /** Colour the next gate hot, passed gates dim-green, future gates faint. */
  private recolorGates(): void {
    this.gateObjs.forEach((ring, i) => {
      if (i < this.nextGate) ring.setStrokeStyle(3, COLORS.green, 0.35);
      else if (i === this.nextGate) ring.setStrokeStyle(5, COLORS.cyan, 0.95);
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
      /* storage unavailable — best stays in-memory */
    }
  }
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}
