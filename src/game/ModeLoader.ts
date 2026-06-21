import { DriftScoringArena, Gymkhana, NoopMode, Survival, TimeTrial, type GameMode } from '../modes';

/** A zero-arg factory that produces a fresh mode instance. */
export type ModeFactory = () => GameMode;

/**
 * ModeLoader — the registry that maps a mode id to its factory. This is the ONLY
 * place the app enumerates modes. Adding a mode = importing it and calling
 * `registerMode(id, factory)` here; the scene, HUD and shell stay untouched.
 */
const registry = new Map<string, ModeFactory>();

export function registerMode(id: string, factory: ModeFactory): void {
  registry.set(id, factory);
}

export function createMode(id: string): GameMode {
  const factory = registry.get(id);
  if (!factory) throw new Error(`[ModeLoader] unknown mode "${id}". Registered: ${[...registry.keys()].join(', ')}`);
  return factory();
}

export function hasMode(id: string): boolean {
  return registry.has(id);
}

export function listModes(): string[] {
  return [...registry.keys()];
}

// ── built-in registrations ────────────────────────────────────────────────────
// Each mode is one line. Time Trial (Phase 5) slots in here the same way.
registerMode('sandbox', () => new NoopMode());
registerMode('scoring', () => new DriftScoringArena());
registerMode('timetrial', () => new TimeTrial());
registerMode('gymkhana', () => new Gymkhana());
registerMode('survival', () => new Survival());
