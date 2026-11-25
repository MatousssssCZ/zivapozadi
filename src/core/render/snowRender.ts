/**
 * Vykreslení materiálového modelu sněhu (odklízení): odkrytá dlažba podle zbývající vrstvy (měkká
 * maska z mřížky → nepravidelné okraje stopy, tenké zbytky), navršený sníh (val, vytlačený sníh,
 * hromada) z výšek buněk, val před listem a shluky ve vzduchu. Vzhled je zjednodušený, ale vychází
 * přímo z hmotnosti v zásobách – sníh se objeví a zmizí jen přesunem.
 */
import type { ProjectFile } from '../model/types';
import type { SnowState } from '../sim/snowMaterial';
import { baseMass, isWorkCell, cellMass, cellCenter, clumpAt } from '../sim/snowMaterial';
import { cameraFor, toScreen, Q } from '../scene/camera';
import { depthScaleAt } from '../scene/geometry';
import { getCanvasFactory } from './rigRenderer';

type Ctx = CanvasRenderingContext2D;
type Img = CanvasImageSource & { width: number; height: number };
export interface SnowDrawItem { key: number; tie: number; draw: () => void }

let maskC: { c: unknown; w: number; h: number } | null = null;
let layerC: { c: unknown; w: number; h: number } | null = null;

/** Odkrytá dlažba pod odhrnutým sněhem (plochý decal pod chodci). */
export function drawSnowSurface(ctx: Ctx, project: ProjectFile, s: SnowState, pavement: Img | null): void {
  const f = getCanvasFactory(); if (!f) return;
  const cam = cameraFor(project.scene), b = baseMass(s);
  // buňky pracovní plochy
  const i0 = Math.max(0, Math.floor((s.work.x0 - s.gx) / s.p.cell)), i1 = Math.min(s.nx - 1, Math.ceil((s.work.x1 - s.gx) / s.p.cell) - 1);
  const j0 = Math.max(0, Math.floor((s.work.z0 - s.gz) / s.p.cell)), j1 = Math.min(s.nz - 1, Math.ceil((s.work.z1 - s.gz) / s.p.cell) - 1);
  const w = i1 - i0 + 1, h = j1 - j0 + 1;
  if (w <= 0 || h <= 0) return;
  if (!maskC || maskC.w !== w || maskC.h !== h) maskC = { c: f(w, h), w, h };
  const mc = (maskC.c as { getContext(k: '2d'): Ctx }).getContext('2d');
  const id = mc.createImageData(w, h);
  let any = false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const m = cellMass(s, i, j);
    const cleared = isWorkCell(s, i, j) ? Math.max(0, Math.min(1, (b - m) / (b * 0.96))) : 0;
    const a = Math.round(255 * Math.min(0.94, cleared) ** 0.8); // i čistá stopa má tenký zbytek sněhu
    if (a > 0) any = true;
    const k = ((j - j0) * w + (i - i0)) * 4; id.data[k] = 255; id.data[k + 1] = 255; id.data[k + 2] = 255; id.data[k + 3] = a;
  }
  if (!any) return;
  mc.putImageData(id, 0, 0);
  // afinní mapování mřížky na obraz (perspektiva na ploše ~1 m je téměř lineární)
  const X0 = s.gx + i0 * s.p.cell, Z0 = s.gz + j0 * s.p.cell;
  const O = toScreen(cam, { X: X0, Z: Z0 }), EX = toScreen(cam, { X: X0 + w * s.p.cell, Z: Z0 }), EZ = toScreen(cam, { X: X0, Z: Z0 + h * s.p.cell });
  const xs = [O.x, EX.x, EZ.x, EX.x + EZ.x - O.x], ys = [O.y, EX.y, EZ.y, EX.y + EZ.y - O.y];
  const bx = Math.floor(Math.min(...xs)) - 2, by = Math.floor(Math.min(...ys)) - 2, bw = Math.ceil(Math.max(...xs)) + 2 - bx, bh = Math.ceil(Math.max(...ys)) + 2 - by;
  const tr = (ctx as unknown as { getTransform?: () => { a: number } }).getTransform?.(), k = Math.max(0.5, tr?.a ?? 1);
  const LW = Math.ceil(bw * k), LH = Math.ceil(bh * k);
  if (!layerC || layerC.w < LW || layerC.h < LH) layerC = { c: f(Math.max(LW, layerC?.w ?? 0), Math.max(LH, layerC?.h ?? 0)), w: Math.max(LW, layerC?.w ?? 0), h: Math.max(LH, layerC?.h ?? 0) };
  const lc = (layerC.c as { getContext(k: '2d'): Ctx }).getContext('2d');
  lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, layerC.w, layerC.h);
  lc.setTransform(k, 0, 0, k, -bx * k, -by * k);
  if (pavement) lc.drawImage(pavement, bx, by, bw, bh); else { lc.fillStyle = '#7d7480'; lc.fillRect(bx, by, bw, bh); }
  lc.globalCompositeOperation = 'destination-in'; lc.imageSmoothingEnabled = true;
  lc.transform((EX.x - O.x) / w, (EX.y - O.y) / w, (EZ.x - O.x) / h, (EZ.y - O.y) / h, O.x, O.y);
  lc.drawImage(maskC.c as CanvasImageSource, 0, 0);
  lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over';
  ctx.drawImage(layerC.c as CanvasImageSource, 0, 0, LW, LH, bx, by, LW / k, LH / k);
}

