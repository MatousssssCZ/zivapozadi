import { describe, it, expect } from 'vitest';
import { legProfile, pawTarget, solveLeg } from '../src/core/render/animalLegs';

/** Vektorové nohy: opěrná tlapka stojí ve světě, klouby neskáčou, délky kostí se nemění, čtyřdobé pořadí. */
describe('vektorové nohy zvířat', () => {
  for (const [breed, sp] of [['dog_collie', 'dog'], ['cat_british', 'cat'], [undefined, 'dog'], ['dog_frenchie', 'dog']] as const) {
    it(`${breed ?? sp}: tlapka v opoře neklouže, kosti drží délku, ohyb nepřeskakuje`, () => {
      const P = legProfile(breed, sp), ppm = 300, S = P.stride * ppm;
      for (const front of [true, false]) {
        let w0: number | null = null, drift = 0, prevJ: { x: number; y: number } | null = null, jump = 0;
        const segs = (front ? P.front : P.hind).map((x) => x * ppm) as [number, number, number];
        for (let i = 0; i <= 600; i++) {
          const dist = (i / 600) * P.stride * 2, ph = (dist / P.stride) % 1;
          const tg = pawTarget(ph, P.duty, 1, 0, S, P.lift * ppm, front);
          const world = dist * ppm + tg.x;
          if (tg.contact) { if (w0 === null) w0 = world; drift = Math.max(drift, Math.abs(world - w0)); } else w0 = null;
          const R = { x: 0, y: -(segs[0] + segs[1]) * 0.85 - segs[2] };
          const s = solveLeg(R, { x: tg.x, y: tg.y }, segs, front, tg.q, tg.contact, tg.roll);
          expect(Math.abs(Math.hypot(s.pts[1].x - s.pts[0].x, s.pts[1].y - s.pts[0].y) - segs[0])).toBeLessThan(0.01);
          expect(Math.abs(Math.hypot(s.paw.x - s.pts[2].x, s.paw.y - s.pts[2].y) - segs[2])).toBeLessThan(0.01);
          expect(s.paw.y).toBeLessThanOrEqual(0.5); // nikdy pod zemí
          // ohyb: přední loket vzad, zadní koleno vpřed (vůči spojnici kořen–zápěstí)
          const cr = (s.pts[2].x - s.pts[0].x) * (s.pts[1].y - s.pts[0].y) - (s.pts[2].y - s.pts[0].y) * (s.pts[1].x - s.pts[0].x);
          expect(front ? cr >= -1e-6 : cr <= 1e-6).toBe(true);
          if (prevJ) jump = Math.max(jump, Math.hypot(s.pts[1].x - prevJ.x, s.pts[1].y - prevJ.y)); prevJ = s.pts[1];
        }
        expect(drift).toBeLessThan(0.01);
        expect(jump).toBeLessThan(segs[0] * 0.15);
      }
    });
  }
  it('čtyřdobá chůze: pořadí LH → LF → RH → RF, nikdy všechny tlapky ve vzduchu', () => {
    const P = legProfile('dog_collie', 'dog');
    expect([P.phase.LH, P.phase.LF, P.phase.RH, P.phase.RF]).toEqual([0, 0.25, 0.5, 0.75]);
    for (let i = 0; i < 400; i++) { const ph = i / 400; const n = (['LH', 'LF', 'RH', 'RF'] as const).filter((k) => pawTarget((ph + P.phase[k]) % 1, P.duty, 1, 0, 100, 10, k.endsWith('F')).contact).length; expect(n).toBeGreaterThanOrEqual(2); }
  });
});
