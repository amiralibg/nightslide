import { SCORING } from '../../config';
import type { CarEvent, CarState } from '../../core';
import { EMPTY_HUD, type GameMode, type HUDModel, type ModeContext, type ResultsModel } from '../GameMode';

/**
 * DriftScoringArena — the launch mode. Chain drifts for the highest score.
 *
 * Flow of a chain:
 *   • While the car is drifting, raw points accrue (scaled by slip × speed) and
 *     a combo MULTIPLIER climbs the longer the chain is held.
 *   • Straightening briefly keeps the chain alive for a grace window (the combo
 *     timer bar drains); re-entering a drift refills it and the chain continues.
 *   • When the grace window expires, the chain BANKS: score += pending × mult,
 *     then the multiplier resets.
 *   • Crashing or scraping a wall BREAKS the chain — pending points are lost and
 *     the multiplier resets, but everything already banked is kept.
 *   • Switchbacks, 360 spins and wall near-misses drop bonus points into the
 *     live chain (and a little juice).
 *
 * It reads only `CarState` + `CarEvent` and emits HUD/Results models + juice
 * cues — it never touches the camera, DOM or physics. That's the contract.
 */
export class DriftScoringArena implements GameMode {
  readonly id = 'scoring';
  readonly displayName = 'Drift Arena';

  private ctx!: ModeContext;

  // run state
  private score = 0;
  private best = 0;
  private multiplier = 1;
  private pending = 0; // raw, unbanked points in the live chain
  private chainActive = false;
  private chainDriftSec = 0;
  private graceMs = 0;
  private nearMissCdMs = 0;

  // cached HUD values (getHUD takes no args, so update() computes these)
  private hudDrifting = false;
  private hudComboTimer01 = 0;

  onEnter(ctx: ModeContext): void {
    this.ctx = ctx;
    this.best = this.loadBest();
    this.reset();
  }

  onExit(): void {
    this.bankBest();
  }

  update(dt: number, car: Readonly<CarState>): void {
    if (this.nearMissCdMs > 0) this.nearMissCdMs -= dt * 1000;
    this.hudDrifting = car.isDrifting;

    if (car.isDrifting) {
      this.chainActive = true;
      this.chainDriftSec += dt;
      this.graceMs = SCORING.graceWindowMs; // refill grace
      this.pending += this.pointsRate(car) * dt;
      this.multiplier = Math.min(
        SCORING.maxMultiplier,
        1 + Math.floor(this.chainDriftSec / SCORING.multiplierStepSec),
      );
      this.hudComboTimer01 = 1;
    } else if (this.chainActive) {
      this.graceMs -= dt * 1000;
      this.hudComboTimer01 = Math.max(0, this.graceMs / SCORING.graceWindowMs);
      if (this.graceMs <= 0) this.bank();
    } else {
      this.hudComboTimer01 = 0;
    }
  }

  onCarEvent(event: CarEvent): void {
    switch (event.type) {
      case 'switchback':
        if (this.chainActive) {
          this.pending += SCORING.switchbackBonus;
          this.ctx.emitJuice({ kind: 'scorePopup', amount: SCORING.switchbackBonus, label: 'SWITCHBACK', tone: 'bonus' });
        }
        break;
      case 'spin':
        if (this.chainActive) {
          this.pending += SCORING.spinBonus;
          this.ctx.emitJuice({ kind: 'scorePopup', amount: SCORING.spinBonus, label: '360°', tone: 'bonus' });
        }
        break;
      case 'nearMiss':
        if (this.chainActive && this.nearMissCdMs <= 0) {
          this.nearMissCdMs = SCORING.nearMissCooldownMs;
          this.pending += SCORING.nearMissBonus;
          this.ctx.emitJuice({ kind: 'scorePopup', amount: SCORING.nearMissBonus, label: 'NEAR MISS', tone: 'bonus' });
        }
        break;
      case 'crash':
      case 'wallContact':
        this.breakChain();
        break;
      default:
        break;
    }
  }

  getHUD(): HUDModel {
    if (!this.ctx) return EMPTY_HUD;
    const pendingScore = Math.round(this.pending * this.multiplier);
    return {
      widgets: [
        { kind: 'score', label: 'SCORE', value: this.score },
        { kind: 'multiplier', value: this.multiplier, timer01: this.hudComboTimer01 },
        {
          kind: 'stat',
          label: 'DRIFT',
          value: this.chainActive ? `+${formatNum(pendingScore)}` : '—',
          emphasis: this.hudDrifting,
        },
        { kind: 'stat', label: 'BEST', value: formatNum(this.best) },
      ],
    };
  }

  getResults(): ResultsModel {
    const isNewBest = this.score >= this.best && this.score > 0;
    return {
      title: 'Drift Session',
      score: this.score,
      isNewBest,
      stats: [
        { label: 'Score', value: formatNum(this.score), highlight: true },
        { label: 'Best', value: formatNum(this.best) },
      ],
    };
  }

  isComplete(): boolean {
    return false; // endless high-score chase; ends via pause/results in Phase 4
  }

  // ── internals ─────────────────────────────────────────────────────────────────
  /** Raw points/second from the current slide (slip × speed, clamped). */
  private pointsRate(car: Readonly<CarState>): number {
    const slipF = clamp(Math.abs(car.slipAngle) / SCORING.slipRef, 0, SCORING.maxFactor);
    const speedF = clamp(car.speed / SCORING.speedRef, 0, SCORING.maxFactor);
    return SCORING.basePointsPerSec * slipF * speedF;
  }

  /** Grace expired with the chain intact → commit the chain to the score. */
  private bank(): void {
    const amount = Math.round(this.pending * this.multiplier);
    if (amount > 0) {
      this.score += amount;
      const big = amount >= SCORING.bigBankThreshold;
      this.ctx.emitJuice({ kind: 'scorePopup', amount, label: 'BANKED', tone: big ? 'big' : 'normal' });
      if (big) {
        this.ctx.emitJuice({ kind: 'slowmo', scale: SCORING.slowmoScale, ms: SCORING.slowmoMs });
        this.ctx.emitJuice({ kind: 'shake', intensity: 0.012 });
      }
      this.bankBest();
    }
    this.endChain();
  }

  /** Crash/scrape → lose the live chain (banked total is untouched). */
  private breakChain(): void {
    if (this.chainActive && this.pending > 0) {
      this.ctx.emitJuice({ kind: 'scorePopup', amount: 0, label: 'CHAIN LOST', tone: 'bad' });
    }
    this.endChain();
  }

  private endChain(): void {
    this.pending = 0;
    this.multiplier = 1;
    this.chainActive = false;
    this.chainDriftSec = 0;
    this.graceMs = 0;
    this.hudComboTimer01 = 0;
  }

  private reset(): void {
    this.score = 0;
    this.endChain();
  }

  private bankBest(): void {
    if (this.score > this.best) {
      this.best = this.score;
      this.saveBest(this.best);
    }
  }

  private loadBest(): number {
    try {
      return Number(localStorage.getItem(SCORING.bestStorageKey)) || 0;
    } catch {
      return 0;
    }
  }

  private saveBest(value: number): void {
    try {
      localStorage.setItem(SCORING.bestStorageKey, String(value));
    } catch {
      /* storage unavailable — best stays in-memory for the session */
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
function formatNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
