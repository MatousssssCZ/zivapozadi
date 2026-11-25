/**
 * Dav ve světových metrech (zadání dav/perspektiva/končetiny, kap. B).
 *
 * 1) Předvídavá volba rychlosti (15 Hz): konečná sada kandidátů kolem směru trasy, skóre podle
 *    ztráty rychlosti, odchylky směru, budoucího přiblížení k ostatním (TTC / minimum vzdálenosti)
 *    a preference míjení vpravo. Malý včasný úhyb je levnější než brzdění.
 * 2) Pevná nepřekročitelnost (60 Hz): rychlosti všech se promítnou (Dykstra) na průnik lineárních
 *    podmínek n·(vi − vj) ≥ (R_step − d)/dt pro každý pár (a pevné překážky) a disků max. rychlosti.
 *    Podmínka platí pro celou úsečku pohybu v ticku – žádný průlet mezi snímky.
 * 3) Nezávislá spojitá kontrola: kdo by ji porušil, v ticku nepohne (bezpečný fallback).
 *
 * Vše deterministické: pevné pořadí, žádná náhoda, vstupy ze stejného snímku stavu.
 */
import type { World } from '../scene/camera';

export const R_BODY = 0.23; // m – fyzické tělo (disk)
export const GAP_G = 0.002; // m – numerická rezerva
const GUARD = 0.0005;
const HORIZON = 3.0; // s
const ACC_FWD = 0.8, DEC = 1.4, ACC_LAT = 0.9; // m/s²

export interface CrowdItem {
  id: string;
  p: World;
  v: World; // aktuální (schválená) rychlost
  pref: World; // preferovaná rychlost z trasy / formace
  vmax: number;
  fixed: boolean; // stojí na místě činnosti – pevná překážka
  r: number; rc: number; // tělo, osobní prostor (m)
  partnerOf?: string | null; // druhý člen dvojice (osobní prostor se mezi nimi nepočítá)
  choice?: { ang: number; k: number } | null; // volba plánovače vůči preferovanému směru
  /** Směr, kam je postava natočená (jednotkový) – nikdy se nepohne proti němu (žádná chůze pozpátku). */
  head?: World | null;
  /** Jak dlouho (s) je postava s trasou zbrzděná pod třetinu rychlosti – řešení zácpy. */
  blocked?: number;
}
export interface ObstacleW { poly: World[] }
/** Ohraničující kruh překážky (počítá se jednou, uloží se mimo JSON stav) – rychlý předvýběr blízkých překážek. */
const boundCache = new WeakMap<ObstacleW, { X: number; Z: number; r: number }>();
function boundOf(ob: ObstacleW): { X: number; Z: number; r: number } {
  let b = boundCache.get(ob);
  if (!b) {
    const X = ob.poly.reduce((s, p) => s + p.X, 0) / ob.poly.length, Z = ob.poly.reduce((s, p) => s + p.Z, 0) / ob.poly.length;
    b = { X, Z, r: Math.max(...ob.poly.map((p) => Math.hypot(p.X - X, p.Z - Z))) };
    boundCache.set(ob, b);
  }
  return b;
}
const nearObstacles = (obs: ObstacleW[], p: World, reach: number) => obs.filter((ob) => { const b = boundOf(ob); return Math.hypot(b.X - p.X, b.Z - p.Z) <= b.r + reach; });

const len = (v: World) => Math.hypot(v.X, v.Z);
const sub = (a: World, b: World): World => ({ X: a.X - b.X, Z: a.Z - b.Z });
const dot = (a: World, b: World) => a.X * b.X + a.Z * b.Z;
const rot = (v: World, a: number): World => ({ X: v.X * Math.cos(a) - v.Z * Math.sin(a), Z: v.X * Math.sin(a) + v.Z * Math.cos(a) });

/** Osobní poloměr s individuální odchylkou (0,35–0,49 m) podle id. */
export function comfortRadius(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 0.35 + 0.14 * (((h >>> 0) % 1000) / 1000);
}

