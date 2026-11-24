import { describe, it, expect } from 'vitest';
import { makeRng, nextU01, tri } from '../src/core/social/rng';
import { sampleGap, sampleTurnDur, emptySocialWorld, startConversation, stepConversations, stepAgentSocial, initSocial, canSip, type SocialAgent, type SocialEnv, type SocialWorld } from '../src/core/social/social';
import { evalGesture, CLIP_T, MANUAL, type Family } from '../src/core/social/clips';
import { skeletonPose, DEFAULT_MOTION } from '../src/core/anim/skeleton';
import { TEST_FIGURE_TEMPLATE } from '../src/core/anim/testFigure';
import { initialAnimState } from '../src/core/anim/animator';

/** Zadání sociálních interakcí, kap. E.3 (statistika generátoru) a E.2 (invarianty). */

function erf(x: number): number {
  // Abramowitz–Stegun 7.1.26 (chyba < 1,5e-7)
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

describe('plán řeči – generátor (S01–S05)', () => {
  it('směs mezer 80/15/5 % a jejich rozsahy a průměry', () => {
    const rng = makeRng(1, 'test', 'gaps');
    const N = 20000, by: Record<string, number[]> = { short: [], long: [], overlap: [] };
    for (let i = 0; i < N; i++) { const g = sampleGap(rng); by[g.kind].push(g.gap); }
    const p = (k: string) => by[k].length / N;
    expect(Math.abs(p('short') - 0.8)).toBeLessThan(0.02);
    expect(Math.abs(p('long') - 0.15)).toBeLessThan(0.02);
    expect(Math.abs(p('overlap') - 0.05)).toBeLessThan(0.02);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(Math.min(...by.short)).toBeGreaterThanOrEqual(0.05); expect(Math.max(...by.short)).toBeLessThanOrEqual(0.4);
    expect(Math.abs(mean(by.short) - 0.21)).toBeLessThan(0.015);
    expect(Math.min(...by.long)).toBeGreaterThanOrEqual(0.35); expect(Math.max(...by.long)).toBeLessThanOrEqual(0.9);
    expect(Math.abs(mean(by.long) - 0.6)).toBeLessThan(0.025);
    const ov = by.overlap.map((x) => -x);
    expect(Math.min(...ov)).toBeGreaterThanOrEqual(0.05); expect(Math.max(...ov)).toBeLessThanOrEqual(0.22);
    expect(Math.abs(mean(ov) - 0.13)).toBeLessThan(0.015);
  });

  it('délka promluvy: ořezaný lognormál (medián 3,8 s, σ 0,45, 1,2–9 s), max. chyba CDF 0,025', () => {
    const rng = makeRng(2, 'test', 'turns');
    const xs = Array.from({ length: 10000 }, () => sampleTurnDur(rng)).sort((a, b) => a - b);
    expect(xs[0]).toBeGreaterThanOrEqual(1.2); expect(xs[xs.length - 1]).toBeLessThanOrEqual(9);
    const mu = Math.log(3.8), sg = 0.45, F = (x: number) => Phi((Math.log(x) - mu) / sg);
    const a = F(1.2), b = F(9);
    let maxErr = 0;
    xs.forEach((x, i) => { maxErr = Math.max(maxErr, Math.abs((i + 1) / xs.length - (F(x) - a) / (b - a))); });
    expect(maxErr).toBeLessThan(0.025);
  });

  it('trojúhelníkové rozdělení má správnou střední hodnotu', () => {
    const rng = makeRng(3, 'x', 'y');
    let s = 0; for (let i = 0; i < 20000; i++) s += tri(0.65, 1, 1.3, nextU01(rng));
    expect(Math.abs(s / 20000 - (0.65 + 1 + 1.3) / 3)).toBeLessThan(0.01);
  });
});

/** Samostatná skupina stojících lidí řízená jen režisérem (bez simulace scény). */
function standalone(n: number, seconds: number, seed = 7, opts: { tempo1?: boolean } = {}) {
  const world: SocialWorld = emptySocialWorld();
  world.stats.manualLog = [];
  const agents: SocialAgent[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, holding: null, speed: 0, anim: { gestures: [], walkBlend: 0, action: null } }));
  for (const a of agents) { a.social = initSocial(seed, a.id); if (opts.tempo1) a.social.traits.tempo = 1; }
  const env: SocialEnv & { now: number } = { now: 0, seed, agent: (id) => agents.find((a) => a.id === id) };
  startConversation(world, agents.map((a) => a.id), 'pair', seed, 0);
  const counts = [0, 0, 0]; // 0 / 1 / 2+ mluvčích
  const speakers: string[] = [];
  let lastTurn = 0, gestSpeak = 0, speakT = 0, gestListen = 0, listenT = 0;
  const frames: string[] = [];
  const conv = world.convs[0];
  for (let k = 0; k < seconds * 60; k++) {
    env.now = k / 60;
    stepConversations(world, env);
    for (const a of agents) stepAgentSocial(a, env, world, 1 / 60);
    const sp = agents.filter((a) => a.anim.speaking).length;
    if (env.now > 2) counts[Math.min(2, sp)]++;
    for (const t of conv.turns) if (t.id > lastTurn) { lastTurn = t.id; speakers.push(t.speaker); }
    for (const a of agents) {
      const manual = (a.anim.gestures ?? []).some((g) => MANUAL.includes(g.fam));
      if (a.anim.speaking) { speakT++; if (manual) gestSpeak++; } else { listenT++; if (manual) gestListen++; }
    }
    if (k % 600 === 0) frames.push(JSON.stringify(agents.map((a) => [a.anim.gestures, a.anim.speaking])));
  }
  return { world, agents, counts, speakers, gestSpeak, speakT, gestListen, listenT, frames };
}

