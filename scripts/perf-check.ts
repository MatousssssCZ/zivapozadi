/**
 * Kontrola optimalizací bez ztráty vizuálu:
 *   npx tsx scripts/perf-check.ts --uloz [složka]    uloží referenční snímky a otisky stavu
 *   npx tsx scripts/perf-check.ts [složka]           porovná s referencí + změří časy
 * Snímky: Liberec a Radnice v pevných časech (psi, kočka, pád, sněhulák, odklízení); otisk = SHA-256
 * kanonického stavu simulace po 300 s. Limit: okem nerozeznatelné – pixelů s rozdílem > 8 úrovní nejvýš
 * 0,02 % snímku, průměrný rozdíl < 0,02 úrovně (převzorkování srsti apod.); otisky stavu shodné.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { canonicalJson } from '../src/core/model/hash';
import { generateRadnice } from '../scripts/generate-radnice-demo';

const save = process.argv.includes('--uloz');
const dir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.perf-ref');
await fs.mkdir(dir, { recursive: true });
const radDir = path.join(dir, 'radnice.zscena');
if (save || !(await fs.stat(radDir).catch(() => null))) await generateRadnice(radDir);
const scenes = [
  { name: 'liberec', dir: 'demo/Liberec-zivy-trh.zscena', times: [12, 31, 47, 63, 85, 110, 140, 200] },
  { name: 'radnice', dir: radDir, times: [20, 60] },
];
const report: string[] = []; let bad = 0;
for (const sc of scenes) {
  const lp = await loadProject(sc.dir);
  const img = await loadNodeImages(lp);
  const r = createNodeFrameRenderer(lp, img, 1920, 1080);
  const sim = Simulation.create(lp.project, lp.manifests);
  let renderMs = 0, frames = 0;
  for (const t of sc.times) {
    sim.advanceTo(t);
    const t0 = performance.now(); const px = r.render(sim, t); renderMs += performance.now() - t0; frames++;
    const file = path.join(dir, `${sc.name}-${t}.png`);
    if (save) { await fs.writeFile(file, r.png()); continue; }
    const ref = await loadImage(file); const c = createCanvas(1920, 1080); c.getContext('2d').drawImage(ref, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, 1920, 1080).data;
    let mx = 0, over = 0, sum = 0; for (let i = 0; i < d.length; i += 4) { const e = Math.max(Math.abs(d[i] - px[i]), Math.abs(d[i + 1] - px[i + 1]), Math.abs(d[i + 2] - px[i + 2])); sum += e; if (e > mx) mx = e; if (e > 8) over++; }
    const share = over / (1920 * 1080), mean = sum / (1920 * 1080);
    if (share > 0.0002 || mean > 0.02) bad++;
    report.push(`${sc.name} ${String(t).padStart(4)} s: max. rozdíl ${mx}, pixelů > 8: ${over} (${(share * 100).toFixed(3)} %), průměr ${mean.toFixed(4)}`);
  }
  // otisk stavu po 300 s + čas simulace
  const s2 = Simulation.create(lp.project, lp.manifests);
  const t0 = performance.now(); s2.advanceTo(300); const simMs = performance.now() - t0;
  const hash = createHash('sha256').update(canonicalJson(s2.state)).digest('hex').slice(0, 16);
  const hfile = path.join(dir, `${sc.name}.otisk`);
  if (save) await fs.writeFile(hfile, hash);
  else { const ref = (await fs.readFile(hfile, 'utf8')).trim(); if (ref !== hash) bad++; report.push(`${sc.name} otisk stavu po 300 s: ${ref === hash ? 'shodný' : `ROZDÍLNÝ (${ref} → ${hash})`}`); }
  report.push(`${sc.name}: vykreslení ${(renderMs / frames).toFixed(0)} ms/snímek, simulace ${(simMs / 300).toFixed(0)} ms na 1 s`);
}
console.log(report.join('\n'));
if (!save) { console.log(bad ? `NESHODA v ${bad} kontrolách` : 'Vše shodné.'); process.exit(bad ? 1 : 0); }
else console.log('Reference uložena:', dir);
