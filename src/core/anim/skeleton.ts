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
import { GAIT_PROFILE, curve } from './gaitProfile';
import type { AnimState } from './animator';
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
  motionRanges: Record<keyof Omit<MotionParams, 'phase'>, [number, number]>;
}

/** Individuální parametry pohybu postavy (omezené rozsahem šablony). */
export interface MotionParams {
  strideScale: number;
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

export interface Limb { root: Vec2; joint: Vec2; end: Vec2 }

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
export function skeletonPose(tpl: SkeletonTemplate, view: ViewId, mirror: boolean, a: AnimState, holding: boolean, motion: MotionParams, seed = 0): SkeletonPose {
  const v = tpl.views[view] ?? tpl.views.side ?? Object.values(tpl.views)[0]!;
  const B = tpl.bones, G = tpl.gait, I = tpl.idle;
  const fx = v.forward.x, fy = v.forward.y;
  const ns = v.nearSide ?? 1; // strana blízkých končetin
  const b = a.walkBlend;
  const ph = a.walkPhase;
  const legLen = B.thigh + B.shin;
  const restHipY = -(B.ankleHeight + legLen * 0.99);
  const tIdle = a.idleTime * motion.idleTempo + motion.phase * 10;

  // --- nohy: biomechanický model chůze (viz gaitProfile.ts)
  // Souřadnice nohy: u = vzdálenost vpřed od pánve (ve směru chůze), h = výška nad zemí.
  const GP = GAIT_PROFILE;
  const S = G.strideLength * motion.strideScale * (a.strideFactor ?? 1); // délka cyklu (2 kroky)
  const T = B.thigh, Sh = B.shin, AH = B.ankleHeight;
  const footHB = GP.heelBack * (legLen / 62), footBF = GP.ballFront * (legLen / 62);
  const rot = (x: number, y: number, t: number) => ({ u: x * Math.cos(t) - y * Math.sin(t), h: x * Math.sin(t) + y * Math.cos(t) });
  // při došlapu je kotník ~0,3 délky nohy před pánví (úměrně délce kroku); zbytek dráhy je za tělem
  const uHeel0 = GP.heelStrikeReach * S - footHB;
  /** kotník a úhel chodidla ve stojné fázi (planted body se vůči zemi nehýbou) */
  const stance = (p: number) => {
    if (p < GP.footFlat) {
      const th = GP.heelStrikeFoot * (1 - smoothstep(p / GP.footFlat));
      const heelU = uHeel0 - p * S; const r = rot(footHB, AH, th);
      return { u: heelU + r.u, h: r.h, foot: th };
    }
    if (p < GP.heelOff) return { u: uHeel0 - p * S + footHB, h: AH, foot: 0 };
    const ball0 = uHeel0 - GP.heelOff * S + footHB + footBF;
    const k = (p - GP.heelOff) / (GP.toeOff - GP.heelOff);
    const th = GP.toeOffFoot * Math.pow(k, 1.6);
    const ballU = ball0 - (p - GP.heelOff) * S; const r = rot(-footBF, AH, th);
    return { u: ballU + r.u, h: r.h, foot: th };
  };
  const st0 = stance(0), stEnd = stance(GP.toeOff);
  /** švih: dráha kotníku přes klíčové body (zvednutí paty vzadu, průchod pod pánví, natažení vpřed) */
  const swing = (p: number) => {
    const q = (p - GP.toeOff) / (1 - GP.toeOff);
    const ku: [number, number][] = [[0, stEnd.u], ...GP.swingAnkle.map(([t, f]) => [t, stEnd.u + (st0.u - stEnd.u) * f] as [number, number]), [1, st0.u]];
    const kh: [number, number][] = [[0, stEnd.h], ...GP.swingAnkle.map(([t, , hh]) => [t, AH + hh * legLen] as [number, number]), [1, st0.h]];
    return { u: curve(ku, q), h: curve(kh, q), foot: curve(GP.swingFoot, q) };
  };
  const ankles: Vec2[] = [], footAng: number[] = [], legPh: number[] = [], legRel: number[] = [];
  const hipsU: number[] = [];
  let hipH = 0;
  const idleH = AH + legLen * 0.99;
  for (let i = 0; i < 2; i++) {
    const p = (ph + (i === 0 ? 0 : 0.5)) % 1;
    legPh.push(p);
    const w = p < GP.toeOff ? stance(p) : swing(p);
    // pánev se otáčí vpřed na straně nohy, která jde dopředu
    const pr = GP.pelvisRotation * Math.cos(2 * Math.PI * p) * (legLen / 62);
    hipsU.push(pr);
    const side = (i === 0 ? -1 : 1) * ns;
    const uu = w.u * b, hh = AH + (w.h - AH) * b;
    ankles.push({ x: side * v.hipSpread + fx * uu, y: -hh + fy * uu * 0.35 });
    footAng.push(-w.foot * b * (Math.abs(fx) > 0.9 ? 1 : 0.75));
    legRel.push(w.u / Math.max(1e-6, S)); // poloha nohy vpřed (−0,3…+0,3)
  }
  // Výška pánve: nejníž při došlapu (obě nohy na zemi), nejvýš ve středu stoje; dvakrát za cyklus.
  // Spodní hodnota = přední noha při došlapu téměř natažená (koleno ~5°), rozkmit ~3,5 % délky nohy.
  {
    const pr0 = GP.pelvisRotation * (legLen / 62);
    const kf = (GP.stanceKnee[0][1] * Math.PI) / 180;
    const l = Math.sqrt(T * T + Sh * Sh + 2 * T * Sh * Math.cos(kf));
    const hLow = st0.h + Math.sqrt(Math.max(0, l * l - (st0.u - pr0) ** 2));
    const hTop = Math.min(AH + (T + Sh) * 0.995, hLow + GP.pelvisBob * legLen * motion.bob);
    // fáze nohy 0: došlap ⇒ minimum; ~0,25: střed stoje ⇒ maximum (cos 4π)
    hipH = hLow + (hTop - hLow) * (0.5 - 0.5 * Math.cos(4 * Math.PI * (ph - GP.pelvisBobShift)));
  }
  // přenesení váhy: při chůzi nad stojnou nohu, v klidu občasný přesun
  const swayWalk = Math.cos(ph * Math.PI * 2) * G.sway * motion.sway * b * (view === 'side' ? 0 : 1) * ns;
  const shiftIdle = weightShift(tIdle, I.shiftPeriod, seed) * I.shiftAmp * (1 - b) * (view === 'side' ? 0.3 : 1);
  const hip = { x: swayWalk + shiftIdle, y: -(idleH + (hipH - idleH) * b) };
  const legs = [0, 1].map((i) => {
    const side = (i === 0 ? -1 : 1) * ns;
    const drop = legPh[i] >= GP.toeOff ? Math.sin(Math.PI * (legPh[i] - GP.toeOff) / (1 - GP.toeOff)) * GP.pelvisDrop * b * (view === 'side' ? 0.3 : 1) : 0;
    const root = { x: hip.x + side * v.hipSpread + fx * hipsU[i] * b, y: hip.y + drop + fy * hipsU[i] * b * 0.35 };
    return ik(root, ankles[i], B.thigh, B.shin, -1);
  }) as [Limb, Limb];

  // --- trup, krk, hlava (mírný předklon rostoucí s rychlostí, kmitání 2× za cyklus, stabilizace hlavy)
  const breathe = (0.5 + 0.5 * Math.sin((tIdle / 3.6) * Math.PI * 2)) * I.breathe;
  const pitch = GP.torsoPitch * Math.cos(4 * Math.PI * (ph - 0.1)) * b;
  const torsoAngle = -Math.PI / 2 + (G.lean * motion.lean * (0.6 + 0.4 * (a.strideFactor ?? 1)) * b + pitch) * Math.sign(fx || 1) - shiftIdle * 0.004;
  const neck = { x: hip.x + Math.cos(torsoAngle) * B.torso, y: hip.y + Math.sin(torsoAngle) * B.torso - breathe };
  const headTiltIdle = I.headAmp * (Math.sin(tIdle * 0.71 + motion.phase * 6.2) + 0.5 * Math.sin(tIdle * 1.37 + motion.phase * 3.1));
  let headTilt = headTiltIdle * (1 - b * 0.6) - pitch * Math.sign(fx || 1) * 0.8; // hlava drží pohled
  const head = { x: neck.x + v.headOffsetX, y: neck.y - B.neck };
  const shoulder = { x: neck.x + v.shoulderOffsetX, y: neck.y + B.shoulderDrop };

  // --- paže: kyv v rameni proti opačné noze, loket se víc ohýbá při kyvu vpřed, hrudník protirotuje
  const armAmpScale = (G.armSwing / 0.4) * motion.armSwing * (0.55 + 0.45 * (a.strideFactor ?? 1));
  const armRoot = (side: number, legIdx: number) => {
    const counter = -GP.thoraxCounter * GAIT_PROFILE.pelvisRotation * Math.cos(2 * Math.PI * legPh[legIdx]) * b * (legLen / 62);
    return { x: shoulder.x + side * v.shoulderSpread + fx * counter, y: shoulder.y + fy * counter * 0.35 };
  };
  const armFK = (root: Vec2, contraPh: number, side: number): Limb => {
    const c = Math.cos(2 * Math.PI * (contraPh - GP.armLag));
    const ths = (-0.03 + (GP.armMean + GP.armAmp * armAmpScale * c + 0.03) * b);
    const el = 0.2 + (GP.elbowBase - 0.2 + GP.elbowAmp * armAmpScale * (0.5 + 0.5 * Math.cos(2 * Math.PI * (contraPh - GP.armLag - 0.05)))) * b;
    const out = v.shoulderSpread ? side * 2.5 : 0;
    const vec = (t: number, len: number) => ({ x: Math.sin(t) * len * fx, y: Math.cos(t) * len + Math.sin(t) * len * fy * 0.4 });
    const e = vec(ths, B.upperArm), w2 = vec(ths + el, B.forearm);
    const joint = { x: root.x + e.x + out * 0.5, y: root.y + e.y };
    return { root, joint, end: { x: joint.x + w2.x + out * 0.5, y: joint.y + w2.y } };
  };
  const backRoot = armRoot(-ns, 0), frontRoot = armRoot(ns, 1);
  // paže na straně nohy i se kývá s opačnou nohou (1 − i)
  const armBackFK = armFK(backRoot, legPh[1], -ns), armFrontFK = armFK(frontRoot, legPh[0], ns);
  const swingTarget = (root: Vec2, _r: number) => (root === frontRoot ? armFrontFK.end : armBackFK.end);
  void legRel;
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
  return { view, mirror, root: { x: 0, y: 0 }, hip, neck, shoulder, head, headTilt, torsoAngle, legs, arms, feet: [footAng[0], footAng[1]], handR: arms[1].end };
}

export function boneAngle(from: Vec2, to: Vec2): number { return Math.atan2(to.y - from.y, to.x - from.x); }
