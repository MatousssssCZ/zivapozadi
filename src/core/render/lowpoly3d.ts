/**
 * Společné jádro nízkopolygonových 3D modelů (auta, komunální vůz, traktor do ulice): model v souřadnicích
 * x vpřed, z doleva, h nahoru (m), umístěný ve světě (bod na zemi P, směr hd, měřítko kS – model odpovídá
 * měřítku postav) a promítnutý kamerou scény. Plochy se ořežou podle odvrácení od kamery (normála míří od
 * středu tělesa `o`), seřadí od nejvzdálenější (malířův algoritmus) a stínují večerním světlem.
 */
import type { Camera, World } from '../scene/camera';
import { toScreen } from '../scene/camera';
import type { Vec2 } from '../math/vec';

type Ctx = CanvasRenderingContext2D;
export type V3 = [number, number, number];
export interface Face {
  pts: V3[]; color: string; alpha?: number; /** posun řazení (m, kladné = dál) */ bias?: number;
  /** střed tělesa – normála míří od něj ven */ o?: V3; post?: (P: (v: V3) => Vec2) => void; noCull?: boolean; stroke?: boolean;
}

/** Umístění modelu ve světě: projekce bodu modelu do obrazu a do světa. */
export interface Placement { proj: (v: V3, lift?: number) => Vec2; world: (v: V3) => { X: number; Z: number; H: number }; kS: number }
export function place(cam: Camera, P: World, hd: number, kS: number, lift = 0): Placement {
  const c = Math.cos(hd) * kS, s = Math.sin(hd) * kS;
  return {
    kS,
    proj: (v, l = lift) => toScreen(cam, { X: P.X + v[0] * c - v[1] * s, Z: P.Z + v[0] * s + v[1] * c }, (v[2] + l) * kS),
    world: (v) => ({ X: P.X + v[0] * c - v[1] * s, Z: P.Z + v[0] * s + v[1] * c, H: v[2] * kS }),
  };
}

export function box(x0: number, x1: number, z0: number, z1: number, h0: number, h1: number, color: string, top = color, extra: Partial<Face> = {}): Face[] {
  const v = (x: number, z: number, h: number): V3 => [x, z, h], o: V3 = [(x0 + x1) / 2, (z0 + z1) / 2, (h0 + h1) / 2];
  return ([
    { pts: [v(x0, z0, h1), v(x1, z0, h1), v(x1, z1, h1), v(x0, z1, h1)], color: top, ...extra },
    { pts: [v(x0, z0, h0), v(x0, z1, h0), v(x1, z1, h0), v(x1, z0, h0)], color, ...extra },
    { pts: [v(x1, z0, h0), v(x1, z1, h0), v(x1, z1, h1), v(x1, z0, h1)], color, ...extra },
    { pts: [v(x0, z0, h0), v(x0, z0, h1), v(x0, z1, h1), v(x0, z1, h0)], color, ...extra },
    { pts: [v(x0, z1, h0), v(x0, z1, h1), v(x1, z1, h1), v(x1, z1, h0)], color, ...extra },
    { pts: [v(x0, z0, h0), v(x1, z0, h0), v(x1, z0, h1), v(x0, z0, h1)], color, ...extra },
  ] as Face[]).map((f) => ({ ...f, o }));
}

/** kolo: běhoun (pásy) a oba boky; dezén se otáčí s úhlem rot (= −ujetá dráha / poloměr) */
export function wheel(cx: number, cz: number, r: number, w: number, rot: number, tire = '#232225', tire2 = '#2e2d30'): Face[] {
  const N = 14, out: Face[] = [], z0 = cz - w / 2, z1 = cz + w / 2;
  const ring = (z: number, rr: number) => Array.from({ length: N }, (_, i) => { const a = rot + (i / N) * Math.PI * 2; return [cx + Math.cos(a) * rr, z, r + Math.sin(a) * rr] as V3; });
  const A = ring(z0, r), B = ring(z1, r), o: V3 = [cx, cz, r];
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; out.push({ pts: [A[i], A[j], B[j], B[i]], color: i % 2 ? tire : tire2, o, stroke: false }); }
  out.push({ pts: B, color: tire, o }, { pts: [...A].reverse(), color: tire, o });
  return out;
}

