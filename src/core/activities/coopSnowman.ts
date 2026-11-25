/**
 * Společná stavba sněhuláka rodičem a dítětem (zadání „Rodič a dítě staví sněhuláka“).
 *
 * Sdílený stav stavby (session.data) + rezervace (koule, předměty z košíku, prostor zvedání) – každý
 * účastník má vlastní úkol a kroky se řídí podmínkami (dojití, dosažená hmotnost, položená koule,
 * vyplněný spoj), ne časovačem. Souběžně:
 *   rodič válí spodní kouli × dítě dělá hlavu (nabere, uplácá, krátce uválí),
 *   rodič válí prostřední × dítě uhlazuje spodní kouli / nosí sníh / chystá ozdoby v košíku,
 *   rodič zvedá prostřední × dítě drží odstup mimo dráhu zvedání,
 *   dítě vyplní spoj (nanesený sníh) × rodič čeká na hlavu,
 *   předání hlavy (přiblížení → obě ruce na kouli → převzetí → dítě pustí), jinak ji dítě položí
 *   a rodič zvedne,
 *   zdobení z košíku souběžně (vzít → nést → přiložit → pustit; dítě jen do výšky svého dosahu),
 *   odstoupení a radost, odchod.
 *
 * Materiál: vrstva sněhu 5 cm, 180 kg/m³ (9 kg/m²) v mřížce 5 cm (stav zóny – přetrvá i pro další
 * stavby). Koule vznikne nabráním (kotouč 14 cm) a roste jen sněhem z pásu pod sebou:
 * šířka styku w = 2·√(2rh − h²), hmotnost se přičte, r = ∛(3m / (4π·300 kg/m³)) (uplácaný sníh),
 * natočení += dráha / r. Hmotnost koulí + sníh ve spoji = sníh ubraný ze země (zachování hmoty).
 */
import type { ActivitySession, AgentState, SimState } from '../sim/types';
import type { ActivityZone } from '../model/types';
import type { SessionHost } from './snowman';
import { freeSnowmanSlot, snowmanSpot, snowmanZoneFree, gatherTime } from './snowman';
import { createSession, setSessionPhase } from '../sim/sessions';
import { cameraFor, toScreen, toWorld, type World } from '../scene/camera';
import type { Vec2 } from '../math/vec';
import { randRange } from '../math/rng';

// ---------------------------------------------------------------- materiál a rozměry
export const SNOW = { depth: 0.05, density: 180, packed: 300, cell: 0.05 } as const;
/** cílové průměry koulí (m): spodní 50 cm, prostřední 36 cm, hlava 24 cm */
export const COOP_DIAM: [number, number, number] = [0.5, 0.36, 0.24];
const SCOOP_R = 0.14; // nabrání: kotouč 14 cm
export const massOfR = (r: number) => (4 / 3) * Math.PI * r ** 3 * SNOW.packed;
export const rOfMass = (m: number) => Math.cbrt((3 * m) / (4 * Math.PI * SNOW.packed));
/** šířka pásu, ze kterého koule nabírá sníh (styk s vrstvou hloubky h) */
export const contactWidth = (r: number) => 2 * Math.sqrt(Math.max(0, 2 * r * SNOW.depth - SNOW.depth ** 2));
/** výška dosahu dítěte (m) – výš sahá jen rodič */
export const CHILD_REACH = 0.85;

export interface SnowField { gx: number; gz: number; nx: number; nz: number; m: number[]; removed: number }
export interface CBall {
  k: 0 | 1 | 2; X: number; Z: number; H: number; r: number; m: number; rot: number; dir: World;
  state: 'roll' | 'ground' | 'carried' | 'placed'; owner: string | null; target: number;
  /** dráha válení (agent), index a příznak doplňování */ path?: Vec2[];
}
export interface CTask { name: string; step: string; until?: number; item?: number; ball?: number; n?: number; n2?: number }
export interface BasketItem { kind: 'eyes' | 'nose' | 'scarf' | 'buttons'; h: number; state: 'basket' | 'carried' | 'placed'; owner: string | null }
export interface CoopData {
  coop: true; spot: Vec2; slot: number; objId: string; parent: string; child: string;
  balls: CBall[]; task: Record<string, CTask>; res: Record<string, string>;
  basket: { X: number; Z: number; items: BasketItem[]; ready: boolean };
  /** milníky (čas) */ done: Record<string, number>;
  /** sníh ve spoji a v náručí dítěte (kg) */ joint: number; carrySnow: number;
  handover?: { stage: 'approach' | 'contact' | 'transfer' | 'released' | 'putDown'; t0: number };
  log: string[];
  /** ubráno ze země před začátkem této stavby (pole zóny přetrvává) */ removed0: number;
}
const D = (s: ActivitySession) => s.data as unknown as CoopData;
const cam = (h: SessionHost) => cameraFor(h.project.scene);
const W2S = (h: SessionHost, w: World, H = 0) => toScreen(cam(h), w, H);
const S2W = (h: SessionHost, p: Vec2) => toWorld(cam(h), p);
const norm = (w: World): World => { const n = Math.hypot(w.X, w.Z) || 1; return { X: w.X / n, Z: w.Z / n }; };

