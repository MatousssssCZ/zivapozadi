import type { ProjectFile, SceneObject, ActivityZone, CharacterInstance } from '../model/types';
import { buildNavGraph, findPath, nearestAccessibleNode, type NavGraph } from '../nav/navGraph';
import { interactionPointWorld } from '../scene/geometry';
import { seedRng, rand, randRange, pickWeighted, hashString } from '../math/rng';
import { canonicalJson, fingerprint } from '../model/hash';
import { ALL_DIRECTIONS, resolveDirection, resolveClip, type CharacterManifest } from '../anim/manifest';
import { initialAnimState, playAction, stepAnimator, stopAction } from '../anim/animator';
import { getActivity } from '../activities/registry';
import { characterVisual, localToScene, gaitContextFor } from '../render/characterPose';
import { depthScaleAt, groundLen, groundAngle, GROUND_DEPTH_K } from '../scene/geometry';
import { Reservations } from './reservations';
import { stepMovement, directionFromAngle, turnInPlace } from './movement';
import type { SimContext, ResolvedPoint, CharacterControl } from './context';
import { ALL_VIEWS } from '../anim/skeleton';
import { gaitEvents } from '../anim/gaitProfile';
import { SIM_DT, SIM_STATE_VERSION, type AgentState, type SimState, type Waypoint, type PropState, type LogEntry } from './types';
import { dist, approachAngle, type Vec2 } from '../math/vec';
import { limitSlope } from '../nav/slope';
import { stepSpacing, stepFollower, visualRoot, PAIR_GAP } from './spacing';

export interface Diagnostic { level: 'warning' | 'error'; message: string; ref?: string }

