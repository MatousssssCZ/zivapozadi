/**
 * Stavba sněhuláka (balíček „živá pozadí“, B05) – společná činnost dvou účastníků řízená jednou
 * session (fáze a termíny jsou jen v session, účastníci je vykonávají).
 *
 * gather → roll0 (spodní koule) → roll1 (prostřední) → lift1 → roll2 (hlava) → lift2 →
 * decorate (oči, nos, šála – každý doplněk vlastní událostí) → admire → konec.
 *
 * Koule se neválí: tvoří se na svém místě (spodní na místě sněhuláka, další vedle), postava u ní
 * klečí (spodní) nebo stojí v mírném předklonu (prostřední, hlava) zády ke kameře; koule roste
 * rovnoměrně v objemu po dobu tvoření. Hotový sněhulák je runtime objekt (SimState.runtimeObjects) s
 * kolizí – projekt se nemění; po přerušení koule nezmizí.
 */
import type { ActivityDefinition, ActivityRunner } from './types';
import type { ActivitySession, AgentState, RuntimeObject, SimState } from '../sim/types';
import type { Reservations } from '../sim/reservations';
import type { ActivityZone, ProjectFile } from '../model/types';
import type { Family } from '../social/clips';
import { createSession, endSession, setSessionPhase } from '../sim/sessions';
import { cameraFor, toScreen, toWorld, type World } from '../scene/camera';
import { randRange } from '../math/rng';
import type { Vec2 } from '../math/vec';

export const SNOWMAN_RADII: [number, number, number] = [0.3, 0.22, 0.14];
const R0 = 0.06, LEN: [number, number, number] = [3.6, 2.8, 1.8];
export const MAX_SNOWMEN = 2;

export const snowmanDefinition: ActivityDefinition = {
  type: 'snowman', version: 1, label: 'Stavba sněhuláka', status: 'implemented',
  description: 'Dva lidé postaví sněhuláka: uválí tři koule po sněhu, zvednou je na sebe a ozdobí. Sněhulák pak zůstane stát.',
  participants: [{ role: 'builder', min: 2, max: 2, requiredCapabilities: ['walk'] }],
  requiredObjects: [],
  props: [{ id: 'ball', kind: 'snowmanPart', label: 'Koule sněhu' }],
  workPointKinds: [], entryPointKinds: [],
  surface: 'snow',
  capacity: { description: 'Jedna stavba na zónu, nejvýše 2 sněhuláci ve scéně; zóna s hotovým sněhulákem se znovu nepoužije.' },
  preconditions: ['Zóna leží ve sněhu a mimo hlavní průchod (asi 4 × 4 m).', 'Dva volní návštěvníci bez věcí v rukou.'],
  phases: [
    { id: 'gather', label: 'Sejití na místě (do 45 s)' }, { id: 'roll0', label: 'Tvoření spodní koule (vkleče)' },
    { id: 'roll1', label: 'Tvoření prostřední koule' }, { id: 'lift1', label: 'Zvednutí prostřední koule', events: ['place'] },
    { id: 'roll2', label: 'Tvoření hlavy' }, { id: 'lift2', label: 'Nasazení hlavy', events: ['place'] },
    { id: 'decorate', label: 'Zdobení (oči, nos, šála)', events: ['decorate'] }, { id: 'admire', label: 'Prohlížení díla' },
  ],
  outcome: 'Ve scéně stojí sněhulák (runtime objekt s kolizí) až do restartu simulace.',
  repeat: { defaultIntervalMin: 600, defaultIntervalMax: 1200, description: 'Odstup mezi stavbami v různých zónách.' },
  defaultParams: { chance: 0.5 },
};

