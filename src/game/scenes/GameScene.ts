import Phaser from 'phaser';
import {
  COLLISION,
  COLORS,
  DEFAULT_ARENA,
  DEFAULT_CAR,
  arenaById,
  DEFAULT_PRESET,
  FX,
  PHYSICS_PRESETS,
  SCORING,
  carById,
  carTextureKey,
  clonePhysics,
  type PhysicsConfig,
  type PhysicsPresetName,
} from '../../config';
import {
  Arena,
  AudioManager,
  CameraDirector,
  CarController,
  CollisionSystem,
  InputManager,
  Smoke,
  SpeedLines,
  TireMarks,
  type CarEvent,
  type CarState,
  type DiscreteAction,
  type DriveActions,
} from '../../core';
import type { GameMode, JuiceCue, ModeContext } from '../../modes';
import { createMode } from '../ModeLoader';
import { GAME_EVENTS, type GameReadyPayload, type TelemetryPayload } from '../gameEvents';

interface GameSceneData {
  modeId?: string;
}

/**
 * GameScene — the MODE-AGNOSTIC gameplay scene. It owns the world (arena +
 * collisions), the car + physics + input, the drift-aware camera, the in-game FX
 * (tire marks / smoke / speed lines) and audio, then drives whatever GameMode it
 * was started with. It never references a concrete mode — it asks the ModeLoader
 * for one by id and talks to it only through the GameMode contract.
 */
export class GameScene extends Phaser.Scene {
  private car!: CarController;
  private mode!: GameMode;
  private ctx!: ModeContext;
  private config!: PhysicsConfig;

  private arena!: Arena;
  private collisions!: CollisionSystem;
  private camDirector!: CameraDirector;
  private tireMarks!: TireMarks;
  private smoke!: Smoke;
  private speedLines!: SpeedLines;
  private audio!: AudioManager;

  private carSprite!: Phaser.GameObjects.Image;
  private carShadow!: Phaser.GameObjects.Image;
  private currentCarId = DEFAULT_CAR;
  private currentArenaId: string = DEFAULT_ARENA;
  private audioStarted = false;

  private elapsedMs = 0;
  private readonly spawn = { x: 0, y: 0, heading: 0 };
  private input2!: InputManager;

  // slow-mo (juice): a time-scale applied to the whole sim
  private timeScale = 1;
  private slowmoTarget = 1;
  private slowmoMs = 0;
  private nearMissCdMs = 0;

  // run lifecycle: `attract` = ambient menu background; `running` = live run;
  // neither = paused (frozen). Driven by shell commands.
  private attract = true;
  private running = false;
  private currentModeId = 'scoring';

  // car display size (world px) + visual rear-axle geometry for FX placement
  private static readonly CAR_LENGTH = 52;
  private static readonly CAR_WIDTH = 26;
  private static readonly REAR_OFFSET = 16;
  private static readonly HALF_TRACK = 9;

  constructor() {
    super('game');
  }

  create(data: GameSceneData): void {
    this.config = clonePhysics(DEFAULT_PRESET);

    // ── world ────────────────────────────────────────────────────────────────
    this.cameras.main.setBackgroundColor(COLORS.void);
    this.setupArena(DEFAULT_ARENA);

    // ── fx layers (depths: floor 0, marks 1, walls 3, props 4, smoke 9, car 10) ─
    this.tireMarks = new TireMarks(this, 1);
    this.smoke = new Smoke(this, 9);
    this.speedLines = new SpeedLines(this, 20);
    this.audio = new AudioManager();

    // ── car ──────────────────────────────────────────────────────────────────
    this.car = new CarController(this.config, this.spawn.x, this.spawn.y, this.spawn.heading);
    this.carShadow = this.add
      .image(this.spawn.x, this.spawn.y, 'car-shadow')
      .setDepth(8)
      .setAlpha(0.75)
      .setDisplaySize(GameScene.CAR_LENGTH * 1.2, GameScene.CAR_WIDTH * 1.5);
    this.carSprite = this.add
      .image(this.spawn.x, this.spawn.y, carTextureKey(this.currentCarId))
      .setDepth(10)
      .setDisplaySize(GameScene.CAR_LENGTH, GameScene.CAR_WIDTH);
    this.applyCar(this.currentCarId); // bake the default car's handling into the config

    // ── camera ─────────────────────────────────────────────────────────────────
    this.camDirector = new CameraDirector(this, this.carSprite);
    this.camDirector.start({ width: this.arena.width, height: this.arena.height });

    // ── input + mode ──────────────────────────────────────────────────────────
    // Boot into ATTRACT: a sandbox mode drives an ambient drift behind the shell
    // menus. The real run begins when the shell sends cmd:start.
    this.input2 = new InputManager();
    this.currentModeId = data?.modeId ?? 'scoring';
    this.mode = createMode('sandbox');
    this.ctx = {
      scene: this,
      car: this.car,
      bus: this.game.events,
      now: 0,
      arenaId: this.currentArenaId,
      // a mode's juice cue goes to the shell (on-screen pops) and is realised
      // here in the scene (slow-mo / shake).
      emitJuice: (cue: JuiceCue) => {
        this.game.events.emit(GAME_EVENTS.juice, cue);
        this.applyJuice(cue);
      },
    };

    // route car events to the mode, the shell, and the FX/audio layers
    this.car.onEvent((e: CarEvent) => {
      this.mode.onCarEvent(e);
      this.game.events.emit(GAME_EVENTS.carEvent, e);
      this.reactToEvent(e);
    });

    this.mode.onEnter(this.ctx);
    this.wireCommands();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());

