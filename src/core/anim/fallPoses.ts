/**
 * Pády (zadání „Pády chodců“): tři varianty pádu a zachycené uklouznutí jako klíčové pózy celého
 * těla v rovině chůze. Jednotky: délka nohy L (u = vpřed od výchozí polohy pánve, h = výška nad zemí,
 * lat = do strany), úhly ve stupních. Kostra mezi klíči interpoluje (smoothstep) a řeší končetiny IK –
 * chodidla, ruce, kolena a sed jsou kontaktní body (stojí, nebo kloužou podle příznaků klíče).
 *
 * Fáze: chůze → ztráta opory → pokus o vyrovnání → pád → dopad a usazení → pauza → vstávání →
 * oprášení → pokračování. Index 0/1 u chodidel a rukou = vzdálená/blízká strana (strana pádu se
 * zrcadlí výměnou indexů).
 */
export type FallVariant = 'back' | 'forward' | 'side' | 'saved';
export type FallPhase = 'loss' | 'recover' | 'fall' | 'impact' | 'pause' | 'getup' | 'brush' | 'done';
export const FALL_PHASE_LABEL: Record<FallPhase, string> = { loss: 'ztráta opory', recover: 'pokus o vyrovnání', fall: 'pád', impact: 'dopad a usazení', pause: 'pauza', getup: 'vstávání', brush: 'oprášení', done: 'pokračuje' };
export const FALL_LABEL: Record<FallVariant, string> = { back: 'uklouznutí dozadu do sedu', forward: 'zakopnutí dopředu na ruce a kolena', side: 'boční uklouznutí při otáčení', saved: 'zachycené uklouznutí' };

export interface P3 { u: number; h: number; lat?: number; th?: number }
/** Kontakty klíče: f0/f1 chodidla, h0/h1 ruce, k0/k1 kolena, s sed; přípona „~“ = klouže. */
export interface FallKey { t: number; ph: FallPhase; hip: P3; pitch: number; roll?: number; head: number; feet: [P3, P3]; hands: [P3, P3]; c: string[] }

const STAND_H = 1.04; // pánev ve stoje (výška kotníku 3 j. + 0,99 L při L = 62 j.)
const W = (u: number, h: number, lat = 0, th = 0): P3 => ({ u, h, lat, th });
const standFeet: [P3, P3] = [W(-0.05, 0), W(0.06, 0)];
const standHands: [P3, P3] = [W(-0.04, 1.0, -0.05), W(0.06, 1.0, 0.05)];

