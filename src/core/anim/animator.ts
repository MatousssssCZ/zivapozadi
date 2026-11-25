import type { CharacterManifest, Direction, LoopMode, AnimEvent } from './manifest';
import { resolveClip } from './manifest';
import { clamp, smoothstep } from '../math/vec';
import { LEG_PHYS_M, speedBlend, strideLegLen } from './gaitProfile';
import { restFeet, startPhase, heelAtContact, footAt, type FootGeom } from './gaitKinematics';
import { gaitEvents } from './gaitProfile';
import type { GestureInst } from '../social/clips';
import { caneIndices, elderStepM, elderSpeedOf, TIP_AHEAD, type ElderState } from './elderGait';

/** Poloha opěrných pat vůči pánvi ze světových kotev (null = noha bez kotvy). */
export function heelRelOf(a: AnimState): [number | null, number | null] {
  const d = a.dist ?? 0;
  return [a.anchors?.[0] != null ? a.anchors[0] - d : null, a.anchors?.[1] != null ? a.anchors[1] - d : null];
}

/** Stav přehrávání animací jedné postavy. Čistá data ⇒ součást checkpointu. */
/**
 * Nástroj v obou rukou (lopata) – tuhý objekt. Poloha je dána pracovní hranou listu v rovině chůze
 * (u vpřed od chodidel, h nad zemí; metry) a natočením násady β (rad, 0 = jako ve spritu, + = rukojeť
 * výš). Kostra β upraví v mezích tak, aby obě ruce dosáhly na úchopy (paže se nikdy neprodlužují),
 * a vrátí matici spritu. crouch/lean: pokrčení kolen a předklon trupu (0..1).
 */
export interface ToolPose { u: number; h: number; beta: number; crouch: number; lean: number; oneHand?: boolean; load?: number }

export interface AnimState {
  dir: Direction;
  /** nástroj v rukou (lopata) */ tool?: ToolPose | null;
  walkPhase: number;
  walkBlend: number;
  idleTime: number;
  action: ActionState | null;
  /** Délka cyklu (2 kroky) v jednotkách postavy – mění se jen při došlapu (žádný skok fáze ani posun opory). */
  stride?: number;
  /** Váha profilu (0 = pomalá procházka 0,9 m/s, 1 = běžná chůze 1,3 m/s) – mění se jen při došlapu. */
  gaitW?: number;
  /** Aktuální rychlost v m/s (diagnostika). */
  speedMps?: number;
  /** Zastavení: fáze, ve které postava zastavila, a průběh dokročení (0–1). Zůstává i v klidu. */
  settle?: { phase: number; stride: number; w: number; t: number; heelRel?: [number | null, number | null] } | null;
  /** Rozejití: klidové polohy chodidel, ze kterých se vychází. */
  startRest?: [number, number] | null;
  /** Uražená dráha (jednotky postavy) a světové kotvy pat obou nohou (dráha, kde je pata opřená). */
  dist?: number;
  anchors?: [number | null, number | null];
  /** Tytéž kotvy pat ve scéně (px) + klíč kotvy dráhy, ke které patří (opora pak neklouže ani v zatáčce či při změně hloubky). */
  anchorsXY?: [{ x: number; y: number; key: number; h?: number } | null, { x: number; y: number; key: number; h?: number } | null];
  /** Běžící sociální klipy (gesta, kývnutí, chlad) – řídí je src/core/social. */
  gestures?: GestureInst[];
  /** Postava právě „mluví“ (vizuální promluva bez zvuku). */
  speaking?: boolean;
  /** Senior (profil A/B, hůl) – viz elderGait.ts. */
  elder?: ElderState;
  /** Probíhající pád / zachycené uklouznutí: varianta, strana (±1), čas od začátku (s). */
  fall?: { v: import('./fallPoses').FallVariant; s: 1 | -1; t: number; du?: number } | null;
  /** Bruslení: póza celého těla z cílů (rink.ts → skatePose), přebírá chůzi. */
  skate?: import('./fallPoses').FallKey | null;
}

/** Údaje o postavě potřebné pro chůzi (délka nohy, geometrie boty, individuální délka kroku). */
export interface GaitContext { legLen: number; strideScale: number; foot: FootGeom }

