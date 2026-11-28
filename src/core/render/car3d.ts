/**
 * Osobní auta (Zasněžená ulice): nízkopolygonový 3D model z bočního profilu (sedan / hatchback / kombi)
 * – bok s vybráním podběhů nad koly, kapota, čelní a zadní sklo, střecha, kufr, nárazníky, světla,
 * blinkry; kola se otáčí podle ujeté dráhy. Sníh je po buňkách (střecha, kapota, kufr, skla, boky
 * dole), takže ometání ubírá jen tam, kde se smeták dotkl; tloušťka buňky = množství (0–1).
 * Model x vpřed, z doleva (od řidiče), h nahoru (m), počátek uprostřed na zemi.
 */
import type { Camera, World } from '../scene/camera';
import type { Vec2 } from '../math/vec';
import { place, wheel, drawFaces, type Face, type V3 } from './lowpoly3d';

type Ctx = CanvasRenderingContext2D;
export type CarBody = 'sedan' | 'hatch' | 'wagon';
export interface CarLook { body: CarBody; color: string }
/** sníh po buňkách (0 = čisto, 1 = plná vrstva) */
export interface CarSnow { roof: number[]; hood: number[]; trunk: number[]; ws: number[]; rw: number[]; winL: number[]; winR: number[]; lowL: number[]; lowR: number[] }
export const SNOW_CELLS: Record<keyof CarSnow, number> = { roof: 4, hood: 3, trunk: 2, ws: 3, rw: 2, winL: 4, winR: 4, lowL: 6, lowR: 6 };
export const newCarSnow = (k: number, low = 0): CarSnow => Object.fromEntries(Object.entries(SNOW_CELLS).map(([s, n]) => [s, new Array(n).fill(s.startsWith('low') ? low : s.startsWith('win') ? k * 0.75 : k)])) as unknown as CarSnow;

type P2 = [number, number];
/** profil (x, h): nos, přední hrana kapoty, pata čelního skla, vršek skla, konec střechy, pata zadního skla, konec kufru, záď */
export interface CarGeo { L: number; nose: P2; hoodF: P2; wsBase: P2; wsTop: P2; roofBack: P2; rwBase: P2; trunkEnd: P2; tail: P2; xf: number; xr: number; r: number; zB: number; zG: number; doors: 2 | 4 }
export function carGeo(body: CarBody): CarGeo {
  if (body === 'hatch') return { L: 3.8, nose: [1.9, 0.62], hoodF: [1.78, 0.78], wsBase: [0.75, 0.88], wsTop: [0.15, 1.42], roofBack: [-1.55, 1.4], rwBase: [-1.84, 0.95], trunkEnd: [-1.88, 0.92], tail: [-1.9, 0.62], xf: 1.15, xr: -1.15, r: 0.3, zB: 0.84, zG: 0.7, doors: 2 };
  if (body === 'wagon') return { L: 4.6, nose: [2.3, 0.62], hoodF: [2.18, 0.78], wsBase: [0.95, 0.86], wsTop: [0.35, 1.4], roofBack: [-2.05, 1.4], rwBase: [-2.25, 0.95], trunkEnd: [-2.28, 0.92], tail: [-2.3, 0.62], xf: 1.5, xr: -1.5, r: 0.31, zB: 0.87, zG: 0.72, doors: 4 };
  return { L: 4.3, nose: [2.15, 0.62], hoodF: [2.02, 0.78], wsBase: [0.85, 0.86], wsTop: [0.25, 1.4], roofBack: [-0.9, 1.42], rwBase: [-1.45, 0.9], trunkEnd: [-2.08, 0.86], tail: [-2.15, 0.62], xf: 1.38, xr: -1.38, r: 0.31, zB: 0.86, zG: 0.71, doors: 4 };
}

export interface CarDraw {
  dist: number; t: number; snow?: CarSnow;
  /** otevření dveří řidiče (0–1; řidič vlevo = z > 0) */ door?: number;
  /** blinkr: −1 vpravo, 1 vlevo, 0 vypnuto */ blink?: number; brake?: boolean; lights?: boolean;
  /** kreslení postavy uvnitř (mezi vzdálenými a bližšími plochami) */ inside?: () => void;
}
const SNOW = '#f1ecf2', GLASS = '#41506a', DARKG = '#1c1c22', CHROME = '#b9bcc4', TIRE = '#202024';

