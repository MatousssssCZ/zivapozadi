import type { Vec2 } from '../math/vec';

export const PROJECT_FORMAT = 'zimni-scena-projekt';
export const PROJECT_FORMAT_VERSION = 1;

/** Logická velikost scény (nezávislá na rozlišení náhledu a exportu). */
export const DEFAULT_SCENE_W = 1920;
export const DEFAULT_SCENE_H = 1080;

export type Layer = 'background' | 'world' | 'foreground';

export type AssetKind = 'image' | 'character' | 'audio';

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  name: string;
  /** Relativní cesta uvnitř projektové složky (např. `assets/images/stanek-1a2b.png`). */
  file: string;
  /** Rozměry obrázku v pixelech (u obrázků). */
  width?: number;
  height?: number;
  /** Doba trvání v sekundách (u zvuku). */
  durationSec?: number;
  /** Výchozí kotevní bod (bod kontaktu se zemí), normalizovaně 0..1 vůči obrázku. */
  anchor?: Vec2;
  /**
   * Výchozí poměr pixelů obrázku k logickým jednotkám scény (logické = px * pixelScale).
   * Malované podklady pro 4K mají typicky 0.5.
   */
  pixelScale?: number;
  /** Výchozí interakční údaje, které se zkopírují do objektu při vložení. */
  defaultInteraction?: InteractionSpec;
  /** Výchozí kolizní stopa (vůči kotvě, v logických jednotkách při měřítku 1). */
  defaultFootprint?: Vec2[];
  /** Označení provizorního testovacího assetu. */
  provisional?: boolean;
  /** Vestavěná knihovna: složka, která se kopíruje spolu se souborem (např. díly postav). */
  includeDir?: string;
}

export type InteractionKind = 'none' | 'stand' | 'table' | 'bin' | 'viewpoint' | 'generic';
export type InteractionPointKind = 'service' | 'queue' | 'seat' | 'view' | 'drop' | 'counter' | 'work';

export interface InteractionPoint {
  id: string;
  kind: InteractionPointKind;
  /** Poloha vůči kotvě objektu v logických jednotkách při měřítku 1 (škáluje se s objektem). */
  offset: Vec2;
  /** Směr pohledu postavy v bodě (radiány, 0 = vpravo, PI/2 = ke kameře). */
  facing?: number;
  /** Uzel sítě tras, ze kterého je bod přístupný. Pokud chybí, použije se nejbližší volně dosažitelný uzel. */
  navNodeId?: string;
  label?: string;
}

export interface InteractionSpec {
  kind: InteractionKind;
  points: InteractionPoint[];
}

export interface SceneObject {
  id: string;
  name: string;
  assetId: string;
  /** Poloha kotevního bodu ve scéně. */
  x: number;
  y: number;
  /** Rovnoměrné měřítko (poměr stran je vždy zachován). */
  scale: number;
  /** Kotevní bod (normalizovaně vůči obrázku); přepisuje výchozí kotvu assetu. */
  anchor?: Vec2;
  layer: Layer;
  /** Ruční úprava pořadí: přičítá se k hloubce (u světové vrstvy) / pořadí (u pevných vrstev). */
  zBias: number;
  flipX: boolean;
  visible: boolean;
  locked: boolean;
  /** Kolizní stopa vůči kotvě (logické jednotky při měřítku 1). Slouží jako pevná překážka. */
  footprint?: Vec2[];
  interaction?: InteractionSpec;
}

export interface StopConfig {
  waitMin: number;
  waitMax: number;
  look: { mode: 'none' | 'direction' | 'object'; angle?: number; objectId?: string };
  /** Typ činnosti, kterou se postava pokusí spustit v zastávce (např. `coffee`). */
  activity?: string;
  /** Pravděpodobnost spuštění činnosti 0..1. */
  activityChance?: number;
  /** Výběr pokračování. Prázdné ⇒ náhodný soused. */
  next: { nodeId: string; weight: number }[];
}

export interface NavNode {
  id: string; x: number; y: number; name?: string; stop?: StopConfig;
  /** Vstup/výstup ze scény (obvykle mimo obraz): tudy návštěvníci přicházejí a odcházejí. */
  portal?: boolean;
}

export interface NavEdge {
  id: string;
  a: string;
  b: string;
  /** true ⇒ lze jít jen z `a` do `b`. */
  oneWay: boolean;
  /** Úzký průchod: současně jím smí procházet jen jedna postava (rezervace). */
  narrow: boolean;
}

export type AreaKind = 'obstacle' | 'snow';
export interface Area {
  id: string; name: string; kind: AreaKind; polygon: Vec2[];
  /** Sníh: o kolik se bota při došlapu zaboří (m, výchozí 0,02). */
  snowDepthM?: number;
}

