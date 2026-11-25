import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';

/** Lidé se neobjevují ani nemizí uprostřed obrazu: vždy odněkud přijdou (za okrajem nebo dveřmi) a odejdou pryč. */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'off.zscena');
  await generateLiberec(dir);
  lp = await loadProject(dir);
}, 60000);

describe('příchody a odchody', () => {
  it('Liberec 6 min: každé objevení / zmizení postavy i zvířete je mimo obraz nebo ve dveřích budovy', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    const doors = lp.project.nav.nodes.filter((n) => n.door);
    const atDoor = (p: { x: number; y: number }) => doors.some((d) => Math.hypot(d.x - p.x, d.y - p.y) < 60);
    const bs = (id: string) => sim.characterOf(id)?.baseScale ?? 1;
    const was = new Map(sim.state.agents.map((a) => [a.id, { hidden: !!a.hidden, pos: { ...a.pos } }]));
    const bad: string[] = []; let shows = 0, hides = 0;
    for (let i = 0; i < 60 * 360; i++) {
      sim.step();
      for (const a of sim.state.agents) {
        const w = was.get(a.id)!;
        if (w.hidden && !a.hidden) { shows++; if (!sim.isOffscreen(a.pos, bs(a.id)) && !atDoor(a.pos)) bad.push(`${sim.time().toFixed(1)} objevení ${a.name} (${a.pos.x.toFixed(0)}, ${a.pos.y.toFixed(0)}) ${a.status}`); }
        if (!w.hidden && a.hidden) { hides++; if (!sim.isOffscreen(w.pos, bs(a.id)) && !atDoor(w.pos)) bad.push(`${sim.time().toFixed(1)} zmizení ${a.name} (${w.pos.x.toFixed(0)}, ${w.pos.y.toFixed(0)}) ${a.status}`); }
        was.set(a.id, { hidden: !!a.hidden, pos: { ...a.pos } });
      }
      // psi a kočka (menší obrys)
      for (const a of sim.state.animals ?? []) {
        const w = was.get(a.id);
        if (w && w.hidden !== !!a.hidden) { const p = a.hidden ? w.pos : a.pos; if (!sim.isOffscreen(p, 0.5) && !atDoor(p)) bad.push(`${sim.time().toFixed(1)} ${a.id} ${a.hidden ? 'zmizení' : 'objevení'} (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`); }
        was.set(a.id, { hidden: !!a.hidden, pos: { ...a.pos } });
      }
    }
    expect(shows).toBeGreaterThan(10); expect(hides).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  }, 300000);
});
