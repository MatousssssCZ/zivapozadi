import type { ActivityDefinition, ActivityRunner, StepResult } from './types';
import type { SimContext, ResolvedPoint } from '../sim/context';
import type { AgentState, ActivityRun } from '../sim/types';
import type { ActivityZone } from '../model/types';
import { randInt } from '../math/rng';

export const coffeeDefinition: ActivityDefinition = {
  type: 'coffee', version: 1, label: 'Káva u stánku', status: 'implemented',
  description: 'Postava si u stánku objedná kávu, převezme kelímek, vypije ho u stolečku nebo s výhledem a kelímek vyhodí do koše.',
  participants: [{ role: 'customer', min: 1, max: 1, requiredCapabilities: ['walk', 'hold-cup', 'drink'] }],
  requiredObjects: [
    { role: 'stand', label: 'Stánek', interactionKinds: ['stand'], min: 1 },
    { role: 'seating', label: 'Místo k pití (stoleček / výhled)', interactionKinds: ['table', 'viewpoint'], min: 0 },
    { role: 'bin', label: 'Koš', interactionKinds: ['bin'], min: 1 },
  ],
  props: [{ id: 'cup', kind: 'cup', label: 'Kelímek' }],
  workPointKinds: ['service', 'seat', 'view', 'drop'],
  entryPointKinds: ['queue'],
  surface: null,
  capacity: { description: 'Každý obslužný bod, místo ve frontě, místo u stolku a výhozní bod koše má kapacitu 1 a rezervuje se předem.' },
  preconditions: ['Postava má volné ruce.', 'Alespoň jeden stánek je dosažitelný a má volné obslužné místo nebo místo ve frontě.'],
  phases: [
    { id: 'to-stand', label: 'Cesta ke stánku / do fronty' },
    { id: 'queue', label: 'Čekání ve frontě' },
    { id: 'order', label: 'Objednávka', animation: 'talk' },
    { id: 'receive', label: 'Převzetí kelímku', animation: 'receive', events: ['take'] },
    { id: 'choose-spot', label: 'Výběr místa' },
    { id: 'to-spot', label: 'Cesta s kelímkem' },
    { id: 'drink', label: 'Pití', animation: 'drink', events: ['sip'] },
    { id: 'choose-bin', label: 'Výběr koše' },
    { id: 'to-bin', label: 'Cesta ke koši' },
    { id: 'drop', label: 'Odložení kelímku', animation: 'drop', events: ['release'] },
  ],
  outcome: 'Kelímek skončí v koši; postava pokračuje v běžném pohybu; činnost se může opakovat po intervalu.',
  repeat: { defaultIntervalMin: 90, defaultIntervalMax: 180, description: 'Interval mezi koncem a dalším pokusem nastavitelný u postavy.' },
  defaultParams: { orderMin: 3, orderMax: 5, sipsMin: 2, sipsMax: 4, sipPauseMin: 3, sipPauseMax: 7, queueTimeout: 90, spotWaitMax: 12 },
};

interface CoffeeData {
  standId?: string; serviceKey?: string; queueKey?: string; queueName?: string;
  spotKey?: string | null; binId?: string; dropKey?: string;
  cupId?: string; orderEnd?: number; sipsTarget?: number; sipsDone?: number; nextSipAt?: number;
  deadline?: number; spotWaitUntil?: number; standingNode?: string | null;
  /** Společná káva dvojice: druhý účastník, kdo vybírá místo, zda už je místo přidělené. */
  partnerId?: string; groupLead?: boolean; go?: boolean; steppedAside?: boolean;
  nextTalkAt?: number; acting?: 'talk' | 'drink' | null;
}

