import gsap from 'gsap';

/**
 * Cursor — a custom single-ring cursor that eases behind the pointer and swells
 * over interactive elements (anything marked `data-cursor="hover"`). Disabled on
 * touch devices, where it just gets out of the way.
 */
export class Cursor {
  private readonly ring: HTMLDivElement;
  private readonly setRingX: (v: number) => void;
  private readonly setRingY: (v: number) => void;
  private readonly enabled: boolean;

  constructor() {
    this.enabled = window.matchMedia('(pointer: fine)').matches;

    this.ring = el('cursor-ring');
    document.body.append(this.ring);
    if (this.enabled) document.body.classList.add('has-custom-cursor');

    // ring tracks the pointer closely (snappy enough to stay precise)
    this.setRingX = gsap.quickTo(this.ring, 'x', { duration: 0.14, ease: 'power3' });
    this.setRingY = gsap.quickTo(this.ring, 'y', { duration: 0.14, ease: 'power3' });

    if (this.enabled) {
      window.addEventListener('pointermove', this.onMove, { passive: true });
      window.addEventListener('pointerover', this.onOver, { passive: true });
      window.addEventListener('pointerout', this.onOut, { passive: true });
      window.addEventListener('pointerdown', this.onDown, { passive: true });
      window.addEventListener('pointerup', this.onUp, { passive: true });
    }
  }

  private readonly onMove = (e: PointerEvent) => {
    this.setRingX(e.clientX);
    this.setRingY(e.clientY);
  };

  private readonly onOver = (e: PointerEvent) => {
    if ((e.target as HTMLElement)?.closest('[data-cursor="hover"]')) {
      this.ring.classList.add('cursor-ring--hover');
    }
  };
  private readonly onOut = (e: PointerEvent) => {
    if ((e.target as HTMLElement)?.closest('[data-cursor="hover"]')) {
      this.ring.classList.remove('cursor-ring--hover');
    }
  };
  private readonly onDown = () => this.ring.classList.add('cursor-ring--down');
  private readonly onUp = () => this.ring.classList.remove('cursor-ring--down');
}

function el(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
