/**
 * Pekař a péče o obchod (scéna „Vánoční tramvajová ulice“, zadání A18a–d).
 *
 * Dveře: křídlo se otevírá dovnitř obchodu kolem pantu (vlevo); kreslí se z výřezu namalovaného
 * křídla pozadí zúženého podle úhlu, za ním teplý interiér (zárubeň ani fasáda se nemění).
 *
 * Epizoda (jednou za 3–6 min) je plán kroků: otevření (zevnitř) → vyjití s náčiním (ořez rámem
 * dveří) → zavření (ruka na klice) → [A18d otočení cedule „Hned jsem zpět“] → hlavní práce →
 * [cedule zpět „Otevřeno“] → otevření → vstup → zavření. Hlavní práce je jedna z variant:
 *  - A18a zametání tenké vrstvy čerstvého sněhu (koště, tahy s kontaktem, val u kraje, místa pozvolna
 *    znovu zapadají sněhem),
 *  - A18b posyp chodníku drtí z kbelíku (nabrání v kbelíku → švih předloktí → dávka letí balisticky
 *    z ruky a zůstane ležet; kbelík má konečný počet dávek, doplní se uvnitř),
 *  - A18c přenesení bedýnky s pečivem ven na vystavovací místo / zpět dovnitř (oběma rukama,
 *    přidřep při zvedání i pokládání, bedýnka zůstane, kde ji položil).
 * Cedule má trvalý stav (otočí se jen gestem, při průchodu hranou se přepne strana, pak dozní).
 */
import type { Vec2 } from '../math/vec';
import type { RngState } from '../math/rng';
import { rand, randRange } from '../math/rng';
import type { AgentState } from './types';
import type { HandTarget } from '../anim/animator';

export interface BakeryConfig {
  bakerId: string;
  /** křídlo dveří (px scény, obdélník v pozadí) a pant (strana) */ door: { x0: number; y0: number; x1: number; y1: number; hinge: 'left' | 'right' };
  /** práh uvnitř (postava zmizí za rámem) a místo před dveřmi */ inside: Vec2; outside: Vec2;
  /** úsek, který zametá / sype (dva body na chodníku) */ sweep: [Vec2, Vec2];
  /** místo pro bedýnku s pečivem (A18c) – vedle vchodu, mimo průchod */ crateSpot?: Vec2;
  /** cedule na dveřích (A18d) */ sign?: boolean;
  /** váhy variant hlavní práce */ tasks?: { sweep: number; salt: number; crate: number };
  interval?: [number, number]; firstAt?: number; sweepFor?: [number, number];
}
export type BakeryPhase = 'inside' | 'run';
export type BakeryTask = 'sweep' | 'salt' | 'crate';
export type Step =
  | { k: 'door'; open: boolean; hand: boolean; dur: number }
  | { k: 'show'; equip: 'broom' | 'bucket' | 'crate' | null }
  | { k: 'walk'; to: Vec2; sp: number; clip?: 'out' | 'in' }
  | { k: 'face'; to: Vec2 }
  | { k: 'sign'; to: 'open' | 'away' }
  | { k: 'sweep' } | { k: 'salt' }
  | { k: 'lower'; act: 'grab' | 'release' }
  | { k: 'hide' }
  | { k: 'wait'; dur: number };
export interface Patch { x: number; y: number; r: number; t0: number }
export interface Crumb { x: number; y: number; vx: number; vy: number; t0: number }
/** zrnko posypu: balistika ve scéně (px) od t0 do dopadu, pak leží (pozvolna zapadá sněhem) */
export interface Grit { x0: number; y0: number; h0: number; vx: number; vy: number; vh: number; t0: number; T: number }
export interface BakeryState {
  phase: BakeryPhase; t: number; until: number; door: number;
  plan: Step[]; si: number; st: number; task: BakeryTask | null;
  sweepUntil: number; leg: 0 | 1;
  patches: Patch[]; crumbs: Crumb[]; grit: Grit[]; rng: RngState; runs: number; stroke: number;
  /** cedule: strana, průběh otočení 0..1 (null = v klidu), čas uvolnění (doznívání) */
  sign: { side: 'open' | 'away'; flip: number | null; rel: number };
  /** kbelík: zbývající dávky; bedýnka: venku / uvnitř a poloha */ grits: number; crate: { out: boolean; x: number; y: number };
  /** počitadla variant (diagnostika) */ done: Record<BakeryTask | 'sign', number>;
  doses: number; doseT: number;
}
export const BAKERY_REFILL = 130; // s – za tak dlouho zametené místo znovu zapadne
export const GRIT_LIFE = 600; // s – posyp pozvolna zapadá sněhem
export const GRIT_DOSES = 6;
export const doorClip = (c: BakeryConfig): Vec2[] => { const d = c.door; return [{ x: d.x0, y: d.y0 }, { x: d.x1, y: d.y0 }, { x: d.x1, y: d.y1 + 4 }, { x: d.x0, y: d.y1 + 4 }]; };
export function newBakeryState(c: BakeryConfig, rng: RngState, t: number): BakeryState {
  return {
    phase: 'inside', t, until: t + (c.firstAt ?? randRange(rng, 40, 90)), door: 0, plan: [], si: 0, st: t, task: null, sweepUntil: 0, leg: 0,
    patches: [], crumbs: [], grit: [], rng, runs: 0, stroke: 0, sign: { side: 'open', flip: null, rel: -100 }, grits: GRIT_DOSES,
    crate: { out: false, x: c.crateSpot?.x ?? c.outside.x, y: c.crateSpot?.y ?? c.outside.y }, done: { sweep: 0, salt: 0, crate: 0, sign: 0 }, doses: 0, doseT: 0,
  };
}

