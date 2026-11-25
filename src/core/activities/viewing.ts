/**
 * Prohlížení (balíček „živá pozadí“, A04): jeden člověk dojde k místu s výhledem (strom, výloha,
 * stánek), plynule zastaví, 5–18 s se dívá, pomalu přenese pozornost mezi nejvýš dvěma cíli
 * (bez neustálého otáčení hlavy) a odejde. Místo má cooldown 60–180 s; obsazené se přeskočí.
 */
import type { ActivityDefinition, ActivityRunner } from './types';
import type { ActivityRun } from '../sim/types';
import type { ActivityZone } from '../model/types';
import type { SimContext, ResolvedPoint } from '../sim/context';
import type { AgentState } from '../sim/types';

export const viewingDefinition: ActivityDefinition = {
  type: 'viewing', version: 1, label: 'Prohlížení (strom, výloha)', status: 'implemented',
  description: 'Postava se zastaví u místa s výhledem, chvíli se dívá (5–18 s), občas přenese pozornost na druhý cíl a odejde.',
  participants: [{ role: 'viewer', min: 1, max: 1, requiredCapabilities: ['walk'] }],
  requiredObjects: [{ role: 'view', label: 'Objekt s místem výhledu', interactionKinds: ['viewpoint', 'stand'], min: 1 }],
  props: [], workPointKinds: ['view'], entryPointKinds: [], surface: null,
  capacity: { description: 'Každé místo výhledu má kapacitu 1 a po použití cooldown 60–180 s.' },
  preconditions: ['Dosažitelné volné místo výhledu (bod druhu „výhled“).'],
  phases: [{ id: 'to-view', label: 'Cesta k výhledu' }, { id: 'look', label: 'Dívá se' }],
  outcome: 'Postava pokračuje v cestě.',
  repeat: { defaultIntervalMin: 60, defaultIntervalMax: 180, description: 'Cooldown místa.' },
  defaultParams: { lookMin: 5, lookMax: 18 },
};

interface ViewData { showAt?: number; shown?: boolean; key?: string; objectId?: string; until?: number; shiftAt?: number; target?: { x: number; y: number }; photo?: boolean; phoneId?: string; photoAt?: number }
const d = (r: ActivityRun) => r.data as ViewData;
const cdKey = (k: string) => `viewcd:${k}`;

function free(ctx: SimContext, agent: AgentState, zone: ActivityZone): ResolvedPoint[] {
  const now = ctx.time();
  return (zone.objectRoles.view ?? []).flatMap((id) => ctx.points(id, 'view'))
    .filter((p) => ctx.res.isFree(p.key) && ctx.canReach(agent, p) && (ctx.state.placeCooldowns?.[cdKey(p.key)] ?? -1e9) <= now);
}

