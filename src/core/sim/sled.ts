/**
 * Sáňky (balíček „živá pozadí“, B02): rodič táhne dítě sedící na sáňkách po předem ověřené
 * sněhové dráze. Rodič je skutečná postava (vyhýbá se davu), sáňky sledují historii jeho dráhy
 * v odstupu délky provázku (ne přímku přes zatáčku). Historie je omezená délkou provázku + sání.
 * Jeden průchod, pak cooldown 300–600 s; směr se střídá. Když dráha není celá na sněhu,
 * scénář se nespustí (diagnostika).
 */
import type { Vec2 } from '../math/vec';
import type { AgentState } from './types';
import type { ProjectFile } from '../model/types';
import { cameraFor, toScreen, toWorld, type World } from '../scene/camera';
import { hashNoise } from '../math/rng';

/** Provázek (ruka → úchyt) a délka sání (m). */
export const SLED = { rope: 1.25, length: 1.12, width: 0.42, speed: 0.78 } as const;

export interface SledState {
  phase: 'offstage' | 'run';
  until: number; dir: 1 | -1; n: number;
  /** historie pozic rodiče (svět, m), nejnovější na konci */ hist: World[];
  /** úchyt provázku a střed sání (obraz) + směr jízdy v obraze (rad) */
  ring?: Vec2; center?: Vec2; angle?: number; speed?: number;
}

export interface SledHost {
  project: ProjectFile; time(): number;
  parent(): AgentState | undefined;
  isSnow(p: Vec2): boolean;
  walkPath(a: AgentState, pts: Vec2[]): void;
  hide(a: AgentState): void;
  show(a: AgentState, p: Vec2): void;
  log(msg: string, id?: string): void;
}

/** Je celá dráha (vzorkovaně po 10 px) na sněhu? Body mimo obraz se nekontrolují. */
export function sledPathProblem(h: Pick<SledHost, 'project' | 'isSnow'>, obstacles: { name?: string; poly: World[] }[] = []): string | null {
  const s = h.project.sled; if (!s) return 'Scéna nemá sáňky.';
  const W = h.project.scene.width, H = h.project.scene.height;
  for (let i = 1; i < s.path.length; i++) {
    const a = s.path[i - 1], b = s.path[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      if (p.x < 0 || p.x > W || p.y > H) continue;
      if (!h.isSnow(p)) return `Dráha sání vede mimo sníh (${Math.round(p.x)}, ${Math.round(p.y)}) – sáňky se nespustí.`;
      // odstup od pevných překážek: polovina šířky sání / tělo rodiče + rezerva
      const P = toWorld(cameraFor(h.project.scene), p);
      const hit = obstacles.find((o) => distToPoly(P, o.poly) < 0.3);
      if (hit) return `Dráha sání vede příliš blízko překážky „${hit.name ?? '?'}“ (${Math.round(p.x)}, ${Math.round(p.y)}) – sáňky se nespustí.`;
    }
  }
  return null;
}

function distToPoly(P: World, poly: World[]): number {
  let inside = false, d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if ((b.Z > P.Z) !== (a.Z > P.Z) && P.X < ((a.X - b.X) * (P.Z - b.Z)) / (a.Z - b.Z) + b.X) inside = !inside;
    const ab = { X: b.X - a.X, Z: b.Z - a.Z }, L2 = ab.X * ab.X + ab.Z * ab.Z || 1e-9;
    const t = Math.max(0, Math.min(1, ((P.X - a.X) * ab.X + (P.Z - a.Z) * ab.Z) / L2));
    d = Math.min(d, Math.hypot(P.X - a.X - ab.X * t, P.Z - a.Z - ab.Z * t));
  }
  return inside ? 0 : d;
}

/** Bod v historii ve vzdálenosti `d` (m) zpět od nejnovějšího; vrací i tečnu. */
function along(hist: World[], d: number): { P: World; T: World } {
  let left = d;
  for (let i = hist.length - 1; i > 0; i--) {
    const a = hist[i], b = hist[i - 1], L = Math.hypot(a.X - b.X, a.Z - b.Z);
    if (L >= left && L > 1e-6) { const k = left / L; return { P: { X: a.X + (b.X - a.X) * k, Z: a.Z + (b.Z - a.Z) * k }, T: { X: (a.X - b.X) / L, Z: (a.Z - b.Z) / L } }; }
    left -= L;
  }
  const b = hist[0], a = hist[1] ?? hist[0], L = Math.hypot(a.X - b.X, a.Z - b.Z) || 1;
  return { P: { ...b }, T: { X: (a.X - b.X) / L, Z: (a.Z - b.Z) / L } };
}

