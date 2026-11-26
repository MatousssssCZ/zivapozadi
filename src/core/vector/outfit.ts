/**
 * Oblečení vektorových postav: každý oděv = střih (silueta, délka, zakončení), materiálový profil
 * (objem, tuhost, záhyby, sekundární pohyb), paleta (hlavní, podpůrná, akcent) a detaily.
 * Outfity jsou ručně sestavené a rozšiřují se řízenými kombinacemi (sladěné palety, pravidla kompatibility).
 */
export type Material = 'down' | 'wool' | 'knit' | 'tech' | 'snowsuit';
export interface MaterialProfile {
  /** přídavek objemu k tělu (j) */ ease: number;
  /** tuhost lemu (0 = vlající, 1 = drží tvar) */ stiffness: number;
  /** hustota záhybů v ohybech (0–1) a jejich ostrost */ folds: number; sharp: number;
  /** stlačení vnitřní strany ohybu (podíl šířky) */ compress: number;
  /** komory (prošívání) – počet na délku trupu, 0 = bez */ quilt: number;
}
export const MATERIALS: Record<Material, MaterialProfile> = {
  down: { ease: 2.6, stiffness: 0.85, folds: 0.35, sharp: 0.2, compress: 0.1, quilt: 5 },
  wool: { ease: 1.2, stiffness: 0.75, folds: 0.45, sharp: 0.35, compress: 0.16, quilt: 0 },
  knit: { ease: 0.6, stiffness: 0.3, folds: 0.3, sharp: 0.2, compress: 0.2, quilt: 0 },
  tech: { ease: 1.0, stiffness: 0.5, folds: 0.7, sharp: 0.7, compress: 0.18, quilt: 0 },
  snowsuit: { ease: 2.2, stiffness: 0.8, folds: 0.5, sharp: 0.25, compress: 0.12, quilt: 0 },
};

export type TopKind = 'puffer' | 'parka' | 'coat' | 'sport' | 'kidJacket' | 'snowsuit';
export interface Top {
  kind: TopKind; material: Material;
  /** délka: hladina lemu jako podíl dolní končetiny od kyčle (0 = kyčel, 0.45 = půl stehna, 1 = kotník) */ length: number;
  /** střih trupu: rovný / vypasovaný (pas užší) / áčkový (rozšiřuje se k lemu) */ fit: 'straight' | 'fitted' | 'aline';
  collar: 'lapel' | 'stand' | 'funnel' | 'hood' | 'none';
  closure: 'zip' | 'buttons' | 'double' | 'toggle';
  pockets: 'flap' | 'welt' | 'patch' | 'none';
  /** barevné panely (sportovní bunda): podpůrná barva na ramenou */ panels?: boolean;
  /** pásek v pase / stažení (parka) */ belt?: boolean;
  /** rozparek vzadu, delší zadní lem (j) */ vent?: boolean; backDrop?: number;
  /** objem rukávu (násobek), manžeta (žebrovaná / rovná) */ sleeveVol: number; cuff: 'rib' | 'plain';
}
export type BottomKind = 'trousers' | 'skirt' | 'overall';
export interface Bottom { kind: BottomKind; width: 'slim' | 'straight' | 'loose' | 'insulated'; /** sukně: délka (podíl stehno–lýtko) */ skirtLen?: number; tights?: string; kneePads?: boolean }
export interface Boots { kind: 'ankle' | 'snow' | 'tall'; color: string; sole: string; trim?: string }
export interface Hair { style: 'short' | 'crop' | 'bob' | 'long' | 'bun' | 'pony' | 'curly' | 'bald'; color: string; beard?: boolean }

export interface OutfitColors { main: string; support: string; accent: string; bottom: string }
export interface Outfit {
  id: string; label: string; age: 'adult' | 'child' | 'senior';
  top: Top; bottom: Bottom; boots: Boots; hair: Hair; colors: OutfitColors;
  hat: 'pompom' | 'beanie' | 'earflap' | 'fitted' | 'none'; scarf: 'long' | 'wrap' | 'tube' | 'none';
  hands: 'mittens' | 'gloves' | 'none'; bag?: 'shoulder' | 'backpack' | 'tote' | 'none';
}

