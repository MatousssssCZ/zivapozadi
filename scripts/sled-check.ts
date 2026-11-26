/**
 * Kontrola saní (B02/A03): výřezy jízdy a výpis rychlosti, tahu provazu a napnutí:
 *   npx tsx scripts/sled-check.ts výstup.png
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
const lp = await loadProject(path.resolve('demo/Liberec-zivy-trh.zscena'));
lp.project.scene.snowfall.enabled = false; if (process.env.BOBY) lp.project.sled!.kind = 'boby';
const img = await loadNodeImages(lp); const r = createNodeFrameRenderer(lp, img, 1920, 1080);
const sim = Simulation.create(lp.project, lp.manifests);
const out = createCanvas(1500, 1200), x = out.getContext('2d'); let k = 0;
const log: string[] = [];
for (let t = 70; t < 260 && k < 12; t += 0.5) {
  sim.advanceTo(t); const sl = sim.state.sled;
  if (sl?.phase !== 'run' || !sl.center || sl.center.x < 150 || sl.center.x > 1700) continue;
  log.push(`t=${t} v=${Math.hypot(sl.V!.X, sl.V!.Z).toFixed(2)} T=${(sl.tension ?? 0).toFixed(0)} ropeK=${(sl.ropeK ?? 0).toFixed(3)}`);
  if (Math.round(t * 2) % 3 !== 0) continue;
  r.render(sim, t); const im = await loadImage(r.png());
  const c = sl.center; x.drawImage(im, c.x - 250, c.y - 260, 500, 300, (k % 3) * 500, Math.floor(k / 3) * 300, 500, 300); k++;
}
await fs.writeFile(process.argv[2], out.toBuffer('image/png')); console.log(log.filter((_, i) => i % 6 === 0).join('\n'));
