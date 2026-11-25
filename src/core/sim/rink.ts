/**
 * Bruslení na kluzišti (zadání „Živá pozadí – bruslení na vánočním kluzišti“).
 *
 * Vrstvy (kap. 9): záměr (okruh, doprovod, odpočinek, odchod, prvek) → navigace (vlastní smyčka po
 * ledu, odstup, cílová rychlost) → pohyb (poloha, rychlost, natočení v metrech; omezení zrychlení a
 * zakřivení) → lokomoce (série odrazů a skluz, zatáčka, brzda; stav každé brusle) → póza (pánev, nohy,
 * trup, ruce – skládá kostra z cílů, viz `skatePose`) → události (zaváhání, pád, vzácný prvek).
 *
 * Jediný autoritativní zdroj posunu: tento modul (bruslaři nejsou v davu chodců). Rychlost roste jen
 * při zatíženém odrazu, ve skluzu pomalu klesá, při brzdě výrazněji. Zatížená brusle klouže po ledě
 * (není ukotvená ve světě). Vše na pevném kroku simulace, náhodné hodnoty se losují při vzniku postavy
 * nebo události (ne každým snímkem). Výchozí čísla jsou laditelný návrh (zadání, kap. 1).
 */
import type { AgentState } from './types';
import type { RngState } from '../math/rng';
import { rand, randRange } from '../math/rng';
import type { Vec2 } from '../math/vec';
import type { World } from '../scene/camera';
import type { FallKey, P3, FallVariant } from '../anim/fallPoses';
import { FALL_KEYS, fallDuration } from '../anim/fallPoses';

/** schopnost (věk je samostatná vlastnost postavy: dítě může bruslit lépe než dospělý) */
export type SkateProfile = 'rec' | 'unsure' | 'beginnerKid' | 'good' | 'goodKid' | 'expert';
export interface ProfileDef {
  label: string;
  /** cestovní rychlost (m/s) */ v: [number, number];
  /** odstup odrazů (s), počet odrazů v sérii, dojezd na obou (s) */ pushInt: [number, number]; pushN: [number, number]; glide: [number, number];
  /** šířka postoje (L), pokrčení kolen (L), ruce do stran (0–1), předklon (°) */ stance: number; knee: number; arms: number; pitch: number;
  /** nejmenší poloměr oblouku (m), max. náklon (°), brzdné zpomalení (m/s²), max. zrychlení odrazem (m/s²) */ rMin: number; leanMax: number; brake: number; aPush: number;
  /** dovednosti (repertoár) */ skills: { oneFoot?: boolean; backward?: boolean; spin?: boolean; jump?: boolean; arabesque?: boolean; crossover?: boolean; plow?: boolean };
  /** váha při výběru pádu (relativní) */ fallW: number;
}
export const SKATE_PROFILES: Record<SkateProfile, ProfileDef> = {
  rec: { label: 'Rekreační', v: [0.7, 1.5], pushInt: [0.8, 1.6], pushN: [2, 5], glide: [1, 4], stance: 0.1, knee: 0.05, arms: 0.15, pitch: 8, rMin: 2.2, leanMax: 9, brake: 0.9, aPush: 0.55, skills: { plow: true }, fallW: 1 },
  unsure: { label: 'Nejistý dospělý', v: [0.35, 0.85], pushInt: [1.0, 1.6], pushN: [2, 3], glide: [0.6, 1.6], stance: 0.17, knee: 0.025, arms: 0.6, pitch: 3, rMin: 3.0, leanMax: 4, brake: 0.6, aPush: 0.5, skills: { plow: true }, fallW: 4 },
  beginnerKid: { label: 'Dítě poprvé', v: [0.35, 0.65], pushInt: [0.55, 0.8], pushN: [3, 6], glide: [0.4, 1.0], stance: 0.17, knee: 0.04, arms: 0.55, pitch: 6, rMin: 1.0, leanMax: 2, brake: 0.5, aPush: 0.6, skills: {}, fallW: 6 },
  good: { label: 'Jistější bruslař', v: [0.9, 1.6], pushInt: [0.8, 1.3], pushN: [2, 4], glide: [1.2, 3.2], stance: 0.1, knee: 0.065, arms: 0.2, pitch: 10, rMin: 1.7, leanMax: 12, brake: 1.2, aPush: 0.8, skills: { oneFoot: true, spin: true, jump: true, arabesque: true, crossover: true, plow: true }, fallW: 0.4 },
  goodKid: { label: 'Šikovné dítě', v: [0.8, 1.7], pushInt: [0.7, 1.1], pushN: [2, 4], glide: [0.8, 2.5], stance: 0.1, knee: 0.07, arms: 0.2, pitch: 10, rMin: 1.6, leanMax: 12, brake: 1.2, aPush: 0.8, skills: { oneFoot: true, arabesque: true, crossover: true, plow: true }, fallW: 0.4 },
  expert: { label: 'Velmi dobrý bruslař', v: [1.0, 2.0], pushInt: [1.1, 1.8], pushN: [2, 4], glide: [2, 4.5], stance: 0.09, knee: 0.08, arms: 0.25, pitch: 10, rMin: 1.4, leanMax: 15, brake: 1.5, aPush: 0.9, skills: { oneFoot: true, backward: true, spin: true, jump: true, arabesque: true, crossover: true, plow: true }, fallW: 0.1 },
};

export interface RinkConfig {
  /** obrys ledu (px ve scéně) a branka (bod na okraji) */ ice: Vec2[]; gate: Vec2;
  /** směr jízdy: 1 = proti směru hodinových ručiček při pohledu shora */ dir: 1 | -1;
  /** výška zástupného mantinelu (m, výchozí 0,95); po dodání malovaného pozadí se vektorový mantinel vypne (`boards: false`) */ boardH?: number; boards?: boolean;
  /** led je součástí malovaného pozadí: nekreslit zástupnou plochu ledu (stopy, odrazy a částice zůstávají) */ paintedIce?: boolean;
  /**
   * Nástup a výstup: lavička pro přezutí (objekt s body `seat`), místo na sněhu u vstupu a první bod na ledě.
   * Bez `entry` bruslaři začínají na ledě a zůstávají na něm (zkušební scéna).
   */
  entry?: { benchId: string; gate: Vec2; inIce: Vec2; session?: [number, number]; offIce?: [number, number]; startOnIce?: number; drinkChance?: number };
  /** odrazy postav na ledě (síla 0–1, délka jako podíl výšky postavy) a částice ledu při brzdění */ reflections?: { alpha: number; len: number } | false; particles?: boolean;
  /** pády: první pokus a interval (s), osobní odstup (s); prvky: interval (s), osobní odstup (s), skok */
  events?: { fallEvery?: [number, number]; fallPersonal?: number; /** podíl zaváhání, která skončí pádem (0,6) */ fallChance?: number; trickEvery?: [number, number]; trickPersonal?: [number, number]; jump?: boolean; tricks?: Partial<Record<TrickKind, number>> };
}
/** oneFoot = skluz na jedné noze, backward = jízda vzad, spin = pirueta na místě, jump = skok s otočkou
 *  ve vzduchu (rozmach volnou nohou, odraz, otočka, dopad na jednu nohu), arabesque = holubička, hop = (vypnuto) */
export type TrickKind = 'oneFoot' | 'backward' | 'spin' | 'jump' | 'arabesque' | 'hop';
/** výchozí váhy prvků; pirueta potřebuje pohledy pro otočení kolem svislé osy (nejsou) a skok fázi letu – vypnuté */
export const TRICK_WEIGHTS: Record<TrickKind, number> = { oneFoot: 40, backward: 30, spin: 0, jump: 0, arabesque: 0, hop: 0 };
/** skok s otočkou: doba letu (s) a výška (m) – h = g·T²/8 */
export const JUMP_AIR = 0.62, JUMP_H = (9.81 * JUMP_AIR * JUMP_AIR) / 8;
const prepDur = (k: TrickKind) => (k === 'jump' ? 1.3 : k === 'arabesque' ? 1.2 : 1.0);
const exitDur = (k: TrickKind) => (k === 'jump' ? 1.1 : 1.0);

