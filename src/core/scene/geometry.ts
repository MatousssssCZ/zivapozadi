import type { Vec2 } from '../math/vec';
import type { DepthSettings, InteractionPoint, ProjectFile, SceneObject } from '../model/types';
import { clamp, lerp } from '../math/vec';

/** Převod lokálního bodu objektu (vůči kotvě, měřítko 1) na souřadnice scény. */
export function objectLocalToScene(o: SceneObject, p: Vec2): Vec2 {
  return { x: o.x + (o.flipX ? -p.x : p.x) * o.scale, y: o.y + p.y * o.scale };
}

export function interactionPointWorld(o: SceneObject, pt: InteractionPoint): { pos: Vec2; facing: number | undefined } {
  const pos = objectLocalToScene(o, pt.offset);
  let facing = pt.facing;
  if (facing !== undefined && o.flipX) facing = Math.PI - facing;
  return { pos, facing };
}

export function objectFootprintWorld(o: SceneObject): Vec2[] | null {
  if (!o.footprint || o.footprint.length < 3) return null;
  return o.footprint.map((p) => objectLocalToScene(o, p));
}

/** Pevné překážky: ručně označené oblasti + kolizní stopy viditelných objektů ve světové vrstvě. */
export function collectObstacles(p: ProjectFile): { id: string; name: string; polygon: Vec2[] }[] {
  const out: { id: string; name: string; polygon: Vec2[] }[] = [];
  for (const a of p.areas) if (a.kind === 'obstacle' && a.polygon.length >= 3) out.push({ id: a.id, name: a.name, polygon: a.polygon });
  for (const o of p.objects) {
    if (!o.visible || o.layer !== 'world') continue;
    const fp = objectFootprintWorld(o);
    if (fp) out.push({ id: o.id, name: o.name, polygon: fp });
  }
  return out;
}

/**
 * Měřítko podle svislé polohy (perspektiva). Lineární a omezené na interval mezi okraji,
 * takže samotný pohyb vodorovně velikost nemění a svislý pohyb ji mění plynule a monotónně.
 */
export function depthScaleAt(d: DepthSettings, y: number): number {
  if (!d.enabled || d.yNear === d.yFar) return 1;
  const t = clamp((y - d.yFar) / (d.yNear - d.yFar), 0, 1);
  return lerp(d.scaleFar, d.scaleNear, t);
}

/**
 * Perspektivní zkrácení hloubky: 1 jednotka pohybu „do scény“ (svisle po obrazovce) odpovídá
 * 1/K jednotkám skutečné dráhy (kamera jen mírně nad úrovní očí). Chůze do hloubky je tak na
 * obrazovce pomalejší a kroky se do svislé osy promítají zkrácené – nohy pak dosáhnou na zem.
 */
export const GROUND_DEPTH_K = 0.4;
/** Skutečná (fyzická) délka posunu po zemi z posunu na obrazovce. */
export function groundLen(dx: number, dy: number): number { return Math.hypot(dx, dy / GROUND_DEPTH_K); }
/** Směr na zemi (fyzický úhel) ze směru na obrazovce. */
export function groundAngle(screenAngle: number): number { return Math.atan2(Math.sin(screenAngle) / GROUND_DEPTH_K, Math.cos(screenAngle)); }
