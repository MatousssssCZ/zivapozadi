/**
 * Materiálový model sněhu pro odklízení (čistě datový, ve světových metrech, deterministický).
 *
 * Zásoby (každý kilogram je právě v jedné z nich):
 *  - `grid.m`  – sníh na povrchu (mřížka buněk; v pracovní ploše původní vrstva, mimo ni val,
 *                vytlačený sníh u okraje a hromada),
 *  - `ridge`   – val před listem lopaty (jen dokud je list na zemi),
 *  - `blade`   – náklad na listu,
 *  - `air`     – shluky ve vzduchu.
 * Přesuny vždy odečtou z jedné zásoby a přičtou do druhé (`total` se zachovává až na zaokrouhlení).
 *
 * Hrnutí zpracovává plochu, kterou pracovní hrana skutečně prošla mezi dvěma stavy (čtyřúhelník
 * staré a nové hrany) – při libovolném kroku se nic nevynechá ani nezapočítá dvakrát.
 */
import type { World } from '../scene/camera';

export interface SnowParams {
  /** výška vrstvy (m), hustota vrstvy (kg/m³) */ depth: number; density: number;
  /** pracovní šířka listu (m) */ bladeWidth: number;
  /** soudržnost 0..1 (víc = val drží tvar, méně uniká do stran) */ cohesion: number;
  /** přilnavost k listu 0..1 (podíl, který po vysypání zůstane na listu) */ adhesion: number;
  /** tenký film, který list na dlažbě nechá (podíl původní vrstvy) */ residue: number;
  /** objem listu (m³) a hmotnostní limit nabrání (kg) */ bladeVolume: number; massLimit: number;
  /** hustota zhutněného valu a hromady (kg/m³) – zhutnění mění objem, ne hmotnost */ ridgeDensity: number; pileDensity: number;
  /** sypný úhel hromady (°) */ repose: number;
  /** strana buňky mřížky (m) */ cell: number;
}
export const DEFAULT_SNOW: SnowParams = {
  depth: 0.04, density: 200, bladeWidth: 0.4, cohesion: 0.5, adhesion: 0.05, residue: 0.04,
  bladeVolume: 0.009, massLimit: 3, ridgeDensity: 280, pileDensity: 330, repose: 36, cell: 0.05,
};

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Clump { id: number; X: number; Z: number; H: number; vX: number; vZ: number; vH: number; t0: number; mass: number }
export interface SnowState {
  p: SnowParams;
  /** mřížka: počátek, počet buněk, hmotnost v buňce (kg) */ gx: number; gz: number; nx: number; nz: number; m: number[];
  /** pracovní plocha (odklízená dlažba) */ work: Rect;
  ridge: number; blade: number; air: Clump[]; nextClump: number;
  /** poslední poloha pracovní hrany v kontaktu (null = list není na zemi) */ edge: { A: World; B: World } | null;
  /** statistiky přesunů (kg) */ moved: { swept: number; spilled: number; scooped: number; thrown: number; landed: number; dumped: number; snowed: number };
}

const G = 9.81;
const cellArea = (s: SnowState) => s.p.cell * s.p.cell;
export const baseMass = (s: SnowState) => s.p.density * s.p.depth * cellArea(s);
const idx = (s: SnowState, i: number, j: number) => j * s.nx + i;
const cx = (s: SnowState, i: number) => s.gx + (i + 0.5) * s.p.cell;
const cz = (s: SnowState, j: number) => s.gz + (j + 0.5) * s.p.cell;
const inRect = (r: Rect, X: number, Z: number) => X >= r.x0 && X <= r.x1 && Z >= r.z0 && Z <= r.z1;
export const isWorkCell = (s: SnowState, i: number, j: number) => inRect(s.work, cx(s, i), cz(s, j));