// ---------------------------------------------------------------- sněhové pole zóny (přetrvá)
export function snowField(h: SessionHost, zone: ActivityZone): SnowField {
  const st = h.state as SimState & { snowFields?: Record<string, SnowField> };
  const all = (st.snowFields ??= {});
  if (all[zone.id]) return all[zone.id];
  const W = zone.bounds.map((p) => S2W(h, p));
  const x0 = Math.min(...W.map((w) => w.X)) - 1.2, x1 = Math.max(...W.map((w) => w.X)) + 1.2;
  const z0 = Math.min(...W.map((w) => w.Z)) - 1.6, z1 = Math.max(...W.map((w) => w.Z)) + 1.6;
  const nx = Math.ceil((x1 - x0) / SNOW.cell), nz = Math.ceil((z1 - z0) / SNOW.cell);
  const base = SNOW.depth * SNOW.density * SNOW.cell * SNOW.cell;
  const m = new Array(nx * nz).fill(-1); // −1 = mimo sníh (nikdy tu nebyl), 0 = odebráno
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const c = { X: x0 + (i + 0.5) * SNOW.cell, Z: z0 + (j + 0.5) * SNOW.cell };
    if (h.isSnow(W2S(h, c))) m[j * nx + i] = base;
  }
  return (all[zone.id] = { gx: x0, gz: z0, nx, nz, m, removed: 0 });
}
const fieldOf = (h: SessionHost, s: ActivitySession) => (h.state as SimState & { snowFields?: Record<string, SnowField> }).snowFields![s.zoneId!];
/** Ubere sníh z buněk, jejichž střed leží v kotouči (X,Z,R) – vrátí kg. */
function takeDisc(f: SnowField, X: number, Z: number, R: number): number {
  let got = 0;
  const i0 = Math.max(0, Math.floor((X - R - f.gx) / SNOW.cell)), i1 = Math.min(f.nx - 1, Math.floor((X + R - f.gx) / SNOW.cell));
  const j0 = Math.max(0, Math.floor((Z - R - f.gz) / SNOW.cell)), j1 = Math.min(f.nz - 1, Math.floor((Z + R - f.gz) / SNOW.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = f.gx + (i + 0.5) * SNOW.cell, cz = f.gz + (j + 0.5) * SNOW.cell;
    if ((cx - X) ** 2 + (cz - Z) ** 2 > R * R) continue;
    const k = j * f.nx + i; if (f.m[k] <= 0) continue; got += f.m[k]; f.m[k] = 0;
  }
  f.removed += got;
  return got;
}
/** Ubere sníh z pásu šířky w mezi A a B (buňky se středem v pásu). */
function takeStrip(f: SnowField, A: World, B: World, w: number): number {
  const L = Math.hypot(B.X - A.X, B.Z - A.Z); if (L < 1e-6) return 0;
  const ux = (B.X - A.X) / L, uz = (B.Z - A.Z) / L, hw = w / 2;
  const xs = [A.X, B.X], zs = [A.Z, B.Z];
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - hw - f.gx) / SNOW.cell)), i1 = Math.min(f.nx - 1, Math.floor((Math.max(...xs) + hw - f.gx) / SNOW.cell));
  const j0 = Math.max(0, Math.floor((Math.min(...zs) - hw - f.gz) / SNOW.cell)), j1 = Math.min(f.nz - 1, Math.floor((Math.max(...zs) + hw - f.gz) / SNOW.cell));
  let got = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * f.nx + i; if (f.m[k] <= 0) continue;
    const cx = f.gx + (i + 0.5) * SNOW.cell - A.X, cz = f.gz + (j + 0.5) * SNOW.cell - A.Z;
    const along = cx * ux + cz * uz, across = Math.abs(-cx * uz + cz * ux);
    if (along < 0 || along > L || across > hw) continue;
    got += f.m[k]; f.m[k] = 0;
  }
  f.removed += got;
  return got;
}

/** Nejbližší místo s nedotčeným sněhem (kotouč r celý plný) v okolí bodu – pro nabrání. */
function nearestFresh(f: SnowField, X: number, Z: number, r: number, minD = 0.6, maxD = 3): World | null {
  const full = SNOW.depth * SNOW.density * SNOW.cell * SNOW.cell * 0.99;
  const ok = (cx: number, cz: number) => { for (const [dx, dz] of [[0, 0], [r * 0.7, 0], [-r * 0.7, 0], [0, r * 0.7], [0, -r * 0.7]]) { const i = Math.floor((cx + dx - f.gx) / SNOW.cell), j = Math.floor((cz + dz - f.gz) / SNOW.cell); if (i < 0 || j < 0 || i >= f.nx || j >= f.nz || f.m[j * f.nx + i] < full) return false; } return true; };
  for (let d = minD; d <= maxD; d += 0.15) for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, cx = X + Math.cos(a) * d, cz = Z + Math.sin(a) * d; if (ok(cx, cz)) return { X: cx, Z: cz }; }
  return null;
}

/** Kolik sněhu (kg) leží na přímce délky L ve směru u (vzorkování po 5 cm). */
function freshAlong(f: SnowField, P: World, u: World, L: number): number {
  let s = 0; for (let d = 0.2; d <= L; d += 0.05) { const i = Math.floor((P.X + u.X * d - f.gx) / SNOW.cell), j = Math.floor((P.Z + u.Z * d - f.gz) / SNOW.cell); if (i >= 0 && j >= 0 && i < f.nx && j < f.nz) s += Math.max(0, f.m[j * f.nx + i]); }
  return s;
}

/** Délka válení potřebná pro cílovou hmotnost (čerstvý sníh) – numericky. */
export function rollLengthFor(m0: number, target: number): number {
  let m = m0, L = 0; const dl = 0.01, per = SNOW.depth * SNOW.density;
  while (m < target && L < 40) { m += per * contactWidth(rOfMass(m)) * dl; L += dl; }
  return L;
}

// ---------------------------------------------------------------- místa tvoření koulí
/**
 * Koule se tvoří na místě (žádné válení po sněhu): [místo postavy, místo koule]. Postava stojí / klečí
 * na straně ke kameře a pracuje zády k obrazu. Spodní koule vzniká přímo na místě sněhuláka, prostřední
 * vedle vpravo, hlavu dělá dítě vlevo vpředu.
 */
