/**
 * Knihovna sociálních gest (zadání `docs/zdroje/zadani-socialni-interakce-2D.md`, A.2–A.8).
 *
 * Klip = parametrická trajektorie zápěstí jedné nebo obou rukou v souřadnicích vůči středu
 * ramenní linie (jednotky postavy, y NAHORU), plus náklon hlavy a trupu v rovině obrazu a posun
 * pánve. Souřadnice x je „vlastní strana“ paže: kladně = ven na straně jejího ramene (rameno je na
 * +8,7), záporně = přes tělo. Tabulka zadání (ruka A) tak platí pro obě paže; kostra ji podle pohledu
 * převede do obrazu. Paže: 0 = vzdálená, 1 = blízká (drží kelímek – anatomická identita kelímkové
 * ruky se při změně pohledu nemění). Hodnota `R` znamená „aktuální základní póza“ (klid/chůze/
 * držení kelímku) – klip z ní plynule vychází a do ní se vrací (navázání bez skoku, A.3).
 *
 * Vše je čistá funkce času (u ∈ 0..1) a parametrů vylosovaných při spuštění – žádná náhoda tady.
 */
import type { Vec2 } from '../math/vec';

/** Referenční polohy zápěstí ruky A (A.2, [N]). */
export const WRIST = {
  REST: { x: 10.7, y: -44.5 }, READY: { x: 18, y: -28 }, BEAT_UP: { x: 21, y: -22 }, BEAT_DOWN: { x: 22, y: -27 },
  OPEN: { x: 31, y: -22 }, SIZE_IN: { x: 13, y: -22 }, SIZE_OUT: { x: 29, y: -22 }, SHRUG: { x: 24, y: -27 },
  WAVE: { x: 28, y: 10 }, CUP: { x: 12, y: -25 }, POCKET: { x: 11, y: -32 }, RUB: { x: 2.5, y: -18 },
  FACE_NEAR: { x: 5, y: 17 }, SCARF: { x: -7, y: 5 }, CAP: { x: 11, y: 15 },
} as const;

export type Family =
  | 'beat' | 'point' | 'size' | 'open' | 'shrug' | 'cupBeat'
  | 'nod' | 'tilt' | 'greetNod' | 'thanks' | 'waveFar' | 'amusement'
  | 'rubHands' | 'adjustScarf' | 'adjustCap' | 'hunch' | 'queuePeek' | 'warmCup'
  /** práce (sněhulák): tlačení koule, zvednutí, zdobení – souřadnice x DOPŘEDU ve směru pohledu */
  | 'push' | 'lift' | 'decorate' | 'throw'
  /** dřep s rukama ke sněhu (nabrání sněhu, zvednutí rukavice) a focení telefonem */
  | 'scoop' | 'photo'
  /** odhrnování sněhu lopatou: obě ruce na násadě, tahy vpřed a zpět */
  | 'shovel'
  /** pohlazení psa: mírný předklon/přidřep, blízká ruka dolů k psovi, 1–2 tahy */
  | 'pet'
  /** B01 chytání vloček: obě ruce zvednuté dlaněmi nahoru, hlava vzhůru, drobné pohyby rukou */
  | 'catch';

/** Spuštěný klip u postavy (čistá data – součást stavu simulace). */
export interface GestureInst {
  fam: Family;
  /** uplynulý čas a délka (s) */ t: number; dur: number;
  /** paže pro jednoruční gesta: 0 = vzdálená, 1 = blízká (kelímková) */ hand?: 0 | 1;
  /** amplituda pracovní části (násobek) */ amp: number;
  /** znaménko (strana náklonu hlavy, směr ukázání apod.) */ sgn: number;
  /** cíl ukázání – směr ve vlastních souřadnicích paže (x ven, y nahoru), jednotkový */ dir?: Vec2;
  /** druhý slabší úder u beat */ second?: boolean;
  /** obě ruce (open) */ both?: boolean;
}

