/**
 * Sociální vrstva postav (zadání `docs/zdroje/zadani-socialni-interakce-2D.md`):
 *  - plánovač gest jednotlivce: prostředky (ruce/hlava/trup/pánev), cooldowny, antirepetice 8 s,
 *    zimní akce s Poissonovými hodinami jen ve „způsobilém“ čase, vyhlédnutí ve frontě, držení
 *    kelímku oběma rukama, kývnutí a poděkování,
 *  - režisér rozhovoru: vizuální promluvy (fráze, akcenty), podepsané mezery 80/15/5 %, rezervace
 *    dalšího tahu ≥ 0,8 s před koncem, férový výběr mluvčího, kývnutí posluchačů na hranicích frází,
 *    společné pobavení. Pití se nikdy nepřekrývá s vlastní řečí.
 * Vše je čistá data (JSON) a deterministické – vlastní RNG streamy per postava a per rozhovor.
 */
import { CLIP_T, MANUAL, resourcesOf, type Family, type GestureInst, type Res } from './clips';
import { makeRng, nextU01, tri, triR, rangeR, truncLogNormal, expWait, weighted, type Rng } from './rng';
import type { Vec2 } from '../math/vec';

// ------------------------------------------------------------------ typy
export interface Traits {
  gestureRate: number; gestureAmplitude: number; responsiveness: number; tempo: number; turnWeight: number;
  /** citlivost na chlad c ∈ [0,1] */ cold: number;
  /** znaménko pseudokývnutí a preferovaná (dominantní) paže */ nodSign: number; domArm: 0 | 1;
}
export interface PendingAct { at: number; fam: Family; hand?: 0 | 1; amp?: number; sgn?: number; second?: boolean; dir?: Vec2; both?: boolean }
export interface AgentSocial {
  traits: Traits; rng: Rng;
  /** čas, odkdy je rodina znovu dostupná (konec klipu + CD) */ cdUntil: Partial<Record<Family, number>>;
  lastManual?: { fam: Family; end: number } | null;
  /** zbývající „způsobilé“ sekundy do další zimní příležitosti */ winterIn: number;
  lastWinterEnd: number;
  /** zimní akce za posledních 60 s (rodina, čas startu) */ winterLog: { fam: Family; t: number }[];
  queueIn: number; warmIn: number;
  pending: PendingAct[];
  /** držení kelímku oběma rukama: dokdy */ stillSince?: number;
}
export interface Phrase { start: number; end: number; accent: number; accDone?: boolean; endDone?: boolean; gestureDone?: boolean }
export interface TurnPlan {
  id: number; speaker: string; start: number; end: number; phrases: Phrase[];
  /** mezera před tahem (s; záporně = překryv) a její větev */ gap: number; gapKind: 'first' | 'short' | 'long' | 'overlap' | 'busy' | 'cont';
  gestures: number; cupBeats: number; reservedNext: boolean;
}
export interface Conversation {
  id: string; members: string[]; kind: 'pair' | 'order'; rng: Rng;
  turns: TurnPlan[]; nextTurn: number; waiting: Record<string, number>;
  /** do kdy se nic neplánuje (záměrná pauza / čekání na volného mluvčího) */ retryAt: number;
  amusedUntil: number; started: number; lastSpeaker?: string | null;
}
export interface SocialStats {
  gaps: { short: number; long: number; overlap: number; busy: number; cont: number };
  turns: number; nodOpps: number; nods: number; gestures: Partial<Record<Family, number>>;
  /** výrazná manuální gesta: [agent, rodina, start, konec] – pro testy antirepetice */ manualLog?: [string, Family, number, number][];
  sipDuringSpeech: number;
}
export interface SocialWorld { convs: Conversation[]; nextConv: number; stats: SocialStats }

