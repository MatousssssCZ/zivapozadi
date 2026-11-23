import type { Vec2 } from '../math/vec';
import type { RngState } from '../math/rng';
import type { AnimState } from '../anim/animator';

export const SIM_STATE_VERSION = 1;
export const SIM_DT = 1 / 60;
export const STEPS_PER_SECOND = 60;

export interface Waypoint { x: number; y: number; nodeId: string | null; edgeId: string | null }

/** Kde postava stojí: v uzlu sítě, nebo v bodě mimo síť napojeném na uzel (`anchor`). */
export type AgentLocation = { kind: 'node'; nodeId: string } | { kind: 'point'; anchor: string; pointKey: string | null };

export interface RouteState {
  wps: Waypoint[];
  idx: number;
  /** Úzká spojení, která má postava rezervovaná (edgeId). */
  heldEdges: string[];
  /** Cíl pohybu pro logiku (k čemu postava jde). */
  purpose: string;
  /** Poloha po dosažení cíle (bod mimo síť), nebo null = poslední uzel. */
  dest: AgentLocation | null;
}

export interface ActivityRun {
  type: string;
  zoneId: string;
  source: 'auto' | 'schedule' | 'stop';
  sourceId: string | null;
  phase: string;
  phaseStart: number;
  /** Data konkrétní činnosti (čistý JSON). */
  data: Record<string, unknown>;
}

export interface AgentState {
  id: string;
  name: string;
  rng: RngState;
  pos: Vec2;
  facing: number;
  speed: number;
  pace: number;
  lane: number;
  loc: AgentLocation;
  route: RouteState | null;
  /** Postava právě dorazila na konec trasy (zpracuje rozhodování / činnost). */
  arrived: boolean;
  /** Požadovaný směr pohledu v klidu (radiány), nebo bod pohledu. */
  look: { angle: number } | { x: number; y: number } | null;
  anim: AnimState;
  holding: string | null;
  activity: ActivityRun | null;
  /** Činnost čekající na spuštění (až postava dojde do uzlu – bez teleportu). */
  pendingActivity: { type: string; zoneId: string | null; source: ActivityRun['source']; sourceId: string | null } | null;
  wander: { waitUntil: number; prevNode: string | null; atStop: boolean };
  cooldowns: Record<string, number>;
  /** Násobek rychlosti chůze nastavený přes rozhraní postavy (výchozí 1). */
  speedFactor?: number;
  /** Srozumitelný popis, na co postava čeká (pro panel vlastností). */
  status: string;
}

export type PropKind = 'cup';
export type PropPlace =
  | { kind: 'counter'; objectId: string; x: number; y: number }
  | { kind: 'held'; agentId: string }
  | { kind: 'falling'; from: Vec2; to: Vec2; t0: number; t1: number; binId: string }
  | { kind: 'inBin'; objectId: string }
  | { kind: 'ground'; x: number; y: number };

export interface PropState { id: string; kind: PropKind; place: PropPlace; appearedAt: number; sips: number }

export interface ScheduleRuntime { status: 'pending' | 'waiting' | 'started' | 'skipped' | 'conflict'; waitingSince?: number; nextTry?: number; agentId?: string }

export interface LogEntry { t: number; level: 'info' | 'warn'; msg: string; agentId?: string }

export interface SimState {
  version: number;
  step: number;
  rng: RngState;
  agents: AgentState[];
  props: PropState[];
  nextPropId: number;
  /** Rezervace: klíč zdroje → ID vlastníka. */
  reservations: Record<string, string>;
  /** Fronty (FIFO) na obslužná místa: klíč → seznam ID postav. */
  queues: Record<string, string[]>;
  schedule: Record<string, ScheduleRuntime>;
  removedObjects: string[];
  binCounts: Record<string, number>;
  log: LogEntry[];
  stats: { cupsServed: number; cupsDisposed: number; sips: number };
}
