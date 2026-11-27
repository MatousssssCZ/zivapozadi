/**
 * Stylizovaný 3D traktor s radlicí (low-poly), promítaný kamerou scény – správná perspektiva v každé
 * poloze na silnici. Model: x vpřed, z doleva (od řidiče), h nahoru (m), počátek = střed mezi nápravami
 * na zemi. Plochy se ořežou podle odvrácení od kamery a seřadí od nejvzdálenější (malířův algoritmus);
 * barvy jsou tlumené (zašlá červená kapota, zelenošedé blatníky), osvětlení z boku od západu slunce.
 * Kola se otáčejí podle ujeté dráhy (ne podle času), karoserie lehce vibruje motorem.
 */
import type { Camera, World } from '../scene/camera';
import { toScreen } from '../scene/camera';
import type { Vec2 } from '../math/vec';

type Ctx = CanvasRenderingContext2D;
type V3 = [number, number, number]; // x, z, h (model)
interface Face { pts: V3[]; color: string; alpha?: number; /** střed tělesa – normála míří od něj ven */ o?: V3; post?: (P: (v: V3) => Vec2) => void; noCull?: boolean; stroke?: boolean }

const RED = '#a8473b', RED_D = '#7e3129', GREEN = '#5f6f52', DARK = '#2b2a2c', STEEL = '#8d8f93', PLOW = '#c98d2e', GLASS = '#8fa4b8', SNOW = '#f4ecef';

function box(x0: number, x1: number, z0: number, z1: number, h0: number, h1: number, color: string, top = color, extra: Partial<Face> = {}): Face[] {
  const v = (x: number, z: number, h: number): V3 => [x, z, h], o: V3 = [(x0 + x1) / 2, (z0 + z1) / 2, (h0 + h1) / 2];
  return ([
    { pts: [v(x0, z0, h1), v(x1, z0, h1), v(x1, z1, h1), v(x0, z1, h1)], color: top, ...extra }, // vršek
    { pts: [v(x0, z0, h0), v(x0, z1, h0), v(x1, z1, h0), v(x1, z0, h0)], color, ...extra }, // spodek
    { pts: [v(x1, z0, h0), v(x1, z1, h0), v(x1, z1, h1), v(x1, z0, h1)], color, ...extra }, // předek
    { pts: [v(x0, z0, h0), v(x0, z0, h1), v(x0, z1, h1), v(x0, z1, h0)], color, ...extra }, // zadek
    { pts: [v(x0, z1, h0), v(x0, z1, h1), v(x1, z1, h1), v(x1, z1, h0)], color, ...extra }, // levý bok
    { pts: [v(x0, z0, h0), v(x1, z0, h0), v(x1, z0, h1), v(x0, z0, h1)], color, ...extra }, // pravý bok
  ] as Face[]).map((f) => ({ ...f, o }));
}
/** kolo: běhoun (pásy), vnější a vnitřní bok s ráfkem; dezén a šrouby se otáčejí s úhlem rot */
function wheel(cx: number, cz: number, r: number, w: number, rot: number): Face[] {
  const N = 14, out: Face[] = [], z0 = cz - w / 2, z1 = cz + w / 2;
  const ring = (z: number, rr: number) => Array.from({ length: N }, (_, i) => { const a = rot + (i / N) * Math.PI * 2; return [cx + Math.cos(a) * rr, z, r + Math.sin(a) * rr] as V3; });
  const A = ring(z0, r), B = ring(z1, r);
  const o: V3 = [cx, cz, r];
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; out.push({ pts: [A[i], A[j], B[j], B[i]], color: i % 2 ? '#262527' : '#323133', o }); }
  out.push({ pts: B, color: '#2d2c2e', o }, { pts: [...A].reverse(), color: '#2d2c2e', o });
  return out;
}

/**
 * Nakreslí traktor. P = střed na zemi (svět), hd = směr jízdy (rad, svět), dist = ujetá dráha (m),
 * t = čas (maják, vibrace), ppm = px na metr v místě traktoru.
 */
