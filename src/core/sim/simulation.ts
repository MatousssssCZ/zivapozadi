import type { HandTarget } from '../anim/animator';
import type { ProjectFile, SceneObject, ActivityZone, CharacterInstance } from '../model/types';
import { buildNavGraph, findPath, nearestAccessibleNode, type NavGraph } from '../nav/navGraph';
import { interactionPointWorld } from '../scene/geometry';
import { seedRng, rand, randRange, pickWeighted, hashString, hashNoise } from '../math/rng';
import { canonicalJson, fingerprint } from '../model/hash';
import { ALL_DIRECTIONS, resolveDirection, resolveClip, type CharacterManifest } from '../anim/manifest';
import { initialAnimState, playAction, stepAnimator, stopAction } from '../anim/animator';
import { getActivity } from '../activities/registry';
import { coffeeFreeSlots } from '../activities/coffee';
import { characterVisual, localToScene, gaitContextFor, setVectorFigures, setPaintedHeads, VECTOR_ENV, headIdentity } from '../render/characterPose';
import { depthScaleAt } from '../scene/geometry';
import { Reservations } from './reservations';
import { directionFromAngle, edgeKey } from './movement';
import type { SimContext, ResolvedPoint, CharacterControl } from './context';
import { ALL_VIEWS } from '../anim/skeleton';
import { gaitEvents, LEG_PHYS_M } from '../anim/gaitProfile';
import { elderState, elderSpeedOf } from '../anim/elderGait';
import { FOOTPRINT_LIFE, FOOTPRINT_POOL } from './types';
import { SIM_DT, SIM_STATE_VERSION, type AgentState, type SimState, type Waypoint, type PropState, type LogEntry } from './types';
import { dist, approachAngle, wrapAngle, type Vec2 } from '../math/vec';
import { limitSlope } from '../nav/slope';
import { pointInPolygon } from '../math/geom';
import { planCrowd, solveCrowd, wantVelocity, comfortRadius, insidePoly, R_BODY, type CrowdItem, type ObstacleW } from './crowd';
import { cameraFor, toWorld, toScreen, worldAngleOfScreen, screenAngleOfWorld, Q, type World } from '../scene/camera';
import { emit, emitsNow, windIntegral } from './environment';
import { createAnimals, stepAnimals } from './animals';
import { stepClearing, newClearingState, type ClearingHost } from './clearing';
import { viewForDirection } from '../anim/skeleton';
import { stepCoopSnowman, startCoopSnowman } from '../activities/coopSnowman';
import { startSnowAngel, stepSnowAngel, abortSnowAngel, angelZoneFree, ANGEL_LIFE } from '../activities/snowAngel';
const TRAM_OUT_DY = 60;
import { tramGeo, stepTram, newTramState, tramMatrix, doorQuad, applyM, tramVisible, type TramGeo } from './tram';
import { stepBakery, newBakeryState, bakeryStartNow, TASK_LABEL, type BakeryHost, type BakeryTask } from './bakery';
import { createSkater, stepSkater, stepRinkEvents, separate, addTrails, skatePose, SKATE_PROFILES, TRAIL_LIFE, FALL_TOTAL, type IceGeo, type RinkState, type RinkCtx , forceRinkEvent, makeIceGeo, RINK_FALL_T0, rinkFallLen, LIFE_LABEL, insideW, clampToIce, type TrickKind } from './rink';
import { stepFalls, startFall, newFallsState, DEFAULT_FALLS, type FallHost, type FallsState } from './falls';
import { fallEndShift as fallEndShiftOf, type FallVariant } from '../anim/fallPoses';
import { stepSled, sledObstacles, sledPathProblem, type SledHost } from './sled';
import { forceMitten } from './mitten';
import { stepEpisode, newEpisodeState, episodeStartNow, type ActorHost } from './episodes';
import './ep/treeLot';
import './ep/decorate';
import './ep/lights';
import './ep/fort';
import './ep/ski';
import { stepPram, newPramState, pramObstacle, type PramHost } from './pram';
import { maybeCarryMitten, mittenBusy, stepMitten, type MittenHost } from './mitten';
import { stepSnowman, startSnowman, abortSnowman, finishSession, snowmanZoneFree, type SessionHost } from '../activities/snowman';
import { releaseArm as socialRelease, tryGesture } from '../social/social';
import { stepFight, startFight, stepBalls, fightZoneProblem } from '../activities/snowballFight';
import { canSip, clearGesturesFor, emptySocialWorld, endConversationOf, ensureSocial, greetPair, releaseArm, startConversation, stepAgentSocial, stepConversations, thanks, waveTo, type SocialEnv, type SocialWorld } from '../social/social';

export interface Diagnostic { level: 'warning' | 'error'; message: string; ref?: string }

const MAX_LOG = 400;

/** Otevřenost víka objektu v čase t (0–1, plynule). */
export function lidOpenness(state: SimState, objectId: string, t: number): number {
  const l = state.lids?.[objectId];
  if (!l) return 0;
  const k = Math.max(0, Math.min(1, (t - l.t0) / Math.max(1e-6, l.t1 - l.t0)));
  const e = k * k * (3 - 2 * k);
  return l.from + (l.to - l.from) * e;
}

export class Simulation {
  readonly graph: NavGraph;
  readonly res: Reservations;
  readonly diagnostics: Diagnostic[] = [];
  private diagSeen = new Set<string>();
  private objects: Map<string, SceneObject>;
  private zones: Map<string, ActivityZone>;
  private chars: Map<string, CharacterInstance>;
  private points = new Map<string, ResolvedPoint[]>();
  private pointIndex = new Map<string, ResolvedPoint>();
  private pathCache = new Map<string, boolean>();
  private ctx: SimContext;

  private constructor(readonly project: ProjectFile, readonly manifests: Record<string, CharacterManifest>, public state: SimState) {
    // vektorové postavy jsou nastavení scény (mění i kotvy chodidel → platí od vzniku simulace)
    setVectorFigures(VECTOR_ENV || project.scene.vectorFigures === true);
    setPaintedHeads(project.scene.paintedHeads === true);
    this.graph = buildNavGraph(project);
    this.objects = new Map(project.objects.map((o) => [o.id, o]));
    this.zones = new Map(project.zones.map((z) => [z.id, z]));
    this.chars = new Map(project.characters.map((c) => [c.id, c]));
    this.res = new Reservations(state);
    this.compilePoints();
    this.ctx = this.makeContext();
    this.staticDiagnostics();
    this.initHandHold();
  }

  /** Dvojice za ruce (ověřené při vzniku simulace): [vůdce, následník]. */
  private holdPairs: [string, string][] = [];
  private initHandHold() {
    for (const c of this.project.characters) {
      if (!c.holdHands || !c.companionId) continue;
      const l = this.chars.get(c.companionId); if (!l) continue;
      const A = headIdentity(l.appearance), B = headIdentity(c.appearance);
      const kids = A?.age === 'child' && B?.age === 'child';
      const couple = !!A && !!B && A.age === B.age && A.age !== 'child' && !!A.sex && !!B.sex && A.sex !== B.sex;
      if (kids || couple) this.holdPairs.push([l.id, c.id]);
      else this.addDiag('warning', `${c.name} a ${l.name}: za ruce jen dvě děti, nebo muž a žena stejného věku – dvojice půjde vedle sebe.`, c.id);
    }
  }
  /**
   * Držení za ruce: společný bod mezi oběma (ve výšce nižší z rukou – dosáhne i dítě), každý k němu
   * natáhne ruku na straně partnera. Plynulé navázání a uvolnění; jen když oba jdou spolu volně
   * (bez činnosti, předmětu, sedu, pádu) a jsou blízko.
   */
  private stepHandHold() {
    const cam = this.cam(), depth = this.project.scene.depth;
    for (const [lid, fid] of this.holdPairs) {
      const L = this.state.agents.find((x) => x.id === lid), F = this.state.agents.find((x) => x.id === fid);
      if (!L || !F) continue;
      const P = [L, F], ok = P.every((x) => !x.hidden && !x.activity && !x.anim.action && !x.anim.sit && !x.anim.fall && !x.anim.skate && !x.holding && (!x.anim.hands || x.anim.hands.src === 'hold'))
        && F.follow?.leaderId === L.id;
      const wl = toWorld(cam, L.pos), wf = toWorld(cam, F.pos), near = Math.hypot(wl.X - wf.X, wl.Z - wf.Z) < 1.3;
      const want = ok && near ? 1 : 0;
      // výška rukou (px nad zemí): zápěstí ≈ výška kyčle postavy
      const sc = P.map((x) => (this.chars.get(x.id)?.baseScale ?? 1) * depthScaleAt(depth, x.pos.y));
      const hip = P.map((x, i) => { const c = this.chars.get(x.id)!, m = this.manifests[c.assetId]; return (m ? gaitContextFor(m, { baseScale: 1, appearance: c.appearance, routine: c.routine }).legLen : 60) * 0.98 * sc[i]; });
      const M = { x: (L.pos.x + (L.off?.x ?? 0) + F.pos.x + (F.off?.x ?? 0)) / 2, y: (L.pos.y + (L.off?.y ?? 0) + F.pos.y + (F.off?.y ?? 0)) / 2 - Math.min(...hip) };
      P.forEach((x, i) => {
        const cur = x.anim.hands?.src === 'hold' ? x.anim.hands.w : 0, w = cur + Math.sign(want - cur) * Math.min(Math.abs(want - cur), SIM_DT / 0.5);
        if (w <= 0) { if (x.anim.hands?.src === 'hold') x.anim.hands = null; return; }
        const { view, mirror } = viewForDirection(x.anim.dir), ns = view === 'back3q' || view === 'back' ? 1 : -1;
        const lx = ((M.x - x.pos.x - (x.off?.x ?? 0)) / sc[i]) * (mirror ? -1 : 1), ly = (M.y - x.pos.y - (x.off?.y ?? 0)) / sc[i];
        // ruka na straně partnera (anatomicky): partner vlevo od směru chůze → levá ruka. Levá je vzdálená
        // (index 0), když postava jde v obraze doprava (vlevo od ní je hloubka scény), jinak blízká.
        const me = i === 0 ? wl : wf, other = i === 0 ? wf : wl;
        const hd = x.groundHeading ?? worldAngleOfScreen(cam, x.pos, x.facing);
        const cross = Math.cos(hd) * (other.Z - me.Z) - Math.sin(hd) * (other.X - me.X); // > 0 → partner vlevo
        const leftFar = Math.cos(hd) > 0;
        const idx: 0 | 1 = (cross > 0) === leftFar ? 0 : 1; void ns; void lx;
        const t: [HandTarget | null, HandTarget | null] = [null, null]; t[idx] = { u: 0, h: 0, local: { x: lx, y: ly } };
        x.anim.hands = { t, w, src: 'hold' };
      });
    }
  }

  /** Sestaví počáteční stav ze projektu (čas 0). */
  static create(project: ProjectFile, manifests: Record<string, CharacterManifest>): Simulation {
    const st: SimState = {
      version: SIM_STATE_VERSION, step: 0, rng: seedRng(project.seed, 'world'), agents: [], props: [], nextPropId: 1,
      reservations: {}, queues: {}, schedule: {}, removedObjects: [], binCounts: {}, log: [], stats: { cupsServed: 0, cupsDisposed: 0, sips: 0 },
    };
    const sim = new Simulation(project, manifests, st);
    for (const ev of project.schedule) st.schedule[ev.id] = { status: 'pending' };
    for (const c of project.characters) sim.spawnAgent(c);
    sim.linkPairs();
    sim.initVisitors();
    return sim;
  }

  /** Obnoví simulaci z checkpointu (stav musí odpovídat stejnému projektu). */
  static restore(project: ProjectFile, manifests: Record<string, CharacterManifest>, snapshot: SimState): Simulation {
    if (snapshot.version !== SIM_STATE_VERSION) throw new Error(`Checkpoint má nepodporovanou verzi stavu ${snapshot.version}.`);
    const sim = new Simulation(project, manifests, structuredClone(snapshot));
    for (const id of sim.state.removedObjects) sim.objects.delete(id);
    return sim;
  }

  time(): number { return this.state.step * SIM_DT; }
  snapshot(): SimState { return structuredClone(this.state); }
  stateHash(): string { return fingerprint(canonicalJson(this.state)); }

  /** Dopočítá simulaci do času `t` (jen vpřed). */
  advanceTo(t: number): void { const target = Math.round(t / SIM_DT); while (this.state.step < target) this.step(); }
  runSteps(n: number): void { for (let i = 0; i < n; i++) this.step(); }

  private addDiag(level: Diagnostic['level'], message: string, ref?: string) {
    const k = level + message;
    if (this.diagSeen.has(k)) return;
    this.diagSeen.add(k); this.diagnostics.push({ level, message, ref });
  }

  private staticDiagnostics() {
    const p = this.project;
    for (const b of this.graph.blocked) this.addDiag('warning', `Spojení trasy prochází překážkou „${b.obstacleName}“ a nebude použito.`, b.edgeId);
    for (const n of p.nav.nodes) if ((this.graph.out.get(n.id) ?? []).length === 0 && !p.nav.edges.some((e) => e.b === n.id || e.a === n.id))
      this.addDiag('warning', `Bod trasy „${n.name ?? n.id}“ není připojen k žádné trase.`, n.id);
    if (p.sled) {
      const cam = this.cam();
      const pr = sledPathProblem({ project: p, isSnow: (q) => p.areas.some((ar) => ar.kind === 'snow' && ar.polygon.length >= 3 && pointInPolygon(q, ar.polygon)) },
        this.graph.obstacles.map((o) => ({ name: o.name, poly: o.polygon.map((q) => toWorld(cam, q)) })));
      if (!p.characters.some((c) => c.id === p.sled!.parentId && c.routine === 'sled')) { this.sledBlocked = true; this.addDiag('warning', 'Sáňky: chybí postava rodiče (routine „sled“).'); }
      else if (pr) { this.sledBlocked = true; this.addDiag('warning', pr); }
    }
    for (const z of p.zones) {
      const r = getActivity(z.activityType);
      if (!r) { this.addDiag('warning', `Zóna „${z.name}“: neznámá činnost „${z.activityType}“ – zóna se nepoužije.`, z.id); continue; }
      for (const req of r.definition.requiredObjects) {
        const n = (z.objectRoles[req.role] ?? []).filter((id) => this.objects.has(id)).length;
        if (n < req.min) this.addDiag('warning', `Zóna „${z.name}“: chybí ${req.label.toLowerCase()} (role „${req.role}“).`, z.id);
      }
    }
    for (const pts of this.points.values()) for (const pt of pts) if (!pt.entryNode && pt.point.kind !== 'counter')
      this.addDiag('warning', `Interakční bod „${pt.point.label ?? pt.point.kind}“ objektu „${this.objects.get(pt.objectId)?.name}“ není dosažitelný ze sítě tras.`, pt.objectId);
    // Explicitní náhrady chybějících směrů a klipů (upozornění, nikdy tiché selhání).
    for (const assetId of new Set(p.characters.map((c) => c.assetId))) {
      const m = this.manifests[assetId]; if (!m) continue;
      for (const d of ALL_DIRECTIONS) { const r = resolveDirection(m, d); if (r.warning) this.addDiag('warning', r.warning, assetId); }
      for (const z of p.zones) {
        const def = getActivity(z.activityType)?.definition; if (!def) continue;
        if (!m.supportedActivities.includes(def.type)) this.addDiag('warning', `Postava „${m.name}“ neuvádí podporu činnosti „${def.label}“.`, assetId);
        for (const ph of def.phases) if (ph.animation) { const r = resolveClip(m, ph.animation); if (r.warning) this.addDiag('warning', r.warning + (r.clip ? '' : ' Použije se virtuální klip s výchozí délkou a událostmi.'), assetId); }
      }
    }
    for (const c of p.characters) {
      if (!this.graph.nodes.has(c.startNodeId)) this.addDiag('warning', `Postava „${c.name}“ nemá platný počáteční bod trasy a nebude v simulaci.`, c.id);
      if (!this.manifests[c.assetId]) this.addDiag('error', `Postava „${c.name}“: manifest postavy chybí.`, c.id);
    }
  }

  private compilePoints() {
    this.points.clear(); this.pointIndex.clear();
    for (const o of this.objects.values()) {
      if (!o.interaction || o.interaction.kind === 'none') continue;
      const list: ResolvedPoint[] = [];
      for (const pt of o.interaction.points) {
        const w = interactionPointWorld(o, pt);
        let entry: string | null = pt.navNodeId && this.graph.nodes.has(pt.navNodeId) ? pt.navNodeId : null;
        if (!entry) entry = nearestAccessibleNode(this.graph, w.pos);
        const rp: ResolvedPoint = { key: `${o.id}#${pt.id}`, objectId: o.id, point: pt, pos: w.pos, facing: w.facing, entryNode: entry };
        list.push(rp); this.pointIndex.set(rp.key, rp);
      }
      this.points.set(o.id, list);
    }
  }

  private spawnAgent(c: CharacterInstance) {
    const node = this.graph.nodes.get(c.startNodeId);
    const m = this.manifests[c.assetId];
    if (!node || !m) return;
    const rng = seedRng(this.project.seed, 'agent:' + c.id);
    const a: AgentState = {
      id: c.id, name: c.name, rng, pos: { x: node.x, y: node.y }, facing: Math.PI / 2 - 0.6, speed: 0,
      pace: 0, lane: 0, loc: { kind: 'node', nodeId: node.id }, route: null, arrived: false, look: null,
      anim: initialAnimState('SE'), holding: null, activity: null, pendingActivity: null,
      wander: { waitUntil: 0, prevNode: null, atStop: false }, cooldowns: {}, status: 'Stojí',
    };
    a.pace = randRange(a.rng, 0.9, 1.1);
    if (c.routine === 'sled' || c.routine === 'shovel' || c.routine === 'rider' || c.routine === 'pram' || c.routine === 'actor') a.hidden = true; // přijdou později zpoza okraje (nikdy nestojí u vstupu v prvním snímku)
    if (c.gaitProfile) { a.anim.elder = elderState(c.gaitProfile, c.caneSide ?? 'R', hashString(c.id)); a.pace = 1; }
    a.lane = (rand(a.rng) < 0.5 ? -1 : 1) * randRange(a.rng, 3, 7);
    a.anim.idleTime = randRange(a.rng, 0, 3);
    a.wander.waitUntil = randRange(a.rng, 0.3, 2.5);
    for (const [type, cfg] of Object.entries(c.activities)) if (cfg.enabled) a.cooldowns[type] = randRange(a.rng, cfg.firstDelayMin, cfg.firstDelayMax);
    this.state.agents.push(a);
  }

  /** Návštěvníci: část začíná ve scéně (rovnou se rozhodne), část přijde později vstupem. */
  private initVisitors() {
    const hasPortals = this.portals().length > 0;
    for (const a of this.state.agents) {
      const c = this.chars.get(a.id)!;
      if (c.routine !== 'visitor' || a.follow) continue;
      // nikdo nezačne na místě, kde už někdo stojí (překryv těl) – ten přijde později vstupem
      const cam = this.cam(), P = toWorld(cam, a.pos);
      const taken = this.state.agents.some((o) => o !== a && !o.hidden && (o.visit || o.follow) && (() => { const q = toWorld(cam, o.pos); return Math.hypot(q.X - P.X, q.Z - P.Z) < 2 * R_BODY + 0.1; })());
      if (hasPortals && (taken || rand(a.rng) < 0.35)) { a.hidden = true; a.visit = { mode: 'offstage', until: randRange(a.rng, 2, 25), since: 0 }; a.status = 'Mimo scénu'; }
      else a.visit = { mode: 'choose', until: randRange(a.rng, 0.3, 3), since: 0 };
    }
    for (const a of this.state.agents) if (a.follow) { const l = this.state.agents.find((x) => x.id === a.follow!.leaderId); if (l?.hidden) a.hidden = true; }
  }

  /** Dvojice: druhý člen začne vedle vůdce a dál ho následuje. */
  private linkPairs() {
    for (const c of this.project.characters) {
      if (!c.companionId || c.companionId === c.id) continue;
      const f = this.state.agents.find((x) => x.id === c.id), l = this.state.agents.find((x) => x.id === c.companionId);
      const lc = this.chars.get(c.companionId);
      if (!f || !l || !lc) { this.addDiag('warning', `${c.name}: postava do dvojice (${c.companionId}) neexistuje – chodí sama.`, c.id); continue; }
      if (lc.companionId) { this.addDiag('warning', `${c.name}: vůdce dvojice ${lc.name} sám někoho následuje – ${c.name} chodí sama.`, c.id); continue; }
      if (this.state.agents.some((x) => x.follow?.leaderId === l.id)) { this.addDiag('warning', `${c.name}: ${lc.name} už má dvojici – ${c.name} chodí sama.`, c.id); continue; }
      const side = c.companionSide === -1 ? -1 : 1;
      f.follow = { leaderId: l.id, side };
      // na volné místo ve formaci vedle vůdce (ve světových metrech; nikdy v překážce ani na jiné postavě)
      const cam = this.cam();
      f.facing = l.facing;
      const spot = this.freeSpot(f, this.formationSpots(l, side));
      if (spot) f.pos = toScreen(cam, spot);
      f.loc = l.loc; f.cooldowns = {};
    }
  }

  log(level: LogEntry['level'], msg: string, agentId?: string) {
    this.state.log.push({ t: Math.round(this.time() * 100) / 100, level, msg, agentId });
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
  }

  private anchorOf(a: AgentState): string { return a.loc.kind === 'node' ? a.loc.nodeId : a.loc.anchor; }

  private reachable(from: string, to: string): boolean {
    const k = from + '>' + to;
    let r = this.pathCache.get(k);
    if (r === undefined) { r = findPath(this.graph, from, to) !== null; this.pathCache.set(k, r); }
    return r;
  }

  /** Sestaví trasu z aktuální polohy postavy (bez teleportu: dokončí rozpracovaný úsek). */
  private buildRoute(a: AgentState, targetNode: string, finalPos: { x: number; y: number; key: string } | null): Waypoint[] | null {
    const prefix: Waypoint[] = [];
    let startNode = this.anchorOf(a);
    if (a.route) {
      const cur = a.route.wps[a.route.idx];
      prefix.push(cur);
      if (cur.nodeId) startNode = cur.nodeId;
      else { const prev = a.route.wps[a.route.idx - 1]; startNode = prev?.nodeId ?? startNode; const n = this.graph.nodes.get(startNode)!; prefix.push({ x: n.x, y: n.y, nodeId: startNode, edgeId: null }); }
      for (const e of a.route.heldEdges) this.res.release('edge:' + e, a.id);
    } else if (a.loc.kind === 'point') {
      const n = this.graph.nodes.get(startNode)!;
      prefix.push({ x: n.x, y: n.y, nodeId: startNode, edgeId: null });
    }
    const path = findPath(this.graph, startNode, targetNode);
    if (!path) return null;
    const wps = [...prefix];
    for (let i = 1; i < path.nodes.length; i++) { const n = this.graph.nodes.get(path.nodes[i])!; wps.push({ x: n.x, y: n.y, nodeId: n.id, edgeId: path.edges[i - 1] }); }
    if (finalPos) wps.push({ x: finalPos.x, y: finalPos.y, nodeId: null, edgeId: null });
    const clean = wps.filter((w, i) => i === 0 ? dist(w, a.pos) > 0.01 || wps.length === 1 : true);
    // nikdy čistě dopředu/dozadu: strmé úseky šikmo pod mezním úhlem (úzké průchody zůstávají rovné)
    return limitSlope(a.pos, clean, {
      maxDeg: this.project.scene.maxWalkSlopeDeg ?? 45, obstacles: this.graph.obstacles,
      keepStraight: (e) => !!e && !!this.graph.edges.get(e)?.narrow,
    });
  }

