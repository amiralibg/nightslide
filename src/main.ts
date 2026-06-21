import { createGame, GAME_EVENTS, type GameReadyPayload } from './game';
import { mountShell } from './shell';

/**
 * NIGHTSLIDE entry point.
 *
 * Boots the Phaser game (the crisp pixel layer), mounts the DOM shell (the
 * premium layer), and — only in development — lazily attaches the Tweakpane
 * tuning panel. The dynamic import keeps Tweakpane and all dev tooling out of
 * production bundles entirely.
 */
const shellRoot = document.getElementById('shell-root');
if (!shellRoot) throw new Error('#shell-root missing from index.html');

const game = createGame('game-root');

// The HUD/overlay can subscribe immediately; events start flowing once the
// scene reports ready.
mountShell(shellRoot, game.events);

function onGameReady(payload: GameReadyPayload): void {
  if (import.meta.env.DEV) {
    // expose for ad-hoc console/automation inspection during tuning
    (window as unknown as { __ns?: GameReadyPayload; __game?: typeof game }).__ns = payload;
    (window as unknown as { __game?: typeof game }).__game = game;
    void import('./debug/TuningPanel').then(({ createTuningPanel }) => {
      const panel = createTuningPanel(payload);
      game.events.on(GAME_EVENTS.toggleDebug, () => panel.toggle());
    });
  }
}

// The scene may boot synchronously (after a reload) or asynchronously (first
// load). Check the registry for an already-published payload, otherwise wait
// for the event — so we never miss the hand-off to a registration-order race.
const existing = game.registry?.get(GAME_EVENTS.ready) as GameReadyPayload | undefined;
if (existing) onGameReady(existing);
else game.events.once(GAME_EVENTS.ready, onGameReady);
