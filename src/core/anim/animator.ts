import type { CharacterManifest, Direction, LoopMode, AnimEvent } from './manifest';
import { resolveClip } from './manifest';
import { clamp } from '../math/vec';

/** Stav přehrávání animací jedné postavy. Čistá data ⇒ součást checkpointu. */
export interface AnimState {
  dir: Direction;
  walkPhase: number;
  walkBlend: number;
  idleTime: number;
  action: ActionState | null;
}

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

export function stopAction(a: AnimState): void { a.action = null; }

/**
 * Krok animátoru. Fáze chůze postupuje podle uražené vzdálenosti (kroky sladěné s posunem),
 * prolnutí chůze/klid podle rychlosti. Vrací animační události, které v kroku nastaly.
 */
export function stepAnimator(a: AnimState, m: CharacterManifest, dt: number, speed: number, refSpeed: number, scale: number): string[] {
  const fired: string[] = [];
  const walk = m.clips.walk;
  const stride = (walk?.strideLength ?? 90) * scale;
  const targetBlend = clamp(speed / Math.max(1e-6, refSpeed * 0.55), 0, 1);
  a.walkBlend += clamp(targetBlend - a.walkBlend, -dt * 4, dt * 4);
  if (speed > 0.5) {
    a.walkPhase = (a.walkPhase + (speed * dt) / stride) % 1;
  } else {
    // V klidu se fáze plynule dotočí do neutrální polohy (nohy u sebe), žádné zamrznutí v půli kroku.
    const targets = [0, 0.5, 1];
    const nearest = targets.reduce((b, t) => (Math.abs(t - a.walkPhase) < Math.abs(b - a.walkPhase) ? t : b), 0);
    const d = nearest - a.walkPhase;
    a.walkPhase += clamp(d, -dt * 0.8, dt * 0.8);
    if (a.walkPhase >= 1) a.walkPhase -= 1;
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