/** Nový stav: pracovní plocha pokrytá rovnoměrnou vrstvou, mřížka zahrnuje i okraj s hromadou. */
export function createSnow(work: Rect, extra: Rect, p: SnowParams = DEFAULT_SNOW): SnowState {
  const x0 = Math.min(work.x0, extra.x0) - 0.3, x1 = Math.max(work.x1, extra.x1) + 0.3;
  const z0 = Math.min(work.z0, extra.z0) - 0.3, z1 = Math.max(work.z1, extra.z1) + 0.3;
  const nx = Math.ceil((x1 - x0) / p.cell), nz = Math.ceil((z1 - z0) / p.cell);
  const s: SnowState = { p, gx: x0, gz: z0, nx, nz, m: new Array(nx * nz).fill(0), work, ridge: 0, blade: 0, air: [], nextClump: 1, edge: null,
    moved: { swept: 0, spilled: 0, scooped: 0, thrown: 0, landed: 0, dumped: 0, snowed: 0 } };
  resetSnow(s);
  return s;
}
/** Explicitní reset testovací situace (nikdy součást pracovního cyklu). */
export function resetSnow(s: SnowState): void {
  const b = baseMass(s);
  for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nx; i++) s.m[idx(s, i, j)] = isWorkCell(s, i, j) ? b : 0;
  s.ridge = 0; s.blade = 0; s.air = []; s.edge = null;
  for (const k of Object.keys(s.moved) as (keyof SnowState['moved'])[]) s.moved[k] = 0;
}

export function total(s: SnowState): number {
  let t = s.ridge + s.blade;
  for (const v of s.m) t += v;
  for (const c of s.air) t += c.mass;
  return t;
}
/** Zásoby pro ladění: povrch (pracovní plocha), okraj + hromada, val, list, vzduch. */
export function stocks(s: SnowState): { surface: number; edge: number; ridge: number; blade: number; air: number; total: number } {
  let surface = 0, edge = 0;
  for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nx; i++) { const v = s.m[idx(s, i, j)]; if (isWorkCell(s, i, j)) surface += v; else edge += v; }
  const air = s.air.reduce((a, c) => a + c.mass, 0);
  return { surface, edge, ridge: s.ridge, blade: s.blade, air, total: surface + edge + s.ridge + s.blade + air };
}
/** Zbývající sníh na pruhu Z ∈ [z0, z1] pracovní plochy nad úrovní filmu (kg). */
export function remainingIn(s: SnowState, z0: number, z1: number, x0 = s.work.x0, x1 = s.work.x1): number {
  const film = baseMass(s) * s.p.residue * 1.5;
  let r = 0;
  for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nx; i++) {
    const X = cx(s, i), Z = cz(s, j);
    if (!isWorkCell(s, i, j) || Z < z0 || Z > z1 || X < x0 || X > x1) continue;
    r += Math.max(0, s.m[idx(s, i, j)] - film);
  }
  return r;
}

/** Výška sněhu nad dlažbou v bodě (m) – pro dopad shluků a vykreslení. */
export function heightAt(s: SnowState, X: number, Z: number): number {
  const i = Math.floor((X - s.gx) / s.p.cell), j = Math.floor((Z - s.gz) / s.p.cell);
  if (i < 0 || j < 0 || i >= s.nx || j >= s.nz) return 0;
  const v = s.m[idx(s, i, j)], b = isWorkCell(s, i, j) ? Math.min(v, baseMass(s)) : 0;
  return b / (s.p.density * cellArea(s)) + (v - b) / (s.p.pileDensity * cellArea(s));
}

// ------------------------------------------------------------------ hrnutí
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
function inQuad(q: World[], X: number, Z: number): boolean {
  let pos = 0, neg = 0;
  for (let k = 0; k < 4; k++) {
    const a = q[k], b = q[(k + 1) % 4], c = cross(b.X - a.X, b.Z - a.Z, X - a.X, Z - a.Z);
    if (c > 1e-12) pos++; else if (c < -1e-12) neg++;
  }
  return !(pos && neg);
}