/** Minimum vzdálenosti dvou lineárních pohybů v intervalu [0, T]: (d*, t*). */
function closest(r: World, w: World, T: number): { d: number; t: number } {
  const ww = dot(w, w);
  const t = ww < 1e-12 ? 0 : Math.max(0, Math.min(T, -dot(r, w) / ww));
  return { d: Math.hypot(r.X + w.X * t, r.Z + w.Z * t), t };
}

/** Kandidátní směry (stupně) a násobky rychlosti – pevné pořadí kvůli determinismu. */
const ANGLES = [0, 5, -5, 10, -10, 15, -15, 22.5, -22.5, 30, -30, 45, -45, 60, -60].map((d) => (d * Math.PI) / 180);
const SPEEDS = [1, 0.95, 0.85, 0.65, 0.4, 0];

/** Předvídavý plánovač: pro každou pohyblivou postavu zvolí kandidáta (uloží do `choice`). */
export function planCrowd(items: CrowdItem[], obstacles: ObstacleW[]): void {
  for (const me of items) {
    if (me.fixed) { me.choice = null; continue; }
    const sp = len(me.pref);
    if (sp < 0.05) { me.choice = { ang: 0, k: 0 }; continue; }
    const dir = { X: me.pref.X / sp, Z: me.pref.Z / sp };
    const right = { X: dir.Z, Z: -dir.X };
    const prev = me.choice ?? { ang: 0, k: 1 };
    // křížení drah: přednost má, kdo do místa křížení dorazí dřív (shoda do 0,25 s: nižší id);
    // s předností jde dál a s druhým nepočítá – ten zpomalí nebo projde za ním
    const ignore = new Set<string>();
    for (const o of items) {
      if (o === me || o.fixed) continue;
      const os = len(o.v) > 0.2 ? len(o.v) : len(o.pref);
      if (os < 0.2) continue;
      const od = len(o.v) > 0.2 ? { X: o.v.X / len(o.v), Z: o.v.Z / len(o.v) } : { X: o.pref.X / len(o.pref), Z: o.pref.Z / len(o.pref) };
      const c = dir.X * od.X + dir.Z * od.Z;
      if (Math.abs(c) > 0.7) continue; // souběžní / protijdoucí se řeší míjením
      const den = dir.X * od.Z - dir.Z * od.X;
      const r = sub(o.p, me.p);
      const tMe = (r.X * od.Z - r.Z * od.X) / den, tO = (r.X * dir.Z - r.Z * dir.X) / den; // vzdálenosti k průsečíku
      if (tMe < -0.3 || tO < -0.3 || tMe > 8 || tO > 8) continue;
      const aMe = tMe / Math.max(0.1, sp), aO = tO / os;
      const first = aMe < aO - 0.25 || (Math.abs(aMe - aO) <= 0.25 && me.id < o.id);
      if (first) ignore.add(o.id);
    }
    const H = HORIZON;
    let best = { ang: 0, k: 1 }, bestC = Infinity, bestSafe = false;
    // jen překážky v dosahu 1,5 s chůze, a jen ty, ve kterých postava nestojí
    const nearOb = nearObstacles(obstacles, me.p, sp * 1.5 * 1.3 + 0.3).filter((ob) => !insidePoly(me.p, ob.poly));
    // sousedé do 9 m – jednou na postavu (dřív pro každého z 90 kandidátů znovu); vše, co nezávisí na
    // kandidátovi, spočítané předem. Vzorce i pořadí sčítání jsou stejné → výsledek shodný do bitu.
    const nb: { rX: number; rZ: number; d0: number; vX: number; vZ: number; R: number; Rc: number; partner: boolean; opp: boolean }[] = [];
    for (const o of items) {
      if (o === me || ignore.has(o.id)) continue;
      const rX = o.p.X - me.p.X, rZ = o.p.Z - me.p.Z, d0 = Math.hypot(rX, rZ);
      if (d0 > 9) continue;
      const lv = Math.hypot(o.v.X, o.v.Z);
      nb.push({ rX, rZ, d0, vX: o.v.X, vZ: o.v.Z, R: me.r + o.r + 0.02, Rc: me.rc + o.rc, partner: me.partnerOf === o.id || o.partnerOf === me.id,
        opp: lv > 0.2 && o.v.X * dir.X + o.v.Z * dir.Z < -0.5 * lv });
    }
    const vpX0 = dir.X * sp * prev.k, vpZ0 = dir.Z * sp * prev.k, cp = Math.cos(prev.ang), spn = Math.sin(prev.ang);
    const vpX = vpX0 * cp - vpZ0 * spn, vpZ = vpX0 * spn + vpZ0 * cp; // (stabilita volby – předchozí kandidát)
    for (const ang of ANGLES) for (const k of SPEEDS) {
      const v0X = dir.X * sp * k, v0Z = dir.Z * sp * k, ca = Math.cos(ang), sa = Math.sin(ang);
      const vX = v0X * ca - v0Z * sa, vZ = v0X * sa + v0Z * ca;
      let C = 12 * (1 - k) ** 2 + 1.2 * (ang / (Math.PI / 6)) ** 2;
      // stabilita volby (žádné kmitání mezi kandidáty)
      C += (0.25 * ((vX - vpX) ** 2 + (vZ - vpZ) ** 2)) / 0.09;
      let safe = true;
      for (const o of nb) {
        const wX = o.vX - vX, wZ = o.vZ - vZ;
        // minimum vzdálenosti v [0, H] (= closest)
        const ww = wX * wX + wZ * wZ;
        const t = ww < 1e-12 ? 0 : Math.max(0, Math.min(H, -(o.rX * wX + o.rZ * wZ) / ww));
        const d = Math.hypot(o.rX + wX * t, o.rZ + wZ * t);
        // budoucí střet těl
        if (d < o.R && t < H) safe = false;
        if (o.partner) continue;
        const Rc = o.Rc;
        if (d < Rc) C += (4 * (1 - d / Rc) ** 2) / (1 + t);
        // cizí člověk těsně vedle: preferovat rozestoupení / předejití (vzdálenost za 0,8 s)
        if (o.d0 < Rc) { const d1 = Math.min(Rc, Math.hypot(o.rX + wX * 0.8, o.rZ + wZ * 0.8)); C += 3 * (1 - d1 / Rc) ** 2; }
        // protijdoucí: míjet vpravo (druhý má zůstat po naší levici)
        if (o.opp && t > 0 && d < Rc * 1.6) {
          const relX = o.rX + wX * t, relZ = o.rZ + wZ * t;
          if (relX * right.X + relZ * right.Z > 0) C += 0.4;
        }
      }
      // budoucí průchod pevnou překážkou (1,5 s dopředu)
      const ahead = { X: me.p.X + vX * 1.5, Z: me.p.Z + vZ * 1.5 };
      for (const ob of nearOb) if (k > 0 && segHitsPoly(me.p, ahead, ob.poly)) { C += 50; safe = false; break; }
      if (safe && !bestSafe) { bestSafe = true; bestC = C; best = { ang, k }; continue; }
      if (safe === bestSafe && C < bestC - 1e-9) { bestC = C; best = { ang, k }; }
    }
    me.choice = best;
  }
}

