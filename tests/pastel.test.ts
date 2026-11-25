import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { tmpDir } from './helpers';
import { loadProject, type LoadedProject } from '../src/node/projectIO';
import { generatePastel } from '../scripts/generate-pastel-demo';
import { Simulation } from '../src/core/sim/simulation';
import { insideW, railNearest } from '../src/core/sim/rink';
import { cameraFor, toWorld } from '../src/core/scene/camera';
import { pointInPolygon } from '../src/core/math/geom';

/**
 * Scéna „Pastelové vánoční kluziště“: bruslaři v obrysu ledu, chodci a psi mimo led, nástup přes
 * lavičku s přezutím, nákup nápoje až po vyhození kelímku, globální prodleva prvků, stabilní běh.
 */
let lp: LoadedProject; let sim: Simulation;
const log = { outside: 0, onIceWalkers: 0, minDist: 9, life: {} as Record<string, number>, maxEvents: 0, coffeeDone: 0, binned: 0, tricksAt: [] as number[], nan: 0, visibleMax: 0 };
beforeAll(async () => {
  const dir = path.join(await tmpDir(), 'pastel.zscena');
  await generatePastel(dir);
  lp = await loadProject(dir);
  sim = Simulation.create(lp.project, lp.manifests);
  const cam = cameraFor(lp.project.scene), ice = lp.project.rink!.ice, iceW = ice.map((p) => toWorld(cam, p));
  const last: Record<string, string> = {}; let tricks = 0;
  for (let t = 0.5; t <= 330; t += 0.5) {
    sim.advanceTo(t);
    const st = sim.state.rink!, all = Object.values(st.sk);
    for (const s of all) { if (!insideW(s, iceW) || railNearest(iceW, s).d < 0.15) log.outside++; if (!Number.isFinite(s.X + s.Z + s.v)) log.nan++; }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i].pair !== all[j].id) log.minDist = Math.min(log.minDist, Math.hypot(all[i].X - all[j].X, all[i].Z - all[j].Z));
    // chodci a psi nesmějí na led (vnitřek o 0,6 m menší – sněhový lem u kraje je pěší)
    for (const a of sim.state.agents) {
      if (a.hidden || a.onIce) continue;
      const w = toWorld(cam, a.pos);
      if (insideW(w, iceW) && railNearest(iceW, w).d > 0.6) log.onIceWalkers++;
    }
    for (const an of sim.state.animals ?? []) if (!an.hidden) { const w = toWorld(cam, an.pos); if (insideW(w, iceW) && railNearest(iceW, w).d > 0.6) log.onIceWalkers++; }
    for (const [id, L] of Object.entries(st.life ?? {})) { if (last[id] !== L.ph) { const k = `${last[id] ?? '-'}>${L.ph}`; log.life[k] = (log.life[k] ?? 0) + 1; last[id] = L.ph; } }
    if (st.stats.tricks > tricks) { tricks = st.stats.tricks; log.tricksAt.push(t); }
    log.maxEvents = Math.max(log.maxEvents, all.filter((s) => s.st === 'FALL' || s.st.startsWith('TRICK')).length);
    log.binned = sim.state.props.filter((p) => p.place.kind === 'inBin').length;
    log.visibleMax = Math.max(log.visibleMax, sim.state.agents.filter((a) => !a.hidden).length);
    void pointInPolygon;
  }
}, 600000);

describe('pastelové kluziště', () => {
  it('scéna: podklady, led z pozadí, objekty s kotvou na patě, bez saní', () => {
    const p = lp.project;
    expect(p.rink?.paintedIce).toBe(true);
    expect(p.rink!.ice.length).toBeGreaterThan(100);
    expect(p.sled).toBeUndefined();
    for (const id of ['obj_strom', 'obj_stanek', 'obj_kos', 'obj_lavicka']) expect(p.objects.some((o) => o.id === id)).toBe(true);
    const tree = p.assets.find((a) => a.name === 'Vánoční strom')!;
    expect(tree.anchor!.y).toBeGreaterThan(0.98);
    expect(tree.sparkle!.length).toBeGreaterThan(20);
    // stánek a strom stojí mimo led
    const cam = cameraFor(p.scene), iceW = p.rink!.ice.map((q) => toWorld(cam, q));
    for (const id of ['obj_strom', 'obj_stanek', 'obj_kos', 'obj_lavicka']) { const o = p.objects.find((x) => x.id === id)!; expect(insideW(toWorld(cam, o), iceW)).toBe(false); }
  });

  it('bruslaři zůstávají v obrysu ledu, nepřekrývají se; chodci ani psi nevstoupí na led', () => {
    expect(log.outside).toBe(0);
    expect(log.nan).toBe(0);
    expect(log.minDist).toBeGreaterThan(0.4);
    expect(log.onIceWalkers).toBe(0);
  });

  it('nástup a výstup jen přes lavičku a branku (přezutí v obou směrech)', () => {
    const L = log.life;
    expect(L['ice>toBench'] ?? 0).toBeGreaterThan(0);
    expect(L['toBench>changeOff'] ?? 0).toBe(L['ice>toBench'] ?? -1);
    expect(L['arrive>changeOn'] ?? 0).toBeGreaterThan(0);
    expect(L['toGate>ice'] ?? 0).toBeGreaterThan(0);
    // na led se jde jen z přezouvání (žádná zkratka)
    for (const k of Object.keys(L)) if (k.endsWith('>ice') && !k.startsWith('-')) expect(k).toBe('toGate>ice');
  });

  it('prvky: globální prodleva (~2 min), nikdy dva zároveň; pády a prvky se nepřekrývají', () => {
    for (let i = 1; i < log.tricksAt.length; i++) expect(log.tricksAt[i] - log.tricksAt[i - 1]).toBeGreaterThanOrEqual(95);
    expect(log.tricksAt.length).toBeGreaterThanOrEqual(1);
    expect(log.maxEvents).toBeLessThanOrEqual(1);
  });

  it('běh 5 min: stabilní (počet postav omezený, žádné NaN), kelímky končí v koši', () => {
    expect(log.visibleMax).toBeLessThan(60);
    expect(sim.state.rink!.stats.overlapEvents).toBe(0);
    // každý vyhozený kelímek je v koši (žádný visí ve vzduchu ani nezmizí jinde)
    for (const p of sim.state.props) if (p.kind === 'cup') expect(['held', 'counter', 'inBin', 'falling']).toContain(p.place.kind);
  });
});