const MAX_LOG = 400;

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
      const g = PAIR_GAP * this.scaleOf(l);
      f.facing = l.facing;
      f.pos = { x: l.pos.x - Math.sin(l.facing) * side * g, y: l.pos.y + Math.cos(l.facing) * side * g };
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
      playAction(a, clip, defaults) {
        const w = playAction(a.anim, self.manifests[self.chars.get(a.id)!.assetId], clip, defaults);
        if (w) self.addDiag('warning', w);
      },
      stopAction: (a) => stopAction(a.anim),
      actionFinished: (a) => !a.anim.action || a.anim.action.finished,
      spawnProp(kind, place) {
        const p: PropState = { id: `prop${self.state.nextPropId++}`, kind, place, appearedAt: self.time(), sips: 0 };
        self.state.props.push(p); return p;
      },
      prop: (id) => self.state.props.find((p) => p.id === id),
      handPosition: (a) => self.handPosition(a),
      log: (l, m, id) => self.log(l, m, id),
      rand: (a) => rand(a.rng),
      randRange: (a, lo, hi) => randRange(a.rng, lo, hi),
      isRemoved: (id) => self.state.removedObjects.includes(id),
      character: self.characterControl(),
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
        p.place = { kind: 'held', agentId: a.id }; a.holding = p.id;
      },
      detachFromHand(a) { const id = a.holding; a.holding = null; return id; },
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
      if (hn) { xy[i] = { x: hn.x, y: hn.y, key: an[i]!, h: a.groundHeading ?? a.facing }; continue; }
      const cv = characterVisual(a, m, c, this.project.scene.depth);
      const hp = cv.pose.heelPts?.[i];
      if (hp) { const p = localToScene(cv, hp); xy[i] = { x: p.x, y: p.y, key: an[i]!, h: a.groundHeading ?? a.facing }; }
    }
  }

  handPosition(a: AgentState) {
    const c = this.chars.get(a.id)!;
    const cv = characterVisual(a, this.manifests[c.assetId], c, this.project.scene.depth);
    return localToScene(cv, cv.grip);
  }

  // ---------------------------------------------------------------- krok simulace
  step(): void {
    const t = this.time();
    this.stepSchedule(t);
    // 1) pohyb (trasy, dvojice), 2) rozestupy, 3) animace a rozhodování
    for (const a of this.state.agents) this.stepMotion(a);
    stepSpacing(this.state.agents.map((a) => ({ a, scale: this.scaleOf(a) })), SIM_DT);
    for (const a of this.state.agents) this.stepAgent(a, t);
    this.stepProps(t);
    this.state.step++;
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

  /** Pohyb po trase (nebo vedle vůdce dvojice) a natáčení v klidu. */
  private stepMotion(a: AgentState) {
    if (a.follow) {
      const leader = this.state.agents.find((x) => x.id === a.follow!.leaderId);
      if (leader) { stepFollower(a, leader, this.scaleOf(a), this.vmax(a), SIM_DT, this.project.scene.maxWalkSlopeDeg ?? 45); this.motion.set(a.id, { arrived: false, waitingNarrow: false }); return; }
      a.follow = null;
    }
    const dest = a.route?.dest ?? null;
    const cap = a.speedCap;
    const mv = stepMovement(a, this.graph, this.res, SIM_DT, cap != null ? Math.max(0, Math.min(this.vmax(a), cap)) : this.vmax(a));
    if (mv.arrived && dest) a.loc = dest;
    if (!a.route) {
      if (a.look) {
        const target = 'angle' in a.look ? a.look.angle : Math.atan2(a.look.y - a.pos.y, a.look.x - a.pos.x);
        turnInPlace(a, target, SIM_DT);
      }
    }
    this.motion.set(a.id, mv);
  }

  private stepAgent(a: AgentState, t: number) {
    const c = this.chars.get(a.id)!;
    const m = this.manifests[c.assetId];
    const mv = this.motion.get(a.id) ?? { arrived: false, waitingNarrow: false };
    // skutečný pohyb vizuálního kořene (trasa + rozestupy) pohání nohy
    const vr = visualRoot(a), vp = a.visPrev ?? vr;
    const vdx = vr.x - vp.x, vdy = vr.y - vp.y, visSpeed = groundLen(vdx, vdy) / SIM_DT;
    // směr kroků: plynule za skutečným pohybem (bez šumu malých posunů)
    const gTarget = visSpeed > 3 ? Math.atan2(vdy / GROUND_DEPTH_K, vdx) : groundAngle(a.facing);
    a.groundHeading = approachAngle(a.groundHeading ?? groundAngle(a.facing), gTarget, 6 * SIM_DT);
    a.visPrev = vr;
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
      const cv = characterVisual(a, m, c, this.project.scene.depth);
      heelsNow = [0, 1].map((i) => (cv.pose.heelPts ? localToScene(cv, cv.pose.heelPts[i]) : null));
    }
    const events = stepAnimator(a.anim, m, SIM_DT, visSpeed, this.vmax(a), scale, gaitContextFor(m, c));
    this.latchFootAnchors(a, c, m, heelsNow);
    if (mv.waitingNarrow) a.status = 'Čeká před úzkým průchodem';
    // 3) rozhodování + účast v činnosti
    if (a.follow) { const l = this.state.agents.find((x) => x.id === a.follow!.leaderId); a.status = l ? `Jde s postavou ${l.name}` : 'Stojí'; return; }
    if (a.activity) { this.stepActivity(a, events); return; }
    if (a.pendingActivity && !a.route) { this.tryStartPending(a); if (a.activity) return; }
    if (a.route) { if (!mv.waitingNarrow) a.status = a.pendingActivity ? 'Jde k činnosti' : 'Prochází se'; return; }
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
    const run = runner.start(this.ctx, a, zone, p.source, p.sourceId);
    if (!run) {
      a.cooldowns[p.type] = this.time() + 10;
      if (p.source === 'schedule' && p.sourceId) { const rt = this.state.schedule[p.sourceId]; rt.status = 'waiting'; rt.waitingSince ??= this.time(); rt.nextTry = this.time() + 0.5; }
      return;
    }
    a.activity = run; a.wander.atStop = false; a.look = a.look ?? null;
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

  private stepProps(t: number) {
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