export type SkState = 'ENTER' | 'SKATE' | 'BRAKE' | 'REST' | 'EXIT' | 'OUT' | 'WOBBLE' | 'FALL' | 'RECOVER' | 'TRICK_PREPARE' | 'TRICK' | 'TRICK_EXIT' | 'MARCH';
/** stav brusle: zatížený skluz, zatížený odraz, odlehčený kontakt, návrat nad ledem */
export type BladeC = 'glide' | 'push' | 'light' | 'return';
export interface Blade { c: BladeC; u: number; lat: number; h: number }
export interface Skater {
  id: string; prof: SkateProfile; st: SkState; tSt: number;
  X: number; Z: number; psi: number; v: number; omega: number;
  /** vlastní smyčka: zmenšený obrys ledu (k) kolem posunutého středu; cílová rychlost */ lane: { cx: number; cz: number; k: number }; vCruise: number;
  /** série odrazů: zbývá, interval, čas v kroku, noha odrazu (0/1), běží */ push: { left: number; int: number; t: number; foot: 0 | 1; on: boolean };
  glideLeft: number; feet: [Blade, Blade];
  /** posun pánve do strany (L), náklon do oblouku (°), zaváhání (0–1) */ hipLat: number; roll: number; wob: number;
  restAt: number; restUntil: number; blocked: number; cautiousUntil: number; lastFall: number; lastTrick: number;
  trick?: { kind: TrickKind; t: number; dur: number; phase: 'prep' | 'do' | 'exit' } | null;
  fall?: { t: number; v0: number; v?: import('../anim/fallPoses').FallVariant } | null;
  /** pirueta: natočení těla vůči směru jízdy (rad) */ spin?: number;
  /** doprovod: id dítěte (rodič) / rodiče (dítě), ruka v ruce */ pair?: string | null; holdHand?: boolean;
  /** dítě poprvé: lokální cíl podél mantinelu */ goal?: World | null; rng: RngState; seedPhase: number;
}
export interface IceTrail { X: number; Z: number; X2: number; Z2: number; t0: number }
export interface RinkState {
  sk: Record<string, Skater>; trails: IceTrail[];
  /** globální plánovač: další prvek, okno pokusů, další pád; právě probíhající událost */
  nextTrick: number; trickWindow: number | null; nextFall: number; event: { kind: 'fall' | 'trick'; id: string; t0: number } | null;
  lastTrickKind: TrickKind | null; lastTrickEnd: number; lastFallEnd: number;
  stats: { tricks: number; tricksByKind: Record<string, number>; falls: number; wobbles: number; deferred: number; overlapEvents: number; pushes: number };
  /** nástup/výstup (jen s `cfg.entry`): fáze každého bruslaře mimo led i na něm, rezervované místo na lavičce */
  life?: Record<string, SkLife>;
  rng: RngState;
}

export type LifePh = 'ice' | 'toBench' | 'changeOff' | 'standUp' | 'drink' | 'leaving' | 'away' | 'arrive' | 'changeOn' | 'toGate';
export interface SkLife { ph: LifePh; until: number; seat: string | null; n: number; since: number }
export const LIFE_LABEL: Record<LifePh, string> = { ice: 'Na ledě', toBench: 'Jde v bruslích k lavičce', changeOff: 'Přezouvá se (sundává brusle)', standUp: 'Vstává od lavičky', drink: 'Jde si pro horký nápoj', leaving: 'Odchází', away: 'Mimo scénu', arrive: 'Přichází bruslit', changeOn: 'Přezouvá se (nazouvá brusle)', toGate: 'Jde v bruslích ke vstupu na led' };

export const TRAIL_LIFE = 60, TRAIL_POOL = 900;
const G = 9.81;

// ---------------------------------------------------------------- geometrie ledu (svět)
export interface IceGeo { poly: World[]; cx: number; cz: number; hx: number; hz: number; gate: World; ring?: number[]; /** první bod na ledě u vstupu */ entryIce?: World }
export const RING_N = 96;
/** Geometrie ledu: těžiště, poloosy obálky a „poloměr“ obrysu v RING_N směrech od těžiště (pro jízdní smyčky). */
export function makeIceGeo(poly: World[], gate: World): IceGeo {
  let A = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const cr = poly[j].X * poly[i].Z - poly[i].X * poly[j].Z; A += cr; cx += (poly[j].X + poly[i].X) * cr; cz += (poly[j].Z + poly[i].Z) * cr; }
  cx /= 3 * A; cz /= 3 * A;
  const xs = poly.map((p) => p.X), zs = poly.map((p) => p.Z);
  const ring = Array.from({ length: RING_N }, (_, k) => {
    const th = (k / RING_N) * 2 * Math.PI, dx = Math.cos(th), dz = Math.sin(th); let best = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i], ex = b.X - a.X, ez = b.Z - a.Z, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-12) continue;
      const t = ((a.X - cx) * ez - (a.Z - cz) * ex) / den, u = ((a.X - cx) * dz - (a.Z - cz) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    return best;
  });
  return { poly, cx, cz, hx: (Math.max(...xs) - Math.min(...xs)) / 2, hz: (Math.max(...zs) - Math.min(...zs)) / 2, gate, ring };
}
/** poloměr obrysu ve směru th (lineární interpolace; bez prstence elipsa z obálky) */
export function ringR(geo: IceGeo, th: number): number {
  if (!geo.ring) return 1 / Math.hypot(Math.cos(th) / geo.hx, Math.sin(th) / geo.hz);
  const f = (((th / (2 * Math.PI)) % 1) + 1) % 1 * RING_N, i = Math.floor(f) % RING_N, w = f - Math.floor(f);
  return geo.ring[i] * (1 - w) + geo.ring[(i + 1) % RING_N] * w;
}
/** bod vlastní smyčky ve směru th od středu smyčky */
export function lanePoint(geo: IceGeo, lane: { cx: number; cz: number; k: number }, th: number): World {
  const r = ringR(geo, th) * lane.k; return { X: lane.cx + Math.cos(th) * r, Z: lane.cz + Math.sin(th) * r };
}
/** největší k, při kterém smyčka drží odstup `m` od okraje (s rezervou na posunutý střed) */
export function laneKMax(geo: IceGeo, m = 1.1): number { let k = 0.95; for (let i = 0; i < 32; i++) { const r = ringR(geo, (i / 32) * 2 * Math.PI); k = Math.min(k, 1 - m / Math.max(r, m + 0.1)); } return Math.max(0.3, k); }
export function insideW(p: World, poly: World[]): boolean { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[j], b = poly[i]; if ((b.Z > p.Z) !== (a.Z > p.Z) && p.X < ((a.X - b.X) * (p.Z - b.Z)) / (a.Z - b.Z) + b.X) ins = !ins; } return ins; }
/** nejbližší bod mantinelu (okraj ledu) a vzdálenost */
export function railNearest(poly: World[], p: World): { q: World; d: number; n: World } {
  let best = { q: poly[0], d: Infinity, n: { X: 0, Z: 1 } };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], abX = b.X - a.X, abZ = b.Z - a.Z, L2 = abX * abX + abZ * abZ || 1;
    const t = Math.max(0, Math.min(1, ((p.X - a.X) * abX + (p.Z - a.Z) * abZ) / L2)), q = { X: a.X + abX * t, Z: a.Z + abZ * t };
    const d = Math.hypot(p.X - q.X, p.Z - q.Z);
    if (d < best.d) { const l = Math.sqrt(L2); best = { q, d, n: { X: -abZ / l, Z: abX / l } }; }
  }
  return best;
}

