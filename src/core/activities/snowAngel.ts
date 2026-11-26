/**
 * Sněhový anděl (zadání A07): rodič s dítětem dojdou na volné místo čerstvého sněhu mimo průchod
 * (zóna „snowAngel“ – rezervuje se celá, i s dosahem rozpažení a místem pro rodiče). Dítě se otočí,
 * přes dřep a sed si lehne, udělá tři tahy rukama a nohama, chvíli leží, pak vstává s nabídnutou
 * rukou rodiče (rodič se k němu skloní). Oba se krátce podívají na otisk a jdou dál.
 *
 * Otisk vzniká postupně z tahů (rozsah paží a nohou roste s každým tahem), zůstává ve scéně a
 * pozvolna zapadá sněžením (ANGEL_LIFE). Vstávání nechá na okraji drobný otisk ruky a bot.
 */
import type { ActivitySession, AgentState, SimState } from '../sim/types';
import type { ActivityZone } from '../model/types';
import type { SessionHost } from './snowman';
import { createSession } from '../sim/sessions';
import { finishSession, gatherTime } from './snowman';
import { cameraFor, toScreen, toWorld } from '../scene/camera';
import { ANGEL_TIMES } from '../anim/fallPoses';

export const ANGEL_LIFE = 900; // s
export interface AngelImprint { X: number; Z: number; dir: number; arms: number; legs: number; t0: number; child: number; getup: boolean }
interface AngelData { gatherBy?: number; spot: { x: number; y: number }; stand: { x: number; y: number }; kid: string; parent: string; t0?: number; imprint?: number; lookUntil?: number }
const D = (s: ActivitySession) => s.data as unknown as AngelData;

function centroid(z: ActivityZone) { const n = z.bounds.length; return { x: z.bounds.reduce((q, p) => q + p.x, 0) / n, y: z.bounds.reduce((q, p) => q + p.y, 0) / n }; }
export function angelZoneFree(h: SessionHost, z: ActivityZone): boolean {
  return h.res.isFree(`zone:${z.id}`) && h.isSnow(centroid(z)) && !(h.state.angels ?? []).some((a) => { const c = toWorld(cameraFor(h.project.scene), centroid(z)); return Math.hypot(a.X - c.X, a.Z - c.Z) < 1.6 && h.time() - a.t0 < ANGEL_LIFE * 0.8; });
}

export function startSnowAngel(h: SessionHost, zone: ActivityZone, parent: AgentState, kid: AgentState): ActivitySession | null {
  if (!angelZoneFree(h, zone) || parent.holding || kid.holding) return null;
  const cam = cameraFor(h.project.scene), spot = centroid(zone), S = toWorld(cam, spot);
  // dítě leží čelem k divákovi (nohama ke kameře, hlavou do hloubky) – rodič stojí bokem za rozpaženou
  // rukou, mírně dál od kamery: nezakrývá dítě ani otisk, je v dosahu ruky při vstávání
  const stand = toScreen(cam, { X: S.X - 1.15, Z: S.Z + 0.35 });
  const now = h.time();
  const s = createSession(h.state, h.res, {
    type: 'snowAngel', zoneId: zone.id, participantIds: [parent.id, kid.id], roles: { [parent.id]: 'parent', [kid.id]: 'child' },
    keys: [`zone:${zone.id}`], now, deadline: now + 90 + gatherTime(h, [parent, kid], spot), seed: h.project.seed, phase: 'gather',
    data: { spot, stand, kid: kid.id, parent: parent.id, gatherBy: now + 40 + 1.5 * gatherTime(h, [parent, kid], spot) } as unknown as Record<string, unknown>,
  });
  if (!s) return null;
  for (const x of [parent, kid]) { x.activity = { type: 'snowAngel', zoneId: zone.id, source: 'auto', sourceId: null, phase: 'gather', phaseStart: now, data: { sessionId: s.id } }; x.pendingActivity = null; x.follow = null; }
  h.goTo(kid, spot, 'dělat anděla'); h.goTo(parent, stand, 'k dítěti');
  h.log(`${kid.name} si jde s ${parent.name} udělat sněhového anděla.`, kid.id);
  return s;
}

