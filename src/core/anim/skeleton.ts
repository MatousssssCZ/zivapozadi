/**
 * Hierarchická 2D kostra postavy a její kinematika (klid, chůze, akce).
 * Společná pro všechny vykreslovací backendy (testovací postava i skládané malované díly) –
 * pohyb je jen JEDNA implementace, liší se jen tělesná šablona a vzhled.
 *
 * Souřadnice: lokální vůči kořeni (země mezi chodidly), osa y míří dolů (nahoru = záporné).
 */
import type { Vec2 } from '../math/vec';
import { clamp, smoothstep } from '../math/vec';
import { hashNoise } from '../math/rng';
import { meanPelvisHeight, sampleGait, strideLegLen, gaitEvents } from './gaitProfile';
import { footAt, restFeet, type FootGeom } from './gaitKinematics';
import { heelRelOf, type AnimState } from './animator';
import type { Direction } from './manifest';

/** Pohledy postavy. Datový model počítá se všemi pěti; dostupnost určují podklady. */
export type ViewId = 'front' | 'side' | 'front3q' | 'back3q' | 'back';
export const ALL_VIEWS: ViewId[] = ['front', 'front3q', 'side', 'back3q', 'back'];
export const VIEW_LABELS: Record<ViewId, string> = { front: 'zepředu', front3q: 'šikmo zepředu', side: 'z boku', back3q: 'šikmo zezadu', back: 'zezadu' };

/** Směr pohybu (8 směrů) → požadovaný pohled + zda jde o zrcadlenou (levou) stranu. */
export function viewForDirection(d: Direction): { view: ViewId; mirror: boolean } {
  switch (d) {
    case 'E': return { view: 'side', mirror: false };
    case 'W': return { view: 'side', mirror: true };
    case 'SE': return { view: 'front3q', mirror: false };
    case 'SW': return { view: 'front3q', mirror: true };
    case 'NE': return { view: 'back3q', mirror: false };
    case 'NW': return { view: 'back3q', mirror: true };
    case 'S': return { view: 'front', mirror: false };
    case 'N': return { view: 'back', mirror: false };
  }
}

export interface SkeletonViewDef {
  /** Promítnutý směr chůze v obraze (krok vpřed). */
  forward: Vec2;
  /** Vzdálenost kyčlí / ramen od osy těla (průmět do obrazu). */
  hipSpread: number;
  shoulderSpread: number;
  /** Vodorovný posun hlavy vůči krku. */
  headOffsetX: number;
  /** Vodorovný posun ramen vůči ose (z boku mírně vpřed). */
  shoulderOffsetX: number;
  /** Na které straně obrazu (−1 vlevo, +1 vpravo) jsou končetiny blíž ke kameře. Výchozí +1. */
  nearSide?: number;
}

export interface SkeletonTemplate {
  id: string;
  label: string;
  /** Výška postavy v logických jednotkách při měřítku 1. */
  height: number;
  bones: {
    thigh: number; shin: number; ankleHeight: number;
    /** pánev → krk */ torso: number;
    /** krk → střed hlavy */ neck: number;
    /** ramena pod krkem */ shoulderDrop: number;
    upperArm: number; forearm: number;
  };
  views: Partial<Record<ViewId, SkeletonViewDef>>;
  gait: {
    /** Délka cyklu chůze (2 kroky) v jednotkách při měřítku 1 – kroky jsou sladěné s posunem. */
    strideLength: number;
    /** Podíl cyklu, kdy noha stojí na zemi (stojná fáze). */
    stanceFraction: number;
    stepLift: number;
    armSwing: number;
    /** Maximální pokles pánve při kroku. */
    maxDip: number;
    sway: number;
    lean: number;
  };
  idle: { breathe: number; headAmp: number; shiftAmp: number; shiftPeriod: number };
  /** Povolené rozsahy koordinovaných proporcí (násobky). */
  proportions: { height: [number, number]; build: [number, number] };
  /** Povolené rozsahy parametrů pohybu (individualita bez náhodného třesení). */
  motionRanges: Record<Exclude<keyof MotionParams, 'phase' | 'armLag' | 'armLR'>, [number, number]> & { armLag?: [number, number]; armLR?: [number, number] };
  /** Geometrie boty vůči kotníku (pata vzadu, opěrný bod přednoží vpředu) v jednotkách. */
  foot?: { heel: number; toe: number };
}

