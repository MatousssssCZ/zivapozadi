import type { Vec2 } from '../math/vec';

/** Směry pohledu: boční (E/W), šikmo ke kameře (SE/SW), šikmo od kamery (NE/NW), čelně (S/N). */
export type Direction = 'E' | 'W' | 'SE' | 'SW' | 'NE' | 'NW' | 'S' | 'N';
export const ALL_DIRECTIONS: Direction[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/** Náhrada chybějícího směru: jiný směr, nebo zrcadlení jiného směru. */
export type DirectionFallback = { use: Direction; mirror: boolean };

export type LoopMode = 'loop' | 'once' | 'pingpong';

export interface AnimEvent { time: number; name: string }

export interface ClipDef {
  duration: number;
  loop: LoopMode;
  events?: AnimEvent[];
  /** U chůze: délka jednoho cyklu (2 kroky) v logických jednotkách při měřítku 1 ⇒ kroky sladěné s posunem. */
  strideLength?: number;
  /** Snímková animace: seznam snímků (pro budoucí backend `frames`). */
  frames?: { file: string; duration: number }[];
}

/** Úchopový/kotevní bod pro daný směr (lokálně vůči chodidlům při měřítku 1). */
export type AttachPointDef = Partial<Record<Direction, Vec2>>;

export interface CharacterManifest {
  format: 'zimni-scena-postava';
  formatVersion: 1;
  id: string;
  name: string;
  /** Provizorní testovací vzhled. */
  provisional: boolean;
  /** Backend vykreslení: `procedural-test-figure` (hotový), `frames` a `skeleton` (připravené rozhraní). */
  backend: 'procedural-test-figure' | 'frames' | 'skeleton';
  /** Výška postavy v logických jednotkách při měřítku 1. */
  height: number;
  /** Kotevní bod = chodidla (normalizovaně vůči obdélníku postavy). */
  anchor: Vec2;
  directions: Direction[];
  directionFallbacks: Partial<Record<Direction, DirectionFallback>>;
  clips: Record<string, ClipDef>;
  /** Náhrady chybějících klipů (např. `drink` → `idle`). */
  clipFallbacks: Record<string, string>;
  /** Úchopové body; procedurální backend je počítá z pózy, zde jsou jen jako dokumentace/výchozí hodnoty. */
  attachPoints: Record<string, AttachPointDef>;
  capabilities: string[];
  supportedActivities: string[];
  /** Backend `skeleton`: knihovna malovaných dílů (cesta vůči souboru manifestu) a tělesná šablona. */
  rig?: { library: string; bodyTemplate: string };
  /** Doplněno při načtení projektu (neukládá se): načtená knihovna dílů a její složka v projektu. */
  rigLibrary?: import('./partLibrary').PartLibrary;
  rigLibraryDir?: string;
}

export function resolveDirection(m: CharacterManifest, d: Direction): DirectionFallback & { warning?: string } {
  if (m.directions.includes(d)) return { use: d, mirror: false };
  const fb = m.directionFallbacks[d];
  if (fb && m.directions.includes(fb.use)) return fb;
  return { use: m.directions[0] ?? 'E', mirror: false, warning: `Postava „${m.name}“ nemá směr ${d} ani náhradu; použit ${m.directions[0] ?? 'E'}.` };
}

export function resolveClip(m: CharacterManifest, clip: string): { clip: string | null; warning?: string } {
  if (m.clips[clip]) return { clip };
  const fb = m.clipFallbacks[clip];
  if (fb && m.clips[fb]) return { clip: fb, warning: `Postava „${m.name}“ nemá klip „${clip}“; použita náhrada „${fb}“.` };
  return { clip: null, warning: `Postava „${m.name}“ nemá klip „${clip}“ ani náhradu.` };
}

/** Vestavěný manifest testovací postavy. */
export function testFigureManifest(): CharacterManifest {
  return {
    format: 'zimni-scena-postava', formatVersion: 1, id: 'test-figure', name: 'Testovací postava (provizorní)', provisional: true,
    backend: 'procedural-test-figure', height: 130, anchor: { x: 0.5, y: 1 },
    directions: ['E', 'SE', 'NE'],
    directionFallbacks: {
      W: { use: 'E', mirror: true }, SW: { use: 'SE', mirror: true }, NW: { use: 'NE', mirror: true },
      S: { use: 'SE', mirror: false }, N: { use: 'NE', mirror: false },
    },
    clips: {
      idle: { duration: 3.2, loop: 'loop' },
      walk: { duration: 1.0, loop: 'loop', strideLength: 92 },
      talk: { duration: 1.4, loop: 'loop' },
      receive: { duration: 1.1, loop: 'once', events: [{ time: 0.6, name: 'take' }] },
      drink: { duration: 2.6, loop: 'once', events: [{ time: 1.1, name: 'sip' }] },
      drop: { duration: 1.0, loop: 'once', events: [{ time: 0.55, name: 'release' }] },
      look: { duration: 2.0, loop: 'once' },
    },
    clipFallbacks: { look: 'idle' },
    attachPoints: { handR: { E: { x: 14, y: -64 }, SE: { x: 12, y: -62 }, NE: { x: 12, y: -64 } } },
    capabilities: ['walk', 'look', 'hold-cup', 'drink', 'talk'],
    supportedActivities: ['coffee'],
  };
}