export interface BakeryHost {
  walk(a: AgentState, pts: Vec2[], speed: number): void; moving(a: AgentState): boolean;
  show(a: AgentState, p: Vec2): void; hide(a: AgentState): void;
  /** náčiní v rukou (koště jako nástroj, kbelík / bedýnka jako rekvizita) */ equip(a: AgentState, item: 'broom' | 'bucket' | 'crate' | null): void;
  face(a: AgentState, p: Vec2): void;
  /** cíle rukou (null = běžné), váha prolnutí */ hands(a: AgentState, t: [HandTarget | null, HandTarget | null] | null, w: number): void;
  /** přidřep k zemi (zvednutí / položení) – váha 0..1 */ crouch(a: AgentState, w: number, t: number): void;
  /** px na metr v místě (y) */ ppm(y: number): number;
  log(msg: string, id?: string): void;
}

/** Plán epizody podle varianty (a stavu bedýnky). */
function makePlan(c: BakeryConfig, st: BakeryState, task: BakeryTask, sign: boolean): Step[] {
  const D = { x: (c.door.x0 + c.door.x1) / 2, y: c.door.y1 };
  const out: Step[] = [{ k: 'door', open: true, hand: false, dur: 1.0 }];
  const carryOut = task === 'crate' && !st.crate.out;
  const stand = { x: st.crate.x - 6, y: st.crate.y + 24 }; // stojí před bedýnkou (na straně ulice), ne v ní
  out.push({ k: 'show', equip: task === 'sweep' ? 'broom' : task === 'salt' ? 'bucket' : carryOut ? 'crate' : null }, { k: 'walk', to: c.outside, sp: carryOut ? 0.4 : 0.55, clip: 'out' });
  if (carryOut) {
    // bedýnku nejdřív položí (dveře zatím zůstanou otevřené – zarážka), pak se vrátí zavřít
    out.push({ k: 'walk', to: stand, sp: 0.38 }, { k: 'face', to: { x: st.crate.x, y: st.crate.y } }, { k: 'lower', act: 'release' }, { k: 'walk', to: c.outside, sp: 0.5 });
  }
  out.push({ k: 'face', to: D }, { k: 'door', open: false, hand: true, dur: 1.2 });
  if (sign) out.push({ k: 'sign', to: 'away' });
  if (task === 'sweep') out.push({ k: 'walk', to: c.sweep[0], sp: 0.5 }, { k: 'sweep' });
  if (task === 'salt') out.push({ k: 'walk', to: c.sweep[0], sp: 0.45 }, { k: 'salt' });
  if (task === 'crate' && !carryOut) {
    // zpět dovnitř: nejdřív otevře (ruce volné), pak zvedne bedýnku a vejde
    if (sign) out.push({ k: 'sign', to: 'open' });
    out.push({ k: 'face', to: D }, { k: 'door', open: true, hand: true, dur: 1.1 }, { k: 'walk', to: stand, sp: 0.5 }, { k: 'face', to: { x: st.crate.x, y: st.crate.y } }, { k: 'lower', act: 'grab' },
      { k: 'walk', to: c.outside, sp: 0.38 }, { k: 'walk', to: c.inside, sp: 0.36, clip: 'in' }, { k: 'hide' }, { k: 'door', open: false, hand: false, dur: 1.1 });
    return out;
  }
  out.push({ k: 'walk', to: c.outside, sp: 0.55 });
  if (sign) out.push({ k: 'sign', to: 'open' });
  out.push({ k: 'face', to: D }, { k: 'door', open: true, hand: true, dur: 1.0 }, { k: 'walk', to: c.inside, sp: 0.5, clip: 'in' }, { k: 'hide' }, { k: 'door', open: false, hand: false, dur: 1.1 });
  return out;
}