/** Sladěné palety: hlavní, podpůrná, akcent, kalhoty. */
export const PALETTES: Record<string, OutfitColors> = {
  navyCream: { main: '#2c3b5e', support: '#e9e0cc', accent: '#a8673a', bottom: '#3a3d48' },
  wineCharcoal: { main: '#6e2836', support: '#4a4b52', accent: '#cfcdc8', bottom: '#2f3036' },
  forestBeige: { main: '#3d5a3c', support: '#d8c8a8', accent: '#5a3d2b', bottom: '#4b4038' },
  mustardNavy: { main: '#c99a3a', support: '#2b3656', accent: '#8f9298', bottom: '#2d3240' },
  roseCream: { main: '#c98e90', support: '#ece3d3', accent: '#8a7a6c', bottom: '#5b5350' },
  camelBrown: { main: '#b08458', support: '#efe6d6', accent: '#6d2a2a', bottom: '#3a3532' },
  greyRed: { main: '#7d8088', support: '#2f3138', accent: '#b23a32', bottom: '#2c2d33' },
  kidPetrol: { main: '#24727a', support: '#e46f5c', accent: '#2c3c62', bottom: '#2c3c62' },
  kidCoral: { main: '#e2705f', support: '#2c3c62', accent: '#f1d36b', bottom: '#2b4f73' },
  kidNavy: { main: '#2c3c62', support: '#2a8a86', accent: '#e46f5c', bottom: '#2c3c62' },
};
const BOOTS = { brown: '#5a3a28', black: '#26262b', tan: '#9a6a42', grey: '#5d5f66', red: '#9b3030', navy: '#2a3350' };

const coatLong = (fit: Top['fit'], closure: Top['closure']): Top => ({ kind: 'coat', material: 'wool', length: 0.62, fit, collar: 'lapel', closure, pockets: 'flap', vent: true, backDrop: 1.2, sleeveVol: 1, cuff: 'plain' });
const puffer = (length: number, vol = 1): Top => ({ kind: 'puffer', material: 'down', length, fit: 'straight', collar: 'stand', closure: 'zip', pockets: 'welt', sleeveVol: 1.1 * vol, cuff: 'rib' });
const parka = (belt: boolean): Top => ({ kind: 'parka', material: 'tech', length: 0.42, fit: belt ? 'fitted' : 'straight', collar: 'hood', closure: 'zip', pockets: 'flap', belt, backDrop: 2, sleeveVol: 1.05, cuff: 'rib' });
const sport = (panels: boolean): Top => ({ kind: 'sport', material: 'tech', length: 0.12, fit: 'straight', collar: 'stand', closure: 'zip', pockets: 'welt', panels, sleeveVol: 0.95, cuff: 'rib' });

const snowsuit = (): Top => ({ kind: 'snowsuit', material: 'snowsuit', length: 0.08, fit: 'straight', collar: 'hood', closure: 'zip', pockets: 'none', sleeveVol: 1.15, cuff: 'rib' });
const kidJacket = (pockets: Top['pockets'] = 'patch'): Top => ({ kind: 'kidJacket', material: 'down', length: 0.14, fit: 'straight', collar: 'stand', closure: 'zip', pockets, sleeveVol: 1.1, cuff: 'rib' });
const B = (kind: Boots['kind'], color: string, sole = '#24242a', trim?: string): Boots => ({ kind, color, sole, trim });
const T = (width: Bottom['width'], extra: Partial<Bottom> = {}): Bottom => ({ kind: 'trousers', width, ...extra });
const SK = (len: number, tights = '#2e2a2c'): Bottom => ({ kind: 'skirt', width: 'straight', skirtLen: len, tights });

/**
 * 24 ručně sestavených výchozích outfitů (dospělí, senioři, děti). Každý mění siluetu (střih, délka,
 * objem), paletu, pokrývku hlavy, obuv i doplňky. Další varianty vznikají řízenými kombinacemi (outfitFor).
 */
