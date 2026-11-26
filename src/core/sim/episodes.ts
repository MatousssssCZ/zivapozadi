/**
 * Režisér scénických epizod (zadání 18 aktivit: A13, A11, A12, A08, A01).
 *
 * Epizoda = plán kroků pro jednu či více postav („herců“ s routine „actor“ – mimo epizodu jsou mimo
 * obraz). Krok je dokončen, až když platí jeho podmínka (všichni došli, uplynula doba, …) – přechody
 * nejsou jen časovač. Plán se z dat epizody skládá deterministicky znovu v každém kroku, stav
 * (index kroku, začátek, data) je čistý JSON. Mezi epizodami je přestávka z intervalu, začátek a
 * konec epizody jsou mimo obraz (příchod / odchod).
 */
import type { Vec2 } from '../math/vec';
import type { AgentState } from './types';
import type { ProjectFile } from '../model/types';
import type { HandTarget } from '../anim/animator';
import type { World } from '../scene/camera';
import { cameraFor, toScreen, toWorld } from '../scene/camera';
import { hashNoise } from '../math/rng';

export type EpisodeType = 'treeLot' | 'decorate' | 'lights' | 'fort' | 'ski';
export interface EpisodeConfig {
  id: string; type: EpisodeType; actors: string[]; interval: [number, number]; firstAt?: number;
  /** body scény (px) podle typu: vstup/výstup mimo obraz, pracovní místa… */ pts: Record<string, Vec2>;
  /** body cesty (px) podle typu */ paths?: Record<string, Vec2[]>;
}
/** data = stav jedné epizody (nuluje se), world = trvalý stav prostředí (stromky, ozdoby, světýlka, zeď…) */
export interface EpisodeState { phase: 'idle' | 'run'; until: number; si: number; st: number; n: number; data: Record<string, unknown>; world: Record<string, unknown>; done: number }
export const newEpisodeState = (c: EpisodeConfig): EpisodeState => ({ phase: 'idle', until: c.firstAt ?? 60, si: 0, st: 0, n: 0, data: {}, world: {}, done: 0 });

/** Co epizoda potřebuje od simulace. */
export interface ActorHost {
  project: ProjectFile; time(): number; dt: number;
  agent(id: string): AgentState | undefined;
  walk(a: AgentState, pts: Vec2[], speed: number): void; moving(a: AgentState): boolean;
  show(a: AgentState, p: Vec2): void; hide(a: AgentState): void; face(a: AgentState, p: Vec2 | null): void;
  hands(a: AgentState, t: [HandTarget | null, HandTarget | null] | null, w?: number): void;
  /** póza celého těla z klíče (kind) s váhou w; null = běžná */ pose(a: AgentState, kind: 'lift' | 'tuck' | 'kneel' | 'squat' | 'bend' | 'reach' | 'ski' | null, w?: number, t?: number, r?: number): void;
  gesture(a: AgentState, fam: string, dur?: number): boolean;
  log(msg: string, id?: string): void;
}

/** Krok plánu. `who` = indexy herců. */
export type Step =
  | { k: 'enter'; who: number[]; at: string[] }
  | { k: 'walk'; moves: { who: number; to: Vec2[]; sp: number }[]; label?: string }
  | { k: 'do'; dur: number; label: string; tick?: (el: number, h: ActorHost) => void; until?: (el: number, h: ActorHost) => boolean }
  | { k: 'call'; fn: (h: ActorHost) => void }
  | { k: 'exit'; moves: { who: number; to: Vec2[]; sp: number }[] };

export type PlanFn = (c: EpisodeConfig, st: EpisodeState, actors: AgentState[], h: ActorHost) => Step[];
const plans: Partial<Record<EpisodeType, PlanFn>> = {};
const stepHooks: Partial<Record<EpisodeType, (c: EpisodeConfig, st: EpisodeState, actors: AgentState[], h: ActorHost) => void>> = {};
export function registerEpisode(t: EpisodeType, plan: PlanFn, onTick?: (c: EpisodeConfig, st: EpisodeState, actors: AgentState[], h: ActorHost) => void) { plans[t] = plan; if (onTick) stepHooks[t] = onTick; }

/** Vynutí start (galerie aktivit / ladění). */
export function episodeStartNow(st: EpisodeState, t: number): boolean { if (st.phase !== 'idle') return false; st.until = t; return true; }

export function stepEpisode(c: EpisodeConfig, st: EpisodeState, h: ActorHost, busy: Set<string> = new Set()): void {
  const t = h.time(), actors = c.actors.map((id) => h.agent(id)).filter((a): a is AgentState => !!a);
  if (actors.length !== c.actors.length) return;
  if (st.phase === 'idle') {
    // herec může hrát i v jiné epizodě – schová ho jen ta, která ho právě nemá obsazeného
    for (const a of actors) if (!a.hidden && !busy.has(a.id)) h.hide(a);
    if (t < st.until) return;
    if (actors.some((a) => busy.has(a.id))) { st.until = t + 20; return; } // herec je zaneprázdněný jinde – počkat
    st.phase = 'run'; st.si = 0; st.st = t; st.n++; st.data = {};
  }
  const plan = plans[c.type]!(c, st, actors, h);
  stepHooks[c.type]?.(c, st, actors, h);
  const s = plan[st.si];
  if (!s) {
    for (const a of actors) { h.hands(a, null); h.pose(a, null); h.hide(a); }
    st.phase = 'idle'; st.done++; st.until = t + c.interval[0] + (c.interval[1] - c.interval[0]) * hashNoise(h.project.seed, 9800 + c.id.length, st.n);
    return;
  }
  const el = t - st.st, first = el < h.dt * 1.5, next = () => { st.si++; st.st = t; };
  switch (s.k) {
    case 'enter': s.who.forEach((i, k) => { h.show(actors[i], c.pts[s.at[k]]); }); next(); break;
    case 'walk': case 'exit':
      if (first) for (const m of s.moves) h.walk(actors[m.who], m.to, m.sp);
      if (!first && s.moves.every((m) => !h.moving(actors[m.who]))) next();
      else if (el > 25) { for (const m of s.moves) { const a = actors[m.who]; a.route = null; } next(); } // pojistka: nedošli (dav, překážka) – pokračují z místa, kde jsou
      break;
    case 'do':
      s.tick?.(el, h);
      if (el >= s.dur && (!s.until || s.until(el, h))) next();
      else if (s.until && el > s.dur + 60) next(); // pojistka proti uváznutí
      break;
    case 'call': s.fn(h); next(); break;
  }
}
export function episodeLabel(c: EpisodeConfig, st: EpisodeState, h: ActorHost): string {
  if (st.phase === 'idle') return 'čeká';
  const actors = c.actors.map((id) => h.agent(id)).filter((a): a is AgentState => !!a);
  const s = plans[c.type]!(c, st, actors, h)[st.si];
  return s ? (s.k === 'do' ? s.label : s.k === 'walk' ? (s.label ?? 'jdou') : s.k) : 'konec';
}

// ---------------------------------------------------------------- pomocné (svět ↔ obraz)
export const W = (h: ActorHost, p: Vec2): World => toWorld(cameraFor(h.project.scene), p);
export const S = (h: ActorHost, w: World, H = 0): Vec2 => toScreen(cameraFor(h.project.scene), w, H);
export const off = (h: ActorHost, p: Vec2, dX: number, dZ: number): Vec2 => { const w = W(h, p); return S(h, { X: w.X + dX, Z: w.Z + dZ }); };
