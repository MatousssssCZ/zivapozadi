/**
 * Bobování na svahu (Horské městečko). Svah je namalovaný ve 2D pozadí; pro postavy a boby se
 * z obrazového bodu odvodí jednoduchý terén: pod úpatím (footY) je rovina dojezdu, nad ním nakloněná
 * plocha – obrazová výška se rozdělí na hloubku (posun „země“ jen o část výšky) a skutečnou výšku nad
 * zemí. Měřítko postavy se proto bere z hloubky, ne z obrazového y (děti nahoře nejsou maličké).
 *
 * Cyklus dítěte: fronta nahoře → položení bobů → usednutí → odraz → jízda po dráze podle sklonu
 * (gravitace, tření, odpor, brzdění nohama na dojezdu) → zastavení před chodníkem → vstání →
 * návrat pěšky po dojezdu s boby na šňůře → výstup po vyšlapané cestě → fronta. Bez teleportů.
 * Rezervace po drahách: každé dítě jede svou dráhou (dráhy se nekříží, rozestup ≥ 2,4 m), víc dětí
 * může jet souběžně. Dráha je obsazená, dokud se její jezdec s boby nevzdálí od místa zastavení;
 * návrat vede pod konci všech drah, takže jízdy nekříží.
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
  /** nejvíc souběžných jízd (bez horní meze; výchozí = bez omezení, tj. kolik je drah) */ maxRiding?: number;
  /** počet drah (libovolný): vějíř mezi zadanými drahami `lanes` (výchozí = jejich počet) */ laneCount?: number;
  /** počet dětí (libovolný; víc než `kids` → doplní se klony, méně → jen prvních N) */ kidsN?: number;
  /** děti přicházejí a odcházejí (výchozí zapnuto): průměrně kidsN na svahu, kolísá o ± rozptyl */
  visits?: { enabled?: boolean; interval?: [number, number]; spread?: number };
  /** příchod zpoza levého okraje k úpatí výstupu (obraz); odchod stejnou cestou zpět */ entry?: Vec2[];
  /** počet řad na výstupu (výchozí podle počtu dětí: 1 řada na každých 7 dětí) */ ascentCols?: number;
  /** společná zpáteční cesta pod konci drah (zprava doleva k výstupu) – návraty vygenerovaných drah */ returnLine?: Vec2[];
  colors?: string[]; firstDelay?: number;
  /** podíl návratů, kdy dítě běží (0–1; výchozí 0,4) */ runShare?: number;
  /** násobek rychlosti jízdy (odpor vzduchu a sněhu; výchozí 1) */ rideSpeed?: number;
  /** vypnuto (děti stojí ve frontě) */ paused?: boolean;
}

export type P3 = { X: number; Z: number; H: number };
type PathRef = { k: 'lane' | 'ret' | 'asc' | 'line' | 'enter' | 'exit'; i?: number; a?: Vec2; b?: Vec2 };
export type HillPhase = 'walk' | 'queue' | 'place' | 'sit' | 'ride' | 'getup' | 'pick' | 'off';
export interface HillKid {
  id: string; ph: HillPhase; t0: number; n: number;
  path?: PathRef; s: number; next?: 'queue' | 'place' | 'asc' | 'ascGo' | 'top' | 'off';
  /** po dojetí na dojezd odejde ze scény */ leave?: boolean;
  /** předbíhání: boční posun od osy cesty (m), cíl posunu, koho předbíhá */ lat?: number; latT?: number; passId?: string | null;
  /** řada na schodech (víc dětí jde nahoru vedle sebe) */ col?: number;
  lane: number; v: number; cd: number; qn: number; wait: number;
  /** boby: střed (svět + výška), směr (rad, svět), sklon (dH/dx), ujetá dráha */
  sled: { P: P3; hd: number; pitch: number; dist: number };
  /** stopa dítěte (za ní jedou boby na šňůře) */ trail: P3[];
  /** stání při vstávání / sedání: odkud kam (obraz) */ from?: Vec2; to?: Vec2;
  brake?: number; acc?: number; color: string;
  /** kdy se zařadilo do fronty (posun ve frontě už nečeká celou prodlevu) */ qT?: number;
  /** toto kolo běží (zpátky po dojezdu a kus do kopce) */ runs?: boolean;
  /** jak dlouho čeká za někým (s) – pojistka proti vzájemnému zablokování */ blk?: number;
}
export interface HillState { kids: HillKid[]; lastLaunch: number; qn: number; rides: number; watchT: number; /** příští příchod / odchod */ visitT?: number; visits?: number }

