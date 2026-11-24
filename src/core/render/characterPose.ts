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
import type { Vec2 } from '../math/vec';
import { hashString } from '../math/rng';

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
}

export interface CharacterLook { baseScale: number; appearance?: CharacterAppearance }

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
    const rv = resolveView(tpl, req.view);
    const stpl = scaledTemplate(tpl, app.proportions);
    const pose = skeletonPose(stpl, rv.use, req.mirror, agent.anim, agent.holding !== null && agent.holdingKind !== 'bag' && agent.holdingKind !== 'mitten', app.motion, hashString(agent.id), { ...groundOptions(agent, x, y, scale, req.mirror, cam), snowSink: (agent.snowDepth ?? 0) > 0 && agent.anim ? (agent.snowDepth ?? 0) / Q : 0 });
    const rig = assembleRig(lib, tpl, app, pose, rv.use);
    // závěj přes spodek zabořené boty (kreslí se hned po botě; barvu dodá vykreslování z pozadí)
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
    return { x, y, scale, mirror: req.mirror, pose, rig, grip: rig.grip, view: { requested: req.view, used: rv.use, substituted: rv.substituted },
      warning: rig.missing.length ? `Chybí díly: ${rig.missing.join(', ')}` : undefined };
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
  return { ground, anchors, footSide: Math.abs(Math.cos(gh)) };
}

/** Údaje pro chůzi postavy (délka nohy, bota, individuální délka kroku) – stejné pro simulaci i náhled. */
export function gaitContextFor(m: CharacterManifest, look: CharacterLook): GaitContext {
  const lib = m.rigLibrary, app = look.appearance;
  if (m.backend === 'skeleton' && lib && app) {
    const tpl = lib.bodyTemplates.find((t) => t.id === app.bodyTemplate) ?? lib.bodyTemplates[0];
    const st = scaledTemplate(tpl, app.proportions);
    return { legLen: st.bones.thigh + st.bones.shin, strideScale: app.motion.strideScale, foot: footGeomOf(st) };
  }
  const L = TEST_FIGURE_TEMPLATE.bones.thigh + TEST_FIGURE_TEMPLATE.bones.shin;
  return { legLen: L, strideScale: 1, foot: footGeomOf(TEST_FIGURE_TEMPLATE) };
}

export function localToScene(cv: CharacterVisual, p: Vec2): Vec2 {
  return { x: cv.x + (cv.mirror ? -p.x : p.x) * cv.scale, y: cv.y + p.y * cv.scale };
}