/**
 * Pracovní hrana v kontaktu se posunula z `s.edge` na (A, B). Sníh z plochy, kterou prošla (jen při
 * pohybu vpřed – `fwd`), přejde do valu; na dlažbě zůstane tenký film. Přes konec pracovní plochy
 * (mimo dlažbu) se val vytlačí na okraj. Přebytek valu nad mez soudržnosti se sype do stran.
 * Vrací přesunuté kg.
 */
export function sweep(s: SnowState, A: World, B: World, fwd: World): number {
  const prev = s.edge; s.edge = { A: { ...A }, B: { ...B } };
  if (!prev) return 0;
  const mid0 = { X: (prev.A.X + prev.B.X) / 2, Z: (prev.A.Z + prev.B.Z) / 2 }, mid1 = { X: (A.X + B.X) / 2, Z: (A.Z + B.Z) / 2 };
  const mv = { X: mid1.X - mid0.X, Z: mid1.Z - mid0.Z }, dist = Math.hypot(mv.X, mv.Z);
  if (dist < 1e-6 || mv.X * fwd.X + mv.Z * fwd.Z <= 0) return 0; // zpětný pohyb ani stání nic nehrne
  const q = [prev.A, prev.B, B, A];
  const bx0 = Math.min(...q.map((p) => p.X)), bx1 = Math.max(...q.map((p) => p.X)), bz0 = Math.min(...q.map((p) => p.Z)), bz1 = Math.max(...q.map((p) => p.Z));
  const i0 = Math.max(0, Math.floor((bx0 - s.gx) / s.p.cell)), i1 = Math.min(s.nx - 1, Math.floor((bx1 - s.gx) / s.p.cell));
  const j0 = Math.max(0, Math.floor((bz0 - s.gz) / s.p.cell)), j1 = Math.min(s.nz - 1, Math.floor((bz1 - s.gz) / s.p.cell));
  const film = baseMass(s) * s.p.residue;
  let took = 0;
  // buňka přejde do valu, jakmile hrana přejela její střed (každý střed leží právě v jednom pásu mezi
  // dvěma polohami hrany → výsledek nezávisí na délce kroku; opakované zahrnutí na hranici pásu nic
  // nepřidá, buňka už má jen film)
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (!isWorkCell(s, i, j) || !inQuad(q, cx(s, i), cz(s, j))) continue; // mimo dlažbu list jen tlačí val
    const k = idx(s, i, j);
    const take = Math.max(0, s.m[k] - film);
    s.m[k] -= take; took += take;
  }
  s.ridge += took; s.moved.swept += took;
  // za koncem dlažby: val se vytlačí na okraj (uloží se před hranu)
  if (!inRect(s.work, mid1.X, mid1.Z) && mid1.X > s.work.x1 && s.ridge > 0) {
    const out = s.ridge * Math.min(1, dist / 0.12);
    depositLine(s, A, B, fwd, out, 0.06); s.ridge -= out; s.moved.dumped += out;
  }
  // přebytek nad mez soudržnosti uniká do stran (za konce listu)
  const cap = 1.2 + 3.5 * s.p.cohesion; // kg, které val udrží před listem
  if (s.ridge > cap) {
    const spill = (s.ridge - cap) * Math.min(1, dist * (1.6 - s.p.cohesion));
    const side = { X: (B.X - A.X), Z: (B.Z - A.Z) }, L = Math.hypot(side.X, side.Z) || 1;
    const e = 0.13 / L, f = 0.04; // padá vedle konců listu, mírně vpřed (vzniká boční val podél stopy)
    deposit(s, A.X - side.X * e + fwd.X * f, A.Z - side.Z * e + fwd.Z * f, spill / 2, 0.045);
    deposit(s, B.X + side.X * e + fwd.X * f, B.Z + side.Z * e + fwd.Z * f, spill / 2, 0.045);
    s.ridge -= spill; s.moved.spilled += spill;
  }
  return took;
}

