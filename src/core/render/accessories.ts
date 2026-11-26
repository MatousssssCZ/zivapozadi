/**
 * Vektorové doplňky postav: pletená čepice (s bambulí, bez bambule, ušanka) a nákrčník / omotaná šála
 * jako 3D modely (accessories3d.ts), volné konce šály (2D řetízek s fyzikou) a palčáky. Přidávají variabilitu (střih, barvy, pruhy) bez nových
 * malovaných dílů; malovaná čepice a šála se u postavy s vektorovou variantou nekreslí.
 *
 * Fyzika sekundárního pohybu (pevný krok 1/120 s – nezávislá na snímkové frekvenci):
 *  - konce šály: řetízek bodů (Verlet) zavěšený na uzlu u krku ve scéně: gravitace, odpor vzduchu,
 *    setrvačnost (tělo se pohne, konec se opozdí), vítr s poryvy; články drží délku (bez natahování),
 *    látka nepronikne do hrudi (polorovina před trupem);
 *  - bambule: tlumená pružina k bodu nad temenem (houpe se s krokem, dobíhá po zastavení), omezená
 *    délkou „stopky“;
 * Stav žije ve vykreslování (podle simulace a postavy); při skoku času se srovná do klidu.
 */
import type { Vec2 } from '../math/vec';
import type { CharacterAppearance } from '../anim/partLibrary';
import { drawHat3D, hatTop3D, drawNeck3D } from './accessories3d';

export interface AccessorySpec {
  hat: 'pompom' | 'beanie' | 'earflap' | 'none'; hatColor: string; hatColor2: string; hatStripes: boolean; slouch: number;
  scarf: 'long' | 'wrap' | 'tube' | 'none'; scarfColor: string; scarfColor2: string; scarfStripes: boolean; tailLen: number;
  mittens: boolean; mittenColor: string; mittenCuff: string;
}
/** Zimní paleta (tlumené tóny ladící s malbou). */
const PAL = ['#a8322e', '#cf9a3a', '#2f7470', '#e9e1cf', '#2c3c62', '#73283a', '#3d6639', '#bf6630', '#584876', '#cfc8bc', '#8a8f96', '#4a2f2a'];
const h = (seed: number, k: number) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };

/** Doplňky z identity postavy (deterministicky); děti častěji bambuli a palčáky. Null = malované doplňky. */
export function accessoriesOf(app: CharacterAppearance | undefined, child: boolean): AccessorySpec | null {
  if (!app) return null;
  const s = app.seed % 100003, r = (k: number) => h(s, k), c = (k: number) => PAL[Math.floor(r(k) * PAL.length) % PAL.length];
  if (r(1) < 0.18) return null; // část postav si nechá malované doplňky
  const hr = r(2);
  const hat: AccessorySpec['hat'] = child ? (hr < 0.62 ? 'pompom' : hr < 0.86 ? 'earflap' : 'beanie') : (hr < 0.34 ? 'pompom' : hr < 0.66 ? 'beanie' : hr < 0.78 ? 'earflap' : 'none');
  const sr = r(3), scarf: AccessorySpec['scarf'] = sr < 0.45 ? 'long' : sr < 0.62 ? 'wrap' : sr < 0.9 ? 'tube' : 'none';
  const c1 = c(4); let c2 = c(5); if (c2 === c1) c2 = PAL[(PAL.indexOf(c1) + 5) % PAL.length];
  const sc = r(7) < 0.45 ? c2 : c(8);
  return {
    hat, hatColor: c1, hatColor2: c2, hatStripes: r(6) < 0.4, slouch: r(14) * 0.25,
    scarf, scarfColor: sc, scarfColor2: sc === c1 ? c2 : c1, scarfStripes: r(9) < 0.45, tailLen: 0.85 + r(10) * 0.4,
    mittens: child || r(11) < 0.3, mittenColor: r(12) < 0.6 ? c1 : c(13), mittenCuff: r(15) < 0.5 ? c2 : '#e9e1cf',
  };
}

/** Geometrie pro doplňky (lokální souřadnice postavy: chodidla v počátku, jednotky postavy). */
export interface AccessoryGeo {
  headC: Vec2; headUp: Vec2; headR: number;
  neck: Vec2; torsoUp: Vec2; neckW: number;
  hands: ({ E: Vec2; d: Vec2; L: number; W: number } | null)[];
  back: boolean;
  /** barva krku z malby hlavy (výplň otvoru límce) */ skin?: string;
  /** spodní okraj malby hlavy (konec namalovaného krku) */ headBottom?: Vec2;
}

