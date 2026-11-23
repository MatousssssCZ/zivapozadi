import { approachAngle, clamp, dist, wrapAngle } from '../math/vec';
import type { Direction } from '../anim/manifest';
import type { AgentState, Waypoint } from './types';
import type { NavGraph } from '../nav/navGraph';
import type { Reservations } from './reservations';

export const ACCEL = 75; // jednotek/s²
export const DECEL = 120;
const TURN_RATE = 5.5; // rad/s

export const edgeKey = (edgeId: string) => `edge:${edgeId}`;

/** Směr z úhlu pohledu s hysterezí (bez přeskakování na hranici sektorů). */
export function directionFromAngle(angle: number, current: Direction | null): Direction {
  const dirs: Direction[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const centers: Record<Direction, number> = { E: 0, SE: Math.PI / 4, S: Math.PI / 2, SW: (3 * Math.PI) / 4, W: Math.PI, NW: (-3 * Math.PI) / 4, N: -Math.PI / 2, NE: -Math.PI / 4 };
  if (current && Math.abs(wrapAngle(angle - centers[current])) < Math.PI / 8 + 0.17) return current;
  const idx = ((Math.round(wrapAngle(angle) / (Math.PI / 4)) % 8) + 8) % 8;
  return dirs[idx];
}

function remainingTo(agent: AgentState, wps: Waypoint[], from: number, to: number): number {
  let d = dist(agent.pos, wps[from]);
  for (let k = from; k < to; k++) d += dist(wps[k], wps[k + 1]);
  return d;
}

/**
 * Pohyb po trase: plynulé zrychlení/zpomalení, zpomalení v ostrých zatáčkách, zastavení
 * před obsazeným úzkým průchodem. Poloha vždy leží na úsečkách trasy (nikdy neprochází překážkou).
 */
export function stepMovement(agent: AgentState, g: NavGraph, res: Reservations, dt: number, vmax: number): { arrived: boolean; waitingNarrow: boolean } {
  const r = agent.route;
  if (!r) {
    agent.speed = Math.max(0, agent.speed - DECEL * dt);
    return { arrived: false, waitingNarrow: false };
  }
  const wps = r.wps;
  // Úzké průchody: najdi první neobsazený úsek před námi.
  let effEnd = wps.length - 1;
  for (let k = r.idx - 1; k < wps.length - 1; k++) {
    const e = wps[k + 1].edgeId;
    if (!e || !g.edges.get(e)?.narrow || r.heldEdges.includes(e)) continue;
    const kk = Math.max(k, r.idx - 1);
    const dToK = k < r.idx ? 0 : remainingTo(agent, wps, r.idx, k);
    const brake = (agent.speed * agent.speed) / (2 * DECEL) + 30;
    if (dToK <= brake && res.tryReserve(edgeKey(e), agent.id)) { r.heldEdges.push(e); continue; }
    effEnd = kk;
    break;
  }
  const blockedHere = effEnd === r.idx - 1;
  if (blockedHere) {
    agent.speed = 0;
    return { arrived: false, waitingNarrow: true };
  }
  // Rychlostní profil.
  const dEnd = remainingTo(agent, wps, r.idx, effEnd);
  let target = Math.min(vmax, Math.sqrt(2 * DECEL * dEnd) + 4);
  if (r.idx < effEnd) {
    const a = wps[r.idx], prev = r.idx > 0 ? wps[r.idx - 1] : agent.pos, nx = wps[r.idx + 1];
    const a1 = Math.atan2(a.y - prev.y, a.x - prev.x), a2 = Math.atan2(nx.y - a.y, nx.x - a.x);
    const turn = Math.abs(wrapAngle(a2 - a1));
    const vc = vmax * clamp(1 - turn / 2.4, 0.35, 1);
    target = Math.min(target, Math.sqrt(vc * vc + 2 * DECEL * dist(agent.pos, a)));
  }
  if (agent.speed < target) agent.speed = Math.min(target, agent.speed + ACCEL * dt);
  else agent.speed = Math.max(target, agent.speed - DECEL * dt);

  let move = agent.speed * dt;
  let arrived = false;
  while (move > 0) {
    const wp = wps[r.idx];
    const dx = wp.x - agent.pos.x, dy = wp.y - agent.pos.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 1e-6) {
      const desired = Math.atan2(dy, dx);
      agent.facing = approachAngle(agent.facing, desired, TURN_RATE * dt);
    }
    if (dd > move) { agent.pos = { x: agent.pos.x + (dx / dd) * move, y: agent.pos.y + (dy / dd) * move }; move = 0; break; }
    // Dosažen bod trasy.
    agent.pos = { x: wp.x, y: wp.y }; move -= dd;
    if (wp.edgeId && r.heldEdges.includes(wp.edgeId)) { res.release(edgeKey(wp.edgeId), agent.id); r.heldEdges = r.heldEdges.filter((e) => e !== wp.edgeId); }
    if (wp.nodeId) agent.loc = { kind: 'node', nodeId: wp.nodeId };
    if (r.idx >= wps.length - 1) { arrived = true; break; }
    if (r.idx >= effEnd) { r.idx++; agent.speed = 0; break; } // zastavit před úzkým průchodem
    r.idx++;
  }
  if (arrived) {
    for (const e of r.heldEdges) res.release(edgeKey(e), agent.id);
    agent.route = null; agent.speed = 0; agent.arrived = true;
  }
  return { arrived, waitingNarrow: false };
}

export function turnInPlace(agent: AgentState, target: number, dt: number): void {
  agent.facing = approachAngle(agent.facing, target, TURN_RATE * 0.6 * dt);
}
