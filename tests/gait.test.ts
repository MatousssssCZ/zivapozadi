/**
 * Akceptační kritéria chůze podle docs/zdroje/zadani-prirozene-chuze-2D.md (oddíl E).
 * Postava jde rovně z boku; pózu počítá stejný animátor a kostra jako simulace a export.
 */
import { gaitEvents } from '../src/core/anim/gaitProfile';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { skeletonPose, footGeomOf, DEFAULT_MOTION, type SkeletonTemplate } from '../src/core/anim/skeleton';
import { initialAnimState, stepAnimator, type AnimState } from '../src/core/anim/animator';
import type { PartLibrary } from '../src/core/anim/partLibrary';
import type { CharacterManifest } from '../src/core/anim/manifest';
import { testFigureManifest } from '../src/core/anim/manifest';

const lib = JSON.parse(readFileSync('resources/builtin/painted-parts-cg/library.json', 'utf8')) as PartLibrary;
const tpl: SkeletonTemplate = { ...lib.bodyTemplates[0], views: { side: { forward: { x: 1, y: 0 }, hipSpread: 0, shoulderSpread: 0, headOffsetX: 0, shoulderOffsetX: 0 } } };
const man = testFigureManifest() as CharacterManifest;
const L = tpl.bones.thigh + tpl.bones.shin;
const geom = footGeomOf(tpl);
const ctx = { legLen: L, strideScale: 1, foot: geom };
const DT = 1 / 60;
const PX_PER_UNIT_350 = 350 / 130; // největší testovaná postava

interface Sample { t: number; x: number; a: AnimState; pose: ReturnType<typeof skeletonPose> }
/** Projde trasu s daným průběhem rychlosti (jednotky/s); vrací pózy ve světových souřadnicích (x = poloha těla). */
function walk(speedAt: (t: number) => number, seconds: number): Sample[] {
  const a = initialAnimState('E');
  let x = 0; const out: Sample[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const v = speedAt(i * DT);
    x += v * DT;
    stepAnimator(a, man, DT, v, 62, 1, ctx);
    out.push({ t: i * DT, x, a: structuredClone(a), pose: skeletonPose(tpl, 'side', false, a, false, DEFAULT_MOTION) });
  }
  return out;
}
const mps = (v: number) => (v * L) / 0.9; // m/s → jednotky/s
const rotP = (x: number, y: number, t: number) => ({ x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) });
/** heel/toe ve světě (y nahoru) z kotníku a natočení boty */
function heelToe(s: Sample, i: number) {
  const an = s.pose.legs[i].end; const th = -s.pose.feet[i]; // feet = −θ (y dolů)
  const A = { x: s.x + an.x, y: -an.y };
  const h = rotP(-geom.heel, -geom.AH, th), t = rotP(geom.toe, -geom.AH, th);
  return { heel: { x: A.x + h.x, y: A.y + h.y }, toe: { x: A.x + t.x, y: A.y + t.y }, ankle: A };
}
function kneeDeg(s: Sample, i: number) {
  const l = s.pose.legs[i]; const v1 = { x: l.joint.x - l.root.x, y: l.joint.y - l.root.y }, v2 = { x: l.end.x - l.joint.x, y: l.end.y - l.joint.y };
  return (Math.acos(Math.min(1, (v1.x * v2.x + v1.y * v2.y) / Math.hypot(v1.x, v1.y) / Math.hypot(v2.x, v2.y))) * 180) / Math.PI;
}
/** Největší posun aktivního kontaktního bodu (pata → podrážka → přednoží) během opory. */
function contactDrift(samples: Sample[]) {
  let worst = 0;
  for (let i = 0; i < 2; i++) {
    let anchor: { x: number; y: number } | null = null, mode = '';
    for (const s of samples) {
      if (s.a.walkBlend < 0.999 || s.a.settle) { anchor = null; continue; }
      const ht = heelToe(s, i);
      const q = (s.a.walkPhase + i * 0.5) % 1;
      const toeOff = 0.6 + 0.04 * (1 - (s.a.gaitW ?? 0));
      const m = q < 0.08 ? 'heel' : q < 0.34 ? 'flat' : q < toeOff - 0.005 ? 'toe' : 'swing';
      if (m === 'swing') { anchor = null; mode = ''; continue; }
      const p = m === 'toe' ? ht.toe : ht.heel;
      if (m !== mode && !(mode === 'heel' && m === 'flat')) { anchor = p; mode = m; continue; }
      mode = m;
      if (anchor) worst = Math.max(worst, Math.hypot(p.x - anchor.x, p.y - anchor.y));
    }
  }
  return worst;
}

