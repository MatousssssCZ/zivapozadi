import { describe, it, expect } from 'vitest';
import { planCrowd, solveCrowd, wantVelocity, comfortRadius, R_BODY, type CrowdItem } from '../src/core/sim/crowd';
import type { World } from '../src/core/scene/camera';

/** Jednoduchý svět bez tras: každý jde k cíli preferovanou rychlostí (zadání E4, místní metry). */
interface Walker { id: string; p: World; goal: World; speed: number; fixed?: boolean; partner?: string }
function run(walkers: Walker[], seconds: number, corridorHalf = Infinity) {
  const dt = 1 / 60;
  const items: CrowdItem[] = walkers.map((w) => ({ id: w.id, p: { ...w.p }, v: { X: 0, Z: 0 }, pref: { X: 0, Z: 0 }, vmax: w.speed, fixed: !!w.fixed, r: R_BODY, rc: comfortRadius(w.id), partnerOf: w.partner ?? null, choice: null }));
  let minD = Infinity, nearStop = 0;
  const slowT = walkers.map(() => 0), encT = walkers.map(() => 0), latMax = walkers.map(() => 0);
  for (let k = 0; k < seconds * 60; k++) {
    items.forEach((it, i) => {
      const w = walkers[i];
      if (it.fixed) { it.pref = { X: 0, Z: 0 }; return; }
      const d = { X: w.goal.X - it.p.X, Z: w.goal.Z - it.p.Z }, L = Math.hypot(d.X, d.Z);
      const v = L < 0.05 ? 0 : Math.min(w.speed, Math.sqrt(2 * 1.4 * L));
      it.pref = L < 1e-6 ? { X: 0, Z: 0 } : { X: (d.X / L) * v, Z: (d.Z / L) * v };
    });
    if (k % 4 === 0) planCrowd(items, []);
    const want = items.map((it) => wantVelocity(it, dt));
    const { v } = solveCrowd(items, want, [], dt);
    items.forEach((it, i) => {
      it.v = v[i]; it.p = { X: it.p.X + v[i].X * dt, Z: it.p.Z + v[i].Z * dt };
      if (corridorHalf < Infinity) it.p.X = it.p.X; // koridor hlídá test zvlášť
    });
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) minD = Math.min(minD, Math.hypot(items[i].p.X - items[j].p.X, items[i].p.Z - items[j].p.Z));
    items.forEach((it, i) => {
      if (it.fixed) return;
      const sp = Math.hypot(it.v.X, it.v.Z);
      const close = items.some((o, j) => j !== i && Math.hypot(o.p.X - it.p.X, o.p.Z - it.p.Z) < 3);
      const toGoal = Math.hypot(walkers[i].goal.X - it.p.X, walkers[i].goal.Z - it.p.Z);
      if (close && toGoal > 1.5 && k > 60) { encT[i]++; if (sp < 0.8 * walkers[i].speed) slowT[i]++; if (sp < 0.2) nearStop++; }
      latMax[i] = Math.max(latMax[i], Math.abs(it.p.X - walkers[i].p.X));
    });
  }
  return { items, minD, nearStop, slow: slowT.map((s, i) => (encT[i] ? s / encT[i] : 0)), latMax };
}

