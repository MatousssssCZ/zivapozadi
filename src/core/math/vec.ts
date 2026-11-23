export interface Vec2 { x: number; y: number }

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const norm = (a: Vec2): Vec2 => { const l = len(a); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; };
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** Normalizuje úhel do intervalu (-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Posune úhel `from` směrem k `to` maximálně o `maxDelta`. */
export function approachAngle(from: number, to: number, maxDelta: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxDelta) return to;
  return wrapAngle(from + Math.sign(d) * maxDelta);
}

export function smoothstep(t: number): number { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); }

/** Zaokrouhlení pro stabilní serializaci (odstraní šum posledních bitů). */
export function round6(x: number): number { return Math.round(x * 1e6) / 1e6; }
