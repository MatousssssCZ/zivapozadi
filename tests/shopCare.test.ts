import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateTram } from '../scripts/generate-tram-demo';
import { Simulation } from '../src/core/sim/simulation';
import type { BakeryTask } from '../src/core/sim/bakery';

/** Péče o obchod A18a–d: každá varianta proběhne, předměty se nezdvojí, změny prostředí přetrvají. */
let lp: LoadedProject;
beforeAll(async () => { const dir = path.join(await tmpDir(), 'shop.zscena'); await generateTram(dir); lp = await loadProject(dir); });

describe('péče o obchod (A18)', () => {
  it('posyp, bedýnka ven i zpět, zametání; cedule se mění jen gestem; žádné zdvojení', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    let t = 2; sim.advanceTo(t);
    const order: BakeryTask[] = ['salt', 'crate', 'crate', 'sweep'];
    let signChangesOutsideGesture = 0, dupCrate = 0, maxProps = 0;
    for (const task of order) {
      while (sim.state.bakery!.phase !== 'inside') { t += 0.5; sim.advanceTo(t); }
      expect(sim.bakerNow(task).ok).toBe(true);
      const t0 = t;
      let lastSide = sim.state.bakery!.sign.side;
      while (t < t0 + 150) {
        t += 0.25; sim.advanceTo(t); const st = sim.state.bakery!;
        const s = st.plan[st.si];
        if (st.sign.side !== lastSide && s?.k !== 'sign') signChangesOutsideGesture++;
        lastSide = st.sign.side;
        const held = sim.state.props.filter((p) => p.kind === 'crate').length;
        if (held + (st.crate.out ? 1 : 0) > 1) dupCrate++;
        maxProps = Math.max(maxProps, sim.state.props.length);
        if (st.phase === 'inside') break;
      }
      expect(sim.state.bakery!.phase).toBe('inside'); // epizoda skončila (nezasekla se)
    }
    const st = sim.state.bakery!;
    expect(st.done.salt).toBe(1); expect(st.done.crate).toBe(2); expect(st.done.sweep).toBe(1);
    expect(st.done.sign).toBeGreaterThanOrEqual(2);
    expect(st.sign.side).toBe('open'); // po návratu je zase otevřeno
    expect(st.crate.out).toBe(false);
    expect(signChangesOutsideGesture).toBe(0);
    expect(dupCrate).toBe(0);
    expect(st.grits).toBeGreaterThanOrEqual(0); // kbelík nikdy do mínusu
    expect(st.grit.length).toBeGreaterThan(50); // posyp leží na chodníku
    expect(sim.state.props.filter((p) => p.kind === 'bucket' || p.kind === 'crate').length).toBe(0);
  });
});
