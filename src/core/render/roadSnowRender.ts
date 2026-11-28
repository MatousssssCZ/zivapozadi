/**
 * Vrstva čerstvého sněhu nad vozovkou (maskovaná na pruhy): pokrytí po úsecích, koleje od kol a posyp.
 * Úseky se stejnou (zaokrouhlenou) hodnotou se kreslí jedním obdélníkem (žádné švy); okraje pruhu
 * jsou měkké (přechod do malby). Pruhy jsou vodorovné – v obraze obdélníky.
 */
import type { ProjectFile } from '../model/types';
import { toScreen, type Camera } from '../scene/camera';
import { ROAD_BIN, type RoadSnowState } from '../sim/roadSnow';

type Ctx = CanvasRenderingContext2D;
export function drawRoadSnow(ctx: Ctx, cam: Camera, project: ProjectFile, st: RoadSnowState) {
  const cfg = project.street!, half = cfg.laneHalf ?? 1.3;
  st.lanes.forEach((L, li) => {
    const ln = cfg.lanes[li], Zc = cameraZ(cam, ln.y);
    const yA = toScreen(cam, { X: 0, Z: Zc + half }).y, yB = toScreen(cam, { X: 0, Z: Zc - half }).y;
    const xOf = (i: number) => toScreen(cam, { X: L.X0 + i * ROAD_BIN, Z: Zc }).x;
    const runs = (vals: number[], q: number, fn: (x0: number, x1: number, v: number) => void) => {
      let i = 0;
      while (i < vals.length) { const v = Math.round(vals[i] * q) / q; let j = i + 1; while (j < vals.length && Math.round(vals[j] * q) / q === v) j++; if (v > 0.01) fn(xOf(i), xOf(j), v); i = j; }
    };
    // odhrnutý / ujetý asfalt: mokře tmavší (kde sníh chybí) – očištěný pás je zřetelný
    const gw = ctx.createLinearGradient(0, yA, 0, yB);
    gw.addColorStop(0, 'rgba(30,32,52,0)'); gw.addColorStop(0.12, 'rgba(30,32,52,1)'); gw.addColorStop(0.88, 'rgba(30,32,52,1)'); gw.addColorStop(1, 'rgba(30,32,52,0)');
    runs(L.cover.map((c) => Math.max(0, 0.5 - c)), 16, (x0, x1, v) => { ctx.save(); ctx.globalAlpha = 0.55 * v; ctx.fillStyle = gw; ctx.fillRect(x0, yA, x1 - x0 + 0.5, yB - yA); ctx.restore(); });
    // sníh přes celý pruh s měkkými okraji
    const g = ctx.createLinearGradient(0, yA, 0, yB);
    g.addColorStop(0, 'rgba(236,234,244,0)'); g.addColorStop(0.1, 'rgba(236,234,244,1)'); g.addColorStop(0.9, 'rgba(236,234,244,1)'); g.addColorStop(1, 'rgba(236,234,244,0)');
    runs(L.cover, 16, (x0, x1, v) => { ctx.save(); ctx.globalAlpha = 0.72 * v; ctx.fillStyle = g; ctx.fillRect(x0, yA, x1 - x0 + 0.5, yB - yA); ctx.restore(); });
    // textura: krátké šmouhy ve směru jízdy (ujetý sníh), světlé i stinné
    const H = yB - yA;
    for (let i = 0; i < L.cover.length; i++) {
      const v = L.cover[i]; if (v < 0.12) continue;
      const x0 = xOf(i), w = xOf(i + 1) - x0;
      for (let k = 0; k < 5; k++) {
        const h1 = frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453), h2 = frac(Math.sin(i * 39.346 + k * 11.135) * 24634.6345), h3 = frac(Math.sin(i * 7.13 + k * 3.7) * 9631.1);
        ctx.fillStyle = h3 < 0.55 ? `rgba(255,255,255,${(0.35 * v).toFixed(3)})` : `rgba(150,150,180,${(0.18 * v).toFixed(3)})`;
        ctx.fillRect(x0 + w * h1 - w * 0.3, yA + H * (0.12 + 0.76 * h2), w * (0.8 + h3), Math.max(1, H * 0.035));
      }
    }
    // koleje (dvě stopy kol): mokrý tmavý asfalt a břečka, jen kde je sníh
    const tr = L.track.map((t, i) => t * Math.min(1, L.cover[i] * 1.6));
    for (const off of [-0.78, 0.78]) {
      const y0 = toScreen(cam, { X: 0, Z: Zc + off + 0.2 }).y, y1 = toScreen(cam, { X: 0, Z: Zc + off - 0.2 }).y;
      runs(tr, 12, (x0, x1, v) => { ctx.fillStyle = `rgba(70,68,84,${(0.55 * v).toFixed(3)})`; ctx.fillRect(x0, y0, x1 - x0 + 0.5, y1 - y0); });
    }
    // posyp: drobná zrnka (světle hnědá – na asfaltu i na sněhu čitelná) v pruhu za shrnovákem
    for (let i = 0; i < L.grit.length; i++) {
      const gv = L.grit[i]; if (gv < 0.05) continue;
      const n = Math.round(gv * 12), x0 = xOf(i), x1 = xOf(i + 1);
      for (let k = 0; k < n; k++) { const h1 = frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453), h2 = frac(Math.sin(i * 39.346 + k * 11.135) * 24634.6345); ctx.fillStyle = k % 3 ? 'rgba(176,138,106,0.8)' : 'rgba(225,205,180,0.7)'; ctx.fillRect(x0 + (x1 - x0) * h1, yA + H * (0.2 + 0.6 * h2), 2.2, 1.8); }
    }
  });
}
const frac = (x: number) => x - Math.floor(x);
function cameraZ(cam: Camera, y: number): number { return (cam.f * cam.h) / Math.max(4, y - cam.yh); }
