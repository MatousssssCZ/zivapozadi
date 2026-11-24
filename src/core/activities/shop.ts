/**
 * Nákup u stánku: postava jde k volnému obslužnému místu nebo se postaví do fronty, počká,
 * vybírá a platí (mluví s prodavačem), převezme zboží a odejde. Fronta a obsluha sdílí
 * rezervace se stánkem (jako u kávy), takže u oblíbených stánků vznikají fronty 2–3 lidí.
 */
import type { ActivityDefinition, ActivityRunner, StepResult } from './types';
import type { SimContext, ResolvedPoint } from '../sim/context';
import type { AgentState, ActivityRun } from '../sim/types';
import type { ActivityZone } from '../model/types';

export const shopDefinition: ActivityDefinition = {
  type: 'shop', version: 1, label: 'Nákup u stánku', status: 'implemented',
  description: 'Postava si u stánku vybere a koupí zboží (fronta, obsluha, rozhovor s prodavačem), pak pokračuje.',
  participants: [{ role: 'customer', min: 1, max: 1, requiredCapabilities: ['walk'] }],
  requiredObjects: [{ role: 'stand', label: 'Stánek', interactionKinds: ['stand'], min: 1 }],
  props: [{ id: 'bag', kind: 'bag', label: 'Taška / balíček se zbožím' }],
  workPointKinds: ['service'],
  entryPointKinds: ['queue'],
  surface: null,
  capacity: { description: 'Obslužné místo i každé místo ve frontě má kapacitu 1.' },
  preconditions: ['Stánek je dosažitelný a má volné obslužné místo nebo místo ve frontě.'],
  phases: [
    { id: 'to-queue', label: 'Cesta do fronty' }, { id: 'queue', label: 'Čekání ve frontě' },
    { id: 'to-service', label: 'Cesta k pultu' }, { id: 'browse', label: 'Prohlížení zboží (25 % jen odejde)' },
    { id: 'order', label: 'Výběr a placení (rozhovor s prodavačem)' }, { id: 'prepare', label: 'Prodavač balí zboží' },
    { id: 'receive', label: 'Převzetí tašky', animation: 'receive', events: ['take'] },
  ],
  outcome: 'Postava má nakoupeno a pokračuje v cestě.',
  repeat: { defaultIntervalMin: 120, defaultIntervalMax: 300, description: 'Interval mezi nákupy.' },
  defaultParams: { browseMin: 3, browseMax: 8, leaveChance: 0.25, orderMin: 5, orderMax: 12, prepareMin: 2, prepareMax: 5, queueTimeout: 150 },
};

interface ShopData { standId?: string; serviceKey?: string; queueKey?: string; queueName?: string; orderEnd?: number; deadline?: number; browseEnd?: number; prepareEnd?: number; bagId?: string; buys?: boolean }
const d = (run: ActivityRun) => run.data as ShopData;
const num = (z: ActivityZone, k: string) => (typeof z.params[k] === 'number' ? (z.params[k] as number) : (shopDefinition.defaultParams[k] as number));
const setPhase = (ctx: SimContext, run: ActivityRun, phase: string) => { run.phase = phase; run.phaseStart = ctx.time(); };

function stands(ctx: SimContext, zone: ActivityZone): string[] {
  return (zone.objectRoles.stand ?? []).filter((id) => ctx.object(id) && !ctx.isRemoved(id) && ctx.object(id)!.visible);
}
interface Opt { standId: string; service: ResolvedPoint | null; queue: ResolvedPoint | null; load: number }
function options(ctx: SimContext, agent: AgentState, zone: ActivityZone): Opt[] {
  const out: Opt[] = [];
  for (const sid of stands(ctx, zone)) {
    const services = ctx.points(sid, 'service').filter((p) => ctx.canReach(agent, p));
    if (!services.length) continue;
    const qName = `stand:${sid}`, qLen = (ctx.state.queues[qName] ?? []).length;
    const freeService = qLen === 0 ? services.find((p) => ctx.res.isFree(p.key)) ?? null : null;
    const freeQueue = ctx.points(sid, 'queue').filter((p) => ctx.canReach(agent, p)).find((p) => ctx.res.isFree(p.key)) ?? null;
    out.push({ standId: sid, service: freeService, queue: freeQueue, load: qLen + services.filter((p) => !ctx.res.isFree(p.key)).length });
  }
  return out;
}

