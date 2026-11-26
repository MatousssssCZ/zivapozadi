/**
 * Společná vektorová geometrie lidí i zvířat: souvislé „trubice“ podél kostí (bez kruhových kloubů),
 * hladké uzavřené obrysy, jednotné stínování (základ, jemný stín, tlumený světelný akcent).
 * Souřadnice lokální (jednotky postavy, y dolů). Bez alokací mimo malá pole bodů.
 */
export type P = { x: number; y: number };
export type Ctx = CanvasRenderingContext2D;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
export const len = (a: P) => Math.hypot(a.x, a.y);
export const norm = (a: P): P => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = (a: P): P => ({ x: -a.y, y: a.x });
export const mix2 = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// ---------------------------------------------------------------- barvy
const hexRgb = (h: string): [number, number, number] => {
  if (h.startsWith('rgb')) { const m = h.match(/\d+(\.\d+)?/g)!.map(Number); return [m[0], m[1], m[2]]; }
  const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const cache = new Map<string, string>();
/** Míchání barev (k = 0 → a, 1 → b). Výsledek se ukládá – barvy outfitu se opakují každý snímek. */
export function mixc(a: string, b: string, k: number): string {
  const key = `${a}|${b}|${k.toFixed(3)}`; const hit = cache.get(key); if (hit) return hit;
  const A = hexRgb(a), B = hexRgb(b), f = (i: number) => Math.round(A[i] + (B[i] - A[i]) * k);
  const r = `rgb(${f(0)},${f(1)},${f(2)})`; if (cache.size > 4000) cache.clear(); cache.set(key, r); return r;
}
/** Stín: studený, tlumený (ladí s modrošedými stíny malovaných pozadí). */
export const shadeOf = (c: string, k = 0.28) => mixc(c, '#232740', k);
/** Světelný akcent: teplý (lucerny, výlohy). */
export const lightOf = (c: string, k = 0.16) => mixc(c, '#fff4e2', k);

// ---------------------------------------------------------------- trubice
export interface TubeNode { p: P; w: number; /** asymetrie: kladné = rozšíření na levou stranu (normála +) */ a?: number }
/**
 * Obrys trubice: body vlevo/vpravo od osy s průměrnou tečnou (v kloubech plynulý přechod, žádný zlom).
 * Vrací [levá strana, pravá strana] od kořene ke konci.
 */
export function tubeSides(nodes: TubeNode[]): [P[], P[]] {
  const L: P[] = [], R: P[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[Math.max(0, i - 1)].p, b = nodes[Math.min(nodes.length - 1, i + 1)].p;
    const t = norm(sub(b, a)), n = perp(t), hw = nodes[i].w / 2, as = nodes[i].a ?? 0;
    L.push({ x: nodes[i].p.x + n.x * (hw + as), y: nodes[i].p.y + n.y * (hw + as) });
    R.push({ x: nodes[i].p.x - n.x * (hw - as), y: nodes[i].p.y - n.y * (hw - as) });
  }
  return [L, R];
}
/** Hladká lomená čára přes body (kvadratické Bézierovy přes středy) – pokračuje v aktuální cestě. */
export function smoothThrough(ctx: Ctx, pts: P[], moveFirst: boolean) {
  if (!pts.length) return;
  if (moveFirst) ctx.moveTo(pts[0].x, pts[0].y); else ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) { const m = mix2(pts[i], pts[i + 1], 0.5); ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y); }
  if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
