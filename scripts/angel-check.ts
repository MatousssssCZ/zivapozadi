/**
 * Kontrola sněhového anděla (A07) v Liberci: vynutí epizodu, vypíše stavy a uloží výřezy průběhu.
 *   npx tsx scripts/angel-check.ts výstup.png
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';

const lp = await loadProject(path.resolve('demo/Liberec-zivy-trh.zscena'));
lp.project.scene.snowfall.enabled = false;
const img = await loadNodeImages(lp); const r = createNodeFrameRenderer(lp, img, 1920, 1080);
const sim = Simulation.create(lp.project, lp.manifests);
let t = 20, msg = '';
for (; t < 400; t += 2) { sim.advanceTo(t); const m = sim.startSnowAngelNow(); msg = m.msg; if (m.ok) break; }
console.log(t, msg);
const z = lp.project.zones.find((q) => q.activityType === 'snowAngel')!, cx = z.bounds.reduce((q, p) => q + p.x, 0) / 4, cy = z.bounds.reduce((q, p) => q + p.y, 0) / 4;
const COLS = 4, W = 360, H = 300, out = createCanvas(W * COLS, H * 3), x = out.getContext('2d');
let k = 0, last = '', lastShot = -9;
for (const t0 = t; t < t0 + 120 && k < 12; t += 0.25) {
  sim.advanceTo(t);
  const s = sim.state.sessions?.find((q) => q.type === 'snowAngel');
  const kid = s ? sim.state.agents.find((a) => a.id === (s.data as { kid: string }).kid) : undefined;
  const lab = s ? `${s.phase} ${kid?.status}` : 'konec';
  if (lab !== last) { console.log((t - t0).toFixed(1), lab); last = lab; }
  if ((s?.phase === 'angel' && t - lastShot >= 1.8) || (!s && k < 12 && t - lastShot > 3)) {
    lastShot = t; r.render(sim, t); const im = await loadImage(r.png());
    x.drawImage(im, cx - W / 2, cy - H + 90, W, H, (k % COLS) * W, Math.floor(k / COLS) * H, W, H);
    x.fillStyle = '#000'; x.font = '13px sans-serif'; x.fillText(`${(t - t0).toFixed(1)} s ${lab}`, (k % COLS) * W + 4, Math.floor(k / COLS) * H + 14); k++;
    if (!s) break;
  }
}
console.log('otisky:', JSON.stringify(sim.state.angels));
await fs.writeFile(process.argv[2] ?? 'andel.png', out.toBuffer('image/png'));
