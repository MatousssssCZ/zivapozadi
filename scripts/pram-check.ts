/**
 * Kontrola procházky s kočárkem (A17): vynutí příchod, vypíše fáze, rychlost, úhly kol a brzdu,
 * uloží výřezy klíčových okamžiků.  npx tsx scripts/pram-check.ts výstup.png
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { pramPoints, PRAM_LABEL } from '../src/core/sim/pram';
import { cameraFor, toScreen } from '../src/core/scene/camera';

const lp = await loadProject(path.resolve('demo/Tramvajova-ulice.zscena'));
lp.project.scene.snowfall.enabled = false;
const img = await loadNodeImages(lp); const r = createNodeFrameRenderer(lp, img, 1920, 1080);
const sim = Simulation.create(lp.project, lp.manifests), cam = cameraFor(lp.project.scene);
let t = 3; sim.advanceTo(t); console.log(sim.pramNow().msg);
const COLS = 4, W = 420, H = 380, out = createCanvas(W * COLS, H * 3), x = out.getContext('2d');
let k = 0, last = '', lastShot = -9;
for (; t < 200; t += 0.25) {
  sim.advanceTo(t); const st = sim.state.pram!;
  if (st.phase !== last) { console.log(`${t.toFixed(1)} ${PRAM_LABEL[st.phase]} v=${(st.v ?? 0).toFixed(2)} phi=${st.phi.map((p) => p.toFixed(1)).join('/')} brzda=${st.brake} deka=${st.blanket.toFixed(2)}`); last = st.phase; }
  if (st.phase === 'offstage' && t > 10) break;
  if (!st.S) continue;
  const c = toScreen(cam, pramPoints(st).center);
  if (k < COLS * 3 && c.x > 100 && c.x < 1800 && t - lastShot > (['care', 'toSide', 'brake', 'toHandle'].includes(st.phase) ? 1.5 : 4)) {
    lastShot = t; r.render(sim, t); const im = await loadImage(r.png());
    x.drawImage(im, c.x - W / 2, c.y - H + 80, W, H, (k % COLS) * W, Math.floor(k / COLS) * H, W, H);
    x.fillStyle = '#000'; x.font = '14px sans-serif'; x.fillText(`${t.toFixed(1)} s ${PRAM_LABEL[st.phase]}`, (k % COLS) * W + 4, Math.floor(k / COLS) * H + 16); k++;
  }
}
console.log('úprav deky:', sim.state.pram!.done);
await fs.writeFile(process.argv[2] ?? 'kocarek.png', out.toBuffer('image/png'));
