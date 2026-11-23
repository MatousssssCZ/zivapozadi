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
  const b = a.walkBlend;
  const ph = a.walkPhase;
  const legLen = B.thigh + B.shin;
  const restHipY = -(B.ankleHeight + legLen * 0.975);
  const tIdle = a.idleTime * motion.idleTempo + motion.phase * 10;

  // --- nohy (stojná / švihová fáze)
  const range = G.stanceFraction * G.strideLength * motion.strideScale;
  const f = G.stanceFraction;
  const ankles: Vec2[] = [], footAng: number[] = [], rel: number[] = [];
  for (let i = 0; i < 2; i++) {
    const p = (ph + (i === 0 ? 0 : 0.5)) % 1;
    let r: number, lift = 0, ang = 0;
    if (p < f) r = 0.5 - p / f;
    else { const s = (p - f) / (1 - f); r = -0.5 + smoothstep(s); lift = Math.sin(Math.PI * s) * G.stepLift; ang = -Math.sin(Math.PI * s) * 0.25; }
    rel.push(r);
    const side = i === 0 ? -1 : 1;
    ankles.push({ x: side * v.hipSpread + fx * r * range * b, y: -B.ankleHeight - lift * b + fy * r * range * b * 0.35 });
    footAng.push(ang * b);
  }
  // pokles pánve, aby obě nohy dosáhly (omezený – zbytek je odvalení přes špičku)
  let hipY = restHipY;
  for (let i = 0; i < 2; i++) {
    const dx = ankles[i].x - (i === 0 ? -1 : 1) * v.hipSpread;
    const need = ankles[i].y - Math.sqrt(Math.max(0, (legLen * 0.985) ** 2 - dx * dx));
    hipY = Math.max(hipY, need);
  }
  hipY = Math.min(hipY, restHipY + G.maxDip * motion.bob);
  // přenesení váhy: při chůzi nad stojnou nohu, v klidu občasný přesun
  const swayWalk = Math.cos(ph * Math.PI * 2) * G.sway * motion.sway * b * (view === 'side' ? 0 : 1);
  const shiftIdle = weightShift(tIdle, I.shiftPeriod, seed) * I.shiftAmp * (1 - b) * (view === 'side' ? 0.3 : 1);
  const hip = { x: swayWalk + shiftIdle, y: hipY };
  const legs = [0, 1].map((i) => {
    const side = i === 0 ? -1 : 1;
    const root = { x: hip.x + side * v.hipSpread, y: hip.y };
    return ik(root, ankles[i], B.thigh, B.shin, -1);
  }) as [Limb, Limb];

  // --- trup, krk, hlava
  const breathe = (0.5 + 0.5 * Math.sin((tIdle / 3.6) * Math.PI * 2)) * I.breathe;
  const torsoAngle = -Math.PI / 2 + G.lean * motion.lean * b * Math.sign(fx || 1) - shiftIdle * 0.004;
  const neck = { x: hip.x + Math.cos(torsoAngle) * B.torso, y: hip.y + Math.sin(torsoAngle) * B.torso - breathe };
  const headTiltIdle = I.headAmp * (Math.sin(tIdle * 0.71 + motion.phase * 6.2) + 0.5 * Math.sin(tIdle * 1.37 + motion.phase * 3.1));
  let headTilt = headTiltIdle * (1 - b * 0.6);
  const head = { x: neck.x + v.headOffsetX, y: neck.y - B.neck };
  const shoulder = { x: neck.x + v.shoulderOffsetX, y: neck.y + B.shoulderDrop };

  // --- paže: protipohyb k opačné noze
  const armLen = B.upperArm + B.forearm;
  const armRoot = (side: number) => ({ x: shoulder.x + side * v.shoulderSpread, y: shoulder.y });
  const swingTarget = (root: Vec2, legRel: number) => {
    const th = legRel * 2 * G.armSwing * motion.armSwing * b; // rad
    return { x: root.x + Math.sin(th) * (armLen - 3) * fx + (v.shoulderSpread ? Math.sign(root.x - shoulder.x) * 2.5 : 0), y: root.y + Math.cos(th) * (armLen - 3) + Math.sin(th) * fy * 6 };
  };
  const backRoot = armRoot(-1), frontRoot = armRoot(1);
  let backTarget = swingTarget(backRoot, rel[1]);
  const holdPos = { x: frontRoot.x + 13 * fx + (v.shoulderSpread ? 3 : 0), y: hip.y - 4 };
  let frontTarget = holding ? holdPos : swingTarget(frontRoot, rel[0]);

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
  const arms = [ik(backRoot, backTarget, B.upperArm, B.forearm, 1), ik(frontRoot, frontTarget, B.upperArm, B.forearm, 1)] as [Limb, Limb];
  return { view, mirror, root: { x: 0, y: 0 }, hip, neck, shoulder, head, headTilt, torsoAngle, legs, arms, feet: [footAng[0], footAng[1]], handR: arms[1].end };
}

export function boneAngle(from: Vec2, to: Vec2): number { return Math.atan2(to.y - from.y, to.x - from.x); }