  private startRoute(a: AgentState, wps: Waypoint[], purpose: string, finalKey: string | null, anchor: string) {
    if (!wps.length) { a.arrived = true; return; }
    a.route = { wps, idx: 0, heldEdges: [], purpose, dest: finalKey ? { kind: 'point', anchor, pointKey: finalKey } : null };
    a.arrived = false;
  }

  private makeContext(): SimContext {
    const self = this;
    return {
      get project() { return self.project; },
      get graph() { return self.graph; },
      get state() { return self.state; },
      get res() { return self.res; },
      time: () => self.time(),
      object: (id) => (self.state.removedObjects.includes(id) ? undefined : self.objects.get(id)),
      zone: (id) => self.zones.get(id),
      manifest: (a) => self.manifests[self.chars.get(a.id)!.assetId],
      points: (oid, kind) => (self.state.removedObjects.includes(oid) ? [] : (self.points.get(oid) ?? []).filter((p) => !kind || p.point.kind === kind)),
      pointByKey: (k) => self.pointIndex.get(k),
      canReach: (a, p) => !!p.entryNode && self.reachable(self.anchorOf(a), p.entryNode),
      goToPoint(a, p, purpose) {
        if (a.loc.kind === 'point' && a.loc.pointKey === p.key && !a.route) { a.arrived = true; return true; }
        if (!p.entryNode) { self.addDiag('warning', `Bod „${p.point.label ?? p.point.kind}“ (${self.objects.get(p.objectId)?.name}) není dosažitelný.`, p.objectId); return false; }
        const wps = self.buildRoute(a, p.entryNode, { x: p.pos.x, y: p.pos.y, key: p.key });
        if (!wps) { self.log('warn', `${a.name} nemůže dojít k cíli „${self.objects.get(p.objectId)?.name}“ (cíl není dosažitelný po síti tras).`, a.id); self.addDiag('warning', `${a.name}: cíl „${self.objects.get(p.objectId)?.name}“ není dosažitelný.`, a.id); return false; }
        self.startRoute(a, wps, purpose, p.key, p.entryNode);
        a.look = p.facing !== undefined ? { angle: p.facing } : null;
        return true;
      },
      goToNode(a, nodeId, purpose) {
        const wps = self.buildRoute(a, nodeId, null);
        if (!wps) { self.log('warn', `${a.name} nemůže dojít do bodu trasy.`, a.id); return false; }
        self.startRoute(a, wps, purpose, null, nodeId);
        a.look = null;
        return true;
      },
      isMoving: (a) => a.route !== null,
      hasLid: (id) => { const o = self.objects.get(id); return !!o && !!self.project.assets.find((x) => x.id === o.assetId)?.lid; },
      animateLid(id, to, duration) {
        const lids = (self.state.lids ??= {});
        const now = self.time(), cur = lidOpenness(self.state, id, now);
        lids[id] = { from: cur, to, t0: now, t1: now + Math.max(0.01, duration) };
      },
      playAction(a, clip, defaults) {
        // nutná akce (pití, převzetí, koš) má přednost před gestem na stejné paži (C.7)
        const res = clip === 'lidDrop' ? ['arm0', 'arm1', 'head'] as const : clip === 'drink' ? ['arm1', 'head'] as const : ['receive', 'drop'].includes(clip) ? ['arm1'] as const : [];
        if (res.length) clearGesturesFor(a, [...res]);
        const w = playAction(a.anim, self.manifests[self.chars.get(a.id)!.assetId], clip, defaults);
        if (w) self.addDiag('warning', w);
      },
      stopAction: (a) => stopAction(a.anim),
      actionFinished: (a) => !a.anim.action || a.anim.action.finished,
      spawnProp(kind, place, extra) {
        const p: PropState = { id: `prop${self.state.nextPropId++}`, kind, place, appearedAt: self.time(), sips: 0, ...extra };
        self.state.props.push(p); return p;
      },
      prop: (id) => self.state.props.find((p) => p.id === id),
      handPosition: (a) => self.handPosition(a),
      log: (l, m, id) => self.log(l, m, id),
      rand: (a) => rand(a.rng),
      randRange: (a, lo, hi) => randRange(a.rng, lo, hi),
      isRemoved: (id) => self.state.removedObjects.includes(id),
      character: self.characterControl(),
      social: {
        converse: (members, kind) => { startConversation(self.socialWorld(), members, kind, self.project.seed, self.time()); },
        end: (a) => endConversationOf(self.socialWorld(), a.id, self.socialEnv()),
        canSip: (a, dur) => canSip(self.socialWorld(), a.id, self.time(), dur),
        releaseArm: (a, arm) => releaseArm(a, arm),
        thanks: (a) => thanks(a, self.time()),
        gesture: (a, fam, dur, dirY) => self.sessionHost().gesture(a, fam, { dur, hand: 1, dirY }),
      },
    };
  }

  /** Rozhraní pro řízení postavy (směr, rychlost, animace, předmět v ruce, schopnosti). */
  characterControl(): CharacterControl {
    const self = this;
    const man = (a: AgentState) => self.manifests[self.chars.get(a.id)!.assetId];
    return {
      setFacing(a, angle) { a.look = { angle }; },
      setSpeedFactor(a, f) { a.speedFactor = Math.max(0.2, Math.min(2.5, f)); },
      playAnimation(a, clip, o = {}) {
        const m = man(a);
        if (!m.clips[clip] && !m.clipFallbacks[clip]) { self.addDiag('warning', `${a.name}: animace „${clip}“ není podporována.`, a.id); return false; }
        const w = playAction(a.anim, m, clip, { duration: o.duration ?? m.clips[clip]?.duration ?? 1, loop: o.loop });
        if (w) self.addDiag('warning', w);
        return true;
      },
      attachToHand(a, propId) {
        const p = self.state.props.find((x) => x.id === propId); if (!p) return;
        p.place = { kind: 'held', agentId: a.id }; a.holding = p.id; a.holdingKind = p.kind;
      },
      detachFromHand(a) { const id = a.holding; a.holding = null; a.holdingKind = null; return id; },
      capabilities(a) {
        const m = man(a);
        const views = m.rigLibrary
          ? (() => { const t = m.rigLibrary.bodyTemplates[0]; return ALL_VIEWS.map((v) => ({ view: v, available: t.availableViews.includes(v), substitute: t.viewFallbacks[v]?.use })); })()
          : m.directions.map((d) => ({ view: d, available: true }));
        return { clips: Object.keys(m.clips), capabilities: [...m.capabilities], activities: [...m.supportedActivities], views };
      },
    };
  }

  /** Při došlapu uloží polohu paty ve scéně – od té chvíle je opora pevná ve světě. */
  private latchFootAnchors(a: AgentState, c: CharacterInstance, m: CharacterManifest, heelsNow: (Vec2 | null)[] | null = null): void {
    const an = a.anim.anchors;
    if (a.anim.settle && a.anim.walkBlend > 0) return; // dokročení: kotvy zůstávají (rozplynou se v kostře)
    if (!an || a.anim.settle || m.backend !== 'skeleton') { if (a.anim.anchorsXY) a.anim.anchorsXY = undefined; return; }
    const xy = (a.anim.anchorsXY ??= [null, null]);
    for (let i = 0; i < 2; i++) {
      if (an[i] == null) { xy[i] = null; continue; }
      if (xy[i]?.key === an[i]) continue;
      xy[i] = null;
      const hn = heelsNow?.[i];
      if (hn) xy[i] = { x: hn.x, y: hn.y, key: an[i]!, h: a.groundHeading ?? a.facing };
      else {
        const cv = characterVisual(a, m, c, this.project.scene);
        const hp = cv.pose.heelPts?.[i];
        if (hp) { const p = localToScene(cv, hp); xy[i] = { x: p.x, y: p.y, key: an[i]!, h: a.groundHeading ?? a.facing }; }
      }
      if (xy[i]) this.addFootprint(a, c, xy[i]!, i);
    }
    // hrot hole: při došlapu uložit polohu ve scéně (pak stojí, i když postava zatáčí)
    const e = a.anim.elder;
    if (e) {
      if (e.tip == null) e.tipXY = null;
      else if (e.tipXY?.key !== e.tip) {
        e.tipXY = null;
        const cv = characterVisual(a, m, c, this.project.scene), cn = cv.pose.cane;
        if (cn) { const p = localToScene(cv, cn.tip); e.tipXY = { x: p.x, y: p.y, key: e.tip }; }
      }
    }
  }

  /** Nový došlap ve sněhu → jedna stopa (pata je kotva; střed podrážky půl boty vpřed). */
  private addFootprint(a: AgentState, c: CharacterInstance, heel: { x: number; y: number; h?: number }, side: number) {
    if (!(a.snowDepth && a.snowDepth > 0) || a.hidden) return;
    const cam = this.cam(), H = toWorld(cam, heel), yaw = heel.h ?? 0, size = c.baseScale;
    const half = 0.151 * size * 0.5;
    const fp = { X: H.X + Math.cos(yaw) * half, Z: H.Z + Math.sin(yaw) * half, yaw, size, side, t0: this.time(), seed: (hashString(a.id) + this.state.step * 7 + side) >>> 0 };
    const list = (this.state.footprints ??= []);
    list.push(fp);
    if (list.length > FOOTPRINT_POOL) list.splice(0, list.length - FOOTPRINT_POOL); // deterministicky nejstarší
  }

  handPosition(a: AgentState) {
    const c = this.chars.get(a.id)!;
    const cv = characterVisual(a, this.manifests[c.assetId], c, this.project.scene);
    return localToScene(cv, cv.grip);
  }

  // ---------------------------------------------------------------- krok simulace
  step(): void {
    const t = this.time();
    this.stepSchedule(t);
    // 1) pohyb davu ve světových metrech (trasy, dvojice, předvídavé míjení, pevné rozestupy),
    // 2) animace a rozhodování
    this.stepCrowdMotion();
    this.stepSessions(t);
    for (const a of this.state.agents) this.stepAgent(a, t);
    this.stepSocial(t);
    this.stepVendors(t);
    if (this.project.characters.some((c) => c.pet) || this.project.cats?.length) stepAnimals((this.state.animals ??= createAnimals(this.project)), this.state.agents, this.project, t, SIM_DT, {
      snowing: this.project.scene.snowfall.enabled,
      dir: (this.state.animalDir ??= { nextDogs: 60, nextDogCat: 40 }),
      petter: (o, d) => {
        // přítel majitele (setkání, dvojice) stojící do 2 m od psa; jinak majitel sám
        const cam = this.cam(), D = toWorld(cam, d.pos);
        const near = (x: AgentState) => { const P = toWorld(cam, x.pos); return Math.hypot(P.X - D.X, P.Z - D.Z) < 2; };
        const free = (x: AgentState) => !x.hidden && !x.route && x.speed < 0.1 && !x.holding && !(x.anim.gestures ?? []).length && near(x) && !this.isChild(x);
        const friend = this.state.agents.find((x) => x.id !== o.id && (x.visit?.friendId === o.id || o.visit?.friendId === x.id || x.follow?.leaderId === o.id || o.follow?.leaderId === x.id) && free(x));
        // majitel sám: když jen čeká (fronta, příprava zboží), ne když platí nebo přebírá
        const waiting = !o.activity || (o.activity.type === 'shop' && (o.activity.phase === 'queue' || o.activity.phase === 'prepare'));
        return friend ?? (free(o) && waiting ? o : null);
      },
      startPet: (p, dur, dogPos) => { if (!this.sessionHost().gesture(p, 'pet', { dur })) return false; p.look = { ...dogPos }; this.log('info', `${p.name} hladí psa.`, p.id); return true; },
      endPet: (p) => { for (const g of p.anim.gestures ?? []) if (g.fam === 'pet') g.t = Math.max(g.t, g.dur * 0.88); if (p.look && !('angle' in p.look)) p.look = null; },
      puff: (x, y, n, t0, seed) => { const sc = depthScaleAt(this.project.scene.depth, y); for (let i = 0; i < n; i++) emit((this.state.particles ??= []), { kind: 'snowPuff', x: x + (i - n / 2) * 4 * sc, y, t0, life: 0.35 + ((i * 37) % 30) / 100, w0: 0, sc, seed: seed + i * 13 }); },
    });
    this.stepEnvironment(t);
    this.stepFlakes(t);
    // shozený sněhulák: hromádka sněhu po 2 min zapadne a objekt zmizí
    if (this.state.runtimeObjects?.some((o) => o.collapseAt !== undefined && t > o.collapseAt + 120)) this.state.runtimeObjects = this.state.runtimeObjects.filter((o) => !(o.collapseAt !== undefined && t > o.collapseAt + 120));
    if (this.project.sled && !this.sledBlocked) stepSled(this.sledHost(), (this.state.sled ??= { phase: 'offstage', until: this.project.sled.firstDelay ?? 40, dir: 1, n: 0, hist: [] }));
    if (this.project.clearing && this.project.characters.some((c) => c.id === this.project.clearing!.workerId)) stepClearing(this.clearingHost(), (this.state.clearing ??= newClearingState(this.project.clearing.firstDelay ?? 90)));
    if (this.state.mitten || this.state.agents.some((a) => a.holdingKind === 'mitten') || this.state.step % 60 === 0) stepMitten(this.mittenHost());
    if (this.project.falls || this.state.falls?.active.length) stepFalls(this.fallHost(), this.fallsState());
    if (this.project.rink) this.stepRink(t);
    if (this.project.tram) this.stepTramAll(t);
    if (this.project.bakery) this.stepBakeryAll(t);
    if (this.project.pram) this.stepPramAll();
    if (this.project.episodes?.length) this.stepEpisodes();
    if (this.holdPairs.length) this.stepHandHold();
    if (this.state.angels?.length && t - this.state.angels[0].t0 > ANGEL_LIFE) this.state.angels.shift();
    this.stepProps(t);
    this.state.step++;
  }

  // ---------------------------------------------------------------- tramvaj a cestující
  // (vystupující nejdřív sejde ze silnice šikmo dolů na chodník – o kolik px)
  // eslint-disable-next-line

