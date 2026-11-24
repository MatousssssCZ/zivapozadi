/**
 * Zapuštění objektů (stánky, lampy, stolky…) do malovaného náměstí – zadání
 * `docs/zdroje/zadani-zasazeni-stanku.md`, kapitola B (priorita 1: bez nové grafiky).
 *
 *  - jemné zastínění půdorysu (AO) a úzký kontaktní stín podél paty (B.2),
 *  - nepravidelný sněhový lem přes spodní dřevo (B.3),
 *  - světlo luceren: světelná skvrna na sněhu promítnutá kamerou, malá záře, teplé světlo na
 *    postavách, společné mikroblikání (B.4, B.5, B.8),
 *  - sladění barev v lineárním RGB a slabý atmosférický opar (B.6, B.7) – předpočítaná bitmapa.
 *
 * Vše je čistá funkce projektu a času (deterministické); bitmapy se počítají jednou a cachují.
 */
import type { AssetEntry, ObjectIntegration, ObjectLight, ProjectFile, SceneObject } from '../model/types';
import { cameraFor, toScreen, toWorld, type Camera } from '../scene/camera';
import { hashNoise } from '../math/rng';
import { getCanvasFactory } from './rigRenderer';
import type { Vec2 } from '../math/vec';

type Ctx = CanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };

/** Výchozí hodnoty (zadání B.10, „předvolba“) – pro nový objekt v editoru i demo. */
export function defaultIntegration(): ObjectIntegration {
  return {
    contact: { enabled: true, opacity: 0.22, sigmaPx: 0.6, color: '#627196' },
    ao: { enabled: true, opacity: 0.1, sigmaPx: 1.5, expandM: 0.07 },
    snowLip: { enabled: true, heightM: 0.035, coverage: 0.75 },
    grade: { enabled: true, saturation: 0.88, contrast: 0.95, exposureEV: 0, ambientMix: 0.08, ambient: '#9aa8d6', hazeBeta: 0.0015, hazeColor: '#BBC9E4' },
    lights: { enabled: true, gain: 1 },
  };
}

/** Lucerna podle zadání (B.10): teplá, dosah 1,6 m, malá záře, ±1,5 % blikání. */
export function lantern(u: number, v: number, heightM = 1.65): ObjectLight {
  return { u, v, color: '#FFD6A0', heightM, radiusM: 1.6, groundGain: 0.12, haloOpacity: 0.12, haloSigmaPx: 3.5, characterGain: 0.12, flicker: 0.015 };
}

/** Intenzita světla v čase: pomalé mikrovariace (< 2 Hz), fáze ze semínka objektu (B.8). */
export function flickerAt(l: ObjectLight, seed: number, t: number): number {
  const p1 = hashNoise(seed, 11) * 6.283, p2 = hashNoise(seed, 12) * 6.283;
  return 1 + l.flicker * (0.8 * Math.sin(2 * Math.PI * 0.73 * t + p1) + 0.4 * Math.sin(2 * Math.PI * 1.13 * t + p2));
}

