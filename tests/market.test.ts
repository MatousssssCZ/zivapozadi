import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateRadnice } from '../scripts/generate-radnice-demo';
import { Simulation } from '../src/core/sim/simulation';
import { canonicalJson } from '../src/core/model/hash';

/** Balíček „živá pozadí“ – A01 nákup s taškou, A10 prodavač, A12 odchod s nákupem (T05, T19, T20). */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'market.zscena');
  await generateRadnice(dir);
  lp = await loadProject(dir);
}, 60000);

describe('trh: nákup s taškou a prodavač', () => {
  it('jeden nákup = jedno předání, taška odchází s majitelem, prodavač obsluhuje a uklízí', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    const transfers = new Map<string, number>(); // bag → počet přechodů do ruky
    const lastPlace = new Map<string, string>();
    let leftWith = 0, browseOnly = 0, maxCounterAge = 0;
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 300; i++) {
      const hiddenBefore = new Map(sim.state.agents.map((a) => [a.id, a.holdingKind === 'bag' && !a.hidden]));
      sim.step();
      const t = sim.time();
      for (const p of sim.state.props) {
        if (p.kind !== 'bag') continue;
        const pl = p.place.kind;
        if (pl === 'held' && lastPlace.get(p.id) !== 'held') transfers.set(p.id, (transfers.get(p.id) ?? 0) + 1);
        if (pl === 'counter') maxCounterAge = Math.max(maxCounterAge, t - p.appearedAt);
        lastPlace.set(p.id, pl);
        if (pl === 'held') { const a = sim.state.agents.find((x) => x.id === (p.place as { agentId: string }).agentId)!; expect(a.holding).toBe(p.id); expect(a.hidden).toBeFalsy(); }
      }
      for (const a of sim.state.agents) if (hiddenBefore.get(a.id) && a.hidden) { leftWith++; expect(a.holding).toBeNull(); }
      for (const v of Object.values(sim.state.vendors ?? {})) modes.add(v.mode);
    }
    browseOnly = sim.state.log.filter((l) => l.msg.includes('bez nákupu')).length;
    const bought = sim.state.log.filter((l) => l.msg.includes('nakoupil')).length;
    console.log(`nákupy: ${bought}, jen prohlédli ${browseOnly}, odešli s taškou ${leftWith}, režimy prodavačů ${[...modes].join(',')}`);
    expect(bought).toBeGreaterThan(3);
    expect(browseOnly).toBeGreaterThan(0);
    for (const n of transfers.values()) expect(n).toBe(1);
    expect(maxCounterAge).toBeLessThan(5);
    for (const m of ['idle', 'attend', 'retrieve', 'handover', 'tidy']) expect(modes.has(m)).toBe(true);
    // checkpoint: JSON roundtrip a pokračování beze změny
    const snap = JSON.parse(JSON.stringify(sim.state));
    const b = Simulation.restore(lp.project, lp.manifests, snap);
    for (let i = 0; i < 300; i++) { sim.step(); b.step(); }
    expect(canonicalJson(b.state)).toBe(canonicalJson(sim.state));
  }, 120000);
});
