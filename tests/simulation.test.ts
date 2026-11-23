import { describe, it, expect } from 'vitest';
import { demoProject } from './helpers';
import { Simulation } from '../src/core/sim/simulation';
import { PreviewClock } from '../src/core/sim/previewClock';
import { SIM_DT } from '../src/core/sim/types';
import { buildNavGraph, findPath } from '../src/core/nav/navGraph';

describe('determinismus a čas', () => {
  it('stejný stav ve stejném čase při různých rychlostech náhledu', async () => {
    const lp = await demoProject();
    const target = Math.round(90 / SIM_DT);
    const hashes: string[] = [];
    for (const speed of [0.5, 1, 2, 4, 8]) {
      const sim = Simulation.create(lp.project, lp.manifests);
      const clock = new PreviewClock(); clock.playing = true; clock.speed = speed;
      let frame = 0;
      while (sim.state.step < target) {
        // proměnlivá délka snímku (jitter) jako v reálném okně
        const dt = (1 / 60) * (1 + 0.3 * Math.sin(frame++ * 1.7));
        const n = Math.min(clock.tick(dt), target - sim.state.step);
        sim.runSteps(n);
      }
      hashes.push(sim.stateHash());
    }
    expect(new Set(hashes).size).toBe(1);
  });

  it('opakovatelný průběh při stejném seedu, jiný při jiném seedu', async () => {
    const lp = await demoProject();
    const a = Simulation.create(lp.project, lp.manifests); a.advanceTo(60);
    const b = Simulation.create(lp.project, lp.manifests); b.advanceTo(60);
    expect(a.stateHash()).toBe(b.stateHash());
    const p2 = structuredClone(lp.project); p2.seed = 999;
    const c = Simulation.create(p2, lp.manifests); c.advanceTo(60);
    expect(c.stateHash()).not.toBe(a.stateHash());
  });

  it('checkpoint (serializovaný stav vč. RNG) pokračuje identicky', async () => {
    const lp = await demoProject();
    const ref = Simulation.create(lp.project, lp.manifests); ref.advanceTo(120);
    const s = Simulation.create(lp.project, lp.manifests); s.advanceTo(47.3);
    const json = JSON.stringify(s.snapshot());
    const restored = Simulation.restore(lp.project, lp.manifests, JSON.parse(json));
    restored.advanceTo(120);
    expect(restored.stateHash()).toBe(ref.stateHash());
  });

  it('pauza zastaví čas, restart vrátí počáteční stav', async () => {
    const lp = await demoProject();
    const clock = new PreviewClock();
    expect(clock.tick(1)).toBe(0);
    const s0 = Simulation.create(lp.project, lp.manifests).stateHash();
    const s = Simulation.create(lp.project, lp.manifests); s.advanceTo(10);
    expect(Simulation.create(lp.project, lp.manifests).stateHash()).toBe(s0);
    expect(s.stateHash()).not.toBe(s0);
  });
});

