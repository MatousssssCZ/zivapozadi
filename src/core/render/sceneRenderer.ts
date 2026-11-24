/**
 * Vykreslení scény v logických souřadnicích. Čistá funkce: projekt + stav simulace → obraz.
 * Neobsahuje editorové značky ani nekontrolovanou náhodu. Používá ji náhled i export.
 */
import { drawGroundIntegration, drawObjectIntegration, gradedImage, characterLightAt } from './integration';
import type { ProjectFile, SceneObject, AssetEntry } from '../model/types';
import type { Simulation } from '../sim/simulation';
import type { AgentState, PropState } from '../sim/types';
import { characterVisual } from './characterPose';
import { drawFigure } from '../anim/testFigure';
import { cameraFor, toScreen } from '../scene/camera';
import { lidOpenness } from '../sim/simulation';
import { FOOTPRINT_LIFE, FOOTPRINT_FADE } from '../sim/types';
import { getCanvasFactory, drawRig } from './rigRenderer';
import { depthScaleAt, objectLocalToScene } from '../scene/geometry';
import { hashNoise } from '../math/rng';
import { clamp, smoothstep } from '../math/vec';

export interface ImageLike { width: number; height: number }
export interface AssetImages { get(assetId: string): ImageLike | null | undefined }

type Ctx = CanvasRenderingContext2D;

export interface DrawOptions {
  /** Čas v sekundách (pro sněžení). */
  time: number;
  /** Zvýrazněné ID (jen editor – předává se dál overlayi, renderer ho ignoruje). */
}

export function objectImageRect(o: SceneObject, a: AssetEntry | undefined): { x: number; y: number; w: number; h: number } {
  const ps = a?.pixelScale ?? 1;
  const w = (a?.width ?? 100) * ps * o.scale, h = (a?.height ?? 100) * ps * o.scale;
  const an = o.anchor ?? a?.anchor ?? { x: 0.5, y: 1 };
  const ax = o.flipX ? 1 - an.x : an.x;
  return { x: o.x - ax * w, y: o.y - an.y * h, w, h };
}

/** Otvírací víko (koš): otáčí se kolem pantu; `open` 0 = zavřeno, 1 = plně otevřeno. */
function drawLid(ctx: Ctx, o: SceneObject, a: AssetEntry, r: { x: number; y: number; w: number; h: number }, open: number) {
  const L = a.lid!;
  const lw = (a.width ?? 1) * (a.pixelScale ?? 1), sx = r.w / lw; // logické px obrázku → scéna
  const left = L.hinge === 'left';
  const hx = r.x + (left ? L.x : L.x + L.w) * sx, hy = r.y + (L.y + L.h * 0.6) * sx;
  ctx.save();
  if (o.flipX) { ctx.translate(r.x + r.w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(r.x + r.w / 2), 0); }
  ctx.translate(hx, hy);
  ctx.rotate((left ? -1 : 1) * L.maxAngle * open);
  const x0 = left ? 0 : -L.w * sx, w = L.w * sx, h = L.h * sx, y0 = -L.h * 0.6 * sx;
  // při otevření je vidět tmavší spodní strana víka
  ctx.fillStyle = open > 0.15 ? '#2f333d' : L.color;
  rrect(ctx, x0, y0, w, h, h * 0.35); ctx.fill();
  ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = Math.max(0.6, h * 0.14); rrect(ctx, x0, y0, w, h, h * 0.35); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x0 + w * 0.08, y0 + h * 0.2, w * 0.84, h * 0.18);
  if (L.snow && open < 0.5) { ctx.fillStyle = `rgba(243,246,252,${(1 - open * 2).toFixed(3)})`; rrect(ctx, x0 + w * 0.12, y0 - h * 0.35, w * 0.76, h * 0.5, h * 0.25); ctx.fill(); }
  // úchyt na volném okraji
  ctx.fillStyle = '#2b2f38'; ctx.fillRect(left ? x0 + w - 3 * sx : x0, y0 + h * 0.25, 3 * sx, h * 0.5);
  ctx.restore();
}

