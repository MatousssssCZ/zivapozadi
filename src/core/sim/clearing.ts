/**
 * Odklízení sněhu (balíček „živá pozadí“, A11) – postava, lopata a sníh jako jeden propojený systém.
 *
 * Řízení je stavový automat fází s počátečními časy podle zadání (příprava 0,6 s, nasazení 0,5 s,
 * hrnutí ~2,2 s, nabrání 0,6 s, zdvih 0,9 s, natočení 0,7 s, odhoz 0,7 s, návrat 1,8 s); fáze
 * končí i podmínkou (konec pruhu, limit valu, překážka). Lopata je tuhý nástroj: řízení určuje jen
 * polohu pracovní hrany v rovině chůze (`AnimState.tool`), kostra dopočítá natočení násady a ruce
 * drží úchopy (skeleton.solveShovel). Pohyb těla jde výhradně skutečnými kroky (trasa → chůze
 * s kotvenými chodidly); natočení k hromadě je přešlápnutí, ne rotace v pase.
 *
 * Sníh: materiálový model `snowMaterial.ts` (povrch → val → list → vzduch → hromada / okraj),
 * hrnutí zpracovává plochu, kterou hrana skutečně prošla. Události (nabrání, uvolnění, oklepnutí)
 * se spouštějí při překročení okamžiku a jsou jištěné příznakem – proběhnou právě jednou.
 * Variace se losují jednou za záběr/událost ze seedu (hashNoise) – reprodukovatelné.
 */
import type { Vec2 } from '../math/vec';
import type { AgentState } from './types';
import type { ProjectFile } from '../model/types';
import type { ToolPose } from '../anim/animator';
import { cameraFor, toWorld, toScreen, type World } from '../scene/camera';
import { hashNoise } from '../math/rng';
import { createSnow, sweep, scoop, liftBlade, release, stepAir, spillFromBlade, snowfall, remainingIn, baseMass, total, DEFAULT_SNOW, type SnowState, type SnowParams } from './snowMaterial';

export type ClearPhase = 'offstage' | 'arrive' | 'prep' | 'plant' | 'push' | 'regrip' | 'rest' | 'scoop' | 'lift' | 'turn' | 'throw' | 'knock' | 'return' | 'inspect' | 'done' | 'leave' | 'hold';

export interface ClearingState {
  phase: ClearPhase; t0: number; dur: number; until: number; n: number;
  lane: number; strokes: number; sinceRest: number; restAt: number; cleanups: number[];
  snow: SnowState | null;
  /** póza nástroje: výchozí, cílová a způsob průběhu (různé křivky pro naložený zdvih, odhoz, návrat) */
  from: ToolPose; to: ToolPose; ease: 'smooth' | 'loaded' | 'throw' | 'relaxed';
  /** odhoz: amplituda vpřed/vzhůru (m), čas uvolnění (podíl fáze), příznaky událostí */
  throwA: number; throwH: number; flags: Record<string, boolean>;
  /** kde pokračovat po odhozu (hrana, svět) */ resumeX: number | null;
  /** jednorázové spuštění cyklu z ladění (po dokončení „hold“) */ single?: boolean;
  doneAt: number | null; blockedT: number;
  stats: { pushes: number; scoops: number; throws: number; releases: number; pushOffs: number; knocks: number };
}

export interface ClearingConfig {
  workerId: string;
  /** odklízená plocha ve světě (m): X podél pruhů (hrne se k +X), Z napříč */ work: { x0: number; x1: number; z0: number; z1: number };
  /** hromada u okraje (svět, m) */ pileAt: { X: number; Z: number };
  enter: Vec2; approach?: Vec2[]; firstDelay?: number; snow?: Partial<SnowParams>;
}

export interface ClearingHost {
  project: ProjectFile; time(): number;
  worker(): AgentState | undefined;
  others(): AgentState[];
  walkPath(a: AgentState, pts: Vec2[], speed: number): void;
  hide(a: AgentState): void;
  show(a: AgentState, p: Vec2): void;
  giveShovel(a: AgentState, on: boolean): void;
  puff(X: number, Z: number, H: number, n: number): void;
  log(msg: string, id?: string): void;
}

