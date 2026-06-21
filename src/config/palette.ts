/**
 * NIGHTSLIDE color system — defined once, used everywhere (shell + game).
 *
 * Art direction: MIDNIGHT STREET / WET ASPHALT. It's still night (the name earns
 * it), but grounded and real rather than synthwave: cool charcoal asphalt and
 * steel surfaces, a warm SODIUM-AMBER as the primary light (street lamps, drift
 * glow, score), a TEAL/ICE secondary for speed, and an electric STEEL-BLUE for UI
 * accents. Both the DOM shell and the Phaser canvas pull from this single source
 * so the two layers never drift apart.
 *
 * The token KEYS are kept stable (`magenta`, `cyan`, `violet`…) so existing call
 * sites keep working; their VALUES are repointed to the new identity. New,
 * clearer semantic aliases (`sodium`, `teal`, `steel`, `wet`) are added for code
 * written against the new look (e.g. the HUD instruments).
 *
 * Hex strings are for CSS/DOM. The `.num` variants are 0xRRGGBB for Phaser.
 */

export const PALETTE = {
  // base / surfaces — cool charcoal asphalt → steel
  void: '#05070a', // deepest background (wet asphalt black)
  ink: '#0b0f14', // panel / canvas backdrop
  surface: '#161c22', // raised surfaces / tarmac base
  grid: '#2a333c', // borders / arena lines (steel)

  // text — cool greys, not lilac
  textHi: '#eef3f6',
  textMid: '#97a4b0',
  textLow: '#5a6772',

  // accents (keys kept for compatibility; values are the new identity)
  magenta: '#ffa033', // PRIMARY — sodium amber (brand / drift / score)
  cyan: '#34d1c4', // SECONDARY — teal / speed
  violet: '#3f8fd0', // TERTIARY — electric steel-blue (UI hover)
  amber: '#ffcf5c', // caution / big-score gold
  green: '#43d98a', // confirm / banked

  danger: '#e8503a', // desaturated brake-light red

  // ── new semantic aliases (prefer these in new code) ──
  sodium: '#ffa033', // primary warm light
  teal: '#34d1c4', // cool secondary
  steel: '#3a444e', // brushed-steel instrument bezel
  wet: '#7fd4d0', // pale specular highlight on wet tarmac
} as const;

/** 0xRRGGBB integers for Phaser (Graphics tints, fills, particles). */
export const COLORS = {
  void: 0x05070a,
  ink: 0x0b0f14,
  surface: 0x161c22,
  grid: 0x2a333c,

  textHi: 0xeef3f6,
  textMid: 0x97a4b0,
  textLow: 0x5a6772,

  magenta: 0xffa033,
  cyan: 0x34d1c4,
  violet: 0x3f8fd0,
  amber: 0xffcf5c,
  green: 0x43d98a,
  danger: 0xe8503a,

  sodium: 0xffa033,
  teal: 0x34d1c4,
  steel: 0x3a444e,
  wet: 0x7fd4d0,

  // in-game specifics
  carBody: 0xffa033,
  carRoof: 0x1a2028,
  tireMark: 0x050608,
  smoke: 0xc9cdd4, // neutral cool grey (was lilac)
} as const;

export type PaletteKey = keyof typeof PALETTE;
