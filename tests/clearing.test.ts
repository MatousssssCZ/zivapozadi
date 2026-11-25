import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';
import { characterVisual } from '../src/core/render/characterPose';
import { stocks, total, remainingIn, baseMass } from '../src/core/sim/snowMaterial';
import { resetClearing, laneCenters } from '../src/core/sim/clearing';
import { canonicalJson } from '../src/core/model/hash';

/** Odklízení sněhu v Liberci: postava + lopata + sníh jako jeden systém (podmínky E, F, G a vizuální invarianty). */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'clr.zscena');
  await generateLiberec(dir);
  lp = await loadProject(dir);
  lp.project.scene.snowfall.enabled = false; // bilance bez nového sněhu
}, 60000);

function runVisit(sim: Simulation, onTick?: (sim: Simulation) => void) {
  for (let i = 0; i < 60 * 500; i++) {
    sim.step();
    onTick?.(sim);
    const st = sim.state.clearing;
    if (st && st.n > 0 && st.phase === 'offstage') return true;
  }
  return false;
}

describe('odklízení sněhu – celá činnost', () => {
  it('E + G: plocha se odklidí, postava odejde; bilance sněhu se zachovává; každá událost proběhne právě jednou', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    let t0: number | null = null, maxErr = 0, releasesSeen = 0, prevThrowFlag = false;
    let maxGrip = 0, minH = Infinity, reachBad = 0;
    const done = runVisit(sim, (s) => {
      const st = s.state.clearing!; if (!st.snow) return;
      const tt = total(st.snow); t0 ??= tt; maxErr = Math.max(maxErr, Math.abs(tt - t0));
      // uvolnění odhozu: příznak se nastaví jednou za fázi
      const fl = !!st.flags.released; if (fl && !prevThrowFlag && st.phase === 'throw') releasesSeen++; prevThrowFlag = fl && st.phase === 'throw';
      // ruce drží úchopy, list nikdy pod zemí
      if (s.state.step % 6) return;
      const a = s.state.agents.find((x) => x.id === lp.project.clearing!.workerId)!;
      if (a.hidden || !a.anim.tool) return;
      minH = Math.min(minH, a.anim.tool.h);
      const c = s.characterOf(a.id)!, cv = characterVisual(a, s.manifests[c.assetId], c, lp.project.scene), T = cv.pose.tool!;
      const working = !['arrive', 'return', 'inspect', 'done', 'leave', 'hold'].includes(s.state.clearing!.phase);
      if (working && !T.reachOk) reachBad++;
      if (working && !(T.held[0] && T.held[1])) reachBad++; // při práci vždy obě ruce
      for (const k of [0, 1]) if (T.held[k]) maxGrip = Math.max(maxGrip, Math.hypot(cv.pose.arms[k].end.x - T.grips[k].x, cv.pose.arms[k].end.y - T.grips[k].y));
    });
    expect(done).toBe(true);
    const st = sim.state.clearing!, snow = st.snow!;
    // E: zbývá jen tenký film (≤ 8 % původní vrstvy na ploše), sníh je u okraje / na hromadě
    const w = lp.project.clearing!.work, cells = ((w.x1 - w.x0) * (w.z1 - w.z0)) / (snow.p.cell ** 2), initial = cells * baseMass(snow);
    expect(stocks(snow).surface).toBeLessThan(initial * 0.08);
    expect(stocks(snow).edge).toBeGreaterThan(initial * 0.85);
    expect(st.stats.pushOffs).toBeGreaterThanOrEqual(laneCenters(lp.project.clearing!, snow.p.bladeWidth).length);
    expect(st.stats.throws).toBeGreaterThanOrEqual(1);
    for (const z of laneCenters(lp.project.clearing!, snow.p.bladeWidth)) expect(remainingIn(snow, z - 0.1, z + 0.1)).toBeLessThan(0.3);
    // G: bilance (bez sněžení) v toleranci zaokrouhlení
    expect(maxErr).toBeLessThan(1e-6);
    // události: každé uvolnění právě jednou a jen ve fázi odhozu
    expect(st.stats.releases).toBe(st.stats.throws);
    expect(releasesSeen).toBe(st.stats.releases);
    // vizuální invarianty: dlaně na násadě, list nad dlažbou, žádné prodlužování paží
    expect(maxGrip).toBeLessThan(0.8); // jednotky postavy (≈ 1 cm): ruka, která drží, je na úchopu
    expect(minH).toBeGreaterThanOrEqual(0);
    expect(reachBad).toBe(0);
    // dokončená plocha: další návštěva se nenaplánuje dřív, než napadne sníh
    expect(st.until).toBeGreaterThan(sim.time() + 500);
  }, 300000);

  it('F: průběh i přesunutý sníh nezávisí na tom, po jak velkých kusech čas běží (náhled, výpadek snímků)', () => {
    const a = Simulation.create(lp.project, lp.manifests), b = Simulation.create(lp.project, lp.manifests);
    a.advanceTo(120);
    for (let t = 0; t < 120; t += 1 / 24 + (Math.floor(t) % 7 === 0 ? 0.3 : 0)) b.advanceTo(Math.min(120, t)); // nepravidelné snímky a výpadky
    b.advanceTo(120);
    expect(canonicalJson(b.state.clearing)).toBe(canonicalJson(a.state.clearing));
    expect(stocks(b.state.clearing!.snow!).surface).toBeCloseTo(stocks(a.state.clearing!.snow!).surface, 9);
  }, 120000);

  it('ladění: reset obnoví sníh, „jeden cyklus“ provede práci do prvního odhozu / vytlačení a zastaví se', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    sim.advanceTo(5);
    const st = sim.state.clearing!;
    resetClearing(st, lp.project.clearing!, sim.time(), true);
    const t0 = total(st.snow!);
    for (let i = 0; i < 60 * 120 && st.phase !== 'hold'; i++) sim.step();
    expect(st.phase).toBe('hold');
    expect(st.stats.throws + st.stats.pushOffs).toBe(1);
    expect(Math.abs(total(st.snow!) - t0)).toBeLessThan(1e-6);
    expect(stocks(st.snow!).surface).toBeLessThan(t0); // změna sněhu po práci přetrvá
  }, 120000);
});
