import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateRadnice } from '../scripts/generate-radnice-demo';
import { Simulation, lidOpenness } from '../src/core/sim/simulation';
import { characterVisual, localToScene } from '../src/core/render/characterPose';
import { gaitEvents } from '../src/core/anim/gaitProfile';
import { cameraFor, toWorld, toScreen } from '../src/core/scene/camera';
import { pointInPolygon } from '../src/core/math/geom';
import { R_BODY } from '../src/core/sim/crowd';
import { directionFromAngle } from '../src/core/sim/movement';

let lp: LoadedProject;
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'Radnice.zscena');
  await generateRadnice(dir);
  lp = await loadProject(dir);
}, 60_000);

describe('chůze ve scéně (náměstí, 12 postav, 2 dvojice)', () => {
  it('opřená bota se ve scéně neposouvá (pata během celé podrážky)', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    sim.advanceTo(2);
    let worst = 0, moved = 0, total = 0;
    const prev = new Map<string, { x: number; y: number } | null>();
    for (let i = 0; i < 60 * 40; i++) {
      sim.step();
      for (const a of sim.state.agents) {
        const c = sim.characterOf(a.id)!;
        const cv = characterVisual(a, sim.manifests[c.assetId], c, lp.project.scene.depth);
        const ev = gaitEvents(a.anim.gaitW ?? 0);
        for (const k of [0, 1]) {
          const q = (a.anim.walkPhase + k * 0.5) % 1;
          const flat = a.anim.walkBlend > 0.001 && !a.anim.settle && q > ev.footFlat + 0.02 && q < ev.heelRise - 0.02;
          const hp = cv.pose.heelPts?.[k];
          if (!hp) continue;
          const p = localToScene(cv, hp), key = a.id + k, pp = prev.get(key);
          if (flat && pp) { const d = Math.hypot(p.x - pp.x, p.y - pp.y); worst = Math.max(worst, d); total++; if (d > 0.05) moved++; }
          prev.set(key, flat ? p : null);
        }
      }
    }
    console.log(`opora ve scéně: max ${worst.toFixed(3)} px/snímek, posun > 0,05 px v ${moved} z ${total} snímků`);
    // výjimky jen při převrácení pohledu za chůze (2D zrcadlení prohodí blízkou a vzdálenou nohu)
    expect(moved / total).toBeLessThan(0.005);
    expect(worst).toBeLessThan(2);
  });

  it('těla se nikdy neprotnou (ani pár, ani stojící); dvojice jdou spolu', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    const cam = cameraFor(lp.project.scene);
    const pairs = lp.project.characters.filter((c) => c.companionId).map((c) => [c.id, c.companionId!] as const);
    expect(pairs.length).toBe(2);
    let far = 0, n = 0, pairActivities = 0, minD = Infinity;
    for (let i = 0; i < 60 * 90; i++) {
      sim.step();
      const ags = sim.state.agents.filter((a) => !a.hidden);
      const W = ags.map((a) => toWorld(cam, a.pos));
      for (const [f, l] of pairs) {
        const A = ags.find((x) => x.id === f), B = ags.find((x) => x.id === l);
        if (!A || !B || !A.follow) continue; // u kávy má každý své místo ve frontě / u stolku
        const pa = W[ags.indexOf(A)], pb = W[ags.indexOf(B)];
        n++; if (Math.hypot(pa.X - pb.X, pa.Z - pb.Z) > 1.6) far++;
        if (A.activity) pairActivities++; // když jde s vůdcem, nemá vlastní činnost
      }
      // fyzická těla (disky 0,23 m) – všechny páry včetně dvojic a stojících
      for (let x = 0; x < ags.length; x++) for (let y = x + 1; y < ags.length; y++) minD = Math.min(minD, Math.hypot(W[x].X - W[y].X, W[x].Z - W[y].Z));
    }
    console.log(`dvojice dál než 1,6 m: ${(100 * far / n).toFixed(1)} % času; nejmenší vzdálenost středů ${minD.toFixed(3)} m`);
    expect(minD).toBeGreaterThanOrEqual(2 * R_BODY - 1e-6); // G1: nikdy průnik těl
    expect(far / n).toBeLessThan(0.05);
    expect(pairActivities).toBe(0);
  });

  it('při chůzi se nepoužívá čistě čelní ani zadní pohled', () => {
    for (let k = 0; k < 360; k++) {
      const ang = (k / 180) * Math.PI;
      for (const cur of [null, 'SE', 'SW', 'NE', 'NW', 'E', 'W'] as const) {
        const d = directionFromAngle(ang, cur);
        expect(d === 'S' || d === 'N').toBe(false);
      }
    }
    const sim = Simulation.create(lp.project, lp.manifests);
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 60; i++) { sim.step(); for (const a of sim.state.agents) seen.add(a.anim.dir); }
    expect(seen.has('S') || seen.has('N')).toBe(false);
  });

  it('postavy nechodí strměji než 45° (čistě dopředu/dozadu jen v krátkých obratech)', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    const prev = new Map<string, { x: number; y: number }>(); const run = new Map<string, number>();
    let steep = 0, total = 0, longest = 0;
    for (let i = 0; i < 60 * 90; i++) {
      sim.step();
      for (const a of sim.state.agents) {
        const p = prev.get(a.id); prev.set(a.id, { ...a.pos });
        if (!p) continue;
        const dx = a.pos.x - p.x, dy = a.pos.y - p.y, d = Math.hypot(dx, dy);
        if (d < 0.05) { run.set(a.id, 0); continue; }
        total += d;
        if (Math.abs(dy) > Math.abs(dx) * Math.tan((47 * Math.PI) / 180)) { steep += d; const r = (run.get(a.id) ?? 0) + d; run.set(a.id, r); longest = Math.max(longest, r); }
        else run.set(a.id, 0);
      }
    }
    console.log(`strmě (> 45°): ${(100 * steep / total).toFixed(1)} % dráhy, nejdelší strmý úsek ${longest.toFixed(0)} px`);
    expect(steep / total).toBeLessThan(0.03);
    expect(longest).toBeLessThan(40); // jen obrat mezi dvěma šikmými úseky (zaoblení ~20–35 px)
  });

  it('návštěvníci: průchod scénou, setkání přátel, společná káva u stolku, odchod; kelímky nemizí', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    let exits = 0, entries = 0, greets = 0, together = 0, atTable = 0;
    const wasHidden = new Map(sim.state.agents.map((a) => [a.id, !!a.hidden]));
    const tableTalk = new Set<string>();
    for (let i = 0; i < 60 * 300; i++) {
      sim.step();
      for (const a of sim.state.agents) {
        const h = !!a.hidden;
        if (h && !wasHidden.get(a.id)) exits++;
        if (!h && wasHidden.get(a.id)) entries++;
        wasHidden.set(a.id, h);
        if (a.status.startsWith('Povídá si s')) tableTalk.add(a.id);
      }
    }
    const log = sim.state.log.map((l) => l.msg);
    greets = log.filter((m) => m.includes('se zdraví')).length;
    together = log.filter((m) => m.includes('jdou spolu na kávu')).length;
    atTable = log.filter((m) => m.includes('si jdou sednout ke stolku')).length;
    console.log(`návštěvníci za 300 s: ${entries} příchodů, ${exits} odchodů, ${greets} pozdravů, ${together}× káva ve dvou, ${atTable}× ke stolku, povídalo si ${tableTalk.size} postav`);
    expect(exits).toBeGreaterThanOrEqual(6);
    expect(entries).toBeGreaterThanOrEqual(6);
    expect(greets).toBeGreaterThanOrEqual(2);
    expect(together).toBeGreaterThanOrEqual(3);
    expect(atTable).toBeGreaterThanOrEqual(2);
    expect(tableTalk.size).toBeGreaterThanOrEqual(4);
    // každý vydaný kelímek je v ruce, padá nebo je v koši (nikdy nezmizí)
    expect(sim.state.stats.cupsServed).toBeGreaterThan(5);
    for (const p of sim.state.props) expect(['held', 'falling', 'inBin', 'counter', 'ground']).toContain(p.place.kind);
    expect(log.filter((m) => m.includes('na zem')).length).toBe(0);
  });

  it('stopy ve sněhu: jen ve sněhu, jedna na došlap, zmizí po životnosti, deterministické (G14/G15)', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    const cam = cameraFor(lp.project.scene);
    const snow = lp.project.areas.filter((a) => a.kind === 'snow');
    sim.advanceTo(60);
    const fps = sim.state.footprints ?? [];
    expect(fps.length).toBeGreaterThan(200);
    for (const f of fps) {
      const p = toScreen(cam, { X: f.X, Z: f.Z });
      expect(snow.some((a) => pointInPolygon(p, a.polygon) || p.y > Math.min(...a.polygon.map((q) => q.y)) - 3)).toBe(true);
    }
    // nejvýš jedna stopa na došlap: žádné dvě stopy téže postavy ve stejném místě a čase
    const keys = new Set(fps.map((f) => `${f.seed}|${f.X.toFixed(3)}|${f.Z.toFixed(3)}`));
    expect(keys.size).toBe(fps.length);
    // životnost: po 180 s nejstarší zmizí, zásobník je omezený
    sim.advanceTo(250);
    const t = sim.time();
    expect(Math.min(...(sim.state.footprints ?? []).map((f) => t - f.t0))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...(sim.state.footprints ?? []).map((f) => t - f.t0))).toBeLessThanOrEqual(180 + 1e-9);
    expect((sim.state.footprints ?? []).length).toBeLessThanOrEqual(16384);
    // deterministické (stejný průběh → stejné stopy)
    const sim2 = Simulation.create(lp.project, lp.manifests); sim2.advanceTo(250);
    expect(JSON.stringify(sim2.state.footprints)).toBe(JSON.stringify(sim.state.footprints));
  });

  it('koše: s víkem jen ze strany otvírání (víko se otevře a zavře), otevřený z obou stran', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    const lidBin = lp.project.objects.find((o) => o.id === 'obj_kos')!, openBin = lp.project.objects.find((o) => o.id === 'obj_kos2')!;
    let lidUses = 0, wrongSide = 0, maxOpen = 0; const openSides = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 300; i++) {
      sim.step();
      maxOpen = Math.max(maxOpen, lidOpenness(sim.state, 'obj_kos', sim.time()));
      for (const a of sim.state.agents) {
        if (a.activity?.phase !== 'drop') continue;
        const bin = (a.activity.data as { binId?: string }).binId, key = a.id + '@' + a.activity.phaseStart;
        if (seen.has(key)) continue; seen.add(key);
        if (bin === 'obj_kos') { lidUses++; if (a.pos.x < lidBin.x) wrongSide++; expect(a.anim.action?.clip).toBe('lidDrop'); }
        if (bin === 'obj_kos2') { openSides.add(a.pos.x < openBin.x ? 'L' : 'P'); expect(a.anim.action?.clip).toBe('drop'); }
      }
    }
    console.log(`koš s víkem: ${lidUses}× (špatná strana ${wrongSide}), max. otevření ${maxOpen.toFixed(2)}; otevřený koš ze stran: ${[...openSides].join(', ')}`);
    expect(lidUses).toBeGreaterThan(0);
    expect(wrongSide).toBe(0);
    expect(maxOpen).toBeGreaterThan(0.99);
    expect(lidOpenness(sim.state, 'obj_kos', sim.time() + 5)).toBe(0);
  });

  it('dvojice se obnoví z checkpointu beze změny průběhu', () => {
    const a = Simulation.create(lp.project, lp.manifests); a.advanceTo(20);
    const b = Simulation.restore(lp.project, lp.manifests, a.snapshot());
    a.advanceTo(35); b.advanceTo(35);
    expect(b.stateHash()).toBe(a.stateHash());
  });
});