// ---------------------------------------------------------------- vznik
export function createSkater(id: string, prof: SkateProfile, geo: IceGeo, rng: RngState, k: number, n: number): Skater {
  const P = SKATE_PROFILES[prof];
  // smyčky: různě velké zmenšeniny obrysu ledu kolem mírně posunutého středu (nejde o jednu společnou
  // dráhu ani o dokonalý kruh); nejistí jezdí klidněji u okraje, zdatní v celé ploše
  const kMax = laneKMax(geo), q = (k * 0.618 + rand(rng) * 0.3) % 1;
  const kk = prof === 'unsure' ? kMax - 0.08 * q : prof === 'expert' || prof === 'good' || prof === 'goodKid' ? 0.42 + (kMax - 0.42) * q : 0.5 + (kMax - 0.5) * q;
  const sc = Math.min(geo.hx, geo.hz) * 0.08;
  const lane = { cx: geo.cx + randRange(rng, -sc, sc), cz: geo.cz + randRange(rng, -sc, sc) * 0.6, k: kk };
  const ang = (k / Math.max(1, n)) * Math.PI * 2 + randRange(rng, -0.15, 0.15);
  const { X, Z } = lanePoint(geo, lane, ang);
  const s: Skater = {
    id, prof, st: prof === 'beginnerKid' ? 'MARCH' : 'SKATE', tSt: 0, X, Z, psi: ang + Math.PI / 2, v: 0, omega: 0, lane,
    vCruise: randRange(rng, P.v[0], P.v[1]) * (prof === 'beginnerKid' ? 1 : 0.9),
    push: { left: 0, int: 1, t: 0, foot: 0, on: false }, glideLeft: randRange(rng, 0, 1),
    feet: [{ c: 'glide', u: 0, lat: -P.stance, h: 0 }, { c: 'glide', u: 0, lat: P.stance, h: 0 }],
    hipLat: 0, roll: 0, wob: 0, blocked: 0, restAt: randRange(rng, 45, 120), restUntil: 0, cautiousUntil: 0, lastFall: -1e9, lastTrick: -1e9, rng, seedPhase: rand(rng) * 100,
  };
  return s;
}

// ---------------------------------------------------------------- krok jednoho bruslaře
export interface RinkCtx { t: number; dt: number; geo: IceGeo; all: Skater[]; st: RinkState; cfg: RinkConfig }
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ss = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** cílový směr po vlastní smyčce (dopředu po elipse, korekce na ni) */
function laneHeading(s: Skater, geo: IceGeo, dir: number): { psi: number; R: number } {
  const th = Math.atan2(s.Z - s.lane.cz, s.X - s.lane.cx), r = ringR(geo, th) * s.lane.k, dth = (dir * 1.6) / Math.max(1, r);
  const T = lanePoint(geo, s.lane, th + dth);
  // poloměr křivosti smyčky (kružnice třemi body ±1,5 m) – pro náklon a zpomalení před zatáčkou
  const h = 1.5 / Math.max(1, r), A = lanePoint(geo, s.lane, th - h), B = lanePoint(geo, s.lane, th), C = lanePoint(geo, s.lane, th + h);
  const ab = Math.hypot(B.X - A.X, B.Z - A.Z), bc = Math.hypot(C.X - B.X, C.Z - B.Z), ca = Math.hypot(A.X - C.X, A.Z - C.Z);
  const area2 = Math.abs((B.X - A.X) * (C.Z - A.Z) - (B.Z - A.Z) * (C.X - A.X));
  const R = area2 > 1e-6 ? (ab * bc * ca) / (2 * area2) : 99;
  return { psi: Math.atan2(T.Z - s.Z, T.X - s.X), R };
}

/** přejetí do sousední dráhy (vnější/vnitřní smyčka) v mezích ledu */
function changeLane(s: Skater, geo: IceGeo) {
  const kMax = laneKMax(geo), step = 0.7 / Math.max(2, Math.min(geo.hx, geo.hz));
  const out = s.lane.k + step <= kMax, inn = s.lane.k - step >= 0.35;
  const dir = out && inn ? (rand(s.rng) < 0.5 ? 1 : -1) : out ? 1 : inn ? -1 : 0;
  s.lane.k += step * dir;
}

/** volný koridor před bruslařem: nejbližší postava v kuželu dopředu (m), nebo Infinity */
function gapAhead(s: Skater, all: Skater[], reach: number): { d: number; who: Skater | null } {
  let best = { d: Infinity, who: null as Skater | null };
  const fx = Math.cos(s.psi), fz = Math.sin(s.psi);
  for (const o of all) {
    if (o === s || o.pair === s.id) continue;
    const rx = o.X - s.X, rz = o.Z - s.Z, along = rx * fx + rz * fz, across = Math.abs(-rx * fz + rz * fx);
    if (along <= 0 || along > reach || across > 0.7) continue;
    const d = Math.hypot(rx, rz); if (d < best.d) best = { d, who: o };
  }
  return best;
}

