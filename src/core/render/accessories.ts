/**
 * Vektorové doplňky postav: pletená čepice (s bambulí, bez bambule, ušanka), šála (omotaná kolem krku,
 * s volnými konci nebo jen nákrčník) a palčáky. Přidávají variabilitu (střih, barvy, pruhy) bez nových
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

export interface AccessorySpec {
  hat: 'pompom' | 'beanie' | 'earflap' | 'none'; hatColor: string; hatColor2: string; hatStripes: boolean; slouch: number;
  scarf: 'long' | 'wrap' | 'none'; scarfColor: string; scarfColor2: string; scarfStripes: boolean; tailLen: number;
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
  const sr = r(3), scarf: AccessorySpec['scarf'] = sr < 0.55 ? 'long' : sr < 0.86 ? 'wrap' : 'none';
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
}

// ---------------------------------------------------------------- fyzika (souřadnice scény, px)
export interface AccPhys { t: number; acc: number; tails: { p: Vec2[]; q: Vec2[] }[]; pom: { p: Vec2; v: Vec2 } | null; last: { knots: Vec2[]; top: Vec2 | null } }
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
  const fresh = !st || t < st.t - 1e-6 || t - st.t > 0.5 || st.tails.length !== inp.knots.length || !!st.pom !== !!inp.top;
  if (!st || fresh) {
    st = {
      t, acc: 0,
      tails: inp.knots.map((k, j) => { const p = Array.from({ length: NSEG + 1 }, (_, i) => ({ x: k.x + inp.chestN.x * 0.25 * inp.segPx[j] * Math.min(i, 1), y: k.y + i * inp.segPx[j] })); return { p, q: p.map((x) => ({ ...x })) }; }),
      pom: inp.top ? { p: { x: inp.top.x + inp.up.x * 0.05 * inp.ppm, y: inp.top.y + inp.up.y * 0.05 * inp.ppm }, v: { x: 0, y: 0 } } : null,
      last: { knots: inp.knots.map((k) => ({ ...k })), top: inp.top ? { ...inp.top } : null },
    };
    m.set(id, st);
    return st;
  }
  const dt = t - st.t, acc0 = st.acc;
  st.acc = Math.min(0.25, st.acc + dt); st.t = t;
  const g = 9.81 * inp.ppm, L0 = st.last;
  // vstupy (uzly, temeno) se mezi snímky interpolují po dílčích krocích → výsledek nezávisí na fps
  const lerp = (a: Vec2 | null | undefined, b: Vec2, u: number) => (a && Math.hypot(b.x - a.x, b.y - a.y) < 0.06 * inp.ppm ? { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u } : b);
  let n = 0;
  while (st.acc >= STEP) {
    st.acc -= STEP; n++;
    const u = dt > 1e-9 ? Math.max(0, Math.min(1, (n * STEP - acc0) / dt)) : 1;
    const knotsU = inp.knots.map((k, j) => lerp(L0.knots[j], k, u)), topU = inp.top ? lerp(L0.top, inp.top, u) : null;
    st.tails.forEach((tl, j) => {
      const k = knotsU[j], seg = inp.segPx[j];
      // skok uzlu (otočka postavy – zrcadlení pohledu, přepnutí zepředu/zezadu): řetízek se přenese celý,
      // jinak by z nespojitosti kresby vznikla nefyzikální rychlost
      const jx = k.x - tl.p[0].x, jy = k.y - tl.p[0].y;
      if (Math.hypot(jx, jy) > 0.06 * inp.ppm) for (let i = 0; i < tl.p.length; i++) { tl.p[i].x += jx; tl.p[i].y += jy; tl.q[i].x += jx; tl.q[i].y += jy; }
      tl.p[0] = { ...k }; tl.q[0] = { ...k };
      for (let i = 1; i < tl.p.length; i++) {
        const p = tl.p[i], q = tl.q[i];
        // odpor vzduchu: rychlost se tlumí (víc na volném konci – lehká látka), vítr tlačí vodorovně
        const damp = 0.992 - 0.004 * (i / NSEG);
        const gust = inp.wind * inp.ppm * (0.55 + 0.45 * Math.sin(t * 1.7 + i * 0.9 + j * 2.1)) * (i / NSEG);
        const vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp;
        tl.q[i] = { x: p.x, y: p.y };
        tl.p[i] = { x: p.x + vx + gust * 2.2 * STEP * STEP, y: p.y + vy + g * STEP * STEP };
      }
      for (let it = 0; it < 6; it++) {
        for (let i = 1; i < tl.p.length; i++) {
          const a = tl.p[i - 1], b = tl.p[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6, e = (d - seg) / d;
          if (i === 1) { b.x -= dx * e; b.y -= dy * e; } else { a.x += dx * e * 0.5; a.y += dy * e * 0.5; b.x -= dx * e * 0.5; b.y -= dy * e * 0.5; }
        }
        // látka leží na hrudi: body nesmí za rovinu před trupem
        for (let i = 1; i < tl.p.length; i++) {
          const b = tl.p[i], s = (b.x - inp.chestP.x) * inp.chestN.x + (b.y - inp.chestP.y) * inp.chestN.y;
          if (s < 0) { b.x -= s * inp.chestN.x; b.y -= s * inp.chestN.y; }
        }
      }
    });
    if (topU && st.pom) {
      { const tg0 = { x: topU.x + inp.up.x * 0.05 * inp.ppm, y: topU.y + inp.up.y * 0.05 * inp.ppm }, jx = tg0.x - st.pom.p.x, jy = tg0.y - st.pom.p.y;
        if (Math.hypot(jx, jy) > 0.12 * inp.ppm) { st.pom.p.x += jx; st.pom.p.y += jy; } }
      // bambule: ω ≈ 13 rad/s, ζ ≈ 0,2; gravitace ji mírně prohne; stopka max. 0,035 m
      const P = st.pom, tg = { x: topU.x + inp.up.x * 0.05 * inp.ppm, y: topU.y + inp.up.y * 0.05 * inp.ppm }, K = 170, C = 5.5;
      const ax = -K * (P.p.x - tg.x) - C * P.v.x + inp.wind * inp.ppm * 0.4, ay = -K * (P.p.y - tg.y) - C * P.v.y + 0.25 * g;
      P.v.x += ax * STEP; P.v.y += ay * STEP; P.p.x += P.v.x * STEP; P.p.y += P.v.y * STEP;
      const dx = P.p.x - tg.x, dy = P.p.y - tg.y, d = Math.hypot(dx, dy), mx = 0.035 * inp.ppm;
      if (d > mx) { P.p.x = tg.x + (dx / d) * mx; P.p.y = tg.y + (dy / d) * mx; const vn = (P.v.x * dx + P.v.y * dy) / d; if (vn > 0) { P.v.x -= (vn * dx) / d; P.v.y -= (vn * dy) / d; } }
    }
  }
  st.last = { knots: inp.knots.map((k) => ({ ...k })), top: inp.top ? { ...inp.top } : null };
  return st;
}

// ---------------------------------------------------------------- kreslení (lokální souřadnice postavy)
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const shade = (hex: string, k: number) => { const [r, g, b] = rgb(hex), f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
type Ctx = CanvasRenderingContext2D;

/** Pletená čepice: kopule přes temeno (lem šikmo – výš nad čelem, níž v týle), žebrování, pruhy, ušanky. */
export function drawHat(ctx: Ctx, s: AccessorySpec, g: AccessoryGeo, far: number) {
  if (s.hat === 'none') return;
  const r = g.headR, ang = Math.atan2(g.headUp.y, g.headUp.x) + Math.PI / 2;
  ctx.save(); ctx.translate(g.headC.x, g.headC.y); ctx.rotate(ang);
  const fs = g.back ? -1 : 1; // strana obličeje (+x vpředu u pohledu zepředu)
  // obrys kopule: lem od týla (níž) k čelu (výš), vrchol mírně dozadu (splihlá pletenina)
  const yB = r * 0.1, yF = -r * 0.3, top = -r * (1.18 + s.slouch * 0.35), sl = -fs * r * s.slouch * 0.6;
  const dome = () => {
    ctx.beginPath(); ctx.moveTo(-fs * r * 1.06, yB);
    ctx.bezierCurveTo(-fs * r * 1.12, -r * 0.6, sl - fs * r * 0.75, top, sl, top);
    ctx.bezierCurveTo(sl + fs * r * 0.8, top, fs * r * 1.12, -r * 0.65, fs * r * 1.04, yF);
    ctx.closePath();
  };
  const gr = ctx.createLinearGradient(-r, top, r * 0.6, r * 0.2);
  gr.addColorStop(0, shade(s.hatColor, 1.12 * far)); gr.addColorStop(1, shade(s.hatColor, 0.74 * far));
  ctx.fillStyle = gr; dome(); ctx.fill();
  ctx.save(); dome(); ctx.clip();
  if (s.hatStripes) { ctx.fillStyle = shade(s.hatColor2, far); for (const y of [-0.42, -0.72]) ctx.fillRect(-r * 1.4, y * r, r * 2.8, r * 0.14); }
  // žebrování: svislá očka sbíhající se k vrcholu
  ctx.lineWidth = r * 0.05; ctx.strokeStyle = 'rgba(0,0,0,0.11)';
  for (let i = -5; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.21, r * 0.2); ctx.quadraticCurveTo(i * r * 0.17, -r * 0.55, sl + i * r * 0.05, top); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = r * 0.03;
  for (let i = -5; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.21 + r * 0.06, r * 0.2); ctx.quadraticCurveTo(i * r * 0.17 + r * 0.05, -r * 0.55, sl + i * r * 0.05, top); ctx.stroke(); }
  // měkký stín spodní části (tvar hlavy pod pleteninou)
  const sh = ctx.createRadialGradient(-fs * r * 0.35, -r * 0.7, r * 0.1, 0, -r * 0.2, r * 1.3); sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sh; ctx.fillRect(-r * 1.5, top, r * 3, r * 2);
  ctx.restore();
  if (s.hat !== 'earflap') {
    // ohrnutý lem: pás po obvodu, mírně širší než kopule, jemná svislá žebra
    const band = () => { ctx.beginPath(); ctx.moveTo(-fs * r * 1.12, yB + r * 0.06); ctx.quadraticCurveTo(0, (yB + yF) / 2 + r * 0.12, fs * r * 1.1, yF + r * 0.04); ctx.lineTo(fs * r * 1.08, yF - r * 0.3); ctx.quadraticCurveTo(0, (yB + yF) / 2 - r * 0.22, -fs * r * 1.1, yB - r * 0.28); ctx.closePath(); };
    const bc = s.hatStripes ? s.hatColor2 : s.hatColor;
    const bg = ctx.createLinearGradient(0, yF - r * 0.3, 0, yB + r * 0.1); bg.addColorStop(0, shade(bc, 1.05 * far)); bg.addColorStop(1, shade(bc, 0.7 * far));
    ctx.fillStyle = bg; band(); ctx.fill();
    ctx.save(); band(); ctx.clip(); ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = r * 0.045;
    for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.14, -r * 0.6); ctx.lineTo(i * r * 0.14, r * 0.5); ctx.stroke(); }
    ctx.restore();
  } else {
    // ušanka: chlopně přes uši (bližší je vidět celá, vzdálená vykukuje), pletené šňůrky
    for (const sx of [-fs, fs * 0.55]) {
      ctx.fillStyle = shade(s.hatColor, (sx === -fs ? 0.9 : 0.78) * far);
      ctx.beginPath(); ctx.moveTo(sx * r * 1.02, yB - r * 0.15); ctx.quadraticCurveTo(sx * r * 1.12, r * 0.55, sx * r * 0.75, r * 0.8); ctx.quadraticCurveTo(sx * r * 0.5, r * 0.45, sx * r * 0.52, yB - r * 0.1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = shade(s.hatColor2, 0.9 * far); ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx * r * 0.76, r * 0.78); ctx.quadraticCurveTo(sx * r * 0.82, r * 1.0, sx * r * 0.74, r * 1.22); ctx.stroke();
    }
    ctx.strokeStyle = shade(s.hatColor2, far); ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.moveTo(-fs * r * 1.06, yB); ctx.quadraticCurveTo(0, (yB + yF) / 2 + r * 0.1, fs * r * 1.04, yF); ctx.stroke();
  }
  ctx.restore();
}
/** Temeno čepice (lokálně) – kotva pružiny bambule. */
export function hatTop(s: AccessorySpec, g: AccessoryGeo): Vec2 {
  const r = g.headR, k = r * (1.2 + s.slouch * 0.35) * 0.97, sl = -(g.back ? -1 : 1) * r * s.slouch * 0.6;
  const ang = Math.atan2(g.headUp.y, g.headUp.x) + Math.PI / 2, c = Math.cos(ang), sn = Math.sin(ang);
  return { x: g.headC.x + sl * c + k * sn, y: g.headC.y + sl * sn - k * c };
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
  return g.back ? [P(w * 0.18, w * 0.3)] : [P(w * 0.26, w * 0.34), P(w * 0.36, w * 0.32)];
}

