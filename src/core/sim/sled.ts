/**
 * Sáňky (balíček „živá pozadí“, B02): rodič táhne dítě sedící na sáňkách po předem ověřené
 * sněhové dráze. Rodič je skutečná postava (vyhýbá se davu), sáňky sledují historii jeho dráhy
 * v odstupu délky provázku (ne přímku přes zatáčku). Historie je omezená délkou provázku + sání.
 * Jeden průchod, pak cooldown 300–600 s; směr se střídá. Když dráha není celá na sněhu,
 * scénář se nespustí (diagnostika).
 */
import type { Vec2 } from '../math/vec';
import type { AgentState } from './types';
import { SIM_DT } from './types';
import type { ProjectFile } from '../model/types';
import { cameraFor, toScreen, toWorld, type World } from '../scene/camera';
import { hashNoise } from '../math/rng';

/** Provázek (ruka → úchyt) a délka sání (m). */
export const SLED = { rope: 1.25, length: 1.12, width: 0.42, speed: 0.78 } as const;
/**
 * Fyzika tažených saní (zadání 3.2–3.3): hmotnost saní + jezdce, kinetické tření skluznic po sněhu
 * (μk) a odpor hrnutí sněhu úměrný rychlosti, velký boční odpor (skluznice nejedou bokem), provaz jen
 * v tahu (limit vzdálenosti, malé tlumené napružení, omezená špička síly). Při zastavení chodce saně
 * dojedou a provaz povolí; o nohy chodce se zarazí (kontakt).
 */
export const SLED_PHYS = { mass: 6 + 18, muK: 0.07, snowDrag: 0.9, lateral: 14, maxPull: 260, slack: 0.015, stopV: 0.03 } as const;
const G = 9.81;

export interface SledState {
  phase: 'offstage' | 'run';
  until: number; dir: 1 | -1; n: number;
  /** historie pozic rodiče (svět, m), nejnovější na konci */ hist: World[];
  /** úchyt provázku a střed sání (obraz) + směr jízdy v obraze (rad) */
  ring?: Vec2; center?: Vec2; angle?: number; speed?: number;
  /** směr jízdy ve světě (rad, atan2(Z, X)) – pro výběr pohledu sání */ wang?: number;
  /** fyzika: střed saní a rychlost (svět, m, m/s), tah provazu (N), vzdálenost ruka–oko / délka provazu */
  S?: World; V?: World; tension?: number; ropeK?: number; vPrev?: number; acc?: number; /** ujetá dráha (m) */ dist?: number;
}

