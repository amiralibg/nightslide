import gsap from 'gsap';
import { ARENA_LIST, CARS, arenaById, type ArenaConfig, type CarModel } from '../config';
import type { ResultsModel } from '../game';
import { progress, type Payout } from '../progress';
import { frag, makeButton, type Nav } from './ui';

/**
 * Screen builders for the shell. Each returns a root element with its buttons
 * already wired to the Nav. ShellApp mounts them and runs the reveal. Keeping
 * these as plain builders (not classes) keeps them readable and stateless.
 */

const FUTURE_MODES = [
  { id: 'scoring', title: 'Drift Arena', tag: 'Chain drifts for the high score.', soon: false },
  { id: 'timetrial', title: 'Time Trial', tag: 'Race the clock through the gates.', soon: false },
  { id: 'gymkhana', title: 'Gymkhana', tag: 'Style through the trick course.', soon: false },
  { id: 'survival', title: 'Survival', tag: 'Hold the combo. Don’t die.', soon: false },
] as const;

// ── landing ───────────────────────────────────────────────────────────────────
export function buildLanding(nav: Nav): HTMLElement {
  const el = frag(`
    <section class="screen screen--landing">
      <div class="landing__inner">
        <div class="landing__kicker reveal">Midnight street drift</div>
        <h1 class="landing__title"><span class="reveal-char">NIGHT</span><span class="reveal-char accent">SLIDE</span></h1>
        <p class="landing__tag reveal">Chain the slide. Bank the combo. Beat your best.</p>
        <div class="landing__cta reveal"></div>
      </div>
      <div class="landing__foot reveal">Keyboard · Gamepad · 2026</div>
    </section>
  `);
  el.querySelector('.landing__cta')!.appendChild(
    makeButton(nav, 'ENTER', { primary: true, onClick: () => nav.enterModeSelect() }),
  );
  return el;
}

// ── mode select ─────────────────────────────────────────────────────────────────
export function buildModeSelect(nav: Nav, selectedCar: string, selectedArena: string): HTMLElement {
  const el = frag(`
    <section class="screen screen--modes">
      <header class="modes__head reveal">
        <button class="icon-btn" data-cursor="hover" aria-label="Back">←</button>
        <h2 class="modes__title">Select mode</h2>
        <div class="wallet"></div>
      </header>
      <div class="picks reveal">
        <div class="garage">
          <div class="garage__label">Garage</div>
          <div class="garage__strip garage__strip--cars"></div>
        </div>
        <div class="garage">
          <div class="garage__label">Map</div>
          <div class="garage__strip garage__strip--maps"></div>
        </div>
      </div>
      <div class="modes__grid"></div>
    </section>
  `);
  el.querySelector('.icon-btn')!.addEventListener('click', () => {
    nav.ui('back');
    nav.backToLanding();
  });

  const wallet = el.querySelector('.wallet') as HTMLElement;
  const carStrip = el.querySelector('.garage__strip--cars') as HTMLElement;
  const mapStrip = el.querySelector('.garage__strip--maps') as HTMLElement;
  const grid = el.querySelector('.modes__grid') as HTMLElement;
  let chosenCar = selectedCar;
  let chosenArena = selectedArena;

  const renderWallet = () => {
    const info = progress.levelInfo();
    wallet.innerHTML = `
      <div class="wallet__lvl">LVL ${info.level}</div>
      <div class="wallet__bar"><div class="wallet__fill" style="transform:scaleX(${info.progress01.toFixed(3)})"></div></div>
      <div class="wallet__cr">◈ ${progress.credits.toLocaleString('en-US')}</div>`;
  };

  // garage: pick a car (or buy a locked one with credits)
  const markCar = (id: string) => carStrip.querySelectorAll('.car-chip').forEach((c) => c.classList.toggle('car-chip--on', (c as HTMLElement).dataset.id === id));
  const renderCars = () => {
    carStrip.innerHTML = '';
    for (const car of CARS) {
      const chip = makeCarChip(car, car.id === chosenCar);
      chip.dataset.id = car.id;
      chip.addEventListener('click', () => {
        if (chip.classList.contains('car-chip--on')) return;
        if (!progress.isCarUnlocked(car.id)) {
          if (nav.buyCar(car.id)) {
            nav.ui('confirm');
            chosenCar = car.id;
            nav.selectCar(car.id);
            renderCars();
            renderWallet();
          } else {
            nav.ui('back');
            bump(chip);
          }
          return;
        }
        nav.ui('hover');
        chosenCar = car.id;
        nav.selectCar(car.id);
        markCar(car.id);
      });
      carStrip.appendChild(chip);
    }
  };

  // map: pick an arena (level-gated). Each map offers only its sensible modes,
  // so the mode grid re-renders on change.
  const renderMaps = () => {
    mapStrip.innerHTML = '';
    for (const arena of ARENA_LIST) {
      const chip = makeMapChip(arena, arena.id === chosenArena);
      chip.dataset.id = arena.id;
      chip.addEventListener('click', () => {
        if (chip.classList.contains('car-chip--on')) return;
        if (!progress.isArenaUnlocked(arena.id)) {
          nav.ui('back');
          bump(chip);
          return;
        }
        nav.ui('hover');
        nav.selectArena(arena.id);
        chosenArena = arena.id;
        mapStrip.querySelectorAll('.car-chip').forEach((c) => c.classList.toggle('car-chip--on', (c as HTMLElement).dataset.id === arena.id));
        renderModeGrid(grid, nav, arena.id);
      });
      mapStrip.appendChild(chip);
    }
  };

  renderWallet();
  renderCars();
  renderMaps();
  renderModeGrid(grid, nav, chosenArena);
  return el;
}

