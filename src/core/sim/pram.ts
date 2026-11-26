/**
 * Procházka s kočárkem a úprava deky (zadání A17).
 *
 * Rodič tlačí kočárek po chodníku (vlastní trasa, začátek i konec mimo obraz). Kočárek je tuhé těleso
 * s pevnými zadními koly a otočnými předními kolečky: madlo drží ruce rodiče, zadní náprava je pevně
 * před madlem a natočení kočárku se mění omezenou rychlostí (nemůže se točit kolem středu). Kola se
 * otáčejí podle skutečně ujeté dráhy (dφ = ds / r, vnitřní a vnější kolo v zatáčce zvlášť), přední
 * kolečka se stáčejí do směru pohybu s krátkým zpožděním. Stojící kočárek má zataženou brzdu a kola
 * se netočí.
 *
 * Epizoda: příchod → zpomalení u lavičky → zastavení a brzda → rodič pustí madlo a obejde kočárek
 * k boku → předklon, uhlazení a přitažení deky (4–8 s) → návrat k madlu → odbrzdění → odjezd.
 */
import type { Vec2 } from '../math/vec';
import type { AgentState } from './types';
import type { ProjectFile } from '../model/types';
import { cameraFor, toScreen, toWorld, type World } from '../scene/camera';
import { hashNoise } from '../math/rng';
import { SIM_DT } from './types';

/** Rozměry (m): rozvor, rozchod, poloměry kol, odstup zadní nápravy před madlem, výška madla. */
export const PRAM = { wheelbase: 0.6, track: 0.5, rRear: 0.15, rFront: 0.1, handleAhead: 0.42, handleH: 1.0, yawRate: 0.9 } as const;

export interface PramConfig { parentId: string; path: Vec2[]; /** index bodu trasy, kde zastaví u lavičky */ stopAt: number; firstDelay?: number; interval?: [number, number] }
export type PramPhase = 'offstage' | 'walk' | 'brake' | 'toSide' | 'care' | 'toHandle' | 'release' | 'leave';
export interface PramState {
  phase: PramPhase; t: number; until: number; n: number;
  /** zadní náprava (svět, m), natočení (rad), rychlost (m/s), ujetá dráha */ S?: World; psi?: number; v?: number; dist?: number;
  /** úhly kol [zadní L, zadní P, přední L, přední P] (rad) a natočení předních koleček (rad, vůči ose) */ phi: [number, number, number, number]; caster: [number, number];
  brake: boolean;
  /** deka: 0 = shrnutá, 1 = uhlazená a přitažená */ blanket: number;
  /** odpružení korby (m) – tlumený kmit */ bob: number; bobV: number;
  side?: Vec2; done: number;
}
export function newPramState(c: PramConfig): PramState {
  return { phase: 'offstage', t: 0, until: c.firstDelay ?? 50, n: 0, phi: [0, 0, 0, 0], caster: [0, 0], brake: true, blanket: 0.35, bob: 0, bobV: 0, done: 0 };
}

export interface PramHost {
  project: ProjectFile; time(): number; parent(): AgentState | undefined;
  walk(a: AgentState, pts: Vec2[], speed: number): void; moving(a: AgentState): boolean;
  show(a: AgentState, p: Vec2): void; hide(a: AgentState): void; face(a: AgentState, p: Vec2): void;
  hands(a: AgentState, on: boolean, w: number): void; tuck(a: AgentState, w: number, t: number): void;
  log(msg: string, id?: string): void;
}

const ang = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** Body kočárku ve světě: střed korby, madlo, boční místo pro péči (vzdálená strana). */
export function pramPoints(st: PramState) {
  const S = st.S!, p = st.psi ?? 0, c = Math.cos(p), s = Math.sin(p);
  const at = (x: number, z: number): World => ({ X: S.X + x * c - z * s, Z: S.Z + x * s + z * c });
  return { at, center: at(PRAM.wheelbase * 0.45, 0), handle: at(-PRAM.handleAhead, 0) };
}