/** Prostředky, které klip zabírá (C.7) – jedna ruka/hlava nikdy dvěma klipy najednou. */
export type Res = 'arm0' | 'arm1' | 'head' | 'torso' | 'pelvis';
export function resourcesOf(g: Pick<GestureInst, 'fam' | 'hand' | 'both'>): Res[] {
  const h: Res = g.hand === 0 ? 'arm0' : 'arm1';
  const o: Res = h === 'arm0' ? 'arm1' : 'arm0';
  switch (g.fam) {
    case 'beat': case 'point': case 'cupBeat': case 'waveFar': case 'adjustScarf': return [h];
    case 'open': return g.both ? [h, o] : [h];
    case 'adjustCap': return [h, 'head'];
    case 'size': return ['arm0', 'arm1'];
    case 'shrug': return ['arm0', 'arm1', 'head'];
    case 'rubHands': return ['arm0', 'arm1', 'head'];
    case 'warmCup': return ['arm0', 'arm1'];
    case 'hunch': return ['arm0', 'arm1', 'torso'];
    case 'nod': case 'tilt': case 'greetNod': case 'thanks': return ['head'];
    case 'amusement': return ['torso', 'head'];
    case 'queuePeek': return ['pelvis', 'torso', 'head'];
    case 'push': case 'lift': return ['arm0', 'arm1', 'torso'];
    case 'decorate': return [h];
    case 'throw': return [h, 'torso'];
    case 'scoop': return ['arm0', 'arm1', 'torso', 'pelvis'];
    case 'photo': return ['arm0', 'arm1', 'head'];
    case 'shovel': return ['arm0', 'arm1', 'torso'];
    case 'pet': return ['arm1', 'torso', 'pelvis', 'head'];
    case 'catch': return ['arm0', 'arm1', 'head'];
  }
}

/** Výrazná manuální gesta (antirepetice 8 s, rozpočty C.5). */
export const MANUAL: Family[] = ['beat', 'point', 'size', 'open', 'shrug', 'waveFar'];

const S = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * x * (x * (6 * x - 15) + 10); }; // quintic, nulová koncová rychlost

type Key = [number, Vec2 | 'R'];
/** Trajektorie ze seznamu klíčů; 'R' = základní póza. Vrací [váha k základní póze 0..1, cílový bod]. */
function track(keys: Key[], u: number): { w: number; p: Vec2 } {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [u0, a] = keys[i], [u1, b] = keys[i + 1];
  const k = S((u - u0) / Math.max(1e-6, u1 - u0));
  if (a === 'R' && b === 'R') return { w: 0, p: { x: 0, y: 0 } };
  if (a === 'R') return { w: k, p: b as Vec2 };
  if (b === 'R') return { w: 1 - k, p: a as Vec2 };
  return { w: 1, p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k } };
}
const sc = (p: Vec2, amp: number, base: Vec2 = WRIST.READY): Vec2 => ({ x: base.x + (p.x - base.x) * amp, y: base.y + (p.y - base.y) * amp });
const env = (u: number, a: number, b: number, c: number, d: number) => (u < a ? 0 : u < b ? S((u - a) / (b - a)) : u < c ? 1 : u < d ? 1 - S((u - c) / (d - c)) : 0);

/** Cíl zápěstí: váha vůči základní póze (0..1) a bod ve vlastních souřadnicích paže. */
export type HandTarget = { w: number; p: Vec2; /** p je posun vůči základní póze (ne bod) */ rel?: boolean; /** loket smí být zvednutý (mávání, čepice) */ keep?: boolean; /** p.x míří dopředu (směr pohledu), ne ven od těla */ fwd?: boolean } | null;
/** Výsledek vyhodnocení: cíle obou paží, náklony (°), posun pánve (j.). */
export interface GestureOut {
  arms: [HandTarget, HandTarget];
  headDeg: number; trunkDeg: number; pelvisX: number;
  /** dřep/předklon 0..1 (pánev dolů, kolena pokrčená, trup vpřed) */ crouch?: number;
}

