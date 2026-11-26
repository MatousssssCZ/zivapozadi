import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateTram } from '../scripts/generate-tram-demo';
import { Simulation } from '../src/core/sim/simulation';
import { lotTrees } from '../src/core/sim/ep/treeLot';
import { ornsOf, boxLeft } from '../src/core/sim/ep/decorate';
import { lightsWorld } from '../src/core/sim/ep/lights';

/** A13, A11, A12 (a další epizody): proběhnou celé, změny prostředí přetrvají, nic se nezdvojí. */
let lp: LoadedProject;
beforeAll(async () => { const dir = path.join(await tmpDir(), 'ep.zscena'); await generateTram(dir); lp = await loadProject(dir); }, 300000);
const run = (id: string, maxT = 400) => {
  const sim = Simulation.create(lp.project, lp.manifests); sim.advanceTo(3);
  expect(sim.episodeNow(id).ok).toBe(true);
  let t = 3; for (; t < maxT; t += 0.5) { sim.advanceTo(t); if (sim.state.episodes![id].phase === 'idle' && t > 5) break; }
  expect(sim.state.episodes![id].done).toBe(1);
  return sim;
};
describe('scénické epizody', () => {
  it('A13: odnesou právě jeden stromek', () => { const s = run('ep_stromky'); expect(lotTrees(s.state.episodes!.ep_stromky).filter((x) => !x.present).length).toBe(1); }, 300000);
  it('A11: ozdoby přibydou na různých háčcích a ubydou z krabice', () => {
    const s = run('ep_zdobeni'), st = s.state.episodes!.ep_zdobeni, o = ornsOf(st);
    expect(o.length).toBeGreaterThanOrEqual(3); expect(new Set(o.map((x) => x.hook)).size).toBe(o.length); expect(boxLeft(st)).toBe(8 - o.length);
  }, 300000);
  it('A12: všechny háčky, světla až po vypínači, nikdo nezůstal nad zemí', () => {
    const s = run('ep_svetylka'), L = lightsWorld(s.state.episodes!.ep_svetylka);
    expect(L.hooks).toBe(4); expect(L.on).toBe(true);
    const f = s.state.agents.find((a) => a.id === 'ch_kvetinarka')!; expect(f.off?.y ?? 0).toBeCloseTo(0, 3);
  }, 300000);
});