/** Minimální pohled na postavu, který sociální vrstva potřebuje (simulace i testy). */
export interface SocialAgent {
  id: string;
  hidden?: boolean;
  holding: string | null;
  speed: number;
  anim: { gestures?: GestureInst[]; speaking?: boolean; walkBlend: number; dir?: string; action: { requested: string; clip: string | null; time: number; duration: number; finished: boolean } | null };
  social?: AgentSocial;
}
export interface SocialEnv {
  now: number;
  seed: number | string;
  agent(id: string): SocialAgent | undefined;
  /** jak dlouho postava stojí ve frontě bez posunu (s); 0 = není ve frontě */
  queueStill?(a: SocialAgent): number;
  /** postava u stolku pije kávu (warmCup dovolen) */
  canWarmCup?(a: SocialAgent): boolean;
  /** cíl, na který lze ukázat (směr ve scéně vůči postavě, px; y dolů) */
  pointTarget?(a: SocialAgent): Vec2 | null;
  /** znaménko „ven“ paže i v obraze (+1 = vpravo) */
  outward?(a: SocialAgent, arm: 0 | 1): number;
}

export const emptySocialWorld = (): SocialWorld => ({ convs: [], nextConv: 1, stats: { gaps: { short: 0, long: 0, overlap: 0, busy: 0, cont: 0 }, turns: 0, nodOpps: 0, nods: 0, gestures: {}, sipDuringSpeech: 0 } });

// ------------------------------------------------------------------ profil a stav jednotlivce
export function initSocial(seed: number | string, id: string): AgentSocial {
  const r = makeRng(seed, id, 'social-traits');
  const traits: Traits = {
    gestureRate: triR(r, 0.65, 1, 1.3), gestureAmplitude: triR(r, 0.8, 1, 1.15), responsiveness: triR(r, 0.7, 1, 1.3),
    tempo: triR(r, 0.85, 1, 1.15), turnWeight: triR(r, 0.7, 1, 1.3),
    cold: Math.max(0, Math.min(1, 0.35 + (nextU01(r) * 2 - 1) * 0.15)),
    nodSign: 1, domArm: nextU01(r) < 0.5 ? 1 : 0,
  };
  const rng = makeRng(seed, id, 'social');
  const s: AgentSocial = { traits, rng, cdUntil: {}, lastManual: null, winterIn: 0, lastWinterEnd: -1e9, winterLog: [], queueIn: 0, warmIn: 0, pending: [] };
  s.winterIn = expWait(rng, winterRate(traits));
  s.queueIn = expWait(rng, 2);
  s.warmIn = expWait(rng, 1);
  return s;
}
const winterRate = (t: Traits) => 0.3 + 1.4 * t.cold; // za minutu (A.7)
export function ensureSocial(a: SocialAgent, seed: number | string): AgentSocial { return (a.social ??= initSocial(seed, a.id)); }

/** Prostředky blokované akční animací (pití, převzetí, koš) a držením kelímku. */
function actionRes(a: SocialAgent): Res[] {
  const act = a.anim.action;
  if (!act || act.finished || act.clip === null && act.requested === '') return [];
  switch (act.requested) {
    case 'drink': return ['arm1', 'head'];
    case 'receive': case 'drop': return ['arm1'];
    case 'lidDrop': return ['arm0', 'arm1', 'head'];
    case 'talk': return ['arm0'];
    default: return [];
  }
}
export function usedRes(a: SocialAgent): Set<Res> {
  const u = new Set<Res>(actionRes(a));
  for (const g of a.anim.gestures ?? []) for (const r of resourcesOf(g)) u.add(r);
  return u;
}
const isStanding = (a: SocialAgent) => !a.hidden && a.anim.walkBlend < 0.05 && a.speed < 0.5;
/** Rodiny, které se smějí hrát i v chůzi (C.2: dvojice při chůzi) – jen hlava. */
const WALK_OK: Family[] = ['nod', 'greetNod', 'thanks', 'waveFar', 'tilt'];

/**
 * Pokusí se spustit klip. Kontroluje prostředky, cooldown rodiny, antirepetici výrazných gest
 * (8 s od konce posledního), kelímek v ruce a chůzi. Vrací true při spuštění.
 */
