/**
 * Rozestupy postav a chůze ve dvojicích (čisté funkce nad stavem simulace, deterministické).
 *
 * Postava má polohu na trase (`pos`) a malý vizuální posun (`off`) kolmo ke směru chůze.
 * Posun se mění jen plynule a jen tak rychle, jak postava jde (nebo malým úkrokem v klidu),
 * a skutečný pohyb kořene pohání nohy – postava se tedy nikdy „nesune“ do strany bez kroků.
 *
 * - protijdoucí postavy se míjejí vpravo,
 * - pomalejší / stojící postavu před sebou postava obejde stranou, a když to nejde, zpomalí,
 * - každá postava má osobní prostor (mírně odlišný); do cizího se nikdo nedostane,
 * - křížení drah: přednost má ten, kdo je u místa střetu dřív,
 * - dvojice: druhá postava jde vedle vůdce (stejný směr, sladěná rychlost) a nemá vlastní program.
 */
import type { Vec2 } from '../math/vec';
import { approachAngle, clamp } from '../math/vec';
import type { AgentState } from './types';
import { GROUND_DEPTH_K as K } from '../scene/geometry';

// Výpočty probíhají ve „fyzických“ souřadnicích země (svislá osa obrazovky / K), aby rozestupy
// do hloubky odpovídaly skutečné vzdálenosti. P = z obrazovky na zem, S = ze země na obrazovku.
const P = (v: Vec2): Vec2 => ({ x: v.x, y: v.y / K });
const S = (v: Vec2): Vec2 => ({ x: v.x, y: v.y * K });
const dirOf = (screenAngle: number): Vec2 => { const v = P({ x: Math.cos(screenAngle), y: Math.sin(screenAngle) }), n = Math.hypot(v.x, v.y); return { x: v.x / n, y: v.y / n }; };

/** Šířka postavy (ramena + rukávy) v jednotkách postavy – základ všech rozestupů. */
export const BODY_W = 24;
/** Vzdálenost středů dvojice (jednotky postavy). */
export const PAIR_GAP = 27;

export const visualRoot = (a: AgentState): Vec2 => ({ x: a.pos.x + (a.off?.x ?? 0), y: a.pos.y + (a.off?.y ?? 0) });

const MOVING = 4; // px/s

export interface SpacingInput { a: AgentState; scale: number }

