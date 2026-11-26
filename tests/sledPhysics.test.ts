import { describe, it, expect } from 'vitest';
import { stepSledPhysics, SLED, type SledState } from '../src/core/sim/sled';

const DT = 1 / 60;
const mk = (): SledState => ({ phase: 'run', until: 0, dir: 1, n: 0, hist: [], S: { X: -SLED.rope - SLED.length / 2, Z: 5 }, V: { X: 0, Z: 0 }, wang: 0 });
const ringDist = (st: SledState, H: { X: number; Z: number }) => Math.hypot(H.X - (st.S!.X + Math.cos(st.wang!) * SLED.length / 2), H.Z - (st.S!.Z + Math.sin(st.wang!) * SLED.length / 2));

describe('fyzika tažených saní', () => {
  it('provaz se neprotáhne a táhne saně za chodcem', () => {
    const st = mk(); let H = { X: 0, Z: 5 }, maxK = 0;
    for (let i = 0; i < 600; i++) { H = { X: H.X + 0.8 * DT, Z: 5 }; stepSledPhysics(st, H, DT); maxK = Math.max(maxK, ringDist(st, H) / SLED.rope); }
    expect(maxK).toBeLessThan(1.04);
    expect(Math.hypot(st.V!.X, st.V!.Z)).toBeGreaterThan(0.7);
  });
  it('po zastavení chodce saně dojedou, provaz povolí a saně se zastaví bez chvění', () => {
    const st = mk(); let H = { X: 0, Z: 5 };
    for (let i = 0; i < 600; i++) { H = { X: H.X + 0.8 * DT, Z: 5 }; stepSledPhysics(st, H, DT); }
    const x0 = st.S!.X; const xs: number[] = [];
    for (let i = 0; i < 300; i++) { stepSledPhysics(st, H, DT); xs.push(st.S!.X); }
    expect(st.S!.X - x0).toBeGreaterThan(0.1); // dojely
    expect(ringDist(st, H)).toBeLessThan(SLED.rope); // provaz povolil
    expect(st.V!.X).toBe(0); expect(st.V!.Z).toBe(0);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-12); // žádné couvání / chvění
  });
  it('provaz netlačí: chodec couvající k saním je neposune', () => {
    const st = mk(); const H = { X: -0.2, Z: 5 };
    for (let i = 0; i < 120; i++) stepSledPhysics(st, H, DT);
    expect(Math.abs(st.S!.X - (-SLED.rope - SLED.length / 2))).toBeLessThan(1e-9);
  });
  it('v zatáčce se příď stáčí za provazem a saně nejedou bokem', () => {
    const st = mk(); let H = { X: 0, Z: 5 };
    for (let i = 0; i < 300; i++) { H = { X: H.X + 0.8 * DT, Z: 5 }; stepSledPhysics(st, H, DT); }
    for (let i = 0; i < 400; i++) { H = { X: H.X, Z: H.Z + 0.8 * DT }; stepSledPhysics(st, H, DT); }
    expect(st.wang!).toBeGreaterThan(0.6);
    const v = st.V!, vl = Math.abs(-v.X * Math.sin(st.wang!) + v.Z * Math.cos(st.wang!));
    expect(vl).toBeLessThan(0.12);
  });
});
