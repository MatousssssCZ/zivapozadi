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
  /**
   * Otvírací víko (koš): obdélník v souřadnicích obrázku (logické px před pixelScale), pant vlevo/vpravo,
   * největší úhel otevření (rad). Kreslí se zvlášť, aby se mohlo otáčet.
   */
  lid?: { x: number; y: number; w: number; h: number; color: string; snow?: boolean; hinge: 'left' | 'right'; maxAngle: number };
  /** Tvar pro zapuštění do scény: kontaktní šířka těla (u0..u1 obrázku), hloubka půdorysu, světla. */
  shape?: AssetShape;
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

/** Prodavač ve stánku: postava za pultem, vidět jen v okně stánku (nad pultem). */
export interface StallSeller {
  /** Asset postavy (manifest se skládanou kostrou). */
  assetId: string;
  appearance: import('../anim/partLibrary').CharacterAppearance;
  name?: string;
  /** Poloha chodidel vůči kotvě objektu (logické jednotky při měřítku 1). */
  offset: Vec2;
  /** Okno stánku, ve kterém je prodavač vidět (vůči kotvě, logické jednotky při měřítku 1); spodní hrana = horní hrana pultu. */
  window: { x0: number; y0: number; x1: number; y1: number };
  /** Výška prodavače jako podíl výšky obrázku stánku (např. 0,62); chybí = podle hloubky scény. */
  heightOfStall?: number;
}