/** Osobní poloměr postavy (fyzicky): každá má trochu jiný odstup (0,55–0,8 šířky postavy). */
export function personalRadius(a: AgentState, scale: number): number {
  let h = 2166136261;
  for (let i = 0; i < a.id.length; i++) { h ^= a.id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const n = ((h >>> 0) % 1000) / 1000;
  return BODY_W * scale * (0.55 + 0.25 * n);
}

/** Postava stojí na místě určeném činností (fronta, obsluha, stolek) – ostatní ji obcházejí, neodstrkují. */
const pinned = (a: AgentState) => !!a.activity && a.speed <= MOVING && a.loc.kind === 'point';

/**
 * Jeden krok rozestupů (osobní prostor):
 * 1) chodci plánují boční úhyb (protijdoucí vpravo, pomalejšího / stojícího obejdou) s odstupem
 *    podle osobních poloměrů; za pomalejším, kterého nejde obejít, zpomalí;
 * 2) křížení drah: kdo do místa střetu dorazí později, dá přednost (zpomalí, nikdy úplně nezastaví);
 * 3) pevná podmínka: středy dvou postav nejsou blíž než součet osobních poloměrů – případné
 *    překrytí se plynule rozestoupí (postavy na místě činnosti se neodstrkují).
 * Posun `off` vždy odkráčí nohy (skutečný pohyb kořene pohání chůzi).
 */
export function stepSpacing(list: SpacingInput[], dt: number): void {
  const vr = list.map((s) => P(visualRoot(s.a)));
  const R = list.map((s) => personalRadius(s.a, s.scale));
  const partner = (x: AgentState, y: AgentState) => x.follow?.leaderId === y.id || y.follow?.leaderId === x.id
    || (!!x.follow && !!y.follow && x.follow.leaderId === y.follow.leaderId);
  const offs = list.map((s) => P(s.a.off ?? { x: 0, y: 0 }));
  // --- 1) + 2) chodci
  for (let i = 0; i < list.length; i++) {
    const { a, scale } = list[i];
    a.speedCap = null;
    const off = offs[i];
    const W = BODY_W * scale;
    const h = dirOf(a.facing), r = { x: -h.y, y: h.x }; // r = vpravo (y dolů)
    if (a.follow) {
      // druhého z dvojice vede vůdce; vlastní posun jen z rozestupů (bod 3), pomalu se vrací k nule
      const k = Math.max(0, 1 - (a.speed * 0.3 * dt) / Math.max(1e-6, Math.hypot(off.x, off.y)));
      off.x *= k; off.y *= k;
      continue;
    }
    if (a.speed <= MOVING) { a.offLatV = 0; continue; }
    const curLat = off.x * r.x + off.y * r.y;
    let want = a.lane * scale; // přirozený mírný pruh každé postavy
    let lo = -Infinity, hi = Infinity, capFollow = Infinity, capYield = Infinity;
    for (let j = 0; j < list.length; j++) {
      if (j === i) continue;
      const b = list[j].a;
      if (partner(a, b)) continue;
      const d = { x: vr[j].x - vr[i].x, y: vr[j].y - vr[i].y };
      const fwd = d.x * h.x + d.y * h.y, lat = d.x * r.x + d.y * r.y;
      const need = (R[i] + R[j]) * 1.3; // při chůzi pohodlnější odstup než minimum
      const bh = dirOf(b.facing);
      const bMoving = b.speed > MOVING;
      // křížení drah: nejbližší přiblížení v příštích 1,6 s
      if (bMoving && Math.abs(bh.x * h.x + bh.y * h.y) < 0.75) {
        const dv = { x: bh.x * b.speed - h.x * a.speed, y: bh.y * b.speed - h.y * a.speed };
        const vv = dv.x * dv.x + dv.y * dv.y;
        if (vv > 1e-6) {
          const tc = -(d.x * dv.x + d.y * dv.y) / vv;
          const mx = d.x + dv.x * tc, my = d.y + dv.y * tc;
          if (tc > 0 && tc < 1.6 && Math.hypot(mx, my) < need) {
            // kdo je dál od místa střetu, dá přednost (shoda: podle id)
            const ta = Math.hypot(h.x * a.speed * tc, h.y * a.speed * tc), tb = Math.hypot(bh.x * b.speed * tc, bh.y * b.speed * tc);
            const meFirst = fwd < 0 ? true : ta < tb - 2 ? true : ta > tb + 2 ? false : a.id < b.id;
            if (!meFirst) capYield = Math.min(capYield, Math.max(14 * scale, b.speed * 0.4));
          }
        }
      }
      // jen to, co je před postavou a blízko její dráhy
      if (fwd < -W * 0.4 || fwd > W * 4.5) continue;
      if (Math.abs(lat) > need * 1.6) continue;
      const bLat = curLat + lat; // příčná poloha druhé postavy vůči naší trase
      const opposite = bMoving && bh.x * h.x + bh.y * h.y < -0.3;
      const goRight = opposite ? true : lat <= 0; // protijdoucí vpravo, jinak dál od druhé postavy
      if (goRight) lo = Math.max(lo, bLat + need); else hi = Math.min(hi, bLat - need);
      const same = !opposite && (!bMoving || bh.x * h.x + bh.y * h.y > 0.4);
      if (same && fwd > 0 && fwd < need * 1.8 && Math.abs(lat) < need * 0.9) capFollow = Math.min(capFollow, b.speed * 0.95);
    }
    const maxLat = W * 2.4;
    if (lo > -Infinity || hi < Infinity) {
      if (lo > hi) want = Math.abs(lo - curLat) < Math.abs(hi - curLat) ? lo : hi; // obě strany blokované: menší úhyb
      else want = clamp(want, lo, hi);
    }
    if (capFollow < Infinity) {
      const blocked = lo > hi || lo > maxLat || hi < -maxLat;
      // nikdy se nezaseknout: když obejít nejde, projde pomalu (rozestup pak zajistí bod 3)
      a.speedCap = blocked ? Math.max(capFollow, 9 * scale) : Math.max(capFollow, Math.min(a.speed, 16 * scale));
    }
    if (capYield < Infinity) a.speedCap = Math.min(a.speedCap ?? Infinity, capYield);
    want = clamp(want, -maxLat, maxLat);
    // posun kolmo ke směru rychlostí úměrnou chůzi; složka podél směru se rozpouští jen pomalu,
    // aby kořen nikdy necouval proti směru chůze
    let along = off.x * h.x + off.y * h.y;
    along = along > 0 ? Math.max(0, along - a.speed * 0.25 * dt) : Math.min(0, along + a.speed * 0.5 * dt);
    const vMax = a.speed * 0.45;
    const vT = clamp((want - curLat) * 2.5, -vMax, vMax);
    const vPrev = a.offLatV ?? 0;
    const v = vPrev + clamp(vT - vPrev, -a.speed * 1.5 * dt, a.speed * 1.5 * dt);
    a.offLatV = v;
    const lat = curLat + v * dt;
    off.x = r.x * lat + h.x * along; off.y = r.y * lat + h.y * along;
  }
  // --- 3) pevný osobní prostor: rozestoupit překryté dvojice
  const corr = list.map(() => ({ x: 0, y: 0 }));
  const pos = list.map((s, i) => ({ x: P(s.a.pos).x + offs[i].x, y: P(s.a.pos).y + offs[i].y }));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i].a, b = list[j].a;
    if (partner(a, b)) continue;
    const need = R[i] + R[j];
    const d = { x: pos[j].x - pos[i].x, y: pos[j].y - pos[i].y }, D = Math.hypot(d.x, d.y);
    if (D >= need) continue;
    const wi = pinned(a) ? 0 : 1, wj = pinned(b) ? 0 : 1;
    if (!wi && !wj) continue;
    // směr rozestupu; při úplné shodě kolmo ke směru chůze (deterministicky podle id)
    const n = D > 1e-3 ? { x: d.x / D, y: d.y / D } : (() => { const h = dirOf(a.facing); return a.id < b.id ? { x: -h.y, y: h.x } : { x: h.y, y: -h.x }; })();
    const ov = need - D;
    corr[i].x -= (n.x * ov * wi) / (wi + wj); corr[i].y -= (n.y * ov * wi) / (wi + wj);
    corr[j].x += (n.x * ov * wj) / (wi + wj); corr[j].y += (n.y * ov * wj) / (wi + wj);
  }
  for (let i = 0; i < list.length; i++) {
    const { a, scale } = list[i];
    const c = corr[i], L = Math.hypot(c.x, c.y);
    if (L > 1e-6) {
      // rozestup plynule – jako klidný krok stranou (nohy ho odkráčí)
      const maxStep = Math.max(a.speed * 0.6, BODY_W * scale * 1.4) * dt;
      const k = Math.min(1, maxStep / L);
      offs[i].x += c.x * k; offs[i].y += c.y * k;
    }
    // posun nesmí být libovolně velký (postava se drží své trasy)
    const W = BODY_W * scale, ol = Math.hypot(offs[i].x, offs[i].y), maxOff = W * 3;
    if (ol > maxOff) { offs[i].x *= maxOff / ol; offs[i].y *= maxOff / ol; }
    a.off = S(offs[i]);
  }
}