/** Požadovaná rychlost pro tento tick: volba plánovače, plynule v mezích komfortního zrychlení. */
export function wantVelocity(me: CrowdItem, dt: number): World {
  if (me.fixed) return { X: 0, Z: 0 };
  const sp = len(me.pref);
  const ch = me.choice ?? { ang: 0, k: 1 };
  const target = sp < 1e-6 ? { X: 0, Z: 0 } : rot({ X: (me.pref.X / sp) * sp * ch.k, Z: (me.pref.Z / sp) * sp * ch.k }, ch.ang);
  const cur = me.v, cs = len(cur);
  const fwd = cs > 0.05 ? { X: cur.X / cs, Z: cur.Z / cs } : sp > 1e-6 ? { X: me.pref.X / sp, Z: me.pref.Z / sp } : { X: 1, Z: 0 };
  const lat = { X: -fwd.Z, Z: fwd.X };
  const d = sub(target, cur);
  let dl = dot(d, fwd), dlat = dot(d, lat);
  dl = Math.max(-DEC * dt, Math.min(ACC_FWD * dt * (cs < 0.3 ? 1.5 : 1), dl));
  // při rozejití i boční složka (otočení), jinak komfortní boční zrychlení
  const latMax = (cs < 0.3 ? 3 : 1) * ACC_LAT * dt;
  dlat = Math.max(-latMax, Math.min(latMax, dlat));
  let v = { X: cur.X + fwd.X * dl + lat.X * dlat, Z: cur.Z + fwd.Z * dl + lat.Z * dlat };
  // zastavení nesmí „přestřelit“ do couvání
  if (sp < 1e-6 && dot(v, cur) < 0) v = { X: 0, Z: 0 };
  return v;
}