function lanePath(h: SessionHost, d: CoopData, k: 0 | 1 | 2, zone: ActivityZone): Vec2[] {
  void zone;
  const S = S2W(h, d.spot), rF = COOP_DIAM[k] / 2;
  const goal: World = k === 0 ? S : k === 1 ? { X: S.X + 0.85, Z: S.Z + 0.15 } : { X: S.X - 0.9, Z: S.Z - 0.85 };
  // blíž ke kameře a kousek stranou: zády (3/4) k obrazu, koule zůstane vidět vedle postavy
  const side = k === 2 ? -1 : 1, work: World = { X: goal.X + side * (rF * 0.8 + 0.06), Z: goal.Z - (rF + (k === 0 ? 0.32 : 0.28)) };
  return [W2S(h, work), W2S(h, goal)];
}
/** doba tvoření koule (s) a sběr sněhu z okolí (kotouč 12 cm, mezikruží 0,45–1,3 m kolem koule) */
const FORM_T: [number, number, number] = [42, 28, 22];
const GATHER_R = 0.12;
const scoopMass = () => Math.PI * SCOOP_R * SCOOP_R * SNOW.depth * SNOW.density;

// ---------------------------------------------------------------- založení
export function startCoopSnowman(h: SessionHost, zone: ActivityZone, parent: AgentState, child: AgentState): ActivitySession | null {
  if (snowmanZoneFree(h, zone) || parent.holding || child.holding) return null;
  const now = h.time(), slot = freeSnowmanSlot(h, zone) ?? 0, spot = snowmanSpot(zone, slot);
  const field = snowField(h, zone);
  const S = S2W(h, spot);
  const n = (h.state.runtimeObjects?.length ?? 0) + Math.floor(now);
  const data: CoopData = {
    coop: true, spot, slot, objId: `snowman_${zone.id}_${slot}_${n}`, parent: parent.id, child: child.id,
    balls: [], task: { [parent.id]: { name: 'go', step: 'walk' }, [child.id]: { name: 'go', step: 'walk' } }, res: {},
    // košík s ozdobami stranou vlevo vpředu (výška = kde se ozdoba přikládá)
    basket: { X: S.X - 1.25, Z: S.Z - 0.2, ready: false, items: [] }, done: {}, joint: 0, carrySnow: 0, log: [], removed0: field.removed,
  };
  const s = createSession(h.state, h.res, {
    type: 'snowman', zoneId: zone.id, participantIds: [parent.id, child.id], roles: { [parent.id]: 'parent', [child.id]: 'child' },
    keys: [`zone:${zone.id}`], now, deadline: now + 60 + gatherTime(h, [parent, child], spot), seed: h.project.seed, phase: 'gather',
    data: data as unknown as Record<string, unknown>,
  });
  if (!s) return null;
  for (const x of [parent, child]) {
    x.activity = { type: 'snowman', zoneId: zone.id, source: 'auto', sourceId: null, phase: 'gather', phaseStart: now, data: { sessionId: s.id } };
    x.pendingActivity = null; x.follow = null;
  }
  h.goTo(parent, lanePath(h, data, 0, zone)[0], 'ke stavbě sněhuláka');
  h.goTo(child, lanePath(h, data, 2, zone)[0], 'ke stavbě sněhuláka');
  h.log(`${parent.name} a ${child.name} jdou spolu stavět sněhuláka.`, parent.id);
  return s;
}

// ---------------------------------------------------------------- pomocné
function reserve(d: CoopData, key: string, who: string): boolean { if (d.res[key] && d.res[key] !== who) return false; d.res[key] = who; return true; }
function release(d: CoopData, key: string, who: string) { if (d.res[key] === who) delete d.res[key]; }
const say = (h: SessionHost, d: CoopData, msg: string) => { d.log.push(`${h.time().toFixed(1)} ${msg}`); if (d.log.length > 40) d.log.shift(); };
function snowmanObj(h: SessionHost, d: CoopData) { return h.state.runtimeObjects?.find((o) => o.id === d.objId); }
/** výška horní plochy stavby (m) */
function topOf(h: SessionHost, d: CoopData): number { const o = snowmanObj(h, d); if (!o) return 0; const [r0, r1, r2] = o.radii; return 2 * r0 * 0.92 + (r1 ? 2 * r1 * 0.92 : 0) + (r2 ? 2 * r2 * 0.9 : 0); }
function heading(h: SessionHost, a: AgentState): World { const g = a.groundHeading; return g === undefined ? { X: 1, Z: 0 } : { X: Math.cos(g), Z: Math.sin(g) }; }
/** koule v náručí: před tělem ve výšce hrudi (dítě níž) */
function carryPos(h: SessionHost, a: AgentState, b: CBall, child: boolean): World & { H: number } {
  const P = S2W(h, a.pos), f = heading(h, a);
  return { X: P.X + f.X * (0.22 + b.r), Z: P.Z + f.Z * (0.22 + b.r), H: child ? 0.62 : 0.98 };
}
/** koule tlačená před postavou: roste a otáčí se jen podle skutečně ujeté dráhy po sněhu */
function pushBall(h: SessionHost, f: SnowField, b: CBall, a: AgentState) {
  const P = S2W(h, a.pos), v = a.vel;
  if (v && Math.hypot(v.X, v.Z) > 0.05) b.dir = norm({ X: v.X, Z: v.Z });
  const want = { X: P.X + b.dir.X * (0.3 + b.r), Z: P.Z + b.dir.Z * (0.3 + b.r) };
  const step = Math.hypot(want.X - b.X, want.Z - b.Z);
  if (step > 1e-4 && step < 0.5) {
    const got = takeStrip(f, { X: b.X, Z: b.Z }, want, contactWidth(b.r));
    b.m += got; b.r = rOfMass(b.m); b.rot += step / b.r;
  }
  b.X = want.X; b.Z = want.Z; b.H = b.r;
}
const dist = (h: SessionHost, a: Vec2, b: Vec2) => { const A = S2W(h, a), B = S2W(h, b); return Math.hypot(A.X - B.X, A.Z - B.Z); };