export const viewingRunner: ActivityRunner = {
  definition: viewingDefinition,
  canStart(ctx, agent, zone) {
    return free(ctx, agent, zone).length ? { ok: true } : { ok: false, reason: 'Žádné volné místo s výhledem.', retryAfter: 20 };
  },
  start(ctx, agent, zone, source, sourceId) {
    const ps = free(ctx, agent, zone);
    if (!ps.length) return null;
    const p = ps[Math.floor(ctx.rand(agent) * ps.length)];
    if (!ctx.res.tryReserve(p.key, agent.id)) return null;
    if (!ctx.goToPoint(agent, p, 'k výhledu')) { ctx.res.release(p.key, agent.id); return null; }
    return { type: 'viewing', zoneId: zone.id, source, sourceId, phase: 'to-view', phaseStart: ctx.time(), data: { key: p.key, objectId: p.objectId } };
  },
  step(ctx, agent, run) {
    const zone = ctx.zone(run.zoneId), data = d(run), now = ctx.time();
    if (!zone) return 'failed';
    if (run.phase === 'to-view') {
      agent.status = 'Jde se podívat';
      if (ctx.isMoving(agent)) return 'running';
      const o = ctx.object(data.objectId!);
      data.until = now + ctx.randRange(agent, Number(zone.params.lookMin ?? 5), Number(zone.params.lookMax ?? 18));
      data.shiftAt = ctx.rand(agent) < 0.6 ? now + ctx.randRange(agent, 3, 7) : 1e12; // (ne Infinity – JSON by ho uložil jako null)
      data.target = o ? { x: o.x, y: o.y - 60 } : undefined;
      if (data.target) agent.look = { ...data.target };
      // A03 rodič s dítětem: ukáže dítěti strom (místo focení), dítě se podívá a ukáže taky
      const kid = ctx.state.agents.find((x) => x.follow?.leaderId === agent.id && !x.hidden);
      if (kid) { data.showAt = now + ctx.randRange(agent, 0.8, 1.8); data.until = Math.max(data.until!, data.showAt + 6); data.photo = false; run.phase = 'look'; run.phaseStart = now; return 'running'; }
      // fotografie (A06): u stromu občas vytáhne telefon, zamíří a vyfotí (6–12 s)
      data.photo = !agent.holding && (zone.params.photoChance === undefined ? 0.35 : Number(zone.params.photoChance)) > ctx.rand(agent);
      if (data.photo) { data.photoAt = now + ctx.randRange(agent, 0.8, 2); data.until = Math.max(data.until, data.photoAt + 11); }
      run.phase = 'look'; run.phaseStart = now;
      return 'running';
    }
    agent.status = `Prohlíží si: ${ctx.object(data.objectId!)?.name ?? 'okolí'}`;
    if (now >= data.shiftAt! && data.target) {
      // pomalé přenesení pozornosti na druhý cíl (jiné místo téhož objektu), nejvýš jednou
      data.target = { x: data.target.x + (ctx.rand(agent) < 0.5 ? -60 : 60), y: data.target.y - 20 };
      agent.look = { ...data.target }; data.shiftAt = 1e12;
    }
    if (data.showAt !== undefined && !data.shown && now >= data.showAt) {
      const kid = ctx.state.agents.find((x) => x.follow?.leaderId === agent.id && !x.hidden);
      if (kid && ctx.social.gesture(agent, 'point', ctx.randRange(agent, 2.6, 3.4), 0.75)) {
        data.shown = true; agent.status = 'Ukazuje dítěti strom';
        ctx.log('info', `${agent.name} ukazuje dítěti (${kid.name}) vánoční strom.`, agent.id);
        // dítě se po chvíli nadchne a ukáže taky (zkusí znovu, než se zastaví)
        (data as Record<string, unknown>).kidAt = now + ctx.randRange(agent, 1.2, 2.2); (data as Record<string, unknown>).kidId = kid.id;
      } else if (now > data.showAt + 4) data.shown = true;
    }
    { const kAt = (data as Record<string, unknown>).kidAt as number | undefined, kid = ctx.state.agents.find((x) => x.id === (data as Record<string, unknown>).kidId);
      if (kAt !== undefined && now >= kAt && kid) { if (ctx.social.gesture(kid, 'point', ctx.randRange(agent, 2.2, 3), 0.85) || now > kAt + 3) (data as Record<string, unknown>).kidAt = undefined; } }
    if (data.photo && data.photoAt !== undefined && now >= data.photoAt && !data.phoneId) {
      // telefon z kapsy do ruky (skutečná rekvizita), focení obouruč, pak zpět do kapsy
      // (gesto nejdřív – držená věc by blokovala paži; obsazené ruce → zkusit znovu za chvíli)
      if (ctx.social.gesture(agent, 'photo', ctx.randRange(agent, 7, 10))) {
        const ph = ctx.spawnProp('phone', { kind: 'held', agentId: agent.id });
        agent.holding = ph.id; agent.holdingKind = 'phone'; data.phoneId = ph.id;
      } else if (now + 1.5 < data.until! - 8) data.photoAt = now + 1.5;
      else data.photo = false;
    }
    if (data.phoneId && !(agent.anim.gestures ?? []).some((g) => g.fam === 'photo')) {
      ctx.state.props = ctx.state.props.filter((p) => p.id !== data.phoneId);
      if (agent.holding === data.phoneId) { agent.holding = null; agent.holdingKind = null; }
      data.phoneId = undefined; data.photo = false; data.until = Math.min(data.until!, now + ctx.randRange(agent, 1, 3));
    }
    if (now < data.until!) return 'running';
    ctx.res.release(data.key!, agent.id);
    (ctx.state.placeCooldowns ??= {})[cdKey(data.key!)] = now + ctx.randRange(agent, 60, 180);
    agent.look = null;
    return 'done';
  },
  abort(ctx, agent, run) {
    const k = d(run).key; if (k) ctx.res.release(k, agent.id); agent.look = null;
    const ph = d(run).phoneId; // telefon zpět do kapsy (nezůstane viset ve vzduchu)
    if (ph) { ctx.state.props = ctx.state.props.filter((p) => p.id !== ph); if (agent.holding === ph) { agent.holding = null; agent.holdingKind = null; } }
  },
  usesObject(run, objectId) { return d(run).objectId === objectId; },
};