/** bod na lomené čáře profilu (a → b) v podílu f */
const lerp2 = (a: P2, b: P2, f: number): P2 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

export function carFaces(g: CarGeo, look: CarLook, d: CarDraw): Face[] {
  const F: Face[] = [], col = look.color, o: V3 = [0, 0, 0.7];
  const { zB, zG } = g;
  const rot = -d.dist / g.r;
  // podběhy (tmavé vložky za koly) a kola
  for (const xw of [g.xf, g.xr]) for (const s of [1, -1]) {
    const arc: V3[] = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; arc.push([xw + Math.cos(a) * 0.42, s * (zB - 0.3), g.r + Math.sin(a) * 0.42]); }
    F.push({ pts: [...arc, [xw - 0.42, s * (zB - 0.3), 0.05], [xw + 0.42, s * (zB - 0.3), 0.05]], color: DARKG, noCull: true, bias: 0.2, stroke: false });
    F.push(...wheel(xw, s * (zB - 0.12), g.r, 0.22, rot, TIRE, '#2b2a2e'));
  }
  // bok s vybráním podběhů (z = ±zB)
  const side = (s: number): V3[] => {
    const z = s * zB, pts: V3[] = [];
    pts.push([g.nose[0], z, g.nose[1]], [g.nose[0] - 0.04, z, 0.3]);
    for (const xw of [g.xf, g.xr]) for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push([xw + Math.cos(a) * 0.44, z, Math.max(0.26, g.r + Math.sin(a) * 0.44)]); }
    pts.push([g.tail[0] + 0.04, z, 0.3], [g.tail[0], z, g.tail[1]], [g.trunkEnd[0], z, g.trunkEnd[1]], [g.rwBase[0], z, g.rwBase[1]], [g.wsBase[0], z, g.wsBase[1]], [g.hoodF[0], z, g.hoodF[1]]);
    return pts;
  };
  for (const s of [1, -1]) {
    F.push({ pts: side(s), color: col, o, post: (P) => doorLines(P, g, s, d) });
    // prosklená kabina (užší) se sloupky
    F.push({ pts: [[g.wsBase[0], s * zG, g.wsBase[1]], [g.wsTop[0], s * zG, g.wsTop[1]], [g.roofBack[0], s * zG, g.roofBack[1]], [g.rwBase[0], s * zG, g.rwBase[1]]], color: GLASS, o, post: (P) => windowFrame(P, g, s, col) });
    // rameno mezi bokem a kabinou (podél linie oken)
    F.push({ pts: [[g.rwBase[0], s * zB, g.rwBase[1]], [g.wsBase[0], s * zB, g.wsBase[1]], [g.wsBase[0], s * zG, g.wsBase[1] + 0.02], [g.rwBase[0], s * zG, g.rwBase[1] + 0.02]], color: col, o, stroke: false });
  }
  const q = (a: P2, b: P2, z0: number, z1: number, color: string, extra: Partial<Face> = {}): Face => ({ pts: [[a[0], -z0, a[1]], [b[0], -z1, b[1]], [b[0], z1, b[1]], [a[0], z0, a[1]]], color, o, ...extra });
  F.push(q(g.hoodF, g.wsBase, zB, zB, col)); // kapota
  F.push(q(g.wsBase, g.wsTop, zG, zG, GLASS, { post: (P) => glassShine(P, g.wsBase, g.wsTop, zG) })); // čelní sklo
  F.push(q(g.wsTop, g.roofBack, zG * 0.97, zG * 0.97, col)); // střecha
  F.push(q(g.roofBack, g.rwBase, zG, zG, GLASS)); // zadní sklo
  F.push(q(g.rwBase, g.trunkEnd, zB, zB, col)); // kufr
  F.push(q(g.trunkEnd, g.tail, zB, zB, col)); // záď (svah)
  F.push(q(g.nose, g.hoodF, zB, zB, col)); // čelo nad nárazníkem
  // přední a zadní stěna s maskou, světly a nárazníky
  F.push({ pts: [[g.nose[0], -zB, 0.3], [g.nose[0], zB, 0.3], [g.nose[0], zB, g.nose[1]], [g.nose[0], -zB, g.nose[1]]], color: col, o, post: (P) => frontDetail(P, g, d) });
  F.push({ pts: [[g.tail[0], -zB, 0.3], [g.tail[0], -zB, g.tail[1]], [g.tail[0], zB, g.tail[1]], [g.tail[0], zB, 0.3]], color: col, o, post: (P) => rearDetail(P, g, d) });
  // nárazníky (chromované lišty)
  F.push({ pts: [[g.nose[0] + 0.04, -zB, 0.3], [g.nose[0] + 0.04, zB, 0.3], [g.nose[0] + 0.04, zB, 0.4], [g.nose[0] + 0.04, -zB, 0.4]], color: CHROME, o });
  F.push({ pts: [[g.tail[0] - 0.04, -zB, 0.3], [g.tail[0] - 0.04, -zB, 0.4], [g.tail[0] - 0.04, zB, 0.4], [g.tail[0] - 0.04, zB, 0.3]], color: CHROME, o });
  if (d.snow) F.push(...snowFaces(g, d.snow));
  if (d.inside) F.push({ pts: [[(g.wsBase[0] + g.roofBack[0]) / 2, 0.25, 0.9], [(g.wsBase[0] + g.roofBack[0]) / 2, 0.25, 0.9], [(g.wsBase[0] + g.roofBack[0]) / 2, 0.25, 0.9]], color: DARKG, noCull: true, post: () => d.inside!() });
  return F;
}

