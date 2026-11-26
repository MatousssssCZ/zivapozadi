import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadProject } from '../src/node/projectIO';
import { Simulation } from '../src/core/sim/simulation';
import { characterVisual, localToScene } from '../src/core/render/characterPose';

describe('kluziště 2: dvojice za ruce', () => {
  it('děti i páry se drží za ruce (dlaně u sebe), nepovolená dvojice ne', async () => {
    const lp = await loadProject(path.resolve('demo/Pastelove-kluziste-2.zscena'));
    // nepovolená dvojice: dva muži → jen vedle sebe + diagnostika
    const bad = JSON.parse(JSON.stringify(lp.project.characters.find((c) => c.id === 'pair_a2')));
    bad.id = 'pair_bad'; bad.name = 'Druhý muž'; bad.appearance.variants.head = 'head_02_cg'; lp.project.characters.push(bad);
    const sim = Simulation.create(lp.project, lp.manifests);
    expect(sim.diagnostics.some((d) => /za ruce/.test(d.message) && d.message.includes('Druhý muž'))).toBe(true);
    const best: Record<string, number> = {};
    for (let i = 0; i < 60 * 120; i++) {
      sim.step();
      if (i % 30) continue;
      for (const [a, b] of [['pair_k1', 'pair_k2'], ['pair_b1', 'pair_b2'], ['pair_a1', 'pair_a2']]) {
        const A = sim.state.agents.find((x) => x.id === a)!, B = sim.state.agents.find((x) => x.id === b)!;
        if (A.hidden || B.hidden || !(A.anim.hands?.w === 1 && B.anim.hands?.w === 1)) continue;
        const end = (x: typeof A) => { const c = sim.characterOf(x.id)!, cv = characterVisual(x, sim.manifests[c.assetId], c, lp.project.scene), i = x.anim.hands!.t[0] ? 0 : 1; return localToScene(cv, cv.pose.arms[i].end); };
        const pa = end(A), pb = end(B), d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        best[a] = Math.min(best[a] ?? 1e9, d);
      }
      const bb = sim.state.agents.find((x) => x.id === 'pair_bad')!;
      expect(bb.anim.hands?.src === 'hold').toBe(false);
    }
    console.log('nejmenší vzdálenost zápěstí dvojic (px):', best);
    expect(Object.keys(best).length).toBeGreaterThanOrEqual(2);
    for (const d of Object.values(best)) expect(d).toBeLessThan(14);
  }, 120000);
});