/** Druhý účastník společné kávy (jen pokud ji opravdu ještě dělá). */
function partnerOf(ctx: SimContext, self: AgentState, run: ActivityRun): { agent: AgentState; data: CoffeeData; run: ActivityRun } | null {
  const id = d(run).partnerId;
  if (!id) return null;
  const agent = ctx.state.agents.find((a) => a.id === id);
  const pr = agent?.activity;
  if (!agent || !pr || pr.type !== 'coffee' || d(pr).partnerId !== self.id) return null;
  return { agent, data: d(pr), run: pr };
}
const PHASE_ORDER = ['to-stand', 'to-queue', 'queue', 'to-service', 'order', 'receive', 'choose-spot', 'to-spot', 'drink', 'choose-bin', 'to-bin', 'drop'];
const phaseIdx = (r: ActivityRun) => PHASE_ORDER.indexOf(r.phase);

const num = (z: ActivityZone, k: string): number => {
  const v = z.params[k];
  return typeof v === 'number' ? v : (coffeeDefinition.defaultParams[k] as number);
};
const d = (run: ActivityRun) => run.data as CoffeeData;
const setPhase = (ctx: SimContext, run: ActivityRun, phase: string) => { run.phase = phase; run.phaseStart = ctx.time(); };

function role(ctx: SimContext, zone: ActivityZone, r: string): string[] {
  return (zone.objectRoles[r] ?? []).filter((id) => ctx.object(id) && !ctx.isRemoved(id) && ctx.object(id)!.visible);
}

interface StandOption { standId: string; service: ResolvedPoint | null; queue: ResolvedPoint | null; load: number }

function standOptions(ctx: SimContext, agent: AgentState, zone: ActivityZone): { options: StandOption[]; unreachable: string[] } {
  const options: StandOption[] = [], unreachable: string[] = [];
  for (const sid of role(ctx, zone, 'stand')) {
    const services = ctx.points(sid, 'service').filter((p) => ctx.canReach(agent, p));
    if (!services.length) { unreachable.push(ctx.object(sid)!.name); continue; }
    const qName = `stand:${sid}`;
    const qLen = (ctx.state.queues[qName] ?? []).length;
    const busy = services.filter((p) => !ctx.res.isFree(p.key)).length;
    const freeService = qLen === 0 ? services.find((p) => ctx.res.isFree(p.key)) ?? null : null;
    const freeQueue = ctx.points(sid, 'queue').filter((p) => ctx.canReach(agent, p)).find((p) => ctx.res.isFree(p.key)) ?? null;
    options.push({ standId: sid, service: freeService, queue: freeQueue, load: qLen + busy });
  }
  return { options, unreachable };
}

/** Kolik postav se teď vejde ke stánku (volná obslužná místa + volná místa ve frontě) – pro dvojice. */
export function coffeeFreeSlots(ctx: SimContext, agent: AgentState, zone: ActivityZone): number {
  let best = 0;
  for (const sid of role(ctx, zone, 'stand')) {
    const qLen = (ctx.state.queues[`stand:${sid}`] ?? []).length;
    const svc = qLen === 0 ? ctx.points(sid, 'service').filter((p) => ctx.res.isFree(p.key) && ctx.canReach(agent, p)).length : 0;
    const q = ctx.points(sid, 'queue').filter((p) => ctx.res.isFree(p.key) && ctx.canReach(agent, p)).length;
    best = Math.max(best, svc + q);
  }
  return best;
}

