import gsap from 'gsap';
import type { UiSoundName } from '../game';

/**
 * Nav — the slice of ShellApp the screens are allowed to call. Screens describe
 * intent ("enter mode select", "select this mode"); ShellApp does the work and
 * the transitions. Keeps screen modules dumb and declarative.
 */
export interface Nav {
  ui(name: UiSoundName): void;
  enterModeSelect(): void;
  backToLanding(): void;
  selectCar(carId: string): void;
  selectArena(arenaId: string): void;
  /** Attempt to buy a car with credits; returns true if it's unlocked afterwards. */
  buyCar(carId: string): boolean;
  selectMode(modeId: string): void;
  resume(): void;
  restart(): void;
  endRun(): void;
  toMenu(): void;
}

export interface ButtonOptions {
  primary?: boolean;
  disabled?: boolean;
  sub?: string;
  onClick?: () => void;
}

/** A styled, sounded button with hover/press micro-interactions. */
export function makeButton(nav: Nav, label: string, opts: ButtonOptions = {}): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `ui-btn${opts.primary ? ' ui-btn--primary' : ''}`;
  btn.type = 'button';
  btn.innerHTML = `<span class="ui-btn__label">${label}</span>${opts.sub ? `<span class="ui-btn__sub">${opts.sub}</span>` : ''}`;

  if (opts.disabled) {
    btn.disabled = true;
    btn.classList.add('ui-btn--disabled');
    return btn;
  }

  btn.dataset.cursor = 'hover';
  btn.addEventListener('pointerenter', () => {
    nav.ui('hover');
    gsap.to(btn, { scale: 1.03, duration: 0.18, ease: 'power2.out' });
  });
  btn.addEventListener('pointerleave', () => gsap.to(btn, { scale: 1, duration: 0.25, ease: 'power2.out' }));
  btn.addEventListener('pointerdown', () => gsap.to(btn, { scale: 0.97, duration: 0.08 }));
  btn.addEventListener('pointerup', () => gsap.to(btn, { scale: 1.03, duration: 0.12 }));
  btn.addEventListener('click', () => {
    nav.ui('confirm');
    opts.onClick?.();
  });
  return btn;
}

/** Build an element from an HTML string. */
export function frag(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}
