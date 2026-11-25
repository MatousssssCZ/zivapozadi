/**
 * Pekař a dveře pekařství (scéna „Vánoční tramvajová ulice“).
 *
 * Dveře: křídlo se otevírá dovnitř obchodu kolem pantu (vlevo); kreslí se z výřezu namalovaného
 * křídla pozadí zúženého podle úhlu, za ním teplý interiér (zárubeň ani fasáda se nemění).
 * Pekař jednou za 3–6 min: otevře → vyjde s koštětem (v otvoru je ořezaný rámem dveří) → otočí se
 * a zavře → zametá 20–40 s tenkou vrstvu čerstvého sněhu před obchodem → vrátí se → otevře, vstoupí,
 * zavře. Zametené místo je jemně tmavší a během ~2 min znovu zapadá sněhem (plynule, žádný reset).
 */
import type { Vec2 } from '../math/vec';
import type { RngState } from '../math/rng';
import { rand, randRange } from '../math/rng';
import type { AgentState } from './types';

export interface BakeryConfig {
  bakerId: string;
  /** křídlo dveří (px scény, obdélník v pozadí) a pant (strana) */ door: { x0: number; y0: number; x1: number; y1: number; hinge: 'left' | 'right' };
  /** práh uvnitř (postava zmizí za rámem) a místo před dveřmi */ inside: Vec2; outside: Vec2;
  /** úsek, který zametá (dva body na chodníku) */ sweep: [Vec2, Vec2];
  interval?: [number, number]; firstAt?: number; sweepFor?: [number, number];
}
export type BakeryPhase = 'inside' | 'open1' | 'exit' | 'close1' | 'toSweep' | 'sweep' | 'back' | 'open2' | 'enter' | 'close2';
export interface Patch { x: number; y: number; r: number; t0: number }
export interface Crumb { x: number; y: number; vx: number; vy: number; t0: number }
export interface BakeryState {
  phase: BakeryPhase; t: number; until: number; door: number; sweepUntil: number; leg: 0 | 1;
  patches: Patch[]; crumbs: Crumb[]; rng: RngState; runs: number; stroke: number;
}
export const BAKERY_REFILL = 130; // s – za tak dlouho zametené místo znovu zapadne
export const doorClip = (c: BakeryConfig): Vec2[] => { const d = c.door; return [{ x: d.x0, y: d.y0 }, { x: d.x1, y: d.y0 }, { x: d.x1, y: d.y1 + 4 }, { x: d.x0, y: d.y1 + 4 }]; };
export function newBakeryState(c: BakeryConfig, rng: RngState, t: number): BakeryState {
  return { phase: 'inside', t, until: t + (c.firstAt ?? randRange(rng, 40, 90)), door: 0, sweepUntil: 0, leg: 0, patches: [], crumbs: [], rng, runs: 0, stroke: 0 };
}

export interface BakeryHost {
  walk(a: AgentState, pts: Vec2[], speed: number): void; moving(a: AgentState): boolean;
  show(a: AgentState, p: Vec2): void; hide(a: AgentState): void;
  broom(a: AgentState, on: boolean): void; face(a: AgentState, p: Vec2): void;
  /** px na metr v místě (y) */ ppm(y: number): number;
}