/** Účastník session: jen adaptér – fázi řídí session (stepSnowman). */
export const snowmanParticipant: ActivityRunner = {
  definition: snowmanDefinition,
  canStart: () => ({ ok: false, reason: 'Sněhuláka zakládá režisér scény pro dvojici, ne jednotlivec.', retryAfter: 600 }),
  start: () => null,
  step(ctx, agent, run) {
    const s = ctx.state.sessions?.find((x) => x.id === (run.data as { sessionId?: string }).sessionId);
    if (!s) return 'done';
    run.phase = s.phase;
    agent.status = snowmanDefinition.phases.find((p) => s.phase.startsWith(p.id))?.label ?? 'Staví sněhuláka';
    return 'running';
  },
  abort() { /* session ukončí simulace (abortSnowman) */ },
  usesObject: () => false,
};

// ------------------------------------------------------------------ hostitel (simulace)
export interface SessionHost {
  state: SimState; res: Reservations; project: ProjectFile;
  time(): number;
  agent(id: string): AgentState | undefined;
  /** dojde k bodu (po síti tras a pak přímo) */ goTo(a: AgentState, p: Vec2, purpose: string): boolean;
  /** projde body přímo (pracovní dráha) */ walkPath(a: AgentState, pts: Vec2[], purpose: string, strict?: boolean): void;
  moving(a: AgentState): boolean;
  gesture(a: AgentState, fam: Family, opts?: { dur?: number; hand?: 0 | 1; dirY?: number; sgn?: number }): boolean;
  /** ukončí držené pracovní gesto (tlačení) jeho výstupem */ releaseWork(a: AgentState): void;
  log(msg: string, agentId?: string): void;
  isSnow(p: Vec2): boolean;
  /** je postava dítě (dětská šablona těla) */ isChild?(a: AgentState): boolean;
}

interface Ball { X: number; Z: number; H: number; r: number; rot: number; d: number; k: number; dir: World; stage: 0 | 1 | 2; rMax: number }
interface SnowmanData {
  spot: Vec2; slot?: number; objId: string; roles: [string, string];
  ball?: Ball | null; path?: Vec2[]; until?: number; step?: string; decor?: number;
  liftFrom?: World; liftT0?: number; liftDur?: number;
}
/** Čas cesty na místo (s): skutečná vzdálenost ve světě (v hlubokém náměstí je pixel vzadu mnoho metrů), 0,5 m/s s rezervou na objížďky a šikmé trasy. */
export function gatherTime(h: Pick<SessionHost, 'project'>, who: AgentState[], to: Vec2): number {
  const c = cameraFor(h.project.scene), T = toWorld(c, to);
  return Math.max(...who.map((a) => { const P = toWorld(c, a.pos); return Math.hypot(P.X - T.X, P.Z - T.Z) / 0.5; }));
}
const D = (s: ActivitySession) => s.data as unknown as SnowmanData;

/** Střed zóny a test, zda je zóna použitelná (sníh, žádný sněhulák, nikdo v ní nestaví). */
/** Místo pro sněhuláka: střed zóny posunutý vlevo / vpravo (dvě místa – staví se opakovaně). */
export function snowmanSpot(zone: ActivityZone, slot = 0): Vec2 {
  const b = zone.bounds;
  const c = { x: b.reduce((s, p) => s + p.x, 0) / b.length, y: b.reduce((s, p) => s + p.y, 0) / b.length };
  const w = Math.max(...b.map((p) => p.x)) - Math.min(...b.map((p) => p.x));
  return { x: c.x + (slot === 0 ? -0.22 : 0.22) * w, y: c.y + (slot === 0 ? -4 : 6) };
}
/** Volné místo v zóně (bez stojícího i rozpadajícího se sněhuláka), nebo null. */
export function freeSnowmanSlot(host: Pick<SessionHost, 'state'>, zone: ActivityZone): number | null {
  for (const k of [0, 1]) if (!host.state.runtimeObjects?.some((o) => o.zoneId === zone.id && (o.slot ?? 0) === k)) return k;
  return null;
}
export function snowmanZoneFree(host: Pick<SessionHost, 'state' | 'isSnow'>, zone: ActivityZone): string | null {
  if (!zone.enabled || zone.activityType !== 'snowman' || zone.bounds.length < 3) return 'Zóna je vypnutá nebo nemá vymezený prostor.';
  const slot = freeSnowmanSlot(host, zone);
  if (slot === null) return 'V zóně už stojí dva sněhuláci.';
  if (!host.isSnow(snowmanSpot(zone, slot))) return 'V zóně není sníh.';
  if ((host.state.runtimeObjects?.filter((o) => o.kind === 'snowman' && !o.collapseAt).length ?? 0) >= MAX_SNOWMEN) return 'Ve scéně už jsou 2 sněhuláci.';
  if (host.state.sessions?.some((s) => s.zoneId === zone.id)) return 'V zóně se už staví.';
  return null;
}