describe('režisér rozhovoru (S06–S13)', () => {
  it('dyáda 20 min: jeden mluvčí 90–98 %, dva 0–2 %, nikdo 2–10 %', () => {
    const r = standalone(2, 1200, 11, { tempo1: true });
    const tot = r.counts.reduce((x, y) => x + y, 0);
    const [none, one, two] = r.counts.map((c) => c / tot);
    console.log(`dyáda: nikdo ${(none * 100).toFixed(1)} %, jeden ${(one * 100).toFixed(1)} %, dva ${(two * 100).toFixed(2)} %, tahů ${r.world.stats.turns}, kývnutí ${r.world.stats.nods}/${r.world.stats.nodOpps}, gesta`, r.world.stats.gestures);
    expect(one).toBeGreaterThanOrEqual(0.9); expect(one).toBeLessThanOrEqual(0.98);
    expect(two).toBeGreaterThan(0); expect(two).toBeLessThan(0.02);
    expect(none).toBeGreaterThanOrEqual(0.02); expect(none).toBeLessThanOrEqual(0.1);
  });

  it('antirepetice 8 s, cooldowny a rozpočet gest (mluvčí ≤ 55 %, posluchač ≤ 20 %)', () => {
    for (const seed of [1, 2, 3]) {
      const r = standalone(3, 600, seed);
      const log = r.world.stats.manualLog!;
      expect(log.length).toBeGreaterThan(10);
      const per = new Map<string, [string, Family, number, number][]>();
      for (const e of log) { const l = per.get(e[0]) ?? []; l.push(e); per.set(e[0], l); }
      for (const l of per.values()) {
        l.sort((a, b) => a[2] - b[2]);
        for (let i = 1; i < l.length; i++) {
          const prev = l[i - 1], cur = l[i];
          if (prev[1] === cur[1]) expect(cur[2] - prev[3]).toBeGreaterThanOrEqual(Math.max(8, CLIP_T[cur[1]].cd) - 1e-6);
        }
      }
      expect(r.gestSpeak / r.speakT).toBeLessThanOrEqual(0.55);
      expect(r.gestListen / r.listenT).toBeLessThanOrEqual(0.2);
    }
  });

  it('férové střídání: nikdo dostupný není přeskočen víc než 5× po sobě', () => {
    const r = standalone(4, 900, 5);
    for (const a of r.agents) {
      let run = 0, worst = 0;
      for (const s of r.speakers) { if (s === a.id) run = 0; else worst = Math.max(worst, ++run); }
      expect(worst).toBeLessThanOrEqual(6); // 5 přeskočení + tah hned po vlastním
    }
  });

  it('determinismus: stejný seed ⇒ stejný průběh', () => {
    expect(standalone(2, 120, 9).frames).toEqual(standalone(2, 120, 9).frames);
    expect(standalone(2, 120, 9).frames).not.toEqual(standalone(2, 120, 10).frames);
  });

  it('pití: nikdy během vlastní řeči ani 0,45 s před vlastním tahem', () => {
    const world = emptySocialWorld();
    const c = startConversation(world, ['a', 'b'], 'pair', 1, 0);
    c.turns.push({ id: 1, speaker: 'a', start: 5, end: 8, phrases: [], gap: 0, gapKind: 'first', gestures: 0, cupBeats: 0, reservedNext: false });
    expect(canSip(world, 'a', 6, 3)).toBe(false);
    expect(canSip(world, 'a', 1.0, 3)).toBe(true);
    expect(canSip(world, 'a', 1.7, 3)).toBe(false); // konec doušku 4,7 s + 0,45 > 5
    expect(canSip(world, 'b', 6, 3)).toBe(true);
  });
});

