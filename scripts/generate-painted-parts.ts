/**
 * DOČASNÉ malované díly postav + manifest knihovny (resources/builtin/painted-parts).
 * Slouží k ověření skládání, kostry a animace do doby, než budou dodané finální díly.
 * Každý díl je v manifestu označen `provisional: true`.
 *
 * Souřadnice: díly se kreslí v logických jednotkách (měřítko P px/jednotku) s počátkem v kloubu
 * (pivot). Kotvy se ukládají v px původního plátna; ořez průhledných okrajů se zapisuje do `trim`.
 *
 * Spuštění: npx tsx scripts/generate-painted-parts.ts
 */
import { createCanvas, Path2D, type SKRSContext2D, type Canvas } from '@napi-rs/canvas';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { seedRng, rand, type RngState } from '../src/core/math/rng';
import type { PartLibrary, PartDef, VariantDef, PartSlot, BodyTemplateDef } from '../src/core/anim/partLibrary';
import type { ViewId } from '../src/core/anim/skeleton';
import { testFigureManifest, type CharacterManifest } from '../src/core/anim/manifest';

const OUT = path.resolve('resources/builtin/painted-parts');
const P = 4; // px na logickou jednotku
type Ctx = SKRSContext2D;
type V = { x: number; y: number };

const ALL_PAL = ['petrolejova', 'vinova', 'okrova', 'olivova', 'kremova', 'hneda', 'tmave-seda'];
const GRAY = '#ece8e2'; // světlý neutrální podklad přebarvitelných ploch (násobí se barvou palety)
const SKIN = '#ecc6a6', HAIR = '#5b4334', SOLE = '#3b322d', CREAM = '#f1e9d8', FUR = '#cdb596';

// ---------------------------------------------------------------- malířské pomůcky
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
/** Výplň s texturou tahů štětce, vnitřním stínem a měkkým obrysem. */
function paint(ctx: Ctx, p: Path2D, base: string, rng: RngState, o: { dir?: number; strokes?: number; box: [number, number, number, number]; light?: number }) {
  const [x0, y0, x1, y1] = o.box;
  ctx.save();
  ctx.fillStyle = base; ctx.fill(p);
  ctx.clip(p);
  const n = o.strokes ?? Math.round(((x1 - x0) * (y1 - y0)) / 6 + 10);
  const dir = o.dir ?? Math.PI / 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = x0 + rand(rng) * (x1 - x0), y = y0 + rand(rng) * (y1 - y0);
    const len = 2.5 + rand(rng) * 5, a = dir + (rand(rng) - 0.5) * 0.6;
    const dark = rand(rng) < 0.55;
    ctx.strokeStyle = dark ? shade(base, 0.82 + rand(rng) * 0.08) : shade(base, 1.05 + rand(rng) * 0.06);
    ctx.globalAlpha = 0.18 + rand(rng) * 0.2;
    ctx.lineWidth = 0.7 + rand(rng) * 1.1;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rand(rng) - 0.5), y + Math.sin(a) * len * 0.5 + (rand(rng) - 0.5), x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // světlo zleva nahoře, stín vpravo dole (měkce)
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, `rgba(255,250,240,${0.18 * (o.light ?? 1)})`); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(40,30,30,0.16)');
  ctx.fillStyle = g; ctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
  ctx.strokeStyle = 'rgba(50,38,34,0.22)'; ctx.lineWidth = 2.2; ctx.stroke(p); // vnitřní stín u okraje
  ctx.restore();
  ctx.save(); ctx.strokeStyle = shade(base, 0.62); ctx.globalAlpha = 0.55; ctx.lineWidth = 0.45; ctx.stroke(p); ctx.restore();
}
function mfill(m: Ctx, p: Path2D) { m.fillStyle = '#fff'; m.fill(p); }
function mcut(m: Ctx, p: Path2D) { m.save(); m.globalCompositeOperation = 'destination-out'; m.fillStyle = '#000'; m.fill(p); m.restore(); }

/** Zúžená „kapsle“ podél osy y (končetiny, rukávy). */
function taper(y0: number, y1: number, w0: number, w1: number, dx = 0): Path2D {
  const p = new Path2D();
  p.moveTo(-w0 / 2, y0);
  p.quadraticCurveTo(-w0 / 2 - 0.4 + dx / 2, (y0 + y1) / 2, -w1 / 2 + dx, y1);
  p.arc(dx, y1, w1 / 2, Math.PI, 0, true);
  p.quadraticCurveTo(w0 / 2 + 0.4 + dx / 2, (y0 + y1) / 2, w0 / 2, y0);
  p.arc(0, y0, w0 / 2, 0, -Math.PI, true);
  p.closePath();
  return p;
}
function poly(pts: V[], smooth = true): Path2D {
  const p = new Path2D();
  if (!smooth) { pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); p.closePath(); return p; }
  const n = pts.length;
  const mid = (a: V, b: V) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); p.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y); }
  p.closePath();
  return p;
}
function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); return p; }

