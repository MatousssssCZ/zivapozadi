/**
 * Chůze starších lidí (zadání „Chůze seniorů“):
 *  A – pomalá chůze bez opory: krok 0,50 m, kadence 100 kroků/min → 0,83 m/s,
 *  B – chůze s jednou holí: krok 0,38 m, kadence 84 kroků/min → 0,53 m/s; hůl v pravé ruce podpírá
 *      levou nohu (zrcadlově levá ruka / pravá noha). Hůl se přesune jednou za celý cyklus – současně
 *      s podpíranou nohou (švih hole = švih nohy), hrot stojí ve světě, dokud je noha na zemi.
 * Délka hole je pevná (podle výšky zápěstí postavy), ruka drží rukojeť; náklon hole se dopočítá.
 */
import type { Direction } from './manifest';
import { viewForDirection } from './skeleton';
import { hashNoise } from '../math/rng';

export type ElderProfileId = 'elderA' | 'elderB';
export interface ElderProfile {
  label: string;
  /** délka kroku (m) a kadence (kroky/min) – rychlost = krok × kadence */ stepM: number; cadence: number;
  /** předklon trupu navíc (°), amplituda švihu paží, pohupování pánve (násobky) */ leanDeg: number; armSwing: number; bob: number;
  cane: boolean;
}
export const ELDER_PROFILES: Record<ElderProfileId, ElderProfile> = {
  elderA: { label: 'A – pomalá chůze', stepM: 0.5, cadence: 100, leanDeg: 4, armSwing: 0.55, bob: 0.7, cane: false },
  elderB: { label: 'B – chůze s holí', stepM: 0.38, cadence: 84, leanDeg: 8, armSwing: 0.35, bob: 0.55, cane: true },
};
export const elderSpeed = (p: ElderProfile) => (p.stepM * p.cadence) / 60;

/** Stav seniora v animátoru (čistá data – součást checkpointu). */
export interface ElderState {
  p: ElderProfileId;
  /** ruka s holí (anatomicky) */ side: 'R' | 'L';
  /** individuální odchylky: délka kroku, kadence (násobky), předklon (°) */ kStep: number; kCad: number; dLean: number;
  /** index ruky (0 = vzdálená, 1 = blízká) s holí v aktuálním pohledu */ h?: 0 | 1;
  /** světová kotva hrotu (uražená dráha, jednotky postavy) a předchozí kotva */ tip?: number | null;
  /** počet došlapů hole (diagnostika / testy) */ plants?: number;
  /** hrot ve scéně (px) uložený při došlapu – opora drží i v zatáčce a při změně hloubky */ tipXY?: { x: number; y: number; key: number } | null;
}

/** Odchylky jednotlivce (deterministicky ze semínka): krok ±5 %, kadence ±4 %, předklon ±1,5°. */
export function elderState(p: ElderProfileId, side: 'R' | 'L', seed: number): ElderState {
  return { p, side, kStep: 1 + 0.05 * (2 * hashNoise(seed, 11) - 1), kCad: 1 + 0.04 * (2 * hashNoise(seed, 12) - 1), dLean: 1.5 * (2 * hashNoise(seed, 13) - 1), tip: null, plants: 0 };
}
export const elderStepM = (e: ElderState) => ELDER_PROFILES[e.p].stepM * e.kStep;
export const elderCadence = (e: ElderState) => ELDER_PROFILES[e.p].cadence * e.kCad;
export const elderSpeedOf = (e: ElderState) => (elderStepM(e) * elderCadence(e)) / 60;

/**
 * Index paže (a stejnostranné nohy) anatomické strany v daném směru: postava jdoucí doprava (bez
 * zrcadlení) ukazuje kameře pravý bok → pravá strana je blízká (1); zrcadlově vzdálená (0).
 */
export function sideIndex(dir: Direction, side: 'R' | 'L'): 0 | 1 {
  const { mirror } = viewForDirection(dir);
  const right: 0 | 1 = mirror ? 0 : 1;
  return side === 'R' ? right : ((1 - right) as 0 | 1);
}
/** Ruka s holí a podpíraná noha (opačná strana). */
export function caneIndices(e: ElderState, dir: Direction): { hand: 0 | 1; leg: 0 | 1 } {
  const hand = sideIndex(dir, e.side);
  return { hand, leg: (1 - hand) as 0 | 1 };
}
/** Hrot hole došlapuje kousek před patu podpírané nohy (podíl délky nohy). */
export const TIP_AHEAD = 0.16;