function drawObject(ctx: Ctx, o: SceneObject, a: AssetEntry | undefined, img: ImageLike | null | undefined, lidOpen = 0) {
  const r = objectImageRect(o, a);
  if (!img) {
    ctx.save();
    ctx.fillStyle = 'rgba(150,150,160,0.55)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(90,90,100,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke();
    ctx.restore();
    return;
  }
  if (o.flipX) {
    ctx.save(); ctx.translate(r.x + r.w, r.y); ctx.scale(-1, 1);
    ctx.drawImage(img as CanvasImageSource, 0, 0, r.w, r.h); ctx.restore();
  } else ctx.drawImage(img as CanvasImageSource, r.x, r.y, r.w, r.h);
  if (a?.lid) drawLid(ctx, o, a, r, lidOpen);
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawCup(ctx: Ctx, x: number, y: number, s: number, sips = 0, tilt = 0) {
  // Papírový kelímek s víčkem; (x,y) = spodek kelímku. Naklonění kolem úchopu (6 j. nad spodkem).
  ctx.save(); ctx.translate(x, y - 6 * s); ctx.rotate(tilt); ctx.translate(0, 6 * s); ctx.scale(s, s);
  ctx.fillStyle = '#fbf6ee';
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(5.2, -11); ctx.lineTo(-5.2, -11); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c8553d'; ctx.fillRect(-4.8, -7.5, 9.6, 3.5);
  ctx.fillStyle = '#5b3a29'; ctx.fillRect(-5.8, -13, 11.6, 2.4);
  if (sips >= 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3.5, -10.5, 1.5, 9); }
  ctx.restore();
}

/** Papírová taška se zbožím (malovaný styl kelímku); (x,y) = úchop v uchu, taška visí dolů. */
const BAG_COLORS: Record<string, [string, string]> = { pernik: ['#b98a5a', '#7a4a2c'], hracky: ['#c9b48a', '#a33a32'], pletene: ['#a89c8c', '#3f5a7a'], zbozi: ['#bfa27c', '#6b5a43'] };
export function drawBag(ctx: Ctx, x: number, y: number, s: number, variant = 'zbozi') {
  const [paper, band] = BAG_COLORS[variant] ?? BAG_COLORS.zbozi;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  // ucho (provázek) – dvě poutka k ruce
  ctx.strokeStyle = 'rgba(70,50,35,0.85)'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(-3.2, 5); ctx.quadraticCurveTo(-1.5, -0.8, 0, 0); ctx.quadraticCurveTo(1.5, -0.8, 3.2, 5); ctx.stroke();
  // tělo tašky s mírným zúžením a měkkým stínováním
  const g = ctx.createLinearGradient(-6, 0, 6, 0);
  g.addColorStop(0, shadeHex(paper, 0.82)); g.addColorStop(0.45, paper); g.addColorStop(1, shadeHex(paper, 0.7));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-5.6, 4.5); ctx.lineTo(5.6, 4.5); ctx.lineTo(6, 17); ctx.lineTo(-6, 17); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shadeHex(paper, 0.6); ctx.fillRect(-5.6, 4.5, 11.2, 1.1); // přehnutý okraj
  ctx.fillStyle = band; ctx.globalAlpha = 0.85; ctx.fillRect(-5.8, 10, 11.7, 2.4); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(40,30,50,0.18)'; ctx.fillRect(2.8, 4.5, 3.2, 12.5); // zadní stěna ve stínu
  ctx.restore();
}
function shadeHex(h: string, k: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h)!;
  return `rgb(${[1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) * k)).join(',')})`;
}
/** Rekvizita podle druhu (kelímek nebo taška). */
function drawProp(ctx: Ctx, p: PropState, x: number, y: number, s: number, tilt = 0) {
  if (p.kind === 'bag') drawBag(ctx, x, y - 17 * s, s, p.variant);
  else drawCup(ctx, x, y, s, p.sips, tilt);
}

function drawShadow(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = 'rgba(60,70,100,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y, 17 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
}