export function drawTractor(ctx: Ctx, cam: Camera, P: World, hd: number, dist: number, t: number, ppm: number) {
  // model v měřítku postav (kamera scény a měřítko postav se liší) – traktor odpovídá lidem kolem
  const camPpm = toScreen(cam, P).y - toScreen(cam, P, 1).y, kS = Math.max(0.5, Math.min(1.5, ppm / Math.max(1e-6, camPpm)));
  const c = Math.cos(hd) * kS, s = Math.sin(hd) * kS;
  const vib = 0.008 * Math.sin(t * 38) + 0.005 * Math.sin(dist * 9.1);
  const proj = (v: V3, body = true): Vec2 => toScreen(cam, { X: P.X + v[0] * c - v[1] * s, Z: P.Z + v[0] * s + v[1] * c }, (v[2] + (body ? vib : 0)) * kS);
  const world = (v: V3) => ({ X: P.X + v[0] * c - v[1] * s, Z: P.Z + v[0] * s + v[1] * c, H: v[2] * kS });
  // stín pod traktorem
  const sh = [[-1.6, -1.1], [2.6, -1.45], [2.7, 1.45], [-1.6, 1.1]].map(([x, z]) => proj([x, z, 0], false));
  ctx.save(); ctx.fillStyle = 'rgba(60,50,80,0.28)'; ctx.filter = `blur(${Math.max(1, 0.12 * ppm).toFixed(1)}px)`;
  ctx.beginPath(); sh.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.restore();

  const rotR = -dist / 0.72, rotF = -dist / 0.45;
  const faces: Face[] = [
    // kola: zadní velká, přední malá
    ...wheel(-0.75, 0.86, 0.72, 0.42, rotR), ...wheel(-0.75, -0.86, 0.72, 0.42, rotR),
    ...wheel(1.25, 0.7, 0.45, 0.28, rotF), ...wheel(1.25, -0.7, 0.45, 0.28, rotF),
    // podvozek a kapota (zašlá červená), maska
    ...box(-0.6, 1.75, -0.42, 0.42, 0.5, 1.22, RED, '#b85547'),
    ...box(1.75, 1.85, -0.38, 0.38, 0.58, 1.15, '#3a3537'),
    // blatníky nad zadními koly (zelenošedé) se sněhem
    ...box(-1.45, -0.05, 0.62, 1.1, 1.38, 1.46, GREEN, SNOW), ...box(-1.45, -0.05, -1.1, -0.62, 1.38, 1.46, GREEN, SNOW),
    // kabina: sloupky, prosklení, střecha se sněhem
    ...box(-1.3, -0.15, -0.72, 0.72, 1.22, 1.42, RED_D),
    ...box(-1.3, -0.15, -0.72, 0.72, 1.42, 2.4, GLASS, GLASS, { alpha: 0.55 }),
    ...box(-1.38, -0.07, -0.8, 0.8, 2.4, 2.52, RED, SNOW),
    // výfuk
    ...box(1.2, 1.3, 0.22, 0.32, 1.22, 2.05, DARK),
    // ramena radlice a radlice (šikmo: vzdálený konec vpředu → sníh jde k bližší krajnici)
    ...box(1.85, 2.3, 0.25, 0.35, 0.35, 0.45, STEEL), ...box(1.85, 2.3, -0.35, -0.25, 0.35, 0.45, STEEL),
  ];
  const blade = (h0: number, h1: number, d: number): V3[] => [[2.15 + d, -1.38, h0], [2.75 + d, 1.38, h0], [2.75 + d, 1.38, h1], [2.15 + d, -1.38, h1]];
  faces.push({ pts: blade(0.04, 0.9, 0), color: PLOW, noCull: true, stroke: true });
  // řidič (silueta za sklem): trup a hlava
  faces.push(...box(-0.85, -0.55, -0.18, 0.18, 1.45, 1.95, '#3d4a5c'));
  faces.push({ pts: [[-0.7, 0, 2.05], [-0.7, 0, 2.05], [-0.7, 0, 2.05]], color: '#e3b896', noCull: true, post: (Pj) => {
    const hc = Pj([-0.7, 0, 2.08]), r = 0.13 * ppm; ctx.fillStyle = '#d9ae8c'; ctx.beginPath(); ctx.arc(hc.x, hc.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b3b2a'; ctx.beginPath(); ctx.arc(hc.x, hc.y - r * 0.3, r * 1.02, Math.PI, 0); ctx.fill(); // čepice
  } });
  // osvětlení (západ slunce zleva vzadu) a odvrácené plochy
  const cam3 = { X: 0, Z: 0, H: cam.h }, L = { X: -0.55, Z: 0.45, H: 0.7 }, Ln = Math.hypot(L.X, L.Z, L.H);
  const items: { d: number; f: Face; shade: number }[] = [];
  for (const f of faces) {
    const W = f.pts.map(world);
    const ux = W[1].X - W[0].X, uz = W[1].Z - W[0].Z, uh = W[1].H - W[0].H, vx = W[2].X - W[0].X, vz = W[2].Z - W[0].Z, vh = W[2].H - W[0].H;
    // normála (pořadí vrcholů: proti směru hodinových ručiček zvenku)
    let nx = uz * vh - uh * vz, nz = uh * vx - ux * vh, nh = ux * vz - uz * vx;
    const nl = Math.hypot(nx, nz, nh) || 1; nx /= nl; nz /= nl; nh /= nl;
    const C = W.reduce((a, p) => ({ X: a.X + p.X / W.length, Z: a.Z + p.Z / W.length, H: a.H + p.H / W.length }), { X: 0, Z: 0, H: 0 });
    if (f.o) { const O = world(f.o); if (nx * (C.X - O.X) + nz * (C.Z - O.Z) + nh * (C.H - O.H) < 0) { nx = -nx; nz = -nz; nh = -nh; } }
    const toCam = { X: cam3.X - C.X, Z: cam3.Z - C.Z, H: cam3.H - C.H };
    const vis = nx * toCam.X + nz * toCam.Z + nh * toCam.H;
    if (vis <= 0 && !f.noCull) continue;
    const lam = Math.abs(nx * L.X + nz * L.Z + nh * L.H) / Ln;
    items.push({ d: Math.hypot(toCam.X, toCam.Z, toCam.H), f, shade: 0.62 + 0.38 * lam });
  }
  items.sort((a, b) => b.d - a.d);
  const lw = Math.max(0.6, 0.02 * ppm);
  for (const { f, shade } of items) {
    const pts = f.pts.map((v) => proj(v));
    ctx.save();
    if (f.alpha !== undefined) ctx.globalAlpha = f.alpha;
    ctx.fillStyle = shadeColor(f.color, shade);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    if (f.stroke !== false && f.pts.length >= 4) { ctx.strokeStyle = 'rgba(40,25,30,0.35)'; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.restore();
    if (f.post) f.post((v) => proj(v));
  }
  // ráfky a šrouby na bližších bocích kol (otáčí se s koly)
  for (const [cx, cz, r, rot] of [[-0.75, -0.86 - 0.21, 0.72, rotR], [1.25, -0.7 - 0.14, 0.45, rotF], [-0.75, 0.86 + 0.21, 0.72, rotR], [1.25, 0.7 + 0.14, 0.45, rotF]] as const) {
    // bok viditelný jen z bližší strany (z < 0 je vpravo od řidiče – ke kameře při jízdě doprava)
    const Wc = world([cx, cz, r]), Wo = world([cx, cz + Math.sign(cz), r]);
    if (Math.hypot(Wo.X, Wo.Z, Wo.H - cam.h) > Math.hypot(Wc.X, Wc.Z, Wc.H - cam.h)) continue;
    const rim = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return proj([cx + Math.cos(a) * r * 0.58, cz, r + Math.sin(a) * r * 0.58]); });
    ctx.fillStyle = '#c9a646'; ctx.beginPath(); rim.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,45,20,0.6)'; ctx.lineWidth = lw; ctx.stroke();
    ctx.fillStyle = '#4a4033';
    for (let i = 0; i < 5; i++) { const a = rot + (i / 5) * Math.PI * 2, q = proj([cx + Math.cos(a) * r * 0.32, cz, r + Math.sin(a) * r * 0.32]); ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.6, 0.035 * ppm), 0, Math.PI * 2); ctx.fill(); }
    // dezén na obvodu (výstupky) – je vidět otáčení
    ctx.strokeStyle = '#1c1b1d'; ctx.lineWidth = Math.max(0.8, 0.05 * ppm);
    for (let i = 0; i < 10; i++) { const a = rot + (i / 10) * Math.PI * 2, p0 = proj([cx + Math.cos(a) * r * 0.86, cz, r + Math.sin(a) * r * 0.86]), p1 = proj([cx + Math.cos(a) * r, cz, r + Math.sin(a) * r]); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
  }
  // sníh hrnutý před radlicí (val podél čepele)
  const mound: Vec2[] = [];
  for (let i = 0; i <= 10; i++) { const f = i / 10, x = 2.2 + 0.6 * f, z = -1.38 + 2.76 * f; mound.push(proj([x + 0.05, z, 0.2 + 0.08 * Math.sin(f * Math.PI) + 0.025 * Math.sin(dist * 3.1 + i * 1.7)], false)); }
  for (let i = 10; i >= 0; i--) { const f = i / 10, x = 2.2 + 0.6 * f, z = -1.38 + 2.76 * f; mound.push(proj([x + 0.45 - 0.2 * f, z, 0], false)); }
  ctx.fillStyle = '#efe3ea'; ctx.beginPath(); mound.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
  // oranžový maják na střeše (otáčivý záblesk)
  const bc = proj([-0.72, 0, 2.62]), ph = (t * 1.6) % 1, on = 0.45 + 0.55 * Math.max(0, Math.cos(ph * Math.PI * 2));
  ctx.fillStyle = '#d9731f'; ctx.beginPath(); ctx.ellipse(bc.x, bc.y, 0.09 * ppm, 0.11 * ppm, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, 0.7 * ppm);
  g.addColorStop(0, `rgba(255,170,60,${(0.75 * on).toFixed(3)})`); g.addColorStop(1, 'rgba(255,150,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bc.x, bc.y, 0.7 * ppm, 0, Math.PI * 2); ctx.fill();
}

