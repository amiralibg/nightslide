/**
 * Arena layouts. An arena is pure data — bounds, spawn, and a list of solid
 * rectangles (props/obstacles) the collision system resolves against. The
 * perimeter walls are implied by the bounds. Keeping arenas declarative means a
 * new layout is just another entry here; the Arena/CollisionSystem code is
 * generic, so all maps work with every car and every mode.
 */

export interface SolidRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Visual treatment for the prop. `wall` = plain concrete block (track infield,
   *  parking bumpers); `barrier` = hazard-chevron block; `pillar` = stacked tires. */
  kind: 'pillar' | 'barrier' | 'wall';
  /** Optional prop sprite texture key (e.g. 'prop-tires', 'prop-parked-1'). When
   *  set, it's drawn at the collider instead of the procedural `kind` art. */
  sprite?: string;
  /** Sprite display scale relative to the collider footprint (default 1). */
  spriteScale?: number;
  /** Sprite rotation in degrees (top-down; only use 0/180 to avoid aspect skew). */
  rot?: number;
}

/** A painted line on the floor (parking stalls, lane markings). Non-colliding. */
export interface FloorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A closed racing circuit: control points of the centerline (smoothed into a
 *  flowing ribbon at runtime) + the track width. Drivable surface is the ribbon;
 *  off it is grass (grip loss), not a wall. */
export interface TrackSpec {
  centerline: { x: number; y: number }[];
  width: number;
}

export interface ArenaConfig {
  id: string;
  name: string;
  /** One-line character blurb for the map picker. */
  blurb: string;
  /** Playfield size in world px. */
  width: number;
  height: number;
  /** Car spawn pose. */
  spawn: { x: number; y: number; heading: number };
  /** Thickness of the perimeter wall band (visual + collision inset). */
  wallThickness: number;
  /** Draw the red/white racing curb along the perimeter (default true). */
  curbs?: boolean;
  /** Ground surface under the whole world (default 'asphalt'). */
  floor?: 'asphalt' | 'grass';
  /** A closed circuit ribbon (Speedway/GP). When set, the floor is grass and the
   *  drivable asphalt follows this centerline; off-track loses grip. */
  track?: TrackSpec;
  /** Painted floor markings (e.g. parking stalls), drawn above the tarmac. */
  lines?: FloorLine[];
  /** Mode ids this map offers (only the modes that make sense for it). */
  modes: string[];
  /** Player level required to unlock (0 / absent = free). See src/progress. */
  unlockLevel?: number;
  /** Interior solid obstacles to drift around / off. */
  props: SolidRect[];
}

/** An open lot with a figure-eight pair of pillars + sweeping barriers — built
 *  for chaining slides with room to breathe. */
const driftArena: ArenaConfig = {
  id: 'drift-arena',
  name: 'Drift Arena',
  blurb: 'Open lot. Room to chain.',
  width: 1800,
  height: 1200,
  spawn: { x: 900, y: 880, heading: -Math.PI / 2 }, // facing "up" the lot
  wallThickness: 24,
  curbs: true,
  modes: ['scoring', 'gymkhana', 'survival'],
  props: [
    // central figure-eight tire stacks
    { x: 660, y: 558, w: 76, h: 76, kind: 'pillar', sprite: 'prop-tires' },
    { x: 1064, y: 558, w: 76, h: 76, kind: 'pillar', sprite: 'prop-tires' },
    // sweeping race barriers near the ends
    { x: 360, y: 300, w: 210, h: 62, kind: 'barrier', sprite: 'prop-barrier' },
    { x: 1230, y: 838, w: 210, h: 62, kind: 'barrier', sprite: 'prop-barrier' },
    // a couple of cones for read / apex markers
    { x: 840, y: 360, w: 30, h: 30, kind: 'barrier', sprite: 'prop-cone' },
    { x: 900, y: 820, w: 30, h: 30, kind: 'barrier', sprite: 'prop-cone' },
  ],
};

/** Rows of ACTUAL parked cars (sized like the player car), in painted stalls with
 *  wide lanes to thread between — technical, tight, lots of apexes. Some stalls are
 *  left empty for realism and drift gaps. */