let CTX: Ctx | null = null, PPM = 50;
function line(P: (v: V3) => Vec2, a: V3, b: V3, color: string, w: number) { const ctx = CTX!; const p = P(a), q = P(b); ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.6, w * PPM); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
function doorLines(P: (v: V3) => Vec2, g: CarGeo, s: number, d: CarDraw) {
  const z = s * g.zB * 1.002, c = 'rgba(25,20,30,0.45)', top = (x: number) => g.rwBase[1] + ((g.wsBase[1] - g.rwBase[1]) * (x - g.rwBase[0])) / (g.wsBase[0] - g.rwBase[0]);
  const x1 = g.wsBase[0] - 0.05, xb = g.doors === 4 ? (g.wsTop[0] + g.roofBack[0]) / 2 + 0.05 : g.roofBack[0] + 0.25, x3 = g.doors === 4 ? g.rwBase[0] + 0.12 : xb;
  for (const x of [x1, xb, x3]) line(P, [x, z, 0.32], [x, z, top(x)], c, 0.012);
  for (const x of [xb + 0.12, ...(g.doors === 4 ? [x3 + 0.12] : [])]) line(P, [x, z, top(x) - 0.12], [x + 0.14, z, top(x) - 0.12], 'rgba(220,220,230,0.7)', 0.018);
  line(P, [g.tail[0] + 0.1, z, 0.48], [g.nose[0] - 0.1, z, 0.48], 'rgba(255,255,255,0.12)', 0.01);
  void d;
}
function windowFrame(P: (v: V3) => Vec2, g: CarGeo, s: number, col: string) {
  const z = s * g.zG * 1.003, xb = (g.wsTop[0] + g.roofBack[0]) / 2;
  const hTop = g.roofBack[1] - 0.02, bt = (x: number) => g.rwBase[1] + ((g.wsBase[1] - g.rwBase[1]) * (x - g.rwBase[0])) / (g.wsBase[0] - g.rwBase[0]);
  line(P, [xb, z, bt(xb)], [xb, z, hTop], col, 0.05); // B-sloupek
  const ctx = CTX!; ctx.save(); ctx.globalAlpha = 0.18; line(P, [xb - 0.5, z, bt(xb - 0.5) + 0.1], [xb - 0.2, z, hTop - 0.05], '#e8f0ff', 0.05); ctx.restore();
}
function glassShine(P: (v: V3) => Vec2, a: P2, b: P2, zG: number) {
  const ctx = CTX!, p0 = P([lerp2(a, b, 0.2)[0], -zG * 0.6, lerp2(a, b, 0.2)[1]]), p1 = P([lerp2(a, b, 0.75)[0], -zG * 0.1, lerp2(a, b, 0.75)[1]]);
  ctx.save(); ctx.strokeStyle = 'rgba(220,230,255,0.16)'; ctx.lineWidth = Math.max(1, 0.12 * PPM); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.restore();
}
function lamp(P: (v: V3) => Vec2, at: V3, color: string, r: number, glow: number) {
  const ctx = CTX!, p = P(at);
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(1, r * PPM), Math.max(0.8, r * 0.7 * PPM), 0, 0, Math.PI * 2); ctx.fill();
  if (glow > 0) { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6 * PPM); g.addColorStop(0, color.replace(/[\d.]+\)$/, `${(0.5 * glow).toFixed(2)})`)); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)')); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 6 * PPM, 0, Math.PI * 2); ctx.fill(); }
}
function frontDetail(P: (v: V3) => Vec2, g: CarGeo, d: CarDraw) {
  const x = g.nose[0] + 0.005;
  line(P, [x, -0.32, 0.47], [x, 0.32, 0.47], 'rgba(30,30,35,0.8)', 0.05); // maska
  for (const z of [-g.zB + 0.18, g.zB - 0.18]) lamp(P, [x, z, 0.5], d.lights ? 'rgba(255,240,200,1)' : 'rgba(230,225,210,1)', 0.07, d.lights ? 1 : 0);
  blinkers(P, g, d, x, 1);
}
function rearDetail(P: (v: V3) => Vec2, g: CarGeo, d: CarDraw) {
  const x = g.tail[0] - 0.005;
  for (const z of [-g.zB + 0.16, g.zB - 0.16]) lamp(P, [x, z, 0.52], 'rgba(200,30,30,1)', 0.065, d.brake ? 1 : d.lights ? 0.35 : 0);
  blinkers(P, g, d, x, -1);
}
function blinkers(P: (v: V3) => Vec2, g: CarGeo, d: CarDraw, x: number, end: number) {
  if (!d.blink) return;
  const on = Math.floor(d.t * 2.6) % 2 === 0; if (!on) return;
  lamp(P, [x, d.blink * (g.zB - 0.06), end > 0 ? 0.4 : 0.42], 'rgba(255,165,40,1)', 0.05, 1);
}