// ---------------------------------------------------------------- výroba dílu
interface PartSpec {
  slot: PartSlot; variantId: string; view: ViewId; file: string;
  /** rozměr plátna v jednotkách a poloha pivotu v něm */
  w: number; h: number; pivot: V;
  anchors: Record<string, V>; // v jednotkách vůči pivotu
  boneDir: number; layerOrder?: number; mirrorSafe?: boolean; tint: boolean;
  draw: (c: Ctx, m: Ctx, rng: RngState) => void;
}
const parts: PartDef[] = [];
const written = new Map<string, { trim: PartDef['trim']; sourceSize: PartDef['sourceSize'] }>();
const variants: VariantDef[] = [];

function trimBox(cv: Canvas): PartDef['trim'] {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function cropTo(cv: Canvas, t: PartDef['trim']): Canvas { const o = createCanvas(t.w, t.h); o.getContext('2d').drawImage(cv, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h); return o; }

async function makePart(s: PartSpec) {
  const variant = variants.find((v) => v.id === s.variantId)!;
  const id = `${s.variantId}.${s.slot}.${s.view}`;
  let geo = written.get(s.file);
  if (!geo) {
    const W = Math.ceil(s.w * P), H = Math.ceil(s.h * P);
    const tex = createCanvas(W, H), msk = createCanvas(W, H);
    const c = tex.getContext('2d'), m = msk.getContext('2d');
    for (const k of [c, m]) { k.translate(s.pivot.x * P, s.pivot.y * P); k.scale(P, P); }
    s.draw(c, m, seedRng(hashStr(s.file), 'paint'));
    // maska jen uvnitř textury
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'destination-in'; m.drawImage(tex, 0, 0);
    const trim = trimBox(tex);
    if (trim.x <= 0 || trim.y <= 0 || trim.x + trim.w >= W || trim.y + trim.h >= H) throw new Error(`Díl ${s.file} se dotýká okraje plátna – zvětšete plátno.`);
    await fs.writeFile(path.join(OUT, s.file), cropTo(tex, trim).toBuffer('image/png'));
    if (s.tint) await fs.writeFile(path.join(OUT, s.file.replace('.png', '.maska.png')), cropTo(msk, trim).toBuffer('image/png'));
    geo = { trim, sourceSize: { w: W, h: H } };
    written.set(s.file, geo);
  }
  const toPx = (u: V) => ({ x: round2((s.pivot.x + u.x) * P), y: round2((s.pivot.y + u.y) * P) });
  parts.push({
    id, slot: s.slot, variantId: s.variantId, view: s.view, texture: s.file, mask: s.tint ? s.file.replace('.png', '.maska.png') : undefined,
    sourceSize: geo.sourceSize, trim: geo.trim, pivot: toPx({ x: 0, y: 0 }),
    anchors: Object.fromEntries(Object.entries(s.anchors).map(([k, v]) => [k, toPx(v)])),
    boneDir: s.boneDir, layerOrder: s.layerOrder ?? 0,
    compatibleBodyTypes: variant.compatibleBodyTypes, compatibilityTags: variant.tags, paletteOptions: s.tint ? variant.paletteOptions : [],
    mirrorSafe: s.mirrorSafe ?? true, provisional: true,
  });
}
const round2 = (x: number) => Math.round(x * 100) / 100;
function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------------------------------------------------------- šablona dospělého
const B = { thigh: 31, shin: 29, ankleHeight: 3, torso: 38, neck: 13, shoulderDrop: 5, upperArm: 21, forearm: 20 };
const VIEWS: ViewId[] = ['side', 'front3q', 'back3q'];
const ORDER_FRONT = ['far.hand', 'far.forearm', 'far.upperArm', 'far.foot', 'far.shin', 'far.thigh', 'near.foot', 'near.shin', 'near.thigh', 'torso', 'head', 'hat', 'scarf', 'near.hand', 'near.forearm', 'near.upperArm', 'held'];
const ORDER_BACK = ['held', 'far.hand', 'far.forearm', 'far.upperArm', 'far.foot', 'far.shin', 'far.thigh', 'near.foot', 'near.shin', 'near.thigh', 'torso', 'scarf', 'head', 'hat', 'near.hand', 'near.forearm', 'near.upperArm'];
const adult: BodyTemplateDef = {
  id: 'adult', label: 'Dospělý', height: 130, bones: B,
  views: {
    side: { forward: { x: 1, y: 0 }, hipSpread: 0, shoulderSpread: 0, headOffsetX: 1.5, shoulderOffsetX: 0.5 },
    front3q: { forward: { x: 0.72, y: 0.3 }, hipSpread: 5, shoulderSpread: 11.5, headOffsetX: 0.5, shoulderOffsetX: 0 },
    back3q: { forward: { x: 0.72, y: -0.3 }, hipSpread: 5, shoulderSpread: 11.5, headOffsetX: 0.5, shoulderOffsetX: 0 },
  },
  gait: { strideLength: 96, stanceFraction: 0.58, stepLift: 6.5, armSwing: 0.38, maxDip: 2.2, sway: 1.1, lean: 0.035 },
  idle: { breathe: 0.55, headAmp: 0.022, shiftAmp: 1.5, shiftPeriod: 7.5 },
  proportions: { height: [0.94, 1.06], build: [0.93, 1.07] },
  motionRanges: { strideScale: [0.9, 1.1], armSwing: [0.65, 1.35], bob: [0.8, 1.2], sway: [0.75, 1.25], idleTempo: [0.85, 1.15], lean: [0, 3], speed: [0.85, 1.25], armLag: [-2, 4], armLR: [0.85, 1.15] },
  availableViews: VIEWS,
  viewFallbacks: { front: { use: 'front3q' }, back: { use: 'back3q' } },
  drawOrder: { side: ORDER_FRONT, front3q: ORDER_FRONT, back3q: ORDER_BACK },
  farShade: 0.8,
};

function variant(v: Omit<VariantDef, 'compatibleBodyTypes' | 'provisional'> & { compatibleBodyTypes?: string[] }) {
  variants.push({ compatibleBodyTypes: ['adult'], provisional: true, ...v });
}

// ---------------------------------------------------------------- díly
async function limbs() {
  variant({ id: 'trousers_basic', group: 'trousers', label: 'Kalhoty', tags: [], excludesTags: [], requiresAnchors: [], paletteOptions: ['tmave-seda', 'hneda', 'olivova'] });
  variant({ id: 'boots_basic', group: 'boots', label: 'Zimní boty', tags: [], excludesTags: [], requiresAnchors: [], paletteOptions: ['hneda', 'tmave-seda'] });
  variant({ id: 'gloves_basic', group: 'gloves', label: 'Palčáky', tags: [], excludesTags: [], requiresAnchors: [], paletteOptions: ALL_PAL });
  for (const view of VIEWS) {
    await makePart({ slot: 'thigh', variantId: 'trousers_basic', view, file: 'kalhoty-stehno.png', w: 16, h: 58, pivot: { x: 8, y: 13 }, anchors: { end: { x: 0, y: B.thigh } }, boneDir: Math.PI / 2, tint: true,
      draw: (c, m, r) => { const p = taper(-5.5, B.thigh + 3.5, 11.6, 9.2); paint(c, p, GRAY, r, { box: [-7, -6, 7, 36] }); mfill(m, p); c.strokeStyle = 'rgba(60,50,45,0.25)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(1.5, -2); c.lineTo(1, B.thigh); c.stroke(); } });
    await makePart({ slot: 'shin', variantId: 'trousers_basic', view, file: 'kalhoty-lytko.png', w: 14, h: 52, pivot: { x: 7, y: 11 }, anchors: { end: { x: 0, y: B.shin } }, boneDir: Math.PI / 2, tint: true,
      draw: (c, m, r) => { const p = taper(-1.2, B.shin + 1.5, 9.2, 8.6); paint(c, p, GRAY, r, { box: [-6, -5, 6, 32] }); mfill(m, p); } });
    await makePart({ slot: 'foot', variantId: 'boots_basic', view, file: `bota-${view}.png`, w: 24, h: 16, pivot: { x: 8, y: 10 }, anchors: {}, boneDir: 0, tint: true,
      draw: (c, m, r) => {
        const toe = view === 'side' ? 11 : view === 'front3q' ? 8.5 : 6.5, heel = view === 'back3q' ? -6 : -4.8;
        const p = poly([{ x: -4.3, y: -8 }, { x: 4.3, y: -8 }, { x: 4.6, y: -1.5 }, { x: toe - 1, y: -0.5 }, { x: toe + 0.6, y: 1.6 }, { x: toe - 0.5, y: 3 }, { x: heel, y: 3 }, { x: heel - 0.4, y: 0 }, { x: -4.5, y: -2 }]);
        paint(c, p, GRAY, r, { box: [-6, -9, toe + 1, 3], dir: 0 }); mfill(m, p);
        const sole = new Path2D(); sole.rect(heel - 0.3, 2, toe - heel + 0.6, 1.3);
        c.fillStyle = SOLE; c.fill(sole); mcut(m, sole);
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-4.2, -8.6, 8.4, 1.1); // sníh/okraj
      } });
    await makePart({ slot: 'hand', variantId: 'gloves_basic', view, file: 'palcak.png', w: 12, h: 13, pivot: { x: 5, y: 2 }, anchors: { grip: { x: 1.2, y: 4.6 } }, boneDir: Math.PI / 2, tint: true,
      draw: (c, m, r) => {
        const p = new Path2D(); p.ellipse(0.4, 4, 3.9, 4.7, 0, 0, Math.PI * 2); p.ellipse(3.1, 2.6, 1.8, 2.2, 0.5, 0, Math.PI * 2);
        paint(c, p, GRAY, r, { box: [-4, -1, 5.5, 9], strokes: 14 }); mfill(m, p);
      } });
  }
}

async function jackets() {
  variant({ id: 'jacket_coat', group: 'jacket', label: 'Dlouhý kabát', tags: ['coat-long'], excludesTags: [], requiresAnchors: [], paletteOptions: ALL_PAL });
  variant({ id: 'jacket_puffer', group: 'jacket', label: 'Prošívaná bunda', tags: ['collar-high'], excludesTags: [], requiresAnchors: [], paletteOptions: ALL_PAL });
  for (const view of VIEWS) {
    const side = view === 'side';
    const nx = side ? 0.5 : 0;
    // --- kabát
    await makePart({ slot: 'torso', variantId: 'jacket_coat', view, file: `kabat-trup-${view}.png`, w: 34, h: 70, pivot: { x: 17, y: 46 }, anchors: { neck: { x: nx, y: -B.torso }, scarf: { x: nx, y: -B.torso + 1 } }, boneDir: -Math.PI / 2, mirrorSafe: true, tint: true,
      draw: (c, m, r) => {
        const sh = side ? [-6.5, 7.5] : [-12.5, 12.5];
        const pts = side
          ? [{ x: -6, y: -39 }, { x: 6.5, y: -39 }, { x: 8.6, y: -30 }, { x: 7.6, y: -12 }, { x: 10, y: 21 }, { x: -8.5, y: 21 }, { x: -7.4, y: -10 }, { x: -8, y: -32 }]
          : [{ x: sh[0] + 2, y: -40 }, { x: sh[1] - 2, y: -40 }, { x: sh[1], y: -34 }, { x: 10.6, y: -10 }, { x: 13.8, y: 21 }, { x: -13.8, y: 21 }, { x: -10.6, y: -10 }, { x: sh[0], y: -34 }];
        const p = poly(pts);
        paint(c, p, GRAY, r, { box: [-14, -41, 14, 22] }); mfill(m, p);
        c.strokeStyle = 'rgba(55,45,40,0.35)'; c.lineWidth = 0.5;
        if (view === 'front3q') {
          c.beginPath(); c.moveTo(2, -36); c.lineTo(2.6, 21); c.stroke(); // přední díl
          const lap = poly([{ x: -3, y: -40 }, { x: 4.5, y: -40 }, { x: 2.4, y: -30 }], false); c.fillStyle = 'rgba(40,30,30,0.18)'; c.fill(lap);
          for (const y of [-27, -17, -7, 3]) { const b = ellipse(4.3, y, 0.9, 0.9); c.fillStyle = '#3b302a'; c.fill(b); mcut(m, b); }
          c.beginPath(); c.moveTo(-10.8, -3); c.lineTo(11.2, -3); c.stroke(); // pás
        } else if (view === 'back3q') {
          c.beginPath(); c.moveTo(0, -38); c.lineTo(0.4, 21); c.stroke();
          c.beginPath(); c.moveTo(-10.8, -3); c.lineTo(11.2, -3); c.stroke();
        } else {
          c.beginPath(); c.moveTo(6.6, -33); c.quadraticCurveTo(8.5, -10, 9, 21); c.stroke();
          for (const y of [-25, -14, -3]) { const b = ellipse(7.4, y, 0.8, 0.8); c.fillStyle = '#3b302a'; c.fill(b); mcut(m, b); }
        }
      } });
    // --- prošívaná bunda (krátká, vysoký límec)
    await makePart({ slot: 'torso', variantId: 'jacket_puffer', view, file: `bunda-trup-${view}.png`, w: 36, h: 60, pivot: { x: 18, y: 48 }, anchors: { neck: { x: nx, y: -B.torso }, scarf: { x: nx, y: -B.torso + 1 } }, boneDir: -Math.PI / 2, mirrorSafe: true, tint: true,
      draw: (c, m, r) => {
        const pts = side
          ? [{ x: -6.5, y: -43 }, { x: 5.5, y: -43 }, { x: 9.6, y: -30 }, { x: 9.2, y: -10 }, { x: 10, y: 7 }, { x: -9, y: 7 }, { x: -8.8, y: -12 }, { x: -9, y: -33 }]
          : [{ x: -7, y: -43.5 }, { x: 7, y: -43.5 }, { x: 13.5, y: -35 }, { x: 13.2, y: -12 }, { x: 13.4, y: 7 }, { x: -13.4, y: 7 }, { x: -13.2, y: -12 }, { x: -13.5, y: -35 }];
        const p = poly(pts);
        paint(c, p, GRAY, r, { box: [-14, -44, 14, 8], dir: 0 }); mfill(m, p);
        c.save(); c.clip(p); c.strokeStyle = 'rgba(50,40,36,0.32)'; c.lineWidth = 0.6;
        for (let y = -30; y <= 4; y += 7) { c.beginPath(); c.moveTo(-15, y); c.quadraticCurveTo(0, y + 1.6, 15, y); c.stroke(); }
        c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1.2;
        for (let y = -34; y <= 0; y += 7) { c.beginPath(); c.moveTo(-10, y); c.quadraticCurveTo(0, y + 1.2, 10, y); c.stroke(); }
        c.restore();
        c.strokeStyle = 'rgba(50,40,36,0.4)'; c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(-6, -37); c.quadraticCurveTo(0, -35.5, 6, -37); c.stroke(); // límec
        if (view === 'front3q') { c.strokeStyle = 'rgba(60,50,45,0.5)'; c.beginPath(); c.moveTo(2, -43); c.lineTo(2.4, 7); c.stroke(); }
      } });
    // --- rukávy (barva podle bundy)
    for (const [jid, wU, wF, label] of [['jacket_coat', 9.8, 8.6, 'kabat'], ['jacket_puffer', 11, 9.6, 'bunda']] as const) {
      await makePart({ slot: 'upperArm', variantId: jid, view, file: `${label}-nadlokti.png`, w: 16, h: 46, pivot: { x: 8, y: 12 }, anchors: { end: { x: 0, y: B.upperArm } }, boneDir: Math.PI / 2, tint: true,
        draw: (c, m, r) => {
          const p = taper(-0.8, B.upperArm + 3.5, wU, wU - 1); paint(c, p, GRAY, r, { box: [-7, -7, 7, 26] }); mfill(m, p);
          if (jid === 'jacket_puffer') { c.save(); c.clip(p); c.strokeStyle = 'rgba(50,40,36,0.3)'; c.lineWidth = 0.6; for (const y of [5, 13]) { c.beginPath(); c.moveTo(-6, y); c.quadraticCurveTo(0, y + 1.3, 6, y); c.stroke(); } c.restore(); }
        } });
      await makePart({ slot: 'forearm', variantId: jid, view, file: `${label}-predlokti.png`, w: 15, h: 38, pivot: { x: 7.5, y: 10 }, anchors: { end: { x: 0, y: B.forearm } }, boneDir: Math.PI / 2, tint: true,
        draw: (c, m, r) => {
          const p = taper(-1.2, B.forearm + 1, wF - 0.4, wF - 0.6); paint(c, p, GRAY, r, { box: [-6, -5, 6, 22] }); mfill(m, p);
          c.save(); c.clip(p); c.fillStyle = jid === 'jacket_coat' ? 'rgba(40,30,28,0.22)' : 'rgba(40,30,28,0.3)'; c.fillRect(-6, B.forearm - 3.5, 12, 3.6); c.restore();
        } });
    }
  }
}

async function heads() {
  variant({ id: 'head_adult', group: 'head', label: 'Hlava (dospělý)', tags: [], excludesTags: [], requiresAnchors: [], paletteOptions: [], artNotes: 'Pleť a vlasy jsou pevné; varianty vlasů a pleti zatím nejsou.' });
  for (const view of VIEWS) {
    const hx = view === 'side' ? 1.5 : 0.5;
    await makePart({ slot: 'head', variantId: 'head_adult', view, file: `hlava-${view}.png`, w: 30, h: 34, pivot: { x: 14, y: 29 }, anchors: { hat: { x: hx, y: -19 } }, boneDir: -Math.PI / 2, mirrorSafe: true, tint: false,
      draw: (c, _m, r) => {
        const neck = new Path2D(); neck.roundRect(-3, -10, 6, 11, 2.5); c.fillStyle = shade(SKIN, 0.86); c.fill(neck);
        const headP = new Path2D(); headP.ellipse(hx, -13, 10.4, 11.4, 0, 0, Math.PI * 2);
        if (view === 'side') headP.ellipse(hx + 9.6, -11.5, 2.2, 2.6, 0, 0, Math.PI * 2); // nos
        paint(c, headP, SKIN, r, { box: [hx - 11, -25, hx + 12, -1], strokes: 24, light: 1.3 });
        c.save(); c.clip(headP);
        const hair = new Path2D();
        if (view === 'side') { hair.ellipse(hx - 6.5, -15, 7, 10.5, -0.2, 0, Math.PI * 2); hair.ellipse(hx - 1, -22.5, 10, 4.5, 0.1, 0, Math.PI * 2); }
        else if (view === 'front3q') { hair.ellipse(hx - 1, -22, 12, 6.5, 0.15, 0, Math.PI * 2); hair.ellipse(hx - 9, -14, 3.5, 8, 0, 0, Math.PI * 2); }
        else { hair.ellipse(hx, -14, 11.5, 12.5, 0, 0, Math.PI * 2); }
        paint(c, hair, HAIR, r, { box: [hx - 12, -26, hx + 12, -1], strokes: 22 });
        c.restore();
        // obličej jen naznačený
        c.fillStyle = 'rgba(70,45,38,0.75)';
        if (view === 'front3q') { c.fillRect(hx + 1.2, -14.5, 1.6, 0.9); c.fillRect(hx + 6, -14.3, 1.5, 0.9); }
        if (view === 'side') { c.fillRect(hx + 5.6, -14.5, 1.4, 0.9); }
        if (view !== 'back3q') { c.fillStyle = 'rgba(220,120,110,0.28)'; c.beginPath(); c.arc(hx + (view === 'side' ? 5 : 7.4), -9.8, 2.4, 0, Math.PI * 2); c.fill(); }
        if (view === 'side') { const ear = ellipse(hx - 1.6, -12.6, 1.7, 2.4); c.fillStyle = shade(SKIN, 0.92); c.fill(ear); }
      } });
  }
}

async function hats() {
  variant({ id: 'hat_beanie', group: 'hat', label: 'Kulich s bambulí', tags: [], excludesTags: [], requiresAnchors: [{ slot: 'head', anchor: 'hat' }], paletteOptions: ALL_PAL });
  variant({ id: 'hat_beret', group: 'hat', label: 'Baret', tags: [], excludesTags: [], requiresAnchors: [{ slot: 'head', anchor: 'hat' }], paletteOptions: ['vinova', 'petrolejova', 'tmave-seda', 'olivova', 'hneda'] });
  variant({ id: 'hat_ushanka', group: 'hat', label: 'Beranice', tags: ['earflaps'], excludesTags: [], requiresAnchors: [{ slot: 'head', anchor: 'hat' }], paletteOptions: ['hneda', 'tmave-seda', 'olivova', 'okrova'] });
  for (const view of VIEWS) {
    const sx = view === 'side' ? -1 : 0;
    await makePart({ slot: 'hat', variantId: 'hat_beanie', view, file: `kulich-${view}.png`, w: 30, h: 26, pivot: { x: 15, y: 19 }, anchors: {}, boneDir: -Math.PI / 2, tint: true,
      draw: (c, m, r) => {
        const dome = new Path2D(); dome.moveTo(sx - 11.8, 2); dome.quadraticCurveTo(sx - 12.5, -10, sx, -10.5); dome.quadraticCurveTo(sx + 12.5, -10, sx + 11.8, 2); dome.closePath();
        paint(c, dome, GRAY, r, { box: [sx - 12, -11, sx + 12, 2] }); mfill(m, dome);
        const brim = new Path2D(); brim.roundRect(sx - 12.4, -1.5, 24.8, 5.6, 2.4);
        paint(c, brim, shade(GRAY, 0.92), r, { box: [sx - 12, -2, sx + 12, 4], dir: Math.PI / 2, strokes: 26 }); mfill(m, brim);
        c.strokeStyle = 'rgba(50,40,36,0.25)'; c.lineWidth = 0.4; for (let x = -11; x <= 11; x += 2) { c.beginPath(); c.moveTo(sx + x, -1); c.lineTo(sx + x, 3.8); c.stroke(); }
        const pom = ellipse(sx, -12.5, 4.3, 4); paint(c, pom, CREAM, r, { box: [sx - 5, -17, sx + 5, -8], strokes: 30, dir: 0 }); mcut(m, pom);
      } });
    await makePart({ slot: 'hat', variantId: 'hat_beret', view, file: `baret-${view}.png`, w: 34, h: 18, pivot: { x: 17, y: 12 }, anchors: {}, boneDir: -Math.PI / 2, tint: true,
      draw: (c, m, r) => {
        const p = new Path2D(); p.ellipse(sx + 1.5, -3, 13.2, view === 'side' ? 5.2 : 6, view === 'side' ? 0.16 : 0.1, 0, Math.PI * 2);
        p.rect(sx - 10.5, -2, 21, 4);
        paint(c, p, GRAY, r, { box: [sx - 12, -10, sx + 15, 3], dir: 0 }); mfill(m, p);
        c.fillStyle = 'rgba(40,30,28,0.3)'; c.fillRect(sx - 10.5, 1.2, 21, 1.1);
        const st = ellipse(sx + 1.5, -9.2, 0.9, 1.4); c.fillStyle = shade(GRAY, 0.6); c.fill(st);
      } });
    await makePart({ slot: 'hat', variantId: 'hat_ushanka', view, file: `beranice-${view}.png`, w: 32, h: 36, pivot: { x: 16, y: 19 }, anchors: {}, boneDir: -Math.PI / 2, tint: true,
      draw: (c, m, r) => {
        const flaps = new Path2D();
        if (view === 'side') flaps.roundRect(sx - 4, -1, 7, 14, 3);
        else { flaps.roundRect(-13, -1, 6.5, 14, 3); flaps.roundRect(6.5, -1, 6.5, 14, 3); }
        paint(c, flaps, FUR, r, { box: [-14, -2, 14, 14], strokes: 40 }); mcut(m, flaps);
        const crown = new Path2D(); crown.moveTo(sx - 11.5, 0); crown.quadraticCurveTo(sx - 12, -11.5, sx, -11.5); crown.quadraticCurveTo(sx + 12, -11.5, sx + 11.5, 0); crown.closePath();
        paint(c, crown, GRAY, r, { box: [sx - 12, -12, sx + 12, 0] }); mfill(m, crown);
        const band = new Path2D(); band.roundRect(sx - 12.8, -3.5, 25.6, 6.5, 3);
        paint(c, band, FUR, r, { box: [sx - 13, -4, sx + 13, 3], strokes: 45 }); mcut(m, band);
      } });
  }
}

async function scarves() {
  variant({ id: 'scarf_long', group: 'scarf', label: 'Pletená šála', tags: [], excludesTags: [], requiresAnchors: [{ slot: 'torso', anchor: 'scarf' }], paletteOptions: ALL_PAL });
  variant({ id: 'scarf_snood', group: 'scarf', label: 'Nákrčník', tags: [], excludesTags: ['collar-high'], requiresAnchors: [{ slot: 'torso', anchor: 'scarf' }], paletteOptions: ALL_PAL,
    artNotes: 'Nekombinuje se s vysokým límcem prošívané bundy (překryv by vypadal nepřirozeně).' });
  for (const view of VIEWS) {
    const side = view === 'side';
    await makePart({ slot: 'scarf', variantId: 'scarf_long', view, file: `sala-${view}.png`, w: 26, h: 36, pivot: { x: 13, y: 6 }, anchors: {}, boneDir: -Math.PI / 2, tint: true,
      draw: (c, m, r) => {
        const wrap = new Path2D(); wrap.roundRect(side ? -6 : -9, -3, side ? 13 : 18, 7.5, 3.5);
        const tails = new Path2D();
        if (view === 'front3q') { tails.roundRect(1, 2, 4.6, 23, 1.5); tails.roundRect(4.4, 2, 4.4, 19, 1.5); }
        else if (side) { tails.roundRect(4, 2, 4.4, 21, 1.5); }
        else { tails.roundRect(-7, 1, 4.2, 9, 1.5); }
        paint(c, tails, GRAY, r, { box: [-8, 1, 9, 26] }); mfill(m, tails);
        paint(c, wrap, GRAY, r, { box: [-9, -3, 9, 5], dir: 0 }); mfill(m, wrap);
        // krémové proužky na koncích (nepřebarvují se)
        c.save(); c.clip(tails); const st = new Path2D(); st.rect(-10, view === 'back3q' ? 6.5 : 17, 20, 1.6); st.rect(-10, view === 'back3q' ? 9 : 19.6, 20, 1.2);
        c.fillStyle = CREAM; c.globalAlpha = 0.9; c.fill(st); c.restore(); mcut(m, st);
      } });
    await makePart({ slot: 'scarf', variantId: 'scarf_snood', view, file: `nakrcnik-${view}.png`, w: 28, h: 18, pivot: { x: 14, y: 9 }, anchors: {}, boneDir: -Math.PI / 2, tint: true,
      draw: (c, m, r) => {
        const p = new Path2D(); p.roundRect(side ? -7 : -10.5, -5.5, side ? 15 : 21, 11, 5);
        paint(c, p, GRAY, r, { box: [-11, -6, 11, 6], dir: Math.PI / 2, strokes: 40 }); mfill(m, p);
        c.save(); c.clip(p); c.strokeStyle = 'rgba(50,40,36,0.22)'; c.lineWidth = 0.45;
        for (let x = -10; x <= 10; x += 1.6) { c.beginPath(); c.moveTo(x, -6); c.lineTo(x + 0.4, 6); c.stroke(); }
        c.restore();
      } });
  }
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });
  await limbs(); await jackets(); await heads(); await hats(); await scarves();
  const lib: PartLibrary = {
    format: 'zive-obrazy-dily', formatVersion: 1, id: 'malovane-docasne-v1', label: 'Malované díly – DOČASNÉ (procedurálně kreslené)', provisional: true,
    pxPerUnit: P,
    palettes: [
      { id: 'petrolejova', label: 'Petrolejová', color: '#2f6b70' }, { id: 'vinova', label: 'Vínová', color: '#7a2e3b' },
      { id: 'okrova', label: 'Okrová', color: '#c08a2e' }, { id: 'olivova', label: 'Olivová', color: '#6b7340' },
      { id: 'kremova', label: 'Krémová', color: '#e3d7bd' }, { id: 'hneda', label: 'Hnědá', color: '#6b4a35' },
      { id: 'tmave-seda', label: 'Tmavě šedá', color: '#45484e' },
    ],
    bodyTemplates: [adult],
    groups: [
      { id: 'jacket', label: 'Bunda', slots: ['torso', 'upperArm', 'forearm'], colorRule: 'free', userSelectable: true },
      { id: 'hat', label: 'Pokrývka hlavy', slots: ['hat'], colorRule: 'contrast', userSelectable: true },
      { id: 'scarf', label: 'Šála', slots: ['scarf'], colorRule: 'contrast', userSelectable: true },
      { id: 'trousers', label: 'Kalhoty', slots: ['thigh', 'shin'], colorRule: 'fixedOptions', userSelectable: false },
      { id: 'boots', label: 'Boty', slots: ['foot'], colorRule: 'fixedOptions', userSelectable: false },
      { id: 'gloves', label: 'Rukavice', slots: ['hand'], colorRule: 'matchAccessory', userSelectable: false },
      { id: 'head', label: 'Hlava', slots: ['head'], colorRule: 'fixedOptions', userSelectable: false },
    ],
    variants, parts,
    artIssues: [
      { ref: '*', issue: 'Všechny díly jsou DOČASNÉ – procedurálně kreslené. Dodaný výtvarný prototyp dílů do projektu zatím nedorazil.' },
      { ref: 'pohled front/back', issue: 'Chybí čelní a zadní pohled – používá se explicitní náhrada šikmým pohledem (front→front3q, back→back3q).' },
      { ref: 'head_adult', issue: 'Jedna hlava bez variant vlasů a pleti.' },
    ],
  };
  await fs.writeFile(path.join(OUT, 'library.json'), JSON.stringify(lib, null, 1));
  // manifest postavy (backend skeleton) + položka vestavěné knihovny
  const base = testFigureManifest();
  const manifest: CharacterManifest = {
    ...base, id: 'painted-adult', name: 'Malovaná postava (dočasné díly)', provisional: true, backend: 'skeleton',
    clips: { ...base.clips, walk: { ...base.clips.walk, strideLength: adult.gait.strideLength } },
    directions: ['E', 'SE', 'NE'],
    directionFallbacks: { W: { use: 'E', mirror: true }, SW: { use: 'SE', mirror: true }, NW: { use: 'NE', mirror: true }, S: { use: 'SE', mirror: false }, N: { use: 'NE', mirror: false } },
    attachPoints: {}, rig: { library: 'painted-parts/library.json', bodyTemplate: 'adult' },
  };
  await fs.writeFile(path.resolve('resources/builtin/malovana-postava.json'), JSON.stringify(manifest, null, 2));
  const bj = JSON.parse(await fs.readFile('resources/builtin/builtin.json', 'utf8'));
  bj.assets = bj.assets.filter((a: { id: string }) => a.id !== 'builtin_postava_malovana');
  bj.assets.push({ id: 'builtin_postava_malovana', kind: 'character', name: 'Malovaná postava – generátor (dočasné díly)', file: 'malovana-postava.json', includeDir: 'painted-parts', provisional: true });
  await fs.writeFile('resources/builtin/builtin.json', JSON.stringify(bj, null, 2));
  console.log(`Díly: ${parts.length} (souborů ${written.size}), variant ${variants.length} → ${OUT}`);
}
main();
