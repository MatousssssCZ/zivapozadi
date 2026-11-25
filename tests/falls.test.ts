import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';
import { runFallCheck } from '../src/core/sim/fallCheck';
import { FALL_KEYS, type FallVariant } from '../src/core/anim/fallPoses';
import { canonicalJson } from '../src/core/model/hash';

/** Pády: tři varianty a zachycené uklouznutí – fáze, kontakty, otisky, pomocník, pravidla, nezávislost na FPS. */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'fall.zscena');
  await generateLiberec(dir);
  lp = await loadProject(dir);
  lp.project.scene.snowfall.enabled = false;
}, 60000);

const ORDER = ['loss', 'recover', 'fall', 'impact', 'pause', 'getup', 'brush', 'done'];

describe('pády', () => {
  for (const v of ['back', 'forward', 'side', 'saved'] as FallVariant[]) for (const s of [1, -1] as const) it(`${v} ${s > 0 ? 'P' : 'L'}: fáze v pořadí, otisk jednou, bez skoku, pomocník, pak chůze`, () => {
    const r = runFallCheck(Simulation.create(lp.project, lp.manifests), v, s, 40, true);
    const want = ORDER.filter((p) => FALL_KEYS[v].some((k) => k.ph === p));
    expect(r.phases).toEqual(want);
    if (v === 'saved') { expect(r.marks).toBe(0); expect(r.helper).toBeNull(); }
    else { expect(r.marks).toBeGreaterThan(0); expect(r.marks).toBeLessThanOrEqual(4); expect(r.helper).not.toBeNull(); expect(r.helped).toBe(true); }
    expect(r.maxHipJumpU).toBeLessThan(2.6); // j. postavy za krok (≈ 3,5 cm ≈ 2 m/s): rychlý pád
    expect(r.maxHipJerkU).toBeLessThan(1.1); // žádný skok: rychlost pánve se mezi kroky mění plynule
    expect(r.walksAfter).toBe(true);
  }, 120000);

  it('náhodné pády: vzácné, nejvýš jeden najednou, rozestup, cooldown postavy, jen sólo chodci bez věcí', () => {
    const p = structuredClone(lp.project); p.falls = { enabled: true, meanIntervalSec: 40, minGapSec: 30, agentCooldownSec: 900 };
    const sim = Simulation.create(p, lp.manifests);
    const starts: { t: number; id: string }[] = []; let maxActive = 0, bad = 0;
    for (let i = 0; i < 60 * 600; i++) {
      const before = sim.state.falls?.active.map((e) => e.id) ?? [];
      sim.step();
      const st = sim.state.falls; if (!st) continue;
      maxActive = Math.max(maxActive, st.active.length);
      for (const e of st.active) if (!before.includes(e.id)) {
        starts.push({ t: sim.time(), id: e.agentId });
        const a = sim.state.agents.find((x) => x.id === e.agentId)!;
        if (a.holding || a.follow || sim.state.agents.some((x) => x.follow?.leaderId === a.id) || a.activity || a.anim.elder) bad++;
      }
    }
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(maxActive).toBe(1);
    expect(bad).toBe(0);
    for (let i = 1; i < starts.length; i++) expect(starts[i].t - starts[i - 1].t).toBeGreaterThanOrEqual(30);
    const ids = starts.map((x) => x.id); expect(new Set(ids).size).toBe(ids.length); // cooldown 15 min
  }, 300000);

  it('nezávislost na snímkové frekvenci (pád uprostřed, 30 FPS s výpadky = 60 FPS)', () => {
    const p = structuredClone(lp.project); p.falls = { enabled: true, meanIntervalSec: 20, minGapSec: 10 };
    const a = Simulation.create(p, lp.manifests), b = Simulation.create(p, lp.manifests);
    // pád uprostřed: spustit v obou ve stejném okamžiku (náhodné pády běží také)
    a.advanceTo(40); a.triggerFall('back', 1, { helper: true });
    for (let t = 0; t < 40; t += 1 / 30 + (Math.floor(t) % 9 === 0 ? 0.2 : 0)) b.advanceTo(t);
    b.advanceTo(40); b.triggerFall('back', 1, { helper: true });
    a.advanceTo(150);
    for (let t = 40; t < 150; t += 1 / 30 + (Math.floor(t) % 9 === 0 ? 0.2 : 0)) b.advanceTo(t);
    b.advanceTo(150);
    expect(a.state.falls?.n ?? 0).toBeGreaterThan(0);
    expect(canonicalJson(b.state.falls)).toBe(canonicalJson(a.state.falls));
    expect(canonicalJson(b.state.agents)).toBe(canonicalJson(a.state.agents));
  }, 200000);
});
