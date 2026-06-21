import gsap from 'gsap';
import type { JuiceCue } from '../game';

type PopupCue = Extract<JuiceCue, { kind: 'scorePopup' }>;

/**
 * ScorePopups — floating "+1,234 / BANKED / NEAR MISS" pops driven by the active
 * mode's juice cues. Pure presentation; it just listens and animates with GSAP.
 */
export class ScorePopups {
  private readonly layer: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'score-pops';
    root.appendChild(this.layer);
  }

  show(cue: PopupCue): void {
    const tone = cue.tone ?? 'normal';
    const el = document.createElement('div');
    el.className = `score-pop score-pop--${tone}`;
    const amount = cue.amount > 0 ? `+${cue.amount.toLocaleString('en-US')}` : '';
    el.innerHTML = cue.label
      ? `<span class="score-pop__label">${cue.label}</span>${amount ? `<span class="score-pop__amt">${amount}</span>` : ''}`
      : `<span class="score-pop__amt">${amount}</span>`;
    this.layer.appendChild(el);

    const big = tone === 'big';
    gsap.fromTo(
      el,
      { y: 14, opacity: 0, scale: big ? 0.7 : 0.85 },
      { y: 0, opacity: 1, scale: 1, duration: 0.2, ease: 'back.out(2.2)' },
    );
    gsap.to(el, {
      y: big ? -64 : -44,
      opacity: 0,
      delay: big ? 0.7 : 0.5,
      duration: 0.6,
      ease: 'power1.in',
      onComplete: () => el.remove(),
    });
  }
}
