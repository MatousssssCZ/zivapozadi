/**
 * Zpracování dodaného archu dílů postavy (ChatGPT, pohled šikmo zepředu) do knihovny dílů.
 * Originál zůstává beze změny v grafika/zdroje; výstup: resources/builtin/painted-parts-cg.
 *
 *  1. rozdělení archu podle průhledných mezer, vyčištění alfa kanálu (šum pozadí, ztrátová WebP),
 *  2. změření každého dílu (klouby = pivot/kotvy) a přepočet na jednotné měřítko podle délek kostí,
 *  3. masky přebarvení (šedé oblečení; bez pleti, krémových prvků, knoflíků a podrážek),
 *  4. zápis library.json + manifestu postavy.
 *
 * Spuštění: npx tsx scripts/process-character-parts.ts
 */
import { loadImage, createCanvas, type Canvas } from '@napi-rs/canvas';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PartLibrary, PartDef, VariantDef, PartSlot, BodyTemplateDef, GroupId } from '../src/core/anim/partLibrary';
import { testFigureManifest, type CharacterManifest } from '../src/core/anim/manifest';

// Archy dílů: šikmo zepředu (schválená reference v2) a šikmo zezadu (stejný styl a měřítko).
const OUT = path.resolve('resources/builtin/painted-parts-cg');
const P = 4; // px na jednotku ve výstupu
type SheetView = 'front3q' | 'back3q';
const ALL_PAL = ['petrolejova', 'vinova', 'okrova', 'olivova', 'kremova', 'hneda', 'tmave-seda'];
type V = { x: number; y: number };

// Šablona dospělého podle schválené reference v2 (~7 hlav): délky kostí v jednotkách (postava 130).
const BONES = { thigh: 32, shin: 30, ankleHeight: 3, torso: 43, neck: 13, shoulderDrop: 4, upperArm: 24, forearm: 21 };

interface Cut { name: string; slot: PartSlot; box: [number, number, number, number]; view?: SheetView }
const CUTS_BACK: Cut[] = [
  { name: 'hlava', slot: 'head', box: [70, 118, 267, 384] },
  { name: 'kabat-trup', slot: 'torso', box: [347, 50, 582, 471] },
  { name: 'kabat-nadlokti', slot: 'upperArm', box: [682, 106, 820, 434] },
  { name: 'kabat-predlokti', slot: 'forearm', box: [958, 102, 1099, 424] },
  { name: 'palcak', slot: 'hand', box: [1214, 163, 1402, 421] },
  { name: 'kalhoty-stehno', slot: 'thigh', box: [73, 553, 248, 922] },
  { name: 'kalhoty-lytko', slot: 'shin', box: [364, 545, 514, 916] },
  { name: 'bota', slot: 'foot', box: [609, 659, 809, 900] },
  { name: 'kulich', slot: 'hat', box: [901, 583, 1139, 846] },
  { name: 'sala', slot: 'scarf', box: [1200, 601, 1443, 750] },
];
const SHEETS: { src: string; view: SheetView; cuts: () => Cut[] }[] = [
  { src: 'grafika/zdroje/postava-dily-3q-zepredu-v1.webp', view: 'front3q', cuts: () => CUTS },
  { src: 'grafika/zdroje/postava-dily-3q-zezadu-v1.webp', view: 'back3q', cuts: () => CUTS_BACK },
];
const CUTS: Cut[] = [
  { name: 'hlava', slot: 'head', box: [74, 72, 268, 470] },
  { name: 'kabat-trup', slot: 'torso', box: [384, 72, 591, 470] },
  { name: 'kabat-nadlokti', slot: 'upperArm', box: [714, 72, 832, 470] },
  { name: 'kabat-predlokti', slot: 'forearm', box: [996, 72, 1110, 470] },
  { name: 'palcak', slot: 'hand', box: [1275, 72, 1435, 470] },
  { name: 'kalhoty-stehno', slot: 'thigh', box: [93, 582, 240, 932] },
  { name: 'kalhoty-lytko', slot: 'shin', box: [388, 582, 515, 932] },
  { name: 'bota', slot: 'foot', box: [627, 582, 848, 932] },
  { name: 'kulich', slot: 'hat', box: [931, 582, 1161, 932] },
  { name: 'sala', slot: 'scarf', box: [1246, 582, 1468, 932] },
];

interface Part { cut: Cut; c: Canvas; d: Uint8ClampedArray; w: number; h: number; hole?: { x: number; y: number; w: number } }