export interface ActionState {
  /** Požadovaný klip (logický název podle činnosti). */
  requested: string;
  /** Skutečně přehrávaný klip (po náhradě), nebo `null` = virtuální klip bez obrazu. */
  clip: string | null;
  time: number;
  duration: number;
  loop: LoopMode;
  events: AnimEvent[];
  finished: boolean;
}

export function initialAnimState(dir: Direction = 'SE'): AnimState {
  return { dir, walkPhase: 0, walkBlend: 0, idleTime: 0, action: null };
}

/**
 * Spustí akční klip. Pokud klip v manifestu chybí, použije se uvedená náhrada; pokud ani ta,
 * použije se „virtuální“ klip s výchozí délkou a událostmi, aby navazující logika (např. převzetí
 * kelímku) nikdy nezamrzla. Vrací případné upozornění.
 */
export function playAction(
  a: AnimState, m: CharacterManifest, requested: string,
  defaults: { duration: number; events?: AnimEvent[]; loop?: LoopMode },
): string | undefined {
  const r = resolveClip(m, requested);
  let duration = defaults.duration, loop: LoopMode = defaults.loop ?? 'once', events = defaults.events ?? [];
  if (r.clip) {
    const def = m.clips[r.clip];
    duration = def.duration; loop = defaults.loop ?? def.loop;
    // Události bere z klipu; chybějící požadované události doplní z výchozích (explicitně).
    const own = def.events ?? [];
    events = [...own];
    for (const e of defaults.events ?? []) if (!own.some((o) => o.name === e.name)) events.push({ time: Math.min(e.time, duration), name: e.name });
    events.sort((x, y) => x.time - y.time);
  }
  a.action = { requested, clip: r.clip, time: 0, duration, loop, events, finished: false };
  return r.warning;
}

const ELDER_CANE = (e: ElderState) => e.p === 'elderB';

export function stopAction(a: AnimState): void { a.action = null; }

/**
 * Krok animátoru. Fáze chůze postupuje podle uražené vzdálenosti (kroky sladěné s posunem),
 * prolnutí chůze/klid podle rychlosti. Vrací animační události, které v kroku nastaly.
 */
