/**
 * Kreslení předmětů scénických epizod (vektorově, promítnuto kamerou scény): stromky na prodej a
 * nesený stromek (A13), další přibudou s A11/A12/A08/A01. Položky se řadí do hloubky jako ostatní.
 */
import type { Camera, World } from '../scene/camera';
import { toScreen } from '../scene/camera';
import type { Simulation } from '../sim/simulation';
import type { ProjectFile } from '../model/types';
import { lotTrees, lotBase, treePose, LOT_N } from '../sim/ep/treeLot';
import { DECO_TREE_H, hookWorld, ornsOf, ornSwing, decoData, boxLeft, ORN_COLORS } from '../sim/ep/decorate';
import { characterVisual, localToScene } from './characterPose';
import { lightHooks, lightsWorld, lightsData, ladderBase, facadeZ, STEP_H, LADDER_STEPS, HOOK_N } from '../sim/ep/lights';
import type { AgentState } from '../sim/types';
import { depthScaleAt } from '../scene/geometry';
import { Q, toWorld, cameraFor } from '../scene/camera';
const toWorldOf = (p: ProjectFile, q: { x: number; y: number }) => toWorld(cameraFor(p.scene), q);

type Ctx = CanvasRenderingContext2D;
type Item = { key: number; tie: number; draw: () => void };
const rnd = (s: number) => { const x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x); };

/**
 * Smrček podél osy pata → špička (obraz): patra větví kolmo k ose, svěšená k patě, sníh na horních
 * hranách. `sway` (m) – průhyb špičky při nesení (tlumené dokývání).
 */
