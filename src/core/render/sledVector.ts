/**
 * Vektorové saně a boby kreslené jako skutečný 3D model promítnutý kamerou scény (žádné pohledové
 * sprity – správná perspektiva v každém natočení). Souřadnice modelu: x vpřed po ose saní, z do strany,
 * h výška nad sněhem (m). Pořadí kreslení: vzdálená skluznice → sedák → bližší skluznice (malířův
 * algoritmus podle hloubky stran). Drobné poskakování na nerovnostech sněhu je funkcí ujeté dráhy
 * (stojící saně se nehýbou), ne časovače.
 */
import type { Camera, World } from '../scene/camera';
import { toScreen } from '../scene/camera';
import { SLED } from '../sim/sled';
import type { Vec2 } from '../math/vec';

type Ctx = CanvasRenderingContext2D;
export type SledKind = 'sane' | 'boby';
const L = SLED.length, Wd = SLED.width;

/** model → obraz */
function projector(cam: Camera, S: World, hd: number, lift: number, pitch: number) {
  const c = Math.cos(hd), s = Math.sin(hd);
  return (x: number, z: number, h: number): Vec2 => toScreen(cam, { X: S.X + x * c - z * s, Z: S.Z + x * s + z * c }, h + lift + x * pitch);
}
/** oko provazu na přídi (obraz) */
export function sledRingScreen(cam: Camera, S: World, hd: number, kind: SledKind): Vec2 {
  return projector(cam, S, hd, 0, 0)(L / 2 - (kind === 'boby' ? 0.02 : 0.04), 0, kind === 'boby' ? 0.17 : 0.2);
}
/** výška sedáku (m) – kde sedí jezdec */
export const SEAT_H = { sane: 0.18, boby: 0.12 } as const;

