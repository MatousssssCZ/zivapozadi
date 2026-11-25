/**
 * Kontrolní scéna chůze seniorů (bez editoru):
 *   npx tsx scripts/elderly-check.ts [projekt.zscena] [výstupní-složka]
 * Pustí Liberec, změří u seniorů A a B při ustálené chůzi délku kroku, kadenci a rychlost, u hole
 * počet došlapů za cyklus, prokluz hrotu během opory a vzdálenost ruky od rukojeti. Uloží:
 *   seniori-chuze.png – po 8 fázích cyklu pro A a B (skutečná scéna, 2× zvětšený výřez)
 *   seniori-ladeni.png – tytéž okamžiky s ladicím překryvem (chodidla, hrot hole, rukojeť, údaje)
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { measureElders } from '../src/core/anim/elderMetrics';
import { drawOverlay } from '../src/renderer/overlay';

const dir = path.resolve(process.argv[2] ?? 'demo/Liberec-zivy-trh.zscena'), out = path.resolve(process.argv[3] ?? '.');
const lp = await loadProject(dir);
lp.project.scene.snowfall.enabled = false;
const ids = lp.project.characters.filter((c) => c.gaitProfile).map((c) => c.id);
if (!ids.length) { console.error('Projekt nemá seniory (characters[].gaitProfile).'); process.exit(2); }
const sim = Simulation.create(lp.project, lp.manifests);
const rep = measureElders(sim, ids, 600);
for (const r of rep) {
  console.log(`${r.id} (${r.profile}): krok ${r.stepM.toFixed(3)} m (cíl ${r.targetStepM.toFixed(3)}), kadence ${r.cadence.toFixed(1)}/min (cíl ${r.targetCadence.toFixed(1)}), rychlost ${r.speed.toFixed(3)} m/s, ustálených cyklů ${r.cycles}`);
  if (r.cane) console.log(`   hůl: došlapů na cyklus ${r.cane.plantsPerCycle.toFixed(2)}, max. prokluz hrotu v opoře ${r.cane.maxSlipPx.toFixed(3)} px, max. ruka–rukojeť ${r.cane.maxHandGap.toFixed(2)} j., délka hole ${r.cane.lenM.toFixed(2)} m (konst.: ${r.cane.lenConst})`);
}
// snímky: pro každého seniora 8 okamžiků jednoho cyklu ustálené chůze (z měření)
const img = await loadNodeImages(lp);
const r = createNodeFrameRenderer(lp, img, 1920, 1080);
const shots: { t: number; id: string; l: string }[] = [];
for (const rr of rep) for (let k = 0; k < 8; k++) shots.push({ t: rr.cycleStart + (k / 8) * rr.cycleDur, id: rr.id, l: `${rr.profile} ${(k / 8).toFixed(2)}` });
shots.sort((a, b) => a.t - b.t);
const W = 300, H = 330, S = 2, C = 4;
const rows = Math.ceil(shots.length / C);
const sheet = createCanvas(W * S * C, H * S * rows), dbg = createCanvas(W * S * C, H * S * rows);
const x = sheet.getContext('2d'), xd = dbg.getContext('2d');
const sim2 = Simulation.create(lp.project, lp.manifests);
const order = shots.map((s, i) => ({ ...s, i })).sort((a, b) => a.id.localeCompare(b.id) || a.t - b.t);
const slot = new Map(order.map((s, k) => [s.i, k]));
for (let i = 0; i < shots.length; i++) {
  const s = shots[i]; sim2.advanceTo(s.t); r.render(sim2, s.t);
  const im = await loadImage(r.png());
  const a = sim2.state.agents.find((q) => q.id === s.id)!;
  const k = slot.get(i)!, dx = (k % C) * W * S, dy = Math.floor(k / C) * H * S;
  const sx = a.pos.x - W / 2, sy = a.pos.y - H + 40;
  x.drawImage(im, sx, sy, W, H, dx, dy, W * S, H * S);
  x.fillStyle = '#000'; x.font = '22px sans-serif'; x.fillText(s.l, dx + 8, dy + 26);
  const c2 = createCanvas(1920, 1080), x2 = c2.getContext('2d');
  x2.drawImage(im, 0, 0);
  drawOverlay(x2 as unknown as CanvasRenderingContext2D, { project: lp.project, sim: sim2, selection: null, tool: 'select', px: 1, routeActiveNode: null, drawing: [], mouse: null, dragRect: null, hover: null, gaitDebug: true } as never);
  xd.drawImage(c2, sx, sy, W, H, dx, dy, W * S, H * S);
  xd.fillStyle = '#000'; xd.font = '22px sans-serif'; xd.fillText(s.l, dx + 8, dy + 26);
}
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'seniori-chuze.png'), sheet.toBuffer('image/png'));
await fs.writeFile(path.join(out, 'seniori-ladeni.png'), dbg.toBuffer('image/png'));
console.log('Uloženo:', path.join(out, 'seniori-chuze.png'), path.join(out, 'seniori-ladeni.png'));
