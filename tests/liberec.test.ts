import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';
import { R_BODY } from '../src/core/sim/crowd';
import { cameraFor, toWorld } from '../src/core/scene/camera';
import { LEASH } from '../src/core/sim/animals';
import { SLED } from '../src/core/sim/sled';

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
    expect(sim.diagnostics).toEqual([]);
    // perspektiva konceptu: dospělý u y 0,90 má 0,23 výšky obrazu
    const d = p.scene.depth, s = d.scaleFar + ((972 - d.yFar) * (d.scaleNear - d.scaleFar)) / (d.yNear - d.yFar);
    expect(Math.abs((s * 130) / 1080 - 0.23)).toBeLessThan(0.005);
  });

  it('5 minut: nákupy, nikdo neuvízne, těla se neprotnou', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    const cam = cameraFor(lp.project.scene);
    let minD = Infinity, maxLeash = 0, catSat = false, dogsSeen = 0, photoPhone = 0, photoNoPhone = 0, sledFrames = 0, maxRope = 0, sledOffSnow = 0, sledHit = 1e9;
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 300; i++) {
      sim.step();
      for (const an of sim.state.animals ?? []) {
        if (an.hidden) continue;
        if (an.species === 'cat' && an.sit > 0.9) catSat = true;
        modes.add(`${an.species}:${an.mode}`);
        const o = an.ownerId ? sim.state.agents.find((x) => x.id === an.ownerId) : undefined;
        if (o && !o.hidden) { dogsSeen++; const A = toWorld(cam, an.pos), B = toWorld(cam, o.pos); maxLeash = Math.max(maxLeash, Math.hypot(A.X - B.X, A.Z - B.Z)); }
      }
      for (const a of sim.state.agents) if ((a.anim.gestures ?? []).some((g) => g.fam === 'photo')) { if (sim.state.props.find((p) => p.id === a.holding)?.kind === 'phone') photoPhone++; else photoNoPhone++; }
      const sl = sim.state.sled;
      if (sl?.phase === 'run' && sl.center && sl.ring) {
        sledFrames++;
        const par = sim.state.agents.find((x) => x.id === 'ch_sane')!, A = toWorld(cam, par.pos), R = toWorld(cam, sl.ring), C = toWorld(cam, sl.center);
        maxRope = Math.max(maxRope, Math.hypot(A.X - R.X, A.Z - R.Z));
        if (sl.center.x > 0 && sl.center.x < 1920 && !sim.sessionHost().isSnow(sl.center)) sledOffSnow++;
        for (const x of sim.state.agents) if (!x.hidden && x.id !== par.id) { const P = toWorld(cam, x.pos); sledHit = Math.min(sledHit, Math.hypot(P.X - C.X, P.Z - C.Z)); }
      }
      if (i % 10) continue;
      const vis = sim.state.agents.filter((a) => !a.hidden).map((a) => toWorld(cam, a.pos));
      for (let x = 0; x < vis.length; x++) for (let y = x + 1; y < vis.length; y++) minD = Math.min(minD, Math.hypot(vis[x].X - vis[y].X, vis[x].Z - vis[y].Z));
    }
    const msgs = sim.state.log.map((l) => l.msg);
    expect(msgs.filter((m) => m.includes('nakoupil')).length).toBeGreaterThanOrEqual(5); // (hluboká scéna: cesta k pultu trvá desítky s)
    // rodiny: dítě (dětská šablona, ~70 % výšky) chodí s rodičem a občas si jdou hrát na sníh
    const kids = sim.state.agents.filter((a) => sim.isChild(a));
    expect(kids.length).toBe(5);
    expect(msgs.some((m) => m.includes('jde s dítětem'))).toBe(true);
    expect(sim.state.agents.filter((a) => (a.stuckT ?? 0) > 20).map((a) => a.name)).toEqual([]);
    expect(minD).toBeGreaterThan(2 * R_BODY - 0.02);
    // psi na vodítku (Z01): nikdy dál než délka vodítka; kočka si přišla sednout (Z06/Z07)
    expect(dogsSeen).toBeGreaterThan(100);
    expect(maxLeash).toBeLessThanOrEqual(LEASH.max + 0.01);
    expect(catSat).toBe(true);
    // focení u stromu (A06): telefon je skutečná rekvizita v ruce po celou dobu klipu, pak zmizí
    expect(photoPhone).toBeGreaterThan(300);
    expect(photoNoPhone).toBe(0);
    // Z02 pes si sedne u stojícího majitele, Z05 setřese sníh, Z08 kočka se očistí / protáhne
    expect(modes.has('dog:sit')).toBe(true);
    expect(modes.has('dog:shake')).toBe(true);
    expect(modes.has('cat:groom') || modes.has('cat:stretch')).toBe(true);
    // Z03 pohlazení: pes přijde k hladícímu a ten se k němu skloní
    expect(modes.has('dog:pet') && msgs.some((m) => m.includes('hladí psa'))).toBe(true);
    // sáňky (B02): průchod proběhl, provázek nikdy delší než jeho délka, sáně jen na sněhu, nikdo jimi neprošel
    expect(sledFrames).toBeGreaterThan(600);
    expect(maxRope).toBeLessThanOrEqual(SLED.rope + 0.01);
    expect(sledOffSnow).toBe(0);
    expect(sledHit).toBeGreaterThan(0.45);
    // odklízení sněhu (A11): pruh odkrytý celý, hromada narostla, pracovník odešel i s lopatou
    expect(msgs.some((m) => m.includes('odklidil(a) sníh'))).toBe(true);
    expect(sim.state.clearing?.progress).toBe(1);
    expect(sim.state.clearing?.pile).toBeGreaterThan(0.9);
    expect(sim.state.props.some((p) => p.kind === 'shovel')).toBe(sim.state.clearing?.phase !== 'offstage');
    // upadlá rukavice (B03): upadne, majitel se pro ni vrátí a zvedne ji (dřep)
    expect(msgs.filter((m) => m.includes('ztratil(a) rukavici')).length).toBeGreaterThanOrEqual(1);
    expect(msgs.filter((m) => m.includes('zvedl(a) rukavici')).length).toBe(msgs.filter((m) => m.includes('ztratil(a) rukavici')).length);
    expect(sim.state.props.filter((p) => p.kind === 'phone' && !sim.state.agents.some((a) => a.holding === p.id))).toEqual([]);
  }, 180000);
});