/** Individuální parametry pohybu postavy (omezené rozsahem šablony). */
export interface MotionParams {
  strideScale: number;
  /** zpoždění paže v % cyklu (−2…+4) */
  armLag?: number;
  /** poměr amplitudy levé/pravé paže (0,85–1,15) */
  armLR?: number;
  armSwing: number;
  bob: number;
  sway: number;
  idleTempo: number;
  lean: number;
  /** Rychlost chůze jako násobek výchozí. */
  speed: number;
  /** Fázový posun klidových pohybů (0–1), aby lidé nepůsobili synchronně. */
  phase: number;
}

export const DEFAULT_MOTION: MotionParams = { strideScale: 1, armSwing: 1, bob: 1, sway: 1, idleTempo: 1, lean: 1, speed: 1, phase: 0 };

export interface Limb {
  root: Vec2; joint: Vec2; end: Vec2;
  /** Perspektivní zkrácení/prodloužení horního a dolního segmentu (1 = délka kosti). */
  k1?: number; k2?: number;
}

export interface SkeletonPose {
  view: ViewId;
  mirror: boolean;
  root: Vec2;
  /** pánev (střed kyčlí) */ hip: Vec2;
  /** krk / střed ramen */ neck: Vec2;
  /** střed ramen (pro testovací postavu) */ shoulder: Vec2;
  /** střed hlavy */ head: Vec2;
  headTilt: number;
  /** úhel trupu (−π/2 = svisle nahoru) */ torsoAngle: number;
  legs: [Limb, Limb]; // [zadní, přední]
  arms: [Limb, Limb]; // [zadní, přední (drží předměty)]
  /** natočení chodidel (rad) – jen při přenosu nohy */
  feet: [number, number];
  /** zápěstí přední ruky (úchop se dopočítá z dílu ruky) */ handR: Vec2;
  /** body paty obou bot (lokálně) – kotva při došlapu */ heelPts?: [Vec2, Vec2];
}

export function ik(root: Vec2, target: Vec2, l1: number, l2: number, bendSign: number): Limb {
  const dx = target.x - root.x, dy = target.y - root.y;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.01;
  let tx = target.x, ty = target.y;
  if (d > maxD) { tx = root.x + (dx / d) * maxD; ty = root.y + (dy / d) * maxD; d = maxD; }
  const a = Math.atan2(ty - root.y, tx - root.x);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * Math.max(d, 1e-6)), -1, 1);
  const ang = a + bendSign * Math.acos(cosA);
  const joint = { x: root.x + Math.cos(ang) * l1, y: root.y + Math.sin(ang) * l1 };
  return { root, joint, end: { x: tx, y: ty } };
}

/** Plynulý přechod hodnoty mezi náhodnými cíli (deterministicky z času a seedu) – přenesení váhy. */
function weightShift(t: number, period: number, seed: number): number {
  const k = Math.floor(t / period);
  const local = t / period - k;
  const a = hashNoise(seed, k) * 2 - 1, b = hashNoise(seed, k + 1) * 2 - 1;
  // přesun proběhne během prvních 20 % periody, pak se drží
  return a + (b - a) * smoothstep(clamp((local - 0.8) / 0.2, 0, 1));
}

/**
 * Póza kostry. Vstupem je jen stav animátoru (časově řízený simulací), šablona a parametry pohybu.
 *
 * Chůze: každá noha má stojnou fázi, během níž se kotník vůči pánvi posouvá lineárně dozadu přesně
 * o dráhu, kterou tělo urazí (fáze cyklu = uražená dráha / délka cyklu) ⇒ stojná noha na zemi neklouže.
 */
export interface PoseOptions {
  /** Skutečný směr chůze v lokálních souřadnicích obrazu (jednotkový vektor; x vpřed). Bez něj směr podle pohledu. */
  ground?: Vec2;
  /** Opěrné body pat ve světě převedené do lokálních souřadnic (null = noha bez kotvy). */
  anchors?: [Anchor | null, Anchor | null];
}
/** Kotva paty: poloha a směr chodidla na zemi (lokálně), uložené při došlapu. */
export interface Anchor { x: number; y: number; gx?: number; gy?: number }