const seedOf = (o: SceneObject) => { let h = 2166136261; for (const ch of o.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h % 100000; };

/** Kontaktní hrana objektu na zemi (obrazové x od–do v y paty) a její světové body. */
function contactEdge(o: SceneObject, a: AssetEntry, r: Rect, cam: Camera) {
  const sh = a.shape!;
  let u0 = sh.bodyU0, u1 = sh.bodyU1;
  if (o.flipX) [u0, u1] = [1 - u1, 1 - u0];
  const x0 = r.x + u0 * r.w, x1 = r.x + u1 * r.w, y = o.y;
  const A = toWorld(cam, { x: x0, y }), B = toWorld(cam, { x: x1, y });
  return { x0, x1, y, A, B };
}

/** Světové souřadnice a obrazová poloha lucerny. */
function lightPos(o: SceneObject, l: ObjectLight, r: Rect, cam: Camera) {
  const u = o.flipX ? 1 - l.u : l.u;
  const s = { x: r.x + u * r.w, y: r.y + l.v * r.h };
  const G = toWorld(cam, { x: s.x, y: o.y }); // lucerna visí nad přední hranou
  return { s, G };
}

// ------------------------------------------------------------------ zemní vrstva (před objekty a lidmi)
/**
 * Zemní průchod: zastínění půdorysu, světelné skvrny luceren na sněhu a kontaktní stíny.
 * Kreslí se po pozadí a stopách, před hloubkově řazenými objekty a postavami (B.9 bod 2):
 * kontaktní stín až po světle, aby zůstal tmavý i u lucerny.
 */
export function drawGroundIntegration(ctx: Ctx, project: ProjectFile, objects: SceneObject[], assets: Map<string, AssetEntry>, t: number) {
  const cam = cameraFor(project.scene);
  const items = objects.filter((o) => o.integration && assets.get(o.assetId)?.shape);
  // 1) zastínění půdorysu – vrstvené rozšířené mnohoúhelníky ≈ rozmazaný okraj
  for (const o of items) {
    const I = o.integration!, a = assets.get(o.assetId)!, r = rectOf(o, a);
    if (!I.ao.enabled) continue;
    const e = contactEdge(o, a, r, cam), depth = a.shape!.depthM;
    const steps = 5;
    ctx.save();
    ctx.fillStyle = I.contact.color;
    for (let k = steps; k >= 1; k--) {
      const ex = I.ao.expandM * (k / steps) + (I.ao.sigmaPx * (k / steps)) / pxPerM(cam, e.A.Z);
      const poly = [
        { X: e.A.X - ex, Z: e.A.Z - ex }, { X: e.B.X + ex, Z: e.B.Z - ex },
        { X: e.B.X + ex, Z: e.B.Z + depth + ex }, { X: e.A.X - ex, Z: e.A.Z + depth + ex },
      ].map((w) => toScreen(cam, w));
      ctx.globalAlpha = I.ao.opacity / steps;
      ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // 2) světlo luceren na sněhu (elipsa podle kamery, screen)
  for (const o of items) {
    const I = o.integration!, a = assets.get(o.assetId)!, r = rectOf(o, a);
    if (!I.lights.enabled || !a.shape!.lights?.length) continue;
    for (const l of a.shape!.lights) drawGroundLight(ctx, cam, o, l, r, I.lights.gain * flickerAt(l, seedOf(o) + a.shape!.lights.indexOf(l), t));
  }
  // 3) úzký kontaktní stín podél paty (gaussovský profil, stálá ±15% modulace podél hrany)
  for (const o of items) {
    const I = o.integration!, a = assets.get(o.assetId)!, r = rectOf(o, a);
    if (!I.contact.enabled) continue;
    const e = contactEdge(o, a, r, cam), sg = Math.max(0.2, I.contact.sigmaPx);
    const seg = 6, n = Math.max(1, Math.ceil((e.x1 - e.x0) / seg)), seed = seedOf(o);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const xa = e.x0 + ((e.x1 - e.x0) * i) / n, xb = e.x0 + ((e.x1 - e.x0) * (i + 1)) / n;
      const m = 1 + 0.15 * (smoothNoise(seed, (i + 0.5) / 3) * 2 - 1);
      const yc = e.y + 0.4; // stín leží na hraně sněhu/země těsně pod patou
      const g = ctx.createLinearGradient(0, yc - 3 * sg, 0, yc + 3 * sg);
      for (let k = 0; k <= 8; k++) {
        const d = -3 * sg + (6 * sg * k) / 8;
        g.addColorStop(k / 8, rgba(I.contact.color, I.contact.opacity * m * Math.exp(-(d * d) / (2 * sg * sg))));
      }
      ctx.fillStyle = g; ctx.fillRect(xa, yc - 3 * sg, xb - xa + 0.3, 6 * sg);
    }
    ctx.restore();
  }
}

const pxPerM = (cam: Camera, Z: number) => cam.f / Math.max(1e-3, Z);

/** Poloosy světelné skvrny na zemi v obraze (px) a její střed. */
export function groundLightEllipse(cam: Camera, o: SceneObject, a: AssetEntry, l: ObjectLight): { x: number; y: number; rx: number; ry: number } {
  const r = rectOf(o, a), { G } = lightPos(o, l, r, cam);
  const c = { X: G.X, Z: G.Z - 0.25 }, P = toScreen(cam, c);
  return { x: P.x, y: P.y, rx: (l.radiusM * cam.f) / c.Z, ry: (l.radiusM * cam.f * cam.h) / (c.Z * c.Z) };
}

/** Světelná skvrna na zemi: E = gain·(Lh³/d³)·útlum; elipsa s poloosami R·f/Z a R·f·h/Z². */
function drawGroundLight(ctx: Ctx, cam: Camera, o: SceneObject, l: ObjectLight, r: Rect, gain: number) {
  const { G } = lightPos(o, l, r, cam);
  const c = { X: G.X, Z: G.Z - 0.25 }; // těžiště skvrny před pultem
  const P = toScreen(cam, c);
  const rx = l.radiusM * cam.f / c.Z, ry = (l.radiusM * cam.f * cam.h) / (c.Z * c.Z);
  if (rx < 0.5 || ry < 0.2) return;
  const Lh = l.heightM;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(P.x, P.y); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (let k = 0; k <= 10; k++) {
    const u = k / 10, rr = u * l.radiusM;
    const norm = (Lh * Lh * Lh) / Math.pow(rr * rr + Lh * Lh, 1.5);
    const fall = 1 - smooth(0.65, 1, u);
    g.addColorStop(u, rgba(l.color, Math.min(0.35, l.groundGain * gain * norm * fall)));
  }
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ přes objekt (po jeho vykreslení)
/** Sněhový lem přes spodní dřevo a malá záře luceren. Kreslí se hned po objektu (B.9 bod 4). */
export function drawObjectIntegration(ctx: Ctx, project: ProjectFile, o: SceneObject, a: AssetEntry | undefined, t: number, snowColor: string | undefined) {
  const I = o.integration;
  if (!I || !a?.shape) return;
  const cam = cameraFor(project.scene), r = rectOf(o, a);
  if (I.snowLip.enabled && snowColor) drawSnowLip(ctx, cam, o, a, r, I, snowColor);
  if (I.lights.enabled && a.shape.lights?.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    a.shape.lights.forEach((l, i) => {
      const { s } = lightPos(o, l, r, cam);
      const R = l.haloSigmaPx * 2.2 * (r.h / 175); // záře ve stejném měřítku jako lucerna
      const f = I.lights.gain * flickerAt(l, seedOf(o) + i, t);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
      for (let k = 0; k <= 6; k++) { const u = k / 6; g.addColorStop(u, rgba(l.color, l.haloOpacity * f * Math.exp(-((u * 2.2) ** 2) / 2))); }
      ctx.fillStyle = g; ctx.fillRect(s.x - R, s.y - R, 2 * R, 2 * R);
    });
    ctx.restore();
  }
}

/** Lem: výška h0·(0,6 + 0,4·N(l/0,18)), na 15–30 % délky téměř bez sněhu; výška jako H nad zemí. */
/** Horní hrana sněhového lemu (obrazové body) – deterministická z id objektu. */
export function snowLipProfile(cam: Camera, o: SceneObject, a: AssetEntry, I: ObjectIntegration): { top: Vec2[]; y: number } {
  const r = rectOf(o, a), e = contactEdge(o, a, r, cam);
  const lenM = Math.hypot(e.B.X - e.A.X, e.B.Z - e.A.Z);
  const seed = seedOf(o);
  const n = Math.max(8, Math.ceil(lenM / 0.04));
  const top: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, lM = k * lenM;
    const N = 0.65 * smoothNoise(seed, lM / 0.18) + 0.35 * smoothNoise(seed + 3, lM / 0.06); // dvě oktávy – hrbolky
    // mezery: nízkofrekvenční šum pod prahem pokrytí → sníh se plynule ztratí
    const gate = smooth(1 - I.snowLip.coverage - 0.08, 1 - I.snowLip.coverage + 0.08, Math.max(0, Math.min(1, (smoothNoise(seed + 7, lM / 0.35) - 0.5) * 1.8 + 0.5)));
    const edgeFade = smooth(0, 0.03, k) * smooth(0, 0.03, 1 - k);
    const H = I.snowLip.heightM * (0.3 + 0.9 * N) * gate * edgeFade;
    const W = { X: e.A.X + (e.B.X - e.A.X) * k, Z: e.A.Z + (e.B.Z - e.A.Z) * k - 0.02 };
    top.push(toScreen(cam, W, H));
  }
  return { top, y: e.y };
}

/** Lem: výška h0·(0,3 + 0,9·N), na části délky téměř bez sněhu; výška jako H nad zemí (B.3). */
function drawSnowLip(ctx: Ctx, cam: Camera, o: SceneObject, a: AssetEntry, _r: Rect, I: ObjectIntegration, color: string) {
  const { top, y } = snowLipProfile(cam, o, a, I);
  const e = { y };
  const yb = e.y + 0.5; // spodní hrana mírně do země – plynulé napojení na podklad
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(top[0].x, yb);
  for (const p of top) ctx.lineTo(p.x, Math.min(p.y, yb));
  ctx.lineTo(top[top.length - 1].x, yb); ctx.closePath(); ctx.fill();
  // měkký světlejší horní obrys (malovaný, ne čára přes celou patu)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.6;
  ctx.beginPath();
  let pen = false;
  for (const p of top) { if (yb - p.y > 0.6) { if (!pen) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); pen = true; } else pen = false; }
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ teplé světlo na postavách (B.5)
/** Síla teplého světla na postavě v bodě (x,y) a jeho barva/směr; 0 = mimo dosah. */
export function characterLightAt(project: ProjectFile, objects: SceneObject[], assets: Map<string, AssetEntry>, p: Vec2, t: number, gMax = 0.14): { g: number; color: string; dx: number } {
  const cam = cameraFor(project.scene), P = toWorld(cam, p);
  let best = { g: 0, color: '#FFD6A0', dx: 0 };
  for (const o of objects) {
    const I = o.integration, a = assets.get(o.assetId);
    if (!I?.lights.enabled || !a?.shape?.lights) continue;
    const r = rectOf(o, a);
    a.shape.lights.forEach((l, i) => {
      const { G, s } = lightPos(o, l, r, cam);
      const d = Math.hypot(G.X - P.X, G.Z - P.Z);
      if (d > l.radiusM * 1.6) return;
      const fall = 1 - smooth(l.radiusM, l.radiusM * 1.6, d); // plynule k nule, bez skoku na hranici
      const g = Math.min(gMax, (l.characterGain * I.lights.gain * flickerAt(l, seedOf(o) + i, t) * fall) / (1 + d * d));
      if (g > best.g) best = { g, color: l.color, dx: Math.sign(s.x - p.x) };
    });
  }
  return best;
}

// ------------------------------------------------------------------ sladění barev a opar (B.6, B.7)
const gradeCache = new Map<string, unknown>();
/** Bitmapa objektu po sladění barev a oparu (cache podle assetu, parametrů a hloubky). */
export function gradedImage(o: SceneObject, a: AssetEntry, img: unknown, project: ProjectFile): unknown {
  const G = o.integration?.grade;
  if (!G?.enabled || !img) return img;
  const cam = cameraFor(project.scene), Z = toWorld(cam, { x: o.x, y: o.y }).Z;
  const hz = 1 - Math.exp(-G.hazeBeta * Math.max(0, Z));
  const key = `${a.id}|${a.file}|${G.saturation}|${G.contrast}|${G.exposureEV}|${G.ambientMix}|${G.ambient}|${G.hazeColor}|${hz.toFixed(3)}`;
  const hit = gradeCache.get(key);
  if (hit) return hit;
  const f = getCanvasFactory();
  const im = img as { width: number; height: number };
  if (!f || !im.width) return img;
  const c = f(im.width, im.height);
  const cx = c.getContext('2d') as Ctx;
  cx.drawImage(img as CanvasImageSource, 0, 0);
  const data = cx.getImageData(0, 0, im.width, im.height);
  const d = data.data;
  const amb = hexLin(G.ambient), ay = 0.2126 * amb[0] + 0.7152 * amb[1] + 0.0722 * amb[2];
  const tint = amb.map((v) => v / Math.max(1e-4, ay)); // normalizovaný na jednotkový jas
  const hzC = hexLin(G.hazeColor), ev = Math.pow(2, G.exposureEV);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = LIN[d[i]], g = LIN[d[i + 1]], b = LIN[d[i + 2]];
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // světelná jádra (velmi jasné teplé pixely) se nekorigují
    const em = smooth(0.55, 0.85, Y) * (r > b * 1.4 ? 1 : 0.3);
    const k = 1 - em;
    const S = 1 + (G.saturation - 1) * k, C = 1 + (G.contrast - 1) * k, M = G.ambientMix * k, H = hz * (1 - 0.5 * em);
    const ch = [r, g, b].map((v, j) => {
      let x = Y + S * (v - Y);
      x = C * (x - 0.18) + 0.18;
      x = Math.max(0, x * ev);
      x = x * (1 - M) + x * tint[j] * M;
      return x * (1 - H) + hzC[j] * H;
    });
    d[i] = toSrgb8(ch[0]); d[i + 1] = toSrgb8(ch[1]); d[i + 2] = toSrgb8(ch[2]);
    void r; void g; void b; r = g = b = 0;
  }
  cx.putImageData(data, 0, 0);
  if (gradeCache.size > 64) gradeCache.clear();
  gradeCache.set(key, c);
  return c;
}

const LIN = Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
function toSrgb8(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}
function hexLin(h: string): number[] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h);
  if (!m) return [0.5, 0.5, 0.5];
  return [1, 2, 3].map((i) => LIN[parseInt(m[i], 16)]);
}
function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  const [r, g, b] = m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [0, 0, 0];
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(4)})`;
}
const smooth = (a: number, b: number, x: number) => { const k = Math.max(0, Math.min(1, (x - a) / Math.max(1e-9, b - a))); return k * k * (3 - 2 * k); };
/** Hladký 1D šum 0..1 (hodnotový, kubická interpolace), deterministický. */
function smoothNoise(seed: number, x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hashNoise(seed, i) * (1 - u) + hashNoise(seed, i + 1) * u;
}
function rectOf(o: SceneObject, a: AssetEntry): Rect {
  const ps = a.pixelScale ?? 1;
  const w = (a.width ?? 100) * ps * o.scale, h = (a.height ?? 100) * ps * o.scale;
  const an = o.anchor ?? a.anchor ?? { x: 0.5, y: 1 };
  const ax = o.flipX ? 1 - an.x : an.x;
  return { x: o.x - ax * w, y: o.y - an.y * h, w, h };
}
