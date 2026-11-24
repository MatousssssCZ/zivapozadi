/**
 * Živé prostředí (balíček „živá pozadí“, 03 C: E01–E05; 02 §7).
 *
 *  - společný vítr: základ ze scény + jemné poryvy 8–20 s s obálkou 2–5 s; všechny efekty berou
 *    **integrál** větru, takže změna síly nikdy nezpůsobí skok poloh (ne `wind(t)·t`),
 *  - proměnlivá hustota sněžení 0,7–1,15× s plynulými přechody 30–90 s,
 *  - pára (kelímky, samovar) a kouř (komíny) jako omezený pool částic v SimState: vypuštěná
 *    pára zůstává ve světě a necestuje s rukou.
 * Vše je funkce seedu a simulačního času (vlastní streamy – nemění rozhodování lidí).
 */
import { hashNoise } from '../math/rng';

// ------------------------------------------------------------------ vítr
interface Gust { s: number; d: number; a: number }
const gustCache = new Map<number, Gust[]>();
function gustsUpTo(seed: number, t: number): Gust[] {
  let g = gustCache.get(seed);
  if (!g) { g = []; gustCache.set(seed, g); }
  let s = g.length ? g[g.length - 1].s : 2 + hashNoise(seed, 901) * 6;
  while (!g.length || g[g.length - 1].s <= t + 30) {
    const k = g.length;
    if (k) s += 8 + hashNoise(seed, 902, k) * 12; // poryv každých 8–20 s
    g.push({ s, d: 2 + hashNoise(seed, 903, k) * 3, a: 0.35 + hashNoise(seed, 904, k) * 0.65 });
  }
  return g;
}
/** Násobek větru v čase (1 = základ, poryv až ~2×). */
export function windFactor(seed: number, t: number, gusts = true): number {
  if (!gusts) return 1;
  let f = 1;
  for (const q of gustsUpTo(seed, t)) {
    if (q.s > t) break;
    if (t < q.s + q.d) { const u = (t - q.s) / q.d; f += q.a * Math.sin(Math.PI * u) ** 2; }
  }
  return f;
}
/** ∫₀ᵗ násobek větru (s) – posun částic je base·(W(t) − W(t₀)): spojitý i při poryvu. */
export function windIntegral(seed: number, t: number, gusts = true): number {
  if (!gusts) return t;
  let w = t;
  for (const q of gustsUpTo(seed, t)) {
    if (q.s >= t) break;
    const x = Math.min(t, q.s + q.d) - q.s;
    w += q.a * (x / 2 - (q.d / (4 * Math.PI)) * Math.sin((2 * Math.PI * x) / q.d));
  }
  return w;
}

// ------------------------------------------------------------------ hustota sněžení
const densCache = new Map<number, { t: number; v: number }[]>();
/** Násobek hustoty 0,7–1,15 s přechody 30–90 s (kosinová interpolace mezi úrovněmi). */
export function snowDensityFactor(seed: number, t: number, variable = true): number {
  if (!variable) return 1;
  let k = densCache.get(seed);
  if (!k) { k = [{ t: 0, v: 1 }]; densCache.set(seed, k); }
  while (k[k.length - 1].t <= t) { const n = k.length; k.push({ t: k[n - 1].t + 30 + hashNoise(seed, 911, n) * 60, v: 0.7 + hashNoise(seed, 912, n) * 0.45 }); }
  let i = 0;
  while (k[i + 1].t <= t) i++;
  const a = k[i], b = k[i + 1], u = (t - a.t) / (b.t - a.t);
  return a.v + (b.v - a.v) * (0.5 - 0.5 * Math.cos(Math.PI * u));
}

// ------------------------------------------------------------------ částice páry a kouře
export interface Particle {
  kind: 'cupSteam' | 'steam' | 'smoke';
  /** místo vzniku (px scény) a čas */ x: number; y: number; t0: number; life: number;
  /** integrál větru při vzniku */ w0: number;
  /** měřítko hloubky v místě vzniku */ sc: number;
  seed: number;
}
export const PARTICLE_POOL = 256;

/** Poloha a vzhled částice v čase t (null = mimo život). */
export function particleAt(p: Particle, t: number, windBase: number, seed: number, gusts: boolean): { x: number; y: number; r: number; a: number } | null {
  const age = t - p.t0;
  if (age < 0 || age > p.life) return null;
  const u = age / p.life;
  const drift = (windIntegral(seed, t, gusts) - p.w0) * windBase * (p.kind === 'smoke' ? 60 : 28) * p.sc;
  const rise = p.kind === 'smoke' ? 16 : p.kind === 'steam' ? 15 : 10;
  const wob = Math.sin(age * (1.3 + hashNoise(p.seed, 1) * 1.2) + hashNoise(p.seed, 2) * 6.28) * (2 + 4 * u) * p.sc;
  const x = p.x + drift + wob, y = p.y - rise * age * p.sc * (1 - 0.35 * u);
  const r0 = p.kind === 'smoke' ? 8 : p.kind === 'steam' ? 5 : 2.4;
  const r = (r0 + r0 * 2.2 * u) * p.sc;
  const peak = p.kind === 'smoke' ? 0.26 : p.kind === 'steam' ? 0.3 : 0.24;
  const a = peak * Math.min(1, u / 0.15) * (1 - u) ** 1.5;
  return { x, y, r, a };
}

/** Přidá částici do poolu (nejstarší kosmetické se uvolní; pool je omezený). */
export function emit(pool: Particle[], p: Particle): void {
  if (pool.length >= PARTICLE_POOL) pool.shift();
  pool.push(p);
}
/** Má emitor v kroku [t−dt, t) vypustit částici? (pravidelně s fází podle id – deterministické) */
export function emitsNow(id: number, rate: number, t: number, dt: number): boolean {
  const ph = hashNoise(id, 77);
  return Math.floor(t * rate + ph) !== Math.floor((t - dt) * rate + ph);
}
