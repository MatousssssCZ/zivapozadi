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
}
export interface ObstacleW { poly: World[] }

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
    let best = { ang: 0, k: 1 }, bestC = Infinity, bestSafe = false;
    for (const ang of ANGLES) for (const k of SPEEDS) {
      const v = rot({ X: dir.X * sp * k, Z: dir.Z * sp * k }, ang);
      let C = 12 * (1 - k) ** 2 + 1.2 * (ang / (Math.PI / 6)) ** 2;
      // stabilita volby (žádné kmitání mezi kandidáty)
      const vp = rot({ X: dir.X * sp * prev.k, Z: dir.Z * sp * prev.k }, prev.ang);
      C += (0.25 * ((v.X - vp.X) ** 2 + (v.Z - vp.Z) ** 2)) / 0.09;
      let safe = true;
      for (const o of items) {
        if (o === me || ignore.has(o.id)) continue;
        const r = sub(o.p, me.p), w = sub(o.v, v);
        if (len(r) > 9) continue;
        const { d, t } = closest(r, w, HORIZON);
        if (d < me.r + o.r + 0.02 && t < HORIZON) safe = false; // budoucí střet těl
        if (me.partnerOf === o.id || o.partnerOf === me.id) continue;
        const Rc = me.rc + o.rc;
        if (d < Rc) C += (4 * (1 - d / Rc) ** 2) / (1 + t);
        // protijdoucí: míjet vpravo (druhý má zůstat po naší levici)
        if (len(o.v) > 0.2 && dot(o.v, dir) < -0.5 * len(o.v) && t > 0 && d < Rc * 1.6) {
          const rel = { X: r.X + w.X * t, Z: r.Z + w.Z * t };
          if (dot(rel, right) > 0) C += 0.4;
        }
      }
      // budoucí průchod pevnou překážkou (1,5 s dopředu)
      const ahead = { X: me.p.X + v.X * 1.5, Z: me.p.Z + v.Z * 1.5 };
      for (const ob of obstacles) if (k > 0 && !insidePoly(me.p, ob.poly) && segHitsPoly(me.p, ahead, ob.poly)) { C += 50; safe = false; break; }
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
  // pevné překážky: podpůrná přímka v nejbližším bodě obrysu
  for (let i = 0; i < n; i++) {
    const a = items[i];
    if (a.fixed) continue;
    for (const ob of obstacles) {
      const q = nearestOnPoly(a.p, ob.poly);
      if (!q || q.inside) continue;
      const d = q.d;
      if (d > 0.5 + a.vmax * dt) continue;
      const Rs = Math.min(0.12 + GAP_G, d); // stěna: chodidla, ne celé tělo (trasy vedou těsně kolem)
      halves.push({ i, j: -1, nX: (a.p.X - q.p.X) / d, nZ: (a.p.Z - q.p.Z) / d, b: (Rs - d) / dt });
    }
  }
  const x = want.map((w, i) => (items[i].fixed ? { X: 0, Z: 0 } : { ...w }));
  const resH = halves.map(() => ({ ai: { X: 0, Z: 0 }, aj: { X: 0, Z: 0 } }));
  const resD = items.map(() => ({ X: 0, Z: 0 }));
  const projectAll = (sweeps: number) => {
    for (let k = 0; k < sweeps; k++) {
      let moved = 0;
      for (let c = 0; c < halves.length; c++) {
        const h = halves[c], R = resH[c];
        const fi = items[h.i].fixed, fj = h.j < 0 || items[h.j].fixed;
        const yi = { X: x[h.i].X + R.ai.X, Z: x[h.i].Z + R.ai.Z };
        const yj = h.j >= 0 ? { X: x[h.j].X + R.aj.X, Z: x[h.j].Z + R.aj.Z } : { X: 0, Z: 0 };
        const val = h.nX * (yi.X - yj.X) + h.nZ * (yi.Z - yj.Z);
        const wi = fi ? 0 : 1, wj = fj ? 0 : 1, den = wi + wj;
        let zi = yi, zj = yj;
        if (val < h.b && den > 0) {
          const lam = (h.b - val) / den;
          zi = { X: yi.X + wi * lam * h.nX, Z: yi.Z + wi * lam * h.nZ };
          zj = { X: yj.X - wj * lam * h.nX, Z: yj.Z - wj * lam * h.nZ };
          moved += lam;
        }
        R.ai = { X: yi.X - zi.X, Z: yi.Z - zi.Z };
        if (!fi) x[h.i] = zi;
        if (h.j >= 0) { R.aj = { X: yj.X - zj.X, Z: yj.Z - zj.Z }; if (!fj) x[h.j] = zj; }
      }
      // disky maximální rychlosti
      for (let i = 0; i < n; i++) {
        if (items[i].fixed) continue;
        const y = { X: x[i].X + resD[i].X, Z: x[i].Z + resD[i].Z }, L = len(y), m = items[i].vmax * 1.25;
        const z = L > m ? { X: (y.X / L) * m, Z: (y.Z / L) * m } : y;
        resD[i] = { X: y.X - z.X, Z: y.Z - z.Z }; x[i] = z;
      }
      if (moved < 1e-9 && k > 2) break;
    }
  };
  projectAll(64);
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
