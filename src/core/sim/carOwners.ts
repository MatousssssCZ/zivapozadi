/**
 * Majitelé zaparkovaných aut (Zasněžená ulice).
 *
 * Odjezd: majitel přijde po chodníku (zpoza okraje), prohlédne auto, vezme smeták a postupně obchází
 * dostupná stanoviště (strana u chodníku vzadu a vpředu, čelo, strana do silnice vpředu a vzadu, záď).
 * Z každého stanoviště dosáhne jen na svou část vozu (polovina střechy, svá okna, kapota / kufr) –
 * nikdy přes celé auto. Tahy smetákem: kartáč se dotýká povrchu jen v dopředné části tahu a sníh ubývá
 * jen v buňce, které se dotkl; shluky padají dolů a malá část přibude k hromádce vedle auta.
 * Pak smeták uloží, otevře dveře, nastoupí (karoserie ho zakrývá – vidět jen otvorem dveří a skly),
 * zavře, rozhlédne se a vyjede, až je v pruhu dostatečná mezera (blinkr, plynulý výjezd).
 * Silně zasněžené auto neodjede s neprůhledným čelním sklem ani s čepicí sněhu na střeše.
 *
 * Příjezd: po zaparkování řidič vystoupí (dveře, otvor), zavře a odejde po chodníku za okraj.
 * Stojí-li člověk na straně silnice nebo jsou otevřené dveře, auta v pruhu před ním zastaví.
 */
import type { Vec2 } from '../math/vec';
import type { AgentState } from './types';
import { SIM_DT } from './types';
import type { ProjectFile } from '../model/types';
import { cameraFor, toScreen, toWorld, type Camera } from '../scene/camera';
import { hashNoise } from '../math/rng';
import { carGeo, type CarSnow } from '../render/car3d';
import { carScale, type Car, type StreetState } from './street';

export type OwnerPhase = 'come' | 'inspect' | 'toStop' | 'brush' | 'toDoor' | 'stow' | 'doorOpen' | 'enter' | 'doorClose' | 'look' | 'drive' | 'exitCar' | 'leave';
export interface OwnerJob {
  car: number; owner: string; kind: 'depart' | 'arrive'; ph: OwnerPhase; t0: number;
  /** pořadí stanovišť ometání a aktuální index */ stops: number[]; si: number;
}
export interface StreetHost {
  project: ProjectFile; time(): number;
  agent(id: string): AgentState | undefined;
  walk(a: AgentState, pts: Vec2[], speed: number): void;
  moving(a: AgentState): boolean;
  equip(a: AgentState, item: 'broom' | null): void;
  show(a: AgentState, p: Vec2): void; hide(a: AgentState): void;
  puff(x: number, y: number, n: number, seed: number): void;
  log(m: string, id?: string): void;
}

/** stanoviště kolem auta: lokální poloha (x podél auta, strana z: −1 chodník, +1 silnice, 0 = čelo/záď) a dosah */
const STOPS: { x: number; z: number; reach: (keyof CarSnow)[]; part: [number, number] }[] = [
  { x: -0.25, z: -1, reach: ['roof', 'winR', 'trunk', 'rw'], part: [0.5, 1] }, // u chodníku vzadu
  { x: 0.25, z: -1, reach: ['roof', 'winR', 'hood', 'ws'], part: [0, 0.5] },   // u chodníku vpředu
  { x: 0.62, z: 0, reach: ['hood', 'ws'], part: [0, 1] },                       // čelo
  { x: 0.25, z: 1, reach: ['roof', 'winL', 'ws', 'hood'], part: [0, 0.5] },     // silnice vpředu
  { x: -0.25, z: 1, reach: ['roof', 'winL', 'rw', 'trunk'], part: [0.5, 1] },   // silnice vzadu
  { x: -0.62, z: 0, reach: ['trunk', 'rw'], part: [0, 1] },                     // záď
];
/** z chodníku: vzad → vpřed → čelo → silnice vpředu → vzadu → záď (obchází auto, nepřesahuje přes něj) */
const ORDER = [0, 1, 2, 3, 4, 5];