export const OUTFITS: Outfit[] = [
  // ---- dospělí: kabáty
  { id: 'a_coat_navy', label: 'Rovný vlněný kabát', age: 'adult', top: coatLong('straight', 'buttons'), bottom: T('straight'), boots: B('ankle', BOOTS.brown, '#2b211c'), hair: { style: 'short', color: '#4a3424' }, colors: PALETTES.navyCream, hat: 'none', scarf: 'long', hands: 'gloves' },
  { id: 'a_coat_camel', label: 'Vypasovaný dvouřadý kabát', age: 'adult', top: coatLong('fitted', 'double'), bottom: SK(0.55), boots: B('tall', BOOTS.black, '#1d1d20'), hair: { style: 'bob', color: '#6b4a2e' }, colors: PALETTES.camelBrown, hat: 'fitted', scarf: 'wrap', hands: 'gloves', bag: 'shoulder' },
  { id: 'a_coat_wine_aline', label: 'Áčkový kabát s krátkou sukní', age: 'adult', top: { ...coatLong('aline', 'buttons'), length: 0.45 }, bottom: SK(0.35, '#3a2a30'), boots: B('tall', BOOTS.brown, '#2b211c'), hair: { style: 'long', color: '#2f2420' }, colors: PALETTES.wineCharcoal, hat: 'beanie', scarf: 'long', hands: 'gloves', bag: 'tote' },
  { id: 'a_coat_forest_mid', label: 'Středně dlouhý kabát s nákrčníkem', age: 'adult', top: { ...coatLong('straight', 'toggle'), length: 0.42, collar: 'stand' }, bottom: T('loose'), boots: B('ankle', BOOTS.tan, '#3a2e26'), hair: { style: 'curly', color: '#2b2522' }, colors: PALETTES.forestBeige, hat: 'none', scarf: 'tube', hands: 'gloves' },
  // ---- dospělí: péřové bundy
  { id: 'a_puffer_mustard', label: 'Krátká péřová bunda', age: 'adult', top: puffer(0.1), bottom: T('slim'), boots: B('snow', BOOTS.tan, '#3a2e26'), hair: { style: 'pony', color: '#2f2420' }, colors: PALETTES.mustardNavy, hat: 'pompom', scarf: 'none', hands: 'mittens' },
  { id: 'a_puffer_long_wine', label: 'Dlouhá péřová bunda', age: 'adult', top: puffer(0.7, 1.05), bottom: T('straight'), boots: B('snow', BOOTS.black, '#202024'), hair: { style: 'long', color: '#3b2a22' }, colors: PALETTES.wineCharcoal, hat: 'beanie', scarf: 'none', hands: 'gloves' },
  { id: 'a_puffer_bulky_navy', label: 'Objemná péřová bunda', age: 'adult', top: { ...puffer(0.22, 1.3), material: 'down' }, bottom: T('straight'), boots: B('snow', BOOTS.grey, '#202024'), hair: { style: 'crop', color: '#1f1b1a', beard: true }, colors: PALETTES.navyCream, hat: 'earflap', scarf: 'none', hands: 'mittens', bag: 'backpack' },
  { id: 'a_puffer_rose', label: 'Péřová bunda (růžová)', age: 'adult', top: puffer(0.28), bottom: T('slim'), boots: B('snow', '#e6dccb', '#8a7a6c'), hair: { style: 'bun', color: '#6b4426' }, colors: PALETTES.roseCream, hat: 'pompom', scarf: 'none', hands: 'mittens' },
  // ---- dospělí: parky a sportovní
  { id: 'a_parka_forest', label: 'Rovná parka s kapucí', age: 'adult', top: parka(false), bottom: T('loose'), boots: B('snow', BOOTS.brown, '#2b211c'), hair: { style: 'crop', color: '#2b2522', beard: true }, colors: PALETTES.forestBeige, hat: 'none', scarf: 'none', hands: 'gloves', bag: 'backpack' },
  { id: 'a_parka_belted', label: 'Parka stažená v pase', age: 'adult', top: parka(true), bottom: T('slim'), boots: B('tall', BOOTS.brown, '#2b211c'), hair: { style: 'long', color: '#8a6a40' }, colors: PALETTES.mustardNavy, hat: 'none', scarf: 'long', hands: 'gloves', bag: 'shoulder' },
  { id: 'a_sport_grey', label: 'Sportovní bunda s panely', age: 'adult', top: sport(true), bottom: T('slim'), boots: B('ankle', BOOTS.grey, '#e6e2da'), hair: { style: 'short', color: '#1f1b1a' }, colors: PALETTES.greyRed, hat: 'beanie', scarf: 'none', hands: 'gloves', bag: 'backpack' },
  { id: 'a_sport_plain', label: 'Jednobarevná sportovní bunda', age: 'adult', top: sport(false), bottom: T('straight'), boots: B('ankle', BOOTS.black, '#e6e2da'), hair: { style: 'pony', color: '#4a3424' }, colors: PALETTES.kidNavy, hat: 'fitted', scarf: 'tube', hands: 'gloves' },
  // ---- senioři (věk sám neznamená shrbení – držení řídí pohybový profil)
  { id: 's_coat_grey', label: 'Senior – šedý vlněný kabát', age: 'senior', top: { ...coatLong('straight', 'buttons'), length: 0.7 }, bottom: T('straight'), boots: B('ankle', BOOTS.black, '#1d1d20'), hair: { style: 'short', color: '#cfcac4' }, colors: { main: '#6c6f78', support: '#d8d2c6', accent: '#6d2a2a', bottom: '#3a3532' }, hat: 'fitted', scarf: 'wrap', hands: 'gloves' },
  { id: 's_coat_camel', label: 'Seniorka – velbloudí kabát', age: 'senior', top: { ...coatLong('fitted', 'buttons'), length: 0.66 }, bottom: SK(0.62, '#4a4044'), boots: B('ankle', BOOTS.brown, '#2b211c'), hair: { style: 'curly', color: '#dcd6d0' }, colors: PALETTES.camelBrown, hat: 'fitted', scarf: 'long', hands: 'gloves', bag: 'shoulder' },
  { id: 's_puffer_navy', label: 'Senior – delší péřová bunda', age: 'senior', top: puffer(0.4), bottom: T('straight'), boots: B('snow', BOOTS.brown, '#2b211c'), hair: { style: 'bald', color: '#bdb6ae' }, colors: PALETTES.navyCream, hat: 'earflap', scarf: 'wrap', hands: 'gloves' },
  { id: 's_parka_forest', label: 'Seniorka – parka', age: 'senior', top: { ...parka(false), length: 0.5 }, bottom: T('loose'), boots: B('snow', BOOTS.grey, '#202024'), hair: { style: 'bob', color: '#c9c2bb' }, colors: PALETTES.forestBeige, hat: 'beanie', scarf: 'tube', hands: 'mittens', bag: 'tote' },
  { id: 's_coat_wine', label: 'Seniorka – vínový kabát', age: 'senior', top: coatLong('aline', 'double'), bottom: T('straight'), boots: B('ankle', BOOTS.black, '#1d1d20'), hair: { style: 'bun', color: '#d8d2cc' }, colors: PALETTES.wineCharcoal, hat: 'fitted', scarf: 'none', hands: 'gloves' },
  { id: 's_sport_grey', label: 'Senior – sportovní bunda', age: 'senior', top: sport(false), bottom: T('straight'), boots: B('ankle', BOOTS.brown, '#e6e2da'), hair: { style: 'short', color: '#aaa49c', beard: true }, colors: PALETTES.greyRed, hat: 'beanie', scarf: 'none', hands: 'gloves' },
  // ---- děti
  { id: 'k_snowsuit_petrol', label: 'Kombinéza (petrolejová)', age: 'child', top: snowsuit(), bottom: { kind: 'overall', width: 'insulated', kneePads: true }, boots: B('snow', BOOTS.red, '#2a2a2e', '#e9e1cf'), hair: { style: 'curly', color: '#6b4426' }, colors: PALETTES.kidPetrol, hat: 'pompom', scarf: 'none', hands: 'mittens' },
  { id: 'k_snowsuit_coral', label: 'Kombinéza (korálová)', age: 'child', top: snowsuit(), bottom: { kind: 'overall', width: 'insulated', kneePads: true }, boots: B('snow', BOOTS.navy, '#24242a', '#f1d36b'), hair: { style: 'pony', color: '#8a5a2e' }, colors: PALETTES.kidCoral, hat: 'earflap', scarf: 'none', hands: 'mittens' },
  { id: 'k_jacket_coral', label: 'Bunda s oteplovačkami', age: 'child', top: kidJacket(), bottom: T('insulated', { kneePads: true }), boots: B('snow', BOOTS.navy, '#24242a', '#f1d36b'), hair: { style: 'pony', color: '#3a2618' }, colors: PALETTES.kidCoral, hat: 'earflap', scarf: 'wrap', hands: 'mittens' },
  { id: 'k_jacket_navy', label: 'Bunda s oteplovačkami (modrá)', age: 'child', top: kidJacket('welt'), bottom: T('insulated', { kneePads: true }), boots: B('snow', BOOTS.red, '#2a2a2e', '#e9e1cf'), hair: { style: 'short', color: '#5a3a22' }, colors: PALETTES.kidNavy, hat: 'pompom', scarf: 'long', hands: 'mittens', bag: 'backpack' },
  { id: 'k_parka_petrol', label: 'Dětská parka', age: 'child', top: { ...parka(false), length: 0.3, sleeveVol: 1.1 }, bottom: T('insulated', { kneePads: true }), boots: B('snow', BOOTS.brown, '#2b211c'), hair: { style: 'bob', color: '#6b4426' }, colors: PALETTES.kidPetrol, hat: 'beanie', scarf: 'none', hands: 'mittens' },
  { id: 'k_coat_wool', label: 'Dětský vlněný kabátek', age: 'child', top: { ...coatLong('aline', 'toggle'), length: 0.4, collar: 'hood' }, bottom: { kind: 'trousers', width: 'slim', tights: '#3a2a30' }, boots: B('tall', BOOTS.red, '#2a2a2e'), hair: { style: 'long', color: '#c08a4a' }, colors: PALETTES.roseCream, hat: 'pompom', scarf: 'none', hands: 'mittens' },
];