/** sníh: desky po buňkách na střeše, kapotě a kufru; námraza na sklech; břečka na spodních bocích */
function snowFaces(g: CarGeo, sn: CarSnow): Face[] {
  const F: Face[] = [], o: V3 = [0, 0, 0.6];
  const slab = (a: P2, b: P2, z: number, t: number, f0: number, f1: number) => {
    if (t < 0.02) return;
    const A = lerp2(a, b, f0), B = lerp2(a, b, f1), h = 0.16 * t, zz = z - 0.05;
    const top: V3[] = [[A[0], -zz, A[1] + h], [B[0], -zz, B[1] + h], [B[0], zz, B[1] + h * 0.95], [A[0], zz, A[1] + h * 0.95]];
    F.push({ pts: top, color: SNOW, o, stroke: false });
    F.push({ pts: [[A[0], -z + 0.03, A[1]], [B[0], -z + 0.03, B[1]], [B[0], -zz, B[1] + h], [A[0], -zz, A[1] + h]], color: '#dcd6e2', o, stroke: false }); // bližší hrana (k řidiči vpravo)
    F.push({ pts: [[A[0], z - 0.03, A[1]], [A[0], zz, A[1] + h * 0.95], [B[0], zz, B[1] + h * 0.95], [B[0], z - 0.03, B[1]]], color: '#dcd6e2', o, stroke: false });
  };
  const cells = (arr: number[], a: P2, b: P2, z: number) => arr.forEach((t, i) => slab(a, b, z, t, i / arr.length, (i + 1) / arr.length));
  cells(sn.roof, g.wsTop, g.roofBack, g.zG * 0.97);
  cells(sn.hood, g.wsBase, g.hoodF, g.zB);
  cells(sn.trunk, g.rwBase, g.trunkEnd, g.zB);
  // skla: námraza / sníh (průsvitně → neprůhledně)
  const glass = (arr: number[], a: P2, b: P2, z0: number, z1: number) => arr.forEach((t, i) => {
    if (t < 0.03) return; const A = lerp2(a, b, i / arr.length), B = lerp2(a, b, (i + 1) / arr.length);
    F.push({ pts: [[A[0], -z0, A[1] + 0.01], [B[0], -z1, B[1] + 0.01], [B[0], z1, B[1] + 0.01], [A[0], z0, A[1] + 0.01]], color: SNOW, alpha: Math.min(0.95, 0.25 + 0.75 * t), o, stroke: false });
  });
  glass(sn.ws, g.wsBase, g.wsTop, g.zG, g.zG); glass(sn.rw, g.roofBack, g.rwBase, g.zG, g.zG);
  const sideWin = (arr: number[], s: number) => arr.forEach((t, i) => {
    if (t < 0.03) return; const z = s * g.zG * 1.01, x0 = g.rwBase[0] + ((g.wsBase[0] - g.rwBase[0]) * i) / arr.length, x1 = g.rwBase[0] + ((g.wsBase[0] - g.rwBase[0]) * (i + 1)) / arr.length;
    const bt = (x: number) => g.rwBase[1] + ((g.wsBase[1] - g.rwBase[1]) * (x - g.rwBase[0])) / (g.wsBase[0] - g.rwBase[0]), tp = (x: number) => Math.min(g.roofBack[1], Math.max(bt(x), x > g.wsTop[0] ? g.wsTop[1] - ((x - g.wsTop[0]) / (g.wsBase[0] - g.wsTop[0])) * (g.wsTop[1] - g.wsBase[1]) : x < g.roofBack[0] ? g.roofBack[1] - ((g.roofBack[0] - x) / (g.roofBack[0] - g.rwBase[0])) * (g.roofBack[1] - g.rwBase[1]) : g.roofBack[1]));
    const hh = (x: number) => bt(x) + (tp(x) - bt(x)) * Math.min(1, 0.35 + 0.65 * t); // sníh od spodu okna nahoru
    F.push({ pts: [[x0, z, bt(x0)], [x1, z, bt(x1)], [x1, z, hh(x1)], [x0, z, hh(x0)]], color: SNOW, alpha: Math.min(0.95, 0.3 + 0.7 * t), o, stroke: false });
  });
  sideWin(sn.winL, 1); sideWin(sn.winR, -1);
  // břečka na spodních bocích (odstřik od shrnováku)
  const low = (arr: number[], s: number) => arr.forEach((t, i) => {
    if (t < 0.03) return; const z = s * g.zB * 1.01, x0 = g.tail[0] + (g.L * i) / arr.length, x1 = g.tail[0] + (g.L * (i + 1)) / arr.length, h = 0.3 + 0.28 * t;
    F.push({ pts: [[x0, z, 0.27], [x1, z, 0.27], [x1, z, h * (0.9 + 0.1 * Math.sin(i * 2.1))], [x0, z, h]], color: '#cfc9d3', alpha: Math.min(0.9, 0.35 + 0.6 * t), o, stroke: false });
  });
  low(sn.lowL, 1); low(sn.lowR, -1);
  return F;
}

