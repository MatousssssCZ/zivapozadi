/**
 * A11 – Zdobení venkovního stromku. Rodič přinese krabici s ozdobami a postaví ji vedle stromku
 * (přidřep). Pak 3–4 ozdoby: dítě se skloní ke krabici a vybere ozdobu, nízkou větev ozdobí samo
 * (přikročí, zvedne ruku k větvi, nasadí, ruku stáhne), vysokou podá rodiči – předání je společný
 * kontakt (ruce se potkají, rodič převezme, teprve pak dítě pustí) – rodič zavěsí nahoru. Zavěšená
 * ozdoba se kývá jako kyvadlo (frekvence z délky závěsu, tlumení). Oba ustoupí, prohlédnou si strom,
 * rodič odnese krabici. Ozdoby zůstávají, obsazené háčky se znovu nepoužijí, krabice ubývá.
 */
import type { World } from '../../scene/camera';
import type { AgentState } from '../types';
import { registerEpisode, W, S, type ActorHost, type EpisodeConfig, type EpisodeState, type Step } from '../episodes';
import { hashNoise } from '../../math/rng';

export const DECO_TREE_H = 1.35;
export const ORN_COLORS = ['#c8302c', '#d9a23a', '#2f7f7a', '#e9e1cf', '#3b5aa8', '#8a2f6a'];
/** háčky na větvích: výška (podíl), bok (−1..1); nízké pro dítě, vysoké pro rodiče */
export const HOOKS: { f: number; u: number }[] = [{ f: 0.28, u: -0.5 }, { f: 0.36, u: 0.45 }, { f: 0.62, u: -0.3 }, { f: 0.7, u: 0.28 }, { f: 0.22, u: 0.1 }, { f: 0.5, u: -0.05 }, { f: 0.78, u: -0.12 }, { f: 0.44, u: -0.62 }];
export interface Orn { hook: number; color: string; t0: number }
export const ornsOf = (st: EpisodeState) => (st.world.orn ??= []) as Orn[];
export const boxLeft = (st: EpisodeState) => (st.world.box ??= 8) as number;
export function hookWorld(h: ActorHost, c: EpisodeConfig, i: number): World & { H: number } {
  const T = W(h, c.pts.tree), k = HOOKS[i], w = DECO_TREE_H * 0.36 * (1 - k.f) * 0.95;
  return { X: T.X + k.u * w, Z: T.Z - 0.12 - 0.15 * (1 - Math.abs(k.u)), H: k.f * DECO_TREE_H };
}
interface D { held?: { who: number; color: string } | null; box?: 'carried' | 'ground' | null; plan?: { hook: number; byKid: boolean; color: string }[] }
const L_ADULT = 0.92, L_KID = 0.6;