/** Barva pozadí v daném místě (zmenšená kopie pozadí, vytvoří se jednou) – pro závěje u bot. */
const bgSample = new WeakMap<object, { w: number; h: number; d: Uint8ClampedArray; sx: number; sy: number }>();
function backgroundColorAt(project: ProjectFile, images: AssetImages, x: number, y: number): string | undefined {
  const id = project.scene.backgroundAssetId;
  const img = id ? (images.get(id) as unknown as { width: number; height: number } | undefined) : undefined;
  if (!img) return undefined;
  let s = bgSample.get(img);
  if (!s) {
    const f = getCanvasFactory();
    if (!f) return undefined;
    const w = 480, h = Math.round((480 * project.scene.height) / project.scene.width);
    const c = f(w, h); const cx = c.getContext('2d') as CanvasRenderingContext2D;
    cx.drawImage(img as unknown as CanvasImageSource, 0, 0, w, h);
    s = { w, h, d: cx.getImageData(0, 0, w, h).data, sx: w / project.scene.width, sy: h / project.scene.height };
    bgSample.set(img, s);
  }
  // průměr malé oblasti těsně pod chodidly (sníh kolem boty), mírně zesvětlený
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const px = Math.min(s.w - 1, Math.max(0, Math.round(x * s.sx) + dx)), py = Math.min(s.h - 1, Math.max(0, Math.round(y * s.sy) + dy));
    const i = (py * s.w + px) * 4; r += s.d[i]; g += s.d[i + 1]; b += s.d[i + 2]; n++;
  }
  const L = (v: number) => Math.min(255, Math.round((v / n) * 0.97));
  return `rgb(${L(r)},${L(g)},${L(b)})`;
}

function drawAgent(ctx: Ctx, project: ProjectFile, sim: Simulation, a: AgentState, cupScaleFallback: number, images: AssetImages) {
  const c = sim.characterOf(a.id);
  if (!c) return;
  const m = sim.manifests[c.assetId];
  if (!m) return;
  const cv = characterVisual(a, m, c, project.scene);
  drawShadow(ctx, cv.x, cv.y, cv.scale);
  // teplé světlo luceren na postavě (jen v její alfě, izolovaná ROI – B.5)
  const lit = litCtx ? characterLightAt(project, litCtx.objects, litCtx.assets, { x: cv.x, y: cv.y }, litCtx.t) : { g: 0, color: '', dx: 0 };
  if (lit.g > 0.006) {
    const H = 150 * cv.scale, W = 90 * cv.scale;
    const rect = { x: cv.x - W / 2, y: cv.y - H, w: W, h: H + 6 * cv.scale };
    if (drawLitROI(ctx, rect, (c) => drawAgentBody(c, project, sim, a, cv, m, images), (c) => warmOverlay(c, rect, lit.g, lit.color, lit.dx, 0.55))) return;
  }
  drawAgentBody(ctx, project, sim, a, cv, m, images);
  void cupScaleFallback;
}
function drawAgentBody(ctx: Ctx, project: ProjectFile, sim: Simulation, a: AgentState, cv: ReturnType<typeof characterVisual>, m: Simulation['manifests'][string], images: AssetImages) {
  const c = sim.characterOf(a.id)!;
  ctx.save();
  ctx.translate(cv.x, cv.y);
  ctx.scale(cv.mirror ? -cv.scale : cv.scale, cv.scale);
  const held = a.holding ? sim.state.props.find((p) => p.id === a.holding) : undefined;
  if (m.backend === 'skeleton' && cv.rig && m.rigLibrary) {
    const snowColor = cv.rig.snowLips ? backgroundColorAt(project, images, cv.x, cv.y + 3 * cv.scale) : undefined;
    drawRig(ctx, cv.rig, images, m.rigLibraryDir ?? '', m.rigLibrary.bodyTemplates[0]?.farShade ?? 0.8, held ? () => (held.kind === 'bag' ? drawBag(ctx, cv.grip.x, cv.grip.y + 1, 1, held.variant) : drawCup(ctx, cv.grip.x, cv.grip.y + 6, 1, held.sips, cv.pose.cupTilt ?? 0)) : undefined, snowColor);
  } else if (m.backend === 'procedural-test-figure') {
    drawFigure(ctx, cv.pose as Parameters<typeof drawFigure>[1], c.palette, held ? () => drawCup(ctx, cv.pose.handR.x, cv.pose.handR.y + 6, 1, held.sips) : undefined);
  } else {
    // Backend zatím není implementován – zástupný obrys (viz diagnostika).
    ctx.fillStyle = 'rgba(120,120,140,0.6)'; ctx.fillRect(-12, -m.height, 24, m.height);
  }
  ctx.restore();
}

/** Kontext světel pro aktuální snímek (objekty se zapuštěním a čas). */
let litCtx: { objects: SceneObject[]; assets: Map<string, AssetEntry>; t: number } | null = null;