  private tramG: TramGeo | null = null;
  tramGeometry(): TramGeo { return (this.tramG ??= tramGeo(this.project.tram!, (y) => depthScaleAt(this.project.scene.depth, y) / Q)); }
  private tramPpm = (y: number) => depthScaleAt(this.project.scene.depth, y) / Q;
  /** dveře stojící / jedoucí tramvaje: čtyřúhelník, bod na podlaze ve dveřích, bod na zemi před dveřmi */
  tramDoor(): { quad: Vec2[]; floor: Vec2; ground: Vec2 } | null {
    const c = this.project.tram, st = this.state.tram; if (!c || !st || !tramVisible(st)) return null;
    const { M } = tramMatrix(c, this.tramGeometry(), st.m, this.tramPpm), [x0, , x1, y1] = c.sprite.door;
    const quad = doorQuad(c, M), floor = applyM(M, (x0 + x1) / 2, y1 - 8), cam = this.cam(), w = toWorld(cam, floor);
    return { quad, floor, ground: toScreen(cam, { X: w.X, Z: w.Z - 0.75 }) };
  }
  /** Ladění: tramvaj přijede hned. */
  tramNow(): { ok: boolean; msg: string } { const st = this.state.tram; if (!st) return { ok: false, msg: 'Scéna nemá tramvaj.' }; if (st.phase !== 'wait') return { ok: false, msg: 'Tramvaj už jede.' }; st.until = this.time(); return { ok: true, msg: 'Tramvaj přijíždí.' }; }
  bakerNow(task?: BakeryTask): { ok: boolean; msg: string } { const st = this.state.bakery; if (!st) return { ok: false, msg: 'Scéna nemá pekárnu.' }; if (!bakeryStartNow(st, this.time(), task)) return { ok: false, msg: 'Pekař už je venku.' }; return { ok: true, msg: `Pekař jde ven${task ? ': ' + TASK_LABEL[task] : ''}.` }; }
  private stepTramAll(t: number) {
    const c = this.project.tram!, g = this.tramGeometry();
    const st = (this.state.tram ??= newTramState(c, seedRng(this.project.seed, 'tram'), t));
    const ag = this.state.agents, h = this.sessionHost();
    const inRole = (r: string) => ag.filter((a) => a.tram?.role === r && !a.hidden);
    const door = this.tramDoor();
    // výstup: po jednom, jen když ve dveřích nikdo není; vystupující je zpočátku ořezaný rámem dveří
    if (st.phase === 'alight' && door && st.alighted < st.nAlight && !inRole('alight').some((a) => a.clip) && !inRole('board').length) {
      const cand = ag.filter((a) => a.hidden && a.visit?.mode === 'offstage' && !this.chars.get(a.id)?.companionId && !ag.some((x) => x.follow?.leaderId === a.id) && this.chars.get(a.id)?.routine === 'visitor' && !this.chars.get(a.id)?.pet && this.crowdAllows(a, 'walkers'));
      const a = cand.length ? cand[Math.floor(rand(st.rng) * cand.length)] : null;
      if (a) {
        a.hidden = false; a.pos = { ...door.floor }; a.visPrev = undefined; a.off = { x: 0, y: 0 }; a.look = null; a.route = null;
        a.anim.walkBlend = 0; a.anim.settle = null; a.anim.anchors = undefined; a.anim.anchorsXY = undefined;
        a.clip = door.quad; a.tram = { role: 'alight', since: t }; a.visit = { mode: 'choose', until: 1e12, since: t };
        const out = { x: door.ground.x - 0.9 * (TRAM_OUT_DY), y: door.ground.y + TRAM_OUT_DY };
        h.walkPath(a, [door.ground, out], 'výstup z tramvaje'); a.speedFactor = 0.8; st.alighted++;
        this.log('info', `${a.name} vystupuje z tramvaje.`, a.id);
      } else st.alighted = st.nAlight; // nikdo k dispozici
    }
    for (const a of inRole('alight')) {
      if (a.clip && door && a.pos.y > door.floor.y + 6) a.clip = null;
      if (!a.route) { a.clip = null; a.tram = null; if (a.visit) { a.visit.until = t + 0.2; a.visit.leaveNext = rand(st.rng) < 0.6; } }
    }
    // nástup: čekající po jednom, až vystoupí všichni; u dveří se ořízne rámem a zmizí uvnitř
    const waiting = ag.filter((a) => a.tram?.role === 'wait' && !a.hidden && !a.route);
    if (st.phase === 'board' && door && st.boarded < st.nBoard && !inRole('alight').length && !inRole('board').length && waiting.length) {
      const a = waiting.sort((p, q) => (p.tram!.since - q.tram!.since))[0];
      if (a.tram!.spot !== undefined) this.res.release(`tram:spot:${a.tram!.spot}`, a.id);
      // (chodci nejdou v obraze strměji než 45°: nejdřív bokem, pak šikmo ke dveřím)
      const sg = Math.sign(a.pos.x - door.ground.x) || 1, dy = Math.max(0, a.pos.y - door.ground.y);
      a.tram = { role: 'board', step: 0, since: t }; h.walkPath(a, [{ x: door.ground.x + sg * dy * 1.05, y: a.pos.y }, door.ground], 'nástup do tramvaje'); a.speedFactor = 0.85; st.boarded++;
    }
    for (const a of inRole('board')) {
      if (a.route || !door) continue;
      if (a.tram!.step === 0) { a.tram!.step = 1; a.clip = door.quad; h.walkPath(a, [door.floor], 'nástup do tramvaje'); a.speedFactor = 0.5; }
      else { a.clip = null; a.tram = null; this.goOffstage(a, t); this.log('info', `${a.name} nastoupil(a) do tramvaje.`, a.id); }
    }
    const busy = inRole('alight').length + inRole('board').length;
    stepTram(c, g, st, t, SIM_DT, { alightDone: st.alighted >= st.nAlight && !inRole('alight').some((a) => a.clip), boardDone: (st.boarded >= st.nBoard || !waiting.length) && !inRole('board').length, doorClear: busy === 0 });
    // čekající se dívají směrem příjezdu (doprava); po 5 min čekání to vzdají
    for (const a of ag) if (a.tram?.role === 'wait' && !a.route && !a.hidden) {
      a.look = { angle: -0.15 }; a.status = st.phase === 'wait' || st.phase === 'in' ? 'Čeká na tramvaj' : 'Na zastávce';
      if (t - a.tram.since > 300) { if (a.tram.spot !== undefined) this.res.release(`tram:spot:${a.tram.spot}`, a.id); a.tram = null; a.look = null; this.leaveScene(a, t); }
    }
  }
  /** návštěvník zamíří na zastávku (volné čekací místo) */
  private goToTram(a: AgentState, t: number): boolean {
    const c = this.project.tram; if (!c) return false;
    const i = c.waitSpots.findIndex((_, k) => this.res.isFree(`tram:spot:${k}`));
    if (i < 0 || !this.res.tryReserve(`tram:spot:${i}`, a.id)) return false;
    const p = c.waitSpots[i];
    if (!this.sessionHost().goTo(a, p, 'na zastávku')) { this.sessionHost().walkPath(a, [p], 'na zastávku'); a.speedFactor = 1; }
    a.tram = { role: 'wait', spot: i, since: t + 60 }; a.visit = { mode: 'coffee', until: 0, since: t };
    return true;
  }
  // ---------------------------------------------------------------- pekař
  private bakeryHost: BakeryHost | null = null;
  /** Galerie aktivit: sáňky (A03) vyjedou hned. */
  sledNow(): { ok: boolean; msg: string } { const st = this.state.sled; if (!this.project.sled) return { ok: false, msg: 'Scéna nemá sáňky.' }; if (!st) return { ok: false, msg: 'Sáňky ještě nejsou připravené.' }; if (st.phase !== 'offstage') return { ok: false, msg: 'Sáňky už jedou.' }; st.until = this.time(); return { ok: true, msg: 'Rodič táhne dítě na sáňkách.' }; }
  /** Galerie aktivit: chodci upadne rukavice (A09). */
  mittenNow(): { ok: boolean; msg: string } {
    const W = this.project.scene.width;
    const a = this.state.agents.find((x) => !x.hidden && !x.holding && !x.activity && !x.follow && !this.isChild(x) && this.chars.get(x.id)?.routine === 'visitor' && !!x.route && x.pos.x > W * 0.2 && x.pos.x < W * 0.8 && !this.state.agents.some((k) => k.follow?.leaderId === x.id));
    if (!a) return { ok: false, msg: 'Nikdo vhodný právě neprochází.' };
    return forceMitten(this.mittenHost(), a) ? { ok: true, msg: `${a.name} za chvíli ztratí rukavici.` } : { ok: false, msg: 'Rukavice už ve scéně je.' };
  }
  /** Galerie aktivit: dítě začne chytat vločky (A10) – jen za sněžení. */
  flakesNow(): { ok: boolean; msg: string } { if (!this.project.scene.snowfall.enabled) return { ok: false, msg: 'Nesněží – vločky chytat nelze.' }; const st = (this.state.flakes ??= { next: 90, n: 0 }); if (st.kidId) return { ok: false, msg: 'Už chytá.' }; st.next = this.time(); return { ok: true, msg: 'Rodina se zastaví a dítě chytá vločky.' }; }
  /** Galerie aktivit: scénická epizoda (A13, A11, A12, A08, A01) začne hned. */
  episodeNow(id: string): { ok: boolean; msg: string } {
    const c = this.project.episodes?.find((e) => e.id === id); if (!c) return { ok: false, msg: 'Scéna tuto aktivitu nemá.' };
    const st = ((this.state.episodes ??= {})[id] ??= newEpisodeState(c));
    return episodeStartNow(st, this.time()) ? { ok: true, msg: 'Aktivita začíná.' } : { ok: false, msg: 'Aktivita už probíhá.' };
  }
  actorHostPublic(): ActorHost { return this.actorHost(); }
  private actorHostC: ActorHost | null = null;
  private actorHost(): ActorHost {
    const self = this;
    return (this.actorHostC ??= {
      project: this.project, time: () => self.time(), dt: SIM_DT, agent: (id) => self.state.agents.find((x) => x.id === id),
      walk: (x, pts, sp) => { self.sessionHost().walkPath(x, pts, 'epizoda', true); x.speedFactor = sp; },
      moving: (x) => x.route !== null,
      show: (x, p) => { x.pos = { ...p }; x.hidden = false; x.visPrev = undefined; x.off = { x: 0, y: 0 }; x.look = null; x.anim.walkBlend = 0; x.anim.settle = null; x.anim.anchors = undefined; x.anim.anchorsXY = undefined; },
      hide: (x) => { x.hidden = true; x.route = null; x.speed = 0; x.vel = { X: 0, Z: 0 }; x.anim.hands = null; x.anim.sit = null; x.look = null; },
      face: (x, p) => { x.look = p ? { x: p.x, y: p.y } : null; },
      hands: (x, tg, w = 1) => { x.anim.hands = tg && w > 0 ? { t: tg, w } : null; },
      pose: (x, kind, w = 1, t = 0, r) => { x.anim.sit = kind && w > 0.001 ? { kind: kind as never, t, dur: 1e9, w, r } : null; },
      gesture: (x, fam, dur) => self.sessionHost().gesture(x, fam as never, dur ? { dur } : {}),
      log: (m, id) => self.log('info', m, id),
    });
  }
  private stepEpisodes() {
    const h = this.actorHost();
    const eps = (this.state.episodes ??= {});
    for (const c of this.project.episodes!) {
      const busy = new Set(this.project.episodes!.filter((o) => o.id !== c.id && eps[o.id]?.phase === 'run').flatMap((o) => o.actors));
      stepEpisode(c, (eps[c.id] ??= newEpisodeState(c)), h, busy);
    }
  }
  /** Ladění: kočárek přijede hned. */
  pramNow(): { ok: boolean; msg: string } { const st = this.state.pram; if (!this.project.pram) return { ok: false, msg: 'Scéna nemá kočárek.' }; if (st && st.phase !== 'offstage') return { ok: false, msg: 'Kočárek už je ve scéně.' }; (this.state.pram ??= newPramState(this.project.pram)).until = this.time(); return { ok: true, msg: 'Přichází rodič s kočárkem.' }; }
  private pramHost: PramHost | null = null;
  private stepPramAll() {
    const c = this.project.pram!, st = (this.state.pram ??= newPramState(c)), self = this;
    this.pramHost ??= {
      project: this.project, time: () => self.time(), parent: () => self.state.agents.find((x) => x.id === c.parentId),
      walk: (x, pts, sp) => { self.sessionHost().walkPath(x, pts, 'kočárek', true); x.speedFactor = sp; },
      moving: (x) => x.route !== null,
      show: (x, p) => { x.pos = { ...p }; x.hidden = false; x.visPrev = undefined; x.off = { x: 0, y: 0 }; x.look = null; x.anim.walkBlend = 0; x.anim.settle = null; x.anim.anchors = undefined; x.anim.anchorsXY = undefined; },
      hide: (x) => { x.hidden = true; x.route = null; x.speed = 0; x.vel = { X: 0, Z: 0 }; x.anim.hands = null; x.anim.sit = null; },
      face: (x, p) => { x.look = { x: p.x, y: p.y }; },
      // madlo: obě dlaně před tělem ve výšce ~1 m (lokty mírně pokrčené)
      hands: (x, on, w) => { x.anim.hands = on ? { t: [{ u: 0.44, h: 1.1, lat: -0.2 }, { u: 0.44, h: 1.1, lat: 0.2 }], w } : null; },
      tuck: (x, w, tt) => { x.anim.sit = w > 0.001 ? { kind: 'tuck', t: tt, dur: 1e9, w } : null; },
      log: (m, id) => self.log('info', m, id),
    };
    stepPram(c, st, this.pramHost);
  }
  private stepBakeryAll(t: number) {
    const c = this.project.bakery!, a = this.state.agents.find((x) => x.id === c.bakerId); if (!a) return;
    const st = (this.state.bakery ??= newBakeryState(c, seedRng(this.project.seed, 'bakery'), t));
    const self = this;
    this.bakeryHost ??= {
      walk: (x, pts, sp) => { self.sessionHost().walkPath(x, pts, 'pekař', true); x.speedFactor = sp; },
      moving: (x) => x.route !== null,
      show: (x, p) => { x.pos = { ...p }; x.hidden = false; x.visPrev = undefined; x.off = { x: 0, y: 0 }; x.look = null; x.anim.walkBlend = 0; x.anim.settle = null; x.anim.anchors = undefined; x.anim.anchorsXY = undefined; },
      hide: (x) => { x.hidden = true; x.route = null; x.speed = 0; x.vel = { X: 0, Z: 0 }; },
      equip: (x, item) => {
        if (x.holding) { const hid = x.holding; self.state.props = self.state.props.filter((p) => p.id !== hid); x.holding = null; x.holdingKind = null; x.anim.tool = null; }
        if (!item) return;
        const kind = item === 'broom' ? 'shovel' : item;
        const p: PropState = { id: `prop${self.state.nextPropId++}`, kind, variant: item === 'broom' ? 'broom' : undefined, place: { kind: 'held', agentId: x.id }, appearedAt: self.time(), sips: 0 };
        self.state.props.push(p); x.holding = p.id; x.holdingKind = kind;
        if (item === 'broom') x.anim.tool = { u: 0.35, h: 0.55, beta: 1.25, crouch: 0, lean: 0 };
        // bedýnka: obě ruce u madel před tělem (kratší krok); kbelík řídí krok posypu
        if (item === 'crate') x.anim.hands = { t: [{ u: 0.3, h: 0.86, lat: -0.2 }, { u: 0.3, h: 0.86, lat: 0.2 }], w: 1 };
        else x.anim.hands = null;
      },
      hands: (x, tg, w) => {
        if (x.holdingKind === 'crate' && !tg) { x.anim.hands = { t: [{ u: 0.3, h: 0.86, lat: -0.2 }, { u: 0.3, h: 0.86, lat: 0.2 }], w: 1 }; return; }
        x.anim.hands = tg && w > 0 ? { t: tg, w } : null;
      },
      crouch: (x, w, tt) => { x.anim.sit = w > 0.001 ? { kind: 'lift', t: tt, dur: 1e9, w } : null; },
      log: (m, id) => self.log('info', m, id),
      face: (x, p) => { x.look = { x: p.x, y: p.y }; },
      ppm: (y) => self.tramPpm(y),
    };
    stepBakery(c, st, a, this.bakeryHost, t, SIM_DT);
    if (a.holdingKind === 'shovel' && !a.anim.tool) a.anim.tool = { u: 0.35, h: 0.55, beta: 1.25, crouch: 0, lean: 0 }; // nese koště
  }

  /** Ladění: rodina (rodič + dítě) hned začne stavět sněhuláka v první volné zóně. */
  /** Hustota davu (0–1, podíl chodců a bruslařů ve scéně) – mění se za běhu bez přestavění simulace. */
  setCrowd(c: { walkers?: number; skaters?: number }) { this.patchProject((p) => { p.crowd = { ...(p.crowd ?? {}), ...c }; }); }
  /** Úprava nastavení, které nemění minulý průběh (hustota, zdroje kouře): bez přestavění simulace. */
  patchProject(fn: (p: ProjectFile) => void) { const env = this.project.scene.environment; if (env) this.project.scene.environment = structuredClone(env); this.project.crowd = this.project.crowd ? { ...this.project.crowd } : undefined; fn(this.project); }
  /** smí postava (podle pořadí ve své skupině a hustoty davu) do scény? */
  private crowdAllows(a: AgentState, kind: 'walkers' | 'skaters'): boolean {
    const k = this.project.crowd?.[kind] ?? 1; if (k >= 0.999) return true;
    const pool = this.project.characters.filter((c) => (kind === 'skaters' ? !!c.skate && !c.skatePair : c.routine === 'visitor' && !c.skate && !c.companionId));
    const i = pool.findIndex((c) => c.id === a.id); if (i < 0) return true;
    return i < Math.round(pool.length * k);
  }
  /** Ladění: koulovačka hned (volná rodina, dětská sněhová kapsa). */
  startFightNow(): { ok: boolean; msg: string } {
    const h = this.sessionHost(), t = this.time();
    const zone = this.project.zones.find((z) => z.activityType === 'snowballFight' && z.enabled && !fightZoneProblem(h, z, true));
    if (!zone) return { ok: false, msg: 'Zóna koulovačky není volná.' };
    for (const k of this.state.agents.filter((x) => !x.hidden && x.follow && this.isChild(x) && !x.activity)) {
      const p = this.state.agents.find((x) => x.id === k.follow!.leaderId); if (!p || p.hidden || p.activity || p.holding) continue;
      p.route = null; k.route = null;
      if (this.startKidsFight(p, k, zone, t) || startFight(h, zone, k, p, true)) return { ok: true, msg: `${k.name} jde koulovat.` };
    }
    return { ok: false, msg: 'Ve scéně není volná rodina s dítětem.' };
  }
  /** Ladění: rodina jde udělat sněhového anděla (A07). */
  startSnowAngelNow(): { ok: boolean; msg: string } {
    const h = this.sessionHost();
    const zone = this.project.zones.find((z) => z.activityType === 'snowAngel' && angelZoneFree(h, z));
    if (!zone) return { ok: false, msg: 'Žádné volné místo na anděla (zóna „snowAngel“ na sněhu).' };
    for (const k of this.state.agents.filter((x) => !x.hidden && x.follow && this.isChild(x) && !x.activity)) {
      const p = this.state.agents.find((x) => x.id === k.follow!.leaderId);
      if (!p || p.hidden || p.activity || p.holding) continue;
      p.route = null; k.route = null;
      if (startSnowAngel(h, zone, p, k)) { p.visit = { mode: 'coffee', until: 0, since: this.time() }; return { ok: true, msg: `${k.name} jde dělat sněhového anděla.` }; }
    }
    return { ok: false, msg: 'Ve scéně není volná rodina (rodič s dítětem bez činnosti).' };
  }
  startCoopSnowmanNow(): { ok: boolean; msg: string } {
    const h = this.sessionHost();
    const zone = this.project.zones.find((z) => z.activityType === 'snowman' && !snowmanZoneFree(h, z));
    if (!zone) return { ok: false, msg: 'Žádná volná zóna pro sněhuláka (sníh, volné místo, nikdo nestaví).' };
    const kids = this.state.agents.filter((k) => !k.hidden && k.follow && this.isChild(k) && !k.activity);
    for (const k of kids) {
      const p = this.state.agents.find((x) => x.id === k.follow!.leaderId);
      if (!p || p.hidden || p.activity || p.holding) continue;
      p.route = null; k.route = null;
      if (startCoopSnowman(h, zone, p, k)) return { ok: true, msg: `${p.name} a ${k.name} staví sněhuláka.` };
    }
    return { ok: false, msg: 'Ve scéně není volná rodina (rodič s dítětem bez činnosti).' };
  }

  // ---------------------------------------------------------------- kluziště (bruslení)
  private rinkGeo: IceGeo | null = null;
  rinkGeometry(): IceGeo {
    if (this.rinkGeo) return this.rinkGeo;
    const cfg = this.project.rink!, cam = this.cam(), poly = cfg.ice.map((p) => toWorld(cam, p));
    const g = makeIceGeo(poly, toWorld(cam, cfg.gate)); if (cfg.entry) g.entryIce = toWorld(cam, cfg.entry.inIce);
    return (this.rinkGeo = g);
  }
  private stepRink(t: number) {
    const cfg = this.project.rink!, geo = this.rinkGeometry(), cam = this.cam();
    if (!this.state.rink) {
      const rng = seedRng(this.project.seed, 'rink');
      const st: RinkState = { sk: {}, trails: [], nextTrick: t + randRange(rng, ...(cfg.events?.trickEvery ?? [90, 150])), trickWindow: null, nextFall: t + randRange(rng, ...(cfg.events?.fallEvery ?? [100, 220])), event: null, lastTrickKind: null, lastTrickEnd: -1e9, lastFallEnd: -1e9, stats: { tricks: 0, tricksByKind: {}, falls: 0, wobbles: 0, deferred: 0, overlapEvents: 0, pushes: 0 }, rng };
      const skaters = this.project.characters.filter((c) => c.skate);
      // s nástupem: část bruslařů je na začátku na ledě (scéna začíná uprostřed dění), ostatní přijdou později
      const en = cfg.entry, onIce = new Set<string>();
      if (en) st.life = {};
      skaters.forEach((c) => {
        const lead = c.skatePair ? null : skaters.find((x) => x.skatePair === c.id); // dítě se řídí rodičem
        if (lead) return;
        const go = !en || rand(rng) < (en.startOnIce ?? 0.8);
        for (const id of [c.id, ...(c.skatePair ? [c.skatePair] : [])]) if (go) onIce.add(id);
      });
      const first = skaters.filter((c) => onIce.has(c.id));
      first.forEach((c, k) => { st.sk[c.id] = createSkater(c.id, c.skate!, geo, seedRng(this.project.seed, 'skate:' + c.id), k, first.length); });
      this.pairSkaters(st);
      this.state.rink = st;
      for (const a of this.state.agents) {
        const c = this.chars.get(a.id); if (!c?.skate) continue;
        a.route = null; a.activity = null; a.pendingActivity = null; a.follow = null;
        if (st.sk[a.id]) { a.onIce = true; a.hidden = false; a.visit = undefined; }
        else { a.onIce = false; a.hidden = true; a.visit = { mode: 'offstage', until: 1e12, since: t }; }
        if (st.life) st.life[a.id] = st.sk[a.id] ? { ph: 'ice', until: t + randRange(rng, ...(en!.session ?? [240, 600])) * randRange(rng, 0.25, 1), seat: null, n: 0, since: t } : { ph: 'away', until: t + randRange(rng, 5, 90), seat: null, n: 0, since: t };
      }
      // dvojice odchází a přichází spolu (časy dítěte podle rodiče)
      if (st.life) for (const c of skaters) if (c.skatePair && st.life[c.skatePair]) st.life[c.skatePair].until = st.life[c.id].until;
    }
    const st = this.state.rink!, all = Object.values(st.sk);
    const ctx: RinkCtx = { t, dt: SIM_DT, geo, all, st, cfg };
    const prev = new Map(all.map((s) => [s.id, { X: s.X, Z: s.Z }]));
    for (const s of all) stepSkater(s, ctx);
    stepRinkEvents(ctx);
    if (st.life) this.rinkLifeOnIce(st, t);
    separate(Object.values(st.sk));
    clampToIce(Object.values(st.sk), geo);
    if (st.event && all.filter((s) => ['FALL', 'TRICK', 'TRICK_PREPARE', 'TRICK_EXIT'].includes(s.st)).length > 1) st.stats.overlapEvents++;
    if (this.state.step % 3 === 0) for (const s of all) addTrails(st, s, t, prev.get(s.id)!);
    if (st.trails.length && t - st.trails[0].t0 > TRAIL_LIFE) st.trails.splice(0, st.trails.findIndex((q) => t - q.t0 <= TRAIL_LIFE) < 0 ? st.trails.length : st.trails.findIndex((q) => t - q.t0 <= TRAIL_LIFE));
    // agenti: poloha, natočení těla, pohled a póza z bruslaře
    for (const a of this.state.agents) {
      const s = st.sk[a.id]; if (!s) continue;
      const back = s.trick?.kind === 'backward' && Math.abs(s.spin ?? 0) > Math.PI / 2;
      const body = s.psi + (s.spin ?? 0), spinning = !!s.spin && (s.trick?.kind === 'spin' || s.trick?.kind === 'jump');
      a.pos = toScreen(cam, { X: s.X, Z: s.Z });
      a.groundHeading = body; a.facing = screenAngleOfWorld(cam, a.pos, body);
      a.speed = (s.v / Q) * this.scaleOf(a); a.vel = { X: Math.cos(s.psi) * s.v, Z: Math.sin(s.psi) * s.v };
      // změna pohledu jen mimo odraz (aby brusle neposkočila uprostřed kroku)
      const want = directionFromAngle(a.facing, a.anim.dir);
      if (want !== a.anim.dir && (!s.push.on || s.push.t < 0.05 || spinning || s.trick?.kind === 'backward')) a.anim.dir = want;
      a.anim.walkBlend = 0; a.anim.settle = null; a.anim.idleTime += SIM_DT;
      // partner (ruka v ruce): na které straně v obraze je
      let partnerSide = 0;
      if (s.holdHand && s.pair) {
        const o = st.sk[s.pair]; if (o) {
          const rx = o.X - s.X, rz = o.Z - s.Z, right = rx * Math.sin(body) - rz * Math.cos(body);
          const mirror = viewForDirection(a.anim.dir).mirror; const rightNear = !mirror;
          partnerSide = (right > 0) === rightNear ? 1 : -1;
        }
      }
      a.anim.skate = skatePose(s, t, { kidArm: this.isChild(a), partnerSide, backwardBody: back });
      if (s.st === 'FALL' || s.st === 'RECOVER') { const fv = s.fall?.v ?? 'back'; a.anim.fall = { v: fv, s: 1, t: RINK_FALL_T0 + (s.fall?.t ?? rinkFallLen(fv)) + (s.st === 'RECOVER' ? s.tSt : 0) }; }
      else a.anim.fall = null;
    }
  }
  /** dvojice rodič – dítě na ledě (ruka v ruce): rodič vedle dítěte */
  private pairSkaters(st: RinkState) {
    for (const c of this.project.characters) if (c.skate && c.skatePair && st.sk[c.id] && st.sk[c.skatePair]) {
      const p = st.sk[c.id], k = st.sk[c.skatePair];
      if (p.pair === k.id) continue;
      p.pair = k.id; k.pair = p.id; p.holdHand = true; k.holdHand = true;
      p.X = k.X - Math.sin(k.psi) * 0.55; p.Z = k.Z + Math.cos(k.psi) * 0.55; p.psi = k.psi;
    }
  }
  /** Na ledě: konec bruslení → odjezd ke vstupu; u vstupu sestoupí z ledu (dvojice až obě postavy spolu). */
  private rinkLifeOnIce(st: RinkState, t: number) {
    const life = st.life!;
    for (const s of Object.values(st.sk)) {
      const L = life[s.id]; if (!L || L.ph !== 'ice') continue;
      const ch = this.chars.get(s.id); if (ch && !ch.skatePair && L.until > t + 15 && !this.crowdAllows(this.state.agents.find((x) => x.id === s.id)!, 'skaters')) L.until = t + 15; // nad hustotu: brzy odjede
      const mate = s.pair ? st.sk[s.pair] : undefined;
      const ready = (x: typeof s) => x.st === 'SKATE' || x.st === 'MARCH' || x.st === 'REST';
      if (t >= L.until && s.st !== 'EXIT' && s.st !== 'OUT' && ready(s) && (!mate || ready(mate)) && st.event?.id !== s.id) {
        s.st = 'EXIT'; s.tSt = 0; s.trick = null; s.spin = 0;
        if (mate) { mate.st = 'EXIT'; mate.tSt = 0; }
      }
      const out = s.st === 'OUT' && (!mate || ((mate.st === 'OUT' || mate.st === 'EXIT') && Math.hypot(mate.X - s.X, mate.Z - s.Z) < 1.4));
      if (out) for (const id of [s.id, ...(mate ? [mate.id] : [])]) this.stepOffIce(st, id, t);
    }
  }
  /** Sestoupení z ledu: bruslař jde v bruslích k lavičce (rezervované místo), tam se přezuje. */
  private stepOffIce(st: RinkState, id: string, t: number) {
    const a = this.state.agents.find((x) => x.id === id)!, L = st.life![id];
    delete st.sk[id];
    if (st.event?.id === id) st.event = null;
    a.onIce = false; a.anim.skate = null; a.anim.fall = null; a.anim.bladesOn = true; a.anim.walkBlend = 0; a.anim.settle = null; a.anim.anchors = undefined; a.anim.anchorsXY = undefined;
    a.visit = { mode: 'skate', until: 0, since: t }; a.speed = 0; a.vel = { X: 0, Z: 0 };
    L.ph = 'toBench'; L.since = t; L.seat = null;
    this.goToBench(a, L, t);
  }
  /** místo na lavičce: rezervace + cesta (přes místo u vstupu, nebo po trasách), jinak čekání vedle */
  private goToBench(a: AgentState, L: { seat: string | null }, t: number, via?: Vec2) {
    const en = this.project.rink?.entry; if (!en) return false;
    const seats = this.pointsOf(en.benchId).filter((p) => p.point.kind === 'seat');
    const free = seats.find((p) => this.res.isFree(p.key, a.id));
    if (!free) { if (via) { this.sessionHost().walkPath(a, [via], 'k lavičce'); a.speedFactor = 0.5; } return false; }
    this.res.tryReserve(free.key, a.id); L.seat = free.key;
    if (via || this.project.rink?.entry && Math.hypot(a.pos.x - en.gate.x, a.pos.y - en.gate.y) < 140) { this.sessionHost().walkPath(a, [...(via ? [via] : [{ ...en.gate }]), free.pos], 'k lavičce'); a.speedFactor = a.anim.bladesOn ? 0.45 : 0.8; }
    else if (!this.sessionHost().goTo(a, free.pos, 'k lavičce')) { this.sessionHost().walkPath(a, [free.pos], 'k lavičce'); a.speedFactor = 0.8; }
    void t; return true;
  }
  private sitDown(a: AgentState, kind: 'rest' | 'change', dur: number) {
    const seat = this.state.rink?.life?.[a.id]?.seat ?? (a.visit?.seat ?? null), pt = seat ? this.pointsOf(seat.split('#')[0]).find((p) => p.key === seat) : undefined;
    if (pt && pt.facing !== undefined) { a.facing = pt.facing; a.anim.dir = directionFromAngle(a.facing, a.anim.dir); }
    a.anim.sit = { kind, t: 0, dur, w: 0, ...(pt ? { from: { ...a.pos }, to: { ...pt.pos } } : {}) }; a.anim.walkBlend = 0; a.anim.settle = null; a.speed = 0; a.vel = { X: 0, Z: 0 }; a.look = null;
  }
  /** po vstání: krok od lavičky na přístupový bod (cesta jinak vede přes lavičku) */
  private standAway(a: AgentState, seatKey: string | null | undefined, then: Vec2[] = [], purpose = 'od lavičky') {
    const pt = seatKey ? this.pointsOf(seatKey.split('#')[0]).find((p) => p.key === seatKey) : undefined;
    const n = pt?.entryNode ? this.graph.nodes.get(pt.entryNode) : undefined;
    if (n) { this.sessionHost().walkPath(a, [{ x: n.x, y: n.y }, ...then], purpose); a.loc = { kind: 'node', nodeId: n.id }; }
    else if (then.length) this.sessionHost().walkPath(a, then, purpose);
    a.speedFactor = a.anim.bladesOn ? 0.45 : 0.8;
  }
  /** průběh sedu: prolnutí sednutí (0,8 s) a vstávání (0,8 s); vrací true po skončení */
  private stepSit(a: AgentState): boolean {
    const s = a.anim.sit; if (!s) return true;
    s.t += SIM_DT; s.w = Math.min(1, s.t / 0.8, Math.max(0, (s.dur - s.t) / 0.8));
    if (s.from && s.to) { const k = Math.min(1, s.t / 0.8), e = k * k * (3 - 2 * k); a.pos = { x: s.from.x + (s.to.x - s.from.x) * e, y: s.from.y + (s.to.y - s.from.y) * e }; }
    if (s.t >= s.dur) { a.anim.sit = null; return true; }
    return false;
  }
  /** Mimo led: lavička, přezutí, nápoj / odchod, návrat, přezutí, vstup na led. */
  private stepSkaterLife(a: AgentState, c: CharacterInstance, t: number): boolean {
    const st = this.state.rink, L = st?.life?.[a.id], en = this.project.rink?.entry;
    if (!st || !L || !en || L.ph === 'ice') return false;
    const seatPt = () => (L.seat ? this.pointsOf(en.benchId).find((p) => p.key === L.seat) : undefined);
    const atSeat = () => { const p = seatPt(); return !!p && Math.hypot(a.pos.x - p.pos.x, a.pos.y - p.pos.y) < 112 * depthScaleAt(this.project.scene.depth, a.pos.y); };
    const mateId = c.skatePair ?? this.project.characters.find((x) => x.skatePair === a.id)?.id, isKid = !c.skatePair && !!mateId;
    switch (L.ph) {
      case 'toBench': case 'arrive': {
        if (!L.seat) { if (!this.goToBench(a, L, t)) { a.status = 'Čeká na volné místo na lavičce'; } return true; }
        if (!atSeat()) { const p = seatPt()!; this.sessionHost().walkPath(a, [p.pos], 'k lavičce'); a.speedFactor = 0.6; return true; }
        const dur = randRange(a.rng, 11, 17) * (this.isChild(a) ? 1.2 : 1);
        this.sitDown(a, 'change', dur); L.ph = L.ph === 'toBench' ? 'changeOff' : 'changeOn'; L.until = t + dur; L.since = t;
        return true;
      }
      case 'changeOff': case 'changeOn': {
        const done = this.stepSit(a);
        if (a.anim.sit && a.anim.sit.t > a.anim.sit.dur * 0.5) a.anim.bladesOn = L.ph === 'changeOn'; // druhá bota přezutá
        a.status = LIFE_LABEL[L.ph];
        if (!done) return true;
        const seatWas = L.seat;
        if (L.seat) this.res.release(L.seat, a.id); L.seat = null;
        if (L.ph === 'changeOn') {
          a.anim.bladesOn = true; L.ph = 'toGate'; L.since = t;
          this.standAway(a, seatWas, [{ ...en.gate }, { ...en.inIce }], 'ke vstupu na led');
          return true;
        }
        a.anim.bladesOn = false; L.n++;
        this.standAway(a, seatWas); L.ph = 'standUp'; L.since = t;
        return true;
      }
      case 'standUp': {
        // nápoj (jen dospělý bez dítěte), jinak odchod; děti a dvojice odcházejí spolu
        const zone = !mateId ? this.coffeeZone(a, c) : null;
        if (zone && rand(a.rng) < (en.drinkChance ?? 0.5)) {
          a.pendingActivity = { type: 'coffee', zoneId: zone.id, source: 'auto', sourceId: null };
          a.visit = { mode: 'coffee', until: 0, since: t }; L.ph = 'drink'; L.since = t; a.status = 'Jde si pro horký nápoj';
        } else { L.ph = 'leaving'; L.since = t; this.leaveScene(a, t); }
        return true;
      }
      case 'drink': {
        if (a.activity || a.pendingActivity) return false; // činnost řídí obvyklá logika
        L.ph = 'leaving'; L.since = t; this.leaveScene(a, t); return true;
      }
      case 'leaving': {
        if (a.visit?.mode === 'offstage' && a.hidden) {
          L.ph = 'away'; L.since = t; L.until = t + randRange(a.rng, ...(en.offIce ?? [60, 200]));
          if (mateId && isKid) { const ML = st.life![mateId]; if (ML) L.until = ML.ph === 'away' ? ML.until : L.until; }
          a.visit.until = 1e12;
          return true;
        }
        if (a.visit?.mode === 'choose' || a.visit?.mode === 'coffee') { this.leaveScene(a, t); return true; }
        return false; // odchod, cesta za okraj (obvyklá logika návštěvníka)
      }
      case 'away': {
        a.hidden = true; a.status = 'Mimo scénu';
        // dítě přichází s rodičem
        if (isKid) { const ML = mateId ? st.life![mateId] : undefined; if (!ML || ML.ph !== 'arrive') return true; }
        else if (t < L.until || !this.crowdAllows(a, 'skaters')) return true;
        if (mateId && !isKid && st.life![mateId]?.ph !== 'away') return true; // počkat, až bude dítě také venku
        // jen vstupy, odkud vede trasa k lavičce; dítě přichází stejným vstupem jako rodič
        const seat0 = this.pointsOf(en.benchId).find((p) => p.point.kind === 'seat');
        const bn = seat0?.entryNode ?? (seat0 ? nearestAccessibleNode(this.graph, seat0.pos) : null);
        const mateA = isKid && mateId ? this.state.agents.find((x) => x.id === mateId) : undefined;
        const only = mateA && mateA.loc.kind === 'node' ? [mateA.loc.nodeId] : this.portals().filter((p) => !bn || this.reachable(p, bn));
        this.enterScene(a, t, null, only.length ? only : undefined);
        if (a.hidden) return true;
        a.visit = { mode: 'skate', until: 0, since: t }; L.ph = 'arrive'; L.since = t; L.seat = null;
        return true;
      }
      case 'toGate': {
        // u vstupu: první krok na led (bruslař začne opatrně, dítě přešlapuje u mantinelu)
        const n = Object.keys(st.sk).length, s = createSkater(a.id, c.skate!, this.rinkGeometry(), seedRng(this.project.seed, `skate:${a.id}:${L.n}`), n, n + 1);
        const W = toWorld(this.cam(), a.pos), geo = this.rinkGeometry();
        s.X = W.X; s.Z = W.Z; s.psi = Math.atan2(geo.cz - W.Z, geo.cx - W.X); s.v = 0; s.cautiousUntil = t + 6;
        if (!insideW(W, geo.poly)) { const e = geo.entryIce ?? W; s.X = e.X; s.Z = e.Z; }
        st.sk[a.id] = s; this.pairSkaters(st);
        a.onIce = true; a.anim.bladesOn = false; a.route = null; a.visit = undefined; a.anim.sit = null;
        L.ph = 'ice'; L.since = t; L.until = t + randRange(a.rng, ...(en.session ?? [240, 600]));
        if (mateId && st.life![mateId]) st.life![mateId].until = isKid ? st.life![mateId].until : L.until;
        return true;
      }
    }
    return false;
  }

