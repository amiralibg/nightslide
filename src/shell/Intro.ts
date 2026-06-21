import gsap from 'gsap';
import { frag } from './ui';

/**
 * playIntro — the loading reveal. A neon line sweeps, the wordmark clips in, a
 * boot counter ticks to 100, then the whole panel lifts away to hand off to the
 * landing. A real sequence, not a spinner. Resolves when it's done.
 */
export function playIntro(root: HTMLElement, onWhoosh: () => void): Promise<void> {
  const el = frag(`
    <section class="screen screen--intro">
      <div class="intro__inner">
        <div class="intro__line"></div>
        <h1 class="intro__word"><span>NIGHTSLIDE</span></h1>
        <div class="intro__meta">
          <span class="intro__sys">SYS · DRIFT CORE</span>
          <span class="intro__count">000</span>
        </div>
      </div>
    </section>
  `);
  root.appendChild(el);

  const word = el.querySelector('.intro__word span') as HTMLElement;
  const line = el.querySelector('.intro__line') as HTMLElement;
  const count = el.querySelector('.intro__count') as HTMLElement;
  const counter = { v: 0 };

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => {
        el.remove();
        resolve();
      },
    });
    tl.set(word, { clipPath: 'inset(0 100% 0 0)', filter: 'blur(6px)' })
      .fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.inOut' })
      .to(word, { clipPath: 'inset(0 0% 0 0)', filter: 'blur(0px)', duration: 0.7, ease: 'power2.out' }, '-=0.15')
      .to(
        counter,
        {
          v: 100,
          duration: 0.9,
          ease: 'power1.inOut',
          onUpdate: () => {
            count.textContent = String(Math.round(counter.v)).padStart(3, '0');
          },
        },
        '<',
      )
      .to(el.querySelector('.intro__meta'), { opacity: 0.4, duration: 0.2 }, '-=0.2')
      .add(() => onWhoosh())
      .to(el, { yPercent: -100, duration: 0.7, ease: 'power3.inOut' }, '+=0.15');
  });
}
