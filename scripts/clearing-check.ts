/**
 * Kontrolní scéna odklízení sněhu (bez editoru):
 *   npx tsx scripts/clearing-check.ts [projekt.zscena] [výstupní-složka]
 * Spustí jednu návštěvu pracovníka v Liberci (bez sněžení), vypíše fáze a bilanci zásob a uloží:
 *   odklizeni-faze.png  – fáze práce ve skutečné velikosti postavy ve scéně (1080p výřez, 2× zvětšený)
 *   odklizeni-ladeni.png – tytéž okamžiky s ladicím překryvem (mřížka sněhu, hrana, úchopy, chodidla, zásoby)
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { stocks, total } from '../src/core/sim/snowMaterial';
import { drawOverlay } from '../src/renderer/overlay';

const dir = path.resolve(process.argv[2] ?? 'demo/Liberec-zivy-trh.zscena'), out = path.resolve(process.argv[3] ?? '.');
const lp = await loadProject(dir);
lp.project.scene.snowfall.enabled = false;
const cfg = lp.project.clearing;
if (!cfg) { console.error('Projekt nemá odklízení (project.clearing).'); process.exit(2); }
const sim = Simulation.create(lp.project, lp.manifests);
const img = await loadNodeImages(lp);
const r = createNodeFrameRenderer(lp, img, 1920, 1080);

// průchod: zaznamenat první okamžik každé fáze (poprvé), bilanci a statistiky
const firstAt: Record<string, number> = {}; let t0: number | null = null, maxErr = 0, last = '';
for (let i = 0; i < 60 * 600; i++) {
  sim.step();
  const st = sim.state.clearing; if (!st?.snow) continue;
  const tt = total(st.snow); t0 ??= tt; maxErr = Math.max(maxErr, Math.abs(tt - t0));
  if (st.phase !== last) { firstAt[st.phase] ??= sim.time(); last = st.phase; const s = stocks(st.snow); console.log(`${sim.time().toFixed(1).padStart(6)} s  ${st.phase.padEnd(8)} povrch ${s.surface.toFixed(2)}  val ${s.ridge.toFixed(2)}  list ${s.blade.toFixed(2)}  vzduch ${s.air.toFixed(2)}  okraj+hromada ${s.edge.toFixed(2)} kg`); }
  if (st.n > 0 && st.phase === 'offstage') break;
}
const st = sim.state.clearing!;
console.log(`\nbilance: max. odchylka ${maxErr.toExponential(2)} kg z ${t0!.toFixed(2)} kg; statistiky ${JSON.stringify(st.stats)}`);

// snímky fází (nová simulace, stejný průběh – deterministická)
const shots = ['push', 'scoop', 'lift', 'turn', 'throw', 'return', 'inspect'].filter((p) => firstAt[p] !== undefined)
  .map((p) => ({ p, t: firstAt[p] + (p === 'throw' ? 0.42 : p === 'push' ? 1.2 : 0.35) }));
shots.push({ p: 'hotovo (po odchodu)', t: sim.time() + 2 });
const sim2 = Simulation.create(lp.project, lp.manifests);
const W = 520, H = 300, S = 2, C = 2;
const sheet = createCanvas(W * S * C, H * S * Math.ceil(shots.length / C)), dbg = createCanvas(W * S * C, H * S * Math.ceil(shots.length / C));
const x = sheet.getContext('2d'), xd = dbg.getContext('2d');
const cx = 1420, cy = 920;
for (let k = 0; k < shots.length; k++) {
  sim2.advanceTo(shots[k].t);
  r.render(sim2, shots[k].t);
  const im = await loadImage(r.png());
  const dx = (k % C) * W * S, dy = Math.floor(k / C) * H * S;
  x.drawImage(im, cx - W / 2, cy - H / 2, W, H, dx, dy, W * S, H * S);
  x.fillStyle = '#000'; x.font = '22px sans-serif'; x.fillText(`${shots[k].p} (${shots[k].t.toFixed(1)} s)`, dx + 8, dy + 26);
  // ladicí překryv
  const c2 = createCanvas(1920, 1080), x2 = c2.getContext('2d');
  x2.drawImage(im, 0, 0);
  drawOverlay(x2 as unknown as CanvasRenderingContext2D, { project: lp.project, sim: sim2, selection: null, tool: 'select', px: 1, routeActiveNode: null, drawing: [], mouse: null, dragRect: null, hover: null, clearingDebug: true } as never);
  xd.drawImage(c2, cx - W / 2, cy - H / 2, W, H, dx, dy, W * S, H * S);
}
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'odklizeni-faze.png'), sheet.toBuffer('image/png'));
await fs.writeFile(path.join(out, 'odklizeni-ladeni.png'), dbg.toBuffer('image/png'));
console.log('Uloženo:', path.join(out, 'odklizeni-faze.png'), path.join(out, 'odklizeni-ladeni.png'));