/** A quick "denied" shake on a locked chip. */
function bump(el: HTMLElement): void {
  gsap.fromTo(el, { x: -4 }, { x: 0, duration: 0.4, ease: 'elastic.out(1.6, 0.4)' });
}

/** Fill the mode grid with the cards this arena offers. */
function renderModeGrid(grid: HTMLElement, nav: Nav, arenaId: string): void {
  grid.innerHTML = '';
  const offered = arenaById(arenaId).modes;
  for (const id of offered) {
    const meta = FUTURE_MODES.find((m) => m.id === id);
    if (meta) grid.appendChild(makeCard(nav, meta));
  }
}

/** A clickable map preview chip — a true data-driven minimap of the arena. Maps are
 *  LEVEL-gated, so a locked one shows the level it opens at. */
function makeMapChip(arena: ArenaConfig, selected: boolean): HTMLElement {
  const unlocked = progress.isArenaUnlocked(arena.id);
  const badge = unlocked ? '' : `<span class="chip-lock">LV ${arena.unlockLevel ?? 0}</span>`;
  return frag(`
    <button class="car-chip map-chip${selected ? ' car-chip--on' : ''}${unlocked ? '' : ' car-chip--locked'}" data-cursor="hover">
      ${arenaSvg(arena)}
      <span class="car-chip__name">${arena.name}</span>
      ${badge}
    </button>
  `);
}

