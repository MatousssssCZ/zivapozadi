/**
 * Bobování na svahu (Horské městečko). Svah je namalovaný ve 2D pozadí; pro postavy a boby se
 * z obrazového bodu odvodí jednoduchý terén: pod úpatím (footY) je rovina dojezdu, nad ním nakloněná
 * plocha – obrazová výška se rozdělí na hloubku (posun „země“ jen o část výšky) a skutečnou výšku nad
 * zemí. Měřítko postavy se proto bere z hloubky, ne z obrazového y (děti nahoře nejsou maličké).
 *
 * Cyklus dítěte: fronta nahoře → položení bobů → usednutí → odraz → jízda po dráze podle sklonu
 * (gravitace, tření, odpor, brzdění nohama na dojezdu) → zastavení před chodníkem → vstání →
 * návrat pěšky po dojezdu s boby na šňůře → výstup po vyšlapané cestě → fronta. Bez teleportů.
 * Rezervace: dojezd je společný – nikdo nevyjede, dokud v konfliktní části dojezdu někdo stojí,
 * vstává nebo se vrací; druhá jízda smí jen hned po první (souběžně v druhé dráze).
 */
import type { Vec2 } from '../math/vec';
import type { AgentState } from './types';
import { SIM_DT } from './types';
import type { ProjectFile } from '../model/types';
import { cameraFor, toScreen, toWorld, type Camera, type World } from '../scene/camera';
import { hashNoise } from '../math/rng';

export interface HillConfig {
  /** obrazové y úpatí svahu (níž je rovina dojezdu), podíl výšky (0–1) a délka plynulého přechodu (px) */
  footY: number; rise: number; blend: number;
  /** dráhy jízdy (shora k bodu zastavení), návraty z dojezdu k výstupu (pro každou dráhu), výstup (zdola nahoru) */
  lanes: Vec2[][]; returns: Vec2[][]; ascent: Vec2[];
  /** místa fronty nahoře ([0] nejblíž drahám) */ queue: Vec2[];
  /** děti (routine „hill“), rodiče sledující svah a jejich místa */
  kids: string[]; watchers?: string[]; watchSpots?: Vec2[];
  /** x, od kterého je dojezd konfliktní (místo zastavení a vstávání) */ conflictX: number;
  colors?: string[]; firstDelay?: number;
}

export type P3 = { X: number; Z: number; H: number };
type PathRef = { k: 'lane' | 'ret' | 'asc' | 'line'; i?: number; a?: Vec2; b?: Vec2 };
export type HillPhase = 'walk' | 'queue' | 'place' | 'sit' | 'ride' | 'getup' | 'pick';
export interface HillKid {
  id: string; ph: HillPhase; t0: number; n: number;
  path?: PathRef; s: number; next?: 'queue' | 'place' | 'asc' | 'top';
  lane: number; v: number; cd: number; qn: number; wait: number;
  /** boby: střed (svět + výška), směr (rad, svět), sklon (dH/dx), ujetá dráha */
  sled: { P: P3; hd: number; pitch: number; dist: number };
  /** stopa dítěte (za ní jedou boby na šňůře) */ trail: P3[];
  /** stání při vstávání / sedání: odkud kam (obraz) */ from?: Vec2; to?: Vec2;
  brake?: number; acc?: number; color: string;
}
export interface HillState { kids: HillKid[]; lastLaunch: number; qn: number; rides: number; watchT: number }

export const HILL = { rope: 1.1, sledL: 1.12, walk: 0.95, climb: 0.62, mu: 0.07, g: 9.81 } as const;
const D_TOW = HILL.rope * 0.92 + HILL.sledL / 2;