interface Half { i: number; j: number; nX: number; nZ: number; b: number } // n·(vi − vj) ≥ b (j = −1: překážka)

/**
 * Pevná nepřekročitelnost: Dykstrova projekce požadovaných rychlostí na průnik podmínek.
 * Vrací rychlosti a seznam id, která musela v ticku zůstat stát (spojitá kontrola selhala).
 */
export function solveCrowd(items: CrowdItem[], want: World[], obstacles: ObstacleW[], dt: number): { v: World[]; frozen: string[] } {
  const n = items.length;
  const halves: Half[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = items[i], b = items[j];
    if (a.fixed && b.fixed) continue;
    const r = sub(a.p, b.p), d = len(r), R = a.r + b.r;
    if (d > R + (a.vmax + b.vmax) * 1.5 * dt + 0.1) continue;
    // úplná shoda poloh (nemá nastat): rozestoupit ve směru rozdílu požadovaných rychlostí
    const nn = d > 1e-9 ? { X: r.X / d, Z: r.Z / d } : (() => { const w = sub(want[i], want[j]), l = len(w); return l > 1e-9 ? { X: w.X / l, Z: w.Z / l } : { X: 1, Z: 0 }; })();

    const Rs = Math.min(R + GAP_G, d);
    halves.push({ i, j, nX: nn.X, nZ: nn.Z, b: (Rs - d) / dt });
  }
  // žádná chůze pozpátku: v · směr natočení ≥ 0 (nulová rychlost je vždy přípustná)
  for (let i = 0; i < n; i++) {
    const h = items[i].head;
    if (!items[i].fixed && h) halves.push({ i, j: -1, nX: h.X, nZ: h.Z, b: 0 });
  }
  // pevné překážky: podpůrná přímka v nejbližším bodě obrysu
  for (let i = 0; i < n; i++) {
    const a = items[i];
    if (a.fixed) continue;
    for (const ob of nearObstacles(obstacles, a.p, 0.6 + a.vmax * dt)) {
      const q = nearestOnPoly(a.p, ob.poly);
      if (!q || q.inside) continue;
      const d = q.d;
      if (d > 0.5 + a.vmax * dt) continue;
      const Rs = Math.min(0.12 + GAP_G, d); // stěna: chodidla, ne celé tělo (trasy vedou těsně kolem)
      halves.push({ i, j: -1, nX: (a.p.X - q.p.X) / d, nZ: (a.p.Z - q.p.Z) / d, b: (Rs - d) / dt });
    }
  }
  // projekce v polích čísel (dřív nové objekty v každém průchodu) – stejné vzorce i pořadí → shodný výsledek
  const xX = new Float64Array(n), xZ = new Float64Array(n);
  for (let i = 0; i < n; i++) if (!items[i].fixed) { xX[i] = want[i].X; xZ[i] = want[i].Z; }
  const m = halves.length;
  const aiX = new Float64Array(m), aiZ = new Float64Array(m), ajX = new Float64Array(m), ajZ = new Float64Array(m);
  const dX = new Float64Array(n), dZ = new Float64Array(n);
  const fixedI = items.map((it) => it.fixed);
  const projectAll = (sweeps: number) => {
    for (let k = 0; k < sweeps; k++) {
      let moved = 0;
      for (let c = 0; c < m; c++) {
        const h = halves[c], hi = h.i, hj = h.j;
        const fi = fixedI[hi], fj = hj < 0 || fixedI[hj];
        const yiX = xX[hi] + aiX[c], yiZ = xZ[hi] + aiZ[c];
        const yjX = hj >= 0 ? xX[hj] + ajX[c] : 0, yjZ = hj >= 0 ? xZ[hj] + ajZ[c] : 0;
        const val = h.nX * (yiX - yjX) + h.nZ * (yiZ - yjZ);
        const wi = fi ? 0 : 1, wj = fj ? 0 : 1, den = wi + wj;
        let ziX = yiX, ziZ = yiZ, zjX = yjX, zjZ = yjZ;
        if (val < h.b && den > 0) {
          const lam = (h.b - val) / den;
          ziX = yiX + wi * lam * h.nX; ziZ = yiZ + wi * lam * h.nZ;
          zjX = yjX - wj * lam * h.nX; zjZ = yjZ - wj * lam * h.nZ;
          moved += lam;
        }
        aiX[c] = yiX - ziX; aiZ[c] = yiZ - ziZ;
        if (!fi) { xX[hi] = ziX; xZ[hi] = ziZ; }
        if (hj >= 0) { ajX[c] = yjX - zjX; ajZ[c] = yjZ - zjZ; if (!fj) { xX[hj] = zjX; xZ[hj] = zjZ; } }
      }
      // disky maximální rychlosti
      for (let i = 0; i < n; i++) {
        if (fixedI[i]) continue;
        const yX = xX[i] + dX[i], yZ = xZ[i] + dZ[i], L = Math.hypot(yX, yZ), mx = items[i].vmax * 1.25;
        const zX = L > mx ? (yX / L) * mx : yX, zZ = L > mx ? (yZ / L) * mx : yZ;
        dX[i] = yX - zX; dZ[i] = yZ - zZ; xX[i] = zX; xZ[i] = zZ;
      }
      if (moved < 1e-9 && k > 2) break;
    }
  };
  projectAll(64);
  const x: World[] = items.map((_, i) => ({ X: xX[i], Z: xZ[i] }));
  // nezávislá spojitá kontrola; kdo ji poruší, v ticku stojí (opakovat, dokud je co opravit)
  const frozen = new Set<string>();
  for (let iter = 0; iter < n + 1; iter++) {
    let bad = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = items[i], b = items[j];
      const dNow = len(sub(a.p, b.p)), R = a.r + b.r;
      const lim = Math.min(R + GUARD, dNow - 1e-9);
      const { d } = closest(sub(a.p, b.p), sub(x[i], x[j]), dt);
      if (d < lim) {
        bad = true;
        for (const k of [i, j]) if (!items[k].fixed && (x[k].X || x[k].Z)) { x[k] = { X: 0, Z: 0 }; frozen.add(items[k].id); }
      }
    }
    if (!bad) break;
  }
  return { v: x, frozen: [...frozen] };
}

