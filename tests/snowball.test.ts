import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateRadnice } from '../scripts/generate-radnice-demo';
import { Simulation } from '../src/core/sim/simulation';
import { startFight, fightZoneProblem, ballAt } from '../src/core/activities/snowballFight';
import { canonicalJson } from '../src/core/model/hash';

/** Balíček „živá pozadí“ B04 – koulovačka (T09, T10). */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'fight.zscena');
  await generateRadnice(dir);
  lp = await loadProject(dir);
}, 60000);

function setup(allowAdults: boolean) {
  const proj = structuredClone(lp.project);
  proj.characters.forEach((c) => { c.routine = 'visitor'; });
  const zone = proj.zones.find((z) => z.activityType === 'snowballFight')!;
  zone.params.allowAdults = allowAdults;
  const sim = Simulation.create(proj, lp.manifests);
  sim.advanceTo(8);
  const free = sim.state.agents.filter((a) => !a.hidden && !a.activity && !a.holding && !a.follow && !sim.state.agents.some((x) => x.follow?.leaderId === a.id));
  free[0].route = null; free[1].route = null;
  return { sim, zone, a: free[0], b: free[1], proj };
}

describe('koulovačka', () => {
  it('dva dospělí bez povolení: start zamítnut s konkrétním důvodem', () => {
    const { sim, zone, a, b } = setup(false);
    expect(fightZoneProblem(sim.sessionHost(), zone)).toMatch(/pro děti/);
    expect(fightZoneProblem(sim.sessionHost(), zone, true)).toBeNull(); // s dítětem lze
    expect(startFight(sim.sessionHost(), zone, a, b)).toBeNull();
    expect(sim.state.sessions ?? []).toEqual([]);
  });

  it('4–8 hodů, každý výhoz jednou, koule balisticky doletí a zmizí; checkpoint za letu', () => {
    const { sim, zone, a, b, proj } = setup(true);
    expect(startFight(sim.sessionHost(), zone, a, b)).not.toBeNull();
    const seen = new Set<string>();
    let maxFlight = 0, snapDone = false, restored: Simulation | null = null;
    for (let i = 0; i < 60 * 200 && sim.state.sessions?.length; i++) {
      sim.step(); restored?.step();
      for (const p of sim.state.props) if (p.place.kind === 'flying') {
        seen.add(p.id);
        maxFlight = Math.max(maxFlight, sim.time() - p.place.t0);
        const q = ballAt(p.place, sim.time())!;
        expect(Number.isFinite(q.X + q.Z + q.H)).toBe(true);
        if (!snapDone) { snapDone = true; restored = Simulation.restore(proj, lp.manifests, JSON.parse(JSON.stringify(sim.state))); }
      }
    }
    expect(sim.state.sessions).toEqual([]);
    expect(seen.size).toBeGreaterThanOrEqual(4); expect(seen.size).toBeLessThanOrEqual(8);
    expect(maxFlight).toBeLessThan(1.4);
    expect(sim.state.props.some((p) => p.place.kind === 'flying')).toBe(false);
    expect(canonicalJson(restored!.state)).toBe(canonicalJson(sim.state));
  }, 120000);
});
