/**
 * Bezhlavý export projektu (stejná simulace, renderer i enkodér jako v aplikaci).
 * Použití:
 *   npm run export:cli -- <projekt.zscena> --out video.mp4 [--res 3840x2160] [--duration 10]
 *        [--audio-mode manual|audio] [--when-shorter loop|silence] [--chunk 10] [--crf 20] [--preset medium]
 *        [--no-audio] [--stop-after-chunks N] [--png]
 */
import path from 'node:path';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { planExport } from '../src/core/export/plan';
import { runExport, ExportCancelled } from '../src/core/export/runExport';
import { NodeEncoderHost } from '../src/node/exportHost';
import { locateFfmpeg, probeDuration } from '../src/node/ffmpeg';
import type { ExportResolution } from '../src/core/model/types';

function arg(name: string): string | undefined { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : undefined; }
const flag = (name: string) => process.argv.includes('--' + name);

async function main() {
  const dir = process.argv[2];
  if (!dir || dir.startsWith('--')) { console.error('Zadejte složku projektu.'); process.exit(2); }
  const ff = locateFfmpeg();
  if (!ff) { console.error('FFmpeg nenalezen.'); process.exit(3); }
  const lp = await loadProject(path.resolve(dir));
  for (const i of lp.issues) console.warn(`[${i.level}] ${i.message}`);
  const ex = lp.project.export;
  if (arg('res')) ex.resolution = arg('res') as ExportResolution;
  if (arg('duration')) { ex.durationSec = Number(arg('duration')); ex.durationMode = 'manual'; }
  if (arg('audio-mode')) ex.durationMode = arg('audio-mode') as 'manual' | 'audio';
  if (arg('when-shorter')) ex.audioWhenShorter = arg('when-shorter') as 'loop' | 'silence';
  if (arg('chunk')) ex.chunkSec = Number(arg('chunk'));
  if (arg('crf')) ex.crf = Number(arg('crf'));
  if (arg('preset')) ex.preset = arg('preset') as typeof ex.preset;
  if (flag('no-audio')) ex.audioAssetId = null;
  if (flag('png')) ex.diagnosticPngSequence = true;
  const audioAsset = lp.project.assets.find((a) => a.id === ex.audioAssetId);
  const audioDur = audioAsset ? probeDuration(ff.path, path.join(lp.dir, audioAsset.file)) : null;
  const plan = planExport(lp.project, { audioDurationSec: audioDur });
  const out = path.resolve(arg('out') ?? 'export.mp4');
  console.log(`FFmpeg: ${ff.source}; ${plan.width}×${plan.height} @ ${plan.fps} fps, ${plan.durationSec.toFixed(2)} s, ${plan.totalFrames} snímků, ${plan.chunks.length} částí; zvuk: ${plan.audio ? plan.audio.mode : 'bez zvuku'}`);
  const images = await loadNodeImages(lp);
  const renderer = createNodeFrameRenderer(lp, images, plan.width, plan.height);
  const host = new NodeEncoderHost(ff.path, out, lp.dir, (m) => console.log(m));
  let peakRss = 0, lastPrint = 0;
  const memTimer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 200);
  try {
    const res = await runExport(lp.project, lp.manifests, plan, host, renderer, {
      stopAfterChunks: arg('stop-after-chunks') ? Number(arg('stop-after-chunks')) : undefined,
      onProgress: (p) => {
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        const t = Date.now();
        if (t - lastPrint > 2000 || p.phase !== 'render') {
          lastPrint = t;
          console.log(`[${p.phase}] snímek ${p.framesDone}/${p.totalFrames} (část ${p.chunk + 1}/${p.chunks}) uplynulo ${p.elapsedSec.toFixed(1)} s, zbývá ~${p.etaSec?.toFixed(0) ?? '?'} s, ${p.fpsRate.toFixed(2)} sn/s, RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
        }
      },
    });
    console.log(JSON.stringify({ ok: true, ...res, peakRssMB: Math.round(peakRss / 1e6) }));
  } catch (e) {
    if (e instanceof ExportCancelled) { console.log(JSON.stringify({ ok: false, cancelled: true, workDir: host.workDir, peakRssMB: Math.round(peakRss / 1e6) })); process.exitCode = 10; }
    else { console.error('CHYBA EXPORTU:', (e as Error).message); process.exitCode = 1; }
  } finally { clearInterval(memTimer); }
}
main();