/** Umístěná zóna činnosti (instance definice činnosti ve scéně). */
export interface ActivityZone {
  id: string;
  name: string;
  activityType: string;
  activityVersion: number;
  enabled: boolean;
  /** Celkový prostor animace (polygon). */
  bounds: Vec2[];
  /** Přiřazení objektů do rolí definice (např. `stand`, `seating`, `bin`). */
  objectRoles: Record<string, string[]>;
  /** Volitelné parametry činnosti. */
  params: Record<string, number | string | boolean>;
}

export interface ActivityAutoConfig { enabled: boolean; intervalMin: number; intervalMax: number; firstDelayMin: number; firstDelayMax: number }

export interface CharacterInstance {
  id: string;
  name: string;
  /** Asset typu `character` (manifest postavy). */
  assetId: string;
  startNodeId: string;
  baseScale: number;
  /** Rychlost chůze v logických jednotkách za sekundu (v popředí, při měřítku hloubky 1). */
  walkSpeed: number;
  /** Barevná varianta pro testovací postavu. */
  palette: { coat: string; hat: string; scarf: string; skin: string; trousers: string };
  /** Automatické činnosti (klíč = typ činnosti). */
  activities: Record<string, ActivityAutoConfig>;
  /** Volné procházení sítí tras mezi činnostmi. */
  wander: boolean;
  /** Vzhled skládané postavy (identita z generátoru) – jen u manifestů s backendem `skeleton`. */
  appearance?: import('../anim/partLibrary').CharacterAppearance;
  /** Dvojice: tato postava chodí vedle uvedené postavy (vůdce dvojice) a nemá vlastní program. */
  companionId?: string | null;
  /** Strana vedle vůdce: 1 = vpravo, −1 = vlevo (výchozí 1). */
  companionSide?: number;
  /**
   * Chování: `wander` = volná procházka po trasách (původní), `visitor` = návštěvník: přijde vstupem,
   * scénou buď jen projde, nebo si dojde na kávu, nebo se potká s přítelem a jdou na kávu spolu; pak odejde.
   */
  routine?: 'wander' | 'visitor';
}

export type UnavailablePolicy = 'wait' | 'skip' | 'report';
export interface ScheduledEvent {
  id: string;
  name: string;
  /** Čas spuštění v sekundách simulace. */
  time: number;
  activityType: string;
  /** Konkrétní postava, nebo `null` = kterákoli volná postava. */
  characterId: string | null;
  zoneId: string | null;
  onUnavailable: UnavailablePolicy;
  /** Limit čekání v sekundách (u `wait`). */
  waitLimit: number;
}

export type ExportResolution = '1920x1080' | '3840x2160';
export interface ExportSettings {
  resolution: ExportResolution;
  fps: 30;
  durationMode: 'manual' | 'audio';
  durationSec: number;
  /** Asset zvuku (projektová kopie), `null` = bez zvuku. */
  audioAssetId: string | null;
  /** Co dělat, když je hudba kratší než video. */
  audioWhenShorter: 'loop' | 'silence';
  crf: number;
  preset: 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';
  /** Délka části exportu (s checkpointem) v sekundách. */
  chunkSec: number;
  outputPath: string | null;
  /** Diagnostický režim: místo MP4 sekvence PNG (výslovná volba). */
  diagnosticPngSequence: boolean;
}

export interface DepthSettings {
  enabled: boolean;
  /** Horizont/vzdálená hrana a měřítko v ní. */
  yFar: number; scaleFar: number;
  /** Blízká hrana a měřítko v ní. */
  yNear: number; scaleNear: number;
}

export interface SceneSettings {
  width: number;
  height: number;
  backgroundAssetId: string | null;
  backgroundColor: string;
  depth: DepthSettings;
  /** Atmosférické sněžení (deterministické podle seedu). */
  snowfall: { enabled: boolean; density: number; wind: number };
  /** Vodorovný zorný úhel kamery (°, výchozí 50) – spolu s nastavením hloubky určuje skutečné metry scény. */
  fovDeg?: number;
  /** Největší sklon chůze po obrazovce od vodorovné (°, výchozí 45; 90 = bez omezení). */
  maxWalkSlopeDeg?: number;
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  formatVersion: number;
  meta: { name: string; createdAt: string; modifiedAt: string; appVersion: string };
  seed: number;
  scene: SceneSettings;
  assets: AssetEntry[];
  objects: SceneObject[];
  nav: { nodes: NavNode[]; edges: NavEdge[] };
  areas: Area[];
  zones: ActivityZone[];
  characters: CharacterInstance[];
  schedule: ScheduledEvent[];
  export: ExportSettings;
}
