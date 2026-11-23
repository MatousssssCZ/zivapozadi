import type { ProjectFile } from '../model/types';
import { canonicalJson, fingerprint } from '../model/hash';
import { STEPS_PER_SECOND, SIM_STATE_VERSION } from '../sim/types';
import { PROJECT_FORMAT_VERSION } from '../model/types';

export interface ChunkPlan { index: number; startFrame: number; endFrame: number /* exkluzivně */ }
export interface AudioPlan { file: string; sourceDurationSec: number; mode: 'loop' | 'silence' | 'trim' | 'exact' }

export interface ExportPlan {
  width: number; height: number; fps: number;
  durationSec: number; totalFrames: number; stepsPerFrame: number;
  chunkFrames: number; chunks: ChunkPlan[];
  audio: AudioPlan | null;
  crf: number; preset: string;
  diagnosticPng: boolean;
  /** Otisk projektu + nastavení exportu: checkpointy jsou platné jen pro shodný otisk. */
  jobHash: string;
}

export class ExportPlanError extends Error {}

export function parseResolution(r: string): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(r);
  if (!m) throw new ExportPlanError(`Neplatné rozlišení „${r}“.`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

/** Otisk obsahu projektu relevantního pro výsledné video (bez metadat a výstupní cesty). */
export function exportJobHash(project: ProjectFile): string {
  const { meta: _meta, export: ex, ...content } = project;
  const { outputPath: _o, ...exportRelevant } = ex;
  return fingerprint(canonicalJson({ content, exportRelevant, simVersion: SIM_STATE_VERSION, format: PROJECT_FORMAT_VERSION }));
}

export function planExport(project: ProjectFile, opts: { audioDurationSec?: number | null } = {}): ExportPlan {
  const ex = project.export;
  const { width, height } = parseResolution(ex.resolution);
  if (Math.abs(width / height - project.scene.width / project.scene.height) > 0.01)
    throw new ExportPlanError('Poměr stran exportu neodpovídá poměru stran scény.');
  const fps = ex.fps;
  if (STEPS_PER_SECOND % fps !== 0) throw new ExportPlanError(`Snímková frekvence ${fps} není dělitelem kroku simulace ${STEPS_PER_SECOND}.`);
  const audioAsset = ex.audioAssetId ? project.assets.find((a) => a.id === ex.audioAssetId && a.kind === 'audio') : undefined;
  if (ex.audioAssetId && !audioAsset) throw new ExportPlanError('Vybraný hudební soubor není v projektu.');
  const audioDur = audioAsset ? (opts.audioDurationSec ?? audioAsset.durationSec ?? null) : null;
  if (audioAsset && (!audioDur || audioDur <= 0)) throw new ExportPlanError('Nelze zjistit délku hudebního souboru.');
  let durationSec: number;
  if (ex.durationMode === 'audio') {
    if (!audioAsset || !audioDur) throw new ExportPlanError('Délka podle hudby vyžaduje vybraný hudební soubor.');
    durationSec = audioDur;
  } else durationSec = ex.durationSec;
  if (!(durationSec > 0)) throw new ExportPlanError('Délka videa musí být kladná.');
  if (durationSec > 6 * 3600) throw new ExportPlanError('Délka videa je omezena na 6 hodin.');
  const totalFrames = Math.max(1, Math.round(durationSec * fps));
  const chunkFrames = Math.max(fps, Math.round(Math.max(1, ex.chunkSec) * fps));
  const chunks: ChunkPlan[] = [];
  for (let s = 0, i = 0; s < totalFrames; s += chunkFrames, i++) chunks.push({ index: i, startFrame: s, endFrame: Math.min(totalFrames, s + chunkFrames) });
  let audio: AudioPlan | null = null;
  if (audioAsset && audioDur) {
    const mode: AudioPlan['mode'] = ex.durationMode === 'audio' ? 'exact'
      : audioDur < durationSec - 0.01 ? ex.audioWhenShorter : audioDur > durationSec + 0.01 ? 'trim' : 'exact';
    audio = { file: audioAsset.file, sourceDurationSec: audioDur, mode };
  }
  return {
    width, height, fps, durationSec: totalFrames / fps, totalFrames, stepsPerFrame: STEPS_PER_SECOND / fps, chunkFrames, chunks, audio,
    crf: ex.crf, preset: ex.preset, diagnosticPng: ex.diagnosticPngSequence, jobHash: exportJobHash(project),
  };
}

/** Odhad velikosti výstupu (pro kontrolu volného místa). Konzervativní horní mez. */
export function estimateOutputBytes(plan: ExportPlan): number {
  if (plan.diagnosticPng) return plan.totalFrames * plan.width * plan.height * 1.6;
  const mbps = plan.width >= 3840 ? 28 : 10; // horní odhad pro CRF ~18–23
  return (mbps * 1e6 / 8) * plan.durationSec + (plan.audio ? 192e3 / 8 * plan.durationSec : 0);
}
