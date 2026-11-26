/**
 * Kontrola péče o obchod (A18a–d) ve scéně Tramvajová ulice: vynutí postupně varianty pekaře
 * (posyp, bedýnka ven, bedýnka dovnitř, zametání) a uloží výřezy průběhu + výpis kroků.
 *   npx tsx scripts/shop-check.ts výstup.png
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { bakeryLabel, type BakeryTask } from '../src/core/sim/bakery';

const lp = await loadProject(path.resolve('demo/Tramvajova-ulice.zscena'));
lp.project.scene.snowfall.enabled = false;
const img = await loadNodeImages(lp); const r = createNodeFrameRenderer(lp, img, 1920, 1080);
const sim = Simulation.create(lp.project, lp.manifests);
const tasks: BakeryTask[] = ['salt', 'crate', 'crate', 'sweep'];
const COLS = 6, W = 300, H = 260, out = createCanvas(W * COLS, H * tasks.length), x = out.getContext('2d');
let t = 5; sim.advanceTo(t);
const b = lp.project.bakery!;
for (let row = 0; row < tasks.length; row++) {
  while (sim.state.bakery?.phase !== 'inside') { t += 1; sim.advanceTo(t); }
  console.log(sim.bakerNow(tasks[row]).msg);
  const shots: number[] = [], t0 = t; let k = 0, last = '';
  while (t < t0 + 120) {
    t += 0.25; sim.advanceTo(t);
    const st = sim.state.bakery!, lab = bakeryLabel(st);
    if (lab !== last) { console.log(`  ${(t - t0).toFixed(1)} s  ${lab}`); last = lab; }
    if (st.phase === 'inside') break;
    const s = st.plan[st.si];
    if (s && ['sign', 'salt', 'lower', 'door', 'sweep'].includes(s.k) && k < COLS && (shots.length === 0 || t - shots[shots.length - 1] > 1.6)) {
      shots.push(t); r.render(sim, t); const im = await loadImage(r.png());
      const cx = (b.door.x0 + b.door.x1) / 2 + 60;
      x.drawImage(im, cx - 150, b.door.y0 - 40, W, H, k * W, row * H, W, H);
      x.fillStyle = '#000'; x.font = '13px sans-serif'; x.fillText(`${tasks[row]} ${(t - t0).toFixed(1)}s ${s.k}`, k * W + 4, row * H + 14); k++;
    }
  }
  const st = sim.state.bakery!; console.log(`  hotovo: ${JSON.stringify(st.done)} · bedýnka venku ${st.crate.out} · kbelík ${st.grits} · zrnek ${st.grit.length}`);
}
await fs.writeFile(process.argv[2] ?? 'obchod.png', out.toBuffer('image/png'));
