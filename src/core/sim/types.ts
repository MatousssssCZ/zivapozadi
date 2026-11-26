import type { Vec2 } from '../math/vec';
import type { RngState } from '../math/rng';
import type { AnimState } from '../anim/animator';
import type { AgentSocial, SocialWorld } from '../social/social';
import type { Particle } from './environment';
import type { AnimalState } from './animals';

export const SIM_STATE_VERSION = 5;
export const SIM_DT = 1 / 60;
export const STEPS_PER_SECOND = 60;

export interface Waypoint { x: number; y: number; nodeId: string | null; edgeId: string | null; /** dojít přesně (žádné „projití“ úsekem za bodem) – obratové body */ strict?: boolean }

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

export type VisitMode = 'offstage' | 'choose' | 'leave' | 'exit' | 'coffee' | 'meet-go' | 'meet-wait' | 'greet' | 'with' | 'skate' | 'rest';
export interface VisitState {
  mode: VisitMode;
  until: number;
  /** odpočinek na lavičce: rezervované místo; po vstání odejde */
  seat?: string | null; leaveNext?: boolean;
  /** Uzel, kam návštěvník odchází (vstup/výstup), nebo kde se setkává. */
  target?: string | null;
  friendId?: string | null;
  /** Kdo z dvojice přátel vede (jde na kávu, ostatní ho následují). */
  lead?: boolean;
  since?: number;
  /** Už zamával příteli na dálku. */
  waved?: boolean;
  /** Co spolu přátelé po setkání podniknou (jinak káva). */
  goal?: 'snowman' | 'snowball' | null;
  /** Zóna, kde budou stavět. */
  goalZone?: string | null;
  /** Čekání na přítele: kdy se znovu rozhlédne. */
  lookAt?: number;
}

export interface AgentState {
  /** bruslař na ledě: pohyb a pózu řídí rink.ts (není v davu chodců) */
  onIce?: boolean;
  /** ořez postavy (px scény): průchod dveřmi tramvaje / pekárny – postava zmizí za rámem */
  clip?: { x: number; y: number }[] | null;
  /** tramvaj: role cestujícího (čeká, vystupuje, nastupuje) a čekací místo */
  tram?: { role: 'wait' | 'alight' | 'board'; spot?: number; step?: number; since: number } | null;
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
  /** Skutečná rychlost ve světě (m/s, X doprava, Z od kamery). */
  vel?: { X: number; Z: number };
  /** Volba předvídavého plánovače (úhel a násobek rychlosti vůči trase). */
  crowdChoice?: { ang: number; k: number } | null;
  /** jak dlouho je postava s trasou zbrzděná (s) – řešení zácpy v davu */
  blockedT?: number;
  /** zdvořilé uhnutí v zácpě: zbývající čas (s) a směr úkroku (svět) */
  yieldT?: number; yieldDir?: { X: number; Z: number };
  /** Otáčení na místě před vykročením (světový úhel). */
  turnTo?: number | null;
  /** Hloubka sněhu pod postavou (m; 0 = mimo sníh) – zaboření bot. */
  snowDepth?: number;
  /** Jak dlouho postava stojí těsně před obsazeným cílem. */
  stuckT?: number;
  /** Postava je mimo scénu (návštěvník čeká za vstupem) – nekreslí se a neovlivňuje ostatní. */
  hidden?: boolean;
  /** Návštěvník: co právě dělá. */
  visit?: VisitState | null;
  /** cesta k lavičce stojí (s) – po chvíli postava plynule dosedne */
  benchStall?: number;
  /** Po společné činnosti se postava znovu připojí k vůdci dvojice. */
  rejoin?: { leaderId: string; side: number; permanent: boolean } | null;
  /** Druh drženého předmětu (kelímek se drží u hrudi, taška visí v ruce). */
  holdingKind?: PropKind | null;
  /** Sociální vrstva: profil, cooldowny, odložené reakce (src/core/social). */
  social?: AgentSocial;
}

/** Druhy rekvizit (balíček „živá pozadí“, 02 §4). */
export type PropKind = 'cup' | 'bag' | 'snowball' | 'snowmanPart' | 'phone' | 'mitten' | 'shovel' | 'bucket' | 'crate';
export type PropPlace =
  | { kind: 'counter'; objectId: string; x: number; y: number }
  | { kind: 'held'; agentId: string; /** paže: 1 = blízká (výchozí, kelímek), 0 = vzdálená */ arm?: 0 | 1 }
  | { kind: 'falling'; from: Vec2; to: Vec2; t0: number; t1: number; binId: string }
  | { kind: 'inBin'; objectId: string }
  | { kind: 'ground'; x: number; y: number }
  /** letící koule: světová balistika (m, s) */
  | { kind: 'flying'; X0: number; Z0: number; H0: number; vX: number; vZ: number; vH: number; t0: number; T: number; targetId: string; sessionId: string };

export interface PropState {
  id: string; kind: PropKind; place: PropPlace; appearedAt: number; sips: number;
  /** varianta (zboží v tašce: hracky / pernik / pletene…) */ variant?: string;
  /** poloměr (koule sněhu, m) */ radius?: number;
}

