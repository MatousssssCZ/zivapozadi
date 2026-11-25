import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';
import { measureElders } from '../src/core/anim/elderMetrics';
import { ELDER_PROFILES, elderSpeed, sideIndex } from '../src/core/anim/elderGait';
import { canonicalJson } from '../src/core/model/hash';

/** Chůze seniorů: profil A (pomalá chůze) a B (hůl) – délka kroku, kadence, hůl ukotvená ve světě. */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'eld.zscena');
  await generateLiberec(dir);
  lp = await loadProject(dir);
  lp.project.scene.snowfall.enabled = false;
}, 60000);

describe('chůze seniorů', () => {
  it('profily odpovídají zadání (rychlost = krok × kadence)', () => {
    expect(elderSpeed(ELDER_PROFILES.elderA)).toBeCloseTo(0.833, 2);
    expect(elderSpeed(ELDER_PROFILES.elderB)).toBeCloseTo(0.532, 2);
    // pravá ruka: jde-li postava doprava, je pravý bok blízko kamery; zrcadlově naopak
    expect(sideIndex('E', 'R')).toBe(1); expect(sideIndex('W', 'R')).toBe(0); expect(sideIndex('W', 'L')).toBe(1);
  });

  for (const side of ['R', 'L'] as const) it(`ustálená chůze: krok, kadence, hůl jednou za cyklus, hrot neklouže, ruka na rukojeti (hůl ${side})`, () => {
    const p = structuredClone(lp.project);
    p.characters.find((c) => c.id === 'ch_senior_b')!.caneSide = side;
    const sim = Simulation.create(p, lp.manifests);
    const rep = measureElders(sim, ['ch_senior_a', 'ch_senior_b'], 300);
    for (const r of rep) {
      expect(r.cycles).toBeGreaterThan(20);
      expect(Math.abs(r.stepM / r.targetStepM - 1)).toBeLessThan(0.04);
      expect(Math.abs(r.cadence / r.targetCadence - 1)).toBeLessThan(0.05);
    }
    const b = rep.find((r) => r.id === 'ch_senior_b')!.cane!;
    expect(b.plantsPerCycle).toBeGreaterThan(0.95); expect(b.plantsPerCycle).toBeLessThan(1.05);
    expect(b.maxSlipPx).toBeLessThan(0.5);
    expect(b.maxHandGap).toBeLessThan(2); // jednotky postavy (≈ 1,3 cm/j.): jen v krajních polohách při otočce, jinak 0
    expect(b.lenConst).toBe(true);
    expect(b.lenM).toBeGreaterThan(0.75); expect(b.lenM).toBeLessThan(1.0);
  }, 300000);

  it('nezávislost na snímkové frekvenci (30 / 60 FPS, výpadky)', () => {
    const a = Simulation.create(lp.project, lp.manifests), b = Simulation.create(lp.project, lp.manifests);
    a.advanceTo(90);
    for (let t = 0; t < 90; t += 1 / 30 + (Math.floor(t) % 11 === 0 ? 0.25 : 0)) b.advanceTo(t);
    b.advanceTo(90);
    for (const id of ['ch_senior_a', 'ch_senior_b']) expect(canonicalJson(b.state.agents.find((x) => x.id === id))).toBe(canonicalJson(a.state.agents.find((x) => x.id === id)));
  }, 120000);
});
