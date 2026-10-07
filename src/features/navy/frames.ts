import type { ShipType } from '../../core/state';
import { buildShipModel, hasLandFrames, MATS, SPECS, type Pose, type ShipModel } from './models';
import { projectBounds, type RenderOpts } from './vox';

/**
 * Frame layout of the pre-rendered ship sheets (pure; shared by art & render).
 * Per heading (8, index h → tile angle h·π/4): sail 0–3, anchor 4–5, sink 6–9,
 * row 10–13 (galleys: oars, sail furled), land 14–15 (hauled types only).
 */
export const POSE = { sail: 0, anchor: 4, sink: 6, row: 10, land: 14 } as const;
export const SAIL_FRAMES = 4;
export const ANCHOR_FRAMES = 2;
export const LAND_FRAMES = 2;

/** Sinking stages: roll, pitch (bow up) and depth (voxels). */
export const SINK_STAGES: { roll: number; pitch: number; sink: number }[] = [
  { roll: 0.14, pitch: 0.04, sink: 1.5 },
  { roll: 0.32, pitch: 0.09, sink: 4 },
  { roll: 0.55, pitch: 0.15, sink: 8 },
  { roll: 0.78, pitch: 0.2, sink: 13 },
];

/** Raise for land frames (cradle bottom at z = 0). */
export const LAND_RAISE = 5;

export function isGalley(t: ShipType): boolean {
  return SPECS[t].kind === 'galley';
}

export function framesPerHeading(t: ShipType): number {
  return hasLandFrames(t) ? 16 : isGalley(t) ? 14 : 10;
}

export function shipKey(t: ShipType, flagship: boolean): string {
  return flagship && t === 'kadirga' ? 'navy/kadirga-sancak' : `navy/${t}`;
}

export interface SheetInfo {
  fw: number;
  fh: number;
  /** Model origin (waterline center) inside the frame. */
  ox: number;
  oy: number;
  per: number;
}

const models = new Map<ShipType, ShipModel>();
export function shipModel(t: ShipType): ShipModel {
  let m = models.get(t);
  if (!m) {
    m = buildShipModel(t);
    models.set(t, m);
  }
  return m;
}

const infos = new Map<ShipType, SheetInfo>();

/** Frame size and origin for a ship type's sheet (deterministic). */
export function shipSheetInfo(t: ShipType): SheetInfo {
  let info = infos.get(t);
  if (info) return info;
  const m = shipModel(t);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const acc = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  };
  const sail = m.dyn('sail', 0, true);
  const anchor = m.dyn('anchor', 0, true);
  for (let h = 0; h < 8; h++) {
    const heading = (h * Math.PI) / 4;
    acc(projectBounds(m.hull.concat(sail.vox), m.hullLines.concat(sail.lines), { heading, clipZ: 0 }));
    acc(projectBounds(m.hull.concat(anchor.vox), m.hullLines.concat(anchor.lines), { heading, clipZ: 0 }));
    for (const st of SINK_STAGES.slice(0, 3)) acc(projectBounds(m.hull.concat(anchor.vox), [], { heading, clipZ: 0, roll: st.roll, pitch: st.pitch, sink: st.sink }));
    if (hasLandFrames(t)) {
      const land = m.dyn('land', 0, false);
      acc(projectBounds(m.hull.concat(land.vox, m.cradle), m.hullLines.concat(land.lines), { heading, clipZ: null, sink: -LAND_RAISE }));
    }
  }
  const pad = 3;
  const ox = Math.ceil(-x0) + pad;
  const oy = Math.ceil(-y0) + pad;
  info = { fw: Math.ceil(x1 - x0) + pad * 2 + 1, fh: Math.ceil(y1 - y0) + pad * 2 + 1, ox, oy, per: framesPerHeading(t) };
  infos.set(t, info);
  return info;
}

/** Render options for frame index k (within a heading). */
export function frameOpts(t: ShipType, h: number, k: number): { opts: RenderOpts; pose: Pose; anim: number } {
  const heading = (h * Math.PI) / 4;
  if (k < POSE.anchor) return { opts: { heading, clipZ: 0, wetLine: true }, pose: 'sail', anim: k };
  if (k < POSE.sink) return { opts: { heading, clipZ: 0, wetLine: true }, pose: 'anchor', anim: (k - POSE.anchor) * 2 };
  if (k < POSE.row) {
    const st = SINK_STAGES[k - POSE.sink];
    return { opts: { heading, clipZ: 0, wetLine: true, roll: st.roll, pitch: st.pitch, sink: st.sink }, pose: 'sink', anim: 0 };
  }
  if (k < POSE.land) return { opts: { heading, clipZ: 0, wetLine: true }, pose: 'row', anim: k - POSE.row };
  return { opts: { heading, clipZ: null, sink: -LAND_RAISE }, pose: 'land', anim: (k - POSE.land) * 2 };
}

/** Local model point → offset in screen pixels from the sprite origin (for lanterns, deck fires…). */
export function localToScreen(x: number, y: number, z: number, heading: number): { dx: number; dy: number } {
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const tx = x * ch - y * sh;
  const ty = x * sh + y * ch;
  return { dx: tx - ty, dy: (tx + ty) * 0.5 - z };
}

export { MATS };