function extract(sheet: Canvas, cut: Cut, margin = 8): Part {
  const [x0, y0, x1, y1] = cut.box;
  const w = x1 - x0 + 1 + margin * 2, h = y1 - y0 + 1 + margin * 2;
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.drawImage(sheet, x0, y0, x1 - x0 + 1, y1 - y0 + 1, margin, margin, x1 - x0 + 1, y1 - y0 + 1);
  const id = ctx.getImageData(0, 0, w, h);
  // vyčištění: šum pozadí pryč, téměř plné pixely plné
  for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] < 28 ? 0 : id.data[i] > 235 ? 255 : id.data[i];
  // ponechat jen hlavní souvislou oblast (odstraní skvrny pozadí uvnitř výřezu)
  keepLargest(id.data, w, h);
  if (cut.slot === 'hat' && cut.view !== 'back3q') removeHatInterior(id.data, w, h);
  let hole: Part['hole'];
  if (cut.slot === 'scarf' && cut.view !== 'back3q') { hole = holeCenter({ cut, c, d: id.data, w, h }); fillScarfHole(id.data, w, h); }
  ctx.putImageData(id, 0, 0);
  return { cut, c, d: id.data, w, h, hole };
}

function keepLargest(d: Uint8ClampedArray, w: number, h: number) {
  const lab = new Int32Array(w * h).fill(-1); let best = -1, bestN = 0, n = 0;
  const sizes: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (lab[s] >= 0 || d[s * 4 + 3] === 0) continue;
    const st = [s]; let cnt = 0; lab[s] = n;
    while (st.length) { const i = st.pop()!; cnt++; const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && lab[j] < 0 && d[j * 4 + 3] > 0) { lab[j] = n; st.push(j); } }
    sizes.push(cnt); if (cnt > bestN) { bestN = cnt; best = n; } n++;
  }
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && lab[i] !== best && sizes[lab[i]] < bestN * 0.02) d[i * 4 + 3] = 0;
}

/** Vnitřek čepice (tmavý průhled do otvoru v dolní části) se odstraní – na hlavě není vidět. */
function removeHatInterior(d: Uint8ClampedArray, w: number, h: number) {
  let top = h; for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 0) { top = Math.floor(i / w); break; }
  for (let y = Math.floor(top + (h - top) * 0.6); y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (!d[i + 3]) continue;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if ((mx + mn) / 510 < 0.56 && mx - mn < 24) d[i + 3] = 0;
  }
}
/** Otvor šály se vyplní stínem vnitřku smyčky (jinak by jím prosvítal kabát). */
function fillScarfHole(d: Uint8ClampedArray, w: number, h: number) {
  const p = { d, w, h } as unknown as Part;
  const seen = new Uint8Array(w * h); const tr = (i: number) => d[i * 4 + 3] < 128;
  const st: number[] = []; for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop()!; if (seen[i] || !tr(i)) continue; seen[i] = 1; const x = i % w, y = (i / w) | 0; if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
  void p;
  for (let i = 0; i < w * h; i++) if (!seen[i] && tr(i)) { d[i * 4] = 128; d[i * 4 + 1] = 124; d[i * 4 + 2] = 120; d[i * 4 + 3] = 255; }
}

/** Řádkové profily (levý a pravý okraj při alfa > 128). */
function rows(p: Part) {
  const L: number[] = [], R: number[] = [];
  for (let y = 0; y < p.h; y++) { let l = -1, r = -1; for (let x = 0; x < p.w; x++) if (p.d[(y * p.w + x) * 4 + 3] > 128) { if (l < 0) l = x; r = x; } L.push(l); R.push(r); }
  const ys = L.map((l, y) => (l >= 0 ? y : -1)).filter((y) => y >= 0);
  return { L, R, top: ys[0], bottom: ys[ys.length - 1], width: (y: number) => (L[y] < 0 ? 0 : R[y] - L[y] + 1), cx: (y: number) => (L[y] + R[y]) / 2 };
}
const avgOver = (f: (y: number) => number, a: number, b: number) => { let s = 0, n = 0; for (let y = Math.round(a); y <= Math.round(b); y++) { s += f(y); n++; } return s / Math.max(1, n); };

/** Měření dílu: pivot a kotvy ve zdrojových px + měřítko k (výstupní px / zdrojové px). */
interface Measure { k: number; kx?: number; pivot: V; anchors: Record<string, V>; boneDir: number; info: string }

/** Cílové šířky končetin podle reference v2 (jednotky) – sjednocení tloušťky navazujících dílů. */
const WIDTH: Partial<Record<PartSlot, number>> = { upperArm: 8.6, forearm: 7.9, thigh: 10.2, shin: 9.4 };