export function stepPram(c: PramConfig, st: PramState, h: PramHost): void {
  const a = h.parent(); if (!a) return;
  const t = h.time(), cam = cameraFor(h.project.scene), to = (ph: PramPhase) => { st.phase = ph; st.t = t; };
  const el = t - st.t;
  const P = toWorld(cam, a.pos);
  switch (st.phase) {
    case 'offstage':
      if (!a.hidden) h.hide(a);
      if (t < st.until) return;
      {
        const pts = c.path, p0 = toWorld(cam, pts[0]), p1 = toWorld(cam, pts[1]), L = Math.hypot(p1.X - p0.X, p1.Z - p0.Z) || 1;
        st.psi = Math.atan2(p1.Z - p0.Z, p1.X - p0.X);
        st.S = { X: p0.X + ((p1.X - p0.X) / L) * PRAM.handleAhead, Z: p0.Z + ((p1.Z - p0.Z) / L) * PRAM.handleAhead };
        st.v = 0; st.dist = 0; st.brake = false;
        h.show(a, pts[0]); h.walk(a, pts.slice(1, c.stopAt + 1), 0.72); h.hands(a, true, 1);
        h.log(`${a.name} jde s kočárkem.`, a.id); to('walk');
      }
      return;
    case 'walk': case 'leave': {
      follow(st, a, P);
      st.blanket = Math.max(0.15, st.blanket - SIM_DT * 0.004); // dítě deku pomalu shrnuje
      if (!h.moving(a)) {
        if (st.phase === 'leave') { h.hide(a); h.hands(a, false, 0); st.phase = 'offstage'; st.n++; st.until = t + (c.interval ? c.interval[0] + (c.interval[1] - c.interval[0]) * hashNoise(h.project.seed, 9700, st.n) : 240); st.S = undefined; return; }
        to('brake');
      }
      return;
    }
    case 'brake':
      // zastaveno: kočárek dojel s rodičem (rychlost už 0), brzda se zatáhne nohou
      follow(st, a, P);
      a.status = 'Zastavuje kočárek u lavičky';
      if (el > 0.6 && !st.brake) st.brake = true;
      if (el > 1.2) {
        h.hands(a, false, 0);
        // obejde na vzdálenou stranu (rodič je za korbou, ruce dosáhnou pod stříšku)
        const { at } = pramPoints(st); const A = at(PRAM.wheelbase * 0.5, PRAM.track / 2 + 0.5), B = at(PRAM.wheelbase * 0.5, -(PRAM.track / 2 + 0.5));
        const far = A.Z > B.Z ? A : B, corner = at(-0.25, (far === A ? 1 : -1) * (PRAM.track / 2 + 0.45));
        st.side = toScreen(cam, far);
        h.walk(a, [toScreen(cam, corner), st.side], 0.55); to('toSide');
      }
      return;
    case 'toSide':
      a.status = 'Obchází kočárek';
      if (!h.moving(a)) { h.face(a, toScreen(cam, pramPoints(st).center)); to('care'); }
      return;
    case 'care': {
      // předklon v kyčlích a kolenou, ruce pod stříšku k dece: uhladí a přitáhne (4–8 s)
      const dur = 4 + 4 * hashNoise(h.project.seed, 9710, st.n);
      a.status = 'Upravuje dítěti deku';
      const w = Math.min(1, el / 0.9, Math.max(0, (dur - el) / 0.9));
      h.tuck(a, w, el);
      if (el > 0.9 && el < dur - 0.9) st.blanket = Math.min(1, st.blanket + SIM_DT * 0.35);
      if (el >= dur) { h.tuck(a, 0, el); st.done++; const { handle } = pramPoints(st); h.walk(a, [toScreen(cam, pramPoints(st).at(-0.25, (st.side && toWorld(cam, st.side).Z > st.S!.Z ? 1 : -1) * (PRAM.track / 2 + 0.45))), toScreen(cam, handle)], 0.55); to('toHandle'); }
      return;
    }
    case 'toHandle':
      a.status = 'Vrací se k madlu';
      if (!h.moving(a)) { h.face(a, toScreen(cam, pramPoints(st).center)); h.hands(a, true, 1); to('release'); }
      return;
    case 'release':
      if (el > 0.7 && st.brake) st.brake = false; // odbrzdí, ruce už drží madlo
      if (el > 1.1) { h.walk(a, c.path.slice(c.stopAt + 1), 0.72); to('leave'); }
      return;
  }
}