export function stepSled(h: SledHost, st: SledState): void {
  const cfg = h.project.sled!, t = h.time(), a = h.parent();
  if (!a) return;
  const cam = cameraFor(h.project.scene);
  if (st.phase === 'offstage') {
    if (!a.hidden) h.hide(a);
    st.ring = st.center = undefined;
    if (t < st.until) return;
    const pts = st.dir > 0 ? cfg.path : [...cfg.path].reverse();
    h.show(a, pts[0]);
    h.walkPath(a, pts.slice(1));
    const P = toWorld(cam, pts[0]), Q = toWorld(cam, pts[1]), L = Math.hypot(Q.X - P.X, Q.Z - P.Z) || 1;
    // sáňky začínají za rodičem (mimo obraz) ve směru dráhy
    st.hist = [{ X: P.X - ((Q.X - P.X) / L) * (SLED.rope + SLED.length + 0.3), Z: P.Z - ((Q.Z - P.Z) / L) * (SLED.rope + SLED.length + 0.3) }, P];
    st.phase = 'run';
    h.log(`${a.name} táhne dítě na sáňkách.`, a.id);
    return;
  }
  // jízda: historie dráhy rodiče, omezená délkou provázku a sání
  const P = toWorld(cam, a.pos), last = st.hist[st.hist.length - 1];
  if (Math.hypot(P.X - last.X, P.Z - last.Z) > 0.04) st.hist.push(P);
  let tot = 0;
  for (let i = st.hist.length - 1; i > 0; i--) {
    tot += Math.hypot(st.hist[i].X - st.hist[i - 1].X, st.hist[i].Z - st.hist[i - 1].Z);
    if (tot > SLED.rope + SLED.length + 0.6) { st.hist.splice(0, i - 1); break; }
  }
  const r = along([...st.hist, P], SLED.rope), c = along([...st.hist, P], SLED.rope + SLED.length / 2);
  const ring = toScreen(cam, r.P), center = toScreen(cam, c.P);
  const ahead = toScreen(cam, { X: c.P.X + c.T.X * 0.2, Z: c.P.Z + c.T.Z * 0.2 });
  st.speed = st.center ? Math.hypot(center.x - st.center.x, center.y - st.center.y) : 0;
  st.ring = ring; st.center = center; st.angle = Math.atan2(ahead.y - center.y, ahead.x - center.x);
  if (!a.route) {
    // rodič došel na konec dráhy (mimo obraz) → konec průchodu, cooldown 300–600 s
    h.hide(a);
    st.phase = 'offstage'; st.n++; st.dir = st.dir > 0 ? -1 : 1;
    st.until = t + 300 + 300 * hashNoise(h.project.seed, 9300, st.n);
    st.hist = []; st.ring = st.center = undefined;
  }
}

/** Kolizní obrys sání a provázku (svět) – ostatní chodci jimi neprojdou. */
export function sledObstacles(h: Pick<SledHost, 'project'>, st: SledState | undefined, parentPos: Vec2 | null): { poly: World[] }[] {
  if (!st || st.phase !== 'run' || !st.center || !st.ring || !parentPos) return [];
  const cam = cameraFor(h.project.scene);
  const C = toWorld(cam, st.center), R = toWorld(cam, st.ring), Pp = toWorld(cam, parentPos);
  const box = (A: World, B: World, w: number) => {
    const L = Math.hypot(B.X - A.X, B.Z - A.Z) || 1, ux = (B.X - A.X) / L, uz = (B.Z - A.Z) / L, nx = -uz * w, nz = ux * w;
    return { poly: [{ X: A.X + nx, Z: A.Z + nz }, { X: B.X + nx, Z: B.Z + nz }, { X: B.X - nx, Z: B.Z - nz }, { X: A.X - nx, Z: A.Z - nz }] };
  };
  const back = { X: C.X - (R.X - C.X), Z: C.Z - (R.Z - C.Z) };
  // provázek končí kus před rodičem (rodič sám je postava v davu)
  const L = Math.hypot(Pp.X - R.X, Pp.Z - R.Z) || 1, Pe = { X: R.X + ((Pp.X - R.X) / L) * Math.max(0, L - 0.35), Z: R.Z + ((Pp.Z - R.Z) / L) * Math.max(0, L - 0.35) };
  return [box(back, R, SLED.width / 2), box(R, Pe, 0.08)];
}