export function drawSpruce(ctx: Ctx, B: { x: number; y: number }, T: { x: number; y: number }, ppm: number, hM: number, seed: number, sway = 0, upright = true) {
  const ax = T.x - B.x, ay = T.y - B.y, L = Math.hypot(ax, ay) || 1, ux = ax / L, uy = ay / L;
  let nx = -uy, ny = ux; if (!upright && ny > 0) { nx = -nx; ny = -ny; } // kolmice (u neseného míří nahoru)
  const W = hM * 0.36 * ppm, trunk = 0.12;
  const P = (f: number, s: number) => { const sw = sway * ppm * f * f; return { x: B.x + ux * L * f + nx * (s + sw), y: B.y + uy * L * f + ny * (s + sw) }; };
  ctx.save(); ctx.lineCap = 'round';
  // kmen
  ctx.strokeStyle = '#5a3b22'; ctx.lineWidth = Math.max(1, 0.05 * ppm); const k0 = P(0, 0), k1 = P(trunk + 0.1, 0);
  ctx.beginPath(); ctx.moveTo(k0.x, k0.y); ctx.lineTo(k1.x, k1.y); ctx.stroke();
  // patra větví (od spodu): každé patro je „sukně“ s nepravidelným okrajem z chomáčů jehličí,
  // svěšená k patě; tmavší zespodu, světlejší nahoře; sníh v měkkých chomáčích na horních plochách
  const tiers = 11;
  for (let i = 0; i < tiers; i++) {
    const q = i / tiers, f0 = trunk + q * (1 - trunk) * 0.97, f1 = Math.min(1, trunk + ((i + 2.1) / tiers) * (1 - trunk));
    const w = W * Math.pow(1 - q, 0.92) * (0.9 + 0.18 * rnd(seed + i)), droop = 0.045 + 0.02 * rnd(seed + i * 3);
    const pts: { x: number; y: number }[] = [P(f1, 0)];
    const N = 9;
    for (let j = 0; j <= N; j++) { // okraj zleva doprava přes spodní hranu
      const u = -1 + (2 * j) / N, edge = Math.abs(u), jit = (rnd(seed * 7 + i * 13 + j) - 0.5) * 0.35;
      pts.push(P(f0 - droop * (0.4 + 0.6 * edge) + jit * 0.04, u * w * (0.9 + 0.12 * Math.cos(j * 2.1))));
      if (j < N) pts.push(P(f0 - droop * 0.2 + 0.02 + jit * 0.02, (u + 1 / N) * w * 0.82));
    }
    const lo = P(f0, 0), hi = P(f1, 0);
    const g = ctx.createLinearGradient(lo.x, lo.y, hi.x, hi.y);
    const k = 0.85 + 0.3 * q;
    g.addColorStop(0, `rgb(${Math.round(22 * k)},${Math.round(56 * k)},${Math.round(40 * k)})`); g.addColorStop(1, `rgb(${Math.round(44 * k)},${Math.round(92 * k)},${Math.round(64 * k)})`);
    ctx.fillStyle = g; ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    // stín pod patrem (hloubka)
    ctx.strokeStyle = 'rgba(10,25,18,0.35)'; ctx.lineWidth = Math.max(0.6, 0.02 * ppm);
    ctx.beginPath(); for (let j = 1; j < pts.length; j++) { const p = pts[j]; if (j === 1) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } ctx.stroke();
    // sníh: měkké chomáče na horní ploše patra
    for (let m = 0; m < 3; m++) {
      const u = (rnd(seed + i * 5 + m) - 0.5) * 1.3, c = P(f0 + 0.03 + 0.04 * rnd(seed + m + i), u * w * 0.6), r = Math.max(1, w * (0.12 + 0.08 * rnd(seed + 2 * m + i)));
      ctx.fillStyle = `rgba(242,246,255,${(0.55 + 0.3 * rnd(seed + m * 9 + i)).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.45, Math.atan2(ny, nx), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** Dřevěný křížový stojan pod stromkem. */
function drawStand(ctx: Ctx, cam: Camera, B: World) {
  ctx.save(); ctx.strokeStyle = '#7a5532'; ctx.lineWidth = 2;
  for (const [dx, dz] of [[0.28, 0], [0, 0.28]]) { const a = toScreen(cam, { X: B.X - dx, Z: B.Z - dz }, 0.04), b = toScreen(cam, { X: B.X + dx, Z: B.Z + dz }, 0.04); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.restore();
}

/** Kulatá ozdoba s háčkem a odleskem. */
function drawOrnament(ctx: Ctx, x: number, y: number, r: number, color: string, ang = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = 'rgba(200,190,150,0.9)'; ctx.lineWidth = Math.max(0.5, r * 0.15); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, r * 0.9); ctx.stroke();
  const g = ctx.createRadialGradient(-r * 0.35, r * 1.45, r * 0.1, 0, r * 1.9, r * 1.1); g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, color); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, r * 1.9, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c9b46a'; ctx.fillRect(-r * 0.3, r * 0.8, r * 0.6, r * 0.25);
  ctx.restore();
}
/** Krabice s ozdobami (lepenka, víko otevřené, barevné koule uvnitř). */
function drawOrnBox(ctx: Ctx, x: number, yb: number, k: number, left: number) {
  const w = 0.42 * k, hh = 0.18 * k, d = 0.1 * k;
  ctx.save();
  ctx.fillStyle = '#8a6a44'; ctx.beginPath(); ctx.moveTo(x - w / 2, yb - hh); ctx.lineTo(x - w / 2 + d * 0.6, yb - hh - d); ctx.lineTo(x + w / 2 + d * 0.6, yb - hh - d); ctx.lineTo(x + w / 2, yb - hh); ctx.closePath(); ctx.fill();
  for (let i = 0; i < Math.min(6, left); i++) { ctx.fillStyle = ORN_COLORS[i % ORN_COLORS.length]; ctx.beginPath(); ctx.arc(x - w * 0.32 + (i % 3) * w * 0.3 + d * 0.3 * (i >= 3 ? 1 : 0.4), yb - hh - d * (i >= 3 ? 0.65 : 0.3), w * 0.07, 0, 7); ctx.fill(); }
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, '#c89b62'); g.addColorStop(1, '#a87a46'); ctx.fillStyle = g; ctx.fillRect(x - w / 2, yb - hh, w, hh);
  ctx.fillStyle = '#9a7043'; ctx.beginPath(); ctx.moveTo(x + w / 2, yb); ctx.lineTo(x + w / 2 + d * 0.6, yb - d); ctx.lineTo(x + w / 2 + d * 0.6, yb - hh - d); ctx.lineTo(x + w / 2, yb - hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8b37a'; ctx.beginPath(); ctx.moveTo(x - w / 2, yb - hh); ctx.lineTo(x - w / 2 - d * 0.2, yb - hh - d * 1.6); ctx.lineTo(x + w / 2 - d * 0.2, yb - hh - d * 1.6); ctx.lineTo(x + w / 2, yb - hh); ctx.closePath(); ctx.fill(); // otevřené víko
  ctx.restore();
}
/** ruka postavy v obraze (0 = vzdálená, 1 = blízká) */
export function handOf(sim: Simulation, project: ProjectFile, a: AgentState, i: 0 | 1) {
  const c = sim.characterOf(a.id), m = c && sim.manifests[c.assetId]; if (!c || !m) return null;
  const cv = characterVisual(a, m, c, project.scene); return localToScene(cv, cv.pose.arms[i].end);
}

/** Štafle (A-rám): přední díl se stupni k divákovi, zadní opěry; výška horní plošiny 0,9 m. */
function drawLadder(ctx: Ctx, cam: Camera, B: World, ppm: number) {
  const P = (dx: number, dz: number, H: number) => toScreen(cam, { X: B.X + dx, Z: B.Z + dz }, H);
  const w = 0.22, top = (LADDER_STEPS + 1) * STEP_H + 0.05;
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#9aa2ad'; ctx.lineWidth = Math.max(1, 0.035 * ppm);
  for (const s of [-1, 1]) { const a = P(s * w, 0.45, 0), b = P(s * w * 0.9, 0.18, top); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } // zadní opěry
  ctx.strokeStyle = '#c3c9d2'; ctx.lineWidth = Math.max(1.2, 0.04 * ppm);
  for (const s of [-1, 1]) { const a = P(s * w, -0.12, 0), b = P(s * w * 0.9, 0.12, top); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.strokeStyle = '#8d949f'; ctx.lineWidth = Math.max(1.6, 0.05 * ppm);
  for (let i = 1; i <= LADDER_STEPS + 1; i++) { const H = i * STEP_H, k = H / top, a = P(-w * (1 - 0.1 * k), -0.12 + 0.24 * k, H), b = P(w * (1 - 0.1 * k), -0.12 + 0.24 * k, H); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.restore();
}
/** Řetěz světel přes body (obraz): žárovky rozmístěné po délce křivky, rozsvícené s jemnou září. */
function drawChain(ctx: Ctx, pts: { x: number; y: number }[], on: number, ppm: number) {
  if (pts.length < 2) return;
  ctx.save(); ctx.strokeStyle = 'rgba(40,55,40,0.9)'; ctx.lineWidth = Math.max(0.6, 0.012 * ppm);
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const step = Math.max(3, 0.12 * ppm), total = cum[cum.length - 1];
  for (let s = step / 2, n = 0; s < total; s += step, n++) {
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const k = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k + Math.max(1, 0.015 * ppm);
    const r = Math.max(1.3, 0.026 * ppm), col = BULBS[n % BULBS.length];
    if (on > 0) { const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5); g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${(0.55 * on).toFixed(2)})`); g.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, 7); ctx.fill(); }
    const k2 = on > 0 ? 1 : 0.45;
    ctx.fillStyle = `rgb(${Math.round(col[0] * k2 + (on > 0 ? 30 : 60))},${Math.round(col[1] * k2 + (on > 0 ? 30 : 60))},${Math.round(col[2] * k2 + (on > 0 ? 30 : 60))})`;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r, 0, 0, 7); ctx.fill();
    if (on > 0) { ctx.fillStyle = `rgba(255,255,240,${(0.8 * on).toFixed(2)})`; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.35, 0, 7); ctx.fill(); }
  }
  ctx.restore();
}
const BULBS: [number, number, number][] = [[255, 196, 90], [235, 80, 70], [90, 170, 235], [120, 210, 120], [255, 150, 200]];
/** Průvěs řetězu délky ℓ mezi body vzdálenými s (parabola: ℓ ≈ s + 8d²/3s). */
const sagOf = (s: number, l: number) => Math.sqrt(Math.max(0, (3 * s * (l - s)) / 8));

