/**
 * Průběh stavby sněhuláka rodičem a dítětem (kontrolní skript i testy): souběžnost úkolů, pořadí
 * milníků, rozměry koulí, bilance hmoty, odstup dítěte při zvedání, kontakt při předání, dosah dítěte.
 */
import type { Simulation } from '../sim/simulation';
import { toWorld, cameraFor } from '../scene/camera';
import { coopMassBalance, COOP_DIAM, CHILD_REACH, type CoopData } from './coopSnowman';
import type { ActivitySession } from '../sim/types';

export interface CoopReport {
  ok: boolean; msg: string; parent: string; child: string; duration: number;
  milestones: Record<string, number>; order: string[];
  diam: number[]; diamTarget: number[];
  /** největší |ubráno − (koule + spoj + v náručí)| během stavby (kg) */ maxMassErr: number; removed: number;
  /** doba, kdy oba dělali různé úkoly zároveň (s) */ concurrentSec: number; concurrentPairs: string[];
  /** nejmenší vzdálenost dítěte od dráhy zvedání (koule → stavba) během zvedání prostřední koule (m) */ minClearLift: number;
  /** vzdálenost postav v okamžiku kontaktu při předání (m), nebo null (hlava položena) */ handoverDist: number | null; handoverStages: string[];
  /** ozdoby: kdo co dal a v jaké výšce */ decorations: { kind: string; by: string; h: number }[];
  childAboveReach: number; session: ActivitySession | null; frames: { t: number; label: string }[];
}

export function runCoopCheck(sim: Simulation, opts: { at?: number; maxSec?: number; onStep?: (s: ActivitySession) => void } = {}): CoopReport {
  const project = (sim as unknown as { project: import('../model/types').ProjectFile }).project, cam = cameraFor(project.scene);
  sim.advanceTo(opts.at ?? 8);
  let s = sim.state.sessions?.find((x) => (x.data as { coop?: boolean }).coop) ?? null;
  let msg = 'běží režisérem scény';
  if (!s) { const r = sim.startCoopSnowmanNow(); msg = r.msg; s = sim.state.sessions?.find((x) => (x.data as { coop?: boolean }).coop) ?? null; }
  const empty: CoopReport = { ok: false, msg, parent: '', child: '', duration: 0, milestones: {}, order: [], diam: [], diamTarget: COOP_DIAM, maxMassErr: 0, removed: 0, concurrentSec: 0, concurrentPairs: [], minClearLift: Infinity, handoverDist: null, handoverStages: [], decorations: [], childAboveReach: 0, session: null, frames: [] };
  if (!s) return empty;
  const d = s.data as unknown as CoopData, t0 = sim.time();
  const P = sim.state.agents.find((a) => a.id === d.parent)!, C = sim.state.agents.find((a) => a.id === d.child)!;
  let maxErr = 0, conc = 0, minClear = Infinity, hoDist: number | null = null;
  const pairs = new Set<string>(), stages: string[] = [], frames: { t: number; label: string }[] = [];
  const seenTask: Record<string, string> = {};
  const W = (p: { x: number; y: number }) => toWorld(cam, p);
  const segDist = (Q: { X: number; Z: number }, A: { X: number; Z: number }, B: { X: number; Z: number }) => { const ab = { X: B.X - A.X, Z: B.Z - A.Z }, L2 = ab.X * ab.X + ab.Z * ab.Z || 1, t = Math.max(0, Math.min(1, ((Q.X - A.X) * ab.X + (Q.Z - A.Z) * ab.Z) / L2)); return Math.hypot(Q.X - A.X - ab.X * t, Q.Z - A.Z - ab.Z * t); };
  const decBy: { kind: string; by: string; h: number }[] = [];
  const maxSteps = Math.round((opts.maxSec ?? 420) * 60);
  for (let i = 0; i < maxSteps && sim.state.sessions?.some((x) => x.id === s!.id); i++) {
    sim.step();
    opts.onStep?.(s);
    const b = coopMassBalance(sim.state, s);
    maxErr = Math.max(maxErr, Math.abs(b.removed - (b.inBalls + b.joint + b.carried)));
    const tp = d.task[P.id], tc = d.task[C.id];
    const busy = (t: { name: string; step: string }) => !['go', 'keepClear', 'waitHead', 'admire'].includes(t.name) && !(t.name === 'help' && t.step === 'watch');
    if (busy(tp) && busy(tc) && tp.name !== tc.name) { conc += 1 / 60; pairs.add(`${tp.name} × ${tc.name}`); }
    // odstup dítěte při zvedání prostřední koule (prostor zvedání rezervuje rodič)
    if (tp.name === 'liftMiddle' && ['grip', 'raise', 'carry', 'place'].includes(tp.step)) {
      const so = sim.state.runtimeObjects?.find((o) => o.id === d.objId), ball = d.balls.find((x) => x.k === 1);
      if (so && ball) minClear = Math.min(minClear, segDist(W(C.pos), { X: ball.X, Z: ball.Z }, W({ x: so.x, y: so.y })));
    }
    if (d.handover && stages[stages.length - 1] !== d.handover.stage) {
      stages.push(d.handover.stage);
      if (d.handover.stage === 'contact') { const A = W(P.pos), B = W(C.pos); hoDist = Math.hypot(A.X - B.X, A.Z - B.Z); }
    }
    for (const [id, t] of [[P.id, tp], [C.id, tc]] as const) {
      const key = `${t.name}/${t.step}`;
      if (seenTask[id] !== key) {
        if (t.name === 'decorate' && t.step === 'release' && t.item !== undefined) { const it = d.basket.items[t.item]; decBy.push({ kind: it.kind, by: id === P.id ? 'rodič' : 'dítě', h: it.h }); }
        const lab = ({ 'rollBase/push': 'rodič válí spodní kouli', 'makeHead/push': 'dítě válí hlavu', 'rollMiddle/push': 'rodič válí prostřední', 'liftMiddle/carry': 'rodič nese prostřední', 'liftMiddle/place': 'pokládá prostřední', 'help/joint': 'dítě vyplňuje spoj', 'handover/carry': 'dítě nese hlavu', 'handover/contact': 'předání hlavy', 'liftHead/place': 'rodič nasazuje hlavu', 'decorate/attach': 'zdobení', 'admire/react': 'radost' } as Record<string, string>)[key];
        if (lab && !frames.some((f) => f.label === lab)) frames.push({ t: sim.time() + 0.4, label: lab });
        seenTask[id] = key;
      }
    }
  }
  const order = Object.entries(d.done).filter(([k]) => ['basePlaced', 'middlePlaced', 'jointFilled', 'headPlaced', 'decorated', 'left'].includes(k)).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const so = sim.state.runtimeObjects?.find((o) => o.id === d.objId);
  const bal = coopMassBalance(sim.state, s);
  return {
    ok: !!d.done.left, msg, parent: P.name, child: C.name, duration: sim.time() - t0, milestones: d.done, order,
    diam: (so?.radii ?? []).map((r) => r * 2), diamTarget: COOP_DIAM, maxMassErr: maxErr, removed: bal.removed,
    concurrentSec: conc, concurrentPairs: [...pairs], minClearLift: minClear, handoverDist: hoDist, handoverStages: stages,
    decorations: decBy, childAboveReach: decBy.filter((x) => x.by === 'dítě' && x.h > CHILD_REACH).length, session: s, frames,
  };
}
