import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateRink } from '../scripts/generate-rink-demo';
import { Simulation } from '../src/core/sim/simulation';
import { SIM_DT } from '../src/core/sim/types';
import { TRAIL_POOL } from '../src/core/sim/rink';
import { canonicalJson } from '../src/core/model/hash';

/** Bruslení na kluzišti (zadání „bruslení na vánočním kluzišti“): pohyb, lokomoce, události, výkon. */
let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'rink.zscena');
  await generateRink(dir);
  lp = await loadProject(dir);
  lp.project.scene.snowfall.enabled = false;
}, 60000);
const sk = (sim: Simulation) => Object.values(sim.state.rink!.sk);

describe('bruslení', () => {
  it('kvóty profilů ve zkušební scéně a bruslaři jsou mimo dav chodců', () => {
    const n: Record<string, number> = {};
    for (const c of lp.project.characters) if (c.skate) n[c.skate] = (n[c.skate] ?? 0) + 1;
    expect(n).toEqual({ rec: 8, good: 2, expert: 2, goodKid: 4 });
    const sim = Simulation.create(lp.project, lp.manifests); sim.advanceTo(1);
    expect(sim.state.agents.filter((a) => a.onIce).length).toBe(16);
  });

  it('rychlost roste jen při zatíženém odrazu, skluz pokračuje bez odrazů, nikdy obě brusle ve vzduchu', () => {
    const sim = Simulation.create(lp.project, lp.manifests); sim.advanceTo(20);
    let grow = 0, growNoPush = 0, glideSteps = 0, glideKeep = 0, airborne = 0;
    for (let k = 0; k < 60 * 60; k++) {
      const before = new Map(sk(sim).map((s) => [s.id, s.v]));
      sim.advanceTo(20 + (k + 1) * SIM_DT);
      for (const s of sk(sim)) {
        const v0 = before.get(s.id)!;
        if (s.feet.every((b) => b.c === 'return')) airborne++;
        if (s.pair && s.prof !== 'beginnerKid') continue; // rodič se drží dítěte
        if (s.v > v0 + 1e-9) { grow++; if (!s.feet.some((b) => b.c === 'push')) growNoPush++; }
        if (!s.push.on && s.st === 'SKATE' && v0 > 0.5) { glideSteps++; if (s.v > v0 * 0.99) glideKeep++; }
      }
    }
    expect(grow).toBeGreaterThan(1000);
    expect(growNoPush).toBe(0);
    expect(airborne).toBe(0);
    expect(glideSteps).toBeGreaterThan(500);
    expect(glideKeep / glideSteps).toBeGreaterThan(0.95); // na ledě skluz brzdí jen pozvolna
  }, 60000);

  it('brzda: konečná dráha, žádné okamžité zastavení', () => {
    const sim = Simulation.create(lp.project, lp.manifests); sim.advanceTo(15);
    const s = sk(sim).find((x) => x.prof === 'rec' && x.st === 'SKATE' && !x.pair && x.v > 0.6)!;
    expect(s).toBeTruthy();
    s.st = 'BRAKE'; s.tSt = 0; const X0 = s.X, Z0 = s.Z, v0 = s.v; let t = 15, firstStep = 0;
    sim.advanceTo(t += SIM_DT); firstStep = v0 - s.v;
    while (s.st === 'BRAKE' && t < 30) sim.advanceTo(t += SIM_DT);
    expect(firstStep).toBeLessThan(0.05);
    expect(s.st).toBe('REST');
    expect(t - 15).toBeLessThan(8);
    expect(Math.hypot(s.X - X0, s.Z - Z0)).toBeGreaterThan(0.1);
  });

  it('pád: zaváhání → pád → vstávání → opatrná jízda; během pádu žádná jiná událost', () => {
    const sim = Simulation.create(lp.project, lp.manifests); sim.advanceTo(30);
    const r = sim.triggerRinkEvent('fall'); expect(r.ok).toBe(true);
    const st = sim.state.rink!, id = st.event!.id, seen: string[] = [];
    for (let t = 30; t < 45; t += 0.1) {
      sim.advanceTo(t); const s = st.sk[id]; if (seen[seen.length - 1] !== s.st) seen.push(s.st);
      expect(Object.values(st.sk).filter((x) => x.st === 'FALL' || x.st.startsWith('TRICK')).length).toBeLessThanOrEqual(1);
      if (st.event) expect(sim.triggerRinkEvent('trick').ok).toBe(false); // pád a prvek nikdy současně
    }
    expect(seen.slice(0, 4)).toEqual(['WOBBLE', 'FALL', 'RECOVER', st.sk[id].prof === 'beginnerKid' ? 'MARCH' : 'SKATE']);
    expect(st.sk[id].cautiousUntil).toBeGreaterThan(st.lastFallEnd + 4.9);
  });

  it('20 minut: prvky zhruba každé 2 min, pády vzácné, bez překryvu událostí, omezené stopy, nikdo trvale nestojí', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    let minD = 9, evStart = 0, evLongest = 0, lastEv = '';
    const still: Record<string, number> = {}; let stuck = 0;
    for (let t = 1; t <= 1200; t += 0.5) {
      sim.advanceTo(t); const st = sim.state.rink!, all = sk(sim);
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i].pair !== all[j].id) minD = Math.min(minD, Math.hypot(all[i].X - all[j].X, all[i].Z - all[j].Z));
      const e = st.event ? st.event.kind + st.event.id : ''; if (e !== lastEv) { evStart = t; lastEv = e; } if (e) evLongest = Math.max(evLongest, t - evStart);
      for (const s of all) { still[s.id] = s.st === 'SKATE' && s.v < 0.05 && !s.pair ? (still[s.id] ?? 0) + 0.5 : 0; if (still[s.id] > 40) stuck++; }
      expect(st.trails.length).toBeLessThanOrEqual(TRAIL_POOL);
    }
    const S = sim.state.rink!.stats;
    expect(S.tricks).toBeGreaterThanOrEqual(6); expect(S.tricks).toBeLessThanOrEqual(13);
    expect(S.falls).toBeGreaterThanOrEqual(1); expect(S.falls).toBeLessThanOrEqual(8);
    expect(S.overlapEvents).toBe(0);
    expect(evLongest).toBeLessThan(15); // událost se vždy uvolní
    expect(minD).toBeGreaterThan(0.4); // žádné prolínání těl
    expect(stuck).toBe(0);
  }, 120000);

  it('víc zdatných bruslařů nezvýší četnost prvků (globální plánovač)', () => {
    const p = JSON.parse(JSON.stringify(lp.project)); for (const c of p.characters) if (c.skate === 'rec') c.skate = 'expert';
    const a = Simulation.create(lp.project, lp.manifests), b = Simulation.create(p, lp.manifests);
    a.advanceTo(600); b.advanceTo(600);
    // strop daný globální prodlevou (≥ 90 s + prvek), nezávisle na počtu způsobilých
    expect(b.state.rink!.stats.tricks).toBeLessThanOrEqual(Math.floor(600 / 95) + 1);
    expect(a.state.rink!.stats.tricks).toBeGreaterThanOrEqual(2);
  }, 60000);

  it('stav nezávisí na FPS (60 vs. 30 s výpadky)', () => {
    const a = Simulation.create(lp.project, lp.manifests), b = Simulation.create(lp.project, lp.manifests);
    for (let t = 0; t < 60; t += 1 / 60) a.advanceTo(t);
    for (let t = 0; t < 60; t += 1 / 30 + (Math.floor(t) % 7 === 0 ? 0.3 : 0)) b.advanceTo(t);
    a.advanceTo(60); b.advanceTo(60);
    expect(canonicalJson(a.state.rink)).toBe(canonicalJson(b.state.rink));
  }, 60000);
});
