/**
 * A01 – Běžkování (klasická technika, střídavý běh). Běžkař projede přes zasněženou plochu po stopě,
 * uprostřed se volitelně zastaví (3–8 s, lyže rovnoběžně, hole opřené, rozhlédne se) a pokračuje.
 *
 * Fyzika: rychlost se zvyšuje jen během účinného odrazu (zatížení odrazové lyže + opřená hůl, dvě
 * odrazová okna v cyklu), mezi nimi skluz s třením (μ ≈ 0,05) a odporem vzduchu. Bez odrazu na
 * rovině rychlost klesá až k zastavení (bez chvění u nuly). Fáze cyklu postupuje podle ujeté dráhy
 * (délka cyklu × frekvence = rychlost) – nohy po lyžích neprokluzují; při rozjezdu krátké kroky.
 * Paže a nohy pracují křížově. Začátečník: kratší skluz, menší amplituda, slabší odraz.
 * Za běžkařem zůstává dvojitá stopa, která pozvolna zapadá.
 */
import { directionFromAngle } from '../movement';
import type { World } from '../../scene/camera';
import type { AgentState } from '../types';
import { registerEpisode, W, S, type ActorHost, type EpisodeConfig, type EpisodeState, type Step } from '../episodes';
import { hashNoise } from '../../math/rng';

export const SKI = { len: 1.95, gauge: 0.12, mu: 0.05, drag: 0.02, thrust: 2.6, life: 900 } as const;
interface D { s?: number; v?: number; ph?: number; push?: boolean; level?: number; amp?: number; pauseAt?: number; plant?: [World | null, World | null]; s0?: number }
export interface SkiTrack { s0: number; s1: number; t0: number }
export const skiTracks = (st: EpisodeState) => ((st.world.tracks ??= []) as SkiTrack[]);

/** dráha (svět) a kumulativní délky */
export function skiPath(h: ActorHost, c: EpisodeConfig): { P: World[]; cum: number[] } {
  const P = (c.paths?.track ?? []).map((q) => W(h, q)), cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].X - P[i - 1].X, P[i].Z - P[i - 1].Z));
  return { P, cum };
}
export function skiAt(path: { P: World[]; cum: number[] }, s: number): { p: World; dir: number } {
  const { P, cum } = path; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const k = Math.max(0, Math.min(1, (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1])));
  return { p: { X: P[i - 1].X + (P[i].X - P[i - 1].X) * k, Z: P[i - 1].Z + (P[i].Z - P[i - 1].Z) * k }, dir: Math.atan2(P[i].Z - P[i - 1].Z, P[i].X - P[i - 1].X) };
}

function plan(c: EpisodeConfig, st: EpisodeState, A: AgentState[], h: ActorHost): Step[] {
  const d = st.data as D, path = skiPath(h, c), total = path.cum[path.cum.length - 1];
  if (d.level === undefined) {
    d.level = st.n % 2 ? 1 : 0.35; // střídavě jistý běžkař a začátečník
    d.s = 0; d.v = 0; d.ph = 0; d.push = false; d.plant = [null, null];
    d.pauseAt = hashNoise(h.project.seed, 9890, st.n) < 0.85 ? total * (0.24 + 0.1 * hashNoise(h.project.seed, 9891, st.n)) : 1e9;
  }
  const at0 = S(h, skiAt(path, 0).p);
  return [
    { k: 'call', fn: () => { h.show(A[0], at0); d.push = true; d.s0 = 0; } },
    { k: 'do', dur: 0, label: d.level > 0.6 ? 'běží střídavým během (jistý)' : 'běží střídavým během (začátečník)', until: () => (d.s ?? 0) >= Math.min(d.pauseAt!, total - 0.5) },
    { k: 'call', fn: () => { d.push = false; } },
    { k: 'do', dur: 0, label: 'dojíždí skluzem', until: () => (d.v ?? 0) <= 0 || (d.s ?? 0) >= total - 0.5 },
    ...(d.pauseAt! < 1e8 ? [ // (rozhodnuto na začátku epizody – plán se za běhu nesmí měnit)
      { k: 'do', dur: 3 + 5 * hashNoise(h.project.seed, 9892, st.n), label: 'pauza – opřený o hole, rozhlíží se', tick: (el: number) => { const q = skiAt(path, d.s ?? 0); h.face(A[0], S(h, { X: q.p.X + Math.cos(q.dir) * 4 + (el > 2 ? 0 : 3), Z: q.p.Z + Math.sin(q.dir) * 4 + (el > 2 ? 0 : 5) }, 1.5)); } } as Step,
      { k: 'call', fn: () => { h.face(A[0], null); d.push = true; } } as Step,
      { k: 'do', dur: 0, label: 'rozbíhá se a pokračuje', until: () => (d.s ?? 0) >= total - 0.3 } as Step,
    ] : []),
    { k: 'call', fn: () => { skiTracks(st).push({ s0: d.s0 ?? 0, s1: d.s ?? 0, t0: h.time() }); if (skiTracks(st).length > 6) skiTracks(st).shift(); } },
  ];
}