function step(off: Vec2, target: Vec2, maxStep: number) {
  const dx = target.x - off.x, dy = target.y - off.y, D = Math.hypot(dx, dy);
  if (D <= maxStep || D < 1e-9) { off.x = target.x; off.y = target.y; return; }
  off.x += (dx / D) * maxStep; off.y += (dy / D) * maxStep;
}

/**
 * Druhý člen dvojice: jde vedle vůdce (vpravo/vlevo od jeho směru), sladí rychlost a směr.
 * Nikdy se neotáčí proti směru vůdce – když je napřed, jen zpomalí.
 */
export function stepFollower(f: AgentState, leader: AgentState, scaleF: number, vmaxF: number, dt: number, maxSlopeDeg = 90): void {
  const L = P(visualRoot(leader)), fp = P(f.pos);
  const lh = dirOf(leader.facing), lr = { x: -lh.y, y: lh.x };
  const side = f.follow?.side ?? 1, gap = PAIR_GAP * scaleF;
  // vedle vůdce a o kousek za ním – při chůzi napříč obrazem se postavy jinak celé zakryjí
  const back = 0.7 * gap;
  const target = { x: L.x + lr.x * side * gap - lh.x * back, y: L.y + lr.y * side * gap - lh.y * back };
  const d = { x: target.x - fp.x, y: target.y - fp.y };
  const along = d.x * lh.x + d.y * lh.y, lat = d.x * lr.x + d.y * lr.y;
  let tv: Vec2;
  if (leader.speed > MOVING) {
    const vf = clamp(leader.speed + along * 1.6, leader.speed * 0.45, vmaxF * 1.3);
    const vl = clamp(lat * 1.6, -leader.speed * 0.35, leader.speed * 0.35);
    tv = { x: lh.x * vf + lr.x * vl, y: lh.y * vf + lr.y * vl };
  } else {
    const D = Math.hypot(d.x, d.y);
    const v = D < 2 * scaleF ? 0 : Math.min(vmaxF * 0.7, D * 1.8);
    tv = D > 1e-6 ? { x: (d.x / D) * v, y: (d.y / D) * v } : { x: 0, y: 0 };
  }
  const cur = f.follow?.vel ?? { x: 0, y: 0 };
  const acc = 110 * scaleF * dt;
  const dv = { x: tv.x - cur.x, y: tv.y - cur.y }, dl = Math.hypot(dv.x, dv.y);
  const nv = dl <= acc ? tv : { x: cur.x + (dv.x / dl) * acc, y: cur.y + (dv.y / dl) * acc };
  const sp = Math.hypot(nv.x, nv.y);
  if (f.follow) f.follow.vel = { x: nv.x, y: nv.y };
  const sv = S(nv);
  // ani druhý z dvojice nejde po obrazovce strměji než mezní úhel (jinak by šel čistě dopředu/dozadu)
  if (maxSlopeDeg < 89.5 && sp > MOVING) {
    const t = Math.tan((maxSlopeDeg * Math.PI) / 180);
    if (Math.abs(sv.y) > Math.abs(sv.x) * t) sv.x = (sv.x !== 0 ? Math.sign(sv.x) : Math.sign(lh.x) || 1) * (Math.abs(sv.y) / t);
  }
  f.pos = { x: f.pos.x + sv.x * dt, y: f.pos.y + sv.y * dt };
  if (sp > MOVING) { f.facing = approachAngle(f.facing, Math.atan2(sv.y, sv.x), 7 * dt); f.speed = sp; }
  else {
    f.speed = sp;
    // v klidu se natočí stejně jako vůdce (nebo k bodu, kam se dívá)
    const look = leader.look;
    const want = look ? ('angle' in look ? look.angle : Math.atan2(look.y - f.pos.y, look.x - f.pos.x)) : leader.facing;
    f.facing = approachAngle(f.facing, want, 3.3 * dt);
  }
}