/** obrazová výška nad úpatím → px „země“ (hloubka) navíc */
export function liftPx(cfg: HillConfig, y: number): number {
  const d = cfg.footY - y;
  if (d <= 0) return 0;
  return d < cfg.blend ? (cfg.rise * d * d) / (2 * cfg.blend) : cfg.rise * (d - cfg.blend / 2);
}
/** obrazový bod na svahu → svět (hloubka) + výška nad zemí (m) */
export function hill3(cam: Camera, cfg: HillConfig, p: Vec2): P3 {
  const gy = p.y + liftPx(cfg, p.y), G = toWorld(cam, { x: p.x, y: gy });
  const H = gy - p.y > 0 ? cam.h - ((p.y - cam.yh) * G.Z) / cam.f : 0;
  return { X: G.X, Z: G.Z, H: Math.max(0, H) };
}
export const scr3 = (cam: Camera, P: P3): Vec2 => toScreen(cam, P, P.H);

interface Sampled { pts: P3[]; cum: number[]; len: number }
const cache = new WeakMap<HillConfig, Map<string, Sampled>>();
function sample(cam: Camera, cfg: HillConfig, poly: Vec2[]): Sampled {
  const pts: P3[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let j = 0; j < n; j++) pts.push(hill3(cam, cfg, { x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n }));
  }
  pts.push(hill3(cam, cfg, poly[poly.length - 1]));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].X - pts[i - 1].X, pts[i].Z - pts[i - 1].Z, pts[i].H - pts[i - 1].H));
  return { pts, cum, len: cum[cum.length - 1] };
}
function pathOf(cam: Camera, cfg: HillConfig, r: PathRef): Sampled {
  if (r.k === 'line') return sample(cam, cfg, [r.a!, r.b!]);
  let m = cache.get(cfg); if (!m) cache.set(cfg, (m = new Map()));
  const key = `${r.k}${r.i ?? 0}`; let s = m.get(key);
  if (!s) { s = sample(cam, cfg, r.k === 'lane' ? cfg.lanes[r.i!] : r.k === 'ret' ? cfg.returns[r.i!] : cfg.ascent); m.set(key, s); }
  return s;
}
function at(S: Sampled, s: number): { P: P3; T: P3 } {
  s = Math.max(0, Math.min(S.len, s));
  let lo = 0, hi = S.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S.cum[mid] <= s) lo = mid; else hi = mid; }
  const a = S.pts[lo], b = S.pts[hi], L = S.cum[hi] - S.cum[lo] || 1e-9, f = (s - S.cum[lo]) / L;
  return { P: { X: a.X + (b.X - a.X) * f, Z: a.Z + (b.Z - a.Z) * f, H: a.H + (b.H - a.H) * f }, T: { X: (b.X - a.X) / L, Z: (b.Z - a.Z) / L, H: (b.H - a.H) / L } };
}
const lerp3 = (a: P3, b: P3, f: number): P3 => ({ X: a.X + (b.X - a.X) * f, Z: a.Z + (b.Z - a.Z) * f, H: a.H + (b.H - a.H) * f });
const d3 = (a: P3, b: P3) => Math.hypot(a.X - b.X, a.Z - b.Z, a.H - b.H);
const angWrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export interface HillHost {
  project: ProjectFile; time(): number;
  agent(id: string): AgentState | undefined;
  /** nastaví postavu: poloha na svahu (obraz), lift (px hloubky), směr, rychlost obrazu */
  place(a: AgentState, p: Vec2, lift: number, facing: number, speedPx: number, groundHeading: number | null): void;
  puff(x: number, y: number, n: number, seed: number): void;
  log(msg: string, id?: string): void;
}