const poly = (ctx: Ctx, pts: Vec2[]) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
function hull(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y), cr = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Vec2[] = [], up: Vec2[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/**
 * Nakreslí saně. `dist` = ujetá dráha (m) – poskakování na nerovnostech, `ppm` px na metr v místě saní
 * (tloušťky čar), `color` barva bobů / laku sáněk.
 */
export function drawVectorSled(ctx: Ctx, cam: Camera, S: World, hd: number, kind: SledKind, dist: number, ppm: number, color = '#b8322f') {
  const bump = 0.006 * Math.sin(dist * 7.3) + 0.004 * Math.sin(dist * 13.1 + 1.3), pitch = 0.012 * Math.cos(dist * 7.3);
  const P = projector(cam, S, hd, Math.max(0, bump), pitch);
  // stín na sněhu (měkký, pod celými saněmi)
  const g0 = projector(cam, S, hd, 0, 0), sh = [g0(-L / 2, -Wd / 2, 0), g0(L / 2, -Wd / 2, 0), g0(L / 2, Wd / 2, 0), g0(-L / 2, Wd / 2, 0)];
  ctx.save(); ctx.fillStyle = 'rgba(70,80,110,0.22)'; ctx.filter = `blur(${Math.max(0.5, 0.03 * ppm).toFixed(1)}px)`; poly(ctx, sh); ctx.fill(); ctx.restore();
  // strana blíž ke kameře = větší Z ve světě? (kamera hledí do +Z: blíž je menší Z)
  const zSide = (z: number) => S.Z + Math.sin(hd) * 0 + Math.cos(hd) * z;
  const nearZ = zSide(Wd / 2) < zSide(-Wd / 2) ? Wd / 2 : -Wd / 2, farZ = -nearZ;
  const lw = (m: number) => Math.max(0.8, m * ppm);
  if (kind === 'sane') {
    const runner = (z: number, shade: number) => {
      // skluznice: rovná lišta, vpředu zahnutá nahoru a dozadu (smyčka)
      const pts: Vec2[] = [];
      for (let i = 0; i <= 10; i++) pts.push(P(-L / 2 + (i / 10) * (L * 0.82), z, 0));
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 1.15, r = 0.1; pts.push(P(L / 2 - 0.18 * L + 0.1 + Math.sin(a) * r * 1.1, z, r - Math.cos(a) * r)); }
      ctx.strokeStyle = shade < 1 ? '#3b3f47' : '#565c66'; ctx.lineWidth = lw(0.022); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = lw(0.006); ctx.beginPath(); pts.slice(0, 11).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      // dřevěné nožky (3) od skluznice k sedáku
      ctx.strokeStyle = shade < 1 ? '#7a4a28' : '#94603a'; ctx.lineWidth = lw(0.03);
      for (const x of [-0.38, -0.05, 0.25]) { const a = P(x * L, z, 0.01), b = P(x * L, z * 0.92, SEAT_H.sane - 0.02); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    };
    runner(farZ, 0.8);
    // sedák: příčné lamely na dvou podélných trámcích
    ctx.strokeStyle = '#6f4325'; ctx.lineWidth = lw(0.028);
    for (const z of [-Wd * 0.42, Wd * 0.42]) { const a = P(-L * 0.46, z, SEAT_H.sane - 0.01), b = P(L * 0.3, z, SEAT_H.sane - 0.01); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (let i = 0; i < 7; i++) {
      const x0 = -L * 0.46 + i * (L * 0.76 / 7), x1 = x0 + L * 0.76 / 7 * 0.78;
      const q = [P(x0, -Wd / 2, SEAT_H.sane), P(x1, -Wd / 2, SEAT_H.sane), P(x1, Wd / 2, SEAT_H.sane), P(x0, Wd / 2, SEAT_H.sane)];
      const gr = ctx.createLinearGradient(q[0].x, q[0].y, q[2].x, q[2].y); gr.addColorStop(0, '#c48a55'); gr.addColorStop(1, '#a86f40');
      ctx.fillStyle = gr; poly(ctx, q); ctx.fill(); ctx.strokeStyle = 'rgba(60,30,10,0.35)'; ctx.lineWidth = lw(0.004); ctx.stroke();
    }
    runner(nearZ, 1);
  } else {
    // boby: plastová vana – dno, vyšší boky, zvednutá příď, madla po stranách
    const N = 18, rim: Vec2[] = [], bot: Vec2[] = [], rimW: { x: number; z: number; h: number }[] = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, x = Math.cos(a) * L * 0.48, z = Math.sin(a) * Wd * 0.55 * (x > 0 ? 1 - 0.35 * (x / (L * 0.48)) ** 2 : 1);
      const h = 0.17 + (x > 0 ? 0.08 * (x / (L * 0.48)) ** 2 : 0);
      rim.push(P(x, z, h)); bot.push(P(x * 0.92, z * 0.85, 0.01 + Math.max(0, x / L) * 0.12 * Math.max(0, x / (L * 0.48)) ** 3)); rimW.push({ x, z, h });
    }
    const hl = hull([...rim, ...bot]);
    const gr = ctx.createLinearGradient(hl[0].x, Math.min(...hl.map((p) => p.y)), hl[0].x, Math.max(...hl.map((p) => p.y)));
    gr.addColorStop(0, shadeHex(color, 1.15)); gr.addColorStop(1, shadeHex(color, 0.7));
    ctx.fillStyle = gr; poly(ctx, hl); ctx.fill();
    // vnitřek (o něco tmavší), lem s odleskem
    ctx.fillStyle = shadeHex(color, 0.82); poly(ctx, rim); ctx.fill();
    const inner = rimW.map((r) => P(r.x * 0.86, r.z * 0.8, 0.05)); ctx.fillStyle = shadeHex(color, 0.72); poly(ctx, inner); ctx.fill();
    ctx.strokeStyle = shadeHex(color, 1.3); ctx.lineWidth = lw(0.012); poly(ctx, rim); ctx.stroke();
    // madla (černé gumové úchyty) na bocích
    ctx.strokeStyle = '#26272b'; ctx.lineWidth = lw(0.02); ctx.lineCap = 'round';
    for (const z of [-Wd * 0.55, Wd * 0.55]) { const a = P(-0.05, z, 0.19), b = P(0.12, z * 0.98, 0.2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  }
}

function shadeHex(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * Provaz s prověšením: když je vzdálenost konců menší než délka, visí (řetězovka přibližně parabolou
 * s průhybem z délky provazu), při napnutí je téměř rovný. Konce = ruka a oko saní.
 */
export function drawRope(ctx: Ctx, hand: Vec2, ring: Vec2, ropeK: number, ppm: number) {
  const d = Math.hypot(hand.x - ring.x, hand.y - ring.y);
  const Lpx = d / Math.max(0.05, ropeK); // délka provazu v obraze (přibližně)
  const sag = ropeK >= 0.999 ? d * 0.02 : Math.sqrt(Math.max(0, (3 / 8) * d * Math.max(0, Lpx - d))) + d * 0.02; // malý průhyb i napnutý
  ctx.save(); ctx.strokeStyle = 'rgba(205,185,150,0.95)'; ctx.lineWidth = Math.max(1, 0.014 * ppm); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.quadraticCurveTo((hand.x + ring.x) / 2, Math.max(hand.y, ring.y) + sag * 2, ring.x, ring.y); ctx.stroke(); ctx.restore();
}