/** Světelný zdroj objektu (lucerna): poloha v obrázku (0..1), výška nad zemí a účinky. */
export interface ObjectLight {
  u: number; v: number;
  color: string;
  heightM: number;
  /** dosah světla na zemi (m) a jeho síla */ radiusM: number; groundGain: number;
  /** záře kolem jádra (px scény 1080p) */ haloOpacity: number; haloSigmaPx: number;
  /** teplé světlo na postavách v okolí */ characterGain: number;
  /** relativní mikroblikání (±) */ flicker: number;
}
export interface AssetShape {
  /** Kontaktní hrana těla s náměstím (zlomek šířky obrázku) – bez přesahu střechy. */
  bodyU0: number; bodyU1: number;
  /** Hloubka půdorysu (m). */
  depthM: number;
  lights?: ObjectLight[];
  /** Zdroj páry (horký hrnec / samovar) v obrázku 0..1. */
  steam?: { u: number; v: number }[];
}
/** Zapuštění objektu do malovaného náměstí (zadání `docs/zdroje/zadani-zasazeni-stanku.md`, kap. B). */
export interface ObjectIntegration {
  /** Úzký kontaktní stín podél paty. */ contact: { enabled: boolean; opacity: number; sigmaPx: number; color: string };
  /** Jemné zastínění půdorysu (rozšířeného o expandM). */ ao: { enabled: boolean; opacity: number; sigmaPx: number; expandM: number };
  /** Nepravidelný sněhový lem u paty. */ snowLip: { enabled: boolean; heightM: number; coverage: number };
  /** Sladění barev (lineární RGB) a atmosférický opar. */
  grade: { enabled: boolean; saturation: number; contrast: number; exposureEV: number; ambientMix: number; ambient: string; hazeBeta: number; hazeColor: string };
  /** Světlo luceren: záře, světlo na sněhu a na postavách, mikroblikání. */ lights: { enabled: boolean; gain: number };
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
  /** Obsluha stánku (volitelné). */
  seller?: StallSeller;
  visible: boolean;
  locked: boolean;
  /** Kolizní stopa vůči kotvě (logické jednotky při měřítku 1). Slouží jako pevná překážka. */
  footprint?: Vec2[];
  interaction?: InteractionSpec;
  /** Zapuštění do scény (stín, sníh, světlo, barvy); chybí = vypnuto. */
  integration?: ObjectIntegration;
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
  /** Portál jsou dveře budovy (otevřou se, když jimi někdo prochází). */
  door?: boolean;
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
  routine?: 'wander' | 'visitor' | 'sled' | 'shovel';
  /** Postava venčí psa (Z01). */
  pet?: 'dog';
  /** Chůze seniora: A = pomalá chůze, B = s holí (rychlost a délka kroku z profilu). */
  gaitProfile?: 'elderA' | 'elderB';
  /** Ruka s holí u profilu B (výchozí pravá – podpírá levou nohu). */
  caneSide?: 'R' | 'L';
  /** Bruslař (profil dovednosti) a dítě, které drží za ruku (u rodiče). */
  skate?: import('../sim/rink').SkateProfile;
  skatePair?: string;
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

/** Zdroj kouře nebo páry umístěný ve scéně (komín, hrnec…). */
export interface SmokeSource { id: string; kind: 'smoke' | 'steam'; x: number; y: number; rate: number }
export interface EnvironmentSettings {
  /** hustota sněžení pozvolna kolísá 0,7–1,15× (přechody 30–90 s) */ variableSnow: boolean;
  /** jemné poryvy větru 8–20 s, sdílené sněžením, párou a kouřem */ gusts: boolean;
  /** pára z kelímků s horkým nápojem */ cupSteam: boolean;
  /** pára ze zdrojů na stáncích (AssetShape.steam) */ stallSteam: boolean;
  /** kouř a pára z ručně umístěných zdrojů */ sources: SmokeSource[];
  /** okna, která se občas pomalu rozsvítí/zhasnou (obdélníky skla v pozadí, px scény) */
  windows?: { x: number; y: number; w: number; h: number }[];
  /** dveře budovy (otvor, px scény) – otevřou se při průchodu portálem `door` */
  door?: { x: number; y: number; w: number; h: number };
}

export interface SceneSettings {
  width: number;
  height: number;
  backgroundAssetId: string | null;
  backgroundColor: string;
  depth: DepthSettings;
  /** Atmosférické sněžení (deterministické podle seedu). */
  snowfall: { enabled: boolean; density: number; wind: number };
  /** Živé prostředí (E01–E05): proměnlivé sněžení, poryvy větru, pára a kouř. Chybí = vypnuto. */
  environment?: EnvironmentSettings;
  /** Vodorovný zorný úhel kamery (°, výchozí 50) – spolu s nastavením hloubky určuje skutečné metry scény. */
  fovDeg?: number;
  /** Největší sklon chůze po obrazovce od vodorovné (°, výchozí 45; 90 = bez omezení). */
  maxWalkSlopeDeg?: number;
}

/** Kočka, která občas projde scénou (Z06/Z07). */
export interface CatConfig { firstDelay?: number }

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
  /** Kočky (volitelné) a klidová místa, kde si sedají. */
  cats?: CatConfig[];
  catSpots?: Vec2[];
  /**
   * Z09: explicitně označené nízké sokly (0,25–0,55 m), kam kočka občas vyskočí: bod na zemi pod místem
   * sedu, výška, odrazový bod před soklem a klíč řazení (vykreslit před objektem soklu).
   */
  catPerches?: { at: Vec2; height: number; from: Vec2; sortY: number }[];
  /** Sáňky (B02): dráha po sněhu (body ve scéně, začátek a konec mimo obraz) a postava rodiče (routine 'sled'). */
  sled?: { path: Vec2[]; parentId: string; firstDelay?: number };
  /**
   * Odklízení sněhu (A11): pruh (x0–x1 ve výšce y, výška decalu h px), hromada, příchod/odchod mimo obraz,
   * odstup pracovníka za lopatou (px), počet pásů; postava pracovníka má routine 'shovel'.
   */
  clearing?: import('../sim/clearing').ClearingConfig;
  /** Pády chodců (vzácná událost) – chybí-li, náhodné pády se nespouštějí (ruční spuštění z ladění ano). */
  falls?: Partial<import('../sim/falls').FallsConfig>;
  /** Kluziště (bruslení): obrys ledu, branka, směr jízdy, události. */
  rink?: import('../sim/rink').RinkConfig;
}