/**
 * Vykreslí obsah do izolované dočasné plochy (ROI v rozlišení výstupu), upraví ho jen v jeho
 * alfě (`source-atop`) a vloží do scény. Hlavní plátno se nikdy nemaskuje. Vrací false, když
 * plátna nejsou k dispozici (pak volající kreslí přímo).
 */
let roiPool: { c: { width: number; height: number; getContext(k: '2d'): unknown } } | null = null;
function drawLitROI(ctx: Ctx, rect: { x: number; y: number; w: number; h: number }, draw: (c: Ctx) => void, fx: (c: Ctx) => void): boolean {
  const f = getCanvasFactory();
  const tr = (ctx as unknown as { getTransform?: () => { a: number } }).getTransform?.();
  if (!f || !tr) return false;
  const k = Math.max(0.25, tr.a);
  const w = Math.max(1, Math.ceil(rect.w * k)), h = Math.max(1, Math.ceil(rect.h * k));
  if (!roiPool || roiPool.c.width < w || roiPool.c.height < h) roiPool = { c: f(Math.max(w, roiPool?.c.width ?? 0), Math.max(h, roiPool?.c.height ?? 0)) as never };
  const c = roiPool.c.getContext('2d') as Ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w + 1, h + 1);
  c.imageSmoothingEnabled = true;
  c.setTransform(k, 0, 0, k, -rect.x * k, -rect.y * k);
  draw(c);
  c.save(); c.globalCompositeOperation = 'source-atop'; fx(c); c.restore();
  c.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(roiPool.c as unknown as CanvasImageSource, 0, 0, w, h, rect.x, rect.y, w / k, h / k);
  return true;
}
/** Teplé světlo z boku lucerny, silnější nahoře (hlava, ramena); odvrácená strana zůstává chladná. */
function warmOverlay(c: Ctx, rect: { x: number; y: number; w: number; h: number }, g: number, color: string, dx: number, topBias: number) {
  const gx = c.createLinearGradient(dx >= 0 ? rect.x : rect.x + rect.w, 0, dx >= 0 ? rect.x + rect.w : rect.x, 0);
  const col = hexRgb(color);
  gx.addColorStop(0, `rgba(${col},0)`); gx.addColorStop(1, `rgba(${col},${(g * 1.4).toFixed(4)})`);
  c.fillStyle = gx; c.fillRect(rect.x, rect.y, rect.w, rect.h);
  const gy = c.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  gy.addColorStop(0, `rgba(${col},${(g * 0.6).toFixed(4)})`); gy.addColorStop(topBias, `rgba(${col},${(g * 0.25).toFixed(4)})`); gy.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = gy; c.fillRect(rect.x, rect.y, rect.w, rect.h);
}
function hexRgb(h: string): string { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)).join(',') : '255,214,160'; }

/** Obrys podrážky (metry; u = podél boty od středu, v = napříč): pata užší, přednoží širší. */
const SOLE: { u: number; v: number }[] = (() => {
  const L = 0.151 / 2, out: { u: number; v: number }[] = [];
  const width = (u: number) => { const t = (u / L + 1) / 2; return t < 0.35 ? 0.052 + (0.044 - 0.052) * (t / 0.35) : t < 0.55 ? 0.044 : 0.044 + (0.072 - 0.044) * Math.min(1, (t - 0.55) / 0.3); };
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2, u = L * Math.cos(a); out.push({ u, v: (width(u) / 2) * Math.sin(a) }); }
  return out;
})();

/**
 * Stopy ve sněhu: otisky na zemi promítnuté kamerou (do hloubky se zkrátí), jen v oblastech sněhu,
 * pod všemi objekty a postavami. Na konci životnosti plynule slábnou.
 */
