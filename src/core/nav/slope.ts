/**
 * Omezení sklonu chůze: postava nikdy nejde po obrazovce strměji než `maxDeg` od vodorovné
 * (čistě dopředu/dozadu). Strmý úsek trasy se projde šikmými úseky přesně pod mezním úhlem
 * (cik-cak kolem původní přímky) se zaoblenými obraty; výsledek nikdy neprotne překážku –
 * když by protnul, zkusí se druhá strana, jinak úsek zůstane rovný.
 */
import type { Vec2 } from '../math/vec';
import { segmentCrossesPolygon } from '../math/geom';
import type { Waypoint } from '../sim/types';

export interface SlopeOptions {
  maxDeg: number;
  obstacles: { polygon: Vec2[] }[];
  /** Úsek, který se netvaruje (úzký průchod). */
  keepStraight?: (edgeId: string | null) => boolean;
  /** Svislá výška jednoho „zubu“ (px). */
  legV?: number;
  /** Poloměr zaoblení obratu (px). */
  radius?: number;
}

export function limitSlope(start: Vec2, wps: Waypoint[], o: SlopeOptions): Waypoint[] {
  if (o.maxDeg >= 89.5) return wps;
  const t = Math.tan((o.maxDeg * Math.PI) / 180);
  const legV = o.legV ?? 200, R = o.radius ?? 12;
  const blocked = (a: Vec2, b: Vec2) => o.obstacles.some((ob) => segmentCrossesPolygon(a, b, ob.polygon));
  const out: Waypoint[] = [];
  let prev = start;
  for (const w of wps) {
    const dx = w.x - prev.x, dy = w.y - prev.y;
    // malá tolerance (0,5 px) – úsek přesně na mezi se netvaruje
    if (Math.abs(dy) <= Math.abs(dx) * t + 0.5 || Math.hypot(dx, dy) < 12 || o.keepStraight?.(w.edgeId)) { out.push(w); prev = w; continue; }
    const n = Math.max(1, Math.round(Math.abs(dy) / legV));
    const sdx = dx / n, sdy = dy / n, H = Math.abs(sdy) / t;
    let s0 = dx >= 0 ? 1 : -1; // první zub na stranu, kam úsek stejně míří
    for (let k = 0; k < n; k++) {
      const S = { x: prev.x + sdx * k, y: prev.y + sdy * k }, E = { x: prev.x + sdx * (k + 1), y: prev.y + sdy * (k + 1) };
      const apex = (s: number) => { const a = (sdx + s * H) / 2; return { x: S.x + a, y: S.y + Math.sign(sdy) * Math.abs(a) * t }; };
      let s = k % 2 === 0 ? s0 : -s0;
      let M = apex(s);
      if (blocked(S, M) || blocked(M, E)) {
        s = -s; M = apex(s);
        if (blocked(S, M) || blocked(M, E)) {
          // V nejde: zkusit „šikmo + vodorovně“ (u stánku: přijít šikmo a dojít bokem, nebo naopak)
          const hv = Math.abs(sdy) / t, alt: Vec2[] = [];
          for (const sg of [1, -1]) { alt.push({ x: E.x - sg * hv, y: E.y }); alt.push({ x: S.x + sg * hv, y: E.y }); }
          const okAlt = alt.find((P) => !blocked(S, P) && !blocked(P, E) && Math.abs(P.y - S.y) <= Math.abs(P.x - S.x) * t + 0.5);
          if (okAlt) out.push({ x: okAlt.x, y: okAlt.y, nodeId: null, edgeId: w.edgeId });
          if (k + 1 < n) out.push({ x: E.x, y: E.y, nodeId: null, edgeId: w.edgeId });
          continue;
        }
        if (k === 0) s0 = -s0; // další zuby střídat od této strany
      }
      // zaoblený obrat v M (kvadratická křivka mezi tečnými body)
      const l1 = Math.hypot(M.x - S.x, M.y - S.y), l2 = Math.hypot(E.x - M.x, E.y - M.y);
      const r = Math.min(R, l1 * 0.45, l2 * 0.45);
      const T1 = { x: M.x - ((M.x - S.x) / l1) * r, y: M.y - ((M.y - S.y) / l1) * r };
      const T2 = { x: M.x + ((E.x - M.x) / l2) * r, y: M.y + ((E.y - M.y) / l2) * r };
      const bez = (u: number) => ({ x: (1 - u) * (1 - u) * T1.x + 2 * (1 - u) * u * M.x + u * u * T2.x, y: (1 - u) * (1 - u) * T1.y + 2 * (1 - u) * u * M.y + u * u * T2.y });
      for (const p of [T1, bez(1 / 3), bez(2 / 3), T2]) out.push({ x: p.x, y: p.y, nodeId: null, edgeId: w.edgeId });
      if (k + 1 < n) out.push({ x: E.x, y: E.y, nodeId: null, edgeId: w.edgeId });
    }
    out.push(w);
    prev = w;
  }
  return out;
}