/** Uzavřený hladký obrys přes body (Catmull-Rom → kubické Bézierovy). */
export function smoothClosed(ctx: Ctx, pts: P[], tension = 1) {
  const n = pts.length; if (n < 3) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n], k = tension / 6;
    ctx.bezierCurveTo(p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k, p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k, p2.x, p2.y);
  }
  ctx.closePath();
}
/** Cesta trubice se zaobleným koncem (konec = půlelipsa ve směru osy) a otevřeným kořenem. */
export function tubePath(ctx: Ctx, nodes: TubeNode[], capEnd = true, capRoot = false) {
  const [L, R] = tubeSides(nodes);
  ctx.beginPath();
  smoothThrough(ctx, L, true);
  const e = nodes[nodes.length - 1], d = norm(sub(e.p, nodes[nodes.length - 2].p));
  if (capEnd) { const k = e.w * 0.55; ctx.bezierCurveTo(L[L.length - 1].x + d.x * k, L[L.length - 1].y + d.y * k, R[R.length - 1].x + d.x * k, R[R.length - 1].y + d.y * k, R[R.length - 1].x, R[R.length - 1].y); }
  else ctx.lineTo(R[R.length - 1].x, R[R.length - 1].y);
  smoothThrough(ctx, [...R].reverse(), false);
  if (capRoot) { const r0 = nodes[0], d0 = norm(sub(nodes[1].p, r0.p)), k = r0.w * 0.55; ctx.bezierCurveTo(R[0].x - d0.x * k, R[0].y - d0.y * k, L[0].x - d0.x * k, L[0].y - d0.y * k, L[0].x, L[0].y); }
  ctx.closePath();
  return [L, R] as [P[], P[]];
}

/**
 * Jednotné stínování plochy (po vyplnění): uvnitř ořezu tahy podél jedné hrany (stín) a druhé (akcent).
 * `pathFn` vytvoří cestu plochy, `shadowEdge` a `lightEdge` jsou body podél hran.
 */
export function shadeEdges(ctx: Ctx, pathFn: () => void, shadowEdge: P[] | null, lightEdge: P[] | null, width: number, base: string, strength = 1) {
  ctx.save(); pathFn(); ctx.clip(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (shadowEdge && shadowEdge.length > 1) { ctx.strokeStyle = shadeOf(base, 0.3 * strength); ctx.globalAlpha = 0.75; ctx.lineWidth = width; ctx.beginPath(); smoothThrough(ctx, shadowEdge, true); ctx.stroke(); }
  if (lightEdge && lightEdge.length > 1) { ctx.strokeStyle = lightOf(base, 0.2 * strength); ctx.globalAlpha = 0.6; ctx.lineWidth = width * 0.45; ctx.beginPath(); smoothThrough(ctx, lightEdge, true); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.restore();
}

/** Deterministický šum (stabilní detaily – nic nepřeskakuje mezi snímky). */
export const hn = (i: number, k = 0) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
/** Úhel ohybu v kloubu (0 = rovně, π = zcela složeno). */
export const bendAt = (a: P, j: P, b: P) => { const u = norm(sub(a, j)), v = norm(sub(b, j)); return Math.PI - Math.acos(clamp(u.x * v.x + u.y * v.y, -1, 1)); };

/**
 * Válcové stínování napříč tvarem (a → b přes šířku): zadní strana do studeného stínu, světlejší střed,
 * tlumený teplý akcent u přední hrany, jemné ztmavení na protější hraně (objem bez kreslení obrysu).
 */
export function cylShade(ctx: Ctx, pathFn: () => void, a: P, b: P, base: string, k = 1) {
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  const sh = shadeOf(base, 0.42), li = lightOf(base, 0.3);
  g.addColorStop(0, withA(sh, 0.55 * k)); g.addColorStop(0.3, withA(sh, 0.12 * k)); g.addColorStop(0.55, withA(li, 0)); g.addColorStop(0.75, withA(li, 0.35 * k)); g.addColorStop(1, withA(sh, 0.2 * k));
  ctx.save(); pathFn(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
}
/** rgb(...) / #hex → rgba s alfou */
export function withA(c: string, a: number): string {
  const m = c.startsWith('rgb') ? c.match(/\d+/g)!.map(Number) : (() => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; })();
  return `rgba(${m[0]},${m[1]},${m[2]},${a.toFixed(3)})`;
}