  /** Ladění kluziště: ruční pád / prvek (u vybrané postavy, jinak u vhodného bruslaře). */
  triggerRinkEvent(kind: 'fall' | 'trick', agentId?: string | null, trick?: TrickKind, near?: Vec2 | null): { ok: boolean; msg: string } {
    const st = this.state.rink; if (!st || !this.project.rink) return { ok: false, msg: 'Scéna nemá kluziště.' };
    const all = Object.values(st.sk);
    const r = forceRinkEvent({ t: this.time(), dt: SIM_DT, geo: this.rinkGeometry(), all, st, cfg: this.project.rink }, kind, agentId && st.sk[agentId] ? agentId : null, trick, near ? toWorld(this.cam(), near) : null);
    return r.ok ? { ok: true, msg: this.state.agents.find((a) => a.id === r.msg)?.name ?? r.msg } : r;
  }
  private rinkStatus(a: AgentState): string {
    const s = this.state.rink?.sk[a.id]; if (!s) return 'Na ledě';
    const lab: Record<string, string> = { SKATE: 'Bruslí', BRAKE: 'Brzdí', REST: 'Odpočívá u mantinelu', MARCH: 'Přešlapuje u mantinelu', WOBBLE: 'Zavrávoral', FALL: 'Upadl na led', RECOVER: 'Vstává', TRICK_PREPARE: 'Nájezd na prvek', TRICK: 'Předvádí prvek', TRICK_EXIT: 'Výjezd z prvku', ENTER: 'Vstupuje na led', EXIT: 'Odchází z ledu' };
    return `${SKATE_PROFILES[s.prof].label}: ${lab[s.st] ?? s.st}${s.trick && s.st.startsWith('TRICK') ? ` (${s.trick.kind === 'oneFoot' ? 'skluz na jedné noze' : 'jízda vzad'})` : ''}`;
  }

  // ---------------------------------------------------------------- pády
  private fallsState(): FallsState { return (this.state.falls ??= newFallsState(seedRng(this.project.seed, 'falls'), this.time(), this.fallHost().cfg)); }
  /**
   * Ladění: spustí pád u zadané postavy (nebo u vhodné postavy nejblíž středu obrazu). Vrací jméno
   * postavy, nebo popis, proč to nejde.
   */
  triggerFall(v: FallVariant, s: 1 | -1, opts: { agentId?: string | null; slow?: number; helper?: boolean; preferSnow?: boolean } = {}): string {
    const h = this.fallHost(), st = this.fallsState();
    if (st.active.length) return 'Už probíhá jiný pád.';
    let a = opts.agentId ? this.state.agents.find((x) => x.id === opts.agentId) : undefined;
    if (opts.agentId && (!a || a.hidden || a.anim.fall)) return 'Postava není ve scéně.';
    if (!a) {
      const W = this.project.scene.width, el = this.state.agents.filter((x) => h.eligible(x) || this.fallLoose(x));
      const snowPen = (x: AgentState) => (opts.preferSnow && !h.onSnow(x) ? 5000 : 0);
      el.sort((p, q) => Math.abs(p.pos.x - W / 2) + Math.abs(p.pos.y - 900) + snowPen(p) - (Math.abs(q.pos.x - W / 2) + Math.abs(q.pos.y - 900) + snowPen(q)));
      a = (opts.preferSnow ? el.find((x) => h.eligible(x) && h.onSnow(x)) ?? el.find((x) => h.onSnow(x)) : undefined) ?? el.find((x) => h.eligible(x)) ?? el[0];
    }
    if (!a) return 'Žádná vhodná postava (sama, volné ruce, bez činnosti).';
    startFall(h, st, a, v, s, { slow: opts.slow, helper: opts.helper });
    return a.name;
  }
  /** volnější podmínka pro ruční spuštění: viditelný dospělý bez činnosti a věcí v rukou */
  private fallLoose(a: AgentState): boolean {
    return !a.hidden && !a.activity && !a.holding && !a.follow && !a.anim.fall && !this.isChild(a) && !a.anim.elder && this.chars.get(a.id)?.routine !== 'shovel' && this.chars.get(a.id)?.routine !== 'sled' && this.chars.get(a.id)?.routine !== 'rider' && this.chars.get(a.id)?.routine !== 'pram' && this.chars.get(a.id)?.routine !== 'actor' && !(a.anim.gestures ?? []).length;
  }
  private fallCache: FallHost | null = null;
  private fallHost(): FallHost {
    const self = this, cam = () => self.cam();
    const solo = (a: AgentState) => !a.follow && !a.rejoin && !self.state.agents.some((x) => x.follow?.leaderId === a.id || x.rejoin?.leaderId === a.id) && !self.chars.get(a.id)?.pet;
    const w = (p: Vec2) => toWorld(cam(), p);
    const spaceFree = (a: AgentState) => {
      const P = w(a.pos);
      if (self.state.agents.some((o) => o !== a && !o.hidden && Math.hypot(w(o.pos).X - P.X, w(o.pos).Z - P.Z) < 1.6)) return false;
      for (let k = 0; k < 8; k++) { const q = toScreen(cam(), { X: P.X + Math.cos((k * Math.PI) / 4) * 1.0, Z: P.Z + Math.sin((k * Math.PI) / 4) * 1.0 }); if (self.graph.obstacles.some((o) => pointInPolygon(q, o.polygon))) return false; }
      return true;
    };
    return (this.fallCache ??= {
      time: () => self.time(), dt: SIM_DT, agents: () => self.state.agents,
      get cfg() { return { ...DEFAULT_FALLS, ...(self.project.falls ?? {}), weights: { ...DEFAULT_FALLS.weights, ...(self.project.falls?.weights ?? {}) } }; },
      eligible: (a) => {
        const c = self.chars.get(a.id);
        return !!c && c.routine === 'visitor' && a.visit?.mode === 'leave' && !!a.route && self.fallLoose(a) && solo(a) && a.anim.walkBlend > 0.95 && a.speed > 0
          && a.pos.x > 120 && a.pos.x < self.project.scene.width - 120 && spaceFree(a);
      },
      canHelpLoose: (x) => self.fallLoose(x) && !x.route?.purpose?.startsWith('pomoc') && self.chars.get(x.id)?.routine === 'visitor' && !x.follow && !self.state.agents.some((q) => q.follow?.leaderId === x.id),
      canHelp: (x) => { const c = self.chars.get(x.id); return !!c && c.routine === 'visitor' && x.visit?.mode === 'leave' && self.fallLoose(x) && solo(x); },
      distM: (p, q) => { const A = w(p), B = w(q); return Math.hypot(A.X - B.X, A.Z - B.Z); },
      contactsWorld: (a) => {
        const c = self.chars.get(a.id)!, cv = characterVisual(a, self.manifests[c.assetId], c, self.project.scene);
        return (cv.pose.fall?.contacts ?? []).filter((x) => !x.slide).map((x) => { const p = w(localToScene(cv, x.p)); return { X: p.X, Z: p.Z, kind: x.kind }; });
      },
      onSnow: (a) => (a.snowDepth ?? 0) > 0 || self.sessionHost().isSnow(a.pos),
      applyEndShift: (a) => {
        const c = self.chars.get(a.id)!, cv = characterVisual(a, self.manifests[c.assetId], c, self.project.scene), e = cv.pose.fall?.end;
        if (!e || !a.anim.fall) return;
        a.pos = { x: a.pos.x + (cv.mirror ? -e.x : e.x) * cv.scale, y: a.pos.y + e.y * cv.scale };
        a.anim.fall.du = fallEndShiftOf(a.anim.fall.v);
        a.anim.anchors = undefined; a.anim.anchorsXY = undefined; a.anim.settle = null; a.anim.walkBlend = 0; a.anim.startRest = null;
      },
      helperSpot: (f, hp) => { const P = w(f.pos), H = w(hp.pos), d = Math.hypot(H.X - P.X, H.Z - P.Z) || 1; return toScreen(cam(), { X: P.X + ((H.X - P.X) / d) * 0.85, Z: P.Z + ((H.Z - P.Z) / d) * 0.85 }); },
      walkTo: (a, p) => { self.sessionHost().walkPath(a, [p], 'pomoc'); a.speedFactor = 1; },
      offerHand: (a, f, dur) => { a.look = { x: f.pos.x, y: f.pos.y - 20 }; self.sessionHost().gesture(a, 'open', { dur, hand: 1 }); },
      resume: (a) => { a.speedFactor = 1; a.look = null; self.leaveScene(a, self.time()); },
      log: (m, id) => self.log('info', m, id),
    });
  }

  private sledBlocked = false;
  private sledCache: SledHost | null = null;
  private sledHost(): SledHost {
    const self = this, id = this.project.sled?.parentId;
    return (this.sledCache ??= {
      project: this.project, time: () => self.time(),
      parent: () => self.state.agents.find((x) => x.id === id),
      rider: () => (this.project.sled?.riderId ? self.state.agents.find((x) => x.id === this.project.sled!.riderId) : undefined),
      seat: (r, p, facing, accel) => {
        if (r.hidden) { r.hidden = false; r.visPrev = undefined; r.off = { x: 0, y: 0 }; r.route = null; r.look = null; r.anim.settle = null; r.anim.anchors = undefined; r.anim.anchorsXY = undefined; }
        r.pos = { ...p }; r.off = { x: 0, y: 0 }; r.speed = 0; r.vel = { X: 0, Z: 0 }; r.anim.walkBlend = 0;
        r.facing = facing; r.anim.dir = directionFromAngle(facing, r.anim.dir);
        const s0 = r.anim.sit; r.anim.sit = { kind: 'sled', t: (s0?.kind === 'sled' ? s0.t : 0) + SIM_DT, dur: this.project.sled?.kind === 'boby' ? 2e9 : 1e9, w: 1, r: accel };
        r.status = 'Veze se na sáňkách';
      },
      isSnow: (p) => self.sessionHost().isSnow(p),
      walkPath: (a, pts) => { self.sessionHost().walkPath(a, pts, 'sáňky'); a.speedFactor = 0.85; },
      hide: (a) => { a.hidden = true; a.route = null; a.speed = 0; a.vel = { X: 0, Z: 0 }; stopAction(a.anim); },
      show: (a, p) => { a.pos = { ...p }; a.hidden = false; a.visPrev = undefined; a.off = { x: 0, y: 0 }; a.look = null; a.anim.walkBlend = 0; a.anim.settle = null; a.anim.anchors = undefined; a.anim.anchorsXY = undefined; },
      log: (m, aid) => self.log('info', m, aid),
    });
  }

  private clearingCache: ClearingHost | null = null;
  private clearingHost(): ClearingHost {
    const self = this, id = this.project.clearing?.workerId, sh = () => this.sledHost();
    return (this.clearingCache ??= {
      project: this.project, time: () => self.time(),
      worker: () => self.state.agents.find((x) => x.id === id),
      others: () => self.state.agents.filter((x) => x.id !== id),
      walkPath: (a, pts, speed) => { self.sessionHost().walkPath(a, pts, 'odklízení', true); a.speedFactor = speed; },
      hide: (a) => sh().hide(a), show: (a, p) => sh().show(a, p),
      giveShovel: (a, on) => {
        if (on && !a.holding) { const p: PropState = { id: `prop${self.state.nextPropId++}`, kind: 'shovel', place: { kind: 'held', agentId: a.id }, appearedAt: self.time(), sips: 0 }; self.state.props.push(p); a.holding = p.id; a.holdingKind = 'shovel'; }
        if (!on && a.holdingKind === 'shovel') { const hid = a.holding; self.state.props = self.state.props.filter((p) => p.id !== hid); a.holding = null; a.holdingKind = null; a.anim.tool = null; }
      },
      puff: (X, Z, H, n) => {
        const cam = self.cam(), p = toScreen(cam, { X, Z }, H), sc = depthScaleAt(self.project.scene.depth, toScreen(cam, { X, Z }).y), t = self.time();
        for (let i = 0; i < n; i++) emit((self.state.particles ??= []), { kind: 'snowPuff', x: p.x, y: p.y, t0: t, life: 0.3 + (i % 3) * 0.12, w0: 0, sc, seed: Math.floor(t * 1000) + i * 29 });
      },
      log: (m, aid) => self.log('info', m, aid),
    });
  }

  private mittenCache: MittenHost | null = null;
  private mittenHost(): MittenHost {
    const self = this;
    return (this.mittenCache ??= {
      get state() { return self.state; }, project: this.project, seed: this.project.seed,
      time: () => self.time(), isChild: (a) => self.isChild(a), hand: (a) => self.handPosition(a),
      newPropId: () => `prop${self.state.nextPropId++}`,
      walkTo: (a, p) => { self.sessionHost().walkPath(a, [p], 'pro rukavici'); a.speedFactor = 0.8; },
      stopRoute: (a) => { for (const e of a.route?.heldEdges ?? []) self.res.release(edgeKey(e), a.id); a.route = null; a.speedFactor = 1; },
      scoop: (a) => self.sessionHost().gesture(a, 'scoop', { dur: 1.9 }),
      resume: (a) => { a.speedFactor = 1; a.look = null; self.leaveScene(a, self.time()); },
      log: (m, id) => self.log('info', m, id),
    });
  }