export function evalGesture(g: GestureInst): GestureOut {
  const u = Math.max(0, Math.min(1, g.t / g.dur)), amp = g.amp;
  const out: GestureOut = { arms: [null, null], headDeg: 0, trunkDeg: 0, pelvisX: 0 };
  const hand: 0 | 1 = g.hand ?? 1, other: 0 | 1 = hand === 0 ? 1 : 0;
  const put = (tr: HandTarget, h: 0 | 1 = hand) => { if (tr && tr.w > 0) out.arms[h] = tr; };
  const sideSgn = hand === 1 ? 1 : -1; // pro náklony trupu směrem k pracující ruce (orientačně)
  switch (g.fam) {
    case 'beat': { // G01 – zdůraznění: přes READY, úder nahoru/dolů, malý odskok, návrat
      const keys: Key[] = [[0, 'R'], [0.26, WRIST.READY], [0.38, sc(WRIST.BEAT_UP, amp)], [0.5, sc(WRIST.BEAT_DOWN, amp)], [0.58, sc({ x: 22, y: -26 }, amp)]];
      if (g.second) keys.push([0.75, sc(WRIST.BEAT_UP, amp * 0.6)], [0.85, sc(WRIST.BEAT_DOWN, amp * 0.6)]);
      keys.push([1, 'R']);
      put(track(keys, u));
      const e = env(u, 0.3, 0.42, 0.55, 0.7);
      out.headDeg = 1.5 * e * g.sgn; out.trunkDeg = 0.6 * e * g.sgn;
      break;
    }
    case 'point': { // G02 – ukázat na stánek/strom (palčák ve směru, předloktí mimo obrys kabátu)
      const d = g.dir ?? { x: 1, y: -0.1 };
      const p = { x: 8.7 + d.x * 34, y: Math.max(-30, Math.min(12, d.y * 34)) };
      put(track([[0, 'R'], [0.15, WRIST.READY], [0.44, p], [0.68, p], [1, 'R']], u));
      const e = env(u, 0.25, 0.4, 0.7, 0.9);
      out.headDeg = 2 * e * g.sgn; out.trunkDeg = 1.5 * e * sideSgn;
      break;
    }
    case 'size': { // G03 – obě ruce vymezí šířku
      const tr = track([[0, 'R'], [0.35, WRIST.SIZE_IN], [0.58, sc(WRIST.SIZE_OUT, amp, WRIST.SIZE_IN)], [0.75, sc(WRIST.SIZE_OUT, amp, WRIST.SIZE_IN)], [1, 'R']], u);
      put(tr, 0); put(tr, 1);
      out.trunkDeg = 0.8 * env(u, 0.4, 0.55, 0.75, 0.9);
      break;
    }
    case 'open': { // G04 – otevření paže (nabídka/vysvětlení)
      const tr = track([[0, 'R'], [0.25, WRIST.READY], [0.5, sc(WRIST.OPEN, amp)], [0.7, sc(WRIST.OPEN, amp)], [1, 'R']], u);
      put(tr); if (g.both) put(tr, other);
      out.headDeg = 2 * env(u, 0.35, 0.5, 0.7, 0.9) * g.sgn; out.trunkDeg = 0.8 * env(u, 0.35, 0.5, 0.7, 0.9) * g.sgn;
      break;
    }
    case 'shrug': { // G05 – mírné pokrčení: rozpažení nízko, hlava do 3°, ramena se neposouvají
      const tr = track([[0, 'R'], [0.2, WRIST.READY], [0.45, sc(WRIST.SHRUG, amp)], [0.6, sc(WRIST.SHRUG, amp)], [1, 'R']], u);
      put(tr, 0); put(tr, 1);
      const e = env(u, 0.3, 0.45, 0.6, 0.85); out.headDeg = 3 * e * g.sgn; out.trunkDeg = 1 * e * g.sgn;
      break;
    }
    case 'cupBeat': { // G06 – malé zdůraznění drženým kelímkem: posun z aktuálního držení (kelímek svisle)
      const o = track([[0, { x: 0, y: 0 }], [0.25, { x: 0, y: 1 }], [0.5, { x: 2 * amp, y: 2 * amp }], [0.7, { x: 1, y: 1 }], [1, { x: 0, y: 0 }]], u);
      out.arms[hand] = { w: 1, p: o.p, rel: true };
      const e = env(u, 0.3, 0.45, 0.6, 0.8); out.headDeg = 1 * e * g.sgn; out.trunkDeg = 0.5 * e * g.sgn;
      break;
    }
    case 'nod': case 'greetNod': case 'thanks': { // L01/H02/Q03 – kývnutí (pseudokývnutí náklonem hlavy)
      const a = (g.fam === 'nod' ? 3.5 : 5) * amp * g.sgn;
      const keys: [number, number][] = g.second
        ? [[0, 0], [0.12, -0.3 * a], [0.3, a], [0.45, 0.1 * a], [0.62, 0.7 * a], [0.8, -0.1 * a], [1, 0]]
        : [[0, 0], [0.18, -0.3 * a], [0.45, a], [0.72, -0.15 * a], [1, 0]];
      out.headDeg = keyed(keys, u);
      out.trunkDeg = (g.fam === 'nod' ? 0.45 : 1.0) * keyed(keys, u - 0.05 * Math.sin(Math.PI * u)) / Math.max(1, Math.abs(a)) * Math.sign(a || 1);
      break;
    }
    case 'tilt': { // L02 – náklon zaujetí k partnerovi
      out.headDeg = 3 * amp * g.sgn * env(u, 0, 0.22, 0.62, 1); out.trunkDeg = 0.4 * g.sgn * env(u, 0, 0.22, 0.62, 1);
      break;
    }
    case 'waveFar': { // H01 – zamávání na dálku: dvě kývnutí předloktím
      const w = WRIST.WAVE, k1 = { x: w.x + 2.5, y: w.y + 0.7 }, k2 = { x: w.x - 2.5, y: w.y - 0.7 };
      put(track([[0, 'R'], [0.4, w], [0.47, k1], [0.54, k2], [0.61, k1], [0.66, w], [1, 'R']], u)); // zvednutí z klidu ≈ 1 s (limity kloubů)
      out.headDeg = 2 * env(u, 0.2, 0.3, 0.7, 0.9) * g.sgn; out.trunkDeg = 1 * env(u, 0.2, 0.3, 0.7, 0.9) * g.sgn;
      break;
    }
    case 'amusement': { // S01 – pobavení: 2–3 malé pulzy trupu, hlava menší a opožděná
      const e = env(u, 0, 0.2, 0.65, 1), f = 1.9;
      out.trunkDeg = 1.6 * amp * e * Math.sin(2 * Math.PI * f * g.t) * g.sgn;
      out.headDeg = 2.2 * amp * e * Math.sin(2 * Math.PI * f * (g.t - 0.06));
      break;
    }
    case 'rubHands': { // W01 – tření palčáků před hrudí
      const e = env(u, 0.05, 0.25, 0.75, 0.95), osc = Math.sin(2 * Math.PI * 2.1 * g.t) * 1.0 * e;
      const base = track([[0, 'R'], [0.25, WRIST.RUB], [0.75, WRIST.RUB], [1, 'R']], u);
      if (base.w > 0) out.arms = [{ w: base.w, p: { x: base.p.x, y: base.p.y + osc } }, { w: base.w, p: { x: base.p.x, y: base.p.y - osc } }];
      out.headDeg = 2 * e * g.sgn; out.trunkDeg = 0.6 * e;
      break;
    }
    case 'adjustScarf': { // W05 – ruka k protějšímu okraji šály, dva posuny, návrat
      const s0 = WRIST.SCARF, s1 = { x: s0.x + 1.3, y: s0.y - 0.6 };
      put(track([[0, 'R'], [0.4, s0], [0.52, s1], [0.64, s0], [0.7, s0], [1, 'R']], u));
      out.headDeg = 1.5 * env(u, 0.3, 0.4, 0.65, 0.8) * g.sgn;
      break;
    }
    case 'adjustCap': { // W06 – dotyk okraje čepice (hlava se během dotyku nehýbe)
      const c0 = WRIST.CAP, c1 = { x: c0.x, y: c0.y - 1 };
      put(track([[0, 'R'], [0.26, { x: 20, y: 3 }], [0.44, c0], [0.54, c1], [0.58, c1], [0.76, { x: 20, y: 3 }], [1, 'R']], u)); // oblouk vně těla (loket se nepřeklápí)
      break;
    }
    case 'hunch': { // W07 – krátké schoulení: ruce ke kabátu, trup do 1,5°
      const e = env(u, 0, 0.25, 0.65, 1);
      const p = { x: WRIST.REST.x - 2, y: WRIST.REST.y + 3 };
      if (e > 0) out.arms = [{ w: e, p }, { w: e, p }];
      out.trunkDeg = 1.5 * e * g.sgn; out.headDeg = -1 * e * g.sgn;
      break;
    }
    case 'queuePeek': { // Q01 – vyhlédnutí, jak postupuje fronta (pánev + trup + hlava do strany)
      const e = env(u, 0, 0.3, 0.65, 1);
      out.pelvisX = 1.0 * amp * e * g.sgn; out.trunkDeg = 1.5 * e * g.sgn; out.headDeg = 2 * e * g.sgn;
      break;
    }
    case 'push': { // tlačení koule: obě ruce vpředu nízko, mírný předklon; drží se do uvolnění
      const e = Math.min(1, g.t / 0.5), f = Math.min(1, Math.max(0, (g.dur - g.t) / 0.5));
      const w = e * e * (3 - 2 * e) * (f * f * (3 - 2 * f));
      const bob = Math.sin(g.t * 3.1) * 0.8;
      if (w > 0) out.arms = [{ w, p: { x: 15 * amp, y: -33 + bob }, fwd: true, keep: true }, { w, p: { x: 16 * amp, y: -31 - bob }, fwd: true, keep: true }];
      out.trunkDeg = -2.5 * w * g.sgn;
      return out;
    }
    case 'lift': { // zvednutí koule: z dřepu nízko → k hrudi → položení nahoru
      const lo = { x: 13, y: -40 }, hi = { x: 14, y: -14 };
      const tr = track([[0, 'R'], [0.25, lo], [0.6, hi], [0.8, hi], [1, 'R']], u);
      if (tr.w > 0) out.arms = [{ ...tr, fwd: true, keep: true }, { ...tr, fwd: true, keep: true }];
      out.trunkDeg = -2 * env(u, 0.1, 0.3, 0.5, 0.7) * g.sgn;
      return out;
    }
    case 'decorate': { // přidání oka/nosu: jedna ruka k hlavě sněhuláka, krátké přitlačení
      const p = { x: 20 * amp, y: (g.dir?.y ?? -8) }, q = { x: p.x + 1.5, y: p.y };
      const tr = track([[0, 'R'], [0.35, p], [0.5, q], [0.62, p], [1, 'R']], u);
      if (tr.w > 0) out.arms[hand] = { ...tr, fwd: true, keep: true };
      out.headDeg = 1.5 * env(u, 0.3, 0.4, 0.6, 0.8) * g.sgn;
      return out;
    }
    case 'scoop': { // dřep: pánev dolů, trup vpřed, ruce ke sněhu (kontakt v polovině), návrat
      const e = env(u, 0.02, 0.38, 0.66, 0.98);
      out.crouch = 0.85 * e;
      const lo = { x: 17, y: -48 };
      const tr = track([[0, 'R'], [0.38, lo], [0.5, { x: 15, y: -46 }], [0.66, lo], [1, 'R']], u);
      if (tr.w > 0) out.arms = [{ ...tr, fwd: true, keep: true }, { w: tr.w, p: { x: tr.p.x + 3, y: tr.p.y + 1 }, fwd: true, keep: true }];
      out.headDeg = -3 * e * g.sgn;
      return out;
    }
    case 'photo': { // telefon oběma rukama před obličejem: vytáhnout, zvednout, zamířit, spustit
      const p = { x: 14, y: 9 }; // ve výšce očí, kus před obličejem
      const tr = track([[0, 'R'], [0.16, { x: 12, y: -20 }], [0.27, { x: 18, y: -6 }], [0.38, p], [0.8, p], [0.89, { x: 18, y: -6 }], [1, 'R']], u); // přes bod před tělem (loket bez skoku)
      if (tr.w > 0) out.arms = [{ ...tr, fwd: true, keep: true }, { w: tr.w, p: { x: tr.p.x + 1, y: tr.p.y - 1 }, fwd: true, keep: true }];
      out.headDeg = 2 * env(u, 0.3, 0.4, 0.8, 0.9) * g.sgn;
      return out;
    }
    case 'shovel': { // lopata: zadní ruka na D-držadle u boku, přední níž vpředu na násadě; přidřep a
      // předklon, tahy ~1,3 s (obě ruce i list vpřed a zpět po zemi)
      const e = Math.min(1, g.t / 0.6), f = Math.min(1, Math.max(0, (g.dur - g.t) / 0.6));
      const w = e * e * (3 - 2 * e) * (f * f * (3 - 2 * f));
      const st = 0.5 - 0.5 * Math.cos((g.t * 2 * Math.PI) / 1.3); // 0 = zpět, 1 = vpřed (tah)
      if (w > 0) out.arms = [{ w, p: { x: 3 + 5 * st, y: -22 + 0.5 * st }, fwd: true, keep: true }, { w, p: { x: 16 + 6 * st, y: -42 + st }, fwd: true, keep: true }];
      out.crouch = 0.18 * w;
      out.trunkDeg = -(11 + 4 * st) * w * g.sgn; // pracovní předklon (mimo limit společenských gest)
      out.headDeg = 5 * w * g.sgn; // hlava kompenzuje – dívá se dopředu na pruh
      return out;
    }
    case 'catch': { // B01: ruce do stran a vzhůru dlaněmi nahoru (čitelné z každého pohledu), sledovat vločky, spustit
      const up = { x: 22, y: 4 };
      const tr = track([[0, 'R'], [0.16, { x: 18, y: -14 }], [0.3, up], [0.72, up], [0.86, { x: 18, y: -14 }], [1, 'R']], u);
      const e = env(u, 0.16, 0.3, 0.72, 0.88);
      const wob = (k: number) => 1.2 * Math.sin(g.t * 2.3 + k * 1.7) * e;
      if (tr.w > 0) out.arms = [{ w: tr.w, p: { x: tr.p.x + wob(0), y: tr.p.y + wob(1) } }, { w: tr.w, p: { x: tr.p.x - 1 + wob(2), y: tr.p.y + 2 + wob(3) } }];
      out.headDeg = 8 * e * g.sgn; // pohled vzhůru k vločkám (+ = nahoru)
      return out;
    }
    case 'pet': { // Z03: náklon a přidřep (0–25 %), ruka dolů k psovi, 1–2 pomalé tahy po srsti, návrat
      const e = env(u, 0.02, 0.25, 0.78, 0.98);
      out.crouch = 0.45 * e;
      const lo = { x: 15, y: -44 };
      const tr = track([[0, 'R'], [0.18, { x: 14, y: -30 }], [0.3, lo], [0.75, lo], [0.88, { x: 13, y: -28 }], [1, 'R']], u);
      const stroke = u > 0.32 && u < 0.73 ? Math.sin(((u - 0.32) / 0.41) * Math.PI * 2 * 1.5) : 0; // tahy po srsti
      if (tr.w > 0) out.arms[1] = { w: tr.w, p: { x: tr.p.x + 2.5 * stroke * e, y: tr.p.y + 0.8 * Math.abs(stroke) * e }, fwd: true, keep: true };
      out.trunkDeg = -3.5 * e * g.sgn;
      out.headDeg = -6 * e * g.sgn;
      return out;
    }
    case 'throw': { // hod: nápřah (25 %), zrychlení, výhoz v 55 %, doznění; trup se protočí s hodem
      const tr = track([[0, 'R'], [0.14, { x: -6, y: -20 }], [0.3, { x: -4, y: 13 }], [0.44, { x: 9, y: 23 }], [0.55, { x: 23, y: 13 }], [0.75, { x: 18, y: -12 }], [1, 'R']], u); // oblouk nad ramenem
      if (tr.w > 0) out.arms[hand] = { ...tr, fwd: true, keep: true };
      out.trunkDeg = 3 * (env(u, 0.05, 0.25, 0.3, 0.45) - env(u, 0.45, 0.6, 0.7, 0.95)) * g.sgn;
      out.headDeg = -1 * env(u, 0.2, 0.4, 0.6, 0.9) * g.sgn;
      return out;
    }
    case 'warmCup': { // D02 – kelímek oběma rukama u osy trupu (vstup, držení, výstup)
      const cupC = { x: 2, y: -22 }, sup = { x: -3.5, y: -23 };
      const tr = track([[0, 'R'], [0.15, cupC], [0.88, cupC], [1, 'R']], u);
      const ts = track([[0, 'R'], [0.18, sup], [0.85, sup], [1, 'R']], u);
      out.arms = [ts.w > 0 ? ts : null, tr.w > 0 ? tr : null]; // blízká paže nese kelímek, vzdálená podpírá
      break;
    }
  }
  if (['waveFar', 'adjustCap', 'adjustScarf', 'rubHands', 'hunch', 'warmCup'].includes(g.fam)) for (const a of out.arms) if (a) a.keep = true;
  return out;
}

