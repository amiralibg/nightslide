import gsap from 'gsap';
import type { HUDModel, HUDWidget, TelemetryPayload } from '../game';

/**
 * Hud — renders whatever the ACTIVE MODE describes via its HUDModel, PLUS a
 * persistent driving-instrument cluster (speedometer + drift gauge) fed by
 * per-frame telemetry that's independent of the mode. It knows nothing about
 * scoring, time trials, etc.; it just routes each widget to a screen ZONE by its
 * `kind`:
 *   - score / timer / stat → bottom-left instrument panel (the primary readout)
 *   - multiplier           → top-right combo chip
 *   - gauge                → top-right gauge slot (e.g. Survival energy)
 *   - banner               → top-center pill
 *
 * To stay at 60fps it rebuilds the DOM skeleton only when the widget *structure*
 * changes, then writes fresh values into cached nodes each frame. GSAP adds the
 * polish (score roll, multiplier punch). The speedometer is plain CSS/SVG driven
 * by a stroke-dasharray, so it's cheap to update every frame.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly primaryEl: HTMLDivElement; // bottom-left instrument cluster
  private readonly cornerEl: HTMLDivElement; // top-right combo / gauges

  // speedometer
  private readonly speedoEl: HTMLDivElement;
  private readonly speedoFill: SVGPathElement;
  private readonly speedoNum: HTMLElement;

  private signature = '';
  private valueNodes: Array<HTMLElement | null> = [];
  private extraNodes: Array<HTMLElement | null> = []; // e.g. combo timer fills

  // animation state
  private readonly scoreObj = { val: 0 };
  private scoreTarget = -1;
  private lastMult = 1;
  private lastSpeedKmh = -1;

  constructor(root: HTMLElement) {
    const hud = document.createElement('div');
    hud.className = 'hud hud--hidden';
    hud.innerHTML = `
      <div class="hud__brand">NIGHT<b>SLIDE</b></div>
      <div class="hud__banner"></div>
      <div class="hud__corner"></div>
      <div class="hud__primary"></div>
      <div class="hud__speedo">
        <svg class="speedo__svg" viewBox="0 0 120 80" aria-hidden="true">
          <path class="speedo__track" d="M12 66 A48 48 0 0 1 108 66" pathLength="100" />
          <path class="speedo__fill" d="M12 66 A48 48 0 0 1 108 66" pathLength="100" />
        </svg>
        <div class="speedo__readout">
          <span class="speedo__num">0</span>
          <span class="speedo__unit">km/h</span>
        </div>
        <div class="speedo__drift">DRIFT</div>
      </div>
    `;
    root.appendChild(hud);
    this.root = hud;
    this.bannerEl = hud.querySelector('.hud__banner') as HTMLDivElement;
    this.primaryEl = hud.querySelector('.hud__primary') as HTMLDivElement;
    this.cornerEl = hud.querySelector('.hud__corner') as HTMLDivElement;
    this.speedoEl = hud.querySelector('.hud__speedo') as HTMLDivElement;
    this.speedoFill = hud.querySelector('.speedo__fill') as unknown as SVGPathElement;
    this.speedoNum = hud.querySelector('.speedo__num') as HTMLElement;
  }

  /** Show/hide the whole HUD (in-run only). */
  setVisible(visible: boolean): void {
    this.root.classList.toggle('hud--hidden', !visible);
  }

  render(model: HUDModel): void {
    const widgets = model.widgets;
    const sig = widgets.map((w) => w.kind + ('label' in w ? `:${w.label}` : '')).join('|');
    if (sig !== this.signature) {
      this.rebuild(widgets);
      this.signature = sig;
    }
    this.update(widgets);
  }

  /** Update the persistent speedometer + drift gauge (every frame, any mode). */
  renderTelemetry(t: TelemetryPayload): void {
    this.speedoFill.style.strokeDasharray = `${clamp01(t.speed01) * 100} 100`;
    if (t.speedKmh !== this.lastSpeedKmh) {
      this.speedoNum.textContent = String(t.speedKmh);
      this.lastSpeedKmh = t.speedKmh;
    }
    this.speedoEl.classList.toggle('hud__speedo--drift', t.drifting);
    this.speedoEl.style.setProperty('--slip', clamp01(t.slip01).toFixed(2));
  }

  /** Build the DOM skeleton + cache the value/extra nodes per widget index. */
  private rebuild(widgets: HUDWidget[]): void {
    this.primaryEl.innerHTML = '';
    this.cornerEl.innerHTML = '';
    this.bannerEl.textContent = '';
    this.bannerEl.className = 'hud__banner';
    this.valueNodes = [];
    this.extraNodes = [];

    for (const w of widgets) {
      switch (w.kind) {
        case 'banner':
          this.valueNodes.push(this.bannerEl);
          this.extraNodes.push(null);
          break;

        case 'multiplier': {
          const chip = document.createElement('div');
          chip.className = 'hud-combo';
          const label = el('div', 'hud-combo__label', 'Combo');
          const value = el('div', 'hud-combo__value');
          const bar = document.createElement('div');
          bar.className = 'hud-combo__bar';
          const fill = el('div', 'hud-combo__fill');
          bar.appendChild(fill);
          chip.append(label, value, bar);
          this.cornerEl.appendChild(chip);
          this.valueNodes.push(value);
          this.extraNodes.push(fill);
          break;
        }

        case 'gauge': {
          const wrap = document.createElement('div');
          wrap.className = 'hud-gauge-wrap';
          const label = el('div', 'hud-stat__label', w.label);
          const bar = document.createElement('div');
          bar.className = 'hud-gauge';
          const fill = el('div', 'hud-gauge__fill');
          bar.appendChild(fill);
          wrap.append(label, bar);
          this.cornerEl.appendChild(wrap);
          this.valueNodes.push(fill);
          this.extraNodes.push(null);
          break;
        }

        default: {
          // score / timer / stat → the bottom-left instrument cluster
          const stat = document.createElement('div');
          stat.className = w.kind === 'score' ? 'hud-stat hud-stat--primary' : 'hud-stat';
          const label = el('div', 'hud-stat__label', labelFor(w));
          const value = el('div', 'hud-stat__value');
          stat.append(label, value);
          this.primaryEl.appendChild(stat);
          this.valueNodes.push(value);
          this.extraNodes.push(null);
        }
      }
    }
  }

  /** Write fresh values into the cached nodes (cheap, runs every frame). */
  private update(widgets: HUDWidget[]): void {
    widgets.forEach((w, i) => {
      const node = this.valueNodes[i];
      if (!node) return;
      switch (w.kind) {
        case 'score':
          this.rollScore(node, w.value);
          break;
        case 'multiplier': {
          node.textContent = Number.isInteger(w.value) ? `×${w.value}` : `×${w.value.toFixed(1)}`;
          this.punchMult(node, w.value);
          const fill = this.extraNodes[i];
          if (fill) fill.style.transform = `scaleX(${clamp01(w.timer01)})`;
          break;
        }
        case 'stat': {
          node.textContent = w.value;
          node.parentElement?.classList.toggle('hud-stat--emphasis', !!w.emphasis);
          break;
        }
        case 'timer':
          node.textContent = formatTime(w.ms);
          break;
        case 'gauge':
          node.style.transform = `scaleX(${clamp01(w.value01)})`;
          node.classList.toggle('hud-gauge__fill--bad', w.tone === 'bad');
          break;
        case 'banner':
          node.textContent = w.text;
          node.className = `hud__banner hud__banner--${w.tone ?? 'neutral'}`;
          break;
      }
    });
  }

  /** Roll the score toward its new value with GSAP (banks are chunky, so this
   *  fires only when the total actually changes). */
  private rollScore(node: HTMLElement, target: number): void {
    if (target === this.scoreTarget) return;
    this.scoreTarget = target;
    gsap.to(this.scoreObj, {
      val: target,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => {
        node.textContent = formatNum(this.scoreObj.val);
      },
    });
    gsap.fromTo(node, { scale: 1.18 }, { scale: 1, duration: 0.35, ease: 'back.out(2.4)' });
  }

  /** Punch the multiplier element each time it climbs a step. */
  private punchMult(node: HTMLElement, value: number): void {
    if (value > this.lastMult) {
      gsap.fromTo(node, { scale: 1.5 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
    }
    this.lastMult = value;
  }
}

/** Small DOM helper: element with class + optional text. */
function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function labelFor(w: HUDWidget): string {
  switch (w.kind) {
    case 'score':
      return w.label;
    case 'multiplier':
      return 'COMBO';
    case 'stat':
      return w.label;
    case 'timer':
      return w.label;
    default:
      return '';
  }
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
function formatTime(ms: number): string {
  const s = ms / 1000;
  return `${s.toFixed(2)}s`;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