export function tryGesture(a: SocialAgent, world: SocialWorld | null, now: number, req: Omit<PendingAct, 'at'>): boolean {
  const s = a.social; if (!s || a.hidden) return false;
  const fam = req.fam;
  if (!isStanding(a) && !WALK_OK.includes(fam)) return false;
  if ((s.cdUntil[fam] ?? -1e9) > now) return false;
  if (MANUAL.includes(fam) && s.lastManual && s.lastManual.fam === fam && now - s.lastManual.end < 8) return false;
  // stejná rodina nikdy dvakrát souběžně; výrazné manuální gesto jen jedno naráz
  if ((a.anim.gestures ?? []).some((g) => g.fam === fam || (MANUAL.includes(fam) && MANUAL.includes(g.fam)))) return false;
  const hand: 0 | 1 = req.hand ?? 1;
  // kelímek: blízká paže ho drží – jen klipy, které s ním počítají
  const cupFams: Family[] = ['cupBeat', 'warmCup'];
  if (cupFams.includes(fam) && !a.holding) return false;
  const g: GestureInst = { fam, t: 0, dur: 1, hand, amp: req.amp ?? 1, sgn: req.sgn ?? 1, dir: req.dir, second: req.second, both: req.both };
  const need = resourcesOf(g);
  if (a.holding && need.includes('arm1') && !cupFams.includes(fam)) return false;
  const used = usedRes(a);
  if (need.some((r) => used.has(r))) return false;
  // délka: Tri(min, default, max) / tempo, vylosovaná jednou při spuštění
  const [lo, md, hi] = CLIP_T[fam].T;
  let dur = tri(lo, md, hi, nextU01(s.rng)) / s.traits.tempo;
  if (fam === 'beat' && req.second) dur += rangeR(s.rng, 0.25, 0.45);
  if (fam === 'warmCup') dur = rangeR(s.rng, 0.9, 1.7) + tri(5, 10, 20, nextU01(s.rng)) + rangeR(s.rng, 0.5, 0.9);
  if (fam === 'nod' && req.second) dur = rangeR(s.rng, 0.95, 1.3);
  g.dur = dur;
  (a.anim.gestures ??= []).push(g);
  if (world) world.stats.gestures[fam] = (world.stats.gestures[fam] ?? 0) + 1;
  return true;
}

/** Ukončí držené klipy (warmCup, hunch) na dané paži jejich výstupem; vrací true, je-li paže volná. */
export function releaseArm(a: SocialAgent, arm: 0 | 1): boolean {
  const res: Res = arm === 0 ? 'arm0' : 'arm1';
  let free = true;
  for (const g of a.anim.gestures ?? []) {
    if (!resourcesOf(g).includes(res)) continue;
    free = false;
    if (g.fam === 'warmCup') g.t = Math.max(g.t, g.dur - Math.min(0.9, 0.12 * g.dur)); // výstup 0,5–0,9 s
    else if (g.fam === 'hunch') g.t = Math.max(g.t, g.dur * 0.65);
  }
  return free;
}
/** Okamžitě zruší klipy, které by se střetly s nutnou akcí (jen nouzově – běžně se čeká na releaseArm). */
export function clearGesturesFor(a: SocialAgent, res: Res[]): void {
  if (!a.anim.gestures) return;
  a.anim.gestures = a.anim.gestures.filter((g) => !resourcesOf(g).some((r) => res.includes(r)));
}