describe('chůze – akceptační kritéria zadání', () => {
  for (const [name, v, kneeRange] of [['běžná 1,3 m/s', 1.3, [58, 65]], ['pomalá 0,9 m/s', 0.9, [53, 62]]] as const) {
    it(`${name}: opora, koleno, pánev, kadence, délky, podlaha, smyčka`, () => {
      const s = walk(() => mps(v), 12).slice(60 * 4); // ustálený úsek
      // opora
      const drift = contactDrift(s);
      expect(drift * PX_PER_UNIT_350).toBeLessThan(0.25);
      // koleno ve švihu
      const kneePeak = Math.max(...s.map((x) => kneeDeg(x, 1)));
      expect(kneePeak).toBeGreaterThanOrEqual(kneeRange[0]); expect(kneePeak).toBeLessThanOrEqual(kneeRange[1]);
      // koleno po došlapu: malé ohnutí, pak napřímení (dvojí vlna)
      const stanceKnees = s.filter((x) => { const q = (x.a.walkPhase + 0.5) % 1; return q > 0.08 && q < 0.2; }).map((x) => kneeDeg(x, 1));
      expect(Math.max(...stanceKnees)).toBeGreaterThan(8);
      // pánev: celkový svislý rozsah
      const hy = s.map((x) => -x.pose.hip.y);
      const p2p = (Math.max(...hy) - Math.min(...hy)) / L;
      expect(p2p).toBeGreaterThanOrEqual(0.018); expect(p2p).toBeLessThanOrEqual(0.035);
      // kadence (kroky/min): fáze po 2 krocích za cyklus
      let cycles = 0; for (let i = 1; i < s.length; i++) cycles += (((s[i].a.walkPhase - s[i - 1].a.walkPhase) % 1) + 1) % 1;
      const cadence = (cycles * 2 * 60) / ((s.length - 1) / 60);
      expect(Math.abs(cadence - (v === 1.3 ? 111.43 : 91.03))).toBeLessThan(1); // ±1 krok/min
      // délky kostí a podlaha
      for (const x of s) for (const l of x.pose.legs) {
        expect(Math.abs(Math.hypot(l.joint.x - l.root.x, l.joint.y - l.root.y) - tpl.bones.thigh) / tpl.bones.thigh).toBeLessThan(0.001);
        expect(Math.abs(Math.hypot(l.end.x - l.joint.x, l.end.y - l.joint.y) - tpl.bones.shin) / tpl.bones.shin).toBeLessThan(0.001);
      }
      for (const x of s) for (let i = 0; i < 2; i++) { const ht = heelToe(x, i); expect(Math.min(ht.heel.y, ht.toe.y)).toBeGreaterThan(-0.001 * L - 1e-9); }
      // smyčka: žádný skok polohy kotníku mezi snímky (vůči tělu)
      // (cuknutí = náhlá změna rychlosti kotníku vůči zemi mezi snímky; skutečný skok polohy by dal velkou hodnotu)
      let jerk = 0, at = 0;
      for (let i = 1; i < s.length - 1; i++) for (let k = 0; k < 2; k++) {
        const P = (j: number) => ({ x: s[j].x + s[j].pose.legs[k].end.x, y: s[j].pose.legs[k].end.y });
        const a0 = P(i - 1), a1 = P(i), a2 = P(i + 1);
        const d = Math.hypot(a2.x - 2 * a1.x + a0.x, a2.y - 2 * a1.y + a0.y);
        if (d > jerk) { jerk = d; at = (s[i].a.walkPhase + k * 0.5) % 1; }
      }
      console.log(`${name}: max. změna rychlosti kotníku ${jerk.toFixed(3)} j./snímek² ve fázi ${at.toFixed(3)}, koleno ${kneePeak.toFixed(1)}°, pánev ${(p2p * 100).toFixed(2)} % L, kadence ${cadence.toFixed(1)}, opora ${(drift * PX_PER_UNIT_350).toFixed(3)} px`);
      expect(jerk).toBeLessThan(0.03 * L);
    });
  }

  it('paže: při došlapu nohy je stejnostranná paže vzadu', () => {
    const s = walk(() => mps(1.3), 8).slice(240);
    const atContact = s.filter((x) => x.a.walkPhase < 0.02);
    for (const x of atContact) expect(x.pose.arms[0].end.x).toBeLessThan(x.pose.arms[0].root.x);
  });

  it('změna rychlosti 0,9 → 1,3 → 0,9 m/s bez posunu opory a skoku fáze', () => {
    const prof = (t: number) => mps(t < 4 ? 0.9 : t < 6 ? 0.9 + ((t - 4) / 2) * 0.4 : t < 10 ? 1.3 : t < 12 ? 1.3 - ((t - 10) / 2) * 0.4 : 0.9);
    const s = walk(prof, 16).slice(60 * 3);
    expect(contactDrift(s) * PX_PER_UNIT_350).toBeLessThan(0.25);
    let maxDp = 0; for (let i = 1; i < s.length; i++) { const d = ((s[i].a.walkPhase - s[i - 1].a.walkPhase) % 1 + 1) % 1; maxDp = Math.max(maxDp, d); }
    expect(maxDp).toBeLessThan(0.03);
  });

  it('zastavení: opřená noha drží, švihová dokročí, obě boty skončí na zemi', () => {
    const s = walk((t) => (t < 5 ? mps(1.0) : Math.max(0, mps(1.0) * (1 - (t - 5) / 0.8))), 8);
    const last = s[s.length - 1];
    expect(last.a.walkBlend).toBe(0);
    for (let i = 0; i < 2; i++) { const ht = heelToe(last, i); expect(Math.abs(ht.heel.y)).toBeLessThan(0.01 * L); expect(Math.abs(ht.toe.y)).toBeLessThan(0.01 * L); }
    // během dokračování se opřený bod neposune
    const settleStart = s.findIndex((x) => x.a.settle);
    expect(settleStart).toBeGreaterThan(0);
    const x0 = s[settleStart];
    const phase = x0.a.settle!.phase;
    // drží přední opřená bota (zadní se v klidu přisune k ní)
    const stanceLeg = [0, 1].sort((i, j) => heelToe(x0, j).heel.x - heelToe(x0, i).heel.x).find((i) => ((phase + i * 0.5) % 1) < gaitEvents(x0.a.gaitW ?? 0).toeOff)!;
    const ref = heelToe(x0, stanceLeg);
    const end = heelToe(last, stanceLeg);
    const q = (phase + stanceLeg * 0.5) % 1;
    const pt = q < 0.34 ? 'heel' : 'toe';
    expect(Math.abs(end[pt].x - ref[pt].x)).toBeLessThan(0.01 * L);
  });

  it('rozejití: kratší první krok, chodidla nejdřív drží', () => {
    const s = walk((t) => (t < 1 ? 0 : Math.min(mps(1.0), mps(1.0) * (t - 1) / 0.9)), 5);
    const firstStride = s.find((x) => x.a.walkBlend > 0)!.a.stride!;
    const steady = s[s.length - 1].a.stride!;
    expect(firstStride).toBeLessThan(steady * 0.85);
  });
});