function measure(p: Part, ctx: { headWidthU?: number; neckWidthU?: number; frontHeadWidthU?: number; frontSoleU?: number }): Measure {
  const r = rows(p); const H = r.bottom - r.top;
  const t10 = (a: number, b: number) => avgOver(r.cx, r.top + H * a, r.top + H * b);
  const wAvg = (a: number, b: number) => avgOver(r.width, r.top + H * a, r.top + H * b);
  switch (p.cut.slot) {
    case 'upperArm': {
      const rt = wAvg(0.1, 0.2) / 2, rb = wAvg(0.8, 0.9) / 2;
      // rameno: kloub těsně pod horním okrajem, aby rukáv nevyčníval nad linii ramen
      const end = { x: t10(0.85, 0.95), y: r.bottom - rb };
      const k = ((BONES.upperArm + 2.5) * P) / (end.y - r.top);
      const pivot = { x: t10(0.05, 0.15), y: r.top + (2.5 * P) / k };
      void rt;
      return { k, kx: (WIDTH.upperArm! * P) / wAvg(0.3, 0.7), pivot, anchors: { end }, boneDir: Math.PI / 2, info: `šířka ${(wAvg(0.3, 0.7) * k / P).toFixed(1)} j.` };
    }
    case 'forearm': {
      const k = ((BONES.forearm + 1.5 + 1) * P) / H;
      const pivot = { x: t10(0, 0.1), y: r.top + (1.5 * P) / k }, end = { x: t10(0.9, 1), y: r.bottom - (1 * P) / k };
      return { k, kx: (WIDTH.forearm! * P) / wAvg(0.3, 0.7), pivot, anchors: { end }, boneDir: Math.PI / 2, info: `šířka ${(wAvg(0.3, 0.7) * k / P).toFixed(1)} j.` };
    }
    case 'thigh': {
      const rb = wAvg(0.85, 0.92) / 2;
      const k = ((BONES.thigh + 3) * P) / (r.bottom - rb - r.top);
      const pivot = { x: t10(0, 0.1), y: r.top + (3 * P) / k }, end = { x: t10(0.85, 0.95), y: r.bottom - rb };
      return { k, kx: (WIDTH.thigh! * P) / wAvg(0.2, 0.5), pivot, anchors: { end }, boneDir: Math.PI / 2, info: `šířka ${(wAvg(0.2, 0.5) * k / P).toFixed(1)} j.` };
    }
    case 'shin': {
      // lem nohavice končí 3 j. nad kotníkem (překrývá svršek boty) ⇒ kotník leží pod dílem
      const k = ((BONES.shin + 1.5 - 3) * P) / H;
      const pivot = { x: t10(0, 0.1), y: r.top + (1.5 * P) / k }, end = { x: t10(0.9, 1), y: r.bottom + (3 * P) / k };
      return { k, kx: (WIDTH.shin! * P) / wAvg(0.3, 0.7), pivot, anchors: { end }, boneDir: Math.PI / 2, info: `šířka ${(wAvg(0.3, 0.7) * k / P).toFixed(1)} j.` };
    }
    case 'hand': {
      const k = (11 * P) / H;
      const pivot = { x: t10(0, 0.08), y: r.top + (2 * P) / k };
      return { k, pivot, anchors: { grip: { x: t10(0.05, 0.15), y: r.top + H * 0.58 } }, boneDir: Math.PI / 2, info: '' };
    }
    case 'foot': {
      let k = (9.8 * P) / H;
      const shaft = t10(0.05, 0.3);
      // skutečná podrážka: pata = nejzadnější bod spodních řádků, přednoží = 85 % délky ke špičce
      let sl = p.w, sr = 0; for (let y = Math.round(r.bottom - H * 0.12); y <= r.bottom; y++) { if (r.L[y] >= 0) { sl = Math.min(sl, r.L[y]); sr = Math.max(sr, r.R[y]); } }
      const heel = { x: sl, y: r.bottom }, toe = { x: shaft + (sr - shaft) * 0.85, y: r.bottom };
      // zezadu je holínka v perspektivě vyšší – měřítko podle délky podrážky (90 % boty zepředu)
      let bl = p.w, br = 0; for (let y = r.top; y <= r.bottom; y++) if (r.L[y] >= 0) { bl = Math.min(bl, r.L[y]); br = Math.max(br, r.R[y]); }
      if (p.cut.view === 'back3q' && ctx.frontSoleU) k = (ctx.frontSoleU * 0.92 * P) / (br - bl);
      else ctx.frontSoleU = ((br - bl) * k) / P;
      return { k, pivot: { x: shaft, y: r.bottom - (BONES.ankleHeight * P) / k }, anchors: { heel, toe }, boneDir: 0, info: `pata ${((shaft - sl) * k / P).toFixed(1)} j., přednoží ${((toe.x - shaft) * k / P).toFixed(1)} j.` };
    }
    case 'torso': {
      const neckY = r.top + H * 0.07;
      const pelvisY = neckY + (r.bottom - neckY) * (BONES.torso / (BONES.torso + 18));
      const k = (BONES.torso * P) / (pelvisY - neckY);
      const neckX = t10(0, 0.06);
      const pivot = { x: r.cx(Math.round(pelvisY)), y: pelvisY };
      const sh = Math.round(neckY + (BONES.shoulderDrop * P) / k + H * 0.03);
      return { k, pivot, anchors: { neck: { x: neckX, y: neckY }, scarf: { x: neckX, y: neckY - (1.5 * P) / k }, shoulderL: { x: r.L[sh], y: sh }, shoulderR: { x: r.R[sh], y: sh }, hipL: { x: r.L[Math.round(pelvisY)], y: pelvisY }, hipR: { x: r.R[Math.round(pelvisY)], y: pelvisY } }, boneDir: -Math.PI / 2, info: `ramena ${(r.width(sh) * k / P).toFixed(1)} j.` };
    }
    case 'head': {
      // brada = místo, kde se od spodu (krk) náhle rozšíří obrys
      const neckW = avgOver(r.width, r.bottom - H * 0.08, r.bottom - 2);
      let chin = r.bottom; for (let y = r.bottom - 2; y > r.top; y--) if (r.width(y) > neckW * 1.35) { chin = y; break; }
      let k = (18 * P) / (chin - r.top);
      let wide = r.top; for (let y = r.top; y < chin; y++) if (r.width(y) > r.width(wide)) wide = y;
      // zezadu není brada vidět: měřítko podle šířky hlavy z pohledu zepředu, „brada“ = 18 j. pod temenem
      if (p.cut.view === 'back3q' && ctx.frontHeadWidthU) { k = (ctx.frontHeadWidthU * P) / r.width(wide); chin = Math.min(r.bottom - 2, r.top + (18 * P) / k); }
      ctx.headWidthU = (r.width(wide) * k) / P; ctx.neckWidthU = (neckW * k) / P;
      if (p.cut.view !== 'back3q') ctx.frontHeadWidthU = ctx.headWidthU;
      const pivot = { x: avgOver(r.cx, r.bottom - H * 0.08, r.bottom - 2), y: r.bottom - (1.5 * P) / k };
      return { k, pivot, anchors: { hat: { x: r.cx(wide), y: r.top + (chin - r.top) * 0.22 } }, boneDir: -Math.PI / 2, info: `hlava ${ctx.headWidthU.toFixed(1)}×18 j., krk ${ctx.neckWidthU.toFixed(1)} j.` };
    }
    case 'hat': {
      // nejširší místo dolní poloviny (ohrnutý okraj); spodek je zaoblený průhled do čepice
      let rimY = r.bottom; for (let y = Math.round(r.top + H * 0.5); y <= r.bottom; y++) if (r.width(y) > r.width(rimY)) rimY = y;
      const rimW = r.width(rimY);
      const k = ((ctx.headWidthU ?? 16) * 1.1 * P) / rimW;
      return { k, pivot: { x: r.cx(rimY), y: rimY }, anchors: {}, boneDir: -Math.PI / 2, info: `okraj ${(rimW * k / P).toFixed(1)} j.` };
    }
    case 'scarf': {
      if (!p.hole) {
        // zezadu: smyčka bez otvoru – krk prochází asi ve 40 % výšky smyčky
        const k = (21 * P) / p.w;
        return { k, pivot: { x: avgOver(r.cx, r.top, r.top + H * 0.5), y: r.top + H * 0.4 }, anchors: {}, boneDir: -Math.PI / 2, info: `smyčka zezadu, šířka ${(p.w * k / P).toFixed(1)} j.` };
      }
      const hole = p.hole!;
      const k = (21 * P) / p.w; // šířka šály podle reference (krk prosvítá otvorem)
      return { k, pivot: { x: hole.x, y: hole.y }, anchors: {}, boneDir: -Math.PI / 2, info: `otvor ${(hole.w * k / P).toFixed(1)} j., šířka ${(p.w * k / P).toFixed(1)} j.` };
    }
  }
  throw new Error('neznámý slot');
}