export interface ScheduleRuntime { status: 'pending' | 'waiting' | 'started' | 'skipped' | 'conflict'; waitingSince?: number; nextTry?: number; agentId?: string }

export interface LogEntry { t: number; level: 'info' | 'warn'; msg: string; agentId?: string }

export interface SimState {
  /** stav scénických epizod podle id */ episodes?: Record<string, import('./episodes').EpisodeState>;
  /** otisky sněhových andělů (A07) – trvalé, pozvolna zapadají */ angels?: import('../activities/snowAngel').AngelImprint[];
  /** kočárek (A17) */ pram?: import('./pram').PramState;
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
  /** Víka košů: plynulé otevírání/zavírání (úhel 0 = zavřeno, 1 = plně otevřeno). */
  lids?: Record<string, { from: number; to: number; t0: number; t1: number }>;
  /** Stopy ve sněhu (svět v metrech; nejstarší se uvolní po naplnění zásobníku). */
  footprints?: Footprint[];
  /** Rozhovory a statistika sociální vrstvy. */
  social?: SocialWorld;
  /** Společné činnosti více účastníků (jedno autoritativní řízení). */
  sessions?: ActivitySession[];
  nextSessionId?: number;
  /** Prodavači ve stáncích (podle objectId). */
  vendors?: Record<string, VendorState>;
  /** Časy průchodů dveřmi budovy (posledních pár – pro otevření dveří). */
  doorPasses?: number[];
  /** Psi a kočky (samostatné entity). */
  animals?: AnimalState[];
  /** Pára a kouř (omezený pool, vypuštěné částice zůstávají ve světě). */
  particles?: Particle[];
  /** Cooldowny míst (prohlížení…): klíč → čas, odkdy je místo znovu volné. */
  placeCooldowns?: Record<string, number>;
  /** Režisér setkání zvířat (Z04 pes–pes, Z10 pes–kočka): cooldowny scény. */
  animalDir?: { nextDogs: number; nextDogCat: number };
  /** B01 chytání vloček: probíhající zastávka rodiny a cooldown scény. */
  flakes?: { next: number; n: number; kidId?: string; parentId?: string; started?: boolean; until?: number; dur?: number };
  /** Odklízení sněhu (A11). */
  clearing?: import('./clearing').ClearingState;
  falls?: import('./falls').FallsState;
  rink?: import('./rink').RinkState;
  tram?: import('./tram').TramState;
  bakery?: import('./bakery').BakeryState;
  /** Sáňky (B02): stav průchodu. */
  sled?: import('./sled').SledState;
  /** Upadlá rukavice (B03): stav jediné události ve scéně. */
  mitten?: import('./mitten').MittenIncident;
  /** Režisér scény: kdy smí začít další výrazná událost (sněhulák, koulovačka…). */
  director?: { nextSignificant: number };
  /** Trvalé objekty vzniklé během simulace (sněhuláci…) – nejsou součástí projektu. */
  runtimeObjects?: RuntimeObject[];
}

/** Společná činnost (sněhulák, koulovačka…): fáze a termíny patří jen sem, ne účastníkům. */
export interface ActivitySession {
  id: string; type: string; zoneId: string;
  participantIds: string[];
  roles: Record<string, string>;
  phase: string; phaseStart: number; deadline: number;
  rng: RngState;
  ownedKeys: string[];
  data: Record<string, unknown>;
}
/** Stav prodavače: co právě dělá (zákazník má přednost; předání před vším). */
export interface VendorState {
  objectId: string;
  mode: 'idle' | 'attend' | 'retrieve' | 'handover' | 'tidy';
  since: number; until: number;
  /** zákazník, kterého obsluhuje */ customerId?: string | null;
  /** další drobná práce bez zákazníka */ nextTidy: number;
  rng: RngState;
}
/** Runtime objekt (sněhulák): poloha na zemi, fáze stavby, kolizní stopa. */
export interface RuntimeObject {
  id: string; kind: 'snowman'; zoneId: string;
  x: number; y: number;
  /** poloměry koulí (m): spodní, prostřední, hlava; 0 = ještě není */ radii: [number, number, number];
  stage: 'base' | 'middle' | 'head' | 'decorated' | 'done';
  decorations: string[];
  createdAt: number;
  seed: number;
  /** místo v zóně (0 / 1 – vlevo / vpravo od středu) */ slot?: number;
  /** kdy ho děti shodily (rozpadá se na hromádku, ta pak zapadne a objekt zmizí) */ collapseAt?: number;
}

/** Otisk boty ve sněhu: střed podrážky (X, Z v metrech), směr boty, velikost, čas vzniku. */
export interface Footprint { X: number; Z: number; yaw: number; size: number; side: number; t0: number; seed: number }
export const FOOTPRINT_LIFE = 180; // s
export const FOOTPRINT_FADE = 30; // s – slábnutí na konci
export const FOOTPRINT_POOL = 16384;
