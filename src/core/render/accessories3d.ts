/**
 * 3D vektorové čepice a nákrčníky: síť plošek (koule / válec) v prostoru hlavy či krku, natočená podle
 * pohledu postavy (¾ zepředu: obličej 35° k divákovi, ¾ zezadu: od diváka), promítnutá a stínovaná
 * světlem shora zleva zepředu. Kreslí se jen plošky přivrácené k divákovi, seřazené od nejvzdálenější.
 * Pletenina: žebra po povrchu (střídání odstínu po poledníkách), pruhy po rovnoběžkách, ohrnutý lem
 * jako silnější prstenec. Souřadnice: lokální 2D postavy (jednotky postavy, y dolů).
 */
import type { Vec2 } from '../math/vec';
import type { AccessorySpec, AccessoryGeo } from './accessories';
import { getCanvasFactory } from './rigRenderer';

type V3 = [number, number, number];
type Ctx = CanvasRenderingContext2D;
const YAW = 0.62; // ¾ pohled
const PITCH = 0.13; // kamera mírně shora (krk/límec)
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

/**
 * Plošky čepice / nákrčníku se nemění (tvar závisí jen na doplňku, velikosti hlavy a pohledu) – vykreslí
 * se jednou do bitmapy v rozlišení ≥ aktuálního (měřítko zaokrouhlené nahoru po čtvrtinách oktávy) a pak
 * se jen kreslí s natočením. Ušetří stovky plošek na postavu a snímek; kvalita stejná.
 */
