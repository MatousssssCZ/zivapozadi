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
interface Face { pts: V3[]; color: string; alpha?: number; /** posun řazení (m, kladné = dál) */ bias?: number; /** střed tělesa – normála míří od něj ven */ o?: V3; post?: (P: (v: V3) => Vec2) => void; noCull?: boolean; stroke?: boolean }

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
export function drawTractor(ctx: Ctx, cam: Camera, P: World, hd: number, dist: number, t: number, ppm: number, drawDriver?: () => void, bladeW = 2.6) {
  const bk = Math.max(0.3, bladeW / 2.6); // šířka čepele podle nastavení (odhrnutý pás má stejnou šířku)
  // model v měřítku postav (kamera scény a měřítko postav se liší) – traktor odpovídá lidem kolem
  ctxRef = ctx;
  const kS = tractorScale(cam, P, ppm);
  const c = Math.cos(hd) * kS, s = Math.sin(hd) * kS;
  const vib = 0.008 * Math.sin(t * 38) + 0.005 * Math.sin(dist * 9.1);
  const proj = (v: V3, body = true): Vec2 => toScreen(cam, { X: P.X + v[0] * c - v[1] * s, Z: P.Z + v[0] * s + v[1] * c }, (v[2] + (body ? vib : 0)) * kS);
  const world = (v: V3) => ({ X: P.X + v[0] * c - v[1] * s, Z: P.Z + v[0] * s + v[1] * c, H: v[2] * kS });
  const lw = Math.max(0.6, 0.02 * ppm);
  // stín pod traktorem (měkký, podél podvozku a radlice)
  const sh = [[-1.7, -1.15], [1.9, -1.0], [2.5, -1.5], [3.0, 1.45], [1.9, 1.0], [-1.7, 1.15]].map(([x, z]) => proj([x, z, 0], false));
  ctx.save(); ctx.fillStyle = 'rgba(60,50,80,0.3)'; ctx.filter = `blur(${Math.max(1, 0.14 * ppm).toFixed(1)}px)`;
  ctx.beginPath(); sh.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.restore();

  const rotR = -dist / 0.72, rotF = -dist / 0.45;
  const faces: Face[] = [
    // kola: zadní velká, přední malá
    ...wheel(-0.75, 0.86, 0.72, 0.42, rotR), ...wheel(-0.75, -0.86, 0.72, 0.42, rotR),
    ...wheel(1.3, 0.7, 0.45, 0.28, rotF), ...wheel(1.3, -0.7, 0.45, 0.28, rotF),
    // rám a přední náprava (tmavé)
    ...box(-1.0, 1.95, -0.3, 0.3, 0.38, 0.6, DARK), ...box(1.2, 1.4, -0.62, 0.62, 0.38, 0.5, DARK),
    // kapota: zužuje se dopředu, horní hrana mírně klesá; maska s mřížkou a světly
    ...prism(-0.2, 1.85, [-0.44, 0.44, 0.6, 1.3], [-0.36, 0.36, 0.6, 1.2], RED, '#bd5a4b'),
    { pts: [[1.86, -0.33, 0.66], [1.86, 0.33, 0.66], [1.86, 0.33, 1.14], [1.86, -0.33, 1.14]], color: '#3a3537', o: [1.0, 0, 0.9], post: (Pj) => {
      ctx.strokeStyle = 'rgba(20,16,18,0.8)'; ctx.lineWidth = Math.max(0.5, 0.018 * ppm);
      for (let i = 1; i < 6; i++) { const h = 0.66 + (i / 6) * 0.48, a = Pj([1.87, -0.31, h]), b = Pj([1.87, 0.31, h]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    } },
    // ozdobný pruh po boku kapoty
    ...box(-0.15, 1.8, -0.445, -0.43, 1.0, 1.06, '#e9d9b8'), ...box(-0.15, 1.8, 0.43, 0.445, 1.0, 1.06, '#e9d9b8'),
    // světla na masce
    ...box(1.8, 1.92, -0.42, -0.28, 1.04, 1.14, '#f3e1a6'), ...box(1.8, 1.92, 0.28, 0.42, 1.04, 1.14, '#f3e1a6'),
    // zaoblené blatníky nad zadními koly (zelenošedé, se sněhem navrchu) a nad předními
    ...fender(-0.75, 0.72, 0.86, 0.5, 0.86, 0.2, 2.95, GREEN),
    ...fender(-0.75, 0.72, -0.86, 0.5, 0.86, 0.2, 2.95, GREEN),
    ...fender(1.3, 0.45, 0.7, 0.34, 0.56, 0.55, 2.4, GREEN),
    ...fender(1.3, 0.45, -0.7, 0.34, 0.56, 0.55, 2.4, GREEN),
    // kabina: spodní panel, sloupky, prosklení, střecha s přesahem a sněhem
    ...box(-1.3, -0.15, -0.72, 0.72, 1.18, 1.48, RED_D),
    ...[[-1.3, -0.72], [-1.3, 0.66], [-0.21, -0.72], [-0.21, 0.66]].flatMap(([x, z]) => box(x, x + 0.06, z, z + 0.06, 1.48, 2.72, '#3b3436')),
    glassFace([[-0.18, -0.69, 1.5], [-0.18, 0.69, 1.5], [-0.18, 0.69, 2.7], [-0.18, -0.69, 2.7]], [-0.75, 0, 2.1]),
    glassFace([[-1.27, -0.69, 1.5], [-1.27, -0.69, 2.7], [-1.27, 0.69, 2.7], [-1.27, 0.69, 1.5]], [-0.75, 0, 2.1]),
    glassFace([[-1.27, -0.7, 1.5], [-0.18, -0.7, 1.5], [-0.18, -0.7, 2.7], [-1.27, -0.7, 2.7]], [-0.75, 0, 2.1]),
    glassFace([[-1.27, 0.7, 1.5], [-1.27, 0.7, 2.7], [-0.18, 0.7, 2.7], [-0.18, 0.7, 1.5]], [-0.75, 0, 2.1]),
    ...box(-1.42, -0.04, -0.84, 0.84, 2.72, 2.82, RED, '#b85547'),
    ...box(-1.36, -0.1, -0.78, 0.78, 2.82, 2.89, SNOW),
    // zrcátka na ramenech u předních sloupků
    ...box(-0.2, -0.16, -0.95, -0.72, 2.32, 2.35, DARK), ...box(-0.22, -0.14, -1.02, -0.94, 2.18, 2.38, '#2f3a44'),
    ...box(-0.2, -0.16, 0.72, 0.95, 2.32, 2.35, DARK), ...box(-0.22, -0.14, 0.94, 1.02, 2.18, 2.38, '#2f3a44'),
    // výfuk s krytkou, schůdek ke dveřím, zadní závěs a světla
    ...box(1.15, 1.25, 0.2, 0.3, 1.25, 2.1, DARK), ...box(1.13, 1.27, 0.18, 0.32, 2.1, 2.16, '#141314'),
    ...box(-0.95, -0.5, -0.82, -0.68, 0.62, 0.68, DARK),
    ...box(-1.75, -1.3, -0.1, 0.1, 0.5, 0.62, STEEL), ...box(-1.44, -1.4, -0.84, -0.7, 1.3, 1.4, '#b3261e'), ...box(-1.44, -1.4, 0.7, 0.84, 1.3, 1.4, '#b3261e'),
    // rám radlice (A-rám a ramena)
    ...box(1.85, 2.35, 0.28, 0.38, 0.32, 0.44, STEEL), ...box(1.85, 2.35, -0.38, -0.28, 0.32, 0.44, STEEL), ...box(2.05, 2.15, -0.38, 0.38, 0.4, 0.62, STEEL),
  ];
  // radlice: prohnutá čepel (tři pásy – dole vpřed, nahoře zahnutá dopředu), břit, žebra vzadu, tyče s odrazkami
  const bx = (z: number) => 2.45 + 0.22 * (z / (1.38 * bk)); // šikmo: vzdálený konec (z > 0) vpředu → sníh k bližší krajnici
  const zb = 1.4 * bk, strip = (h0: number, h1: number, d0: number, d1: number, color: string): Face => ({ pts: [[bx(-zb) + d0, -zb, h0], [bx(zb) + d0, zb, h0], [bx(zb) + d1, zb, h1], [bx(-zb) + d1, -zb, h1]], color, noCull: true, stroke: true });
  faces.push(strip(0.04, 0.12, 0.1, 0.09, '#4a4a4e'), strip(0.12, 0.42, 0.09, 0.0, PLOW), strip(0.42, 0.72, 0.0, 0.03, '#d9a338'), strip(0.72, 0.9, 0.03, 0.14, PLOW));
  for (const z of [-0.9 * bk, 0, 0.9 * bk]) faces.push(...box(bx(z) - 0.18, bx(z) - 0.02, z - 0.04, z + 0.04, 0.12, 0.8, '#8a6a24'));
  for (const z of [-1.36 * bk, 1.36 * bk]) faces.push(...box(bx(z) - 0.03, bx(z) + 0.01, z - 0.02, z + 0.02, 0.85, 1.75, '#2a2a2c'), ...box(bx(z) - 0.035, bx(z) + 0.015, z - 0.025, z + 0.025, 1.55, 1.75, '#e0452c'));
  // volant a řidič (kreslí se mezi zadními a předními plochami kabiny)
  faces.push({ pts: [[-0.4, 0, 1.68], [-0.4, 0, 1.68], [-0.4, 0, 1.68]], color: DARK, noCull: true, post: (Pj) => {
    const pts = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return Pj([-0.4 + Math.sin(a) * 0.08, Math.cos(a) * 0.18, 1.68 + Math.sin(a) * 0.12]); });
    ctx.strokeStyle = '#1c1b1d'; ctx.lineWidth = Math.max(0.8, 0.035 * ppm); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
    const a = Pj([-0.28, 0, 1.5]), b = Pj([-0.4, 0, 1.68]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  } });
  if (drawDriver) faces.push({ pts: [[-0.78, -0.05, 1.6], [-0.78, -0.05, 1.6], [-0.78, -0.05, 1.6]], color: DARK, noCull: true, post: () => drawDriver() });
  // osvětlení (západ slunce zleva vzadu) a odvrácené plochy
  const cam3 = { X: 0, Z: 0, H: cam.h }, L = { X: -0.55, Z: 0.45, H: 0.7 }, Ln = Math.hypot(L.X, L.Z, L.H);
  const items: { d: number; f: Face; shade: number }[] = [];
  for (const f of faces) {
    const W = f.pts.map(world);
    const ux = W[1].X - W[0].X, uz = W[1].Z - W[0].Z, uh = W[1].H - W[0].H, vx = W[2].X - W[0].X, vz = W[2].Z - W[0].Z, vh = W[2].H - W[0].H;
    let nx = uz * vh - uh * vz, nz = uh * vx - ux * vh, nh = ux * vz - uz * vx;
    const nl = Math.hypot(nx, nz, nh) || 1; nx /= nl; nz /= nl; nh /= nl;
    const C = W.reduce((a, p) => ({ X: a.X + p.X / W.length, Z: a.Z + p.Z / W.length, H: a.H + p.H / W.length }), { X: 0, Z: 0, H: 0 });
    if (f.o) { const O = world(f.o); if (nx * (C.X - O.X) + nz * (C.Z - O.Z) + nh * (C.H - O.H) < 0) { nx = -nx; nz = -nz; nh = -nh; } }
    const toCam = { X: cam3.X - C.X, Z: cam3.Z - C.Z, H: cam3.H - C.H };
    const vis = nx * toCam.X + nz * toCam.Z + nh * toCam.H;
    if (vis <= 0 && !f.noCull) continue;
    const lam = Math.abs(nx * L.X + nz * L.Z + nh * L.H) / Ln;
    items.push({ d: Math.hypot(toCam.X, toCam.Z, toCam.H) + (f.bias ?? 0) * kS, f, shade: 0.62 + 0.38 * lam });
  }
  items.sort((a, b) => b.d - a.d);
  for (const { f, shade } of items) {
    if (f.pts.length >= 3 && !(f.pts[0] === f.pts[1] || (f.pts[0][0] === f.pts[1][0] && f.pts[0][1] === f.pts[1][1] && f.pts[0][2] === f.pts[1][2]))) {
      const pts = f.pts.map((v) => proj(v));
      ctx.save();
      if (f.alpha !== undefined) ctx.globalAlpha = f.alpha;
      ctx.fillStyle = shadeColor(f.color, shade);
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
      if (f.stroke === false) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(0.7, 0.012 * ppm); ctx.lineJoin = 'round'; ctx.stroke(); } // zakrýt švy mezi dílky zaoblených ploch
      if (f.stroke !== false && f.pts.length >= 4) { ctx.strokeStyle = f.alpha !== undefined ? 'rgba(40,30,40,0.25)' : 'rgba(40,25,30,0.35)'; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
      ctx.restore();
    }
    if (f.post) f.post((v) => proj(v));
  }
  // ráfky a šrouby na bližších bocích kol (otáčí se s koly)
  for (const [cx, cz, r, rot] of [[-0.75, -0.86 - 0.21, 0.72, rotR], [1.3, -0.7 - 0.14, 0.45, rotF], [-0.75, 0.86 + 0.21, 0.72, rotR], [1.3, 0.7 + 0.14, 0.45, rotF]] as const) {
    const Wc = world([cx, cz, r]), Wo = world([cx, cz + Math.sign(cz), r]);
    if (Math.hypot(Wo.X, Wo.Z, Wo.H - cam.h) > Math.hypot(Wc.X, Wc.Z, Wc.H - cam.h)) continue;
    const rim = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return proj([cx + Math.cos(a) * r * 0.6, cz, r + Math.sin(a) * r * 0.6]); });
    ctx.fillStyle = '#c9a646'; ctx.beginPath(); rim.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,45,20,0.6)'; ctx.lineWidth = lw; ctx.stroke();
    // náboj (tmavší) a světlo na horní části ráfku
    const hub = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return proj([cx + Math.cos(a) * r * 0.2, cz, r + Math.sin(a) * r * 0.2]); });
    ctx.fillStyle = '#8f7630'; ctx.beginPath(); hub.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a4033';
    for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * Math.PI * 2, q = proj([cx + Math.cos(a) * r * 0.36, cz, r + Math.sin(a) * r * 0.36]); ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.6, 0.035 * ppm), 0, Math.PI * 2); ctx.fill(); }
    // dezén na obvodu (šípové výstupky) – je vidět otáčení
    ctx.strokeStyle = '#1c1b1d'; ctx.lineWidth = Math.max(0.8, 0.055 * ppm);
    for (let i = 0; i < 12; i++) { const a = rot + (i / 12) * Math.PI * 2, p0 = proj([cx + Math.cos(a) * r * 0.84, cz, r + Math.sin(a) * r * 0.84]), p1 = proj([cx + Math.cos(a + 0.08) * r * 1.01, cz, r + Math.sin(a + 0.08) * r * 1.01]); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
  }
  // sníh hrnutý před radlicí: hroudy podél čepele (větší u bližšího konce, kam sníh odjíždí), stín dole
  const mk = Math.min(1, dist / 4);
  if (mk > 0.02) for (let i = 0; i < 9; i++) {
    const f = i / 8, z = (-1.3 + 2.6 * f) * bk, n = Math.sin(i * 12.9898 + Math.floor(dist * 2) * 0.37) * 43758.5453, rnd = n - Math.floor(n);
    const rr = (0.12 + 0.1 * (1 - f) + 0.05 * rnd) * mk, g0 = proj([bx(z) + 0.1 + rr, z, 0], false), top = proj([bx(z) + 0.1 + rr, z, rr * 1.4], false), side = proj([bx(z) + 0.1 + rr * 2, z, 0], false);
    const rx = Math.max(1, Math.abs(side.x - g0.x) + 0.04 * ppm), ry = Math.max(1, g0.y - top.y);
    ctx.fillStyle = 'rgba(150,135,175,0.35)'; ctx.beginPath(); ctx.ellipse(g0.x, g0.y - ry * 0.3, rx * 1.1, ry * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#efe3ea'; ctx.beginPath(); ctx.ellipse(g0.x, g0.y - ry * 0.55, rx, ry * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,250,0.7)'; ctx.beginPath(); ctx.ellipse(g0.x - rx * 0.2, g0.y - ry * 0.85, rx * 0.5, ry * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  }
  // kouř z výfuku (jemné obláčky stoupající a slábnoucí; jen kosmetika z času)
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.9 + i / 4) % 1, q = proj([1.2 - ph * 0.9, 0.25 + ph * 0.2, 2.2 + ph * 0.9]), r = (0.08 + ph * 0.28) * ppm;
    ctx.fillStyle = `rgba(120,115,125,${(0.22 * (1 - ph)).toFixed(3)})`; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
  }
  // světla: teplá záře předních světel
  for (const z of [-0.35, 0.35]) { const q = proj([1.93, z, 1.09]), g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 0.35 * ppm); g.addColorStop(0, 'rgba(255,236,180,0.55)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 0.35 * ppm, 0, Math.PI * 2); ctx.fill(); }
  // oranžový maják na střeše (otáčivý záblesk)
  const bc = proj([-0.72, 0, 2.98]), ph = (t * 1.6) % 1, on = 0.45 + 0.55 * Math.max(0, Math.cos(ph * Math.PI * 2));
  ctx.fillStyle = '#2b2a2c'; ctx.beginPath(); ctx.ellipse(bc.x, bc.y + 0.05 * ppm, 0.11 * ppm, 0.04 * ppm, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9731f'; ctx.beginPath(); ctx.ellipse(bc.x, bc.y, 0.09 * ppm, 0.11 * ppm, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,190,0.8)'; ctx.beginPath(); ctx.ellipse(bc.x - 0.03 * ppm, bc.y - 0.03 * ppm, 0.025 * ppm, 0.04 * ppm, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, 0.8 * ppm);
  g.addColorStop(0, `rgba(255,170,60,${(0.75 * on).toFixed(3)})`); g.addColorStop(1, 'rgba(255,150,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bc.x, bc.y, 0.8 * ppm, 0, Math.PI * 2); ctx.fill();
}

/** Měřítko modelu traktoru vůči kameře: aby odpovídal velikosti postav v místě (sdílí simulace i kresba). */
export function tractorScale(cam: Camera, P: World, ppm: number): number {
  const camPpm = toScreen(cam, P).y - toScreen(cam, P, 1).y;
  return Math.max(0.5, Math.min(1.5, ppm / Math.max(1e-6, camPpm)));
}
/** Místo řidiče (model: sedadlo v kabině) – svět a výška nad zemí (m). */
export const DRIVER_SEAT: V3 = [-0.78, -0.05, 0.9];

/** sklo: průhledná plocha s odleskem (úhlopříčný pruh) */
function glassFace(pts: V3[], o: V3): Face {
  return { pts, color: GLASS, alpha: 0.42, o, post: (Pj) => {
    const q = pts.map(Pj); ctx0Highlight(q);
  } };
}
let ctxRef: Ctx | null = null;
function ctx0Highlight(q: Vec2[]) {
  const ctx = ctxRef; if (!ctx) return;
  const a = { x: q[0].x + (q[1].x - q[0].x) * 0.15, y: q[0].y + (q[1].y - q[0].y) * 0.15 }, b = { x: q[0].x + (q[1].x - q[0].x) * 0.35, y: q[0].y + (q[1].y - q[0].y) * 0.35 };
  const a2 = { x: q[3].x + (q[2].x - q[3].x) * 0.35, y: q[3].y + (q[2].y - q[3].y) * 0.35 }, b2 = { x: q[3].x + (q[2].x - q[3].x) * 0.55, y: q[3].y + (q[2].y - q[3].y) * 0.55 };
  ctx.save(); ctx.fillStyle = 'rgba(255,245,250,0.22)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill(); ctx.restore();
}
/** hranol s různým průřezem na začátku a konci (kapota): [z0, z1, h0, h1] */
function prism(x0: number, x1: number, A: [number, number, number, number], B: [number, number, number, number], color: string, top = color): Face[] {
  const a = (z: number, h: number): V3 => [x0, z, h], b = (z: number, h: number): V3 => [x1, z, h], o: V3 = [(x0 + x1) / 2, 0, (A[2] + A[3]) / 2];
  return [
    { pts: [a(A[0], A[3]), b(B[0], B[3]), b(B[1], B[3]), a(A[1], A[3])], color: top, o },
    { pts: [a(A[0], A[2]), a(A[1], A[2]), b(B[1], B[2]), b(B[0], B[2])], color, o },
    { pts: [b(B[0], B[2]), b(B[1], B[2]), b(B[1], B[3]), b(B[0], B[3])], color, o },
    { pts: [a(A[0], A[2]), a(A[0], A[3]), a(A[1], A[3]), a(A[1], A[2])], color, o },
    { pts: [a(A[1], A[2]), a(A[1], A[3]), b(B[1], B[3]), b(B[1], B[2])], color, o },
    { pts: [a(A[0], A[2]), b(B[0], B[2]), b(B[0], B[3]), a(A[0], A[3])], color, o },
  ];
}
/**
 * zaoblený blatník: oblouk nad kolem (střed cx, výška osy r) od úhlu a0 do a1 (24 dílků), průřez klenutý
 * – uprostřed výš, okraje zahnuté dolů (lem) – bez obrysů mezi dílky, takže stínování přechází plynule.
 * Sníh jen na horní části oblouku a jen uprostřed šířky (k okrajům ubývá).
 */
function fender(cx: number, r: number, cz: number, w: number, R: number, a0: number, a1: number, color: string): Face[] {
  const N = 24, M = 5, out: Face[] = [], o: V3 = [cx, cz, r];
  // průřez: u = 0…1 přes šířku; poloměr klenby (střed +4 cm), lem na okrajích zahnutý dolů (−6 cm)
  const prof = (u: number) => { const e = Math.min(u, 1 - u); return 0.04 * Math.sin(Math.PI * u) - (e < 0.12 ? 0.06 * (1 - e / 0.12) ** 2 : 0); };
  const pt = (a: number, u: number): V3 => { const rr = R + prof(u); return [cx + Math.cos(a) * rr, cz - w / 2 + w * u, r + Math.sin(a) * rr]; };
  for (let i = 0; i < N; i++) {
    const A = a0 + ((a1 - a0) * i) / N, B = a0 + ((a1 - a0) * (i + 1)) / N, up = Math.sin((A + B) / 2);
    for (let j = 0; j < M; j++) {
      const u0 = j / M, u1 = (j + 1) / M, mid = Math.abs((u0 + u1) / 2 - 0.5);
      const snow = up > 0.86 && mid < 0.35;
      out.push({ pts: [pt(A, u0), pt(B, u0), pt(B, u1), pt(A, u1)], color: snow ? SNOW : color, o, stroke: false });
    }
  }
  // tenký tmavší lem po vnějším okraji (zaoblený, sleduje oblouk)
  const edgeU = cz > 0 ? 1 : 0;
  for (let i = 0; i < N; i++) {
    const A = a0 + ((a1 - a0) * i) / N, B = a0 + ((a1 - a0) * (i + 1)) / N, p1 = pt(A, edgeU), p2 = pt(B, edgeU);
    out.push({ pts: [p1, p2, [p2[0] - (p2[0] - cx) * 0.06, p2[1], p2[2] - (p2[2] - r) * 0.06], [p1[0] - (p1[0] - cx) * 0.06, p1[1], p1[2] - (p1[2] - r) * 0.06]], color: RED_D, o: [cx, cz - Math.sign(cz || 1) * 0.5, r], stroke: false, noCull: true });
  }
  return out;
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
/**
 * `edgeS` = poloha radlice na ose (m) při jízdě: pás končí přesně u čepele (ne po celých úsecích) a val
 * za ní plynule narůstá; po průjezdu Infinity.
 */
export function drawPlowedBand(ctx: Ctx, cam: Camera, at: (s: number) => { P: World; hd: number }, bin: number, cleared: number[], berm: number[], halfW: number, edgeS = Infinity) {
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
  const band = (s0: number, s1: number, c: number) => {
    // odhrnutý povrch: tmavší utužený sníh s kolejemi (průhledně přes malovanou silnici)
    ctx.fillStyle = `rgba(112,92,114,${(0.34 * c).toFixed(3)})`; strip(s0, s1, -halfW, halfW);
    ctx.fillStyle = `rgba(95,78,98,${(0.18 * c).toFixed(3)})`; for (const off of [-0.75, 0.75]) strip(s0, s1, off - 0.2, off + 0.2);
  };
  runs(cleared, 0.02, (s0, s1, c) => {
    if (s0 >= edgeS) return;
    s1 = Math.min(s1, edgeS);
    // těsně za čepelí přechod (sníh se teprve usazuje) – pás nekončí ostrou hranou
    const f0 = edgeS - 0.7;
    if (s1 <= f0) band(s0, s1, c);
    else { if (s0 < f0) band(s0, f0, c); for (let k = 0; k < 3; k++) { const a = Math.max(s0, f0 + (k * 0.7) / 3), b = Math.min(s1, f0 + ((k + 1) * 0.7) / 3); if (b > a) band(a, b, c * (1 - (k + 0.5) / 4)); } }
  });
  // val na bližší krajnici (sníh z radlice): nepravidelné hroudy podél okraje pásu, stín dole, světlo nahoře
  for (let i = 0; i < berm.length - 1; i++) {
    const bm = berm[i]; if (bm < 0.03) continue;
    for (let k = 0; k < 3; k++) {
      const ss = (i + k / 3 + 0.17) * bin, n1 = Math.sin(ss * 12.9898) * 43758.5453, rnd = n1 - Math.floor(n1);
      if (ss > edgeS - 0.05) continue;
      const grow = Math.min(1, (edgeS - ss) / 1.4); // hrouda za čepelí narůstá, jak sníh odjíždí z radlice
      const r = (0.13 + 0.15 * rnd) * (0.5 + 0.5 * bm) * (0.35 + 0.65 * grow), off = -halfW - 0.1 - 0.25 * rnd;
      const g = q(ss, off), top = q(ss, off, r * 0.9), side = q(ss + r, off), rx = Math.max(1, Math.abs(side.x - g.x)), ry = Math.max(0.8, (g.y - top.y));
      ctx.fillStyle = `rgba(150,135,175,${(0.35 * bm).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(g.x, g.y - ry * 0.35, rx * 1.1, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(238,224,233,${(0.9 * Math.min(1, bm * 1.2)).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(g.x, g.y - ry * 0.55, rx, ry * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,246,248,${(0.6 * bm).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(g.x - rx * 0.2, g.y - ry * 0.8, rx * 0.55, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}