/** Počáteční rozmístění: fronta nahoře, výstup, návrat (různé fáze cyklu, nikdo v konfliktní části). */
export function initHill(h: HillHost): HillState {
  const cfg = h.project.hill!, cam = cameraFor(h.project.scene), seed = h.project.seed;
  const st: HillState = { kids: [], lastLaunch: -99, qn: 0, rides: 0, watchT: 0 };
  const colors = cfg.colors ?? ['#d23a32', '#2f6fb6', '#e8a317', '#3f9a5a', '#8a4fb0', '#e0663a'];
  const asc = pathOf(cam, cfg, { k: 'asc' }), ret0 = pathOf(cam, cfg, { k: 'ret', i: 0 });
  cfg.kids.forEach((id, i) => {
    const k: HillKid = { id, ph: 'queue', t0: 0, n: 0, s: 0, lane: i % cfg.lanes.length, v: 0, cd: 0.2, qn: 0, wait: 0, sled: { P: { X: 0, Z: 0, H: 0 }, hd: 0, pitch: 0, dist: 0 }, trail: [], color: colors[i % colors.length] };
    const slot = i % 5;
    if (slot === 0 || slot === 1) { k.ph = 'queue'; k.qn = st.qn++; k.wait = 3 + 4 * hashNoise(seed, 8800, i) + slot * 3; }
    else { k.ph = 'walk'; k.path = slot === 3 ? { k: 'ret', i: 0 } : { k: 'asc' }; k.next = slot === 3 ? 'asc' : 'top'; k.lane = 0; k.s = (slot === 2 ? 0.35 : slot === 4 ? 0.75 : 0.55) * (slot === 3 ? ret0.len : asc.len); }
    st.kids.push(k);
  });
  // polohy: fronta / dráha; boby za dítětem po jeho dráze (stopa)
  for (const k of st.kids) {
    let P: P3, back: P3;
    if (k.ph === 'queue') { const q = cfg.queue[Math.min(k.qn, cfg.queue.length - 1)]; P = hill3(cam, cfg, q); back = hill3(cam, cfg, { x: q.x - 28, y: q.y + 14 }); }
    else { const S = pathOf(cam, cfg, k.path!); P = at(S, k.s).P; back = at(S, k.s - D_TOW).P; }
    k.trail = [back, P];
    k.sled = { P: back, hd: Math.atan2(P.Z - back.Z, P.X - back.X), pitch: 0, dist: 0 };
    towSled(k, true);
    const a = h.agent(k.id); if (a) { const p = scr3(cam, P); h.place(a, p, toScreen(cam, P).y - p.y, Math.PI / 2, 0, null); a.anim.sit = null; }
  }
  (cfg.watchers ?? []).forEach((id, i) => { const a = h.agent(id), q = cfg.watchSpots?.[i]; if (a && q) h.place(a, q, liftPx(cfg, q.y), -Math.PI / 2 - 0.3, 0, null); });
  return st;
}

/** boby za dítětem: střed na stopě ve vzdálenosti šňůry (jen tah – když dítě stojí, boby stojí) */
function towSled(k: HillKid, snap = false) {
  const tr = k.trail; if (tr.length < 2) return;
  // od dítěte (konec stopy) zpět
  let acc = 0, C: P3 | null = null, F: P3 | null = null;
  const want = D_TOW, wantF = D_TOW - HILL.sledL / 2;
  for (let i = tr.length - 1; i > 0; i--) {
    const L = d3(tr[i], tr[i - 1]);
    if (!F && acc + L >= wantF) F = lerp3(tr[i], tr[i - 1], (wantF - acc) / (L || 1));
    if (acc + L >= want) { C = lerp3(tr[i], tr[i - 1], (want - acc) / (L || 1)); tr.splice(0, i - 1); break; }
    acc += L;
  }
  if (!C) return; // šňůra ještě povolená – boby stojí
  if (!F) F = tr[tr.length - 1];
  const moved = d3(C, k.sled.P);
  k.sled.P = C; k.sled.dist += moved;
  const want2 = Math.atan2(F.Z - C.Z, F.X - C.X), hz = Math.hypot(F.X - C.X, F.Z - C.Z) || 1e-6;
  k.sled.hd += angWrap(want2 - k.sled.hd) * (snap ? 1 : Math.min(1, moved / (HILL.sledL * 0.5)));
  k.sled.pitch = Math.max(-0.42, Math.min(0.42, (F.H - C.H) / hz)); // na schodech leží boby na schodech (ne svisle)
}

/** konec dráhy, kde má dítě stát u bobů (bok vůči směru jízdy, na straně ke kameře) */
function sideSpot(P: P3, hd: number, d: number): P3 { return { X: P.X + Math.sin(hd) * d, Z: P.Z - Math.cos(hd) * d, H: P.H }; }

