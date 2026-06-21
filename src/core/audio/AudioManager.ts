import { AUDIO } from '../../config';
import type { CarState } from '../physics';

/**
 * AudioManager — procedural engine + tire-screech + impact audio via the Web
 * Audio API. Synthesized (no sample assets needed) and tuned low/tasteful:
 *
 *   • engine: detuned saw + sub oscillator through a lowpass; pitch tracks speed.
 *   • screech: looping noise through a bandpass, gated to active drift, gain ∝ slip.
 *   • impact: a short filtered noise burst, scaled by hit speed.
 *
 * Browsers block audio until a user gesture, so nothing is created until
 * {@link resume} is called from the first input. A global mute is provided
 * (the brief requires one). Sample-based UI sfx (Howler) slot in alongside later.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineLP: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  /** Create the audio graph + resume the context. Safe to call repeatedly. */
  resume(): void {
    if (!this.ctx) this.init();
    void this.ctx?.resume();
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Toggle global mute; returns the new muted state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : AUDIO.master, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  /** Per-frame: drive engine pitch + screech level from the car state. */
  update(s: Readonly<CarState>, topSpeed: number): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const speedFrac = clamp(s.speed / topSpeed, 0, 1);

    // engine pitch + a little body from throttle
    const freq = AUDIO.engineIdleHz + (AUDIO.engineTopHz - AUDIO.engineIdleHz) * speedFrac;
    this.engineOsc?.frequency.setTargetAtTime(freq, now, 0.04);
    this.engineSub?.frequency.setTargetAtTime(freq * 0.5, now, 0.04);
    // open the lowpass with revs so idle/coasting is a warm rumble, not a buzz;
    // only throttle + speed let the bright harmonics through.
    const cutoff = 280 + 720 * Math.max(speedFrac, s.throttle);
    this.engineLP?.frequency.setTargetAtTime(cutoff, now, 0.06);
    const engineLevel = AUDIO.engineGain * (0.18 + 0.82 * s.throttle) * (0.3 + 0.7 * speedFrac);
    this.engineGain?.gain.setTargetAtTime(engineLevel, now, 0.05);

    // tire screech gated to active drift, scaled by rear slip
    const screech = s.isDrifting ? AUDIO.screechGain * s.rearSlipSaturation : 0;
    this.screechGain?.gain.setTargetAtTime(screech, now, 0.04);
  }

  /** Play a short synthesised UI sound (hover/confirm/back/whoosh). */
  ui(name: 'hover' | 'confirm' | 'back' | 'whoosh'): void {
    this.resume();
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    switch (name) {
      case 'hover':
        this.blip(1180, now, 0.05, 0.05, 'triangle');
        break;
      case 'confirm':
        this.blip(660, now, 0.06, 0.07, 'square');
        this.blip(990, now + 0.06, 0.09, 0.07, 'square');
        break;
      case 'back':
        this.blip(620, now, 0.06, 0.06, 'square');
        this.blip(440, now + 0.05, 0.1, 0.06, 'square');
        break;
      case 'whoosh':
        this.noiseSweep(now, 0.26);
        break;
    }
  }

  /** A short pitched blip through the master bus. */
  private blip(freq: number, start: number, dur: number, gain: number, type: OscillatorType): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** A filtered-noise whoosh for screen transitions. */
  private noiseSweep(start: number, dur: number): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(400, start);
    bp.frequency.exponentialRampToValueAtTime(3200, start + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(0.12, start + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  /** One-shot impact thud, scaled by impact speed (px/s). */
  impact(impactSpeed: number): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = this.ctx.createGain();
    const level = Math.min(AUDIO.maxImpactGain, impactSpeed * AUDIO.impactGain);
    g.gain.setValueAtTime(level, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    src.connect(lp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 0.34);
  }

  // ── setup ───────────────────────────────────────────────────────────────────
  private init(): void {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : AUDIO.master;
    master.connect(ctx.destination);
    this.master = master;

    // shared noise buffer (1s of white noise) for screech + impacts
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    // engine
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineLP = ctx.createBiquadFilter();
    engineLP.type = 'lowpass';
    engineLP.frequency.value = 280; // starts mellow; update() opens it with revs
    engineLP.connect(master);
    engineGain.connect(engineLP);
    this.engineLP = engineLP;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = AUDIO.engineIdleHz;
    osc.connect(engineGain);
    osc.start();
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = AUDIO.engineIdleHz * 0.5;
    sub.connect(engineGain);
    sub.start();
    this.engineOsc = osc;
    this.engineSub = sub;
    this.engineGain = engineGain;

    // screech (looping noise → bandpass)
    const screechGain = ctx.createGain();
    screechGain.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 1.3;
    bp.connect(screechGain);
    screechGain.connect(master);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    noise.connect(bp);
    noise.start();
    this.screechGain = screechGain;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