// --- geometrie překážek (polygony ve světě)
export function insidePoly(p: World, poly: World[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if ((b.Z > p.Z) !== (a.Z > p.Z) && p.X < ((a.X - b.X) * (p.Z - b.Z)) / (a.Z - b.Z) + b.X) inside = !inside;
  }
  return inside;
}
function segHitsPoly(a: World, b: World, poly: World[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (segX(a, b, p, q)) return true;
  }
  return false;
}
function segX(a: World, b: World, c: World, d: World): boolean {
  const o = (p: World, q: World, r: World) => (q.X - p.X) * (r.Z - p.Z) - (q.Z - p.Z) * (r.X - p.X);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function nearestOnPoly(p: World, poly: World[]): { p: World; d: number; inside: boolean } | null {
  if (poly.length < 3) return null;
  let best: World | null = null, bd = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if ((b.Z > p.Z) !== (a.Z > p.Z) && p.X < ((a.X - b.X) * (p.Z - b.Z)) / (a.Z - b.Z) + b.X) inside = !inside;
    const ab = sub(b, a), L2 = dot(ab, ab);
    const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2));
    const q = { X: a.X + ab.X * t, Z: a.Z + ab.Z * t }, d = len(sub(p, q));
    if (d < bd) { bd = d; best = q; }
  }
  return best ? { p: best, d: bd, inside } : null;
}
