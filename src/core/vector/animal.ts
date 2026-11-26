/**
 * Plně vektorový pes a kočka: trup, krk, hlava, uši, nohy, tlapky, ocas, srst i kresba bez rastrů.
 *
 * Kostra (metry, y dolů, zem y = 0, x vpřed): pánev (kyčelní kloub) a hrudník (ramenní kloub) spojené
 * osou páteře, pohyblivá lopatka (posun ramene s fází přední nohy), krk a hlava, čtyři nohy
 * (přední: nadloktí–předloktí–záprstí–tlapka, zadní: stehno–koleno–bérec–hlezno–nárt–tlapka, IK
 * z animalLegs), vícečlánkový ocas (animalTail), úchyty uší.
 * Trup je souvislý obrys v rámci osy páteře (body u/v) – deformuje se s pózou (sed, protažení,
 * plížení), kresba (skvrny, sedlo, žíhání, náprsenka) je kotvená ve stejných souřadnicích.
 * Chůze se řídí uraženou drahou (tlapka v opoře stojí): pes krok (LH→LF→RH→RF) a klus (diagonální
 * páry, jiná opora i pohyb těla), kočka laterální sled s proměnlivými rozestupy a plížení (nízký trup,
 * pokrčené nohy, delší opora).
 */
import { pawTarget, solveLeg, drawLeg, type Marking } from '../render/animalLegs';
import { drawVectorTail, tailProfileOf } from '../render/animalTail';
import { add, clamp, cylShade, hn, lerp, lightOf, mixc, mul, norm, perp, shadeOf, smoothClosed, smoothThrough, sub, withA, type Ctx, type P } from './geom';

export type EarKind = 'prick' | 'drop' | 'semi' | 'bat' | 'cat';
export interface AnimalBuild {
  id: string; label: string; species: 'dog' | 'cat';
  /** výška kyčle a ramene (kloubů) nad zemí, vzdálenost kloubů (m) */ hipH: number; shH: number; len: number;
  /** hloubka hrudníku pod ramenem, vtažení břicha, výška zádě nad kyčlí, šířka hrudi (pro ¾) */ chest: number; tuck: number; rump: number; breadth: number;
  front: [number, number, number]; hind: [number, number, number];
  wFront: [number, number, number, number]; wHind: [number, number, number, number]; paw: [number, number];
  neck: number; neckW: number; head: number; muzzle: number; muzzleH: number; ear: EarKind; earS: number;
  /** srst: délka (0–1), límec/náprsenka, praporce na nohou */ shag: number; ruff: number; feather: number;
  colors: { base: string; belly: string; saddle?: string; legs?: string; paws?: string; nose: string; eye: string; muzzle?: string; earC?: string; chest?: string };
  marks?: { kind: 'spot' | 'patch' | 'stripe' | 'saddle' | 'bib'; u: number; v: number; r: number; color: string }[];
  tail: string; tailLen: number;
  gait: { stride: number; trotAt: number; duty: number; lift: number; bob: number };
}

const dog = (o: Partial<AnimalBuild> & Pick<AnimalBuild, 'id' | 'label' | 'colors'>): AnimalBuild => ({
  species: 'dog', hipH: 0.34, shH: 0.34, len: 0.4, chest: 0.13, tuck: 0.05, rump: 0.05, breadth: 0.16,
  front: [0.13, 0.13, 0.055], hind: [0.14, 0.14, 0.08], wFront: [0.07, 0.05, 0.034, 0.03], wHind: [0.095, 0.06, 0.03, 0.03], paw: [0.06, 0.035],
  neck: 0.15, neckW: 0.09, head: 0.065, muzzle: 0.075, muzzleH: 0.05, ear: 'drop', earS: 1, shag: 0, ruff: 0, feather: 0, tail: 'dog', tailLen: 0.26,
  gait: { stride: 0.55, trotAt: 1.25, duty: 0.66, lift: 0.045, bob: 0.008 }, ...o,
});
const cat = (o: Partial<AnimalBuild> & Pick<AnimalBuild, 'id' | 'label' | 'colors'>): AnimalBuild => ({
  species: 'cat', hipH: 0.2, shH: 0.19, len: 0.27, chest: 0.075, tuck: 0.02, rump: 0.035, breadth: 0.1,
  front: [0.075, 0.075, 0.03], hind: [0.085, 0.085, 0.06], wFront: [0.05, 0.035, 0.026, 0.025], wHind: [0.07, 0.04, 0.026, 0.025], paw: [0.04, 0.024],
  neck: 0.06, neckW: 0.06, head: 0.048, muzzle: 0.022, muzzleH: 0.028, ear: 'cat', earS: 1, shag: 0, ruff: 0, feather: 0, tail: 'cat', tailLen: 0.3,
  gait: { stride: 0.32, trotAt: 9, duty: 0.7, lift: 0.025, bob: 0.003 }, ...o,
});

