/**
 * Kontrolní scéna pádů (bez editoru):
 *   npx tsx scripts/falls-check.ts [projekt.zscena] [výstupní-složka]
 * Spustí každou variantu (dozadu, dopředu, bokem, zachycené uklouznutí) vlevo i vpravo s pomocníkem,
 * ověří pořadí fází, jeden otisk na událost, spojitost polohy těla (žádný skok na konci) a uloží
 *   pady-faze.png – řádek na variantu, sloupec na fázi (skutečná scéna, zvětšený výřez)
 *   pady-ladeni.png – totéž s kontakty (zelená = stojí, červená = klouže) a fází
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/node/projectIO';
import { loadNodeImages, createNodeFrameRenderer } from '../src/node/napiRender';
import { Simulation } from '../src/core/sim/simulation';
import { runFallCheck } from '../src/core/sim/fallCheck';
import { FALL_KEYS, FALL_LABEL, FALL_PHASE_LABEL, type FallVariant } from '../src/core/anim/fallPoses';
import { drawOverlay } from '../src/renderer/overlay';

const dir = path.resolve(process.argv[2] ?? 'demo/Liberec-zivy-trh.zscena'), out = path.resolve(process.argv[3] ?? '.');
const lp = await loadProject(dir);
lp.project.scene.snowfall.enabled = false;
const variants: FallVariant[] = ['back', 'forward', 'side', 'saved'];
for (const v of variants) for (const s of [1, -1] as const) {
  const r = runFallCheck(Simulation.create(lp.project, lp.manifests), v, s, 40, true);
  console.log(`${FALL_LABEL[v].padEnd(36)} ${s > 0 ? 'P' : 'L'}  ${r.name.padEnd(12)} fáze: ${r.phases.join(' → ')}`);
  console.log(`   otisků ${r.marks}, max. skok pánve ${r.maxHipJumpPx.toFixed(2)} px/krok (${r.maxHipJumpU.toFixed(2)} j.), pomocník: ${r.helper ?? '—'}${r.helped ? ' (nabídl ruku)' : ''}, pokračuje v chůzi: ${r.walksAfter ? 'ano' : 'ne'}`);
}
// arch: řádek na variantu, sloupec na fázi (strana P)
const img = await loadNodeImages(lp);
const R = createNodeFrameRenderer(lp, img, 1920, 1080);
const cols = ['loss', 'recover', 'fall', 'impact', 'pause', 'getup', 'brush', 'done'];
const W = 300, H = 260, S = 2;
const sheet = createCanvas(W * S * cols.length, H * S * variants.length), dbg = createCanvas(W * S * cols.length, H * S * variants.length);
const x = sheet.getContext('2d'), xd = dbg.getContext('2d');
for (const [row, v] of variants.entries()) {
  const sim = Simulation.create(lp.project, lp.manifests);
  sim.advanceTo(40);
  const name = sim.triggerFall(v, 1, { helper: true });
  const a = sim.state.agents.find((q) => q.name === name)!;
  const t0 = sim.time();
  for (const [ci, ph] of cols.entries()) {
    const K = FALL_KEYS[v], i = K.findIndex((k) => k.ph === ph);
    if (i < 0) continue;
    const tk = ph === 'done' ? K[K.length - 1].t + 0.5 : i + 1 < K.length ? (K[i].t + K[i + 1].t) / 2 : K[i].t;
    sim.advanceTo(t0 + tk); R.render(sim, sim.time());
    const im = await loadImage(R.png());
    const sx = a.pos.x - W / 2, sy = a.pos.y - H + 50, dx = ci * W * S, dy = row * H * S;
    x.drawImage(im, sx, sy, W, H, dx, dy, W * S, H * S);
    const lab = `${FALL_LABEL[v]} · ${FALL_PHASE_LABEL[ph as keyof typeof FALL_PHASE_LABEL]}`;
    x.fillStyle = '#000'; x.font = '20px sans-serif'; x.fillText(lab, dx + 8, dy + 24);
    const c2 = createCanvas(1920, 1080), x2 = c2.getContext('2d'); x2.drawImage(im, 0, 0);
    drawOverlay(x2 as unknown as CanvasRenderingContext2D, { project: lp.project, sim, selection: null, tool: 'select', px: 1, routeActiveNode: null, drawing: [], mouse: null, dragRect: null, hover: null, fallDebug: true } as never);
    xd.drawImage(c2, sx, sy, W, H, dx, dy, W * S, H * S); xd.fillStyle = '#000'; xd.font = '20px sans-serif'; xd.fillText(lab, dx + 8, dy + 24);
  }
}
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'pady-faze.png'), sheet.toBuffer('image/png'));
await fs.writeFile(path.join(out, 'pady-ladeni.png'), dbg.toBuffer('image/png'));
console.log('Uloženo:', path.join(out, 'pady-faze.png'), path.join(out, 'pady-ladeni.png'));
