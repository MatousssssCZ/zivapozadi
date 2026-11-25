/**
 * Tramvaj (scéna „Vánoční tramvajová ulice“): jediný vůz jezdí po nakreslených kolejích zprava doleva.
 *
 * Trať je střednice kolejí v obrazových souřadnicích scény (z kresby, viz scripts/process-tram-graphics.py),
 * prodloužená mimo obraz. Poloha vozu = metry po trati (předpočtená délka úseků v metrech podle měřítka
 * hloubky, takže rychlost je skutečná m/s i v perspektivě). Vůz se kreslí z jednoho spritu ukotveného
 * na předním podvozku; zadní podvozek se drží kolejí malým svislým zkosením (svislé hrany zůstávají
 * svislé, bez otáčení celého spritu), měřítko podle hloubky v místě předního podvozku.
 *
 * Cyklus: čekání 100–180 s → příjezd (konstantní rychlost, pak plynulé brzdění na místo zastávky) →
 * zastavení → prodleva → otevření dveří → výstup → nástup → kontrola volných dveří → zavření →
 * prodleva → rozjezd → odjezd vlevo mimo obraz. Výměnu cestujících řídí simulace (stepTramPeople).
 */
import type { Vec2 } from '../math/vec';
import type { RngState } from '../math/rng';
import { randRange } from '../math/rng';

export interface TramSprite {
  assetId: string; w: number; h: number;
  /** dotyk kol předního a zadního podvozku, dveře [x0, y0, x1, y1] (px spritu) */
  bogieF: [number, number]; bogieR: [number, number]; door: [number, number, number, number];
  /** výška vozu od kolejnice po střechu (m) a px spritu odpovídající (výpočet měřítka) */ heightM: number; heightPx: number;
}
export interface TramConfig {
  /** střednice kolejí zleva doprava (px scény) */ track: Vec2[];
  /** x předního podvozku při stání v zastávce (px scény) */ stopX: number;
  sprite: TramSprite;
  /** interval mezi průjezdy (s), rychlost (m/s), zrychlení a brzdění (m/s²) */
  interval?: [number, number]; cruise?: number; accel?: number; decel?: number;
  /** počet vystupujících / nastupujících při jednom zastavení */ alight?: [number, number]; board?: [number, number];
  /** čekací místa na zastávce (px scény) a nejvýše čekajících */ waitSpots: Vec2[];
  /** první příjezd (s) */ firstAt?: number;
  /**
   * Vlastní měřítko vozu: výška střechy nad kolejí (px scény) ve dvou výškách trati, mezi nimi lineárně
   * (kresba kolejí nemá přísnou perspektivu – vůz se kalibruje k zastávce a lidem u ní).
   */
  scale?: { y0: number; h0: number; y1: number; h1: number };
}
export type TramPhase = 'wait' | 'in' | 'settle' | 'opening' | 'alight' | 'board' | 'check' | 'closing' | 'depart' | 'out';
export interface TramState {
  phase: TramPhase; m: number; v: number; t: number; until: number;
  /** otevření dveří 0–1 */ door: number;
  /** plán zastavení: kolik vystoupí / nastoupí, kdo už vystoupil */ nAlight: number; nBoard: number; alighted: number; boarded: number;
  rng: RngState; runs: number;
}
const D = (c: TramConfig) => ({ interval: c.interval ?? [100, 180] as [number, number], cruise: c.cruise ?? 4.2, accel: c.accel ?? 0.7, decel: c.decel ?? 0.75, alight: c.alight ?? [0, 3] as [number, number], board: c.board ?? [0, 4] as [number, number] });

