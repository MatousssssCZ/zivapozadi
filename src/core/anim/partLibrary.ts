/**
 * Knihovna malovaných dílů postav (manifest) a vzhled (identita) skládané postavy.
 * Všechny polohy, kotvy, pořadí a pravidla kombinování jsou v datech (library.json), ne v kódu.
 */
import type { Vec2 } from '../math/vec';
import type { SkeletonTemplate, ViewId, MotionParams } from './skeleton';

export type PartSlot = 'head' | 'torso' | 'upperArm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot' | 'hat' | 'scarf';
/** Skupina = jedna volba vzhledu (bunda zahrnuje trup i oba rukávy). */
export type GroupId = 'head' | 'jacket' | 'hat' | 'scarf' | 'trousers' | 'boots' | 'gloves';
export const GROUP_ORDER: GroupId[] = ['jacket', 'hat', 'scarf', 'trousers', 'boots', 'gloves', 'head'];

export interface PartDef {
  /** Stabilní identifikátor dílu. */
  id: string;
  slot: PartSlot;
  /** Vazba na jednotný vzhled napříč pohledy. */
  variantId: string;
  view: ViewId;
  /** Ořezaný obrázek dílu (cesta vůči složce knihovny). */
  texture: string;
  /** Maska přebarvitelné oblasti (stejný rozměr jako texture). Bez masky se díl nepřebarvuje. */
  mask?: string;
  /** Rozměr původního (neořezaného) plátna dílu v px – všechny souřadnice jsou vůči němu. */
  sourceSize: { w: number; h: number };
  /** Umístění ořezané textury v původním plátně (ořez nemění polohu dílu). */
  trim: { x: number; y: number; w: number; h: number };
  /** Bod otáčení (kloub, na který se díl připojuje) v px původního plátna. */
  pivot: Vec2;
  /** Body připojení navazujících dílů (např. `end`, `hat`, `scarf`, `grip`) v px původního plátna. */
  anchors: Record<string, Vec2>;
  /** Směr kosti v obrázku (rad; π/2 = dolů u končetin, −π/2 = nahoru u trupu a hlavy, 0 = vpravo u boty). */
  boneDir: number;
  /** Pořadí v rámci téhož místa ve vykreslovacím pořadí šablony (vyšší = výš). */
  layerOrder: number;
  compatibleBodyTypes: string[];
  compatibilityTags: string[];
  paletteOptions: string[];
  /** Lze díl bezpečně zrcadlit (levá/pravá varianta téhož vzhledu)? */
  mirrorSafe: boolean;
  provisional?: boolean;
}

export interface VariantDef {
  id: string;
  group: GroupId;
  label: string;
  compatibleBodyTypes: string[];
  /** Vlastnosti varianty (např. `collar-high`). */
  tags: string[];
  /** Varianta nelze kombinovat s variantou, která má některý z těchto tagů. */
  excludesTags: string[];
  /** Kotvy, které musí poskytovat díly nadřazené skupiny ve všech dostupných pohledech (např. hlava → `hat`). */
  requiresAnchors: { slot: PartSlot; anchor: string }[];
  /** Povolené palety (jen pokud mají díly masku). Prázdné = nepřebarvuje se. */
  paletteOptions: string[];
  provisional?: boolean;
  /** Poznámka k výtvarné úpravě, kterou díl ještě potřebuje. */
  artNotes?: string;
}

export interface GroupDef {
  id: GroupId;
  label: string;
  slots: PartSlot[];
  /** Pravidlo barvy: free = libovolná paleta, contrast = jiná než bunda (a čepice), match = jako šála/čepice. */
  colorRule: 'free' | 'contrast' | 'matchAccessory' | 'fixedOptions';
  /** Lze ve výběru měnit (v UI), nebo je společná pro všechny. */
  userSelectable: boolean;
}

export interface Palette { id: string; label: string; color: string }

export interface BodyTemplateDef extends SkeletonTemplate {
  /** Pohledy, pro které existují podklady. */
  availableViews: ViewId[];
  /** Explicitní náhrada chybějících pohledů (žádné zrcadlení předního pohledu jako zadního). */
  viewFallbacks: Partial<Record<ViewId, { use: ViewId }>>;
  /** Vykreslovací pořadí pro každý pohled: `far.<slot>`, `near.<slot>` (končetiny), `<slot>`, `held`. */
  drawOrder: Partial<Record<ViewId, string[]>>;
  /** Ztmavení vzdálených končetin (násobek jasu). */
  farShade: number;
  /** Protažení dílu trupu směrem dolů (od ramen, která zůstanou na místě): delší bunda/kabát → opticky níž pas. */
  torsoStretch?: number;
}

export interface PartLibrary {
  format: 'zive-obrazy-dily';
  formatVersion: 1;
  id: string;
  label: string;
  provisional: boolean;
  /** Počet px původního plátna na logickou jednotku scény (při měřítku 1). */
  pxPerUnit: number;
  palettes: Palette[];
  bodyTemplates: BodyTemplateDef[];
  groups: GroupDef[];
  variants: VariantDef[];
  parts: PartDef[];
  /** Seznam známých výtvarných nedostatků podkladů. */
  artIssues: { ref: string; issue: string }[];
}

