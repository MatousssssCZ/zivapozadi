import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateTram } from '../scripts/generate-tram-demo';
import { Simulation } from '../src/core/sim/simulation';
import { canonicalJson } from '../src/core/model/hash';

/** Vánoční tramvajová ulice: průjezdy tramvaje, výměna cestujících jen při otevřených dveřích, pekař, stabilita. */
let lp: LoadedProject;
const log = { phases: [] as string[], boardWhileClosed: 0, alightWhileClosed: 0, maxVisible: 0, bakerRuns: 0, tramRuns: 0, minGap: 1e9, trackOffMax: 0, doorsBakery: 0, nan: 0 };
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'tram.zscena'); await generateTram(dir); lp = await loadProject(dir);
  const sim = Simulation.create(lp.project, lp.manifests);
  let last = '', lastArrive = -1;
  for (let t = 0.5; t <= 900; t += 0.5) {
    sim.advanceTo(t); const st = sim.state.tram!;
    if (st.phase !== last) { if (st.phase === 'in') { if (lastArrive >= 0) log.minGap = Math.min(log.minGap, t - lastArrive); lastArrive = t; } log.phases.push(st.phase); last = st.phase; }
    for (const a of sim.state.agents) {
      if (a.tram?.role === 'board' && a.clip && st.door < 0.99) log.boardWhileClosed++;
      if (a.tram?.role === 'alight' && a.clip && st.door < 0.99) log.alightWhileClosed++;
      if (!Number.isFinite(a.pos.x + a.pos.y)) log.nan++;
    }
    log.maxVisible = Math.max(log.maxVisible, sim.state.agents.filter((a) => !a.hidden).length);
  }
  log.bakerRuns = sim.state.bakery!.runs; log.tramRuns = sim.state.tram!.runs;
}, 600000);

describe('tramvajová ulice', () => {
  it('tramvaj: několik úplných průjezdů v pořadí, interval 100–180 s', () => {
    expect(log.tramRuns).toBeGreaterThanOrEqual(4);
    const seq = log.phases.join(' ');
    expect(seq).toContain('in settle opening alight board check closing depart out wait');
    expect(log.minGap).toBeGreaterThan(100);
  });
  it('cestující jen při úplně otevřených dveřích; počet postav nepřibývá', () => {
    expect(log.boardWhileClosed).toBe(0);
    expect(log.alightWhileClosed).toBe(0);
    expect(log.nan).toBe(0);
    expect(log.maxVisible).toBeLessThanOrEqual(lp.project.characters.length);
  });
  it('pekař: několik celých cyklů (dveře → zametání → zpět)', () => {
    expect(log.bakerRuns).toBeGreaterThanOrEqual(2);
  });
  it('stav nezávisí na FPS', () => {
    const a = Simulation.create(lp.project, lp.manifests), b = Simulation.create(lp.project, lp.manifests);
    for (let t = 0; t < 90; t += 1 / 60) a.advanceTo(t);
    for (let t = 0; t < 90; t += 1 / 30 + (Math.floor(t) % 9 === 0 ? 0.25 : 0)) b.advanceTo(t);
    a.advanceTo(90); b.advanceTo(90);
    expect(canonicalJson(a.state.tram)).toBe(canonicalJson(b.state.tram));
    expect(canonicalJson(a.state.bakery)).toBe(canonicalJson(b.state.bakery));
  }, 120000);
});