// ---------------------------------------------------------------- krok
export function stepCoopSnowman(h: SessionHost, s: ActivitySession, zone: ActivityZone): 'running' | 'done' | 'aborted' {
  const now = h.time(), d = D(s);
  const P = h.agent(d.parent), C = h.agent(d.child);
  if (!P || !C || P.hidden || C.hidden) return 'aborted';
  if (s.phase === 'gather') {
    if (now > s.deadline) return 'aborted';
    if (h.moving(P) || h.moving(C)) return 'running';
    setSessionPhase(s, 'build', now);
    d.task[P.id] = { name: 'rollBase', step: 'scoop' }; d.task[C.id] = { name: 'makeHead', step: 'scoop' };
    startScoop(h, s, P, 0, zone); startScoop(h, s, C, 2, zone);
    return 'running';
  }
  stepParent(h, s, P, C, zone);
  stepChild(h, s, C, P, zone);
  // fáze session = souhrn (pro stavovou tabulku); konec po odchodu obou
  const phase = d.done.left ? 'done' : d.done.decorated ? 'admire' : d.done.headPlaced ? 'decorate' : d.done.middlePlaced ? 'joint' : d.done.basePlaced ? 'middle' : 'base';
  if (s.phase !== phase) setSessionPhase(s, phase, now);
  if (d.done.left) { const o = snowmanObj(h, d); if (o) o.stage = 'done'; return 'done'; }
  return 'running';
}

function startScoop(h: SessionHost, s: ActivitySession, a: AgentState, k: 0 | 1 | 2, zone: ActivityZone) {
  const d = D(s), f = fieldOf(h, s);
  reserve(d, `ball:${k}`, a.id);
  const path = lanePath(h, d, k, zone);
  const A = S2W(h, path[0]), B = S2W(h, path[1]), dir = norm({ X: B.X - A.X, Z: B.Z - A.Z });
  const X = B.X, Z = B.Z;
  const m = takeDisc(f, X, Z, SCOOP_R); // základ: uplácaná malá koule z nabraného sněhu
  d.balls = d.balls.filter((b) => b.k !== k);
  d.balls.push({ k, X, Z, H: rOfMass(m), r: rOfMass(m), m, rot: 0, dir, state: 'roll', owner: a.id, target: massOfR(COOP_DIAM[k] / 2), path: path.slice(1) });
  h.gesture(a, 'scoop', { dur: 1.9 });
  d.task[a.id].until = h.time() + 1.9; d.task[a.id].step = 'scoop'; d.task[a.id].ball = k;
  say(h, d, `${a.name}: začíná tvořit ${['spodní kouli', 'prostřední kouli', 'hlavu'][k]}`);
}

/**
 * Tvoření koule na místě: postava (zády ke kameře) klečí u spodní koule, u prostřední a hlavy stojí
 * v mírném předklonu; rukama přihrnuje a uplácává sníh z okolí. Koule roste podle skutečně
 * nabraného sněhu (podmínka hmotnosti, čas jen určuje tempo nabírání).
 */
function stepRoll(h: SessionHost, s: ActivitySession, a: AgentState, t: CTask): boolean {
  const d = D(s), f = fieldOf(h, s), b = d.balls.find((x) => x.k === t.ball)!;
  const now = h.time(), dt = 1 / 60;
  // zády k obrazu: natočení od kamery, s mírným pootočením ke kouli (v obraze pak zadní pohled)
  const face = () => { const P = S2W(h, a.pos), g = Math.atan2(b.Z - P.Z, b.X - P.X); a.turnTo = Math.PI / 2 + 0.3 * Math.sin(g - Math.PI / 2); a.look = null; };
  if (t.step === 'scoop') {
    if (now < t.until!) return false;
    t.step = 'push'; t.n = 0; t.until = now;
    a.anim.sit = { kind: b.k === 0 ? 'kneel' : 'bend', t: 0, dur: 1e6, w: 0 };
    return false;
  }
  if (t.step === 'push') {
    face();
    const w = a.anim.sit;
    if (w) { w.t += dt; w.w = Math.min(1, w.t / 0.9, Math.max(0, (w.dur - w.t) / 0.9)); }
    if (b.m < b.target) {
      // přihrnutí sněhu: jeden kotouč z okolí za takt (rychlost podle cílové doby), sníh ubraný ze země
      const per = Math.PI * GATHER_R * GATHER_R * SNOW.depth * SNOW.density, every = FORM_T[b.k] / Math.max(1, b.target / per);
      if (now - t.until! >= every) {
        t.until = now; t.n = (t.n ?? 0) + 1;
        let got = 0;
        for (let k = 0; k < 10 && got < 1e-4; k++) {
          const ang = (t.n * 2.399 + k * 1.1) % (2 * Math.PI), rr = 0.45 + ((t.n * 0.37 + k * 0.29) % 1) * (0.85 + k * 0.1);
          got = takeDisc(f, b.X + Math.cos(ang) * rr, b.Z + Math.sin(ang) * rr, GATHER_R);
        }
        if (got < 1e-4) b.target = b.m; // v okolí už sníh není: koule zůstane menší (hmota se nikdy nevytváří)
        b.m += got; b.r = rOfMass(b.m); b.H = b.r; b.rot += 0.04;
      }
      return false;
    }
    // hotovo: postava se zvedne (prolnutí 0,9 s), koule leží
    if (w && w.dur > w.t + 0.9) w.dur = w.t + 0.9;
    if (w && w.t < w.dur) return false;
    a.anim.sit = null; a.turnTo = null;
    b.state = 'ground'; b.H = b.r;
    return true;
  }
  return false;
}