/** Geometrie trati: body (px), kumulativní metry, metry zastávky. Délku úseku v m dává měřítko hloubky. */
export interface TramGeo { pts: Vec2[]; cum: number[]; mStop: number; mEnd: number }
/** px na metr vozu ve výšce y (vlastní měřítko, jinak hloubka scény) */
export function tramPpm(c: TramConfig, pxPerM: (y: number) => number): (y: number) => number {
  const s = c.scale; if (!s) return pxPerM;
  return (y) => { const k = (y - s.y0) / (s.y1 - s.y0), h = Math.max(s.h0 * 0.35, s.h0 + (s.h1 - s.h0) * k); return h / c.sprite.heightM; };
}
export function tramGeo(c: TramConfig, pxPerM0: (y: number) => number): TramGeo {
  const pxPerM = tramPpm(c, pxPerM0);
  // pořadí jízdy: zprava doleva; prodloužit vpravo (kus mimo obraz, ne přes horizont) a vlevo daleko
  const t = [...c.track].reverse();
  const a = t[0], b = t[1], dir = { x: a.x - b.x, y: a.y - b.y }, L = Math.hypot(dir.x, dir.y) || 1;
  const start = { x: a.x + (dir.x / L) * 160, y: a.y + (dir.y / L) * 160 };
  const p = t[t.length - 1], q = t[t.length - 2], d2 = { x: p.x - q.x, y: p.y - q.y }, L2 = Math.hypot(d2.x, d2.y) || 1;
  const end = { x: p.x + (d2.x / L2) * 900, y: p.y + (d2.y / L2) * 900 };
  const pts = [start, ...t, end], cum = [0];
  for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], B = pts[i], ym = (A.y + B.y) / 2; cum.push(cum[i - 1] + Math.hypot(B.x - A.x, B.y - A.y) / Math.max(1e-3, pxPerM(ym))); }
  const geo: TramGeo = { pts, cum, mStop: 0, mEnd: cum[cum.length - 1] };
  geo.mStop = metersAtX(geo, c.stopX);
  return geo;
}
export function pointAt(g: TramGeo, m: number): Vec2 {
  let i = 1; while (i < g.cum.length - 1 && g.cum[i] < m) i++;
  const k = Math.max(0, Math.min(1, (m - g.cum[i - 1]) / Math.max(1e-9, g.cum[i] - g.cum[i - 1])));
  return { x: g.pts[i - 1].x + (g.pts[i].x - g.pts[i - 1].x) * k, y: g.pts[i - 1].y + (g.pts[i].y - g.pts[i - 1].y) * k };
}
export function metersAtX(g: TramGeo, x: number): number {
  for (let i = 1; i < g.pts.length; i++) {
    const A = g.pts[i - 1], B = g.pts[i];
    if ((A.x - x) * (B.x - x) <= 0) { const k = (x - A.x) / ((B.x - A.x) || 1); return g.cum[i - 1] + (g.cum[i] - g.cum[i - 1]) * k; }
  }
  return 0;
}
/** y střednice kolejí v daném x (px), nebo null mimo trať */
export function trackYAt(g: TramGeo, x: number): number | null {
  for (let i = 1; i < g.pts.length; i++) { const A = g.pts[i - 1], B = g.pts[i]; if ((A.x - x) * (B.x - x) <= 0) return A.y + ((B.y - A.y) * (x - A.x)) / ((B.x - A.x) || 1); }
  return null;
}

/**
 * Transformace spritu do scény: přední podvozek na trati, měřítko podle hloubky, svislé zkosení tak,
 * aby zadní podvozek ležel na kolejích (omezené ±0,2). Vrací matici [a,b,c,d,e,f] (sprite → scéna).
 */
export function tramMatrix(c: TramConfig, g: TramGeo, m: number, pxPerM0: (y: number) => number): { M: [number, number, number, number, number, number]; s: number; P: Vec2 } {
  const pxPerM = tramPpm(c, pxPerM0), S = c.sprite, P = pointAt(g, m), s = pxPerM(P.y) * (S.heightM > 0 ? S.heightPx / S.heightM : 200) ** -1;
  const vx = (S.bogieR[0] - S.bogieF[0]) * s, vy = (S.bogieR[1] - S.bogieF[1]) * s;
  const ry = trackYAt(g, P.x + vx);
  let k = 0; if (ry !== null && Math.abs(vx) > 1) k = Math.max(-0.2, Math.min(0.2, (ry - (P.y + vy)) / vx));
  // x' = s·(x − fx) + P.x ; y' = s·(y − fy) + k·s·(x − fx) + P.y
  const a = s, b = k * s, cc = 0, d = s, e = P.x - s * S.bogieF[0], f = P.y - s * S.bogieF[1] - k * s * S.bogieF[0];
  return { M: [a, b, cc, d, e, f], s, P };
}
export const applyM = (M: number[], x: number, y: number): Vec2 => ({ x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] });
/** čtyřúhelník dveří ve scéně (otevírání a ořez nastupujících) */
export function doorQuad(c: TramConfig, M: number[]): Vec2[] { const [x0, y0, x1, y1] = c.sprite.door; return [applyM(M, x0, y0), applyM(M, x1, y0), applyM(M, x1, y1), applyM(M, x0, y1)]; }