function buildParkingLot(): { props: SolidRect[]; lines: FloorLine[] } {
  const props: SolidRect[] = [];
  const lines: FloorLine[] = [];
  const carW = 28; // ≈ player car footprint
  const carH = 50;
  const stall = 56; // painted stall width
  const x0 = 320;
  const x1 = 1680;
  let n = 0;
  // 3 rows; lanes between them (≈y 520 / 880) + top/bottom stay clear for the
  // gate courses. Stalls are mostly EMPTY (park ~1 in 3) so the lot is drivable.
  for (const ry of [320, 680, 1040]) {
    const top = ry - 8;
    const bot = ry + carH + 8;
    // back line (closed end of the stalls) + vertical dividers
    lines.push({ x1: x0, y1: top, x2: x1, y2: top });
    let i = 0;
    for (let sx = x0; sx <= x1 + 0.5; sx += stall) {
      lines.push({ x1: sx, y1: top, x2: sx, y2: bot });
      i++;
    }
    i = 0;
    for (let sx = x0; sx + stall <= x1 + 0.5; sx += stall) {
      if (i % 3 === 0) {
        const cx = sx + stall / 2;
        props.push({ x: cx - carW / 2, y: ry, w: carW, h: carH, kind: 'wall', sprite: `prop-parked-${(n % 5) + 1}` });
        n++;
      }
      i++;
    }
  }
  // loose track furniture near the lane mouths
  for (const [x, y, s] of [
    [250, 560, 'prop-cone'],
    [1720, 560, 'prop-cone'],
    [250, 920, 'prop-barrel'],
    [1720, 920, 'prop-barrel'],
  ] as const) {
    props.push({ x, y, w: 30, h: 30, kind: 'barrier', sprite: s });
  }
  return { props, lines };
}
const parkingLayout = buildParkingLot();
const parkingLot: ArenaConfig = {
  id: 'parking-lot',
  name: 'Parking Lot',
  blurb: 'Tight bays. Technical apexes.',
  width: 2000,
  height: 1400,
  spawn: { x: 1000, y: 1250, heading: -Math.PI / 2 },
  wallThickness: 26,
  curbs: false,
  modes: ['scoring', 'gymkhana', 'timetrial'],
  unlockLevel: 2,
  lines: parkingLayout.lines,
  props: parkingLayout.props,
};

/** A flowing, Silverstone-inspired GP circuit: an asphalt ribbon over grass with a
 *  long main straight, fast sweeps and a top esses complex. Run wide onto the grass
 *  and you lose grip (no walls except a few tire barriers at the fast corners). */
const circuit: ArenaConfig = {
  id: 'circuit',
  name: 'Grand Prix',
  blurb: 'A flowing GP circuit. Hold the line.',
  width: 2800,
  height: 1900,
  spawn: { x: 820, y: 1520, heading: 0 }, // on the main straight, facing right
  wallThickness: 28,
  curbs: false,
  floor: 'grass',
  modes: ['timetrial', 'scoring', 'survival'],
  unlockLevel: 4,
  track: {
    // gentle, flowing curves — every turn radius stays wider than the half-width
    // so the ribbon (and its kerbs) never fold in on itself.
    width: 200,
    centerline: [
      { x: 600, y: 1520 }, // ── main straight (left→right)
      { x: 1450, y: 1550 },
      { x: 2150, y: 1500 },
      { x: 2470, y: 1300 }, // Turn 1 — sweep up the right
      { x: 2540, y: 950 },
      { x: 2440, y: 600 },
      { x: 2200, y: 400 }, // over the top (right→left)
      { x: 1750, y: 360 },
      { x: 1300, y: 400 }, // gentle esse
      { x: 850, y: 360 },
      { x: 520, y: 440 }, // top-left
      { x: 340, y: 760 }, // left-hander down
      { x: 330, y: 1150 },
      { x: 470, y: 1420 }, // final sweep onto the straight
    ],
  },
  // tire-wall barriers just outside the fastest corners (the only hard hits)
  props: [
    { x: 2648, y: 918, w: 64, h: 64, kind: 'pillar', sprite: 'prop-tires-white' },
    { x: 2571, y: 1311, w: 64, h: 64, kind: 'pillar', sprite: 'prop-tires-white' },
    { x: 2283, y: 290, w: 64, h: 64, kind: 'pillar', sprite: 'prop-tires-white' },
    { x: 171, y: 703, w: 64, h: 64, kind: 'pillar', sprite: 'prop-tires-white' },
  ],
};

export const ARENAS = {
  'drift-arena': driftArena,
  'parking-lot': parkingLot,
  circuit: circuit,
} as const;
export type ArenaId = keyof typeof ARENAS;
export const DEFAULT_ARENA: ArenaId = 'drift-arena';

export const ARENA_LIST: ArenaConfig[] = Object.values(ARENAS);

export function arenaById(id: string): ArenaConfig {
  return (ARENAS as Record<string, ArenaConfig>)[id] ?? ARENAS[DEFAULT_ARENA];
}