function keyed(keys: [number, number][], u: number): number {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [u0, a] = keys[i], [u1, b] = keys[i + 1];
  return a + (b - a) * S((u - u0) / Math.max(1e-6, u1 - u0));
}

/** Sloučení všech běžících klipů (prostředky se nepřekrývají – zajišťuje plánovač). */
export function evalAll(gs: GestureInst[] | undefined): GestureOut | null {
  if (!gs || !gs.length) return null;
  const out: GestureOut = { arms: [null, null], headDeg: 0, trunkDeg: 0, pelvisX: 0 };
  for (const g of gs) {
    const o = evalGesture(g);
    if (o.arms[0]) out.arms[0] = o.arms[0]; if (o.arms[1]) out.arms[1] = o.arms[1];
    out.headDeg += o.headDeg; out.trunkDeg += o.trunkDeg; out.pelvisX += o.pelvisX;
    if (o.crouch) out.crouch = Math.max(out.crouch ?? 0, o.crouch);
  }
  // tvrdé limity součtu vrstev (D): hlava ±8°, trup ±4°
  // (pracovní klip lopaty smí trup předklonit víc – skutečná práce, ne společenské gesto)
  const tl = gs.some((g) => g.fam === 'shovel') ? 16 : 4;
  out.headDeg = Math.max(-8, Math.min(8, out.headDeg)); out.trunkDeg = Math.max(-tl, Math.min(tl, out.trunkDeg));
  return out;
}