/** Krok jednotlivce: posun klipů, cooldowny, odložené reakce, zimní akce, fronta, kelímek. */
export function stepAgentSocial(a: SocialAgent, env: SocialEnv, world: SocialWorld | null, dt: number): void {
  const s = ensureSocial(a, env.seed), now = env.now;
  const gs = a.anim.gestures;
  if (gs?.length) {
    for (const g of gs) g.t += dt;
    const done = gs.filter((g) => g.t >= g.dur);
    if (done.length) {
      for (const g of done) {
        const cd = g.fam === 'nod' ? rangeR(s.rng, 4, 7) : CLIP_T[g.fam].cd;
        s.cdUntil[g.fam] = now + cd;
        if (MANUAL.includes(g.fam)) {
          s.lastManual = { fam: g.fam, end: now };
          if (world?.stats.manualLog) world.stats.manualLog.push([a.id, g.fam, now - g.dur, now]);
        }
        if (WINTER.some(([f]) => f === g.fam)) s.lastWinterEnd = now;
      }
      a.anim.gestures = gs.filter((g) => g.t < g.dur);
    }
  }
  if (a.hidden) { a.anim.gestures = []; s.pending = []; return; }
  // odložené reakce (kývnutí posluchače, odpověď na pozdrav, poděkování)
  if (s.pending.length) {
    const due = s.pending.filter((p) => p.at <= now);
    if (due.length) {
      s.pending = s.pending.filter((p) => p.at > now);
      for (const p of due) { if (tryGesture(a, world, now, p) && p.fam === 'nod' && world) world.stats.nods++; }
    }
  }
  if (!isStanding(a)) return; // Poissonovy hodiny běží jen ve způsobilém čase
  const speaking = !!a.anim.speaking;
  const qs = env.queueStill?.(a) ?? 0;
  // zimní akce: λ = 0,3 + 1,4c /min; při mluvení ×0,2, ve frontě ×1
  s.winterIn -= dt * (speaking ? 0.2 : 1);
  if (s.winterIn <= 0) {
    s.winterIn = expWait(s.rng, winterRate(s.traits));
    s.winterLog = s.winterLog.filter((w) => now - w.t < 60);
    if (now - s.lastWinterEnd >= 20 && s.winterLog.length < 3 && !(a.anim.gestures ?? []).length) {
      const used = usedRes(a);
      const bothFree = !a.holding && !used.has('arm0') && !used.has('arm1');
      const cands: [Family, number][] = WINTER.map(([f, w]) => [f, (f === 'rubHands' && !bothFree) || (f === 'adjustScarf' && !!a.holding) || s.winterLog.filter((x) => x.fam === f).length >= 2 ? 0 : w]);
      const fam = weighted(s.rng, cands);
      if (fam) {
        // úprava šály/čepice blízkou (viditelnou) paží; s kelímkem jen čepice vzdálenou paží
        // (vzdálená ruka by se u šály schovala za trup)
        const hand: 0 | 1 = a.holding ? 0 : 1;
        if (tryGesture(a, world, now, { fam, hand, sgn: nextU01(s.rng) < 0.5 ? 1 : -1, amp: 1 })) s.winterLog.push({ fam, t: now });
      }
    }
  }
  // fronta stojí > 5 s: vyhlédnout, jak postupuje (2/min, CD 15)
  if (qs > 5) {
    s.queueIn -= dt;
    if (s.queueIn <= 0) { s.queueIn = expWait(s.rng, 2); tryGesture(a, world, now, { fam: 'queuePeek', sgn: nextU01(s.rng) < 0.5 ? 1 : -1, amp: rangeR(s.rng, 0.8, 1.2) }); }
  }
  // kelímek oběma rukama u stolku (1/min, ne při vlastní řeči)
  if (a.holding && env.canWarmCup?.(a) && !speaking) {
    s.warmIn -= dt;
    if (s.warmIn <= 0) { s.warmIn = expWait(s.rng, 1); tryGesture(a, world, now, { fam: 'warmCup', hand: 1 }); }
  }
}
/** Zimní kandidáti a jejich váhy (A.7; dech do dlaní, přešlápnutí a kapsy nemají malované podklady). */
const WINTER: [Family, number][] = [['rubHands', 0.24], ['adjustScarf', 0.12], ['adjustCap', 0.08], ['hunch', 0.1]];

// ------------------------------------------------------------------ plán řeči (C.3)
export function sampleTurnDur(rng: Rng, tempo = 1): number { return truncLogNormal(rng, Math.log(3.8), 0.45, 1.2, 9, tempo); }
export function sampleGap(rng: Rng): { gap: number; kind: 'short' | 'long' | 'overlap' } {
  const u = nextU01(rng);
  if (u < 0.8) return { gap: triR(rng, 0.05, 0.18, 0.4), kind: 'short' };
  if (u < 0.95) return { gap: triR(rng, 0.35, 0.55, 0.9), kind: 'long' };
  return { gap: -triR(rng, 0.05, 0.12, 0.22), kind: 'overlap' };
}
export function makePhrases(rng: Rng, start: number, dur: number): Phrase[] {
  const n = Math.max(1, Math.min(4, Math.round(dur / 1.45)));
  const w = Array.from({ length: n }, () => rangeR(rng, 0.8, 1.2));
  const tot = w.reduce((x, y) => x + y, 0);
  const out: Phrase[] = [];
  let t = start;
  for (let i = 0; i < n; i++) {
    const len = (dur * w[i]) / tot;
    out.push({ start: t, end: t + len, accent: t + len * rangeR(rng, 0.35, 0.7) });
    t += len;
  }
  out[n - 1].end = start + dur;
  return out;
}
const isVirtual = (id: string) => id.startsWith('v:');

