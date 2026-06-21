import { ARENA_LIST, arenaById, carById, type ArenaConfig } from '../config';
import type { ResultsModel } from '../modes';

/**
 * Progression — the shell-tier player profile + economy. A single persisted
 * profile (XP / credits / bought cars / lifetime stats) drives a level, which
 * gates MAPS (level milestones) and funds CAR purchases (credits). Pure rules +
 * localStorage; `core/` and the modes never touch it. Modes keep producing their
 * declarative `ResultsModel`; this is a consumer of it.
 *
 * Everything tunable lives in {@link ECONOMY} (here) + `cost`/`unlockLevel` fields
 * on the car/arena config, so balancing is a data tweak.
 */

const STORAGE_KEY = 'nightslide:profile';

export const ECONOMY = {
  /** Flat XP for finishing any run. */
  BASE_XP: 40,
  /** XP per point of a score-based result. */
  SCORE_XP_RATE: 0.02,
  /** XP for completing a timed run (Time Trial — no score). */
  TIME_COMPLETE_XP: 200,
  /** Bonus XP for a new personal best. */
  NEW_BEST_XP: 100,
  /** Credits earned per XP. */
  CREDIT_RATE: 0.6,
  /** Cumulative XP needed to REACH level L (L≥1; level 1 = 0 xp). */
  cumXp: (level: number): number => Math.round(400 * Math.pow(Math.max(0, level - 1), 1.5)),
} as const;

export interface Profile {
  version: 1;
  xp: number;
  credits: number;
  /** Car ids purchased (free cars aren't listed). */
  boughtCars: string[];
  lifetime: { runs: number; totalScore: number; bestComboX: number };
}

export interface PayoutCtx {
  modeId: string;
  arenaId: string;
  carId: string;
  isNewBest: boolean;
}

export interface Payout {
  xp: number;
  credits: number;
  levelBefore: number;
  levelAfter: number;
  creditsAfter: number;
  /** Maps that crossed their unlock level on this payout (for the toast). */
  unlockedArenas: ArenaConfig[];
}

export interface LevelInfo {
  level: number;
  /** XP earned into the current level. */
  into: number;
  /** XP span of the current level. */
  span: number;
  progress01: number;
}

function freshProfile(): Profile {
  return { version: 1, xp: 0, credits: 0, boughtCars: [], lifetime: { runs: 0, totalScore: 0, bestComboX: 1 } };
}

class Progression {
  private profile: Profile = this.load();

  // ── persistence ────────────────────────────────────────────────────────────
  private load(): Profile {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshProfile();
      const p = JSON.parse(raw) as Partial<Profile>;
      const base = freshProfile();
      return {
        ...base,
        ...p,
        boughtCars: Array.isArray(p.boughtCars) ? p.boughtCars : [],
        lifetime: { ...base.lifetime, ...(p.lifetime ?? {}) },
        version: 1,
      };
    } catch {
      return freshProfile();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      /* storage unavailable — profile stays in-memory */
    }
  }

  /** Wipe progress (for testing / a "reset" option). */
  reset(): void {
    this.profile = freshProfile();
    this.save();
  }

  // ── getters ──────────────────────────────────────────────────────────────────
  get credits(): number {
    return this.profile.credits;
  }
  get xp(): number {
    return this.profile.xp;
  }
  get level(): number {
    return this.levelInfo().level;
  }

  levelInfo(xp = this.profile.xp): LevelInfo {
    let level = 1;
    while (xp >= ECONOMY.cumXp(level + 1)) level++;
    const floor = ECONOMY.cumXp(level);
    const next = ECONOMY.cumXp(level + 1);
    const span = next - floor;
    const into = xp - floor;
    return { level, into, span, progress01: span > 0 ? into / span : 1 };
  }

  // ── unlock checks ──────────────────────────────────────────────────────────────
  isCarUnlocked(id: string): boolean {
    const car = carById(id);
    return (car.cost ?? 0) === 0 || this.profile.boughtCars.includes(id);
  }

  isArenaUnlocked(id: string): boolean {
    return this.level >= (arenaById(id).unlockLevel ?? 0);
  }

  canAfford(cost: number): boolean {
    return this.profile.credits >= cost;
  }

  /** Buy a car if owned-or-affordable; returns whether it's unlocked afterwards. */
  buyCar(id: string): boolean {
    if (this.isCarUnlocked(id)) return true;
    const cost = carById(id).cost ?? 0;
    if (this.profile.credits < cost) return false;
    this.profile.credits -= cost;
    this.profile.boughtCars.push(id);
    this.save();
    return true;
  }

  // ── payout ─────────────────────────────────────────────────────────────────────
  computePayout(model: ResultsModel, ctx: PayoutCtx): { xp: number; credits: number } {
    const scorePart = Math.floor((model.score ?? 0) * ECONOMY.SCORE_XP_RATE);
    const timePart = model.score == null && model.headline ? ECONOMY.TIME_COMPLETE_XP : 0;
    const newBest = ctx.isNewBest ? ECONOMY.NEW_BEST_XP : 0;
    const xp = ECONOMY.BASE_XP + scorePart + timePart + newBest;
    return { xp, credits: Math.floor(xp * ECONOMY.CREDIT_RATE) };
  }

  /** Bank a run's payout into the profile and report what changed (for the UI). */
  applyResult(model: ResultsModel, ctx: PayoutCtx): Payout {
    const { xp, credits } = this.computePayout(model, ctx);
    const levelBefore = this.level;
    this.profile.xp += xp;
    this.profile.credits += credits;
    this.profile.lifetime.runs += 1;
    this.profile.lifetime.totalScore += model.score ?? 0;
    this.save();
    const levelAfter = this.level;
    const unlockedArenas = ARENA_LIST.filter((a) => {
      const lv = a.unlockLevel ?? 0;
      return lv > levelBefore && lv <= levelAfter;
    });
    return { xp, credits, levelBefore, levelAfter, creditsAfter: this.profile.credits, unlockedArenas };
  }
}

/** App-wide singleton. */
export const progress = new Progression();
