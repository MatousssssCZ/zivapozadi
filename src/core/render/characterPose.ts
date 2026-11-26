import type { AgentState } from '../sim/types';
import type { CharacterManifest } from '../anim/manifest';
import { resolveDirection } from '../anim/manifest';
import { figurePose, TEST_FIGURE_TEMPLATE, type BaseDir } from '../anim/testFigure';
import type { GaitContext } from '../anim/animator';
import type { DepthSettings, SceneSettings } from '../model/types';
import { cameraFor, groundStepLocal, worldAngleOfScreen, Q, type Camera } from '../scene/camera';
import type { CharacterAppearance } from '../anim/partLibrary';
import { resolveView } from '../anim/partLibrary';
import { skeletonPose, viewForDirection, footGeomOf, type SkeletonPose, type ViewId, type PoseOptions, type Anchor } from '../anim/skeleton';
import { depthScaleAt } from '../scene/geometry';
import { assembleRig, scaledTemplate, type RigAssembly } from './rigRenderer';
import { accessoriesOf } from './accessories';

/** Vektorové doplňky (čepice, šála, palčáky) místo malovaných – výchozí zapnuto. */
let vectorAccessories = true;
export function setVectorAccessories(on: boolean) { vectorAccessories = on; }
import type { Vec2 } from '../math/vec';
import { hashString } from '../math/rng';
import { ELDER_PROFILES } from '../anim/elderGait';
import { BLADE_H } from '../sim/rink';
import type { MotionParams, SkeletonTemplate } from '../anim/skeleton';
import { bodyOf, templateFor, type BodyProfile } from '../vector/body';
import { outfitFor, type Outfit } from '../vector/outfit';
import { figureGeo } from '../vector/figure';
import type { FootGeom } from '../anim/gaitKinematics';

/** Vektorové postavy (tělo, oděv, hlava bez rastrových dílů) – kostra, činnosti a kontakty zůstávají společné. */
let vectorFigures = false;
export function setVectorFigures(on: boolean) { vectorFigures = on; }
export function vectorFiguresOn() { return vectorFigures; }
/** Vektorový plán postavy: tělesný profil, outfit (stabilní ze seedu) a kostra podle profilu. */
export function vectorPlan(tpl: SkeletonTemplate & { id: string }, app: CharacterAppearance, routine?: string): { body: BodyProfile; outfit: Outfit; tpl: SkeletonTemplate } {
  const child = /child/.test(tpl.id), age = child ? 'child' : app.seed % 7 === 0 ? 'senior' : 'adult';
  const body = bodyOf(app.seed, age);
  void routine;
  return { body, outfit: outfitFor(app.seed >> 3, age), tpl: templateFor(tpl, body) };
}

export interface CharacterVisual {
  x: number; y: number; scale: number; mirror: boolean;
  pose: SkeletonPose & { base?: BaseDir };
  /** Sestava malovaných dílů (backend `skeleton`). */
  rig?: RigAssembly;
  /** Úchopový bod přední ruky v lokálních souřadnicích. */
  grip: Vec2;
  /** Požadovaný a skutečně použitý pohled (náhrada je explicitní). */
  view?: { requested: ViewId; used: ViewId; substituted: boolean };
  warning?: string;
  /** Vektorová postava: tělo, outfit, geometrie chodidla. */
  vec?: { body: BodyProfile; outfit: Outfit; foot: FootGeom };
}

/** Pohybové parametry upravené profilem seniora (předklon, menší švih paží a pohupování). */
export function motionOf(agent: AgentState, m: MotionParams): MotionParams {
  const e = agent.anim.elder; if (!e) return m;
  const p = ELDER_PROFILES[e.p];
  return { ...m, lean: m.lean + p.leanDeg + e.dLean, armSwing: m.armSwing * p.armSwing, bob: m.bob * p.bob, sway: m.sway * 1.15 };
}

export interface CharacterLook { baseScale: number; appearance?: CharacterAppearance; routine?: string }

/**
 * Jediný zdroj pravdy pro vizuální polohu postavy a jejích úchopových bodů
 * (používá simulace, náhled i export).
 */