// ------------------------------------------------------------------ režisér rozhovoru
export function startConversation(world: SocialWorld, members: string[], kind: Conversation['kind'], seed: number | string, now: number): Conversation {
  const existing = world.convs.find((c) => c.members.length === members.length && members.every((m) => c.members.includes(m)));
  if (existing) return existing;
  for (const m of members) if (!isVirtual(m)) endConversationOf(world, m, null);
  const id = `conv${world.nextConv++}`;
  const c: Conversation = { id, members: [...members], kind, rng: makeRng(seed, id, 'turns'), turns: [], nextTurn: 1, waiting: {}, retryAt: now + 0.4, amusedUntil: 0, started: now, lastSpeaker: null };
  world.convs.push(c);
  return c;
}
export function convOfAgent(world: SocialWorld, id: string): Conversation | undefined { return world.convs.find((c) => c.members.includes(id)); }
export function endConversationOf(world: SocialWorld, id: string, env: SocialEnv | null): void {
  const c = convOfAgent(world, id);
  if (!c) return;
  world.convs = world.convs.filter((x) => x !== c);
  if (env) for (const m of c.members) { const a = env.agent(m); if (a) a.anim.speaking = false; }
}
/** Mluví postava (má aktivní řečový interval)? */
export function isSpeaking(world: SocialWorld, id: string, now: number): boolean {
  const c = convOfAgent(world, id);
  return !!c?.turns.some((t) => t.speaker === id && t.start <= now && now < t.end);
}
/**
 * Smí postava teď začít pít (doušek trvá `dur`)? Ne během vlastní řeči ani 0,45 s před vlastním
 * rezervovaným tahem (C.3, D01).
 */
export function canSip(world: SocialWorld, id: string, now: number, dur: number): boolean {
  const c = convOfAgent(world, id);
  if (!c) return true;
  return !c.turns.some((t) => t.speaker === id && t.end > now && t.start < now + dur + 0.45);
}

/** Zaneprázdněný člen nemůže převzít slovo (pije, odhazuje…) – do kdy. */
function busyUntil(a: SocialAgent | undefined, now: number): number {
  if (!a) return Infinity;
  const act = a.anim.action;
  if (act && !act.finished && ['drink', 'receive', 'lidDrop', 'drop'].includes(act.requested)) return now + Math.max(0, act.duration - act.time);
  return -Infinity;
}

function planTurn(c: Conversation, speaker: string, start: number, gap: number, kind: TurnPlan['gapKind'], tempo: number, short = false): TurnPlan {
  const dur = short ? rangeR(c.rng, 1.2, 3) : sampleTurnDur(c.rng, tempo);
  const t: TurnPlan = { id: c.nextTurn++, speaker, start, end: start + dur, phrases: makePhrases(c.rng, start, dur), gap, gapKind: kind, gestures: 0, cupBeats: 0, reservedNext: false };
  c.turns.push(t);
  return t;
}

/** Krok všech rozhovorů. */
export function stepConversations(world: SocialWorld, env: SocialEnv): void {
  const now = env.now;
  for (const c of world.convs) stepConversation(world, c, env);
  // příznak „mluví“ pro vykreslení
  for (const c of world.convs) for (const m of c.members) {
    const a = env.agent(m);
    if (a) a.anim.speaking = c.turns.some((t) => t.speaker === m && t.start <= now && now < t.end);
  }
}

