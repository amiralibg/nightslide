import type Phaser from 'phaser';
import gsap from 'gsap';
import { DEFAULT_ARENA, DEFAULT_CAR } from '../config';
import { GAME_EVENTS, type HUDModel, type JuiceCue, type ResultsModel, type TelemetryPayload, type UiSoundName } from '../game';
import { progress } from '../progress';
import { Cursor } from './Cursor';
import { Hud } from './Hud';
import { playIntro } from './Intro';
import { ScorePopups } from './ScorePopups';
import { buildLanding, buildModeSelect, buildPause, buildResults } from './screens';
import { TouchControls } from './TouchControls';
import type { Nav } from './ui';

type ScreenState = 'intro' | 'landing' | 'modeselect' | 'playing' | 'paused' | 'results';

/**
 * ShellApp — the premium DOM layer and the only thing that talks to the game
 * bus. It owns the screen state machine, the GSAP transitions, the HUD, the
 * score pops and the custom cursor, and implements the {@link Nav} the screens
 * call. Game ⇄ shell is entirely event-driven: the shell sends commands and
 * renders whatever the game emits; it never reaches into the scene.
 */
export class ShellApp implements Nav {
  private readonly screenLayer: HTMLDivElement;
  private readonly hud: Hud;
  private readonly popups: ScorePopups;
  private readonly hint: HTMLElement;
  private readonly touch: TouchControls | null;
  private current: HTMLElement | null = null;
  private state: ScreenState = 'intro';
  private selectedCar = DEFAULT_CAR;
  private selectedArena: string = DEFAULT_ARENA;
  private currentMode = 'scoring';
  private hintTimer: number | undefined;

  constructor(
    root: HTMLElement,
    private readonly bus: Phaser.Events.EventEmitter,
  ) {
    // mood overlay + custom cursor
    const overlay = document.createElement('div');
    overlay.className = 'fx-overlay';
    document.body.appendChild(overlay);
    new Cursor();

    // HUD + score pops live above the canvas, below the screen layer
    this.hud = new Hud(root);
    this.popups = new ScorePopups(root);

    // the screen layer holds the menus (above the HUD)
    this.screenLayer = document.createElement('div');
    this.screenLayer.className = 'screen-layer';
    root.appendChild(this.screenLayer);

    this.hint = document.createElement('div');
    this.hint.className = 'hint hint--hidden';
    this.hint.innerHTML = `
      <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive · <kbd>SPACE</kbd> handbrake</div>
      <div><kbd>ESC</kbd> pause · <kbd>T</kbd> reset · <kbd>M</kbd> mute</div>`;
    root.appendChild(this.hint);

    // on-screen controls — only on touch devices
    this.touch = TouchControls.isTouch() ? new TouchControls(root, this.bus) : null;

    this.wireBus();
    void this.boot();
  }

  // ── boot / bus ──────────────────────────────────────────────────────────────
  private async boot(): Promise<void> {
    await playIntro(this.screenLayer, () => this.ui('whoosh'));
    this.state = 'landing';
    await this.swap(buildLanding(this));
  }

  private wireBus(): void {
    this.bus.on(GAME_EVENTS.hud, (m: HUDModel) => {
      if (this.state === 'playing' || this.state === 'paused') this.hud.render(m);
    });
    this.bus.on(GAME_EVENTS.telemetry, (t: TelemetryPayload) => {
      if (this.state === 'playing' || this.state === 'paused') this.hud.renderTelemetry(t);
    });
    this.bus.on(GAME_EVENTS.juice, (cue: JuiceCue) => {
      if (cue.kind === 'scorePopup' && this.state === 'playing') this.popups.show(cue);
    });
    this.bus.on(GAME_EVENTS.pause, () => {
      if (this.state === 'playing') this.showPause();
    });
    this.bus.on(GAME_EVENTS.results, (model: ResultsModel) => this.showResults(model));
  }