export const FALL_KEYS: Record<FallVariant, FallKey[]> = {
  back: [
    { t: 0, ph: 'loss', hip: W(0, STAND_H), pitch: 3, head: 0, feet: standFeet, hands: standHands, c: ['f0', 'f1'] },
    { t: 0.22, ph: 'loss', hip: W(0.02, 1.0), pitch: -6, head: -4, feet: [W(-0.06, 0), W(0.42, 0.02, 0, 18)], hands: [W(-0.18, 1.3, -0.2), W(0.22, 1.35, 0.2)], c: ['f0', 'f1~'] },
    { t: 0.5, ph: 'recover', hip: W(-0.04, 0.88), pitch: -14, head: -8, feet: [W(0.08, 0.04, 0, 10), W(0.62, 0.12, 0, 30)], hands: [W(-0.3, 1.6, -0.45), W(0.32, 1.65, 0.45)], c: ['f0~'] },
    { t: 0.85, ph: 'fall', hip: W(-0.18, 0.42), pitch: -26, head: 6, feet: [W(0.35, 0.14, 0, 25), W(0.75, 0.24, 0, 35)], hands: [W(-0.42, 0.42, -0.3), W(-0.32, 0.5, 0.3)], c: [] },
    { t: 1.08, ph: 'impact', hip: W(-0.24, 0.13), pitch: -22, head: 8, feet: [W(0.42, 0.0, 0, 12), W(0.7, 0.05, 0, 22)], hands: [W(-0.5, 0.02, -0.3), W(-0.4, 0.02, 0.3)], c: ['s', 'h0', 'h1', 'f0', 'f1'] },
    { t: 1.45, ph: 'impact', hip: W(-0.24, 0.12), pitch: -6, head: 2, feet: [W(0.38, 0, 0, 8), W(0.55, 0, 0, 10)], hands: [W(-0.42, 0, -0.32), W(-0.3, 0, 0.32)], c: ['s', 'h0', 'h1', 'f0', 'f1'] },
    { t: 2.9, ph: 'pause', hip: W(-0.23, 0.12), pitch: 2, head: -6, feet: [W(0.36, 0, 0, 8), W(0.5, 0, 0, 10)], hands: [W(-0.38, 0, -0.3), W(-0.28, 0, 0.3)], c: ['s', 'h0', 'h1', 'f0', 'f1'] },
    { t: 3.6, ph: 'getup', hip: W(-0.18, 0.13), pitch: 28, head: 6, feet: [W(0.05, 0, 0, 0), W(0.22, 0, 0, 0)], hands: [W(-0.05, 0, -0.3), W(0.12, 0.02, 0.3)], c: ['s', 'h0', 'h1', 'f0', 'f1'] },
    { t: 4.4, ph: 'getup', hip: W(-0.04, 0.48), pitch: 42, head: 10, feet: [W(-0.04, 0), W(0.12, 0)], hands: [W(0.16, 0.56, -0.12), W(0.22, 0.6, 0.12)], c: ['f0', 'f1', 'h0', 'h1'] },
    { t: 5.1, ph: 'getup', hip: W(-0.02, 0.86), pitch: 22, head: 4, feet: [W(-0.04, 0), W(0.1, 0)], hands: [W(0.12, 0.72, -0.1), W(0.16, 0.76, 0.1)], c: ['f0', 'f1'] },
    { t: 5.7, ph: 'brush', hip: W(0, STAND_H), pitch: 8, head: 8, feet: [W(-0.04, 0), W(0.08, 0)], hands: [W(-0.2, 0.9, -0.1), W(-0.18, 0.95, 0.12)], c: ['f0', 'f1'] },
    { t: 6.1, ph: 'brush', hip: W(0, STAND_H), pitch: 10, head: 10, feet: [W(-0.04, 0), W(0.08, 0)], hands: [W(-0.22, 0.78, -0.1), W(-0.2, 0.84, 0.12)], c: ['f0', 'f1'] },
    { t: 6.5, ph: 'brush', hip: W(0, STAND_H), pitch: 9, head: 8, feet: [W(-0.04, 0), W(0.08, 0)], hands: [W(-0.2, 0.92, -0.1), W(-0.18, 0.96, 0.12)], c: ['f0', 'f1'] },
    { t: 6.9, ph: 'brush', hip: W(0, STAND_H), pitch: 10, head: 10, feet: [W(-0.04, 0), W(0.08, 0)], hands: [W(-0.22, 0.8, -0.1), W(-0.2, 0.86, 0.12)], c: ['f0', 'f1'] },
    { t: 7.5, ph: 'done', hip: W(0, STAND_H), pitch: 3, head: 0, feet: standFeet, hands: standHands, c: ['f0', 'f1'] },
  ],
  forward: [
    { t: 0, ph: 'loss', hip: W(0, STAND_H), pitch: 3, head: 0, feet: standFeet, hands: standHands, c: ['f0', 'f1'] },
    { t: 0.22, ph: 'loss', hip: W(0.14, 0.98), pitch: 20, head: -6, feet: [W(-0.32, 0.06, 0, -25), W(0.36, 0)], hands: [W(0.28, 1.1, -0.15), W(0.34, 1.15, 0.15)], c: ['f1'] },
    { t: 0.5, ph: 'recover', hip: W(0.36, 0.86), pitch: 36, head: -12, feet: [W(0.62, 0.16, 0, 10), W(0.38, 0, 0, -10)], hands: [W(0.6, 0.95, -0.25), W(0.66, 1.0, 0.25)], c: ['f1'] },
    { t: 0.82, ph: 'fall', hip: W(0.46, 0.56), pitch: 62, head: -20, feet: [W(0.22, 0.12, 0, -30), W(0.42, 0.06, 0, -30)], hands: [W(0.95, 0.28, -0.22), W(0.9, 0.34, 0.22)], c: [] },
    { t: 1.02, ph: 'impact', hip: W(0.46, 0.5), pitch: 80, head: -24, feet: [W(-0.02, 0.06, 0, -70), W(-0.07, 0.06, 0, -70)], hands: [W(1.02, 0, -0.22), W(0.97, 0, 0.22)], c: ['h0', 'h1', 'k0', 'k1'] },
    { t: 1.35, ph: 'impact', hip: W(0.42, 0.48), pitch: 76, head: -30, feet: [W(-0.06, 0.06, 0, -70), W(-0.1, 0.06, 0, -70)], hands: [W(0.98, 0, -0.22), W(0.94, 0, 0.22)], c: ['h0', 'h1', 'k0', 'k1'] },
    { t: 2.6, ph: 'pause', hip: W(0.42, 0.48), pitch: 74, head: -18, feet: [W(-0.06, 0.06, 0, -70), W(-0.1, 0.06, 0, -70)], hands: [W(0.97, 0, -0.22), W(0.93, 0, 0.22)], c: ['h0', 'h1', 'k0', 'k1'] },
    { t: 3.3, ph: 'getup', hip: W(0.32, 0.56), pitch: 18, head: 0, feet: [W(-0.12, 0.06, 0, -70), W(0.5, 0)], hands: [W(0.5, 0.6, -0.1), W(0.55, 0.62, 0.12)], c: ['k0', 'f1'] },
    { t: 4.1, ph: 'getup', hip: W(0.32, 0.84), pitch: 26, head: 4, feet: [W(0.08, 0), W(0.5, 0)], hands: [W(0.5, 0.6, -0.08), W(0.53, 0.63, 0.1)], c: ['f0', 'f1', 'h1'] },
    { t: 4.8, ph: 'brush', hip: W(0.32, STAND_H), pitch: 6, head: 4, feet: [W(0.26, 0), W(0.4, 0)], hands: [W(0.46, 0.6, -0.1), W(0.5, 0.64, 0.1)], c: ['f0', 'f1'] },
    { t: 5.2, ph: 'brush', hip: W(0.32, 1.02), pitch: 28, head: 10, feet: [W(0.26, 0), W(0.4, 0)], hands: [W(0.5, 0.5, -0.08), W(0.54, 0.56, 0.1)], c: ['f0', 'f1'] },
    { t: 5.6, ph: 'brush', hip: W(0.32, 1.02), pitch: 28, head: 10, feet: [W(0.26, 0), W(0.4, 0)], hands: [W(0.52, 0.62, -0.08), W(0.55, 0.66, 0.1)], c: ['f0', 'f1'] },
    { t: 6.0, ph: 'brush', hip: W(0.32, STAND_H), pitch: 6, head: 4, feet: [W(0.26, 0), W(0.4, 0)], hands: [W(0.5, 1.1, -0.02), W(0.52, 1.12, 0.02)], c: ['f0', 'f1'] },
    { t: 6.6, ph: 'done', hip: W(0.32, STAND_H), pitch: 3, head: 0, feet: [W(0.27, 0), W(0.38, 0)], hands: [W(0.28, 1.0, -0.05), W(0.38, 1.0, 0.05)], c: ['f0', 'f1'] },
  ],
  side: [
    { t: 0, ph: 'loss', hip: W(0, STAND_H), pitch: 3, head: 0, feet: standFeet, hands: standHands, c: ['f0', 'f1'] },
    { t: 0.22, ph: 'loss', hip: W(0.02, 1.0, 0.06), pitch: 2, roll: 6, head: -4, feet: [W(-0.04, 0), W(0.08, 0.03, 0.3, 10)], hands: [W(-0.02, 1.25, -0.5), W(0.06, 1.3, 0.45)], c: ['f0', 'f1~'] },
    { t: 0.5, ph: 'recover', hip: W(0.02, 0.86, 0.16), pitch: 6, roll: 14, head: -8, feet: [W(-0.02, 0.06, 0.1), W(0.1, 0.06, 0.5, 10)], hands: [W(-0.04, 1.6, -0.7), W(0.06, 1.4, 0.6)], c: ['f0~'] },
    { t: 0.85, ph: 'fall', hip: W(0.0, 0.4, 0.36), pitch: 8, roll: 24, head: 4, feet: [W(0.14, 0.08, 0.2), W(0.24, 0.12, 0.45)], hands: [W(-0.05, 0.6, -0.2), W(0.04, 0.28, 0.72)], c: [] },
    { t: 1.08, ph: 'impact', hip: W(-0.02, 0.13, 0.36), pitch: 6, roll: 18, head: 6, feet: [W(0.3, 0, 0.1, 8), W(0.2, 0.0, 0.3, 8)], hands: [W(0.18, 0.2, -0.05), W(0.02, 0, 0.72)], c: ['s', 'h1', 'f0', 'f1'] },
    { t: 1.45, ph: 'impact', hip: W(-0.02, 0.12, 0.34), pitch: 4, roll: 12, head: 2, feet: [W(0.32, 0, 0.1, 8), W(0.22, 0, 0.28, 8)], hands: [W(0.2, 0.25, -0.05), W(0.0, 0, 0.66)], c: ['s', 'h1', 'f0', 'f1'] },
    { t: 2.9, ph: 'pause', hip: W(-0.02, 0.12, 0.34), pitch: 6, roll: 10, head: -6, feet: [W(0.32, 0, 0.1, 8), W(0.22, 0, 0.28, 8)], hands: [W(0.22, 0.28, -0.05), W(0.0, 0, 0.64)], c: ['s', 'h1', 'f0', 'f1'] },
    { t: 3.6, ph: 'getup', hip: W(0.04, 0.46, 0.2), pitch: 24, roll: 4, head: 4, feet: [W(-0.08, 0.06, 0.12, -70), W(0.36, 0, 0.18)], hands: [W(0.3, 0.55, 0.0), W(0.16, 0.02, 0.5)], c: ['k0', 'f1', 'h1'] },
    { t: 4.3, ph: 'getup', hip: W(0.06, 0.84, 0.08), pitch: 22, head: 4, feet: [W(0.02, 0, 0.05), W(0.34, 0, 0.12)], hands: [W(0.32, 0.6, -0.05), W(0.36, 0.64, 0.12)], c: ['f0', 'f1', 'h1'] },
    { t: 5.0, ph: 'brush', hip: W(0.08, STAND_H), pitch: 6, head: 6, feet: [W(0.02, 0), W(0.16, 0)], hands: [W(0.02, 0.9, -0.1), W(-0.02, 0.92, 0.3)], c: ['f0', 'f1'] },
    { t: 5.4, ph: 'brush', hip: W(0.08, STAND_H), pitch: 8, head: 10, feet: [W(0.02, 0), W(0.16, 0)], hands: [W(0.02, 0.9, -0.1), W(-0.04, 0.8, 0.32)], c: ['f0', 'f1'] },
    { t: 5.8, ph: 'brush', hip: W(0.08, STAND_H), pitch: 8, head: 10, feet: [W(0.02, 0), W(0.16, 0)], hands: [W(0.02, 0.9, -0.1), W(-0.02, 0.94, 0.3)], c: ['f0', 'f1'] },
    { t: 6.4, ph: 'done', hip: W(0.08, STAND_H), pitch: 3, head: 0, feet: [W(0.03, 0), W(0.14, 0)], hands: [W(0.04, 1.0, -0.05), W(0.14, 1.0, 0.05)], c: ['f0', 'f1'] },
  ],
  saved: [
    { t: 0, ph: 'loss', hip: W(0, STAND_H), pitch: 3, head: 0, feet: standFeet, hands: standHands, c: ['f0', 'f1'] },
    { t: 0.2, ph: 'loss', hip: W(0.02, 1.01), pitch: -4, head: -3, feet: [W(-0.06, 0), W(0.36, 0.02, 0, 15)], hands: [W(-0.15, 1.25, -0.25), W(0.2, 1.3, 0.25)], c: ['f0', 'f1~'] },
    { t: 0.45, ph: 'recover', hip: W(0.0, 0.92), pitch: -2, head: -6, feet: [W(-0.02, 0), W(0.3, 0.03, 0, 8)], hands: [W(-0.3, 1.5, -0.5), W(0.3, 1.5, 0.5)], c: ['f0', 'f1~'] },
    { t: 0.8, ph: 'recover', hip: W(0.04, 0.95), pitch: 10, head: 2, feet: [W(-0.02, 0), W(0.16, 0)], hands: [W(-0.12, 1.15, -0.3), W(0.18, 1.2, 0.3)], c: ['f0', 'f1'] },
    { t: 1.3, ph: 'pause', hip: W(0.05, 1.04), pitch: 5, head: 6, feet: [W(-0.02, 0), W(0.14, 0)], hands: [W(-0.04, 1.0, -0.06), W(0.1, 1.0, 0.06)], c: ['f0', 'f1'] },
    { t: 1.9, ph: 'done', hip: W(0.05, STAND_H), pitch: 3, head: 0, feet: [W(0.0, 0), W(0.11, 0)], hands: [W(0.01, 1.0, -0.05), W(0.11, 1.0, 0.05)], c: ['f0', 'f1'] },
  ],
};