function stepConversation(world: SocialWorld, c: Conversation, env: SocialEnv): void {
  const now = env.now;
  const traits = (id: string) => env.agent(id)?.social?.traits;
  // první tah: iniciátor (první člen) s p = 0,65
  if (!c.turns.length) {
    if (now < c.retryAt) return;
    const avail = c.members.filter((m) => busyUntil(env.agent(m), now) <= now + 0.45 || isVirtual(m));
    if (!avail.length) { c.retryAt = now + 0.5; return; }
    let first = avail[0];
    if (avail.length > 1 && !(avail[0] === c.members[0] && nextU01(c.rng) < 0.65)) first = weighted(c.rng, avail.slice(avail[0] === c.members[0] ? 1 : 0).map((m) => [m, traits(m)?.turnWeight ?? 1] as [string, number])) ?? avail[0];
    planTurn(c, first, now + 0.3, 0, 'first', traits(first)?.tempo ?? 1);
    world.stats.turns++;
    return;
  }
  // události běžících tahů: akcenty (gesta mluvčího) a hranice frází (reakce posluchačů)
  for (const t of c.turns) {
    const sp = env.agent(t.speaker);
    for (const ph of t.phrases) {
      // gesto se rozhoduje s předstihem, aby úder (≈ 0,44 délky klipu) padl na akcent
      if (!ph.gestureDone && now >= ph.accent - 0.9 && now >= t.start - 0.2) { ph.gestureDone = true; if (sp && !isVirtual(t.speaker)) speakerGesture(world, c, t, ph, sp, env); }
      if (!ph.endDone && now >= ph.end) { ph.endDone = true; listenerOpportunity(world, c, t, env, ph === t.phrases[t.phrases.length - 1]); }
    }
  }
  const last = c.turns[c.turns.length - 1];
  // rezervace dalšího tahu nejméně 0,8 s před koncem posledního (záporná mezera tak nezůstane v minulosti)
  if (!last.reservedNext && now >= last.end - 0.8 && now >= c.retryAt) reserveNext(world, c, last, env);
  // odstranit dohrané tahy (ponechat poslední kvůli navázání)
  c.turns = c.turns.filter((t) => t.end > now || t === c.turns[c.turns.length - 1]);
}

function reserveNext(world: SocialWorld, c: Conversation, cur: TurnPlan, env: SocialEnv): void {
  const now = env.now;
  const traits = (id: string) => env.agent(id)?.social?.traits;
  const g = sampleGap(c.rng);
  let start = cur.end + g.gap;
  if (start < now) start = now; // pozdě rezervovaná (po pauze) – nezačínat v minulosti
  const ok = (m: string) => isVirtual(m) || busyUntil(env.agent(m), now) <= start - 0.45;
  const elig = c.members.filter((m) => m !== cur.speaker && ok(m));
  if (!elig.length) {
    // druhý je zaneprázdněný (pije): mluvčí pokračuje kratším blokem, nebo záměrná pauza
    if (ok(cur.speaker) && nextU01(c.rng) < 0.5 && cur.gapKind !== 'cont') {
      const s = Math.max(now, cur.end + triR(c.rng, 0.15, 0.3, 0.6));
      cur.reservedNext = true;
      planTurn(c, cur.speaker, s, s - cur.end, 'cont', traits(cur.speaker)?.tempo ?? 1, true);
      world.stats.gaps.cont++; world.stats.turns++;
    } else c.retryAt = now + 0.3;
    if (!cur.reservedNext && now > cur.end) {
      // po pauze z důvodu „busy“: až bude někdo volný, začne bez vzorkované krátké mezery
      const any = c.members.filter((m) => m !== cur.speaker && busyUntil(env.agent(m), now) <= now);
      if (any.length) {
        const nx = any[0];
        cur.reservedNext = true;
        planTurn(c, nx, now + 0.2, now + 0.2 - cur.end, 'busy', traits(nx)?.tempo ?? 1);
        world.stats.gaps.busy++; world.stats.turns++;
      }
    }
    return;
  }
  // férový výběr: váha turnWeight·(1 + min(2, čekání·0,25)); kdo čekal ≥ 5 příležitostí, má přednost
  const forced = elig.filter((m) => (c.waiting[m] ?? 0) >= 5).sort((x, y) => (c.waiting[y] ?? 0) - (c.waiting[x] ?? 0) || (x < y ? -1 : 1));
  const next = forced[0] ?? weighted(c.rng, elig.map((m) => [m, (traits(m)?.turnWeight ?? 1) * (1 + Math.min(2, (c.waiting[m] ?? 0) * 0.25)) * (m === cur.speaker ? 0 : 1)] as [string, number])) ?? elig[0];
  for (const m of elig) c.waiting[m] = m === next ? 0 : (c.waiting[m] ?? 0) + 1;
  cur.reservedNext = true;
  planTurn(c, next, start, g.gap, g.kind, traits(next)?.tempo ?? 1);
  world.stats.gaps[g.kind]++; world.stats.turns++;
}

