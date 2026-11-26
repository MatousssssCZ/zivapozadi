import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generateLiberec } from '../scripts/generate-liberec-demo';
import { Simulation } from '../src/core/sim/simulation';
import { R_BODY } from '../src/core/sim/crowd';
import { cameraFor, toWorld } from '../src/core/scene/camera';
import { LEASH, createAnimals, stepAnimals } from '../src/core/sim/animals';
import { SLED } from '../src/core/sim/sled';
import { startFight } from '../src/core/activities/snowballFight';
import { snowmanSpot, freeSnowmanSlot } from '../src/core/activities/snowman';

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
    const modes = new Set<string>(); let maxCatH = 0; const jam = new Map<string, number>(); let jams = 0;
    for (let i = 0; i < 60 * 300; i++) {
      sim.step();
      for (const an of sim.state.animals ?? []) {
        if (an.hidden) continue;
        if (an.species === 'cat' && an.sit > 0.9) catSat = true;
        modes.add(`${an.species}:${an.mode}`);
        if (an.species === 'cat') maxCatH = Math.max(maxCatH, an.h ?? 0);
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
        for (const x of sim.state.agents) if (!x.hidden && x.id !== par.id && x.id !== lp.project.sled?.riderId) { const P = toWorld(cam, x.pos); sledHit = Math.min(sledHit, Math.hypot(P.X - C.X, P.Z - C.Z)); }
      }
      if (i % 10) continue;
      const vis = sim.state.agents.filter((a) => !a.hidden).map((a) => toWorld(cam, a.pos));
      for (let x = 0; x < vis.length; x++) for (let y = x + 1; y < vis.length; y++) minD = Math.min(minD, Math.hypot(vis[x].X - vis[y].X, vis[x].Z - vis[y].Z));
      // vzájemné zbrzdění: dva cizí lidé s trasou těsně u sebe, oba pod polovinou rychlosti déle než 1 s
      const va = sim.state.agents.filter((a) => !a.hidden);
      for (let x = 0; x < va.length; x++) for (let y = x + 1; y < va.length; y++) {
        const A = va[x], B = va[y], k = A.id + B.id;
        if (A.follow?.leaderId === B.id || B.follow?.leaderId === A.id) continue;
        const PA = toWorld(cam, A.pos), PB = toWorld(cam, B.pos);
        const slow = (a: typeof A) => !!a.route && Math.hypot(a.vel?.X ?? 0, a.vel?.Z ?? 0) < 0.5 * (sim as unknown as { vmaxMps(x: typeof A): number }).vmaxMps(a);
        if (Math.hypot(PA.X - PB.X, PA.Z - PB.Z) < 0.75 && slow(A) && slow(B)) { jam.set(k, (jam.get(k) ?? 0) + 1 / 6); if (Math.abs(jam.get(k)! - 1) < 0.05) jams++; }
        else jam.set(k, 0);
      }
    }
    const msgs = sim.state.log.map((l) => l.msg);
    expect(msgs.filter((m) => m.includes('nakoupil')).length).toBeGreaterThanOrEqual(3);
    expect(msgs.filter((m) => m.includes('nakoupil') || m.includes('bez nákupu')).length).toBeGreaterThanOrEqual(6); // dokončené návštěvy stánků (hluboká scéna: cesta k pultu trvá desítky s)
    // rodiny: dítě (dětská šablona, ~70 % výšky) chodí s rodičem a občas si jdou hrát na sníh
    const kids = sim.state.agents.filter((a) => sim.isChild(a) && a.id !== 'kid_sane'); // (dítě na sáňkách se nepočítá)
    expect(kids.length).toBe(5);
    expect(msgs.some((m) => m.includes('jde s dítětem'))).toBe(true);
    expect(sim.state.agents.filter((a) => (a.stuckT ?? 0) > 20).map((a) => a.name)).toEqual([]);
    expect(minD).toBeGreaterThan(2 * R_BODY - 0.02);
    expect(jams).toBeLessThan(25); // hrubá pojistka (jeden 5min běh je šumový; měřítko viz .tmp/jam.ts – 3 seedy × 10 min)
    // psi na vodítku (Z01): nikdy dál než délka vodítka; kočka si přišla sednout (Z06/Z07)
    expect(dogsSeen).toBeGreaterThan(100);
    expect(maxLeash).toBeLessThanOrEqual(LEASH.max + 0.01);
    expect(catSat).toBe(true);
    // focení u stromu (A06): telefon je skutečná rekvizita v ruce po celou dobu klipu, pak zmizí
    expect(photoPhone).toBeGreaterThan(300);
    expect(photoNoPhone).toBe(0);
    // Z02 pes si sedne u stojícího majitele, Z05 setřese sníh
    expect(modes.has('dog:sit')).toBe(true);
    expect(modes.has('dog:shake')).toBe(true);
    // Z09 skok kočky na sokl (sedák lavičky 0,44 m) a zpět; nikdy výš než sokl + oblouk skoku
    expect(modes.has('cat:jump') && modes.has('cat:jumpDown')).toBe(true);
    expect(maxCatH).toBeLessThanOrEqual(0.44 + 0.23);
    // sáňky (B02): průchod proběhl, provázek nikdy delší než jeho délka, sáně jen na sněhu, nikdo jimi neprošel
    expect(sledFrames).toBeGreaterThan(600);
    expect(maxRope).toBeLessThanOrEqual(SLED.rope + 0.01);
    expect(sledOffSnow).toBe(0);
    expect(sledHit).toBeGreaterThan(0.45);
    // odklízení sněhu (A11): pruh odkrytý celý, hromada narostla, pracovník odešel i s lopatou
    expect(msgs.some((m) => m.includes('odklidil(a) sníh'))).toBe(true);
    // (podrobné ověření odklízení: tests/clearing.test.ts)
    expect(sim.state.clearing?.stats.pushes).toBeGreaterThan(3);
    expect(sim.state.props.some((p) => p.kind === 'shovel')).toBe(sim.state.clearing?.phase !== 'offstage');
    expect(sim.state.props.filter((p) => p.kind === 'phone' && !sim.state.agents.some((a) => a.holding === p.id))).toEqual([]);
  }, 180000);

  it('kočka (Z07/Z08): vsedě se občas očistí, před odchodem se někdy protáhne; ne při každém sedu', () => {
    const p = structuredClone(lp.project); p.catPerches = []; p.cats = [{ firstDelay: 1 }];
    const animals = createAnimals(p), modes: string[] = [];
    let prev = '';
    for (let i = 0; i < 60 * 3000; i++) {
      stepAnimals(animals, [], p, i / 60, 1 / 60);
      const m = animals.find((x) => x.species === 'cat')!.mode; if (m !== prev) { modes.push(m); prev = m; }
    }
    const sits = modes.filter((m) => m === 'sit').length, grooms = modes.filter((m) => m === 'groom').length;
    expect(grooms).toBeGreaterThan(0);
    expect(modes.includes('stretch')).toBe(true);
    expect(grooms).toBeLessThan(sits); // ne automaticky při každém zastavení
  });

  it('za 15 min: pohlazení psa (Z03), upadlá rukavice (B03), koulovačka dětí', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    let petFrames = 0;
    for (let i = 0; i < 60 * 900; i++) {
      sim.step();
      if (i % 30) continue;
      for (const d of sim.state.animals ?? []) if (d.mode === 'pet') petFrames++;
    }
    expect(sim.state.log.some((l) => l.msg.includes('hladí psa'))).toBe(true);
    expect(petFrames).toBeGreaterThanOrEqual(2); // ≥ 1 s hlazení (majitel může odejít dřív – hlazení pak přirozeně skončí)
    // děti se koulují i samy (rodiče se dívají) a po hře shodí starého sněhuláka – místo se uvolní
    expect(sim.state.log.some((l) => /^Děti \(.+\) se jdou koulovat/.test(l.msg))).toBe(true);
    const m = sim.state.log.map((l) => l.msg), lost = m.filter((x) => x.includes('ztratil(a) rukavici')).length;
    expect(lost).toBeGreaterThanOrEqual(1);
    // zvednutá je každá, kromě případně té, která právě leží (konec běhu)
    expect(m.filter((x) => x.includes('zvedl(a) rukavici')).length).toBeGreaterThanOrEqual(lost - (sim.state.props.some((p) => p.kind === 'mitten' && p.place.kind === 'ground') ? 1 : 0));
  }, 300000);

  it('děti po koulovačce shodí starého sněhuláka; hromádka po 2 min zmizí a místo je zase volné', () => {
    const sim = Simulation.create(lp.project, lp.manifests);
    sim.advanceTo(30);
    const h = sim.sessionHost();
    const zone = lp.project.zones.find((z) => z.activityType === 'snowballFight')!, smZone = lp.project.zones.find((z) => z.activityType === 'snowman')!;
    sim.state.sessions = []; sim.state.runtimeObjects = [];
    const sp = snowmanSpot(smZone, 1);
    sim.state.runtimeObjects.push({ id: 'snowman_test', kind: 'snowman', zoneId: smZone.id, x: sp.x, y: sp.y, radii: [0.3, 0.22, 0.14], stage: 'done', decorations: ['eyes'], createdAt: -400, seed: 7, slot: 1 });
    const kids = sim.state.agents.filter((a) => !a.hidden && sim.isChild(a) && !a.activity).slice(0, 2);
    expect(kids.length).toBe(2);
    for (const k of kids) { k.route = null; }
    expect(startFight(h, zone, kids[0], kids.slice(1), true)).not.toBeNull();
    let collapsed: number | undefined;
    for (let i = 0; i < 60 * 400 && (sim.state.sessions?.length || collapsed === undefined); i++) { sim.step(); collapsed ??= sim.state.runtimeObjects?.find((o) => o.id === 'snowman_test')?.collapseAt; if (!sim.state.sessions?.length && collapsed === undefined) break; }
    expect(collapsed).toBeDefined();
    expect(sim.state.log.some((l) => l.msg.includes('shodily'))).toBe(true);
    sim.advanceTo(collapsed! + 125);
    expect(sim.state.runtimeObjects?.some((o) => o.id === 'snowman_test')).toBe(false);
    expect(freeSnowmanSlot(h, smZone)).toBe(0);
  }, 300000);
});