export const coffeeRunner: ActivityRunner = {
  definition: coffeeDefinition,

  canStart(ctx, agent, zone) {
    if (agent.holding) return { ok: false, reason: 'Postava má plné ruce.', retryAfter: 20 };
    if (!role(ctx, zone, 'bin').length) return { ok: false, reason: `Zóna „${zone.name}“ nemá koš.`, retryAfter: 60 };
    const { options, unreachable } = standOptions(ctx, agent, zone);
    if (!options.length) return { ok: false, reason: unreachable.length ? `Stánek ${unreachable.join(', ')} není z místa postavy dosažitelný.` : `Zóna „${zone.name}“ nemá stánek.`, retryAfter: 30 };
    if (!options.some((o) => o.service || o.queue)) return { ok: false, reason: 'Stánek i fronta jsou plné.', retryAfter: 8 };
    return { ok: true };
  },

  start(ctx, agent, zone, source, sourceId) {
    const { options } = standOptions(ctx, agent, zone);
    const withService = options.filter((o) => o.service).sort((a, b) => a.load - b.load);
    const withQueue = options.filter((o) => o.queue).sort((a, b) => a.load - b.load);
    const run: ActivityRun = { type: 'coffee', zoneId: zone.id, source, sourceId, phase: 'to-stand', phaseStart: ctx.time(), data: {} };
    const data = d(run);
    if (withService.length) {
      const o = withService[0];
      if (!ctx.res.tryReserve(o.service!.key, agent.id)) return null;
      data.standId = o.standId; data.serviceKey = o.service!.key; data.queueName = `stand:${o.standId}`;
      if (!ctx.goToPoint(agent, o.service!, 'ke stánku')) { ctx.res.release(o.service!.key, agent.id); return null; }
      setPhase(ctx, run, 'to-service');
    } else if (withQueue.length) {
      const o = withQueue[0];
      if (!ctx.res.tryReserve(o.queue!.key, agent.id)) return null;
      data.standId = o.standId; data.queueKey = o.queue!.key; data.queueName = `stand:${o.standId}`;
      ctx.res.enqueue(data.queueName, agent.id);
      if (!ctx.goToPoint(agent, o.queue!, 'do fronty')) { ctx.res.release(o.queue!.key, agent.id); ctx.res.dequeue(data.queueName, agent.id); return null; }
      data.deadline = ctx.time() + num(zone, 'queueTimeout');
      setPhase(ctx, run, 'to-queue');
    } else return null;
    ctx.log('info', `${agent.name} jde na kávu (${ctx.object(data.standId!)?.name}).`, agent.id);
    return run;
  },

  step(ctx, agent, run, events): StepResult {
    const zone = ctx.zone(run.zoneId);
    const data = d(run);
    if (!zone) return 'failed';
    const now = ctx.time();
    const moving = ctx.isMoving(agent);
    switch (run.phase) {
      case 'to-queue': {
        agent.status = 'Jde do fronty u stánku';
        if (!moving) setPhase(ctx, run, 'queue');
        return 'running';
      }
      case 'queue': {
        agent.status = 'Čeká ve frontě';
        if (now > (data.deadline ?? Infinity)) { ctx.log('warn', `${agent.name}: fronta u stánku trvá příliš dlouho, odchází.`, agent.id); return 'failed'; }
        if (ctx.res.queuePos(data.queueName!, agent.id) !== 0) return 'running';
        const service = ctx.points(data.standId!, 'service').find((p) => ctx.res.isFree(p.key) && ctx.canReach(agent, p));
        if (!service) return 'running';
        ctx.res.tryReserve(service.key, agent.id);
        ctx.res.release(data.queueKey!, agent.id); ctx.res.dequeue(data.queueName!, agent.id);
        data.serviceKey = service.key; data.queueKey = undefined;
        if (!ctx.goToPoint(agent, service, 'k obsluze')) return 'failed';
        setPhase(ctx, run, 'to-service');
        return 'running';
      }
      case 'to-service': {
        agent.status = 'Jde k obslužnému místu';
        if (moving) return 'running';
        ctx.res.dequeue(data.queueName!, agent.id);
        data.orderEnd = now + ctx.randRange(agent, num(zone, 'orderMin'), num(zone, 'orderMax'));
        ctx.playAction(agent, 'talk', { duration: 1.4, loop: 'loop' });
        setPhase(ctx, run, 'order');
        return 'running';
      }
      case 'order': {
        agent.status = 'Objednává';
        if (now < data.orderEnd!) return 'running';
        ctx.stopAction(agent);
        // Prodavač postaví kelímek na pult (zjednodušené předání – kelímek se na pultu objeví).
        const stand = ctx.object(data.standId!)!;
        const counter = ctx.points(stand.id, 'counter')[0];
        const sp = ctx.pointByKey(data.serviceKey!)!;
        const at = counter ? counter.pos : { x: sp.pos.x, y: sp.pos.y - 70 };
        const cup = ctx.spawnProp('cup', { kind: 'counter', objectId: stand.id, x: at.x, y: at.y });
        data.cupId = cup.id;
        ctx.playAction(agent, 'receive', { duration: 1.1, events: [{ time: 0.6, name: 'take' }] });
        setPhase(ctx, run, 'receive');
        return 'running';
      }
      case 'receive': {
        agent.status = 'Přebírá kelímek';
        const cup = ctx.prop(data.cupId!);
        if (cup && cup.place.kind === 'counter' && (events.includes('take') || ctx.actionFinished(agent))) {
          ctx.character.attachToHand(agent, cup.id);
          ctx.state.stats.cupsServed++;
          ctx.log('info', `${agent.name} převzal(a) kelímek.`, agent.id);
        }
        if (!ctx.actionFinished(agent)) return 'running';
        ctx.stopAction(agent);
        if (!agent.holding) return 'failed';
        ctx.res.release(data.serviceKey!, agent.id);
        setPhase(ctx, run, 'choose-spot');
        return 'running';
      }
      case 'choose-spot': {
        agent.status = 'Hledá místo k pití';
        const pt = partnerOf(ctx, agent, run);
        if (pt) {
          // společná káva: uvolnit obslužné místo a počkat na přítele; místo vybírá vůdce pro oba
          if (!data.steppedAside && agent.loc.kind === 'point') { data.steppedAside = true; ctx.goToNode(agent, agent.loc.anchor, 'odstoupit od stánku'); }
          if (!data.groupLead) {
            agent.status = `Čeká na: ${pt.agent.name}`;
            if (!data.go || moving) return 'running';
            if (data.spotKey) { const p = ctx.pointByKey(data.spotKey); if (p && ctx.goToPoint(agent, p, 'k místu s kávou')) { setPhase(ctx, run, 'to-spot'); return 'running'; } }
            data.spotKey = null; setPhase(ctx, run, 'to-spot');
            return 'running';
          }
          if (phaseIdx(pt.run) < phaseIdx(run) || moving) { agent.status = `Čeká na: ${pt.agent.name}`; return 'running'; }
          // stoleček (nebo místo) pro dva: dvě volná místa u stejného objektu
          for (const id of role(ctx, zone, 'seating')) {
            const free = [...ctx.points(id, 'seat'), ...ctx.points(id, 'view')].filter((p) => ctx.res.isFree(p.key) && ctx.canReach(agent, p) && ctx.canReach(pt.agent, p));
            if (free.length < 2) continue;
            const [p1, p2] = free;
            if (Math.hypot(p1.pos.x - p2.pos.x, p1.pos.y - p2.pos.y) > 160) continue; // ať si můžou povídat
            ctx.res.tryReserve(p1.key, agent.id); ctx.res.tryReserve(p2.key, pt.agent.id);
            data.spotKey = p1.key; pt.data.spotKey = p2.key; pt.data.go = true;
            if (!ctx.goToPoint(agent, p1, 'ke stolku s přítelem')) { data.spotKey = null; }
            setPhase(ctx, run, 'to-spot');
            ctx.log('info', `${agent.name} a ${pt.agent.name} si jdou sednout ke stolku „${ctx.object(id)?.name}“.`, agent.id);
            return 'running';
          }
          // žádný volný stolek pro dva: vypijí to vestoje vedle sebe
          if (data.spotWaitUntil === undefined) data.spotWaitUntil = now + num(zone, 'spotWaitMax');
          if (now < data.spotWaitUntil) return 'running';
          data.spotKey = null; pt.data.spotKey = null; pt.data.go = true;
          setPhase(ctx, run, 'to-spot');
          ctx.log('info', `${agent.name} a ${pt.agent.name}: žádný volný stolek, pijí vestoje.`, agent.id);
          return 'running';
        }
        const pts = role(ctx, zone, 'seating').flatMap((id) => [...ctx.points(id, 'seat'), ...ctx.points(id, 'view')])
          .filter((p) => ctx.res.isFree(p.key) && ctx.canReach(agent, p));
        if (pts.length) {
          const p = pts[Math.floor(ctx.rand(agent) * pts.length)];
          ctx.res.tryReserve(p.key, agent.id);
          data.spotKey = p.key;
          if (!ctx.goToPoint(agent, p, 'k místu s kávou')) { ctx.res.release(p.key, agent.id); data.spotKey = null; return 'running'; }
          setPhase(ctx, run, 'to-spot');
          return 'running';
        }
        // Žádné volné místo: uvolnit obslužné místo (odstoupit do uzlu) a chvíli čekat.
        if (data.spotWaitUntil === undefined) {
          data.spotWaitUntil = now + num(zone, 'spotWaitMax');
          if (agent.loc.kind === 'point') ctx.goToNode(agent, agent.loc.anchor, 'odstoupit od stánku');
        }
        if (!moving && now >= data.spotWaitUntil) {
          data.spotKey = null; setPhase(ctx, run, 'to-spot');
          ctx.log('info', `${agent.name}: žádné volné místo, pije vestoje.`, agent.id);
        }
        return 'running';
      }
      case 'to-spot': {
        agent.status = 'Nese kávu na místo';
        if (moving) return 'running';
        data.sipsTarget = randInt(agent.rng, num(zone, 'sipsMin'), num(zone, 'sipsMax'));
        data.sipsDone = 0; data.nextSipAt = now + ctx.randRange(agent, 1.2, 2.5);
        setPhase(ctx, run, 'drink');
        return 'running';
      }
      case 'drink': {
        const pt = partnerOf(ctx, agent, run);
        agent.status = pt ? `Povídá si s: ${pt.agent.name} (káva ${data.sipsDone}/${data.sipsTarget})` : `Pije kávu (${data.sipsDone}/${data.sipsTarget})`;
        if (pt) agent.look = { x: pt.agent.pos.x, y: pt.agent.pos.y }; // natočení k příteli
        if (events.includes('sip')) {
          data.sipsDone!++; ctx.state.stats.sips++;
          const cup = ctx.prop(data.cupId!); if (cup) cup.sips++;
        }
        if (agent.anim.action) {
          if (!ctx.actionFinished(agent)) return 'running';
          ctx.stopAction(agent);
          const was = data.acting ?? 'drink'; data.acting = null;
          if (was === 'talk') return 'running';
          if (data.sipsDone! >= data.sipsTarget!) { setPhase(ctx, run, 'choose-bin'); return 'running'; }
          // ve dvojici jsou pauzy delší – povídají si
          data.nextSipAt = now + ctx.randRange(agent, num(zone, 'sipPauseMin'), num(zone, 'sipPauseMax')) * (pt ? 1.6 : 1);
          return 'running';
        }
        if (now >= data.nextSipAt!) { data.acting = 'drink'; ctx.playAction(agent, 'drink', { duration: 2.6, events: [{ time: 1.1, name: 'sip' }] }); return 'running'; }
        if (pt && now >= (data.nextTalkAt ?? 0) && data.nextSipAt! - now > 2.2 && !pt.agent.anim.action) {
          // střídají se v mluvení: mluví jen ten, kdo zrovna nic nedělá a druhý neposlouchá… mluví
          data.acting = 'talk';
          ctx.playAction(agent, 'talk', { duration: ctx.randRange(agent, 1.4, 2.4), loop: 'once' });
          data.nextTalkAt = now + ctx.randRange(agent, 2.5, 5);
        }
        return 'running';
      }
      case 'choose-bin': {
        agent.status = 'Hledá koš';
        const ptb = partnerOf(ctx, agent, run);
        if (ptb && phaseIdx(ptb.run) < phaseIdx(run)) {
          // od stolku se odchází spolu: dopovídat, než druhý dopije
          agent.status = `Čeká, až ${ptb.agent.name} dopije`;
          agent.look = { x: ptb.agent.pos.x, y: ptb.agent.pos.y };
          if (!agent.anim.action && now >= (data.nextTalkAt ?? 0) && !ptb.agent.anim.action) {
            ctx.playAction(agent, 'talk', { duration: ctx.randRange(agent, 1.4, 2.2), loop: 'once' }); data.nextTalkAt = now + ctx.randRange(agent, 3, 5);
          }
          if (agent.anim.action && ctx.actionFinished(agent)) ctx.stopAction(agent);
          return 'running';
        }
        if (agent.anim.action) ctx.stopAction(agent);
        agent.look = null;
        const reachable = role(ctx, zone, 'bin').flatMap((id) => ctx.points(id, 'drop')).filter((p) => ctx.canReach(agent, p));
        if (!reachable.length) {
          // Žádný dosažitelný koš: kelímek se viditelně odloží vedle postavy (nikdy nezmizí).
          dropOnGround(ctx, agent, run, 'žádný dosažitelný koš');
          return 'done';
        }
        const free = reachable.filter((p) => ctx.res.isFree(p.key))
          .sort((a, b) => Math.hypot(a.pos.x - agent.pos.x, a.pos.y - agent.pos.y) - Math.hypot(b.pos.x - agent.pos.x, b.pos.y - agent.pos.y));
        if (!free.length) return 'running'; // čeká (stále drží místo k pití), než se koš uvolní
        const p = free[0];
        ctx.res.tryReserve(p.key, agent.id);
        if (data.spotKey) { ctx.res.release(data.spotKey, agent.id); data.spotKey = null; }
        data.dropKey = p.key; data.binId = p.objectId;
        if (!ctx.goToPoint(agent, p, 'ke koši')) { ctx.res.release(p.key, agent.id); return 'running'; }
        setPhase(ctx, run, 'to-bin');
        return 'running';
      }
      case 'to-bin': {
        agent.status = 'Jde ke koši';
        if (moving) return 'running';
        ctx.playAction(agent, 'drop', { duration: 1.0, events: [{ time: 0.55, name: 'release' }] });
        setPhase(ctx, run, 'drop');
        return 'running';
      }
      case 'drop': {
        agent.status = 'Vyhazuje kelímek';
        const cup = agent.holding ? ctx.prop(agent.holding) : undefined;
        if (cup && (events.includes('release') || ctx.actionFinished(agent))) {
          const bin = ctx.object(data.binId!)!;
          const opening = ctx.points(bin.id, 'counter')[0]?.pos ?? { x: bin.x, y: bin.y - 50 * bin.scale };
          const from = ctx.handPosition(agent);
          ctx.character.detachFromHand(agent);
          cup.place = { kind: 'falling', from, to: opening, t0: now, t1: now + 0.35, binId: bin.id };
        }
        if (!ctx.actionFinished(agent)) return 'running';
        ctx.stopAction(agent);
        ctx.res.release(data.dropKey!, agent.id);
        ctx.log('info', `${agent.name} vyhodil(a) kelímek do koše.`, agent.id);
        return 'done';
      }
    }
    return 'failed';
  },

  abort(ctx, agent, run, reason) {
    const data = d(run);
    ctx.stopAction(agent);
    const cup = data.cupId ? ctx.prop(data.cupId) : undefined;
    if (cup && cup.place.kind === 'held') dropOnGround(ctx, agent, run, reason);
    else if (cup && cup.place.kind === 'counter') {
      // Nepřevzatý kelímek zůstává na pultu stánku (viditelně), stánek ho „uklidí“ po 10 s.
      ctx.log('info', `Kelímek zůstal na pultu (${reason}).`, agent.id);
    }
  },

  usesObject(run, objectId) {
    const data = d(run);
    const keys = [data.serviceKey, data.queueKey, data.spotKey, data.dropKey].filter(Boolean) as string[];
    return data.standId === objectId || data.binId === objectId || keys.some((k) => k.startsWith(objectId + '#'));
  },
};

function dropOnGround(ctx: SimContext, agent: AgentState, run: ActivityRun, reason: string) {
  const cup = agent.holding ? ctx.prop(agent.holding) : undefined;
  if (!cup) return;
  cup.place = { kind: 'ground', x: agent.pos.x + 10, y: agent.pos.y + 2 };
  agent.holding = null;
  ctx.log('warn', `${agent.name} odložil(a) kelímek na zem: ${reason}.`, agent.id);
}
