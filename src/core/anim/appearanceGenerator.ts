/**
 * Generátor vzhledu skládaných postav. Vybírá jen kompatibilní kombinace dílů a sladěné barvy.
 * Deterministický: stejný seed + stejné vstupy (knihovna, palety, zámky) ⇒ stejný výsledek.
 */
import { seedRng, rand, randRange, hashString, type RngState } from '../math/rng';
import type { CharacterAppearance, GroupId, LockKey, PartLibrary, VariantDef, BodyTemplateDef } from './partLibrary';
import { GROUP_ORDER, partsFor } from './partLibrary';
import type { MotionParams } from './skeleton';

export interface GenerateOptions {
  seed: number;
  bodyTemplate?: string;
  /** Povolené palety (pro přebarvitelné díly). Prázdné/neuvedené = všechny. */
  palettes?: string[];
  /** Výchozí vzhled se zámky (přegenerování). */
  base?: CharacterAppearance;
}

const COLOR_GROUP: Partial<Record<LockKey, GroupId>> = { jacketColor: 'jacket', hatColor: 'hat', scarfColor: 'scarf' };

function pickRng<T>(rng: RngState, arr: T[]): T { return arr[Math.floor(rand(rng) * arr.length)]; }

export function template(lib: PartLibrary, id: string): BodyTemplateDef {
  const t = lib.bodyTemplates.find((x) => x.id === id);
  if (!t) throw new Error(`Knihovna nemá tělesnou šablonu „${id}“.`);
  return t;
}

/** Je varianta kompatibilní s již zvolenými variantami (tagy, šablona, kotvy ve všech dostupných pohledech)? */
export function variantCompatible(lib: PartLibrary, tpl: BodyTemplateDef, v: VariantDef, chosen: Partial<Record<GroupId, string>>): boolean {
  if (!v.compatibleBodyTypes.includes(tpl.id)) return false;
  const others = Object.entries(chosen).filter(([g]) => g !== v.group).map(([, id]) => lib.variants.find((x) => x.id === id)).filter(Boolean) as VariantDef[];
  for (const o of others) {
    if (v.excludesTags.some((t) => o.tags.includes(t))) return false;
    if (o.excludesTags.some((t) => v.tags.includes(t))) return false;
  }
  const group = lib.groups.find((g) => g.id === v.group)!;
  for (const view of tpl.availableViews) {
    // všechny díly varianty musí existovat ve všech dostupných pohledech (tatáž postava ve všech směrech)
    for (const slot of group.slots) if (!lib.parts.some((p) => p.variantId === v.id && p.slot === slot && p.view === view)) return false;
    // doplněk nesmí vyžadovat chybějící připojovací bod
    for (const req of v.requiresAnchors) {
      const ownerGroup = lib.groups.find((g) => g.slots.includes(req.slot));
      const ownerVariant = ownerGroup ? chosen[ownerGroup.id] : undefined;
      if (!ownerVariant) continue; // ověří se, až bude vlastník zvolen (viz pořadí skupin)
      const owner = partsFor(lib, ownerVariant, view).find((p) => p.slot === req.slot);
      if (!owner || !owner.anchors[req.anchor]) return false;
    }
  }
  return true;
}

function paletteChoices(lib: PartLibrary, v: VariantDef, allowed: string[] | undefined): string[] {
  const opts = v.paletteOptions;
  if (!opts.length) return [];
  const f = allowed && allowed.length ? opts.filter((p) => allowed.includes(p)) : opts;
  return f.length ? f : opts; // povolené palety nepokrývají variantu ⇒ použít její vlastní (zaznamená validace)
}

function inRange(rng: RngState, r: [number, number]) { return r[0] === r[1] ? r[0] : randRange(rng, r[0], r[1]); }