/** Vynutí začátek epizody (ladění / nabídka akcí); `task` = konkrétní varianta. */
export function bakeryStartNow(st: BakeryState, t: number, task?: BakeryTask) { if (st.phase !== 'inside') return false; st.until = t; (st as BakeryState & { force?: BakeryTask }).force = task; return true; }

/** Krok pekaře a dveří. */
export function stepBakery(c: BakeryConfig, st: BakeryState, a: AgentState, h: BakeryHost, t: number, dt: number): void {
  if (st.phase === 'inside') {
    a.hidden = true; a.status = 'V pekárně';
    if (t >= st.until) {
      const W = c.tasks ?? { sweep: 0.45, salt: 0.3, crate: 0.25 }, f = (st as BakeryState & { force?: BakeryTask }).force;
      let task: BakeryTask = f ?? 'sweep';
      if (!f) { const r = rand(st.rng) * (W.sweep + W.salt + W.crate); task = r < W.sweep ? 'sweep' : r < W.sweep + W.salt ? 'salt' : 'crate'; }
      (st as BakeryState & { force?: BakeryTask }).force = undefined;
      if (task === 'crate' && !c.crateSpot) task = 'sweep';
      const sign = !!c.sign && rand(st.rng) < 0.6;
      st.task = task; st.plan = makePlan(c, st, task, sign); st.si = 0; st.st = t; st.phase = 'run'; st.doses = 0;
      if (task === 'salt') st.grits = GRIT_DOSES; // doplněno uvnitř
      h.log(`Pekař jde ven: ${TASK_LABEL[task]}${sign ? ' (otočí ceduli)' : ''}.`, a.id);
    }
  } else stepPlan(c, st, a, h, t, dt);
  // cedule: otočení (řídí krok „sign“), po uvolnění tlumené dokývání
  // úklid: zametená místa, drobky a posyp (omezený počet)
  if (st.patches.length && t - st.patches[0].t0 > BAKERY_REFILL) st.patches.shift();
  if (st.patches.length > 80) st.patches.splice(0, st.patches.length - 80);
  st.crumbs = st.crumbs.filter((q) => t - q.t0 < 0.7);
  if (st.crumbs.length > 60) st.crumbs.splice(0, st.crumbs.length - 60);
  st.grit = st.grit.filter((g) => t - g.t0 < GRIT_LIFE);
  if (st.grit.length > 240) st.grit.splice(0, st.grit.length - 240);
}

function next(st: BakeryState, t: number) { st.si++; st.st = t; }

