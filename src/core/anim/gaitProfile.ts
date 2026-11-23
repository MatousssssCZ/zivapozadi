/**
 * Biomechanický profil chůze (normativní hodnoty zdravého dospělého, normalizované na cyklus kroku).
 * Cyklus začíná došlapem paty dané nohy (0) a končí jejím dalším došlapem (1).
 *
 * Zdroje (shrnutí): stojná fáze ~60 %, švih ~40 %; zvednutí paty ~30–35 %; švih: počáteční 60–73 %,
 * střední 73–87 %, konečný 87–100 %; koleno: flexe 10–15° po došlapu (~15 %), téměř natažení
 * ve 30–40 %, ve švihu 60–65°; kyčel ~30° flexe / ~10–15° extenze před odrazem; kotník ~20°
 * plantární flexe při odrazu; pánev: vertikální posun ~3,3–3,7 % délky nohy, pokles na straně
 * švihu (obliquita ~7–9° rozsah), rotace vpřed na straně švihu; paže: rameno ~20–25°, loket 15–30°,
 * rozsah roste s rychlostí; rychlost = délka kroku × kadence.
 * (Perry & Burnfield; univerzitní učební texty o normální chůzi; Physiopedia; studie o pohybu paží.)
 */

export const GAIT_PROFILE = {
  /** konec stojné fáze (odraz špičky) */
  toeOff: 0.6,
  /** chodidlo celé na zemi (konec odvalení přes patu) */
  footFlat: 0.08,
  /** zvednutí paty (začátek odvalení přes špičku) */
  heelOff: 0.34,
  /** úhel chodidla vůči zemi při došlapu (špička nahoru), rad (~20°) */
  heelStrikeFoot: 0.35,
  /** úhel chodidla při odrazu (špička dolů), rad (~-45°) */
  toeOffFoot: -0.8,
  /** geometrie chodidla vůči kotníku (jednotky při výšce 130): pata za kotníkem, bříško prstů před ním */
  heelBack: 2.6,
  ballFront: 7,
  /** kotník při došlapu před pánví jako podíl délky cyklu (≈ 0,3 délky nohy při běžné rychlosti) */
  heelStrikeReach: 0.19,
  /** rozkmit výšky pánve (podíl délky nohy) a posun minima za došlap */
  pelvisBob: 0.035, pelvisBobShift: 0.02,
  /** požadovaná flexe kolena stojné nohy [fáze, stupně] – tlumení po došlapu, natažení, předšvih */
  stanceKnee: [[0, 4], [0.12, 15], [0.26, 9], [0.4, 4], [0.5, 7], [0.6, 36]] as [number, number][],
  /** dráha kotníku ve švihu: [podíl švihu, podíl dráhy vpřed, výška nad zemí jako podíl délky nohy] */
  swingAnkle: [[0.18, -0.03, 0.245], [0.48, 0.5, 0.11], [0.8, 1.03, 0.055]] as [number, number, number][],
  /** úhel chodidla ve švihu [podíl švihu, rad] (kladně = špička nahoru) */
  swingFoot: [[0, -0.8], [0.25, -0.45], [0.55, 0], [0.8, 0.15], [1, 0.35]] as [number, number][],
  /** pánev: rotace vpřed na straně nohy vpředu (jednotky posunu kyčle), pokles strany švihu (jednotky) */
  pelvisRotation: 0.9,
  pelvisDrop: 0.7,
  /** protirotace hrudníku vůči pánvi (podíl) */
  thoraxCounter: 0.9,
  /** paže: střední úhel ramene (záporně = vzad), amplituda, flexe lokte (základ + amplituda), zpoždění */
  armMean: -0.06, armAmp: 0.2, elbowBase: 0.26, elbowAmp: 0.24, armLag: 0.04,
  /** kmitání trupu (předklon 2× za cyklus) a stabilizace hlavy */
  torsoPitch: 0.014,
  /** délka kroku roste s rychlostí: stride ∝ (v/vref)^exp, omezeno */
  strideExp: 0.45, strideMin: 0.62, strideMax: 1.15,
};

/** Catmull-Romova interpolace hodnot zadaných v uzlech [t, v] (t vzestupně). */
export function curve(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0; while (i < n - 2 && t > keys[i + 1][0]) i++;
  const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(n - 1, i + 2)];
  const s = (t - p1[0]) / (p2[0] - p1[0]);
  const m1 = (p2[1] - p0[1]) / Math.max(1e-6, p2[0] - p0[0]) * (p2[0] - p1[0]);
  const m2 = (p3[1] - p1[1]) / Math.max(1e-6, p3[0] - p1[0]) * (p2[0] - p1[0]);
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p1[1] + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2[1] + (s3 - s2) * m2;
}

/** Faktor délky kroku podle rychlosti (vůči nominální rychlosti postavy). */
export function strideFactor(speed: number, refSpeed: number): number {
  const G = GAIT_PROFILE;
  if (refSpeed <= 0 || speed <= 0) return G.strideMin;
  return Math.min(G.strideMax, Math.max(G.strideMin, Math.pow(speed / refSpeed, G.strideExp)));
}