/** Gesto mluvčího na akcent fráze (A.4): p = 0,45·gestureRate ∈ [0,15; 0,65], max. 2 na promluvu < 6 s. */
function speakerGesture(world: SocialWorld, c: Conversation, t: TurnPlan, ph: Phrase, a: SocialAgent, env: SocialEnv): void {
  const s = a.social; if (!s || a.hidden) return;
  const now = env.now;
  const maxG = t.end - t.start < 6 ? 2 : 3;
  if (t.gestures >= maxG) return;
  const p = Math.max(0.15, Math.min(0.65, 0.45 * s.traits.gestureRate));
  if (nextU01(s.rng) >= p) return;
  const used = usedRes(a);
  const free = (i: 0 | 1) => !used.has(i === 0 ? 'arm0' : 'arm1') && !(i === 1 && a.holding);
  const bothFree = free(0) && free(1);
  const anyFree = free(0) || free(1);
  const target = env.pointTarget?.(a) ?? null;
  const cands: [Family, number][] = [
    ['beat', anyFree ? 0.48 : 0], ['point', anyFree && target ? 0.16 : 0], ['size', bothFree ? 0.12 : 0],
    ['open', anyFree ? 0.18 : 0], ['shrug', bothFree ? 0.06 : 0],
  ];
  // s kelímkem v ruce: místo úderu volnou rukou občas malé zdůraznění kelímkem (G06, jednou za promluvu)
  if (a.holding && t.cupBeats < 1 && !used.has('arm1')) cands.push(['cupBeat', 0.3]);
  const fam = weighted(s.rng, cands.filter(([f]) => (s.cdUntil[f] ?? -1e9) <= now && !(s.lastManual && s.lastManual.fam === f && now - s.lastManual.end < 8)));
  if (!fam) return; // nedostupnost nevynucuje náhradní gesto
  // paže: dominantní s p = 0,75, je-li volná
  let hand: 0 | 1 = s.traits.domArm;
  if (!free(hand) || nextU01(s.rng) >= 0.75) hand = hand === 0 ? 1 : 0;
  if (!free(hand)) hand = hand === 0 ? 1 : 0;
  if (fam === 'cupBeat') hand = 1;
  let dir: Vec2 | undefined;
  if (fam === 'point' && target) {
    // paže na straně cíle; směr ve vlastních souřadnicích paže (x ven)
    const want = Math.sign(target.x) || 1;
    for (const i of [0, 1] as const) if (free(i) && (env.outward?.(a, i) ?? (i === 1 ? 1 : -1)) === want) hand = i;
    const out = env.outward?.(a, hand) ?? 1;
    const len = Math.hypot(target.x, target.y) || 1;
    const dx = (target.x * out) / len, dy = -target.y / len;
    if (dx < 0.2) return; // cíl za zády / na druhé straně – gesto odmítnout
    dir = { x: dx, y: Math.max(-0.5, Math.min(0.4, dy)) };
  }
  const amp = (fam === 'beat' ? rangeR(s.rng, 0.85, 1.15) : 1) * s.traits.gestureAmplitude;
  const ok = tryGesture(a, world, now, { fam, hand, amp, sgn: nextU01(s.rng) < 0.5 ? 1 : -1, dir, second: fam === 'beat' && nextU01(s.rng) < 0.2, both: fam === 'open' && bothFree && nextU01(s.rng) < 0.25 });
  if (ok) { t.gestures++; if (fam === 'cupBeat') t.cupBeats++; }
  void ph;
}

