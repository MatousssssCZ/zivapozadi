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

interface ViewData { key?: string; objectId?: string; until?: number; shiftAt?: number; target?: { x: number; y: number } }
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
      run.phase = 'look'; run.phaseStart = now;
      return 'running';
    }
    agent.status = `Prohlíží si: ${ctx.object(data.objectId!)?.name ?? 'okolí'}`;
    if (now >= data.shiftAt! && data.target) {
      // pomalé přenesení pozornosti na druhý cíl (jiné místo téhož objektu), nejvýš jednou
      data.target = { x: data.target.x + (ctx.rand(agent) < 0.5 ? -60 : 60), y: data.target.y - 20 };
      agent.look = { ...data.target }; data.shiftAt = 1e12;
    }
    if (now < data.until!) return 'running';
    ctx.res.release(data.key!, agent.id);
    (ctx.state.placeCooldowns ??= {})[cdKey(data.key!)] = now + ctx.randRange(agent, 60, 180);
    agent.look = null;
    return 'done';
  },
  abort(ctx, agent, run) { const k = d(run).key; if (k) ctx.res.release(k, agent.id); agent.look = null; },
  usesObject(run, objectId) { return d(run).objectId === objectId; },
};