export const HILL = { rope: 1.1, sledL: 1.12, walk: 0.95, climb: 0.62, run: 1.85, runClimb: 1.2, mu: 0.07, g: 9.81 } as const;
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

/**
 * Dráhy pro libovolný počet: vějíř mezi zadanými drahami (po částech lineárně, bod po bodu); při počtu
 * rovném zadaným drahám jsou to přesně ony. Návrat každé dráhy: kousek dolů od místa zastavení a pak
 * po společné zpáteční cestě. Fronta: zadaná místa nahoře, další děti čekají na schodech (viz queueSpot).
 */
export interface HillGeo { lanes: Vec2[][]; returns: Vec2[][]; /** řady výstupu (posunuté do strany o 26 px) */ ascents: Vec2[][] }
const geoCache = new WeakMap<HillConfig, HillGeo>();
export function hillGeo(cfg: HillConfig): HillGeo {
  let g = geoCache.get(cfg); if (g) return g;
  const M = cfg.lanes.length, N = Math.max(1, Math.round(cfg.laneCount ?? M));
  let lanes: Vec2[][], returns: Vec2[][];
  if (N === M) { lanes = cfg.lanes; returns = cfg.returns; }
  else {
    lanes = Array.from({ length: N }, (_, j) => {
      const u = N === 1 ? (M - 1) / 2 : (j / (N - 1)) * (M - 1), i0 = Math.min(M - 1, Math.floor(u)), i1 = Math.min(M - 1, i0 + 1), f = u - i0;
      const A = cfg.lanes[i0], B = cfg.lanes[i1];
      return A.length === B.length ? A.map((p, k) => ({ x: p.x + (B[k].x - p.x) * f, y: p.y + (B[k].y - p.y) * f })) : (f < 0.5 ? A : B);
    });
    const line = cfg.returnLine ?? cfg.returns[0].slice(1);
    returns = lanes.map((L) => { const e = L[L.length - 1]; return [{ x: e.x - 18, y: e.y + 24 }, ...line.filter((q) => q.x < e.x - 60)]; });
  }
  const C = Math.max(1, Math.round(cfg.ascentCols ?? Math.ceil(cfg.kids.length / 7)));
  const ascents = Array.from({ length: C }, (_, c) => { const dx = (c - (C - 1) / 2) * 26; return cfg.ascent.map((q) => ({ x: q.x + dx, y: q.y })); });
  g = { lanes, returns, ascents }; geoCache.set(cfg, g);
  return g;
}

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
  if (!s) { const G = hillGeo(cfg); s = sample(cam, cfg, r.k === 'lane' ? G.lanes[r.i!] : r.k === 'ret' ? G.returns[r.i!] : r.k === 'enter' ? entryPath(cfg) : r.k === 'exit' ? [...entryPath(cfg)].reverse() : G.ascents[r.i ?? 0] ?? cfg.ascent); m.set(key, s); }
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
  const C = hillGeo(cfg).ascents.length, asc = pathOf(cam, cfg, { k: 'asc' }), ret0 = pathOf(cam, cfg, { k: 'ret', i: 0 });
  const nKids = cfg.kids.length, active = Math.min(nKids, Math.round(cfg.kidsN ?? nKids));
  st.visitT = 20; st.visits = 0;
  cfg.kids.forEach((id, i) => {
    const k: HillKid = { id, ph: 'queue', t0: 0, n: 0, s: 0, lane: i % hillGeo(cfg).lanes.length, v: 0, cd: 0.2, qn: 0, wait: 0, sled: { P: { X: 0, Z: 0, H: 0 }, hd: 0, pitch: 0, dist: 0 }, trail: [], color: colors[i % colors.length] };
    // víc dětí: další „vlna“ rozmístění kus vedle (žádné dvě na stejném místě); přebytek čeká ve frontě
    if (i >= active) { k.ph = 'off'; st.kids.push(k); return; } // zatím doma – přijde později
    const slot = i % 6, wave = Math.floor(i / 6);
    const frac = (slot === 2 ? 0.35 : slot === 4 ? 0.75 : 0.55) - 0.11 * wave;
    if (slot === 0 || slot === 1 || slot === 5 || frac < 0.08) { k.ph = 'queue'; k.qn = st.qn++; k.wait = 3 + 4 * hashNoise(seed, 8800, i) + slot * 3; }
    else { k.col = wave % C; k.ph = 'walk'; k.path = slot === 3 ? { k: 'ret', i: 0 } : { k: 'asc', i: k.col }; k.next = slot === 3 ? 'asc' : 'top'; k.lane = 0; k.s = frac * (slot === 3 ? ret0.len : asc.len); }
    st.kids.push(k);
  });
  // polohy: fronta / dráha; boby za dítětem po jeho dráze (stopa)
  for (const k of st.kids) {
    if (k.ph === 'off') { const a = h.agent(k.id); if (a) { a.hidden = true; a.status = 'Doma (přijde bobovat)'; } continue; }
    let P: P3, back: P3;
    if (k.ph === 'queue') { const Q = cfg.queue.length; if (k.qn >= Q) k.col = (k.qn - Q) % C; const q = queueSpot(cam, cfg, k.qn, k.col ?? 0, Math.floor((k.qn - Q) / C)); P = hill3(cam, cfg, q); back = hill3(cam, cfg, { x: q.x - 28, y: q.y + 14 }); }
    else { const S = pathOf(cam, cfg, k.path!); P = at(S, k.s).P; back = at(S, k.s - D_TOW).P; }
    k.trail = [back, P];
    k.sled = { P: back, hd: Math.atan2(P.Z - back.Z, P.X - back.X), pitch: 0, dist: 0 };
    towSled(k, true);
    const a = h.agent(k.id); if (a) { const p = scr3(cam, P); h.place(a, p, toScreen(cam, P).y - p.y, Math.PI / 2, 0, null); a.anim.sit = null; }
  }
  (cfg.watchers ?? []).forEach((id, i) => { const a = h.agent(id), q = cfg.watchSpots?.[i]; if (a && q) h.place(a, q, liftPx(cfg, q.y), -Math.PI / 2 - 0.3, 0, null); });
  return st;
}

