import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { demoProject, tmpDir } from './helpers';
import type { LoadedProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { planExport } from '../src/core/export/plan';
import { runExport, ExportCancelled } from '../src/core/export/runExport';
import { NodeEncoderHost, ExportError } from '../src/node/exportHost';
import { locateFfmpeg, probeDuration } from '../src/node/ffmpeg';
import { Simulation } from '../src/core/sim/simulation';
import { drawOverlay } from '../src/renderer/overlay';
import { renderFrame } from '../src/core/render/sceneRenderer';

const ff = locateFfmpeg()!;
function probe(file: string) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,nb_frames,duration', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout).streams as Record<string, string | number>[];
}
function framemd5(file: string) {
  return spawnSync(ff.path, ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.split('\n').filter((l) => l && !l.startsWith('#'));
}
async function doExport(lp: LoadedProject, out: string, opts: { stopAfterChunks?: number } = {}) {
  const plan = planExport(lp.project, { audioDurationSec: lp.project.export.audioAssetId ? probeDuration(ff.path, path.join(lp.dir, lp.project.assets.find((a) => a.id === lp.project.export.audioAssetId)!.file)) : null });
  const images = await loadNodeImages(lp);
  const r = createNodeFrameRenderer(lp, images, plan.width, plan.height);
  return { plan, res: await runExport(lp.project, lp.manifests, plan, new NodeEncoderHost(ff.path, out, lp.dir), r, opts) };
}

let lp: LoadedProject; let out: string;
beforeAll(async () => {
  lp = await demoProject();
  lp.project.export = { ...lp.project.export, durationSec: 6, chunkSec: 2, preset: 'veryfast', resolution: '1920x1080' };
  out = await tmpDir('zs-exp-');
});

describe('export videa', () => {
  it('MP4: rozlišení, fps, počet snímků a délka odpovídají', async () => {
    const f = path.join(out, 'a.mp4');
    const { res } = await doExport(lp, f);
    expect(res.frames).toBe(180);
    const v = probe(f).find((s) => s.codec_type === 'video')!;
    expect([v.codec_name, v.width, v.height, v.pix_fmt, v.r_frame_rate, Number(v.nb_frames)]).toEqual(['h264', 1920, 1080, 'yuv420p', '30/1', 180]);
    expect(Math.abs(Number(v.duration) - 6)).toBeLessThan(0.05);
    await expect(fs.access(f + '.casti')).rejects.toThrow(); // pracovní složka uklizena
  });

  it('přerušený export naváže ze checkpointu a dá identický výsledek', async () => {
    const ref = path.join(out, 'a.mp4');
    const f = path.join(out, 'b.mp4');
    await expect(doExport(lp, f, { stopAfterChunks: 2 })).rejects.toBeInstanceOf(ExportCancelled);
    const mf = JSON.parse(await fs.readFile(f + '.casti/manifest.json', 'utf8'));
    expect(mf.chunks.filter((c: { done: boolean }) => c.done).length).toBe(2);
    const { res } = await doExport(lp, f);
    expect(res.resumedFromChunk).toBe(2);
    expect(framemd5(f)).toEqual(framemd5(ref)); // shodné dekódované snímky
    // stav simulace na konci je shodný s nepřerušeným během
    const sim = Simulation.create(lp.project, lp.manifests); sim.runSteps((180 - 1) * 2);
    expect(res.finalStateHash).toBe(sim.stateHash());
  });

  it('po změně projektu se zastaralý checkpoint nepoužije', async () => {
    const f = path.join(out, 'c.mp4');
    await expect(doExport(lp, f, { stopAfterChunks: 1 })).rejects.toBeInstanceOf(ExportCancelled);
    const changed = { ...lp, project: structuredClone(lp.project) };
    changed.project.seed = 777;
    const { res } = await doExport(changed, f);
    expect(res.discardedStale).toBe(true);
    expect(res.resumedFromChunk).toBe(0);
  });

  it('hudba: ticho po skončení, opakování, délka podle hudby', async () => {
    const wav = path.join(lp.dir, 'assets/audio/ton.wav');
    spawnSync(ff.path, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.5', wav]);
    const p2 = { ...lp, project: structuredClone(lp.project) };
    p2.project.assets.push({ id: 'aud', kind: 'audio', name: 'Tón', file: 'assets/audio/ton.wav', durationSec: 2.5 });
    p2.project.export.audioAssetId = 'aud';
    for (const mode of ['silence', 'loop'] as const) {
      p2.project.export.audioWhenShorter = mode; p2.project.export.durationMode = 'manual';
      const f = path.join(out, `aud-${mode}.mp4`);
      const { plan } = await doExport(p2, f);
      expect(plan.audio!.mode).toBe(mode);
      const a = probe(f).find((s) => s.codec_type === 'audio')!;
      expect(a.codec_name).toBe('aac');
      expect(Math.abs(Number(a.duration) - 6)).toBeLessThan(0.1);
    }
    p2.project.export.durationMode = 'audio';
    const f = path.join(out, 'aud-len.mp4');
    const { res } = await doExport(p2, f);
    expect(res.frames).toBe(75); // 2,5 s × 30 fps
    const v = probe(f).find((s) => s.codec_type === 'video')!;
    expect(Math.abs(Number(v.duration) - 2.5)).toBeLessThan(0.05);
  });

  it('neplatná výstupní cesta ⇒ srozumitelná chyba', async () => {
    await expect(doExport(lp, '/neexistuje/slozka/x.mp4')).rejects.toThrow(/Výstupní složka neexistuje/);
    await expect(doExport(lp, path.join(out, 'x.avi'))).rejects.toThrow(/\.mp4/);
    expect(ExportError).toBeTruthy();
  });

  it.skipIf(process.platform === 'win32')('chyba enkodéru ⇒ srozumitelná zpráva, žádný pád', async () => {
    const fake = path.join(out, 'fake-ffmpeg.sh');
    await fs.writeFile(fake, '#!/bin/sh\ncat > /dev/null &\necho "Error: No space left on device" >&2\nexit 1\n', { mode: 0o755 });
    const plan = planExport(lp.project);
    const images = await loadNodeImages(lp);
    const r = createNodeFrameRenderer(lp, images, plan.width, plan.height);
    await expect(runExport(lp.project, lp.manifests, plan, new NodeEncoderHost(fake, path.join(out, 'err.mp4'), lp.dir), r)).rejects.toThrow(/došlo místo|Enkodér se neočekávaně ukončil/);
  });

  it('editorové značky nejsou v exportovaném snímku', async () => {
    const images = await loadNodeImages(lp);
    const sim = Simulation.create(lp.project, lp.manifests);
    const W = 1920, H = 1080;
    const magenta = (d: Uint8ClampedArray | Uint8Array) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] < 60 && d[i + 2] > 200) n++; return n; };
    // pozitivní kontrola: editorové plátno se značkami obsahuje barvu značek
    const c = createCanvas(W, H); const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
    renderFrame(ctx, W, H, lp.project, sim, images, 0);
    drawOverlay(ctx, { project: lp.project, sim, selection: null, tool: 'select', px: 1, routeActiveNode: null, drawing: [], mouse: null, dragRect: null, hover: null });
    expect(magenta(ctx.getImageData(0, 0, W, H).data)).toBeGreaterThan(200);
    // exportovaný soubor (dekódovaný první snímek) ji neobsahuje
    const raw = spawnSync(ff.path, ['-v', 'error', '-i', path.join(out, 'a.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 26 }).stdout as Buffer;
    expect(raw.length).toBe(W * H * 4);
    expect(magenta(raw)).toBe(0);
  });
});