/** List se zvedá bez nabrání: val zůstane ležet jako navršený pás těsně před hranou. */
export function dropRidge(s: SnowState, fwd: World): void {
  if (s.edge && s.ridge > 0) depositLine(s, s.edge.A, s.edge.B, fwd, s.ridge, 0.07);
  s.ridge = 0; s.edge = null;
}
/** List opouští zem (val už je prázdný nebo nabraný). */
export function liftBlade(s: SnowState, fwd: World): void { dropRidge(s, fwd); }

/** Nabrání: list zajede pod val – na list přejde jen to, co odpovídá jeho objemu a limitu. */
export function scoop(s: SnowState): number {
  const cap = Math.min(s.p.bladeVolume * s.p.ridgeDensity, s.p.massLimit) - s.blade;
  const take = Math.max(0, Math.min(s.ridge, cap));
  s.ridge -= take; s.blade += take; s.moved.scooped += take;
  return take;
}
/** Drobné odpadnutí z listu (zdvih, náklon) – na zem pod list. */
export function spillFromBlade(s: SnowState, mass: number, X: number, Z: number): void {
  const m = Math.min(s.blade, mass);
  if (m <= 0) return;
  s.blade -= m; deposit(s, X, Z, m, 0.05); s.moved.spilled += m;
}

/**
 * Odhoz: z listu se uvolní náklad kromě přilnavé části. Několik nepravidelných shluků startuje
 * z oblasti listu (P0) s rychlostí listu (v); rozptyl je malá odchylka (deterministická z `seed`).
 */
export function release(s: SnowState, P0: World & { H: number }, v: World & { H: number }, now: number, seed: number): number {
  const mass = s.blade * (1 - s.p.adhesion);
  if (mass <= 1e-6) return 0;
  const n = 3 + (seed % 3);
  const w = Array.from({ length: n }, (_, k) => 0.6 + frac(seed * 0.618 + k * 0.371));
  const W = w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < n; k++) {
    const j = (a: number) => (frac(seed * 0.13 + k * 0.77 + a) - 0.5) * 2;
    s.air.push({ id: s.nextClump++, X: P0.X + j(0.1) * 0.05, Z: P0.Z + j(0.2) * 0.05, H: P0.H + j(0.3) * 0.03,
      vX: v.X * (1 + j(0.4) * 0.08), vZ: v.Z * (1 + j(0.5) * 0.08) + j(0.6) * 0.12, vH: v.H * (1 + j(0.7) * 0.1), t0: now, mass: (mass * w[k]) / W });
  }
  s.blade -= mass; s.moved.thrown += mass;
  return mass;
}
const frac = (x: number) => x - Math.floor(x);

/** Poloha shluku v čase (balistika ve světě; výška H nad zemí). */
export function clumpAt(c: Clump, t: number): World & { H: number } {
  const u = t - c.t0;
  return { X: c.X + c.vX * u, Z: c.Z + c.vZ * u, H: c.H + c.vH * u - 0.5 * G * u * u };
}

/** Krok shluků: dopad na místní povrch (včetně výšky hromady) – hmotnost se uloží právě jednou. */
export function stepAir(s: SnowState, now: number): number {
  let landed = 0;
  const keep: Clump[] = [];
  for (const c of s.air) {
    const q = clumpAt(c, now);
    const ground = heightAt(s, q.X, q.Z);
    if (q.H > ground && now - c.t0 < 4) { keep.push(c); continue; }
    // dopad: krátké sklouznutí ve směru letu, pak uložení (bez odskoku)
    const vh = Math.hypot(c.vX, c.vZ) || 1;
    deposit(s, q.X + (c.vX / vh) * 0.04, q.Z + (c.vZ / vh) * 0.04, c.mass, 0.07);
    landed += c.mass; s.moved.landed += c.mass;
  }
  s.air = keep;
  return landed;
}

