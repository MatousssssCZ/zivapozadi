import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';
import { runCoopCheck } from '../src/core/activities/coopCheck';
import { rOfMass, massOfR, contactWidth, COOP_DIAM } from '../src/core/activities/coopSnowman';
import { canonicalJson } from '../src/core/model/hash';

/** Rodič a dítě staví sněhuláka: souběžné úkoly, materiál, zvedání, předání hlavy, zdobení. */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'coop.zscena');
  await generateLiberec(dir);
  lp = await loadProject(dir);
  lp.project.scene.snowfall.enabled = false; delete lp.project.falls;
}, 60000);

describe('sněhulák rodič + dítě', () => {
  it('materiál: r = ∛(3m / 4π·300), šířka styku z vrstvy 5 cm', () => {
    expect(rOfMass(massOfR(0.25))).toBeCloseTo(0.25, 9);
    expect(massOfR(0.25)).toBeCloseTo(19.63, 1); // spodní koule 50 cm
    expect(contactWidth(0.25)).toBeCloseTo(2 * Math.sqrt(2 * 0.25 * 0.05 - 0.0025), 9);
  });

  it('celá stavba: pořadí, rozměry, bilance sněhu, souběžnost, odstup při zvedání, předání, dosah dítěte', () => {
    const r = runCoopCheck(Simulation.create(lp.project, lp.manifests));
    expect(r.session).not.toBeNull();
    expect(r.ok).toBe(true);
    expect(r.order).toEqual(['basePlaced', 'middlePlaced', 'jointFilled', 'headPlaced', 'decorated', 'left']);
    r.diam.forEach((d, i) => expect(Math.abs(d / COOP_DIAM[i] - 1)).toBeLessThan(0.09));
    expect(r.maxMassErr).toBeLessThan(1e-9); // sníh ze země = koule + spoj + v náručí
    expect(r.removed).toBeGreaterThan(25);
    expect(r.concurrentSec).toBeGreaterThan(20);
    expect(r.concurrentPairs.length).toBeGreaterThanOrEqual(3);
    expect(r.minClearLift).toBeGreaterThan(0.8);
    expect(['released', 'putDown'].includes(r.handoverStages[r.handoverStages.length - 1])).toBe(true);
    if (r.handoverStages.includes('contact')) { expect(r.handoverStages.slice(0, 4)).toEqual(['approach', 'contact', 'transfer', 'released']); expect(r.handoverDist!).toBeLessThan(1.0); }
    expect(r.decorations.length).toBe(4);
    expect(r.childAboveReach).toBe(0);
    expect(r.decorations.some((x) => x.by === 'dítě') && r.decorations.some((x) => x.by === 'rodič')).toBe(true);
  }, 300000);

  it('nezávislost na snímkové frekvenci a obnovení ze stavu uprostřed stavby', () => {
    const a = Simulation.create(lp.project, lp.manifests), b = Simulation.create(lp.project, lp.manifests);
    for (const s of [a, b]) { s.advanceTo(8); if (!s.state.sessions?.some((x) => (x.data as { coop?: boolean }).coop)) s.startCoopSnowmanNow(); }
    a.advanceTo(100);
    for (let t = 8; t < 100; t += 1 / 30 + (Math.floor(t) % 13 === 0 ? 0.25 : 0)) b.advanceTo(t);
    b.advanceTo(100);
    expect(canonicalJson(b.state.sessions)).toBe(canonicalJson(a.state.sessions));
    // checkpoint (JSON) uprostřed: obnovený běh je shodný
    const c = Simulation.restore(lp.project, lp.manifests, JSON.parse(JSON.stringify(a.state)));
    for (let i = 0; i < 60 * 30; i++) { a.step(); c.step(); }
    expect(canonicalJson(c.state)).toBe(canonicalJson(a.state));
  }, 200000);
});