export function characterVisual(agent: AgentState, m: CharacterManifest, look: CharacterLook, sceneOrDepth: DepthSettings | SceneSettings): CharacterVisual {
  // kamera scény (při samotném nastavení hloubky: šířka 1920 px, zorný úhel 50°)
  const scene: SceneSettings = 'depth' in sceneOrDepth ? sceneOrDepth : { width: 1920, height: 1080, depth: sceneOrDepth } as SceneSettings;
  const depth = scene.depth, cam = cameraFor(scene);
  const scale = look.baseScale * depthScaleAt(depth, agent.pos.y);
  // vizuální kořen = poloha na trase + posun z rozestupů (simulace ho mění jen spolu s kroky)
  const x = agent.pos.x + (agent.off?.x ?? 0);
  const y = agent.pos.y + (agent.off?.y ?? 0);
  const lib = m.rigLibrary, app = look.appearance;
  if (m.backend === 'skeleton' && lib && app) {
    const tpl = lib.bodyTemplates.find((t) => t.id === app.bodyTemplate) ?? lib.bodyTemplates[0];
    const req = viewForDirection(agent.anim.dir);
    const rv = { ...resolveView(tpl, req.view) };
    const vp = vectorFigures && look.routine !== 'baker' ? vectorPlan(scaledTemplate(tpl, app.proportions) as SkeletonTemplate & { id: string }, app, look.routine) : null;
    const stpl = vp ? vp.tpl : scaledTemplate(tpl, app.proportions);
    if (vp && vp.tpl.views[req.view]) { rv.use = req.view; rv.substituted = false; } // vektorová postava má všechny pohledy
    const pose = skeletonPose(stpl, rv.use, req.mirror, agent.anim, agent.holding !== null && agent.holdingKind !== 'bag' && agent.holdingKind !== 'mitten' && agent.holdingKind !== 'shovel', motionOf(agent, app.motion), hashString(agent.id), { ...groundOptions(agent, x, y, scale, req.mirror, cam), snowSink: (agent.snowDepth ?? 0) > 0 && agent.anim ? (agent.snowDepth ?? 0) / Q : 0 });
    const rig = assembleRig(lib, tpl, app, pose, rv.use, vectorAccessories && look.routine !== 'baker' ? accessoriesOf(app, /child/.test(tpl.id)) : null);
    // závěj přes spodek zabořené boty (kreslí se hned po botě; barvu dodá vykreslování z pozadí)
    // brusle: nůž pod podrážkou (pata → přednoží), výška držáku = BLADE_H délky nohy
    if (agent.anim.skate || agent.anim.bladesOn) {
      const g = footGeomOf(stpl), Lg = stpl.bones.thigh + stpl.bones.shin;
      rig.blades = [0, 1].map((i) => {
        const A = pose.legs[i].end, r = pose.feet[i], cs = Math.cos(r), sn = Math.sin(r);
        const P = (x: number, y: number) => ({ x: A.x + x * cs - y * sn, y: A.y + x * sn + y * cs });
        return { heel: P(-g.heel, g.AH), toe: P(g.toe, g.AH), drop: BLADE_H * Lg };
      }) as RigAssembly['blades'];
    }
    if (pose.snowSink) {
      const g = footGeomOf(stpl);
      rig.snowLips = [0, 1].map((i) => {
        const sk = pose.snowSink![i];
        if (sk < 0.05) return null;
        const A = pose.legs[i].end;
        // celá podrážka: od paty po špičku (s malým přesahem)
        return { x: A.x + (g.toe - g.heel) / 2, y: A.y + g.AH - sk, w: (g.heel + g.toe) * 1.12, h: Math.max(0.5, sk * 0.9), px: A.x, py: A.y, rot: pose.feet[i] };
      }) as RigAssembly['snowLips'];
    }
    if (vp) {
      // úchop: dlaň blízké ruky (vektorová ruka navazuje na předloktí)
      const a1 = pose.arms[1], d = { x: a1.end.x - a1.joint.x, y: a1.end.y - a1.joint.y }, dl = Math.hypot(d.x, d.y) || 1;
      rig.grip = { x: a1.end.x + (d.x / dl) * vp.body.hand * 0.55, y: a1.end.y + (d.y / dl) * vp.body.hand * 0.55 };
      // doplňky z outfitu (sladěné barvy), geometrie z vektorové hlavy a krku
      const of = vp.outfit, c = of.colors;
      rig.acc = { spec: { hat: of.hat === 'fitted' ? 'beanie' : of.hat, hatColor: of.hat === 'fitted' ? c.support : c.accent, hatColor2: c.support, hatStripes: (app.seed & 3) === 1, slouch: of.hat === 'fitted' ? 0 : ((app.seed >> 4) % 5) * 0.05,
        scarf: of.scarf, scarfColor: of.scarf === 'tube' ? c.support : c.accent, scarfColor2: c.support, scarfStripes: (app.seed & 4) === 4, tailLen: 0.9 + ((app.seed >> 6) % 4) * 0.1, mittens: false, mittenColor: c.accent, mittenCuff: c.support },
        geo: figureGeo(pose, vp.body, rv.use), order: rig.acc?.order ?? { hat: 0, scarf: 0, mitten: [0, 0] } };
    }
    return { x, y, scale, mirror: req.mirror, pose, rig, grip: rig.grip, view: { requested: req.view, used: rv.use, substituted: rv.substituted },
      warning: rig.missing.length ? `Chybí díly: ${rig.missing.join(', ')}` : undefined, vec: vp ? { body: vp.body, outfit: vp.outfit, foot: footGeomOf(stpl) } : undefined };
  }
  const rd = resolveDirection(m, agent.anim.dir);
  const base: BaseDir = rd.use === 'E' ? 'E' : rd.use === 'NE' ? 'NE' : 'SE';
  const mirror = rd.mirror !== (rd.use === 'W' || rd.use === 'SW' || rd.use === 'NW');
  const pose = figurePose(agent.anim, agent.holding !== null, { base, mirror });
  return { x, y, scale, mirror, pose, grip: pose.handR, warning: rd.warning };
}

