/**
 * Vykreslení scény v logických souřadnicích. Čistá funkce: projekt + stav simulace → obraz.
 * Neobsahuje editorové značky ani nekontrolovanou náhodu. Používá ji náhled i export.
 */
import type { ProjectFile, SceneObject, AssetEntry } from '../model/types';
import type { Simulation } from '../sim/simulation';
import type { AgentState, PropState } from '../sim/types';
import { characterVisual } from './characterPose';
import { drawFigure } from '../anim/testFigure';
import { drawRig } from './rigRenderer';
import { depthScaleAt } from '../scene/geometry';
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

function drawObject(ctx: Ctx, o: SceneObject, a: AssetEntry | undefined, img: ImageLike | null | undefined) {
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
}

export function drawCup(ctx: Ctx, x: number, y: number, s: number, sips = 0) {
  // Papírový kelímek s víčkem; (x,y) = spodek kelímku.
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#fbf6ee';
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(5.2, -11); ctx.lineTo(-5.2, -11); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c8553d'; ctx.fillRect(-4.8, -7.5, 9.6, 3.5);
  ctx.fillStyle = '#5b3a29'; ctx.fillRect(-5.8, -13, 11.6, 2.4);
  if (sips >= 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3.5, -10.5, 1.5, 9); }
  ctx.restore();
}

function drawShadow(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = 'rgba(60,70,100,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y, 17 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
}

function drawAgent(ctx: Ctx, project: ProjectFile, sim: Simulation, a: AgentState, cupScaleFallback: number, images: AssetImages) {
  const c = sim.characterOf(a.id);
  if (!c) return;
  const m = sim.manifests[c.assetId];
  if (!m) return;
  const cv = characterVisual(a, m, c, project.scene.depth);
  drawShadow(ctx, cv.x, cv.y, cv.scale);
  ctx.save();
  ctx.translate(cv.x, cv.y);
  ctx.scale(cv.mirror ? -cv.scale : cv.scale, cv.scale);
  const held = a.holding ? sim.state.props.find((p) => p.id === a.holding) : undefined;
  if (m.backend === 'skeleton' && cv.rig && m.rigLibrary) {
    drawRig(ctx, cv.rig, images, m.rigLibraryDir ?? '', m.rigLibrary.bodyTemplates[0]?.farShade ?? 0.8, held ? () => drawCup(ctx, cv.grip.x, cv.grip.y + 6, 1, held.sips) : undefined);
  } else if (m.backend === 'procedural-test-figure') {
    drawFigure(ctx, cv.pose as Parameters<typeof drawFigure>[1], c.palette, held ? () => drawCup(ctx, cv.pose.handR.x, cv.pose.handR.y + 6, 1, held.sips) : undefined);
  } else {
    // Backend zatím není implementován – zástupný obrys (viz diagnostika).
    ctx.fillStyle = 'rgba(120,120,140,0.6)'; ctx.fillRect(-12, -m.height, 24, m.height);
  }
  ctx.restore();
  void cupScaleFallback;
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

  // Světová vrstva: řazení podle bodu kontaktu se zemí (+ ruční úprava pořadí).
  type Item = { key: number; tie: number; draw: () => void };
  const items: Item[] = [];
  const objKey = new Map<string, number>();
  for (const { o, i } of visible) if (o.layer === 'world') {
    const key = o.y + o.zBias; objKey.set(o.id, key);
    items.push({ key, tie: i, draw: () => drawObject(ctx, o, assets.get(o.assetId), images.get(o.assetId)) });
  }
  if (sim) {
    for (const a of sim.state.agents) items.push({ key: a.pos.y, tie: 10000 + sim.state.agents.indexOf(a), draw: () => drawAgent(ctx, project, sim, a, 1, images) });
    for (const p of sim.state.props) {
      const s = depthScaleAt(sc.depth, propY(p)) * 1.0;
      if (p.place.kind === 'counter') {
        const pl = p.place;
        const age = opts.time - p.appearedAt;
        const pop = 0.6 + 0.4 * smoothstep(clamp(age / 0.3, 0, 1));
        items.push({ key: (objKey.get(pl.objectId) ?? pl.y) + 0.5, tie: 20000, draw: () => drawCup(ctx, pl.x, pl.y, s * pop, p.sips) });
      } else if (p.place.kind === 'ground') {
        const pl = p.place;
        items.push({ key: pl.y, tie: 20000, draw: () => drawCup(ctx, pl.x, pl.y, s, p.sips) });
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