/** lokální bod auta (x, z v m modelu, h) → svět / obraz */
export function carLocal(cam: Camera, c: Car, k: number, x: number, z: number, h = 0) {
  const cs = Math.cos(c.hd), sn = Math.sin(c.hd), X = c.X + (x * cs - z * sn) * k, Z = c.Z + (x * sn + z * cs) * k;
  return { X, Z, H: h * k, s: toScreen(cam, { X, Z }, h * k), g: toScreen(cam, { X, Z }) };
}
/** strana silnice v lokálních z: řidič vlevo (z > 0) = strana do pruhu */
const ROAD = 1, KERB = -1;

/** množství sněhu, které brání odjezdu (čelní sklo, střecha) */
export function mustClean(sn: CarSnow): boolean { return Math.max(...sn.ws) > 0.15 || Math.max(...sn.roof) > 0.35 || Math.max(...sn.rw) > 0.4; }

export function stepOwners(h: StreetHost, st: StreetState, jobs: OwnerJob[], t: number): OwnerJob[] {
  const p = h.project, cam = cameraFor(p.scene), dt = SIM_DT, seed = p.seed;
  const out: OwnerJob[] = [];
  for (const j of jobs) {
    const c = st.cars.find((x) => x.id === j.car), a = h.agent(j.owner);
    if (!c || !a) { if (a) h.hide(a); continue; }
    const g = carGeo(c.body), k = carScale(cam, p, c.X, c.Z), L = g.L, W = g.zB, el = t - j.t0;
    const at = (x: number, z: number) => carLocal(cam, c, k, x, z).g;
    const stopPt = (i: number) => { const S = STOPS[i]; return S.z === 0 ? at(S.x * (L + 1.2), 0) : at(S.x * L, S.z * (W + 0.55)); };
    const doorPt = at(g.wsBase[0] - 0.55, ROAD * (W + 0.5));
    const face = (q: Vec2) => { a.facing = Math.atan2(q.y - a.pos.y, q.x - a.pos.x); };
    const go = (ph: OwnerPhase) => { j.ph = ph; j.t0 = t; };
    switch (j.ph) {
      case 'come': { a.status = 'Jde k autu'; if (!h.moving(a)) go('inspect'); break; }
      case 'inspect': {
        a.status = 'Prohlíží zasněžené auto'; face(at(0, 0));
        if (el > 2.2) {
          // čisté auto: rovnou k dveřím; jinak smeták a stanoviště podle toho, kde je sníh
          if (!Object.values(c.snow).some((arr: number[]) => arr.some((v) => v > 0.12))) { go('toDoor'); h.walk(a, roundPath(cam, c, k, a, doorPt, L, W), 0.8); }
          else { h.equip(a, 'broom'); j.stops = ORDER.filter((i) => STOPS[i].reach.some((key) => reachLeft(c.snow, key, STOPS[i].part) > 0.12)); j.si = 0; go('toStop'); h.walk(a, roundPath(cam, c, k, a, stopPt(j.stops[0]), L, W), 1.05); }
        }
        break;
      }
      case 'toStop': { a.status = 'Obchází auto se smetákem'; if (!h.moving(a)) go('brush'); break; }
      case 'brush': {
        const S = STOPS[j.stops[j.si]];
        // nejzasněženější dosažitelná buňka; kartáč v tazích (vpřed s kontaktem, zpět nad povrchem)
        // střecha je přes celou šířku: ze strany chodníku jen bližší polovina (zbytek ze silnice)
        const roofFloor = S.z === KERB && j.stops.slice(j.si).some((q) => STOPS[q].z === ROAD) ? 0.45 : 0;
        const tgt = pickCell(c.snow, S.reach, S.part, S.z, roofFloor);
        const done = !tgt || el > 7;
        if (!done) {
          const w = 2 * Math.PI * 1.4, ph = el * w, contact = Math.sin(ph) > 0, sw = 0.22 * Math.cos(ph);
          const cp = cellPoint(g, tgt.key, tgt.i, c.snow[tgt.key].length, S.z);
          const P = carLocal(cam, c, k, cp[0] + sw, cp[1], cp[2] + (contact ? 0.02 : 0.1));
          face(P.s);
          // nástroj: kartáč v bodě dotyku (vzdálenost vpřed a výška nad zemí, m modelu = m postavy)
          const A0 = toWorld(cam, a.pos), dist = Math.hypot(P.X - A0.X, P.Z - A0.Z) / k;
          a.anim.tool = { u: Math.min(1.25, Math.max(0.35, dist)), h: Math.min(1.7, cp[2] + (contact ? 0.02 : 0.1)), beta: 0.6, crouch: cp[2] < 0.8 ? 0.25 : 0, lean: cp[2] < 0.8 ? 0.3 : 0.08 };
          if (contact) {
            // střecha je přes celou šířku: ze strany chodníku dosáhne jen na bližší polovinu (zbytek ze silnice)
            const arr = c.snow[tgt.key], before = arr[tgt.i], floor = tgt.key === 'roof' ? Math.min(before, roofFloor) : 0;
            arr[tgt.i] = Math.max(floor, before - 1.3 * dt);
            c.pile = c.pile ?? { kerb: 0, road: 0 };
            const side = S.z === ROAD ? 'road' : 'kerb'; c.pile[side] = Math.min(1, c.pile[side] + (before - arr[tgt.i]) * 0.06);
            if (Math.floor(t / 0.14) !== Math.floor((t - dt) / 0.14) && before > 0.05) h.puff(P.s.x, P.s.y + 6, 2, Math.floor(t * 40) + c.id * 31);
          }
          a.status = `Ometá auto (${tgt.key === 'roof' ? 'střecha' : tgt.key === 'hood' ? 'kapota' : tgt.key === 'trunk' ? 'kufr' : tgt.key === 'ws' ? 'čelní sklo' : tgt.key === 'rw' ? 'zadní sklo' : 'okna'})`;
        }
        if (done) {
          j.si++;
          if (j.si >= j.stops.length) {
            // hotovo: když na skle nebo střeše zůstal sníh (nedosažitelný), obejde to ještě jednou
            if (mustClean(c.snow) && (j as OwnerJob & { pass?: number }).pass !== 1) { (j as OwnerJob & { pass?: number }).pass = 1; j.stops = ORDER.filter((i) => STOPS[i].reach.some((key) => reachLeft(c.snow, key, STOPS[i].part) > 0.12)); j.si = 0; if (j.stops.length) { go('toStop'); h.walk(a, roundPath(cam, c, k, a, stopPt(j.stops[0]), L, W), 1.05); break; } }
            a.anim.tool = { u: 0.35, h: 0.55, beta: 1.25, crouch: 0, lean: 0 };
            go('toDoor'); h.walk(a, roundPath(cam, c, k, a, doorPt, L, W), 0.8);
          } else {
            while (j.si < j.stops.length && !STOPS[j.stops[j.si]].reach.some((key) => reachLeft(c.snow, key, STOPS[j.stops[j.si]].part) > 0.12)) j.si++;
            if (j.si >= j.stops.length) { a.anim.tool = { u: 0.35, h: 0.55, beta: 1.25, crouch: 0, lean: 0 }; go('toDoor'); h.walk(a, roundPath(cam, c, k, a, doorPt, L, W), 0.8); }
            else { go('toStop'); h.walk(a, roundPath(cam, c, k, a, stopPt(j.stops[j.si]), L, W), 1.05); }
          }
        }
        break;
      }
      case 'toDoor': { a.status = 'Jde ke dveřím'; if (!h.moving(a)) go('stow'); break; }
      case 'stow': { a.status = 'Ukládá smeták do auta'; face(at(g.wsBase[0] - 0.4, 0)); if (el > 0.9) { h.equip(a, null); go('doorOpen'); } break; }
      case 'doorOpen': { c.door = Math.min(1, el / 0.8); a.status = 'Otevírá dveře'; if (el > 0.8) { go('enter'); } break; }
      case 'enter': {
        // nástup: z místa u dveří na sedadlo (otvorem dveří), sed se prolne; postava se kreslí uvnitř
        const f = Math.min(1, el / 1.3), e = f * f * (3 - 2 * f), seat = carLocal(cam, c, k, g.wsBase[0] - 0.75, 0.32, 0.45);
        const P0 = doorPt, ground = seat.g;
        a.pos = { x: P0.x + (ground.x - P0.x) * e, y: P0.y + (ground.y - P0.y) * e - (seat.g.y - seat.s.y) * e }; a.lift = (seat.g.y - seat.s.y) * e;
        a.speed = 0; a.anim.sit = { kind: 'drive', t: el, dur: 1e9, w: e, r: 0 };
        a.clipRings = enterClip(cam, c, k, a); a.boarding = c.id;
        a.status = 'Nastupuje do auta';
        if (f >= 1) { a.vehicle = true; a.clipRings = null; a.boarding = null; c.driver = a.id; go('doorClose'); }
        break;
      }
      case 'doorClose': { c.door = Math.max(0, 1 - el / 0.7); placeDriver(cam, c, k, a, t); if (el > 0.7) go('look'); break; }
      case 'look': {
        placeDriver(cam, c, k, a, t); a.status = 'Rozhlíží se před výjezdem';
        if (el > 1.8) { c.mode = 'pullOut'; c.blink = 1; c.since = t; go('drive'); }
        break;
      }
      case 'drive': {
        placeDriver(cam, c, k, a, t); a.status = 'Odjíždí autem';
        if (c.mode === 'drive' && Math.abs(toScreen(cam, { X: c.X, Z: c.Z }).x - p.scene.width / 2) > p.scene.width / 2 + 300) { a.vehicle = false; c.driver = undefined; h.hide(a); continue; }
        break;
      }
      // ---- příjezd: vystoupení a odchod
      case 'exitCar': {
        if (el < 0.8) { c.door = el / 0.8; placeDriver(cam, c, k, a, t); a.status = 'Otevírá dveře'; break; }
        const f = Math.min(1, (el - 0.8) / 1.2), e = f * f * (3 - 2 * f), seat = carLocal(cam, c, k, g.wsBase[0] - 0.75, 0.32, 0.45);
        a.vehicle = false; c.driver = undefined;
        a.pos = { x: seat.g.x + (doorPt.x - seat.g.x) * e, y: seat.s.y + (doorPt.y - seat.s.y) * e }; a.lift = (seat.g.y - seat.s.y) * (1 - e);
        a.anim.sit = { kind: 'drive', t: el, dur: 1e9, w: 1 - e, r: 0 };
        a.clipRings = enterClip(cam, c, k, a); a.boarding = c.id; a.status = 'Vystupuje z auta';
        if (f >= 1) { a.anim.sit = null; a.lift = 0; a.clipRings = null; a.boarding = null; go('leave'); }
        break;
      }
      case 'leave': {
        if (el < 0.7) { c.door = Math.max(0, 1 - el / 0.7); a.status = 'Zavírá dveře'; break; }
        if (!h.moving(a) && !(j as OwnerJob & { gone?: boolean }).gone) {
          (j as OwnerJob & { gone?: boolean }).gone = true;
          // kolem zádi na chodník a po něm za okraj
          const sw = sidewalkOf(p, c), exitX = (hashNoise(seed, 9700, c.id) < 0.5 ? -90 : p.scene.width + 90);
          h.walk(a, [at(-(L / 2 + 0.6), ROAD * (W + 0.5)), at(-(L / 2 + 0.6), KERB * (W + 0.6)), { x: at(-(L / 2 + 0.6), 0).x, y: sw }, { x: exitX, y: sw }], 1);
          a.status = 'Odchází od auta';
        } else if ((j as OwnerJob & { gone?: boolean }).gone && !h.moving(a)) { h.hide(a); continue; }
        break;
      }
    }
    out.push(j);
  }
  return out;
}