export function generateAppearance(lib: PartLibrary, opts: GenerateOptions): CharacterAppearance {
  const tplId = opts.bodyTemplate ?? opts.base?.bodyTemplate ?? lib.bodyTemplates[0].id;
  const tpl = template(lib, tplId);
  const rng = seedRng(opts.seed, `appearance:${lib.id}:${tplId}`);
  const base = opts.base;
  const locks = new Set(base?.locks ?? []);
  const chosen: Partial<Record<GroupId, string>> = {};
  // zamčené varianty mají přednost a určují omezení pro ostatní
  for (const g of GROUP_ORDER) if (base && locks.has(g as LockKey) && base.variants[g]) chosen[g] = base.variants[g];
  for (const g of GROUP_ORDER) {
    if (chosen[g]) continue;
    const cands = lib.variants.filter((v) => v.group === g && variantCompatible(lib, tpl, v, chosen));
    if (!cands.length) throw new Error(`Pro skupinu „${g}“ neexistuje kompatibilní díl.`);
    chosen[g] = pickRng(rng, cands).id;
  }
  // barvy: bunda volně, čepice a šála kontrastně k bundě a k sobě, rukavice ladí s čepicí/šálou
  const colors: Partial<Record<GroupId, string>> = {};
  const v = (g: GroupId) => lib.variants.find((x) => x.id === chosen[g])!;
  const lockedColor = (g: GroupId) => {
    const lk = (Object.entries(COLOR_GROUP).find(([, gg]) => gg === g)?.[0]) as LockKey | undefined;
    return lk && locks.has(lk) && base?.colors[g] && v(g).paletteOptions.includes(base.colors[g]!) ? base.colors[g] : undefined;
  };
  const pickColor = (g: GroupId, avoid: (string | undefined)[]) => {
    const l = lockedColor(g); if (l) return l;
    const all = paletteChoices(lib, v(g), opts.palettes);
    if (!all.length) return undefined;
    const pref = all.filter((c) => !avoid.includes(c));
    return pickRng(rng, pref.length ? pref : all);
  };
  colors.jacket = pickColor('jacket', []);
  colors.hat = pickColor('hat', [colors.jacket]);
  colors.scarf = pickColor('scarf', [colors.jacket, colors.hat]);
  const glovesOpts = paletteChoices(lib, v('gloves'), undefined);
  const match = [colors.scarf, colors.hat].filter((c) => c && glovesOpts.includes(c)) as string[];
  colors.gloves = match.length ? pickRng(rng, match) : glovesOpts.length ? pickRng(rng, glovesOpts) : undefined;
  colors.trousers = pickColor('trousers', []);
  colors.boots = pickColor('boots', [colors.trousers]);
  for (const k of Object.keys(colors) as GroupId[]) if (colors[k] === undefined) delete colors[k];

  const proportions = base && locks.has('proportions') ? { ...base.proportions }
    : { height: round3(inRange(rng, tpl.proportions.height)), build: round3(inRange(rng, tpl.proportions.build)) };
  let motion: MotionParams;
  if (base && locks.has('motion')) motion = { ...base.motion };
  else {
    const m = tpl.motionRanges;
    motion = {
      strideScale: round3(inRange(rng, m.strideScale)), armSwing: round3(inRange(rng, m.armSwing)), bob: round3(inRange(rng, m.bob)),
      sway: round3(inRange(rng, m.sway)), idleTempo: round3(inRange(rng, m.idleTempo)), lean: round3(inRange(rng, m.lean)),
      speed: round3(inRange(rng, m.speed)), phase: round3(rand(rng)),
    };
    // zpoždění a nesouměrnost paží (jen pokud je šablona definuje – starší knihovny se nemění)
    if (m.armLag) motion.armLag = round3(inRange(rng, m.armLag));
    if (m.armLR) motion.armLR = round3(inRange(rng, m.armLR));
  }
  return {
    generator: 'parts', libraryId: lib.id, seed: opts.seed, bodyTemplate: tplId,
    variants: chosen as Record<GroupId, string>, colors, proportions, motion, locks: [...locks],
  };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Nový seed pro přegenerování (deterministický z původního seedu a pořadí pokusu). */
export function nextSeed(seed: number, salt = 1): number { return hashString(`${seed}:${salt}`) % 2147483647; }

/** Klíč kombinace pro omezení opakování ve skupině (viditelné vlastnosti). */
export function comboKey(a: CharacterAppearance): string {
  return ['jacket', 'hat', 'scarf'].map((g) => `${a.variants[g as GroupId]}:${a.colors[g as GroupId] ?? ''}`).join('|');
}

/** Počet různých viditelných kombinací (bunda, čepice, šála + jejich barvy) při daných paletách. */
export function countCombos(lib: PartLibrary, tplId: string, palettes?: string[]): number {
  const tpl = template(lib, tplId);
  let n = 0;
  const by = (g: GroupId) => lib.variants.filter((v) => v.group === g && v.compatibleBodyTypes.includes(tplId));
  for (const j of by('jacket')) for (const h of by('hat')) for (const s of by('scarf')) {
    const chosen = { jacket: j.id, hat: h.id } as Partial<Record<GroupId, string>>;
    if (!variantCompatible(lib, tpl, h, { jacket: j.id }) || !variantCompatible(lib, tpl, s, chosen)) continue;
    const cj = paletteChoices(lib, j, palettes).length || 1, ch = paletteChoices(lib, h, palettes).length || 1, cs = paletteChoices(lib, s, palettes).length || 1;
    n += cj * ch * cs;
  }
  return n;
}

export interface GroupResult { appearances: CharacterAppearance[]; duplicates: number; uniqueAvailable: number; note: string | null }

/** Skupina postav: omezuje opakování totožných kombinací i stejnou barvu bundy hned po sobě. */
export function generateGroup(lib: PartLibrary, count: number, seed: number, opts: { palettes?: string[]; bodyTemplate?: string } = {}): GroupResult {
  const tplId = opts.bodyTemplate ?? lib.bodyTemplates[0].id;
  const uniqueAvailable = countCombos(lib, tplId, opts.palettes);
  const used = new Set<string>();
  const out: CharacterAppearance[] = [];
  let duplicates = 0;
  for (let i = 0; i < count; i++) {
    let pick: CharacterAppearance | null = null, fallback: CharacterAppearance | null = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const s = nextSeed(seed, i * 1000 + attempt + 1);
      const a = generateAppearance(lib, { seed: s, bodyTemplate: tplId, palettes: opts.palettes });
      const fresh = !used.has(comboKey(a));
      const prev = out[out.length - 1];
      const notSameAsPrev = !prev || prev.colors.jacket !== a.colors.jacket;
      if (fresh && notSameAsPrev) { pick = a; break; }
      if (fresh && !fallback) fallback = a;
      if (!fallback && attempt === 59) fallback = a;
    }
    const a = pick ?? fallback!;
    if (used.has(comboKey(a))) duplicates++;
    used.add(comboKey(a));
    out.push(a);
  }
  const note = duplicates > 0
    ? `Požadováno ${count} postav, ale s vybranými paletami existuje jen ${uniqueAvailable} různých kombinací – ${duplicates} postav se opakuje.`
    : null;
  return { appearances: out, duplicates, uniqueAvailable, note };
}

