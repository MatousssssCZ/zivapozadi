import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateTram } from '../scripts/generate-tram-demo';
import { Simulation } from '../src/core/sim/simulation';
import { PRAM } from '../src/core/sim/pram';

/** A17: kola odpovídají dráze, stojící kočárek je zabrzděný a kola se netočí, deka se upraví. */
let lp: LoadedProject;
beforeAll(async () => { const dir = path.join(await tmpDir(), 'pram.zscena'); await generateTram(dir); lp = await loadProject(dir); });

describe('kočárek (A17)', () => {
  it('celá epizoda: jízda, brzda, péče o deku, odjezd', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    sim.advanceTo(2); expect(sim.pramNow().ok).toBe(true);
    const seen = new Set<string>(); let spinWhileBraked = 0, wheelErr = 0, prevPhi: number[] | null = null, prevDist = 0, blanketBefore = 1, maxV = 0;
    for (let t = 2; t < 140; t += 1 / 60) {
      sim.advanceTo(t); const st = sim.state.pram!; seen.add(st.phase);
      if (st.phase === 'care' && blanketBefore === 1) blanketBefore = st.blanket;
      if (prevPhi && st.S) {
        const dPhi = Math.abs(st.phi[0] + st.phi[1] - prevPhi[0] - prevPhi[1]) / 2 * PRAM.rRear, dS = (st.dist ?? 0) - prevDist;
        if (st.brake && dPhi > 1e-9) spinWhileBraked++;
        wheelErr += Math.abs(dPhi - dS);
        maxV = Math.max(maxV, Math.abs(st.v ?? 0));
      }
      prevPhi = [...st.phi]; prevDist = st.dist ?? 0;
      if (st.phase === 'offstage' && seen.has('leave')) break;
    }
    const st = sim.state.pram!;
    for (const ph of ['walk', 'brake', 'toSide', 'care', 'toHandle', 'release', 'leave']) expect(seen.has(ph)).toBe(true);
    expect(st.done).toBe(1);
    expect(spinWhileBraked).toBe(0);
    expect(wheelErr / Math.max(1, st.dist ?? 1)).toBeLessThan(0.05); // průměrná kola ≈ ujetá dráha (zatáčky ±)
    expect(blanketBefore).toBeLessThan(0.5); expect(st.blanket).toBeGreaterThan(0.9);
    expect(maxV).toBeLessThan(1.7);
  });
});
