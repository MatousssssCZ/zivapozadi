import type { ProjectFile, SceneObject, ActivityZone, InteractionPoint } from '../model/types';
import type { NavGraph } from '../nav/navGraph';
import type { CharacterManifest } from '../anim/manifest';
import type { Reservations } from './reservations';
import type { AgentState, SimState, PropState } from './types';
import type { Vec2 } from '../math/vec';

export interface ResolvedPoint {
  key: string; // objId#pointId
  objectId: string;
  point: InteractionPoint;
  pos: Vec2;
  facing: number | undefined;
  /** Uzel sítě, ze kterého je bod přístupný (null = nedosažitelný). */
  entryNode: string | null;
}

export interface SimContext {
  project: ProjectFile;
  graph: NavGraph;
  state: SimState;
  res: Reservations;
  time(): number;
  object(id: string): SceneObject | undefined;
  zone(id: string): ActivityZone | undefined;
  manifest(agent: AgentState): CharacterManifest;
  /** Body objektu daného druhu (už převedené do scény, s přístupovým uzlem). */
  points(objectId: string, kind?: string): ResolvedPoint[];
  pointByKey(key: string): ResolvedPoint | undefined;
  /** Je bod dosažitelný z aktuální polohy postavy? */
  canReach(agent: AgentState, p: ResolvedPoint): boolean;
  /** Zahájí chůzi k bodu; vrací false a zapíše upozornění, pokud cíl není dosažitelný. */
  goToPoint(agent: AgentState, p: ResolvedPoint, purpose: string): boolean;
  goToNode(agent: AgentState, nodeId: string, purpose: string): boolean;
  isMoving(agent: AgentState): boolean;
  /** Spustí akční animaci (s explicitní náhradou při chybějícím klipu). */
  playAction(agent: AgentState, clip: string, defaults: { duration: number; events?: { time: number; name: string }[]; loop?: 'loop' | 'once' }): void;
  stopAction(agent: AgentState): void;
  actionFinished(agent: AgentState): boolean;
  spawnProp(kind: 'cup', place: PropState['place']): PropState;
  prop(id: string): PropState | undefined;
  /** Poloha úchopového bodu ruky postavy ve scéně (stejný výpočet jako ve vykreslení). */
  handPosition(agent: AgentState): Vec2;
  log(level: 'info' | 'warn', msg: string, agentId?: string): void;
  rand(agent: AgentState): number;
  randRange(agent: AgentState, lo: number, hi: number): number;
  isRemoved(objectId: string): boolean;
  /** Rozhraní pro řízení postavy (nezávislé na jejím vzhledu). */
  character: CharacterControl;
}

/** Ovládání postavy z činností a plánovače. Vzhled nerozhoduje o chování. */
export interface CharacterControl {
  setFacing(agent: AgentState, angle: number): void;
  setSpeedFactor(agent: AgentState, factor: number): void;
  /** Spustí podporovanou animaci (s explicitní náhradou při chybějícím klipu); vrací false u neznámého klipu bez náhrady. */
  playAnimation(agent: AgentState, clip: string, opts?: { duration?: number; loop?: 'loop' | 'once' }): boolean;
  /** Připojí rekvizitu do úchopového bodu ruky. */
  attachToHand(agent: AgentState, propId: string): void;
  /** Uvolní rekvizitu z ruky (volající určí, kam ji umístí). */
  detachFromHand(agent: AgentState): string | null;
  capabilities(agent: AgentState): CharacterCapabilities;
}
export interface CharacterCapabilities {
  clips: string[];
  capabilities: string[];
  activities: string[];
  views: { view: string; available: boolean; substitute?: string }[];
}