/** Založí session pro dvojici (atomicky rezervuje oba účastníky i zónu). */
export function startSnowman(host: SessionHost, zone: ActivityZone, a: AgentState, b: AgentState): ActivitySession | null {
  if (snowmanZoneFree(host, zone)) return null;
  if (a.holding || b.holding) return null;
  const now = host.time();
  const slot = freeSnowmanSlot(host, zone) ?? 0;
  const spot = snowmanSpot(zone, slot);
  const n = (host.state.runtimeObjects?.length ?? 0) + Math.floor(now);
  const s = createSession(host.state, host.res, {
    type: 'snowman', zoneId: zone.id, participantIds: [a.id, b.id], roles: { [a.id]: 'lead', [b.id]: 'helper' },
    // sejití: 45 s + čas cesty toho vzdálenějšího (oba už jsou u zóny – setkání bylo u ní)
    keys: [`zone:${zone.id}`], now, deadline: now + 45 + gatherTime(host, [a, b], spot), seed: host.project.seed, phase: 'gather',
    data: { spot, slot, objId: `snowman_${zone.id}_${slot}_${n}`, roles: [a.id, b.id] } as unknown as Record<string, unknown>,
  });
  if (!s) return null;
  for (const x of [a, b]) {
    x.activity = { type: 'snowman', zoneId: zone.id, source: 'auto', sourceId: null, phase: 'gather', phaseStart: now, data: { sessionId: s.id } };
    x.pendingActivity = null; x.follow = null;
  }
  const d = D(s);
  host.goTo(a, startOf(host, d, 0), 'ke stavbě sněhuláka');
  host.goTo(b, standby(host, d, 1), 'ke stavbě sněhuláka');
  host.log(`${a.name} a ${b.name} jdou stavět sněhuláka.`, a.id);
  return s;
}

const cam = (h: SessionHost) => cameraFor(h.project.scene);
const W2S = (h: SessionHost, w: World) => toScreen(cam(h), w);
const S2W = (h: SessionHost, p: Vec2) => toWorld(cam(h), p);
function startOf(h: SessionHost, d: SnowmanData, k: 0 | 1 | 2): Vec2 { return W2S(h, formSpot(h, d, k).work); }
/**
 * Koule se tvoří na místě (neválí se): koule leží na svém konečném místě (spodní na místě sněhuláka,
 * prostřední a hlava vedle), postava klečí / stojí šikmo před ní – zády ke kameře, koule je vidět.
 */
function formSpot(h: SessionHost, d: SnowmanData, k: 0 | 1 | 2): { ball: World; work: World } {
  const C = S2W(h, d.spot), side = k === 0 ? 0 : k === 1 ? -1 : 1, rF = SNOWMAN_RADII[k];
  const ball = { X: C.X + side * 0.75, Z: C.Z + (k === 0 ? 0 : 0.25) };
  const sx = k === 1 ? -1 : 1;
  let work = { X: ball.X + sx * (rF * 0.8 + 0.06), Z: ball.Z - (rF + (k === 0 ? 0.32 : 0.28)) };
  // místo před koulí by bylo pod okrajem obrazu (zóna u spodního kraje): postava pracuje vedle koule
  if (W2S(h, work).y > h.project.scene.height - 6) work = { X: ball.X + sx * (rF + 0.42), Z: ball.Z - 0.08 };
  return { ball, work };
}
/** doba tvoření koule (s): spodní vkleče, prostřední a hlava v předklonu */
const FORM_T = [40, 28, 20];
/** Kde čeká ten, kdo zrovna neválí (stranou, s výhledem na stavbu). */
function standby(h: SessionHost, d: SnowmanData, who: 0 | 1): Vec2 {
  const C = S2W(h, d.spot);
  return W2S(h, { X: C.X + (who ? 1.35 : -1.35), Z: C.Z + 0.9 });
}