describe('klipy gest – invarianty (E.2)', () => {
  const fams = Object.keys(CLIP_T) as Family[];
  it('začínají a končí v základní póze, bez NaN a bez skoků ruky', () => {
    for (const fam of fams) {
      for (const hand of [0, 1] as const) {
        const g = { fam, t: 0, dur: CLIP_T[fam].T[1], hand, amp: 1, sgn: 1, dir: { x: 0.9, y: 0.1 } };
        const o0 = evalGesture(g), o1 = evalGesture({ ...g, t: g.dur });
        for (const o of [o0, o1]) {
          expect(Math.abs(o.headDeg) + Math.abs(o.trunkDeg) + Math.abs(o.pelvisX)).toBeLessThan(1e-6);
          for (const a of o.arms) expect(a?.rel ? Math.hypot(a.p.x, a.p.y) : a?.w ?? 0).toBeLessThan(1e-6);
        }
        // spojitost pózy kostry po 1/60 s (holding pro klipy s kelímkem)
        const holding = fam === 'cupBeat' || fam === 'warmCup';
        let prev: { x: number; y: number }[] | null = null, prevHead = 0;
        for (let t = 0; t <= g.dur + 1e-9; t += 1 / 60) {
          const a = initialAnimState('SE');
          a.gestures = [{ ...g, t }];
          const p = skeletonPose(TEST_FIGURE_TEMPLATE, 'front3q', false, a, holding, DEFAULT_MOTION);
          const pts = [p.arms[0].end, p.arms[1].end, p.arms[0].joint, p.arms[1].joint];
          for (const q of pts) { expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true); }
          // zápěstí ≤ 3 j./tick (≈ 2,4 m/s), loket ≤ 3,5 j./tick
          if (prev) pts.forEach((q, i) => expect(Math.hypot(q.x - prev![i].x, q.y - prev![i].y), `${fam} ruka ${hand} t=${t.toFixed(2)}`).toBeLessThan((i < 2 ? 3 : 3.5) * (fam === 'throw' ? 4 : 1))); // hod je záměrně rychlý (zadání B04: nápřah ~0,2 s)
          if (prev) expect(Math.abs(p.headTilt - prevHead) * 60 * 180 / Math.PI, `${fam} hlava`).toBeLessThan(70); // °/s
          prev = pts; prevHead = p.headTilt;
        }
      }
    }
  });
  it('hlava ±8°, trup ±4° v součtu vrstev', () => {
    for (const fam of fams) for (let u = 0; u <= 1; u += 0.02) {
      const o = evalGesture({ fam, t: u * CLIP_T[fam].T[2], dur: CLIP_T[fam].T[2], amp: 1.15, sgn: 1, hand: 0 });
      expect(Math.abs(o.headDeg)).toBeLessThanOrEqual(8); expect(Math.abs(o.trunkDeg)).toBeLessThanOrEqual(4);
    }
  });
});