/** Sladěné palety podle věku (řízené kombinace – ne nezávislý náhodný výběr barev). */
const PAL_ADULT = ['navyCream', 'wineCharcoal', 'forestBeige', 'mustardNavy', 'roseCream', 'camelBrown', 'greyRed'];
const PAL_KID = ['kidPetrol', 'kidCoral', 'kidNavy'];
const HAIR_COLORS = { adult: ['#2b2220', '#4a3424', '#6b4a2e', '#8a6a40', '#2f2420', '#a07a4a'], senior: ['#cfcac4', '#bdb6ae', '#dcd6d0', '#a8a29a'], child: ['#6b4426', '#3a2618', '#8a5a2e', '#c08a4a', '#2f2420'] };

/**
 * Pravidla kompatibility: šála respektuje límec (vysoký límec péřovky → bez šály / jen nákrčník),
 * kapuce (parka, kombinéza) – bez objemné čepice přes ni, rukavice navazují na manžety (žebrovaná →
 * palčáky i rukavice, rovná → rukavice), batoh jen u kratších oděvů (sedí na objemu bundy).
 */
export function compatible(o: Outfit): Outfit {
  const r = { ...o };
  if (o.top.collar === 'stand' && o.top.kind === 'puffer' && (o.scarf === 'long' || o.scarf === 'wrap')) r.scarf = 'none';
  if (o.top.collar === 'lapel' && o.scarf === 'tube') r.scarf = 'wrap';
  if (o.top.cuff === 'plain' && o.hands === 'mittens') r.hands = 'gloves';
  if (o.bag === 'backpack' && o.top.length > 0.45) r.bag = 'shoulder';
  return r;
}
export function outfitById(id: string): Outfit | undefined { return OUTFITS.find((o) => o.id === id); }
/**
 * Stabilní outfit podle seedu a věku: ruční základ + řízená obměna (sladěná paleta, účes a barva vlasů,
 * pokrývka hlavy, doplněk) → stejný seed = stejný vzhled ve všech pohledech i po návratu do záběru.
 */