export function episodeItems(ctx: Ctx, project: ProjectFile, sim: Simulation, cam: Camera): Item[] {
  const items: Item[] = [], h = sim.actorHostPublic();
  for (const c of project.episodes ?? []) {
    const st = sim.state.episodes?.[c.id];
    if (c.type === 'decorate') {
      const Tw = toWorldOf(project, c.pts.tree), g = toScreen(cam, Tw), ppm = depthScaleAt(project.scene.depth, g.y) / Q, t = sim.time();
      const orn = st ? ornsOf(st) : [];
      items.push({ key: g.y, tie: 50, draw: () => {
        drawSpruce(ctx, toScreen(cam, Tw, 0.02), toScreen(cam, Tw, DECO_TREE_H), ppm, DECO_TREE_H, 99);
        for (const o of orn) { const q = hookWorld(h, c, o.hook), p = toScreen(cam, q, q.H); drawOrnament(ctx, p.x, p.y, Math.max(1.6, 0.045 * ppm), o.color, ornSwing(o, t)); }
      } });
      if (st?.phase === 'run') {
        const d = decoData(st), A = c.actors.map((id) => sim.state.agents.find((x) => x.id === id)!);
        if (d.box === 'ground') { const B = toWorldOf(project, c.pts.box), gb = toScreen(cam, B); items.push({ key: gb.y, tie: 51, draw: () => drawOrnBox(ctx, gb.x, gb.y, ppm, boxLeft(st)) }); }
        if (d.box === 'carried' && A[0] && !A[0].hidden) { const p0 = handOf(sim, project, A[0], 0), p1 = handOf(sim, project, A[0], 1); if (p0 && p1) items.push({ key: A[0].pos.y + 0.4, tie: 52, draw: () => drawOrnBox(ctx, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2 + 0.08 * ppm, ppm, boxLeft(st)) }); }
        if (d.held) { const a = A[d.held.who]; const p = a && !a.hidden ? handOf(sim, project, a, 1) : null; if (p) items.push({ key: a.pos.y + 0.5, tie: 53, draw: () => drawOrnament(ctx, p.x, p.y, Math.max(1.6, 0.045 * ppm), d.held!.color) }); }
      }
    }
    if (c.type === 'lights') {
      const hooks = lightHooks(h, c), L = st ? lightsWorld(st) : { hooks: 0, on: false, onAt: 0 }, Zf = facadeZ(h, c);
      const g0 = toScreen(cam, { X: hooks[0].X, Z: Zf }), ppm = depthScaleAt(project.scene.depth, g0.y) / Q;
      // řetěz: upevněné úseky mezi háčky (průvěs z délky), volný konec visí z posledního háčku
      const seg = 0.78, pts: { x: number; y: number }[] = [];
      for (let i = 0; i < L.hooks; i++) {
        const a = hooks[i]; pts.push(toScreen(cam, a, a.H));
        if (i + 1 < L.hooks) { const b = hooks[i + 1], sp = Math.hypot(b.X - a.X, b.H - a.H), d = sagOf(sp, seg); for (let k = 1; k < 8; k++) { const u = k / 8; pts.push(toScreen(cam, { X: a.X + (b.X - a.X) * u, Z: a.Z }, a.H + (b.H - a.H) * u - 4 * d * u * (1 - u))); } }
      }
      const tail: { x: number; y: number }[] = [];
      if (L.hooks > 0 && L.hooks < HOOK_N) { const a = hooks[L.hooks - 1]; for (let k = 0; k <= 6; k++) { const u = k / 6; tail.push(toScreen(cam, { X: a.X + 0.15 * Math.sin(u * Math.PI), Z: a.Z - 0.05 }, a.H - 0.9 * Math.sin(u * Math.PI * 0.5))); } }
      const on = L.on ? Math.min(1, (sim.time() - L.onAt) / 0.6) : 0;
      items.push({ key: g0.y - 2, tie: 60, draw: () => { drawChain(ctx, pts, on, ppm); drawChain(ctx, tail, 0, ppm); } });
      if (st?.phase === 'run') {
        const d = lightsData(st);
        if (d.ladder === 'standing' && d.ladderAt !== undefined) { const B = ladderBase(h, c, d.ladderAt), g = toScreen(cam, B); items.push({ key: g.y - 0.3, tie: 61, draw: () => drawLadder(ctx, cam, B, ppm) }); }
        const F = sim.state.agents.find((x) => x.id === c.actors[0]);
        if (d.ladder === 'carried' && F && !F.hidden) {
          const p0 = handOf(sim, project, F, 0), p1 = handOf(sim, project, F, 1);
          if (p0 && p1) items.push({ key: F.pos.y + 0.4, tie: 62, draw: () => {
            // složené štafle nesené bokem: dvě lišty vodorovně přes ruce
            const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2, Lp = 1.15 * ppm;
            ctx.save(); ctx.strokeStyle = '#c3c9d2'; ctx.lineWidth = Math.max(1.2, 0.04 * ppm);
            for (const dy of [-0.05, 0.05]) { ctx.beginPath(); ctx.moveTo(cx - Lp * 0.45, cy + dy * ppm); ctx.lineTo(cx + Lp * 0.55, cy + dy * ppm - 0.08 * ppm); ctx.stroke(); }
            ctx.restore();
          } });
        }
      }
    }
    if (c.type === 'treeLot') {
      const trees = st ? lotTrees(st) : Array.from({ length: LOT_N }, (_, i) => ({ h: 1.6, present: true, seed: i }));
      // cedule prodejce
      { const b0 = lotBase(h, c, 0), sg = { X: b0.X - 0.75, Z: b0.Z - 0.1 }, g = toScreen(cam, sg), t = toScreen(cam, sg, 1.25), ppm = depthScaleAt(project.scene.depth, g.y) / Q;
        items.push({ key: g.y, tie: 30, draw: () => {
          ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = Math.max(1, 0.05 * ppm); ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(t.x, t.y); ctx.stroke();
          const w = 0.62 * ppm, hh = 0.26 * ppm; ctx.fillStyle = '#efe3c8'; ctx.strokeStyle = '#6b4a2b'; ctx.beginPath(); ctx.roundRect(t.x - w / 2, t.y - hh, w, hh, hh * 0.15); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#2f5a3a'; ctx.font = `bold ${(hh * 0.34).toFixed(1)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VÁNOČNÍ', t.x, t.y - hh * 0.66, w * 0.9); ctx.fillText('STROMKY', t.x, t.y - hh * 0.3, w * 0.9);
        } }); }
      trees.forEach((tr, i) => {
        const B = lotBase(h, c, i), g = toScreen(cam, B), ppm = depthScaleAt(project.scene.depth, g.y) / Q;
        items.push({ key: g.y, tie: 31 + i, draw: () => { drawStand(ctx, cam, B); if (tr.present) drawSpruce(ctx, toScreen(cam, B, 0.02), toScreen(cam, B, tr.h), ppm, tr.h, tr.seed); } });
      });
      const tp = st ? treePose(h, c, st) : null;
      if (tp) {
        const Bs = toScreen(cam, tp.base, tp.base.H), Ts = toScreen(cam, tp.top, tp.top.H), g = toScreen(cam, tp.base), g2 = toScreen(cam, tp.top), ppm = depthScaleAt(project.scene.depth, g.y) / Q;
        const carried = (st!.data as { carry?: boolean }).carry;
        items.push({ key: carried ? Math.max(g.y, g2.y) + 0.6 : g.y + 0.6, tie: 40, draw: () => drawSpruce(ctx, Bs, Ts, ppm, tp.tree.h, tp.tree.seed, tp.sway, !carried) });
      }
    }
  }
  return items;
}