/**
 * Cesta k bodu kolem auta (nikdy skrz karoserii): v souřadnicích auta – když je cíl na druhé straně,
 * vede přes rohy u čela nebo u zádi (kratší obchůzka), s odstupem 0,6 m od karoserie.
 */
function roundPath(cam: Camera, c: Car, k: number, a: AgentState, to: Vec2, L: number, W: number): Vec2[] {
  const cs = Math.cos(c.hd), sn = Math.sin(c.hd);
  const loc = (q: Vec2) => { const w = toWorld(cam, q), dx = (w.X - c.X) / k, dz = (w.Z - c.Z) / k; return { x: dx * cs + dz * sn, z: -dx * sn + dz * cs }; };
  const A = loc(a.pos), B = loc(to), m = W + 0.6, e = L / 2 + 0.7;
  const pt = (x: number, z: number) => carLocal(cam, c, k, x, z).g;
  const side = (q: { x: number; z: number }) => (Math.abs(q.z) >= W + 0.2 ? Math.sign(q.z) : 0);
  const sa = side(A), sb = side(B);
  if (sa !== 0 && sb !== 0 && sa !== sb) {
    // přes čelo, nebo přes záď – podle kratší cesty
    const front = Math.abs(A.x - e) + Math.abs(B.x - e), back = Math.abs(A.x + e) + Math.abs(B.x + e), x = front <= back ? e : -e;
    return [pt(x, sa * m), pt(x, sb * m), to];
  }
  if (sa !== 0 && sb === 0) { const x = B.x > 0 ? e : -e; return [pt(x, sa * m), to]; }
  if (sa === 0 && sb !== 0) { const x = A.x > 0 ? e : -e; return [pt(x, sb * m), to]; }
  return [to];
}
/** chodník u auta (y obrazu): vzdálené parkování → vzdálený chodník, přední → přední */
function sidewalkOf(p: ProjectFile, c: Car): number {
  const lane = p.street!.lanes[c.lane]; return lane.dir < 0 ? 586 : 903;
}
/** zbývající sníh v dosahu (podíl buněk part) */
function reachLeft(sn: CarSnow, key: keyof CarSnow, part: [number, number]): number {
  const arr = sn[key], n = arr.length; let m = 0;
  for (let i = Math.floor(part[0] * n); i < Math.ceil(part[1] * n); i++) m = Math.max(m, arr[i]);
  return m;
}
function pickCell(sn: CarSnow, reach: (keyof CarSnow)[], part: [number, number], side: number, roofFloor = 0): { key: keyof CarSnow; i: number } | null {
  let best: { key: keyof CarSnow; i: number; v: number } | null = null;
  for (const key of reach) {
    if ((key === 'winL' && side !== ROAD) || (key === 'winR' && side !== KERB)) continue;
    const arr = sn[key], n = arr.length, whole = key === 'hood' || key === 'trunk' || key === 'ws' || key === 'rw';
    const i0 = whole ? 0 : Math.floor(part[0] * n), i1 = whole ? n : Math.ceil(part[1] * n);
    for (let i = i0; i < i1; i++) { const v = arr[i] - (key === 'roof' ? roofFloor : 0); if (v > 0.06 && (!best || v > best.v + 0.05)) best = { key, i, v }; }
  }
  return best;
}
/** střed buňky sněhu (lokální x, z, h) – bod, kam míří kartáč (na straně stanoviště) */
function cellPoint(g: ReturnType<typeof carGeo>, key: keyof CarSnow, i: number, n: number, side: number): [number, number, number] {
  const f = (i + 0.5) / n, lerp = (a: [number, number], b: [number, number]) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as [number, number];
  const zs = side === 0 ? 0 : side * g.zG * 0.45;
  if (key === 'roof') { const q = lerp(g.wsTop, g.roofBack); return [q[0], zs, q[1] + 0.1]; }
  if (key === 'hood') { const q = lerp(g.wsBase, g.hoodF); return [q[0], zs * 0.8, q[1] + 0.06]; }
  if (key === 'trunk') { const q = lerp(g.rwBase, g.trunkEnd); return [q[0], zs * 0.8, q[1] + 0.06]; }
  if (key === 'ws') { const q = lerp(g.wsBase, g.wsTop); return [q[0], zs, q[1]]; }
  if (key === 'rw') { const q = lerp(g.roofBack, g.rwBase); return [q[0], zs, q[1]]; }
  const x = g.rwBase[0] + (g.wsBase[0] - g.rwBase[0]) * f; // boční okna
  return [x, (key === 'winL' ? 1 : -1) * g.zG, (g.wsBase[1] + g.roofBack[1]) / 2];
}
/** řidič na sedadle (poloha a sed), kreslí se uvnitř auta */
function placeDriver(cam: Camera, c: Car, k: number, a: AgentState, t: number) {
  const g = carGeo(c.body), seat = carLocal(cam, c, k, g.wsBase[0] - 0.75, 0.32, 0.45);
  const ahead = carLocal(cam, c, k, g.wsBase[0] + 2, 0.32, 0);
  a.hidden = false; a.vehicle = true; a.pos = seat.s; a.lift = seat.g.y - seat.s.y; a.off = undefined; a.speed = 0;
  a.facing = Math.atan2(ahead.g.y - seat.g.y, ahead.g.x - seat.g.x); a.groundHeading = c.hd;
  const s0 = a.anim.sit; a.anim.sit = { kind: 'drive', t: (s0?.kind === 'drive' ? s0.t : 0) + SIM_DT, dur: 1e9, w: 1, r: 0 }; void t;
}
/**
 * Ořez postavy při nastupování / vystupování (sudo-lichý): celá obrazovka minus bok auta plus otvor
 * dveří – tělo uvnitř zakryje karoserie, vidět je jen otvorem dveří a nad bokem (skly).
 */
