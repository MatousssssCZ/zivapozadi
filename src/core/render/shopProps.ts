/**
 * Vektorové rekvizity péče o obchod (A18b–d): dřevěná bedýnka s pečivem, plechový kbelík s drtí,
 * oboustranná cedule na dveřích a zrnka posypu. Rozměry v metrech, převod přes `k` (px nebo jednotek
 * postavy na metr) – stejná kresba v ruce i na zemi.
 */
import type { Grit } from '../sim/bakery';
type Ctx = CanvasRenderingContext2D;

/** Bedýnka 0,5 × 0,26 m (pohled mírně shora): x = střed, yb = spodní hrana přední stěny. */
export function drawCrate(ctx: Ctx, x: number, yb: number, k: number) {
  const W = 0.5 * k, H = 0.22 * k, D = 0.12 * k; // šířka, výška, hloubka (horní plocha v perspektivě)
  ctx.save();
  // horní otvor (vnitřek) s pečivem
  ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.moveTo(x - W / 2, yb - H); ctx.lineTo(x - W / 2 + D * 0.6, yb - H - D); ctx.lineTo(x + W / 2 + D * 0.6, yb - H - D); ctx.lineTo(x + W / 2, yb - H); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 4; i++) { // bochníky a rohlíky (zlatavé ovály)
    const bx = x - W * 0.32 + i * W * 0.21 + D * 0.3, by = yb - H - D * 0.45;
    const g = ctx.createRadialGradient(bx - W * 0.03, by - D * 0.2, 1, bx, by, W * 0.11); g.addColorStop(0, '#f2c777'); g.addColorStop(1, '#b06a2a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, W * 0.1, D * 0.42, -0.15, 0, Math.PI * 2); ctx.fill();
  }
  // přední stěna: tři prkna s mezerami
  for (let i = 0; i < 3; i++) {
    const y0 = yb - H + i * (H / 3), g = ctx.createLinearGradient(x - W / 2, 0, x + W / 2, 0); g.addColorStop(0, '#c99a62'); g.addColorStop(1, '#a8764a');
    ctx.fillStyle = g; ctx.fillRect(x - W / 2, y0 + H * 0.02, W, H / 3 - H * 0.05);
  }
  // boční stěna (perspektiva)
  ctx.fillStyle = '#8f6038'; ctx.beginPath(); ctx.moveTo(x + W / 2, yb); ctx.lineTo(x + W / 2 + D * 0.6, yb - D); ctx.lineTo(x + W / 2 + D * 0.6, yb - H - D); ctx.lineTo(x + W / 2, yb - H); ctx.closePath(); ctx.fill();
  // madla (výřezy)
  ctx.fillStyle = '#3c2614'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(x + s * W * 0.36 - W * 0.06, yb - H * 0.82, W * 0.12, H * 0.16, H * 0.08); ctx.fill(); }
  ctx.restore();
}
/** Kbelík (Ø 0,2 m, výška 0,2 m) zavěšený / držený: x = střed, yt = horní okraj. */
export function drawBucket(ctx: Ctx, x: number, yt: number, k: number, full: number) {
  const R = 0.1 * k, H = 0.2 * k, e = R * 0.35;
  ctx.save();
  const g = ctx.createLinearGradient(x - R, 0, x + R, 0); g.addColorStop(0, '#8d97a3'); g.addColorStop(0.45, '#d5dbe2'); g.addColorStop(1, '#6f7884');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - R, yt); ctx.lineTo(x - R * 0.82, yt + H); ctx.ellipse(x, yt + H, R * 0.82, e * 0.8, 0, Math.PI, 0, true); ctx.lineTo(x + R, yt); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4f5660'; ctx.beginPath(); ctx.ellipse(x, yt, R, e, 0, 0, Math.PI * 2); ctx.fill();
  if (full > 0) { ctx.fillStyle = '#b9aa94'; ctx.beginPath(); ctx.ellipse(x, yt + e * 0.25, R * 0.9, e * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#59616b'; ctx.lineWidth = Math.max(0.4, 0.008 * k); ctx.beginPath(); ctx.ellipse(x, yt - R * 0.3, R * 0.95, R * 0.75, 0, Math.PI, 0); ctx.stroke(); // ucho
  ctx.restore();
}
/**
 * Cedule na dveřích (oboustranná): `flip` 0..1 = průběh otočení kolem svislé osy závěsu (šířka |cos|,
 * strana se přepne v hraně, text nikdy zrcadlově), `sway` = doznívání na šňůrce (rad).
 */
export function drawSign(ctx: Ctx, x: number, y: number, w: number, side: 'open' | 'away', flip: number | null, sway: number) {
  const h = w * 0.5, sx = flip === null ? 1 : Math.max(0.04, Math.abs(Math.cos(flip * Math.PI)));
  ctx.save(); ctx.translate(x, y - h * 0.9); ctx.rotate(sway);
  ctx.strokeStyle = 'rgba(60,40,25,0.9)'; ctx.lineWidth = Math.max(0.5, w * 0.025);
  ctx.beginPath(); ctx.moveTo(-w * 0.32 * sx, h * 0.55); ctx.lineTo(0, 0); ctx.lineTo(w * 0.32 * sx, h * 0.55); ctx.stroke(); // šňůrka z háčku
  ctx.translate(0, h * 0.55); ctx.scale(sx, 1);
  ctx.fillStyle = side === 'open' ? '#f3ead6' : '#e7d3b0'; ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = Math.max(0.5, w * 0.04);
  ctx.beginPath(); ctx.roundRect(-w / 2, 0, w, h, h * 0.12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = side === 'open' ? '#2f6b3a' : '#9a3b2e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (side === 'open') { ctx.font = `bold ${(h * 0.42).toFixed(1)}px sans-serif`; ctx.fillText('OTEVŘENO', 0, h * 0.52, w * 0.9); }
  else { ctx.font = `bold ${(h * 0.3).toFixed(1)}px sans-serif`; ctx.fillText('HNED', 0, h * 0.32, w * 0.9); ctx.fillText('JSEM ZPĚT', 0, h * 0.7, w * 0.9); }
  ctx.restore();
}
/** Zrnka posypu: let z ruky (balistika), po dopadu leží a pozvolna zapadají sněhem. */
export function drawGrit(ctx: Ctx, grit: Grit[], t: number, life: number) {
  ctx.save();
  for (const g of grit) {
    const a = t - g.t0; if (a < 0) continue;
    // výška v px: h(t) = h0 + vh·t − ½·g·ppm·t² (h0 je výška ruky 1 m, tedy právě ppm)
    const tt = Math.min(a, g.T), ppm = g.h0, hp = Math.max(0, g.h0 + g.vh * tt - 0.5 * 9.81 * ppm * tt * tt);
    const x = g.x0 + g.vx * tt, y = g.y0 + g.vy * tt - hp;
    const fade = a < g.T ? 1 : Math.max(0, 1 - (a - g.T) / life);
    ctx.fillStyle = `rgba(118,98,80,${(0.8 * fade).toFixed(3)})`;
    ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
  }
  ctx.restore();
}

/**
 * Otisk sněhového anděla (A07) na zemi: tělo + hlava, „křídla“ (výseče od ramen podle skutečného
 * rozsahu tahů) a „sukně“ z roznožení. Měkké okraje, pozvolna zapadá (k = 1 → 0).
 */
export function drawAngelImprint(ctx: Ctx, P: (a: number, b: number) => { x: number; y: number }, arms: number, legs: number, k: number, getup: boolean) {
  if (k <= 0) return;
  const shape = (pts: { x: number; y: number }[]) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
  const fill = `rgba(120,135,190,${(0.42 * k).toFixed(3)})`, rim = `rgba(255,255,255,${(0.65 * k).toFixed(3)})`;
  ctx.save();
  const parts: { x: number; y: number }[][] = [];
  // křídla: od paže u boku (míří k nohám) přes rozpažení k nadhlavě, poloměr = délka paže
  for (const s of [-1, 1]) {
    const pts = [P(0.6, s * 0.1)], a0 = Math.PI * 0.95, a1 = a0 - Math.PI * 0.85 * Math.min(1, arms);
    for (let i = 0; i <= 12; i++) { const q = a0 + (a1 - a0) * (i / 12); pts.push(P(0.6 + Math.cos(q) * 0.48, s * (0.12 + Math.sin(q) * 0.48))); }
    parts.push(pts);
  }
  // nohy: výseč od pánve k chodidlům podle roznožení
  { const sp = 0.1 + 0.3 * Math.min(1, legs); parts.push([P(0.2, -0.14), P(-0.32, -sp - 0.06), P(-0.38, 0), P(-0.32, sp + 0.06), P(0.2, 0.14)]); }
  // tělo a hlava
  { const pts = []; for (let i = 0; i < 16; i++) { const q = (i / 16) * Math.PI * 2; pts.push(P(0.35 + Math.cos(q) * 0.42, Math.sin(q) * 0.16)); } parts.push(pts); }
  { const pts = []; for (let i = 0; i < 12; i++) { const q = (i / 12) * Math.PI * 2; pts.push(P(0.92 + Math.cos(q) * 0.11, Math.sin(q) * 0.1)); } parts.push(pts); }
  ctx.fillStyle = fill; for (const p of parts) { shape(p); ctx.fill(); }
  ctx.strokeStyle = rim; ctx.lineWidth = 1; for (const p of parts) { shape(p); ctx.stroke(); }
  if (getup) { ctx.fillStyle = `rgba(130,145,190,${(0.3 * k).toFixed(3)})`; for (const [a, b] of [[0.05, -0.32], [-0.1, 0.05], [-0.05, -0.08]]) { const c = P(a, b); ctx.beginPath(); ctx.ellipse(c.x, c.y, 2.2, 1.2, 0, 0, 7); ctx.fill(); } } // ruka a boty při vstávání
  ctx.restore();
}