/** Výchozí délky klipů [min, default, max] v sekundách (A.4–A.8) a cooldowny. */
export const CLIP_T: Record<Family, { T: [number, number, number]; cd: number }> = {
  beat: { T: [1.1, 1.4, 2.0], cd: 2.5 }, point: { T: [1.9, 2.5, 3.2], cd: 12 } /* prodlouženo kvůli limitu lokte (C.8) */, size: { T: [1.9, 2.4, 3.1], cd: 18 },
  open: { T: [1.5, 2.0, 2.8], cd: 8 }, shrug: { T: [1.3, 1.7, 2.3], cd: 30 }, cupBeat: { T: [1.2, 1.5, 2.0], cd: 5 },
  nod: { T: [0.5, 0.7, 1.0], cd: 5.5 }, tilt: { T: [1.6, 2.4, 3.5], cd: 10 }, greetNod: { T: [0.65, 0.85, 1.2], cd: 20 },
  thanks: { T: [0.7, 0.9, 1.3], cd: 3 }, waveFar: { T: [2.0, 2.5, 3.2], cd: 45 }, amusement: { T: [1.5, 2.2, 3.2], cd: 35 },
  rubHands: { T: [2.3, 3.0, 4.2], cd: 50 }, adjustScarf: { T: [1.9, 2.5, 3.3], cd: 75 }, adjustCap: { T: [2.1, 2.7, 3.6], cd: 90 },
  hunch: { T: [2.5, 3.2, 4.5], cd: 45 }, queuePeek: { T: [1.6, 2.2, 3.0], cd: 15 }, warmCup: { T: [6, 11, 21], cd: 10 },
  push: { T: [3, 3, 3], cd: 0 }, scoop: { T: [1.6, 2.2, 3.2], cd: 0 }, photo: { T: [6, 8, 12], cd: 60 }, shovel: { T: [3, 4.5, 6], cd: 0 }, pet: { T: [4, 5.5, 8], cd: 0 }, catch: { T: [5, 7, 10], cd: 0 }, throw: { T: [0.65, 0.8, 0.95], cd: 0 }, lift: { T: [3.2, 4, 5], cd: 0 }, decorate: { T: [2, 2.6, 3.4], cd: 0 },
};
