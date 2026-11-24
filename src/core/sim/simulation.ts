import type { ProjectFile, SceneObject, ActivityZone, CharacterInstance } from '../model/types';
import { buildNavGraph, findPath, nearestAccessibleNode, type NavGraph } from '../nav/navGraph';
import { interactionPointWorld } from '../scene/geometry';
import { seedRng, rand, randRange, pickWeighted, hashString, hashNoise } from '../math/rng';
import { canonicalJson, fingerprint } from '../model/hash';
import { ALL_DIRECTIONS, resolveDirection, resolveClip, type CharacterManifest } from '../anim/manifest';
import { initialAnimState, playAction, stepAnimator, stopAction } from '../anim/animator';
import { getActivity } from '../activities/registry';
import { coffeeFreeSlots } from '../activities/coffee';
import { characterVisual, localToScene, gaitContextFor } from '../render/characterPose';
import { depthScaleAt } from '../scene/geometry';
import { Reservations } from './reservations';
import { directionFromAngle, edgeKey } from './movement';
import type { SimContext, ResolvedPoint, CharacterControl } from './context';
import { ALL_VIEWS } from '../anim/skeleton';
import { gaitEvents } from '../anim/gaitProfile';
import { FOOTPRINT_LIFE, FOOTPRINT_POOL } from './types';
import { SIM_DT, SIM_STATE_VERSION, type AgentState, type SimState, type Waypoint, type PropState, type LogEntry } from './types';
import { dist, approachAngle, wrapAngle, type Vec2 } from '../math/vec';
import { limitSlope } from '../nav/slope';
import { pointInPolygon } from '../math/geom';
import { planCrowd, solveCrowd, wantVelocity, comfortRadius, insidePoly, R_BODY, type CrowdItem, type ObstacleW } from './crowd';
import { cameraFor, toWorld, toScreen, worldAngleOfScreen, screenAngleOfWorld, Q, type World } from '../scene/camera';
import { viewForDirection } from '../anim/skeleton';
import { emit, emitsNow, windIntegral } from './environment';
import { createAnimals, stepAnimals } from './animals';
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
    this.graph = buildNavGraph(project);
    this.objects = new Map(project.objects.map((o) => [o.id, o]));
    this.zones = new Map(project.zones.map((z) => [z.id, z]));
    this.chars = new Map(project.characters.map((c) => [c.id, c]));
    this.res = new Reservations(state);
    this.compilePoints();
    this.ctx = this.makeContext();
    this.staticDiagnostics();
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
    if (this.project.characters.some((c) => c.pet) || this.project.cats?.length) stepAnimals((this.state.animals ??= createAnimals(this.project)), this.state.agents, this.project, t, SIM_DT);
    this.stepEnvironment(t);
    this.stepProps(t);
    this.state.step++;
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
      walkPath(a, pts, purpose) {
        for (const e of a.route?.heldEdges ?? []) self.res.release(edgeKey(e), a.id);
        a.route = { wps: pts.map((p) => ({ x: p.x, y: p.y, nodeId: null, edgeId: null })), idx: 0, heldEdges: [], purpose, dest: null };
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
      isSnow: (p) => self.project.areas.some((ar) => ar.kind === 'snow' && ar.polygon.length >= 3 && pointInPolygon(p, ar.polygon)),
    });
  }
  private stepSessions(t: number) {
    if (this.state.props.some((p) => p.place.kind === 'flying')) stepBalls(this.sessionHost()); // koule vždy doletí
    if (!this.state.sessions?.length) return;
    const h = this.sessionHost();
    for (const s of [...this.state.sessions]) {
      const r = s.type === 'snowman' ? stepSnowman(h, s) : s.type === 'snowballFight' ? stepFight(h, s) : 'running';
      if (r === 'running') continue;
      if (s.type === 'snowman' && r === 'aborted') { this.log('info', 'Stavba sněhuláka se přerušila.'); abortSnowman(h, s); }
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
    }
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
    return c.walkSpeed * a.pace * (a.speedFactor ?? 1) * depthScaleAt(this.project.scene.depth, a.pos.y) * c.baseScale;
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
    if (!ro?.length) return this.obstaclesW;
    // sněhuláci: kolizní stopa (osmiúhelník kolem spodní koule)
    const c = this.cam();
    return [...this.obstaclesW, ...ro.map((o) => { const P = toWorld(c, o), r = o.radii[0] + 0.05; return { poly: Array.from({ length: 8 }, (_, i) => ({ X: P.X + r * Math.cos((i * Math.PI) / 4), Z: P.Z + r * Math.sin((i * Math.PI) / 4) })) }; })];
  }

  /** Rychlost chůze postavy v m/s (dvojice jde tempem pomalejšího). */
  private vmaxMps(a: AgentState): number {
    const own = (x: AgentState) => { const c = this.chars.get(x.id)!; return c.walkSpeed * x.pace * (x.speedFactor ?? 1) * Q * c.baseScale; };
    const f = this.state.agents.find((x) => x.follow?.leaderId === a.id && !x.hidden);
    return f ? Math.min(own(a), own(f) * 0.97) : own(a);
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
      a.off = undefined; a.speedCap = null;
      if (a.follow) {
        const leader = this.state.agents.find((x) => x.id === a.follow!.leaderId);
        if (!leader) { a.follow = null; }
        else if (leader.hidden) { a.hidden = true; a.pos = { ...leader.pos }; a.speed = 0; a.vel = { X: 0, Z: 0 }; a.visPrev = undefined; continue; }
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
        const LP = toWorld(cam, L.pos), far = Math.hypot(LP.X - P.X, LP.Z - P.Z) > 2.5;
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
      const partner = a.follow?.leaderId ?? this.state.agents.find((x) => x.follow?.leaderId === a.id)?.id ?? null;
      const hd = a.groundHeading;
      items.push({ id: a.id, p: P, v: a.vel ?? { X: 0, Z: 0 }, pref, vmax, fixed, r: R_BODY, rc: comfortRadius(a.id), partnerOf: partner, choice: a.crowdChoice ?? null, head: hd === undefined ? null : { X: Math.cos(hd), Z: Math.sin(hd) } });
      ags.push(a); mvs.push(mv);
    }
    const obstacles = this.worldObstacles();
    if (this.state.step % 4 === 0) planCrowd(items, obstacles);
    const want = items.map((it) => wantVelocity(it, dt));
    const { v } = solveCrowd(items, want, obstacles, dt);
    for (let i = 0; i < items.length; i++) {
      const a = ags[i], it = items[i];
      a.crowdChoice = it.choice ?? null;
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
    const slot = { X: LP.X + right.X * side * 0.72 - d.X * 0.4, Z: LP.Z + right.Z * side * 0.72 - d.Z * 0.4 };
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
      left -= d; cur = W[k]; target = W[k]; k++;
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
      let passed = d < (last ? 0.06 : 0.35);
      if (!passed && !last) {
        // už je „za bodem“: na dalším úseku (bod → následující) s kladným postupem a blízko něj
        const B = toWorld(cam, wps[r.idx + 1]), ab = { X: B.X - Wk.X, Z: B.Z - Wk.Z }, L2 = ab.X * ab.X + ab.Z * ab.Z;
        if (L2 > 1e-9) {
          const t = ((P.X - Wk.X) * ab.X + (P.Z - Wk.Z) * ab.Z) / L2;
          const qx = Wk.X + ab.X * Math.max(0, Math.min(1, t)), qz = Wk.Z + ab.Z * Math.max(0, Math.min(1, t));
          passed = t > 0 && Math.hypot(P.X - qx, P.Z - qz) < 1.2;
        }
      }
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
    const events = stepAnimator(a.anim, m, SIM_DT, visSpeed, (this.vmaxMps(a) / Q) * scale, scale, gaitContextFor(m, c));
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
    if (a.route) { if (!mv.waitingNarrow) a.status = a.pendingActivity ? 'Jde k činnosti' : this.routeStatus(a); return; }
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
  private portals(): string[] { return this.project.nav.nodes.filter((n) => n.portal && this.graph.nodes.has(n.id)).map((n) => n.id); }

  /** Návštěvník vstoupí do scény vstupem (z místa mimo obraz). */
  private enterScene(a: AgentState, t: number, avoid?: string | null) {
    // dveře budovy jen občas (událost s nízkou četností), jinak okraje scény
    const all = this.portals().filter((p) => p !== avoid);
    const useDoor = all.some((p) => this.graph.nodes.get(p)?.door) ? rand(a.rng) < 0.12 : false; // bez dveří žádné losování navíc
    const ps = all.filter((p) => !!this.graph.nodes.get(p)?.door === useDoor).length ? all.filter((p) => !!this.graph.nodes.get(p)?.door === useDoor) : all;
    const pid = ps.length ? ps[Math.floor(rand(a.rng) * ps.length)] : (this.anchorOf(a));
    const n = this.graph.nodes.get(pid)!;
    // volné místo u vstupu (nikdy na jiné postavě); jinak ještě chvíli počkat mimo scénu
    const cam = this.cam(), P0 = toWorld(cam, { x: n.x, y: n.y });
    const spot = this.freeSpot(a, [P0, ...[0.7, 1.4, 2.1].flatMap((r) => [{ X: P0.X, Z: P0.Z + r }, { X: P0.X, Z: P0.Z - r }, { X: P0.X - Math.sign(P0.X || 1) * r, Z: P0.Z }])]);
    if (!spot) { a.hidden = true; a.visit = { mode: 'offstage', until: t + 1.5, since: t }; return; }
    a.pos = toScreen(cam, spot); a.loc = { kind: 'node', nodeId: pid }; a.route = null; a.arrived = false;
    if (n.door) this.passDoor(t);
    a.hidden = false; a.visPrev = undefined; a.off = { x: 0, y: 0 }; a.look = null;
    a.anim.walkBlend = 0; a.anim.settle = null; a.anim.anchors = undefined; a.anim.anchorsXY = undefined;
    a.visit = { mode: 'choose', until: t, since: t };
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
      f.follow = null; f.hidden = true; f.speed = 0;
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
        if (t >= v.until) this.enterScene(a, t);
        return;
      }
      case 'choose': {
        if (t < v.until) { a.status = 'Stojí'; return; }
        const r = rand(a.rng);
        const zone = this.coffeeZone(a, c);
        // rodina s dítětem: občas si jdou na dětský sníh postavit sněhuláka nebo se koulovat
        const kid = this.state.agents.find((x) => x.follow?.leaderId === a.id && !x.hidden && this.isChild(x));
        if (kid && !a.holding && (this.state.director?.nextSignificant ?? 0) <= t && !this.state.sessions?.length && rand(a.rng) < 0.55) {
          const h = this.sessionHost();
          const zs = this.project.zones.filter((z) => (z.activityType === 'snowman' && !snowmanZoneFree(h, z)) || (z.activityType === 'snowballFight' && !fightZoneProblem(h, z, true)));
          const z = zs.length ? zs[Math.floor(rand(a.rng) * zs.length)] : null;
          if (z && (z.activityType === 'snowman' ? startSnowman(h, z, a, kid) : startFight(h, z, kid, a, true))) {
            a.visit = { mode: 'coffee', until: 0, since: t };
            this.log('info', `${a.name} jde s dítětem (${kid.name}) ${z.activityType === 'snowman' ? 'stavět sněhuláka' : 'koulovat'}.`, a.id);
            return;
          }
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
        // cestou se občas zastaví u stromu / výlohy a chvíli se dívá (A04)
        const view = r < 0.14 ? this.zoneFor(a, c, 'viewing') : null;
        if (view) {
          a.pendingActivity = { type: 'viewing', zoneId: view.id, source: 'auto', sourceId: null };
          a.visit = { mode: 'coffee', until: 0, since: t };
          return;
        }
        this.leaveScene(a, t); // jen projde scénou
        return;
      }
      case 'leave': {
        if (a.route) return;
        if (v.target && this.anchorOf(a) === v.target) { if (this.graph.nodes.get(v.target)?.door) this.passDoor(t); this.goOffstage(a, t); return; }
        this.leaveScene(a, t);
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
    const stops = nodes.filter((n) => n.stop);
    const pool = stops.length && rand(a.rng) < 0.6 ? stops : nodes;
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
    if (fps && fps.length && t - fps[0].t0 > FOOTPRINT_LIFE) { let k = 0; while (k < fps.length && t - fps[k].t0 > FOOTPRINT_LIFE) k++; fps.splice(0, k); }
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