/** Uložená identita postavy. Obsahuje konkrétní výběr – samotný seed by po rozšíření knihovny nestačil. */
export interface CharacterAppearance {
  generator: 'parts';
  libraryId: string;
  seed: number;
  bodyTemplate: string;
  variants: Record<GroupId, string>;
  colors: Partial<Record<GroupId, string>>;
  proportions: { height: number; build: number };
  motion: MotionParams;
  /** Vlastnosti zamčené při přegenerování. */
  locks: LockKey[];
}

export type LockKey = 'jacket' | 'jacketColor' | 'hat' | 'hatColor' | 'scarf' | 'scarfColor' | 'proportions' | 'motion';
export const LOCK_LABELS: Record<LockKey, string> = {
  jacket: 'bunda', jacketColor: 'barva bundy', hat: 'čepice', hatColor: 'barva čepice', scarf: 'šála', scarfColor: 'barva šály', proportions: 'proporce', motion: 'pohyb',
};

export interface LibraryIssue { level: 'error' | 'warning'; message: string }

/** Kontrola konzistence knihovny (díly, kotvy, délky kostí, pohledy). */
export function validateLibrary(lib: PartLibrary): LibraryIssue[] {
  const out: LibraryIssue[] = [];
  if (lib.format !== 'zive-obrazy-dily' || lib.formatVersion !== 1) out.push({ level: 'error', message: 'Neznámý formát knihovny dílů.' });
  const ids = new Set<string>();
  const variants = new Map(lib.variants.map((v) => [v.id, v]));
  const palettes = new Set(lib.palettes.map((p) => p.id));
  for (const p of lib.parts) {
    if (ids.has(p.id)) out.push({ level: 'error', message: `Duplicitní ID dílu ${p.id}.` });
    ids.add(p.id);
    if (!variants.has(p.variantId)) out.push({ level: 'error', message: `Díl ${p.id} odkazuje na neznámou variantu ${p.variantId}.` });
    const { trim, sourceSize: s } = p;
    if (trim.x < 0 || trim.y < 0 || trim.x + trim.w > s.w || trim.y + trim.h > s.h) out.push({ level: 'error', message: `Díl ${p.id}: ořez leží mimo původní plátno.` });
    for (const pal of p.paletteOptions) if (!palettes.has(pal)) out.push({ level: 'error', message: `Díl ${p.id}: neznámá paleta ${pal}.` });
    if (p.paletteOptions.length && !p.mask) out.push({ level: 'warning', message: `Díl ${p.id} nabízí palety, ale nemá masku – nebude se přebarvovat.` });
  }
  for (const tpl of lib.bodyTemplates) {
    const lens: Partial<Record<PartSlot, number>> = { thigh: tpl.bones.thigh, shin: tpl.bones.shin, upperArm: tpl.bones.upperArm, forearm: tpl.bones.forearm };
    for (const v of lib.variants) {
      if (!v.compatibleBodyTypes.includes(tpl.id)) continue;
      const g = lib.groups.find((x) => x.id === v.group);
      for (const view of tpl.availableViews) for (const slot of g?.slots ?? []) {
        const part = lib.parts.find((p) => p.variantId === v.id && p.slot === slot && p.view === view);
        if (!part) { out.push({ level: 'warning', message: `Varianta „${v.label}“ nemá díl ${slot} pro pohled ${view}.` }); continue; }
        const L = lens[slot];
        if (L !== undefined) {
          const e = part.anchors.end;
          if (!e) out.push({ level: 'error', message: `Díl ${part.id} nemá kotvu „end“ (další kloub).` });
          else {
            const d = Math.hypot(e.x - part.pivot.x, e.y - part.pivot.y) / lib.pxPerUnit;
            if (Math.abs(d - L) > L * 0.04) out.push({ level: 'error', message: `Díl ${part.id}: délka ${d.toFixed(1)} neodpovídá kosti ${L} (šablona ${tpl.id}).` });
          }
        }
      }
    }
  }
  return out;
}

export function partsFor(lib: PartLibrary, variantId: string, view: ViewId): PartDef[] {
  return lib.parts.filter((p) => p.variantId === variantId && p.view === view);
}

/** Pohled, který se pro požadovaný směr skutečně použije (explicitní náhrada, nebo nedostupný). */
export function resolveView(tpl: BodyTemplateDef, view: ViewId): { use: ViewId; substituted: boolean } {
  if (tpl.availableViews.includes(view)) return { use: view, substituted: false };
  const fb = tpl.viewFallbacks[view];
  if (fb && tpl.availableViews.includes(fb.use)) return { use: fb.use, substituted: true };
  return { use: tpl.availableViews[0], substituted: true };
}