/** Šála: dvě omotané vrstvy kolem krku, uzel vpředu (pohled zepředu), volné konce z fyziky. */
export function drawScarf(ctx: Ctx, s: AccessorySpec, g: AccessoryGeo, tails: Vec2[][], far: number) {
  if (s.scarf === 'none') return;
  const w = g.neckW, ang = Math.atan2(g.torsoUp.y, g.torsoUp.x) + Math.PI / 2, fs = g.back ? -1 : 1;
  const W = w * 0.42;
  // vzadu: konec přehozený přes rameno visí po zádech – kreslí se pod prstencem
  if (g.back && s.scarf === 'long') for (const t of tails) drawTail(ctx, s, t, W, far);
  ctx.save(); ctx.translate(g.neck.x, g.neck.y); ctx.rotate(ang);
  const roll = (y: number, rx: number, ry: number, k: number) => {
    const gr = ctx.createLinearGradient(0, y - ry, 0, y + ry); gr.addColorStop(0, shade(s.scarfColor, 1.14 * k * far)); gr.addColorStop(0.55, shade(s.scarfColor, 0.97 * k * far)); gr.addColorStop(1, shade(s.scarfColor, 0.8 * k * far));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(fs * w * 0.04, y, rx, ry, -fs * 0.08, 0, Math.PI * 2); ctx.fill();
    if (s.scarfStripes) { ctx.save(); ctx.beginPath(); ctx.ellipse(fs * w * 0.04, y, rx, ry, -fs * 0.08, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = shade(s.scarfColor2, k * far); ctx.globalAlpha = 0.85; for (const x of [-0.4, 0.04, 0.48]) { ctx.save(); ctx.translate(x * w, y); ctx.rotate(-0.35 * fs); ctx.fillRect(-w * 0.035, -ry * 1.3, w * 0.07, ry * 2.6); ctx.restore(); } ctx.restore(); }
    // záhyb (spodní hrana vrstvy)
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = w * 0.035; ctx.beginPath(); ctx.ellipse(fs * w * 0.04, y + ry * 0.2, rx * 0.86, ry * 0.7, -fs * 0.08, 0.25, Math.PI - 0.25); ctx.stroke();
  };
  roll(w * 0.2, w * 0.62, w * 0.24, 0.92); // spodní otočka (na límci)
  roll(-w * 0.02, w * 0.56, w * 0.24, 1); // horní otočka (u brady)
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
