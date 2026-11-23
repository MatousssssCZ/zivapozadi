/**
 * Profil chůze podle zadání „Přirozená chůze malovaných 2D postav“ (docs/zdroje/zadani-prirozene-chuze-2D.md).
 * Data (gaitData.json) jsou návrhové tabulky po 5 % cyklu pro běžnou (1,3 m/s) a pomalou (0,9 m/s)
 * chůzi, sladěné s tuhou nohou 32 + 30 a tuhou botou; vycházejí z literatury [S1]–[S15].
 *
 * Konvence: fáze 0–1 od došlapu paty dané nohy; délky v násobcích délky nohy L; úhly ve stupních;
 * X dopředu, Y nahoru (převod do obrazovky až při projekci).
 */
import data from './gaitData.json';

type Keys = [number, number][];
export interface GaitEvents { footFlat: number; heelRise: number; toeOff: number }
interface Profile { speedMps: number; events: GaitEvents; meanPelvisH: number; strideLegLen: number; curves: Record<string, Keys> }

const toFrac = (k: number[][]): Keys => k.map(([p, v]) => [p / 100, v] as [number, number]);
function withKnots(base: Keys, extra: number[][]): Keys {
  const m = new Map(base.map(([t, v]) => [Math.round(t * 1000), v]));
  for (const [p, v] of extra) m.set(Math.round(p * 10), v);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => [t / 1000, v] as [number, number]);
}
function makeProfile(curves: Record<string, number[][]>, ph: { footFlatPct: number; heelRisePct: number; stancePct: number }, speed: number, meanH: number, stepLenM: number, extra: number[][]): Profile {
  const c: Record<string, Keys> = {};
  for (const [k, v] of Object.entries(curves)) c[k] = toFrac(v);
  c.footToGroundDeg = withKnots(c.footToGroundDeg, extra);
  return { speedMps: speed, events: { footFlat: ph.footFlatPct / 100, heelRise: ph.heelRisePct / 100, toeOff: ph.stancePct / 100 }, meanPelvisH: meanH, strideLegLen: (2 * stepLenM) / data.units.referencePhysicalLegLengthM, curves: c };
}

export const GAIT_NORMAL = makeProfile(data.curves, data.phases.normal, 1.3, data.pelvisMeanHeightLegLen, data.speedScaling.normal.stepLengthM, data.curveRoles.extraFootAngleKnots.normal);
export const GAIT_SLOW = makeProfile(data.slowProfile.curves, data.phases.slow, 0.9, data.slowProfile.pelvisMeanHeightLegLen, data.speedScaling.slow.stepLengthM, data.curveRoles.extraFootAngleKnots.slow);
export const GAIT_DATA = data;

/** Periodická tvarově zachovávající kubická interpolace (Fritsch–Carlson) uzlů na intervalu 0–1. */
export function pchip(keys: Keys, t: number): number {
  // keys: t od 0 do 1, první a poslední hodnota shodná (periodická smyčka)
  const n = keys.length, segs = n - 1;
  t = ((t % 1) + 1) % 1;
  let i = 0; while (i < segs - 1 && t > keys[i + 1][0]) i++;
  const w = (j: number) => keys[j + 1][0] - keys[j][0];
  const d = (j: number) => (keys[j + 1][1] - keys[j][1]) / Math.max(1e-9, w(j));
  const tangent = (k: number) => {
    const jp = k === 0 || k === segs ? segs - 1 : k - 1; // předchozí úsek (periodicky)
    const jn = k === segs ? 0 : k; // následující úsek
    const dp = d(jp), dn = d(jn);
    if (dp * dn <= 0) return 0;
    const hp = w(jp), hn = w(jn), w1 = 2 * hn + hp, w2 = hn + 2 * hp;
    return (w1 + w2) / (w1 / dp + w2 / dn);
  };
  const h = w(i), y0 = keys[i][1], y1 = keys[i + 1][1], m0 = tangent(i), m1 = tangent(i + 1);
  const s = (t - keys[i][0]) / Math.max(1e-9, h), s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1;
}

/** Události pro váhu w (0 = pomalý, 1 = běžný profil). */
export function gaitEvents(w: number): GaitEvents {
  const a = GAIT_SLOW.events, b = GAIT_NORMAL.events;
  return { footFlat: a.footFlat + (b.footFlat - a.footFlat) * w, heelRise: a.heelRise + (b.heelRise - a.heelRise) * w, toeOff: a.toeOff + (b.toeOff - a.toeOff) * w };
}

/** Převod fáze přes pojmenované události (nemíchat stejné procento – 60 % je jednou švih, jednou stoj). */
function mapPhase(q: number, from: GaitEvents, to: GaitEvents): number {
  const E1 = [0, from.footFlat, from.heelRise, from.toeOff, 1], E2 = [0, to.footFlat, to.heelRise, to.toeOff, 1];
  let k = 0; while (k < 3 && q > E1[k + 1]) k++;
  const f = (q - E1[k]) / Math.max(1e-9, E1[k + 1] - E1[k]);
  return E2[k] + f * (E2[k + 1] - E2[k]);
}

/** Hodnota křivky pro globální fázi q při váze rychlosti w (míchá se přes události). */
export function sampleGait(name: string, q: number, w: number): number {
  const ev = gaitEvents(w);
  const qs = mapPhase(q, ev, GAIT_SLOW.events), qn = mapPhase(q, ev, GAIT_NORMAL.events);
  const a = pchip(GAIT_SLOW.curves[name], qs), b = pchip(GAIT_NORMAL.curves[name], qn);
  return a + (b - a) * w;
}
export const meanPelvisHeight = (w: number) => GAIT_SLOW.meanPelvisH + (GAIT_NORMAL.meanPelvisH - GAIT_SLOW.meanPelvisH) * w;
export const tableStrideLegLen = (w: number) => GAIT_SLOW.strideLegLen + (GAIT_NORMAL.strideLegLen - GAIT_SLOW.strideLegLen) * w;

/** Váha profilu podle rychlosti v m/s: 0,9 → pomalý, 1,3 → běžný. */
export const speedBlend = (vMps: number) => Math.min(1, Math.max(0, (vMps - 0.9) / 0.4));

/**
 * Délka cyklu (2 kroky) v násobcích délky nohy: stepLength = L·(0,7/0,9)·(v/v0)^0,45, v0 = 1,3·√(L/0,9).
 * Návrhový zákon platný pro 0,7–1,7 m/s; pod tím se zkracuje až na 50 % (rozběh, zastavení).
 */
export function strideLegLen(vMps: number, legPhysM = 0.9): number {
  const v0 = 1.3 * Math.sqrt(legPhysM / 0.9);
  const v = Math.min(1.7, Math.max(0.25, vMps));
  return 2 * (0.7 / 0.9) * Math.pow(v / v0, 0.45);
}

/** Fyzická délka nohy referenčního dospělého (m) – převod rychlosti scény na m/s. */
export const LEG_PHYS_M = 0.9;
