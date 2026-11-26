import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';

/** A07: anděl vzniká tahy (ne hotový naráz), dítě vstane, rezervace se uvolní, otisk zůstane. */
let lp: LoadedProject;
beforeAll(async () => { const dir = path.join(await tmpDir(), 'angel.zscena'); await generateLiberec(dir); lp = await loadProject(dir); }, 300000);

describe('sněhový anděl (A07)', () => {
  it('celá epizoda', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    let t = 20; for (; t < 300; t += 2) { sim.advanceTo(t); if (sim.startSnowAngelNow().ok) break; }
    expect(t).toBeLessThan(300);
    const armsSeen: number[] = []; let done = false;
    for (const t0 = t; t < t0 + 150; t += 0.25) {
      sim.advanceTo(t);
      const im = sim.state.angels?.[sim.state.angels.length - 1]; if (im) armsSeen.push(im.arms);
      if (!sim.state.sessions?.some((s) => s.type === 'snowAngel')) { done = true; break; }
    }
    expect(done).toBe(true);
    expect(armsSeen.length).toBeGreaterThan(10);
    expect(armsSeen[0]).toBeLessThan(0.2); // otisk začíná prázdný
    expect(armsSeen[armsSeen.length - 1]).toBe(1);
    for (let i = 1; i < armsSeen.length; i++) expect(armsSeen[i]).toBeGreaterThanOrEqual(armsSeen[i - 1]); // jen přibývá
    expect(sim.state.reservations['zone:zone_andel']).toBeUndefined(); // místo uvolněné
    expect(sim.state.agents.some((a) => a.anim.sit?.kind === 'angel')).toBe(false); // nikdo nezůstal ležet
    sim.advanceTo(t + 60); expect(sim.state.angels!.length).toBe(1); // otisk po odchodu přetrvá
  }, 300000);
});
