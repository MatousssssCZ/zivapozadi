/**
 * Průběh jednoho pádu v simulaci (kontrolní skript i testy): pořadí fází, počet otisků, spojitost
 * polohy pánve ve scéně (největší posun za krok), pomocník, návrat k chůzi.
 */
import type { Simulation } from './simulation';
import { characterVisual, localToScene } from '../render/characterPose';
import { fallPhaseAt, type FallVariant } from '../anim/fallPoses';

export interface FallCheck { name: string; phases: string[]; marks: number; maxHipJumpPx: number; /** totéž v jednotkách postavy (nezávislé na vzdálenosti od kamery) */ maxHipJumpU: number; /** největší změna rychlosti pánve mezi kroky (j./krok) – skok v póze je velká změna */ maxHipJerkU: number; helper: string | null; helped: boolean; walksAfter: boolean; duration: number }

export function runFallCheck(sim: Simulation, v: FallVariant, s: 1 | -1, at: number, helper: boolean): FallCheck {
  const project = (sim as unknown as { project: import('../model/types').ProjectFile }).project;
  sim.advanceTo(at);
  const name = sim.triggerFall(v, s, { helper, preferSnow: true });
  const a = sim.state.agents.find((q) => q.name === name);
  if (!a) return { name, phases: [], marks: 0, maxHipJumpPx: 0, maxHipJumpU: 0, maxHipJerkU: 0, helper: null, helped: false, walksAfter: false, duration: 0 };
  const c = sim.characterOf(a.id)!, m = sim.manifests[c.assetId];
  const marks0 = sim.state.falls?.marks.length ?? 0, helped0 = sim.state.falls?.stats.helped ?? 0;
  const ev = sim.state.falls!.active[0], helperId = ev?.helperId ?? null;
  const phases: string[] = [];
  let prev: { x: number; y: number } | null = null, jump = 0, jumpU = 0, jerk = 0, pv: { x: number; y: number } | null = null, steps = 0, t0 = sim.time();
  while (a.anim.fall && steps < 60 * 30) {
    sim.step(); steps++;
    const cv = characterVisual(a, m, c, project.scene), hp = localToScene(cv, cv.pose.hip);
    if (prev) { const dd = Math.hypot(hp.x - prev.x, hp.y - prev.y); jump = Math.max(jump, dd); jumpU = Math.max(jumpU, dd / cv.scale); const v = { x: (hp.x - prev.x) / cv.scale, y: (hp.y - prev.y) / cv.scale }; if (pv) jerk = Math.max(jerk, Math.hypot(v.x - pv.x, v.y - pv.y)); pv = v; }
    prev = hp;
    if (a.anim.fall) { const ph = fallPhaseAt(v, a.anim.fall.t); if (phases[phases.length - 1] !== ph) phases.push(ph); }
  }
  const dur = sim.time() - t0;
  // po skončení: ještě 3 s – pánev bez skoku, postava se znovu rozejde
  let moved = 0;
  const p0 = { ...a.pos };
  for (let k = 0; k < 180; k++) {
    sim.step();
    const cv = characterVisual(a, m, c, project.scene), hp = localToScene(cv, cv.pose.hip);
    if (prev && k < 2) { const dd = Math.hypot(hp.x - prev.x, hp.y - prev.y); jump = Math.max(jump, dd); jumpU = Math.max(jumpU, dd / cv.scale); }
    prev = hp;
  }
  moved = Math.hypot(a.pos.x - p0.x, a.pos.y - p0.y);
  return { name, phases, marks: (sim.state.falls?.marks.length ?? 0) - marks0, maxHipJumpPx: jump, maxHipJumpU: jumpU, maxHipJerkU: jerk, helper: helperId ? sim.state.agents.find((q) => q.id === helperId)?.name ?? helperId : null, helped: (sim.state.falls?.stats.helped ?? 0) > helped0, walksAfter: moved > 5 || !a.route, duration: dur };
}