export function stepAnimator(a: AnimState, m: CharacterManifest, dt: number, speed: number, refSpeed: number, scale: number, gait?: GaitContext): string[] {
  const fired: string[] = [];
  if (gait) {
    // Fáze řízená drahou: phase += Δs / délka cyklu (délka se mění jen při došlapu).
    const vLocal = speed / Math.max(1e-6, scale);
    const vMps = (vLocal * LEG_PHYS_M) / gait.legLen;
    a.speedMps = vMps;
    const el = a.elder;
    // senior: pevná délka kroku podle profilu (při pomalejší chůzi – rozejití, sníh – kratší kroky), pomalý profil
    const targetS = el ? ((2 * elderStepM(el)) / LEG_PHYS_M) * gait.legLen * Math.pow(clamp(vMps / (0.93 * elderSpeedOf(el)), 0.45, 1), 0.6) : strideLegLen(vMps) * gait.legLen * gait.strideScale;
    const targetW = el ? 0 : speedBlend(vMps);
    if (el && ELDER_CANE(el)) {
      // hůl: při změně ruky v obraze (otočka) se hrot znovu usadí při dalším došlapu
      const ci = caneIndices(el, a.dir);
      if (el.h !== ci.hand) { el.h = ci.hand; el.tip = null; }
    }
    if (speed > 0.5) {
      if (a.stride === undefined || a.walkBlend < 0.02 || a.settle) {
        // rozejití z místa: vpředu stojící noha zůstane, zadní vykročí; první krok je kratší (nízká rychlost).
        // Rozejití během dokračování (např. po otočce na místě) začíná z aktuální polohy chodidel.
        let rest: [number, number] = [0.03 * gait.legLen, -0.03 * gait.legLen];
        if (a.settle) {
          const st = a.settle, tt = smoothstep(st.t);
          const r = restFeet(st.phase, st.stride, st.w, gait.foot, st.heelRel);
          rest = [0, 1].map((i) => { const f = footAt(st.phase + i * 0.5, st.stride, st.w, gait.foot, st.heelRel?.[i] ?? undefined); return f.u + (r[i] - f.u) * tt; }) as [number, number];
          a.walkBlend = 0;
        }
        a.stride = targetS; a.gaitW = targetW;
        if (a.walkBlend < 0.02) {
          a.walkPhase = startPhase(rest, a.stride, a.gaitW, gait.foot); a.startRest = rest;
          // stojná noha: kotva paty tam, kde chodidlo stojí; švihová dostane kotvu až při došlapu
          a.dist = a.dist ?? 0;
          a.anchors = [0, 1].map((i) => (((a.walkPhase + i * 0.5) % 1) < gaitEvents(a.gaitW!).toeOff ? a.dist! + rest[i] - gait.foot.heel : null)) as [number | null, number | null];
        }
        a.settle = null;
      }
      a.settle = null; // pokračování v chůzi během dokračování
      const prev = a.walkPhase;
      a.dist = (a.dist ?? 0) + vLocal * dt;
      a.walkPhase = (a.walkPhase + (vLocal * dt) / a.stride) % 1;
      if (Math.floor(prev * 2) !== Math.floor(a.walkPhase * 2)) { a.stride = targetS; a.gaitW = targetW; } // došlap
      // došlap nohy i (lokální fáze přejde 1 → 0): uložit světovou kotvu paty
      a.anchors ??= [null, null];
      for (let i = 0; i < 2; i++) {
        const qp = (prev + i * 0.5) % 1, qn = (a.walkPhase + i * 0.5) % 1;
        if (qn < qp) {
          a.anchors[i] = a.dist + heelAtContact(a.stride, a.gaitW ?? 0, gait.foot) - qn * a.stride;
          // hůl došlapuje současně s podpíranou nohou, kousek před její patou
          if (el && ELDER_CANE(el) && el.h !== undefined && i === 1 - el.h) { el.tip = a.anchors[i]! + gait.foot.heel + TIP_AHEAD * gait.legLen; el.plants = (el.plants ?? 0) + 1; }
        }
      }
      const target = clamp(speed / Math.max(1e-6, refSpeed * 0.3), 0, 1);
      a.walkBlend += clamp(target - a.walkBlend, -dt * 3, dt * 3);
      if (a.walkBlend >= 0.999) a.startRest = null;
    } else if (a.walkBlend > 0 && !a.settle && a.startRest) {
      // zastavení hned po rozejití (chůze ještě nenaběhla): plynule zpět do klidového postoje, ze kterého
      // vyšla – dokročení z plné chůze by tu skočilo (póza je zatím skoro klidová)
      a.walkBlend = Math.max(0, a.walkBlend - dt * 3);
      if (a.walkBlend === 0) { a.startRest = null; a.stride = undefined; }
    } else if (a.walkBlend > 0) {
      // zastavení: opřená noha zůstává, švihová dokročí; pak klid
      if (!a.settle) a.settle = { phase: a.walkPhase, stride: a.stride ?? targetS, w: a.gaitW ?? targetW, t: 0, heelRel: heelRelOf(a) };
      a.settle.t = Math.min(1, a.settle.t + dt / 0.5);
      a.walkBlend = 1 - a.settle.t;
      a.startRest = null;
    }
  } else {
    const walk = m.clips.walk;
    const stride = (walk?.strideLength ?? 90) * scale;
    const targetBlend = clamp(speed / Math.max(1e-6, refSpeed * 0.55), 0, 1);
    a.walkBlend += clamp(targetBlend - a.walkBlend, -dt * 4, dt * 4);
    if (speed > 0.5) a.walkPhase = (a.walkPhase + (speed * dt) / stride) % 1;
  }
  a.idleTime += dt;
  const act = a.action;
  if (act && !act.finished) {
    const prev = act.time;
    act.time += dt;
    if (act.loop === 'once') {
      for (const e of act.events) if (e.time > prev && e.time <= act.time) fired.push(e.name);
      if (act.time >= act.duration) { act.time = act.duration; act.finished = true; fired.push('__end'); }
    } else {
      const p0 = prev % act.duration, p1 = act.time % act.duration;
      for (const e of act.events) if ((p1 >= p0 && e.time > p0 && e.time <= p1) || (p1 < p0 && (e.time > p0 || e.time <= p1))) fired.push(e.name);
    }
  }
  return fired;
}