function drawFootprints(ctx: Ctx, project: ProjectFile, sim: Simulation, time: number) {
  const fps = sim.state.footprints;
  const snow = project.areas.filter((a) => a.kind === 'snow' && a.polygon.length >= 3);
  if (!fps?.length || !snow.length) return;
  const cam = cameraFor(project.scene);
  ctx.save();
  ctx.beginPath();
  for (const a of snow) { a.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
  ctx.clip();
  for (const f of fps) {
    const age = time - f.t0;
    if (age < 0) continue;
    const fade = Math.min(1, age / 0.15) * Math.min(1, Math.max(0, (FOOTPRINT_LIFE - age) / FOOTPRINT_FADE));
    if (fade <= 0) continue;
    const c = Math.cos(f.yaw), sn = Math.sin(f.yaw), j = ((f.seed % 97) / 97 - 0.5) * 0.06; // drobná odchylka tvaru
    const pts = SOLE.map((q) => toScreen(cam, { X: f.X + (q.u * c - q.v * (1 + j) * sn) * f.size, Z: f.Z + (q.u * sn + q.v * (1 + j) * c) * f.size }));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    if (maxX < 0 || minX > project.scene.width || maxY < 0 || minY > project.scene.height) continue;
    if (Math.max(maxX - minX, maxY - minY) < 0.35) continue; // daleko: neviditelné
    // čitelnost: otisk aspoň ~1,2 px vysoký (jen vykreslení, ne fyzická stopa – zadání D4)
    const hgt = maxY - minY;
    if (hgt < 1.2) { const cy = (minY + maxY) / 2, k = 1.2 / Math.max(1e-3, hgt); for (const p of pts) p.y = cy + (p.y - cy) * k; minY = cy - 0.6; maxY = cy + 0.6; }
    const path = (dy: number) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy))); ctx.closePath(); };
    // vyhrnutý světlý okraj (o kousek výš), pak studená prohlubeň
    const rim = Math.max(0.35, (maxY - minY) * 0.18);
    ctx.fillStyle = `rgba(255,255,255,${(0.13 * fade).toFixed(3)})`; path(-rim); ctx.fill();
    ctx.fillStyle = `rgba(46,62,104,${(0.2 * fade).toFixed(3)})`; path(0); ctx.fill();
  }
  ctx.restore();
}

/**
 * Prodavač ve stánku: postava za pultem (ve stavu klidu), vidět jen v okně stánku nad pultem.
 * Když zákazník objednává, mluví s ním a natočí se k němu; při předání podává zboží.
 */
function drawSeller(ctx: Ctx, project: ProjectFile, sim: Simulation, o: SceneObject, images: AssetImages) {
  const sl = o.seller!;
  const m = sim.manifests[sl.assetId];
  if (!m || m.backend !== 'skeleton') return;
  const t = sim.time();
  const pos = objectLocalToScene(o, sl.offset);
  // stav prodavače ze simulace (attend / retrieve / handover / tidy)
  const vs = sim.state.vendors?.[o.id];
  const cust = vs?.customerId ? sim.state.agents.find((a) => a.id === vs.customerId) : undefined;
  const seed = hashNoise(o.id.length * 31 + o.x, 7) * 10;
  const since = vs ? t - vs.since : 0;
  // při přípravě zboží se otočí k regálu (zády), jinak k zákazníkovi nebo do volného prostoru
  const dir = vs?.mode === 'retrieve' && since > 0.4 && since < 2.2 ? (seed > 5 ? 'NE' : 'NW') : cust ? (cust.pos.x < pos.x ? 'SW' : 'SE') : seed > 5 ? 'SE' : 'SW';
  const anim = { dir, walkPhase: 0, walkBlend: 0, idleTime: t + seed, action: null as AgentState['anim']['action'] } as AgentState['anim'];
  if (vs?.mode === 'attend' && cust?.activity?.phase === 'order') {
    // rozhovor se zákazníkem řídí režisér (prodavač je jeho virtuální účastník): mluví ve svých
    // tazích a na akcentech frází občas zdůrazní řeč rukou; když mluví zákazník, poslouchá
    const vid = `v:${o.id}`;
    const conv = sim.state.social?.convs.find((c) => c.members.includes(vid));
    const turn = conv?.turns.find((x) => x.speaker === vid && x.start <= t && t < x.end);
    anim.speaking = !!turn;
    if (turn) {
      const ph = turn.phrases.find((p, i) => (turn.id + i) % 2 === 0 && t >= p.accent - 0.62 && t < p.accent - 0.62 + 1.4);
      if (ph) anim.gestures = [{ fam: 'beat', t: t - (ph.accent - 0.62), dur: 1.4, hand: 0, amp: 0.9, sgn: 1 }];
    }
  } else if (vs?.mode === 'retrieve' || vs?.mode === 'tidy') {
    // sáhne do regálu / srovná zboží na pultu (krátké opakované dosahy)
    const per = vs.mode === 'retrieve' ? 1.6 : 1.3;
    anim.action = { requested: 'drop', clip: 'drop', time: (since % per) / per * 1.1, duration: 1.1, loop: 'once', events: [], finished: false };
  } else if (vs?.mode === 'handover' && cust?.activity) {
    anim.action = { requested: 'receive', clip: 'receive', time: Math.min(1.1, t - cust.activity.phaseStart), duration: 1.1, loop: 'once', events: [], finished: false };
  }
  const agent = { id: 'seller:' + o.id, name: sl.name ?? 'Prodavač', pos, facing: dir === 'SE' ? 0.6 : Math.PI - 0.6, anim, holding: null } as unknown as AgentState;
  const cv = characterVisual(agent, m, { baseScale: 1, appearance: sl.appearance }, project.scene);
  if (!cv.rig || !m.rigLibrary) return;
  const a0 = objectLocalToScene(o, { x: sl.window.x0, y: sl.window.y0 }), a1 = objectLocalToScene(o, { x: sl.window.x1, y: sl.window.y1 });
  const win = { x: Math.min(a0.x, a1.x), y: a0.y, w: Math.abs(a1.x - a0.x), h: a1.y - a0.y };
  const body = (c: Ctx) => {
    c.save();
    c.beginPath(); c.rect(win.x, win.y, win.w, win.h); c.clip();
    c.translate(cv.x, cv.y);
    c.scale(cv.mirror ? -cv.scale : cv.scale, cv.scale);
    drawRig(c as unknown as CanvasRenderingContext2D, cv.rig!, images, m.rigLibraryDir ?? '', m.rigLibrary!.bodyTemplates[0]?.farShade ?? 0.8);
    c.restore();
  };
  // prodavač je uvnitř: pod střechou zastíněný (interiorShade 0,10–0,22), od luceren teplé světlo
  const integ = !!o.integration?.lights.enabled;
  const fx = (c: Ctx) => {
    const g = c.createLinearGradient(0, win.y, 0, win.y + win.h);
    g.addColorStop(0, 'rgba(28,24,46,0.22)'); g.addColorStop(0.55, 'rgba(28,24,46,0.12)'); g.addColorStop(1, 'rgba(28,24,46,0.06)');
    c.fillStyle = g; c.fillRect(win.x, win.y, win.w, win.h);
    if (integ) warmOverlay(c, win, 0.13 * (o.integration!.lights.gain), '#FFD6A0', 0, 0.6);
  };
  if (!(integ || o.integration) || !drawLitROI(ctx, win, body, fx)) body(ctx);
}