export const fallDuration = (v: FallVariant) => FALL_KEYS[v][FALL_KEYS[v].length - 1].t;
/** Čas dopadu (stopa ve sněhu, reakce okolí) – první klíč fáze „impact“. */
export const fallImpactT = (v: FallVariant) => FALL_KEYS[v].find((k) => k.ph === 'impact')?.t ?? null;
/** Konečný posun pánve vpřed (L) – simulace o něj postavu posune, aby navázala bez skoku. */
export const fallEndShift = (v: FallVariant) => FALL_KEYS[v][FALL_KEYS[v].length - 1].hip.u;

const ss = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const lerpP = (a: P3, b: P3, k: number): P3 => ({ u: a.u + (b.u - a.u) * k, h: a.h + (b.h - a.h) * k, lat: (a.lat ?? 0) + ((b.lat ?? 0) - (a.lat ?? 0)) * k, th: (a.th ?? 0) + ((b.th ?? 0) - (a.th ?? 0)) * k });

/** Póza v čase t (s): interpolace sousedních klíčů; kontakty a fáze z klíče, ve kterém t leží. */
export function sampleFall(v: FallVariant, t: number): FallKey {
  const K = FALL_KEYS[v];
  if (t <= 0) return K[0];
  if (t >= K[K.length - 1].t) return K[K.length - 1];
  let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1], k = ss((t - a.t) / (b.t - a.t));
  return {
    t, ph: a.ph === b.ph ? a.ph : k < 0.5 ? a.ph : b.ph,
    hip: lerpP(a.hip, b.hip, k), pitch: a.pitch + (b.pitch - a.pitch) * k, roll: (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * k, head: a.head + (b.head - a.head) * k,
    feet: [lerpP(a.feet[0], b.feet[0], k), lerpP(a.feet[1], b.feet[1], k)], hands: [lerpP(a.hands[0], b.hands[0], k), lerpP(a.hands[1], b.hands[1], k)],
    c: k < 0.5 ? a.c : b.c,
  };
}
/** Fáze v čase t (pro stav a reakce). */
export const fallPhaseAt = (v: FallVariant, t: number): FallPhase => sampleFall(v, t).ph;
