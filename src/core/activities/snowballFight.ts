/**
 * Koulovačka (balíček „živá pozadí“, B04) – společná session dvou účastníků.
 *
 * gather → (scoop → pack → aim → throw → flight → reaction → pause) × 4–8 → finish.
 * Koule letí světovou balistikou P(t) = P0 + v·t − ½g t² (výška), promítá se kamerou a řadí se
 * podle bodu pod sebou. Před každým nápřahem se kontroluje koridor mezi hráči – cizí člověk v dráze
 * hod odloží (po 15 s blokace hra skončí). Vypuštěná koule normálně doletí. 45 % hodů míří do
 * sněhu vedle partnera, zbytek na trup, nikdy na hlavu.
 *
 * Zadání počítá s dětmi (dětská postava a dřep zatím nejsou malované) – v běžné scéně je proto
 * činnost zamítnutá s důvodem; dospělí ji smí hrát jen s parametrem zóny `allowAdults`
 * (vývojářská náhrada, ne hotová scéna).
 */
import type { ActivityDefinition, ActivityRunner } from './types';
import type { ActivitySession, AgentState } from '../sim/types';
import type { ActivityZone } from '../model/types';
import type { SessionHost } from './snowman';
import { createSession, setSessionPhase } from '../sim/sessions';
import { cameraFor, toScreen, toWorld, type World } from '../scene/camera';
import { rand, randRange } from '../math/rng';
import { emit } from '../sim/environment';
import { depthScaleAt } from '../scene/geometry';
import type { Vec2 } from '../math/vec';

const G = 9.81;
export const snowballDefinition: ActivityDefinition = {
  type: 'snowballFight', version: 1, label: 'Koulovačka', status: 'implemented',
  description: 'Dva lidé se v zasněženém prostoru koulují: naberou sníh, uplácají kouli, zamíří a hodí; partner uhne nebo dostane zásah do kabátu.',
  participants: [{ role: 'player', min: 2, max: 2, requiredCapabilities: ['walk', 'scoop', 'child'] }],
  requiredObjects: [], props: [{ id: 'snowball', kind: 'snowball', label: 'Koule' }],
  workPointKinds: [], entryPointKinds: [], surface: 'snow',
  capacity: { description: 'Jedna hra na zónu; výrazná událost (nejvýš jedna ve scéně).' },
  preconditions: ['Zóna ve sněhu asi 4 × 3 m mimo průchod.', 'Dětské postavy s pózou dřepu – jinak jen parametr zóny allowAdults (vývojářská náhrada).'],
  phases: [
    { id: 'gather', label: 'Sejití' }, { id: 'scoop', label: 'Nabrání sněhu', events: ['snow_take'] }, { id: 'pack', label: 'Uplácání' },
    { id: 'aim', label: 'Zamíření' }, { id: 'throw', label: 'Hod', events: ['release'] }, { id: 'flight', label: 'Let koule' },
    { id: 'pause', label: 'Oddech' }, { id: 'finish', label: 'Konec hry' },
  ],
  outcome: 'Hráči se po 4–8 hodech rozejdou; koule nikdy nezůstane viset.',
  repeat: { defaultIntervalMin: 240, defaultIntervalMax: 480, description: 'Odstup her v zóně.' },
  defaultParams: { chance: 0.4, allowAdults: false },
};
export const snowballParticipant: ActivityRunner = {
  definition: snowballDefinition,
  canStart: () => ({ ok: false, reason: 'Koulovačku zakládá režisér scény pro dvojici.', retryAfter: 600 }),
  start: () => null,
  step(ctx, _a, run) { const s = ctx.state.sessions?.find((x) => x.id === (run.data as { sessionId?: string }).sessionId); if (!s) return 'done'; run.phase = s.phase; return 'running'; },
  abort() { /* řeší simulace */ },
  usesObject: () => false,
};

interface FightData { spots: [Vec2, Vec2]; roles: [string, string]; throws: number; done: number; thrower: number; until: number; blockedSince: number | null; ballId: string | null }
const D = (s: ActivitySession) => s.data as unknown as FightData;

/** Proč nelze hrát (null = lze). */
export function fightZoneProblem(h: Pick<SessionHost, 'state' | 'isSnow'>, zone: ActivityZone): string | null {
  if (!zone.enabled || zone.activityType !== 'snowballFight' || zone.bounds.length < 3) return 'Zóna je vypnutá nebo nemá vymezený prostor.';
  if (!zone.params.allowAdults) return 'Chybí dětské postavy s pózou dřepu (podklady) – koulovačka je vypnutá.';
  const c = centre(zone);
  if (!h.isSnow(c)) return 'V zóně není sníh.';
  if (h.state.sessions?.some((s) => s.zoneId === zone.id)) return 'V zóně se už hraje.';
  return null;
}
const centre = (z: ActivityZone): Vec2 => ({ x: z.bounds.reduce((s, p) => s + p.x, 0) / z.bounds.length, y: z.bounds.reduce((s, p) => s + p.y, 0) / z.bounds.length });