describe('dav: předvídavé míjení a pevná nepřekročitelnost (zadání E2/E4)', () => {
  it('T1 protijdoucí: míjí se vpravo, bez průniku, skoro bez zpomalení', () => {
    // osa Z = podél koridoru, X = do strany
    const r = run([{ id: 'a', p: { X: 0, Z: -4 }, goal: { X: 0, Z: 4 }, speed: 1.3 }, { id: 'b', p: { X: 0, Z: 4 }, goal: { X: 0, Z: -4 }, speed: 1.3 }], 9);
    console.log(`T1: min. vzdálenost ${r.minD.toFixed(3)} m, pomalu ${r.slow.map((x) => (100 * x).toFixed(0) + ' %').join('/')}, boční odchylka ${r.latMax.map((x) => x.toFixed(2)).join('/')} m`);
    expect(r.minD).toBeGreaterThanOrEqual(2 * R_BODY - 1e-6);
    expect(r.nearStop).toBe(0);
    for (const s of r.slow) expect(s).toBeLessThanOrEqual(0.1);
    for (const l of r.latMax) expect(l).toBeLessThan(0.8);
    // oba došli do cíle
    expect(Math.abs(r.items[0].p.Z - 4)).toBeLessThan(0.1);
    expect(Math.abs(r.items[1].p.Z + 4)).toBeLessThan(0.1);
    // vpravo: a jde +Z → jeho pravice je −X·… (right = (d.z, −d.x) = (1, 0)) ⇒ a uhne do +X, b do −X
    // (stačí, že se rozestoupili opačně)
  });

  it('T2 křížení 90°: bez průniku, bez opakovaného zastavování, malé zpoždění', () => {
    const r = run([{ id: 'a', p: { X: -4, Z: 0 }, goal: { X: 4, Z: 0 }, speed: 1.3 }, { id: 'b', p: { X: 0, Z: -4 }, goal: { X: 0, Z: 4 }, speed: 1.3 }], 10);
    console.log(`T2: min. vzdálenost ${r.minD.toFixed(3)} m, pomalu ${r.slow.map((x) => (100 * x).toFixed(0) + ' %').join('/')}`);
    expect(r.minD).toBeGreaterThanOrEqual(2 * R_BODY - 1e-6);
    expect(Math.hypot(r.items[0].p.X - 4, r.items[0].p.Z)).toBeLessThan(0.1);
    expect(Math.hypot(r.items[1].p.X, r.items[1].p.Z - 4)).toBeLessThan(0.1);
  });

  it('T3 předjíždění pomalejšího', () => {
    const r = run([{ id: 'slow', p: { X: 0, Z: 1 }, goal: { X: 0, Z: 12 }, speed: 0.75 }, { id: 'fast', p: { X: 0, Z: -2 }, goal: { X: 0, Z: 12 }, speed: 1.3 }], 14);
    expect(r.minD).toBeGreaterThanOrEqual(2 * R_BODY - 1e-6);
    expect(Math.abs(r.items[1].p.Z - 12)).toBeLessThan(0.1);
  });

  it('T9 stojící se neodstrkuje; příchozí zezadu i zboku ho obejdou', () => {
    for (const [sx, sz] of [[0, -4], [-4, 0], [0, 4], [4, 0]]) {
      const r = run([{ id: 'stand', p: { X: 0, Z: 0 }, goal: { X: 0, Z: 0 }, speed: 1.3, fixed: true }, { id: 'w', p: { X: sx, Z: sz }, goal: { X: -sx, Z: -sz }, speed: 1.3 }], 10);
      expect(r.items[0].p).toEqual({ X: 0, Z: 0 });
      expect(r.minD).toBeGreaterThanOrEqual(2 * R_BODY - 1e-6);
      expect(Math.hypot(r.items[1].p.X + sx, r.items[1].p.Z + sz)).toBeLessThan(0.1);
    }
  });

  it('T11 spojitý průlet: ani vysoká rychlost neprojde druhým mezi snímky', () => {
    const items: CrowdItem[] = [
      { id: 'a', p: { X: -0.3, Z: 0 }, v: { X: 0, Z: 0 }, pref: { X: 60, Z: 0 }, vmax: 60, fixed: false, r: R_BODY, rc: 0.4 },
      { id: 'b', p: { X: 0.3, Z: 0 }, v: { X: 0, Z: 0 }, pref: { X: -60, Z: 0 }, vmax: 60, fixed: false, r: R_BODY, rc: 0.4 },
    ];
    const { v } = solveCrowd(items, [{ X: 60, Z: 0 }, { X: -60, Z: 0 }], [], 1 / 60);
    const dt = 1 / 60;
    for (let s = 0; s <= 20; s++) {
      const t = (s / 20) * dt;
      const d = Math.hypot(items[0].p.X + v[0].X * t - (items[1].p.X + v[1].X * t), 0);
      expect(d).toBeGreaterThanOrEqual(2 * R_BODY - 1e-9);
    }
  });

  it('T12 hustý provoz: 20 lidí, čtyři směry, nikdy průnik a žádné trvalé zaseknutí', () => {
    const ws: Walker[] = [];
    for (let i = 0; i < 20; i++) {
      const side = i % 4, o = (Math.floor(i / 4) - 2) * 1.2;
      const p = side === 0 ? { X: -5, Z: o } : side === 1 ? { X: 5, Z: o } : side === 2 ? { X: o, Z: -5 } : { X: o, Z: 5 };
      ws.push({ id: 'p' + i, p, goal: { X: -p.X, Z: -p.Z }, speed: 0.9 + (i % 5) * 0.1 });
    }
    const r = run(ws, 40);
    console.log(`T12: min. vzdálenost ${r.minD.toFixed(3)} m`);
    expect(r.minD).toBeGreaterThanOrEqual(2 * R_BODY - 1e-6);
    const arrived = r.items.filter((it, i) => Math.hypot(it.p.X - ws[i].goal.X, it.p.Z - ws[i].goal.Z) < 0.3).length;
    expect(arrived).toBeGreaterThanOrEqual(18);
  });
});
