import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';
import { R_BODY } from '../src/core/sim/crowd';
import { cameraFor, toWorld } from '../src/core/scene/camera';

/** Nové náměstí z balíku grafiky „Živá pozadí – Liberec“ (AKCEPTACE.md body 1–4, 10). */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'liberec.zscena');
  await generateLiberec(dir);
  lp = await loadProject(dir);
}, 60000);

describe('Liberec – živý trh', () => {
  it('scéna: šest stánků s prodavači, strom, 4 lampy; žádná varování diagnostiky', () => {
    const p = lp.project;
    expect(p.objects.filter((o) => o.seller).length).toBe(6);
    expect(p.objects.filter((o) => o.name === 'Lampa').length).toBe(4);
    const sim = Simulation.create(p, lp.manifests);
    expect(sim.diagnostics.filter((d) => d.level !== 'info')).toEqual([]);
    // perspektiva konceptu: dospělý u y 0,90 má 0,23 výšky obrazu
    const d = p.scene.depth, s = d.scaleFar + ((972 - d.yFar) * (d.scaleNear - d.scaleFar)) / (d.yNear - d.yFar);
    expect(Math.abs((s * 130) / 1080 - 0.23)).toBeLessThan(0.005);
  });

  it('5 minut: nákupy, nikdo neuvízne, těla se neprotnou', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    const cam = cameraFor(lp.project.scene);
    let minD = Infinity;
    for (let i = 0; i < 60 * 300; i++) {
      sim.step();
      if (i % 10) continue;
      const vis = sim.state.agents.filter((a) => !a.hidden).map((a) => toWorld(cam, a.pos));
      for (let x = 0; x < vis.length; x++) for (let y = x + 1; y < vis.length; y++) minD = Math.min(minD, Math.hypot(vis[x].X - vis[y].X, vis[x].Z - vis[y].Z));
    }
    const msgs = sim.state.log.map((l) => l.msg);
    expect(msgs.filter((m) => m.includes('nakoupil')).length).toBeGreaterThan(5);
    expect(sim.state.agents.filter((a) => (a.stuckT ?? 0) > 20).map((a) => a.name)).toEqual([]);
    expect(minD).toBeGreaterThan(2 * R_BODY - 0.02);
  }, 180000);
});