const facetCache = new Map<string, { img: CanvasImageSource; x0: number; y0: number; w: number; h: number; k: number }>();
function cachedFacets(ctx: Ctx, key: string, build: () => Facet[], ox: number, oy: number, ang: number, lw: number) {
  const f = getCanvasFactory(), T = ctx.getTransform(), sc = Math.hypot(T.a, T.b);
  if (!f || !(sc > 0)) { drawFacets(ctx, build(), ox, oy, ang, lw); return; }
  const k = Math.pow(2, Math.ceil(Math.log2(sc) * 4) / 4), ck = `${key}|${k.toFixed(4)}`;
  let e = facetCache.get(ck);
  if (!e) {
    const fs = build(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of fs) for (const p of q.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (!fs.length) return;
    const pad = 2 / k + lw; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const W = Math.max(1, Math.ceil((x1 - x0) * k)), H = Math.max(1, Math.ceil((y1 - y0) * k));
    const c = f(W, H), cx = c.getContext('2d') as unknown as Ctx;
    cx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    drawFacets(cx, fs, 0, 0, 0, lw);
    if (facetCache.size > 800) facetCache.clear();
    e = { img: c as unknown as CanvasImageSource, x0, y0, w: W / k, h: H / k, k };
    facetCache.set(ck, e);
  }
  ctx.save(); ctx.translate(ox, oy); ctx.rotate(ang); ctx.drawImage(e.img, e.x0, e.y0, e.w, e.h); ctx.restore();
}

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
  const dPhi = (2 * Math.PI) / NP;
  const build = (): Facet[] => {
  const facets: Facet[] = [];
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
        const pa = p0 + (h2 * dPhi) / 2, pb = pa + dPhi / 2, rk = 1.045;
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
  return facets;
  };
  cachedFacets(ctx, `h|${s.hat}|${s.hatColor}|${s.hatColor2}|${s.hatStripes}|${s.slouch.toFixed(3)}|${g.headR.toFixed(2)}|${g.back}|${far.toFixed(3)}`, build, g.headC.x, g.headC.y, ang, g.headR * 0.03);
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
  // nákrčník sedí pod bradou (nesahá přes obličej), šála je nižší omotaná role
  const R0 = w * (tube ? 0.52 : 0.58), y0 = -w * (tube ? 0.3 : 0.16), y1 = w * (tube ? 0.22 : 0.2), NP = 32, NR = tube ? 7 : 6;
  const ang = Math.atan2(g.torsoUp.y, g.torsoUp.x) + Math.PI / 2;
  const radius = (u: number) => tube
    ? R0 * (1 + 0.04 * u + (u > 0.72 ? 0.06 : 0) + 0.14 * (1 - u) ** 2) // dole rozšířený přes límec bundy, nahoře ohrnutý
    : R0 * (1 + 0.1 * Math.sin(Math.PI * ((u * 2) % 1)) - 0.04 * u); // dvě otočky
  const P = (u: number, phi: number): V3 => { const r = radius(u), hh = y0 + (y1 - y0) * u; return add(mul(U, hh), mul(add(mul(F, Math.cos(phi)), mul(S, Math.sin(phi))), r)); };
  // mírný pohled shora: kruhy krku se promítnou jako elipsy (horní okraj je oblouk, ne rovná hrana)
  const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  const projP = (p: V3): Vec2 => ({ x: p[0], y: -(p[1] * cp) + p[2] * sp });
  const facing = (n: V3) => n[2] * cp + n[1] * sp;
  const top = (phi: number, rk: number) => { const r = radius(1) * rk; return add(mul(U, y1), mul(add(mul(F, Math.cos(phi)), mul(S, Math.sin(phi))), r)); };
  const dPhi = (2 * Math.PI) / NP;
  const build = (): Facet[] => {
  const facets: Facet[] = [];
  for (let j = 0; j < NP; j++) {
    const p0 = j * dPhi, p1 = p0 + dPhi;
    for (let i = 0; i < NR; i++) {
      const u0 = i / NR, u1 = (i + 1) / NR, a = P(u0, p0), b = P(u0, p1), c = P(u1, p1), d = P(u1, p0);
      const mid = (p0 + p1) / 2, n = norm([Math.cos(mid) * F[0] + Math.sin(mid) * S[0], 0, Math.cos(mid) * F[2] + Math.sin(mid) * S[2]]);
      if (n[2] < -0.02) continue; // zadní (vnitřní) polovina se nekreslí – otvorem je vidět krk
      const ctr = mul(add(add(a, b), add(c, d)), 0.25);
      let color = s.scarfColor, k = 1;
      if (tube) { k = j % 2 ? 0.9 : 1; if (u0 >= 0.72) k *= 1.06; if (s.scarfStripes && (i === 2 || i === 4)) color = s.scarfColor2; }
      else { const roll = (u0 * 2) % 1; k = 0.86 + 0.18 * Math.sin(Math.PI * roll); if (s.scarfStripes && ((j + i * 2) % 7 === 0)) color = s.scarfColor2; }
      facets.push({ pts: [a, b, c, d].map(projP), z: ctr[2] * cp + ctr[1] * sp, n: [n[0], tube ? 0.1 : 0.15 * Math.cos(Math.PI * ((u0 * 2) % 1)), n[2]], color, k: k * far });
    }
  }
  // horní plocha ohrnutého lemu (vidět shora) – jen přední polovina prstence, zadní zakryje krk a hlava
  for (let j = 0; j < NP; j++) {
    const p0 = j * dPhi, p1 = p0 + dPhi, mid = (p0 + p1) / 2, nz = Math.cos(mid) * F[2] + Math.sin(mid) * S[2];
    const a = top(p0, 1), b = top(p1, 1), c = top(p1, 0.8), d = top(p0, 0.8);
    // celý horní lem (i zadní půlka za krkem je shora vidět jako vnější plocha role)
    facets.push({ pts: [a, b, c, d].map(projP), z: nz < 0 ? -1e3 + nz : 1e3, n: [0, 1, 0.3], color: s.scarfColor, k: (tube ? 1.02 : 0.95) * (nz < 0 ? 0.88 : 1) * far });
  }
  return facets;
  };
  void facing;
  // otvor límce: místo vnitřku je vidět krk ve stínu brady (žádná vnitřní stěna)
  const hole = () => { ctx.beginPath(); for (let j = 0; j <= NP; j++) { const q = projP(top(j * dPhi, 0.82)), x = g.neck.x + q.x * Math.cos(ang) - q.y * Math.sin(ang), y = g.neck.y + q.x * Math.sin(ang) + q.y * Math.cos(ang); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
  ctx.save();
  if (!g.back) {
    // pohled zepředu: brada a čelist jsou před límcem → část nákrčníku za obličejem se nekreslí
    const ha = Math.atan2(g.headUp.y, g.headUp.x) + Math.PI / 2, cx = g.headC.x - g.headUp.x * g.headR * 0.12, cy = g.headC.y - g.headUp.y * g.headR * 0.12;
    ctx.beginPath(); ctx.rect(cx - g.headR * 40, cy - g.headR * 40, g.headR * 80, g.headR * 80);
    ctx.ellipse(cx, cy, g.headR * 0.92, g.headR * 1.22, ha, 0, Math.PI * 2);
    ctx.clip('evenodd');
  }
  // krk v otvoru: barva kůže z malby hlavy, k zadní hraně do stínu (brada a límec)
  hole(); ctx.fillStyle = g.skin ?? '#c99a82'; ctx.fill();
  if (!g.back) {
    // krk vystupuje z otvoru k bradě (za obličejem ho ořez schová): válec se stínem po stranách
    const hc = projP(top(0, 0)), hw = R0 * 0.62;
    ctx.save(); ctx.translate(g.neck.x, g.neck.y); ctx.rotate(ang);
    // konec namalovaného krku (v otočeném rámci límce); krk se jen napojí, nepřekreslí hlavu
    const hb = g.headBottom ?? { x: g.neck.x, y: g.neck.y - w }, dx = hb.x - g.neck.x, dy = hb.y - g.neck.y;
    const yb = hc.y, yt = Math.min(yb, -dx * Math.sin(ang) + dy * Math.cos(ang) - w * 0.04);
    const gx = ctx.createLinearGradient(-hw, 0, hw, 0);
    gx.addColorStop(0, 'rgba(40,22,16,0.4)'); gx.addColorStop(0.35, 'rgba(40,22,16,0.05)'); gx.addColorStop(0.7, 'rgba(40,22,16,0.08)'); gx.addColorStop(1, 'rgba(40,22,16,0.45)');
    ctx.beginPath(); ctx.rect(-hw, yt, hw * 2, yb - yt); ctx.fillStyle = g.skin ?? '#c99a82'; ctx.fill(); ctx.fillStyle = gx; ctx.fill();
    ctx.restore();
  }
  hole(); ctx.save(); ctx.clip();
  { const a0 = projP(top(0, 0.82)), a1 = projP(top(Math.PI, 0.82)), cA = Math.cos(ang), sA = Math.sin(ang);
    const X = (q: Vec2) => g.neck.x + q.x * cA - q.y * sA, Y = (q: Vec2) => g.neck.y + q.x * sA + q.y * cA;
    const gr = ctx.createLinearGradient(X(a0), Y(a0), X(a1), Y(a1));
    gr.addColorStop(0, 'rgba(40,22,16,0.15)'); gr.addColorStop(1, `rgba(40,22,16,${g.back ? 0.35 : 0.55})`);
    ctx.fillStyle = gr; ctx.fillRect(g.neck.x - w * 3, g.neck.y - w * 3, w * 6, w * 6); }
  ctx.restore();
  cachedFacets(ctx, `n|${s.scarf}|${s.scarfColor}|${s.scarfColor2}|${s.scarfStripes}|${w.toFixed(2)}|${g.back}|${far.toFixed(3)}`, build, g.neck.x, g.neck.y, ang, w * 0.02);
  // horní hrana límce (pletený okraj): tmavší linka po přední polovině
  const c = Math.cos(ang), sn = Math.sin(ang);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = w * 0.03; ctx.beginPath(); let first = true;
  for (let j = 0; j <= 40; j++) { const phi = (j / 40) * 2 * Math.PI, q = P(1, phi), n = Math.cos(phi) * F[2] + Math.sin(phi) * S[2]; if (n < 0) { first = true; continue; } const p = projP(q), x = g.neck.x + p.x * c - p.y * sn, y = g.neck.y + p.x * sn + p.y * c; if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.restore();
}