function stepParent(h: SessionHost, s: ActivitySession, P: AgentState, C: AgentState, zone: ActivityZone) {
  const d = D(s), t = d.task[P.id], now = h.time();
  const o = () => snowmanObj(h, d);
  switch (t.name) {
    case 'rollBase': {
      if (!stepRoll(h, s, P, t)) return;
      const b = d.balls.find((x) => x.k === 0)!;
      // spodní koule je na místě: vzniká sněhulák (runtime objekt s kolizí)
      const sp = W2S(h, { X: b.X, Z: b.Z });
      (h.state.runtimeObjects ??= []).push({ id: d.objId, kind: 'snowman', zoneId: s.zoneId, x: sp.x, y: sp.y, radii: [b.r, 0, 0], stage: 'base', decorations: [], createdAt: now, seed: Math.floor(randRange(s.rng, 0, 1e6)), slot: d.slot, mass: b.m } as never);
      b.state = 'placed'; b.owner = null; release(d, 'ball:0', P.id); d.done.basePlaced = now;
      say(h, d, `${P.name}: spodní koule ${(2 * b.r * 100).toFixed(0)} cm, ${b.m.toFixed(1)} kg`);
      d.task[P.id] = { name: 'rollMiddle', step: 'go' };
      h.goTo(P, lanePath(h, d, 1, zone)[0], 'k prostřední kouli');
      return;
    }
    case 'rollMiddle': {
      if (t.step === 'go') { if (h.moving(P)) return; startScoop(h, s, P, 1, zone); return; }
      if (!stepRoll(h, s, P, t)) return;
      d.task[P.id] = { name: 'liftMiddle', step: 'approach' };
      return;
    }
    case 'liftMiddle': case 'liftHead': {
      const k = t.name === 'liftMiddle' ? 1 : 2, b = d.balls.find((x) => x.k === k)!, so = o()!;
      const site = S2W(h, { x: so.x, y: so.y });
      if (t.step === 'approach') {
        // prostor zvedání: rezervuje rodič; dítě se drží stranou
        if (!reserve(d, 'zone:lift', P.id)) return;
        const B = { X: b.X, Z: b.Z }, f = norm({ X: site.X - B.X, Z: site.Z - B.Z });
        h.goTo(P, W2S(h, { X: B.X - f.X * (0.28 + b.r) + 0.12, Z: B.Z - f.Z * (0.28 + b.r) - 0.25 }), 'ke kouli');
        t.step = 'walkTo'; return;
      }
      if (t.step === 'walkTo') { if (h.moving(P)) return; h.gesture(P, 'scoop', { dur: 1.4 }); t.step = 'grip'; t.until = now + 0.8; say(h, d, `${P.name}: přidřep, úchop koule (${b.m.toFixed(1)} kg)`); return; }
      if (t.step === 'grip') { if (now < t.until!) return; b.state = 'carried'; b.owner = P.id; t.step = 'raise'; t.until = now + 0.7; return; }
      if (t.step === 'raise') {
        const c = carryPos(h, P, b, false), u = Math.min(1, 1 - (t.until! - now) / 0.7);
        b.X = c.X; b.Z = c.Z; b.H = b.r + (c.H - b.r) * u * u * (3 - 2 * u);
        if (now < t.until!) return;
        h.gesture(P, 'push', { dur: 600 });
        // k místu položení: stát před stavbou (koule nad středem)
        const f = norm({ X: site.X - S2W(h, P.pos).X, Z: site.Z - S2W(h, P.pos).Z });
        h.walkPath(P, [W2S(h, { X: site.X - f.X * (0.3 + b.r), Z: site.Z - f.Z * (0.3 + b.r) })], 'nese kouli'); P.speedFactor = 0.45;
        t.step = 'carry'; return;
      }
      if (t.step === 'carry') {
        const c = carryPos(h, P, b, false); b.X = c.X; b.Z = c.Z; b.H = c.H;
        if (h.moving(P)) return;
        h.releaseWork(P); h.gesture(P, 'lift', { dur: 2.2 }); t.step = 'place'; t.until = now + 2.2;
        d.task[P.id].ball = k; (t as CTask & { from?: World & { H: number } }).from = { X: b.X, Z: b.Z, H: b.H };
        return;
      }
      if (t.step === 'place') {
        const fr = (t as CTask & { from?: World & { H: number } }).from!, u = Math.min(1, 1 - (t.until! - now) / 2.2);
        const topH = k === 1 ? 2 * so.radii[0] * 0.92 + b.r * 0.92 : 2 * so.radii[0] * 0.92 + 2 * so.radii[1] * 0.92 + b.r * 0.9;
        const e = Math.max(0, Math.min(1, (u - 0.2) / 0.6)), ee = e * e * (3 - 2 * e);
        b.X = fr.X + (site.X - fr.X) * ee; b.Z = fr.Z + (site.Z - fr.Z) * ee; b.H = fr.H + (topH - fr.H) * ee + Math.sin(Math.PI * ee) * 0.1;
        if (u < 1) return;
        so.radii[k] = b.r; so.stage = k === 1 ? 'middle' : 'head'; b.state = 'placed'; b.owner = null;
        (so as unknown as { mass: number }).mass += b.m;
        release(d, 'zone:lift', P.id); release(d, `ball:${k}`, P.id);
        d.done[k === 1 ? 'middlePlaced' : 'headPlaced'] = now;
        say(h, d, `${P.name}: ${k === 1 ? 'prostřední koule' : 'hlava'} položena`);
        h.goTo(P, W2S(h, { X: site.X + 0.75, Z: site.Z - 0.55 }), 'odstoupí');
        d.task[P.id] = k === 1 ? { name: 'waitHead', step: 'step' } : { name: 'decorate', step: 'pick' };
        return;
      }
      return;
    }
    case 'waitHead': {
      // čeká na vyplnění spoje a hlavu (předání, nebo ji dítě položí – pak ji zvedne sám)
      const so = o()!; P.look = { x: so.x, y: so.y - 50 };
      const head = d.balls.find((x) => x.k === 2);
      if (head && head.state === 'ground' && !head.owner && d.done.jointFilled && d.handover?.stage === 'putDown') { d.task[P.id] = { name: 'liftHead', step: 'approach' }; reserve(d, 'ball:2', P.id); return; }
      if (d.handover?.stage === 'released' && head?.owner === P.id) { d.task[P.id] = { name: 'liftHead', step: 'raise', until: now + 0.01 }; reserve(d, 'zone:lift', P.id); return; }
      return;
    }
    case 'decorate': case 'admire': case 'leave':
      stepDecorate(h, s, P, true);
      return;
  }
}