/** Sněžení: nová vrstva podle intenzity (kg/m²/s) a uplynulého času – jen na pracovní ploše. */
export function snowfall(s: SnowState, rate: number, dt: number): void {
  const add = rate * dt * cellArea(s);
  if (add <= 0) return;
  for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nx; i++) if (isWorkCell(s, i, j)) { s.m[idx(s, i, j)] += add; s.moved.snowed += add; }
}

// ------------------------------------------------------------------ ukládání na povrch
/** Rozdělí hmotnost do buněk kolem bodu (gaussovské váhy) a nechá ji sesednout podle sypného úhlu. */
export function deposit(s: SnowState, X: number, Z: number, mass: number, r: number): void {
  if (mass <= 0) return;
  const i0 = Math.floor((X - r * 2 - s.gx) / s.p.cell), i1 = Math.floor((X + r * 2 - s.gx) / s.p.cell);
  const j0 = Math.floor((Z - r * 2 - s.gz) / s.p.cell), j1 = Math.floor((Z + r * 2 - s.gz) / s.p.cell);
  const ws: [number, number][] = [];
  let W = 0;
  for (let j = Math.max(0, j0); j <= Math.min(s.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(s.nx - 1, i1); i++) {
    const d2 = (cx(s, i) - X) ** 2 + (cz(s, j) - Z) ** 2, w = Math.exp(-d2 / (r * r));
    if (w > 1e-3) { ws.push([idx(s, i, j), w]); W += w; }
  }
  if (!W) { // mimo mřížku: do nejbližší buňky (nic se neztratí)
    const i = Math.min(s.nx - 1, Math.max(0, Math.floor((X - s.gx) / s.p.cell))), j = Math.min(s.nz - 1, Math.max(0, Math.floor((Z - s.gz) / s.p.cell)));
    s.m[idx(s, i, j)] += mass; return;
  }
  for (const [k, w] of ws) s.m[k] += (mass * w) / W;
  relax(s, Math.max(0, i0 - 3), Math.min(s.nx - 1, i1 + 3), Math.max(0, j0 - 3), Math.min(s.nz - 1, j1 + 3));
}
function depositLine(s: SnowState, A: World, B: World, fwd: World, mass: number, ahead: number): void {
  const n = 5;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    deposit(s, A.X + (B.X - A.X) * t + fwd.X * ahead, A.Z + (B.Z - A.Z) * t + fwd.Z * ahead, mass / n, 0.05);
  }
}
/** Sesedání: rozdíl výšek sousedních buněk nad sypný úhel se vyrovná přesunem hmoty (lokálně). */
function relax(s: SnowState, i0: number, i1: number, j0: number, j1: number): void {
  const thr = Math.tan((s.p.repose * Math.PI) / 180) * s.p.cell, k = s.p.pileDensity * cellArea(s);
  const h = (i: number, j: number) => heightAt(s, cx(s, i), cz(s, j));
  for (let it = 0; it < 6; it++) {
    let moved = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= s.nx || b >= s.nz) continue;
      const d = h(i, j) - h(a, b);
      if (d <= thr) continue;
      if (!isWorkCell(s, i, j) && isWorkCell(s, a, b)) continue; // okraj dlažby drží hromadu (obrubník)
      const dm = Math.min(s.m[idx(s, i, j)], ((d - thr) / 2) * k * 0.5);
      if (dm <= 1e-9) continue;
      s.m[idx(s, i, j)] -= dm; s.m[idx(s, a, b)] += dm; moved = true;
    }
    if (!moved) break;
  }
}

/** Poloha buňky (pro vykreslení). */
export function cellCenter(s: SnowState, i: number, j: number): World { return { X: cx(s, i), Z: cz(s, j) }; }
export const cellMass = (s: SnowState, i: number, j: number) => s.m[idx(s, i, j)];
