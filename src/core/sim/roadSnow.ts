/**
 * Měnitelný sníh na vozovce (Zasněžená ulice): maskovaná vrstva čerstvého sněhu nad každým pruhem
 * po úsecích 0,5 m (pokrytí 0–1), koleje od kol (ujetá břečka) a posyp (zrnka za shrnovákem).
 * Malba silnice zůstává spodní podklad – sníh se nikdy neodstraňuje globálním zeslabením obrázku.
 * Při sněžení pomalu přibývá (koleje se zasypávají), auta ho rozjíždějí do kolejí, shrnovák ho
 * v šířce radlice odhrne a posype.
 */
import type { ProjectFile } from '../model/types';
import { cameraFor, toWorld } from '../scene/camera';
import { SIM_DT } from './types';

export const ROAD_BIN = 0.5;
export interface RoadSnowLane { X0: number; cover: number[]; track: number[]; grit: number[] }
export interface RoadSnowState { lanes: RoadSnowLane[] }

export function initRoadSnow(project: ProjectFile): RoadSnowState {
  const cfg = project.street!, cam = cameraFor(project.scene), W = project.scene.width;
  return {
    lanes: cfg.lanes.map((ln) => {
      const X0 = toWorld(cam, { x: -80, y: ln.y }).X, X1 = toWorld(cam, { x: W + 80, y: ln.y }).X, n = Math.ceil((X1 - X0) / ROAD_BIN);
      return { X0, cover: new Array(n).fill(cfg.roadSnow ?? 0.55), track: new Array(n).fill(0.35), grit: new Array(n).fill(0) };
    }),
  };
}
const idx = (L: RoadSnowLane, X: number) => Math.floor((X - L.X0) / ROAD_BIN);

/** jedno kolo stopy: auto v pruhu ujíždí sníh do kolejí (víc při větší rychlosti) */
export function tyreTrack(L: RoadSnowLane, X: number, len: number, v: number) {
  const i0 = idx(L, X - len / 2), i1 = idx(L, X + len / 2);
  for (let i = Math.max(0, i0); i <= Math.min(L.track.length - 1, i1); i++) L.track[i] = Math.min(1, L.track[i] + 0.004 * Math.min(1, v / 4) * L.cover[i] * 4);
}
/** radlice: odhrne pruh mezi X0 a X1 (zbude tenký film), posyp za vozem */
export function plowLane(L: RoadSnowLane, Xa: number, Xb: number) {
  const i0 = idx(L, Math.min(Xa, Xb)), i1 = idx(L, Math.max(Xa, Xb));
  let removed = 0;
  for (let i = Math.max(0, i0); i <= Math.min(L.cover.length - 1, i1); i++) { removed += Math.max(0, L.cover[i] - 0.06); L.cover[i] = Math.min(L.cover[i], 0.06); L.track[i] = Math.min(L.track[i], 0.1); }
  return removed;
}
export function gritLane(L: RoadSnowLane, X: number, len: number) {
  const i0 = idx(L, X - len / 2), i1 = idx(L, X + len / 2);
  for (let i = Math.max(0, i0); i <= Math.min(L.grit.length - 1, i1); i++) L.grit[i] = Math.min(1, L.grit[i] + 0.08);
}
/** zbývající sníh pod místem X (pro odstřik od běžných aut) */
export function coverAt(L: RoadSnowLane, X: number): number { const i = idx(L, X); return i >= 0 && i < L.cover.length ? L.cover[i] : 0; }

export function stepRoadSnow(project: ProjectFile, st: RoadSnowState, t: number) {
  // pomalé přibývání jen při sněžení (koleje se zasypávají, posyp se ztrácí pod novým sněhem)
  if (!project.scene.snowfall?.enabled || Math.floor(t * 2) === Math.floor((t - SIM_DT) * 2)) return;
  const k = 0.5 / 600;
  for (const L of st.lanes) for (let i = 0; i < L.cover.length; i++) {
    L.cover[i] = Math.min(1, L.cover[i] + k * (1 - L.grit[i] * 0.7));
    L.track[i] = Math.max(0, L.track[i] - k * 0.6);
    L.grit[i] = Math.max(0, L.grit[i] - k * 0.25);
  }
}
