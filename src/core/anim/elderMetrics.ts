/**
 * Měření chůze seniorů ze simulace (kontrolní skript i testy): délka kroku, kadence, rychlost při
 * ustálené chůzi; u hole počet došlapů na cyklus, prokluz hrotu během opory (px ve scéně),
 * vzdálenost zápěstí od rukojeti a stálost délky hole.
 */
import type { Simulation } from '../sim/simulation';
import { characterVisual, localToScene, gaitContextFor } from '../render/characterPose';
import { LEG_PHYS_M, gaitEvents } from './gaitProfile';
import { ELDER_PROFILES, elderStepM, elderCadence } from './elderGait';

export interface ElderReport {
  id: string; profile: string;
  stepM: number; cadence: number; speed: number; targetStepM: number; targetCadence: number; cycles: number;
  /** začátek a délka jednoho ustáleného cyklu (pro snímky) */ cycleStart: number; cycleDur: number;
  cane?: { plantsPerCycle: number; maxSlipPx: number; maxHandGap: number; lenM: number; lenConst: boolean };
}

export function measureElders(sim: Simulation, ids: string[], seconds: number, shotMinY = 820): ElderReport[] {
  const project = (sim as unknown as { project: import('../model/types').ProjectFile }).project;
  type Acc = { steps: number; dist: number; time: number; prevPhase: number | null; prevDist: number; steady: boolean; plants0: number | null; plants: number; slip: number; gap: number; lens: number[]; prevTip: { x: number; y: number; key: number } | null; cycleStart: number; cycleDur: number; lastZero: number | null };
  const acc = new Map<string, Acc>(ids.map((id) => [id, { steps: 0, dist: 0, time: 0, prevPhase: null, prevDist: 0, steady: false, plants0: null, plants: 0, slip: 0, gap: 0, lens: [], prevTip: null, cycleStart: 0, cycleDur: 0, lastZero: null }]));
  const n = Math.round(seconds * 60);
  for (let k = 0; k < n; k++) {
    sim.step();
    const t = sim.time();
    for (const id of ids) {
      const a = sim.state.agents.find((q) => q.id === id), A = acc.get(id)!;
      if (!a || a.hidden || !a.anim.elder) { A.prevPhase = null; A.prevTip = null; continue; }
      const e = a.anim.elder, c = sim.characterOf(id)!, m = sim.manifests[c.assetId];
      const L = gaitContextFor(m, c).legLen, toM = LEG_PHYS_M / L;
      const v = a.anim.speedMps ?? 0, vNom = (elderStepM(e) * elderCadence(e)) / 60;
      const steady = a.anim.walkBlend >= 0.999 && !a.anim.settle && !(a.snowDepth && a.snowDepth > 0) && Math.abs(v / vNom - 1) < 0.04 && (a.speedFactor ?? 1) === 1;
      const ph = a.anim.walkPhase, d = a.anim.dist ?? 0;
      if (steady && A.prevPhase !== null && A.steady) {
        A.time += 1 / 60; A.dist += (d - A.prevDist) * toM;
        if (Math.floor(A.prevPhase * 2) !== Math.floor(ph * 2)) A.steps++;
        if (ph < A.prevPhase) { // začátek cyklu
          if (A.lastZero !== null && !A.cycleDur && t - A.lastZero < 3 && a.pos.y > shotMinY) { A.cycleStart = A.lastZero; A.cycleDur = t - A.lastZero; }
          A.lastZero = t;
        }
        A.plants += (e.plants ?? 0) - (A.plants0 ?? e.plants ?? 0);
      } else if (!steady) A.lastZero = null;
      A.plants0 = e.plants ?? 0;
      // hůl: prokluz hrotu během opory, ruka na rukojeti, délka
      if (ELDER_PROFILES[e.p].cane) {
        const cv = characterVisual(a, m, c, project.scene), cn = cv.pose.cane;
        if (cn) {
          const g = { x: cn.grip.x, y: cn.grip.y - 3.2 }, w = cv.pose.arms[cn.hand].end;
          A.gap = Math.max(A.gap, Math.hypot(w.x - g.x, w.y - g.y));
          A.lens.push(cn.len * Q_LOCAL * c.baseScale);
          const lI = 1 - cn.hand, q = (a.anim.walkPhase + lI * 0.5) % 1;
          const planted = steady && e.tip != null && q < gaitEvents(a.anim.gaitW ?? 0).toeOff && cn.tipLift === 0;
          if (planted) {
            const p = localToScene(cv, cn.tip);
            if (A.prevTip && A.prevTip.key === e.tip) A.slip = Math.max(A.slip, Math.hypot(p.x - A.prevTip.x, p.y - A.prevTip.y));
            A.prevTip = { x: p.x, y: p.y, key: e.tip! };
          } else A.prevTip = null;
        }
      }
      A.prevPhase = ph; A.prevDist = d; A.steady = steady;
    }
  }
  return ids.map((id) => {
    const A = acc.get(id)!, a = sim.state.agents.find((q) => q.id === id)!, e = a.anim.elder!;
    const stepM = A.steps ? A.dist / A.steps : 0, cadence = A.time ? (A.steps / A.time) * 60 : 0;
    const r: ElderReport = { id, profile: ELDER_PROFILES[e.p].label, stepM, cadence, speed: (stepM * cadence) / 60, targetStepM: elderStepM(e), targetCadence: elderCadence(e), cycles: A.steps / 2, cycleStart: A.cycleStart, cycleDur: A.cycleDur };
    if (ELDER_PROFILES[e.p].cane) {
      const mn = Math.min(...A.lens), mx = Math.max(...A.lens);
      r.cane = { plantsPerCycle: A.steps ? A.plants / (A.steps / 2) : 0, maxSlipPx: A.slip, maxHandGap: A.gap, lenM: mx, lenConst: mx - mn < 1e-6 * Math.max(1, mx) };
    }
    return r;
  });
}
const Q_LOCAL = 1.75 / 130; // m na jednotku postavy