export function newTramState(c: TramConfig, rng: RngState, t: number): TramState {
  return { phase: 'wait', m: 0, v: 0, t, until: t + (c.firstAt ?? randRange(rng, 25, 45)), door: 0, nAlight: 0, nBoard: 0, alighted: 0, boarded: 0, rng, runs: 0 };
}

/** Pohyb vozu a fáze zastavení. `people` ohlásí, zda je výměna cestujících hotová a dveřní prostor volný. */
export function stepTram(c: TramConfig, g: TramGeo, st: TramState, t: number, dt: number, people: { alightDone: boolean; boardDone: boolean; doorClear: boolean }): void {
  const P = D(c);
  const to = (ph: TramPhase, dur = 0) => { st.phase = ph; st.t = t; st.until = t + dur; };
  switch (st.phase) {
    case 'wait':
      if (t >= st.until) { st.m = 0; st.v = P.cruise; st.door = 0; st.nAlight = Math.floor(randRange(st.rng, P.alight[0], P.alight[1] + 0.999)); st.nBoard = Math.floor(randRange(st.rng, P.board[0], P.board[1] + 0.999)); st.alighted = 0; st.boarded = 0; to('in'); }
      return;
    case 'in': {
      // brzdění tak, aby vůz zastavil přesně v místě zastávky (v² = 2·a·s), bez skoku rychlosti
      const rem = g.mStop - st.m;
      const vWant = Math.min(P.cruise, Math.sqrt(Math.max(0, 2 * P.decel * rem)));
      st.v = st.v > vWant ? Math.max(vWant, st.v - P.decel * 1.6 * dt) : Math.min(vWant, st.v + P.accel * dt);
      st.m = Math.min(g.mStop, st.m + st.v * dt);
      if (rem < 0.02 || (st.v < 0.03 && rem < 0.15)) { st.m = g.mStop; st.v = 0; to('settle', 1.6); }
      return;
    }
    case 'settle': if (t >= st.until) to('opening', 1.3); return;
    case 'opening': st.door = Math.min(1, (t - st.t) / 1.3); if (t >= st.until) { st.door = 1; to('alight', 25); } return;
    case 'alight': if (people.alightDone || t >= st.until) to('board', 40); return;
    case 'board': if (people.boardDone || t >= st.until) to('check', 1.2); return;
    case 'check': if (t >= st.until && people.doorClear) to('closing', 1.3); else if (t >= st.until) st.until = t + 0.5; return;
    case 'closing': st.door = Math.max(0, 1 - (t - st.t) / 1.3); if (t >= st.until) { st.door = 0; to('depart', 1.4); } return;
    case 'depart': if (t >= st.until) { to('out'); st.v = 0; } return;
    case 'out':
      st.v = Math.min(P.cruise * 1.15, st.v + P.accel * dt); st.m += st.v * dt;
      if (st.m >= g.mEnd - 0.5) { st.runs++; to('wait', randRange(st.rng, P.interval[0], P.interval[1])); st.v = 0; }
      return;
  }
}
export const tramVisible = (st: TramState | undefined) => !!st && st.phase !== 'wait';
export const TRAM_LABEL: Record<TramPhase, string> = { wait: 'mimo scénu', in: 'přijíždí', settle: 'zastavila', opening: 'otevírá dveře', alight: 'výstup', board: 'nástup', check: 'kontrola dveří', closing: 'zavírá dveře', depart: 'chystá se k odjezdu', out: 'odjíždí' };