/** Krok všech staveb (volá simulace jednou za tick před postavami). */
export function stepSnowman(h: SessionHost, s: ActivitySession): 'running' | 'done' | 'aborted' {
  const now = h.time(), d = D(s);
  const [A, B] = d.roles.map((id) => h.agent(id));
  if (!A || !B || A.hidden || B.hidden) return 'aborted';
  const roller = (k: number) => (k === 1 ? B : A), other = (k: number) => (k === 1 ? A : B);
  const sm = () => h.state.runtimeObjects?.find((o) => o.id === d.objId);
  const look = (a: AgentState, p: Vec2) => { a.look = { x: p.x, y: p.y }; };
  switch (s.phase) {
    case 'gather': {
      if (now > s.deadline) return 'aborted';
      if (h.moving(A) || h.moving(B)) return 'running';
      look(B, d.spot);
      beginRoll(h, s, 0);
      return 'running';
    }
    case 'roll0': case 'roll1': case 'roll2': {
      const k = Number(s.phase[4]) as 0 | 1 | 2, R = roller(k), O = other(k);
      look(O, ballScreen(h, d.ball!) ?? d.spot);
      if (d.step === 'walk') {
        if (h.moving(R)) return 'running';
        // nabrat sníh a uplácat malou kouli
        d.step = 'scoop'; d.until = now + randRange(s.rng, 1.4, 2.2);
        h.gesture(R, 'scoop', { dur: 1.9 });
        return 'running';
      }
      if (d.step === 'scoop') {
        // nabrat sníh a uplácat malou kouli, pak ji na místě tvořit (vkleče / v předklonu, zády ke kameře)
        if (now < d.until!) return 'running';
        d.step = 'push'; d.liftT0 = now;
        R.anim.sit = { kind: 'squat', t: 0, dur: 1e6, w: 0, r: d.ball!.r };
        return 'running';
      }
      {
        const b = d.ball!, w = R.anim.sit, u = Math.min(1, (now - d.liftT0!) / FORM_T[k]);
        { const P = S2W(h, R.pos); R.turnTo = Math.PI / 2 - Math.sign(b.X - P.X || 1) * 0.45; R.look = null; } // šikmo zezadu (3/4) ke kouli
        if (w) { w.t += 1 / 60; w.w = Math.min(1, w.t / 0.9, Math.max(0, (w.dur - w.t) / 0.9)); w.r = b.r; }
        // koule roste rovnoměrně v objemu (přihrnutý a uplácaný sníh z okolí), pomalu se natáčí
        b.r = Math.cbrt(R0 ** 3 + (b.rMax ** 3 - R0 ** 3) * u); b.H = b.r; b.rot = u * 0.6;
        if (u < 1) return 'running';
        if (w && w.dur > w.t + 0.9) w.dur = w.t + 0.9; // vstává (prolnutí)
        if (w && w.t < w.dur) return 'running';
        R.anim.sit = null; R.turnTo = null;
      }
      h.releaseWork(R);
      const b = d.ball!;
      if (k === 0) {
        // spodní koule je na místě: vzniká sněhulák (runtime objekt s kolizí)
        const sp = W2S(h, { X: b.X, Z: b.Z });
        const obj: RuntimeObject = { id: d.objId, kind: 'snowman', zoneId: s.zoneId, x: sp.x, y: sp.y, radii: [b.r, 0, 0], stage: 'base', decorations: [], createdAt: now, seed: Math.floor(randRange(s.rng, 0, 1e6)), slot: d.slot ?? 0 };
        (h.state.runtimeObjects ??= []).push(obj);
        d.ball = null;
        h.goTo(R, standby(h, d, 0), 'odstoupí');
        beginRoll(h, s, 1);
      } else {
        // koule leží vedle: oba přijdou k ní a zvednou ji (hlavu zvedne jen válející)
        setSessionPhase(s, k === 1 ? 'lift1' : 'lift2', now);
        d.step = 'approach';
        const P = S2W(h, sm()!.x !== undefined ? { x: sm()!.x, y: sm()!.y } : d.spot);
        if (k === 1) h.goTo(O, W2S(h, { X: P.X - 0.75, Z: P.Z - 0.55 }), 'pomáhá zvednout');
      }
      return 'running';
    }
    case 'lift1': case 'lift2': {
      const k = s.phase === 'lift1' ? 1 : 2, R = roller(k), O = other(k), o = sm()!;
      const b = d.ball!;
      if (d.step === 'approach') {
        if (h.moving(R) || (k === 1 && h.moving(O))) return 'running';
        const dur = randRange(s.rng, 3.2, 4.6);
        d.liftDur = dur; d.liftT0 = now; d.liftFrom = { X: b.X, Z: b.Z }; d.step = 'lift';
        look(R, { x: o.x, y: o.y - 40 }); h.gesture(R, 'lift', { dur });
        if (k === 1) { look(O, { x: o.x, y: o.y - 40 }); h.gesture(O, 'lift', { dur }); }
        return 'running';
      }
      // koule po oblouku nahoru na místo (0,25–0,8 klipu), položení přesně jednou
      const u = (now - d.liftT0!) / d.liftDur!;
      const P = S2W(h, { x: o.x, y: o.y });
      const topH = k === 1 ? 2 * o.radii[0] * 0.92 + b.r * 0.92 : 2 * o.radii[0] * 0.92 + 2 * o.radii[1] * 0.92 + b.r * 0.9;
      const e = Math.max(0, Math.min(1, (u - 0.25) / 0.55)), ee = e * e * (3 - 2 * e);
      b.X = d.liftFrom!.X + (P.X - d.liftFrom!.X) * ee; b.Z = d.liftFrom!.Z + (P.Z - d.liftFrom!.Z) * ee;
      b.H = b.r + (topH - b.r) * ee + Math.sin(Math.PI * ee) * 0.12;
      if (u < 1) return 'running';
      o.radii[k] = b.r; o.stage = k === 1 ? 'middle' : 'head'; d.ball = null;
      if (k === 1) { h.goTo(B, standby(h, d, 1), 'odstoupí'); beginRoll(h, s, 2); }
      else {
        setSessionPhase(s, 'decorate', now); d.decor = 0; d.step = 'go';
        const P2 = S2W(h, { x: o.x, y: o.y });
        h.goTo(A, W2S(h, { X: P2.X - 0.62, Z: P2.Z - 0.35 }), 'zdobí');
        h.goTo(B, W2S(h, { X: P2.X + 0.62, Z: P2.Z - 0.35 }), 'zdobí');
      }
      return 'running';
    }
    case 'decorate': {
      const o = sm()!, items = ['eyes', 'nose', 'scarf', 'buttons'];
      if (d.step === 'go') { if (h.moving(A) || h.moving(B)) return 'running'; d.step = 'idle'; d.until = now + 0.6; }
      look(A, { x: o.x, y: o.y - 50 }); look(B, { x: o.x, y: o.y - 50 });
      if (d.step === 'idle' && now >= d.until!) {
        if (d.decor! >= items.length) { setSessionPhase(s, 'admire', now); d.until = now + randRange(s.rng, 8, 15); d.step = 'admire'; return 'running'; }
        const who = d.decor! % 2 === 0 ? A : B;
        const dur = randRange(s.rng, 2.2, 3.2);
        h.gesture(who, 'decorate', { dur, hand: 0, dirY: items[d.decor!] === 'buttons' ? -34 : -22 });
        d.step = 'act'; d.until = now + dur * 0.5; // doplněk přibude v okamžiku dotyku
        return 'running';
      }
      if (d.step === 'act' && now >= d.until!) {
        o.decorations.push(items[d.decor!]); d.decor!++;
        if (o.decorations.length >= 3) o.stage = 'decorated';
        d.step = 'idle'; d.until = now + randRange(s.rng, 1.6, 4);
      }
      return 'running';
    }
    case 'admire': {
      const o = sm()!;
      look(A, { x: o.x, y: o.y - 40 }); look(B, { x: o.x, y: o.y - 40 });
      if (d.step === 'admire' && now > d.until! - 5) { h.gesture(A, 'open', {}); d.step = 'done'; }
      if (now < d.until!) return 'running';
      o.stage = 'done';
      return 'done';
    }
  }
  return 'running';
}

