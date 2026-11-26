import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EncoderHost } from '../core/export/runExport';
import type { ExportPlan } from '../core/export/plan';
import { estimateOutputBytes } from '../core/export/plan';
import type { SimState } from '../core/sim/types';
import { runFfmpeg, explainFfmpegError, type RunResult } from './ffmpeg';
import { writeFileAtomic } from './projectIO';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export class ExportError extends Error { constructor(msg: string) { super(msg); this.name = 'ExportError'; } }

interface WorkManifest {
  format: 'zimni-scena-export'; version: 1; jobHash: string; output: string;
  width: number; height: number; fps: number; totalFrames: number; chunkFrames: number;
  chunks: { index: number; startFrame: number; endFrame: number; done: boolean; file: string }[];
}

/** Ověření výstupní cesty a volného místa před exportem. */
export async function validateOutput(outputPath: string, plan: ExportPlan): Promise<void> {
  if (!outputPath) throw new ExportError('Není zvolena výstupní cesta.');
  if (!plan.diagnosticPng && path.extname(outputPath).toLowerCase() !== '.mp4') throw new ExportError('Výstupní soubor musí mít příponu .mp4.');
  const dir = path.dirname(path.resolve(outputPath));
  try { const st = await fs.stat(dir); if (!st.isDirectory()) throw new Error(); }
  catch { throw new ExportError(`Výstupní složka neexistuje: ${dir}`); }
  try { const st = await fs.stat(outputPath); if (st.isDirectory()) throw new ExportError(`Výstupní cesta je složka: ${outputPath}`); } catch (e) { if (e instanceof ExportError) throw e; }
  try { await fs.access(dir, (await import('node:fs')).constants.W_OK); } catch { throw new ExportError(`Do výstupní složky nelze zapisovat: ${dir}`); }
  const need = estimateOutputBytes(plan) * 2.1 + 200e6;
  try {
    const sf = await fs.statfs(dir);
    const free = Number(sf.bavail) * Number(sf.bsize);
    if (free < need) throw new ExportError(`Nedostatek místa na disku: volno ${(free / 1e9).toFixed(1)} GB, odhad potřeby ${(need / 1e9).toFixed(1)} GB (části + výsledný soubor).`);
  } catch (e) { if (e instanceof ExportError) throw e; /* statfs nedostupné – pokračujeme */ }
}

/**
 * Enkodér v Node: každá část = samostatný proces FFmpeg (surové RGBA přes stdin → H.264 MP4),
 * checkpointy a manifest v pracovní složce `<výstup>.casti/`. Po dokončení spojení bez překódování
 * a připojení zvuku.
 */
export class NodeEncoderHost implements EncoderHost {
  readonly workDir: string;
  private manifest!: WorkManifest;
  private plan!: ExportPlan;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private done: Promise<RunResult> | null = null;
  private failed: string | null = null;
  private curTmp: string | null = null;

  constructor(private ffmpeg: string, readonly outputPath: string, private projectDir: string, private log: (m: string) => void = () => {}) {
    this.workDir = path.resolve(outputPath) + '.casti';
  }

  private mfPath() { return path.join(this.workDir, 'manifest.json'); }
  private async saveManifest() { await writeFileAtomic(this.mfPath(), JSON.stringify(this.manifest, null, 2)); }