// ------------------------------------------------------------------ pózy nástroje (m, rad)
const P = {
  carry: { u: 0.75, h: 0.32, beta: 0.35, crouch: 0, lean: 0.08 },
  ready: { u: 1.0, h: 0.06, beta: -0.3, crouch: 0.28, lean: 0.5 },
  plant: { u: 1.0, h: 0, beta: -0.32, crouch: 0.35, lean: 0.7 },
  scoop: { u: 1.1, h: 0, beta: -0.27, crouch: 0.68, lean: 0.9 },
  lifted: { u: 0.85, h: 0.45, beta: 0.05, crouch: 0.2, lean: 0.35 },
  rest: { u: 0.95, h: 0, beta: -0.1, crouch: 0.05, lean: 0.1 },
} satisfies Record<string, ToolPose>;
export const TIMES = { prep: 0.6, plant: 0.5, push: 2.2, scoop: 0.6, lift: 0.9, turn: 0.7, throw: 0.7, ret: 1.8, regrip: 0.45, knock: 0.5 };
const SCOOP_AT = 1.3; // kg ve valu, od kterých se vyplatí nabrat a odhodit
const MAX_THROW = 1.7; // m – dál od hromady nejdřív dojde blíž

const lerpPose = (a: ToolPose, b: ToolPose, k: number): ToolPose => ({ u: a.u + (b.u - a.u) * k, h: a.h + (b.h - a.h) * k, beta: a.beta + (b.beta - a.beta) * k, crouch: a.crouch + (b.crouch - a.crouch) * k, lean: a.lean + (b.lean - a.lean) * k });
const smooth = (x: number) => x * x * (3 - 2 * x);
/** Průběh fáze: naložený zdvih pomalu nabírá rychlost, návrat prázdné lopaty je uvolněný (rychlý start, dlouhé dojetí). */
function easeOf(kind: ClearingState['ease'], s: number): number {
  s = Math.max(0, Math.min(1, s));
  if (kind === 'loaded') return smooth(s ** 1.4); // pomalý (zatížený) rozjezd, plynulé dojetí
  if (kind === 'relaxed') return 1 - (1 - s) ** 2.6;
  return smooth(s);
}
/** Odhoz: zrychlení do uvolnění (s = 0,5), pak doběh a zabrzdění. f(0,5) = 0,6; f'(0,5) = 2,4. */
export const throwF = (s: number) => (s < 0.5 ? 0.6 * (s / 0.5) ** 2 : 0.6 + 0.4 * (1 - (1 - (s - 0.5) / 0.5) ** 2));
const RELEASE_S = 0.5;

export function newClearingState(firstDelay = 90): ClearingState {
  return { phase: 'offstage', t0: 0, dur: 0, until: firstDelay, n: 0, lane: 0, strokes: 0, sinceRest: 0, restAt: 5, cleanups: [], snow: null,
    from: { ...P.carry }, to: { ...P.carry }, ease: 'smooth', throwA: 0, throwH: 0.35, flags: {}, resumeX: null, doneAt: null, blockedT: 0,
    stats: { pushes: 0, scoops: 0, throws: 0, releases: 0, pushOffs: 0, knocks: 0 } };
}
/** Explicitní reset testovací situace (sníh znovu na celé ploše, postava mimo scénu). Není součástí cyklu. */
export function resetClearing(st: ClearingState, cfg: ClearingConfig, now: number, single = false): void {
  const fresh = newClearingState(0);
  Object.assign(st, fresh, { until: now, snow: makeSnow(cfg), single });
}
function makeSnow(cfg: ClearingConfig): SnowState {
  const pile = { x0: cfg.pileAt.X - 0.5, x1: cfg.pileAt.X + 0.5, z0: cfg.pileAt.Z - 0.5, z1: cfg.pileAt.Z + 0.5 };
  return createSnow(cfg.work, pile, { ...DEFAULT_SNOW, ...(cfg.snow ?? {}) });
}

const U = (seed: number, n: number, k: number) => hashNoise(seed, 9500 + n, k);
export const laneCenters = (cfg: ClearingConfig, bw: number): number[] => {
  const w = cfg.work, span = w.z1 - w.z0 - bw, n = Math.max(1, Math.ceil(span / (bw * 0.92)) + 1);
  return Array.from({ length: n }, (_, i) => w.z0 + bw / 2 + (n === 1 ? span / 2 : (span * i) / (n - 1)));
};