function stepPlan(c: BakeryConfig, st: BakeryState, a: AgentState, h: BakeryHost, t: number, dt: number) {
  const s = st.plan[st.si];
  if (!s) { st.phase = 'inside'; st.runs++; st.until = t + randRange(st.rng, ...(c.interval ?? [180, 360])); st.task = null; h.hands(a, null, 0); return; }
  const el = t - st.st, k = (d: number) => Math.min(1, el / d);
  switch (s.k) {
    case 'door': {
      a.status = s.open ? 'Otevírá dveře' : 'Zavírá dveře';
      st.door = s.open ? Math.max(st.door, k(s.dur)) : Math.min(st.door, 1 - k(s.dur));
      // ruka na klice (zvenku): natáhne se, drží během pohybu křídla, pak pustí
      if (s.hand && !a.hidden) h.hands(a, [null, { u: 0.5, h: 1.08, lat: 0.12 }], Math.min(1, el / 0.4, Math.max(0, (s.dur + 0.3 - el) / 0.4)));
      if (el >= s.dur + (s.hand ? 0.3 : 0)) { st.door = s.open ? 1 : 0; h.hands(a, null, 0); next(st, t); }
      break;
    }
    case 'show': h.show(a, c.inside); h.equip(a, s.equip); a.status = 'Vychází z pekárny'; next(st, t); break;
    case 'walk':
      if (el < dt * 1.5) { h.walk(a, [s.to], s.sp); if (s.clip) a.clip = doorClip(c); }
      a.status = a.status || 'Jde';
      if (s.clip === 'out' && a.clip && a.pos.y > c.door.y1 + 6) a.clip = null;
      if (el > dt * 1.5 && !h.moving(a)) { if (s.clip === 'out') a.clip = null; next(st, t); }
      break;
    case 'face': h.face(a, s.to); if (el > 0.35) next(st, t); break;
    case 'sign': {
      // A18d: pohled na ceduli → ruka k okraji (0,7 s) → otočení kolem závěsu (1,2 s; strana se přepne
      // v hranové poloze) → pustí, cedule dozní
      a.status = s.to === 'away' ? 'Otáčí ceduli „Hned jsem zpět“' : 'Otáčí ceduli „Otevřeno“';
      h.face(a, { x: (c.door.x0 + c.door.x1) / 2, y: c.door.y1 });
      const reach = Math.min(1, el / 0.7), turn = Math.max(0, Math.min(1, (el - 0.8) / 1.2)), back = Math.max(0, (el - 2.2) / 0.6);
      h.hands(a, [null, { u: 0.48 + 0.04 * Math.sin(turn * Math.PI), h: 1.42, lat: 0.06 - 0.1 * turn }], Math.min(reach, 1 - Math.min(1, back)));
      st.sign.flip = turn > 0 && turn < 1 ? turn : null;
      if (turn >= 0.5 && st.sign.side !== s.to) { st.sign.side = s.to; }
      if (turn >= 1 && st.sign.rel < st.st) { st.sign.rel = t; st.done.sign++; }
      if (el >= 2.9) { st.sign.flip = null; h.hands(a, null, 0); next(st, t); }
      break;
    }
    case 'sweep': stepSweep(c, st, a, h, t, dt, el); break;
    case 'salt': stepSalt(c, st, a, h, t, dt, el); break;
    case 'lower': {
      // přidřep k bedýnce: kolena a kyčle (0,9 s) → úchop / položení → narovnání (0,9 s)
      a.status = s.act === 'grab' ? 'Zvedá bedýnku' : 'Pokládá bedýnku';
      const down = Math.min(1, el / 0.9), up = Math.max(0, Math.min(1, (el - 1.5) / 0.9));
      h.crouch(a, down * (1 - up), el);
      if (s.act === 'release' && el >= 1.1 && a.holding) {
        // bedýnka dosedne na zem před ním, pak ruce pustí
        st.crate.out = true; st.crate.x = c.crateSpot!.x; st.crate.y = c.crateSpot!.y; h.equip(a, null); st.done.crate++;
      }
      if (s.act === 'grab' && el >= 1.1 && !a.holding) { st.crate.out = false; h.equip(a, 'crate'); st.done.crate++; }
      if (el >= 2.4) { h.crouch(a, 0, el); next(st, t); }
      break;
    }
    case 'hide': h.equip(a, null); h.hide(a); a.clip = null; next(st, t); break;
    case 'wait': if (el >= s.dur) next(st, t); break;
  }
}

function stepSweep(c: BakeryConfig, st: BakeryState, a: AgentState, h: BakeryHost, t: number, dt: number, el: number) {
  if (el < dt * 1.5) { st.sweepUntil = t + randRange(st.rng, ...(c.sweepFor ?? [20, 40])); st.leg = 1; h.walk(a, [c.sweep[1]], 0.16); }
  a.status = 'Zametá sníh před pekárnou';
  // tahy koštětem: dopředu po zemi (kontakt), zpět nad zemí; sníh se hýbe jen při kontaktu
  const w = 2 * Math.PI * 0.75, ph = el * w, contact = Math.cos(ph) > -0.1 && Math.sin(ph) > 0;
  a.anim.tool = { u: 0.62 + 0.22 * Math.sin(ph), h: contact ? 0 : 0.05, beta: 0.12, crouch: 0.12, lean: 0.32 };
  if (contact && Math.floor((el - dt) * 0.75 * 2) !== Math.floor(el * 0.75 * 2)) {
    const ppm = h.ppm(a.pos.y), fx = Math.cos(a.facing), fy = Math.sin(a.facing) * 0.4, tip = { x: a.pos.x + fx * 0.9 * ppm, y: a.pos.y + fy * 0.9 * ppm };
    st.patches.push({ x: tip.x, y: tip.y, r: 0.32 * ppm, t0: t });
    for (let i = 0; i < 5; i++) st.crumbs.push({ x: tip.x, y: tip.y, vx: fx * ppm * randRange(st.rng, 0.4, 1.1) + randRange(st.rng, -0.2, 0.2) * ppm, vy: -randRange(st.rng, 0.3, 0.8) * ppm, t0: t });
  }
  if (!h.moving(a)) { st.leg = st.leg ? 0 : 1; h.walk(a, [c.sweep[st.leg]], 0.16); }
  if (t >= st.sweepUntil) { a.anim.tool = { u: 0.35, h: 0.55, beta: 1.25, crouch: 0, lean: 0 }; st.done.sweep++; a.route = null; next(st, t); }
}