/** Fyzika skluzu, fáze kroku, poloha a póza. */
function tick(c: EpisodeConfig, st: EpisodeState, A: AgentState[], h: ActorHost) {
  const d = st.data as D, a = A[0]; if (st.phase !== 'run' || a.hidden || d.s === undefined) return;
  const path = skiPath(h, c), dt = h.dt, lv = d.level ?? 1;
  const stride = 2 * (0.75 + 0.85 * lv); // délka cyklu (2 odrazy) v metrech
  // fáze: podle ujeté dráhy; při rozjezdu z místa krátké kroky (min. tempo)
  const ds = (d.v ?? 0) * dt;
  let dph = ds / stride; if (d.push && (d.v ?? 0) < 0.6) dph = Math.max(dph, dt * 0.55);
  d.ph = ((d.ph ?? 0) + dph) % 1;
  // odraz jen v oknech zatížení (p ∈ [0;0,2) a [0,5;0,7)); jinak skluz: tření + vzduch
  const p = d.ph, kick = d.push && ((p < 0.2) || (p >= 0.5 && p < 0.7));
  const thrust = kick ? SKI.thrust * (0.55 + 0.45 * lv) * Math.sin(Math.PI * ((p % 0.5) / 0.2)) : 0;
  const v0 = d.v ?? 0, res = SKI.mu * 9.81 + SKI.drag * v0 * v0;
  let v = v0 + (thrust - (v0 > 0 ? res : 0)) * dt; if (v < 0.02 && !kick) v = 0; // bez chvění u nuly
  const vmax = 1.2 + 1.3 * lv; if (v > vmax) v = vmax - (v - vmax) * 0.5;
  d.v = v; d.s += v * dt;
  const q = skiAt(path, d.s);
  a.pos = S(h, q.p); a.route = null; a.off = { x: 0, y: 0 };
  const ahead = S(h, { X: q.p.X + Math.cos(q.dir), Z: q.p.Z + Math.sin(q.dir) });
  a.facing = Math.atan2(ahead.y - a.pos.y, ahead.x - a.pos.x); a.groundHeading = q.dir; a.anim.dir = directionFromAngle(a.facing, a.anim.dir);
  // amplituda kroku s rychlostí a jistotou; ve stoji lyže rovnoběžně
  const amp = Math.min(1, v / (0.9 + 0.8 * lv)) * (0.55 + 0.45 * lv);
  d.amp = (d.amp ?? 0) + (amp - (d.amp ?? 0)) * Math.min(1, dt * 3);
  a.anim.sit = { kind: 'ski', t: d.ph, dur: 1e9, w: 1, r: d.amp };
  a.status = d.push ? (v < 0.5 ? 'Rozjíždí se na běžkách' : 'Běží na běžkách') : v > 0 ? 'Klouže' : 'Stojí na běžkách';
}
registerEpisode('ski', plan, tick);
export const skiData = (st: EpisodeState) => st.data as D;