export function stepSkater(s: Skater, c: RinkCtx): void {
  const P = SKATE_PROFILES[s.prof], dt = c.dt, t = c.t;
  s.tSt += dt;
  const cautious = t < s.cautiousUntil ? 0.6 : 1;
  let vTarget = s.vCruise * cautious, steer = s.psi, curveR = 99;
  // ---- záměr a navigace
  switch (s.st) {
    case 'SKATE': case 'TRICK_PREPARE': case 'TRICK': case 'TRICK_EXIT': {
      const lh = laneHeading(s, c.geo, c.cfg.dir); steer = lh.psi; curveR = lh.R;
      // před zatáčkou mírně zpomalit (boční zrychlení v²/R v mezích stylu)
      const latMax = G * Math.tan((P.leanMax * Math.PI) / 180);
      vTarget = Math.min(vTarget, Math.sqrt(latMax * Math.max(P.rMin, curveR)));
      // odstup: 0,6 m + v × 1 s + těla; pomalejší vpředu → zpomalit (předjíždění jen volným koridorem)
      // model odstupu: rychlost předchozího ve směru jízdy + volná mezera nad minimem za 1 s (rovnováha
      // nekolabuje ani v uzavřeném okruhu); dlouho zdržený bruslař přejede do sousední dráhy (předjetí)
      const g = gapAhead(s, c.all, 4.5);
      if (g.who) {
        const o = g.who, vAlong = Math.max(0, o.v * Math.cos(o.psi - s.psi)), d0 = 0.6 + 0.46 + (o.st === 'FALL' || o.st === 'RECOVER' || o.prof === 'beginnerKid' ? 0.6 : 0);
        const vGap = vAlong + Math.max(0, g.d - d0) / 1.0;
        vTarget = Math.min(vTarget, vGap);
        s.blocked = vGap < s.vCruise * 0.75 ? s.blocked + dt : Math.max(0, s.blocked - dt);
      } else s.blocked = Math.max(0, s.blocked - dt);
      // stojící překážka (odpočívající, dítě u mantinelu): pomalu objet po straně blíž ke středu ledu
      if (g.who && g.who.v < 0.15 && s.blocked > 1.2 && !s.pair) {
        const o = g.who, rx = o.X - s.X, rz = o.Z - s.Z, d = Math.hypot(rx, rz) || 1, px = -rz / d, pz = rx / d;
        const sgn = (c.geo.cx - o.X) * px + (c.geo.cz - o.Z) * pz >= 0 ? 1 : -1;
        steer = Math.atan2(o.Z + pz * sgn * 1.3 - s.Z, o.X + px * sgn * 1.3 - s.X); vTarget = Math.max(vTarget, 0.3);
      }
      if (s.blocked > 1.5 && !s.pair && !(g.who && g.who.v < 0.15)) { changeLane(s, c.geo); s.blocked = 0; }
      // odpočinek u okraje (možnost, ne povinný rituál): dojet k mantinelu, tam zabrzdit
      if (s.st === 'SKATE' && t > s.restAt && !s.pair) {
        if (!s.goal) { const rn = railNearest(c.geo.poly, { X: s.X, Z: s.Z }); s.goal = { X: rn.q.X + rn.n.X * 0.55 + Math.cos(s.psi) * 1.2, Z: rn.q.Z + rn.n.Z * 0.55 + Math.sin(s.psi) * 1.2 }; if (!insideW(s.goal, c.geo.poly) || railNearest(c.geo.poly, s.goal).d < 0.4) s.goal = { X: rn.q.X + rn.n.X * 0.6, Z: rn.q.Z + rn.n.Z * 0.6 }; }
        const dx = s.goal.X - s.X, dz = s.goal.Z - s.Z, d = Math.hypot(dx, dz);
        steer = Math.atan2(dz, dx); vTarget = Math.min(vTarget, 0.25 + d * 0.4);
        if (d < 0.7 || t - s.restAt > 25) { s.st = 'BRAKE'; s.tSt = 0; s.restUntil = 0; s.goal = null; }
      }
      if (s.st === 'TRICK' || s.st === 'TRICK_PREPARE' || s.st === 'TRICK_EXIT') {
        stepTrickMotion(s, c);
        if (s.trick?.kind === 'spin') vTarget = Math.min(vTarget, s.trick.phase === 'do' ? 0.12 : 0.5);
      }
      break;
    }
    case 'BRAKE': {
      vTarget = 0;
      if (s.v < 0.03) { s.v = 0; s.st = 'REST'; s.tSt = 0; s.restUntil = t + randRange(s.rng, 5, 20); }
      break;
    }
    case 'REST': {
      vTarget = 0;
      if (t > s.restUntil) { s.st = 'SKATE'; s.tSt = 0; s.restAt = t + randRange(s.rng, 45, 120); s.push.left = 0; s.glideLeft = 0; }
      break;
    }
    case 'MARCH': {
      // dítě poprvé: drobné kroky podél mantinelu k lokálnímu cíli, pauzy; nejezdí okruhy
      const rn = railNearest(c.geo.poly, { X: s.X, Z: s.Z });
      if (!s.goal || Math.hypot(s.goal.X - s.X, s.goal.Z - s.Z) < 0.35 || railNearest(c.geo.poly, s.goal).d < 0.45) {
        if (s.goal && s.tSt < 1e9) { s.restUntil = t + randRange(s.rng, 0.6, 2.2); s.goal = null; } // krátké zastávky
        if (t > s.restUntil) { // nový cíl pár metrů podél mantinelu (0,45 m od něj)
          const along = { X: -rn.n.Z, Z: rn.n.X }, d = randRange(s.rng, 2.5, 5) * (c.cfg.dir > 0 ? 1 : -1);
          s.goal = { X: rn.q.X + rn.n.X * 0.6 + along.X * d, Z: rn.q.Z + rn.n.Z * 0.6 + along.Z * d };
          if (!insideW(s.goal, c.geo.poly)) s.goal = { X: c.geo.cx + (rn.q.X - c.geo.cx) * 0.8, Z: c.geo.cz + (rn.q.Z - c.geo.cz) * 0.8 };
        }
      }
      if (s.goal && t > s.restUntil) { steer = Math.atan2(s.goal.Z - s.Z, s.goal.X - s.X); vTarget = s.vCruise; } else vTarget = 0;
      break;
    }
    case 'WOBBLE': {
      vTarget = s.v * 0.97;
      break;
    }
    case 'FALL': case 'RECOVER': {
      vTarget = 0;
      break;
    }
    case 'EXIT': {
      // odjezd ke vstupu: plynule zpomalit, u branky zastavit (pak přezutí na lavičce)
      const G = c.geo.entryIce ?? c.geo.gate, dx = G.X - s.X, dz = G.Z - s.Z, d = Math.hypot(dx, dz);
      steer = Math.atan2(dz, dx); vTarget = Math.min(vTarget, 0.15 + d * 0.3);
      if (d < 0.45 && s.v < 0.45) { s.st = 'OUT'; s.tSt = 0; s.v = 0; }
      break;
    }
    case 'OUT': vTarget = 0; s.v = 0; break;
    default: break;
  }
  // doprovod: rodič se přizpůsobí dítěti (jede vedle něj), dítě jede k rodiči
  if (s.pair && s.holdHand) {
    const o = c.all.find((x) => x.id === s.pair);
    if (o && s.prof !== 'beginnerKid') {
      // rodič: místo po boku dítěte (0,55 m na vnější straně), rychlost dítěte
      const side = { X: -Math.sin(o.psi), Z: Math.cos(o.psi) }, T = { X: o.X + side.X * 0.55, Z: o.Z + side.Z * 0.55 };
      const dx = T.X - s.X, dz = T.Z - s.Z, d = Math.hypot(dx, dz);
      steer = d > 0.08 ? Math.atan2(dz, dx) : o.psi; vTarget = o.v + clamp(d * 0.8, 0, 0.3) * (Math.cos(Math.atan2(dz, dx) - o.psi) > 0 ? 1 : -1);
      if (d < 0.12) { steer = o.psi; vTarget = o.v; }
      vTarget = Math.max(0, vTarget);
    }
  }
  // ---- vyhýbání: blízké postavy před bruslařem odkloní cílový směr na volnou stranu (objetí místo zastavení)
  if (s.st !== 'FALL' && s.st !== 'RECOVER' && s.st !== 'REST' && !(s.pair && s.prof !== 'beginnerKid')) {
    const fx = Math.cos(steer), fz = Math.sin(steer); let off = 0;
    for (const o of c.all) {
      if (o === s || o.id === s.pair) continue;
      const rx = o.X - s.X, rz = o.Z - s.Z, d = Math.hypot(rx, rz); if (d > 2.4 || d < 1e-6) continue;
      const along = rx * fx + rz * fz; if (along < -0.2) continue;
      const across = -rx * fz + rz * fx, w = ((2.4 - d) / 2.4) * (Math.abs(across) < 1.0 ? 1 : 0.3);
      off += (Math.abs(across) < 0.05 ? c.cfg.dir : -Math.sign(across)) * w;
    }
    steer = wrap(steer + clamp(off * 0.9, -1.1, 1.1));
  }
  // ---- pohyb: natočení s omezeným zakřivením (při malé rychlosti přeorientování po malých krocích)
  const dpsi = wrap(steer - s.psi), maxRate = s.v > 0.15 ? s.v / P.rMin : 1.2;
  s.omega = clamp(dpsi * 2.5, -maxRate, maxRate);
  if (s.st !== 'FALL') s.psi = wrap(s.psi + s.omega * dt);
  // ---- lokomoce: rychlost roste jen při zatíženém odrazu; skluz pomalu brzdí; brzda výrazněji
  stepLocomotion(s, c, vTarget);
  // ---- posun po ledu (svět), hranice ledu (obrys minus šířka těla)
  const nx = s.X + Math.cos(s.psi) * s.v * dt, nz = s.Z + Math.sin(s.psi) * s.v * dt;
  const rn = railNearest(c.geo.poly, { X: nx, Z: nz });
  if (insideW({ X: nx, Z: nz }, c.geo.poly) && rn.d > 0.3) { s.X = nx; s.Z = nz; }
  else {
    // u mantinelu: složka pohybu ven se odebere (sklouznutí podél), směr se stočí podél mantinelu
    const r0 = railNearest(c.geo.poly, { X: s.X, Z: s.Z }), ix = s.X - r0.q.X, iz = s.Z - r0.q.Z, il = Math.hypot(ix, iz) || 1;
    const nin = insideW({ X: s.X, Z: s.Z }, c.geo.poly) ? { X: ix / il, Z: iz / il } : { X: -ix / il, Z: -iz / il };
    let mx = nx - s.X, mz = nz - s.Z; const out = mx * nin.X + mz * nin.Z;
    if (out < 0) { mx -= out * nin.X; mz -= out * nin.Z; }
    if (r0.d < 0.3) { mx += nin.X * 0.2 * dt; mz += nin.Z * 0.2 * dt; }
    const m = Math.hypot(mx, mz);
    s.X += mx; s.Z += mz; s.v = Math.min(s.v, (m / dt) * 0.98);
    if (m > 1e-5) s.psi = wrap(s.psi + clamp(wrap(Math.atan2(mz, mx) - s.psi), -1.5 * dt, 1.5 * dt));
  }
  // náklon do oblouku: tan(φ) ≈ v²/(gR) = v·ω/g, omezený stylem
  const want = (Math.atan2(s.v * s.omega, G) * 180) / Math.PI;
  s.roll += (clamp(want, -P.leanMax, P.leanMax) - s.roll) * Math.min(1, dt * 4);
}

