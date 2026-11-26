/** Zvířata v laboratoři postav (plně vektorový pes a kočka): tělesné typy, chůze/klus/plížení, pózy. */
import type { Direction } from '../../core/anim/manifest';
import { ANIMAL_BUILDS, drawVectorAnimal } from '../../core/vector/animal';
import { Q } from '../../core/scene/camera';
export const LAB_ANIMALS: [string, string][] = Object.values(ANIMAL_BUILDS).map((b) => [b.id, b.label]);
const YAW: Record<string, number> = { E: 0, W: 0, SE: 0.8, SW: 0.8, S: 1, NE: -0.8, NW: -0.8, N: -1 };
/** Póza laboratoře → režim simulace zvířete (sed, čichání / protažení, plížení, příprava a skok). */
export function drawLabAnimal(ctx: CanvasRenderingContext2D, id: string, t: number, distM: number, mps: number, dir: Direction, pose: string, bones: boolean) {
  const b = ANIMAL_BUILDS[id]; if (!b) return;
  const dog = b.species === 'dog';
  const mode = pose === 'rest' ? 'sit' : pose === 'bend' ? (dog ? 'sniff' : 'stretch') : pose === 'squat' ? 'notice' : pose === 'lift' ? 'prep' : pose === 'angel' ? 'jump' : 'walk';
  const sp = pose === 'walk' ? mps * (dog ? 1 : 0.6) : pose === 'squat' ? 0.3 * (mps > 0 ? 1 : 0) : 0;
  const pts = drawVectorAnimal(ctx, b, { dist: distM * (dog ? 1 : 0.6), speed: sp, t, mode, sit: mode === 'sit' ? 1 : 0, headDown: mode === 'sniff' ? 1 : 0, since: mode === 'jump' ? t - ((t * 0.8) % 0.5) : 0, until: t + 9, yaw: YAW[dir] ?? 0, alert: mode === 'notice' ? 1 : 0, seed: 3 }, 1 / Q, bones);
  if (bones) for (const q of pts) { ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, 1.4, 0, Math.PI * 2); ctx.fill(); }
}
