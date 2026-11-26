import { describe, it, expect } from 'vitest';
import { stepAccessoryPhysics, accessoriesOf, TAIL_SEGS, type PhysInput } from '../src/core/render/accessories';

const ppm = 100;
const inp = (x: number, y = 0): PhysInput => ({ knots: [{ x, y }], segPx: [8], top: { x, y: y - 60 }, up: { x: 0, y: -1 }, ppm, chestN: { x: 1, y: 0 }, chestP: { x: x - 2, y }, wind: 0 });

describe('vektorové doplňky – fyzika', () => {
  it('konec šály v klidu visí svisle a články drží délku', () => {
    const o = {}; let st = stepAccessoryPhysics(o, 'a', 0, inp(100));
    for (let i = 1; i <= 600; i++) st = stepAccessoryPhysics(o, 'a', i / 60, inp(100));
    const p = st.tails[0].p;
    expect(p.length).toBe(TAIL_SEGS + 1);
    for (let i = 1; i < p.length; i++) expect(Math.abs(Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y) - 8)).toBeLessThan(0.15);
    expect(Math.abs(p[p.length - 1].x - 100)).toBeLessThan(1.5);
    expect(p[p.length - 1].y).toBeGreaterThan(40);
  });
  it('při rozjezdu dopředu konec zaostává (setrvačnost) a nepronikne do hrudi', () => {
    const o = {}; let st = stepAccessoryPhysics(o, 'a', 0, inp(100));
    for (let i = 1; i <= 120; i++) st = stepAccessoryPhysics(o, 'a', i / 60, inp(100));
    // tělo couvá doleva 1,4 m/s → konec se opozdí doprava? ne: rovina hrudi je vpravo od uzlu (x ≥ uzel − 2)
    for (let i = 121; i <= 150; i++) st = stepAccessoryPhysics(o, 'a', i / 60, inp(100 - (i - 120) * (1.4 * ppm) / 60));
    const knot = st.tails[0].p[0], end = st.tails[0].p[TAIL_SEGS];
    expect(end.x - knot.x).toBeGreaterThan(3); // konec zůstal pozadu (vpravo) – opoždění
    for (const q of st.tails[0].p) expect(q.x).toBeGreaterThanOrEqual(knot.x - 2 - 1e-6);
  });
  it('bambule zůstává na stopce a doznívá', () => {
    const o = {}; let st = stepAccessoryPhysics(o, 'b', 0, inp(0));
    let maxD = 0;
    for (let i = 1; i <= 240; i++) { const y = Math.sin(i / 6) * 4; st = stepAccessoryPhysics(o, 'b', i / 60, inp(0, y)); const tg = { x: 0, y: y - 60 - 5 }; maxD = Math.max(maxD, Math.hypot(st.pom!.p.x - tg.x, st.pom!.p.y - tg.y)); }
    expect(maxD).toBeLessThanOrEqual(0.035 * ppm + 0.5); // + posun cíle během posledního dílčího kroku
    expect(maxD).toBeGreaterThan(0.2); // pohybuje se
  });
  it('nezávislé na snímkové frekvenci (30 vs 60 fps)', () => {
    const run = (fps: number) => { const o = {}; let st = stepAccessoryPhysics(o, 'c', 0, inp(0)); for (let i = 1; i <= 2 * fps; i++) { const t = i / fps; st = stepAccessoryPhysics(o, 'c', t, inp(Math.min(t, 1) * 80)); } return st.tails[0].p[TAIL_SEGS]; };
    const a = run(30), b = run(60);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1);
  });
  it('doplňky jsou deterministické a pestré', () => {
    const app = (seed: number) => ({ seed } as never);
    expect(accessoriesOf(app(7), false)).toEqual(accessoriesOf(app(7), false));
    const kinds = new Set(Array.from({ length: 60 }, (_, i) => accessoriesOf(app(i * 31 + 5), false)?.hat ?? 'malovaná'));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
});