/** Největší uzavřený průhledný otvor (otvor šály pro krk). */
function holeCenter(p: Part): { x: number; y: number; w: number } {
  const { w, h, d } = p; const seen = new Uint8Array(w * h); const tr = (i: number) => d[i * 4 + 3] < 128;
  const st: number[] = []; for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop()!; if (seen[i] || !tr(i)) continue; seen[i] = 1; const x = i % w, y = (i / w) | 0; if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
  let best = { n: 0, x: 0, y: 0, x0: 0, x1: 0 };
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !tr(s)) continue; let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0; const q = [s];
    while (q.length) { const i = q.pop()!; if (seen[i] || !tr(i)) continue; seen[i] = 1; const x = i % w, y = (i / w) | 0; n++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      if (x > 0) q.push(i - 1); if (x < w - 1) q.push(i + 1); if (y > 0) q.push(i - w); if (y < h - 1) q.push(i + w); }
    if (n > best.n) best = { n, x: sx / n, y: sy / n, x0, x1 };
  }
  if (!best.n) throw new Error('Šála nemá otvor pro krk.');
  return { x: best.x, y: best.y, w: best.x1 - best.x0 + 1 };
}

/** Maska přebarvení: šedé oblečení (nízká sytost). Pleť, krémové prvky, knoflíky a podrážky se vyloučí. */
function makeMask(c: Canvas, slot: PartSlot): { mask: Canvas | null; brighten: number } {
  if (slot === 'head') return { mask: null, brighten: 1 };
  const ctx = c.getContext('2d'); const id = ctx.getImageData(0, 0, c.width, c.height); const d = id.data;
  const m = createCanvas(c.width, c.height); const mctx = m.getContext('2d'); const md = mctx.createImageData(c.width, c.height);
  let sumL = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
    // šedá látka má nízkou sytost (chroma); krémové prvky (bambule, proužky) a pleť ji mají vyšší
    const chroma = mx - mn;
    const dark = l < 0.36 && !(slot === 'scarf' && chroma < 12); // knoflíky, podrážky, otvory
    if (chroma < 24 && !dark) { md.data[i] = md.data[i + 1] = md.data[i + 2] = 255; md.data[i + 3] = d[i + 3]; sumL += l; n++; }
  }
  mctx.putImageData(md, 0, 0);
  // Podklad pro násobení barvou: střední jas ~0,84 a poloviční kontrast (jinak světlé tahy po obarvení
  // vypadají jako bílé skvrny). Textura i stínování zůstanou, jen tlumeněji.
  const mean = n ? sumL / n : 0.8;
  const f = 0.84 / mean;
  for (let i = 0; i < d.length; i += 4) if (md.data[i + 3] > 0) {
    const a = md.data[i + 3] / 255;
    for (let k = 0; k < 3; k++) {
      const v = d[i + k] / 255, t = Math.min(0.97, (mean + (v - mean) * 0.5) * f);
      d[i + k] = Math.round(255 * (v + (t - v) * a));
    }
  }
  ctx.putImageData(id, 0, 0);
  return { mask: m, brighten: f };
}

