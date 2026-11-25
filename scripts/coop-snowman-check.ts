/**
 * Kontrolní scéna: rodič a dítě staví sněhuláka (bez editoru).
 *   npx tsx scripts/coop-snowman-check.ts [projekt.zscena] [výstupní-složka] [--jen=val|zved|predani]
 * Vypíše časovou osu (souběžné úkoly), rozměry koulí, bilanci sněhu, odstup při zvedání, předání hlavy
 * a ozdoby; uloží sneh-faze.png (klíčové okamžiky ve scéně) a sneh-ladeni.png (s ladicím překryvem).
 * --jen=… uloží jen snímky dané části (válení / zvedání / předání) – celá stavba se ale vždy simuluje
 * (deterministicky), aby stav na začátku části byl skutečný, ne připravený.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { runCoopCheck } from '../src/core/activities/coopCheck';
import { drawOverlay } from '../src/renderer/overlay';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), only = process.argv.find((a) => a.startsWith('--jen='))?.slice(6);
const dir = path.resolve(args[0] ?? 'demo/Liberec-zivy-trh.zscena'), out = path.resolve(args[1] ?? '.');
const lp = await loadProject(dir);
lp.project.scene.snowfall.enabled = false; delete lp.project.falls;
const r = runCoopCheck(Simulation.create(lp.project, lp.manifests));
if (!r.session) { console.error('Stavba nezačala:', r.msg); process.exit(2); }
console.log(`${r.parent} (rodič) a ${r.child} (dítě): ${r.ok ? 'hotovo' : 'NEDOKONČENO'} za ${r.duration.toFixed(0)} s`);
console.log(`pořadí: ${r.order.join(' → ')}`);
console.log(`průměry koulí: ${r.diam.map((x, i) => `${(x * 100).toFixed(1)} cm (cíl ${(r.diamTarget[i] * 100).toFixed(0)})`).join(', ')}`);
console.log(`sníh ze země ${r.removed.toFixed(3)} kg, max. chyba bilance ${r.maxMassErr.toExponential(1)} kg`);
console.log(`souběžně ${r.concurrentSec.toFixed(0)} s: ${r.concurrentPairs.join('; ')}`);
console.log(`odstup dítěte od dráhy zvedání: min. ${r.minClearLift.toFixed(2)} m; předání: ${r.handoverStages.join(' → ')}${r.handoverDist !== null ? ` (vzdálenost při kontaktu ${r.handoverDist.toFixed(2)} m)` : ''}`);
console.log(`ozdoby: ${r.decorations.map((x) => `${x.kind} – ${x.by} (${(x.h * 100).toFixed(0)} cm)`).join(', ')}; dítě nad dosahem: ${r.childAboveReach}`);
const sel = r.frames.filter((f) => !only || (only === 'val' ? /válí/.test(f.label) : only === 'zved' ? /nese prostřední|pokládá|odstup/.test(f.label) : /hlav|předání/.test(f.label)));
// snímky (nová simulace, stejný průběh – deterministická)
const img = await loadNodeImages(lp);
const R = createNodeFrameRenderer(lp, img, 1920, 1080);
const sim2 = Simulation.create(lp.project, lp.manifests);
const d0 = r.session.data as { spot: { x: number; y: number } };
const W = 420, H = 300, S = 2, C = 3, rows = Math.ceil(sel.length / C);
const sheet = createCanvas(W * S * C, H * S * rows), dbg = createCanvas(W * S * C, H * S * rows);
const x = sheet.getContext('2d'), xd = dbg.getContext('2d');
sim2.advanceTo(8); if (!sim2.state.sessions?.some((s) => (s.data as { coop?: boolean }).coop)) sim2.startCoopSnowmanNow();
for (const [k, f] of sel.entries()) {
  sim2.advanceTo(f.t); R.render(sim2, f.t);
  const im = await loadImage(R.png());
  const sx = d0.spot.x - W / 2, sy = d0.spot.y - H + 70, dx = (k % C) * W * S, dy = Math.floor(k / C) * H * S;
  x.drawImage(im, sx, sy, W, H, dx, dy, W * S, H * S); x.fillStyle = '#000'; x.font = '22px sans-serif'; x.fillText(`${f.label} (${f.t.toFixed(0)} s)`, dx + 8, dy + 26);
  const c2 = createCanvas(1920, 1080), x2 = c2.getContext('2d'); x2.drawImage(im, 0, 0);
  drawOverlay(x2 as unknown as CanvasRenderingContext2D, { project: lp.project, sim: sim2, selection: null, tool: 'select', px: 0.6, routeActiveNode: null, drawing: [], mouse: null, dragRect: null, hover: null, snowmanDebug: true } as never);
  xd.drawImage(c2, sx, sy, W, H, dx, dy, W * S, H * S); xd.fillStyle = '#000'; xd.font = '22px sans-serif'; xd.fillText(`${f.label} (${f.t.toFixed(0)} s)`, dx + 8, dy + 26);
}
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'sneh-faze.png'), sheet.toBuffer('image/png'));
await fs.writeFile(path.join(out, 'sneh-ladeni.png'), dbg.toBuffer('image/png'));
console.log('Uloženo:', path.join(out, 'sneh-faze.png'), path.join(out, 'sneh-ladeni.png'));
