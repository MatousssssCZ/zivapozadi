import { describe, it, expect } from 'vitest';
import { windFactor, windIntegral, snowDensityFactor, emit, particleAt, PARTICLE_POOL, type Particle } from '../src/core/sim/environment';

/** Balíček „živá pozadí“ E01, E02, E04 (T15, T16). */
describe('živé prostředí', () => {
  it('vítr: poryvy 1–2×, integrál spojitý (žádný skok poloh), deterministický', () => {
    let prevW = windIntegral(7, 0), maxF = 0, minF = 9;
    for (let t = 1 / 60; t < 600; t += 1 / 60) {
      const W = windIntegral(7, t), f = windFactor(7, t);
      maxF = Math.max(maxF, f); minF = Math.min(minF, f);
      const dW = W - prevW;
      expect(dW).toBeGreaterThan(0); expect(dW).toBeLessThan(2.1 / 60); // posun za krok ≤ max. násobek · dt
      expect(Math.abs(dW - f / 60)).toBeLessThan(0.02 / 60 + (f - 1) * 0.05 / 60 + 0.01);
      prevW = W;
    }
    expect(minF).toBeGreaterThanOrEqual(1); expect(maxF).toBeGreaterThan(1.3); expect(maxF).toBeLessThanOrEqual(2.0001);
    expect(windIntegral(7, 123.4)).toBe(windIntegral(7, 123.4));
    expect(windIntegral(7, 50, false)).toBe(50);
  });
  it('hustota sněžení: 0,7–1,15×, plynulé přechody', () => {
    let prev = snowDensityFactor(3, 0);
    for (let t = 1 / 30; t < 1200; t += 1 / 30) {
      const d = snowDensityFactor(3, t);
      expect(d).toBeGreaterThanOrEqual(0.7 - 1e-9); expect(d).toBeLessThanOrEqual(1.15 + 1e-9);
      expect(Math.abs(d - prev)).toBeLessThan(0.002);
      prev = d;
    }
    expect(snowDensityFactor(3, 99, false)).toBe(1);
  });
  it('pára: pool je omezený, vypuštěná částice se nehýbe s rukou (poloha jen z místa vzniku a času)', () => {
    const pool: Particle[] = [];
    for (let i = 0; i < PARTICLE_POOL + 50; i++) emit(pool, { kind: 'cupSteam', x: i, y: 500, t0: i / 60, life: 1.2, w0: windIntegral(1, i / 60), sc: 1, seed: i });
    expect(pool.length).toBe(PARTICLE_POOL);
    const p = pool[pool.length - 1];
    const a = particleAt(p, p.t0 + 0.5, 0.2, 1, true)!, b = particleAt({ ...p }, p.t0 + 0.5, 0.2, 1, true)!;
    expect(a).toEqual(b);
    expect(a.y).toBeLessThan(p.y); // stoupá
    expect(particleAt(p, p.t0 + 2, 0.2, 1, true)).toBeNull(); // po životnosti zmizí
  });
});

import { windowOff, doorOpen } from '../src/core/render/facade';
describe('okna a dveře (E07, E08)', () => {
  it('okna: zhasnutí 0/1 s plynulým přechodem, nikdy všechna naráz, deterministické', () => {
    let maxStep = 0, allOff = false;
    const prev = Array.from({ length: 8 }, (_, i) => windowOff(5, i, 0));
    for (let t = 1 / 30; t < 3600; t += 1 / 30) {
      let n = 0;
      for (let i = 0; i < 8; i++) { const v = windowOff(5, i, t); maxStep = Math.max(maxStep, Math.abs(v - prev[i])); prev[i] = v; n += v; expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      if (n > 7.9) allOff = true;
    }
    expect(maxStep).toBeLessThan(0.06); // přechod ~1 s, ne skok
    expect(allOff).toBe(false);
    expect(windowOff(5, 3, 777)).toBe(windowOff(5, 3, 777));
  });
  it('dveře: otevřou se před průchodem a po něm zavřou', () => {
    expect(doorOpen([10], 8)).toBe(0);
    expect(doorOpen([10], 10)).toBe(1);
    expect(doorOpen([10], 10.8)).toBe(1);
    expect(doorOpen([10], 12.5)).toBe(0);
    expect(doorOpen([10], 9.6)).toBeGreaterThan(0);
  });
});