/** Hranice fráze: posluchači s p = 0,30·responsiveness kývnou (adresát), ostatní ×0,35; občas náklon. */
function listenerOpportunity(world: SocialWorld, c: Conversation, t: TurnPlan, env: SocialEnv, lastPhrase: boolean): void {
  const now = env.now;
  const addressee = c.lastSpeaker && c.lastSpeaker !== t.speaker ? c.lastSpeaker : c.members.find((m) => m !== t.speaker);
  for (const m of c.members) {
    if (m === t.speaker || isVirtual(m)) continue;
    const a = env.agent(m), s = a?.social;
    if (!a || !s) continue;
    world.stats.nodOpps++;
    const p = Math.max(0.15, Math.min(0.5, 0.3 * s.traits.responsiveness)) * (m === addressee || c.members.length <= 2 ? 1 : 0.35);
    const u = nextU01(s.rng);
    if (u < p) s.pending.push({ at: now + rangeR(s.rng, 0.12, 0.35), fam: 'nod', amp: tri(2, 3.5, 5, nextU01(s.rng)) / 3.5, sgn: s.traits.nodSign, second: nextU01(s.rng) < 0.2 });
    else if (u < p + 0.15 * (1 - p)) s.pending.push({ at: now + rangeR(s.rng, 0.2, 0.5), fam: 'tilt', sgn: s.traits.nodSign, amp: 1 });
  }
  // společné pobavení na konci promluvy (p = 0,06, jen přátelé)
  if (lastPhrase && c.kind === 'pair' && now >= c.amusedUntil && nextU01(c.rng) < 0.06) {
    c.amusedUntil = now + 35;
    const sp = env.agent(t.speaker);
    if (sp?.social) sp.social.pending.push({ at: now, fam: 'amusement', sgn: 1, amp: rangeR(sp.social.rng, 0.8, 1.1) });
    for (const m of c.members) {
      if (m === t.speaker || isVirtual(m)) continue;
      const a = env.agent(m);
      if (a?.social && nextU01(c.rng) < 0.75 && a.anim.action?.requested !== 'drink') a.social.pending.push({ at: now + rangeR(c.rng, 0.15, 0.4), fam: 'amusement', sgn: -1, amp: rangeR(c.rng, 0.7, 1.0) * (a.holding ? 0.7 : 1) });
    }
  }
  if (lastPhrase) c.lastSpeaker = t.speaker;
}

/** Pozdrav dvou známých po dosažení míst: jeden kývne, druhý odpoví po 0,15–0,45 s (H02). */
export function greetPair(a: SocialAgent, b: SocialAgent, now: number): void {
  const sa = a.social, sb = b.social;
  if (sa) sa.pending.push({ at: now, fam: 'greetNod', sgn: sa.traits.nodSign, amp: tri(4, 5, 6, nextU01(sa.rng)) / 5 });
  if (sb) sb.pending.push({ at: now + rangeR(sb.rng, 0.15, 0.45), fam: 'greetNod', sgn: sb.traits.nodSign, amp: tri(4, 5, 6, nextU01(sb.rng)) / 5 });
}
/** Zamávání známému na dálku (H01) – volnou paží, jinak jen kývnutí. */
export function waveTo(a: SocialAgent, world: SocialWorld | null, now: number): boolean {
  const s = a.social; if (!s) return false;
  if (nextU01(s.rng) >= 0.65) return false;
  const used = usedRes(a);
  const hand: 0 | 1 = !used.has('arm1') && !a.holding && nextU01(s.rng) < 0.6 ? 1 : 0;
  if (used.has(hand === 0 ? 'arm0' : 'arm1')) return tryGesture(a, world, now, { fam: 'greetNod', sgn: s.traits.nodSign });
  return tryGesture(a, world, now, { fam: 'waveFar', hand, sgn: 1, amp: 1 });
}
/** Poděkování po převzetí (Q03): p = 0,85, 0,15–0,5 s po předání. */
export function thanks(a: SocialAgent, now: number): void {
  const s = a.social; if (!s) return;
  if (nextU01(s.rng) < 0.85) s.pending.push({ at: now + rangeR(s.rng, 0.15, 0.5), fam: 'thanks', sgn: s.traits.nodSign, amp: tri(3, 4, 5, nextU01(s.rng)) / 5 });
}
