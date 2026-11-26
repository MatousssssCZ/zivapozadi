/**
 * Měření „skákání“ šály: pro chodce s dlouhou šálou krokuje fyziku doplňků po snímcích (60 fps)
 * a měří zrychlení konce šály vůči uzlu (m/s²) a rozkmit konce (m).  npx tsx scripts/scarf-check.ts
 */
import path from 'node:path';
import { loadProject } from '../src/node/projectIO';
import { Simulation } from '../src/core/sim/simulation';
import { characterVisual } from '../src/core/render/characterPose';
import { scarfKnots, stepAccessoryPhysics, TAIL_SEGS } from '../src/core/render/accessories';
import { Q } from '../src/core/scene/camera';

const lp = await loadProject(path.resolve(process.argv[2] ?? 'demo/Tramvajova-ulice.zscena'));
const sim = Simulation.create(lp.project, lp.manifests); sim.advanceTo(20);
const owner = {}; const stats: { id: string; acc: number; span: number; n: number }[] = [];
const rec = new Map<string, { x: number; y: number }[]>();
for (let f = 0; f < 60 * 30; f++) {
  sim.runSteps(1); const t = sim.time();
  for (const a of sim.state.agents) {
    if (a.hidden) continue;
    const c = sim.characterOf(a.id)!, m = sim.manifests[c.assetId]; const cv = characterVisual(a, m, c, lp.project.scene);
    const acc = cv.rig?.acc; if (!acc || acc.spec.scarf !== 'long' || acc.geo.back) continue;
    const { spec, geo } = acc, sg = cv.mirror ? -1 : 1, k = cv.scale, ppm = k / Q;
    const toS = (p: { x: number; y: number }) => ({ x: cv.x + p.x * sg * k, y: cv.y + p.y * k });
    const knots = scarfKnots(spec, geo), seg = ((spec.tailLen * 0.4) / Q / TAIL_SEGS) * (geo.neckW / 11);
    const fwdL = { x: -geo.torsoUp.y, y: geo.torsoUp.x }; if (fwdL.x < 0) { fwdL.x = -fwdL.x; fwdL.y = -fwdL.y; }
    const ph = stepAccessoryPhysics(owner, a.id, t, { knots: knots.map(toS), segPx: knots.map((_, i) => seg * k * (i ? 0.86 : 1)), top: null, up: { x: 0, y: -1 }, ppm, chestN: { x: fwdL.x * sg, y: fwdL.y }, chestP: toS({ x: knots[0].x - geo.neckW * 0.05, y: knots[0].y }), wind: 0.4 });
    const tl = ph.tails[0], tip = tl.p[tl.p.length - 1], kn = tl.p[0];
    const arr = rec.get(a.id) ?? []; arr.push({ x: (tip.x - kn.x) / ppm, y: (tip.y - kn.y) / ppm }); rec.set(a.id, arr);
  }
}
for (const [id, arr] of rec) {
  if (arr.length < 120) continue;
  let acc = 0; for (let i = 2; i < arr.length; i++) acc += Math.hypot(arr[i].x - 2 * arr[i - 1].x + arr[i - 2].x, arr[i].y - 2 * arr[i - 1].y + arr[i - 2].y) * 3600;
  const xs = arr.map((p) => p.x), ys = arr.map((p) => p.y);
  stats.push({ id, acc: acc / (arr.length - 2), span: Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), n: arr.length });
}
for (const s of stats) console.log(`${s.id}: průměrné zrychlení konce vůči uzlu ${s.acc.toFixed(2)} m/s², rozkmit ${s.span.toFixed(3)} m (${s.n} snímků)`);
console.log('PRŮMĚR zrychlení', (stats.reduce((q, s) => q + s.acc, 0) / stats.length).toFixed(2), 'm/s²');
