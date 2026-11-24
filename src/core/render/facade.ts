/**
 * Okna a dveře budovy v pozadí (balík „Živá pozadí“, E07/E08):
 *  - vybraná okna pomalu přecházejí mezi rozsvíceným (namalovaný stav pozadí) a zhasnutým stavem;
 *    zhasnutí = ztmavení jen teplých svítících pixelů skla (kámen fasády zůstává), přechod ~1 s,
 *    stav se mění po 3–10 min, každé okno jinak – nikdy hromadné zhasnutí,
 *  - dveře: při průchodu portálem se otevřou (malovaný osvětlený interiér v otvoru, teplé světlo na
 *    schodech), po průchodu se zavřou.
 * Vše je čistá funkce času a seedu; masky skla se počítají jednou z pozadí.
 */
import type { ProjectFile } from '../model/types';
import { hashNoise } from '../math/rng';
import { getCanvasFactory } from './rigRenderer';

type Ctx = CanvasRenderingContext2D;
type Img = CanvasImageSource & { width: number; height: number };

/** Míra „zhasnutí“ okna i v čase t (0 = svítí, 1 = zhasnuto) – segmenty 180–600 s, přechod 1 s. */
export function windowOff(seed: number, i: number, t: number): number {
  let s = -hashNoise(seed, 300 + i) * 400, k = 0;
  // najít segment obsahující t
  let start = s, len = 180 + hashNoise(seed, 301 + i, k) * 420;
  while (start + len <= t) { start += len; k++; len = 180 + hashNoise(seed, 301 + i, k) * 420; }
  const off = (kk: number) => (kk > 0 && hashNoise(seed, 302 + i, kk) < 0.35 ? 1 : 0);
  const cur = off(k), prev = off(k - 1);
  const u = Math.min(1, (t - start) / 1.0);
  const e = u * u * (3 - 2 * u);
  void s;
  return prev + (cur - prev) * e;
}

/** Otevření dveří (0..1) podle časů průchodů: otevírá se 0,8 s před, drží ~1 s, zavírá se 1,1 s. */
export function doorOpen(passes: number[] | undefined, t: number): number {
  let o = 0;
  for (const p of passes ?? []) {
    const d = t - p;
    const v = d < -0.8 ? 0 : d < 0 ? (d + 0.8) / 0.8 : d < 1 ? 1 : d < 2.1 ? 1 - (d - 1) / 1.1 : 0;
    o = Math.max(o, v);
  }
  return o * o * (3 - 2 * o);
}

const maskCache = new Map<string, unknown>();
function darkMask(bg: Img, project: ProjectFile, r: { x: number; y: number; w: number; h: number }): unknown {
  const key = `${r.x},${r.y},${r.w},${r.h}`;
  const hit = maskCache.get(key);
  if (hit) return hit;
  const f = getCanvasFactory();
  if (!f) return null;
  const sx = bg.width / project.scene.width, sy = bg.height / project.scene.height;
  const W = Math.max(1, Math.round(r.w * sx)), H = Math.max(1, Math.round(r.h * sy));
  const c = f(W, H); const cx = c.getContext('2d') as Ctx;
  cx.drawImage(bg, r.x * sx, r.y * sy, W, H, 0, 0, W, H);
  const id = cx.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    // teplé svítící sklo → tmavé modrošedé sklo; kámen (méně sytý) zůstane
    const cl = (v: number) => Math.max(0, Math.min(1, v));
    // sklo: jasně žluté (vysoké R i G, nízké B); teple nasvícený kámen má víc modré → nezasáhnout
    const w = cl((R - B - 95) / 45) * cl((G - 145) / 35) * cl((145 - B) / 35) * cl((R - 200) / 30);
    d[i] = 34; d[i + 1] = 38; d[i + 2] = 66; d[i + 3] = Math.round(235 * w);
  }
  cx.putImageData(id, 0, 0);
  maskCache.set(key, c);
  return c;
}

export function drawFacade(ctx: Ctx, project: ProjectFile, bg: Img | null, interior: Img | null, doorPasses: number[] | undefined, t: number): void {
  const env = project.scene.environment;
  if (!env) return;
  if (bg && env.windows?.length) {
    env.windows.forEach((r, i) => {
      const off = windowOff(project.seed, i, t);
      if (off <= 0.002) return;
      const m = darkMask(bg, project, r) as Img | null;
      if (!m) return;
      ctx.save(); ctx.globalAlpha = off; ctx.drawImage(m, r.x, r.y, r.w, r.h); ctx.restore();
    });
  }
  const D = env.door;
  if (D) {
    const o = doorOpen(doorPasses, t);
    if (o > 0.002) {
      ctx.save();
      ctx.globalAlpha = o;
      // otvor: malovaný osvětlený interiér (v obloukovém otvoru dveří)
      ctx.beginPath(); ctx.moveTo(D.x, D.y + D.h); ctx.lineTo(D.x, D.y + D.w / 2);
      ctx.arc(D.x + D.w / 2, D.y + D.w / 2, D.w / 2, Math.PI, 0); ctx.lineTo(D.x + D.w, D.y + D.h); ctx.closePath(); ctx.clip();
      if (interior) ctx.drawImage(interior, D.x, D.y, D.w, D.h);
      else { ctx.fillStyle = '#ffcf8a'; ctx.fillRect(D.x, D.y, D.w, D.h); }
      ctx.restore();
      // teplé světlo z otevřených dveří na schodech (slabé, pod postavami)
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const cx = D.x + D.w / 2, cy = D.y + D.h + D.h * 0.25, rr = D.w * 2.2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, `rgba(255,205,140,${(0.28 * o).toFixed(3)})`); g.addColorStop(1, 'rgba(255,205,140,0)');
      ctx.fillStyle = g; ctx.translate(cx, cy); ctx.scale(1, 0.35); ctx.translate(-cx, -cy);
      ctx.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr); ctx.restore();
    }
  }
}
