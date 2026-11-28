/**
 * Komunální shrnovák s posypem (Zasněžená ulice): oranžový nákladní vůz – kabina, rám, korba se solí,
 * rotační sypač vzadu (talíř se otáčí, zrnka nízko za vozem v omezeném pruhu), šikmá radlice vpředu
 * (vzdálený konec vpředu → sníh jde k pravé krajnici), dva oranžové majáky, řidič za sklem.
 * Model x vpřed, z doleva, h nahoru (m); kola se otáčí podle ujeté dráhy.
 */
import type { Camera, World } from '../scene/camera';
import { place, box, wheel, drawFaces, type Face, type V3 } from './lowpoly3d';

type Ctx = CanvasRenderingContext2D;
export const TRUCK = { L: 7.4, zB: 1.25, blade: 4.05, axF: 2.4, axR: [-1.5, -2.6], r: 0.52 } as const;
const OR = '#d9772a', OR_D = '#a9541c', DARK = '#26262b', STEEL = '#8e9198', GLASS = '#3f4e66', SALT = '#c9c1b4', SNOW = '#f0ebf2';

export interface TruckDraw { dist: number; t: number; spreading: boolean; plowing: boolean; lights: boolean }

export function drawTruck(ctx: Ctx, cam: Camera, P: World, hd: number, kS: number, ppm: number, d: TruckDraw) {
  const pl = place(cam, P, hd, kS), zB = TRUCK.zB, rotF = -d.dist / TRUCK.r;
  // stín
  const sh = [[-3.9, -zB - 0.2], [4.3, -1.6], [4.4, 1.6], [-3.9, zB + 0.1]].map(([x, z]) => pl.proj([x, z, 0]));
  ctx.save(); ctx.fillStyle = 'rgba(20,25,50,0.38)'; ctx.filter = `blur(${Math.max(1, 0.15 * ppm).toFixed(1)}px)`;
  ctx.beginPath(); sh.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.restore();
  const F: Face[] = [];
  for (const x of [TRUCK.axF, ...TRUCK.axR]) for (const s of [1, -1]) F.push(...wheel(x, s * (zB - 0.2), TRUCK.r, 0.32, rotF));
  F.push(...box(-3.7, 3.5, -0.55, 0.55, 0.45, 0.75, DARK)); // rám
  F.push(...box(-3.6, 1.6, -zB, zB, 0.85, 2.15, OR, OR_D)); // korba
  F.push(...box(-3.45, 1.45, -zB + 0.12, zB - 0.12, 2.0, 2.25, SALT)); // sůl v korbě (mírně nad okrajem)
  F.push(...box(-3.6, 1.6, -zB - 0.02, zB + 0.02, 1.55, 1.62, '#f2f0e8')); // reflexní pruh
  // kabina se skly (čelní sklo šikmo), střecha se sněhem a majáky
  F.push(...box(1.75, 3.3, -zB, zB, 0.85, 1.85, OR, OR_D));
  F.push({ pts: [[3.3, -zB + 0.05, 1.85], [3.3, zB - 0.05, 1.85], [3.05, zB - 0.05, 2.75], [3.05, -zB + 0.05, 2.75]], color: GLASS, o: [2.5, 0, 2], alpha: 0.85 });
  for (const s of [1, -1]) F.push({ pts: [[1.85, s * zB, 1.85], [3.3, s * zB, 1.85], [3.05, s * zB, 2.75], [1.85, s * zB, 2.75]], color: GLASS, o: [2.5, 0, 2], alpha: 0.8 });
  F.push({ pts: [[1.75, -zB, 1.85], [1.75, -zB, 2.8], [1.75, zB, 2.8], [1.75, zB, 1.85]], color: OR_D, o: [2.5, 0, 2] });
  F.push(...box(1.7, 3.12, -zB - 0.03, zB + 0.03, 2.75, 2.86, OR, SNOW));
  for (const s of [1, -1]) F.push(...box(2.0, 2.2, s * 0.75 - 0.1, s * 0.75 + 0.1, 2.86, 3.02, '#d9731f'));
  // maska, světla, nárazník
  F.push(...box(3.3, 3.42, -zB + 0.1, zB - 0.1, 0.6, 1.5, '#2e2e33'));
  for (const s of [1, -1]) F.push(...box(3.38, 3.45, s * (zB - 0.35) - 0.14, s * (zB - 0.35) + 0.14, 0.95, 1.1, '#f6e8c0'));
  // sypač vzadu (talíř pod korbou) a výsypka
  F.push(...box(-3.95, -3.6, -0.3, 0.3, 0.55, 1.0, STEEL));
  F.push({ pts: Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return [-4.05 + Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0.5] as V3; }), color: '#5d6068', noCull: true, o: [-4.05, 0, 0.8] });
  // radlice: šikmá (vzdálený konec vpředu), oranžová s bílými pruhy, rám
  const bx = (z: number) => TRUCK.blade + 0.38 * (z / 1.5);
  F.push(...box(3.42, 3.9, -0.4, -0.3, 0.45, 0.62, STEEL), ...box(3.42, 3.9, 0.3, 0.4, 0.45, 0.62, STEEL));
  const lift = d.plowing ? 0 : 0.22;
  F.push({ pts: [[bx(-1.55), -1.55, 0.04 + lift], [bx(1.55), 1.55, 0.04 + lift], [bx(1.55) + 0.1, 1.55, 1.05 + lift], [bx(-1.55) + 0.1, -1.55, 1.05 + lift]], color: OR, noCull: true, post: (Pj) => {
    // bílé šikmé pruhy na čepeli
    for (let i = 0; i < 5; i++) { const z0 = -1.4 + i * 0.62, a = Pj([bx(z0), z0, 0.15 + lift]), b = Pj([bx(z0 + 0.3) + 0.08, z0 + 0.3, 0.95 + lift]); ctx.strokeStyle = 'rgba(245,242,235,0.75)'; ctx.lineWidth = Math.max(0.8, 0.045 * ppm); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  } });
  drawFaces(ctx, cam, pl, F, ppm, { X: 0.2, Z: 0.6, H: 0.9 });
  // řidič (silueta za čelním sklem)
  { const hc = pl.proj([2.55, 0.45, 2.45]), r = 0.15 * ppm; ctx.fillStyle = '#2c2a30'; ctx.beginPath(); ctx.arc(hc.x, hc.y, r, 0, Math.PI * 2); ctx.fill(); const b0 = pl.proj([2.55, 0.45, 2.25]); ctx.fillStyle = '#e8772a'; ctx.beginPath(); ctx.ellipse(b0.x, b0.y + r, r * 1.4, r * 1.1, 0, 0, Math.PI * 2); ctx.fill(); }
  // hrnutý sníh před radlicí (hroudy podél čepele, větší u pravého konce)
  if (d.plowing) for (let i = 0; i < 8; i++) {
    const z = -1.45 + (2.9 * i) / 7, rr = 0.14 + 0.12 * (1 - i / 7), g0 = pl.proj([bx(z) + 0.12 + rr, z, 0]), top = pl.proj([bx(z) + 0.12 + rr, z, rr * 1.5]), sd = pl.proj([bx(z) + 0.12 + rr * 2, z, 0]);
    const rx = Math.max(1.5, Math.abs(sd.x - g0.x) + 0.05 * ppm), ry = Math.max(1, g0.y - top.y);
    ctx.fillStyle = '#ece6ef'; ctx.beginPath(); ctx.ellipse(g0.x, g0.y - ry * 0.5, rx, ry * 0.65, 0, 0, Math.PI * 2); ctx.fill();
  }
  // posyp: rotující talíř hází zrnka nízko za vůz v omezeném pruhu (ne bílý gejzír)
  if (d.spreading) {
    for (let i = 0; i < 26; i++) {
      const ph = (d.t * 2.2 + i * 0.137) % 1, ang = -Math.PI + (i % 9 - 4) * 0.16, rr = 0.3 + ph * 1.9;
      const q = pl.proj([-4.05 + Math.cos(ang) * rr, Math.sin(ang) * rr * 0.9, 0.45 * (1 - ph) + 0.03]);
      ctx.fillStyle = `rgba(120,95,80,${(0.75 * (1 - ph)).toFixed(2)})`; ctx.fillRect(q.x, q.y, Math.max(1, 0.03 * ppm), Math.max(1, 0.03 * ppm));
    }
  }
  // majáky (střídavé záblesky) a světla
  for (const [s, ph0] of [[1, 0], [-1, 0.5]] as const) {
    const bc = pl.proj([2.1, s * 0.75, 3.05]), on = Math.max(0, Math.cos(((d.t * 1.7 + ph0) % 1) * Math.PI * 2));
    const g = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, 0.9 * ppm); g.addColorStop(0, `rgba(255,170,60,${(0.7 * on).toFixed(2)})`); g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bc.x, bc.y, 0.9 * ppm, 0, Math.PI * 2); ctx.fill();
  }
  if (d.lights) for (const s of [1, -1]) { const q = pl.proj([3.46, s * (zB - 0.35), 1.02]), g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 0.5 * ppm); g.addColorStop(0, 'rgba(255,240,200,0.6)'); g.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 0.5 * ppm, 0, Math.PI * 2); ctx.fill(); }
}