// ---------------------------------------------------------------- fyzika
/**
 * Konce šály se simulují v souřadnicích TĚLA (metry, počátek v uzlu, x = dopředu od hrudi, y = dolů),
 * pohyb těla do nich vstupuje jen jako setrvačná síla (−zrychlení uzlu). Zrcadlení kresby při otočce
 * ani přepnutí pohledu proto nezpůsobí skok. Nespojitosti uzlu (přepnutí pohledu, zrcadlení) se
 * nezapočítají jako zrychlení; zrychlení je omezené (krok těla, ne náraz).
 * Pletená šála je těžká a tlumená: odpor vzduchu, ohybová tuhost (článek se nezlomí do ostrého úhlu)
 * a tření o hruď (bod, který se opře o hrudník, ztratí tečnou rychlost).
 */
export interface AccPhys { t: number; acc: number; tails: { p: Vec2[]; q: Vec2[] }[]; loc: { p: Vec2[]; q: Vec2[] }[]; pom: { p: Vec2; v: Vec2 } | null; last: { knots: Vec2[]; top: Vec2 | null }; kv?: Vec2 | null; kPrev?: Vec2 | null; aF?: Vec2 }
const store = new WeakMap<object, Map<string, AccPhys>>();
const STEP = 1 / 120, NSEG = 6;
export const TAIL_SEGS = NSEG;