  async prepare(plan: ExportPlan) {
    this.plan = plan;
    await validateOutput(this.outputPath, plan);
    let old: WorkManifest | null = null;
    try { old = JSON.parse(await fs.readFile(this.mfPath(), 'utf8')); } catch { /* žádný */ }
    let discardedStale = false;
    const compatible = old && old.format === 'zimni-scena-export' && old.jobHash === plan.jobHash && old.totalFrames === plan.totalFrames && old.chunkFrames === plan.chunkFrames && old.width === plan.width;
    if (old && !compatible) {
      // Projekt nebo nastavení se změnily ⇒ checkpointy jsou zastaralé a nesmí se použít.
      await fs.rm(this.workDir, { recursive: true, force: true });
      discardedStale = true;
      this.log('Zastaralé části exportu byly odstraněny (projekt nebo nastavení se změnily).');
    }
    await fs.mkdir(this.workDir, { recursive: true });
    if (compatible && old) {
      this.manifest = old;
      // Ověř, že hotové části skutečně existují.
      for (const c of this.manifest.chunks) if (c.done) { try { await fs.access(path.join(this.workDir, c.file)); } catch { c.done = false; } }
    } else {
      this.manifest = {
        format: 'zimni-scena-export', version: 1, jobHash: plan.jobHash, output: path.resolve(this.outputPath),
        width: plan.width, height: plan.height, fps: plan.fps, totalFrames: plan.totalFrames, chunkFrames: plan.chunkFrames,
        chunks: plan.chunks.map((c) => ({ ...c, done: false, file: plan.diagnosticPng ? `png_${String(c.index).padStart(4, '0')}` : `cast_${String(c.index).padStart(4, '0')}.mp4` })),
      };
      await this.saveManifest();
    }
    const firstChunk = this.manifest.chunks.findIndex((c) => !c.done);
    const fc = firstChunk === -1 ? this.manifest.chunks.length : firstChunk;
    let checkpoint: SimState | null = null;
    if (fc > 0 && fc < this.manifest.chunks.length) {
      try { checkpoint = JSON.parse(await fs.readFile(path.join(this.workDir, `checkpoint_${String(fc).padStart(4, '0')}.json`), 'utf8')); }
      catch {
        // Checkpoint chybí: bezpečně začít znovu od začátku.
        for (const c of this.manifest.chunks) c.done = false;
        await this.saveManifest();
        return { firstChunk: 0, checkpoint: null, discardedStale };
      }
    }
    return { firstChunk: fc, checkpoint, discardedStale };
  }

  async saveCheckpoint(i: number, state: SimState) {
    await writeFileAtomic(path.join(this.workDir, `checkpoint_${String(i).padStart(4, '0')}.json`), JSON.stringify(state));
  }

