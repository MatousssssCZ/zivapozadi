/** Snímek scény s vektorovými postavami (porovnání s malovanými): npx tsx scripts/vector-scene.ts <scéna> <čas> <výstup> [--malovane] */
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { setVectorFigures } from '../src/core/render/characterPose';
const [dir = 'demo/Tramvajova-ulice.zscena', t = '60', out = 'vektor-scena.png'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
setVectorFigures(!process.argv.includes('--malovane'));
const lp = await loadProject(path.resolve(dir));
const img = await loadNodeImages(lp);
const W = Number(process.env.W ?? 1920), r = createNodeFrameRenderer(lp, img, W, Math.round(W * 9 / 16));
const sim = Simulation.create(lp.project, lp.manifests);
const t0 = performance.now(); sim.advanceTo(Number(t)); const t1 = performance.now();
r.render(sim, Number(t)); const t2 = performance.now();
await fs.writeFile(out, r.png()); console.log(out, `sim ${(t1 - t0).toFixed(0)} ms, render ${(t2 - t1).toFixed(0)} ms, postav ${sim.state.agents.filter((a) => !a.hidden).length}`);