/** rozestup fronty na schodech (dítě + boby za ním na šňůře) */
const QGAP = 2.6;
/** příchod: zpoza levého okraje k úpatí výstupu (výchozí po spodním okraji svahu u schodů) */
export function entryPath(cfg: HillConfig): Vec2[] {
  const a0 = cfg.ascent[0];
  return cfg.entry ?? [{ x: -80, y: a0.y + 22 }, { x: 30, y: a0.y + 18 }, { x: a0.x - 50, y: a0.y + 8 }, a0];
}
/** kolik dětí je v zásobě navíc (přicházejí a odcházejí) */
export function visitSpare(cfg: HillConfig, base: number): number {
  if (cfg.visits?.enabled === false) return 0;
  return Math.max(2, Math.round(cfg.visits?.spread ?? Math.ceil(base * 0.3)));
}

/** místo ve frontě: zadaná místa nahoře, další po 2,6 m dolů po schodech (výstupu) */
export function queueSpot(cam: Camera, cfg: HillConfig, rank: number, col = 0, depth = rank - cfg.queue.length): Vec2 {
  if (rank < cfg.queue.length) return cfg.queue[Math.max(0, rank)];
  const A = pathOf(cam, cfg, { k: 'asc', i: col });
  return scr3(cam, at(A, Math.max(0, A.len - QGAP * (depth + 1))).P);
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
  // fronta: pořadí podle čísla příchodu
  const queued = kids.filter((k) => k.ph === 'queue' || (k.ph === 'walk' && k.next === 'queue')).sort((a, b) => a.qn - b.qn);

  // příchody a odchody: počet dětí kolísá kolem průměru (nikdo nezmizí v záběru – odchází a přichází zpoza okraje)
  if (cfg.visits?.enabled !== false && t >= (st.visitT ?? 0) && !cfg.paused) {
    const [i0, i1] = cfg.visits?.interval ?? [30, 75];
    st.visits = (st.visits ?? 0) + 1;
    st.visitT = t + i0 + (i1 - i0) * hashNoise(seed, 8870, st.visits);
    const present = kids.filter((k) => k.ph !== 'off' && !k.leave).length, off = kids.filter((k) => k.ph === 'off');
    const avg = Math.min(kids.length, Math.round(cfg.kidsN ?? kids.length)), sp = Math.max(1, (kids.length - avg) / 2);
    const wantLeave = present > avg - sp && (present >= kids.length || hashNoise(seed, 8871, st.visits) < 0.5 + (present - avg) / (2 * sp + 1));
    if (wantLeave) {
      // odejde dítě, které je zrovna na cestě zpátky (dojelo a vrací se) – nikdo neodchází z jízdy
      const cand = kids.filter((k) => !k.leave && k.ph === 'walk' && k.next === 'asc');
      if (cand.length) { const k = cand[Math.floor(hashNoise(seed, 8872, st.visits) * cand.length) % cand.length]; k.leave = true; const a = h.agent(k.id); if (a) h.log(`${a.name} už půjde domů.`, a.id); }
    } else if (off.length) {
      const k = off[Math.floor(hashNoise(seed, 8873, st.visits) * off.length) % off.length], a = h.agent(k.id);
      if (a) {
        const E = pathOf(cam, cfg, { k: 'enter' }), P0 = E.pts[0], back: P3 = { X: P0.X - 1.8, Z: P0.Z, H: P0.H };
        k.ph = 'walk'; k.path = { k: 'enter' }; k.next = 'asc'; k.s = 0; k.v = 0; k.leave = false; k.lat = 0; k.latT = 0; k.passId = null;
        k.trail = [back, P0]; k.sled = { P: back, hd: 0, pitch: 0, dist: 0 }; k.lane = 0; k.runs = hashNoise(seed, 8874, st.visits) < 0.5;
        const p = scr3(cam, P0); h.place(a, p, toScreen(cam, P0).y - p.y, 0, 0, 0); a.anim.sit = null;
        h.log(`${a.name} přichází bobovat.`, a.id);
      }
    }
  }
  for (const k of kids) {
    const a = h.agent(k.id); if (!a) continue;
    if (k.ph === 'off') { if (!a.hidden) a.hidden = true; continue; }
    const el = t - k.t0;
    switch (k.ph) {
      case 'walk': {
        const S = pathOf(cam, cfg, k.path!);
        const cur = at(S, k.s);
        // rozestupy: někdo (nebo cizí boby) těsně před dítětem ve směru chůze → počká
        const dir = { X: cur.T.X, Z: cur.T.Z };
        // přednost má ten, kdo je na okruhu dál (návrat doleva → výstup → fronta); kdo je za ním, počká.
        // Pojistka: kdo čeká přes 3 s, pomalu pokračuje (žádné věčné zaseknutí).
        let blocked = false, byStanding = false, slowAhead: HillKid | null = null;
        const me = progressOf(cam, cfg, k, a.pos);
        // vlastní rychlost (bez ohledu na ostatní) – kdo je rychlejší, předbíhá pomalejšího bokem
        const steep0 = Math.max(0, cur.T.H) / Math.max(0.2, Math.hypot(cur.T.X, cur.T.Z));
        const run0 = !!k.runs && (k.next === 'asc' || k.next === 'ascGo' || (k.path!.k === 'asc' && k.s < S.len * 0.55));
        const vMine = (run0 ? (steep0 > 0.15 ? HILL.runClimb : HILL.run) : (steep0 > 0.15 ? HILL.climb : HILL.walk)) * (0.92 + 0.16 * hashNoise(seed, 8810, kids.indexOf(k)));
        // kolmice k cestě pro boční posun: ze směru vyhlazeného přes ±0,8 m (v ohybu cesty žádný skok)
        const sA = at(S, k.s - 0.8).P, sB = at(S, k.s + 0.8).P, sm = { X: sB.X - sA.X, Z: sB.Z - sA.Z };
        const hz0 = Math.hypot(dir.X, dir.Z) || 1, hs = Math.hypot(sm.X, sm.Z) || 1, nX = -sm.Z / hs, nZ = sm.X / hs, latNow = k.lat ?? 0;
        const meP = { X: cur.P.X + nX * latNow, Z: cur.P.Z + nZ * latNow, H: cur.P.H };
        for (const o of kids) {
          if (o === k) continue;
          // plošina nahoře (posun ve frontě, cesta ke startu dráhy): děti se obcházejí – čeká se jen na toho,
          // kdo na startu pokládá boby nebo si sedá; ostatní na přecházející nahoře nečekají
          const top = (x: HillKid) => x.ph === 'walk' && x.path?.k === 'line' && (x.next === 'queue' || x.next === 'place');
          const inQ = (x: HillKid) => x.ph === 'queue' || top(x);
          if (top(k) && o.ph !== 'place' && o.ph !== 'sit') continue;
          if (top(o)) continue;
          if (k.next === 'queue' && inQ(o) && k.path?.k === 'line') continue;
          if (o.ph === 'walk' && (o.blk ?? 0) > 0 && progressOf(cam, cfg, o, h.agent(o.id)?.pos ?? a.pos) < me) continue; // stojí za mnou
          const op = posOf(o); if (!op) continue;
          // pomalejší dítě jdoucí stejným směrem (ne fronta): předběhnout bokem, ne čekat
          const sameWay = o.ph === 'walk' && o.next !== 'queue' && o.path?.k !== 'line' && (o.path?.k === k.path?.k || o.next === k.next);
          const passing = k.passId === o.id && Math.abs(latNow) > 0.55;
          for (const [Q, r] of [[op, passing ? 0.45 : 1.0], [o.sled.P, passing ? 0.4 : 0.75]] as const) {
            const dx = Q.X - meP.X, dz = Q.Z - meP.Z, dd = Math.hypot(dx, dz, Q.H - meP.H);
            if (dd < r + 0.6 && dx * dir.X + dz * dir.Z > 0.25 * dd && sameWay && o.v < vMine * 0.88 && !k.passId) slowAhead = o;
            if (dd < r && dx * dir.X + dz * dir.Z > 0.25 * dd) { blocked = true; if (o.ph === 'queue' || (o.ph === 'walk' && o.next === 'queue')) byStanding = true; }
          }
        }
        // předbíhání: vybočit na stranu (dál od předbíhaného), jít vedle něj, po předběhnutí se vrátit na osu
        if (slowAhead && !k.passId && S.len - k.s > 5) { k.passId = slowAhead.id; const op = posOf(slowAhead)!; const side = ((op.X - cur.P.X) * nX + (op.Z - cur.P.Z) * nZ) > 0 ? -1 : 1; k.latT = side * 0.85; h.log(`${a.name} předbíhá.`, a.id); }
        if (k.passId) {
          const o = kids.find((x) => x.id === k.passId), op = o ? posOf(o) : null;
          const along = op ? (op.X - meP.X) * dir.X / hz0 + (op.Z - meP.Z) * dir.Z / hz0 : -9;
          if (!o || o.ph !== 'walk' || along < -1.6 - HILL.rope) { k.passId = null; k.latT = 0; } // je za mnou i s boby
          else if (Math.abs(latNow) < 0.55) { blocked = blocked || (along > 0 && along < 1.0); } // ještě nevybočil: držet odstup
        }
        k.lat = latNow + Math.sign((k.latT ?? 0) - latNow) * Math.min(Math.abs((k.latT ?? 0) - latNow), dt * 0.9);
        k.blk = blocked ? (k.blk ?? 0) + dt : 0;
        const forced = (k.blk ?? 0) > 3 && !byStanding; // do stojící fronty se nikdo neprotlačí
        const steep = Math.max(0, cur.T.H) / Math.max(0.2, Math.hypot(cur.T.X, cur.T.Z));
        // běh: zpátky po dojezdu a první část schodů (pak dítě zvolní do chůze); do kopce pomaleji
        const S0 = pathOf(cam, cfg, k.path!);
        const running = !!k.runs && (k.next === 'asc' || k.next === 'ascGo' || (k.path!.k === 'asc' && k.s < S0.len * 0.55));
        const vWalk = steep > 0.15 ? HILL.climb + (HILL.walk - HILL.climb) * Math.max(0, 1 - (steep - 0.15) * 2) : HILL.walk;
        const vRun = steep > 0.15 ? HILL.runClimb + (HILL.run - HILL.runClimb) * Math.max(0, 1 - (steep - 0.15) * 2) : HILL.run;
        const vT = blocked && !forced ? 0 : (forced ? 0.45 : 1) * (running ? vRun : vWalk) * (0.92 + 0.16 * hashNoise(seed, 8810, kids.indexOf(k)));
        a.anim.run = Math.max(0, Math.min(1, (a.anim.run ?? 0) + (running && k.v > 1.1 ? dt / 0.5 : -dt / 0.6)));
        k.v += Math.sign(vT - k.v) * Math.min(Math.abs(vT - k.v), dt * (running ? 2.2 : 1.6));
        const sPrev = k.s;
        k.s = Math.min(S.len, k.s + k.v * dt);
        const laStep = k.lat ?? 0; // posun pro tento krok (zařazení do fronty ho dál nuluje)
        // plná fronta nahoře: dítě se zařadí na schodech (konec fronty)
        if (k.path!.k === 'asc' && queued.length >= cfg.queue.length) {
          const inCol = queued.slice(cfg.queue.length).filter((o) => (o.col ?? 0) === (k.col ?? 0)).length;
          const sTail = S.len - QGAP * (inCol + 1);
          if (k.s >= sTail) { k.s = Math.max(sPrev, Math.min(k.s, sTail)); k.v = 0; k.qn = st.qn++; k.ph = 'queue'; k.lat = 0; k.latT = 0; k.passId = null; /* poloha už boční posun obsahuje – dál se počítá od ní */ k.t0 = t; k.wait = 2 + 4 * hashNoise(seed, 8820, k.n * 7 + kids.indexOf(k)); queued.push(k); }
        }
        const nx0 = at(S, k.s), la = laStep, offP = (P: P3, la2: number): P3 => ({ X: P.X + nX * la2, Z: P.Z + nZ * la2, H: P.H });
        const nx = { P: offP(nx0.P, la), T: nx0.T }, p0 = scr3(cam, meP), p1 = scr3(cam, nx.P);
        const moving = Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-3;
        h.place(a, p1, toScreen(cam, nx.P).y - p1.y, moving ? Math.atan2(p1.y - p0.y, p1.x - p0.x) : a.facing, Math.hypot(p1.x - p0.x, p1.y - p0.y) / dt, moving ? Math.atan2(nx.P.Z - meP.Z, nx.P.X - meP.X) : null);
        if (d3(nx.P, k.trail[k.trail.length - 1]) > 0.05) k.trail.push(nx.P);
        towSled(k);
        if (k.path!.k === 'enter') a.status = 'Přichází bobovat'; else if (k.path!.k === 'exit') a.status = 'Odchází domů s boby'; else if (k.passId) a.status = 'Předbíhá pomalejší dítě'; else
        a.status = running && k.v > 1.1 ? (k.path!.k === 'asc' ? 'Běží s boby do kopce' : 'Běží s boby zpátky k výstupu') : k.path!.k === 'asc' ? 'Táhne boby do kopce' : k.path!.k === 'ret' ? 'Vrací se s boby k výstupu' : 'Jde s boby';
        // konec cesty během předbíhání: nejdřív zpět na osu (další cesta má jiný směr – bez skoku)
        if (k.s >= S.len - 1e-3 && Math.abs(k.lat ?? 0) > 0.02) { k.latT = 0; k.passId = null; k.s = S.len; k.v = 0; break; }
        if (k.s >= S.len - 1e-3) {
          k.v = 0;
          if (k.next === 'off') { k.ph = 'off'; k.path = undefined; k.leave = false; k.passId = null; k.lat = 0; a.hidden = true; a.status = 'Doma (přijde bobovat)'; h.log(`${a.name} odešel/odešla domů.`, a.id); break; }
          if (k.next === 'asc' && k.path!.k === 'line') { k.path = { k: 'ret', i: k.lane }; k.s = 0; }
          else if (k.next === 'asc' && k.leave && k.path!.k === 'ret') { k.path = { k: 'exit' }; k.next = 'off'; k.s = 0; k.lat = 0; k.latT = 0; k.passId = null; }
          else if (k.next === 'asc') {
            // řada výstupu s nejmenším počtem dětí (na schodech i ve frontě v té řadě); přechod do ní bez skoku
            const G = hillGeo(cfg), cnt = G.ascents.map((_, c) => kids.filter((o) => o !== k && (o.col ?? 0) === c && ((o.ph === 'walk' && (o.path?.k === 'asc' || o.next === 'ascGo')) || (o.ph === 'queue' && queued.indexOf(o) >= cfg.queue.length))).length);
            k.col = cnt.indexOf(Math.min(...cnt));
            const st0 = G.ascents[k.col][0];
            if (Math.hypot(st0.x - a.pos.x, st0.y - a.pos.y) > 3) { k.path = { k: 'line', a: { ...a.pos }, b: { ...st0 } }; k.next = 'ascGo'; }
            else { k.path = { k: 'asc', i: k.col }; k.next = 'top'; }
            k.s = 0;
          }
          else if (k.next === 'ascGo') { k.path = { k: 'asc', i: k.col ?? 0 }; k.s = 0; k.next = 'top'; }
          else if (k.next === 'top') { k.qn = st.qn++; k.next = 'queue'; const q = queueSpot(cam, cfg, queued.length); k.path = { k: 'line', a: { ...a.pos }, b: { ...q } }; k.s = 0; }
          else if (k.next === 'queue') { const shift = k.ph === 'walk' && k.path!.k === 'line' && (k.qT ?? -1) >= 0; k.ph = 'queue'; k.t0 = t; k.wait = shift ? 0.4 : 2 + 4 * hashNoise(seed, 8820, k.n * 7 + kids.indexOf(k)); k.qT = t; }
          else if (k.next === 'place') { k.ph = 'place'; k.t0 = t; k.from = undefined; }
        }
        break;
      }
      case 'queue': {
        const rank = queued.indexOf(k), Qn = cfg.queue.length, spot = queueSpot(cam, cfg, rank, k.col ?? 0, rank >= Qn ? queued.slice(Qn, rank).filter((o) => (o.col ?? 0) === (k.col ?? 0)).length : 0);
        a.status = rank < cfg.queue.length ? 'Čeká na volnou dráhu' : 'Čeká ve frontě na schodech';
        h.place(a, a.pos, liftPx(cfg, a.pos.y) , a.facing, 0, null);
        // posun ve frontě
        if (Math.hypot(spot.x - a.pos.x, spot.y - a.pos.y) > 6 && rank >= 0) { k.qT = k.qT ?? t; k.ph = 'walk'; k.next = 'queue'; k.path = { k: 'line', a: { ...a.pos }, b: { ...spot } }; k.s = 0; break; }
        // pohled dolů na svah (na jezdce)
        const r0 = riding[0] ? h.agent(riding[0].id) : null;
        if (r0 && Math.floor(t * 0.5) !== Math.floor((t - dt) * 0.5)) a.facing = Math.atan2(r0.pos.y - a.pos.y, r0.pos.x - a.pos.x);
        // vyjet smí kdokoli, kdo stojí nahoře na plošině (ne na schodech – nešel by přes svah), je-li volná dráha
        if (rank < 0 || rank >= cfg.queue.length || el < k.wait || t < (cfg.firstDelay ?? 0) || cfg.paused) break;
        // každé dítě má vlastní dráhu: dráha je obsazená od cesty ke startu přes jízdu, vstávání a sebrání
        // šňůry, dokud se dítě s boby nevzdálí ~3 m od místa zastavení. Víc dětí může jet souběžně (každé
        // po své dráze); mezi výjezdy aspoň 1 s, ať se nerozjedou jako na povel.
        const laneBusy = (i: number) => kids.some((o) => o !== k && o.lane === i && (o.ph === 'place' || o.ph === 'sit' || o.ph === 'ride' || o.ph === 'getup' || o.ph === 'pick' ||
          (o.ph === 'walk' && (o.next === 'place' || (o.next === 'asc' && (o.path?.k === 'line' || (o.path?.k === 'ret' && o.s < 3)))))));
        const nRide = kids.filter((o) => o.ph === 'ride' || o.ph === 'sit' || o.ph === 'place' || (o.ph === 'walk' && o.next === 'place')).length;
        if ((cfg.maxRiding && nRide >= cfg.maxRiding) || t - st.lastLaunch < 1) break;
        const freeL = hillGeo(cfg).lanes.map((_, i) => i).filter((i) => !laneBusy(i));
        if (!freeL.length) break;
        const li = freeL[Math.floor(hashNoise(seed, 8850, st.rides) * freeL.length) % freeL.length];
        k.lane = li; st.lastLaunch = t; st.rides++; k.qT = undefined;
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
        const rs = Math.max(0.2, cfg.rideSpeed ?? 1);
        let acc = HILL.g * sinT - HILL.mu * HILL.g * cosT - (k.cd / (rs * rs)) * k.v * k.v;
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
          const R = hillGeo(cfg).returns[k.lane], P = hill3(cam, cfg, a.pos);
          k.trail = [k.sled.P, P];
          k.ph = 'walk'; k.next = 'asc'; k.path = { k: 'line', a: { ...a.pos }, b: { ...R[0] } }; k.s = 0; k.v = 0;
          k.runs = hashNoise(seed, 8860, k.n * 13 + kids.indexOf(k)) < (cfg.runShare ?? 0.4);
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

/** jak daleko je dítě na okruhu (větší = dál): návrat (doleva) < výstup < fronta / cesta ke startu */
function progressOf(cam: Camera, cfg: HillConfig, k: HillKid, p: Vec2): number {
  void cam; void cfg;
  if (k.ph !== 'walk') return 1e5;
  if (k.next === 'asc') return 2000 - p.x;
  if (k.next === 'ascGo') return 2500;
  if (k.next === 'off') return 2000 - p.x;        // z dojezdu k výstupu: čím víc vlevo, tím dál
  if (k.next === 'top') return 4000 - p.y;        // po schodech nahoru
  return 8000 + p.x;                              // fronta / cesta ke startu dráhy
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