describe('scénář kávy, rezervace a rekvizity', () => {
  it('kelímek: pult → ruka → koš, nikdy nezmizí bez vysvětlení', async () => {
    const lp = await demoProject();
    const sim = Simulation.create(lp.project, lp.manifests);
    const seen = new Map<string, string[]>();
    for (let i = 0; i < Math.round(400 / SIM_DT); i++) {
      sim.step();
      const ids = new Set(sim.state.props.map((p) => p.id));
      for (const p of sim.state.props) {
        const hist = seen.get(p.id) ?? []; const k = p.place.kind;
        if (hist[hist.length - 1] !== k) hist.push(k);
        seen.set(p.id, hist);
        if (k === 'held') {
          const a = sim.state.agents.find((x) => x.id === (p.place as { agentId: string }).agentId)!;
          expect(a.holding).toBe(p.id);
        }
      }
      // Zmizelý kelímek musel skončit v koši (falling → inBin), jinak chyba.
      for (const [id, hist] of seen) if (!ids.has(id) && !hist.includes('gone')) {
        expect(hist[hist.length - 1]).toBe('falling');
        hist.push('gone');
      }
      for (const a of sim.state.agents) if (a.holding) expect(sim.state.props.some((p) => p.id === a.holding && p.place.kind === 'held')).toBe(true);
    }
    expect(sim.state.stats.cupsServed).toBeGreaterThanOrEqual(3);
    expect(sim.state.stats.cupsDisposed).toBeGreaterThanOrEqual(2);
    expect(sim.state.stats.sips).toBeGreaterThanOrEqual(4);
    const full = [...seen.values()].filter((h) => h.includes('gone'));
    for (const h of full) expect(h.slice(0, 4)).toEqual(['counter', 'held', 'falling', 'gone']);
  });

  it('rezervace: kapacita 1, fronta, uvolnění po dokončení', async () => {
    const lp = await demoProject();
    const sim = Simulation.create(lp.project, lp.manifests);
    let sawQueue = false;
    for (let i = 0; i < Math.round(300 / SIM_DT); i++) {
      sim.step();
      const owners = Object.entries(sim.state.reservations);
      // žádný zdroj nemá dva vlastníky (z definice mapy) a každý vlastník je existující postava v činnosti nebo na úzkém průchodu
      for (const [key, owner] of owners) {
        const a = sim.state.agents.find((x) => x.id === owner)!;
        expect(a).toBeTruthy();
        if (!key.startsWith('edge:')) expect(a.activity).not.toBeNull();
        else expect(a.route?.heldEdges.includes(key.slice(5))).toBe(true);
      }
      // postava bez činnosti nesmí držet rezervace bodů
      for (const a of sim.state.agents) if (!a.activity) expect(sim.res.heldBy(a.id).filter((k) => !k.startsWith('edge:'))).toEqual([]);
      if (Object.values(sim.state.queues).some((q) => q.length > 0)) sawQueue = true;
    }
    expect(sawQueue).toBe(true);
  });

  it('odebraný objekt za běhu: činnost přerušena, rezervace uvolněny, kelímek viditelně odložen', async () => {
    const lp = await demoProject();
    const sim = Simulation.create(lp.project, lp.manifests);
    // počkej, až někdo nese kelímek
    let guard = 0;
    while (!sim.state.agents.some((a) => a.holding) && guard++ < 60 * 300) sim.step();
    const holder = sim.state.agents.find((a) => a.holding)!;
    expect(holder).toBeTruthy();
    const cupId = holder.holding!;
    sim.removeObject('obj_kos');
    sim.removeObject('obj_stolecek');
    sim.removeObject('obj_strom');
    sim.runSteps(60 * 30);
    const cup = sim.state.props.find((p) => p.id === cupId);
    expect(cup).toBeTruthy();
    expect(cup!.place.kind).toBe('ground');
    expect(holder.holding).toBeNull();
    for (const k of Object.keys(sim.state.reservations)) expect(k.startsWith('obj_kos') || k.startsWith('obj_stolecek') || k.startsWith('obj_strom')).toBe(false);
    expect(sim.state.log.some((l) => l.msg.includes('odložil(a) kelímek na zem'))).toBe(true);
  });

  it('nedosažitelný cíl je nahlášen, postava neprojde překážkou', async () => {
    const lp = await demoProject();
    const p = structuredClone(lp.project);
    // Odpoj stánek: odstraň všechna spojení do uzlu před stánkem.
    p.nav.edges = p.nav.edges.filter((e) => e.a !== 'n_stanek' && e.b !== 'n_stanek');
    const st = p.objects.find((o) => o.id === 'obj_stanek')!;
    for (const pt of st.interaction!.points) pt.navNodeId = 'n_stanek';
    const sim = Simulation.create(p, lp.manifests);
    sim.advanceTo(120);
    expect(sim.state.stats.cupsServed).toBe(0);
    expect(sim.diagnostics.some((d) => d.message.includes('není z místa postavy dosažitelný'))).toBe(true);
    // Postavy stojí jen na úsečkách sítě – nikdy uvnitř překážek
    const g = buildNavGraph(p);
    expect(findPath(g, 'n_zapad', 'n_stanek')).toBeNull();
  });

  it('spojení přes překážku je zablokováno a hlášeno', async () => {
    const lp = await demoProject();
    const p = structuredClone(lp.project);
    p.nav.edges.push({ id: 'e_bad', a: 'n_strom_l', b: 'n_strom_p', oneWay: false, narrow: false });
    p.areas.push({ id: 'blk', name: 'Zeď', kind: 'obstacle', polygon: [{ x: 1290, y: 800 }, { x: 1300, y: 800 }, { x: 1300, y: 860 }, { x: 1290, y: 860 }] });
    const sim = Simulation.create(p, lp.manifests);
    expect(sim.graph.blocked.map((b) => b.edgeId)).toContain('e_bad');
    expect(sim.diagnostics.some((d) => d.message.includes('překážkou „Zeď“'))).toBe(true);
  });

  it('jednosměrné spojení je respektováno', async () => {
    const lp = await demoProject();
    const g = buildNavGraph(lp.project);
    const fwd = findPath(g, 'n_vychod', 'n_dole')!;
    expect(fwd.edges).toEqual(['e8']);
    const back = findPath(g, 'n_dole', 'n_vychod')!;
    expect(back.edges).not.toContain('e8');
  });

  it('plánovaná událost: čekání s limitem, přeskočení, konflikt', async () => {
    const lp = await demoProject();
    for (const policy of ['wait', 'skip', 'report'] as const) {
      const p = structuredClone(lp.project);
      // Událost pro neexistující zónu ⇒ nedostupné místo.
      p.schedule = [{ id: 'ev', name: 'Test', time: 5, activityType: 'coffee', characterId: 'ch_cyril', zoneId: 'neexistuje', onUnavailable: policy, waitLimit: 10 }];
      const sim = Simulation.create(p, lp.manifests);
      sim.advanceTo(8);
      const st = sim.state.schedule['ev'].status;
      if (policy === 'wait') { expect(st).toBe('waiting'); sim.advanceTo(16); expect(sim.state.schedule['ev'].status).toBe('conflict'); }
      if (policy === 'skip') expect(st).toBe('skipped');
      if (policy === 'report') { expect(st).toBe('conflict'); expect(sim.state.log.some((l) => l.msg.startsWith('KONFLIKT'))).toBe(true); }
    }
    const ok = Simulation.create(lp.project, lp.manifests); ok.advanceTo(21);
    expect(ok.state.schedule['ev_cyril_kava'].status).toBe('started');
  });

  it('úzký průchod: nejvýše jedna postava současně', async () => {
    const lp = await demoProject();
    const sim = Simulation.create(lp.project, lp.manifests);
    for (let i = 0; i < 60 * 300; i++) {
      sim.step();
      const onEdge = sim.state.agents.filter((a) => a.route && a.route.heldEdges.includes('e5'));
      expect(onEdge.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('manifest postavy – náhrady', () => {
  it('chybějící klip a směr ⇒ upozornění a virtuální klip; kelímek se přesto převezme', async () => {
    const lp = await demoProject();
    const m = structuredClone(lp.manifests['builtin_postava']);
    delete m.clips.receive; delete m.clips.drink;
    m.directionFallbacks = {};
    const sim = Simulation.create(lp.project, { builtin_postava: m });
    expect(sim.diagnostics.some((d) => d.message.includes('nemá klip „receive“'))).toBe(true);
    expect(sim.diagnostics.some((d) => d.message.includes('nemá směr W'))).toBe(true);
    sim.advanceTo(200);
    expect(sim.state.stats.cupsServed).toBeGreaterThan(0);
    expect(sim.state.stats.sips).toBeGreaterThan(0);
  });
});