/** Tělesné typy (ne přebarvení jedné siluety: proporce, hlava, uši, ocas, srst i chůze). */
export const ANIMAL_BUILDS: Record<string, AnimalBuild> = {
  dog_small: dog({ id: 'dog_small', label: 'Drobný krátkosrstý pes', hipH: 0.2, shH: 0.2, len: 0.26, chest: 0.085, tuck: 0.04, rump: 0.03, breadth: 0.11, front: [0.075, 0.07, 0.03], hind: [0.08, 0.075, 0.045], wFront: [0.05, 0.035, 0.025, 0.024], wHind: [0.065, 0.04, 0.024, 0.024], paw: [0.04, 0.024], neck: 0.09, neckW: 0.06, head: 0.048, muzzle: 0.045, muzzleH: 0.035, ear: 'semi', earS: 0.8, tail: 'dog_small', tailLen: 0.15, gait: { stride: 0.34, trotAt: 0.95, duty: 0.64, lift: 0.03, bob: 0.005 }, colors: { base: '#f1ece4', belly: '#f6f2ec', nose: '#2a2222', eye: '#2b1e16', earC: '#b0723e' }, marks: [{ kind: 'patch', u: 0.15, v: 0.25, r: 0.06, color: '#b0723e' }, { kind: 'patch', u: 0.7, v: 0.15, r: 0.04, color: '#3a2a22' }] }),
  dog_dachshund: dog({ id: 'dog_dachshund', label: 'Jezevčík', hipH: 0.15, shH: 0.15, len: 0.36, chest: 0.09, tuck: 0.015, rump: 0.03, breadth: 0.12, front: [0.055, 0.05, 0.025], hind: [0.06, 0.055, 0.035], wFront: [0.055, 0.04, 0.03, 0.03], wHind: [0.065, 0.045, 0.03, 0.03], paw: [0.045, 0.026], neck: 0.11, neckW: 0.07, head: 0.05, muzzle: 0.075, muzzleH: 0.035, ear: 'drop', earS: 1.2, tail: 'dog_dachshund', tailLen: 0.2, gait: { stride: 0.22, trotAt: 0.85, duty: 0.66, lift: 0.022, bob: 0.004 }, colors: { base: '#8a3f1c', belly: '#9c4d26', nose: '#1f1717', eye: '#1e130d' } }),
  dog_retriever: dog({ id: 'dog_retriever', label: 'Retrívr', hipH: 0.36, shH: 0.37, len: 0.44, chest: 0.16, tuck: 0.05, rump: 0.05, breadth: 0.2, front: [0.15, 0.15, 0.06], hind: [0.16, 0.16, 0.095], wFront: [0.09, 0.06, 0.04, 0.038], wHind: [0.12, 0.07, 0.04, 0.038], paw: [0.075, 0.042], neck: 0.16, neckW: 0.11, head: 0.075, muzzle: 0.08, muzzleH: 0.055, ear: 'drop', earS: 1.15, shag: 0.45, ruff: 0.3, feather: 0.5, tail: 'dog_retriever', tailLen: 0.34, gait: { stride: 0.6, trotAt: 1.4, duty: 0.66, lift: 0.05, bob: 0.009 }, colors: { base: '#d6a660', belly: '#e6c48c', nose: '#2a1f1a', eye: '#2b1b10', chest: '#e8cc98' } }),
  dog_shepherd: dog({ id: 'dog_shepherd', label: 'Ovčácký pes', hipH: 0.37, shH: 0.4, len: 0.46, chest: 0.17, tuck: 0.07, rump: 0.03, breadth: 0.18, front: [0.16, 0.16, 0.065], hind: [0.17, 0.18, 0.11], wFront: [0.09, 0.06, 0.04, 0.038], wHind: [0.13, 0.065, 0.038, 0.036], paw: [0.075, 0.04], neck: 0.18, neckW: 0.11, head: 0.075, muzzle: 0.09, muzzleH: 0.05, ear: 'prick', earS: 1.2, shag: 0.3, ruff: 0.2, feather: 0.3, tail: 'dog_shepherd', tailLen: 0.38, gait: { stride: 0.66, trotAt: 1.45, duty: 0.64, lift: 0.055, bob: 0.008 }, colors: { base: '#b9864a', belly: '#c99a5e', saddle: '#2a2420', nose: '#1d1a19', eye: '#2b1b10', muzzle: '#2a2420' }, marks: [{ kind: 'saddle', u: 0.5, v: 0.45, r: 0.5, color: '#2a2420' }] }),
  dog_collie: dog({ id: 'dog_collie', label: 'Border kolie', hipH: 0.33, shH: 0.34, len: 0.42, chest: 0.14, tuck: 0.06, rump: 0.04, breadth: 0.16, front: [0.14, 0.14, 0.06], hind: [0.15, 0.15, 0.095], wFront: [0.08, 0.05, 0.034, 0.033], wHind: [0.12, 0.06, 0.033, 0.033], paw: [0.065, 0.036], neck: 0.15, neckW: 0.1, head: 0.065, muzzle: 0.075, muzzleH: 0.042, ear: 'semi', earS: 1.05, shag: 0.6, ruff: 0.7, feather: 0.6, tail: 'dog_collie', tailLen: 0.32, gait: { stride: 0.56, trotAt: 1.35, duty: 0.65, lift: 0.055, bob: 0.008 }, colors: { base: '#262429', belly: '#efe9e3', legs: '#efe9e3', paws: '#f4efe9', nose: '#1b1a1c', eye: '#3b2514', muzzle: '#efe9e3', chest: '#f2ede7' }, marks: [{ kind: 'bib', u: 0.9, v: 0.55, r: 0.5, color: '#f2ede7' }] }),
  dog_spitz: dog({ id: 'dog_spitz', label: 'Špic / husky', hipH: 0.34, shH: 0.36, len: 0.42, chest: 0.15, tuck: 0.05, rump: 0.04, breadth: 0.18, front: [0.15, 0.15, 0.06], hind: [0.16, 0.16, 0.1], wFront: [0.09, 0.06, 0.04, 0.038], wHind: [0.12, 0.07, 0.04, 0.038], paw: [0.07, 0.04], neck: 0.15, neckW: 0.12, head: 0.07, muzzle: 0.07, muzzleH: 0.045, ear: 'prick', earS: 1, shag: 0.55, ruff: 0.8, feather: 0.2, tail: 'dog_husky', tailLen: 0.3, gait: { stride: 0.58, trotAt: 1.35, duty: 0.64, lift: 0.05, bob: 0.008 }, colors: { base: '#e6e0da', belly: '#efebe6', saddle: '#7c7d86', nose: '#1d1d20', eye: '#4a7eb0', muzzle: '#efebe6' }, marks: [{ kind: 'saddle', u: 0.5, v: 0.5, r: 0.5, color: '#7c7d86' }] }),
  dog_lean: dog({ id: 'dog_lean', label: 'Dlouhonohý štíhlý pes', hipH: 0.42, shH: 0.42, len: 0.42, chest: 0.17, tuck: 0.11, rump: 0.03, breadth: 0.13, front: [0.18, 0.19, 0.07], hind: [0.2, 0.2, 0.11], wFront: [0.07, 0.045, 0.03, 0.03], wHind: [0.1, 0.05, 0.03, 0.03], paw: [0.065, 0.034], neck: 0.2, neckW: 0.075, head: 0.06, muzzle: 0.1, muzzleH: 0.04, ear: 'drop', earS: 0.8, tail: 'dog_dalmatian', tailLen: 0.36, gait: { stride: 0.7, trotAt: 1.55, duty: 0.62, lift: 0.06, bob: 0.007 }, colors: { base: '#f0ede8', belly: '#f4f1ed', nose: '#1d1c22', eye: '#2b1b10' }, marks: [0.1, 0.22, 0.35, 0.5, 0.62, 0.78, 0.9, 0.3, 0.7].map((u, i) => ({ kind: 'spot' as const, u, v: 0.15 + 0.5 * hn(i, 3), r: 0.012 + 0.008 * hn(i, 5), color: '#1d1c22' })) }),
  dog_bernese: dog({ id: 'dog_bernese', label: 'Velký trikolorní pes', hipH: 0.4, shH: 0.42, len: 0.48, chest: 0.19, tuck: 0.04, rump: 0.05, breadth: 0.24, front: [0.17, 0.17, 0.07], hind: [0.18, 0.18, 0.1], wFront: [0.12, 0.085, 0.06, 0.055], wHind: [0.15, 0.095, 0.055, 0.055], paw: [0.085, 0.05], neck: 0.17, neckW: 0.14, head: 0.085, muzzle: 0.08, muzzleH: 0.06, ear: 'drop', earS: 1.1, shag: 0.75, ruff: 0.6, feather: 0.6, tail: 'dog_bernese', tailLen: 0.36, gait: { stride: 0.66, trotAt: 1.45, duty: 0.68, lift: 0.05, bob: 0.012 }, colors: { base: '#1f1d20', belly: '#1f1d20', legs: '#8b4c28', paws: '#ece4dc', nose: '#141314', eye: '#3a2212', muzzle: '#ece4dc', chest: '#efe7df' }, marks: [{ kind: 'bib', u: 0.9, v: 0.5, r: 0.55, color: '#efe7df' }] }),
  dog_frenchie: dog({ id: 'dog_frenchie', label: 'Francouzský buldoček', hipH: 0.2, shH: 0.2, len: 0.26, chest: 0.11, tuck: 0.03, rump: 0.02, breadth: 0.18, front: [0.07, 0.065, 0.03], hind: [0.075, 0.07, 0.045], wFront: [0.07, 0.05, 0.035, 0.035], wHind: [0.08, 0.055, 0.035, 0.035], paw: [0.05, 0.03], neck: 0.06, neckW: 0.1, head: 0.065, muzzle: 0.025, muzzleH: 0.05, ear: 'bat', earS: 1, tail: 'dog_frenchie', tailLen: 0.06, gait: { stride: 0.3, trotAt: 0.9, duty: 0.66, lift: 0.028, bob: 0.006 }, colors: { base: '#c99b63', belly: '#d8b07c', nose: '#1e1a18', eye: '#24160e', muzzle: '#3a2a22' } }),
  dog: dog({ id: 'dog', label: 'Bígl', hipH: 0.27, shH: 0.27, len: 0.34, chest: 0.12, tuck: 0.04, rump: 0.04, breadth: 0.15, front: [0.1, 0.1, 0.045], hind: [0.11, 0.1, 0.065], wFront: [0.065, 0.045, 0.032, 0.03], wHind: [0.09, 0.05, 0.03, 0.03], paw: [0.055, 0.032], neck: 0.12, neckW: 0.08, head: 0.058, muzzle: 0.06, muzzleH: 0.045, ear: 'drop', earS: 1.2, tail: 'dog', tailLen: 0.22, gait: { stride: 0.44, trotAt: 1.15, duty: 0.65, lift: 0.04, bob: 0.007 }, colors: { base: '#b07a45', belly: '#f1ebe2', legs: '#f1ebe2', paws: '#f4efe8', saddle: '#2e2622', nose: '#1f1a18', eye: '#2b1b10', muzzle: '#f1ebe2' }, marks: [{ kind: 'saddle', u: 0.45, v: 0.4, r: 0.45, color: '#2e2622' }, { kind: 'bib', u: 0.9, v: 0.6, r: 0.5, color: '#f1ebe2' }] }),
  // kočky
  cat: cat({ id: 'cat', label: 'Štíhlá krátkosrstá kočka (mourek)', colors: { base: '#8d7b66', belly: '#b3a28c', nose: '#c9867c', eye: '#9aa84a' }, marks: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((u) => ({ kind: 'stripe' as const, u, v: 0.62, r: 0.011, color: '#4e4337' })) }),
  cat_british: cat({ id: 'cat_british', label: 'Robustní krátkosrstá kočka', hipH: 0.19, shH: 0.18, len: 0.28, chest: 0.09, tuck: 0.005, rump: 0.04, breadth: 0.13, front: [0.072, 0.068, 0.03], hind: [0.082, 0.078, 0.058], wFront: [0.068, 0.05, 0.038, 0.036], wHind: [0.09, 0.055, 0.036, 0.035], paw: [0.045, 0.028], neck: 0.05, neckW: 0.075, head: 0.056, muzzle: 0.02, muzzleH: 0.03, earS: 0.75, shag: 0.15, tail: 'cat_british', tailLen: 0.25, gait: { stride: 0.3, trotAt: 9, duty: 0.72, lift: 0.022, bob: 0.003 }, colors: { base: '#727a8c', belly: '#7d8496', nose: '#7d6a72', eye: '#d39a3a' } }),
  cat_mainecoon: cat({ id: 'cat_mainecoon', label: 'Dlouhosrstá kočka', hipH: 0.22, shH: 0.21, len: 0.33, chest: 0.1, tuck: 0.0, rump: 0.04, breadth: 0.14, front: [0.085, 0.08, 0.035], hind: [0.095, 0.09, 0.065], wFront: [0.075, 0.055, 0.042, 0.04], wHind: [0.1, 0.06, 0.04, 0.04], paw: [0.05, 0.03], neck: 0.06, neckW: 0.085, head: 0.056, muzzle: 0.025, muzzleH: 0.032, earS: 1.25, shag: 0.85, ruff: 0.9, feather: 0.6, tail: 'cat_mainecoon', tailLen: 0.36, gait: { stride: 0.36, trotAt: 9, duty: 0.7, lift: 0.028, bob: 0.003 }, colors: { base: '#c97a3c', belly: '#e8c49a', nose: '#c97a72', eye: '#9aa84a', chest: '#f0d6b4' }, marks: [0.15, 0.35, 0.55, 0.75].map((u) => ({ kind: 'stripe' as const, u, v: 0.5, r: 0.014, color: '#9a5422' })) }),
  cat_kitten: cat({ id: 'cat_kitten', label: 'Kotě', hipH: 0.12, shH: 0.115, len: 0.16, chest: 0.05, tuck: 0.005, rump: 0.02, breadth: 0.07, front: [0.045, 0.045, 0.02], hind: [0.05, 0.05, 0.035], wFront: [0.035, 0.026, 0.02, 0.02], wHind: [0.045, 0.03, 0.02, 0.02], paw: [0.03, 0.018], neck: 0.035, neckW: 0.045, head: 0.042, muzzle: 0.015, muzzleH: 0.02, earS: 1.15, shag: 0.3, tail: 'cat', tailLen: 0.16, gait: { stride: 0.2, trotAt: 9, duty: 0.66, lift: 0.02, bob: 0.004 }, colors: { base: '#e9e2d8', belly: '#f3eee6', nose: '#e2a0a0', eye: '#7fa6c8' }, marks: [{ kind: 'patch', u: 0.3, v: 0.2, r: 0.04, color: '#d38c4e' }, { kind: 'patch', u: 0.75, v: 0.25, r: 0.03, color: '#3a3330' }] }),
};
/** Rasa ze simulace → tělesný typ. */
export const buildOf = (breed: string | undefined, species: 'dog' | 'cat'): AnimalBuild =>
  ANIMAL_BUILDS[breed === 'dog_husky' ? 'dog_spitz' : breed === 'dog_dalmatian' ? 'dog_lean' : breed ?? species] ?? ANIMAL_BUILDS[species];

