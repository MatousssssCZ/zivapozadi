/**
 * Deterministické losování sociálních akcí (zadání C.5). Vlastní streamy oddělené od zbytku
 * simulace – změna počtu stop ve sněhu nebo pořadí chůze nezmění, kdo začne mluvit.
 * Stav je jediné uint32 číslo ⇒ serializovatelné v checkpointu.
 */
export interface Rng { state: number }

/** Mulberry32, otevřený interval (0,1) – bezpečné pro log. */
export function nextU01(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
}

/** FNV-1a nad UTF-8 `sceneSeed/entityId/subsystem` (verze 1 oddělovačů). */
export function streamSeed(sceneSeed: number | string, entityId: string, subsystem: string): number {
  const s = `v1/${sceneSeed}/${entityId}/${subsystem}`;
  const bytes = new TextEncoder().encode(s);
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h >>> 0;
}
export const makeRng = (sceneSeed: number | string, entityId: string, subsystem: string): Rng => ({ state: streamSeed(sceneSeed, entityId, subsystem) });

/** Trojúhelníkové rozdělení Tri(a, m, b). */
export function tri(a: number, m: number, b: number, u: number): number {
  if (b <= a) return a;
  const split = (m - a) / (b - a);
  return u < split ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m));
}
export const triR = (rng: Rng, a: number, m: number, b: number) => tri(a, m, b, nextU01(rng));
export const rangeR = (rng: Rng, a: number, b: number) => a + (b - a) * nextU01(rng);

/** Ořezaný lognormál – odmítnutí vzorků mimo interval (ne clamp). */
export function truncLogNormal(rng: Rng, mu: number, sigma: number, min: number, max: number, div = 1): number {
  for (let k = 0; k < 64; k++) {
    const u1 = nextU01(rng), u2 = nextU01(rng);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const x = Math.exp(mu + sigma * z) / div;
    if (x >= min && x <= max) return x;
  }
  return Math.exp(mu) / div; // prakticky nedosažitelné
}

/** Exponenciální čekání (s) pro četnost za minutu. */
export function expWait(rng: Rng, ratePerMinute: number): number {
  if (ratePerMinute <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(1 / 60, -Math.log(nextU01(rng)) * 60 / ratePerMinute);
}

/** Výběr podle vah (nulové váhy vynechány); null pokud nic. */
export function weighted<T>(rng: Rng, items: [T, number][]): T | null {
  const tot = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (tot <= 0) return null;
  let u = nextU01(rng) * tot;
  for (const [it, w] of items) { if (w <= 0) continue; u -= w; if (u <= 0) return it; }
  return items.filter(([, w]) => w > 0).at(-1)![0];
}
