/**
 * Vektorový kočárek (A17): 3D model promítnutý kamerou – podvozek, čtyři kola (paprsky otočené o úhel
 * z ujeté dráhy, přední kolečka natočená), korba s odpružením, stříška u madla, deka (uhlazená /
 * shrnutá podle stavu), madlo. Pořadí: vzdálená kola → podvozek → korba → deka → stříška → bližší kola.
 */
import type { Camera, World } from '../scene/camera';
import { toScreen } from '../scene/camera';
import type { Vec2 } from '../math/vec';
import { PRAM, type PramState } from '../sim/pram';

type Ctx = CanvasRenderingContext2D;
const poly = (ctx: Ctx, pts: Vec2[]) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };

export function drawPram(ctx: Ctx, cam: Camera, st: PramState, ppm: number, body = '#3d5a73', blanketCol = '#e8c9a0') {
  const S = st.S!, psi = st.psi ?? 0, c = Math.cos(psi), s = Math.sin(psi);
  const P = (x: number, z: number, h: number): Vec2 => toScreen(cam, { X: S.X + x * c - z * s, Z: S.Z + x * s + z * c } as World, h);
  const lw = (m: number) => Math.max(0.7, m * ppm);
  const half = PRAM.track / 2, nearZ = (Math.cos(psi) * half) < 0 ? half : -half; // blíž = menší Z
  const bob = st.bob;
  // stín
  ctx.save(); ctx.fillStyle = 'rgba(60,70,100,0.2)'; ctx.filter = `blur(${Math.max(0.5, 0.04 * ppm).toFixed(1)}px)`;
  poly(ctx, [P(-0.1, -half, 0), P(PRAM.wheelbase + 0.1, -half, 0), P(PRAM.wheelbase + 0.1, half, 0), P(-0.1, half, 0)]); ctx.fill(); ctx.restore();
  const wheel = (x: number, z: number, r: number, phi: number, steer: number) => {
    const cs = Math.cos(steer), sn = Math.sin(steer);
    const pt = (a: number, rr: number) => { const dx = Math.cos(a) * rr; return P(x + dx * cs, z + dx * sn, r + Math.sin(a) * rr); };
    const rim: Vec2[] = []; for (let i = 0; i < 20; i++) rim.push(pt((i / 20) * Math.PI * 2, r));
    ctx.fillStyle = '#26282d'; poly(ctx, rim); ctx.fill();
    const inner: Vec2[] = []; for (let i = 0; i < 20; i++) inner.push(pt((i / 20) * Math.PI * 2, r * 0.78));
    ctx.fillStyle = '#9aa1ab'; poly(ctx, inner); ctx.fill();
    ctx.strokeStyle = '#5b616b'; ctx.lineWidth = lw(0.008); const hub = pt(0, 0);
    for (let k = 0; k < 8; k++) { const q = pt(-phi + (k / 8) * Math.PI * 2, r * 0.76); ctx.beginPath(); ctx.moveTo(hub.x, hub.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } // paprsky se točí s dráhou
    ctx.fillStyle = '#3a3d44'; ctx.beginPath(); ctx.arc(hub.x, hub.y, lw(0.02), 0, 7); ctx.fill();
  };
  const wheels = (z: number) => {
    const i = z === -half ? 0 : 1;
    wheel(0, z, PRAM.rRear, st.phi[i], 0);
    wheel(PRAM.wheelbase, z, PRAM.rFront, st.phi[2 + i], st.caster[i]);
  };
  wheels(-nearZ);
  // podvozek: trubky od náprav ke korbě a k madlu
  ctx.strokeStyle = '#4a4f57'; ctx.lineWidth = lw(0.022); ctx.lineCap = 'round';
  for (const z of [-half * 0.9, half * 0.9]) {
    const a = P(0, z, PRAM.rRear), b = P(PRAM.wheelbase * 0.55, z * 0.8, 0.42 + bob), f = P(PRAM.wheelbase, z, PRAM.rFront + 0.05), hnd = P(-PRAM.handleAhead + 0.04, z * 0.85, PRAM.handleH);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(f.x, f.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(hnd.x, hnd.y); ctx.stroke();
  }
  // korba (vanička): obvod horní hrany a dno, boky
  const N = 16, top: Vec2[] = [], bot: Vec2[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = PRAM.wheelbase * 0.45 + Math.cos(a) * 0.4, z = Math.sin(a) * 0.22;
    top.push(P(x, z, 0.78 + bob)); bot.push(P(x * 0.96 + 0.01, z * 0.9, 0.45 + bob));
  }
  const all = [...top, ...bot], hull = convex(all);
  const yMin = Math.min(...hull.map((q) => q.y)), yMax = Math.max(...hull.map((q) => q.y));
  const g = ctx.createLinearGradient(0, yMin, 0, yMax); g.addColorStop(0, shade(body, 1.18)); g.addColorStop(1, shade(body, 0.72));
  ctx.fillStyle = g; poly(ctx, hull); ctx.fill();
  ctx.fillStyle = shade(body, 0.55); poly(ctx, top); ctx.fill(); // vnitřek
  // deka: uhlazená = hladká plocha vyplňující korbu; shrnutá = boule a záhyby u nohou
  const bl = st.blanket, dk: Vec2[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = PRAM.wheelbase * 0.45 + Math.cos(a) * 0.36, z = Math.sin(a) * 0.19;
    const fold = (1 - bl) * 0.06 * Math.max(0, Math.cos(a)) * (1 + Math.sin(a * 3)); // shrnutí ke konci nohou
    dk.push(P(x, z, 0.8 + bob + fold));
  }
  ctx.fillStyle = blanketCol; poly(ctx, dk); ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,50,0.35)'; ctx.lineWidth = lw(0.008);
  for (let k = 1; k <= 3; k++) { const a = P(PRAM.wheelbase * 0.45 - 0.25 + k * 0.12, -0.17, 0.81 + bob + (1 - bl) * 0.03), b = P(PRAM.wheelbase * 0.45 - 0.22 + k * 0.12, 0.17, 0.81 + bob + (1 - bl) * 0.04 * k); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } // káro / záhyby
  // stříška nad hlavou dítěte (na straně madla): oblouk
  // stříška: kopule z pásů mezi otevřenou hranou (nad hrudníkem) a zadním okrajem u madla
  const hx0 = PRAM.wheelbase * 0.45 - 0.06, hx1 = PRAM.wheelbase * 0.45 - 0.36, NS = 10;
  const arc = (x: number, r: number, hh: number) => Array.from({ length: NS + 1 }, (_, i) => { const q = (i / NS) * Math.PI; return P(x, Math.cos(q) * r, 0.78 + bob + Math.sin(q) * hh); });
  const A0 = arc(hx0, 0.23, 0.3), A1 = arc(hx1, 0.22, 0.2), Am = arc((hx0 + hx1) / 2, 0.23, 0.28);
  for (let i = 0; i < NS; i++) {
    const k = 0.78 + 0.18 * Math.sin((i / NS) * Math.PI);
    ctx.fillStyle = shade(body, k); poly(ctx, [A1[i], Am[i], Am[i + 1], A1[i + 1]]); ctx.fill();
    ctx.fillStyle = shade(body, k + 0.06); poly(ctx, [Am[i], A0[i], A0[i + 1], Am[i + 1]]); ctx.fill();
  }
  ctx.strokeStyle = shade(body, 0.55); ctx.lineWidth = lw(0.008); ctx.beginPath(); A0.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
  // madlo (pěnová tyč napříč)
  const h0 = P(-PRAM.handleAhead + 0.04, -half * 0.9, PRAM.handleH), h1 = P(-PRAM.handleAhead + 0.04, half * 0.9, PRAM.handleH);
  ctx.strokeStyle = '#1f2125'; ctx.lineWidth = lw(0.035); ctx.beginPath(); ctx.moveTo(h0.x, h0.y); ctx.lineTo(h1.x, h1.y); ctx.stroke();
  // brzda (pedál u zadní nápravy) – červená, když je zatažená
  const br = P(0, nearZ * 0.6, 0.05); ctx.fillStyle = st.brake ? '#b8322f' : '#55595f'; ctx.beginPath(); ctx.arc(br.x, br.y, lw(0.022), 0, 7); ctx.fill();
  wheels(nearZ);
}
function convex(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y), cr = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Vec2[] = [], up: Vec2[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
function shade(hex: string, k: number) { const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