/** Aktuální poloha pracovní hrany (svět) a směr vpřed postavy. */
export function edgeOf(cam: ReturnType<typeof cameraFor>, a: AgentState, u: number, bw: number): { A: World; B: World; C: World; fwd: World } {
  const W = toWorld(cam, a.pos), h = a.groundHeading ?? 0, f = { X: Math.cos(h), Z: Math.sin(h) }, n = { X: -f.Z, Z: f.X };
  const C = { X: W.X + f.X * u, Z: W.Z + f.Z * u };
  return { A: { X: C.X - n.X * bw / 2, Z: C.Z - n.Z * bw / 2 }, B: { X: C.X + n.X * bw / 2, Z: C.Z + n.Z * bw / 2 }, C, fwd: f };
}

export function stepClearing(h: ClearingHost, st: ClearingState): void {
  const cfg = h.project.clearing as unknown as ClearingConfig, now = h.time(), a0 = h.worker();
  if (!a0) return;
  const a: AgentState = a0;
  const cam = cameraFor(h.project.scene), seed = h.project.seed;
  st.snow ??= makeSnow(cfg);
  const snow = st.snow, bw = snow.p.bladeWidth, lanes = laneCenters(cfg, bw);
  const dt = 1 / 60;
  // sněžení: nová vrstva podle intenzity a času (jen při sněžení scény)
  if (h.project.scene.snowfall.enabled && Math.floor(now) !== Math.floor(now - dt)) snowfall(snow, 2.8e-4 * (h.project.scene.snowfall.density / 0.5), 1);
  stepAir(snow, now); // shluky ve vzduchu doletí i po odchodu postavy

  const s = st.dur > 0 ? (now - st.t0) / st.dur : 1;
  const tool: ToolPose = st.phase === 'throw' ? throwPose(st, s) : lerpPose(st.from, st.to, easeOf(st.ease, s));
  tool.load = snow.blade;
  if (!a.hidden) a.anim.tool = tool; else a.anim.tool = null;
  const go = (phase: ClearPhase, dur: number, to?: ToolPose, ease: ClearingState['ease'] = 'smooth') => {
    st.from = { ...tool }; delete st.from.load; st.to = to ? { ...to } : { ...st.from };
    st.phase = phase; st.t0 = now; st.dur = dur; st.ease = ease; st.flags = {};
  };
  const E = () => edgeOf(cam, a, tool.u, bw);
  const W = () => toWorld(cam, a.pos);
  const laneZ = lanes[Math.min(st.lane, lanes.length - 1)];
  /** dojít na start pruhu tak, aby hrana byla v X a postava mířila k +X (poslední úsek vpřed) */
  const walkToEdgeAt = (X: number, Z: number, speed = 0.9) => {
    const bodyX = X - P.plant.u;
    h.walkPath(a, [toScreen(cam, { X: bodyX - 0.45, Z }), toScreen(cam, { X: bodyX, Z })], speed);
  };
  // kontakt listu: hrana se hýbe po zemi → přesun sněhu podle skutečně projeté plochy
  const contact = tool.h <= 0.003 && (st.phase === 'push' || st.phase === 'regrip' || st.phase === 'rest' || st.phase === 'scoop' || (st.phase === 'plant' && s >= 1));
  if (contact) { const e = E(); sweep(snow, e.A, e.B, e.fwd); }
  // průchod člověka: práce se pozastaví (krátce)
  const near = h.others().some((o) => { if (o.hidden) return false; const O = toWorld(cam, o.pos), B = W(), e = E().C; return Math.hypot(O.X - B.X, O.Z - B.Z) < 1.3 || Math.hypot(O.X - e.X, O.Z - e.Z) < 0.9; });
  const pausable = st.phase === 'push' || st.phase === 'throw' || st.phase === 'turn';
  if (near && pausable && st.blockedT < 8) {
    st.blockedT += dt; st.t0 += dt; a.speedFactor = 0; a.status = 'Čeká, až kolemjdoucí projde';
    return;
  }
  if (!near) st.blockedT = 0;
  if (pausable && a.speedFactor === 0) a.speedFactor = st.phase === 'push' ? pushSpeed(snow) : 0.6;

  switch (st.phase) {
    case 'offstage': {
      if (!a.hidden) h.hide(a);
      if (now < st.until) return;
      // start jen tehdy, je-li co odklízet (žádné nekonečné odhrnování prázdné plochy)
      if (remainingIn(snow, cfg.work.z0, cfg.work.z1) < 0.25 * baseMass(snow) * ((cfg.work.x1 - cfg.work.x0) * (cfg.work.z1 - cfg.work.z0)) / (snow.p.cell ** 2)) { st.until = now + 60; return; }
      st.lane = 0; st.strokes = 0; st.sinceRest = 0; st.cleanups = lanes.map(() => 0); st.resumeX = null;
      h.show(a, cfg.enter); h.giveShovel(a, true);
      st.from = { ...P.carry }; st.to = { ...P.carry };
      const startX = cfg.work.x0 - 0.02;
      h.walkPath(a, [...(cfg.approach ?? []), toScreen(cam, { X: startX - P.plant.u - 0.45, Z: lanes[0] }), toScreen(cam, { X: startX - P.plant.u, Z: lanes[0] })], 0.9);
      go('arrive', 0, P.carry);
      h.log(`${a.name} jde odhrnout sníh.`, a.id);
      return;
    }
    case 'arrive': {
      a.status = 'Jde odhrnout sníh';
      if (a.route) return;
      go('prep', TIMES.prep * jit(seed, st, 1), P.ready);
      return;
    }
    case 'prep': {
      a.status = 'Chystá se k práci'; a.look = lookAhead(cam, a, 1.4);
      if (s < 1) return;
      go('plant', TIMES.plant * jit(seed, st, 2), P.plant);
      return;
    }
    case 'plant': {
      a.status = 'Nasazuje lopatu';
      if (s < 1) return;
      snow.edge = null; { const e = E(); sweep(snow, e.A, e.B, e.fwd); } // začátek kontaktu (bez přesunu)
      startPush(); return;
    }
    case 'push': {
      a.status = 'Hrne sníh';
      a.look = lookAhead(cam, a, 1.6);
      a.speedFactor = pushSpeed(snow); // větší odpor → pomalejší hrnutí
      if (a.route) return;
      st.strokes++; st.sinceRest++; st.stats.pushes++;
      decide(); return;
    }
    case 'regrip': case 'rest': {
      a.status = st.phase === 'rest' ? 'Narovná se a oddechne si' : 'Přehmátne';
      if (s < 1) return;
      if (st.phase === 'rest') { go('regrip', 0.5, P.plant); return; }
      startPush(); return;
    }
    case 'scoop': {
      a.status = 'Nabírá sníh';
      if (s >= 0.7 && !st.flags.scooped) { st.flags.scooped = true; scoop(snow); st.stats.scoops++; }
      if (s < 1) return;
      liftBlade(snow, E().fwd); // zbytek valu zůstává ležet před listem
      st.resumeX = E().C.X - 0.03;
      const load = snow.blade / snow.p.massLimit;
      go('lift', TIMES.lift * (1 + 0.6 * load) * jit(seed, st, 3), { ...P.lifted, h: P.lifted.h - 0.08 * load, u: P.lifted.u - 0.06 * load }, 'loaded');
      return;
    }
    case 'lift': {
      a.status = 'Zvedá sníh';
      a.look = toScreen(cam, cfg.pileAt);
      if (s >= 0.45 && !st.flags.dribble) { st.flags.dribble = true; const e = E(); spillFromBlade(snow, snow.blade * 0.03, e.C.X, e.C.Z); }
      if (s < 1) return;
      // natočení k hromadě přešlápnutím; je-li daleko, dojde blíž
      const B = W(), d = Math.hypot(cfg.pileAt.X - B.X, cfg.pileAt.Z - B.Z), dir = { X: (cfg.pileAt.X - B.X) / (d || 1), Z: (cfg.pileAt.Z - B.Z) / (d || 1) };
      const step = d > MAX_THROW ? d - MAX_THROW + 0.15 : 0.16;
      h.walkPath(a, [toScreen(cam, { X: B.X + dir.X * step, Z: B.Z + dir.Z * step })], 0.55);
      go('turn', TIMES.turn, st.to);
      return;
    }
    case 'turn': {
      a.status = 'Otáčí se k hromadě';
      a.look = toScreen(cam, cfg.pileAt);
      if (a.route || s < 1) return;
      planThrow();
      go('throw', TIMES.throw * jit(seed, st, 4), st.to, 'throw');
      return;
    }
    case 'throw': {
      a.status = 'Odhazuje sníh';
      if (s >= RELEASE_S && !st.flags.released) {
        st.flags.released = true; st.stats.releases++;
        // uvolnění: start ze skutečné oblasti nákladu na listu, rychlost listu (derivace pohybu)
        const e = E(), sp = 2.4 / st.dur;
        const P0 = { X: e.C.X - e.fwd.X * 0.12, Z: e.C.Z - e.fwd.Z * 0.12, H: tool.h + 0.1 };
        const v = { X: e.fwd.X * st.throwA * sp, Z: e.fwd.Z * st.throwA * sp, H: st.throwH * sp };
        release(snow, P0, v, now, Math.floor(seed + st.stats.releases * 7919));
        h.puff(P0.X, P0.Z, P0.H, 5); // jemné částice – jen vizuální doprovod (bez hmotnosti)
      }
      if (s < 1) return;
      st.stats.throws++;
      const knock = snow.blade > 0.1 && U(seed, st.stats.throws, 12) < 0.6;
      if (st.single && !knock) { go('hold', 1e9, P.carry); st.until = 0; return; }
      if (knock) { go('knock', TIMES.knock, { ...P.lifted, h: 0.25 }); return; }
      startReturn(); return;
    }
    case 'knock': {
      a.status = 'Oklepává lopatu';
      if (s >= 0.5 && !st.flags.knocked) { st.flags.knocked = true; st.stats.knocks++; const e = E(); spillFromBlade(snow, snow.blade, e.C.X, e.C.Z); }
      if (s < 1) return;
      if (st.single) { go('hold', 1e9, P.carry); st.until = 0; return; }
      startReturn(); return;
    }
    case 'return': {
      a.status = 'Vrací se k práci';
      a.speedFactor = 0.75;
      if (a.route || s < 1) return;
      go('plant', TIMES.plant, P.plant); return;
    }
    case 'inspect': {
      a.status = 'Kontroluje odklizenou plochu';
      a.look = toScreen(cam, { X: (cfg.work.x0 + cfg.work.x1) / 2, Z: (cfg.work.z0 + cfg.work.z1) / 2 });
      if (a.route || s < 1) return;
      // dočištění: pruh s viditelným zbytkem (nejvýš jednou na pruh)
      const lane = lanes.findIndex((z, i) => remainingIn(snow, z - 0.12, z + 0.12) > 0.15 && st.cleanups[i] < 1);
      if (lane >= 0) {
        st.cleanups[lane]++; st.lane = lane; st.resumeX = null;
        walkToEdgeAt(cfg.work.x0 - 0.02, lanes[lane]);
        go('arrive', 0, P.ready); h.log(`${a.name} dočišťuje pruh ${lane + 1}.`, a.id);
        return;
      }
      go('done', 2 + 1.5 * U(seed, st.n, 40), P.carry);
      return;
    }
    case 'done': {
      a.status = 'Hotovo, narovná se'; a.look = null;
      if (s < 1) return;
      if (st.single) { go('hold', 1e9, P.carry); return; }
      h.walkPath(a, [...(cfg.approach ?? []).slice().reverse(), cfg.enter], 0.9);
      go('leave', 0, P.carry); return;
    }
    case 'hold': {
      a.status = 'Ladění: cyklus dokončen';
      if (st.until > st.t0 && now >= st.until) { st.single = true; startReturn(); } // další jeden cyklus
      return;
    }
    case 'leave': {
      a.status = 'Odchází';
      if (a.route) return;
      h.giveShovel(a, false); h.hide(a); a.anim.tool = null;
      st.doneAt = now; st.n++;
      st.until = now + 600 + 600 * U(seed, st.n, 1);
      st.phase = 'offstage';
      h.log(`${a.name} odklidil(a) sníh (na hromadě ${total(snow).toFixed(1)} kg celkem v oblasti).`, a.id);
      return;
    }
  }

  // ---------------------------------------------------------------- pomocné kroky automatu
  function startPush() {
    const e = E(), x1 = cfg.work.x1;
    // délka záběru 0,5–0,9 m, se zvětšujícím se valem kratší; konec pruhu: dotlačit za okraj dlažby
    const resist = Math.min(1, snow.ridge / 3);
    let L = (0.5 + 0.4 * U(seed, st.n * 997 + st.stats.pushes, 5)) * (1 - 0.35 * resist);
    if (e.C.X + L > x1 - 0.12) L = x1 + 0.2 - e.C.X; // poslední záběr: val vytlačit na okraj
    const B = W();
    h.walkPath(a, [toScreen(cam, { X: B.X + e.fwd.X * L, Z: laneZ })], pushSpeed(snow));
    go('push', TIMES.push, P.plant);
  }
  function decide() {
    const e = E();
    if (e.C.X >= cfg.work.x1 + 0.1) { // val vytlačený za okraj dlažby
      st.stats.pushOffs++; liftBlade(snow, e.fwd);
      st.lane++;
      if (st.single && st.lane < lanes.length) { st.resumeX = cfg.work.x0; go('hold', 1e9, P.carry); st.until = 0; return; }
      if (st.lane < lanes.length) {
        h.walkPath(a, [toScreen(cam, { X: W().X - 0.6, Z: lanes[st.lane] }), toScreen(cam, { X: cfg.work.x0 - 0.02 - P.plant.u - 0.45, Z: lanes[st.lane] }), toScreen(cam, { X: cfg.work.x0 - 0.02 - P.plant.u, Z: lanes[st.lane] })], 0.9);
        go('arrive', 0, P.ready, 'relaxed');
      } else { go('inspect', 1.6, P.carry, 'relaxed'); }
      return;
    }
    const B = W(), dPile = Math.hypot(cfg.pileAt.X - B.X, cfg.pileAt.Z - B.Z);
    if (snow.ridge >= SCOOP_AT + 0.5 * U(seed, st.stats.pushes, 6) && dPile < 3.2) {
      go('scoop', TIMES.scoop * jit(seed, st, 7), P.scoop); return;
    }
    if (st.sinceRest >= st.restAt) { st.sinceRest = 0; st.restAt = 4 + Math.floor(3 * U(seed, st.stats.pushes, 8)); go('rest', 1.4 + 1.2 * U(seed, st.stats.pushes, 9), P.rest); return; }
    go('regrip', TIMES.regrip * jit(seed, st, 10), { ...P.plant, crouch: P.plant.crouch - 0.05 });
  }
  function planThrow() {
    // amplituda odhozu tak, aby shluky (balistika z rychlosti listu) dopadly na hromadu
    const e = E(), d0 = Math.hypot(cfg.pileAt.X - e.C.X, cfg.pileAt.Z - e.C.Z) + 0.12;
    const load = snow.blade / snow.p.massLimit, dur = TIMES.throw;
    st.throwH = 0.35 * (1 - 0.3 * load);
    const vH = st.throwH * 2.4 / dur, H0 = P.lifted.h + st.throwH * 0.6 + 0.1, top = 0.25;
    const T = (vH + Math.sqrt(vH * vH + 2 * 9.81 * Math.max(0.01, H0 - top))) / 9.81;
    st.throwA = Math.max(0.08, Math.min(0.5 * (1 - 0.3 * load), (d0 * dur) / (2.4 * T) / (1 + (0.6 * dur) / (2.4 * T)))); // těžší náklad = menší dosah
  }
  function startReturn() {
    const X = st.resumeX ?? cfg.work.x0;
    walkToEdgeAt(X, laneZ, 0.8);
    go('return', TIMES.ret * jit(seed, st, 11), P.ready, 'relaxed');
  }
}