  // ── Nav (called by screens) ───────────────────────────────────────────────────
  ui(name: UiSoundName): void {
    this.bus.emit(GAME_EVENTS.uiSound, name);
  }

  enterModeSelect(): void {
    this.ui('whoosh');
    this.state = 'modeselect';
    void this.swap(buildModeSelect(this, this.selectedCar, this.selectedArena));
  }

  backToLanding(): void {
    this.state = 'landing';
    void this.swap(buildLanding(this));
  }

  selectCar(carId: string): void {
    this.selectedCar = carId;
  }

  selectArena(arenaId: string): void {
    this.selectedArena = arenaId;
    // live-preview the map behind the menus (scene only swaps while in attract)
    this.bus.emit(GAME_EVENTS.cmdSelectArena, { arenaId });
  }

  buyCar(carId: string): boolean {
    return progress.buyCar(carId);
  }

  selectMode(modeId: string): void {
    this.ui('whoosh');
    this.state = 'playing';
    this.currentMode = modeId;
    this.bus.emit(GAME_EVENTS.cmdStart, { modeId, carId: this.selectedCar, arenaId: this.selectedArena });
    void this.swap(null);
    this.hud.setVisible(true);
    this.showHint(true);
  }

  resume(): void {
    this.state = 'playing';
    this.bus.emit(GAME_EVENTS.cmdResume);
    void this.swap(null);
    this.showHint(true);
  }

  restart(): void {
    this.state = 'playing';
    this.bus.emit(GAME_EVENTS.cmdRestart);
    void this.swap(null);
    this.hud.setVisible(true);
    this.showHint(true);
  }

  endRun(): void {
    // the scene replies with GAME_EVENTS.results → showResults()
    this.bus.emit(GAME_EVENTS.cmdEndRun);
  }

  toMenu(): void {
    this.ui('back');
    this.bus.emit(GAME_EVENTS.cmdToMenu);
    this.hud.setVisible(false);
    this.showHint(false);
    this.state = 'modeselect';
    void this.swap(buildModeSelect(this, this.selectedCar, this.selectedArena));
  }

  // ── pause / results (driven by the game) ──────────────────────────────────────
  private showPause(): void {
    this.state = 'paused';
    this.showHint(false);
    void this.swap(buildPause(this));
  }

  private showResults(model: ResultsModel): void {
    this.state = 'results';
    this.hud.setVisible(false);
    this.showHint(false);
    const payout = progress.applyResult(model, {
      modeId: this.currentMode,
      arenaId: this.selectedArena,
      carId: this.selectedCar,
      isNewBest: !!model.isNewBest,
    });
    void this.swap(buildResults(this, model, payout));
  }

  // ── transitions ───────────────────────────────────────────────────────────────
  private async swap(next: HTMLElement | null): Promise<void> {
    const prev = this.current;
    this.current = next;
    if (prev) {
      await gsap.to(prev, { opacity: 0, duration: 0.28, ease: 'power2.in' }).then();
      prev.remove();
    }
    if (next) {
      this.screenLayer.appendChild(next);
      gsap.fromTo(next, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
      const reveals = next.querySelectorAll('.reveal, .reveal-char');
      if (reveals.length) {
        gsap.from(reveals, { opacity: 0, y: 22, duration: 0.6, stagger: 0.06, ease: 'power3.out', delay: 0.08 });
      }
    }
  }

  /** Show the controls hint, then auto-fade it so it doesn't sit over the HUD
   *  instruments for the whole run (it's a learning aid, not a permanent readout). */
  private showHint(show: boolean): void {
    // touch controls live exactly as long as a run is active
    this.touch?.setVisible(show);
    if (this.hintTimer !== undefined) {
      clearTimeout(this.hintTimer);
      this.hintTimer = undefined;
    }
    this.hint.classList.toggle('hint--hidden', !show);
    if (show) {
      this.hintTimer = window.setTimeout(() => {
        this.hint.classList.add('hint--hidden');
        this.hintTimer = undefined;
      }, 5000);
    }
  }
}