export interface PhysInput {
  /** uzly šály (konce), délky článků (px), temeno + směr nahoru (bambule), px na metr, rovina hrudi, vítr (m/s, +x) */
  knots: Vec2[]; segPx: number[]; top: Vec2 | null; up: Vec2; ppm: number; chestN: Vec2; chestP: Vec2; wind: number;
}
export function stepAccessoryPhysics(owner: object, id: string, t: number, inp: PhysInput): AccPhys {
  let m = store.get(owner); if (!m) { m = new Map(); store.set(owner, m); }
  let st = m.get(id);
  const nT = inp.knots.length || 2;
  const seg = (j: number) => (inp.segPx[j] ?? inp.segPx[0] ?? 0.08 * inp.ppm) / inp.ppm;
  const fresh = !st || t < st.t - 1e-6 || t - st.t > 0.5 || st.loc.length !== nT || !!st.pom !== !!inp.top;
  if (!st || fresh) {
    st = {
      t, acc: 0, tails: [],
      loc: Array.from({ length: nT }, (_, j) => { const p = Array.from({ length: NSEG + 1 }, (_, i) => ({ x: i ? 0.015 : 0, y: i * seg(j) })); return { p, q: p.map((x) => ({ ...x })) }; }),
      pom: inp.top ? { p: { x: inp.top.x + inp.up.x * 0.05 * inp.ppm, y: inp.top.y + inp.up.y * 0.05 * inp.ppm }, v: { x: 0, y: 0 } } : null,
      last: { knots: inp.knots.map((k) => ({ ...k })), top: inp.top ? { ...inp.top } : null }, kv: null, kPrev: null, aF: { x: 0, y: 0 },
    };
    m.set(id, st);
  } else {
    const dt = t - st.t, acc0 = st.acc;
    st.acc = Math.min(0.25, st.acc + dt); st.t = t;
    // zrychlení uzlu (m/s²) z jeho pohybu ve scéně; skok > 6 cm za snímek = nespojitost kresby, ne pohyb
    const K = inp.knots[0];
    if (K && dt > 1e-6) {
      const km = { x: K.x / inp.ppm, y: K.y / inp.ppm };
      if (st.kPrev && Math.hypot(km.x - st.kPrev.x, km.y - st.kPrev.y) < 0.06) {
        const v = { x: (km.x - st.kPrev.x) / dt, y: (km.y - st.kPrev.y) / dt };
        if (st.kv) {
          let ax = (v.x - st.kv.x) / dt, ay = (v.y - st.kv.y) / dt; const am = Math.hypot(ax, ay), lim = 4;
          if (am > lim) { ax *= lim / am; ay *= lim / am; }
          // mírné vyhlazení (krok těla se přenáší, šum kresby ne)
          st.aF = { x: (st.aF?.x ?? 0) + (ax - (st.aF?.x ?? 0)) * Math.min(1, dt * 12), y: (st.aF?.y ?? 0) + (ay - (st.aF?.y ?? 0)) * Math.min(1, dt * 12) };
        }
        st.kv = v;
      } else st.kv = null;
      st.kPrev = km;
    }
    const g = 9.81;
    const fwdX = inp.chestN.x >= 0 ? 1 : -1; // obrazová x složka „dopředu“ (zrcadlení)
    while (st.acc >= STEP) {
      st.acc -= STEP;
      // setrvačná síla v rámci těla: −a (x: dopředu = směr hrudi v obraze)
      // + odpor vzduchu proti pohybu těla (při chůzi šála mírně vlaje dozadu): −k·v_tělo
      const vb = st.kv ?? { x: 0, y: 0 }, kAir = 1.3;
      const ax = -(st.aF?.x ?? 0) * fwdX - kAir * vb.x * fwdX, ay = -(st.aF?.y ?? 0) - kAir * vb.y * 0.3;
      st.loc.forEach((tl, j) => {
        const sl = seg(j);
        tl.p[0] = { x: 0, y: 0 }; tl.q[0] = { x: 0, y: 0 };
        for (let i = 1; i < tl.p.length; i++) {
          const p = tl.p[i], q = tl.q[i];
          const damp = 0.975 - 0.01 * (i / NSEG); // pletenina: silný odpor (doznívá do ~1 s)
          const wind = inp.wind * fwdX * (0.6 + 0.4 * Math.sin(t * 1.3 + i * 0.7 + j * 2.1)) * (i / NSEG) * 1.6;
          const vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp;
          tl.q[i] = { x: p.x, y: p.y };
          tl.p[i] = { x: p.x + vx + (ax + wind) * STEP * STEP, y: p.y + vy + (g + ay) * STEP * STEP };
        }
        for (let it = 0; it < 10; it++) {
          for (let i = 1; i < tl.p.length; i++) {
            const a = tl.p[i - 1], b = tl.p[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6, e = (d - sl) / d;
            if (i === 1) { b.x -= dx * e; b.y -= dy * e; } else { a.x += dx * e * 0.5; a.y += dy * e * 0.5; b.x -= dx * e * 0.5; b.y -= dy * e * 0.5; }
          }
          // ohybová tuhost: dva články od sebe nejméně 1,7 × délka článku (bez ostrých zlomů)
          for (let i = 2; i < tl.p.length; i++) {
            const a = tl.p[i - 2], b = tl.p[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6, mn = 1.7 * sl;
            if (d < mn) { const e = (d - mn) / d * 0.5; if (i - 2 > 0) { a.x += dx * e * 0.5; a.y += dy * e * 0.5; } b.x -= dx * e; b.y -= dy * e; }
          }
          // hruď: body nesmí za rovinu těla (x < 0); opřený bod ztrácí tečnou rychlost (tření)
          for (let i = 1; i < tl.p.length; i++) { const b = tl.p[i]; if (b.x < 0) { b.x = 0; const q = tl.q[i]; q.y = b.y - (b.y - q.y) * 0.6; q.x = b.x; } }
        }
      });
      if (inp.top && st.pom) {
        const P = st.pom, tg = { x: inp.top.x + inp.up.x * 0.05 * inp.ppm, y: inp.top.y + inp.up.y * 0.05 * inp.ppm };
        if (Math.hypot(tg.x - P.p.x, tg.y - P.p.y) > 0.12 * inp.ppm) { P.p = { ...tg }; P.v = { x: 0, y: 0 }; }
        // bambule: tlumená pružina (ω ≈ 13 rad/s, ζ ≈ 0,3); stopka max. 0,035 m
        const Kk = 170, C = 8, gp = 9.81 * inp.ppm;
        const bx = -Kk * (P.p.x - tg.x) - C * P.v.x + inp.wind * inp.ppm * 0.4, by = -Kk * (P.p.y - tg.y) - C * P.v.y + 0.25 * gp;
        P.v.x += bx * STEP; P.v.y += by * STEP; P.p.x += P.v.x * STEP; P.p.y += P.v.y * STEP;
        const dx = P.p.x - tg.x, dy = P.p.y - tg.y, d = Math.hypot(dx, dy), mx = 0.035 * inp.ppm;
        if (d > mx) { P.p.x = tg.x + (dx / d) * mx; P.p.y = tg.y + (dy / d) * mx; const vn = (P.v.x * dx + P.v.y * dy) / d; if (vn > 0) { P.v.x -= (vn * dx) / d; P.v.y -= (vn * dy) / d; } }
      }
    }
    void acc0;
  }
  // do obrazu: uzel + (dopředu po rovině hrudi, dolů) × px/m
  const N = inp.chestN, nl = Math.hypot(N.x, N.y) || 1, fx = N.x / nl, fy = N.y / nl;
  st.tails = st.loc.slice(0, inp.knots.length).map((tl, j) => { const K = inp.knots[j]; const f = (p: Vec2) => ({ x: K.x + (p.x * fx) * inp.ppm, y: K.y + (p.x * fy + p.y) * inp.ppm }); return { p: tl.p.map(f), q: tl.q.map(f) }; });
  st.last = { knots: inp.knots.map((k) => ({ ...k })), top: inp.top ? { ...inp.top } : null };
  return st;
}

// ---------------------------------------------------------------- kreslení (lokální souřadnice postavy)
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const shade = (hex: string, k: number) => { const [r, g, b] = rgb(hex), f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
type Ctx = CanvasRenderingContext2D;

/** Pletená čepice – 3D model (accessories3d.ts): kopule, ohrnutý lem, žebra, pruhy, ušanky. */
export function drawHat(ctx: Ctx, s: AccessorySpec, g: AccessoryGeo, far: number) {
  if (s.hat === 'none') return;
  return drawHat3D(ctx, s, g, far);
}
/** Temeno čepice (lokálně) – kotva pružiny bambule. */
export function hatTop(s: AccessorySpec, g: AccessoryGeo): Vec2 {
  return hatTop3D(s, g);
}

/** Bambule: chlupatá koule (nepravidelný okraj, světlo shora, jemná vlákna). */
export function drawPompom(ctx: Ctx, s: AccessorySpec, p: Vec2, R: number, far: number) {
  ctx.save(); ctx.translate(p.x, p.y);
  const pg = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.15);
  pg.addColorStop(0, shade(s.hatColor2, 1.25 * far)); pg.addColorStop(0.7, shade(s.hatColor2, 0.95 * far)); pg.addColorStop(1, shade(s.hatColor2, 0.7 * far));
  ctx.fillStyle = pg; ctx.beginPath();
  for (let i = 0; i <= 22; i++) { const a = (i / 22) * Math.PI * 2, rr = R * (1 + 0.1 * Math.sin(i * 2.7) + 0.06 * Math.sin(i * 5.3)); if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(rr, 0); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(s.hatColor2, 1.15 * far); ctx.lineWidth = R * 0.09; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const a = i * 2.39, r0 = R * 0.75, r1 = R * 1.12; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a + 0.12) * r1, Math.sin(a + 0.12) * r1); ctx.stroke(); }
  ctx.restore();
}

