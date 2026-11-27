import { runExport, type EncoderHost, type FrameRenderer, type ExportProgress, type ExportResult } from '../core/export/runExport';
import type { ExportPlan } from '../core/export/plan';
import { renderFrame } from '../core/render/sceneRenderer';
import type { ProjectFile } from '../core/model/types';
import type { CharacterManifest } from '../core/anim/manifest';
import type { AssetImages } from '../core/render/sceneRenderer';
import { zs } from './api';

/** Enkodér přes IPC (FFmpeg běží v hlavním procesu). `writeFrame` čeká na převzetí ⇒ omezená fronta. */
export function ipcEncoderHost(outputPath: string, projectDir: string): EncoderHost {
  return {
    prepare: (plan) => zs().exportPrepare(outputPath, projectDir, plan),
    saveCheckpoint: (i, st) => zs().exportSaveCheckpoint(i, st),
    beginChunk: (i) => zs().exportBeginChunk(i),
    writeFrame: (buf) => zs().exportFrame(buf),
    ...(zs().exportCanvasFrame ? { writeCanvasFrame: (cv: unknown) => zs().exportCanvasFrame!(cv as OffscreenCanvas) } : {}),
    endChunk: (i) => zs().exportEndChunk(i),
    finalize: () => zs().exportFinalize(),
    abort: () => zs().exportAbort(),
  };
}

/** Vykreslení snímku v cílovém rozlišení do OffscreenCanvas (stejný renderer jako náhled, bez značek). */
export function offscreenRenderer(project: ProjectFile, images: AssetImages, w: number, h: number, readback = true): FrameRenderer {
  const canvas = new OffscreenCanvas(w, h);
  // bez vyčítání pixelů (WebCodecs bere snímek z plátna) zůstane plátno na GPU – výrazně rychlejší kreslení
  const ctx = canvas.getContext('2d', { willReadFrequently: readback }) as unknown as CanvasRenderingContext2D;
  return {
    draw(sim, time) { renderFrame(ctx, w, h, project, sim, images, time); return canvas; },
    render(sim, time) {
      renderFrame(ctx, w, h, project, sim, images, time);
      const d = ctx.getImageData(0, 0, w, h).data;
      return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    },
  };
}

export async function exportVideo(project: ProjectFile, manifests: Record<string, CharacterManifest>, plan: ExportPlan, dir: string, outputPath: string, images: AssetImages,
  onProgress: (p: ExportProgress) => void, signal: { cancelled: boolean }): Promise<ExportResult> {
  const host = ipcEncoderHost(outputPath, dir);
  const renderer = offscreenRenderer(project, images, plan.width, plan.height, !zs().exportCanvasFrame);
  return runExport(project, manifests, plan, host, renderer, { onProgress, signal });
}