    // ── announce readiness so the shell + dev panel can wire up ────────────────
    const payload: GameReadyPayload = {
      config: this.config,
      car: this.car,
      applyPreset: (name: PhysicsPresetName) => Object.assign(this.config, PHYSICS_PRESETS[name]),
    };
    this.game.events.emit(GAME_EVENTS.ready, payload);
  }

  /** Build the arena world (visuals + colliders + spawn) for an arena id. */
  private setupArena(arenaId: string): void {
    this.currentArenaId = arenaId;
    this.arena = new Arena(this, arenaById(arenaId));
    this.arena.build();
    this.collisions = new CollisionSystem(this.arena.getColliders(), this.arena.bounds);
    Object.assign(this.spawn, this.arena.spawn);
  }

  /** Swap the active map IN PLACE (no scene restart): tear down the old arena,
   *  rebuild the new one, refit the camera bounds, clear FX, respawn the car. */
  private loadArena(arenaId: string): void {
    if (arenaId === this.currentArenaId) return;
    this.arena.destroy();
    this.setupArena(arenaId);
    this.camDirector.start({ width: this.arena.width, height: this.arena.height });
    this.resetCar();
  }

  /** Listen for shell → game commands on the bus. */
  private wireCommands(): void {
    const ev = this.game.events;
    ev.on(GAME_EVENTS.cmdStart, (cmd: { modeId: string; carId?: string; arenaId?: string }) =>
      this.startMode(cmd.modeId, cmd.carId, cmd.arenaId),
    );
    ev.on(GAME_EVENTS.cmdSelectArena, (cmd: { arenaId: string }) => {
      if (this.attract) this.loadArena(cmd.arenaId); // live menu-background preview
    });
    ev.on(GAME_EVENTS.cmdResume, () => {
      if (!this.attract) this.running = true;
    });
    ev.on(GAME_EVENTS.cmdRestart, () => this.startMode(this.currentModeId));
    ev.on(GAME_EVENTS.cmdEndRun, () => this.endRun());
    ev.on(GAME_EVENTS.cmdToMenu, () => this.toAttract());
    ev.on(GAME_EVENTS.cmdTouchDrive, (d: Partial<DriveActions>) => this.input2.setTouchActions(d));
    ev.on(GAME_EVENTS.cmdTouchAction, (a: DiscreteAction) => this.input2.pressTouchAction(a));
    ev.on(GAME_EVENTS.uiSound, (name: 'hover' | 'confirm' | 'back' | 'whoosh') => this.audio.ui(name));
  }

  /** Begin (or replay) a scoring/other run. */
  private startMode(modeId: string, carId?: string, arenaId?: string): void {
    if (arenaId) this.loadArena(arenaId);
    if (carId) this.applyCar(carId);
    this.mode.onExit(this.ctx);
    this.currentModeId = modeId;
    this.mode = createMode(modeId);
    this.resetCar();
    this.timeScale = 1;
    this.slowmoMs = 0;
    this.attract = false;
    this.running = true;
    this.ctx.arenaId = this.currentArenaId;
    this.audio.resume();
    this.audioStarted = true;
    this.mode.onEnter(this.ctx);
  }

  /** End the run: surface results, then fall back to the attract background. */
  private endRun(): void {
    if (!this.running && this.attract) return;
    this.game.events.emit(GAME_EVENTS.results, this.mode.getResults());
    this.toAttract();
  }

  /** Return to the ambient menu background (no results). */
  private toAttract(): void {
    this.mode.onExit(this.ctx);
    this.mode = createMode('sandbox');
    this.mode.onEnter(this.ctx);
    this.resetCar();
    this.attract = true;
    this.running = false;
  }

  override update(_time: number, delta: number): void {
    const realDt = delta / 1000;
    this.elapsedMs += delta;
    this.ctx.now = this.elapsedMs;

    this.updateTimeScale(realDt);
    const dt = realDt * this.timeScale;

    this.handleDiscrete();

    // ATTRACT — ambient drift behind the menus (no scoring, no HUD)
    if (this.attract) {
      this.car.setInput(this.attractInput());
      this.applySurface();
      this.car.update(dt);
      this.collisions.resolve(this.car);
      this.present(this.car.getState(), dt);
      return;
    }

    // PAUSED — freeze the whole sim
    if (!this.running) return;

    // RUNNING — live run
    const drive = this.input2.sampleDrive();
    if (!this.audioStarted && (drive.throttle > 0 || drive.brake > 0 || drive.handbrake || drive.steer !== 0)) {
      this.audio.resume();
      this.audioStarted = true;
    }
    this.car.setInput(drive);
    this.applySurface();
    this.car.update(dt);

    // world collisions → impact events (FX/scoring react via the car event bus)
    const impact = this.collisions.resolve(this.car);
    if (impact > COLLISION.crashSpeed) this.car.reportEvent({ type: 'crash', impactSpeed: impact, time: this.elapsedMs });
    else if (impact > COLLISION.wallContactSpeed)
      this.car.reportEvent({ type: 'wallContact', impactSpeed: impact, time: this.elapsedMs });

    const state = this.car.getState();
    this.detectNearMiss(state, delta);

    // mode rules + HUD
    this.mode.update(dt, state, this.ctx);
    this.game.events.emit(GAME_EVENTS.hud, this.mode.getHUD());

    // a mode can declare the run over (e.g. Time Trial crossing the last gate)
    if (this.mode.isComplete()) {
      this.present(state, dt);
      this.endRun();
      return;
    }

    this.present(state, dt);
  }

  /** Shared presentation step (sprite, FX, camera, audio, HUD telemetry). */
  private present(state: Readonly<CarState>, dt: number): void {
    this.syncSprite(state);
    this.updateFx(state, dt);
    this.camDirector.update(state, this.config.topSpeed, dt);
    this.audio.update(state, this.config.topSpeed);
    this.emitTelemetry(state);
  }

  /** Sample the arena ground under the car and set its grip (grass run-off etc.). */
  private applySurface(): void {
    const s = this.car.getState();
    this.car.setSurfaceGrip(this.arena.surfaceGrip(s.x, s.y));
  }

  /** Push per-frame driving telemetry to the HUD instruments (mode-agnostic). */
  private emitTelemetry(s: Readonly<CarState>): void {
    const top = this.config.topSpeed || 1;
    const payload: TelemetryPayload = {
      speed01: Math.min(1, s.speed / top),
      // px/s → km/h, scaled so the ~560 px/s soft top reads a believable ~185 km/h
      speedKmh: Math.round(s.speed * 0.33),
      slip01: s.rearSlipSaturation,
      drifting: s.isDrifting,
    };
    this.game.events.emit(GAME_EVENTS.telemetry, payload);
  }

  /** Attract background: car sits parked behind the menus (handbrake on). */
  private attractInput() {
    return { throttle: 0, brake: 0, steer: 0, handbrake: true };
  }

  // ── input ─────────────────────────────────────────────────────────────────────
  private handleDiscrete(): void {
    for (const action of this.input2.pollDiscrete()) {
      if (action === 'toggleDebug') {
        this.game.events.emit(GAME_EVENTS.toggleDebug);
      } else if (action === 'mute') {
        this.audio.resume();
        this.audioStarted = true;
        this.audio.toggleMute();
      } else if (this.running) {
        // these only apply during a live run
        if (action === 'pause') {
          this.running = false;
          this.game.events.emit(GAME_EVENTS.pause);
        } else if (action === 'resetCar') this.resetCar();
        else if (action === 'restart') this.startMode(this.currentModeId);
      }
    }
  }

  // ── presentation ──────────────────────────────────────────────────────────────
  private syncSprite(s: Readonly<CarState>): void {
    this.carSprite.setPosition(s.x, s.y);
    this.carSprite.setRotation(s.heading);
    this.carShadow.setPosition(s.x, s.y);
    this.carShadow.setRotation(s.heading);
  }

  /** Swap the displayed car model AND its handling feel. Mutates the live config
   *  in place (base drift preset + the car's overrides) so the dev panel keeps
   *  binding to the same object. */
  private applyCar(carId: string): void {
    this.currentCarId = carId;
    this.carSprite.setTexture(carTextureKey(carId)).setDisplaySize(GameScene.CAR_LENGTH, GameScene.CAR_WIDTH);
    Object.assign(this.config, PHYSICS_PRESETS[DEFAULT_PRESET], carById(carId).handling);
  }

  private updateFx(s: Readonly<CarState>, dt: number): void {
    const cos = Math.cos(s.heading);
    const sin = Math.sin(s.heading);
    const rx = s.x - cos * GameScene.REAR_OFFSET;
    const ry = s.y - sin * GameScene.REAR_OFFSET;

    // tire marks (rear wheels) — stamp while the rear is sliding, lift otherwise
    const laying = s.rearSlipSaturation > 0.3 && s.speed > FX.markMinSpeed;
    if (laying) {
      const alpha = Math.min(FX.markMaxAlpha, FX.markBaseAlpha + s.rearSlipSaturation * FX.markSatAlpha);
      this.tireMarks.stampWheel(0, rx - sin * GameScene.HALF_TRACK, ry + cos * GameScene.HALF_TRACK, alpha);
      this.tireMarks.stampWheel(1, rx + sin * GameScene.HALF_TRACK, ry - cos * GameScene.HALF_TRACK, alpha);
    } else {
      this.tireMarks.liftWheel(0);
      this.tireMarks.liftWheel(1);
    }
    this.tireMarks.update(dt);

    // smoke at the rear axle
    this.smoke.update(s, rx, ry);

    // speed lines (screen-space)
    const speedFrac = Math.min(1, s.speed / this.config.topSpeed);
    const inv = s.speed > 1 ? 1 / s.speed : 0;
    this.speedLines.update(speedFrac, s.velocityX * inv, s.velocityY * inv, dt);
  }

  private reactToEvent(e: CarEvent): void {
    if (e.type === 'crash' || e.type === 'wallContact') {
      this.camDirector.impact(e.impactSpeed);
      this.audio.impact(e.impactSpeed);
    }
  }

  /** Realise a mode's juice cue that needs the scene (motion/time). */
  private applyJuice(cue: JuiceCue): void {
    if (cue.kind === 'slowmo') {
      this.slowmoTarget = cue.scale;
      this.slowmoMs = cue.ms;
    } else if (cue.kind === 'shake') {
      this.cameras.main.shake(160, cue.intensity, true);
    }
  }

  private updateTimeScale(realDt: number): void {
    if (this.slowmoMs > 0) {
      this.slowmoMs -= realDt * 1000;
      this.timeScale += (this.slowmoTarget - this.timeScale) * Math.min(1, realDt * 18);
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, realDt * 6);
    }
  }

  /**
   * Emit a `nearMiss` car event when the car skims a prop or wall (without
   * touching) at speed while drifting. Reuses the same circle-vs-rect gap math
   * the collision system uses, plus the perimeter bounds.
   */
  private detectNearMiss(s: Readonly<CarState>, deltaMs: number): void {
    if (this.nearMissCdMs > 0) this.nearMissCdMs -= deltaMs;
    if (!s.isDrifting || s.speed < SCORING.nearMissSpeed || this.nearMissCdMs > 0) return;

    const { x, y, radius } = this.car.getCollisionCircle();
    const b = this.arena.bounds;
    // gap from the car edge to each perimeter wall
    let minGap = Math.min(x - b.minX, b.maxX - x, y - b.minY, b.maxY - y);

    for (const r of this.arena.getColliders()) {
      const nx = clamp(x, r.x, r.x + r.w);
      const ny = clamp(y, r.y, r.y + r.h);
      const d = Math.hypot(x - nx, y - ny);
      if (d > 0) minGap = Math.min(minGap, d - radius);
    }

    if (minGap > 0 && minGap < SCORING.nearMissBand) {
      this.nearMissCdMs = SCORING.nearMissCooldownMs;
      this.car.reportEvent({ type: 'nearMiss', gap: minGap, time: this.elapsedMs });
    }
  }

  private resetCar(): void {
    this.car.respawn(this.spawn.x, this.spawn.y, this.spawn.heading);
    this.tireMarks.clear();
    this.speedLines.clear();
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