export interface AnimalPoseIn {
  /** uražená dráha (m), rychlost (m/s), čas (s) */ dist: number; speed: number; t: number;
  mode: string; sit: number; headDown: number; since?: number; until?: number;
  /** natočení: 0 = z boku, > 0 k divákovi (¾ zepředu), < 0 od diváka */ yaw: number;
  /** pohled hlavy dozadu (0..1), zvednutí hlavy (0..1), vzrušení (vrtění) */ lookBack?: number; alert?: number; excite?: number;
  seed: number;
}

const LEG_IDS = ['LH', 'LF', 'RH', 'RF'] as const;
/** fázové posuny nohou: pes krok (laterální sled), klus (diagonální páry), kočka chůze a plížení */
const OFFS = {
  walk: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 },
  trot: { LH: 0, RF: 0, RH: 0.5, LF: 0.5 },
  catWalk: { LH: 0, LF: 0.2, RH: 0.5, RF: 0.7 },
  stalk: { LH: 0, LF: 0.3, RH: 0.5, RF: 0.8 },
};
const cmix = (a: number, b: number, k: number) => { let d = b - a; d -= Math.round(d); return a + d * k; };

/**
 * Vykreslí zvíře s tlapkami na zemi v (0,0), čelem doprava (zrcadlení dělá volající).
 * `ppm` = px na metr. Vrací body pro ladění (klouby, kontakty).
 */