/** Vykreslí scénu do kontextu, jehož transformace mapuje logické souřadnice scény na výstup. */
export function drawScene(ctx: Ctx, project: ProjectFile, sim: Simulation | null, images: AssetImages, opts: DrawOptions) {
  const sc = project.scene;
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  ctx.fillStyle = sc.backgroundColor; ctx.fillRect(0, 0, sc.width, sc.height);
  if (sc.backgroundAssetId) {
    const img = images.get(sc.backgroundAssetId);
    if (img) ctx.drawImage(img as CanvasImageSource, 0, 0, sc.width, sc.height);
  }
  const removed = new Set(sim?.state.removedObjects ?? []);
  const visible = project.objects.map((o, i) => ({ o, i })).filter(({ o }) => o.visible && !removed.has(o.id));
  const fixed = (layer: 'background' | 'foreground') => visible.filter(({ o }) => o.layer === layer).sort((a, b) => a.o.zBias - b.o.zBias || a.i - b.i);
  for (const { o } of fixed('background')) drawObject(ctx, o, assets.get(o.assetId), images.get(o.assetId));
  if (sim) drawFootprints(ctx, project, sim, sim.time());
  const worldObjs = visible.filter(({ o }) => o.layer === 'world').map(({ o }) => o);
  drawGroundIntegration(ctx, project, worldObjs, assets, opts.time);
  litCtx = { objects: worldObjs.filter((o) => o.integration), assets, t: opts.time };

  // Světová vrstva: řazení podle bodu kontaktu se zemí (+ ruční úprava pořadí).
  type Item = { key: number; tie: number; draw: () => void };
  const items: Item[] = [];
  const objKey = new Map<string, number>();
  for (const { o, i } of visible) if (o.layer === 'world') {
    const key = o.y + o.zBias; objKey.set(o.id, key);
    items.push({ key, tie: i, draw: () => {
      const as = assets.get(o.assetId), im = images.get(o.assetId);
      drawObject(ctx, o, as, (o.integration && as ? gradedImage(o, as, im, project) : im) as typeof im, sim ? lidOpenness(sim.state, o.id, sim.time()) : 0);
      if (o.seller && sim) drawSeller(ctx, project, sim, o, images);
      if (o.integration && as) drawObjectIntegration(ctx, project, o, as, opts.time, backgroundColorAt(project, images, o.x, o.y + 6));
    } });
  }
  if (sim) {
    for (const a of sim.state.agents) if (!a.hidden) items.push({ key: a.pos.y, tie: 10000 + sim.state.agents.indexOf(a), draw: () => drawAgent(ctx, project, sim, a, 1, images) });
    for (const p of sim.state.props) {
      const s = depthScaleAt(sc.depth, propY(p)) * 1.0;
      if (p.place.kind === 'counter') {
        const pl = p.place;
        const age = opts.time - p.appearedAt;
        const pop = 0.6 + 0.4 * smoothstep(clamp(age / 0.3, 0, 1));
        items.push({ key: (objKey.get(pl.objectId) ?? pl.y) + 0.5, tie: 20000, draw: () => drawProp(ctx, p, pl.x, pl.y, s * pop) });
      } else if (p.place.kind === 'ground') {
        const pl = p.place;
        items.push({ key: pl.y, tie: 20000, draw: () => drawProp(ctx, p, pl.x, pl.y, s) });
      } else if (p.place.kind === 'falling') {
        const pl = p.place;
        const k = clamp((opts.time - pl.t0) / Math.max(1e-3, pl.t1 - pl.t0), 0, 1);
        const x = pl.from.x + (pl.to.x - pl.from.x) * k, y = pl.from.y + (pl.to.y - pl.from.y) * k * k - Math.sin(k * Math.PI) * 10;
        items.push({ key: (objKey.get(pl.binId) ?? pl.to.y) - 0.5, tie: 20000, draw: () => drawCup(ctx, x, y + 6, s * (1 - 0.25 * k), p.sips) });
      }
    }
  }
  items.sort((a, b) => a.key - b.key || a.tie - b.tie);
  for (const it of items) it.draw();

  for (const { o } of fixed('foreground')) drawObject(ctx, o, assets.get(o.assetId), images.get(o.assetId));
  if (sc.snowfall.enabled) drawSnowfall(ctx, project, opts.time);
}

