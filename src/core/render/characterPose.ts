import type { AgentState } from '../sim/types';
import type { CharacterManifest } from '../anim/manifest';
import { resolveDirection } from '../anim/manifest';
import { figurePose, type FigurePose, type BaseDir } from '../anim/testFigure';
import type { DepthSettings } from '../model/types';
import { depthScaleAt } from '../scene/geometry';
import type { Vec2 } from '../math/vec';

export interface CharacterVisual { x: number; y: number; scale: number; mirror: boolean; pose: FigurePose; warning?: string }

/**
 * Jediný zdroj pravdy pro vizuální polohu postavy a jejích úchopových bodů
 * (používá simulace, náhled i export).
 */
export function characterVisual(agent: AgentState, m: CharacterManifest, baseScale: number, depth: DepthSettings): CharacterVisual {
  const scale = baseScale * depthScaleAt(depth, agent.pos.y);
  // Mírné boční odsazení při chůzi (aby se protijdoucí postavy nepřekrývaly); v klidu nulové.
  const off = agent.lane * agent.anim.walkBlend * scale;
  const x = agent.pos.x - Math.sin(agent.facing) * off;
  const y = agent.pos.y + Math.cos(agent.facing) * off * 0.5;
  const rd = resolveDirection(m, agent.anim.dir);
  const base: BaseDir = rd.use === 'E' ? 'E' : rd.use === 'NE' ? 'NE' : 'SE';
  const mirror = rd.mirror !== (rd.use === 'W' || rd.use === 'SW' || rd.use === 'NW');
  const pose = figurePose(agent.anim, agent.holding !== null, { base, mirror });
  return { x, y, scale, mirror, pose, warning: rd.warning };
}

export function localToScene(cv: CharacterVisual, p: Vec2): Vec2 {
  return { x: cv.x + (cv.mirror ? -p.x : p.x) * cv.scale, y: cv.y + p.y * cv.scale };
}