  async beginChunk(i: number) {
    const c = this.manifest.chunks[i];
    const p = this.plan;
    this.failed = null;
    let args: string[];
    const input = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${p.width}x${p.height}`, '-framerate', String(p.fps), '-i', 'pipe:0'];
    if (p.diagnosticPng) {
      const dir = path.join(this.workDir, c.file);
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });
      this.curTmp = dir;
      args = ['-y', ...input, '-start_number', String(c.startFrame), path.join(dir, 'snimek_%07d.png')];
    } else {
      const tmp = path.join(this.workDir, c.file.replace('.mp4', '.tmp.mp4'));
      this.curTmp = tmp;
      const level = p.width >= 3840 ? '5.1' : '4.1';
      args = ['-y', ...input, '-an',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
        // vyrovnaná kvalita bez „dýchání“: klíčový snímek po 10 s a jen mírně kvalitnější I/P snímky
        // (výchozí ipratio 1,4 dělá ostrý klíčový snímek a postupné rozmazání do dalšího – cyklus po 2 s).
        // Úspornější řízení se vyrovná nižším CRF (−3): změřeno SSIM 22,8 dB místo 22,25 dB, soubor −15 %.
        '-c:v', 'libx264', '-preset', p.preset, '-crf', String(Math.max(0, p.crf - 3)), '-profile:v', 'high', '-level:v', level,
        '-g', String(p.fps * 10), '-keyint_min', String(p.fps), '-sc_threshold', '0',
        '-x264-params', 'ipratio=1.1:pbratio=1.1:qcomp=0.7',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-video_track_timescale', '15360', '-f', 'mp4', tmp];
    }
    const r = runFfmpeg(this.ffmpeg, args);
    this.proc = r.proc; this.done = r.done;
    r.proc.stdin.on('error', (e) => { this.failed = (e as NodeJS.ErrnoException).code === 'EPIPE' ? 'Enkodér se neočekávaně ukončil.' : e.message; });
    r.done.then((res) => { if (res.code !== 0 && res.code !== null) this.failed = explainFfmpegError(res.stderrTail); });
  }

  async writeFrame(rgba: Uint8Array) {
    const proc = this.proc;
    if (!proc) throw new ExportError('Enkodér neběží.');
    if (this.failed) throw new ExportError(this.failed);
    if (rgba.byteLength !== this.plan.width * this.plan.height * 4) throw new ExportError(`Snímek má nesprávnou velikost (${rgba.byteLength} B).`);
    const ok = proc.stdin.write(rgba);
    if (!ok) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = () => { cleanup(); resolve(); };
        const onClose = () => { cleanup(); reject(new ExportError(this.failed ?? 'Enkodér se neočekávaně ukončil.')); };
        const cleanup = () => { proc.stdin.off('drain', onDrain); proc.off('close', onClose); };
        proc.stdin.once('drain', onDrain); proc.once('close', onClose);
      });
    }
    if (this.failed) throw new ExportError(this.failed);
  }

  async endChunk(i: number) {
    const proc = this.proc!; const done = this.done!;
    proc.stdin.end();
    const res = await done;
    this.proc = null; this.done = null;
    if (res.code !== 0) throw new ExportError(explainFfmpegError(res.stderrTail));
    const c = this.manifest.chunks[i];
    if (!this.plan.diagnosticPng) await fs.rename(this.curTmp!, path.join(this.workDir, c.file));
    this.curTmp = null;
    c.done = true;
    await this.saveManifest();
  }

  async finalize() {
    const p = this.plan;
    if (p.diagnosticPng) {
      const outDir = this.outputPath.replace(/\.mp4$/i, '') + '_snimky';
      await fs.rm(outDir, { recursive: true, force: true }); await fs.mkdir(outDir, { recursive: true });
      for (const c of this.manifest.chunks) for (const f of await fs.readdir(path.join(this.workDir, c.file))) await fs.rename(path.join(this.workDir, c.file, f), path.join(outDir, f));
      await fs.rm(this.workDir, { recursive: true, force: true });
      return { outputPath: outDir };
    }
    const list = this.manifest.chunks.map((c) => `file '${path.join(this.workDir, c.file).replace(/'/g, "'\\''")}'`).join('\n');
    const listFile = path.join(this.workDir, 'seznam.txt');
    await fs.writeFile(listFile, list);
    const tmpOut = path.join(path.dirname(path.resolve(this.outputPath)), `.${path.basename(this.outputPath)}.spojovani.mp4`);
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile];
    if (p.audio) {
      const audioPath = path.resolve(this.projectDir, p.audio.file);
      if (p.audio.mode === 'loop') args.push('-stream_loop', '-1');
      args.push('-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
      const filters: string[] = [];
      if (p.audio.mode === 'silence') filters.push('apad');
      if (p.audio.mode === 'trim' || p.audio.mode === 'loop') filters.push(`afade=t=out:st=${Math.max(0, p.durationSec - 1.5).toFixed(3)}:d=1.5`);
      if (filters.length) args.push('-af', filters.join(','));
      args.push('-t', p.durationSec.toFixed(3));
    } else args.push('-c', 'copy', '-an');
    args.push('-movflags', '+faststart', tmpOut);
    const r = runFfmpeg(this.ffmpeg, args);
    const res = await r.done;
    if (res.code !== 0) { await fs.rm(tmpOut, { force: true }); throw new ExportError(explainFfmpegError(res.stderrTail)); }
    await fs.rename(tmpOut, this.outputPath);
    await fs.rm(this.workDir, { recursive: true, force: true });
    return { outputPath: this.outputPath };
  }

  async abort() {
    if (this.proc) { try { this.proc.stdin.destroy(); this.proc.kill('SIGKILL'); } catch { /* */ } await this.done?.catch(() => {}); }
    this.proc = null; this.done = null;
    if (this.curTmp) { await fs.rm(this.curTmp, { recursive: true, force: true }).catch(() => {}); this.curTmp = null; }
  }
}