function enterClip(cam: Camera, c: Car, k: number, a: AgentState): Vec2[][] {
  const g = carGeo(c.body), s = ROAD, z = s * g.zB;
  void a;
  const P = (x: number, h: number) => carLocal(cam, c, k, x, z, h).s;
  const side: Vec2[] = [P(g.nose[0], g.nose[1]), P(g.nose[0], 0.25), P(g.tail[0], 0.25), P(g.tail[0], g.tail[1]), P(g.trunkEnd[0], g.trunkEnd[1]), P(g.rwBase[0], g.rwBase[1]), P(g.wsBase[0], g.wsBase[1]), P(g.hoodF[0], g.hoodF[1])];
  const xd0 = g.wsBase[0] - 0.05, xd1 = g.doors === 4 ? (g.wsTop[0] + g.roofBack[0]) / 2 + 0.05 : g.roofBack[0] + 0.25;
  const bt = (x: number) => g.rwBase[1] + ((g.wsBase[1] - g.rwBase[1]) * (x - g.rwBase[0])) / (g.wsBase[0] - g.rwBase[0]);
  const door: Vec2[] = [P(xd0, 0.32), P(xd1, 0.32), P(xd1, bt(xd1)), P(xd0, bt(xd0))];
  return [[{ x: -1e4, y: -1e4 }, { x: 1e4, y: -1e4 }, { x: 1e4, y: 1e4 }, { x: -1e4, y: 1e4 }], side, door];
}