/** Navršený sníh (řádky buněk), val před listem a shluky ve vzduchu – položky řazené podle hloubky. */
export function snowItems(ctx: Ctx, project: ProjectFile, s: SnowState, t: number, pile: Img | null, ball: Img | null): SnowDrawItem[] {
  const cam = cameraFor(project.scene), out: SnowDrawItem[] = [], b = baseMass(s), area = s.p.cell * s.p.cell;
  const ppmAt = (y: number) => depthScaleAt(project.scene.depth, y) / Q;
  // výšková mapa navršeného sněhu (val, vytlačený sníh, hromada) + val před listem (jen pro kreslení,
  // rozložený do buněk před hranou), vyhlazená pro vzhled – hmotnost se tím nemění
  const nx = s.nx, nz = s.nz, Hm = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const ex = cellMass(s, i, j) - (isWorkCell(s, i, j) ? b : 0);
    if (ex > 0.002) Hm[j * nx + i] = ex / (s.p.pileDensity * area);
  }
  if (s.edge && s.ridge > 0.02) {
    const { A, B } = s.edge, L = Math.hypot(B.X - A.X, B.Z - A.Z) || 1;
    let f = { X: (B.Z - A.Z) / L, Z: -(B.X - A.X) / L }; if (f.X < 0) f = { X: -f.X, Z: -f.Z };
    const cells: number[] = [];
    for (let q = 0; q < 8; q++) for (const d of [0.035, 0.085]) {
      const u = (q + 0.5) / 8, X = A.X + (B.X - A.X) * u + f.X * d, Z = A.Z + (B.Z - A.Z) * u + f.Z * d;
      const i = Math.floor((X - s.gx) / s.p.cell), j = Math.floor((Z - s.gz) / s.p.cell);
      if (i >= 0 && j >= 0 && i < nx && j < nz) cells.push(j * nx + i);
    }
    const per = s.ridge / s.p.ridgeDensity / (cells.length || 1) / area;
    for (const k of cells) Hm[k] += per;
  }
  const blur = (src: Float64Array) => { const o = new Float64Array(src.length); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let a = 0, w = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= nx || y >= nz) continue; const ww = di || dj ? 0.6 : 1.4; a += src[y * nx + x] * ww; w += ww; } o[j * nx + i] = a / w; } return o; };
  const Hd = blur(blur(Hm));
  for (let j = 0; j < nz; j++) {
    const hs: number[] = [];
    let any = false;
    for (let i = 0; i < nx; i++) { const v = Hd[j * nx + i]; hs.push(v > 0.0025 ? v : 0); if (v > 0.0025) any = true; }
    if (!any) continue;
    const y = toScreen(cam, cellCenter(s, 0, j)).y;
    out.push({ key: y, tie: 11000, draw: () => {
      const ppm = ppmAt(y);
      for (let i = 0; i < nx; i++) {
        if (!hs[i]) continue;
        let k = i; while (k + 1 < nx && hs[k + 1]) k++;
        const pts: { x: number; y: number }[] = [];
        for (let q = i - 1; q <= k + 1; q++) {
          const qq = Math.max(0, Math.min(nx - 1, q)), c = cellCenter(s, qq, j), p = toScreen(cam, { X: c.X + (q - qq) * s.p.cell, Z: c.Z });
          const hh = q < i || q > k ? 0 : hs[q] * (1 + 0.06 * Math.sin(q * 2.3 + j * 1.7)); // drobná nepravidelnost povrchu
          pts.push({ x: p.x, y: p.y - hh * ppm });
        }
        const base = toScreen(cam, cellCenter(s, i, j)).y, top = Math.min(...pts.map((p) => p.y));
        const g = ctx.createLinearGradient(0, top, 0, base + 1);
        g.addColorStop(0, '#f4f5fc'); g.addColorStop(0.7, '#e2e5f2'); g.addColorStop(1, '#d3d6e8');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(pts[0].x, base + 1); ctx.lineTo(pts[0].x, pts[0].y);
        for (let q = 1; q < pts.length; q++) { const mx = (pts[q - 1].x + pts[q].x) / 2, my = (pts[q - 1].y + pts[q].y) / 2; ctx.quadraticCurveTo(pts[q - 1].x, pts[q - 1].y, mx, my); }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.lineTo(pts[pts.length - 1].x, base + 1); ctx.closePath(); ctx.fill();
        i = k;
      }
      void pile;
    } });
  }
  // shluky ve vzduchu: světová balistika promítnutá s výškou, řazené podle bodu pod sebou
  for (const c of s.air) {
    const q = clumpAt(c, t), g = toScreen(cam, { X: q.X, Z: q.Z }), p = toScreen(cam, { X: q.X, Z: q.Z }, Math.max(0, q.H));
    const r = Math.cbrt((c.mass / s.p.pileDensity) * 0.75 / Math.PI);
    out.push({ key: g.y, tie: 15300, draw: () => {
      const d = 2 * r * ppmAt(g.y) * 1.2;
      if (ball) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(c.id * 1.7 + t * 3); ctx.scale(1, 0.8); ctx.drawImage(ball, -d / 2, -d / 2, d, d); ctx.restore(); }
      else { ctx.fillStyle = '#f4f5fb'; ctx.beginPath(); ctx.arc(p.x, p.y, d / 2, 0, Math.PI * 2); ctx.fill(); }
    } });
  }
  return out;
}
