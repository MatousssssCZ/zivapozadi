import type { AssetEntry, ProjectFile } from '../core/model/types';
import type { CharacterManifest } from '../core/anim/manifest';
import type { ValidationIssue } from '../core/model/validate';
import type { ExportPlan } from '../core/export/plan';
import type { SimState } from '../core/sim/types';

export interface OpenResult { dir: string; project: ProjectFile; manifests: Record<string, CharacterManifest>; issues: ValidationIssue[]; missingAssets: string[] }

export interface ZsApi {
  newProject(): Promise<OpenResult | null>;
  openProject(dir?: string): Promise<OpenResult | null>;
  openDemo(which?: 'namesti' | 'radnice' | 'liberec' | 'pastel' | 'pastel2' | 'pastel3' | 'tram'): Promise<OpenResult>;
  saveProject(dir: string, project: ProjectFile): Promise<string>;
  saveProjectAs(fromDir: string, project: ProjectFile): Promise<string | null>;
  readAsset(dir: string, rel: string): Promise<Uint8Array>;
  importAssets(dir: string, kind: 'image' | 'audio'): Promise<AssetEntry[]>;
  listBuiltins(): Promise<AssetEntry[]>;
  readBuiltin(file: string): Promise<Uint8Array>;
  addBuiltin(dir: string, id: string): Promise<AssetEntry>;
  loadManifest(dir: string, asset: AssetEntry): Promise<CharacterManifest>;
  ffmpegInfo(): Promise<{ path: string; source: string; hasX264: boolean } | null>;
  probeAudio(dir: string, rel: string): Promise<number | null>;
  chooseExportPath(suggested: string): Promise<string | null>;
  exportInspect(outputPath: string, jobHash: string): Promise<{ exists: boolean; compatible?: boolean; doneChunks?: number; totalChunks?: number }>;
  exportPrepare(outputPath: string, projectDir: string, plan: ExportPlan): Promise<{ firstChunk: number; checkpoint: SimState | null; discardedStale: boolean }>;
  exportSaveCheckpoint(i: number, state: SimState): Promise<void>;
  exportBeginChunk(i: number): Promise<void>;
  exportFrame(buf: Uint8Array): Promise<void>;
  /** Jen prohlížeč: snímek přímo z plátna do kodéru (bez kopie pixelů). */
  exportCanvasFrame?(canvas: OffscreenCanvas): Promise<void>;
  exportEndChunk(i: number): Promise<void>;
  exportFinalize(): Promise<{ outputPath: string }>;
  exportAbort(): Promise<void>;
  showInFolder(p: string): Promise<void>;
  setTitle(t: string): Promise<void>;
  memory(): Promise<{ main: number }>;
  onBeforeClose(cb: () => void): void;
  confirmClose(): void;
  startupProject(): Promise<string | null>;
  /** Smaže scénu: vlastní projekt (složka / záznam v prohlížeči), u ukázkové scény jen uložené úpravy (`demo` = název složky ukázky). */
  deleteProject(dirOrDemo: string, demo: boolean): Promise<void>;
}

declare global { interface Window { zs: ZsApi } }
export const zs = (): ZsApi => window.zs;
