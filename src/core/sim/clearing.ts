/**
 * Odklízení sněhu (balíček „živá pozadí“, A11). Pracovník s lopatou přijde, po jednotlivých pásech
 * (3–6 s shrnutí → 1–2 s posun) odhrne pruh sněhu – odkrývá se malovaná dlažba (plochý decal pod
 * chodci) – a sníh tlačí před lopatou ke konkrétní hromadě, která roste (omezeně). Průchod člověka
 * práci pozastaví. Celkem ~45–90 s, pak odchod a cooldown 600–1200 s. Při sněžení odkrytý pruh
 * pomalu zapadá; další úklid začne, jen když je zase co odklízet (žádné nekonečné odhrnování
 * neměnné plochy). Losování ze seedu (hashNoise) – neovlivní RNG ostatních postav.
 */
import type { Vec2 } from '../math/vec';
import type { AgentState } from './types';
import type { ProjectFile } from '../model/types';
import { cameraFor, toWorld } from '../scene/camera';
import { hashNoise } from '../math/rng';

export interface ClearingState {
  phase: 'offstage' | 'arrive' | 'work' | 'move' | 'pause' | 'leave';
  until: number; n: number;
  /** pás (0..bands−1), odkrytý podíl pruhu (0..1), množství sněhu v hromadě (0..1.3) */
  band: number; progress: number; pile: number;
  /** kdy byl pruh naposledy dokončen (zapadávání sněhem) */ doneAt: number | null;
  strokeEnd?: number;
  paused?: boolean;
}

export interface ClearingHost {
  project: ProjectFile; time(): number;
  worker(): AgentState | undefined;
  others(): AgentState[];
  walkPath(a: AgentState, pts: Vec2[], slow?: boolean): void;
  hide(a: AgentState): void;
  show(a: AgentState, p: Vec2): void;
  gesture(a: AgentState, dur: number): boolean;
  stopGesture(a: AgentState): void;
  giveShovel(a: AgentState, on: boolean): void;
  log(msg: string, id?: string): void;
}

/** Za jak dlouho odkrytý pruh zase zapadne (s), když sněží. */
export const REFILL_S = 1500;

/** Viditelně odkrytý podíl pruhu (0..1) – zohledňuje zapadávání po dokončení. */
export function clearedVisible(st: ClearingState | undefined, project: ProjectFile, t: number): number {
  if (!st) return 0;
  if (st.doneAt === null || st.phase !== 'offstage') return st.progress;
  const fade = project.scene.snowfall.enabled ? Math.max(0, 1 - (t - st.doneAt) / REFILL_S) : 1;
  return st.progress * fade;
}

const U = (seed: number, n: number, k: number) => hashNoise(seed, 9500 + n, k);

export function stepClearing(h: ClearingHost, st: ClearingState): void {
  const cfg = h.project.clearing!, t = h.time(), a = h.worker();
  if (!a) return;
  const bands = cfg.bands ?? 6, s = cfg.strip;
  const standAt = (k: number) => ({ x: s.x0 + ((s.x1 - s.x0) * k) / bands - cfg.standBack, y: s.y + 8 });
  switch (st.phase) {
    case 'offstage': {
      if (!a.hidden) h.hide(a);
      if (t < st.until) return;
      // start jen tehdy, je-li co odklízet (pruh z větší části zase zapadl)
      if (clearedVisible(st, h.project, t) > 0.3) { st.until = t + 60; return; }
      st.band = 0; st.progress = 0; st.doneAt = null;
      h.show(a, cfg.enter);
      h.giveShovel(a, true);
      h.walkPath(a, [...(cfg.approach ?? []), standAt(0)]);
      st.phase = 'arrive';
      h.log(`${a.name} jde odhrnout sníh.`, a.id);
      return;
    }
    case 'arrive':
    case 'move': {
      a.status = st.phase === 'arrive' ? 'Jde odhrnout sníh' : 'Posouvá se k dalšímu pásu';
      if (a.route) return;
      st.phase = 'work'; st.paused = true; // začne tahem, až je volno
      a.look = { angle: 0.1 }; // bokem ve směru odhrnování (k hromadě)
      st.until = t + 3 + 3 * U(h.project.seed, st.n, 10 + st.band);
      return;
    }
    case 'work': {
      a.status = 'Odhrnuje sníh';
      // průchod člověka práci pozastaví (kdo je blíž než 1,6 m nebo přímo v pruhu před lopatou)
      const cam = cameraFor(h.project.scene), W = toWorld(cam, a.pos);
      const busy = h.others().some((x) => {
        if (x.hidden) return false;
        const P = toWorld(cam, x.pos);
        const inStrip = x.pos.x > s.x0 - 20 && x.pos.x < s.x1 + 40 && Math.abs(x.pos.y - s.y) < 30;
        return Math.hypot(P.X - W.X, P.Z - W.Z) < 1.6 || inStrip;
      });
      if (busy) {
        if (!st.paused) { h.stopGesture(a); st.paused = true; a.status = 'Čeká, až kolemjdoucí projde'; }
        st.until += 1 / 60;
        return;
      }
      if (st.paused) { if (!h.gesture(a, Math.max(1.5, st.until - t))) return; st.paused = false; }
      const lo = st.band / bands, hi = (st.band + 1) / bands;
      const dur = Math.max(1e-3, st.until - t);
      st.progress = Math.min(hi, st.progress + ((hi - st.progress) * (1 / 60)) / dur);
      if (t < st.until) return;
      // pás hotový: sníh je u hromady
      st.progress = hi; void lo;
      st.pile = Math.min(1.3, st.pile + 1 / bands);
      st.band++;
      h.stopGesture(a);
      if (st.band >= bands) { st.phase = 'pause'; st.until = t + 2 + 3 * U(h.project.seed, st.n, 30); return; }
      h.walkPath(a, [standAt(st.band)], true);
      st.phase = 'move';
      return;
    }
    case 'pause': {
      a.status = 'Odpočívá, opřený o lopatu';
      if (t < st.until) return;
      a.look = null;
      h.walkPath(a, [...(cfg.approach ?? []).slice().reverse(), cfg.enter]);
      st.phase = 'leave';
      return;
    }
    case 'leave': {
      a.status = 'Odchází';
      if (a.route) return;
      h.giveShovel(a, false);
      h.hide(a);
      st.doneAt = t; st.n++;
      st.until = t + 600 + 600 * U(h.project.seed, st.n, 1);
      st.phase = 'offstage';
      h.log(`${a.name} odklidil(a) sníh.`, a.id);
      return;
    }
  }
}