function throwPose(st: ClearingState, s: number): ToolPose {
  const f = throwF(Math.max(0, Math.min(1, s)));
  return { u: st.from.u + st.throwA * f, h: st.from.h + st.throwH * f, beta: st.from.beta - 0.35 * f, crouch: st.from.crouch * (1 - f), lean: st.from.lean * (1 - 0.5 * f) };
}
const pushSpeed = (snow: SnowState) => 0.32 * (1 - 0.35 * Math.min(1, snow.ridge / 3));
const jit = (seed: number, st: ClearingState, k: number) => 0.88 + 0.24 * hashNoise(seed, 9600 + st.stats.pushes + st.stats.throws * 31, k);
function lookAhead(cam: ReturnType<typeof cameraFor>, a: AgentState, d: number): Vec2 {
  const W = toWorld(cam, a.pos), h = a.groundHeading ?? 0;
  return toScreen(cam, { X: W.X + Math.cos(h) * d, Z: W.Z + Math.sin(h) * d });
}

/** Ladicí přehled zásob (kg) a fáze. */
export function clearingDebugInfo(st: ClearingState | undefined) {
  if (!st?.snow) return null;
  const s = st.snow;
  return { phase: st.phase, lane: st.lane, ridge: s.ridge, blade: s.blade, air: s.air.reduce((x, c) => x + c.mass, 0), total: total(s), stats: st.stats, moved: s.moved };
}
