/**
 * A13 – Vybírání a odnášení vánočního stromku. Dva dospělí přijdou k prodejnímu místu (stojan se
 * stromky), prohlížejí (pohled od spodku k vrcholu, několik kroků), jeden ukáže na vybraný, druhý
 * zareaguje po prodlevě, obejde stromek z druhé strany. Pak se postaví k úchopům: první uchopí kmen
 * (přidřep), vytáhne stromek ze stojanu a sklopí ho k druhému, který převezme špičku – teprve po
 * dosažení obou úchopů se nese. Nesou ho téměř vodorovně, vpředu nositel u špičky, vzadu u kmene;
 * zadní jde po stopě předního ve vzdálenosti délky stromku (v zatáčce delší dráha). Větve se při
 * rozjezdu a zastavení tlumeně opozdí. Stromek zmizí z nabídky právě tehdy, když ho zvednou.
 */
import type { World } from '../../scene/camera';
import type { AgentState } from '../types';
import { registerEpisode, W, S, type ActorHost, type EpisodeConfig, type EpisodeState, type Step } from '../episodes';
import { hashNoise } from '../../math/rng';

export interface LotTree { h: number; present: boolean; seed: number }
export const LOT_N = 5, LOT_GAP = 0.75;
export function lotTrees(st: EpisodeState): LotTree[] {
  return ((st.world.trees ??= Array.from({ length: LOT_N }, (_, i) => ({ h: 1.55 + 0.12 * ((i * 7) % 5), present: true, seed: i * 31 + 7 }))) as LotTree[]);
}
/** pata stromku i ve stojanu (svět) */
export function lotBase(h: ActorHost, c: EpisodeConfig, i: number): World { const L = W(h, c.pts.lot); return { X: L.X + (i - (LOT_N - 1) / 2) * LOT_GAP, Z: L.Z }; }

interface D { k?: number; tilt?: number; lift?: number; carry?: boolean; hist?: World[]; sway?: number; swayV?: number; vPrev?: number; lastFollowAt?: number; base?: World & { H: number }; top?: World & { H: number } }
const TREE_LEN = (t: LotTree) => t.h;

