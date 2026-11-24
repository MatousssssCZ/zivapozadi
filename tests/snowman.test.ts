import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateRadnice } from '../scripts/generate-radnice-demo';
import { Simulation } from '../src/core/sim/simulation';
import { canonicalJson } from '../src/core/model/hash';
import { startSnowman, snowmanZoneFree, sessionBalls, SNOWMAN_RADII } from '../src/core/activities/snowman';

/** Balíček „živá pozadí“ B05 – stavba sněhuláka (T02, T11, T12, T13). */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'snowman.zscena');
  await generateRadnice(dir);
  lp = await loadProject(dir);
  lp.project.characters.forEach((c) => { c.routine = 'visitor'; });
}, 60000);

function setup() {
  const sim = Simulation.create(lp.project, lp.manifests);
  sim.advanceTo(8);
  const zone = lp.project.zones.find((z) => z.activityType === 'snowman')!;
  const free = sim.state.agents.filter((a) => !a.hidden && !a.activity && !a.holding && !a.follow && !sim.state.agents.some((x) => x.follow?.leaderId === a.id));
  const [a, b] = free;
  a.route = null; b.route = null;
  const s = startSnowman(sim.sessionHost(), zone, a, b);
  return { sim, zone, a, b, s };
}

describe('sněhulák', () => {
  it('postup fází, růst koule jen pohybem, hotový objekt s kolizí; druhá stavba v zóně zamítnuta', () => {
    const { sim, zone, s } = setup();
    expect(s).not.toBeNull();
    expect(snowmanZoneFree(sim.sessionHost(), zone)).not.toBeNull(); // probíhá stavba
    const phases: string[] = [];
    let lastR = 0, standGrow = 0; // přírůstek poloměru, když tlačící postava stojí (m)
    for (let i = 0; i < 60 * 260 && sim.state.sessions?.length; i++) {
      sim.step();
      const ss = sim.state.sessions?.[0];
      if (ss && phases[phases.length - 1] !== ss.phase) phases.push(ss.phase);
      const b = sessionBalls(sim.state)[0];
      if (b) {
        const roller = sim.state.agents.find((x) => x.id === (ss!.phase === 'roll1' ? ss!.participantIds.find((id) => ss!.roles[id] === 'helper') : ss!.participantIds.find((id) => ss!.roles[id] === 'lead')));
        if (roller && lastR > 0 && roller.speed < 0.01 && b.r > lastR && ss!.phase.startsWith('roll')) standGrow += b.r - lastR;
        lastR = b.r;
        expect(b.r).toBeLessThanOrEqual(SNOWMAN_RADII[0] * 1.06);
      } else lastR = 0;
    }
    expect(phases).toEqual(['gather', 'roll0', 'roll1', 'lift1', 'roll2', 'lift2', 'decorate', 'admire']);
    expect(standGrow).toBeLessThan(0.003); // jen dorovnání posledních cm na konci dráhy
    const o = sim.state.runtimeObjects![0];
    expect(o.stage).toBe('done');
    expect(o.radii.every((r, i) => r > SNOWMAN_RADII[i] * 0.85 && r <= SNOWMAN_RADII[i] * 1.06)).toBe(true);
    expect(o.decorations).toEqual(['eyes', 'nose', 'scarf', 'buttons']);
    expect(sim.state.sessions).toEqual([]);
    expect(Object.keys(sim.state.reservations).some((k) => k.startsWith('actor:') || k.startsWith('zone:'))).toBe(false);
    expect(snowmanZoneFree(sim.sessionHost(), zone)).toMatch(/už sněhulák/);
  }, 120000);

  it('checkpoint uprostřed válení: obnovený běh je shodný', () => {
    const { sim } = setup();
    for (let i = 0; i < 60 * 70; i++) sim.step();
    expect(sim.state.sessions?.[0]?.phase).toMatch(/roll|lift/);
    const b = Simulation.restore(lp.project, lp.manifests, JSON.parse(JSON.stringify(sim.state)));
    for (let i = 0; i < 60 * 20; i++) { sim.step(); b.step(); }
    expect(canonicalJson(b.state)).toBe(canonicalJson(sim.state)); // nezávisle na pořadí klíčů
  }, 120000);

  it('přerušení (účastník zmizí): koule nezmizí, zóna zůstane obsazená', () => {
    const { sim, b, zone } = setup();
    for (let i = 0; i < 60 * 40 && !sessionBalls(sim.state).some((x) => x.r > 0.1); i++) sim.step();
    expect(sessionBalls(sim.state).length).toBe(1);
    b.hidden = true;
    sim.step();
    expect(sim.state.sessions).toEqual([]);
    expect(sim.state.runtimeObjects?.length).toBe(1);
    expect(snowmanZoneFree(sim.sessionHost(), zone)).not.toBeNull();
  }, 120000);
});
