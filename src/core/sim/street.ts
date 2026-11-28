/**
 * Doprava v Zasněžené ulici: dvoupruhová silnice s pravostrannou dopravou (bližší pruh zleva doprava,
 * vzdálenější zprava doleva), vodorovné trasy (auto po délce ulice nemění velikost). Řízení podle vozidla
 * vpředu (plynulý rozjezd i brzdění, rozestup roste s rychlostí), krátké mezery mezi auty – žádná kolona.
 * Parkování: zaparkovaná auta mají vlastní stav sněhu; přijíždějící auto si rezervuje volné místo,
 * zpomalí, bliká a zaparkuje skutečným manévrem (plynulý přejezd z pruhu k obrubníku a dobrzdění).
 * Kola se otáčí podle ujeté dráhy. Vše deterministické (seed projektu), stav v SimState.street.
 */
import type { ProjectFile } from '../model/types';
import { cameraFor, toWorld, toScreen, Q, type Camera } from '../scene/camera';
import { depthScaleAt } from '../scene/geometry';
import { hashNoise } from '../math/rng';
import { SIM_DT } from './types';
import { carGeo, newCarSnow, CAR_COLORS, type CarBody, type CarSnow } from '../render/car3d';
import { tractorScale } from '../render/tractor3d';

export interface StreetConfig {
  /** pruhy (y obrazu středu pruhu, směr jízdy +1 = doprava) */ lanes: { y: number; dir: 1 | -1 }[];
  /** parkovací pásy: y středu, rozsah x (obraz), ke kterému pruhu patří (auto z něj zajíždí) */
  parks: { y: number; x0: number; x1: number; lane: number }[];
  /** mezery mezi auty v pruhu (s), rychlost (m/s), podíl aut, která zaparkují */ gap?: [number, number]; speed?: number; parkShare?: number;
  /** počáteční zaparkovaná auta (počet v každém pásu) */ parkedInit?: number[];
  /** násobek sněžení na autech (přibývání) */ snowRate?: number;
  /** postavy majitelů (routine „driver“) a interval odjezdů (s) */ owners?: string[]; departEvery?: [number, number];
}
export type CarMode = 'drive' | 'parkIn' | 'parked' | 'pullOut';
export interface Car {
  id: number; body: CarBody; color: string;
  /** svět: X podél ulice, Z do hloubky; směr (rad); rychlost (m/s) */ X: number; Z: number; hd: number; v: number;
  lane: number; mode: CarMode; dist: number; snow: CarSnow;
  /** parkování: pás, cílové X, začátek manévru (X), čas zastavení */ park?: number; tX?: number; sX?: number; since?: number;
  blink: number; brake: boolean; door?: number;
  /** hromádka smetaného sníh vedle auta (0–1) u chodníku / u silnice */ pile?: { kerb: number; road: number };
  /** řidič sedí uvnitř (id postavy) */ driver?: string;
  /** právě zaparkovalo – řidič vystoupí */ justParked?: boolean;
}
export interface StreetState { cars: Car[]; nextId: number; spawnT: number[]; n: number; /** majitelé u aut (odjezd / příjezd) */ jobs?: import('./carOwners').OwnerJob[]; departT?: number; departN?: number }

const G = (c: Car) => carGeo(c.body);
/** měřítko modelu (shodné s postavami) v hloubce Z */
export function carScale(cam: Camera, project: ProjectFile, X: number, Z: number): number {
  const P = { X, Z }, y = toScreen(cam, P).y, ppm = depthScaleAt(project.scene.depth, y) / Q;
  return tractorScale(cam, P, ppm);
}
const laneZ = (cam: Camera, y: number) => toWorld(cam, { x: 960, y }).Z;
const xToX = (cam: Camera, x: number, y: number) => toWorld(cam, { x, y }).X;