function plan(c: EpisodeConfig, st: EpisodeState, A: AgentState[], h: ActorHost): Step[] {
  const d = st.data as D, trees = lotTrees(st);
  if (d.k === undefined) {
    const avail = trees.map((t, i) => (t.present ? i : -1)).filter((i) => i >= 0);
    d.k = avail.length ? avail[Math.floor(hashNoise(h.project.seed, 9850, st.n) * avail.length)] : -1;
  }
  const k = d.k!, tr = trees[k];
  const front = (dx: number, dz: number) => { const L = W(h, c.pts.lot); return S(h, { X: L.X + dx, Z: L.Z + dz }); };
  const B = k >= 0 ? lotBase(h, c, k) : W(h, c.pts.lot);
  const at = (dx: number, dz: number) => S(h, { X: B.X + dx, Z: B.Z + dz });
  const look = (a: AgentState, i: number, top: boolean) => { const b = lotBase(h, c, i); h.face(a, S(h, b, top ? trees[i].h : 0.2)); };
  if (k < 0) return [{ k: 'call', fn: () => h.log('Stromky jsou vyprodané.') }];
  return [
    { k: 'enter', who: [0, 1], at: ['in', 'in2'] },
    { k: 'walk', label: 'jdou k prodeji stromků', moves: [{ who: 0, to: [front(-0.7, -1.35)], sp: 0.75 }, { who: 1, to: [front(0.5, -1.5)], sp: 0.75 }] },
    { k: 'do', dur: 12, label: 'prohlížejí stromky (od spodku k vrcholu)', tick: (el) => {
      // pohled pomalu přechází po stromcích, u každého od paty ke špičce; druhý se dívá jinam, se zpožděním
      const i0 = Math.min(LOT_N - 1, Math.floor(el / 2.4)), i1 = Math.min(LOT_N - 1, Math.max(0, Math.floor((el - 1.2) / 2.4)));
      look(A[0], i0, (el % 2.4) > 1.1); look(A[1], LOT_N - 1 - i1, ((el + 0.7) % 2.4) > 1.3);
      for (const a of A) a.status = 'Prohlíží stromky';
    } },
    { k: 'do', dur: 3.2, label: 'ukazuje na vybraný stromek', tick: (el) => {
      look(A[0], k, el > 1.6); if (el < h.dt * 1.5) h.gesture(A[0], 'point', 2.4);
      if (el > 1.0) look(A[1], k, el > 2.2); // druhý zareaguje po prodlevě
      A[0].status = 'Ukazuje na stromek'; A[1].status = 'Dívá se na vybraný stromek';
    } },
    // druhý obejde stromek a zkontroluje druhou stranu, první přistoupí k úchopu u kmene
    { k: 'walk', label: 'obchází stromek, přistupují k úchopům', moves: [{ who: 1, to: [at(0.9, -0.2), at(0.6, 0.75), at(1.35, 0.1)], sp: 0.5 }, { who: 0, to: [at(-0.05, -0.62)], sp: 0.5 }] },
    { k: 'do', dur: 1.2, label: 'připravují se ke zvednutí', tick: () => { h.face(A[0], S(h, B, 0.4)); h.face(A[1], S(h, B, 1.0)); } },
    // první: přidřep, úchop kmene, vytažení ze stojanu (stromek zmizí z nabídky až teď)
    { k: 'do', dur: 3.4, label: 'vytahuje stromek ze stojanu', tick: (el) => {
      const down = Math.min(1, el / 0.9), up = Math.max(0, Math.min(1, (el - 1.4) / 1.4));
      h.pose(A[0], 'lift', down * (1 - up) * 0.8, el);
      if (el > 1.1 && tr.present) { tr.present = false; h.log(`${A[0].name} a ${A[1].name} si odnášejí vánoční stromek.`, A[0].id); }
      d.lift = up * 0.35; d.tilt = 0;
      A[0].status = 'Vytahuje stromek ze stojanu';
    } },
    // sklopení k druhému: pata v rukou prvního, špička klesá k rukám druhého (ten ji převezme)
    { k: 'do', dur: 2.4, label: 'sklápí stromek, druhý přebírá špičku', tick: (el) => {
      d.tilt = Math.min(1, el / 2.0) * 1.42; d.lift = 0.35 + 0.35 * Math.min(1, el / 2);
      h.hands(A[0], [{ u: 0.34, h: 0.82, lat: -0.16 }, { u: 0.36, h: 0.86, lat: 0.16 }], Math.min(1, el / 0.5));
      if (el > 1.6) h.hands(A[1], [{ u: 0.42, h: 1.0, lat: -0.12 }, { u: 0.44, h: 1.02, lat: 0.12 }], Math.min(1, (el - 1.6) / 0.5));
    } },
    { k: 'call', fn: () => { d.carry = true; d.hist = [W(h, A[1].pos)]; } },
    // nesení: vpředu špička (A1), vzadu kmen (A0) po stopě předního
    { k: 'walk', label: 'nesou stromek', moves: [{ who: 1, to: [c.pts.carry1, c.pts.out], sp: 0.62 }] },
    { k: 'do', dur: 0, label: 'odcházejí', until: () => !A[0].route || W(h, A[0].pos).X > W(h, c.pts.out).X - 2.5 },
  ];
}

