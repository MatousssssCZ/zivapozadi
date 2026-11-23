import type { Vec2 } from '../math/vec';
import type { RngState } from '../math/rng';
import type { AnimState } from '../anim/animator';

export const SIM_STATE_VERSION = 2;
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

export type VisitMode = 'offstage' | 'choose' | 'leave' | 'coffee' | 'meet-go' | 'meet-wait' | 'greet' | 'with';
export interface VisitState {
  mode: VisitMode;
  until: number;
  /** Uzel, kam návštěvník odchází (vstup/výstup), nebo kde se setkává. */
  target?: string | null;
  friendId?: string | null;
  /** Kdo z dvojice přátel vede (jde na kávu, ostatní ho následují). */
  lead?: boolean;
  since?: number;
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
  /** Vizuální posun od polohy na trase (px scény) – vyhýbání, pruhy; pohání i nohy (žádné klouzání). */
  off?: Vec2;
  /** Příčná rychlost posunu (px/s) – plynulé vyhýbání. */
  offLatV?: number;
  /** Rozpracovaný úkrok stranou v klidu (cílový posun, fyzické souřadnice země). */
  sidestep?: Vec2 | null;
  /** Vizuální kořen v minulém kroku (pro skutečnou rychlost a směr pohybu nohou). */
  visPrev?: Vec2;
  /** Směr skutečného pohybu kořene (radiány) – promítnutí kroků na zem. */
  groundHeading?: number;
  /** Omezení rychlosti z rozestupů (následování pomalejšího), px/s; null = bez omezení. */
  speedCap?: number | null;
  /** Dvojice: tato postava jde s vůdcem (id) na dané straně. */
  follow?: { leaderId: string; side: number; vel?: Vec2 } | null;
  /** Postava je mimo scénu (návštěvník čeká za vstupem) – nekreslí se a neovlivňuje ostatní. */
  hidden?: boolean;
  /** Návštěvník: co právě dělá. */
  visit?: VisitState | null;
  /** Po společné činnosti se postava znovu připojí k vůdci dvojice. */
  rejoin?: { leaderId: string; side: number; permanent: boolean } | null;
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
