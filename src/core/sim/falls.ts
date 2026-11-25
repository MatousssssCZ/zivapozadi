/**
 * Pády chodců (zadání „Pády“): vzácná událost u osamělého chodce s volnýma rukama. Varianty (fallPoses.ts):
 * uklouznutí dozadu do sedu, zakopnutí dopředu na ruce a kolena, boční uklouznutí při otáčení a
 * zachycené uklouznutí. Průběh řídí čas události (pevný krok simulace → nezávislé na FPS):
 * chůze → ztráta opory → vyrovnání → pád → dopad → pauza → vstávání → oprášení → pokračování.
 *
 * Pravidla: globální rozestup a nejvýš jedna událost najednou, cooldown postavy, jen chodec, který
 * odchází po trase sám (bez dvojice, dítěte, psa a věcí v rukou), volné místo kolem (lidé, překážky).
 * Při dopadu jednou otisk ve sněhu (sed / dlaně / kolena / bok) z kontaktních bodů pózy. Lidé poblíž
 * se otočí; volitelně přijde pomocník (nabídne ruku při vstávání), pak pokračuje v odchodu.
 */
import type { AgentState } from './types';
import type { RngState } from '../math/rng';
import { rand } from '../math/rng';
import type { Vec2 } from '../math/vec';
import { fallDuration, fallImpactT, FALL_KEYS, FALL_LABEL, fallPhaseAt, FALL_PHASE_LABEL, type FallVariant } from '../anim/fallPoses';

export interface FallsConfig {
  enabled: boolean;
  /** střední interval mezi událostmi (s) a minimální rozestup (s) */ meanIntervalSec: number; minGapSec: number;
  /** cooldown jedné postavy (s) */ agentCooldownSec: number;
  /** podíl zachycených uklouznutí a vah pádů */ weights: Record<FallVariant, number>;
  /** pravděpodobnost pomocníka u pádu */ helperChance: number;
}
export const DEFAULT_FALLS: FallsConfig = { enabled: true, meanIntervalSec: 210, minGapSec: 120, agentCooldownSec: 900, weights: { saved: 0.45, back: 0.22, forward: 0.17, side: 0.16 }, helperChance: 0.5 };

export interface FallMark { X: number; Z: number; r: number; kind: string; t0: number; seed: number }
export interface FallEvent {
  id: number; agentId: string; v: FallVariant; s: 1 | -1; t0: number;
  /** zpomalení (ladění): čas události běží rychlostí 1/slow */ slow: number;
  markDone: boolean; reactDone: boolean; shifted: boolean;
  helperId: string | null; helperPhase: 'none' | 'going' | 'offer' | 'done';
  reactors: string[];
  /** natočení postavy na začátku (během pádu se nemění – pohled ani strana) */ facing: number; dir: string; gh?: number;
}
export interface FallsState { rng: RngState; next: number; lastAt: number; n: number; active: FallEvent[]; marks: FallMark[]; stats: Record<FallVariant, number> & { helped: number } }

export interface FallHost {
  time(): number;
  dt: number;
  agents(): AgentState[];
  cfg: FallsConfig;
  /** může postava teď upadnout (sama, volné ruce, jde po trase, volné místo)? */
  eligible(a: AgentState): boolean;
  /** může postava pomoci (dospělý, sám, odchází)? */
  canHelp(a: AgentState, fallen: AgentState): boolean;
  canHelpLoose(a: AgentState): boolean;
  distM(a: Vec2, b: Vec2): number;
  /** kontaktní body pózy ve světě (dopad) */ contactsWorld(a: AgentState): { X: number; Z: number; kind: string }[];
  onSnow(a: AgentState): boolean;
  /** posun polohy po skončení (pánev skončila jinde) */ applyEndShift(a: AgentState): void;
  helperSpot(fallen: AgentState, helper: AgentState): Vec2;
  walkTo(a: AgentState, p: Vec2): void;
  offerHand(a: AgentState, fallen: AgentState, dur: number): void;
  resume(a: AgentState): void;
  log(msg: string, id?: string): void;
}

export function newFallsState(rng: RngState, t: number, cfg: FallsConfig): FallsState {
  return { rng, next: t + cfg.meanIntervalSec * (0.5 + rand(rng)), lastAt: -1e9, n: 0, active: [], marks: [], stats: { back: 0, forward: 0, side: 0, saved: 0, helped: 0 } };
}

/** Spustí událost u postavy (náhodná nebo z ladění). */
export function startFall(h: FallHost, st: FallsState, a: AgentState, v: FallVariant, s: 1 | -1, opts: { slow?: number; helper?: boolean } = {}): FallEvent {
  const t = h.time();
  const e: FallEvent = { id: ++st.n, agentId: a.id, v, s, t0: t, slow: opts.slow ?? 1, markDone: false, reactDone: false, shifted: false, helperId: null, helperPhase: 'none', reactors: [], facing: a.facing, dir: a.anim.dir, gh: a.groundHeading };
  st.active.push(e); st.lastAt = t; st.stats[v]++;
  a.anim.fall = { v, s, t: 0 };
  a.cooldowns.fall = t + h.cfg.agentCooldownSec;
  a.speedFactor = 0;
  a.status = FALL_LABEL[v];
  // pomocník jen u skutečného pádu (ne u zachyceného uklouznutí)
  if (v !== 'saved' && (opts.helper ?? rand(st.rng) < h.cfg.helperChance)) {
    const cands = h.agents().filter((x) => x.id !== a.id && h.canHelp(x, a) && h.distM(x.pos, a.pos) < 7).sort((p, q) => h.distM(p.pos, a.pos) - h.distM(q.pos, a.pos));
    // ruční spuštění s pomocníkem (ladění): když nikdo neodchází, pomůže kdokoli volný do 12 m
    const pick = cands[0] ?? (opts.helper ? h.agents().filter((x) => x.id !== a.id && h.canHelpLoose(x) && h.distM(x.pos, a.pos) < 12).sort((p, q) => h.distM(p.pos, a.pos) - h.distM(q.pos, a.pos))[0] : undefined);
    if (pick) { e.helperId = pick.id; e.helperPhase = 'going'; }
  }
  h.log(`${a.name}: ${FALL_LABEL[v]}${e.helperId ? ' (přijde pomoc)' : ''}.`, a.id);
  return e;
}