  // ---------------------------------------------------------------- společné činnosti
  private hostCache: SessionHost | null = null;
  sessionHost(): SessionHost {
    const self = this;
    return (this.hostCache ??= {
      get state() { return self.state; }, get res() { return self.res; }, get project() { return self.project; },
      time: () => self.time(),
      agent: (id) => self.state.agents.find((a) => a.id === id),
      goTo(a, p, purpose) {
        const entry = nearestAccessibleNode(self.graph, p);
        if (!entry) return false;
        const key = `free:${Math.round(p.x)},${Math.round(p.y)}`;
        const wps = self.buildRoute(a, entry, { x: p.x, y: p.y, key });
        if (!wps) return false;
        a.speedFactor = 1;
        self.startRoute(a, wps, purpose, key, entry);
        return true;
      },
      walkPath(a, pts, purpose, strict = false) {
        for (const e of a.route?.heldEdges ?? []) self.res.release(edgeKey(e), a.id);
        a.route = { wps: pts.map((p) => ({ x: p.x, y: p.y, nodeId: null, edgeId: null, ...(strict ? { strict: true } : {}) })), idx: 0, heldEdges: [], purpose, dest: null };
        a.arrived = false; a.speedFactor = 0.3; // tlačení koule: pomalu
      },
      moving: (a) => a.route !== null,
      gesture(a, fam, o = {}) {
        const ok = tryGesture(a, self.socialWorld(), self.time(), { fam, hand: o.hand ?? 1, sgn: o.sgn ?? 1, amp: 1, dir: o.dirY !== undefined ? { x: 1, y: o.dirY } : undefined });
        if (ok && o.dur) { const g = a.anim.gestures![a.anim.gestures!.length - 1]; g.dur = o.dur; }
        return ok;
      },
      releaseWork(a) {
        a.speedFactor = 1;
        for (const g of a.anim.gestures ?? []) if (g.fam === 'push' || g.fam === 'lift') g.t = Math.max(g.t, g.dur - 0.5);
        socialRelease(a, 0); socialRelease(a, 1);
      },
      log: (m, id) => self.log('info', m, id),
      isChild: (a) => self.isChild(a),
      isSnow: (p) => self.project.areas.some((ar) => ar.kind === 'snow' && ar.polygon.length >= 3 && pointInPolygon(p, ar.polygon)),
    });
  }
  private stepSessions(t: number) {
    if (this.state.props.some((p) => p.place.kind === 'flying')) stepBalls(this.sessionHost()); // koule vždy doletí
    if (!this.state.sessions?.length) return;
    const h = this.sessionHost();
    for (const s of [...this.state.sessions]) {
      const coop = s.type === 'snowman' && (s.data as { coop?: boolean }).coop;
      const r = coop ? stepCoopSnowman(h, s, this.zones.get(s.zoneId!)!) : s.type === 'snowman' ? stepSnowman(h, s) : s.type === 'snowballFight' ? stepFight(h, s) : s.type === 'snowAngel' ? stepSnowAngel(h, s) : 'running';
      if (r === 'running') continue;
      if (s.type === 'snowAngel') { if (r === 'aborted') abortSnowAngel(h, s); else finishSession(h, s); this.log('info', r === 'aborted' ? 'Sněhový anděl se přerušil.' : 'Sněhový anděl je hotový.'); }
      else if (s.type === 'snowman' && r === 'aborted' && !coop) { this.log('info', 'Stavba sněhuláka se přerušila.'); abortSnowman(h, s); }
      else { this.log('info', s.type === 'snowman' ? 'Sněhulák je hotový.' : r === 'aborted' ? 'Koulovačka se přerušila.' : 'Koulovačka skončila.'); finishSession(h, s); }
      // dítě (stálá dvojice) se po hře znovu připojí k rodiči
      for (const id of s.participantIds) {
        const ch = this.chars.get(id), x = this.state.agents.find((q) => q.id === id);
        if (ch?.companionId && x && !x.follow) x.rejoin = { leaderId: ch.companionId, side: ch.companionSide === -1 ? -1 : 1, permanent: true };
      }
      const d = (this.state.director ??= { nextSignificant: 0 });
      d.nextSignificant = t + randRange(this.state.rng, 90, 180);
    }
  }
  /** Průchod dveřmi budovy (dveře se otevřou kolem tohoto času). */
  private passDoor(t: number) { const d = (this.state.doorPasses ??= []); d.push(t); if (d.length > 8) d.shift(); }
  /** Je postava dítě (dětská šablona těla)? */
  isChild(a: AgentState): boolean {
    const c = this.chars.get(a.id);
    return !!c && (this.manifests[c.assetId]?.rig?.bodyTemplate ?? '').startsWith('child');
  }
  /** Volná zóna pro sněhuláka, pokud režisér zrovna dovolí výraznou událost. */
  private snowmanZoneAvailable(t: number, rnd = 0): { id: string; goal: 'snowman' | 'snowball' } | null {
    if ((this.state.director?.nextSignificant ?? 0) > t) return null;
    if (this.state.sessions?.length) return null; // nejvýš jedna výrazná událost
    const h = this.sessionHost();
    const cands = this.project.zones.filter((zz) => (zz.activityType === 'snowman' && !snowmanZoneFree(h, zz)) || (zz.activityType === 'snowballFight' && !fightZoneProblem(h, zz)));
    if (!cands.length) return null;
    const z = cands[Math.floor(rnd * cands.length) % cands.length];
    return { id: z.id, goal: z.activityType === 'snowman' ? 'snowman' : 'snowball' };
  }

  // ---------------------------------------------------------------- sociální vrstva
  socialWorld(): SocialWorld { return (this.state.social ??= emptySocialWorld()); }
  private socialEnvCache: SocialEnv | null = null;
  socialEnv(): SocialEnv {
    const self = this;
    if (!this.socialEnvCache) {
      const byId = () => new Map(self.state.agents.map((a) => [a.id, a]));
      let idx = byId(), idxStep = -1;
      this.socialEnvCache = {
        get now() { return self.time(); },
        seed: self.project.seed,
        agent(id) { if (idxStep !== self.state.step || idx.size !== self.state.agents.length) { idx = byId(); idxStep = self.state.step; } return idx.get(id); },
        queueStill: (a) => { const x = a as AgentState; return x.activity?.phase === 'queue' && x.social?.stillSince != null ? self.time() - x.social.stillSince : 0; },
        canWarmCup: (a) => { const x = a as AgentState; return x.activity?.type === 'coffee' && x.activity.phase === 'drink' && !x.anim.action; },
        pointTarget: (a) => self.pointTargetFor(a as AgentState),
        outward: (a, arm) => {
          const { view, mirror } = viewForDirection((a as AgentState).anim.dir);
          const ns = view === 'front3q' ? -1 : 1, sx = (arm === 0 ? -1 : 1) * ns;
          return mirror ? -sx : sx;
        },
      };
    }
    return this.socialEnvCache;
  }
  /** Co ukázat při povídání: nejbližší stánek nebo strom ve vzdálenosti 2–25 m. */
  private pointTargetFor(a: AgentState): Vec2 | null {
    const cam = cameraFor(this.project.scene), P = toWorld(cam, a.pos);
    let best: Vec2 | null = null, bd = Infinity;
    for (const o of this.project.objects) {
      if (!o.visible || o.layer !== 'world') continue;
      if (!o.seller && !/strom|tree|smrk/i.test(o.assetId + (o.name ?? ''))) continue;
      const W = toWorld(cam, { x: o.x, y: o.y }), d = Math.hypot(W.X - P.X, W.Z - P.Z);
      if (d < 2 || d > 25 || d >= bd) continue;
      bd = d; best = { x: o.x - a.pos.x, y: o.y - 120 - a.pos.y };
    }
    return best;
  }
  /** Rozhovor platí, dokud spolu účastníci stojí/jdou poblíž a jsou ve scéně. */
  private conversationValid(members: string[]): boolean {
    const real = members.filter((m) => !m.startsWith('v:')).map((m) => this.state.agents.find((a) => a.id === m));
    if (real.some((a) => !a || a.hidden)) return false;
    if (members.some((m) => m.startsWith('v:'))) return real.every((a) => (a!.activity?.phase === 'order'));
    if (real.length < 2) return false;
    const cam = cameraFor(this.project.scene);
    const P = real.map((a) => toWorld(cam, a!.pos));
    return Math.hypot(P[0].X - P[1].X, P[0].Z - P[1].Z) < 3.2;
  }
  private stepSocial(t: number) {
    const world = this.socialWorld(), env = this.socialEnv();
    for (const c of [...world.convs]) if (!this.conversationValid(c.members)) endConversationOf(world, c.members.find((m) => !m.startsWith('v:'))!, env);
    stepConversations(world, env);
    for (const a of this.state.agents) {
      const s = ensureSocial(a, this.project.seed);
      // fronta: jak dlouho postava stojí bez posunu
      if (a.activity?.phase === 'queue' && a.speed < 0.5) s.stillSince ??= t; else s.stillSince = undefined;
      stepAgentSocial(a, env, world, SIM_DT);
      if (a.anim.action?.requested === 'drink' && a.anim.speaking) world.stats.sipDuringSpeech++;
      if (!a.hidden && this.project.scene.environment) this.breathe(a, t);
    }
  }

  /** Dechová pára v mrazu: při řeči obláček každé ~2–3,5 s, při smíchu s pulzy (hustěji). Deterministické. */
  private breathe(a: AgentState, t: number) {
    const laughing = a.anim.gestures?.find((g) => g.fam === 'laugh');
    const speaking = !!a.anim.speaking;
    if (!speaking && !laughing) return;
    const period = laughing ? 0.42 : 2 + 1.5 * hashNoise(hashString(a.id), 31);
    const ph = hashNoise(hashString(a.id), 32) * period;
    if (Math.floor((t + ph) / period) === Math.floor((t - SIM_DT + ph) / period)) return;
    const c = this.chars.get(a.id), m = c ? this.manifests[c.assetId] : undefined;
    if (!c || !m) return;
    const cv = characterVisual(a, m, c, this.project.scene), mouth = localToScene(cv, { x: cv.pose.head.x + 4.5, y: cv.pose.head.y + 3 });
    const sc = depthScaleAt(this.project.scene.depth, a.pos.y);
    emit((this.state.particles ??= []), { kind: 'breath', x: mouth.x, y: mouth.y, t0: t, life: laughing ? 0.9 : 1.3, w0: windIntegral(this.project.seed, t, !!this.project.scene.environment?.gusts), sc, seed: Math.floor(t * 997) % 100000, vx: cv.mirror ? -1 : 1 });
  }

  private stepSchedule(t: number) {
    for (const ev of this.project.schedule) {
      const rt = this.state.schedule[ev.id] ?? (this.state.schedule[ev.id] = { status: 'pending' });
      if (rt.status !== 'pending' && rt.status !== 'waiting') continue;
      if (t < ev.time || (rt.nextTry !== undefined && t < rt.nextTry)) continue;
      const runner = getActivity(ev.activityType);
      const zones = this.project.zones.filter((z) => z.enabled && z.activityType === ev.activityType && (!ev.zoneId || z.id === ev.zoneId));
      const candidates = this.state.agents.filter((a) => (!ev.characterId || a.id === ev.characterId) && !a.activity && !a.pendingActivity && !a.follow);
      let started = false, reason = '';
      if (!runner || !zones.length) reason = 'činnost nebo zóna neexistuje';
      else if (!candidates.length) reason = ev.characterId ? 'postava je zaneprázdněná nebo neexistuje' : 'žádná volná postava';
      else {
        for (const a of candidates) {
          const zone = zones.find((z) => runner.canStart(this.ctx, a, z).ok);
          if (zone) { a.pendingActivity = { type: ev.activityType, zoneId: zone.id, source: 'schedule', sourceId: ev.id }; rt.agentId = a.id; started = true; break; }
        }
        if (!started) reason = 'místo činnosti není dostupné';
      }
      if (started) { rt.status = 'started'; this.log('info', `Plánovaná událost „${ev.name}“ spuštěna (${this.state.agents.find((x) => x.id === rt.agentId)?.name}).`); continue; }
      if (ev.onUnavailable === 'wait') {
        if (rt.status === 'pending') { rt.status = 'waiting'; rt.waitingSince = t; this.log('info', `Plánovaná událost „${ev.name}“ čeká: ${reason}.`); }
        if (t - (rt.waitingSince ?? t) >= ev.waitLimit) { rt.status = 'conflict'; this.log('warn', `Plánovaná událost „${ev.name}“: limit čekání ${ev.waitLimit} s vypršel (${reason}) – nespuštěna.`); }
        else rt.nextTry = t + 0.5;
      } else if (ev.onUnavailable === 'skip') { rt.status = 'skipped'; this.log('info', `Plánovaná událost „${ev.name}“ přeskočena: ${reason}.`); }
      else { rt.status = 'conflict'; this.log('warn', `KONFLIKT: plánovaná událost „${ev.name}“ nelze spustit: ${reason}.`); }
    }
  }

  private vmax(a: AgentState): number {
    const own = this.vmaxOwn(a);
    // vůdce dvojice jde tempem pomalejšího z dvojice
    const f = this.state.agents.find((x) => x.follow?.leaderId === a.id);
    return f ? Math.min(own, this.vmaxOwn(f) * 0.97) : own;
  }

  private vmaxOwn(a: AgentState): number {
    const c = this.chars.get(a.id)!;
    return this.walkSpeedOf(a) * a.pace * (a.speedFactor ?? 1) * depthScaleAt(this.project.scene.depth, a.pos.y) * c.baseScale;
  }

  /** Základní rychlost chůze (j/s). Senior: z profilu (krok × kadence) převedená stejně jako v animátoru,
   *  aby délka kroku a kadence odpovídaly zadání; ve sněhu o 15 % pomaleji (kratší kroky dopočítá animátor). */
  private walkSpeedOf(a: AgentState): number {
    const c = this.chars.get(a.id)!, e = a.anim.elder;
    if (!e) return c.walkSpeed;
    const m = this.manifests[c.assetId], L = gaitContextFor(m, c).legLen;
    return (elderSpeedOf(e) * L) / LEG_PHYS_M * ((a.snowDepth ?? 0) > 0 ? 0.85 : 1);
  }

  private scaleOf(a: AgentState): number {
    return this.chars.get(a.id)!.baseScale * depthScaleAt(this.project.scene.depth, a.pos.y);
  }

  private motion = new Map<string, { arrived: boolean; waitingNarrow: boolean }>();

  private cam() { return cameraFor(this.project.scene); }
  private obstaclesW: ObstacleW[] | null = null;
  private worldObstacles(): ObstacleW[] {
    if (!this.obstaclesW) { const c = this.cam(); this.obstaclesW = this.graph.obstacles.map((o) => ({ poly: o.polygon.map((p) => toWorld(c, p)) })); }
    const ro = this.state.runtimeObjects;
    const sl = this.state.sled?.phase === 'run' ? sledObstacles(this.sledHost(), this.state.sled, this.sledHost().parent()?.pos ?? null) : [];
    // bedýnka s pečivem venku (A18c) – chodci ji obejdou (0,5 × 0,3 m)
    const pr = pramObstacle(this.state.pram); if (pr) sl.push(pr);
    const cr = this.state.bakery?.crate;
    if (cr?.out && this.project.bakery?.crateSpot) { const C = toWorld(this.cam(), cr), w = 0.3, d = 0.2; sl.push({ poly: [{ X: C.X - w, Z: C.Z - d }, { X: C.X + w, Z: C.Z - d }, { X: C.X + w, Z: C.Z + d }, { X: C.X - w, Z: C.Z + d }] }); }
    if (sl.length) return [...this.obstaclesW, ...sl, ...this.runtimeObstacles()];
    if (!ro?.length) return this.obstaclesW;
    // sněhuláci: kolizní stopa (osmiúhelník kolem spodní koule); shozený už nepřekáží
    return [...this.obstaclesW, ...this.runtimeObstacles()];
  }

  private runtimeObstacles(): ObstacleW[] {
    const c = this.cam();
    return (this.state.runtimeObjects ?? []).filter((o) => !o.collapseAt).map((o) => { const P = toWorld(c, o), r = o.radii[0] + 0.05; return { poly: Array.from({ length: 8 }, (_, i) => ({ X: P.X + r * Math.cos((i * Math.PI) / 4), Z: P.Z + r * Math.sin((i * Math.PI) / 4) })) }; });
  }

  /** Rychlost chůze postavy v m/s (dvojice jde tempem pomalejšího). */
  private vmaxMps(a: AgentState): number {
    const own = (x: AgentState) => { const c = this.chars.get(x.id)!; return this.walkSpeedOf(x) * x.pace * (x.speedFactor ?? 1) * Q * c.baseScale; };
    const f = this.state.agents.find((x) => x.follow?.leaderId === a.id && !x.hidden);
    if (!f) return own(a);
    // druhý z dvojice zaostává (někdo mu vstoupil do cesty): vůdce zpomalí a počká
    const cam = this.cam(), A = toWorld(cam, a.pos), F = toWorld(cam, f.pos), lag = Math.hypot(A.X - F.X, A.Z - F.Z);
    const k = lag > 1.3 ? Math.max(0.35, 1 - (lag - 1.3) * 1.5) : 1;
    return Math.min(own(a), own(f) * 0.97) * k;
  }