/**
 * Plynulé klouby (koleno, loket):
 * - spodní díl (lýtko, předloktí) dostane nahoře zaoblenou „čéšku“ se středem v kloubu, takže při ohnutí
 *   nevyčnívá hranatý roh a tvar kloubu je kulatý (barva čéšky se bere z řádků pod ní);
 * - horní díl (stehno, nadloktí) má dole měkký okraj bez tmavé kontury, takže se do spodního dílu
 *   prolne barevně i tvarově (horní díl se kreslí přes spodní).
 */
function smoothJoint(c: Canvas, slot: PartSlot, pivot: V, end: V | null) {
  if (!['shin', 'forearm', 'thigh', 'upperArm'].includes(slot)) return;
  const ctx = c.getContext('2d'); const id = ctx.getImageData(0, 0, c.width, c.height); const d = id.data; const W = c.width, H = c.height;
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[(y * W + x) * 4 + 3]);
  const extent = (y: number) => { let x0 = -1, x1 = -1; for (let x = 0; x < W; x++) if (A(x, y) > 128) { if (x0 < 0) x0 = x; x1 = x; } return x0 < 0 ? null : { x0, x1 }; };
  if (slot === 'shin' || slot === 'forearm') {
    // poloměr = polovina šířky kousek pod kloubem
    let ref = null as { x0: number; x1: number } | null, yRef = Math.round(pivot.y + 3 * P);
    for (; yRef < H && !(ref = extent(yRef)); yRef++);
    if (!ref) return;
    const r = (ref.x1 - ref.x0 + 1) / 2 * 0.98, cx = pivot.x, cy = pivot.y;
    const src = new Uint8ClampedArray(d);
    const yTop = Math.max(0, Math.floor(cy - r - 2));
    for (let y = yTop; y <= Math.ceil(cy + 2); y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dist = Math.hypot(x - cx, y - cy), cov = Math.max(0, Math.min(1, r - dist + 0.5));
      // nad středem kloubu: jen uvnitř kruhu; pod ním: původní tvar, ale kruh doplní chybějící okraj
      const inside = y <= cy ? cov : Math.max(cov, src[i + 3] / 255);
      if (inside <= 0) { d[i + 3] = 0; continue; }
      if (src[i + 3] < 250) {
        // barva z nejbližšího plně krytého pixelu pod (stejný sloupec, jinak nejbližší sloupec v referenčním řádku)
        let yy = y, xx = Math.max(ref.x0 + 2, Math.min(ref.x1 - 2, x));
        while (yy < H && src[(yy * W + xx) * 4 + 3] < 250) yy++;
        if (yy >= H) continue;
        const j = (yy * W + xx) * 4;
        d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2];
      }
      d[i + 3] = Math.round(255 * Math.min(inside, y <= cy ? cov : 1));
    }
  } else if (end) {
    // spodní okraj horního dílu: tmavé obrysové pixely nahradit látkou zevnitř a okraj změkčit
    const src = new Uint8ClampedArray(d);
    const yStart = Math.round(end.y - 3 * P);
    const lum = (j: number) => 0.3 * src[j] + 0.59 * src[j + 1] + 0.11 * src[j + 2];
    const distT = (x: number, y: number) => { for (let k = 1; k <= 8; k++) for (const [dx, dy] of [[0, k], [k, 0], [-k, 0], [0, -k], [k, k], [-k, k]]) if (A(x + dx, y + dy) < 40) return k; return 9; };
    for (let y = Math.max(0, yStart); y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] === 0) continue;
      const dt = distT(x, y);
      if (dt <= 5) {
        // barva z vnitřku (6 px směrem ke středu kloubu)
        const vx = end.x - x, vy = end.y - y - 2 * P, vl = Math.hypot(vx, vy) || 1;
        const sx = Math.round(x + (vx / vl) * 6), sy = Math.round(y + (vy / vl) * 6);
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) {
          const j = (sy * W + sx) * 4;
          if (src[j + 3] > 200 && lum(i) < lum(j) - 6) { const t = Math.min(1, (lum(j) - lum(i)) / 40) * (dt <= 3 ? 1 : 0.5); for (let k = 0; k < 3; k++) d[i + k] = Math.round(src[i + k] + (src[j + k] - src[i + k]) * t); }
        }
        // měkký okraj (jen dole – po stranách zůstává ostrý obrys nohavice/rukávu)
        const below = y > end.y - P;
        if (below) d[i + 3] = Math.round(src[i + 3] * Math.min(1, (dt - 0.5) / 4));
      }
    }
  }
  ctx.putImageData(id, 0, 0);
}