function beginRoll(h: SessionHost, s: ActivitySession, k: 0 | 1 | 2) {
  const d = D(s), now = h.time();
  setSessionPhase(s, `roll${k}`, now);
  const L = LEN[k], rT = SNOWMAN_RADII[k] * randRange(s.rng, 0.92, 1.05);
  const R = k === 1 ? h.agent(d.roles[1])! : h.agent(d.roles[0])!;
  const f = formSpot(h, d, k), dir = norm({ X: f.ball.X - f.work.X, Z: f.ball.Z - f.work.Z });
  d.path = [];
  d.ball = { X: f.ball.X, Z: f.ball.Z, H: R0, r: R0, rot: 0, d: 0, k: (rT ** 3 - R0 ** 3) / L, dir, stage: k, rMax: rT };
  h.goTo(R, W2S(h, f.work), 'k místu koule');
  d.step = 'walk';
}

function ballScreen(h: SessionHost, b: Ball | null | undefined): Vec2 | null { return b ? W2S(h, { X: b.X, Z: b.Z }) : null; }
const norm = (w: World): World => { const n = Math.hypot(w.X, w.Z) || 1; return { X: w.X / n, Z: w.Z / n }; };

/** Přerušení: koule nezmizí – válená koule zůstane ležet jako runtime objekt. */
export function abortSnowman(h: SessionHost, s: ActivitySession): void {
  const d = D(s);
  if (d.ball && !h.state.runtimeObjects?.some((o) => o.id === d.objId)) {
    const sp = W2S(h, { X: d.ball.X, Z: d.ball.Z });
    (h.state.runtimeObjects ??= []).push({ id: d.objId, kind: 'snowman', zoneId: s.zoneId, x: sp.x, y: sp.y, radii: [d.ball.r, 0, 0], stage: 'base', decorations: [], createdAt: h.time(), seed: 1, slot: d.slot ?? 0 });
  }
  finishSession(h, s);
}
export function finishSession(h: SessionHost, s: ActivitySession): void {
  for (const id of s.participantIds) {
    const a = h.agent(id);
    if (!a) continue;
    h.releaseWork(a);
    a.look = null;
    if ((a.activity?.data as { sessionId?: string } | undefined)?.sessionId === s.id) a.activity = null;
  }
  endSession(h.state, h.res, s.id);
}

/** Rozpracovaná koule (pro vykreslení): poloha na zemi, výška středu, poloměr, natočení. */
export function sessionBalls(st: SimState): { X: number; Z: number; H: number; r: number; rot: number }[] {
  return (st.sessions ?? []).filter((s) => s.type === 'snowman' && D(s).ball).map((s) => { const b = D(s).ball!; return { X: b.X, Z: b.Z, H: b.H, r: b.r, rot: b.rot }; });
}
