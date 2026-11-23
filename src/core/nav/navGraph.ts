import type { Vec2 } from '../math/vec';
import { dist } from '../math/vec';
import { segmentCrossesPolygon } from '../math/geom';
import type { NavEdge, NavNode, ProjectFile } from '../model/types';
import { collectObstacles } from '../scene/geometry';

export interface NavLink { to: string; edgeId: string; length: number; narrow: boolean }
export interface BlockedEdge { edgeId: string; obstacleName: string }

export interface NavGraph {
  nodes: Map<string, NavNode>;
  edges: Map<string, NavEdge>;
  out: Map<string, NavLink[]>;
  blocked: BlockedEdge[];
  obstacles: { id: string; name: string; polygon: Vec2[] }[];
}

export function buildNavGraph(p: ProjectFile): NavGraph {
  const nodes = new Map(p.nav.nodes.map((n) => [n.id, n]));
  const edges = new Map(p.nav.edges.map((e) => [e.id, e]));
  const out = new Map<string, NavLink[]>();
  for (const n of p.nav.nodes) out.set(n.id, []);
  const obstacles = collectObstacles(p);
  const blocked: BlockedEdge[] = [];
  for (const e of p.nav.edges) {
    const a = nodes.get(e.a), b = nodes.get(e.b);
    if (!a || !b || a === b) continue;
    const hit = obstacles.find((o) => segmentCrossesPolygon(a, b, o.polygon));
    if (hit) { blocked.push({ edgeId: e.id, obstacleName: hit.name }); continue; } // nikdy neprojde překážkou
    const length = dist(a, b);
    out.get(a.id)!.push({ to: b.id, edgeId: e.id, length, narrow: e.narrow });
    if (!e.oneWay) out.get(b.id)!.push({ to: a.id, edgeId: e.id, length, narrow: e.narrow });
  }
  // Deterministické pořadí sousedů.
  for (const list of out.values()) list.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0));
  return { nodes, edges, out, blocked, obstacles };
}

export interface PathResult { nodes: string[]; edges: string[]; length: number }

/** A* po síti tras (respektuje jednosměrná spojení a zablokovaná spojení). */
export function findPath(g: NavGraph, from: string, to: string): PathResult | null {
  if (!g.nodes.has(from) || !g.nodes.has(to)) return null;
  if (from === to) return { nodes: [from], edges: [], length: 0 };
  const goal = g.nodes.get(to)!;
  const h = (id: string) => dist(g.nodes.get(id)!, goal);
  const gScore = new Map<string, number>([[from, 0]]);
  const came = new Map<string, { prev: string; edge: string }>();
  const open: { id: string; f: number }[] = [{ id: from, f: h(from) }];
  const closed = new Set<string>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f || (open[i].f === open[bi].f && open[i].id < open[bi].id)) bi = i;
    const cur = open.splice(bi, 1)[0].id;
    if (cur === to) {
      const nodes = [to], edges: string[] = [];
      let c = to;
      while (c !== from) { const s = came.get(c)!; edges.unshift(s.edge); nodes.unshift(s.prev); c = s.prev; }
      return { nodes, edges, length: gScore.get(to)! };
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    for (const l of g.out.get(cur) ?? []) {
      if (closed.has(l.to)) continue;
      const ng = gScore.get(cur)! + l.length;
      if (ng < (gScore.get(l.to) ?? Infinity)) {
        gScore.set(l.to, ng); came.set(l.to, { prev: cur, edge: l.edgeId });
        open.push({ id: l.to, f: ng + h(l.to) });
      }
    }
  }
  return null;
}

/** Nejbližší uzel, ze kterého vede přímá spojnice k bodu bez křížení překážky. */
export function nearestAccessibleNode(g: NavGraph, p: Vec2, maxDist = 260): string | null {
  let best: string | null = null, bd = Infinity;
  for (const n of g.nodes.values()) {
    const d = dist(n, p);
    if (d >= bd || d > maxDist) continue;
    if (g.obstacles.some((o) => segmentCrossesPolygon(n, p, o.polygon))) continue;
    best = n.id; bd = d;
  }
  return best;
}

export function nearestNode(g: NavGraph, p: Vec2): string | null {
  let best: string | null = null, bd = Infinity;
  for (const n of g.nodes.values()) { const d = dist(n, p); if (d < bd) { bd = d; best = n.id; } }
  return best;
}