export function startFight(h: SessionHost, zone: ActivityZone, a: AgentState, b: AgentState): ActivitySession | null {
  if (fightZoneProblem(h, zone) || a.holding || b.holding) return null;
  const cam = cameraFor(h.project.scene), C = toWorld(cam, centre(zone)), now = h.time();
  const gap = 1.3 + rand(a.rng) * 0.6; // odstup 2,6–3,8 m
  const spots: [Vec2, Vec2] = [toScreen(cam, { X: C.X - gap, Z: C.Z }), toScreen(cam, { X: C.X + gap, Z: C.Z + 0.3 })];
  const s = createSession(h.state, h.res, {
    type: 'snowballFight', zoneId: zone.id, participantIds: [a.id, b.id], roles: { [a.id]: 'player', [b.id]: 'player' },
    keys: [`zone:${zone.id}`], now, deadline: now + 45 + Math.max(Math.hypot(a.pos.x - spots[0].x, a.pos.y - spots[0].y), Math.hypot(b.pos.x - spots[1].x, b.pos.y - spots[1].y)) / 40,
    seed: h.project.seed, phase: 'gather', data: { spots, roles: [a.id, b.id], throws: 4 + Math.floor(rand(a.rng) * 5), done: 0, thrower: 0, until: 0, blockedSince: null, ballId: null } as unknown as Record<string, unknown>,
  });
  if (!s) return null;
  for (const x of [a, b]) { x.activity = { type: 'snowballFight', zoneId: zone.id, source: 'auto', sourceId: null, phase: 'gather', phaseStart: now, data: { sessionId: s.id } }; x.pendingActivity = null; x.follow = null; }
  h.goTo(a, spots[0], 'ke koulovačce'); h.goTo(b, spots[1], 'ke koulovačce');
  h.log(`${a.name} a ${b.name} se jdou koulovat.`, a.id);
  return s;
}

export function stepFight(h: SessionHost, s: ActivitySession): 'running' | 'done' | 'aborted' {
  const now = h.time(), d = D(s);
  const P = d.roles.map((id) => h.agent(id)) as [AgentState | undefined, AgentState | undefined];
  if (!P[0] || !P[1] || P[0].hidden || P[1].hidden) return 'aborted';
  const T = P[d.thrower]!, R = P[1 - d.thrower]!;
  const face = () => { T.look = { x: R.pos.x, y: R.pos.y }; R.look = { x: T.pos.x, y: T.pos.y }; };
  switch (s.phase) {
    case 'gather':
      if (now > s.deadline) return 'aborted';
      if (h.moving(P[0]!) || h.moving(P[1]!)) return 'running';
      face(); setSessionPhase(s, 'pause', now); d.until = now + randRange(s.rng, 1, 2);
      return 'running';
    case 'pause':
      face();
      if (now < d.until || (d.ballId && h.state.props.some((p) => p.id === d.ballId))) return 'running';
      if (h.moving(T) || h.moving(R)) return 'running';
      if (d.done >= d.throws) { setSessionPhase(s, 'finish', now); d.until = now + randRange(s.rng, 3, 6); return 'running'; }
      // střídání není přísně ABAB
      if (d.done > 0 && rand(s.rng) < 0.7) d.thrower = 1 - d.thrower;
      setSessionPhase(s, 'scoop', now); d.until = now + randRange(s.rng, 1.2, 1.8);
      h.gesture(P[d.thrower]!, 'lift', { dur: d.until - now }); // náhrada dřepu: ruce ke sněhu
      return 'running';
    case 'scoop':
      face();
      if (now < d.until) return 'running';
      setSessionPhase(s, 'pack', now); d.until = now + randRange(s.rng, 0.8, 1.4);
      h.gesture(T, 'rubHands', { dur: d.until - now });
      return 'running';
    case 'pack':
      face();
      if (now < d.until) return 'running';
      setSessionPhase(s, 'aim', now); d.until = now + randRange(s.rng, 0.5, 1.0);
      return 'running';
    case 'aim': {
      face();
      if (now < d.until) return 'running';
      // koridor: cizí člověk v dráze → odložit; po 15 s blokace konec hry
      if (corridorBlocked(h, s, T, R)) {
        d.blockedSince ??= now;
        if (now - d.blockedSince > 15) { setSessionPhase(s, 'finish', now); d.until = now + 3; }
        return 'running';
      }
      d.blockedSince = null; d.ballId = null;
      setSessionPhase(s, 'throw', now);
      d.until = now + randRange(s.rng, 0.65, 0.95);
      h.gesture(T, 'throw', { dur: d.until - now, hand: 1 });
      (s.data as Record<string, unknown>).releaseAt = now + (d.until - now) * 0.55;
      return 'running';
    }
    case 'throw': {
      face();
      const rel = (s.data as Record<string, number>).releaseAt;
      if (!d.ballId && now >= rel) {
        // výhoz přesně jednou: koule začíná v ruce, cíl 45 % sníh vedle partnera, jinak trup
        const cam = cameraFor(h.project.scene), A = toWorld(cam, T.pos), B = toWorld(cam, R.pos);
        const dir = norm({ X: B.X - A.X, Z: B.Z - A.Z });
        const P0 = { X: A.X + dir.X * 0.35, Z: A.Z + dir.Z * 0.35, H: 1.55 };
        const toSnow = rand(s.rng) < 0.45;
        const side = (rand(s.rng) - 0.5) * (toSnow ? 1.6 : 0.3);
        const P1 = { X: B.X - dir.Z * side - dir.X * (toSnow ? 0.5 : 0.15), Z: B.Z + dir.X * side - dir.Z * (toSnow ? 0.5 : 0.15), H: toSnow ? 0 : randRange(s.rng, 0.95, 1.2) };
        const Tf = randRange(s.rng, 0.45, 0.8);
        const ball = h.state.props.length >= 128 ? null : { id: `prop${h.state.nextPropId++}`, kind: 'snowball' as const, appearedAt: now, sips: 0, radius: 0.045,
          place: { kind: 'flying' as const, X0: P0.X, Z0: P0.Z, H0: P0.H, vX: (P1.X - P0.X) / Tf, vZ: (P1.Z - P0.Z) / Tf, vH: (P1.H - P0.H + 0.5 * G * Tf * Tf) / Tf, t0: now, T: Tf, targetId: R.id, sessionId: s.id } };
        if (ball) { h.state.props.push(ball); d.ballId = ball.id; }
      }
      if (now < d.until) return 'running';
      d.done++;
      setSessionPhase(s, 'pause', now); d.until = now + randRange(s.rng, 2, 6);
      return 'running';
    }
    case 'finish':
      if (now < d.until) return 'running';
      return 'done';
  }
  return 'running';
}

