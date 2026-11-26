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

/**
 * Sed na lavičce (odpočinek) a přezouvání bruslí: pánev na sedáku, chodidla vpředu na zemi.
 * `change`: předklon, jedna noha zvednutá, obě ruce u boty (šněrování), v polovině druhá noha.
 * Klíč je vůči bodu na zemi pod pánví (místo k sezení); prolíná se vahou (sednutí / vstávání).
 */
export function benchPose(kind: 'rest' | 'change' | 'kneel' | 'bend' | 'squat' | 'sled' | 'lift' | 'tuck', t: number, dur: number, r?: number): FallKey {
  if (kind === 'sled') return sledRidePose(t, r ?? 0);
  if (kind === 'lift') return liftPose();
  if (kind === 'tuck') return tuckPose(t);
  if (kind === 'kneel' || kind === 'bend' || kind === 'squat') return workPose(kind, t, r);
  const SEAT = 0.56; // pánev na sedáku (0,45 m + stehna) v délkách nohy
  const base: FallKey = { t: 0, ph: 'pause', hip: W(-0.12, SEAT), pitch: -4, head: 4, feet: [W(0.38, 0, -0.1), W(0.44, 0, 0.1)], hands: [W(0.22, 0.6, -0.15), W(0.26, 0.6, 0.15)], c: ['s', 'f0', 'f1'] };
  if (kind === 'rest') { base.head = 4 + Math.sin(t * 0.4) * 3; return base; }
  const half = dur / 2, i = t < half ? 0 : 1, tt = (t % half) / half, up = Math.sin(Math.PI * Math.min(1, Math.max(0, (tt - 0.05) / 0.9)));
  const side = i === 0 ? -1 : 1, lace = Math.sin(t * 7) * 0.025 * up;
  const feet: [P3, P3] = [W(0.38, 0, -0.1), W(0.44, 0, 0.1)];
  feet[i] = W(0.3 - 0.06 * up, 0.24 * up, side * 0.08, -10 * up);
  return { ...base, pitch: 8 + 22 * up, head: 14 * up, feet,
    hands: [W(0.32 + lace, 0.3 + 0.32 * (1 - up), side * 0.08 - 0.06), W(0.36 - lace, 0.32 + 0.3 * (1 - up), side * 0.08 + 0.06)], c: i === 0 ? ['s', 'f1'] : ['s', 'f0'] };
}

/**
 * Práce u koule sněhuláka v dřepu: pánev nízko, kolena vpředu, trup jen mírně nakloněný, hlava sleduje
 * ruce. Ruce klidně uhlazují a uplácávají kouli (malé plynulé oblouky, střídavě), občas jedna ruka
 * nabere sníh u země a přiloží ho na kouli. `r` = poloměr koule (m) – určuje výšku rukou.
 */
export function workPose(kind: 'kneel' | 'bend' | 'squat', t: number, r = 0.2): FallKey {
  const Lm = 0.9, rb = r / Lm, reach = 0.3 / Lm + rb * 0.85; // střed koule před chodidly (délky nohy)
  const w = 2 * Math.PI * 0.55, a0 = Math.sin(w * t), a1 = Math.sin(w * t + Math.PI * 0.85);
  // nabírání sněhu: každých 5 s jedna ruka (střídavě) – dolů k zemi vedle koule, zpět ke kouli (2 s)
  const cyc = t % 5, which = Math.floor(t / 5) % 2, sc = cyc < 2 ? Math.sin((Math.PI * cyc) / 2) : 0, scoop = sc * sc * (3 - 2 * sc);
  const hb = Math.max(0.12, rb * 1.05); // výška rukou na kouli (spodní část – bok)
  const hand = (i: 0 | 1, ph: number): P3 => {
    const lat = (i ? 1 : -1) * (rb * 0.75 + 0.06);
    const on: P3 = W(reach - rb * 0.55 + 0.03 * ph, hb + 0.04 * Math.cos(ph * 2), lat * (1 - 0.15 * ph));
    if (i !== which || scoop <= 0) return on;
    const down: P3 = W(reach * 0.75, 0.02, lat * 1.5);
    return W(on.u + (down.u - on.u) * scoop, on.h + (down.h - on.h) * scoop, (on.lat ?? 0) + ((down.lat ?? 0) - (on.lat ?? 0)) * scoop);
  };
  return {
    t: 0, ph: 'pause', hip: W(-0.09, 0.5 + 0.01 * a0), pitch: 11 + 2 * a0 + 5 * scoop, head: -14 + 2 * a1, roll: 1.5 * a0,
    feet: [W(0.02, 0, -0.17), W(0.08, 0, 0.17)],
    hands: [hand(0, a0), hand(1, a1)], c: ['f0', 'f1'],
  };
}

/**
 * Jezdec sedící na saních: pánev na sedáku (výška saní), nohy natažené vpřed s mírně pokrčenými koleny,
 * paty na přední části saní, ruce drží boční hrany (madla). Trup se v tahu mírně zakloní (setrvačnost –
 * `r` = podélné zrychlení saní v m/s², kladné = rozjezd) a při dojíždění nakloní dopředu.
 */
export function sledRidePose(t: number, accel: number): FallKey {
  const lean = Math.max(-1, Math.min(1, accel / 1.2));
  const sway = Math.sin(t * 0.7) * 1.5;
  return {
    t: 0, ph: 'pause', hip: W(-0.06, 0.5), pitch: -6 - 9 * lean + sway * 0.3, head: 6 + 4 * lean + sway, roll: sway * 0.4,
    feet: [W(0.62, 0.3, -0.09, 25), W(0.68, 0.3, 0.09, 25)],
    hands: [W(0.12, 0.38, -0.24), W(0.16, 0.38, 0.24)], c: ['s'],
  };
}

/**
 * Zvedání / pokládání nákladu (bedýnka): přidřep v kolenou a kyčlích, trup mírně vpřed, záda nejsou
 * ohnutá v pase; ruce u madel nízko před chodidly (náklad blízko těla).
 */
export function liftPose(): FallKey {
  return { t: 0, ph: 'pause', hip: W(-0.08, 0.66), pitch: 30, head: -12, feet: [W(-0.06, 0, -0.12), W(0.1, 0, 0.12)], hands: [W(0.36, 0.2, -0.2), W(0.38, 0.2, 0.2)], c: ['f0', 'f1'] };
}

/**
 * Úprava deky v kočárku (A17): předklon v kyčlích s pokrčenými koleny, ruce pod stříškou nad korbou;
 * jedna ruka drží okraj, druhá uhlazuje pomalými tahy (nejsou zrcadlové), hlava se dívá dovnitř.
 */
export function tuckPose(t: number): FallKey {
  const s = Math.sin(t * 2.1), q = Math.sin(t * 1.3 + 1);
  return { t: 0, ph: 'pause', hip: W(-0.12, 0.9), pitch: 34 + 2 * q, head: -16, feet: [W(-0.08, 0, -0.12), W(0.06, 0, 0.12)], hands: [W(0.5, 0.82, -0.12), W(0.52 + 0.06 * s, 0.8 + 0.02 * q, 0.06 + 0.05 * s)], c: ['f0', 'f1'] };
}