/**
 * Promítnutý krok kamerou scény (lokálně, se zrcadlením): 1 jednotka chůze ve světovém směru → posun
 * v jednotkách postavy. Do strany ≈ (1, 0), do hloubky jen ≈ (0, −h/Z) – chůze po rovině, ne po schodech.
 * Pohled vždy odpovídá směru – pojistka proti chůzi „pozpátku“ (vodorovná složka aspoň 0,05).
 */
function groundVec(cam: Camera, at: Vec2, worldAngle: number, sx: number): Vec2 {
  const g = groundStepLocal(cam, at, worldAngle);
  return { x: Math.max(0.05, sx * g.x), y: g.y };
}

/**
 * Promítnutí země pro kostru: skutečný směr pohybu ve scéně (lokálně, se zrcadlením) a světové kotvy pat
 * převedené do lokálních souřadnic postavy.
 */
function groundOptions(agent: AgentState, x: number, y: number, scale: number, mirror: boolean, cam: Camera): PoseOptions {
  const sx = mirror ? -1 : 1;
  const gh = agent.groundHeading ?? worldAngleOfScreen(cam, agent.pos, agent.facing); // světový směr chůze
  const ground = groundVec(cam, { x, y }, gh, sx);
  const an = agent.anim.anchors, xy = agent.anim.anchorsXY;
  const anchors = [0, 1].map((i) => {
    const k = an?.[i], p = xy?.[i];
    if (!(p && (agent.anim.settle || (k != null && p.key === k)))) return null;
    const out: Anchor = { x: sx * (p.x - x) / scale, y: (p.y - y) / scale };
    if (p.h !== undefined) { const g = groundVec(cam, p, p.h, sx); out.gx = g.x; out.gy = g.y; }
    return out;
  }) as [Anchor | null, Anchor | null];
  const e = agent.anim.elder, ct = e?.tipXY && e.tip != null && e.tipXY.key === e.tip ? { x: sx * (e.tipXY.x - x) / scale, y: (e.tipXY.y - y) / scale } : null;
  return { ground, anchors, footSide: Math.abs(Math.cos(gh)), caneTip: ct };
}

/** Údaje pro chůzi postavy (délka nohy, bota, individuální délka kroku) – stejné pro simulaci i náhled. */
export function gaitContextFor(m: CharacterManifest, look: CharacterLook): GaitContext {
  const lib = m.rigLibrary, app = look.appearance;
  if (m.backend === 'skeleton' && lib && app) {
    const tpl = lib.bodyTemplates.find((t) => t.id === app.bodyTemplate) ?? lib.bodyTemplates[0];
    const st0 = scaledTemplate(tpl, app.proportions);
    const st = vectorFigures && look.routine !== 'baker' ? vectorPlan(st0 as SkeletonTemplate & { id: string }, app, look.routine).tpl : st0;
    return { legLen: st.bones.thigh + st.bones.shin, strideScale: app.motion.strideScale, foot: footGeomOf(st) };
  }
  const L = TEST_FIGURE_TEMPLATE.bones.thigh + TEST_FIGURE_TEMPLATE.bones.shin;
  return { legLen: L, strideScale: 1, foot: footGeomOf(TEST_FIGURE_TEMPLATE) };
}

export function localToScene(cv: CharacterVisual, p: Vec2): Vec2 {
  return { x: cv.x + (cv.mirror ? -p.x : p.x) * cv.scale, y: cv.y + p.y * cv.scale };
}
