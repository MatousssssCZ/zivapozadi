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
