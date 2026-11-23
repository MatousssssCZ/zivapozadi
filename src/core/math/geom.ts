import type { Vec2 } from './vec';

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function orient(a: Vec2, b: Vec2, c: Vec2): number { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }

export function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const d1 = orient(q1, q2, p1), d2 = orient(q1, q2, p2), d3 = orient(p1, p2, q1), d4 = orient(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Prochází úsečka polygonem (protíná hranu nebo leží uvnitř)? */
export function segmentCrossesPolygon(a: Vec2, b: Vec2, poly: readonly Vec2[]): boolean {
  if (poly.length < 3) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (segmentsIntersect(a, b, poly[j], poly[i])) return true;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return pointInPolygon(mid, poly) || pointInPolygon(a, poly) || pointInPolygon(b, poly);
}

export function polygonBounds(poly: readonly Vec2[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function polygonsOverlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (let i = 0, j = a.length - 1; i < a.length; j = i++)
    for (let k = 0, l = b.length - 1; k < b.length; l = k++) if (segmentsIntersect(a[j], a[i], b[l], b[k])) return true;
  return (a.length > 0 && pointInPolygon(a[0], b)) || (b.length > 0 && pointInPolygon(b[0], a));
}

export function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
