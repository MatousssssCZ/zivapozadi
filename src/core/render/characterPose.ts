import type { AgentState } from '../sim/types';
import type { CharacterManifest } from '../anim/manifest';
import { resolveDirection } from '../anim/manifest';
import { figurePose, TEST_FIGURE_TEMPLATE, type BaseDir } from '../anim/testFigure';
import type { GaitContext } from '../anim/animator';
import type { DepthSettings } from '../model/types';
import type { CharacterAppearance } from '../anim/partLibrary';
import { resolveView } from '../anim/partLibrary';
import { skeletonPose, viewForDirection, footGeomOf, type SkeletonPose, type ViewId } from '../anim/skeleton';
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
export function characterVisual(agent: AgentState, m: CharacterManifest, look: CharacterLook, depth: DepthSettings): CharacterVisual {
  const scale = look.baseScale * depthScaleAt(depth, agent.pos.y);
  // Mírné boční odsazení při chůzi (aby se protijdoucí postavy nepřekrývaly); v klidu nulové.
  const off = agent.lane * agent.anim.walkBlend * scale;
  const x = agent.pos.x - Math.sin(agent.facing) * off;
  const y = agent.pos.y + Math.cos(agent.facing) * off * 0.5;
  const lib = m.rigLibrary, app = look.appearance;
  if (m.backend === 'skeleton' && lib && app) {
    const tpl = lib.bodyTemplates.find((t) => t.id === app.bodyTemplate) ?? lib.bodyTemplates[0];
    const req = viewForDirection(agent.anim.dir);
    const rv = resolveView(tpl, req.view);
    const stpl = scaledTemplate(tpl, app.proportions);
    const pose = skeletonPose(stpl, rv.use, req.mirror, agent.anim, agent.holding !== null, app.motion, hashString(agent.id));
    const rig = assembleRig(lib, tpl, app, pose, rv.use);
    return { x, y, scale, mirror: req.mirror, pose, rig, grip: rig.grip, view: { requested: req.view, used: rv.use, substituted: rv.substituted },
      warning: rig.missing.length ? `Chybí díly: ${rig.missing.join(', ')}` : undefined };
  }
  const rd = resolveDirection(m, agent.anim.dir);
  const base: BaseDir = rd.use === 'E' ? 'E' : rd.use === 'NE' ? 'NE' : 'SE';
  const mirror = rd.mirror !== (rd.use === 'W' || rd.use === 'SW' || rd.use === 'NW');
  const pose = figurePose(agent.anim, agent.holding !== null, { base, mirror });
  return { x, y, scale, mirror, pose, grip: pose.handR, warning: rd.warning };
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
