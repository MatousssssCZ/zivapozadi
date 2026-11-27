import type { ProjectFile } from '../model/types';
import type { CharacterManifest } from '../anim/manifest';
import { Simulation } from '../sim/simulation';
import type { SimState } from '../sim/types';
import type { ExportPlan } from './plan';

/** Strana enkodéru (Node: přímo; Electron: přes IPC do hlavního procesu). */
export interface EncoderHost {
  /** Připraví pracovní složku; vrátí index první nehotové části a její checkpoint (při navázání). */
  prepare(plan: ExportPlan): Promise<{ firstChunk: number; checkpoint: SimState | null; discardedStale: boolean }>;
  saveCheckpoint(chunkIndex: number, state: SimState): Promise<void>;
  beginChunk(chunkIndex: number): Promise<void>;
  /** Předá snímek; vrací se, až ho enkodér převezme (omezená fronta ⇒ omezená paměť). */
  writeFrame(rgba: Uint8Array): Promise<void>;
  /** Volitelně: snímek přímo z plátna (bez vyčítání pixelů – prohlížeč / WebCodecs). */
  writeCanvasFrame?(canvas: unknown): Promise<void>;
  endChunk(chunkIndex: number): Promise<void>;
  finalize(): Promise<{ outputPath: string }>;
  abort(): Promise<void>;
}

export interface FrameRenderer {
  render(sim: Simulation, time: number): Uint8Array | Promise<Uint8Array>;
  /** Volitelně: jen vykreslit do plátna (pro `writeCanvasFrame`). */
  draw?(sim: Simulation, time: number): unknown;
}

export interface ExportProgress {
  framesDone: number; totalFrames: number; chunk: number; chunks: number;
  elapsedSec: number; etaSec: number | null; fpsRate: number; phase: 'render' | 'finalize' | 'done';
  resumedFromChunk: number;
}

export interface ExportResult { outputPath: string; frames: number; elapsedSec: number; resumedFromChunk: number; discardedStale: boolean; finalStateHash: string }

export class ExportCancelled extends Error { constructor() { super('Export byl zrušen.'); this.name = 'ExportCancelled'; } }

/**
 * Export po snímcích: pro každý snímek posune simulaci na přesný čas, vykreslí ho v cílovém rozlišení
 * a předá enkodéru. Na začátku každé části uloží checkpoint (stav simulace včetně RNG).
 * Průběh nezávisí na rychlosti počítače – žádné snímky se nevynechávají.
 */
export async function runExport(
  project: ProjectFile, manifests: Record<string, CharacterManifest>, plan: ExportPlan,
  host: EncoderHost, renderer: FrameRenderer,
  opts: { onProgress?: (p: ExportProgress) => void; signal?: { cancelled: boolean }; now?: () => number; stopAfterChunks?: number } = {},
): Promise<ExportResult> {
  const now = opts.now ?? (() => Date.now() / 1000);
  const t0 = now();
  const prep = await host.prepare(plan);
  const first = prep.firstChunk;
  let sim: Simulation;
  if (first >= plan.chunks.length) {
    // Všechny části hotové (např. selhalo jen spojení) – rovnou finalizace.
    const out = await host.finalize();
    return { outputPath: out.outputPath, frames: plan.totalFrames, elapsedSec: now() - t0, resumedFromChunk: first, discardedStale: prep.discardedStale, finalStateHash: '' };
  }
  if (first > 0 && prep.checkpoint) {
    sim = Simulation.restore(project, manifests, prep.checkpoint);
    const expected = plan.chunks[first].startFrame * plan.stepsPerFrame;
    if (sim.state.step !== expected) throw new Error(`Checkpoint neodpovídá části ${first} (krok ${sim.state.step} ≠ ${expected}).`);
  } else {
    sim = Simulation.create(project, manifests);
  }
  const framesBefore = plan.chunks[first].startFrame;
  let done = framesBefore;
  let pending: Promise<void> | null = null;
  let chunksThisRun = 0;
  try {
    for (let ci = first; ci < plan.chunks.length; ci++) {
      const ch = plan.chunks[ci];
      if (ci === first) await host.saveCheckpoint(ci, sim.snapshot());
      await host.beginChunk(ci);
      for (let f = ch.startFrame; f < ch.endFrame; f++) {
        if (opts.signal?.cancelled) throw new ExportCancelled();
        const targetStep = f * plan.stepsPerFrame;
        while (sim.state.step < targetStep) sim.step();
        // překrytí: kodér zpracovává předchozí snímek, zatímco se kreslí další (nejvýš jeden v letu)
        if (renderer.draw && host.writeCanvasFrame) { const cv = renderer.draw(sim, f / plan.fps); if (pending) await pending; pending = host.writeCanvasFrame(cv); }
        else { const rgba = await renderer.render(sim, f / plan.fps); if (pending) await pending; pending = host.writeFrame(rgba); }
        done++;
        const el = now() - t0;
        const rate = (done - framesBefore) / Math.max(1e-6, el);
        opts.onProgress?.({ framesDone: done, totalFrames: plan.totalFrames, chunk: ci, chunks: plan.chunks.length, elapsedSec: el, etaSec: rate > 0 ? (plan.totalFrames - done) / rate : null, fpsRate: rate, phase: 'render', resumedFromChunk: first });
      }
      // Checkpoint další části = přesný stav simulace v jejím prvním snímku (vč. RNG).
      // Ukládá se dřív, než je část označena za hotovou ⇒ hotová část má vždy navazující checkpoint.
      if (ci + 1 < plan.chunks.length) {
        const nextStep = plan.chunks[ci + 1].startFrame * plan.stepsPerFrame;
        while (sim.state.step < nextStep) sim.step();
        await host.saveCheckpoint(ci + 1, sim.snapshot());
      }
      if (pending) { await pending; pending = null; }
      await host.endChunk(ci);
      chunksThisRun++;
      if (opts.stopAfterChunks !== undefined && chunksThisRun >= opts.stopAfterChunks && ci < plan.chunks.length - 1) {
        // Testovací přerušení (simulace pádu/zrušení po dokončené části).
        throw new ExportCancelled();
      }
    }
  } catch (e) {
    await host.abort().catch(() => {});
    throw e;
  }
  opts.onProgress?.({ framesDone: done, totalFrames: plan.totalFrames, chunk: plan.chunks.length - 1, chunks: plan.chunks.length, elapsedSec: now() - t0, etaSec: 0, fpsRate: 0, phase: 'finalize', resumedFromChunk: first });
  const out = await host.finalize();
  opts.onProgress?.({ framesDone: done, totalFrames: plan.totalFrames, chunk: plan.chunks.length - 1, chunks: plan.chunks.length, elapsedSec: now() - t0, etaSec: 0, fpsRate: 0, phase: 'done', resumedFromChunk: first });
  return { outputPath: out.outputPath, frames: done, elapsedSec: now() - t0, resumedFromChunk: first, discardedStale: prep.discardedStale, finalStateHash: sim.stateHash() };
}