/** Nositel vzadu jde po stopě předního ve vzdálenosti délky stromku; tlumené dokývání větví. */
function tick(c: EpisodeConfig, st: EpisodeState, A: AgentState[], h: ActorHost) {
  const d = st.data as D; if (!d.carry || !d.hist) return;
  const trees = lotTrees(st), L = TREE_LEN(trees[d.k!]) * 0.92;
  const P = W(h, A[1].pos), last = d.hist[d.hist.length - 1];
  if (Math.hypot(P.X - last.X, P.Z - last.Z) > 0.05) { d.hist.push(P); if (d.hist.length > 400) d.hist.shift(); }
  // bod na stopě ve vzdálenosti L za předním
  let left = L, T: World = d.hist[0];
  for (let i = d.hist.length - 1; i > 0; i--) { const a = d.hist[i], b = d.hist[i - 1], s = Math.hypot(a.X - b.X, a.Z - b.Z); if (s >= left) { const q = left / s; T = { X: a.X + (b.X - a.X) * q, Z: a.Z + (b.Z - a.Z) * q }; break; } left -= s; }
  const F = W(h, A[0].pos), dist = Math.hypot(T.X - F.X, T.Z - F.Z), t = h.time();
  if (dist > 0.12 && t - (d.lastFollowAt ?? -9) > 0.3) { h.walk(A[0], [S(h, T)], 0.7); d.lastFollowAt = t; }
  // větve: tlumená pružina buzená zrychlením nesení
  const v = Math.hypot(A[1].vel?.X ?? 0, A[1].vel?.Z ?? 0), acc = (v - (d.vPrev ?? v)) / h.dt; d.vPrev = v;
  d.swayV = (d.swayV ?? 0) + (-30 * (d.sway ?? 0) - 4 * (d.swayV ?? 0) - acc * 0.05) * h.dt; d.sway = (d.sway ?? 0) + d.swayV * h.dt;
  for (const a of A) a.status = 'Nese vánoční stromek';
}

registerEpisode('treeLot', plan, tick);

/** Poloha neseného / sklápěného stromku (pata, špička; svět + výška) pro kreslení. */
export function treePose(h: ActorHost, c: EpisodeConfig, st: EpisodeState): { base: World & { H: number }; top: World & { H: number }; tree: LotTree; sway: number } | null {
  const d = st.data as D; if (st.phase !== 'run' || d.k === undefined || d.k < 0 || d.tilt === undefined) return null;
  const tree = lotTrees(st)[d.k], A0 = h.agent(c.actors[0]), A1 = h.agent(c.actors[1]); if (!A0 || !A1) return null;
  const hd = (a: AgentState) => a.groundHeading ?? 0;
  if (d.carry) {
    const P0 = W(h, A0.pos), P1 = W(h, A1.pos), f0 = hd(A0), f1 = hd(A1);
    const base = { X: P0.X + Math.cos(f0) * 0.42, Z: P0.Z + Math.sin(f0) * 0.42, H: 0.84 };
    const top0 = { X: P1.X + Math.cos(f1) * 0.42, Z: P1.Z + Math.sin(f1) * 0.42, H: 1.0 };
    // špička přesahuje ruce předního o kus (stromek je delší než rozestup rukou)
    const dx = top0.X - base.X, dz = top0.Z - base.Z, dl = Math.hypot(dx, dz) || 1, L = tree.h;
    return { base, top: { X: base.X + (dx / dl) * L, Z: base.Z + (dz / dl) * L, H: base.H + (top0.H - base.H) * (L / dl) * 0.6 }, tree, sway: d.sway ?? 0 };
  }
  const B = lotBase(h, c, d.k), lift = d.lift ?? 0, tilt = d.tilt ?? 0;
  // sklápění k druhému nositeli (směr od paty k němu)
  const P1 = W(h, A1.pos), dx = P1.X - B.X, dz = P1.Z - B.Z, dl = Math.hypot(dx, dz) || 1;
  const base = { X: B.X, Z: B.Z, H: lift };
  return { base, top: { X: B.X + (dx / dl) * Math.sin(tilt) * tree.h, Z: B.Z + (dz / dl) * Math.sin(tilt) * tree.h, H: lift + Math.cos(tilt) * tree.h }, tree, sway: 0 };
}