/** Krok: náhodné spuštění a průběh běžících událostí. */
export function stepFalls(h: FallHost, st: FallsState): void {
  const t = h.time();
  if (h.cfg.enabled && !st.active.length && t >= st.next) {
    st.next = t + h.cfg.meanIntervalSec * (0.5 + rand(st.rng)); // (střední hodnota = meanIntervalSec)
    if (t - st.lastAt >= h.cfg.minGapSec) {
      const cands = h.agents().filter((a) => h.eligible(a) && !(a.cooldowns.fall > t));
      if (cands.length) {
        const a = cands[Math.floor(rand(st.rng) * cands.length)];
        const W = h.cfg.weights, tot = W.saved + W.back + W.forward + W.side;
        let r = rand(st.rng) * tot, v: FallVariant = 'saved';
        for (const k of ['saved', 'back', 'forward', 'side'] as FallVariant[]) { if (r < W[k]) { v = k; break; } r -= W[k]; }
        startFall(h, st, a, v, rand(st.rng) < 0.5 ? 1 : -1);
      }
    }
  }
  for (const e of [...st.active]) {
    const a = h.agents().find((x) => x.id === e.agentId);
    if (!a || !a.anim.fall) { st.active = st.active.filter((x) => x !== e); continue; }
    const f = a.anim.fall;
    f.t += h.dt / e.slow;
    const dur = fallDuration(e.v), imp = fallImpactT(e.v);
    a.speedFactor = 0;
    a.facing = e.facing; a.anim.dir = e.dir as typeof a.anim.dir; if (e.gh !== undefined) a.groundHeading = e.gh;
    a.status = `${FALL_LABEL[e.v]} – ${FALL_PHASE_LABEL[fallPhaseAt(e.v, f.t)]}`;
    // dopad: otisk ve sněhu (jednou), reakce lidí poblíž
    if (imp !== null && f.t >= imp && !e.markDone) {
      e.markDone = true;
      if (h.onSnow(a)) for (const c of h.contactsWorld(a)) if (c.kind !== 'f') st.marks.push({ X: c.X, Z: c.Z, r: c.kind === 's' ? 0.17 : 0.07, kind: c.kind, t0: t, seed: st.n * 31 + st.marks.length });
      if (st.marks.length > 64) st.marks.splice(0, st.marks.length - 64);
    }
    if (!e.reactDone && f.t >= (imp ?? 0.4)) {
      e.reactDone = true;
      for (const x of h.agents()) if (x.id !== a.id && !x.hidden && h.distM(x.pos, a.pos) < 8 && !x.activity) { x.look = { x: a.pos.x, y: a.pos.y - 30 }; e.reactors.push(x.id); }
    }
    if (e.reactDone && f.t >= (imp ?? 0.4) + 3.5 && e.reactors.length) {
      for (const id of e.reactors) { const x = h.agents().find((q) => q.id === id); if (x && x.look && 'x' in x.look && Math.abs(x.look.x - a.pos.x) < 1e-6) x.look = null; }
      e.reactors = [];
    }
    // pomocník: dojde k ležícímu, při vstávání nabídne ruku, pak pokračuje
    if (e.helperId) {
      const hp = h.agents().find((x) => x.id === e.helperId);
      const getup = FALL_KEYS[e.v].find((k) => k.ph === 'getup')?.t ?? dur;
      if (!hp || hp.hidden) e.helperPhase = 'done';
      else if (e.helperPhase === 'going' && f.t >= (imp ?? 0) + 0.3) {
        if (!hp.route || hp.route.purpose !== 'pomoc') h.walkTo(hp, h.helperSpot(a, hp));
        e.helperPhase = 'offer';
      } else if (e.helperPhase === 'offer') {
        hp.look = { x: a.pos.x, y: a.pos.y - 20 };
        if (!hp.route && f.t >= getup - 0.4) { h.offerHand(hp, a, Math.max(1.5, (getup + 1.6 - f.t) * e.slow)); e.helperPhase = 'done'; st.stats.helped++; h.log(`${hp.name} pomáhá vstát (${a.name}).`, hp.id); }
      }
      if (e.helperPhase === 'done' && f.t >= dur - 0.2 && hp && hp.route?.purpose !== 'leave') { if (!hp.hidden) { hp.look = null; h.resume(hp); } e.helperId = null; }
    }
    // konec: posun polohy na místo, kde pánev skončila (před doběhnutím prolínání), pak pokračuje v chůzi
    if (!e.shifted && f.t >= dur - 0.36) { e.shifted = true; h.applyEndShift(a); }
    // po posunu: čistý klid (rozejití pak začne z výchozího postoje, stejného jako konec pádu)
    if (e.shifted) { a.anim.settle = null; a.anim.startRest = null; a.anim.walkBlend = 0; }
    if (f.t >= dur) {
      a.anim.fall = null; a.speedFactor = 1; a.status = 'Pokračuje';
      st.active = st.active.filter((x) => x !== e);
      if (e.helperId) { const hp = h.agents().find((x) => x.id === e.helperId); if (hp && !hp.hidden) { hp.look = null; h.resume(hp); } }
    }
  }
}