/** Nakreslí auto. P = střed na zemi (svět), hd = směr (rad, svět), kS = měřítko modelu (postavy). */
export function drawCar(ctx: Ctx, cam: Camera, P: World, hd: number, kS: number, ppm: number, look: CarLook, d: CarDraw) {
  CTX = ctx; PPM = ppm;
  const g = carGeo(look.body), pl = place(cam, P, hd, kS);
  // měkký stín pod autem
  const sh = [[-g.L / 2 - 0.1, -g.zB - 0.15], [g.L / 2 + 0.1, -g.zB - 0.15], [g.L / 2 + 0.1, g.zB + 0.1], [-g.L / 2 - 0.1, g.zB + 0.1]].map(([x, z]) => pl.proj([x, z, 0]));
  ctx.save(); ctx.fillStyle = 'rgba(20,25,50,0.35)'; ctx.filter = `blur(${Math.max(1, 0.12 * ppm).toFixed(1)}px)`;
  ctx.beginPath(); sh.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.restore();
  drawFaces(ctx, cam, pl, carFaces(g, look, d), ppm, { X: 0.2, Z: 0.6, H: 0.9 });
  // světla rozsvícená za jízdy: kužel na vozovku před autem
  if (d.lights) {
    const a = pl.proj([g.nose[0] + 0.3, 0, 0]), b = pl.proj([g.nose[0] + 4, 0, 0]);
    const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y); gr.addColorStop(0, 'rgba(255,235,190,0.22)'); gr.addColorStop(1, 'rgba(255,235,190,0)');
    const c1 = pl.proj([g.nose[0] + 0.2, -g.zB, 0]), c2 = pl.proj([g.nose[0] + 4, -g.zB - 0.8, 0]), c3 = pl.proj([g.nose[0] + 4, g.zB + 0.8, 0]), c4 = pl.proj([g.nose[0] + 0.2, g.zB, 0]);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y); ctx.closePath(); ctx.fill();
  }
}
export const CAR_COLORS = ['#8c2f2f', '#2f4f6f', '#3e5a46', '#c9b48a', '#5a5a62', '#6b4a3a', '#7a6a9a', '#b0a89a'];