function scaled(src: Canvas, kx: number, k: number, pad: number): Canvas {
  const w = Math.ceil(src.width * kx) + pad * 2, h = Math.ceil(src.height * k) + pad * 2;
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; (ctx as unknown as { imageSmoothingQuality: string }).imageSmoothingQuality = 'high';
  ctx.drawImage(src, pad, pad, src.width * kx, src.height * k);
  return c;
}
function trimBox(cv: Canvas) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 2) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function crop(cv: Canvas, t: { x: number; y: number; w: number; h: number }) { const o = createCanvas(t.w, t.h); o.getContext('2d').drawImage(cv, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h); return o; }
const r2 = (x: number) => Math.round(x * 100) / 100;

async function main() {
  await fs.rm(OUT, { recursive: true, force: true }); await fs.mkdir(OUT, { recursive: true });
  const ctx: { headWidthU?: number; neckWidthU?: number; frontHeadWidthU?: number; frontSoleU?: number } = {};
  const order: PartSlot[] = ['head', 'torso', 'upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'hat', 'scarf'];
  const measured = new Map<string, { part: PartDef; meas: Measure }>();
  const groupOf: Record<PartSlot, GroupId> = { head: 'head', torso: 'jacket', upperArm: 'jacket', forearm: 'jacket', hand: 'gloves', thigh: 'trousers', shin: 'trousers', foot: 'boots', hat: 'hat', scarf: 'scarf' };
  const variantOf: Record<GroupId, string> = { head: 'head_cg', jacket: 'jacket_coat_cg', gloves: 'gloves_cg', trousers: 'trousers_cg', boots: 'boots_cg', hat: 'hat_beanie_cg', scarf: 'scarf_long_cg' };
  const palOf: Record<GroupId, string[]> = { head: [], jacket: ALL_PAL, gloves: ALL_PAL, trousers: ['tmave-seda', 'hneda', 'olivova'], boots: ['hneda', 'tmave-seda'], hat: ALL_PAL, scarf: ALL_PAL };
  const report: string[] = [];
  const artFixes: { ref: string; issue: string }[] = [];
  const viewGeom: Partial<Record<SheetView, { hipSpread: number; shoulderSpread: number; shoulderOffsetX: number }>> = {};
  for (const sh of SHEETS) {
  const VIEW = sh.view;
  const img = await loadImage(sh.src);
  const sheet = createCanvas(img.width, img.height); sheet.getContext('2d').drawImage(img, 0, 0);
  report.push(`--- ${VIEW} (${sh.src})`);
  for (const slot of order) {
    const cut = { ...sh.cuts().find((c) => c.slot === slot)!, view: VIEW };
    const p = extract(sheet, cut);
    const meas = measure(p, ctx);
    const pad = slot === 'shin' || slot === 'forearm' ? 28 : 4; // místo pro zaoblenou čéšku / loket
    const kx = meas.kx ?? meas.k;
    const sc = scaled(p.c, kx, meas.k, pad);
    const toS = (q: V) => ({ x: q.x * kx + pad, y: q.y * meas.k + pad });
    smoothJoint(sc, slot, toS(meas.pivot), meas.anchors.end ? toS(meas.anchors.end) : null);
    if (Math.abs(kx / meas.k - 1) > 0.12) artFixes.push({ ref: `${slot}/${VIEW}`, issue: `Poměr stran neodpovídá referenci – šířka upravena ×${(kx / meas.k).toFixed(2)} vůči délce. Přemalovat ${kx < meas.k ? 'užší a delší' : 'širší a kratší'} (cílová šířka ${WIDTH[slot]} j. při délce kosti).` });
    const { mask, brighten } = makeMask(sc, slot);
    const trim = trimBox(sc);
    const file = `${cut.name}-${VIEW}.png`;
    await fs.writeFile(path.join(OUT, file), crop(sc, trim).toBuffer('image/png'));
    if (mask) await fs.writeFile(path.join(OUT, file.replace('.png', '.maska.png')), crop(mask, trim).toBuffer('image/png'));
    const tp = (q: V) => ({ x: r2(q.x * kx + pad), y: r2(q.y * meas.k + pad) });
    const g = groupOf[slot];
    const part: PartDef = {
      id: `${variantOf[g]}.${slot}.${VIEW}`, slot, variantId: variantOf[g], view: VIEW, texture: file, mask: mask ? file.replace('.png', '.maska.png') : undefined,
      sourceSize: { w: sc.width, h: sc.height }, trim, pivot: tp(meas.pivot),
      anchors: Object.fromEntries(Object.entries(meas.anchors).map(([k, v]) => [k, tp(v)])),
      boneDir: meas.boneDir, layerOrder: 0, compatibleBodyTypes: ['adult-cg'], compatibilityTags: [], paletteOptions: mask ? palOf[g] : [],
      mirrorSafe: true, provisional: false,
    };
    measured.set(`${VIEW}|${slot}`, { part, meas });
    report.push(`${slot.padEnd(9)} měřítko ×${meas.k.toFixed(3)}${kx !== meas.k ? ` (šířka ×${kx.toFixed(3)})` : ''}  ${meas.info}${mask ? `  maska (zesvětlení ×${brighten.toFixed(2)})` : ''}`);
  }
  // rozestupy ramen a kyčlí z trupu
  const torso = measured.get(`${VIEW}|torso`)!.part;
  const a = torso.anchors;
  const u = (px: number) => px / P;
  viewGeom[VIEW] = {
    shoulderSpread: r2(u((a.shoulderR.x - a.shoulderL.x) / 2) * 0.62),
    shoulderOffsetX: r2(u((a.shoulderR.x + a.shoulderL.x) / 2 - a.neck.x)),
    hipSpread: r2(u((a.hipR.x - a.hipL.x) / 2) * 0.42),
  };
  for (const k of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) delete a[k];
  }
  const { hipSpread, shoulderSpread, shoulderOffsetX } = viewGeom.front3q!;
  const gb = viewGeom.back3q!;
  const boot = measured.get('front3q|foot')!.part;
  const footGeom = { heel: r2((boot.pivot.x - boot.anchors.heel.x) / P), toe: r2((boot.anchors.toe.x - boot.pivot.x) / P) };
  const order3q = ['far.hand', 'far.forearm', 'far.upperArm', 'far.foot', 'far.shin', 'far.thigh', 'near.foot', 'near.shin', 'near.thigh', 'torso', 'head', 'hat', 'scarf', 'near.hand', 'near.forearm', 'near.upperArm', 'held'];
  const tpl: BodyTemplateDef = {
    id: 'adult-cg', label: 'Dospělý (reference v2)', height: 130, bones: BONES,
    views: {
      front3q: { forward: { x: 0.72, y: 0.3 }, hipSpread, shoulderSpread, headOffsetX: 0, shoulderOffsetX, nearSide: -1 },
      // šikmo zezadu: postava jde doprava a od kamery, blízký (pravý) bok je vpravo
      back3q: { forward: { x: 0.72, y: -0.3 }, hipSpread: gb.hipSpread, shoulderSpread: gb.shoulderSpread, headOffsetX: 0, shoulderOffsetX: gb.shoulderOffsetX, nearSide: 1 },
    },
    gait: { strideLength: 100, stanceFraction: 0.58, stepLift: 6.5, armSwing: 0.36, maxDip: 2.2, sway: 1.1, lean: 0.035 },
    idle: { breathe: 0.5, headAmp: 0.02, shiftAmp: 1.4, shiftPeriod: 7.5 },
    proportions: { height: [0.95, 1.05], build: [0.95, 1.05] },
    motionRanges: { strideScale: [0.9, 1.1], armSwing: [0.65, 1.35], bob: [0.8, 1.2], sway: [0.75, 1.25], idleTempo: [0.85, 1.15], lean: [0, 3], speed: [0.85, 1.25], armLag: [-2, 4], armLR: [0.85, 1.15] },
    availableViews: ['front3q', 'back3q'],
    viewFallbacks: { side: { use: 'front3q' }, front: { use: 'front3q' }, back: { use: 'back3q' } },
    drawOrder: { front3q: order3q, back3q: order3q },
    farShade: 0.82,
    foot: footGeom,
  };
  const V = (id: string, group: GroupId, label: string, extra: Partial<VariantDef> = {}): VariantDef => ({ id, group, label, compatibleBodyTypes: ['adult-cg'], tags: [], excludesTags: [], requiresAnchors: [], paletteOptions: palOf[group], provisional: false, ...extra });
  const lib: PartLibrary = {
    format: 'zive-obrazy-dily', formatVersion: 1, id: 'malovane-cg-v1', label: 'Malované díly (ChatGPT, šikmo zepředu a zezadu)', provisional: false, pxPerUnit: P,
    palettes: [
      { id: 'petrolejova', label: 'Petrolejová', color: '#2f6b70' }, { id: 'vinova', label: 'Vínová', color: '#7a2e3b' },
      { id: 'okrova', label: 'Okrová', color: '#c08a2e' }, { id: 'olivova', label: 'Olivová', color: '#6b7340' },
      { id: 'kremova', label: 'Krémová', color: '#e3d7bd' }, { id: 'hneda', label: 'Hnědá', color: '#6b4a35' },
      { id: 'tmave-seda', label: 'Tmavě šedá', color: '#45484e' },
    ],
    bodyTemplates: [tpl],
    groups: [
      { id: 'jacket', label: 'Bunda', slots: ['torso', 'upperArm', 'forearm'], colorRule: 'free', userSelectable: true },
      { id: 'hat', label: 'Pokrývka hlavy', slots: ['hat'], colorRule: 'contrast', userSelectable: true },
      { id: 'scarf', label: 'Šála', slots: ['scarf'], colorRule: 'contrast', userSelectable: true },
      { id: 'trousers', label: 'Kalhoty', slots: ['thigh', 'shin'], colorRule: 'fixedOptions', userSelectable: false },
      { id: 'boots', label: 'Boty', slots: ['foot'], colorRule: 'fixedOptions', userSelectable: false },
      { id: 'gloves', label: 'Rukavice', slots: ['hand'], colorRule: 'matchAccessory', userSelectable: false },
      { id: 'head', label: 'Hlava', slots: ['head'], colorRule: 'fixedOptions', userSelectable: false },
    ],
    variants: [
      V('jacket_coat_cg', 'jacket', 'Dlouhý kabát'), V('hat_beanie_cg', 'hat', 'Kulich s bambulí', { requiresAnchors: [{ slot: 'head', anchor: 'hat' }] }),
      V('scarf_long_cg', 'scarf', 'Pletená šála', { requiresAnchors: [{ slot: 'torso', anchor: 'scarf' }] }),
      V('trousers_cg', 'trousers', 'Kalhoty'), V('boots_cg', 'boots', 'Zimní boty'), V('gloves_cg', 'gloves', 'Palčáky'), V('head_cg', 'head', 'Hlava (dospělý)'),
    ],
    parts: [...measured.values()].map((m) => m.part),
    artIssues: [
      { ref: 'pohledy', issue: 'Dodány pohledy šikmo zepředu a šikmo zezadu. Bok, zepředu a zezadu chybí – při chůzi se nepoužívají (chůze je vždy šikmá), v klidu explicitní náhrada nejbližším šikmým pohledem.' },
      { ref: 'scarf_long_cg.scarf.back3q', issue: 'Šála zezadu je bez krémových proužků (konce nejsou vidět) – v pořádku, jen pro úplnost.' },
      { ref: 'varianty', issue: 'Jedna bunda, jedna čepice, jedna šála – další varianty (prošívaná bunda, baret, beranice, nákrčník) ještě nejsou namalované.' },
      { ref: 'jacket_coat_cg.torso', issue: 'Průramky a otevřený límec ukazují tmavý vnitřek; zakrývá ho rukáv, krk a šála. Při úpravě raději vyplnit látkou.' },
      { ref: 'zrcadlení', issue: 'Pro chůzi doleva se díly zrcadlí (knoflíky se přesunou na druhou stranu).' },
      ...artFixes,
    ],
  };
  await fs.writeFile(path.join(OUT, 'library.json'), JSON.stringify(lib, null, 1));
  const base = testFigureManifest();
  const manifest: CharacterManifest = {
    ...base, id: 'painted-cg', name: 'Malovaná postava (ChatGPT díly)', provisional: false, backend: 'skeleton',
    clips: { ...base.clips, walk: { ...base.clips.walk, strideLength: tpl.gait.strideLength } },
    directions: ['SE', 'NE'], directionFallbacks: { E: { use: 'SE', mirror: false }, S: { use: 'SE', mirror: false }, N: { use: 'NE', mirror: false }, W: { use: 'SE', mirror: true }, SW: { use: 'SE', mirror: true }, NW: { use: 'NE', mirror: true } },
    attachPoints: {}, rig: { library: 'painted-parts-cg/library.json', bodyTemplate: 'adult-cg' },
  };
  await fs.writeFile(path.resolve('resources/builtin/malovana-postava-cg.json'), JSON.stringify(manifest, null, 2));
  const bj = JSON.parse(await fs.readFile('resources/builtin/builtin.json', 'utf8'));
  bj.assets = bj.assets.filter((x: { id: string }) => x.id !== 'builtin_postava_cg');
  bj.assets.push({ id: 'builtin_postava_cg', kind: 'character', name: 'Malovaná postava – díly z ChatGPT', file: 'malovana-postava-cg.json', includeDir: 'painted-parts-cg' });
  await fs.writeFile('resources/builtin/builtin.json', JSON.stringify(bj, null, 2));
  console.log(report.join('\n'));
  console.log(`šablona: ramena ±${shoulderSpread} (posun ${shoulderOffsetX}), kyčle ±${hipSpread}`);
}
main();