/**
 * Kočárek sleduje ruce na madle: zadní náprava je PRAM.handleAhead před madlem, natočení se stáčí
 * ke směru chůze nejvýš yawRate (rad/s). Kola: dφ = ds/r (zadní každé zvlášť podle změny natočení).
 */
function follow(st: PramState, a: AgentState, P: World) {
  if (!st.S) return;
  const hd = a.groundHeading ?? st.psi ?? 0, psi0 = st.psi ?? hd;
  const moving = Math.hypot(a.vel?.X ?? 0, a.vel?.Z ?? 0) > 0.05;
  let dpsi = moving ? ang(hd - psi0) : 0; dpsi = Math.max(-PRAM.yawRate * SIM_DT, Math.min(PRAM.yawRate * SIM_DT, dpsi));
  const psi = psi0 + dpsi;
  const H = { X: P.X + Math.cos(hd) * 0.36, Z: P.Z + Math.sin(hd) * 0.36 }; // ruce před tělem
  let S = { X: H.X + Math.cos(psi) * PRAM.handleAhead, Z: H.Z + Math.sin(psi) * PRAM.handleAhead };
  // kočárek má hmotnost: posun za krok omezen (max 1,6 m/s) – trhnutí rukou nepřenese skok
  { const ddx = S.X - st.S.X, ddz = S.Z - st.S.Z, dd = Math.hypot(ddx, ddz), mx = 1.6 * SIM_DT; if (dd > mx) S = { X: st.S.X + (ddx / dd) * mx, Z: st.S.Z + (ddz / dd) * mx }; }
  const dx = S.X - st.S.X, dz = S.Z - st.S.Z, ds = (dx * Math.cos(psi) + dz * Math.sin(psi)) * (st.brake ? 0 : 1);
  if (st.brake) { st.v = 0; st.psi = psi0; return; } // zabrzděný kočárek stojí (rodič se od madla vzdálí)
  st.S = S; st.psi = psi; st.v = ds / SIM_DT; st.dist = (st.dist ?? 0) + Math.abs(ds);
  const half = PRAM.track / 2;
  st.phi[0] += (ds - half * dpsi) / PRAM.rRear; st.phi[1] += (ds + half * dpsi) / PRAM.rRear;
  // přední otočná kolečka: dráha přední nápravy, natočení k jejímu pohybu (zpoždění ~0,25 s)
  const fwdDs = ds, lat = PRAM.wheelbase * dpsi, want = Math.abs(fwdDs) > 1e-5 ? Math.atan2(lat, fwdDs) : 0;
  for (const i of [0, 1] as const) st.caster[i] += (want - st.caster[i]) * Math.min(1, SIM_DT / 0.25);
  const fd = Math.hypot(fwdDs, lat) * Math.sign(fwdDs || 1);
  st.phi[2] += fd / PRAM.rFront; st.phi[3] += fd / PRAM.rFront;
  // odpružení korby: tlumený kmit buzený nerovnostmi úměrně rychlosti (na hladkém chodníku malé)
  const kick = Math.sin((st.dist ?? 0) * 9.1) * 0.002 * Math.min(1, Math.abs(st.v));
  st.bobV += (-160 * st.bob - 9 * st.bobV) * SIM_DT + kick; st.bob += st.bobV * SIM_DT;
}

/** Kolizní obrys kočárku pro ostatní chodce. */
export function pramObstacle(st: PramState | undefined): { poly: World[] } | null {
  if (!st?.S || st.phase === 'offstage') return null;
  const { at } = pramPoints(st), w = PRAM.track / 2 + 0.05;
  return { poly: [at(-0.1, -w), at(PRAM.wheelbase + 0.12, -w), at(PRAM.wheelbase + 0.12, w), at(-0.1, w)] };
}
export const PRAM_LABEL: Record<PramPhase, string> = { offstage: 'mimo scénu', walk: 'tlačí kočárek', brake: 'zastavuje, brzda', toSide: 'obchází kočárek', care: 'upravuje deku', toHandle: 'vrací se k madlu', release: 'odbrzďuje', leave: 'odchází s kočárkem' };