function corridorBlocked(h: SessionHost, s: ActivitySession, T: AgentState, R: AgentState): boolean {
  const cam = cameraFor(h.project.scene), A = toWorld(cam, T.pos), B = toWorld(cam, R.pos);
  const L = Math.hypot(B.X - A.X, B.Z - A.Z) || 1;
  return h.state.agents.some((o) => {
    if (o.hidden || s.participantIds.includes(o.id)) return false;
    const Pw = toWorld(cam, o.pos);
    const u = ((Pw.X - A.X) * (B.X - A.X) + (Pw.Z - A.Z) * (B.Z - A.Z)) / (L * L);
    if (u < -0.1 || u > 1.15) return false;
    const qx = A.X + (B.X - A.X) * u, qz = A.Z + (B.Z - A.Z) * u;
    return Math.hypot(Pw.X - qx, Pw.Z - qz) < 0.7; // rezerva kolem dráhy
  });
}

/** Poloha letící koule (svět); null = ještě/už neletí. */
export function ballAt(pl: Extract<import('../sim/types').PropPlace, { kind: 'flying' }>, t: number): World & { H: number } | null {
  const u = t - pl.t0;
  if (u < 0) return null;
  return { X: pl.X0 + pl.vX * u, Z: pl.Z0 + pl.vZ * u, H: pl.H0 + pl.vH * u - 0.5 * G * u * u };
}

/** Krok letících koulí: dopad na zem nebo zásah, drobný úhyb/schoulení zasaženého, částice. */
export function stepBalls(h: SessionHost): void {
  const now = h.time(), cam = cameraFor(h.project.scene);
  for (const p of [...h.state.props]) {
    if (p.place.kind !== 'flying') continue;
    const pl = p.place, q = ballAt(pl, now)!;
    const tgt = h.agent(pl.targetId);
    let hit = false;
    if (tgt && !tgt.hidden) { const B = toWorld(cam, tgt.pos); hit = Math.hypot(q.X - B.X, q.Z - B.Z) < 0.26 && q.H > 0.4 && q.H < 1.45; }
    if (!hit && q.H > 0 && now - pl.t0 < pl.T + 0.5) continue;
    // dopad: 4–8 kousků sněhu, koule zmizí (pool)
    const sp = toScreen(cam, { X: q.X, Z: q.Z }, Math.max(0, q.H)), sc = depthScaleAt(h.project.scene.depth, toScreen(cam, { X: q.X, Z: q.Z }).y);
    const n = 4 + Math.floor((p.appearedAt * 997) % 5);
    for (let i = 0; i < n; i++) emit((h.state.particles ??= []), { kind: 'snowPuff', x: sp.x, y: sp.y, t0: now, life: 0.25 + ((i * 37) % 35) / 100, w0: 0, sc, seed: Math.floor(p.appearedAt * 1000) + i * 13 });
    h.state.props = h.state.props.filter((x) => x !== p);
    if (tgt && hit) h.gesture(tgt, 'hunch', { dur: 1.2, sgn: 1 }); // zásah do kabátu: krátké schoulení
    else if (tgt) h.gesture(tgt, 'tilt', { dur: 1.0, sgn: 1 }); // vedle: ohlédnutí
  }
}
const norm = (w: World): World => { const n = Math.hypot(w.X, w.Z) || 1; return { X: w.X / n, Z: w.Z / n }; };