const shadeCache = new Map<string, string>();
function shadeColor(hex: string, k: number): string {
  const q = Math.round(k * 20) / 20, key = hex + q;
  let s = shadeCache.get(key);
  if (!s) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    // stín do studené fialové (večerní světlo), světlo do teplé růžové
    const f = (v: number, cool: number, warm: number) => Math.round(Math.max(0, Math.min(255, q < 0.8 ? v * q + cool * (1 - q) * 0.25 : v * q + (warm - v) * (q - 0.8) * 0.4)));
    s = `rgb(${f(r, 70, 255)},${f(g, 60, 205)},${f(b, 110, 200)})`;
    shadeCache.set(key, s);
  }
  return s;
}

/** Odhrnutý pás a val na bližší krajnici (zem, kreslí se pod postavami). */
export function drawPlowedBand(ctx: Ctx, cam: Camera, at: (s: number) => { P: World; hd: number }, bin: number, cleared: number[], berm: number[], halfW: number) {
  const q = (s: number, off: number, h = 0) => { const { P, hd } = at(s); return toScreen(cam, { X: P.X - Math.sin(hd) * off, Z: P.Z + Math.cos(hd) * off }, h); }; // off < 0 → blíž ke kameře
  // úseky se stejnou (zaokrouhlenou) hodnotou se kreslí jedním mnohoúhelníkem – žádné švy
  const runs = (vals: number[], min: number, fn: (s0: number, s1: number, v: number) => void) => {
    let i = 0;
    while (i < vals.length - 1) {
      const v = Math.round(vals[i] * 24) / 24; if (v < min) { i++; continue; }
      let j = i + 1; while (j < vals.length - 1 && Math.round(vals[j] * 24) / 24 === v) j++;
      fn(i * bin, j * bin, v); i = j;
    }
  };
  const strip = (s0: number, s1: number, o0: number, o1: number, h0 = 0, h1 = 0, lumpy = 0) => {
    const n = Math.max(1, Math.ceil((s1 - s0) / 0.25)), A: Vec2[] = [], B: Vec2[] = [];
    for (let k = 0; k <= n; k++) { const ss = s0 + ((s1 - s0) * k) / n, lu = lumpy ? lumpy * (0.6 + 0.4 * Math.sin(ss * 2.3) * Math.sin(ss * 0.9 + 1)) : 0; A.push(q(ss, o0, h0)); B.push(q(ss, o1, h1 + lu)); }
    ctx.beginPath(); A.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); for (let k = B.length - 1; k >= 0; k--) ctx.lineTo(B[k].x, B[k].y); ctx.closePath(); ctx.fill();
  };
  runs(cleared, 0.02, (s0, s1, c) => {
    // odhrnutý povrch: tmavší utužený sníh s kolejemi (průhledně přes malovanou silnici)
    ctx.fillStyle = `rgba(112,92,114,${(0.34 * c).toFixed(3)})`; strip(s0, s1, -halfW, halfW);
    ctx.fillStyle = `rgba(95,78,98,${(0.18 * c).toFixed(3)})`; for (const off of [-0.75, 0.75]) strip(s0, s1, off - 0.2, off + 0.2);
  });
  // val na bližší krajnici (sníh z radlice): nepravidelné hroudy podél okraje pásu, stín dole, světlo nahoře
  for (let i = 0; i < berm.length - 1; i++) {
    const bm = berm[i]; if (bm < 0.03) continue;
    for (let k = 0; k < 3; k++) {
      const ss = (i + k / 3 + 0.17) * bin, n1 = Math.sin(ss * 12.9898) * 43758.5453, rnd = n1 - Math.floor(n1);
      const r = (0.13 + 0.15 * rnd) * (0.5 + 0.5 * bm), off = -halfW - 0.1 - 0.25 * rnd;
      const g = q(ss, off), top = q(ss, off, r * 0.9), side = q(ss + r, off), rx = Math.max(1, Math.abs(side.x - g.x)), ry = Math.max(0.8, (g.y - top.y));
      ctx.fillStyle = `rgba(150,135,175,${(0.35 * bm).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(g.x, g.y - ry * 0.35, rx * 1.1, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(238,224,233,${(0.9 * Math.min(1, bm * 1.2)).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(g.x, g.y - ry * 0.55, rx, ry * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,246,248,${(0.6 * bm).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(g.x - rx * 0.2, g.y - ry * 0.8, rx * 0.55, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}