export function initStreet(project: ProjectFile): StreetState {
  const cfg = project.street!, cam = cameraFor(project.scene), seed = project.seed;
  const st: StreetState = { cars: [], nextId: 1, spawnT: cfg.lanes.map((_, i) => 2 + 6 * hashNoise(seed, 9600, i)), n: 0 };
  // zaparkovaná auta: méně, než ukazuje malované značení, s respektem k rozměrům (rozestup ≥ 1,6 m)
  cfg.parks.forEach((pk, pi) => {
    const want = cfg.parkedInit?.[pi] ?? 3, Z = laneZ(cam, pk.y), X0 = xToX(cam, pk.x0, pk.y), X1 = xToX(cam, pk.x1, pk.y);
    let X = X0;
    for (let i = 0; i < want; i++) {
      const body = (['sedan', 'hatch', 'wagon'] as CarBody[])[Math.floor(hashNoise(seed, 9610, pi * 10 + i) * 3)];
      const k = carScale(cam, project, X, Z), L = carGeo(body).L * k;
      X += 0.8 + (3 + 9 * hashNoise(seed, 9611, pi * 10 + i)) + L / 2;
      if (X + L / 2 > X1) break;
      const dir = cfg.lanes[pk.lane].dir;
      st.cars.push({ id: st.nextId++, body, color: CAR_COLORS[Math.floor(hashNoise(seed, 9612, pi * 10 + i) * CAR_COLORS.length)], X, Z, hd: dir > 0 ? 0 : Math.PI, v: 0, lane: pk.lane, mode: 'parked', park: pi, dist: 0, snow: newCarSnow(0.55 + 0.45 * hashNoise(seed, 9613, pi * 10 + i)), blink: 0, brake: false, since: -1e4 });
      X += L / 2;
    }
  });
  return st;
}

/** volné místo v pásu pro auto délky L (m): střed, nebo null; místo pro manévr = L + 3,2 m */
function freeSpot(cam: Camera, project: ProjectFile, st: StreetState, pi: number, L: number, nearX: number): number | null {
  const cfg = project.street!, pk = cfg.parks[pi], X0 = xToX(cam, pk.x0, pk.y), X1 = xToX(cam, pk.x1, pk.y);
  const occ = st.cars.filter((c) => c.park === pi && c.mode !== 'drive').map((c) => { const k = carScale(cam, project, c.X, c.Z), l = G(c).L * k; return [c.mode === 'parkIn' ? c.tX! - l / 2 : c.X - l / 2, c.mode === 'parkIn' ? c.tX! + l / 2 : c.X + l / 2] as [number, number]; }).sort((a, b) => a[0] - b[0]);
  const need = L + 3.2, gaps: [number, number][] = [];
  let x = X0; for (const [a, b] of occ) { if (a - x >= need) gaps.push([x, a]); x = Math.max(x, b); } if (X1 - x >= need) gaps.push([x, X1]);
  // nejbližší mezera před autem (ve směru jízdy) – aby stihlo plynule zpomalit
  const dir = cfg.lanes[pk.lane].dir, ok = gaps.filter(([a, b]) => dir > 0 ? (a + b) / 2 > nearX + 14 : (a + b) / 2 < nearX - 14);
  if (!ok.length) return null;
  const g = ok.sort((p, q) => Math.abs((p[0] + p[1]) / 2 - nearX) - Math.abs((q[0] + q[1]) / 2 - nearX))[0];
  // zaparkovat blíž k přední hraně mezery (nechat místo za sebou)
  return dir > 0 ? Math.min(g[1] - L / 2 - 1.0, g[0] + L / 2 + 2.6) : Math.max(g[0] + L / 2 + 1.0, g[1] - L / 2 - 2.6);
}