function propY(p: PropState): number {
  switch (p.place.kind) { case 'counter': case 'ground': return p.place.y; case 'falling': return p.place.to.y; default: return 800; }
}

/** Deterministické sněžení: poloha vločky je čistá funkce (seed, index, čas). */
export function drawSnowfall(ctx: Ctx, project: ProjectFile, t: number) {
  const { width: W, height: H } = project.scene;
  const n = Math.round(project.scene.snowfall.density * 420);
  const wind = project.scene.snowfall.wind;
  const seed = project.seed;
  for (let i = 0; i < n; i++) {
    const depth = hashNoise(seed, i, 1); // 0 = daleko, 1 = blízko
    const size = 1.2 + depth * 3.2;
    const speed = 22 + depth * 55;
    const y0 = hashNoise(seed, i, 2) * (H + 40);
    const x0 = hashNoise(seed, i, 3) * W;
    const sway = 6 + hashNoise(seed, i, 4) * 14, freq = 0.3 + hashNoise(seed, i, 5) * 0.6, ph = hashNoise(seed, i, 6) * 6.283;
    const y = ((y0 + t * speed) % (H + 40)) - 20;
    let x = x0 + Math.sin(t * freq + ph) * sway + wind * speed * t;
    x = ((x % (W + 20)) + W + 20) % (W + 20) - 10;
    ctx.fillStyle = `rgba(255,255,255,${0.45 + depth * 0.45})`;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
}

/** Vykreslí jeden výstupní snímek v daném rozlišení (export / náhled bez editorových značek). */
export function renderFrame(ctx: Ctx, outW: number, outH: number, project: ProjectFile, sim: Simulation | null, images: AssetImages, time: number) {
  ctx.setTransform(outW / project.scene.width, 0, 0, outH / project.scene.height, 0, 0);
  ctx.imageSmoothingEnabled = true;
  (ctx as Ctx & { imageSmoothingQuality?: string }).imageSmoothingQuality = 'high';
  drawScene(ctx, project, sim, images, { time });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