/** Zboží podle stánku (barva/obsah tašky). */
function goodsOf(name: string): string {
  const n = name.toLowerCase();
  return n.includes('perník') || n.includes('pernik') ? 'pernik' : n.includes('hrač') ? 'hracky' : n.includes('plet') ? 'pletene' : 'zbozi';
}

export const shopRunner: ActivityRunner = {
  definition: shopDefinition,
  canStart(ctx, agent, zone) {
    if (agent.holding) return { ok: false, reason: 'Postava nemá volnou ruku na tašku.', retryAfter: 30 };
    const o = options(ctx, agent, zone);
    if (!o.length) return { ok: false, reason: 'Žádný dosažitelný stánek.', retryAfter: 30 };
    if (!o.some((x) => x.service || x.queue)) return { ok: false, reason: 'Stánky i fronty jsou plné.', retryAfter: 8 };
    return { ok: true };
  },
  start(ctx, agent, zone, source, sourceId) {
    const o = options(ctx, agent, zone).filter((x) => x.service || x.queue);
    if (!o.length) return null;
    // lidé se rádi přidají tam, kde už někdo stojí (oblíbený stánek) – vznikají fronty 2–3 lidí;
    // jinak náhodně mezi stánky
    o.sort((a, b) => b.load - a.load || (a.standId < b.standId ? -1 : 1));
    const busy = o.filter((x) => x.load > 0 && x.load < 4);
    const pick = busy.length && ctx.rand(agent) < 0.7 ? busy[0] : o[Math.floor(ctx.rand(agent) * o.length)];
    const run: ActivityRun = { type: 'shop', zoneId: zone.id, source, sourceId, phase: 'to-queue', phaseStart: ctx.time(), data: {} };
    const data = d(run);
    data.standId = pick.standId; data.queueName = `stand:${pick.standId}`;
    if (pick.service) {
      if (!ctx.res.tryReserve(pick.service.key, agent.id)) return null;
      data.serviceKey = pick.service.key;
      if (!ctx.goToPoint(agent, pick.service, 'ke stánku')) { ctx.res.release(pick.service.key, agent.id); return null; }
      setPhase(ctx, run, 'to-service');
    } else {
      if (!ctx.res.tryReserve(pick.queue!.key, agent.id)) return null;
      data.queueKey = pick.queue!.key;
      ctx.res.enqueue(data.queueName, agent.id);
      if (!ctx.goToPoint(agent, pick.queue!, 'do fronty')) { ctx.res.release(pick.queue!.key, agent.id); ctx.res.dequeue(data.queueName, agent.id); return null; }
      data.deadline = ctx.time() + num(zone, 'queueTimeout');
    }
    ctx.log('info', `${agent.name} jde nakupovat (${ctx.object(pick.standId)?.name}).`, agent.id);
    return run;
  },
  step(ctx, agent, run, events): StepResult {
    const zone = ctx.zone(run.zoneId);
    const data = d(run);
    if (!zone) return 'failed';
    const now = ctx.time(), moving = ctx.isMoving(agent);
    switch (run.phase) {
      case 'to-queue': agent.status = 'Jde do fronty u stánku'; if (!moving) setPhase(ctx, run, 'queue'); return 'running';
      case 'queue': {
        agent.status = 'Čeká ve frontě';
        if (now > (data.deadline ?? Infinity)) return 'failed';
        if (ctx.res.queuePos(data.queueName!, agent.id) !== 0) return 'running';
        const service = ctx.points(data.standId!, 'service').find((p) => ctx.res.isFree(p.key) && ctx.canReach(agent, p));
        if (!service) return 'running';
        ctx.res.tryReserve(service.key, agent.id);
        ctx.res.release(data.queueKey!, agent.id); ctx.res.dequeue(data.queueName!, agent.id);
        data.serviceKey = service.key; data.queueKey = undefined;
        if (!ctx.goToPoint(agent, service, 'k pultu')) return 'failed';
        setPhase(ctx, run, 'to-service');
        return 'running';
      }
      case 'to-service': {
        agent.status = 'Jde k pultu';
        if (moving) return 'running';
        ctx.res.dequeue(data.queueName!, agent.id);
        // nejdřív si prohlédne zboží; čtvrtina lidí jen odejde (bez zboží)
        data.browseEnd = now + ctx.randRange(agent, num(zone, 'browseMin'), num(zone, 'browseMax'));
        data.buys = ctx.rand(agent) >= num(zone, 'leaveChance');
        setPhase(ctx, run, 'browse');
        return 'running';
      }
      case 'browse': {
        agent.status = 'Prohlíží zboží';
        if (now < data.browseEnd!) return 'running';
        if (!data.buys) {
          ctx.res.release(data.serviceKey!, agent.id);
          ctx.log('info', `${agent.name} si zboží prohlédl(a) a odchází bez nákupu.`, agent.id);
          return 'done';
        }
        data.orderEnd = now + ctx.randRange(agent, num(zone, 'orderMin'), num(zone, 'orderMax'));
        ctx.social.converse([agent.id, `v:${data.standId}`], 'order');
        setPhase(ctx, run, 'order');
        return 'running';
      }
      case 'order': {
        agent.status = 'Vybírá a platí';
        if (now < data.orderEnd!) return 'running';
        data.prepareEnd = now + ctx.randRange(agent, num(zone, 'prepareMin'), num(zone, 'prepareMax'));
        setPhase(ctx, run, 'prepare');
        return 'running';
      }
      case 'prepare': {
        agent.status = 'Čeká, až prodavač zabalí';
        if (now < data.prepareEnd!) return 'running';
        // taška se objeví na pultu (prodavač ji položí) a zákazník si ji vezme na události „take“
        const sp = ctx.pointByKey(data.serviceKey!)!;
        const bag = ctx.spawnProp('bag', { kind: 'counter', objectId: data.standId!, x: sp.pos.x + 14, y: sp.pos.y - 78 }, { variant: goodsOf(ctx.object(data.standId!)?.name ?? '') });
        data.bagId = bag.id;
        ctx.playAction(agent, 'receive', { duration: ctx.randRange(agent, 1.4, 2.0), events: [{ time: 0.8, name: 'take' }] });
        setPhase(ctx, run, 'receive');
        return 'running';
      }
      case 'receive': {
        agent.status = 'Přebírá nákup';
        const bag = data.bagId ? ctx.prop(data.bagId) : undefined;
        // předání přesně jednou: z pultu do ruky
        if (bag && bag.place.kind === 'counter' && (events.includes('take') || ctx.actionFinished(agent))) {
          ctx.character.attachToHand(agent, bag.id);
          ctx.social.thanks(agent);
        }
        if (!ctx.actionFinished(agent)) return 'running';
        ctx.stopAction(agent);
        ctx.res.release(data.serviceKey!, agent.id);
        ctx.log('info', `${agent.name} nakoupil(a) (${ctx.object(data.standId!)?.name}).`, agent.id);
        return 'done';
      }
    }
    return 'failed';
  },
  abort(ctx, agent, run) {
    ctx.stopAction(agent);
    // nepřevzatá taška na pultu: prodavač ji uklidí (nezůstane ležet napořád)
    const id = run ? d(run).bagId : undefined, bag = id ? ctx.prop(id) : undefined;
    if (bag && bag.place.kind === 'counter') ctx.state.props = ctx.state.props.filter((p) => p !== bag);
  },
  usesObject(run, objectId) { const data = d(run); return data.standId === objectId; },
};
