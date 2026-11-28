import type { ProjectFile } from '../../core/model/types';
import type { Simulation } from '../../core/sim/simulation';
import type { Selection } from '../store';
import type { Vec2 } from '../../core/math/vec';
import { dist } from '../../core/math/vec';
import { distPointSegment, pointInPolygon } from '../../core/math/geom';
import { objectImageRect } from '../../core/render/sceneRenderer';
import { characterVisual } from '../../core/render/characterPose';
import { objectHandles } from '../overlay';

export type Hit =
  | { kind: 'scaleHandle'; id: string }
  | { kind: 'point'; id: string; pointId: string }
  | { kind: 'vertex'; owner: 'area' | 'zone' | 'plow'; id: string; index: number }
  | { kind: 'node' | 'character' | 'object' | 'edge' | 'zone' | 'area' | 'plowPath'; id: string }
  | null;

export function hitTest(p: ProjectFile, sim: Simulation | null, sel: Selection, m: Vec2, px: number, markers: boolean): Hit {
  const tol = 9 * px;
  if (sel?.kind === 'object' || sel?.kind === 'point') {
    const ob = p.objects.find((o) => o.id === sel.id);
    if (ob && !ob.locked) {
      const h = objectHandles(ob, p, px);
      if (Math.abs(m.x - h.scale.x) <= h.scale.size && Math.abs(m.y - h.scale.y) <= h.scale.size) return { kind: 'scaleHandle', id: ob.id };
    }
    if (ob) for (const rp of sim?.pointsOf(ob.id) ?? []) if (dist(rp.pos, m) <= tol) return { kind: 'point', id: ob.id, pointId: rp.point.id };
  }
  if (sel?.kind === 'area') { const a = p.areas.find((x) => x.id === sel.id); const i = a?.polygon.findIndex((q) => dist(q, m) <= tol) ?? -1; if (a && i >= 0) return { kind: 'vertex', owner: 'area', id: a.id, index: i }; }
  if (sel?.kind === 'zone') { const z = p.zones.find((x) => x.id === sel.id); const i = z?.bounds.findIndex((q) => dist(q, m) <= tol) ?? -1; if (z && i >= 0) return { kind: 'vertex', owner: 'zone', id: z.id, index: i }; }
  // trasa traktoru: body (když je vybraná)
  if (sel?.kind === 'plowPath' && p.plow) { const i = p.plow.path.findIndex((q) => dist(q, m) <= tol + 2 * px); if (i >= 0) return { kind: 'vertex', owner: 'plow', id: 'plow', index: i }; }
  if (markers) for (const n of [...p.nav.nodes].reverse()) if (dist(n, m) <= tol + 3 * px) return { kind: 'node', id: n.id };
  if (sim) {
    for (const a of [...sim.state.agents].sort((x, y) => y.pos.y - x.pos.y)) {
      if (a.hidden) continue;
      const c = sim.characterOf(a.id); const man = c && sim.manifests[c.assetId]; if (!c || !man) continue;
      const cv = characterVisual(a, man, c, p.scene);
      if (Math.abs(m.x - cv.x) <= 16 * cv.scale + 2 * px && m.y <= cv.y + 6 * cv.scale && m.y >= cv.y - man.height * cv.scale) return { kind: 'character', id: a.id };
    }
  }
  // objekty v obráceném pořadí vykreslení
  const removed = new Set(sim?.state.removedObjects ?? []);
  const vis = p.objects.map((o, i) => ({ o, i })).filter(({ o }) => o.visible && !removed.has(o.id));
  const order = [
    ...vis.filter(({ o }) => o.layer === 'background').sort((a, b) => a.o.zBias - b.o.zBias || a.i - b.i),
    ...vis.filter(({ o }) => o.layer === 'world').sort((a, b) => a.o.y + a.o.zBias - (b.o.y + b.o.zBias) || a.i - b.i),
    ...vis.filter(({ o }) => o.layer === 'foreground').sort((a, b) => a.o.zBias - b.o.zBias || a.i - b.i),
  ].reverse();
  for (const { o } of order) {
    const r = objectImageRect(o, p.assets.find((a) => a.id === o.assetId));
    if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) return { kind: 'object', id: o.id };
  }
  if (markers) {
    const nodes = new Map(p.nav.nodes.map((n) => [n.id, n]));
    for (const e of p.nav.edges) { const a = nodes.get(e.a), b = nodes.get(e.b); if (a && b && distPointSegment(m, a, b) <= tol * 0.8) return { kind: 'edge', id: e.id }; }
    if (p.plow) for (let i = 0; i < p.plow.path.length - 1; i++) if (distPointSegment(m, p.plow.path[i], p.plow.path[i + 1]) <= tol) return { kind: 'plowPath', id: 'plow' };
    for (const z of p.zones) for (let i = 0; i < z.bounds.length; i++) if (distPointSegment(m, z.bounds[i], z.bounds[(i + 1) % z.bounds.length]) <= tol) return { kind: 'zone', id: z.id };
    for (const a of [...p.areas].reverse()) if (a.polygon.length >= 3 && pointInPolygon(m, a.polygon)) return { kind: 'area', id: a.id };
  }
  return null;
}