function plan(c: EpisodeConfig, st: EpisodeState, A: AgentState[], h: ActorHost): Step[] {
  const d = st.data as D, orn = ornsOf(st);
  if (!d.plan) {
    const free = HOOKS.map((_, i) => i).filter((i) => !orn.some((o) => o.hook === i));
    const n = Math.min(free.length, boxLeft(st), 3 + Math.floor(hashNoise(h.project.seed, 9870, st.n) * 2));
    d.plan = free.slice(0, n).map((hook, j) => ({ hook, byKid: HOOKS[hook].f < 0.45, color: ORN_COLORS[(st.n * 3 + j) % ORN_COLORS.length] }));
    d.box = 'carried';
  }
  const P = A[0], K = A[1], T = W(h, c.pts.tree), Bx = W(h, c.pts.box);
  const at = (w: World, dx: number, dz: number) => S(h, { X: w.X + dx, Z: w.Z + dz });
  const toHook = (who: AgentState, i: number, L: number, w: number) => {
    // ruka k háčku: vzdálenost vpřed od postavy a výška (v délkách nohy)
    const p = W(h, who.pos), q = hookWorld(h, c, i), fwd = Math.hypot(q.X - p.X, q.Z - p.Z);
    h.hands(who, [null, { u: Math.min(0.75, fwd / L), h: q.H / L, lat: 0.05 }], w); h.face(who, S(h, q, q.H));
  };
  const steps: Step[] = [
    { k: 'enter', who: [0, 1], at: ['in', 'in2'] },
    { k: 'call', fn: () => { h.hands(P, [{ u: 0.3, h: 0.86, lat: -0.2 }, { u: 0.3, h: 0.86, lat: 0.2 }]); } },
    { k: 'walk', label: 'nesou krabici s ozdobami ke stromku', moves: [{ who: 0, to: [at(Bx, 0.05, -0.5)], sp: 0.55 }, { who: 1, to: [at(T, 0.2, -0.75)], sp: 0.6 }] },
    { k: 'do', dur: 2.2, label: 'pokládá krabici', tick: (el) => { h.face(P, S(h, Bx)); h.pose(P, 'lift', Math.min(1, el / 0.8, (2.2 - el) / 0.7), el); if (el > 1.0 && d.box === 'carried') { d.box = 'ground'; h.hands(P, null); } } },
  ];
  for (const [j, it] of d.plan!.entries()) {
    const hw = hookWorld(h, c, it.hook);
    steps.push(
      { k: 'walk', label: 'dítě jde ke krabici', moves: [{ who: 1, to: [at(Bx, 0.35, -0.35)], sp: 0.5 }] },
      { k: 'do', dur: 2.0, label: 'dítě vybírá ozdobu', tick: (el) => { h.face(K, S(h, Bx)); h.pose(K, 'lift', Math.min(1, el / 0.6, (2.0 - el) / 0.6) * 0.8, el); if (el > 1.0 && !d.held) { d.held = { who: 1, color: it.color }; (st.world as { box: number }).box = boxLeft(st) - 1; } } },
    );
    if (it.byKid) {
      steps.push(
        { k: 'walk', label: 'dítě jde k nízké větvi', moves: [{ who: 1, to: [at(hw, (HOOKS[it.hook].u < 0 ? -1 : 1) * 0.42, -0.22)], sp: 0.45 }] }, // z boku (stromek zůstane vidět)
        { k: 'do', dur: 2.6, label: 'dítě věší ozdobu na nízkou větev', tick: (el) => {
          toHook(K, it.hook, L_KID, Math.min(1, el / 0.8, Math.max(0, (2.6 - el) / 0.6)));
          if (el > 1.5 && d.held) { orn.push({ hook: it.hook, color: it.color, t0: h.time() }); d.held = null; h.log(`${K.name} pověsil(a) ozdobu na stromek.`, K.id); }
        } },
      );
    } else {
      // předání: dítě přinese ozdobu rodiči, ruce se potkají, rodič převezme, pak dítě pustí
      steps.push(
        { k: 'walk', label: 'dítě nese ozdobu rodiči', moves: [{ who: 1, to: [at(hw, (HOOKS[it.hook].u < 0 ? -1 : 1) * 1.05, -0.45)], sp: 0.45 }, { who: 0, to: [at(hw, (HOOKS[it.hook].u < 0 ? -1 : 1) * 0.5, -0.2)], sp: 0.45 }] },
        { k: 'do', dur: 2.2, label: 'předává ozdobu rodiči', tick: (el) => {
          h.face(K, P.pos); h.face(P, K.pos);
          const w = Math.min(1, el / 0.7, Math.max(0, (2.2 - el) / 0.5));
          h.hands(K, [null, { u: 0.55, h: 1.35, lat: 0.1 }], w); h.hands(P, [null, { u: 0.42, h: 0.95, lat: -0.05 }], w);
          if (el > 1.1 && d.held?.who === 1) d.held = { who: 0, color: it.color }; // převzetí v okamžiku kontaktu
        } },
        { k: 'do', dur: 2.8, label: 'rodič věší ozdobu nahoru', tick: (el) => {
          h.hands(K, null); toHook(P, it.hook, L_ADULT, Math.min(1, el / 0.8, Math.max(0, (2.8 - el) / 0.6)));
          if (el > 1.7 && d.held) { orn.push({ hook: it.hook, color: it.color, t0: h.time() }); d.held = null; h.log(`${P.name} zavěsil(a) ozdobu nahoru.`, P.id); }
        } },
      );
    }
    void j;
  }
  steps.push(
    { k: 'walk', label: 'ustoupí a prohlédnou si stromek', moves: [{ who: 0, to: [at(T, -1.1, -1.0)], sp: 0.45 }, { who: 1, to: [at(T, 0.95, -0.95)], sp: 0.45 }] },
    { k: 'do', dur: 3.5, label: 'prohlížejí ozdobený stromek', tick: (el) => { for (const a of A) h.face(a, S(h, T, 0.9)); if (el < h.dt * 1.5) h.gesture(K, 'point', 2); } },
    { k: 'walk', label: 'rodič jde pro krabici', moves: [{ who: 0, to: [at(Bx, 0.05, -0.5)], sp: 0.5 }] },
    { k: 'do', dur: 2.2, label: 'zvedá krabici', tick: (el) => { h.face(P, S(h, Bx)); h.pose(P, 'lift', Math.min(1, el / 0.8, (2.2 - el) / 0.7), el); if (el > 1.1 && d.box === 'ground') { d.box = 'carried'; h.hands(P, [{ u: 0.3, h: 0.86, lat: -0.2 }, { u: 0.3, h: 0.86, lat: 0.2 }]); } } },
    { k: 'exit', moves: [{ who: 0, to: [c.pts.out], sp: 0.55 }, { who: 1, to: [c.pts.out2], sp: 0.6 }] },
  );
  return steps;
}
function tick(_c: EpisodeConfig, st: EpisodeState, A: AgentState[]) {
  const d = st.data as D; if (st.phase !== 'run') return;
  if (d.box === 'carried') A[0].status = 'Nese krabici s ozdobami';
}
registerEpisode('decorate', plan, tick);

/** Úhel kývání zavěšené ozdoby (kyvadlo délky ℓ: ω = √(g/ℓ), útlum τ = 2,5 s). */
export function ornSwing(o: Orn, t: number): number { const a = t - o.t0, l = 0.06, w = Math.sqrt(9.81 / l); return a < 0 ? 0 : 0.35 * Math.exp(-a / 2.5) * Math.sin(w * a); }
export const decoData = (st: EpisodeState) => st.data as D;
