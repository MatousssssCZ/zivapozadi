/**
 * 3D vektorové čepice a nákrčníky: síť plošek (koule / válec) v prostoru hlavy či krku, natočená podle
 * pohledu postavy (¾ zepředu: obličej 35° k divákovi, ¾ zezadu: od diváka), promítnutá a stínovaná
 * světlem shora zleva zepředu. Kreslí se jen plošky přivrácené k divákovi, seřazené od nejvzdálenější.
 * Pletenina: žebra po povrchu (střídání odstínu po poledníkách), pruhy po rovnoběžkách, ohrnutý lem
 * jako silnější prstenec. Souřadnice: lokální 2D postavy (jednotky postavy, y dolů).
 */
import type { Vec2 } from '../math/vec';
import type { AccessorySpec, AccessoryGeo } from './accessories';

type V3 = [number, number, number];
type Ctx = CanvasRenderingContext2D;
const YAW = 0.62; // ¾ pohled
const LIGHT: V3 = (() => { const v: V3 = [-0.5, 0.72, 0.6], l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const shade = (hex: string, k: number) => { const [r, g, b] = rgb(hex), f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

/** osy pohledu: F = kam míří obličej / hrudník, S = do strany, U = nahoru (prostor obrazu, Z k divákovi) */
function axes(back: boolean): { F: V3; S: V3; U: V3 } {
  const F: V3 = [Math.sin(YAW), 0, back ? -Math.cos(YAW) : Math.cos(YAW)];
  return { F, S: [F[2], 0, -F[0]], U: [0, 1, 0] };
}
interface Facet { pts: Vec2[]; z: number; n: V3; color: string; k: number }
function drawFacets(ctx: Ctx, fs: Facet[], ox: number, oy: number, ang: number, lw: number) {
  fs.sort((a, b) => a.z - b.z);
  const c = Math.cos(ang), s = Math.sin(ang);
  for (const f of fs) {
    const lit = 0.6 + 0.5 * Math.max(0, dot(f.n, LIGHT)) - 0.12 * (1 - Math.max(0, f.n[2]));
    const col = shade(f.color, lit * f.k);
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
    ctx.beginPath();
    f.pts.forEach((p, i) => { const x = ox + p.x * c - p.y * s, y = oy + p.x * s + p.y * c; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
const proj = (p: V3): Vec2 => ({ x: p[0], y: -p[1] });

// ---------------------------------------------------------------- čepice
/** okraj čepice (polární úhel od temene): nad čelem výš, v týle níž */
const rimTheta = (phi: number) => ((85 - 13 * Math.cos(phi)) * Math.PI) / 180;
function capPoint(s: AccessorySpec, g: AccessoryGeo, th: number, phi: number, rk = 1): V3 {
  const { F, S, U } = axes(g.back), r = g.headR * 1.06 * rk;
  const dir = add(mul(U, Math.cos(th)), mul(add(mul(F, Math.cos(phi)), mul(S, Math.sin(phi))), Math.sin(th)));
  // splihlá pletenina: vršek je vyšší a mírně sklouzlý dozadu
  const top = Math.max(0, Math.cos(th)) ** 2;
  return add(mul(dir, r), add(mul(U, r * s.slouch * 0.35 * top), mul(F, -r * s.slouch * 0.5 * top)));
}
export function drawHat3D(ctx: Ctx, s: AccessorySpec, g: AccessoryGeo, far: number) {
  if (s.hat === 'none') return;
  const ang = Math.atan2(g.headUp.y, g.headUp.x) + Math.PI / 2, NP = 28, NR = 9, cuff = s.hat !== 'earflap';
  const facets: Facet[] = [], dPhi = (2 * Math.PI) / NP;
  const quad = (a: V3, b: V3, c: V3, d: V3, color: string, k: number) => {
    const ctr = mul(add(add(a, b), add(c, d)), 0.25), n = norm(ctr);
    if (n[2] < -0.04) return; // odvrácená ploška (za hlavou)
    facets.push({ pts: [a, b, c, d].map(proj), z: ctr[2], n, color, k: k * far });
  };
  for (let j = 0; j < NP; j++) {
    const p0 = j * dPhi, p1 = p0 + dPhi, rib = j % 2 ? 0.93 : 1;
    const th0 = (p: number) => rimTheta(p) - (cuff ? 0.34 : 0);
    for (let i = 0; i < NR; i++) {
      const u0 = i / NR, u1 = (i + 1) / NR, ta0 = u0 * th0(p0), ta1 = u1 * th0(p0), tb0 = u0 * th0(p1), tb1 = u1 * th0(p1);
      const stripe = s.hatStripes && (i === NR - 3 || i === NR - 5);
      quad(capPoint(s, g, ta0, p0), capPoint(s, g, tb0, p1), capPoint(s, g, tb1, p1), capPoint(s, g, ta1, p0), stripe ? s.hatColor2 : s.hatColor, rib * (0.97 + 0.03 * u1));
    }
    if (cuff) {
      // ohrnutý lem: silnější prstenec přes spodek, hustší žebra
      const c0 = (p: number) => rimTheta(p) - 0.36, c1 = (p: number) => rimTheta(p) + 0.04;
      for (let h2 = 0; h2 < 2; h2++) {
        const pa = p0 + (h2 * dPhi) / 2, pb = pa + dPhi / 2, rk = 1.075;
        quad(capPoint(s, g, c0(pa), pa, rk), capPoint(s, g, c0(pb), pb, rk), capPoint(s, g, c1(pb), pb, rk * 0.99), capPoint(s, g, c1(pa), pa, rk * 0.99), s.hatStripes ? s.hatColor2 : s.hatColor, h2 ? 0.86 : 1);
      }
    }
  }
  if (s.hat === 'earflap') {
    // ušanky: klopy přes uši (pod okrajem po stranách), zaoblený konec
    for (const sc of [-1, 1]) {
      const pc = (sc * Math.PI) / 2;
      for (let j = 0; j < 4; j++) {
        const pa = pc - 0.42 + (j * 0.84) / 4, pb = pa + 0.21, ext = (p: number) => 0.62 * Math.cos(((p - pc) / 0.42) * (Math.PI / 2)) ** 0.6;
        quad(capPoint(s, g, rimTheta(pa) - 0.05, pa, 1.02), capPoint(s, g, rimTheta(pb) - 0.05, pb, 1.02), capPoint(s, g, rimTheta(pb) + ext(pb), pb, 0.98), capPoint(s, g, rimTheta(pa) + ext(pa), pa, 0.98), s.hatColor, 0.9);
      }
    }
  }
  drawFacets(ctx, facets, g.headC.x, g.headC.y, ang, g.headR * 0.03);
  if (s.hat === 'earflap') {
    // šňůrky ušanek
    const c = Math.cos(ang), sn = Math.sin(ang);
    ctx.strokeStyle = shade(s.hatColor2, 0.9 * far); ctx.lineWidth = g.headR * 0.07; ctx.lineCap = 'round';
    for (const sc of [-1, 1]) {
      const e = capPoint(s, g, rimTheta(sc * Math.PI / 2) + 0.62, (sc * Math.PI) / 2, 0.98); if (e[2] < -0.1 * g.headR) continue;
      const p = proj(e), x = g.headC.x + p.x * c - p.y * sn, y = g.headC.y + p.x * sn + p.y * c;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sn * 0, y + g.headR * 0.45); ctx.stroke();
    }
  }
}
/** temeno čepice (lokálně) – kotva bambule */
export function hatTop3D(s: AccessorySpec, g: AccessoryGeo): Vec2 {
  const ang = Math.atan2(g.headUp.y, g.headUp.x) + Math.PI / 2, p = proj(capPoint(s, g, 0, 0)), c = Math.cos(ang), sn = Math.sin(ang);
  return { x: g.headC.x + p.x * c - p.y * sn, y: g.headC.y + p.x * sn + p.y * c };
}

// ---------------------------------------------------------------- nákrčník / omotaná šála
/**
 * Pletená trubice kolem krku: `tube` = nákrčník (vyšší, nahoře ohrnutý límec, svislá žebra),
 * `wrap`/`long` = šála omotaná dvakrát (dvě zaoblené otočky, šikmé pruhy). Přední polovina přes krk
 * a bradu, zadní je schovaná za krkem.
 */
export function drawNeck3D(ctx: Ctx, s: AccessorySpec, g: AccessoryGeo, far: number) {
  if (s.scarf === 'none') return;
  const { F, S, U } = axes(g.back), w = g.neckW, tube = s.scarf === 'tube';
  const R0 = w * (tube ? 0.58 : 0.62), y0 = -w * (tube ? 0.26 : 0.12), y1 = w * (tube ? 0.4 : 0.34), NP = 28, NR = tube ? 7 : 6;
  const ang = Math.atan2(g.torsoUp.y, g.torsoUp.x) + Math.PI / 2;
  const radius = (u: number) => tube
    ? R0 * (1 + 0.05 * u + (u > 0.68 ? 0.07 : 0)) // nahoře ohrnutý límec
    : R0 * (1 + 0.1 * Math.sin(Math.PI * ((u * 2) % 1)) - 0.04 * u); // dvě otočky
  const P = (u: number, phi: number): V3 => { const r = radius(u), hh = y0 + (y1 - y0) * u; return add(mul(U, hh), mul(add(mul(F, Math.cos(phi)), mul(S, Math.sin(phi))), r)); };
  const facets: Facet[] = [], dPhi = (2 * Math.PI) / NP;
  for (let j = 0; j < NP; j++) {
    const p0 = j * dPhi, p1 = p0 + dPhi;
    for (let i = 0; i < NR; i++) {
      const u0 = i / NR, u1 = (i + 1) / NR, a = P(u0, p0), b = P(u0, p1), c = P(u1, p1), d = P(u1, p0);
      const mid = (p0 + p1) / 2, n = norm([Math.cos(mid) * F[0] + Math.sin(mid) * S[0], 0, Math.cos(mid) * F[2] + Math.sin(mid) * S[2]]);
      if (n[2] < -0.02) continue;
      const ctr = mul(add(add(a, b), add(c, d)), 0.25);
      let color = s.scarfColor, k = 1;
      if (tube) { k = j % 2 ? 0.9 : 1; if (u0 >= 0.7) k *= 1.06; if (s.scarfStripes && (i === 2 || i === 4)) color = s.scarfColor2; }
      else { const roll = (u0 * 2) % 1; k = 0.86 + 0.18 * Math.sin(Math.PI * roll); if (s.scarfStripes && ((j + i * 2) % 7 === 0)) color = s.scarfColor2; }
      facets.push({ pts: [a, b, c, d].map(proj), z: ctr[2], n: [n[0], tube ? 0.1 : 0.15 * Math.cos(Math.PI * ((u0 * 2) % 1)), n[2]], color, k: k * far });
    }
  }
  drawFacets(ctx, facets, g.neck.x, g.neck.y, ang, w * 0.02);
  // horní hrana límce (pletený okraj): tmavší linka po přední polovině
  const c = Math.cos(ang), sn = Math.sin(ang);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = w * 0.03; ctx.beginPath(); let first = true;
  for (let j = 0; j <= 40; j++) { const phi = (j / 40) * 2 * Math.PI, q = P(1, phi), n = Math.cos(phi) * F[2] + Math.sin(phi) * S[2]; if (n < 0) { first = true; continue; } const p = proj(q), x = g.neck.x + p.x * c - p.y * sn, y = g.neck.y + p.x * sn + p.y * c; if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
  ctx.stroke();
}