/** Krok pekaře a dveří. */
export function stepBakery(c: BakeryConfig, st: BakeryState, a: AgentState, h: BakeryHost, t: number, dt: number): void {
  const to = (ph: BakeryPhase, dur = 0) => { st.phase = ph; st.t = t; st.until = t + dur; };
  const k = (dur: number) => Math.min(1, (t - st.t) / dur);
  switch (st.phase) {
    case 'inside': a.hidden = true; a.status = 'V pekárně'; if (t >= st.until) to('open1', 1.0); break;
    case 'open1': st.door = k(1.0); if (t >= st.until) { st.door = 1; h.show(a, c.inside); a.clip = doorClip(c); h.broom(a, true); h.walk(a, [c.outside], 0.55); to('exit'); } break;
    case 'exit': a.status = 'Vychází s koštětem';
      if (a.clip && a.pos.y > c.door.y1 + 6) a.clip = null;
      if (!h.moving(a)) { a.clip = null; h.face(a, { x: (c.door.x0 + c.door.x1) / 2, y: c.door.y1 }); to('close1', 1.3); } break;
    case 'close1': a.status = 'Zavírá dveře'; st.door = 1 - k(1.1);
      if (t >= st.until) { st.door = 0; st.sweepUntil = t + randRange(st.rng, ...(c.sweepFor ?? [20, 40])); st.leg = 0; h.walk(a, [c.sweep[0]], 0.5); to('toSweep'); } break;
    case 'toSweep': a.status = 'Jde zametat'; if (!h.moving(a)) { st.leg = 1; h.walk(a, [c.sweep[1]], 0.16); to('sweep'); } break;
    case 'sweep': {
      a.status = 'Zametá sníh před pekárnou';
      // tahy koštětem: dopředu po zemi (kontakt), zpět nad zemí; sníh se hýbe jen při kontaktu
      const w = 2 * Math.PI * 0.75, ph = (t - st.t) * w, contact = Math.cos(ph) > -0.1 && Math.sin(ph) > 0;
      a.anim.tool = { u: 0.62 + 0.22 * Math.sin(ph), h: contact ? 0 : 0.05, beta: 0.12, crouch: 0.12, lean: 0.32 };
      if (contact && Math.floor((t - dt - st.t) * 0.75 * 2) !== Math.floor((t - st.t) * 0.75 * 2)) {
        const ppm = h.ppm(a.pos.y), fx = Math.cos(a.facing), fy = Math.sin(a.facing) * 0.4, tip = { x: a.pos.x + fx * 0.9 * ppm, y: a.pos.y + fy * 0.9 * ppm };
        st.patches.push({ x: tip.x, y: tip.y, r: 0.32 * ppm, t0: t });
        for (let i = 0; i < 5; i++) st.crumbs.push({ x: tip.x, y: tip.y, vx: fx * ppm * randRange(st.rng, 0.4, 1.1) + randRange(st.rng, -0.2, 0.2) * ppm, vy: -randRange(st.rng, 0.3, 0.8) * ppm, t0: t });
      }
      if (!h.moving(a)) { st.leg = st.leg ? 0 : 1; h.walk(a, [c.sweep[st.leg]], 0.16); }
      if (t >= st.sweepUntil) { a.anim.tool = null; h.walk(a, [c.outside], 0.55); to('back'); }
      break;
    }
    case 'back': a.status = 'Vrací se do pekárny'; if (!h.moving(a)) { h.face(a, c.inside); to('open2', 1.0); } break;
    case 'open2': st.door = k(1.0); if (t >= st.until) { st.door = 1; a.clip = doorClip(c); h.walk(a, [c.inside], 0.5); to('enter'); } break;
    case 'enter': if (!h.moving(a)) { h.broom(a, false); h.hide(a); a.clip = null; to('close2', 1.1); } break;
    case 'close2': st.door = 1 - k(1.1); if (t >= st.until) { st.door = 0; st.runs++; to('inside', randRange(st.rng, ...(c.interval ?? [180, 360]))); } break;
  }
  // úklid: zametená místa a drobky (omezený počet)
  if (st.patches.length && t - st.patches[0].t0 > BAKERY_REFILL) st.patches.shift();
  if (st.patches.length > 80) st.patches.splice(0, st.patches.length - 80);
  st.crumbs = st.crumbs.filter((q) => t - q.t0 < 0.7);
  if (st.crumbs.length > 60) st.crumbs.splice(0, st.crumbs.length - 60);
  void rand;
}
export const BAKERY_LABEL: Record<BakeryPhase, string> = { inside: 'v pekárně', open1: 'otevírá', exit: 'vychází', close1: 'zavírá', toSweep: 'jde zametat', sweep: 'zametá', back: 'vrací se', open2: 'otevírá', enter: 'vchází', close2: 'zavírá' };