export function skeletonPose(tpl: SkeletonTemplate, view: ViewId, mirror: boolean, a: AnimState, holding: boolean, motion: MotionParams, seed = 0, opts: PoseOptions = {}): SkeletonPose {
  const v = tpl.views[view] ?? tpl.views.side ?? Object.values(tpl.views)[0]!;
  const B = tpl.bones, G = tpl.gait, I = tpl.idle;
  const fx = v.forward.x, fy = v.forward.y;
  // promítnutí země: skutečný směr pohybu (opora pak ve scéně drží i v zatáčkách); jinak stylizovaný pohled
  const gfx = opts.ground ? opts.ground.x : fx, gfy = opts.ground ? opts.ground.y : fy * 0.35;
  const ns = v.nearSide ?? 1; // strana blízkých končetin
  const b = a.walkBlend;
  const ph = a.walkPhase;
  const legLen = B.thigh + B.shin;
  const restHipY = -(B.ankleHeight + legLen * 0.99);
  const tIdle = a.idleTime * motion.idleTempo + motion.phase * 10;

  // --- nohy: kontaktně řízená chůze podle tabulek (gaitProfile.ts, gaitKinematics.ts)
  // u = vpřed od pánve, h = výška nad zemí; pevné jsou kontaktní body, kolena dopočítá IK.
  const T = B.thigh, Sh = B.shin, AH = B.ankleHeight, L = legLen;
  const geom: FootGeom = footGeomOf(tpl);
  const w = a.gaitW ?? 0;
  const S = a.stride ?? strideLegLen(0.9) * L * motion.strideScale;
  const DEG = Math.PI / 180;
  const q0 = ph, q1 = (ph + 0.5) % 1; // lokální fáze nohou (0 = vzdálená / referenční, 1 = blízká)
  const qs = [q0, q1];
  const rel = heelRelOf(a);
  const gaitFeet = [footAt(q0, S, w, geom, rel[0] ?? undefined), footAt(q1, S, w, geom, rel[1] ?? undefined)];
  const idleFeet: [number, number] = a.startRest ?? [0.03 * L, -0.03 * L];
  const sideX = (i: number) => (i === 0 ? -1 : 1) * ns;
  let feet: { u: number; h: number; theta: number }[];
  const settleShift: Vec2[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  let gaitH = (meanPelvisHeight(w) + sampleGait('pelvisVerticalLegLen', q0, w) * motion.bob) * L;
  const idleH = AH + L * 0.99;
  let pelvisH: number;
  if (a.settle) {
    // zastavení: kontaktní body zůstávají, boty se položí, švihová noha dokročí s malým obloukem
    const st = a.settle, tt = smoothstep(st.t);
    const fr = [footAt(st.phase, st.stride, st.w, geom, st.heelRel?.[0] ?? undefined), footAt(st.phase + 0.5, st.stride, st.w, geom, st.heelRel?.[1] ?? undefined)];
    const rest = restFeet(st.phase, st.stride, st.w, geom, st.heelRel);
    // bota, která se přesouvá (švihová nebo přisouvaná zadní), se zvedne malým obloukem
    feet = fr.map((f, i) => ({ u: f.u + (rest[i] - f.u) * tt, h: f.h + (AH - f.h) * tt + (f.contact === 'swing' || Math.abs(rest[i] - f.u) > 0.08 * L ? Math.sin(Math.PI * tt) * 0.03 * L : 0), theta: f.theta * (1 - tt) }));
    // opřené nohy: navázat na světovou kotvu z chůze (rozdíl vůči odhadu z dráhy se během dokročení rozplyne)
    for (let i = 0; i < 2; i++) {
      const o = opts.anchors?.[i], hr = st.heelRel?.[i];
      if (o && hr != null && fr[i].contact !== 'swing') settleShift[i] = { x: (o.x - (sideX(i) * v.hipSpread + gfx * hr)) * (1 - tt), y: (o.y - gfy * hr) * (1 - tt) };
    }
    const hFrozen = (meanPelvisHeight(st.w) + sampleGait('pelvisVerticalLegLen', st.phase, st.w) * motion.bob) * L;
    pelvisH = hFrozen + (idleH - hFrozen) * tt;
    gaitH = pelvisH;
  } else if (b < 1) {
    // rozejití / klid: z klidových poloh do chůze; zvedající se noha se odlehčí a vykročí obloukem
    feet = gaitFeet.map((f, i) => ({ u: idleFeet[i] + (f.u - idleFeet[i]) * b, h: AH + (f.h - AH) * b, theta: f.theta * b }));
    pelvisH = idleH + (gaitH - idleH) * b;
  } else { feet = gaitFeet.slice(); pelvisH = gaitH; }
  const restS = a.settle ? restFeet(a.settle.phase, a.settle.stride, a.settle.w, geom, a.settle.heelRel) : null;
  const idleCenter = restS ? (restS[0] + restS[1]) / 2 : (idleFeet[0] + idleFeet[1]) / 2;
  const centerShift = idleCenter * (1 - b) * (a.settle ? smoothstep(a.settle.t) : 1); // v klidu je pánev nad chodidly
  // pánev: boční posun, rotace (yaw) a obliquita jako malé posuny kyčlí (ne rotace obrázku)
  const front = view !== 'side';
  const lateral = sampleGait('pelvisLateralLegLen', q0, w) * L * motion.sway * b * (front ? 1 : 0);
  const yaw = sampleGait('pelvisRotationDeg', q0, w) * DEG * b;
  const obl = sampleGait('pelvisObliquityDeg', q0, w) * DEG * b * (front ? 1 : 0.3);
  const halfHip = 0.08 * L;
  const shiftIdle = weightShift(tIdle, I.shiftPeriod, seed) * I.shiftAmp * (1 - b) * (front ? 1 : 0.3);
  const hip = { x: -ns * lateral * 0.7 + shiftIdle + gfx * centerShift, y: -pelvisH + gfy * centerShift };
  const hipRoots = [0, 1].map((i) => {
    const sgn = i === 0 ? 1 : -1; // referenční (pravá) = noha 0
    const fwd = sgn * halfHip * Math.sin(yaw) * (front ? 1 : 0.6);
    return { x: hip.x + sideX(i) * v.hipSpread + gfx * fwd, y: hip.y - sgn * halfHip * Math.sin(obl) + gfy * fwd };
  });
  // dosah: opřená noha nesmí být natažená přes délku. Odvalující se noha nejdřív víc zvedne patu
  // (rotace boty kolem pevného přednoží), teprve pak se sníží pánev. Opora se nikdy neposouvá.
  const maxD = (T + Sh) * 0.9995;
  // Opřená noha s kotvou: chodidlo se počítá vůči kotvě paty (pevný bod ve světě), jinak vůči pánvi.
  const anchored = [0, 1].map((i) => !!opts.anchors?.[i] && !a.settle && b > 0);
  const isAnch = (i: number) => anchored[i] && gaitFeet[i].contact !== 'swing';
  const baseOf = (i: number): Vec2 => (isAnch(i) ? opts.anchors![i]! : { x: sideX(i) * v.hipSpread, y: 0 });
  // opřená bota leží na zemi ve směru, ve kterém došlápla (i když tělo mezitím zatáčí)
  const gOf = (i: number): Vec2 => { const o = opts.anchors?.[i]; return isAnch(i) && o && o.gx !== undefined ? { x: o.gx, y: o.gy! } : { x: gfx, y: gfy }; };
  // pojistka: kotva, která se od odhadu z dráhy vzdálí víc než o MIS (prudký úhyb, otočka), se k němu přitáhne
  const MIS = 0.35 * L;
  const anchorPull = [0, 1].map((i) => {
    const o = opts.anchors?.[i];
    if (!o || !anchored[i] || rel[i] == null) return { x: 0, y: 0 };
    const est = { x: gfx * rel[i]!, y: gfy * rel[i]! }; // bez strany kyčle – nemění se při převrácení pohledu
    const dx = o.x - est.x, dy = o.y - est.y, m = Math.hypot(dx, dy);
    return m > MIS ? { x: -dx * (1 - MIS / m), y: -dy * (1 - MIS / m) } : { x: 0, y: 0 };
  });
  const anchorAt = (i: number): Vec2 => { const o = opts.anchors![i]!; return { x: o.x + anchorPull[i].x, y: o.y + anchorPull[i].y }; };
  const ankleXY = (f: { u: number; h: number }, i: number) => { const o = isAnch(i) ? anchorAt(i) : baseOf(i), g = gOf(i); return { x: o.x + g.x * f.u, y: o.y - f.h + g.y * f.u }; };
  for (let i = 0; i < 2; i++) if (anchored[i] && gaitFeet[i].contact !== 'swing') { const f = footAt(qs[i], S, w, geom, 0); feet[i] = b < 1 ? { ...f, theta: f.theta * b } : f; }
  // Perspektiva hloubky: krok do hloubky posune chodidlo i svisle (výš = dál). Nohy se proto
  // počítají v „plochém“ prostoru (jako z boku) a výsledek se zkosí – noha se zkrátí/prodlouží
  // perspektivou, místo aby se ohnula v koleni jako na schodech.
  const shear = Math.abs(gfx) > 0.05 ? Math.max(-1.2, Math.min(1.2, gfy / gfx)) : 0;
  const flat = (p: Vec2, i: number): Vec2 => ({ x: p.x, y: p.y - shear * (p.x - hipRoots[i].x) });
  const unflat = (p: Vec2, i: number): Vec2 => ({ x: p.x, y: p.y + shear * (p.x - hipRoots[i].x) });
  const reachAdjust = (f: { u: number; h: number; theta: number }, i: number) => {
    const reach = (ff: { u: number; h: number }) => { const q = flat(ankleXY(ff, i), i); return Math.hypot(q.x - hipRoots[i].x, q.y - hipRoots[i].y); };
    if (reach(f) <= maxD) return f;
    // přednoží (pevný bod) a natočení: A = toe + R(θ)·(−toe, AH)
    const toeU = f.u - (-geom.toe * Math.cos(f.theta) - geom.AH * Math.sin(f.theta));
    let lo = f.theta, hi = -1.45;
    const at = (th: number) => ({ u: toeU + (-geom.toe * Math.cos(th) - geom.AH * Math.sin(th)), h: -geom.toe * Math.sin(th) + geom.AH * Math.cos(th), theta: th });
    if (reach(at(hi)) > maxD) return at(hi);
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (reach(at(mid)) > maxD) lo = mid; else hi = mid; }
    return at(hi);
  };
  const swingShift: Vec2[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  if (!a.settle && b >= 1) {
    const ev = gaitEvents(w);
    for (let i = 0; i < 2; i++) {
      const g = gaitFeet[i];
      if (g.contact === 'toe') feet[i] = reachAdjust(feet[i], i);
      else if (g.contact === 'swing') {
        // úpravu z konce odvalení plynule přenést do začátku švihu (žádné cuknutí při odlepení)
        const sw = (qs[i] - ev.toeOff) / (1 - ev.toeOff);
        if (sw < 0.3) {
          const k = 1 - smoothstep(sw / 0.3);
          const f0 = footAt(ev.toeOff - 1e-6, S, w, geom, rel[i] ?? undefined);
          let f1 = reachAdjust(f0, i);
          if (anchored[i]) {
            // skutečný konec opory (z kotvy, včetně úpravy dosahu) → posun v obraze vůči odhadu z dráhy
            const oa = opts.anchors![i]!, o = anchorAt(i), ag = oa.gx !== undefined ? { x: oa.gx, y: oa.gy! } : { x: gfx, y: gfy };
            const at = (ff: { u: number; h: number }) => ({ x: o.x + ag.x * ff.u, y: o.y - ff.h + ag.y * ff.u });
            const reach = (ff: { u: number; h: number }) => { const q = flat(at(ff), i); return Math.hypot(q.x - hipRoots[i].x, q.y - hipRoots[i].y); };
            let fa: { u: number; h: number; theta: number } = footAt(ev.toeOff - 1e-6, S, w, geom, 0);
            if (reach(fa) > maxD) {
              const toeU = fa.u - (-geom.toe * Math.cos(fa.theta) - geom.AH * Math.sin(fa.theta));
              const rot = (th: number) => ({ u: toeU + (-geom.toe * Math.cos(th) - geom.AH * Math.sin(th)), h: -geom.toe * Math.sin(th) + geom.AH * Math.cos(th), theta: th });
              let lo = fa.theta, hi = -1.45;
              if (reach(rot(hi)) > maxD) fa = rot(hi);
              else { for (let n = 0; n < 24; n++) { const mid = (lo + hi) / 2; if (reach(rot(mid)) > maxD) lo = mid; else hi = mid; } fa = rot(hi); }
            }
            const pA = at(fa);
            const pE = { x: sideX(i) * v.hipSpread + gfx * f0.u, y: -f0.h + gfy * f0.u };
            swingShift[i] = { x: (pA.x - pE.x) * k, y: (pA.y - pE.y) * k };
            f1 = { ...f0, theta: fa.theta };
          }
          feet[i] = { u: feet[i].u + (f1.u - f0.u) * k, h: feet[i].h + (f1.h - f0.h) * k, theta: feet[i].theta + (f1.theta - f0.theta) * k };
        }
      }
    }
  }
  const ankles: Vec2[] = feet.map((f, i) => { const p = ankleXY(f, i); return { x: p.x + swingShift[i].x + settleShift[i].x, y: p.y + swingShift[i].y + settleShift[i].y }; });
  let lower = 0;
  for (let i = 0; i < 2; i++) {
    const inContact = a.settle || b < 1 || gaitFeet[i].contact !== 'swing';
    if (!inContact) continue;
    const fa = flat(ankles[i], i);
    const dx = fa.x - hipRoots[i].x, dy = fa.y - hipRoots[i].y; // dy > 0: kotník pod kyčlí
    if (dx * dx + dy * dy > maxD * maxD) lower = Math.max(lower, dy - Math.sqrt(Math.max(0, maxD * maxD - dx * dx)));
  }
  if (lower > 0) { hip.y += lower; for (const r of hipRoots) r.y += lower; }
  const legs = [0, 1].map((i) => {
    const l = ik(hipRoots[i], flat(ankles[i], i), T, Sh, -1);
    if (!shear) return l;
    const joint = unflat(l.joint, i), end = unflat(l.end, i);
    return { root: l.root, joint, end, k1: Math.hypot(joint.x - l.root.x, joint.y - l.root.y) / T, k2: Math.hypot(end.x - joint.x, end.y - joint.y) / Sh };
  }) as [Limb, Limb];
  const footAng = feet.map((f) => -f.theta * (Math.abs(fx) > 0.9 ? 1 : 0.75));
  // body paty v lokálních souřadnicích (pro uložení kotvy při došlapu)
  const heelPts = ankles.map((A, i) => { const g = gOf(i), th = feet[i].theta, hu = -geom.heel * Math.cos(th) + geom.AH * Math.sin(th), hh = -geom.heel * Math.sin(th) - geom.AH * Math.cos(th); return { x: A.x + g.x * hu, y: A.y - hh + g.y * hu }; }) as [Vec2, Vec2];
  void qs;

  // --- trup, krk, hlava: předklon a jeho kmitání z tabulky, hlava stabilizovaná (absolutní pitch)
  const breathe = (0.5 + 0.5 * Math.sin((tIdle / 3.6) * Math.PI * 2)) * I.breathe;
  const fsg = Math.sign(fx || 1);
  const trunkPitch = (sampleGait('trunkPitchDeg', q0, w) + (motion.lean - 1)) * DEG * b;
  const torsoAngle = -Math.PI / 2 + trunkPitch * fsg - shiftIdle * 0.004;
  const neck = { x: hip.x + Math.cos(torsoAngle) * B.torso, y: hip.y + Math.sin(torsoAngle) * B.torso - breathe };
  const headTiltIdle = I.headAmp * (Math.sin(tIdle * 0.71 + motion.phase * 6.2) + 0.5 * Math.sin(tIdle * 1.37 + motion.phase * 3.1));
  const headPitch = sampleGait('headPitchDeg', q0, w) * DEG * b;
  let headTilt = headTiltIdle * (1 - b) + (headPitch - trunkPitch) * fsg; // odečíst orientaci rodiče
  const head = { x: neck.x + v.headOffsetX, y: neck.y - B.neck };
  const shoulder = { x: neck.x + v.shoulderOffsetX, y: neck.y + B.shoulderDrop };

  // --- paže: tabulka ramene a lokte vůči stejnostranné noze (pravá paže vzadu při došlapu pravé nohy)
  const thoraxYaw = sampleGait('thoraxRotationDeg', q0, w) * DEG * b;
  const halfSh = Math.max(v.shoulderSpread, 0.1 * L);
  const armRoot = (i: number) => {
    const sgn = i === 0 ? 1 : -1;
    const fwd = sgn * halfSh * Math.sin(thoraxYaw) * (front ? 1 : 0.6);
    return { x: shoulder.x + sideX(i) * v.shoulderSpread + fx * fwd, y: shoulder.y + fy * fwd * 0.35 };
  };
  const lag = (motion.armLag ?? 0) / 100;
  const armFK = (i: number): Limb => {
    const root = armRoot(i);
    const q = qs[i] - lag;
    const scale = motion.armSwing * (i === 0 ? motion.armLR ?? 1 : 2 - (motion.armLR ?? 1));
    const sh = sampleGait('shoulderFlexDeg', q, w), shMean = -4;
    const shoulderFlex = (-2 + (shMean + (sh - shMean) * scale + 2) * b) * DEG;
    const elbow = (10 + (sampleGait('elbowFlexDeg', q, w) - 10) * b) * DEG;
    const out = v.shoulderSpread ? sideX(i) * 2.5 : 0;
    const vec = (t: number, len: number) => ({ x: Math.sin(t) * len * fx, y: Math.cos(t) * len + Math.sin(t) * len * fy * 0.4 });
    const ua = trunkPitch * fsg * 0 + shoulderFlex + trunkPitch; // absolutní úhel nadloktí (vpřed kladně)
    const e = vec(ua, B.upperArm), w2 = vec(ua + elbow, B.forearm);
    const joint = { x: root.x + e.x + out * 0.5, y: root.y + e.y };
    return { root, joint, end: { x: joint.x + w2.x + out * 0.5, y: joint.y + w2.y } };
  };
  const backRoot = armRoot(0), frontRoot = armRoot(1);
  const armBackFK = armFK(0), armFrontFK = armFK(1);
  const swingTarget = (root: Vec2, _r: number) => (root === frontRoot ? armFrontFK.end : armBackFK.end);
  let backTarget: Vec2 | null = null;
  const holdPos = { x: frontRoot.x + 13 * fx + (v.shoulderSpread ? 3 * ns : 0), y: hip.y - 4 };
  let frontTarget: Vec2 | null = holding ? holdPos : null;

  const act = a.action;
  if (act && act.clip !== null) {
    const t = act.duration > 0 ? act.time / act.duration : 1;
    switch (act.clip) {
      case 'talk': {
        const g = Math.sin((act.time / 0.7) * Math.PI * 2);
        backTarget = { x: backRoot.x + 12 * fx, y: shoulder.y + 22 + g * 5 };
        headTilt += g * 0.05;
        break;
      }
      case 'receive': {
        const reach = { x: frontRoot.x + 30 * fx, y: shoulder.y + 20 };
        const k = t < 0.55 ? smoothstep(t / 0.55) : 1 - smoothstep((t - 0.55) / 0.45);
        const rest = holding ? holdPos : swingTarget(frontRoot, 0);
        frontTarget = { x: rest.x + (reach.x - rest.x) * k, y: rest.y + (reach.y - rest.y) * k };
        break;
      }
      case 'drink': {
        const mouth = { x: head.x + 9 * fx + (view === 'side' ? 4 : 0), y: head.y + 7 };
        const k = t < 0.32 ? smoothstep(t / 0.32) : t < 0.62 ? 1 : 1 - smoothstep((t - 0.62) / 0.38);
        frontTarget = { x: holdPos.x + (mouth.x - holdPos.x) * k, y: holdPos.y + (mouth.y - holdPos.y) * k };
        headTilt += -0.12 * k;
        break;
      }
      case 'drop': {
        const down = { x: frontRoot.x + 26 * fx, y: hip.y + 8 };
        const k = t < 0.5 ? smoothstep(t / 0.5) : 1 - smoothstep((t - 0.5) / 0.5);
        const rest = holding ? holdPos : swingTarget(frontRoot, 0);
        frontTarget = { x: rest.x + (down.x - rest.x) * k, y: rest.y + (down.y - rest.y) * k };
        break;
      }
    }
  }
  const arms = [backTarget ? ik(backRoot, backTarget, B.upperArm, B.forearm, 1) : armBackFK, frontTarget ? ik(frontRoot, frontTarget, B.upperArm, B.forearm, 1) : armFrontFK] as [Limb, Limb];
  return { view, mirror, root: { x: 0, y: 0 }, hip, neck, shoulder, head, headTilt, torsoAngle, legs, arms, feet: [footAng[0], footAng[1]], handR: arms[1].end, heelPts };
}

/** Geometrie chůze ze šablony (výchozí bota podle zadání: pata 0,042 L, přednoží 0,113 L). */
export function footGeomOf(tpl: SkeletonTemplate): FootGeom {
  const L = tpl.bones.thigh + tpl.bones.shin;
  return { L, AH: tpl.bones.ankleHeight, heel: tpl.foot?.heel ?? 0.042 * L, toe: tpl.foot?.toe ?? 0.113 * L };
}

export function boneAngle(from: Vec2, to: Vec2): number { return Math.atan2(to.y - from.y, to.x - from.x); }