function stepChild(h: SessionHost, s: ActivitySession, C: AgentState, P: AgentState, zone: ActivityZone) {
  const d = D(s), t = d.task[C.id], now = h.time(), so = snowmanObj(h, d);
  const f = fieldOf(h, s);
  // odstup od prostoru zvedání (rezervuje rodič): dítě nesmí stát mezi koulí a stavbou
  if (d.res['zone:lift'] === P.id && so && !['handover', 'putDown'].includes(t.name)) {
    const site = S2W(h, { x: so.x, y: so.y }), Cw = S2W(h, C.pos);
    if (Math.hypot(Cw.X - site.X, Cw.Z - site.Z) < 1.05 && t.name !== 'keepClear') { d.task[C.id] = { name: 'keepClear', step: 'go', item: undefined }; h.goTo(C, W2S(h, { X: site.X - 1.35, Z: site.Z - 0.9 }), 'drží odstup'); say(h, d, `${C.name}: ustoupí z cesty`); return; }
  }
  switch (t.name) {
    case 'makeHead': {
      if (!stepRoll(h, s, C, t)) return;
      const b = d.balls.find((x) => x.k === 2)!; b.owner = C.id;
      say(h, d, `${C.name}: hlava ${(2 * b.r * 100).toFixed(0)} cm`);
      d.task[C.id] = { name: 'help', step: 'pick' };
      return;
    }
    case 'keepClear': {
      if (h.moving(C)) return;
      if (so) C.look = { x: so.x, y: so.y - 40 };
      if (d.res['zone:lift'] !== P.id) d.task[C.id] = { name: 'help', step: 'pick' };
      return;
    }
    case 'help': {
      // souběžné drobné úkoly podle stavu stavby (podmínky): spoj > přinést sníh > uhladit > chystat ozdoby
      if (t.step === 'pick') {
        if (d.done.middlePlaced && !d.done.jointFilled) {
          if (d.carrySnow < 0.3) { t.name = 'help'; t.step = 'fetchSnow'; }
          else { t.step = 'joint'; }
        } else if (d.done.headPlaced) { d.task[C.id] = { name: 'decorate', step: 'pick' }; return; }
        else if (d.done.jointFilled && d.balls.find((x) => x.k === 2)?.state === 'ground' && d.res['ball:2'] !== P.id) { d.task[C.id] = { name: 'handover', step: 'pickUp' }; return; }
        else if (d.done.jointFilled) { t.step = 'watch'; t.until = now + 1; if (so) C.look = { x: so.x, y: so.y - 40 }; return; }
        else if (d.carrySnow < 0.3 && d.done.basePlaced) t.step = 'fetchSnow';
        else if (d.done.basePlaced && !d.done.smoothed) t.step = 'smooth';
        else if (!d.basket.ready) t.step = 'basket';
        else { t.step = 'watch'; t.until = now + 1.5; }
        const site = so ? S2W(h, { x: so.x, y: so.y }) : S2W(h, d.spot);
        if (t.step === 'fetchSnow') {
          // nabere sníh vedle stavby (z neodklizeného místa) – poneseho na spoj
          const F = nearestFresh(f, site.X - 0.6, site.Z - 0.6, 0.18);
          if (!F) { t.step = 'watch'; t.until = now + 2; d.carrySnow = Math.max(d.carrySnow, 0.3); return; } // (bez sněhu okolo: spoj jen uplácá)
          // stát tak, aby nabíraný kotouč byl kousek před ním
          (t as CTask & { at?: World }).at = F;
          h.goTo(C, W2S(h, { X: F.X - 0.3, Z: F.Z - 0.12 }), 'pro sníh'); t.until = 0;
        } else if (t.step === 'smooth' || t.step === 'joint') h.goTo(C, W2S(h, { X: site.X - 0.5, Z: site.Z - 0.45 }), t.step === 'joint' ? 'k spoji' : 'uhlazuje');
        else if (t.step === 'basket') h.goTo(C, W2S(h, { X: d.basket.X + 0.35, Z: d.basket.Z - 0.2 }), 'chystá ozdoby');
        return;
      }
      if (h.moving(C)) return;
      if (t.step === 'fetchSnow') {
        if (!t.until) { h.gesture(C, 'scoop', { dur: 1.9 }); t.until = now + 1.9; const F = (t as CTask & { at?: World }).at!; d.carrySnow += takeDisc(f, F.X, F.Z, 0.18); d.done.fetch = (d.done.fetch ?? 0) + 1; say(h, d, `${C.name}: nese sníh (${d.carrySnow.toFixed(2)} kg)`); return; }
        if (now < t.until) return;
        t.step = 'pick'; return;
      }
      if (t.step === 'smooth' || t.step === 'joint') {
        if (!t.until) { h.gesture(C, 'decorate', { dur: 2.4, hand: 1, dirY: t.step === 'joint' ? -30 : -18 }); t.until = now + 2.4; if (so) C.look = { x: so.x, y: so.y - 30 }; return; }
        if (now < t.until) return;
        if (t.step === 'joint') { d.joint += d.carrySnow; if (so) (so as unknown as { mass: number }).mass += d.carrySnow; d.carrySnow = 0; d.done.jointFilled = now; say(h, d, `${C.name}: spoj vyplněn (${d.joint.toFixed(2)} kg)`); }
        else d.done.smoothed = now;
        t.step = 'pick'; t.until = 0; return;
      }
      if (t.step === 'basket') {
        if (!t.until) { h.gesture(C, 'scoop', { dur: 1.6 }); t.until = now + 1.6; return; }
        if (now < t.until) return;
        // ozdoby v košíku: dítě je rozloží (výška přiložení podle hotové stavby)
        d.basket.items = [
          { kind: 'buttons', h: 0.62, state: 'basket', owner: null }, { kind: 'scarf', h: 0.86, state: 'basket', owner: null },
          { kind: 'eyes', h: 0.98, state: 'basket', owner: null }, { kind: 'nose', h: 0.94, state: 'basket', owner: null },
        ];
        d.basket.ready = true; say(h, d, `${C.name}: ozdoby připravené v košíku`);
        t.step = 'pick'; t.until = 0; return;
      }
      if (t.step === 'watch') { if (so) C.look = { x: so.x, y: so.y - 40 }; if (now >= t.until!) t.step = 'pick'; return; }
      return;
    }
    case 'handover': {
      // předání hlavy: vzít ze země → donést k rodiči → obě ruce na kouli → převzetí → pustit;
      // když rodič není volný (nečeká), položí ji u stavby
      const b = d.balls.find((x) => x.k === 2)!;
      if (t.step === 'pickUp') {
        h.goTo(C, W2S(h, { X: b.X - heading(h, C).X * (0.25 + b.r), Z: b.Z - heading(h, C).Z * (0.25 + b.r) }), 'pro hlavu'); t.step = 'toBall'; return;
      }
      if (t.step === 'toBall') { if (h.moving(C)) return; h.gesture(C, 'scoop', { dur: 1.4 }); t.step = 'grip'; t.until = now + 0.8; return; }
      if (t.step === 'grip') { if (now < t.until!) return; b.state = 'carried'; b.owner = C.id; h.gesture(C, 'push', { dur: 600 }); t.step = 'carry'; const Pw = S2W(h, P.pos), Cw = S2W(h, C.pos); const m = { X: (Pw.X + Cw.X) / 2, Z: (Pw.Z + Cw.Z) / 2 }, dir = norm({ X: Pw.X - Cw.X, Z: Pw.Z - Cw.Z }); h.walkPath(C, [W2S(h, { X: Pw.X - dir.X * 0.75, Z: Pw.Z - dir.Z * 0.75 })], 'nese hlavu'); C.speedFactor = 0.6; void m; d.handover = { stage: 'approach', t0: now }; return; }
      if (t.step === 'carry') {
        const c = carryPos(h, C, b, true); b.X = c.X; b.Z = c.Z; b.H = c.H;
        if (h.moving(C)) return;
        if (d.task[P.id].name === 'waitHead' && !h.moving(P)) {
          // kontakt: obě postavy drží kouli (rodič přidá ruce), koule mezi nimi
          h.gesture(P, 'push', { dur: 600 }); P.look = { x: C.pos.x, y: C.pos.y - 30 }; C.look = { x: P.pos.x, y: P.pos.y - 50 };
          d.handover = { stage: 'contact', t0: now }; t.step = 'contact'; say(h, d, `${C.name} a ${P.name}: obě ruce na hlavě`); return;
        }
        if (now - d.handover!.t0 > 8) { t.step = 'putDown'; return; } // rodič není volný – položit
        return;
      }
      if (t.step === 'contact') {
        const Pw = S2W(h, P.pos), Cw = S2W(h, C.pos); b.X = (Pw.X + Cw.X) / 2; b.Z = (Pw.Z + Cw.Z) / 2; b.H = 0.62 + (0.98 - 0.62) * Math.min(1, (now - d.handover!.t0) / 0.8);
        if (now - d.handover!.t0 < 0.8) return;
        d.handover = { stage: 'transfer', t0: now }; b.owner = P.id; t.step = 'transfer'; return;
      }
      if (t.step === 'transfer') {
        const c = carryPos(h, P, b, false); b.X = c.X; b.Z = c.Z; b.H = c.H;
        if (now - d.handover!.t0 < 0.4) return;
        h.releaseWork(C); release(d, 'ball:2', C.id); reserve(d, 'ball:2', P.id);
        const Cw = S2W(h, C.pos);
        d.handover = { stage: 'released', t0: now }; say(h, d, `${C.name}: pustí hlavu, převzal ji ${P.name}`);
        h.goTo(C, W2S(h, { X: Cw.X - 0.6, Z: Cw.Z - 0.4 }), 'odstoupí');
        d.task[C.id] = { name: 'help', step: 'pick' };
        return;
      }
      if (t.step === 'putDown') {
        if (!t.until) { h.releaseWork(C); h.gesture(C, 'scoop', { dur: 1.4 }); t.until = now + 0.9; return; }
        if (now < t.until) { const c = carryPos(h, C, b, true), u = 1 - (t.until - now) / 0.9; b.X = c.X; b.Z = c.Z; b.H = c.H + (b.r - c.H) * u; return; }
        b.state = 'ground'; b.owner = null; b.H = b.r; release(d, 'ball:2', C.id);
        d.handover = { stage: 'putDown', t0: now }; say(h, d, `${C.name}: položí hlavu u stavby, zvedne ji ${P.name}`);
        d.task[C.id] = { name: 'help', step: 'pick' };
        return;
      }
      return;
    }
    case 'decorate': case 'admire': case 'leave':
      stepDecorate(h, s, C, false);
      return;
  }
}