/** Volný konec šály podél fyzikálního řetízku (lokální body): zúžení, záhyby, pruhy, třásně. */
function drawTail(ctx: Ctx, s: AccessorySpec, pts: Vec2[], W: number, far: number) {
  if (pts.length < 2) return;
  const L: Vec2[] = [], R: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const hw = (W / 2) * (1 - 0.08 * (i / pts.length)) * (1 + 0.05 * Math.sin(i * 1.9));
    L.push({ x: pts[i].x - (ty / tl) * hw, y: pts[i].y + (tx / tl) * hw }); R.push({ x: pts[i].x + (ty / tl) * hw, y: pts[i].y - (tx / tl) * hw });
  }
  const path = () => {
    ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < L.length; i++) { const m = { x: (L[i - 1].x + L[i].x) / 2, y: (L[i - 1].y + L[i].y) / 2 }; ctx.quadraticCurveTo(L[i - 1].x, L[i - 1].y, m.x, m.y); }
    ctx.lineTo(L[L.length - 1].x, L[L.length - 1].y); ctx.lineTo(R[R.length - 1].x, R[R.length - 1].y);
    for (let i = R.length - 2; i >= 0; i--) { const m = { x: (R[i + 1].x + R[i].x) / 2, y: (R[i + 1].y + R[i].y) / 2 }; ctx.quadraticCurveTo(R[i + 1].x, R[i + 1].y, m.x, m.y); }
    ctx.lineTo(R[0].x, R[0].y); ctx.closePath();
  };
  ctx.fillStyle = shade(s.scarfColor, 0.9 * far); path(); ctx.fill();
  ctx.save(); path(); ctx.clip();
  // stínování podél: okraje tmavší (zaoblená látka), pruhy napříč
  ctx.lineWidth = W * 0.22; ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  for (const side of [L, R]) { ctx.beginPath(); side.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); }
  if (s.scarfStripes) {
    ctx.strokeStyle = shade(s.scarfColor2, far); ctx.lineWidth = W * 0.2;
    for (const k of [0.62, 0.78, 0.9]) { const i = Math.min(pts.length - 2, Math.floor(k * (pts.length - 1))), f = k * (pts.length - 1) - i, x = L[i].x + (L[i + 1].x - L[i].x) * f, y = L[i].y + (L[i + 1].y - L[i].y) * f, x2 = R[i].x + (R[i + 1].x - R[i].x) * f, y2 = R[i].y + (R[i + 1].y - R[i].y) * f; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); }
  }
  ctx.restore();
  // třásně
  const e = pts[pts.length - 1], d = pts[pts.length - 2], tx = e.x - d.x, ty = e.y - d.y, tl = Math.hypot(tx, ty) || 1;
  ctx.strokeStyle = shade(s.scarfColor, 0.8 * far); ctx.lineWidth = W * 0.09; ctx.lineCap = 'round';
  for (let i = -3; i <= 3; i++) { const o = (i / 3) * W * 0.42, sx = e.x - (ty / tl) * o, sy = e.y + (tx / tl) * o, ln = W * (0.3 + 0.06 * (((i + 3) * 7) % 3)); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (tx / tl) * ln, sy + (ty / tl) * ln); ctx.stroke(); }
}