/** Top-down minimap built straight from the arena data (bounds + props + spawn). */
function arenaSvg(arena: ArenaConfig): string {
  const pad = 3;
  const vw = 64;
  const vh = (arena.height / arena.width) * vw;
  const sx = (vw - pad * 2) / arena.width;
  const sy = (vh - pad * 2) / arena.height;
  const propColor = (kind: string) => (kind === 'pillar' ? '#34d1c4' : kind === 'wall' ? '#3a444e' : '#ffa033');
  const props = arena.props
    .map((p) => {
      const x = pad + p.x * sx;
      const y = pad + p.y * sy;
      const w = Math.max(1, p.w * sx);
      const h = Math.max(1, p.h * sy);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="0.6" fill="${propColor(p.kind)}" opacity="0.85"/>`;
    })
    .join('');
  const spawnX = pad + arena.spawn.x * sx;
  const spawnY = pad + arena.spawn.y * sy;
  // circuit ribbon (closed centerline) drawn as a stroked loop
  let track = '';
  let bg = '#0b0f14';
  if (arena.track) {
    bg = '#16210f'; // grass
    const pts = arena.track.centerline.map((p) => `${(pad + p.x * sx).toFixed(1)},${(pad + p.y * sy).toFixed(1)}`).join(' ');
    const tw = Math.max(3, arena.track.width * sx * 0.8);
    track = `<polygon points="${pts}" fill="none" stroke="#8b929c" stroke-width="${tw.toFixed(1)}" stroke-linejoin="round" />`;
  }
  return `<svg class="car-chip__art map-chip__art" viewBox="0 0 ${vw} ${vh.toFixed(1)}" aria-hidden="true">
    <rect x="1" y="1" width="${vw - 2}" height="${(vh - 2).toFixed(1)}" rx="3" fill="${bg}" stroke="#2a333c" stroke-width="1.5"/>
    ${track}
    ${props}
    <circle cx="${spawnX.toFixed(1)}" cy="${spawnY.toFixed(1)}" r="2.2" fill="#eef3f6"/>
  </svg>`;
}

/** A clickable car preview chip — the real top-down sprite if the model ships one,
 *  else a tinted SVG silhouette. Cars are CREDIT-gated: a locked one shows its price
 *  (and a BUY hint when affordable). */
function makeCarChip(car: CarModel, selected: boolean): HTMLElement {
  const unlocked = progress.isCarUnlocked(car.id);
  const cost = car.cost ?? 0;
  const affordable = progress.canAfford(cost);
  const badge = unlocked
    ? ''
    : `<span class="chip-lock${affordable ? ' chip-lock--buy' : ''}">${affordable ? 'BUY ' : ''}◈${cost.toLocaleString('en-US')}</span>`;
  const cls = `car-chip${selected ? ' car-chip--on' : ''}${unlocked ? '' : ' car-chip--locked'}${!unlocked && affordable ? ' car-chip--buyable' : ''}`;
  return frag(`
    <button class="${cls}" data-cursor="hover">
      ${carArt(car)}
      <span class="car-chip__name">${car.name}</span>
      ${badge}
    </button>
  `);
}

/** Chip artwork: the upright sprite thumbnail when present, else the SVG. */
function carArt(car: CarModel): string {
  if (car.spriteAsset) {
    return `<img class="car-chip__art car-chip__photo" src="assets/cars/${car.id}_chip.png" alt="" />`;
  }
  return carSvg(car);
}

/** A simple top-down car silhouette (nose up) tinted to the model. */
function carSvg(car: CarModel): string {
  const body = hex(car.body);
  const accent = hex(car.accent);
  const glass = hex(car.glass);
  return `<svg class="car-chip__art" viewBox="0 0 48 84" aria-hidden="true">
    <rect x="3" y="14" width="6" height="18" rx="2" fill="#0a0a10"/>
    <rect x="39" y="14" width="6" height="18" rx="2" fill="#0a0a10"/>
    <rect x="3" y="52" width="6" height="18" rx="2" fill="#0a0a10"/>
    <rect x="39" y="52" width="6" height="18" rx="2" fill="#0a0a10"/>
    <rect x="8" y="6" width="32" height="72" rx="15" fill="${body}"/>
    <rect x="14" y="26" width="20" height="30" rx="7" fill="${glass}"/>
    <rect x="22" y="8" width="1.6" height="68" fill="${accent}" opacity="0.85"/>
    <rect x="24.4" y="8" width="1.6" height="68" fill="${accent}" opacity="0.85"/>
    <rect x="14" y="9" width="6" height="3" rx="1" fill="#fdfbff"/>
    <rect x="28" y="9" width="6" height="3" rx="1" fill="#fdfbff"/>
  </svg>`;
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function makeCard(nav: Nav, m: { id: string; title: string; tag: string; soon: boolean }): HTMLElement {
  const card = frag(`
    <button class="mode-card reveal${m.soon ? ' mode-card--soon' : ''}" ${m.soon ? 'disabled' : 'data-cursor="hover"'}>
      <span class="mode-card__index">${m.soon ? '' : 'PLAY'}</span>
      <span class="mode-card__title">${m.title}</span>
      <span class="mode-card__tag">${m.tag}</span>
      ${m.soon ? '<span class="mode-card__ribbon">Coming soon</span>' : '<span class="mode-card__go">↦</span>'}
    </button>
  `);
  if (!m.soon) {
    card.addEventListener('pointerenter', () => {
      nav.ui('hover');
      gsap.to(card, { y: -6, duration: 0.25, ease: 'power2.out' });
    });
    card.addEventListener('pointerleave', () => gsap.to(card, { y: 0, duration: 0.3, ease: 'power2.out' }));
    card.addEventListener('click', () => {
      nav.ui('confirm');
      nav.selectMode(m.id);
    });
  }
  return card;
}

// ── pause ─────────────────────────────────────────────────────────────────────
export function buildPause(nav: Nav): HTMLElement {
  const el = frag(`
    <section class="screen screen--pause">
      <div class="pause__panel">
        <h2 class="pause__title reveal">Paused</h2>
        <div class="pause__actions reveal"></div>
      </div>
    </section>
  `);
  const actions = el.querySelector('.pause__actions')!;
  actions.append(
    makeButton(nav, 'Resume', { primary: true, onClick: () => nav.resume() }),
    makeButton(nav, 'Restart', { onClick: () => nav.restart() }),
    makeButton(nav, 'End run', { onClick: () => nav.endRun() }),
  );
  return el;
}

// ── results ─────────────────────────────────────────────────────────────────────
export function buildResults(nav: Nav, model: ResultsModel, payout?: Payout): HTMLElement {
  const stats = model.stats
    .map((s) => `<div class="result-stat${s.highlight ? ' result-stat--hi' : ''}"><span>${s.label}</span><b>${s.value}</b></div>`)
    .join('');
  const el = frag(`
    <section class="screen screen--results">
      <div class="results__panel">
        ${model.isNewBest ? '<div class="results__badge reveal">New best!</div>' : ''}
        <h2 class="results__title reveal">${model.title}</h2>
        <div class="results__score reveal">${model.headline ?? (model.score ?? 0).toLocaleString('en-US')}</div>
        <div class="results__stats reveal">${stats}</div>
        ${payout ? renderPayout(payout) : ''}
        <div class="results__actions reveal"></div>
      </div>
    </section>
  `);
  el.querySelector('.results__actions')!.append(
    makeButton(nav, 'Retry', { primary: true, onClick: () => nav.restart() }),
    makeButton(nav, 'Menu', { onClick: () => nav.toMenu() }),
  );
  if (payout) animatePayout(el, payout);
  return el;
}

/** The XP/credits payout + level bar shown under the run stats. */
function renderPayout(p: Payout): string {
  const info = progress.levelInfo(); // post-payout
  const leveledUp = p.levelAfter > p.levelBefore;
  const unlocks = p.unlockedArenas.map((a) => `<div class="payout__unlock">${a.name} unlocked</div>`).join('');
  return `
    <div class="payout reveal">
      <div class="payout__gains">
        <div class="payout__gain"><span>XP</span><b data-xp>+0</b></div>
        <div class="payout__gain"><span>Credits</span><b data-cr>+0</b></div>
      </div>
      <div class="payout__level">
        <span class="payout__lvl">LVL ${info.level}</span>
        <div class="payout__bar"><div class="payout__fill" data-bar style="transform:scaleX(0)"></div></div>
      </div>
      ${leveledUp ? `<div class="payout__levelup">Level ${p.levelAfter}!</div>` : ''}
      ${unlocks}
    </div>`;
}

/** Roll the payout counters + level bar (reuses the Hud score-roll feel). */
function animatePayout(root: HTMLElement, p: Payout): void {
  const xpEl = root.querySelector('[data-xp]') as HTMLElement | null;
  const crEl = root.querySelector('[data-cr]') as HTMLElement | null;
  const bar = root.querySelector('[data-bar]') as HTMLElement | null;
  const xpObj = { v: 0 };
  const crObj = { v: 0 };
  if (xpEl) gsap.to(xpObj, { v: p.xp, duration: 0.7, delay: 0.35, ease: 'power2.out', onUpdate: () => (xpEl.textContent = `+${Math.round(xpObj.v)}`) });
  if (crEl) gsap.to(crObj, { v: p.credits, duration: 0.7, delay: 0.35, ease: 'power2.out', onUpdate: () => (crEl.textContent = `+${Math.round(crObj.v)}`) });
  if (bar) gsap.fromTo(bar, { scaleX: 0 }, { scaleX: progress.levelInfo().progress01, duration: 0.8, delay: 0.55, ease: 'power2.out' });
}
