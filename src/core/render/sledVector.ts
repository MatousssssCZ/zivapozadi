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
export function sledRingScreen(cam: Camera, S: World, hd: number, kind: SledKind, H0 = 0, pitch0 = 0): Vec2 {
  return projector(cam, S, hd, H0, pitch0)(L / 2 - (kind === 'boby' ? 0.0 : 0.04), 0, kind === 'boby' ? 0.2 : 0.2);
}
/** výška sedáku (m) – kde sedí jezdec */
export const SEAT_H = { sane: 0.18, boby: 0.06 } as const;

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
export function drawVectorSled(ctx: Ctx, cam: Camera, S: World, hd: number, kind: SledKind, dist: number, ppm: number, color = '#b8322f', H0 = 0, pitch0 = 0) {
  const bump = 0.006 * Math.sin(dist * 7.3) + 0.004 * Math.sin(dist * 13.1 + 1.3), pitch = 0.012 * Math.cos(dist * 7.3) + pitch0;
  const P = projector(cam, S, hd, H0 + Math.max(0, bump), pitch);
  // stín na sněhu (měkký, pod celými saněmi)
  const g0 = projector(cam, S, hd, H0, pitch0), sh = [g0(-L / 2, -Wd / 2, 0), g0(L / 2, -Wd / 2, 0), g0(L / 2, Wd / 2, 0), g0(-L / 2, Wd / 2, 0)];
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
    // boby (podle předloh): nízká plochá vana s mělkým lemem (~5 cm), příď plynule zahnutá nahoru jako
    // lyžina (jen tenký okraj, žádná vysoká stěna), vzadu úzká opěrka se sedákem, madla v lemu, provázek.
    // Kreslí se po plochách (ne obrysem), aby boky nesplynuly s přídí v „loď":
    // vzdálená stěna zevnitř → podlaha → sedák a opěrka → bližší bok zvenku → lem.
    const NX = 28, x0 = -L * 0.47, x1 = L * 0.5, xs = Array.from({ length: NX + 1 }, (_, i) => x0 + (i / NX) * (x1 - x0));
    const U = (x: number) => (x - x0) / (x1 - x0);
    const halfW = (x: number) => { const u = U(x); const rear = u < 0.08 ? Math.sqrt(Math.max(0, u / 0.08)) * 0.25 + 0.75 : 1; const front = u > 0.62 ? 1 - 0.62 * ((u - 0.62) / 0.38) ** 1.8 : 1; return Wd * 0.5 * rear * front; };
    const floorH = (x: number) => { const u = U(x); return 0.012 + (u > 0.7 ? 0.17 * ((u - 0.7) / 0.3) ** 2.2 : 0); };
    const wallH = (x: number) => { const u = U(x); return 0.05 * (u > 0.8 ? 1 - 0.6 * (u - 0.8) / 0.2 : 1); };
    const rim = (x: number, sg: number) => P(x, sg * halfW(x), floorH(x) + wallH(x));
    const bot = (x: number, sg: number) => P(x, sg * halfW(x) * 0.93, floorH(x) - 0.005);
    const nsg = nearZ > 0 ? 1 : -1, fsg = -nsg;
    // vzdálená stěna zevnitř
    ctx.fillStyle = shadeHex(color, 0.8); ctx.beginPath(); xs.forEach((x, i) => { const p = rim(x, fsg); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); [...xs].reverse().forEach((x) => { const p = P(x, fsg * halfW(x) * 0.88, floorH(x) + 0.008); ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.fill();
    // podlaha (prohlubeň) s podélnými žlábky
    ctx.fillStyle = shadeHex(color, 0.9); ctx.beginPath(); xs.forEach((x, i) => { const p = P(x, -halfW(x) * 0.88, floorH(x) + 0.008); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); [...xs].reverse().forEach((x) => { const p = P(x, halfW(x) * 0.88, floorH(x) + 0.008); ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shadeHex(color, 0.74); ctx.lineWidth = lw(0.006);
    for (const z of [-0.09, 0.09]) { ctx.beginPath(); xs.filter((x) => U(x) > 0.25 && U(x) < 0.85).forEach((x, i) => { const p = P(x, z, floorH(x) + 0.01); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke(); }
    // sedák (podložka) a úzká opěrka vzadu uprostřed
    const sx0 = x0 + L * 0.06, sx1 = x0 + L * 0.34, sw = Wd * 0.26;
    ctx.fillStyle = color === '#c8302c' ? '#2b2c31' : '#e2a23c';
    poly(ctx, [P(sx0, -sw, 0.03), P(sx1, -sw * 0.9, 0.025), P(sx1, sw * 0.9, 0.025), P(sx0, sw, 0.03)]); ctx.fill();
    // opěrka: plná deska skloněná dozadu (horní hrana zaoblená), napojená na zadní lem
    const br: Vec2[] = []; for (let i = 0; i <= 12; i++) { const q = (i / 12) * Math.PI; br.push(P(x0 + L * 0.01, -Math.cos(q) * Wd * 0.3, 0.06 + Math.sin(q) * 0.13)); }
    for (let i = 12; i >= 0; i--) { const q = (i / 12) * Math.PI; br.push(P(x0 + L * 0.13, -Math.cos(q) * Wd * 0.36, 0.035 + Math.sin(q) * 0.015)); }
    const gb = ctx.createLinearGradient(br[6].x, br[6].y, br[19].x, br[19].y); gb.addColorStop(0, shadeHex(color, 1.12)); gb.addColorStop(1, shadeHex(color, 0.82));
    ctx.fillStyle = gb; poly(ctx, br); ctx.fill();
    ctx.strokeStyle = shadeHex(color, 1.3); ctx.lineWidth = lw(0.01); ctx.beginPath(); br.slice(0, 13).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    // bližší bok zvenku (nízký pás) + konce
    const g2 = ctx.createLinearGradient(0, rim(0, nsg).y, 0, bot(0, nsg).y); g2.addColorStop(0, shadeHex(color, 1.05)); g2.addColorStop(1, shadeHex(color, 0.66));
    ctx.fillStyle = g2; ctx.beginPath(); xs.forEach((x, i) => { const p = rim(x, nsg); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); [...xs].reverse().forEach((x) => { const p = bot(x, nsg); ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.fill();
    // zadní čelo (zaoblené)
    ctx.fillStyle = shadeHex(color, 0.78); poly(ctx, [rim(xs[0], -1), rim(xs[0], 1), bot(xs[0], 1), bot(xs[0], -1)]); ctx.fill();
    // lem s odleskem (obě strany + špička přídě)
    ctx.strokeStyle = shadeHex(color, 1.32); ctx.lineWidth = lw(0.012); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); xs.forEach((x, i) => { const p = rim(x, -1); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); [...xs].reverse().forEach((x) => { const p = rim(x, 1); ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.stroke();
    // madla vylisovaná v lemu
    ctx.strokeStyle = '#232428'; ctx.lineWidth = lw(0.02);
    for (const sg of [-1, 1]) { const a2 = rim(x0 + L * 0.42, sg), b2 = rim(x0 + L * 0.6, sg); ctx.beginPath(); ctx.moveTo(a2.x, a2.y - 0.5); ctx.lineTo(b2.x, b2.y - 0.5); ctx.stroke(); }
    // provázek s úchytem na přídi
    const nose = P(x1, 0, floorH(x1) + wallH(x1)), loop = P(x1 + L * 0.08, 0, 0.1);
    ctx.strokeStyle = '#3a3b40'; ctx.lineWidth = lw(0.008); ctx.beginPath(); ctx.moveTo(nose.x, nose.y); ctx.quadraticCurveTo(loop.x, loop.y + lw(0.04), loop.x, loop.y); ctx.stroke();
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
