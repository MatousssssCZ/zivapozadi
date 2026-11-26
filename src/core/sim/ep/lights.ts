/**
 * A12 – Věšení a rozsvěcení světýlek ve výloze (květinářství). Květinářka přinese štafle a
 * řetěz světel, štafle rozevře a postaví pod výlohu (přidřep), vystoupá po stupních (noha na stupeň →
 * přenos váhy → přísun druhé nohy; pánev stoupá jen s výškou stupně), nahoře jednou rukou vede volný
 * úsek a druhou ho upevní na háček nad výlohou. Upevněné body drží, volné úseky visí řetězovkou
 * (konečná délka řetězu – mezi háčky je vždy průvěs). Když další háček není v dosahu, sestoupí,
 * přenese štafle a vystoupá znovu. Nakonec ustoupí, zkontroluje a stiskne vypínač u dveří – světla se
 * rozsvítí až tímto gestem. Štafle složí a odnese. Světýlka zůstávají rozsvícená.
 */
import type { Vec2 } from '../../math/vec';
import type { World } from '../../scene/camera';
import type { AgentState } from '../types';
import { registerEpisode, W, S, type ActorHost, type EpisodeConfig, type EpisodeState, type Step } from '../episodes';

export const STEP_H = 0.28, LADDER_STEPS = 2, CHAIN_LEN = 3.2, HOOK_N = 4;
export interface LightsWorld { hooks: number; on: boolean; onAt: number }
export const lightsWorld = (st: EpisodeState) => ((st.world.lights ??= { hooks: 0, on: false, onAt: 0 }) as LightsWorld);
interface D { h0?: number; ladder?: 'carried' | 'standing' | 'folded' | null; ladderAt?: number; level?: number; climb?: { from: number; to: number; t0: number } | null; handFree?: World & { H: number } | null }

/** Rovina fasády (Z) a výška bodu obrazu na ní. */
export function facadeZ(h: ActorHost, c: EpisodeConfig) { return W(h, c.pts.wall).Z; }
function heightOn(h: ActorHost, X: number, Z: number, y: number): number {
  let lo = 0, hi = 8; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (S(h, { X, Z }, m).y > y) lo = m; else hi = m; } return (lo + hi) / 2;
}
/** háčky nad výlohou (svět + výška), rovnoměrně mezi horními rohy výlohy */
export function lightHooks(h: ActorHost, c: EpisodeConfig): (World & { H: number })[] {
  const Z = facadeZ(h, c) - 0.05, a = c.pts.winL, b = c.pts.winR;
  return Array.from({ length: HOOK_N }, (_, i) => {
    const q = { x: a.x + ((b.x - a.x) * i) / (HOOK_N - 1), y: a.y + ((b.y - a.y) * i) / (HOOK_N - 1) };
    const X = W(h, { x: q.x, y: c.pts.wall.y }).X;
    return { X, Z, H: heightOn(h, X, Z, q.y) };
  });
}
/** pata štaflí pod háčkem i (kousek před fasádou) */
export const ladderBase = (h: ActorHost, c: EpisodeConfig, i: number): World => { const k = lightHooks(h, c)[i]; return { X: k.X + 0.25, Z: facadeZ(h, c) - 0.55 }; };

