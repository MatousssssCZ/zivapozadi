/**
 * Rozestupy postav a chůze ve dvojicích (čisté funkce nad stavem simulace, deterministické).
 *
 * Postava má polohu na trase (`pos`) a malý vizuální posun (`off`) kolmo ke směru chůze.
 * Posun se mění jen plynule a jen tak rychle, jak postava jde (nebo malým úkrokem v klidu),
 * a skutečný pohyb kořene pohání nohy – postava se tedy nikdy „nesune“ do strany bez kroků.
 *
 * - protijdoucí postavy se míjejí vpravo,
 * - pomalejší / stojící postavu před sebou postava obejde stranou, a když to nejde, zpomalí,
 * - dvě stojící postavy na stejném místě: ta s vyšším id udělá úkrok stranou,
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

/** Jeden krok rozestupů: upraví `off` a `speedCap` všech postav (kromě druhých členů dvojic). */
export function stepSpacing(list: SpacingInput[], dt: number): void {
  const vr = list.map((s) => P(visualRoot(s.a)));
  const partner = (x: AgentState, y: AgentState) => x.follow?.leaderId === y.id || y.follow?.leaderId === x.id
    || (!!x.follow && !!y.follow && x.follow.leaderId === y.follow.leaderId);
  for (let i = 0; i < list.length; i++) {
    const { a, scale } = list[i];
    a.speedCap = null;
    if (a.follow) { a.off = { x: 0, y: 0 }; continue; } // dvojici řídí vůdce
    a.off ??= { x: 0, y: 0 };
    const off = P(a.off);
    const W = BODY_W * scale;
    const h = dirOf(a.facing), r = { x: -h.y, y: h.x }; // r = vpravo (y dolů)
    const moving = a.speed > MOVING;
    const curLat = off.x * r.x + off.y * r.y;
    if (moving) {
      let want = a.lane * scale; // přirozený mírný pruh každé postavy
      let lo = -Infinity, hi = Infinity;
      for (let j = 0; j < list.length; j++) {
        if (j === i) continue;
        const b = list[j].a;
        if (partner(a, b)) continue;
        const d = { x: vr[j].x - vr[i].x, y: vr[j].y - vr[i].y };
        const fwd = d.x * h.x + d.y * h.y, lat = d.x * r.x + d.y * r.y;
        const Wb = BODY_W * list[j].scale, need = (W + Wb) * 0.5 * 1.05;
        // jen to, co je před postavou a blízko její dráhy
        if (fwd < -W * 0.4 || fwd > W * 4) continue;
        if (Math.abs(lat) > need * 1.6) continue;
        const bLat = curLat + lat; // příčná poloha druhé postavy vůči naší trase
        const bh = dirOf(b.facing);
        const opposite = b.speed > MOVING && bh.x * h.x + bh.y * h.y < -0.3;
        // strana míjení: protijdoucí vpravo, jinak na stranu dál od druhé postavy
        const goRight = opposite ? true : lat <= 0;
        if (goRight) lo = Math.max(lo, bLat + need); else hi = Math.min(hi, bLat - need);
        // následování pomalejšího ve stejném směru (než se podaří obejít)
        const same = !opposite && (b.speed <= MOVING || bh.x * h.x + bh.y * h.y > 0.4);
        if (same && fwd > 0 && fwd < W * 1.7 && Math.abs(lat) < need * 0.85) {
          const cap = Math.max(b.speed * 0.95, fwd > W * 1.1 ? a.speed * 0.6 : 0);
          a.speedCap = Math.min(a.speedCap ?? Infinity, cap);
        }
      }
      if (lo > -Infinity || hi < Infinity) {
        if (lo > hi) want = Math.abs(lo - curLat) < Math.abs(hi - curLat) ? lo : hi; // obě strany blokované: menší úhyb
        else want = clamp(want, lo, hi);
      }
      const maxLat = W * 1.4;
      want = clamp(want, -maxLat, maxLat);
      // posun kolmo ke směru rychlostí úměrnou chůzi (úhel do ~30°); složka podél směru (po zatáčce)
      // se rozpouští jen pomalu, aby kořen nikdy necouval proti směru chůze
      let along = off.x * h.x + off.y * h.y;
      along = along > 0 ? Math.max(0, along - a.speed * 0.25 * dt) : Math.min(0, along + a.speed * 0.5 * dt);
      // příčná rychlost se mění plynule (žádné kmitání mezi dvěma omezeními)
      const vMax = a.speed * 0.4;
      const vT = clamp((want - curLat) * 2.5, -vMax, vMax);
      const vPrev = a.offLatV ?? 0;
      const v = vPrev + clamp(vT - vPrev, -a.speed * 1.5 * dt, a.speed * 1.5 * dt);
      a.offLatV = v;
      const lat = curLat + v * dt;
      off.x = r.x * lat + h.x * along; off.y = r.y * lat + h.y * along;
      a.off = S(off);
    } else {
      a.offLatV = 0;
      // rozpracovaný úkrok stranou dokončit klidnou chůzí
      if (a.sidestep) {
        step(off, a.sidestep, W * 2.2 * dt);
        if (Math.hypot(off.x - a.sidestep.x, off.y - a.sidestep.y) < 1e-3) a.sidestep = null;
        a.off = S(off);
        continue;
      }
      // v klidu: dvě postavy na (skoro) stejném místě – deterministicky ustoupí ta s vyšším id
      // (postavy v činnosti, např. ve frontě, mají místa určená činností a neustupují)
      if (a.activity) continue;
      for (let j = 0; j < list.length; j++) {
        if (j === i) continue;
        const b = list[j].a;
        if (partner(a, b) || b.speed > MOVING || (a.id < b.id && !b.activity)) continue;
        const d = { x: vr[i].x - vr[j].x, y: vr[i].y - vr[j].y };
        const D = Math.hypot(d.x, d.y), need = W * 0.85;
        if (D >= need * 0.75) continue;
        const n = D > 1e-3 ? { x: d.x / D, y: d.y / D } : { x: r.x, y: r.y };
        a.sidestep = { x: off.x + n.x * (need - D), y: off.y + n.y * (need - D) };
        break;
      }
    }
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
export function stepFollower(f: AgentState, leader: AgentState, scaleF: number, vmaxF: number, dt: number): void {
  const L = P(visualRoot(leader)), fp = P(f.pos);
  const lh = dirOf(leader.facing), lr = { x: -lh.y, y: lh.x };
  const side = f.follow?.side ?? 1, gap = PAIR_GAP * scaleF;
  const target = { x: L.x + lr.x * side * gap, y: L.y + lr.y * side * gap };
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
  const fd = dirOf(f.facing), cur = { x: fd.x * f.speed, y: fd.y * f.speed };
  const acc = 110 * scaleF * dt;
  const dv = { x: tv.x - cur.x, y: tv.y - cur.y }, dl = Math.hypot(dv.x, dv.y);
  const nv = dl <= acc ? tv : { x: cur.x + (dv.x / dl) * acc, y: cur.y + (dv.y / dl) * acc };
  const sp = Math.hypot(nv.x, nv.y);
  const sv = S(nv);
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