export function drawVectorAnimal(ctx: Ctx, b: AnimalBuild, s: AnimalPoseIn, ppm: number, debug = false): { x: number; y: number; c: string }[] {
  const dbg: { x: number; y: number; c: string }[] = [];
  const isDog = b.species === 'dog', C = b.colors;
  const yaw = clamp(s.yaw, -1, 1), back3 = yaw < -0.35, front3 = yaw > 0.35;
  const kx = 1 - 0.28 * Math.abs(yaw); // zkrácení délky v ¾ pohledu (hloubka se doplní šířkou)
  const age = s.t - (s.since ?? s.t), env = (x: number) => clamp(x, 0, 1);
  // ---- režim chůze: síla, klus (pes), plížení (kočka)
  const walk = ['jump', 'jumpDown', 'prep'].includes(s.mode) ? 0 : Math.min(1, s.speed / 0.22);
  const trot = isDog ? env((s.speed - b.gait.trotAt) / 0.25) : 0;
  const stalk = !isDog && s.mode === 'notice' ? 1 : 0;
  const stride = b.gait.stride * (1 + 0.32 * trot) * (1 - 0.25 * stalk);
  const duty = clamp(lerp(b.gait.duty, 0.44, trot) + 0.08 * stalk - 0.06 * Math.min(1, s.speed / 1.5) * (1 - trot), 0.4, 0.8);
  const phase = ((s.dist / stride) % 1 + 1) % 1;
  const off = (id: typeof LEG_IDS[number]) => isDog ? cmix(OFFS.walk[id], OFFS.trot[id], trot) : cmix(OFFS.catWalk[id] + (id === 'LF' || id === 'RF' ? 0.03 * Math.sin(s.dist * 0.7 + s.seed) : 0), OFFS.stalk[id], stalk);
  // ---- výška trupu: sed (zadek k zemi), plížení (nízko), protažení, příprava ke skoku, let
  const sit = env(s.sit), st = s.mode === 'stretch' ? env(age / 0.45) * env(((s.until ?? s.t) - s.t) / 0.45) : 0;
  const prep = s.mode === 'prep' ? env(age / 0.25) : 0, fly = s.mode === 'jump' || s.mode === 'jumpDown' ? Math.sin(Math.PI * env(age / 0.5)) : 0;
  const land = s.mode === 'sit' && age < 0.35 && (s.since ?? 0) > 0 ? Math.sin(Math.PI * env(age / 0.35)) * 0.6 : 0; // dopad: pruží
  const crouch = Math.max(stalk * 0.28, prep * 0.3, land * 0.25);
  const bob = (isDog ? Math.sin(phase * Math.PI * 4) * b.gait.bob * (1 - 0.4 * trot) + Math.abs(Math.sin(phase * Math.PI * 2)) * trot * b.gait.bob * 1.2 : Math.sin(phase * Math.PI * 4) * b.gait.bob) * walk;
  const LFl = b.front[0] + b.front[1] + b.front[2], LHl = b.hind[0] + b.hind[1] + b.hind[2];
  let hip: P = { x: -b.len / 2 * kx, y: -(b.hipH * (1 - crouch) + bob) };
  let sh: P = { x: b.len / 2 * kx, y: -(b.shH * (1 - crouch * 0.9) + bob * 0.8) };
  // sed: pánev k zemi a mírně dopředu, hrudník vzhůru (přední nohy rovně)
  if (sit > 0) { hip = { x: lerp(hip.x, hip.x + b.len * (isDog ? 0.12 : 0.42), sit), y: lerp(hip.y, -b.hind[2] * 0.75 - b.rump * 0.5, sit) }; sh = { x: lerp(sh.x, sh.x - b.len * (isDog ? 0.05 : 0.12), sit), y: lerp(sh.y, -(LFl * 0.97 + (isDog ? 0 : b.chest * 0.6)), sit) }; }
  if (st > 0) { sh = { x: sh.x + b.len * 0.15 * st, y: sh.y + b.shH * 0.45 * st }; hip = { x: hip.x, y: hip.y - b.hipH * 0.05 * st }; }
  if (fly > 0) { hip = { x: hip.x, y: hip.y - b.hipH * 0.15 * fly }; sh = { x: sh.x, y: sh.y - b.shH * 0.3 * fly }; }
  // posun lopatky: rameno jde s přední nohou (viditelný pohyb lopatky)
  const scap = (ph: number) => Math.sin(ph * Math.PI * 2) * b.len * 0.035 * walk;
  // ---- rámec trupu (osa kyčel → rameno)
  const ax = norm(sub(sh, hip)), nv = perp(ax); // nv: kolmice „dolů“ (při ose doprava je perp (0,1))
  const nd = nv.y > 0 ? nv : { x: -nv.x, y: -nv.y };
  const AL = Math.hypot(sh.x - hip.x, sh.y - hip.y);
  const TB = (u: number, v: number): P => ({ x: hip.x + ax.x * u * AL + nd.x * v, y: hip.y + ax.y * u * AL + nd.y * v });
  const px = (p: P): P => ({ x: p.x * ppm, y: p.y * ppm });
  // výška hřbetu a břicha podél trupu (m od osy kloubů): záď, bedra, kohoutek / zadek, slabiny, hrudník
  const top = (u: number) => -(lerp(b.rump, b.chest * 0.42, u) + 0.012 * Math.sin(Math.PI * u) * (isDog ? 1 : 2.2)); // kočka: klenutější hřbet
  const bot = (u: number) => u < 0.18 ? lerp(b.rump * 0.4, b.chest * 0.45 - b.tuck, u / 0.18) : u < 0.5 ? lerp(b.chest * 0.45 - b.tuck, b.chest * 0.8, (u - 0.18) / 0.32) : u < 0.86 ? lerp(b.chest * 0.8, b.chest, (u - 0.5) / 0.36) : lerp(b.chest, b.chest * 0.45, (u - 0.86) / 0.14);
  const tailRoot = TB(-0.12, top(0) * 0.85);
  const torsoPts = (): P[] => {
    const pts: P[] = [];
    // hřbet zezadu dopředu
    for (const u of [-0.08, 0.1, 0.35, 0.6, 0.85, 1.02]) pts.push(TB(u, top(u)));
    // přechod do krku (kohoutek, předhrudí)
    pts.push(TB(1.12, top(1) * 0.55), TB(1.17, b.chest * 0.2), TB(1.1, b.chest * 0.7));
    // hrudník, slabiny, stehno zezadu
    for (const u of [0.92, 0.7, 0.45, 0.22, 0.08]) pts.push(TB(u, bot(u)));
    pts.push(TB(-0.12, b.rump * 0.55), TB(-0.17, b.rump * 0.0 - 0.01));
    return pts.map(px);
  };
  const tPts = torsoPts();
  const tPath = () => { ctx.beginPath(); smoothClosed(ctx, tPts, 0.85); };
  // ---- nohy
  const sideDepth = b.breadth * (0.25 + 0.6 * Math.abs(yaw)); // posun vzdálených nohou (hloubka)
  const legs: Record<string, () => void> = {};
  for (const id of LEG_IDS) {
    const front = id[1] === 'F', far = id[0] === 'L';
    const segs = (front ? b.front : b.hind).map((x) => x * ppm) as [number, number, number];
    const ph = (phase + off(id)) % 1;
    let R0 = front ? { x: sh.x + scap(ph), y: sh.y } : hip;
    if (far) R0 = { x: R0.x - sideDepth * 0.15 * (back3 ? -1 : 1), y: R0.y - sideDepth * 0.2 };
    const R = px(R0), S = stride * ppm;
    let tg = pawTarget(walk > 0.02 ? ph : 0, duty, walk, R.x, S, b.gait.lift * ppm * (1 - 0.5 * stalk) * (1 + 1.4 * trot), front);
    let T = { x: tg.x, y: tg.y - (far ? sideDepth * 0.2 * ppm : 0) };
    if (sit > 0 && !front) { T = { x: lerp(T.x, R.x + (b.hind[0] * 0.9) * ppm, sit), y: T.y }; tg = { ...tg, contact: true, q: 0, roll: 0 }; }
    if (st > 0 && front) T = { x: T.x + LFl * 0.6 * st * ppm, y: T.y };
    if (fly > 0) { const ang = (front ? 0.9 : -0.95) * fly, R2 = (front ? LFl : LHl) * ppm * 0.95; T = { x: R.x + Math.sin(ang) * R2, y: R.y + Math.cos(ang) * R2 }; }
    const sol = solveLeg(R, T, segs, front, tg.q, tg.contact && fly === 0, tg.roll, sit > 0.3 && !front ? lerp(0.38, -1.35, sit) : undefined);
    const legC = C.legs ?? C.base, lower = C.legs ?? mixc(C.base, C.belly, 0.4);
    const col = far ? { upper: shadeOf(C.base, 0.18), lower: shadeOf(lower, 0.18), paw: shadeOf(C.paws ?? lower, 0.18) } : { upper: C.base, lower: legC === C.base ? lower : legC, paw: C.paws ?? (legC === C.base ? lower : legC) };
    const wv = (front ? b.wFront : b.wHind).map((x) => x * ppm) as [number, number, number, number];
    legs[id] = () => {
      // vzdálené nohy nikdy nad hřbetní linií (jinak by kořen vyčníval nad záda)
      if (far) { ctx.save(); ctx.beginPath(); const tp = [-0.3, 0, 0.3, 0.6, 0.9, 1.05].map((u) => px(TB(u, top(u) * 0.6))); ctx.moveTo(tp[0].x - 5 * ppm, tp[0].y); for (const q of tp) ctx.lineTo(q.x, q.y); ctx.lineTo(tp[tp.length - 1].x + 5 * ppm, tp[tp.length - 1].y); ctx.lineTo(tp[tp.length - 1].x + 5 * ppm, 2 * ppm); ctx.lineTo(tp[0].x - 5 * ppm, 2 * ppm); ctx.closePath(); ctx.clip(); }
      drawLeg(ctx, sol, wv, [b.paw[0] * ppm, b.paw[1] * ppm], col, b.shag * 0.6, undefined as Marking[] | undefined, far, (front ? 11 : 23) + (far ? 5 : 0), front);
      // praporce (dlouhá srst za nohou) – pár měkkých chomáčů na zadní straně článku
      if (b.feather > 0.2) { const [A, B2] = [sol.pts[front ? 1 : 0], sol.pts[front ? 2 : 1]], d = norm(sub(B2, A)), nb = perp(d), sgn = front ? 1 : -1; ctx.fillStyle = col.upper; ctx.beginPath(); const m0 = add(A, mul(sub(B2, A), 0.3)), m1 = add(A, mul(sub(B2, A), 0.85)); smoothClosed(ctx, [add(m0, mul(nb, sgn * wv[1] * 0.3)), add(add(m0, mul(sub(m1, m0), 0.5)), mul(nb, sgn * wv[1] * (0.6 + b.feather * 0.5))), add(m1, mul(nb, sgn * wv[1] * 0.25)), m1, m0], 0.6); ctx.fill(); }
      if (far) ctx.restore();
      if (debug) dbg.push({ ...sol.pts[0], c: '#ff00e6' }, { ...sol.pts[1], c: '#ffd400' }, { ...sol.pts[2], c: '#ff8000' }, { ...sol.paw, c: tg.contact ? '#00ff80' : '#00e5ff' });
    };
  }
  // ---- krk a hlava
  const headDown = clamp(s.headDown, 0, 1), alert = clamp(s.alert ?? 0, 0, 1), lookBack = clamp(s.lookBack ?? 0, 0, 1);
  const neckBase = TB(1.08, top(1) * 0.2);
  const neckAng = (isDog ? -0.95 : -0.75) + headDown * 1.45 - alert * 0.25 + st * 0.5 + sit * -0.25 - stalk * 0.55 + fly * 0.2; // od vodorovné (záporné = nahoru)
  const nl = b.neck * (1 + alert * 0.1) * (1 - 0.15 * stalk), headCompY = isDog ? 0 : -bob * 0.85; // kočka drží hlavu klidně
  const neckEnd = add(neckBase, { x: Math.cos(neckAng) * nl * kx, y: Math.sin(neckAng) * nl + headCompY });
  const headC = add(neckEnd, { x: b.head * 0.35, y: -b.head * 0.15 });
  const headTilt = headDown * 0.5 - alert * 0.1 + st * 0.3;
  // ---- vykreslení (pořadí vrstev)
  const tail = tailProfileOf(b.tail, b.species);
  const drawTail = () => {
    const tr = px(tailRoot);
    const tp = sit > 0.5 ? (isDog ? { ...tail, base: -0.2, droop: 0.4 } : { ...tail, base: -0.75, curl: 0.075, droop: 0, wag: tail.wag * 0.4 }) : stalk ? { ...tail, base: -0.35, curl: 0.05 } : tail;
    drawVectorTail(ctx, tp, b.species, tr.x, tr.y, b.tailLen * ppm, s.t, walk, phase, s.excite ?? 0, back3, s.seed);
  };
  const drawNeckHead = () => {
    // krk: souvislá trubice z hrudi (stejná barva, bez švu), hříva/límec u dlouhé srsti
    const nb = px(neckBase), ne = px(neckEnd), d = norm(sub(ne, nb)), nn = perp(d), w0 = b.neckW * ppm, w1 = b.neckW * 0.75 * ppm;
    const nPath = () => { ctx.beginPath(); smoothClosed(ctx, [add(nb, mul(nn, w0 * 0.75)), add(ne, mul(nn, w1 * 0.55)), add(add(ne, mul(d, w1 * 0.2)), mul(nn, -w1 * 0.1)), add(ne, mul(nn, -w1 * 0.55)), add(nb, mul(nn, -w0 * 0.65)), add(nb, mul(d, -w0 * 0.4))], 0.7); };
    ctx.fillStyle = C.base; nPath(); ctx.fill();
    cylShade(ctx, nPath, add(nb, mul(nn, w0 * 0.6)), add(nb, mul(nn, -w0 * 0.6)), C.base, 0.6);
    if (C.chest || b.ruff > 0.3) {
      // náprsenka / límec na přední straně krku a hrudi: velká plocha s několika chomáči (ne jednotlivé chlupy)
      const col = C.chest ?? C.base, tt = nn.x > 0 ? nn : { x: -nn.x, y: -nn.y }, rf = b.ruff;
      const edge: P[] = [];
      for (let k = 0; k <= 4; k++) { const q = k / 4, base = add(mix(ne, nb, q), mul(d, -w0 * 0.55 * q * q)), wv = w1 * 0.45 + (w0 * (0.55 + 0.3 * rf) - w1 * 0.45) * Math.sin(Math.PI * Math.min(1, q * 0.75)); edge.push(add(base, mul(tt, wv + (k % 2 ? w0 * 0.1 * rf : 0)))); }
      ctx.fillStyle = col; ctx.beginPath();
      smoothClosed(ctx, [...edge, add(add(nb, mul(d, -w0 * 0.9)), mul(tt, w0 * 0.1)), add(nb, mul(tt, -w0 * 0.05)), add(mix(nb, ne, 0.5), mul(tt, w0 * 0.15))], 0.7); ctx.fill();
    }
    drawHead(px(headC), headTilt);
  };
  const mix = (a: P, c: P, k: number): P => ({ x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k });
  const drawHead = (H: P, tilt: number) => {
    const r = b.head * ppm, flip = lookBack > 0.5 ? -1 : 1;
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(tilt * flip); ctx.scale(flip, 1);
    const face = front3 ? 0.55 : back3 ? -1 : 0; // ¾ k divákovi: kratší čenich, obě oči
    const mL = b.muzzle * ppm * (1 - 0.45 * Math.max(0, face)), mH = b.muzzleH * ppm;
    const earBase = isDog ? { x: -r * 0.25, y: -r * 0.75 } : { x: -r * 0.05, y: -r * 0.8 };
    const drawEar = (far: boolean) => {
      const sgn = far ? 1 : 0, col = far ? shadeOf(C.earC ?? C.base, 0.2) : (C.earC ?? C.base), es = b.earS * r;
      const e0 = { x: earBase.x + (far ? r * 0.35 : 0) - (front3 && far ? r * 0.2 : 0), y: earBase.y + (far ? r * 0.05 : 0) };
      // uši: dlouhé psí s větší setrvačností (kmit s krokem, se zpožděním), kočičí natáčení / cuknutí
      const swing = isDog ? Math.sin((phase - 0.15) * Math.PI * 4) * 0.12 * walk + Math.sin(s.t * 2.1 + s.seed) * 0.03 : (Math.sin(s.t * 0.35 + s.seed * 2) > 0.97 ? 0.35 : 0) + alert * -0.15;
      ctx.fillStyle = col; ctx.beginPath();
      if (b.ear === 'drop') { ctx.save(); ctx.translate(e0.x, e0.y); ctx.rotate(swing + 0.15); smoothClosed(ctx, [{ x: -es * 0.15, y: 0 }, { x: es * 0.35, y: -es * 0.05 }, { x: es * 0.32, y: es * 0.9 }, { x: es * 0.05, y: es * 1.25 }, { x: -es * 0.3, y: es * 0.85 }], 0.8); ctx.fill(); ctx.restore(); }
      else if (b.ear === 'semi') { ctx.save(); ctx.translate(e0.x, e0.y); ctx.rotate(swing * 0.5); smoothClosed(ctx, [{ x: -es * 0.3, y: es * 0.15 }, { x: -es * 0.05, y: -es * 0.75 }, { x: es * 0.35, y: -es * 0.55 }, { x: es * 0.2, y: es * 0.15 }], 0.6); ctx.fill(); ctx.restore(); }
      else if (b.ear === 'bat') { ctx.save(); ctx.translate(e0.x, e0.y); smoothClosed(ctx, [{ x: -es * 0.4, y: es * 0.1 }, { x: -es * 0.35, y: -es * 0.9 }, { x: es * 0.2, y: -es * 0.95 }, { x: es * 0.3, y: es * 0.1 }], 0.7); ctx.fill(); ctx.fillStyle = mixc(col, '#e8b0a8', 0.45); ctx.beginPath(); smoothClosed(ctx, [{ x: -es * 0.25, y: 0 }, { x: -es * 0.22, y: -es * 0.7 }, { x: es * 0.12, y: -es * 0.72 }, { x: es * 0.18, y: 0 }], 0.7); ctx.fill(); ctx.restore(); }
      else { // vztyčené (prick) / kočičí
        ctx.save(); ctx.translate(e0.x, e0.y); ctx.rotate(swing - (isDog ? 0.15 : 0.05));
        const h = es * (isDog ? 1.2 : 0.95), w = es * (isDog ? 0.55 : 0.6);
        smoothClosed(ctx, [{ x: -w * 0.6, y: es * 0.15 }, { x: -w * 0.1, y: -h }, { x: w * 0.55, y: es * 0.15 }], 0.35); ctx.fill();
        if (!far && !back3) { ctx.fillStyle = mixc(col, '#f0c4bc', 0.5); ctx.beginPath(); smoothClosed(ctx, [{ x: -w * 0.3, y: es * 0.05 }, { x: -w * 0.08, y: -h * 0.7 }, { x: w * 0.3, y: es * 0.05 }], 0.35); ctx.fill(); }
        ctx.restore();
      }
    };
    drawEar(true);
    // lebka + čenich (souvislý obrys)
    const skull: P[] = isDog
      ? [{ x: -r * 0.95, y: -r * 0.05 }, { x: -r * 0.55, y: -r * 0.85 }, { x: r * 0.35, y: -r * 0.85 }, { x: r * 0.7, y: -r * 0.35 }, { x: r * 0.55 + mL * 0.5, y: -r * 0.3 + mH * 0.05 }, { x: r * 0.55 + mL, y: -r * 0.12 }, { x: r * 0.6 + mL, y: -r * 0.05 + mH * 0.5 }, { x: r * 0.4 + mL * 0.5, y: mH * 0.7 }, { x: r * 0.2, y: r * 0.6 }, { x: -r * 0.6, y: r * 0.6 }]
      : [{ x: -r * 0.95, y: 0 }, { x: -r * 0.6, y: -r * 0.8 }, { x: r * 0.4, y: -r * 0.82 }, { x: r * 0.9, y: -r * 0.2 }, { x: r * 0.85 + mL, y: r * 0.05 }, { x: r * 0.8 + mL * 0.6, y: r * 0.35 }, { x: r * 0.4, y: r * 0.72 }, { x: -r * 0.55, y: r * 0.7 }];
    const sk = () => { ctx.beginPath(); smoothClosed(ctx, back3 ? skull.slice(0, 4).concat([{ x: r * 0.4, y: r * 0.7 }, { x: -r * 0.55, y: r * 0.7 }]) : skull, 0.85); };
    ctx.fillStyle = C.base; sk(); ctx.fill();
    cylShade(ctx, sk, { x: 0, y: -r }, { x: 0, y: r }, C.base, 0.55);
    ctx.save(); sk(); ctx.clip();
    if (C.muzzle && !back3) { ctx.fillStyle = C.muzzle; ctx.beginPath(); smoothClosed(ctx, [{ x: r * 0.35, y: -r * 0.1 }, { x: r * 0.6 + mL, y: -r * 0.2 }, { x: r * 0.7 + mL, y: mH }, { x: r * 0.1, y: r * 0.8 }, { x: -r * 0.1, y: r * 0.3 }], 0.7); ctx.fill(); }
    if (b.shag > 0.5 && !isDog) { ctx.fillStyle = lightOf(C.belly, 0.1); ctx.beginPath(); smoothClosed(ctx, [{ x: -r * 0.4, y: r * 0.2 }, { x: r * 0.5, y: r * 0.3 }, { x: r * 0.3, y: r * 0.95 }, { x: -r * 0.2, y: r * 1.0 }, { x: -r * 0.7, y: r * 0.7 }], 0.7); ctx.fill(); }
    ctx.restore();
    if (b.shag > 0.5 && !isDog) { ctx.fillStyle = C.base; ctx.beginPath(); for (let k = 0; k < 4; k++) { const a0 = 1.9 + k * 0.32, p0 = { x: Math.cos(a0) * r * 0.95, y: Math.sin(a0) * r * 0.9 }; ctx.moveTo(p0.x, p0.y); ctx.lineTo(p0.x - r * 0.18, p0.y + r * 0.22); ctx.lineTo(p0.x + r * 0.1, p0.y + r * 0.08); } ctx.fill(); }
    if (!back3) {
      // oko, nos, tlama (+ druhé oko v ¾ pohledu)
      const eye = isDog ? { x: r * 0.3, y: -r * 0.32 } : { x: r * 0.42, y: -r * 0.22 };
      const eyes = front3 ? [eye, { x: eye.x + r * 0.55, y: eye.y + r * 0.02 }] : [eye];
      for (const e of eyes) { if (isDog) { ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(e.x, e.y, r * 0.11, r * 0.12, 0, 0, Math.PI * 2); ctx.fill(); } else { ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(e.x, e.y, r * 0.16, r * 0.11, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#141212'; ctx.beginPath(); ctx.ellipse(e.x + r * 0.02, e.y, r * 0.04, r * 0.1, 0, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(e.x + r * 0.04, e.y - r * 0.04, r * 0.03, 0, Math.PI * 2); ctx.fill(); }
      const nose = isDog ? { x: r * 0.6 + mL, y: -r * 0.08 } : { x: r * 0.85 + mL, y: r * 0.1 };
      ctx.fillStyle = C.nose; ctx.beginPath(); ctx.ellipse(nose.x, nose.y, r * (isDog ? 0.16 : 0.08), r * (isDog ? 0.12 : 0.06), 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shadeOf(C.muzzle ?? C.base, 0.5); ctx.lineWidth = Math.max(0.6, r * 0.05); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(nose.x - r * 0.05, nose.y + r * 0.12); ctx.quadraticCurveTo(nose.x - mL * 0.4, nose.y + mH * 0.75, nose.x - mL * 0.8 - r * 0.1, nose.y + mH * 0.55); ctx.stroke();
      if (!isDog) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.4, r * 0.02); for (const dy of [-0.05, 0.05, 0.14]) { ctx.beginPath(); ctx.moveTo(nose.x - r * 0.2, nose.y + r * (0.15 + dy)); ctx.lineTo(nose.x + r * 0.55, nose.y + r * (0.1 + dy * 1.6)); ctx.stroke(); } }
    }
    drawEar(false);
    ctx.restore();
  };
  const drawTorso = () => {
    ctx.fillStyle = C.base; tPath(); ctx.fill();
    // objem: světlejší hřbet, tmavší spodek (světlo shora), břicho ve světlejší barvě
    ctx.save(); tPath(); ctx.clip();
    if (C.belly !== C.base) { ctx.fillStyle = C.belly; ctx.beginPath(); smoothClosed(ctx, [TB(0.05, bot(0.05) * 0.55), TB(0.4, bot(0.4) * 0.6), TB(0.8, bot(0.8) * 0.7), TB(0.95, bot(0.95) * 1.3), TB(0.4, bot(0.4) * 1.4), TB(0.05, bot(0.05) * 1.4)].map(px), 0.8); ctx.fill(); }
    // kresba kotvená v souřadnicích trupu (deformuje se s ním)
    for (const m of b.marks ?? []) {
      ctx.fillStyle = m.color; ctx.strokeStyle = m.color;
      if (m.kind === 'spot' || m.kind === 'patch') { const c0 = px(TB(m.u, lerp(top(m.u), bot(m.u), m.v))); ctx.beginPath(); if (m.kind === 'spot') ctx.ellipse(c0.x, c0.y, m.r * ppm, m.r * 0.8 * ppm, Math.atan2(ax.y, ax.x), 0, Math.PI * 2); else smoothClosed(ctx, [0, 1, 2, 3, 4, 5].map((k) => ({ x: c0.x + Math.cos(k * 1.05) * m.r * ppm * (0.8 + 0.35 * hn(k, m.u * 10)), y: c0.y + Math.sin(k * 1.05) * m.r * ppm * (0.7 + 0.3 * hn(k + 9, m.u * 10)) })), 0.9); ctx.fill(); }
      else if (m.kind === 'saddle') { ctx.beginPath(); smoothClosed(ctx, [TB(0.0, top(0) * 1.2), TB(0.5, top(0.5) * 1.2), TB(1.0, top(1) * 1.2), TB(0.95, lerp(top(0.95), bot(0.95), m.v * 0.8)), TB(0.6, lerp(top(0.6), bot(0.6), m.v)), TB(0.2, lerp(top(0.2), bot(0.2), m.v * 1.1)), TB(-0.05, lerp(top(0), bot(0), m.v))].map(px), 0.8); ctx.fill(); }
      else if (m.kind === 'bib') { ctx.beginPath(); smoothClosed(ctx, [TB(0.8, bot(0.8) * 0.4), TB(1.2, b.chest * 0.1), TB(1.15, b.chest * 1.1), TB(0.75, bot(0.75) * 1.2)].map(px), 0.8); ctx.fill(); }
      else if (m.kind === 'stripe') { ctx.lineWidth = m.r * ppm; ctx.lineCap = 'round'; ctx.globalAlpha = 0.75; ctx.beginPath(); smoothThrough(ctx, [TB(m.u + 0.02, top(m.u) * 1.1), TB(m.u - 0.03, lerp(top(m.u), bot(m.u), m.v * 0.5)), TB(m.u + 0.01, lerp(top(m.u), bot(m.u), m.v))].map(px), true); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    ctx.restore();
    cylShade(ctx, tPath, px(TB(0.5, top(0.5))), px(TB(0.5, bot(0.5))), C.base, 0.7);
    // srst: pár chomáčů na charakteristických místech (spodek hrudi, slabiny) – ne každý chlup
    if (b.shag > 0.25) {
      ctx.fillStyle = C.belly; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const u = 0.3 + k * 0.11, p0 = px(TB(u, bot(u) * 0.97)), p1 = px(TB(u - 0.04, bot(u) * (1 + 0.15 * b.shag))); const p2 = px(TB(u + 0.03, bot(u) * 0.97)); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo((p0.x + p1.x) / 2, p1.y, p1.x, p1.y); ctx.lineTo(p2.x, p2.y); }
      ctx.fill();
    }
  };
  // stehno a rameno přes kořeny bližších nohou (přirozené napojení, žádný čep)
  const drawJoins = () => {
    ctx.save(); tPath(); ctx.clip();
    for (const [c0, rr, col] of [[TB(0.02, b.rump * 0.25), b.wHind[0] * 0.75, C.base], [TB(0.97, b.chest * 0.35), b.wFront[0] * 0.65, C.base]] as [P, number, string][]) {
      const c = px(c0), g = ctx.createRadialGradient(c.x, c.y - rr * ppm * 0.3, 0, c.x, c.y, rr * ppm * 1.25);
      g.addColorStop(0, withA(lightOf(col, 0.12), 0.5)); g.addColorStop(0.7, withA(col, 0.25)); g.addColorStop(1, withA(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c.x, c.y, rr * ppm * 1.25, rr * ppm * 1.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
  // ---- pořadí
  if (!back3) { legs.LH(); legs.LF(); drawTail(); }
  else { legs.LH(); legs.LF(); }
  if (front3) { drawTorso(); legs.RH(); legs.RF(); drawJoins(); drawNeckHead(); }
  else if (back3) { drawNeckHead(); drawTorso(); legs.RH(); legs.RF(); drawJoins(); drawTail(); }
  else { drawTorso(); legs.RH(); legs.RF(); drawJoins(); drawNeckHead(); }
  if (debug) { for (const q of [hip, sh, neckBase, headC, tailRoot]) dbg.push({ ...px(q), c: '#ffffff' }); }
  return dbg;
}