export function outfitFor(seed: number, age: Outfit['age']): Outfit {
  const pool = OUTFITS.filter((o) => o.age === age), list = pool.length ? pool : OUTFITS.filter((o) => o.age === 'adult');
  const h = (k: number) => { const x = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const base = list[Math.floor(h(1) * list.length) % list.length];
  if (h(2) < 0.4) return compatible(base); // ~40 % přesně ručních
  const pals = age === 'child' ? PAL_KID : PAL_ADULT, pk = pals[Math.floor(h(3) * pals.length) % pals.length];
  const hc = HAIR_COLORS[age], hairStyles: Hair['style'][] = age === 'child' ? ['short', 'curly', 'pony', 'bob', 'long'] : age === 'senior' ? ['short', 'bob', 'curly', 'bun', 'bald'] : ['short', 'crop', 'bob', 'long', 'pony', 'bun', 'curly'];
  const hats: Outfit['hat'][] = age === 'child' ? ['pompom', 'earflap', 'beanie'] : ['none', 'beanie', 'fitted', 'pompom', 'none'];
  return compatible({
    ...base, id: `${base.id}~${Math.floor(h(9) * 1000)}`,
    colors: PALETTES[pk],
    hair: { style: h(4) < 0.5 ? base.hair.style : hairStyles[Math.floor(h(5) * hairStyles.length) % hairStyles.length], color: hc[Math.floor(h(6) * hc.length) % hc.length], beard: age !== 'child' && h(7) < 0.18 },
    hat: h(8) < 0.5 ? base.hat : hats[Math.floor(h(10) * hats.length) % hats.length],
  });
}
