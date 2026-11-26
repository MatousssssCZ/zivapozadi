/**
 * Náhled vektorových doplňků (čepice, bambule, šála, palčáky) ve skutečné scéně:
 *   npx tsx scripts/accessories-preview.ts [projekt.zscena] [výstup.png] [čas]
 * Vybere až 12 viditelných postav a uloží jejich 3× zvětšené výřezy ve 3 po sobě jdoucích okamžicích
 * (0, 0,25, 0,5 s) – je vidět pohyb konců šály a bambule.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { setVectorAccessories, characterVisual } from '../src/core/render/characterPose';

const dir = path.resolve(process.argv[2] ?? 'demo/Tramvajova-ulice.zscena'), out = path.resolve(process.argv[3] ?? 'doplnky.png');
const t0 = Number(process.argv[4] ?? 80);
if (process.env.MALOVANE) setVectorAccessories(false);
const lp = await loadProject(dir);
lp.project.scene.snowfall.enabled = false;
const img = await loadNodeImages(lp);
const r = createNodeFrameRenderer(lp, img, 1920, 1080);
const sim = Simulation.create(lp.project, lp.manifests);
sim.advanceTo(t0);
const vis = sim.state.agents.filter((a) => !a.hidden && a.pos.x > 60 && a.pos.x < 1860 && a.pos.y > 200 && a.pos.y < 1060).sort((a, b) => b.pos.y - a.pos.y).slice(0, 12);
const W = 110, H = 150, S = Number(process.env.S ?? 3), T = [0, 0.25, 0.5];
const sheet = createCanvas(W * S * T.length, H * S * vis.length), x = sheet.getContext('2d');
for (let k = 0; k < T.length; k++) {
  sim.advanceTo(t0 + T[k]); r.render(sim, t0 + T[k]);
  const im = await loadImage(r.png());
  vis.forEach((a0, i) => {
    const a = sim.state.agents.find((q) => q.id === a0.id)!;
    const c = sim.characterOf(a.id)!, cv = characterVisual(a, sim.manifests[c.assetId], c, lp.project.scene);
    // horní polovina postavy (hlava, krk, ruce) – detail doplňků
    const hc = cv.rig?.acc?.geo.headC ?? { x: 0, y: -120 }, hr = cv.rig?.acc?.geo.headR ?? 8;
    const hh = hr * 9 * cv.scale * (process.env.CELA ? 2.2 : 1), w = hh * (W / H), top = cv.y + (hc.y - hr * 2.2) * cv.scale;
    const cx0 = cv.x + hc.x * (cv.mirror ? -1 : 1) * cv.scale;
    x.drawImage(im, cx0 - w / 2, top, w, hh, k * W * S, i * H * S, W * S, H * S);
    x.fillStyle = '#000'; x.font = '18px sans-serif'; x.fillText(`${a.id} t+${T[k]}`, k * W * S + 6, i * H * S + 20);
  });
}
await fs.writeFile(out, sheet.toBuffer('image/png'));
console.log('Uloženo', out, vis.length, 'postav');
