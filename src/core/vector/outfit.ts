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

/** Ručně sestavené výchozí outfity (první sada; katalog se dál rozšiřuje kombinacemi). */
export const OUTFITS: Outfit[] = [
  { id: 'a_coat_navy', label: 'Dlouhý vlněný kabát (námořnický)', age: 'adult', top: coatLong('straight', 'buttons'), bottom: { kind: 'trousers', width: 'straight' }, boots: { kind: 'ankle', color: BOOTS.brown, sole: '#2b211c' }, hair: { style: 'short', color: '#4a3424' }, colors: PALETTES.navyCream, hat: 'none', scarf: 'long', hands: 'gloves' },
  { id: 'a_coat_camel', label: 'Vypasovaný kabát (velbloudí)', age: 'adult', top: coatLong('fitted', 'double'), bottom: { kind: 'skirt', width: 'straight', skirtLen: 0.55, tights: '#2e2a2c' }, boots: { kind: 'tall', color: BOOTS.black, sole: '#1d1d20' }, hair: { style: 'bob', color: '#6b4a2e' }, colors: PALETTES.camelBrown, hat: 'fitted', scarf: 'wrap', hands: 'gloves' },
  { id: 'a_puffer_mustard', label: 'Krátká péřová bunda (hořčicová)', age: 'adult', top: puffer(0.1), bottom: { kind: 'trousers', width: 'slim' }, boots: { kind: 'snow', color: BOOTS.tan, sole: '#3a2e26' }, hair: { style: 'pony', color: '#2f2420' }, colors: PALETTES.mustardNavy, hat: 'pompom', scarf: 'none', hands: 'mittens' },
  { id: 'a_puffer_long_wine', label: 'Dlouhá péřová bunda (vínová)', age: 'adult', top: { ...puffer(0.7, 1.05), fit: 'straight' }, bottom: { kind: 'trousers', width: 'straight' }, boots: { kind: 'snow', color: BOOTS.black, sole: '#202024' }, hair: { style: 'long', color: '#3b2a22' }, colors: PALETTES.wineCharcoal, hat: 'beanie', scarf: 'tube', hands: 'gloves' },
  { id: 'a_parka_forest', label: 'Parka s kapucí (lesní zelená)', age: 'adult', top: parka(false), bottom: { kind: 'trousers', width: 'loose' }, boots: { kind: 'snow', color: BOOTS.brown, sole: '#2b211c' }, hair: { style: 'crop', color: '#2b2522', beard: true }, colors: PALETTES.forestBeige, hat: 'none', scarf: 'none', hands: 'gloves' },
  { id: 'a_sport_grey', label: 'Sportovní bunda s panely', age: 'adult', top: sport(true), bottom: { kind: 'trousers', width: 'slim' }, boots: { kind: 'ankle', color: BOOTS.grey, sole: '#e6e2da' }, hair: { style: 'short', color: '#1f1b1a' }, colors: PALETTES.greyRed, hat: 'beanie', scarf: 'none', hands: 'gloves' },
  { id: 'k_snowsuit_petrol', label: 'Dětská kombinéza (petrolejová)', age: 'child', top: { kind: 'snowsuit', material: 'snowsuit', length: 0.08, fit: 'straight', collar: 'hood', closure: 'zip', pockets: 'none', sleeveVol: 1.15, cuff: 'rib' }, bottom: { kind: 'overall', width: 'insulated', kneePads: true }, boots: { kind: 'snow', color: BOOTS.red, sole: '#2a2a2e', trim: '#e9e1cf' }, hair: { style: 'curly', color: '#6b4426' }, colors: PALETTES.kidPetrol, hat: 'pompom', scarf: 'none', hands: 'mittens' },
  { id: 'k_jacket_coral', label: 'Dětská bunda s oteplovačkami', age: 'child', top: { kind: 'kidJacket', material: 'down', length: 0.12, fit: 'straight', collar: 'stand', closure: 'zip', pockets: 'patch', sleeveVol: 1.1, cuff: 'rib' }, bottom: { kind: 'trousers', width: 'insulated', kneePads: true }, boots: { kind: 'snow', color: BOOTS.navy, sole: '#24242a', trim: '#f1d36b' }, hair: { style: 'pony', color: '#3a2618' }, colors: PALETTES.kidCoral, hat: 'earflap', scarf: 'wrap', hands: 'mittens' },
  { id: 's_coat_grey', label: 'Senior – šedý vlněný kabát', age: 'senior', top: { ...coatLong('straight', 'buttons'), length: 0.7 }, bottom: { kind: 'trousers', width: 'straight' }, boots: { kind: 'ankle', color: BOOTS.black, sole: '#1d1d20' }, hair: { style: 'short', color: '#cfcac4' }, colors: { main: '#6c6f78', support: '#d8d2c6', accent: '#6d2a2a', bottom: '#3a3532' }, hat: 'fitted', scarf: 'wrap', hands: 'gloves' },
];

export function outfitById(id: string): Outfit | undefined { return OUTFITS.find((o) => o.id === id); }
/** Stabilní výběr outfitu podle seedu a věku (stejný seed → stejný vzhled ve všech pohledech). */
export function outfitFor(seed: number, age: Outfit['age']): Outfit {
  const pool = OUTFITS.filter((o) => o.age === age); const list = pool.length ? pool : OUTFITS.filter((o) => o.age === 'adult');
  return list[Math.abs(Math.floor(seed)) % list.length];
}
