/**
 * Kontrola scénických epizod (A13, A11, A12, A08, A01): vynutí epizodu, vypíše kroky a uloží výřezy
 * průběhu kolem herců.  npx tsx scripts/episode-check.ts <id epizody> výstup.png [scéna]
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { episodeLabel } from '../src/core/sim/episodes';

const id = process.argv[2], out = process.argv[3] ?? 'epizoda.png', dir = path.resolve(process.argv[4] ?? 'demo/Tramvajova-ulice.zscena');
const lp = await loadProject(dir); lp.project.scene.snowfall.enabled = false;
const img = await loadNodeImages(lp); const r = createNodeFrameRenderer(lp, img, 1920, 1080);
const sim = Simulation.create(lp.project, lp.manifests), c = lp.project.episodes!.find((e) => e.id === id)!;
sim.advanceTo(5); console.log(sim.episodeNow(id).msg);
const COLS = 4, Wc = 520, Hc = 360, cv = createCanvas(Wc * COLS, Hc * Math.ceil(Number(process.env.N ?? 16) / COLS)), x = cv.getContext('2d');
let k = 0, last = '', lastShot = -9, t = 5;
const h = sim.actorHostPublic();
for (; t < 400 && k < Number(process.env.N ?? 16); t += 0.25) {
  sim.advanceTo(t); const st = sim.state.episodes![id], lab = episodeLabel(c, st, h);
  if (lab !== last) { console.log(t.toFixed(1), lab); last = lab; }
  if (st.phase === 'idle' && t > 8) break;
  const vis = c.actors.map((a) => sim.state.agents.find((q) => q.id === a)!).filter((a) => !a.hidden && a.pos.x > -50 && a.pos.x < 1970);
  if (!vis.length || t - lastShot < Number(process.env.KROK ?? 3)) continue;
  lastShot = t; r.render(sim, t); const im = await loadImage(r.png());
  const cx = vis.reduce((q, a) => q + a.pos.x, 0) / vis.length, cy = vis.reduce((q, a) => q + a.pos.y, 0) / vis.length;
  x.drawImage(im, cx - Wc / 2, cy - Hc * 0.72, Wc, Hc, (k % COLS) * Wc, Math.floor(k / COLS) * Hc, Wc, Hc);
  x.fillStyle = '#000'; x.font = '14px sans-serif'; x.fillText(`${t.toFixed(1)} s ${lab}`, (k % COLS) * Wc + 4, Math.floor(k / COLS) * Hc + 16); k++;
}
console.log('stav světa:', JSON.stringify(sim.state.episodes![id].world).slice(0, 300));
await fs.writeFile(out, cv.toBuffer('image/png'));