/** Lokomoce: série odrazů (alternující nohy), přenos váhy, skluz, návrat volné nohy; brzda pluhem. */
function stepLocomotion(s: Skater, c: RinkCtx, vTarget: number) {
  const P = SKATE_PROFILES[s.prof], dt = c.dt;
  const L = 1; // pózy v násobcích délky nohy (kostra je převede)
  const stance = P.stance * (s.st === 'WOBBLE' ? 1.6 : 1);
  // odpor skluzu: malý (led), u začátečníka větší (krátký skluz)
  const drag = (s.prof === 'beginnerKid' ? 0.12 : s.prof === 'unsure' ? 0.08 : 0.05) + 0.025 * s.v * s.v;
  if (s.st === 'BRAKE' || ((s.st === 'SKATE' || s.st === 'MARCH' || s.st === 'EXIT') && s.v > vTarget + 0.25)) {
    // brzda: příprava postoje (pluh: špičky k sobě), postupný pokles rychlosti – nikdy okamžité zastavení
    const dec = s.st === 'BRAKE' ? P.brake * ss(s.tSt / 0.35) + drag : drag + 0.3;
    s.v = Math.max(0, s.v - dec * dt);
    s.push.on = false;
    s.feet[0] = { c: 'glide', u: 0.02, lat: -stance * 1.6, h: 0 }; s.feet[1] = { c: 'glide', u: 0.02, lat: stance * 1.6, h: 0 };
    s.hipLat += (0 - s.hipLat) * Math.min(1, dt * 4);
    return;
  }
  if (s.st === 'FALL' || s.st === 'RECOVER') { s.v = Math.max(0, s.v - (s.st === 'FALL' ? 1.6 : 4) * dt); return; }
  if (s.st === 'REST' || s.st === 'OUT' || (vTarget < 0.02 && s.v < 0.05 && !s.push.on)) {
    s.v = Math.max(0, s.v - (drag + 0.4) * dt);
    s.feet[0] = { c: 'glide', u: 0, lat: -stance, h: 0 }; s.feet[1] = { c: 'glide', u: 0, lat: stance, h: 0 };
    s.hipLat *= 0.9; return;
  }
  // rozhodnutí o sérii: pod cílovou rychlostí a po dojezdu → nová série (počet a interval pro celou sérii)
  if (!s.push.on) {
    s.glideLeft -= dt;
    if (s.v < vTarget * 0.92 && s.glideLeft <= 0) {
      s.push = { left: Math.round(randRange(s.rng, P.pushN[0], P.pushN[1])), int: randRange(s.rng, P.pushInt[0], P.pushInt[1]), t: 0, foot: s.push.foot === 0 ? 1 : 0, on: true };
      if (s.v < 0.2) s.push.int = Math.min(s.push.int, 1.0); // rozjezd: krátký první odraz
    }
  }
  const fIdx = s.push.foot, oIdx = (1 - fIdx) as 0 | 1, side = fIdx === 0 ? -1 : 1;
  if (s.push.on) {
    const T = s.push.int, ph = s.push.t / T; // 0..1 jednoho kroku
    // časování kroku: příprava + přenos (0–0.15), odraz (0.15–0.5), návrat volné nohy (0.5–0.85), položení (0.85–1)
    const prep = ph < 0.15, pushing = ph >= 0.15 && ph < 0.5, ret = ph >= 0.5 && ph < 0.85;
    const glideF: Blade = { c: 'glide', u: 0.02, lat: -side * stance * 0.6, h: 0 };
    let pushF: Blade;
    if (prep) pushF = { c: 'light', u: 0, lat: side * stance, h: 0 };
    else if (pushing) { const k = ss((ph - 0.15) / 0.35); pushF = { c: 'push', u: -0.22 * k * L, lat: side * (stance + 0.26 * k), h: 0 }; }
    else if (ret) { const k = ss((ph - 0.5) / 0.35); pushF = { c: 'return', u: -0.22 * (1 - k), lat: side * (stance + 0.26 * (1 - k)), h: 0.045 * Math.sin(Math.PI * k) }; }
    else pushF = { c: 'light', u: 0, lat: side * stance, h: 0 };
    s.feet[fIdx] = pushF; s.feet[oIdx] = glideF;
    // pánev nad opěrnou (skluzovou) nohu – malý plynulý přesun
    const want = -side * stance * 0.55 * (prep ? ss(ph / 0.15) : ph < 0.85 ? 1 : 1 - ss((ph - 0.85) / 0.15));
    s.hipLat += (want - s.hipLat) * Math.min(1, dt * 6);
    // zrychlení jen při zatíženém odrazu: tolik, aby série dosáhla cílové rychlosti (a pokryla odpor)
    // (odpor působí vždy, odraz ho během zatížení překoná: čisté zrychlení ≤ aPush)
    if (pushing) {
      const dur = 0.35 * T, need = Math.max(0, vTarget - s.v) / Math.max(1, s.push.left) / dur + drag * (T / dur - 1); // + ztráta mimo odraz
      s.v += (Math.min(P.aPush, need) + drag) * dt;
    }
    s.v = Math.max(0, s.v - drag * dt);
    s.push.t += dt;
    if (s.push.t >= T) {
      s.push.left--; c.st.stats.pushes++;
      s.push.t = 0; s.push.foot = oIdx;
      if (s.push.left <= 0 || s.v >= vTarget) { s.push.on = false; s.glideLeft = randRange(s.rng, P.glide[0], P.glide[1]); }
    }
  } else {
    // společný dojezd na obou bruslích
    s.v = Math.max(0, s.v - drag * dt);
    s.feet[0] = { c: 'glide', u: 0.03, lat: -stance, h: 0 }; s.feet[1] = { c: 'glide', u: -0.03, lat: stance, h: 0 };
    s.hipLat += (0 - s.hipLat) * Math.min(1, dt * 3);
  }
}

/** Pohyb během prvku: jednonohý skluz / krátká jízda vzad (nájezd, provedení, výjezd). */
function stepTrickMotion(s: Skater, c: RinkCtx) {
  const tr = s.trick!; tr.t += c.dt;
  // pirueta: otáčení těla kolem svislé osy (rychlost ω = vrchol·sin(π t / T), přesně dvě otáčky – tělo
  // skončí zase čelem po směru jízdy), jízda se při ní téměř zastaví
  if (tr.kind === 'spin') s.spin = tr.phase === 'do' ? c.cfg.dir * 2 * Math.PI * (1 - Math.cos((Math.PI * Math.min(tr.t, tr.dur)) / tr.dur)) : 0;
  // jízda vzad: plynulá půlotočka těla na konci nájezdu a zpět při výjezdu (žádné otočení spritu naráz)
  if (tr.kind === 'backward') s.spin = c.cfg.dir * Math.PI * (tr.phase === 'prep' ? ss((tr.t - 0.35) / 0.65) : tr.phase === 'do' ? 1 : 1 - ss(tr.t / 0.8));
  // skok: otočka jen ve vzduchu (jedna celá, plynule se rozjede a dobrzdí), dopad zase po směru jízdy
  if (tr.kind === 'jump') s.spin = tr.phase === 'do' ? c.cfg.dir * 2 * Math.PI * ss(tr.t / tr.dur) : 0;
  if (tr.phase === 'prep' && tr.t > prepDur(tr.kind)) { tr.phase = 'do'; tr.t = 0; s.st = 'TRICK'; }
  else if (tr.phase === 'do' && tr.t > tr.dur) { tr.phase = 'exit'; tr.t = 0; s.st = 'TRICK_EXIT'; }
  else if (tr.phase === 'exit' && tr.t > exitDur(tr.kind)) { s.st = 'SKATE'; s.tSt = 0; s.trick = null; s.lastTrick = c.t; c.st.event = null; c.st.lastTrickEnd = c.t; s.glideLeft = 0.5; }
}