function plan(c: EpisodeConfig, st: EpisodeState, A: AgentState[], h: ActorHost): Step[] {
  const d = st.data as D, L = lightsWorld(st), F = A[0], hooks = lightHooks(h, c);
  if (d.ladder === undefined) { d.ladder = 'carried'; d.level = 0; d.h0 = L.hooks; }
  const h0 = d.h0 ?? 0; // plán z výchozího stavu epizody (průběh ho nesmí přeskládat)
  const carry = () => h.hands(F, [{ u: 0.12, h: 0.95, lat: -0.15 }, { u: 0.2, h: 0.9, lat: 0.15 }]);
  const standAt = (i: number) => { const B = ladderBase(h, c, i); return S(h, { X: B.X, Z: B.Z - 0.42 }); };
  const steps: Step[] = [
    { k: 'enter', who: [0], at: ['in'] },
    { k: 'call', fn: () => { carry(); } },
  ];
  // stanoviště štaflí: háčky 0–1 z první polohy, 2–3 z druhé (dál než dosah – nutné přenést štafle)
  const spots = [{ at: 0, hooks: [0, 1] }, { at: 2, hooks: [2, 3] }].filter((s) => s.hooks.some((k) => k >= h0));
  spots.forEach((sp, si) => {
    const B = ladderBase(h, c, sp.at + 0.5 > HOOK_N - 1 ? HOOK_N - 1 : sp.at);
    steps.push(
      { k: 'walk', label: si ? 'přenáší štafle k dalšímu háčku' : 'nese štafle a světýlka k výloze', moves: [{ who: 0, to: [standAt(sp.at)], sp: 0.5 }] },
      { k: 'do', dur: 2.4, label: 'rozevře a postaví štafle', tick: (el) => {
        h.face(F, S(h, B, 1)); h.pose(F, 'lift', Math.min(1, el / 0.8, (2.4 - el) / 0.7) * 0.7, el);
        if (el > 1.2 && d.ladder === 'carried') { d.ladder = 'standing'; d.ladderAt = sp.at; h.hands(F, null); }
      } },
    );
    for (let lv = 0; lv < LADDER_STEPS; lv++) steps.push({ k: 'do', dur: 1.3, label: `vystupuje na ${lv + 1}. stupeň`, tick: (el) => { d.climb = { from: lv, to: lv + 1, t0: h.time() - el }; } });
    steps.push({ k: 'call', fn: () => { d.climb = null; d.level = LADDER_STEPS; } });
    for (const k of sp.hooks) {
      if (k < h0) continue;
      const hk = hooks[k];
      steps.push({ k: 'do', dur: 3.2, label: `upevňuje úsek ${k + 1}`, tick: (el) => {
        // ruka k háčku (vzdálenost od postavy na stupni), druhá ruka vede volný úsek níž
        const P = W(h, F.pos), lvH = (d.level ?? 0) * STEP_H, Lg = 0.92;
        const fwd = Math.hypot(hk.X - P.X, hk.Z - P.Z) / Lg, up = (hk.H - lvH) / Lg;
        const w = Math.min(1, el / 0.8, Math.max(0, (3.2 - el) / 0.6));
        h.hands(F, [{ u: Math.min(0.7, fwd * 0.9), h: up - 0.25, lat: -0.15 }, { u: Math.min(0.75, fwd), h: up, lat: 0.1 }], w);
        h.face(F, S(h, hk, hk.H));
        if (el > 1.7 && L.hooks <= k) { L.hooks = k + 1; h.log(`Květinářka upevnila ${k + 1}. úsek světýlek.`, F.id); }
      } });
    }
    for (let lv = LADDER_STEPS; lv > 0; lv--) steps.push({ k: 'do', dur: 1.4, label: `sestupuje (${lv}. stupeň)`, tick: (el) => { d.climb = { from: lv, to: lv - 1, t0: h.time() - el }; } });
    steps.push(
      { k: 'call', fn: () => { d.climb = null; d.level = 0; } },
      { k: 'do', dur: 2.2, label: 'skládá štafle', tick: (el) => { h.pose(F, 'lift', Math.min(1, el / 0.8, (2.2 - el) / 0.7) * 0.6, el); if (el > 1.0 && d.ladder === 'standing') { d.ladder = 'carried'; carry(); } } },
    );
  });
  steps.push(
    { k: 'walk', label: 'ustoupí a kontroluje dekoraci', moves: [{ who: 0, to: [S(h, { X: (hooks[1].X + hooks[2].X) / 2, Z: facadeZ(h, c) - 2.2 })], sp: 0.45 }] },
    { k: 'do', dur: 2.5, label: 'kontroluje dekoraci', tick: () => h.face(F, S(h, hooks[1], hooks[1].H)) },
    { k: 'walk', label: 'jde k vypínači', moves: [{ who: 0, to: [c.pts.switchStand], sp: 0.45 }] },
    { k: 'do', dur: 2.4, label: 'stiskne vypínač', tick: (el) => {
      const w = Math.min(1, el / 0.6, Math.max(0, (2.4 - el) / 0.5)); h.hands(F, [{ u: 0.15, h: 0.95, lat: -0.15 }, { u: 0.48, h: 1.28, lat: 0.12 }], w); h.face(F, c.pts.switchAt);
      if (el > 1.0 && !L.on) { L.on = true; L.onAt = h.time(); h.log('Světýlka ve výloze se rozsvítila.', F.id); }
      if (el > 2.0) carry();
    } },
    { k: 'do', dur: 2.0, label: 'prohlíží si rozsvícená světla', tick: () => h.face(F, S(h, hooks[1], hooks[1].H)) },
    { k: 'exit', moves: [{ who: 0, to: [c.pts.out], sp: 0.55 }] },
  );
  return steps;
}

/** Výstup po stupni: noha na stupeň (0–0,45) → přenos váhy, pánev stoupá (0,45–0,95) → přísun druhé nohy. */
function tick(c: EpisodeConfig, st: EpisodeState, A: AgentState[], h: ActorHost) {
  const d = st.data as D, F = A[0]; if (st.phase !== 'run' || F.hidden) return;
  const ppm = ppmAt(h, F.pos), Lg = 0.92;
  let lift = (d.level ?? 0) * STEP_H;
  if (d.climb) {
    const p = Math.min(1.3, h.time() - d.climb.t0), up = d.climb.to > d.climb.from;
    const e = Math.max(0, Math.min(1, (p - 0.45) / 0.5)), s = e * e * (3 - 2 * e);
    lift = (d.climb.from + (d.climb.to - d.climb.from) * s) * STEP_H;
    // vedoucí noha: nahoru přes hranu stupně (výstup) / dolů k nižšímu stupni (sestup); druhá dorovná
    const lead = up ? Math.min(1, p / 0.45) : Math.min(1, p / 0.5), trail = Math.max(0, Math.min(1, (p - 0.95) / 0.3));
    const dH = (STEP_H / Lg) * (up ? 1 : -1);
    const leadH = up ? dH * (1 - s) * lead + 0.06 * Math.sin(Math.PI * Math.min(1, p / 0.45)) : dH * (1 - s) * lead;
    const trailH = -dH * s * (1 - trail) + (up ? 0.05 * Math.sin(Math.PI * trail) : 0);
    F.anim.sit = { kind: 'climb', t: leadH, dur: 1e9, w: 1, r: trailH };
  } else if ((d.level ?? 0) > 0) F.anim.sit = { kind: 'climb', t: 0, dur: 1e9, w: 1, r: 0 };
  else if (F.anim.sit?.kind === 'climb') F.anim.sit = null;
  F.off = { x: 0, y: -lift * ppm };
  F.status = d.climb ? (d.climb.to > d.climb.from ? 'Vystupuje na štafle' : 'Sestupuje ze štaflí') : F.status;
}
function ppmAt(h: ActorHost, p: Vec2) { const w = W(h, p), a = S(h, w), b = S(h, w, 1); return Math.abs(a.y - b.y); }
registerEpisode('lights', plan, tick);
export const lightsData = (st: EpisodeState) => st.data as D;
