/**
 * Společné činnosti více účastníků (balíček „živá pozadí“, 02 §1–2).
 *
 * Session drží fázi, termíny a vlastní RNG; účastníci jen vykonávají, co session určí. Vše, co
 * session potřebuje (účastníky `actor:<id>`, pracovní místa, prostor zóny), se rezervuje atomicky
 * jednou transakcí – buď všechno, nebo nic. Ukončení (i opakované) uvolní přesně to, co session
 * vlastnila. Stav je čistý JSON (checkpoint).
 */
import type { ActivitySession, SimState } from './types';
import type { Reservations } from './reservations';
import { seedRng } from '../math/rng';

export const ownerOf = (s: Pick<ActivitySession, 'id'>) => `session:${s.id}`;
export const actorKey = (agentId: string) => `actor:${agentId}`;

/** Vytvoří session, pokud lze atomicky rezervovat účastníky i klíče; jinak null beze změny stavu. */
export function createSession(st: SimState, res: Reservations, init: {
  type: string; zoneId: string; participantIds: string[]; roles: Record<string, string>;
  keys: string[]; now: number; deadline: number; seed: number; phase: string; data?: Record<string, unknown>;
}): ActivitySession | null {
  const id = `ses${st.nextSessionId ?? 1}`;
  const keys = [...init.participantIds.map(actorKey), ...init.keys];
  if (!res.tryReserveMany(keys, `session:${id}`)) return null;
  st.nextSessionId = (st.nextSessionId ?? 1) + 1;
  const s: ActivitySession = {
    id, type: init.type, zoneId: init.zoneId, participantIds: [...init.participantIds].sort(), roles: { ...init.roles },
    phase: init.phase, phaseStart: init.now, deadline: init.deadline, rng: seedRng(init.seed, id), ownedKeys: [...new Set(keys)].sort(), data: init.data ?? {},
  };
  (st.sessions ??= []).push(s);
  return s;
}

/** Ukončí session a uvolní všechny její rezervace. Bezpečné i opakovaně. */
export function endSession(st: SimState, res: Reservations, id: string): void {
  const s = st.sessions?.find((x) => x.id === id);
  res.releaseMatching((k) => st.reservations[k] === `session:${id}`);
  if (s) st.sessions = st.sessions!.filter((x) => x !== s);
}

export function sessionOf(st: SimState, agentId: string): ActivitySession | undefined {
  return st.sessions?.find((s) => s.participantIds.includes(agentId));
}

export function setSessionPhase(s: ActivitySession, phase: string, now: number): void { s.phase = phase; s.phaseStart = now; }