export interface AppearanceIssue { level: 'error' | 'warning'; message: string }

/** Ověření uloženého vzhledu proti knihovně (chybějící díly, nekompatibilita, barvy bez masky). */
export function validateAppearance(lib: PartLibrary, a: CharacterAppearance): AppearanceIssue[] {
  const out: AppearanceIssue[] = [];
  const tpl = lib.bodyTemplates.find((t) => t.id === a.bodyTemplate);
  if (!tpl) return [{ level: 'error', message: `Tělesná šablona „${a.bodyTemplate}“ v knihovně není.` }];
  for (const g of GROUP_ORDER) {
    const vid = a.variants[g];
    const v = lib.variants.find((x) => x.id === vid);
    if (!v) { out.push({ level: 'error', message: `Díl „${vid}“ (${g}) v knihovně není.` }); continue; }
    if (v.group !== g) out.push({ level: 'error', message: `Díl „${vid}“ nepatří do skupiny ${g}.` });
    const rest = { ...a.variants } as Partial<Record<GroupId, string>>;
    if (!variantCompatible(lib, tpl, v, rest)) out.push({ level: 'error', message: `Díl „${v.label}“ není kompatibilní s ostatními díly postavy.` });
    const c = a.colors[g];
    if (c && !v.paletteOptions.includes(c)) out.push({ level: 'error', message: `Barva „${c}“ není pro „${v.label}“ k dispozici (chybí maska nebo varianta).` });
  }
  const r = tpl.proportions;
  if (a.proportions.height < r.height[0] - 1e-6 || a.proportions.height > r.height[1] + 1e-6 || a.proportions.build < r.build[0] - 1e-6 || a.proportions.build > r.build[1] + 1e-6)
    out.push({ level: 'error', message: 'Proporce jsou mimo povolený rozsah šablony.' });
  return out;
}