/** Uzly šály (lokálně): vpředu dva konce z uzlu, vzadu jeden přes rameno. */
export function scarfKnots(s: AccessorySpec, g: AccessoryGeo): Vec2[] {
  if (s.scarf !== 'long') return [];
  const ang = Math.atan2(g.torsoUp.y, g.torsoUp.x) + Math.PI / 2, c = Math.cos(ang), sn = Math.sin(ang), w = g.neckW;
  const P = (x: number, y: number) => ({ x: g.neck.x + x * c - y * sn, y: g.neck.y + x * sn + y * c });
  return [P(w * 0.26, w * 0.34), P(w * 0.36, w * 0.32)]; // (zezadu jsou konce schované před tělem – fyzika běží dál, bez skoku při otočce)
}

/** Šála: dvě omotané vrstvy kolem krku, uzel vpředu (pohled zepředu), volné konce z fyziky. */
export function drawScarf(ctx: Ctx, s: AccessorySpec, g: AccessoryGeo, tails: Vec2[][], far: number) {
  if (s.scarf === 'none') return;
  const w = g.neckW, ang = Math.atan2(g.torsoUp.y, g.torsoUp.x) + Math.PI / 2, fs = g.back ? -1 : 1;
  const W = w * 0.42;
  // 3D pletená trubice kolem krku (nákrčník / dvě otočky šály), pak uzel a volné konce
  drawNeck3D(ctx, s, g, far);
  ctx.save(); ctx.translate(g.neck.x, g.neck.y); ctx.rotate(ang);
  if (!g.back && s.scarf === 'long') { ctx.fillStyle = shade(s.scarfColor, 0.95 * far); ctx.beginPath(); ctx.ellipse(fs * w * 0.3, w * 0.3, w * 0.16, w * 0.14, 0.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  if (!g.back && s.scarf === 'long') for (const t of tails) drawTail(ctx, s, t, W, far);
}

/** Palčák: měkký pletený tvar s palcem a ohrnutým lemem; E = zápěstí, d = směr prstů. */
export function drawMitten(ctx: Ctx, s: AccessorySpec, hand: NonNullable<AccessoryGeo['hands'][number]>, farK: number, thumbSide: number) {
  const { E, d, L, W } = hand, ang = Math.atan2(d.y, d.x) - Math.PI / 2;
  ctx.save(); ctx.translate(E.x, E.y); ctx.rotate(ang);
  const gr = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); gr.addColorStop(0, shade(s.mittenColor, 1.08 * farK)); gr.addColorStop(1, shade(s.mittenColor, 0.75 * farK));
  ctx.fillStyle = gr;
  // palec (pod dlaní, kreslí se první)
  ctx.beginPath(); ctx.ellipse(thumbSide * W * 0.48, L * 0.42, W * 0.2, L * 0.24, thumbSide * -0.5, 0, Math.PI * 2); ctx.fill();
  // dlaň
  ctx.beginPath(); ctx.moveTo(-W * 0.46, L * 0.12); ctx.lineTo(-W * 0.5, L * 0.55);
  ctx.bezierCurveTo(-W * 0.54, L * 1.04, W * 0.54, L * 1.04, W * 0.5, L * 0.55); ctx.lineTo(W * 0.46, L * 0.12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = W * 0.05; ctx.beginPath(); ctx.moveTo(-W * 0.1, L * 0.5); ctx.quadraticCurveTo(0, L * 0.75, W * 0.05, L * 0.9); ctx.stroke();
  // lem
  ctx.fillStyle = shade(s.mittenCuff, 0.95 * farK); ctx.beginPath(); ctx.roundRect(-W * 0.52, -L * 0.08, W * 1.04, L * 0.24, W * 0.12); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = W * 0.04; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * W * 0.14, -L * 0.07); ctx.lineTo(i * W * 0.14, L * 0.15); ctx.stroke(); }
  ctx.restore();
}