const shadeCache = new Map<string, string>();
/** stín do studené modrofialové (modrý podvečer), světlo do teplé (okna, lampy) */
export function shadeColor(hex: string, k: number): string {
  const q = Math.round(k * 20) / 20, key = hex + q;
  let s = shadeCache.get(key);
  if (!s) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number, cool: number, warm: number) => Math.round(Math.max(0, Math.min(255, q < 0.8 ? v * q + cool * (1 - q) * 0.3 : v * q + (warm - v) * (q - 0.8) * 0.4)));
    s = `rgb(${f(r, 60, 255)},${f(g, 70, 215)},${f(b, 120, 180)})`;
    shadeCache.set(key, s);
  }
  return s;
}

/**
 * Vykreslí plochy: ořez odvrácených, řazení od nejvzdálenější, stínování podle normály. `light` = směr
 * světla ve světě. Plochy bez obrysu (stroke: false) se obtáhnou vlastní barvou (žádné švy mezi dílky).
 */
export function drawFaces(ctx: Ctx, cam: Camera, pl: Placement, faces: Face[], ppm: number, light = { X: 0.3, Z: 0.5, H: 0.8 }) {
  const camP = { X: 0, Z: 0, H: cam.h }, Ln = Math.hypot(light.X, light.Z, light.H);
  const items: { d: number; f: Face; shade: number }[] = [];
  for (const f of faces) {
    const W = f.pts.map(pl.world);
    let nx = 0, nz = 0, nh = 0;
    // Newellova normála (robustní i pro nekonvexní mnohoúhelníky)
    for (let i = 0; i < W.length; i++) { const a = W[i], b = W[(i + 1) % W.length]; nx += (a.Z - b.Z) * (a.H + b.H); nz += (a.H - b.H) * (a.X + b.X); nh += (a.X - b.X) * (a.Z + b.Z); }
    const nl = Math.hypot(nx, nz, nh) || 1; nx /= nl; nz /= nl; nh /= nl;
    const C = W.reduce((a, p) => ({ X: a.X + p.X / W.length, Z: a.Z + p.Z / W.length, H: a.H + p.H / W.length }), { X: 0, Z: 0, H: 0 });
    if (f.o) { const O = pl.world(f.o); if (nx * (C.X - O.X) + nz * (C.Z - O.Z) + nh * (C.H - O.H) < 0) { nx = -nx; nz = -nz; nh = -nh; } }
    const toCam = { X: camP.X - C.X, Z: camP.Z - C.Z, H: camP.H - C.H };
    if (nx * toCam.X + nz * toCam.Z + nh * toCam.H <= 0 && !f.noCull) continue;
    const lam = Math.max(0, (nx * light.X + nz * light.Z + nh * light.H) / Ln);
    items.push({ d: Math.hypot(toCam.X, toCam.Z, toCam.H) + (f.bias ?? 0) * pl.kS, f, shade: 0.6 + 0.42 * lam });
  }
  items.sort((a, b) => b.d - a.d);
  const lw = Math.max(0.5, 0.015 * ppm);
  for (const { f, shade } of items) {
    if (f.pts.length >= 3) {
      const pts = f.pts.map((v) => pl.proj(v));
      ctx.save();
      if (f.alpha !== undefined) ctx.globalAlpha = f.alpha;
      ctx.fillStyle = shadeColor(f.color, shade);
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
      if (f.stroke === false) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(0.6, 0.01 * ppm); ctx.lineJoin = 'round'; ctx.stroke(); }
      else { ctx.strokeStyle = 'rgba(20,20,35,0.3)'; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
      ctx.restore();
    }
    if (f.post) f.post((v) => pl.proj(v));
  }
}
