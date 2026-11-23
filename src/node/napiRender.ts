/** Vykreslování v Node (CLI export a testy) přes @napi-rs/canvas (Skia) – tentýž kód rendereru jako v aplikaci. */
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { setCanvasFactory, rigImageKey } from '../core/render/rigRenderer';
setCanvasFactory((w, h) => createCanvas(w, h) as never);
import type { LoadedProject } from './projectIO';
import { resolveInside } from './projectIO';
import type { AssetImages } from '../core/render/sceneRenderer';
import { renderFrame } from '../core/render/sceneRenderer';
import type { Simulation } from '../core/sim/simulation';

export async function loadNodeImages(lp: LoadedProject): Promise<AssetImages> {
  const map = new Map<string, Image>();
  for (const a of lp.project.assets) {
    if (a.kind !== 'image' || lp.missingAssets.includes(a.id)) continue;
    try { map.set(a.id, await loadImage(resolveInside(lp.dir, a.file))); } catch { /* zástupný obdélník */ }
  }
  // díly skládaných postav
  for (const m of Object.values(lp.manifests)) {
    if (!m.rigLibrary || m.rigLibraryDir === undefined) continue;
    for (const p of m.rigLibrary.parts) for (const f of [p.texture, p.mask]) {
      if (!f) continue; const k = rigImageKey(m.rigLibraryDir, f);
      if (!map.has(k)) { try { map.set(k, await loadImage(resolveInside(lp.dir, `${m.rigLibraryDir}/${f}`))); } catch { /* chybějící díl */ } }
    }
  }
  return { get: (id) => map.get(id) ?? null };
}

export function createNodeFrameRenderer(lp: LoadedProject, images: AssetImages, w: number, h: number) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  return {
    canvas,
    render(sim: Simulation | null, time: number): Uint8Array {
      renderFrame(ctx, w, h, lp.project, sim, images, time);
      const data = ctx.getImageData(0, 0, w, h).data;
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    },
    png(): Buffer { return canvas.toBuffer('image/png'); },
  };
}
