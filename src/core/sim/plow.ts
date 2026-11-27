/**
 * Traktor s radlicí (Horské městečko): občas projede po silnici zleva doprava (start i cíl mimo
 * obraz), radlice shrnuje sníh k bližší krajnici. Za ním zůstane odhrnutý pás (vrstva sněhu na silnici
 * je tenčí) a val na bližší straně; při sněžení pás pomalu znovu zapadá. Časy jsou režijní výchozí
 * hodnoty ze zadání: první průjezd 60–120 s, interval 240–420 s, průjezd 25–40 s.
 */
import type { Vec2 } from '../math/vec';
import type { ProjectFile } from '../model/types';
import { cameraFor, toWorld, type Camera, type World } from '../scene/camera';
import { hashNoise } from '../math/rng';
import { SIM_DT } from './types';

export interface PlowConfig {
  /** osa jízdy po silnici (obraz, zleva doprava; první a poslední bod mimo obraz) */ path: Vec2[];
  firstDelay?: [number, number]; interval?: [number, number]; traversal?: [number, number];
  /** šířka radlice (m) */ bandW?: number;
}
export interface PlowState {
  phase: 'off' | 'run'; until: number; n: number;
  /** poloha na ose (m), rychlost (m/s), cílová rychlost, ujetá dráha kol */ s: number; v: number; vT: number; dist: number;
  /** odhrnutí po úsecích osy (0–1, 1 = právě odhrnuto) a val na bližší krajnici */ cleared: number[]; berm: number[];
}
/** úsek pásu (m), délka za středem (m), radlice před středem (m) */
export const PLOW = { bin: 0.5, length: 2.2, blade: 2.45 } as const;

interface Axis { pts: World[]; cum: number[]; len: number }
const cache = new WeakMap<PlowConfig, Axis>();
export function plowAxis(cam: Camera, cfg: PlowConfig): Axis {
  let a = cache.get(cfg);
  if (!a) {
    const pts: World[] = [];
    for (let i = 0; i < cfg.path.length - 1; i++) {
      const p = cfg.path[i], q = cfg.path[i + 1], n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 10));
      for (let j = 0; j < n; j++) pts.push(toWorld(cam, { x: p.x + ((q.x - p.x) * j) / n, y: p.y + ((q.y - p.y) * j) / n }));
    }
    pts.push(toWorld(cam, cfg.path[cfg.path.length - 1]));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Z - pts[i - 1].Z));
    a = { pts, cum, len: cum[cum.length - 1] }; cache.set(cfg, a);
  }
  return a;
}
/** bod a směr osy v délce s (m) */
export function axisAt(a: Axis, s: number): { P: World; hd: number } {
  s = Math.max(0, Math.min(a.len, s));
  let lo = 0, hi = a.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a.cum[m] <= s) lo = m; else hi = m; }
  const p = a.pts[lo], q = a.pts[hi], L = a.cum[hi] - a.cum[lo] || 1e-9, f = (s - a.cum[lo]) / L;
  return { P: { X: p.X + (q.X - p.X) * f, Z: p.Z + (q.Z - p.Z) * f }, hd: Math.atan2(q.Z - p.Z, q.X - p.X) };
}

export function newPlowState(project: ProjectFile): PlowState {
  const cfg = project.plow!, cam = cameraFor(project.scene), ax = plowAxis(cam, cfg), nb = Math.ceil(ax.len / PLOW.bin) + 1;
  const [f0, f1] = cfg.firstDelay ?? [60, 120];
  return { phase: 'off', until: f0 + (f1 - f0) * hashNoise(project.seed, 9500, 0), n: 0, s: 0, v: 0, vT: 0, dist: 0, cleared: new Array(nb).fill(0), berm: new Array(nb).fill(0) };
}

export function stepPlow(project: ProjectFile, st: PlowState, t: number, log: (m: string) => void): void {
  const cfg = project.plow!, cam = cameraFor(project.scene), ax = plowAxis(cam, cfg), dt = SIM_DT;
  // zapadání odhrnutého pásu (při sněžení rychleji); po 0,5 s – levné a stejné výsledky
  if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
    const k = (project.scene.snowfall?.enabled ? 1 / 300 : 1 / 1200) * 0.5;
    for (let i = 0; i < st.cleared.length; i++) { if (st.cleared[i] > 0) st.cleared[i] = Math.max(0, st.cleared[i] - k); if (st.berm[i] > 0) st.berm[i] = Math.max(0, st.berm[i] - k * 0.6); }
  }
  if (st.phase === 'off') {
    if (t < st.until) return;
    const [a, b] = cfg.traversal ?? [25, 40], dur = a + (b - a) * hashNoise(project.seed, 9510, st.n);
    st.phase = 'run'; st.s = 0; st.v = 0; st.vT = ax.len / dur; st.dist = 0;
    log('Traktor s radlicí vyjíždí odhrnovat silnici.');
    return;
  }
  // plynulý rozjezd, drobné kolísání rychlosti (plyn, nerovnosti)
  const vT = st.vT * (1 + 0.06 * Math.sin(t * 0.37 + st.n) + 0.03 * Math.sin(t * 1.3));
  st.v += Math.sign(vT - st.v) * Math.min(Math.abs(vT - st.v), dt * 0.6);
  const s0 = st.s; st.s += st.v * dt; st.dist += st.v * dt;
  // radlice (před přední nápravou) odhrne pás mezi minulou a novou polohou
  const b0 = Math.floor((s0 + PLOW.blade) / PLOW.bin), b1 = Math.floor((st.s + PLOW.blade) / PLOW.bin);
  for (let i = Math.max(0, b0); i <= Math.min(st.cleared.length - 1, b1); i++) { st.cleared[i] = 1; st.berm[i] = Math.min(1, st.berm[i] * 0.4 + 0.9); }
  if (st.s - PLOW.length >= ax.len) {
    st.phase = 'off'; st.n++;
    const [a, b] = cfg.interval ?? [240, 420];
    st.until = t + a + (b - a) * hashNoise(project.seed, 9520, st.n);
    log('Traktor odjel za okraj scény.');
  }
}