/** Zdobení z košíku (souběžně, rezervace předmětů), pak odstoupit, radost a odchod. */
function stepDecorate(h: SessionHost, s: ActivitySession, a: AgentState, isParent: boolean) {
  const d = D(s), t = d.task[a.id], now = h.time(), so = snowmanObj(h, d)!;
  const site = S2W(h, { x: so.x, y: so.y }), B = { X: d.basket.X, Z: d.basket.Z };
  const reach = isParent ? 2 : CHILD_REACH;
  if (t.name === 'decorate') {
    if (t.step === 'pick') {
      if (!d.basket.ready) { // ozdoby ještě nikdo nepřipravil: připraví ten, kdo je u toho
        if (reserve(d, 'basket:prep', a.id)) { d.basket.items = [{ kind: 'buttons', h: 0.62, state: 'basket', owner: null }, { kind: 'scarf', h: 0.86, state: 'basket', owner: null }, { kind: 'eyes', h: 0.98, state: 'basket', owner: null }, { kind: 'nose', h: 0.94, state: 'basket', owner: null }]; d.basket.ready = true; }
        return;
      }
      // rodič bere hlavně ozdoby mimo dosah dítěte (nejvýš položené), dítě ty nízké
      const order = d.basket.items.map((it, k) => ({ it, k })).filter((q) => q.it.state === 'basket' && q.it.h <= reach && !d.res[`item:${q.k}`]).sort((p, q) => (isParent ? q.it.h - p.it.h : p.it.h - q.it.h));
      const i = order.length && reserve(d, `item:${order[0].k}`, a.id) ? order[0].k : -1;
      if (i < 0) {
        if (d.basket.items.every((it) => it.state === 'placed')) { d.done.decorated ??= now; d.task[a.id] = { name: 'admire', step: 'back' }; }
        else if (h.moving(a)) return; else a.look = { x: so.x, y: so.y - 50 };
        return;
      }
      t.item = i; t.step = 'toBasket'; d.basket.items[i].owner = a.id;
      h.goTo(a, W2S(h, { X: B.X + (isParent ? 0.4 : 0.3), Z: B.Z + (isParent ? 0.25 : -0.25) }), 'ke košíku');
      return;
    }
    const it = d.basket.items[t.item!];
    if (t.step === 'toBasket') { if (h.moving(a)) return; h.gesture(a, 'scoop', { dur: 1.2 }); t.step = 'grab'; t.until = now + 0.7; return; }
    if (t.step === 'grab') { if (now < t.until!) return; it.state = 'carried'; say(h, d, `${a.name}: bere ${LABEL[it.kind]}`); t.step = 'carry';
      const side = isParent ? 1 : -1; h.goTo(a, W2S(h, { X: site.X + side * 0.32, Z: site.Z - 0.48 }), 'nese ozdobu'); return; }
    if (t.step === 'carry') { if (h.moving(a)) return; a.look = { x: so.x, y: so.y - 50 }; h.gesture(a, 'decorate', { dur: 2.2, hand: 0, dirY: -18 - it.h * 22 }); t.step = 'attach'; t.until = now + 1.1; return; }
    if (t.step === 'attach') {
      if (now < t.until!) return;
      it.state = 'placed'; so.decorations.push(it.kind); release(d, `item:${t.item}`, a.id);
      if (so.decorations.length >= 3 && so.stage !== 'done') so.stage = 'decorated';
      say(h, d, `${a.name}: ${LABEL[it.kind]} na sněhulákovi (${(it.h * 100).toFixed(0)} cm)`);
      t.step = 'release'; t.until = now + 0.6; return;
    }
    if (t.step === 'release') { if (now < t.until!) return; t.step = 'pick'; t.item = undefined; return; }
    return;
  }
  if (t.name === 'admire') {
    if (t.step === 'back') { const side = isParent ? 1 : -1; h.goTo(a, W2S(h, { X: site.X + side * 0.7, Z: site.Z - 1.6 }), 'odstoupí a prohlíží'); t.step = 'walk'; return; }
    if (t.step === 'walk') { if (h.moving(a)) return; a.look = { x: so.x, y: so.y - 50 }; h.gesture(a, isParent ? 'open' : 'catch', { dur: 2.6 }); t.step = 'react'; t.until = now + 4; return; }
    if (t.step === 'react') { if (now < t.until!) return; t.step = 'ready'; d.done[`ready_${a.id}`] = now; return; }
    if (t.step === 'ready') { if (Object.keys(d.done).filter((k) => k.startsWith('ready_')).length >= 2) { d.done.left = now; } return; }
  }
}
const LABEL: Record<BasketItem['kind'], string> = { eyes: 'oči', nose: 'nos', scarf: 'šálu', buttons: 'knoflíky' };

/** Rozpracované koule (pro vykreslení). */
export function coopBalls(st: SimState): { X: number; Z: number; H: number; r: number; rot: number }[] {
  const out: { X: number; Z: number; H: number; r: number; rot: number }[] = [];
  for (const s of st.sessions ?? []) { const d = s.data as unknown as CoopData; if (!d?.coop) continue; for (const b of d.balls) if (b.state !== 'placed') out.push({ X: b.X, Z: b.Z, H: b.H, r: b.r, rot: b.rot }); }
  return out;
}
/** Bilance hmoty: ubráno ze země vs. koule + spoj + sníh v náručí (kg). */
export function coopMassBalance(st: SimState, s: ActivitySession): { removed: number; inBalls: number; joint: number; carried: number } {
  const d = s.data as unknown as CoopData, f = (st as SimState & { snowFields?: Record<string, SnowField> }).snowFields?.[s.zoneId!];
  return { removed: (f?.removed ?? 0) - d.removed0, inBalls: d.balls.reduce((q, b) => q + b.m, 0), joint: d.joint, carried: d.carrySnow };
}