  /**
   * Pohyb všech postav v jednom kroku (svět v metrech): záměr (trasa / formace / klid) →
   * předvídavý výběr rychlosti → společná bezpečná projekce → posun → postup po trase.
   */
  private stepCrowdMotion() {
    const cam = this.cam(), dt = SIM_DT;
    const items: CrowdItem[] = [];
    const ags: AgentState[] = [];
    const mvs: { arrived: boolean; waitingNarrow: boolean }[] = [];
    for (const a of this.state.agents) {
      const mv = { arrived: false, waitingNarrow: false };
      this.motion.set(a.id, mv);
      if (a.onIce) continue; // bruslaře řídí rink.ts
      a.off = undefined; a.speedCap = null;
      if (a.follow) {
        const leader = this.state.agents.find((x) => x.id === a.follow!.leaderId);
        if (!leader) { a.follow = null; }
        // vůdce už odešel za okraj: druhý z dvojice dojde za ním a zmizí až mimo obraz (ne uprostřed záběru)
        else if (leader.hidden && (a.hidden || this.isOffscreen(a.pos, this.chars.get(a.id)?.baseScale ?? 1))) { a.hidden = true; a.pos = { ...leader.pos }; a.speed = 0; a.vel = { X: 0, Z: 0 }; a.visPrev = undefined; continue; }
        else if (a.hidden) {
          // vstup do scény se stálým vůdcem: vedle něj (ne do stejného bodu)
          a.hidden = false; a.visPrev = undefined;
          const lp = toWorld(cam, leader.pos), side = a.follow.side;
          a.pos = toScreen(cam, this.freeSpot(a, [{ X: lp.X, Z: lp.Z + side * 0.7 }, { X: lp.X, Z: lp.Z - side * 0.7 }, ...this.formationSpots(leader, side)]) ?? { X: lp.X, Z: lp.Z + side * 0.7 });
        }
      }
      if (a.hidden) { a.speed = 0; a.vel = { X: 0, Z: 0 }; continue; }
      const P = toWorld(cam, a.pos);
      const vmax = this.vmaxMps(a);
      let pref: World = { X: 0, Z: 0 }, fixed = false;
      if (a.follow) {
        // daleko od vůdce (překážka mezi nimi): dojít k němu po trase, ne přímo
        const L = this.state.agents.find((x) => x.id === a.follow!.leaderId)!;
        const LP = toWorld(cam, L.pos), dL = Math.hypot(LP.X - P.X, LP.Z - P.Z), far = dL > 1.8; // zaostává (třeba za překážkou): dojít po trase, ne přímo
        if (far && (!a.route || this.state.step % 60 === 0)) {
          const near = nearestAccessibleNode(this.graph, a.pos), target = nearestAccessibleNode(this.graph, L.pos);
          if (near && target) { a.loc = { kind: 'node', nodeId: near }; a.route = null; const wps = this.buildRoute(a, target, { x: L.pos.x, y: L.pos.y, key: 'follow' }); if (wps?.length) this.startRoute(a, wps, 'za vůdcem', null, target); }
        }
        if (!far && a.route) { for (const e of a.route.heldEdges) this.res.release(edgeKey(e), a.id); a.route = null; }
        if (a.route) { const ri = this.routeIntent(a, P, vmax * 1.15); pref = ri.pref; mv.waitingNarrow = ri.waitingNarrow; }
        else pref = this.formationPref(a, P, vmax);
      }
      else if (a.route) { const ri = this.routeIntent(a, P, vmax); pref = ri.pref; mv.waitingNarrow = ri.waitingNarrow; }
      else fixed = true;
      // zdvořilé uhnutí (zácpa): krátký úkrok stranou, druhý projde
      if ((a.yieldT ?? 0) > 0 && a.yieldDir && (!fixed || !a.activity)) { fixed = false; pref = { X: a.yieldDir.X * Math.min(vmax, 0.55), Z: a.yieldDir.Z * Math.min(vmax, 0.55) }; a.yieldT = Math.max(0, (a.yieldT ?? 0) - dt); }
      const partner = a.follow?.leaderId ?? this.state.agents.find((x) => x.follow?.leaderId === a.id)?.id ?? null;
      const hd = a.groundHeading;
      items.push({ id: a.id, p: P, v: a.vel ?? { X: 0, Z: 0 }, pref, vmax, fixed, r: R_BODY, rc: comfortRadius(a.id), partnerOf: partner, choice: a.crowdChoice ?? null, blocked: a.blockedT ?? 0, head: hd === undefined ? null : { X: Math.cos(hd), Z: Math.sin(hd) } });
      ags.push(a); mvs.push(mv);
    }
    const obstacles = this.worldObstacles();
    if (this.state.step % 4 === 0) planCrowd(items, obstacles);
    const want = items.map((it) => wantVelocity(it, dt));
    const { v } = solveCrowd(items, want, obstacles, dt);
    // zácpa dvou: kdo čeká kratší dobu (shoda: vyšší id), udělá úkrok stranou mimo dráhu druhého
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = ags[i], B = ags[j];
      if ((A.blockedT ?? 0) < 1 || (B.blockedT ?? 0) < 1 || A.follow || B.follow || items[i].partnerOf === B.id) continue;
      const r = { X: items[j].p.X - items[i].p.X, Z: items[j].p.Z - items[i].p.Z }, d = Math.hypot(r.X, r.Z);
      if (d > 0.85 || d < 1e-6) continue;
      const aWins = (A.blockedT ?? 0) > (B.blockedT ?? 0) + 0.2 || (Math.abs((A.blockedT ?? 0) - (B.blockedT ?? 0)) <= 0.2 && A.id < B.id);
      const [L, W, iL, iW] = aWins ? [B, A, j, i] : [A, B, i, j];
      const n = { X: (items[iL].p.X - items[iW].p.X) / d, Z: (items[iL].p.Z - items[iW].p.Z) / d };
      const wp = items[iW].pref, perp1 = { X: -n.Z, Z: n.X };
      const side = perp1.X * wp.X + perp1.Z * wp.Z > 0 ? -1 : 1; // mimo směr, kam chce vítěz
      L.yieldDir = { X: perp1.X * side * 0.85 + n.X * 0.5, Z: perp1.Z * side * 0.85 + n.Z * 0.5 };
      const l = Math.hypot(L.yieldDir.X, L.yieldDir.Z); L.yieldDir = { X: L.yieldDir.X / l, Z: L.yieldDir.Z / l };
      L.yieldT = 1.1; L.blockedT = 0; W.blockedT = Math.max(W.blockedT ?? 0, 1.3);
    }
    // postava jdoucí k místu činnosti (např. stavitel sněhuláka) zablokovaná proti někomu, kdo jde s doprovodem
    // (nemá vlastní trasu, nemůže ji změnit): ustoupí ona
    for (let i = 0; i < items.length; i++) {
      const F = ags[i]; if (!F.follow) continue;
      for (let j = 0; j < items.length; j++) {
        const B = ags[j]; if (j === i || !B.activity || B.follow || !B.route || (B.blockedT ?? 0) < 1 || (B.yieldT ?? 0) > 0 || F.follow.leaderId === B.id) continue;
        const r = { X: items[j].p.X - items[i].p.X, Z: items[j].p.Z - items[i].p.Z }, d = Math.hypot(r.X, r.Z);
        if (d > 0.85 || d < 1e-6) continue;
        const n = { X: r.X / d, Z: r.Z / d }, bp = items[j].pref, perp = { X: -n.Z, Z: n.X };
        // šikmo vpřed (podle natočení těla – nikdy pozpátku) na stranu, kam stejně míří
        const side = perp.X * bp.X + perp.Z * bp.Z > 0 ? 1 : -1, gh = B.groundHeading ?? Math.atan2(bp.Z, bp.X), fw = { X: Math.cos(gh), Z: Math.sin(gh) };
        const y = { X: perp.X * side * 0.8 + fw.X * 0.6, Z: perp.Z * side * 0.8 + fw.Z * 0.6 }, l = Math.hypot(y.X, y.Z);
        B.yieldDir = { X: y.X / l, Z: y.Z / l }; B.yieldT = 1.1; B.blockedT = 0;
      }
    }
    // stojící člověk (čeká, kouká – bez trasy a bez činnosti) v cestě zablokovanému: ustoupí stranou
    for (let i = 0; i < items.length; i++) {
      const A = ags[i]; if ((A.blockedT ?? 0) < 1.5 || !A.route) continue;
      const pa = items[i].pref, pl = Math.hypot(pa.X, pa.Z); if (pl < 1e-6) continue;
      for (let j = 0; j < items.length; j++) {
        const B = ags[j]; if (j === i || B.route || B.activity || B.follow || (B.yieldT ?? 0) > 0 || items[i].partnerOf === B.id) continue;
        const r = { X: items[j].p.X - items[i].p.X, Z: items[j].p.Z - items[i].p.Z }, d = Math.hypot(r.X, r.Z);
        if (d > 0.9 || (r.X * pa.X + r.Z * pa.Z) / (d * pl) < 0.3) continue; // jen kdo stojí přede mnou
        const perp = { X: -pa.Z / pl, Z: pa.X / pl }, side = perp.X * r.X + perp.Z * r.Z >= 0 ? 1 : -1;
        B.yieldDir = { X: perp.X * side, Z: perp.Z * side }; B.yieldT = 1.4; A.blockedT = 1.0;
        for (const f of this.state.agents) if (f.follow?.leaderId === B.id) { f.yieldDir = B.yieldDir; f.yieldT = 1.4; } // s dítětem / psem spolu
      }
    }
    for (let i = 0; i < items.length; i++) {
      const a = ags[i], it = items[i];
      a.crowdChoice = it.choice ?? null;
      { const vs = Math.hypot(v[i].X, v[i].Z), ps = Math.hypot(it.pref.X, it.pref.Z);
        a.blockedT = !it.fixed && !!a.route && !(a.yieldT ?? 0) && ((ps > 0.15 && vs < 0.33 * ps) || vs < 0.08) ? (a.blockedT ?? 0) + dt : 0; }
      a.vel = v[i];
      const P = { X: it.p.X + v[i].X * dt, Z: it.p.Z + v[i].Z * dt };
      if (!it.fixed) a.pos = toScreen(cam, P);
      const sp = Math.hypot(v[i].X, v[i].Z);
      a.speed = (sp / Q) * this.scaleOf(a); // px/s v místě postavy (pro animaci a stav)
      // natočení: za skutečným pohybem; v klidu k bodu pohledu
      let psi = a.groundHeading ?? worldAngleOfScreen(cam, a.pos, a.facing);
      if (sp > 0.12) psi = approachAngle(psi, Math.atan2(v[i].Z, v[i].X), 5 * dt);
      else if (a.turnTo !== undefined && a.turnTo !== null && sp < 0.02) psi = approachAngle(psi, a.turnTo, 3.5 * dt); // otáčet až po zastavení
      else if (!a.route && !a.follow && a.look && sp < 0.02) {
        const target = 'angle' in a.look ? a.look.angle : Math.atan2(a.look.y - a.pos.y, a.look.x - a.pos.x);
        psi = approachAngle(psi, worldAngleOfScreen(cam, a.pos, target), 2.2 * dt);
      }
      a.groundHeading = psi;
      a.facing = screenAngleOfWorld(cam, a.pos, psi);
      // sníh pod postavou (oblasti typu „sníh“)
      const snow = this.project.areas.find((ar) => ar.kind === 'snow' && pointInPolygon(a.pos, ar.polygon));
      a.snowDepth = snow ? snow.snowDepthM ?? 0.02 : 0;
      if (a.route) { const dest = a.route.dest; if (this.routeAdvance(a, P, sp, mvs[i])) { mvs[i].arrived = true; if (dest) a.loc = dest; } }
    }
  }

  /** Volné místo pro postavu: první z kandidátů (svět), které není v překážce ani na jiné postavě. */
  private freeSpot(self: AgentState, cands: World[]): World | null {
    const cam = this.cam();
    for (const c of cands) {
      if (this.worldObstacles().some((o) => insidePoly(c, o.poly))) continue;
      if (this.state.agents.some((o) => o !== self && !o.hidden && (() => { const q = toWorld(cam, o.pos); return Math.hypot(q.X - c.X, q.Z - c.Z) < 2 * R_BODY + 0.05; })())) continue;
      return c;
    }
    return null;
  }

  /** Místa formace vedle vůdce (vpravo/vlevo, za ním, rovnou za ním). */
  private formationSpots(L: AgentState, side: number): World[] {
    const cam = this.cam(), LP = toWorld(cam, L.pos), psi = L.groundHeading ?? worldAngleOfScreen(cam, L.pos, L.facing);
    const d = { X: Math.cos(psi), Z: Math.sin(psi) }, right = { X: d.Z, Z: -d.X };
    const at = (r: number, b: number) => ({ X: LP.X + right.X * r - d.X * b, Z: LP.Z + right.Z * r - d.Z * b });
    return [at(side * 0.72, 0.4), at(-side * 0.72, 0.4), at(0, 0.85), at(side * 0.6, 1.0), at(-side * 0.6, 1.0), at(0, 1.4)];
  }

  /** Druhý člen dvojice: místo vedle vůdce (a kousek za ním), sladěná rychlost. */
  private formationPref(f: AgentState, P: World, vmax: number): World {
    const cam = this.cam();
    const L = this.state.agents.find((x) => x.id === f.follow!.leaderId)!;
    const LP = toWorld(cam, L.pos), lv = L.vel ?? { X: 0, Z: 0 }, lsp = Math.hypot(lv.X, lv.Z);
    const psi = L.groundHeading ?? 0;
    const d = { X: Math.cos(psi), Z: Math.sin(psi) }, right = { X: d.Z, Z: -d.X };
    const side = f.follow!.side;
    // dvojice za ruce: při chůzi napříč obrazem by boční rozestup (do hloubky) postavy překryl – partner
    // jde blíž do strany a o kus víc vzadu, takže jsou v obraze vedle sebe a spojené ruce jsou vidět
    const hold = this.holdPairs.some(([, fid]) => fid === f.id), hx = hold ? Math.abs(d.X) : 0;
    const lat = 0.72 * (1 - 0.3 * hx), back = 0.4 + 0.32 * hx;
    const slot = { X: LP.X + right.X * side * lat - d.X * back, Z: LP.Z + right.Z * side * lat - d.Z * back };
    const e = { X: slot.X - P.X, Z: slot.Z - P.Z }, el = Math.hypot(e.X, e.Z);
    let v: World;
    if (lsp > 0.15) v = { X: lv.X + e.X * 1.2, Z: lv.Z + e.Z * 1.2 };
    else v = el < 0.08 ? { X: 0, Z: 0 } : { X: e.X * 1.0, Z: e.Z * 1.0 };
    const vl = Math.hypot(v.X, v.Z), m = lsp > 0.15 ? vmax * 1.3 : vmax * 0.7;
    return vl > m ? { X: (v.X / vl) * m, Z: (v.Z / vl) * m } : v;
  }

  /** Záměr po trase: preferovaná rychlost k bodu 1 m dopředu, brzdění, zatáčky, úzké průchody. */
  private routeIntent(a: AgentState, P: World, vmax: number): { pref: World; waitingNarrow: boolean } {
    const cam = this.cam(), r = a.route!, wps = r.wps;
    const W = wps.map((w) => toWorld(cam, w));
    const dist = (p: World, q: World) => Math.hypot(p.X - q.X, p.Z - q.Z);
    const remaining = (from: number, to: number) => { let d = dist(P, W[from]); for (let k = from; k < to; k++) d += dist(W[k], W[k + 1]); return d; };
    const sp = Math.hypot(a.vel?.X ?? 0, a.vel?.Z ?? 0);
    // úzké průchody: rezervace před vstupem
    let effEnd = wps.length - 1;
    for (let k = r.idx - 1; k < wps.length - 1; k++) {
      const e = wps[k + 1].edgeId;
      if (!e || !this.graph.edges.get(e)?.narrow || r.heldEdges.includes(e)) continue;
      const kk = Math.max(k, r.idx - 1);
      const dToK = k < r.idx ? 0 : remaining(r.idx, k);
      if (dToK <= (sp * sp) / (2 * 1.4) + 0.6 && this.res.tryReserve(edgeKey(e), a.id)) { r.heldEdges.push(e); continue; }
      effEnd = kk;
      break;
    }
    if (effEnd === r.idx - 1) { a.turnTo = null; return { pref: { X: 0, Z: 0 }, waitingNarrow: true }; }
    // bod ~1 m dopředu podél trasy
    let left = 1.0, cur = P, k = r.idx, target = W[r.idx];
    while (k <= effEnd) {
      const d = dist(cur, W[k]);
      if (d >= left) { target = { X: cur.X + ((W[k].X - cur.X) / d) * left, Z: cur.Z + ((W[k].Z - cur.Z) / d) * left }; break; }
      left -= d; cur = W[k]; target = W[k];
      if (r.wps[k].strict) break; // obratový bod: dojít k němu, nezkracovat zatáčku
      k++;
    }
    const dEnd = remaining(r.idx, effEnd);
    let v = Math.min(vmax, Math.sqrt(2 * 1.4 * Math.max(0, dEnd - 0.02)) + 0.04);
    if (r.idx < effEnd) {
      const prev = r.idx > 0 ? W[r.idx - 1] : P, A = W[r.idx], B = W[r.idx + 1];
      const turn = Math.abs(wrapAngle(Math.atan2(B.Z - A.Z, B.X - A.X) - Math.atan2(A.Z - prev.Z, A.X - prev.X)));
      const vc = vmax * Math.max(0.35, Math.min(1, 1 - turn / 2.4));
      v = Math.min(v, Math.sqrt(vc * vc + 2 * 1.4 * dist(P, A)));
    }
    const dx = target.X - P.X, dz = target.Z - P.Z, dl = Math.hypot(dx, dz);
    if (dl < 1e-6) return { pref: { X: 0, Z: 0 }, waitingNarrow: false };
    // nechodit bokem ani pozpátku: při velkém rozdílu směru se nejdřív otočit na místě
    const want = Math.atan2(dz, dx), psi = a.groundHeading ?? want;
    const diff = Math.abs(wrapAngle(want - psi));
    // obrat: zastavit, otočit se na místě, pak vykročit (opěrná noha nezůstane daleko vzadu)
    if (diff > 1.75 && sp >= 0.15) { a.turnTo = null; return { pref: { X: 0, Z: 0 }, waitingNarrow: false }; }
    if (sp < 0.15 && diff > 1.2) { a.turnTo = want; return { pref: { X: 0, Z: 0 }, waitingNarrow: false }; }
    a.turnTo = null;
    return { pref: { X: (dx / dl) * v, Z: (dz / dl) * v }, waitingNarrow: false };
  }

  /** Postup po trase po posunu: průchod body, uvolnění úzkých průchodů, příchod do cíle. */
  private routeAdvance(a: AgentState, P: World, sp: number, mv: { arrived: boolean }): boolean {
    const cam = this.cam(), r = a.route!, wps = r.wps;
    for (;;) {
      const wp = wps[r.idx], Wk = toWorld(cam, wp), last = r.idx >= wps.length - 1;
      const d = Math.hypot(P.X - Wk.X, P.Z - Wk.Z);
      let passed = d < (last ? 0.06 : wp.strict ? 0.22 : 0.35);
      if (!passed && !last && !wp.strict) {
        // už je „za bodem“: na dalším úseku (bod → následující) s kladným postupem a blízko něj
        const B = toWorld(cam, wps[r.idx + 1]), ab = { X: B.X - Wk.X, Z: B.Z - Wk.Z }, L2 = ab.X * ab.X + ab.Z * ab.Z;
        if (L2 > 1e-9) {
          const t = ((P.X - Wk.X) * ab.X + (P.Z - Wk.Z) * ab.Z) / L2;
          const qx = Wk.X + ab.X * Math.max(0, Math.min(1, t)), qz = Wk.Z + ab.Z * Math.max(0, Math.min(1, t));
          passed = t > 0 && Math.hypot(P.X - qx, P.Z - qz) < 1.2;
        }
      }
      // mezilehlý bod, ke kterému se postava přes dav nedostane (zablokovaná > 3 s): přeskočit ho –
      // jinak trasa „o kus zpět a pak dopředu“ přes stojící frontu postavu zasekla natrvalo
      if (!passed && !last && (a.blockedT ?? 0) > 3) { passed = true; a.blockedT = 0; }
      // cíl obsazený někým jiným (např. přítel na místě setkání): stačí dojít co nejblíž
      if (!passed && last) {
        a.stuckT = d < 1.5 && sp < 0.05 ? (a.stuckT ?? 0) + SIM_DT : 0;
        if ((a.stuckT ?? 0) > 0.8) passed = true;
      }
      if (!passed) return false;
      if (wp.edgeId && r.heldEdges.includes(wp.edgeId) && wps[r.idx + 1]?.edgeId !== wp.edgeId) { this.res.release(edgeKey(wp.edgeId), a.id); r.heldEdges = r.heldEdges.filter((e) => e !== wp.edgeId); }
      if (wp.nodeId) a.loc = { kind: 'node', nodeId: wp.nodeId };
      if (last) {
        // dojít přesně na bod (nejvýš pár cm), jen když tím nikoho nepřekryje
        if (d < 0.06 && this.state.agents.every((o) => o === a || o.hidden || Math.hypot(toWorld(cam, o.pos).X - Wk.X, toWorld(cam, o.pos).Z - Wk.Z) >= 2 * R_BODY)) a.pos = { x: wp.x, y: wp.y };
        for (const e of r.heldEdges) this.res.release(edgeKey(e), a.id);
        a.route = null; a.speed = 0; a.vel = { X: 0, Z: 0 }; a.arrived = true; a.stuckT = 0;
        void mv;
        return true;
      }
      r.idx++;
    }
  }

  private stepAgent(a: AgentState, t: number) {
    if (a.onIce) { a.status = this.rinkStatus(a); return; }
    const c = this.chars.get(a.id)!;
    const m = this.manifests[c.assetId];
    const mv = this.motion.get(a.id) ?? { arrived: false, waitingNarrow: false };
    // skutečný přijatý pohyb těla (po bezpečné projekci) pohání nohy
    const visSpeed = a.hidden ? 0 : a.speed;
    // změna pohledu jen při dvojí opoře (nebo v klidu), aby opřená bota neposkočila
    const wantDir = directionFromAngle(a.facing, a.anim.dir);
    if (wantDir !== a.anim.dir) {
      const dsEnd = gaitEvents(a.anim.gaitW ?? 0).toeOff - 0.5;
      if (a.anim.walkBlend < 0.3 || a.anim.walkPhase % 0.5 < dsEnd) a.anim.dir = wantDir;
    }
    // 2) přehrávání animací (události z animace řídí navazující logiku)
    // chůze řízená drahou a kontakty (délka nohy a bota postavy; měřítko scény = hloubka × základní měřítko)
    const scale = c.baseScale * depthScaleAt(this.project.scene.depth, a.pos.y);
    // rozejití z (dokračujícího) klidu: kotvy převezmou místa, kde boty právě stojí (žádný skok)
    let heelsNow: (Vec2 | null)[] | null = null;
    if (a.anim.settle && visSpeed > 0.5 && m.backend === 'skeleton') {
      const cv = characterVisual(a, m, c, this.project.scene);
      heelsNow = [0, 1].map((i) => (cv.pose.heelPts ? localToScene(cv, cv.pose.heelPts[i]) : null));
    }
    // pád: animátor stojí (základní póza zůstane zmrazená – pád se z ní plynule prolne; žádné dokročení)
    const events = a.anim.fall ? [] : stepAnimator(a.anim, m, SIM_DT, visSpeed, (this.vmaxMps(a) / Q) * scale, scale, gaitContextFor(m, c));
    this.latchFootAnchors(a, c, m, heelsNow);
    if (mv.waitingNarrow) a.status = 'Čeká před úzkým průchodem';
    // 3) rozhodování + účast v činnosti
    if (a.follow) { const l = this.state.agents.find((x) => x.id === a.follow!.leaderId); a.status = l ? (a.hidden ? 'Mimo scénu' : `Jde s postavou ${l.name}`) : 'Stojí'; return; }
    if (a.activity) { this.stepActivity(a, events); return; }
    // po společné činnosti se druhý z dvojice znovu připojí k vůdci
    if (a.rejoin && !a.pendingActivity) {
      const l = this.state.agents.find((x) => x.id === a.rejoin!.leaderId);
      if (l && !l.hidden) { a.follow = { leaderId: l.id, side: a.rejoin.side }; if (a.visit) a.visit = { mode: 'with', until: 0, friendId: l.id }; a.rejoin = null; return; }
      a.rejoin = null;
    }
    if (a.hidden && a.pendingActivity) this.enterScene(a, t); // plánovaná činnost: návštěvník přijde
    if (a.pendingActivity && !a.route) { this.tryStartPending(a); if (a.activity) return; }
    // k lavičce: poslední kus (soused na lavičce, opěradlo) se dosedne plynule – žádné uvíznutí těsně u místa
    if (a.route?.purpose === 'k lavičce') {
      const w = a.route.wps[a.route.wps.length - 1], d = Math.hypot(a.pos.x - w.x, a.pos.y - w.y), k = depthScaleAt(this.project.scene.depth, a.pos.y);
      a.benchStall = a.speed < 4 * k && d < 110 * k ? (a.benchStall ?? 0) + SIM_DT : 0;
      if ((a.route.idx >= a.route.wps.length - 1 && d < 36 * k) || (a.benchStall ?? 0) > 1.2) { a.route = null; a.arrived = true; a.benchStall = 0; }
    }
    if (a.route) { if (!mv.waitingNarrow) a.status = a.pendingActivity ? 'Jde k činnosti' : this.routeStatus(a); return; }
    if (c.routine === 'shovel') { if (a.hidden) a.status = 'Mimo scénu'; return; } // řídí stepClearing
    if (c.routine === 'baker') return; // řídí stepBakeryAll
    if (c.routine === 'actor') { if (a.hidden) a.status = 'Mimo scénu'; return; } // řídí režisér epizod
    if (c.routine === 'pram') { if (a.hidden) a.status = 'Mimo scénu'; else if (!a.status) a.status = 'Tlačí kočárek'; return; } // řídí stepPram
    if (c.routine === 'rider') { if (a.hidden) { a.status = 'Mimo scénu'; a.anim.sit = null; } return; } // řídí stepSled
    if (a.tram) { if (!a.route && a.tram.role === 'wait' && a.tram.since > t) a.tram.since = t; return; } // řídí stepTramAll
    if (c.routine === 'sled') { a.status = a.hidden ? 'Mimo scénu' : 'Táhne sáňky s dítětem'; return; } // řídí stepSled
    if (mittenBusy(this.state, a)) return; // vrací se pro rukavici / zvedá ji
    if (c.skate && this.project.rink?.entry && this.stepSkaterLife(a, c, t)) return;
    if (c.routine === 'visitor') { this.stepVisitor(a, c, t); return; }
    // automatické činnosti
    for (const [type, cfg] of Object.entries(c.activities)) {
      if (!cfg.enabled || t < (a.cooldowns[type] ?? Infinity)) continue;
      const runner = getActivity(type);
      const zones = this.project.zones.filter((z) => z.enabled && z.activityType === type);
      if (!runner || !zones.length) { a.cooldowns[type] = t + 60; continue; }
      const zone = zones[Math.floor(rand(a.rng) * zones.length)];
      const cs = runner.canStart(this.ctx, a, zone);
      if (!cs.ok) { a.cooldowns[type] = t + (cs.retryAfter ?? 15); if (cs.reason && cs.retryAfter && cs.retryAfter >= 30) this.addDiag('warning', `${a.name}: ${cs.reason}`, a.id); continue; }
      a.pendingActivity = { type, zoneId: zone.id, source: 'auto', sourceId: null };
      this.tryStartPending(a);
      if (a.activity) return;
    }
    this.stepWander(a, c, t);
  }

  private tryStartPending(a: AgentState) {
    const p = a.pendingActivity!;
    a.pendingActivity = null;
    const runner = getActivity(p.type);
    const zone = p.zoneId ? this.zones.get(p.zoneId) : undefined;
    if (!runner || !zone) return;
    // dvojice jde na kávu jen tehdy, když se u stánku vejdou obě postavy (jinak chvíli počkají)
    if (p.type === 'coffee' && this.state.agents.some((x) => x.follow?.leaderId === a.id) && coffeeFreeSlots(this.ctx, a, zone) < 2) {
      a.pendingActivity = p; a.status = 'Čekají, až se uvolní fronta';
      a.wander.waitUntil = this.time() + 2;
      if (a.visit) { a.visit.since ??= this.time(); if (this.time() - (a.visit.since ?? 0) > 60) { a.pendingActivity = null; } }
      return;
    }
    const run = runner.start(this.ctx, a, zone, p.source, p.sourceId);
    if (!run) {
      a.cooldowns[p.type] = this.time() + 10;
      if (p.source === 'schedule' && p.sourceId) { const rt = this.state.schedule[p.sourceId]; rt.status = 'waiting'; rt.waitingSince ??= this.time(); rt.nextTry = this.time() + 0.5; }
      return;
    }
    a.activity = run; a.wander.atStop = false; a.look = a.look ?? null;
    this.startGroupActivity(a, run, zone);
  }

  /** Vůdce dvojice začal činnost (káva): druhý z dvojice ji dělá s ním (fronta, stolek, povídání). */
  private startGroupActivity(a: AgentState, run: NonNullable<AgentState['activity']>, zone: ActivityZone) {
    if (run.type !== 'coffee') return;
    const f = this.state.agents.find((x) => x.follow?.leaderId === a.id && !x.activity && !x.holding);
    if (!f) return;
    const runner = getActivity(run.type)!;
    const fc = this.chars.get(f.id)!;
    const saved = f.follow!;
    f.follow = null;
    const run2 = runner.start(this.ctx, f, zone, 'auto', null);
    if (!run2) { f.follow = saved; this.log("info", `${f.name}: na kávu s ${a.name} nejde (${runner.canStart(this.ctx, f, zone).reason ?? "start se nezdařil"}).`, f.id); return; }
    f.activity = run2; f.look = null;
    f.rejoin = { leaderId: a.id, side: saved.side, permanent: fc.companionId === a.id };
    (run.data as Record<string, unknown>).partnerId = f.id; (run.data as Record<string, unknown>).groupLead = true;
    (run2.data as Record<string, unknown>).partnerId = a.id; (run2.data as Record<string, unknown>).groupLead = false;
    this.log('info', `${a.name} a ${f.name} jdou spolu na kávu.`, a.id);
  }

  private routeStatus(a: AgentState): string {
    const v = a.visit;
    if (!v) return 'Prochází se';
    if (v.mode === 'leave') return 'Odchází ze scény';
    if (v.mode === 'meet-go') { const f = this.state.agents.find((x) => x.id === v.friendId); return f ? `Jde naproti: ${f.name}` : 'Jde na setkání'; }
    return 'Prochází se';
  }

  // ---------------------------------------------------------------- návštěvníci
  /** Je postava v daném místě celá mimo obraz (obrys ~ ±32 j. do šířky, 155 j. nad chodidly)? */
  isOffscreen(p: Vec2, baseScale = 1): boolean {
    const sc = depthScaleAt(this.project.scene.depth, p.y) * baseScale, W = this.project.scene.width, H = this.project.scene.height;
    return p.x + 32 * sc < 0 || p.x - 32 * sc > W || p.y - 155 * sc > H || p.y + 10 * sc < 0;
  }
  /**
   * Místo mimo obraz za vstupem (ve směru ven ze scény): postava se tam objeví a ke vstupu dojde,
   * při odchodu tam dojde a teprve pak zmizí. Dveře budovy: null (objeví se / zmizí ve dveřích).
   */
  private offscreenBeyond(pid: string, a: AgentState): World | null {
    const n = this.graph.nodes.get(pid); if (!n || n.door) return null;
    const cam = this.cam();
    // směr ven v obraze (od sousedního uzlu ke vstupu), nejvýš 40° od vodorovné: malované pohledy jsou
    // šikmé – kolmý příchod zespodu / odchod nahoru by byl „strmá“ chůze
    const nb = (this.graph.out.get(pid) ?? []).map((l) => this.graph.nodes.get(l.to)).find(Boolean);
    let dx = nb ? n.x - nb.x : n.x - this.project.scene.width / 2, dy = nb ? n.y - nb.y : n.y - this.project.scene.height * 0.8;
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const maxA = (40 * Math.PI) / 180;
    if (Math.abs(dy) > Math.sin(maxA)) {
      const sx = Math.abs(dx) > 0.05 ? Math.sign(dx) : n.x < this.project.scene.width / 2 ? -1 : 1;
      dx = sx * Math.cos(maxA); dy = Math.sign(dy) * Math.sin(maxA);
    }
    const bs = this.chars.get(a.id)?.baseScale ?? 1;
    for (let k = 10; k <= 3000; k += 10) {
      const q = { x: n.x + dx * k, y: n.y + dy * k };
      if (this.isOffscreen(q, bs * 1.1)) { const w = toWorld(cam, { x: q.x + dx * 170, y: q.y + dy * 170 }); return { X: w.X, Z: w.Z }; } // rezerva: pes na vodítku jde kus za majitelem
    }
    return toWorld(cam, { x: n.x + dx * 3000, y: n.y + dy * 3000 });
  }

  private portals(): string[] { return this.project.nav.nodes.filter((n) => n.portal && this.graph.nodes.has(n.id)).map((n) => n.id); }

  /** Návštěvník vstoupí do scény vstupem (z místa mimo obraz). */
  private enterScene(a: AgentState, t: number, avoid?: string | null, only?: string[]) {
    // dveře budovy jen občas (událost s nízkou četností), jinak okraje scény
    const all = this.portals().filter((p) => p !== avoid && (!only || only.includes(p)));
    const useDoor = all.some((p) => this.graph.nodes.get(p)?.door) ? rand(a.rng) < 0.12 : false; // bez dveří žádné losování navíc
    const ps = all.filter((p) => !!this.graph.nodes.get(p)?.door === useDoor).length ? all.filter((p) => !!this.graph.nodes.get(p)?.door === useDoor) : all;
    const pid = ps.length ? ps[Math.floor(rand(a.rng) * ps.length)] : (this.anchorOf(a));
    const n = this.graph.nodes.get(pid)!;
    // volné místo u vstupu (nikdy na jiné postavě); jinak ještě chvíli počkat mimo scénu
    const cam = this.cam(), Pn = toWorld(cam, { x: n.x, y: n.y });
    // příchod vždy z místa mimo obraz (za vstupem); jen dveřmi budovy přímo ve dveřích
    const P0 = this.offscreenBeyond(pid, a) ?? Pn;
    const out = { X: P0.X - Pn.X, Z: P0.Z - Pn.Z }, oL = Math.hypot(out.X, out.Z) || 1, ou = { X: out.X / oL, Z: out.Z / oL };
    const spot = this.freeSpot(a, n.door
      ? [P0, ...[0.7, 1.4, 2.1].flatMap((r) => [{ X: P0.X, Z: P0.Z + r }, { X: P0.X, Z: P0.Z - r }, { X: P0.X - Math.sign(P0.X || 1) * r, Z: P0.Z }])]
      : [0, 0.7, 1.4, 2.1].flatMap((r) => [{ X: P0.X + ou.X * r, Z: P0.Z + ou.Z * r }, { X: P0.X + ou.X * r - ou.Z * 0.7, Z: P0.Z + ou.Z * r + ou.X * 0.7 }, { X: P0.X + ou.X * r + ou.Z * 0.7, Z: P0.Z + ou.Z * r - ou.X * 0.7 }]));
    if (!spot) { a.hidden = true; a.visit = { mode: 'offstage', until: t + 1.5, since: t }; return; }
    a.pos = toScreen(cam, spot); a.loc = { kind: 'node', nodeId: pid }; a.route = null; a.arrived = false;
    if (n.door) this.passDoor(t);
    a.hidden = false; a.visPrev = undefined; a.off = { x: 0, y: 0 }; a.look = null;
    a.anim.walkBlend = 0; a.anim.settle = null; a.anim.anchors = undefined; a.anim.anchorsXY = undefined;
    a.visit = { mode: 'choose', until: t, since: t };
    // z místa mimo obraz nejdřív dojít ke vstupu (pak se rozhodne, kam dál – trasa naváže)
    if (!n.door) { this.sessionHost().walkPath(a, [{ x: n.x, y: n.y }], 'příchod'); a.speedFactor = 1; a.visit = { mode: 'choose', until: t + 0.05, since: t }; }
    // stálý druhý z dvojice přichází s ním
    const f = this.state.agents.find((x) => x.follow?.leaderId === a.id);
    if (f) {
      // nikdy do stejného bodu: vedle vůdce (o 0,7 m blíž / dál od kamery podle strany)
      const cam = this.cam(), P = toWorld(cam, a.pos);
      const spot = this.freeSpot(f, [{ X: P.X, Z: P.Z + 0.7 * (f.follow?.side ?? 1) }, { X: P.X, Z: P.Z - 0.7 * (f.follow?.side ?? 1) }, ...this.formationSpots(a, f.follow?.side ?? 1)]);
      f.pos = toScreen(cam, spot ?? { X: P.X, Z: P.Z + 0.7 }); f.loc = a.loc; f.hidden = false; f.visPrev = undefined; f.vel = { X: 0, Z: 0 };
    }
  }

  /** Vstup/výstup nejdál od daného místa (průchod přes celou scénu). */
  private exitFor(a: AgentState): string | null {
    const here = this.anchorOf(a);
    const allP = this.portals().filter((p) => p !== here && this.reachable(here, p));
    const doorOk = allP.some((p) => this.graph.nodes.get(p)?.door) ? rand(a.rng) < 0.12 : true; // do radnice jen občas (bez dveří beze změny)
    const ps = allP.filter((p) => doorOk || !this.graph.nodes.get(p)?.door).length ? allP.filter((p) => doorOk || !this.graph.nodes.get(p)?.door) : allP;
    if (!ps.length) return null;
    ps.sort((x, y) => dist(this.graph.nodes.get(y)!, a.pos) - dist(this.graph.nodes.get(x)!, a.pos));
    // většinou nejvzdálenější (projde celou scénu), občas jiný
    return ps.length > 1 && rand(a.rng) < 0.25 ? ps[1] : ps[0];
  }

  private leaveScene(a: AgentState, t: number) {
    const ex = this.exitFor(a);
    if (ex) { a.visit = { mode: 'leave', until: 0, target: ex, since: t }; this.ctx.goToNode(a, ex, 'odchod'); return; }
    // scéna bez vstupů: dojít na vzdálený bod a chvíli postát
    const nodes = this.project.nav.nodes.filter((n) => this.reachable(this.anchorOf(a), n.id) && n.id !== this.anchorOf(a));
    if (nodes.length) { const n = nodes[Math.floor(rand(a.rng) * nodes.length)]; a.visit = { mode: 'choose', until: t + randRange(a.rng, 3, 8), since: t }; this.ctx.goToNode(a, n.id, 'procházka'); }
  }

  private goOffstage(a: AgentState, t: number) {
    // odchod portálem: postava odnese své věci (taška) – zmizí spolu s ní, ne dřív ani později
    if (a.holding) { const id = a.holding; this.state.props = this.state.props.filter((p) => p.id !== id); a.holding = null; a.holdingKind = null; }
    a.hidden = true; a.speed = 0; a.look = null; stopAction(a.anim);
    a.visit = { mode: 'offstage', until: t + randRange(a.rng, 4, 15), since: t };
    a.status = 'Mimo scénu';
    for (const f of this.state.agents.filter((x) => x.follow?.leaderId === a.id)) {
      const fc = this.chars.get(f.id)!;
      if (fc.companionId === a.id) continue; // stálá dvojice zůstává spolu (skryje se s vůdcem)
      f.follow = null;
      if (!f.hidden && !this.isOffscreen(f.pos, this.chars.get(f.id)?.baseScale ?? 1)) {
        // přítel jde za ním ven a zmizí až za okrajem
        f.visit = { mode: 'exit', until: 0, since: t }; this.sessionHost().walkPath(f, [{ ...a.pos }], 'odchod ze scény'); f.speedFactor = 1;
        continue;
      }
      f.hidden = true; f.speed = 0;
      f.visit = { mode: 'offstage', until: t + randRange(f.rng, 10, 40), since: t };
      f.status = 'Mimo scénu';
    }
  }

  private zoneFor(a: AgentState, c: CharacterInstance, type: string): ActivityZone | null {
    if (c.activities[type] && !c.activities[type].enabled) return null;
    const runner = getActivity(type);
    if (!runner) return null;
    return this.project.zones.find((z) => z.enabled && z.activityType === type && runner.canStart(this.ctx, a, z).ok) ?? null;
  }

  private coffeeZone(a: AgentState, c: CharacterInstance): ActivityZone | null {
    if (c.activities.coffee && !c.activities.coffee.enabled) return null;
    if (a.holding) return null;
    const runner = getActivity('coffee');
    if (!runner) return null;
    return this.project.zones.find((z) => z.enabled && z.activityType === 'coffee' && runner.canStart(this.ctx, a, z).ok) ?? null;
  }

  private stepVisitor(a: AgentState, c: CharacterInstance, t: number) {
    const v = (a.visit ??= { mode: 'choose', until: t, since: t });
    switch (v.mode) {
      case 'offstage': {
        a.hidden = true; a.status = 'Mimo scénu';
        if (t >= v.until && !this.crowdAllows(a, 'walkers')) { v.until = t + 4; return; } // hustota davu
        if (t >= v.until) this.enterScene(a, t);
        return;
      }
      case 'choose': {
        if (t < v.until) { a.status = 'Stojí'; return; }
        if (v.leaveNext) { v.leaveNext = false; this.leaveScene(a, t); return; }
        // zastávka tramvaje: část návštěvníků (bez dětí a psa) jde čekat na tramvaj
        if (this.project.tram && !this.chars.get(a.id)?.pet && !this.state.agents.some((x) => x.follow?.leaderId === a.id) && !this.isChild(a) && rand(a.rng) < 0.3 && this.goToTram(a, t)) return;
        const r = rand(a.rng);
        const zone = this.coffeeZone(a, c);
        // rodina s dítětem: občas si jdou na dětský sníh postavit sněhuláka nebo se koulovat
        const kid = this.state.agents.find((x) => x.follow?.leaderId === a.id && !x.hidden && this.isChild(x));
        if (kid && !a.holding && (this.state.director?.nextSignificant ?? 0) <= t && !this.state.sessions?.length && rand(a.rng) < 0.55) {
          const h = this.sessionHost();
          const zs = this.project.zones.filter((z) => (z.activityType === 'snowman' && !snowmanZoneFree(h, z)) || (z.activityType === 'snowballFight' && !fightZoneProblem(h, z, true)));
          const z = zs.length ? zs[Math.floor(rand(a.rng) * zs.length)] : null;
          // děti spolu: další volné rodiny ve scéně → koulují se jen děti (2–3), rodiče se dívají z kraje
          if (z?.activityType === 'snowballFight' && this.startKidsFight(a, kid, z, t)) return;
          if (z && (z.activityType === 'snowman' ? (this.isChild(kid) ? startCoopSnowman(h, z, a, kid) : startSnowman(h, z, a, kid)) : startFight(h, z, kid, a, true))) {
            a.visit = { mode: 'coffee', until: 0, since: t };
            this.log('info', `${a.name} jde s dítětem (${kid.name}) ${z.activityType === 'snowman' ? 'stavět sněhuláka' : 'koulovat'}.`, a.id);
            return;
          }
          // sněhový anděl (A07): vzácnější volba (losuje se ze seedu scény – neposouvá RNG postav)
          const az = this.isChild(kid) ? this.project.zones.find((q) => q.activityType === 'snowAngel' && angelZoneFree(h, q)) : undefined;
          if (az && hashNoise(this.project.seed, 9900 + Math.floor(t), a.id.length) < 0.22 && startSnowAngel(h, az, a, kid)) { a.visit = { mode: 'coffee', until: 0, since: t }; return; }
        }
        const friend = r >= 0.75 ? this.pickFriend(a) : null;
        // setkání přátel: spolu na kávu, nebo (vzácně) postavit sněhuláka
        const sm = friend ? this.snowmanZoneAvailable(t, rand(a.rng)) : null, smZone = sm?.id;
        const smChance = smZone ? Number(this.zones.get(smZone)?.params.chance ?? 0.5) : 0;
        if (friend && sm && smZone && rand(a.rng) < smChance) {
          const z = this.zones.get(smZone)!;
          const cx = z.bounds.reduce((q, p) => q + p.x, 0) / z.bounds.length, cy = z.bounds.reduce((q, p) => q + p.y, 0) / z.bounds.length;
          this.startMeeting(a, friend, t, nearestAccessibleNode(this.graph, { x: cx, y: cy }));
          if (a.visit?.mode === 'meet-go') { a.visit.goal = sm.goal; a.visit.goalZone = smZone; }
          return;
        }
        if (friend && zone) { this.startMeeting(a, friend, t); return; }
        // nákup u stánku (hračky, perník, pletené zboží)
        const shop = r >= 0.18 && r < 0.58 && !this.state.agents.some((x) => x.follow?.leaderId === a.id) ? this.zoneFor(a, c, 'shop') : null;
        if (shop) {
          a.pendingActivity = { type: 'shop', zoneId: shop.id, source: 'auto', sourceId: null };
          a.visit = { mode: 'coffee', until: 0, since: t };
          a.status = 'Jde nakupovat';
          return;
        }
        if (r >= 0.58 && zone) {
          a.pendingActivity = { type: 'coffee', zoneId: zone.id, source: 'auto', sourceId: null };
          a.visit = { mode: 'coffee', until: 0, since: t };
          a.status = 'Jde na kávu';
          return;
        }
        // odpočinek na lavičce (jen když zůstanou volná místa pro přezouvání bruslařů)
        const bench = this.project.rink?.entry?.benchId;
        if (bench && !this.state.agents.some((x) => x.follow?.leaderId === a.id) && !this.isChild(a) && !a.anim.elder && rand(a.rng) < 0.12) {
          const seats = this.pointsOf(bench).filter((q) => q.point.kind === 'seat' && this.res.isFree(q.key));
          if (seats.length >= 2) {
            const q = seats[seats.length - 1];
            if (this.res.tryReserve(q.key, a.id) && (this.sessionHost().goTo(a, q.pos, 'k lavičce') || (this.sessionHost().walkPath(a, [q.pos], 'k lavičce'), true))) {
              a.speedFactor = 1; a.visit = { mode: 'rest', until: 0, since: t, seat: q.key }; a.status = 'Jde si sednout na lavičku'; return;
            }
            this.res.release(q.key, a.id);
          }
        }
        // cestou se občas zastaví u stromu / výlohy a chvíli se dívá (A04)
        const view = r < 0.14 || (kid && r < 0.4) ? this.zoneFor(a, c, 'viewing') : null; // rodiny se u stromu zastaví častěji (A03)
        if (view) {
          a.pendingActivity = { type: 'viewing', zoneId: view.id, source: 'auto', sourceId: null };
          a.visit = { mode: 'coffee', until: 0, since: t };
          return;
        }
        this.leaveScene(a, t); // jen projde scénou
        if (a.visit?.mode === 'leave') maybeCarryMitten(this.mittenHost(), a); // občas nese rezervní palčák (B03)
        return;
      }
      case 'rest': {
        const seat = v.seat ? this.pointsOf(v.seat.split('#')[0]).find((q) => q.key === v.seat) : undefined;
        if (!seat) { this.leaveScene(a, t); return; }
        if (!a.anim.sit) {
          if (v.until > 0) { this.res.release(seat.key, a.id); v.seat = null; this.standAway(a, seat.key); v.mode = 'choose'; v.until = t + 0.1; v.leaveNext = true; return; } // vstal
          if (Math.hypot(a.pos.x - seat.pos.x, a.pos.y - seat.pos.y) > 112 * depthScaleAt(this.project.scene.depth, a.pos.y)) { this.sessionHost().walkPath(a, [seat.pos], 'k lavičce'); a.speedFactor = 0.8; return; }
          this.sitDown(a, 'rest', randRange(a.rng, 15, 45)); v.until = t; a.status = 'Odpočívá na lavičce'; return;
        }
        this.stepSit(a); a.status = 'Odpočívá na lavičce';
        return;
      }
      case 'leave': {
        if (a.route) return;
        if (v.target && this.anchorOf(a) === v.target) {
          if (this.graph.nodes.get(v.target)?.door) { this.passDoor(t); this.goOffstage(a, t); return; }
          // od výstupu dojít za okraj obrazu, teprve tam zmizet
          const Q = this.offscreenBeyond(v.target, a);
          const dogV = this.state.animals?.find((x) => x.ownerId === a.id && !x.hidden);
          if (Q && (!this.isOffscreen(a.pos, this.chars.get(a.id)?.baseScale ?? 1) || (dogV && !this.isOffscreen(dogV.pos, 0.5)))) { v.mode = 'exit'; this.sessionHost().walkPath(a, [toScreen(this.cam(), Q)], 'odchod ze scény'); a.speedFactor = 1; return; }
          this.goOffstage(a, t); return;
        }
        this.leaveScene(a, t);
        return;
      }
      case 'exit': {
        if (a.route) { a.status = 'Odchází ze scény'; return; }
        // zastavil se dřív (někdo v cestě): ještě kus dál, dokud není celý mimo obraz (i se psem)
        const dog = this.state.animals?.find((x) => x.ownerId === a.id && !x.hidden);
        if (!this.isOffscreen(a.pos, this.chars.get(a.id)?.baseScale ?? 1) || (dog && !this.isOffscreen(dog.pos, 0.5))) {
          const W = this.project.scene.width, dx = a.pos.x < W / 2 ? -1 : 1;
          this.sessionHost().walkPath(a, [{ x: a.pos.x + dx * 160, y: a.pos.y + 25 }], 'odchod ze scény'); a.speedFactor = 1; return;
        }
        this.goOffstage(a, t);
        return;
      }
      case 'coffee': {
        // káva skončila (nebo se nepodařila): počkat na přítele, pak odejít
        const partner = this.state.agents.find((x) => x.rejoin?.leaderId === a.id && x.activity);
        if (partner) { a.status = `Čeká na ${partner.name}`; return; }
        // často ještě zajde k dalšímu stánku, než odejde
        if (!this.state.agents.some((x) => x.follow?.leaderId === a.id || x.rejoin?.leaderId === a.id) && rand(a.rng) < 0.45) { a.visit = { mode: 'choose', until: t + randRange(a.rng, 0.5, 2.5), since: t }; return; }
        this.leaveScene(a, t);
        return;
      }
      case 'meet-go': {
        this.maybeWave(a, v, t);
        if (a.route) return;
        v.mode = 'meet-wait'; v.since = t;
        return;
      }
      case 'meet-wait': {
        const f = this.state.agents.find((x) => x.id === v.friendId);
        if (!f || f.hidden || f.visit?.friendId !== a.id) { this.leaveScene(a, t); return; }
        a.status = `Čeká na: ${f.name}`;
        this.maybeWave(a, v, t);
        // čekání (A09): po 7–15 s se rozhlédne, jestli už přítel jde, pak zas klidně stojí
        if (!a.route && t >= (v.lookAt ?? t + 1)) {
          a.look = { x: a.pos.x + (rand(a.rng) < 0.5 ? -1 : 1) * 300, y: a.pos.y - 30 + rand(a.rng) * 40 };
          v.lookAt = t + randRange(a.rng, 7, 15);
        } else if (v.lookAt === undefined) v.lookAt = t + randRange(a.rng, 7, 15);
        if (f.visit.mode === 'meet-wait' && !f.route && dist(f.pos, a.pos) < 120) {
          // pozdrav: natočit se k sobě, chvíli si povídat
          for (const [x, y] of [[a, f], [f, a]] as const) {
            x.visit!.mode = 'greet'; x.visit!.until = t + randRange(a.rng, 4, 7); x.look = { x: y.pos.x, y: y.pos.y };
          }
          // pozdrav kývnutím (druhý odpoví se zpožděním), pak si začnou povídat
          greetPair(a, f, t);
          startConversation(this.socialWorld(), [a.id, f.id], 'pair', this.project.seed, t + 0.9);
          this.log('info', `${a.name} a ${f.name} se zdraví.`, a.id);
          return;
        }
        if (t - (v.since ?? t) > 45) { this.log('info', `${a.name}: přítel nepřišel, odchází.`, a.id); this.leaveScene(a, t); }
        return;
      }
      case 'greet': {
        const f = this.state.agents.find((x) => x.id === v.friendId);
        a.status = f ? `Zdraví se: ${f.name}` : 'Zdraví se';
        if (f) a.look = { x: f.pos.x, y: f.pos.y };
        if (t < v.until) return;
        stopAction(a.anim);
        if (!f || !v.lead) { if (!f) this.leaveScene(a, t); return; } // vede ten, kdo setkání začal
        stopAction(f.anim);
        f.look = null; a.look = null;
        f.follow = { leaderId: a.id, side: rand(a.rng) < 0.5 ? 1 : -1 };
        f.visit = { mode: 'with', until: 0, friendId: a.id, since: t };
        // výrazná událost jen jedna naráz: když mezitím začala jiná, jdou místo toho na kávu
        if (v.goal && v.goalZone && !this.state.sessions?.length && (this.state.director?.nextSignificant ?? 0) <= t) {
          const zz = this.zones.get(v.goalZone);
          f.follow = null;
          if (zz && (v.goal === 'snowman' ? startSnowman(this.sessionHost(), zz, a, f) : startFight(this.sessionHost(), zz, a, f))) {
            a.visit = { mode: 'coffee', until: 0, since: t }; f.visit = { mode: 'coffee', until: 0, since: t };
            return;
          }
          f.follow = { leaderId: a.id, side: rand(a.rng) < 0.5 ? 1 : -1 };
        }
        const zone = this.coffeeZone(a, c);
        if (zone) { a.pendingActivity = { type: 'coffee', zoneId: zone.id, source: 'auto', sourceId: null }; a.visit = { mode: 'coffee', until: 0, friendId: f.id, since: t }; }
        else this.leaveScene(a, t);
        return;
      }
      case 'with': {
        // druhý z dvojice bez vůdce (např. vůdce zmizel): odejít
        this.leaveScene(a, t);
        return;
      }
    }
  }

  /**
   * B01 chytání vloček: za sněžení se rodina s dítětem občas zastaví, dítě zvedne ruce dlaněmi nahoru
   * a 5–10 s sleduje vločky, rodič počká a dívá se na ně; pak jdou dál. Cooldown scény 240–480 s.
   * Losování ze seedu (hashNoise) – neovlivní RNG postav.
   */
  private stepFlakes(t: number) {
    if (!this.project.scene.snowfall.enabled) return;
    const st = (this.state.flakes ??= { next: 90, n: 0 });
    const W = this.project.scene.width, H = this.project.scene.height;
    if (st.kidId) {
      const kid = this.state.agents.find((x) => x.id === st.kidId), par = this.state.agents.find((x) => x.id === st.parentId);
      if (!kid || !par || kid.hidden || par.hidden || !kid.follow) { if (par) par.speedFactor = 1; st.kidId = st.parentId = undefined; return; }
      par.speedFactor = 0; par.look = { x: kid.pos.x, y: kid.pos.y - 40 };
      if (!st.started) {
        if (kid.speed < 1 && this.sessionHost().gesture(kid, 'catch', { dur: st.dur ?? 7 })) { st.started = true; st.until = t + (st.dur ?? 7) + 0.3; this.log('info', `${kid.name} chytá sněhové vločky.`, kid.id); }
        else if (t > (st.until ?? t) ) { par.speedFactor = 1; st.kidId = st.parentId = undefined; }
        return;
      }
      if (t >= (st.until ?? 0)) { par.speedFactor = 1; par.look = null; st.kidId = st.parentId = undefined; st.started = false; }
      return;
    }
    if (t < st.next || this.state.step % 30) return;
    const kid = this.state.agents.find((k) => !k.hidden && this.isChild(k) && k.follow && !k.activity && k.pos.x > W * 0.15 && k.pos.x < W * 0.85 && k.pos.y > H * 0.68
      && (() => { const p = this.state.agents.find((q) => q.id === k.follow!.leaderId); return !!p && !p.activity && !!p.route && p.visit?.mode !== 'offstage'; })());
    if (!kid) return;
    st.n++;
    st.next = t + 240 + 240 * hashNoise(this.project.seed, 9700, st.n);
    if (hashNoise(this.project.seed, 9701, st.n) < 0.3) return; // ne pokaždé
    st.kidId = kid.id; st.parentId = kid.follow!.leaderId; st.started = false;
    st.dur = 5 + 5 * hashNoise(this.project.seed, 9702, st.n); st.until = t + 3;
  }

  /**
   * Koulovačka jen dětí: k dítěti této rodiny 1–2 děti z jiných rodin, které jsou ve scéně a jejichž
   * rodič zrovna nic nedělá. Rodiče dojdou na kraj hřiště a dívají se, děti se po hře vrátí k nim.
   */
  private startKidsFight(a: AgentState, kid: AgentState, z: ActivityZone, t: number): boolean {
    // (rodič může zrovna procházet nebo mířit na kávu – kvůli dětem plán odloží)
    const freeParent = (p: AgentState) => !p.hidden && !p.activity && !p.holding && p.visit?.mode !== 'offstage' && !this.state.agents.some((x) => x.rejoin?.leaderId === p.id);
    const others = this.state.agents.filter((x) => x !== kid && !x.hidden && this.isChild(x) && x.follow && !x.activity && (() => { const p = this.state.agents.find((q) => q.id === x.follow!.leaderId); return !!p && p !== a && freeParent(p); })());
    if (!others.length || rand(a.rng) > 0.75) return false;
    const cam = this.cam(), Z = toWorld(cam, a.pos);
    others.sort((x, y) => { const X = toWorld(cam, x.pos), Y = toWorld(cam, y.pos); return Math.hypot(X.X - Z.X, X.Z - Z.Z) - Math.hypot(Y.X - Z.X, Y.Z - Z.Z); });
    const kids = [kid, ...others.slice(0, rand(a.rng) < 0.5 ? 2 : 1)];
    const parents = kids.map((k) => this.state.agents.find((p) => p.id === k.follow!.leaderId)!);
    const h = this.sessionHost();
    if (!startFight(h, z, kids[0], kids.slice(1), true)) return false;
    // rodiče: kraj dětského hřiště (strana blíž k nim), čekají a dívají se
    const cx = z.bounds.reduce((q, p) => q + p.x, 0) / z.bounds.length, cy = z.bounds.reduce((q, p) => q + p.y, 0) / z.bounds.length;
    const C = toWorld(cam, { x: cx, y: cy });
    parents.forEach((p, i) => {
      const P = toWorld(cam, p.pos), d = Math.hypot(P.X - C.X, P.Z - C.Z) || 1;
      const r = 3.2 + i * 0.2, side = (i - (parents.length - 1) / 2) * 0.9;
      const spot = toScreen(cam, { X: C.X + ((P.X - C.X) / d) * r - ((P.Z - C.Z) / d) * side, Z: C.Z + ((P.Z - C.Z) / d) * r + ((P.X - C.X) / d) * side });
      const k = kids[i], ch = this.chars.get(k.id);
      k.rejoin = { leaderId: p.id, side: ch?.companionSide === -1 ? -1 : 1, permanent: true };
      p.visit = { mode: 'coffee', until: 0, since: t }; p.pendingActivity = null;
      h.goTo(p, spot, 'k dětskému hřišti');
      p.look = { x: cx, y: cy };
    });
    this.log('info', `Děti (${kids.map((k) => k.name).join(', ')}) se jdou koulovat, rodiče (${parents.map((p) => p.name).join(', ')}) se dívají.`, a.id);
    return true;
  }

  /** Zamávání příteli, který se objevil 2,5–5 m daleko (jednou za setkání, p = 0,65). */
  private maybeWave(a: AgentState, v: NonNullable<AgentState['visit']>, t: number) {
    if (v.waved) return;
    const f = this.state.agents.find((x) => x.id === v.friendId);
    if (!f || f.hidden) return;
    const cam = cameraFor(this.project.scene), P = toWorld(cam, a.pos), F = toWorld(cam, f.pos);
    const d = Math.hypot(P.X - F.X, P.Z - F.Z);
    if (d < 2.5 || d > 5) return;
    v.waved = true;
    waveTo(a, this.socialWorld(), t);
  }

  /** Přítel pro setkání: jiný návštěvník, který je právě mimo scénu a nemá stálou dvojici. */
  private pickFriend(a: AgentState): AgentState | null {
    if (this.state.agents.some((x) => x.follow?.leaderId === a.id)) return null;
    const cands = this.state.agents.filter((x) => x.id !== a.id && x.hidden && x.visit?.mode === 'offstage' && !x.follow
      && this.chars.get(x.id)?.routine === 'visitor' && !this.chars.get(x.id)?.companionId
      && !this.state.agents.some((y) => y.follow?.leaderId === x.id) && !x.pendingActivity);
    return cands.length ? cands[Math.floor(rand(a.rng) * cands.length)] : null;
  }

  private startMeeting(a: AgentState, f: AgentState, t: number, at: string | null = null) {
    const here = this.anchorOf(a);
    const nodes = this.project.nav.nodes.filter((n) => !n.portal && this.reachable(here, n.id) && n.id !== here);
    if (!nodes.length) { this.leaveScene(a, t); return; }
    // místo setkání: zadané (u zóny činnosti), raději zastávka, jinak libovolný bod uprostřed scény
    // ne na rozcestí (uzel s více než dvěma spoji): stojící dvojice by tam blokovala průchod
    const deg = (id: string) => this.project.nav.edges.filter((e) => e.a === id || e.b === id).length;
    const calm = nodes.filter((n) => deg(n.id) <= 2);
    const stops = (calm.length ? calm : nodes).filter((n) => n.stop);
    const pool = stops.length && rand(a.rng) < 0.6 ? stops : calm.length ? calm : nodes;
    const m = (at && nodes.find((n) => n.id === at)) || pool[Math.floor(rand(a.rng) * pool.length)];
    this.enterScene(f, t, a.loc.kind === 'node' ? a.loc.nodeId : null);
    if (f.hidden) { this.leaveScene(a, t); return; } // přítel teď nemůže vstoupit (u vstupu je plno)
    if (!this.reachable(this.anchorOf(f), m.id)) { this.goOffstage(f, t); this.leaveScene(a, t); return; }
    a.visit = { mode: 'meet-go', until: 0, target: m.id, friendId: f.id, lead: true, since: t };
    f.visit = { mode: 'meet-go', until: 0, target: m.id, friendId: a.id, lead: false, since: t };
    this.ctx.goToNode(a, m.id, 'na setkání'); this.ctx.goToNode(f, m.id, 'na setkání');
    this.log('info', `${a.name} jde naproti: ${f.name} (${m.name ?? m.id}).`, a.id);
  }


  private stepActivity(a: AgentState, events: string[]) {
    const run = a.activity!;
    const runner = getActivity(run.type)!;
    const r = runner.step(this.ctx, a, run, events);
    if (r === 'running') return;
    if (r === 'failed') runner.abort(this.ctx, a, run, 'činnost se nezdařila');
    this.finishActivity(a, r === 'done');
  }

  private finishActivity(a: AgentState, ok: boolean) {
    const run = a.activity!;
    const freed = this.res.releaseAll(a.id); // bezpečnostní síť: žádná zablokovaná rezervace
    if (a.route) for (const e of a.route.heldEdges) if (!freed.includes('edge:' + e)) this.res.release('edge:' + e, a.id);
    if (a.route) a.route.heldEdges = [];
    stopAction(a.anim);
    a.activity = null;
    a.arrived = false;
    const c = this.chars.get(a.id)!;
    const cfg = c.activities[run.type];
    const lo = cfg?.intervalMin ?? 90, hi = cfg?.intervalMax ?? 180;
    a.cooldowns[run.type] = this.time() + (ok ? randRange(a.rng, lo, hi) : 20);
    a.wander.waitUntil = this.time() + randRange(a.rng, 0.5, 2);
    a.look = null;
    a.status = ok ? 'Dokončil(a) činnost' : 'Činnost přerušena';
  }

  /** Přeruší činnost postavy (uvolní rezervace, rekvizity uvede do vysvětlitelného stavu). */
  abortActivity(agentId: string, reason: string) {
    const a = this.state.agents.find((x) => x.id === agentId);
    if (!a?.activity) return;
    getActivity(a.activity.type)?.abort(this.ctx, a, a.activity, reason);
    this.log('warn', `${a.name}: činnost přerušena (${reason}).`, a.id);
    this.finishActivity(a, false);
  }

  /** Odebrání objektu za běhu simulace: přeruší dotčené činnosti a uvolní jeho rezervace. */
  removeObject(objectId: string) {
    if (this.state.removedObjects.includes(objectId)) return;
    const name = this.objects.get(objectId)?.name ?? objectId;
    this.state.removedObjects.push(objectId);
    for (const a of this.state.agents) {
      if (a.activity && getActivity(a.activity.type)?.usesObject(a.activity, objectId)) this.abortActivity(a.id, `objekt „${name}“ byl odebrán`);
    }
    this.res.releaseMatching((k) => k.startsWith(objectId + '#'));
    this.state.queues = Object.fromEntries(Object.entries(this.state.queues).filter(([k]) => !k.endsWith(':' + objectId)));
    for (const p of this.state.props) if (p.place.kind === 'counter' && p.place.objectId === objectId) {
      this.log('info', `Kelímek na pultu odebraného objektu „${name}“ byl odebrán spolu s ním.`);
    }
    this.state.props = this.state.props.filter((p) => !((p.place.kind === 'counter' || p.place.kind === 'inBin') && p.place.objectId === objectId));
  }

  private stepWander(a: AgentState, c: CharacterInstance, t: number) {
    if (!c.wander) { a.status = 'Stojí'; return; }
    if (a.arrived) {
      a.arrived = false;
      const node = a.loc.kind === 'node' ? this.graph.nodes.get(a.loc.nodeId) : undefined;
      if (node?.stop) {
        const s = node.stop;
        a.wander.waitUntil = t + randRange(a.rng, s.waitMin, Math.max(s.waitMin, s.waitMax));
        a.wander.atStop = true;
        if (s.look.mode === 'direction' && s.look.angle !== undefined) a.look = { angle: s.look.angle };
        else if (s.look.mode === 'object' && s.look.objectId) { const o = this.objects.get(s.look.objectId); if (o) a.look = { x: o.x, y: o.y }; }
        if (s.activity && rand(a.rng) < (s.activityChance ?? 1)) {
          const zones = this.project.zones.filter((z) => z.enabled && z.activityType === s.activity);
          const runner = getActivity(s.activity);
          const zone = zones.find((z) => runner?.canStart(this.ctx, a, z).ok);
          if (zone) { a.pendingActivity = { type: s.activity, zoneId: zone.id, source: 'stop', sourceId: node.id }; return; }
        }
      } else a.wander.waitUntil = t + (rand(a.rng) < 0.25 ? randRange(a.rng, 0.5, 2.5) : 0);
    }
    if (t < a.wander.waitUntil) { a.status = a.wander.atStop ? 'Čeká v zastávce' : 'Stojí'; return; }
    // Výběr dalšího bodu.
    const here = this.anchorOf(a);
    if (a.loc.kind === 'point') { this.ctx.goToNode(a, here, 'zpět na trasu'); return; }
    const node = this.graph.nodes.get(here);
    const out = this.graph.out.get(here) ?? [];
    if (!out.length) { a.wander.waitUntil = t + 5; a.status = 'Nemá kam jít (slepý bod)'; return; }
    let next: string | undefined;
    const choices = node?.stop?.next.filter((n) => out.some((l) => l.to === n.nodeId)) ?? [];
    if (choices.length) next = pickWeighted(a.rng, choices, (x) => x.weight)?.nodeId;
    else {
      const opts = out.length > 1 ? out.filter((l) => l.to !== a.wander.prevNode) : out;
      next = opts[Math.floor(rand(a.rng) * opts.length)].to;
    }
    a.wander.prevNode = here; a.wander.atStop = false;
    if (next) this.ctx.goToNode(a, next, 'procházka');
  }

  /**
   * Prodavači (balíček 02 §5, A10): zákazník má přednost, předání před vším; bez zákazníka občas
   * srovná zboží na pultu. Stav je v SimState (checkpoint), vykreslení ho jen čte.
   */
  private stepVendors(t: number) {
    const vs = (this.state.vendors ??= {});
    for (const o of this.project.objects) {
      if (!o.seller) continue;
      const v = (vs[o.id] ??= { objectId: o.id, mode: 'idle', since: t, until: 0, customerId: null, nextTidy: t + 5 + hashString(o.id) % 20, rng: seedRng(this.project.seed, `vendor:${o.id}`) });
      const cust = this.state.agents.find((a) => !a.hidden && a.activity && (a.activity.data as { standId?: string }).standId === o.id && ['browse', 'order', 'prepare', 'receive'].includes(a.activity.phase));
      let mode: typeof v.mode = 'idle';
      if (cust) {
        const ph = cust.activity!.phase;
        mode = ph === 'receive' ? 'handover' : ph === 'prepare' ? 'retrieve' : 'attend';
      } else if (v.mode === 'tidy' && t < v.until) mode = 'tidy';
      else if (t >= v.nextTidy) { mode = 'tidy'; v.until = t + randRange(v.rng, 2, 4); v.nextTidy = v.until + randRange(v.rng, 20, 60); }
      if (cust && v.mode === 'tidy') v.nextTidy = t + randRange(v.rng, 20, 60); // úklid přerušen zákazníkem
      if (mode !== v.mode) { v.mode = mode; v.since = t; }
      v.customerId = cust?.id ?? null;
    }
  }

  /** Pára z kelímků a stánků, kouř z komínů (E03–E05) – jen když je prostředí zapnuté. */
  private stepEnvironment(t: number) {
    const env = this.project.scene.environment;
    if (!env) return;
    const pool = (this.state.particles ??= []);
    // dožilé částice pryč (pool je seřazený podle vzniku; životnosti jsou krátké)
    while (pool.length && t - pool[0].t0 > 9) pool.shift();
    const seed = this.project.seed, w0 = windIntegral(seed, t, env.gusts);
    const sc = (y: number) => depthScaleAt(this.project.scene.depth, y);
    let n = this.state.step * 131;
    if (env.cupSteam) for (const p of this.state.props) {
      if (p.kind !== 'cup' || p.place.kind !== 'held' || t - p.appearedAt > 150) continue;
      const id = hashString(p.id);
      if (!emitsNow(id, 2.5, t, SIM_DT)) continue;
      const a = this.state.agents.find((x) => x.id === (p.place as { agentId: string }).agentId);
      if (!a || a.hidden) continue;
      const h = this.handPosition(a), s = sc(a.pos.y);
      emit(pool, { kind: 'cupSteam', x: h.x, y: h.y - 9 * s, t0: t, life: 0.8 + ((id + n++) % 100) / 100, w0, sc: s, seed: id + this.state.step });
    }
    if (env.stallSteam) for (const o of this.project.objects) {
      const a = this.project.assets.find((x) => x.id === o.assetId);
      if (!a?.shape?.steam || !o.visible) continue;
      a.shape.steam.forEach((st, i) => {
        const id = hashString(o.id) + i * 7;
        if (!emitsNow(id, 4, t, SIM_DT)) return;
        const w = (a.width ?? 100) * (a.pixelScale ?? 1) * o.scale, hh = (a.height ?? 100) * (a.pixelScale ?? 1) * o.scale;
        const an = o.anchor ?? a.anchor ?? { x: 0.5, y: 1 };
        const u = o.flipX ? 1 - st.u : st.u;
        const x = o.x - (o.flipX ? 1 - an.x : an.x) * w + u * w, y = o.y - an.y * hh + st.v * hh;
        emit(pool, { kind: 'steam', x, y, t0: t, life: 1.5 + hashNoise(id, this.state.step) * 2, w0, sc: sc(o.y), seed: id * 31 + this.state.step });
      });
    }
    for (const src of env.sources) {
      const id = hashString(src.id);
      if (!emitsNow(id, src.rate, t, SIM_DT)) continue;
      const s = sc(Math.max(src.y, this.project.scene.depth.yFar));
      emit(pool, { kind: src.kind === 'smoke' ? 'smoke' : 'steam', x: src.x, y: src.y, t0: t, life: src.kind === 'smoke' ? 4 + hashNoise(id, this.state.step) * 4 : 1.5 + hashNoise(id, this.state.step) * 2, w0, sc: s, seed: id * 17 + this.state.step });
    }
  }

  private stepProps(t: number) {
    const fps = this.state.footprints;
    // (čas na konci kroku – po kroku nesmí zůstat stopa starší než životnost)
    const tEnd = t + SIM_DT;
    if (fps && fps.length && tEnd - fps[0].t0 > FOOTPRINT_LIFE) { let k = 0; while (k < fps.length && tEnd - fps[k].t0 > FOOTPRINT_LIFE) k++; fps.splice(0, k); }
    const keep: PropState[] = [];
    for (const p of this.state.props) {
      if (p.place.kind === 'falling' && t >= p.place.t1) {
        const bin = p.place.binId;
        p.place = { kind: 'inBin', objectId: bin };
        this.state.binCounts[bin] = (this.state.binCounts[bin] ?? 0) + 1;
        this.state.stats.cupsDisposed++;
      }
      if (p.place.kind === 'counter' && t - p.appearedAt > 15 && !this.state.agents.some((a) => a.activity && (a.activity.data as { cupId?: string }).cupId === p.id)) {
        this.log('info', 'Nepřevzatý kelímek uklidil prodavač ze pultu.');
        continue;
      }
      // Kelímky v koši se po čase „slisují“ – drží se jen počet, aby stav nerostl bez omezení.
      if (p.place.kind === 'inBin') continue;
      keep.push(p);
    }
    this.state.props = keep;
  }

  /** Pro UI: souhrn stavu rezervací. */
  reservationSummary(): { key: string; owner: string }[] {
    return Object.entries(this.state.reservations).map(([key, owner]) => ({ key, owner: this.state.agents.find((a) => a.id === owner)?.name ?? owner }));
  }

  characterOf(agentId: string) { return this.chars.get(agentId); }
  /** Interakční body objektu převedené do scény (s přístupovým uzlem) – pro editor i diagnostiku. */
  pointsOf(objectId: string): ResolvedPoint[] { return this.points.get(objectId) ?? []; }
}

export function agentSeedHash(project: ProjectFile) { return hashString(String(project.seed)); }