export function stepHill(h: HillHost, st: HillState): void {
  const cfg = h.project.hill!, cam = cameraFor(h.project.scene), t = h.time(), dt = SIM_DT, seed = h.project.seed;
  const kids = st.kids;
  const posOf = (k: HillKid): P3 | null => { const a = h.agent(k.id); return a ? hill3(cam, cfg, a.pos) : null; };
  const riding = kids.filter((k) => k.ph === 'ride' || k.ph === 'sit' || k.ph === 'place');
  // konflikt na dojezdu: zastavené, vstávající, sbírající, nebo vracející se v konfliktní části
  const conflict = kids.some((k) => k.ph === 'getup' || k.ph === 'pick' || (k.ph === 'ride' && k.s > pathOf(cam, cfg, { k: 'lane', i: k.lane }).len * 0.55) ||
    (k.ph === 'walk' && k.path?.k === 'ret' && (h.agent(k.id)?.pos.x ?? 0) > cfg.conflictX));
  // fronta: pořadí podle čísla příchodu
  const queued = kids.filter((k) => k.ph === 'queue' || (k.ph === 'walk' && k.next === 'queue')).sort((a, b) => a.qn - b.qn);

  for (const k of kids) {
    const a = h.agent(k.id); if (!a) continue;
    const el = t - k.t0;
    switch (k.ph) {
      case 'walk': {
        const S = pathOf(cam, cfg, k.path!);
        const cur = at(S, k.s);
        // rozestupy: někdo (nebo cizí boby) těsně před dítětem ve směru chůze → počká
        const dir = { X: cur.T.X, Z: cur.T.Z };
        let blocked = false;
        for (const o of kids) {
          if (o === k) continue;
          const op = posOf(o); if (!op) continue;
          for (const [Q, r] of [[op, 1.0], [o.sled.P, 0.75]] as const) {
            const dx = Q.X - cur.P.X, dz = Q.Z - cur.P.Z, dd = Math.hypot(dx, dz, Q.H - cur.P.H);
            if (dd < r && dx * dir.X + dz * dir.Z > 0.25 * dd) blocked = true;
          }
        }
        const steep = Math.max(0, cur.T.H) / Math.max(0.2, Math.hypot(cur.T.X, cur.T.Z));
        const vT = blocked ? 0 : (steep > 0.15 ? HILL.climb + (HILL.walk - HILL.climb) * Math.max(0, 1 - (steep - 0.15) * 2) : HILL.walk) * (0.92 + 0.16 * hashNoise(seed, 8810, kids.indexOf(k)));
        k.v += Math.sign(vT - k.v) * Math.min(Math.abs(vT - k.v), dt * 1.6);
        k.s = Math.min(S.len, k.s + k.v * dt);
        const nx = at(S, k.s), p0 = scr3(cam, cur.P), p1 = scr3(cam, nx.P);
        const moving = Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-3;
        h.place(a, p1, toScreen(cam, nx.P).y - p1.y, moving ? Math.atan2(p1.y - p0.y, p1.x - p0.x) : a.facing, Math.hypot(p1.x - p0.x, p1.y - p0.y) / dt, moving ? Math.atan2(nx.P.Z - cur.P.Z, nx.P.X - cur.P.X) : null);
        if (d3(nx.P, k.trail[k.trail.length - 1]) > 0.05) k.trail.push(nx.P);
        towSled(k);
        a.status = k.path!.k === 'asc' ? 'Táhne boby do kopce' : k.path!.k === 'ret' ? 'Vrací se s boby k výstupu' : 'Jde s boby';
        if (k.s >= S.len - 1e-3) {
          k.v = 0;
          if (k.next === 'asc' && k.path!.k === 'line') { k.path = { k: 'ret', i: k.lane }; k.s = 0; }
          else if (k.next === 'asc') { k.path = { k: 'asc' }; k.s = 0; k.next = 'top'; }
          else if (k.next === 'top') { k.qn = st.qn++; k.next = 'queue'; const q = cfg.queue[Math.min(queued.length, cfg.queue.length - 1)]; k.path = { k: 'line', a: { ...a.pos }, b: { ...q } }; k.s = 0; }
          else if (k.next === 'queue') { k.ph = 'queue'; k.t0 = t; k.wait = 2 + 4 * hashNoise(seed, 8820, k.n * 7 + kids.indexOf(k)); }
          else if (k.next === 'place') { k.ph = 'place'; k.t0 = t; k.from = undefined; }
        }
        break;
      }
      case 'queue': {
        const rank = queued.indexOf(k), spot = cfg.queue[Math.min(rank, cfg.queue.length - 1)];
        a.status = rank === 0 ? 'Čeká na volnou dráhu' : 'Čeká ve frontě na svah';
        h.place(a, a.pos, liftPx(cfg, a.pos.y) , a.facing, 0, null);
        // posun ve frontě
        if (Math.hypot(spot.x - a.pos.x, spot.y - a.pos.y) > 6 && rank >= 0) { k.ph = 'walk'; k.next = 'queue'; k.path = { k: 'line', a: { ...a.pos }, b: { ...spot } }; k.s = 0; break; }
        // pohled dolů na svah (na jezdce)
        const r0 = riding[0] ? h.agent(riding[0].id) : null;
        if (r0 && Math.floor(t * 0.5) !== Math.floor((t - dt) * 0.5)) a.facing = Math.atan2(r0.pos.y - a.pos.y, r0.pos.x - a.pos.x);
        if (rank !== 0 || el < k.wait || t < (cfg.firstDelay ?? 0)) break;
        // výběr dráhy: volná (nikdo na ní) a bez konfliktu na dojezdu; druhá souběžně jen hned po první
        const free = cfg.lanes.map((_, i) => !kids.some((o) => o !== k && o.lane === i && (o.ph === 'ride' || o.ph === 'sit' || o.ph === 'place' || (o.ph === 'walk' && o.next === 'place'))));
        const nRide = riding.length + kids.filter((o) => o.ph === 'walk' && o.next === 'place').length;
        const pairOk = nRide === 1 && t - st.lastLaunch < 2.5 && !kids.some((o) => o.ph === 'getup' || o.ph === 'pick');
        if (!(nRide === 0 && !conflict) && !pairOk) break;
        const li = free.findIndex((f, i) => f && (i === (st.rides % cfg.lanes.length) || !free[st.rides % cfg.lanes.length]));
        if (li < 0) break;
        k.lane = li; st.lastLaunch = t; st.rides++;
        const L = pathOf(cam, cfg, { k: 'lane', i: li }), s0 = at(L, 0.0), hd = Math.atan2(s0.T.Z, s0.T.X);
        const stand = sideSpot(s0.P, hd, 0.45);
        k.ph = 'walk'; k.next = 'place'; k.path = { k: 'line', a: { ...a.pos }, b: scr3(cam, stand) }; k.s = 0;
        h.log(`${a.name} jde k dráze ${li + 1}.`, a.id);
        break;
      }
      case 'place': {
        // položí boby na start dráhy (předklon), příď po svahu
        const L = pathOf(cam, cfg, { k: 'lane', i: k.lane }), s0 = at(L, 0), hd = Math.atan2(s0.T.Z, s0.T.X);
        if (!k.from) { k.from = { x: k.sled.P.X, y: k.sled.P.Z }; k.to = { x: k.sled.P.H, y: k.sled.hd }; }
        const f = smooth(el / 0.9), P0 = { X: k.from.x, Z: k.from.y, H: k.to!.x };
        k.sled.P = lerp3(P0, s0.P, f); k.sled.hd = k.to!.y + angWrap(hd - k.to!.y) * f;
        k.sled.pitch = (s0.T.H / Math.max(0.2, Math.hypot(s0.T.X, s0.T.Z))) * f;
        const w = Math.sin(Math.min(1, el / 0.9) * Math.PI);
        a.anim.sit = w > 0.01 ? { kind: 'bend', t: el, dur: 0.9, w, r: 0.25 } : null;
        a.facing = Math.atan2(scr3(cam, k.sled.P).y - a.pos.y, scr3(cam, k.sled.P).x - a.pos.x);
        h.place(a, a.pos, liftPx(cfg, a.pos.y), a.facing, 0, null);
        a.status = 'Pokládá boby';
        if (el >= 0.9) { a.anim.sit = null; k.ph = 'sit'; k.t0 = t; k.from = { ...a.pos }; k.s = 0; k.v = 0; k.cd = 0.17 + 0.1 * hashNoise(seed, 8830, k.n * 5 + kids.indexOf(k)); k.n++; }
        break;
      }
      case 'sit': {
        const L = pathOf(cam, cfg, { k: 'lane', i: k.lane }), s0 = at(L, 0), hd = Math.atan2(s0.T.Z, s0.T.X);
        const seat = seatOf(cam, k), f = smooth(el / 1.0);
        const p = { x: k.from!.x + (seat.p.x - k.from!.x) * f, y: k.from!.y + (seat.p.y - k.from!.y) * f };
        const dirS = scr3(cam, at(L, 1).P), d0 = scr3(cam, s0.P);
        h.place(a, p, seat.lift * f + liftPx(cfg, k.from!.y) * (1 - f), Math.atan2(dirS.y - d0.y, dirS.x - d0.x), 0, hd);
        a.anim.sit = { kind: 'sled', t: el, dur: 2e9, w: f, r: el > 1.2 ? 0.9 : 0 };
        a.status = 'Sedá si na boby';
        if (el >= 1.5) { k.ph = 'ride'; k.t0 = t; k.v = 0.7; k.acc = 0; h.log(`${a.name} se odrazil(a) a jede z kopce.`, a.id); }
        break;
      }
      case 'ride': {
        const L = pathOf(cam, cfg, { k: 'lane', i: k.lane });
        const cur = at(L, k.s), hz = Math.max(1e-3, Math.hypot(cur.T.X, cur.T.Z));
        const sinT = -cur.T.H, cosT = hz;
        let acc = HILL.g * sinT - HILL.mu * HILL.g * cosT - k.cd * k.v * k.v;
        // dojezd (rovina): brzdění nohama – vždy zastaví před koncem dráhy
        const rem = L.len - k.s, flat = sinT < 0.04 && k.s > L.len * 0.5;
        k.brake = 0;
        if (flat) { const need = (k.v * k.v) / (2 * Math.max(0.15, rem - 0.1)); k.brake = Math.max(1.1, need); acc -= k.brake; }
        const v0 = k.v;
        k.v = Math.max(0, k.v + acc * dt);
        k.s = Math.min(L.len, k.s + k.v * dt);
        const nx = at(L, k.s);
        k.sled.P = nx.P; k.sled.hd = Math.atan2(nx.T.Z, nx.T.X); k.sled.pitch = nx.T.H / Math.max(0.2, Math.hypot(nx.T.X, nx.T.Z)); k.sled.dist += k.v * dt;
        k.acc = (k.acc ?? 0) + (((k.v - v0) / dt) - (k.acc ?? 0)) * 0.08;
        const seat = seatOf(cam, k), prev = a.pos;
        const sp = scr3(cam, nx.P), sq = scr3(cam, at(L, k.s + 0.3).P);
        h.place(a, seat.p, seat.lift, Math.atan2(sq.y - sp.y, sq.x - sp.x), 0, k.sled.hd);
        void prev;
        a.anim.sit = { kind: 'sled', t: el + 1.5, dur: 2e9, w: 1, r: k.brake ? -1.2 : (k.acc ?? 0) };
        a.status = k.brake ? 'Brzdí nohama na dojezdu' : 'Jede z kopce na bobech';
        // sníh od nohou při brzdění
        if (k.brake && k.v > 0.4 && Math.floor(t / 0.12) !== Math.floor((t - dt) / 0.12)) {
          const fr = scr3(cam, { X: nx.P.X + Math.cos(k.sled.hd) * HILL.sledL * 0.55, Z: nx.P.Z + Math.sin(k.sled.hd) * HILL.sledL * 0.55, H: nx.P.H });
          h.puff(fr.x, fr.y, 2 + Math.round(k.v), Math.floor(t * 50) + kids.indexOf(k) * 977);
        }
        if (k.v <= 0.02 && (flat || rem < 0.05 || el > 1.5)) { k.v = 0; k.ph = 'getup'; k.t0 = t; k.from = { ...a.pos }; h.log(`${a.name} zastavil(a) na dojezdu (${(t - k.t0 + el).toFixed(1)} s jízdy).`, a.id); }
        break;
      }
      case 'getup': {
        // vstane z bobů na stranu ke kameře (sed → stoj), boby zůstanou
        const f = smooth(el / 1.1), stand = scr3(cam, sideSpot(k.sled.P, k.sled.hd, 0.42));
        const p = { x: k.from!.x + (stand.x - k.from!.x) * f, y: k.from!.y + (stand.y - k.from!.y) * f };
        h.place(a, p, liftPx(cfg, p.y), a.facing, 0, null);
        a.anim.sit = { kind: 'sled', t: el, dur: 2e9, w: 1 - f, r: 0 };
        a.status = 'Vstává z bobů';
        if (el >= 1.1) { a.anim.sit = null; k.ph = 'pick'; k.t0 = t; }
        break;
      }
      case 'pick': {
        // předkloní se pro šňůru, pak jde zpět (boby za ním)
        const w = Math.sin(Math.min(1, el / 0.8) * Math.PI);
        a.anim.sit = w > 0.01 ? { kind: 'bend', t: el, dur: 0.8, w, r: 0.2 } : null;
        h.place(a, a.pos, liftPx(cfg, a.pos.y), Math.atan2(scr3(cam, k.sled.P).y - a.pos.y, scr3(cam, k.sled.P).x - a.pos.x), 0, null);
        a.status = 'Bere šňůru od bobů';
        if (el >= 0.8) {
          a.anim.sit = null;
          const R = cfg.returns[k.lane], P = hill3(cam, cfg, a.pos);
          k.trail = [k.sled.P, P];
          k.ph = 'walk'; k.next = 'asc'; k.path = { k: 'line', a: { ...a.pos }, b: { ...R[0] } }; k.s = 0; k.v = 0;
        }
        break;
      }
    }
  }
  // rodiče: stojí u dojezdu a sledují jezdce (otočí se jen občas)
  if (cfg.watchers?.length && t >= st.watchT) {
    st.watchT = t + 3 + 3 * hashNoise(seed, 8840, Math.floor(t));
    const r = kids.find((k) => k.ph === 'ride') ?? kids.find((k) => k.ph === 'queue');
    const ra = r ? h.agent(r.id) : null;
    for (const id of cfg.watchers) { const w = h.agent(id); if (w && ra) w.facing = Math.atan2(ra.pos.y - w.pos.y, ra.pos.x - w.pos.x); }
  }
  for (const id of cfg.watchers ?? []) { const w = h.agent(id); if (w) { h.place(w, w.pos, liftPx(cfg, w.pos.y), w.facing, 0, null); w.status = 'Dívá se na děti na svahu'; } }
}

/** místo sedu na bobech (obraz) a lift (px) – sedák kousek za středem */
export function seatOf(cam: Camera, k: HillKid): { p: Vec2; lift: number } {
  const c = Math.cos(k.sled.hd), s = Math.sin(k.sled.hd), back = -0.14;
  const W: World = { X: k.sled.P.X + c * back, Z: k.sled.P.Z + s * back };
  const H = k.sled.P.H + back * k.sled.pitch + 0.03;
  const p = toScreen(cam, W, H), g = toScreen(cam, W);
  return { p: { x: p.x, y: p.y + 0.5 }, lift: g.y - p.y };
}

/** Dítě drží šňůru (jde s boby za sebou)? */
export function towing(k: HillKid): boolean { return k.ph === 'walk' || k.ph === 'queue'; }