// ---------------------------------------------------------------- globální události (pády, prvky)
export function stepRinkEvents(c: RinkCtx): void {
  const st = c.st, t = c.t, ev = c.cfg.events ?? {};
  // pád: jeden pokus za celé kluziště po 100–220 s, nejvýše jeden probíhající, osobně ≥ 180 s
  if (!st.event && t >= st.nextFall) {
    st.nextFall = t + randRange(st.rng, ...(ev.fallEvery ?? [100, 220]));
    const cands = c.all.filter((s) => (s.st === 'SKATE' || s.st === 'MARCH') && !s.holdHand && t - s.lastFall >= (ev.fallPersonal ?? 180) && (s.v > 0.15 || s.prof === 'beginnerKid') && t - st.lastTrickEnd > 20);
    const tot = cands.reduce((q, s) => q + SKATE_PROFILES[s.prof].fallW, 0);
    if (tot > 0) {
      let r = rand(st.rng) * tot; const s = cands.find((x) => (r -= SKATE_PROFILES[x.prof].fallW) < 0) ?? cands[0];
      // podnět: zakolísání (zaváhání); většina ustojí, část skončí pádem
      s.st = 'WOBBLE'; s.tSt = 0; s.wob = 1; st.stats.wobbles++;
      (s as Skater & { willFall?: boolean }).willFall = rand(st.rng) < (ev.fallChance ?? 0.6); st.event = { kind: 'fall', id: s.id, t0: t };
    }
  }
  // prvek: globální interval 90–150 s; kandidáti s dovedností, osobní odstup jen při ≥ 2 způsobilých
  if (t >= st.nextTrick) {
    if (st.trickWindow === null) st.trickWindow = t;
    const capable = c.all.filter((s) => { const k = SKATE_PROFILES[s.prof].skills; return k.oneFoot || k.backward || k.spin || k.jump || k.arabesque; });
    const personal = capable.length >= 2 ? randRange(st.rng, ...(ev.trickPersonal ?? [180, 300])) : 0;
    const ready = !st.event && t - st.lastFallEnd > 20 ? capable.filter((s) => s.st === 'SKATE' && s.v > 0.7 && t - s.lastTrick >= personal && t - s.lastFall > 30) : []; // pád a prvek nikdy současně ani těsně za sebou
    const kinds = availableTricks(c.cfg).filter((k) => k !== st.lastTrickKind || availableTricks(c.cfg).length === 1);
    let started = false;
    for (const s of ready) {
      const sk = SKATE_PROFILES[s.prof].skills, ks = kinds.filter((k) => (k === 'oneFoot' && sk.oneFoot) || (k === 'backward' && sk.backward) || (k === 'spin' && sk.spin) || (k === 'jump' && sk.jump) || (k === 'arabesque' && sk.arabesque));
      if (!ks.length) continue;
      const W = ks.map((k) => (ev.tricks?.[k] ?? TRICK_WEIGHTS[k])), tot = W.reduce((a, b) => a + b, 0);
      let r = rand(st.rng) * tot; const kind = ks.find((_, i) => (r -= W[i]) < 0) ?? ks[0];
      const dur = kind === 'oneFoot' ? randRange(st.rng, 3, 5) : kind === 'spin' ? randRange(st.rng, 2.2, 2.8) : kind === 'jump' ? JUMP_AIR : kind === 'arabesque' ? randRange(st.rng, 3, 4.5) : randRange(st.rng, 3, 6);
      if (!spaceFree(s, c, dur + 2)) continue; // nájezd, provedení a výjezd volné
      s.st = 'TRICK_PREPARE'; s.tSt = 0; s.trick = { kind, t: 0, dur, phase: 'prep' }; st.event = { kind: 'trick', id: s.id, t0: t };
      st.stats.tricks++; st.stats.tricksByKind[kind] = (st.stats.tricksByKind[kind] ?? 0) + 1; st.lastTrickKind = kind;
      st.nextTrick = t + randRange(st.rng, ...(ev.trickEvery ?? [90, 150])) + dur + 2; st.trickWindow = null; started = true;
      break;
    }
    // bez prostoru 20–30 s: odložit o 30–60 s (žádná fronta zmeškaných triků)
    if (!started && st.trickWindow !== null && t - st.trickWindow > 25) { st.nextTrick = t + randRange(st.rng, 30, 60); st.trickWindow = null; st.stats.deferred++; }
  }
  // průběh zaváhání a pádu
  for (const s of c.all) {
    if (s.st === 'WOBBLE') {
      s.wob = 1;
      if (s.tSt > 0.4 + 0.6 * ((s.seedPhase * 7) % 1)) {
        if ((s as Skater & { willFall?: boolean }).willFall) {
          // nízký pád: dozadu do sedu (vstává s oporou rukou), nebo bokem (vstává přes klek); pád dopředu
          // končí o kus dál a na ledě by po vstání poskočil – nepoužívá se
          const v: FallVariant = rand(s.rng) < (s.prof === 'beginnerKid' || s.prof === 'unsure' ? 0.6 : 0.5) ? 'back' : 'side';
          s.st = 'FALL'; s.tSt = 0; s.fall = { t: 0, v0: s.v, v }; st.stats.falls++; s.lastFall = t;
        }
        else { s.st = s.prof === 'beginnerKid' ? 'MARCH' : 'SKATE'; s.tSt = 0; s.wob = 0; s.cautiousUntil = t + 6; st.event = null; }
      }
    } else if (s.st === 'FALL') {
      s.fall!.t += c.dt;
      if (s.fall!.t > rinkFallLen(s.fall!.v ?? 'back')) { s.st = 'RECOVER'; s.tSt = 0; }
    } else if (s.st === 'RECOVER') {
      if (s.tSt > 1.2) { s.st = s.prof === 'beginnerKid' ? 'MARCH' : 'SKATE'; s.tSt = 0; s.fall = null; s.wob = 0; s.cautiousUntil = t + randRange(s.rng, 5, 12); s.push.left = 0; s.glideLeft = 0; st.event = null; st.lastFallEnd = t; }
    } else if (s.wob > 0) s.wob = Math.max(0, s.wob - c.dt * 2);
  }
}
/** Ladění: hned spustí zaváhání s pádem / prvek u zadaného (nebo vhodného) bruslaře; vrací id nebo důvod. */
export function forceRinkEvent(c: RinkCtx, kind: 'fall' | 'trick', id?: string | null, trick?: TrickKind): { ok: boolean; msg: string } {
  const st = c.st;
  if (st.event) return { ok: false, msg: 'Už probíhá jiná událost na ledě.' };
  const pool = id ? c.all.filter((s) => s.id === id) : c.all;
  if (kind === 'fall') {
    const s = pool.find((x) => (x.st === 'SKATE' || x.st === 'MARCH') && !x.holdHand);
    if (!s) return { ok: false, msg: 'Žádný vhodný bruslař (jede sám, bez události).' };
    s.st = 'WOBBLE'; s.tSt = 0; s.wob = 1; (s as Skater & { willFall?: boolean }).willFall = true; st.event = { kind: 'fall', id: s.id, t0: c.t }; st.stats.wobbles++;
    return { ok: true, msg: s.id };
  }
  const s = pool.find((x) => x.st === 'SKATE' && (trick === 'backward' ? SKATE_PROFILES[x.prof].skills.backward : SKATE_PROFILES[x.prof].skills.oneFoot || SKATE_PROFILES[x.prof].skills.backward));
  if (!s) return { ok: false, msg: 'Žádný bruslař s dovedností pro prvek.' };
  const k: TrickKind = trick ?? (SKATE_PROFILES[s.prof].skills.backward && rand(st.rng) < 0.5 ? 'backward' : 'oneFoot');
  s.st = 'TRICK_PREPARE'; s.tSt = 0; s.trick = { kind: k, t: 0, dur: k === 'jump' ? JUMP_AIR : k === 'spin' ? 2.5 : 4, phase: 'prep' }; st.event = { kind: 'trick', id: s.id, t0: c.t };
  st.stats.tricks++; st.stats.tricksByKind[k] = (st.stats.tricksByKind[k] ?? 0) + 1;
  return { ok: true, msg: s.id };
}
/** délka pádu (s) – podle klíčových póz „uklouznutí dozadu do sedu“ bez oprášení */
export const FALL_TOTAL = 5.6;
/** posun času klíčových póz pádu (začínají ztrátou opory, kterou na ledě hraje zaváhání) */
export const RINK_FALL_T0 = 0.25;
/** délka pádu na ledě po vstávání (bez oprašování – to přechází do obnovení rovnováhy) */
export const rinkFallLen = (v: FallVariant) => (FALL_KEYS[v].find((k) => k.ph === 'brush')?.t ?? fallDuration(v)) - RINK_FALL_T0 - 0.1;
export function availableTricks(cfg: RinkConfig): TrickKind[] {
  const w = { ...TRICK_WEIGHTS, ...(cfg.events?.tricks ?? {}) };
  if (!cfg.events?.jump) w.hop = 0;
  return (Object.keys(w) as TrickKind[]).filter((k) => w[k] > 0);
}
/** volný prostor po dráze prvku: ostatní předpovězení přímočaře, rezerva 1–1,5 m + rychlost */
export function spaceFree(s: Skater, c: RinkCtx, dur: number): boolean {
  for (let k = 0; k <= 10; k++) {
    const th0 = Math.atan2(s.Z - s.lane.cz, s.X - s.lane.cx), tt = (k / 10) * dur, th = th0 + (c.cfg.dir * (s.v * tt)) / Math.max(1, ringR(c.geo, th0) * s.lane.k);
    const P = lanePoint(c.geo, s.lane, th);
    for (const o of c.all) {
      if (o === s) continue;
      const O = { X: o.X + Math.cos(o.psi) * o.v * tt, Z: o.Z + Math.sin(o.psi) * o.v * tt };
      if (Math.hypot(P.X - O.X, P.Z - O.Z) < 1.2 + 0.3 * s.v + (o.prof === 'beginnerKid' || o.holdHand ? 0.6 : 0)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- tvrdé oddělení těl (žádné průniky)
export function separate(all: Skater[], R = 0.24): void {
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j], dx = b.X - a.X, dz = b.Z - a.Z, d = Math.hypot(dx, dz), minD = 2 * R + (a.pair === b.id ? -0.05 : 0.02);
    if (d >= minD || d < 1e-9) continue;
    const k = (minD - d) / d / 2, fa = a.st === 'FALL' || a.st === 'RECOVER' ? 0 : 1, fb = b.st === 'FALL' || b.st === 'RECOVER' ? 0 : 1, sum = fa + fb || 1;
    a.X -= dx * k * 2 * (fa / sum); a.Z -= dz * k * 2 * (fa / sum); b.X += dx * k * 2 * (fb / sum); b.Z += dz * k * 2 * (fb / sum);
    // kontakt: oba zpomalí (žádné odrážení jako biliár)
    a.v *= 0.97; b.v *= 0.97;
  }
}

/** stopy nožů: jen skutečný kontakt zatížené brusle, omezený počet, postupně mizí */
/** Po oddělení těl: nikdo nesmí zůstat za okrajem ani těsně u něj (nejméně 0,3 m dovnitř). */
export function clampToIce(all: Skater[], geo: IceGeo, m = 0.3): void {
  for (const s of all) {
    const p = { X: s.X, Z: s.Z }, rn = railNearest(geo.poly, p), inside = insideW(p, geo.poly);
    if (inside && rn.d >= m) continue;
    const dx = geo.cx - rn.q.X, dz = geo.cz - rn.q.Z, d = Math.hypot(dx, dz) || 1; // dovnitř: k těžišti
    s.X = rn.q.X + (dx / d) * m; s.Z = rn.q.Z + (dz / d) * m;
  }
}
export function addTrails(st: RinkState, s: Skater, t: number, prevXZ: World) {
  if (s.v < 0.25 || s.st === 'FALL' || s.st === 'RECOVER') return;
  const fx = Math.cos(s.psi), fz = Math.sin(s.psi), side = { X: -fz, Z: fx };
  for (const b of s.feet) {
    if (b.c !== 'glide' && b.c !== 'push') continue;
    const off = b.lat * 0.9, X = s.X + side.X * off, Z = s.Z + side.Z * off, X0 = prevXZ.X + side.X * off, Z0 = prevXZ.Z + side.Z * off;
    st.trails.push({ X: X0, Z: Z0, X2: X, Z2: Z, t0: t });
  }
  if (st.trails.length > TRAIL_POOL) st.trails.splice(0, st.trails.length - TRAIL_POOL);
}

/** stav agenta pro ladicí výpis */
export const skaterOf = (st: RinkState | undefined, a: AgentState) => st?.sk[a.id];

// ---------------------------------------------------------------- póza (cíle pro kostru)
/** výška nože a držáku brusle (násobky délky nohy) – celá postava stojí o tolik výš */
export const BLADE_H = 0.075;
const STAND = 1.04;
/**
 * Póza bruslaře z jeho stavu: pánev nad opěrnou bruslí, měkká kolena, malý předklon, stabilní hlava,
 * volné paže s mírnou protiváhou (nejistí ruce do stran), náklon do oblouku; brusle podle kontaktu.
 * `partnerSide`: +1 / −1 = partner (ruka v ruce) na blízké / vzdálené straně v obraze, 0 = žádný.
 */
export function skatePose(s: Skater, t: number, opts: { kidArm?: boolean; partnerSide?: number; backwardBody?: boolean } = {}): FallKey {
  const P = SKATE_PROFILES[s.prof];
  const ph = s.push.on ? s.push.t / s.push.int : 0, pushing = s.push.on && ph >= 0.15 && ph < 0.5;
  // kolena: měkké pokrčení, mírné propnutí při odrazu; nejistí vzpřímenější
  const knee = P.knee + (pushing ? -0.015 : 0.01) + (s.st === 'BRAKE' ? 0.03 : 0) + (s.st === 'WOBBLE' ? 0.05 : 0);
  // pomalý plynulý signál pro drobnou variaci (ne náhoda každým snímkem)
  const sway = Math.sin(t * 0.9 + s.seedPhase) * 0.01;
  let feet: [P3, P3] = [0, 1].map((i) => { const b = s.feet[i]; return { u: b.u, h: BLADE_H + b.h, lat: b.lat, th: b.c === 'return' ? -6 : 0 }; }) as [P3, P3];
  const a = P.arms, cross = s.push.on ? (s.push.foot === 0 ? 1 : -1) * Math.sin(Math.PI * Math.min(1, ph / 0.85)) * 0.12 * (1 - a) : 0;
  let hands: [P3, P3] = [
    { u: 0.06 + a * 0.12 + cross, h: 0.98 + a * 0.15, lat: -(0.18 + a * 0.42) },
    { u: 0.06 + a * 0.12 - cross, h: 0.98 + a * 0.15, lat: 0.18 + a * 0.42 },
  ];
  let pitch = P.pitch + (pushing ? 2 : 0), head = -P.pitch * 0.6 + (s.prof === 'beginnerKid' ? 8 : 0); // hlava poměrně stabilní, nováček občas dolů
  const hip: P3 = { u: 0, h: STAND + BLADE_H - knee, lat: s.hipLat + sway };
  if (s.st === 'WOBBLE') {
    // zaváhání: rozhozené paže, širší postoj, kolísání pánve (bez trvalého třesení)
    const w = Math.sin(s.tSt * 9) * 0.06;
    hands = [{ u: 0.25, h: 1.45, lat: -0.7 }, { u: 0.2, h: 1.35 + w, lat: 0.7 }];
    hip.lat = (hip.lat ?? 0) + w; pitch += 6 * Math.sin(s.tSt * 6);
  }
  if (s.trick && (s.st === 'TRICK' || s.st === 'TRICK_PREPARE' || s.st === 'TRICK_EXIT')) {
    const tr = s.trick, k = tr.phase === 'prep' ? ss(tr.t / prepDur(tr.kind)) : tr.phase === 'do' ? 1 : 1 - ss(tr.t / exitDur(tr.kind));
    if (tr.kind === 'jump') {
      // skok s otočkou: nájezd na jedné noze s pokrčeným kolenem a rukama vzadu → rozmach volnou
      // nohou dozadu a prudce vpřed nahoru, ruce vpřed → odraz → ve vzduchu nohy u sebe, ruce na hrudi,
      // otočka (natočení těla řídí s.spin) → dopad na jednu nohu, volná noha dozadu, ruce do stran
      const sup = 0, free = 1;
      if (tr.phase === 'prep') {
        const T = prepDur('jump'), a = ss(tr.t / (T * 0.55)), b = ss((tr.t - T * 0.55) / (T * 0.45)); // a: nájezd a nádech, b: švih
        hip.h -= 0.12 * a * (1 - b * 0.6); hip.lat = -0.05 * a; pitch = P.pitch + 8 * a - 6 * b;
        feet[sup] = { u: 0.02, h: BLADE_H, lat: -0.04, th: 0 };
        feet[free] = { u: -0.55 * a * (1 - b) + 0.62 * b, h: BLADE_H + 0.2 * a * (1 - b) + 0.72 * b, lat: 0.06, th: -30 * a * (1 - b) + 30 * b }; // rozmach dozadu → švih vpřed nahoru
        hands = [{ u: -0.25 * a * (1 - b) + 0.35 * b, h: 1.0 + 0.35 * b, lat: -0.35 }, { u: -0.3 * a * (1 - b) + 0.4 * b, h: 1.0 + 0.35 * b, lat: 0.35 }];
      } else if (tr.phase === 'do') {
        const u = tr.t / tr.dur, tuck = Math.sin(Math.PI * Math.min(1, u * 1.2));
        feet = [{ u: 0.02, h: BLADE_H + 0.06 * tuck, lat: -0.02, th: 0 }, { u: 0.06 * (1 - tuck), h: BLADE_H + 0.1 + 0.08 * tuck, lat: 0.03, th: 12 }];
        hip.lat = 0; pitch = 2; head = -2;
        hands = [{ u: 0.18, h: 1.32, lat: -0.1 }, { u: 0.2, h: 1.36, lat: 0.1 }];
      } else {
        const a = 1 - ss(tr.t / exitDur('jump')), land = Math.max(0, 1 - tr.t / 0.25); // dopad: pokrčení koleny
        hip.h -= 0.14 * land + 0.04 * a; pitch = P.pitch + 10 * a;
        feet[sup] = { u: 0.02, h: BLADE_H, lat: -0.03, th: 0 };
        feet[free] = { u: -0.5 * a, h: BLADE_H + 0.3 * a, lat: 0.06, th: -25 * a };
        hands = [{ u: 0.1, h: 1.22, lat: -0.75 * a - 0.2 * (1 - a) }, { u: 0.1, h: 1.22, lat: 0.75 * a + 0.2 * (1 - a) }];
      }
    } else if (tr.kind === 'arabesque') {
      // holubička: opěrná noha propnutá, volná noha natažená dozadu do výše pánve, trup v předklonu,
      // ruce rozpažené, hlava zvednutá; plynulý nájezd a návrat
      const sup = 0, free = 1;
      hip.h = STAND + BLADE_H - 0.01; hip.lat = -0.06 * k;
      feet[sup] = { u: 0.04 * k, h: BLADE_H, lat: -0.03, th: 0 };
      feet[free] = { u: -0.92 * k, h: BLADE_H + 0.92 * k, lat: 0.04, th: -40 * k };
      pitch = P.pitch + 52 * k; head = -34 * k;
      hands = [{ u: 0.3 * k + 0.1, h: 1.25 + 0.12 * k, lat: -0.25 - 0.45 * k }, { u: 0.3 * k + 0.1, h: 1.25 + 0.12 * k, lat: 0.25 + 0.45 * k }];
    } else if (tr.kind === 'oneFoot') {
      // jednonohý skluz: přenos váhy, volná noha zvednutá dozadu, paže do stran, klidný průjezd, návrat
      const free = 1, sup = 0;
      feet[sup] = { u: 0.03, h: BLADE_H, lat: -0.04, th: 0 };
      feet[free] = { u: -0.45 * k, h: BLADE_H + 0.3 * k, lat: 0.05 + 0.08 * (1 - k), th: -25 * k };
      hip.lat = -0.05 * k; pitch = P.pitch + 14 * k;
      hands = [{ u: 0.1, h: 1.25, lat: -0.75 * k - 0.2 * (1 - k) }, { u: 0.1, h: 1.25, lat: 0.75 * k + 0.2 * (1 - k) }];
    } else if (tr.kind === 'spin') {
      // pirueta: ruce k tělu, volná noha u kolena opěrné, vzpřímený trup
      feet[0] = { u: 0.02, h: BLADE_H, lat: -0.03, th: 0 };
      feet[1] = { u: 0.04 * k, h: BLADE_H + 0.32 * k, lat: 0.05, th: 10 * k };
      hip.lat = -0.04 * k; pitch = 2 + (1 - k) * P.pitch;
      hands = [{ u: 0.16, h: 1.28 - 0.1 * (1 - k), lat: -0.12 - 0.3 * (1 - k) }, { u: 0.16, h: 1.28 - 0.1 * (1 - k), lat: 0.12 + 0.3 * (1 - k) }];
    } else if (tr.kind === 'backward') {
      // jízda vzad: tělo čelem proti směru rychlosti (řeší natočení postavy), nohy kreslí „C“ střídavě
      const sc = Math.sin(tr.t * Math.PI * 1.4);
      feet = [{ u: 0.05 * sc, h: BLADE_H, lat: -0.12 - 0.08 * Math.max(0, sc) * k, th: 0 }, { u: -0.05 * sc, h: BLADE_H, lat: 0.12 + 0.08 * Math.max(0, -sc) * k, th: 0 }];
      pitch = P.pitch + 4; hands = [{ u: 0.12, h: 1.05, lat: -0.45 }, { u: 0.12, h: 1.05, lat: 0.45 }];
    }
  }
  // ruka v ruce (rodič – dítě): ruka na straně partnera ke společnému bodu mezi nimi
  if (opts.partnerSide) {
    const i = opts.partnerSide > 0 ? 1 : 0;
    hands[i] = opts.kidArm ? { u: 0.05, h: 1.42, lat: 0.54 * (i ? 1 : -1) } : { u: 0.05, h: 0.9, lat: 0.32 * (i ? 1 : -1) };
  }
  // výška skoku nad ledem (v délkách nohy, dospělý ~0,9 m): parabola, celé tělo i brusle nahoru
  if (s.trick?.kind === 'jump' && s.trick.phase === 'do') {
    const u = Math.min(1, s.trick.t / s.trick.dur), z = (4 * JUMP_H * u * (1 - u)) / 0.9;
    hip.h += z; feet = feet.map((f) => ({ ...f, h: f.h + z })) as [P3, P3]; hands = hands.map((q) => ({ ...q, h: q.h + z })) as [P3, P3];
  }
  const air = s.trick?.kind === 'jump' && s.trick.phase === 'do';
  const c = air ? [] : s.feet.map((b, i) => (b.c === 'glide' || b.c === 'push' ? `f${i}~` : b.c === 'light' ? `f${i}` : '')).filter(Boolean);
  return { t: 0, ph: 'pause', hip, pitch, roll: s.roll * (opts.backwardBody ? -1 : 1), head, feet, hands, c };
}