/**
 * A18b: kbelík drží vzdálená ruka před tělem; blízká ruka nabere v kbelíku (0,8 s), švihem předloktí
 * vpřed (0,5 s) uvolní dávku – zrnka letí z ruky rychlostí jejího pohybu a padají gravitací; pak
 * krátký krok dál. 4–6 dávek, nejvýš tolik, kolik je v kbelíku.
 */
function stepSalt(c: BakeryConfig, st: BakeryState, a: AgentState, h: BakeryHost, t: number, dt: number, el: number) {
  a.status = `Sype chodník (${st.grits} dávek v kbelíku)`;
  const bucket: HandTarget = { u: 0.26, h: 1.02, lat: -0.04 };
  if (el < dt * 1.5) { st.doseT = t; st.doses = 4 + Math.floor(rand(st.rng) * 3); }
  const moving = h.moving(a), ct = t - st.doseT;
  if (moving) { h.hands(a, [bucket, { u: 0.2, h: 1.0, lat: 0.1 }], 1); st.doseT = t + 0.3; return; } // po kroku nejdřív ustálí oporu
  const CY = 2.4; // nabrat 0,8 → švih 0,5 → doznění 0,5 → krok
  let near: HandTarget;
  if (ct < 0.8) { const q = ct / 0.8; near = { u: 0.27, h: 1.06 - 0.06 * Math.sin(q * Math.PI), lat: 0.0 }; }
  else if (ct < 1.3) { const q = (ct - 0.8) / 0.5, e = q * q * (3 - 2 * q); near = { u: 0.27 + 0.45 * e, h: 1.06 + 0.12 * Math.sin(e * Math.PI * 0.8), lat: 0.0 + 0.16 * e }; }
  else near = { u: 0.72 - 0.4 * Math.min(1, (ct - 1.3) / 0.6), h: 1.12 - 0.1 * Math.min(1, (ct - 1.3) / 0.6), lat: 0.16 };
  h.hands(a, [bucket, near], 1);
  // uvolnění dávky v 70 % švihu
  if (ct - dt < 1.15 && ct >= 1.15 && st.grits > 0) {
    st.grits--; st.doses--;
    const ppm = h.ppm(a.pos.y), fx = Math.cos(a.facing), fy = Math.sin(a.facing);
    const hx = a.pos.x + fx * 0.55 * ppm, hy = a.pos.y + fy * 0.3 * ppm, h0 = 1.0;
    for (let i = 0; i < 26; i++) {
      const sp = randRange(st.rng, 1.1, 2.4), side = randRange(st.rng, -0.6, 0.6), vh = randRange(st.rng, 0.3, 1.2);
      const vx = (fx * sp - fy * side) * ppm, vy = (fy * sp * 0.45 + fx * side * 0.25) * ppm;
      const T = (vh + Math.sqrt(vh * vh + 2 * 9.81 * h0)) / 9.81;
      st.grit.push({ x0: hx, y0: hy, h0: h0 * ppm, vx, vy, vh: vh * ppm, t0: t, T });
    }
  }
  if (ct >= CY) {
    if (st.doses <= 0 || st.grits <= 0) { h.hands(a, null, 0); st.done.salt++; next(st, t); return; }
    // krátký krok dál po chodníku (k druhému konci)
    const tgt = c.sweep[1], d = Math.hypot(tgt.x - a.pos.x, tgt.y - a.pos.y), ppm = h.ppm(a.pos.y), stepPx = 0.7 * ppm;
    const to = d > stepPx ? { x: a.pos.x + ((tgt.x - a.pos.x) / d) * stepPx, y: a.pos.y + ((tgt.y - a.pos.y) / d) * stepPx } : { x: a.pos.x - stepPx, y: a.pos.y };
    h.walk(a, [to], 0.35);
  }
}

export const TASK_LABEL: Record<BakeryTask, string> = { sweep: 'zametání (A18a)', salt: 'posyp chodníku (A18b)', crate: 'bedýnka s pečivem (A18c)' };
/** stav pro ladicí panel */
export function bakeryLabel(st: BakeryState): string {
  if (st.phase === 'inside') return 'v pekárně';
  const s = st.plan[st.si];
  return `${st.task ? TASK_LABEL[st.task] : ''} – ${s ? STEP_LABEL[s.k] : 'konec'}`;
}
const STEP_LABEL: Record<Step['k'], string> = { door: 'dveře', show: 'vychází', walk: 'jde', face: 'otáčí se', sign: 'cedule', sweep: 'zametá', salt: 'sype', lower: 'přidřep', hide: 'vchází', wait: 'čeká' };