/** překážka v pruhu (člověk u auta na straně silnice, otevřené dveře): auta před ní zastaví */
export interface LaneBlock { lane: number; X: number }
export function stepStreet(project: ProjectFile, st: StreetState, t: number, log: (m: string) => void, blocks: LaneBlock[] = []): void {
  const cfg = project.street!, cam = cameraFor(project.scene), seed = project.seed, dt = SIM_DT;
  const v0 = cfg.speed ?? 7.5;
  const W = project.scene.width;
  // sněžení: na stojících autech pomalu přibývá sníh (jen při aktivním sněžení)
  if (project.scene.snowfall?.enabled && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
    const k = (cfg.snowRate ?? 1) * 0.5 / 1500;
    for (const c of st.cars) if (c.mode === 'parked') for (const key of ['roof', 'hood', 'trunk', 'ws', 'rw'] as const) c.snow[key] = c.snow[key].map((v) => Math.min(1, v + k));
  }
  // nová auta: krátké mezery, ne kolona (pruh musí být u vjezdu volný)
  cfg.lanes.forEach((ln, li) => {
    if (t < st.spawnT[li]) return;
    const [g0, g1] = cfg.gap ?? [6, 22];
    st.n++;
    st.spawnT[li] = t + g0 + (g1 - g0) * hashNoise(seed, 9620, st.n);
    const Z = laneZ(cam, ln.y), xs = ln.dir > 0 ? -1300 : W + 1300, X = xToX(cam, xs, ln.y); // vjezd daleko za okrajem: rozjetí i případné brzdění k parkování mimo záběr
    if (st.cars.some((c) => c.lane === li && c.mode !== 'parked' && Math.abs(c.X - X) < 14)) return; // vjezd obsazený – příště
    const body = (['sedan', 'hatch', 'wagon'] as CarBody[])[Math.floor(hashNoise(seed, 9621, st.n) * 3)];
    const car: Car = { id: st.nextId++, body, color: CAR_COLORS[Math.floor(hashNoise(seed, 9622, st.n) * CAR_COLORS.length)], X, Z, hd: ln.dir > 0 ? 0 : Math.PI, v: v0 * 0.9, lane: li, mode: 'drive', dist: 0, snow: newCarSnow(0.15 * hashNoise(seed, 9623, st.n), 0.25 * hashNoise(seed, 9624, st.n)), blink: 0, brake: false };
    // část aut zaparkuje: rezervace volného místa v pásu tohoto pruhu
    const pi = cfg.parks.findIndex((p) => p.lane === li);
    if (pi >= 0 && hashNoise(seed, 9625, st.n) < (cfg.parkShare ?? 0.25)) {
      const k = carScale(cam, project, X, laneZ(cam, cfg.parks[pi].y)), tX = freeSpot(cam, project, st, pi, carGeo(body).L * k, X);
      if (tX !== null) { car.park = pi; car.tX = tX; car.mode = 'parkIn'; car.sX = tX - ln.dir * (7.5 + carGeo(body).L * k); }
    }
    st.cars.push(car);
  });
  // jízda: podle vozidla vpředu (IDM), parkovací manévr, výjezd
  const lead = (c: Car): { gap: number; v: number } => {
    let best = { gap: 1e9, v: 99 };
    const dir = cfg.lanes[c.lane].dir, kc = carScale(cam, project, c.X, c.Z), Lc = G(c).L * kc;
    for (const o of st.cars) {
      if (o === c || o.mode === 'parked' || o.lane !== c.lane) continue;
      // auto čekající u obrubníku na výjezd pruh neblokuje (vyjede až do mezery)
      if (o.mode === 'pullOut' && o.sX === undefined) continue;
      // auto, které už zajelo k obrubníku (víc než z půlky), pruh neblokuje
      if (o.mode === 'parkIn' && Math.abs(o.Z - laneZ(cam, cfg.lanes[o.lane].y)) > 0.6 * Math.abs(laneZ(cam, cfg.parks[o.park!].y) - laneZ(cam, cfg.lanes[o.lane].y))) continue;
      const d = (o.X - c.X) * dir; if (d <= 0) continue;
      const ko = carScale(cam, project, o.X, o.Z), g = d - (Lc + G(o).L * ko) / 2;
      if (g < best.gap) best = { gap: g, v: o.v };
    }
    for (const b of blocks) { if (b.lane !== c.lane) continue; const d = (b.X - c.X) * dir - Lc / 2 - 1.2; if (d > -Lc && d < best.gap) best = { gap: Math.max(0.1, d), v: 0 }; }
    return best;
  };
  for (const c of st.cars) {
    if (c.mode === 'parked') { c.v = 0; c.brake = false; continue; }
    if (c.mode === 'pullOut' && c.sX === undefined) {
      // výjezd z parkování: blinkr, čekat na mezeru v pruhu (nic blízko za ani těsně před)
      const ln = cfg.lanes[c.lane], dir = ln.dir;
      const clear = !st.cars.some((o) => o !== c && o.lane === c.lane && (o.mode === 'drive' || o.mode === 'parkIn') && ((c.X - o.X) * dir > -9 && (c.X - o.X) * dir < 38));
      c.blink = 1; c.brake = true; c.v = 0;
      if (clear && t - (c.since ?? t) > 1.2) { c.sX = c.X; c.tX = c.X + dir * 8.5; c.brake = false; log('Auto vyjíždí z parkování.'); }
      continue;
    }
    const ln = cfg.lanes[c.lane], dir = ln.dir, Zl = laneZ(cam, ln.y);
    let vDes = v0 * (0.92 + 0.16 * hashNoise(seed, 9630, c.id));
    // parkování: zpomalit k místu, blikat
    if (c.mode === 'pullOut') vDes = Math.min(vDes, 2.5 + 2.5 * Math.max(0, (c.X - c.sX!) * dir) / 8.5); // rozjezd z místa
    if (c.mode === 'parkIn') {
      const toS = (c.sX! - c.X) * dir, toT = (c.tX! - c.X) * dir;
      if (toS < 30) c.blink = dir > 0 ? -1 : -1; // blinkr ke krajnici (vpravo)
      vDes = Math.min(vDes, Math.sqrt(2 * 0.8 * Math.max(0, toT)) + (toT > 1.5 ? 0.6 : 0)); // brzdná křivka až k místu (≤ 0,8 m/s²)
    }
    const L = lead(c), s0 = 3.0, Tg = 1.2, a0 = 1.4, b0 = 2.2;
    const sStar = s0 + Math.max(0, c.v * Tg + (c.v * (c.v - L.v)) / (2 * Math.sqrt(a0 * b0)));
    let acc = a0 * (1 - Math.pow(c.v / Math.max(0.1, vDes), 4) - Math.pow(sStar / Math.max(0.5, L.gap), 2));
    acc = Math.max(-5, Math.min(a0, acc));
    // parkování: plynulé sledování brzdné křivky (ne prudké IDM) – jen auto vpředu může přibrzdit víc
    if (c.mode === 'parkIn') {
      // brzdná dráha přesně k místu: potřebné zpomalení v²/(2·s); jinak plynulé sledování křivky
      const toT = (c.tX! - c.X) * dir, need = (c.v * c.v) / (2 * Math.max(0.05, toT));
      acc = need > 0.55 ? -Math.min(3, need) : Math.max(-2.2, Math.min(a0, (vDes - c.v) * 1.2));
      if (L.gap < 12) acc = Math.min(acc, Math.max(-5, a0 * (1 - Math.pow(sStar / Math.max(0.5, L.gap), 2))));
    }
    const vPrev = c.v;
    c.v = Math.max(0, c.v + acc * dt);
    c.brake = c.v < vPrev - 0.4 * dt || (c.mode === 'parkIn' && (c.tX! - c.X) * dir < 8);
    c.X += dir * c.v * dt; c.dist += c.v * dt;
    if (c.mode === 'pullOut') {
      // výjezd: plynulý přejezd od obrubníku do pruhu po S-křivce, pak běžná jízda
      const Zp = laneZ(cam, cfg.parks[c.park!].y), f = Math.max(0, Math.min(1, ((c.X - c.sX!) * dir) / Math.max(1, (c.tX! - c.sX!) * dir)));
      const sm = f * f * (3 - 2 * f), dsm = 6 * f * (1 - f) / Math.max(1, Math.abs(c.tX! - c.sX!));
      c.Z = Zp + (Zl - Zp) * sm; c.hd = Math.atan2((Zl - Zp) * dsm, dir);
      if (f >= 1) { c.mode = 'drive'; c.park = undefined; c.blink = 0; c.Z = Zl; c.hd = dir > 0 ? 0 : Math.PI; c.sX = c.tX = undefined; }
    } else if (c.mode === 'parkIn') {
      // plynulý přejezd k obrubníku po S-křivce mezi sX a tX (směr auta sleduje tečnu)
      const Zp = laneZ(cam, cfg.parks[c.park!].y), f = Math.max(0, Math.min(1, ((c.X - c.sX!) * dir) / Math.max(1, (c.tX! - c.sX!) * dir)));
      const sm = f * f * (3 - 2 * f), dsm = 6 * f * (1 - f) / Math.max(1, Math.abs(c.tX! - c.sX!));
      c.Z = Zl + (Zp - Zl) * sm;
      c.hd = Math.atan2((Zp - Zl) * dsm * 1, dir) ;
      // dojezd na místo: zbytek rychlosti se dobrzdí měkce (≤ 2,5 m/s²), auto zůstane stát přesně na místě
      if ((c.tX! - c.X) * dir <= 0.05) { c.X = c.tX!; c.v = Math.max(0, c.v - 2.2 * dt); c.brake = true; }
      if (((c.tX! - c.X) * dir <= 0.05 && c.v <= 0) || (f > 0.98 && c.v < 0.02)) { c.X = c.tX!; c.Z = Zp; c.hd = dir > 0 ? 0 : Math.PI; c.v = 0; c.mode = 'parked'; c.blink = 0; c.brake = false; c.since = t; c.justParked = true; log(`Auto zaparkovalo (${c.body}).`); }
    } else { c.Z = Zl; c.hd = dir > 0 ? 0 : Math.PI; }
  }
  // za okrajem scény auto zmizí (mimo záběr)
  st.cars = st.cars.filter((c) => { if (c.mode !== 'drive') return true; const x = toScreen(cam, { X: c.X, Z: c.Z }).x; return dirOk(c, x); });
  function dirOk(c: Car, x: number) { const d = cfg.lanes[c.lane].dir; return d > 0 ? x < W + 420 : x > -420; }
}
