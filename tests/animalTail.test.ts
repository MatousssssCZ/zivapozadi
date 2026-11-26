import { describe, it, expect } from 'vitest';
import { drawVectorTail, tailProfileOf, TAILS } from '../src/core/render/animalTail';

/** Záznamový „kontext": sbírá body cest, aby šlo měřit tvar a plynulost ocasu. */
function recorder() {
  const pts: [number, number][] = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k) {
      if (k === 'moveTo' || k === 'lineTo') return (x: number, y: number) => pts.push([x, y]);
      if (k === 'createLinearGradient') return () => grad;
      return () => {};
    },
    set() { return true; },
  });
  return { ctx, pts };
}
const shape = (breed: string, sp: 'dog' | 'cat', t: number, walk = 0) => { const r = recorder(); drawVectorTail(r.ctx as never, tailProfileOf(breed, sp), sp, 0, 0, 100, t, walk, t * 1.7 % 1, 0, false, 3); return r.pts; };

describe('vektorový ocas', () => {
  it('každé plemeno má profil a kreslí konečné body', () => {
    for (const b of Object.keys(TAILS)) { const sp = b.startsWith('cat') ? 'cat' : 'dog'; const p = shape(b, sp, 1.3, 0.5); expect(p.length).toBeGreaterThan(50); expect(p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true); }
  });
  it('je deterministický a mezi snímky (60 Hz) se nehýbe skokem', () => {
    for (const [b, sp] of [['dog_collie', 'dog'], ['cat_mainecoon', 'cat'], ['cat', 'cat'], ['dog_husky', 'dog']] as const) {
      expect(shape(b, sp, 2.5)).toEqual(shape(b, sp, 2.5));
      let worst = 0;
      for (let f = 0; f < 600; f++) { const a = shape(b, sp, f / 60, 1), c = shape(b, sp, (f + 1) / 60, 1); for (let i = 0; i < Math.min(a.length, c.length); i++) worst = Math.max(worst, Math.hypot(a[i][0] - c[i][0], a[i][1] - c[i][1])); }
      expect(worst).toBeLessThan(12); // < 12 % délky ocasu za snímek
    }
  });
});
