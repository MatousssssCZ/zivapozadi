/**
 * A08 – Stavba sněhové pevnosti (dvě děti). Role: jedno nabírá a nosí, druhé pokládá a uhlazuje,
 * v polovině si role vymění. Cyklus (6–12 s): dřep u místa odběru, shrnutí sněhu a sevření hroudy
 * (hrouda roste v dlaních, ne naráz) → nesení oběma rukama před tělem kratším krokem → klek u zdi,
 * položení na konkrétní místo, přitlačení a uhlazení → návrat. Zeď roste po jednotlivých hroudách
 * (každá má svou polohu a vrstvu – žádné globální zvětšování), v místě odběru vzniká prohlubeň
 * (objem odebraného ≈ objem ve zdi × zhutnění). Hotová zeď zůstane; další epizoda přidá vrstvu.
 */
import type { World } from '../../scene/camera';
import type { AgentState } from '../types';
import { registerEpisode, W, S, type ActorHost, type EpisodeConfig, type EpisodeState, type Step } from '../episodes';

export const FORT = { len: 1.6, slots: 6, layers: 3, block: { w: 0.27, h: 0.16, d: 0.22 }, compact: 1.35 } as const;
export interface Block { slot: number; layer: number; t0: number; jit: number }
export interface FortWorld { blocks: Block[]; dug: number }
export const fortWorld = (st: EpisodeState) => ((st.world.fort ??= { blocks: [], dug: 0 }) as FortWorld);
interface D { clump?: { who: number; r: number; dug?: boolean } | null; plan?: { slot: number; layer: number; carrier: number }[] }
/** střed místa ve zdi (svět) */
export function slotWorld(h: ActorHost, c: EpisodeConfig, slot: number): World { const A = W(h, c.pts.wall); return { X: A.X + (slot - (FORT.slots - 1) / 2) * (FORT.len / FORT.slots), Z: A.Z }; }
export const blockVol = () => FORT.block.w * FORT.block.h * FORT.block.d;

function plan(c: EpisodeConfig, st: EpisodeState, A: AgentState[], h: ActorHost): Step[] {
  const d = st.data as D, F = fortWorld(st);
  if (!d.plan) {
    const layer = Math.min(FORT.layers, Math.max(0, ...F.blocks.map((b) => b.layer + 1)));
    const n = layer >= FORT.layers ? 0 : FORT.slots;
    d.plan = Array.from({ length: n }, (_, i) => ({ slot: i % 2 ? FORT.slots - 1 - Math.floor(i / 2) : Math.floor(i / 2), layer, carrier: i < n / 2 ? 0 : 1 }));
  }
  const dig = W(h, c.pts.dig), at = (w: World, dx: number, dz: number) => S(h, { X: w.X + dx, Z: w.Z + dz });
  const steps: Step[] = [
    { k: 'enter', who: [0, 1], at: ['in', 'in2'] },
    { k: 'walk', label: 'děti jdou na sníh, rozdělí si role', moves: [{ who: 0, to: [at(dig, 0, -0.35)], sp: 0.6 }, { who: 1, to: [at(slotWorld(h, c, 2), 0.1, -0.55)], sp: 0.6 }] },
  ];
  if (!d.plan.length) steps.push({ k: 'do', dur: 4, label: 'prohlížejí hotovou pevnost', tick: () => { for (const a of A) h.face(a, S(h, slotWorld(h, c, 2), 0.3)); } });
  for (const [j, it] of d.plan.entries()) {
    const ci = it.carrier, bi = 1 - ci, C = () => A[ci], B = () => A[bi], sw = slotWorld(h, c, it.slot);
    if (j === Math.floor(d.plan.length / 2)) steps.push({ k: 'do', dur: 1.5, label: 'vymění si role', tick: (el) => { if (el < h.dt * 1.5) h.gesture(A[0], 'point', 1.2); } });
    steps.push(
      { k: 'walk', label: 'jde k místu odběru', moves: [{ who: ci, to: [at(dig, 0.05 * (j % 3 - 1), -0.35)], sp: 0.55 }] },
      // nabírání: dřep, ruce shrnují sníh a svírají hroudu (roste postupně)
      { k: 'do', dur: 3.0, label: 'nabírá sníh a tvoří hroudu', tick: (el) => {
        h.face(C(), S(h, dig)); h.pose(C(), 'squat', Math.min(1, el / 0.6, (3.0 - el) / 0.5), el, 0.12);
        const r = 0.05 + 0.07 * Math.min(1, el / 2.4), was = d.clump?.who === ci ? d.clump.dug : false; d.clump = { who: ci, r, dug: was };
        if (el > 2.4 && !d.clump.dug) { F.dug += blockVol() * FORT.compact; d.clump.dug = true; } // odebraný objem (sypký sníh se při tvarování zhutní)
      } },
      { k: 'call', fn: () => h.hands(C(), [{ u: 0.3, h: 0.72, lat: -0.12 }, { u: 0.32, h: 0.74, lat: 0.12 }]) },
      { k: 'walk', label: 'nese hroudu ke zdi', moves: [{ who: ci, to: [at(sw, 0.02, -0.5)], sp: 0.42 }, { who: bi, to: [at(sw, 0.42, -0.45)], sp: 0.5 }] },
      // položení: klek / přidřep u zdi, hrouda dosedne na své místo, přitlačení, druhé dítě uhlazuje
      { k: 'do', dur: 3.2, label: 'pokládá hroudu, druhé uhlazuje', tick: (el) => {
        h.face(C(), S(h, sw, 0.2)); h.face(B(), S(h, sw, 0.2));
        const w = Math.min(1, el / 0.7, (3.2 - el) / 0.5);
        h.hands(C(), null); h.pose(C(), 'lift', w * (0.55 + 0.25 * it.layer / FORT.layers), el);
        if (el > 1.0 && d.clump) { F.blocks.push({ slot: it.slot, layer: it.layer, t0: h.time(), jit: ((it.slot * 7 + it.layer * 3) % 5) / 5 }); d.clump = null; }
        h.pose(B(), 'squat', el > 1.2 ? Math.min(1, (el - 1.2) / 0.6, (3.2 - el) / 0.5) : 0, el, 0.2);
      } },
    );
  }
  steps.push(
    { k: 'walk', label: 'ustoupí a prohlédnou zeď', moves: [{ who: 0, to: [at(slotWorld(h, c, 1), -0.2, -1.4)], sp: 0.5 }, { who: 1, to: [at(slotWorld(h, c, 4), 0.2, -1.3)], sp: 0.5 }] },
    { k: 'do', dur: 3.5, label: 'prohlížejí pevnost', tick: (el) => { for (const a of A) h.face(a, S(h, slotWorld(h, c, 2), 0.3)); if (el < h.dt * 1.5) h.gesture(A[1], 'point', 1.8); } },
    { k: 'exit', moves: [{ who: 0, to: [c.pts.out], sp: 0.65 }, { who: 1, to: [c.pts.out2], sp: 0.65 }] },
  );
  return steps;
}
function tick(_c: EpisodeConfig, st: EpisodeState, A: AgentState[]) {
  const d = st.data as D; if (st.phase !== 'run') return;
  if (d.clump && !A[d.clump.who].hidden && A[d.clump.who].route) A[d.clump.who].status = 'Nese hroudu sněhu';
}
registerEpisode('fort', plan, tick);
export const fortData = (st: EpisodeState) => st.data as D;