export function stepSnowAngel(h: SessionHost, s: ActivitySession): 'running' | 'done' | 'aborted' {
  const d = D(s), kid = h.agent(d.kid), par = h.agent(d.parent), now = h.time(), cam = cameraFor(h.project.scene);
  if (!kid || !par || kid.hidden || par.hidden) return 'aborted';
  const S = toWorld(cam, d.spot);
  switch (s.phase) {
    case 'gather':
      kid.status = 'Jde na čerstvý sníh'; par.status = 'Jde s dítětem';
      if (!h.moving(kid) && !h.moving(par)) {
        // dítě se otočí čelem k divákovi (anděl je vždy vidět zepředu, ne z profilu), rodič se dívá na něj
        kid.look = toScreen(cam, { X: S.X, Z: S.Z - 2 }); par.look = { ...kid.pos };
        if (now - s.phaseStart > 1.2 || kid.anim.walkBlend < 0.05) { s.phase = 'angel'; s.phaseStart = now; d.t0 = now; }
      }
      if (now > (d.gatherBy ?? now + 1)) return 'aborted'; // nedošli (překážky, dav)
      return 'running';
    case 'angel': {
      const el = now - d.t0!, T = ANGEL_TIMES;
      kid.anim.sit = { kind: 'angel', t: el, dur: 1e9, w: Math.min(1, el / 0.3) };
      kid.status = el < T.lie ? 'Lehá si do sněhu' : el < T.still ? 'Dělá anděla' : el < 14 ? 'Leží a kouká do nebe' : 'Vstává s pomocí';
      // otisk: založí se při dosednutí zad, rozsah roste s fází tahů (ne celý hned)
      const st = h.state as SimState;
      if (el >= T.lie && d.imprint === undefined) {
        const P = toWorld(cam, kid.pos), dir = Math.PI / 2; // hlavou do hloubky (+Z), nohama ke kameře
        (st.angels ??= []).push({ X: P.X, Z: P.Z, dir, arms: 0, legs: 0, t0: now, child: 1, getup: false }); d.imprint = st.angels.length - 1;
        if (st.angels.length > 6) { st.angels.shift(); d.imprint = st.angels.length - 1; }
      }
      const im = d.imprint !== undefined ? st.angels?.[d.imprint] : undefined;
      if (im) {
        for (const [i, t0] of T.strokes.entries()) { if (el < t0) continue; const k = Math.max(0, Math.min(1, (el - t0) / 1.25)); im.arms = Math.max(im.arms, Math.min(1, (i + k) / 3 + k * 0.34)); im.legs = Math.max(im.legs, Math.min(1, (i + k) / 3 + k * 0.3)); }
        if (el > 15.6) im.getup = true;
      }
      // rodič: po tazích přistoupí blíž a nabídne ruku (přidřep), dítě ji chytne a vstává
      par.status = el < 13 ? 'Dívá se, jak dítě dělá anděla' : 'Pomáhá dítěti vstát';
      if (el >= 13 && el < 17.4) { const w = Math.min(1, (el - 13) / 0.8, (17.4 - el) / 0.6); par.anim.sit = { kind: 'lift', t: el, dur: 1e9, w: w * 0.55 }; }
      else par.anim.sit = null;
      if (el >= T.end) { kid.anim.sit = null; par.anim.sit = null; s.phase = 'admire'; s.phaseStart = now; d.lookUntil = now + 2.5; kid.look = toScreen(cam, { X: S.X, Z: S.Z + 0.7 }); par.look = { ...kid.look }; /* podívají se na otisk (leží do hloubky) */ h.log(`${kid.name} udělal(a) sněhového anděla.`, kid.id); }
      return 'running';
    }
    case 'admire':
      kid.status = 'Prohlíží si anděla'; par.status = 'Prohlíží si anděla';
      if (now >= (d.lookUntil ?? now)) return 'done';
      return 'running';
  }
  return 'running';
}
/** Přerušení: dítě vstane (bez skoku – sed se prolne do stoje), rezervace uvolní session. */
export function abortSnowAngel(h: SessionHost, s: ActivitySession) {
  for (const id of s.participantIds) { const a = h.agent(id); if (a) { a.anim.sit = null; a.look = null; } }
  finishSession(h, s);
}

// ------------------------------------------------------------------ účastník (řídí session)
import type { ActivityDefinition, ActivityRunner } from './types';
export const snowAngelDefinition: ActivityDefinition = {
  type: 'snowAngel', version: 1, label: 'Sněhový anděl (A07)', status: 'implemented',
  description: 'Rodič s dítětem dojdou na čerstvý sníh, dítě si lehne, udělá anděla (3 tahy), s pomocí vstane; otisk zůstane.',
  participants: [{ role: 'parent', min: 1, max: 1, requiredCapabilities: ['walk'] }, { role: 'child', min: 1, max: 1, requiredCapabilities: ['walk', 'crouch'] }],
  requiredObjects: [], props: [], workPointKinds: [], entryPointKinds: [], surface: 'snow',
  capacity: { description: 'Celá zóna (dosah rozpažení + místo rodiče) pro jednu rodinu; místo s čerstvým otiskem se nepoužije znovu.' },
  preconditions: ['Rodič s dítětem bez činnosti', 'Zóna na sněhu bez nedávného otisku'],
  phases: [{ id: 'gather', label: 'Jdou na čerstvý sníh' }, { id: 'angel', label: 'Dělá sněhového anděla' }, { id: 'admire', label: 'Prohlíží si anděla' }],
  outcome: 'Otisk anděla zůstane ve sněhu (pozvolna zapadá).',
  repeat: { defaultIntervalMin: 300, defaultIntervalMax: 600, description: 'Vybírá režisér rodin.' }, defaultParams: {},
};
export const snowAngelParticipant: ActivityRunner = {
  definition: snowAngelDefinition,
  canStart: () => ({ ok: false, reason: 'Anděla zakládá režisér scény pro rodinu.', retryAfter: 600 }),
  start: () => null,
  step(ctx, _agent, run) { const s = ctx.state.sessions?.find((x) => x.id === (run.data as { sessionId?: string }).sessionId); if (!s) return 'done'; run.phase = s.phase; return 'running'; },
  abort() { /* session ukončí simulace */ },
  usesObject: () => false,
};