export interface SledHost {
  project: ProjectFile; time(): number;
  parent(): AgentState | undefined;
  /** jezdec (dítě sedící na saních), pokud ho scéna má */ rider?(): AgentState | undefined;
  /** posadí / schová jezdce (poloha obrazu, směr v obraze, podélné zrychlení saní) */ seat?(a: AgentState, p: Vec2, facing: number, accel: number): void;
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

export function stepSled(h: SledHost, st: SledState): void {
  const cfg = h.project.sled!, t = h.time(), a = h.parent();
  if (!a) return;
  const cam = cameraFor(h.project.scene);
  if (st.phase === 'offstage') {
    if (!a.hidden) h.hide(a);
    const rd = h.rider?.(); if (rd && !rd.hidden) h.hide(rd);
    st.ring = st.center = undefined;
    if (t < st.until) return;
    const pts = st.dir > 0 ? cfg.path : [...cfg.path].reverse();
    h.show(a, pts[0]);
    h.walkPath(a, pts.slice(1));
    const P = toWorld(cam, pts[0]), Q = toWorld(cam, pts[1]), L = Math.hypot(Q.X - P.X, Q.Z - P.Z) || 1;
    // sáňky začínají za rodičem (mimo obraz) ve směru dráhy
    st.hist = [{ X: P.X - ((Q.X - P.X) / L) * (SLED.rope + SLED.length + 0.3), Z: P.Z - ((Q.Z - P.Z) / L) * (SLED.rope + SLED.length + 0.3) }, P];
    // saně stojí za rodičem (mimo obraz), příď k němu, provaz téměř napnutý
    const back = SLED.rope * 0.97 + SLED.length / 2;
    st.S = { X: P.X - ((Q.X - P.X) / L) * back, Z: P.Z - ((Q.Z - P.Z) / L) * back }; st.V = { X: 0, Z: 0 }; st.wang = Math.atan2(Q.Z - P.Z, Q.X - P.X); st.tension = 0;
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
  stepSledPhysics(st, P, SIM_DT);
  const hw = st.wang ?? 0, c = { P: st.S! };
  const front = { X: c.P.X + Math.cos(hw) * SLED.length / 2, Z: c.P.Z + Math.sin(hw) * SLED.length / 2 };
  const ring = toScreen(cam, front), center = toScreen(cam, c.P);
  const ahead = toScreen(cam, { X: c.P.X + Math.cos(hw) * 0.2, Z: c.P.Z + Math.sin(hw) * 0.2 });
  st.speed = st.center ? Math.hypot(center.x - st.center.x, center.y - st.center.y) : 0;
  st.ring = ring; st.center = center; st.angle = Math.atan2(ahead.y - center.y, ahead.x - center.x);
  // jezdec sedí na sedáku (kus za středem saní), dívá se po směru jízdy; trup reaguje na zrychlení
  const rd = h.rider?.();
  if (rd && h.seat) {
    const seatP = toScreen(cam, { X: c.P.X - Math.cos(hw) * 0.12, Z: c.P.Z - Math.sin(hw) * 0.12 });
    const vNow = Math.hypot(st.V!.X, st.V!.Z), acc = (vNow - (st.vPrev ?? vNow)) / SIM_DT; st.vPrev = vNow;
    st.acc = (st.acc ?? 0) + (acc - (st.acc ?? 0)) * 0.08; // vyhlazené (pocit setrvačnosti, ne šum)
    h.seat(rd, { x: seatP.x, y: seatP.y + 0.5 }, st.angle, st.acc);
  }
  // chodec cítí tah: při napnutí zpomalí rozběh (místo obřího impulzu do saní)
  a.speedFactor = 0.85 * (1 - 0.25 * Math.min(1, (st.tension ?? 0) / SLED_PHYS.maxPull));
  if (!a.route) {
    // rodič došel na konec dráhy (mimo obraz) → konec průchodu, cooldown 300–600 s
    h.hide(a); const rd2 = h.rider?.(); if (rd2) h.hide(rd2);
    st.phase = 'offstage'; st.n++; st.dir = st.dir > 0 ? -1 : 1;
    st.until = t + 300 + 300 * hashNoise(h.project.seed, 9300, st.n);
    st.hist = []; st.ring = st.center = undefined; st.wang = undefined; st.S = st.V = undefined;
  }
}

/**
 * Jeden pevný krok fyziky saní (dt = krok simulace). H = ruka (≈ poloha chodce ve světě).
 * Integrace: tření a odpor sněhu proti rychlosti (bez chvění u nuly – statický režim), boční složka
 * rychlosti se rychle utlumí (skluznice), provaz: když je oko dál než délka provazu, poloha se vrátí
 * na mez a rychlost dostane jen složku k ruce (tah, nikdy tlak); příď se stáčí za provazem.
 */
export function stepSledPhysics(st: SledState, H: World, dt: number) {
  const S = st.S!, V = st.V!, ph = SLED_PHYS, m = ph.mass;
  let hd = st.wang ?? 0;
  const ux = Math.cos(hd), uz = Math.sin(hd);
  // 1) odpory: kinetické tření + hrnutí sněhu (podél), velký boční odpor
  let va = V.X * ux + V.Z * uz, vl = -V.X * uz + V.Z * ux;
  const dec = (ph.muK * G + (ph.snowDrag / m) * Math.abs(va) * 10) * dt;
  va = Math.abs(va) <= dec ? 0 : va - Math.sign(va) * dec;
  vl *= Math.exp(-ph.lateral * dt);
  if (Math.abs(va) < ph.stopV && Math.abs(vl) < ph.stopV) { va = 0; vl = 0; }
  V.X = va * ux - vl * uz; V.Z = va * uz + vl * ux;
  S.X += V.X * dt; S.Z += V.Z * dt; st.dist = (st.dist ?? 0) + Math.hypot(V.X, V.Z) * dt;
  // 2) provaz: oko na přídi, jen tah
  const R = { X: S.X + ux * SLED.length / 2, Z: S.Z + uz * SLED.length / 2 };
  const dx = H.X - R.X, dz = H.Z - R.Z, d = Math.hypot(dx, dz) || 1e-9, nx = dx / d, nz = dz / d;
  const Lr = SLED.rope * (1 - ph.slack); // tah začíná těsně před plnou délkou (malé tlumené napružení)
  st.tension = 0;
  if (d > Lr) {
    // potřebná změna rychlosti k ruce, omezená maximální silou (měkký rozběh, žádný obří impulz)
    const vn = V.X * nx + V.Z * nz, need = (d - Lr) / dt * 0.5;
    const dv = Math.min(Math.max(0, need - vn), (ph.maxPull / m) * dt + Math.max(0, need - vn) * 0.25);
    V.X += nx * dv; V.Z += nz * dv; st.tension = (dv / dt) * m;
    // tvrdá mez: provaz se nikdy neprotáhne přes svou délku
    const over = d - SLED.rope; if (over > 0) { S.X += nx * over; S.Z += nz * over; const vn2 = V.X * nx + V.Z * nz, add = Math.max(0, over / dt - Math.max(0, vn2) * 0); V.X += nx * add * 0.5; V.Z += nz * add * 0.5; }
    // příď se natáčí za provazem (moment tahu na oku), úměrně tahu
    const want = Math.atan2(nz, nx); let dA = want - hd; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
    hd += dA * Math.min(1, dt * (2 + st.tension / 40));
  } else if (Math.hypot(V.X, V.Z) > 0.1) {
    // volná jízda: saně jedou po skluznicích – směr se drží
  }
  // 3) kontakt s nohama chodce: saně ho nepředjedou (rychlost k němu se zruší)
  if (d < 0.35) { const vn = V.X * nx + V.Z * nz; if (vn > 0) { V.X -= nx * vn; V.Z -= nz * vn; } }
  st.wang = hd; st.ropeK = d / SLED.rope;
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
