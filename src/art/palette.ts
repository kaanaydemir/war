/**
 * MASTER PALETTE — every procedural sprite must use these colors (plus alpha).
 * Ramps go dark → light and are hue-shifted (cool shadows, warm lights), in the
 * spirit of modern high-end pixel art (Sea of Stars). Use `ramp[i]` indices
 * consistently: 0 = deepest shadow/outline, last = highlight.
 *
 * Light direction for ALL art: sun from the upper-LEFT (screen space).
 * → left-facing iso faces are lit, right-facing faces are in shade, tops brightest.
 */
export const P = {
  outline: ['#0d0b12', '#17131f', '#221c2c'],
  night: ['#0b0f24', '#152044', '#22346a', '#34508f'],

  // Theodosian walls: limestone blocks with red brick bands
  stone: ['#2b2533', '#3e3646', '#575061', '#736b78', '#918a8e', '#b1aaa2', '#d0c8b6', '#ece4cf'],
  limestone: ['#4b4458', '#6a6274', '#8e8590', '#b3a99f', '#d6cbb4', '#f0e6cc'],
  brick: ['#3a1820', '#5c2428', '#7f3430', '#a3483a', '#c3644b', '#dd8766', '#efab88'],

  water: ['#0a1430', '#0f1d3a', '#14305a', '#1a4a7a', '#1f6694', '#2a86ab', '#3fa6bf', '#6cc6cc', '#a8e4dc', '#e8fff6'],
  grass: ['#14281f', '#1d3a2a', '#265232', '#356b38', '#4b8840', '#6aa448', '#8fbf55', '#b7d66a'],
  dryGrass: ['#4e4224', '#6b5a2e', '#8e7a3a', '#b09a4a', '#cdb860', '#e3d27e'],
  sand: ['#6b5238', '#8c6e4a', '#b08d5e', '#cfad74', '#e6cb92', '#f4e3b5'],
  dirt: ['#2a1e19', '#3a2a22', '#55392b', '#734d36', '#916645', '#b08257', '#c9a072'],
  wood: ['#24160f', '#2e1d16', '#4a2c1d', '#6b4126', '#8c5a33', '#ad7744', '#c9965a', '#e0b77a'],
  roof: ['#3d1a19', '#5a2420', '#7d3326', '#a1462e', '#c2623b', '#dc8551', '#efab74'],
  foliage: ['#0a1a12', '#0f2418', '#173522', '#21482c', '#2d5e36', '#3f7a40', '#5a9a4a'],
  cypress: ['#08140e', '#0c1f15', '#122b1c', '#1a3a24', '#25502e'],
  snow: ['#8d9bb8', '#aebbd3', '#c9d6e8', '#e6eef8', '#ffffff'],

  // Ottoman identity
  red: ['#2a080c', '#3d0d12', '#650f1a', '#8f1424', '#b81f2c', '#dd3a3a', '#f26a5a'],
  green: ['#08201a', '#0e2e22', '#145236', '#1d7347', '#2c9658', '#4cb86e'],
  gold: ['#3e2608', '#5a3a0e', '#8a5c12', '#b8861c', '#dcb12c', '#f2d65a', '#fff1a0'],
  cloth: ['#4a4652', '#6d6a74', '#9b97a0', '#c8c3c4', '#e9e4dc', '#fbf8f0'],
  skin: ['#3e2218', '#5e3424', '#8a5236', '#b37450', '#d39b70', '#ecc29a'],
  turban: ['#8a8a96', '#c3c0c4', '#e8e4de', '#ffffff'],
  // Byzantine / Italian
  purple: ['#1a0a22', '#2a1236', '#46205a', '#6a3480', '#9150a8', '#b67cc8'],
  blue: ['#0e1a3a', '#1a2c5c', '#284684', '#3a62a8', '#5a86c8', '#8ab0e0'],
  steel: ['#1c1e26', '#30343e', '#4c525e', '#717986', '#9aa3ae', '#c8d0d8', '#eef3f6'],
  bronze: ['#2e1a0c', '#4e2e14', '#7a4a1e', '#a8692a', '#cf8f3e', '#e8b866', '#f8dc9a'],

  // FX
  fire: ['#3a0a06', '#5a1208', '#a52a0c', '#e0541a', '#f8902a', '#ffc84a', '#fff3b0', '#ffffff'],
  smoke: ['#121016', '#1f1c22', '#3a3640', '#5c5762', '#8a8590', '#b9b4bc', '#dedae0'],
  blood: ['#2a0608', '#4a0a0e', '#6e1216'],
} as const;

export type RampName = keyof typeof P;

/** Parse '#rrggbb' → 0xRRGGBB. */
export function hex(c: string): number {
  return parseInt(c.slice(1), 16);
}

/** Parse '#rrggbb' → [r,g,b]. */
export function rgb(c: string): [number, number, number] {
  const n = hex(c);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Clamp-indexed ramp lookup. */
export function ramp(name: RampName, i: number): string {
  const r = P[name] as readonly string[];
  return r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
}

/** CSS custom properties for the UI (subset). */
export const UI_COLORS = {
  ink: P.outline[1],
  paper: '#efe2c2',
  paperDark: '#d8c49a',
  gold: P.gold[4],
  goldDark: P.gold[2],
  red: P.red[4],
  redDark: P.red[2],
  green: P.green[3],
  lapis: '#24407a',
  turquoise: '#2f9a96',
};
