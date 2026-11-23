/**
 * Deterministický generátor náhodných čísel (sfc32). Stav je čtveřice uint32,
 * je plně serializovatelný (součást checkpointu simulace).
 */
export type RngState = [number, number, number, number];

export function hashString(s: string): number {
  // FNV-1a 32bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function seedRng(seed: number, stream = ''): RngState {
  const h = hashString(stream);
  const st: RngState = [seed >>> 0, (seed ^ 0x9e3779b9) >>> 0, h, (h ^ 0x85ebca6b) >>> 0];
  for (let i = 0; i < 12; i++) nextU32(st); // promíchání
  return st;
}

export function nextU32(s: RngState): number {
  let [a, b, c, d] = s;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c >>> 0; s[3] = d >>> 0;
  return t >>> 0;
}

export const rand = (s: RngState): number => nextU32(s) / 4294967296;
export const randRange = (s: RngState, lo: number, hi: number): number => lo + (hi - lo) * rand(s);
export const randInt = (s: RngState, lo: number, hiIncl: number): number => lo + Math.floor(rand(s) * (hiIncl - lo + 1));
export function pick<T>(s: RngState, arr: readonly T[]): T | undefined { return arr.length ? arr[Math.floor(rand(s) * arr.length)] : undefined; }
export function pickWeighted<T>(s: RngState, items: readonly T[], weight: (t: T) => number): T | undefined {
  const total = items.reduce((acc, it) => acc + Math.max(0, weight(it)), 0);
  if (total <= 0) return pick(s, items);
  let r = rand(s) * total;
  for (const it of items) { r -= Math.max(0, weight(it)); if (r < 0) return it; }
  return items[items.length - 1];
}

/** Bezstavová hash-náhoda pro vykreslování (např. sněžení): stejné vstupy ⇒ stejný výstup. */
export function hashNoise(seed: number, i: number, j = 0): number {
  let h = Math.imul(seed ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(i + 0x3c6ef372, 0x27d4eb2f) ^ Math.imul(j + 0x5bd1e995, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca77); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae3d); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
