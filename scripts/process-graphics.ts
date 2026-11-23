/**
 * Zpracování dodané grafiky (grafika/zdroje → grafika/zpracovane):
 * rozdělení archů, vyčištění alfa kanálu, složení stánků (interiér za otvorem rámu).
 * Spuštění: npx tsx scripts/process-graphics.ts
 */
import { loadImage, createCanvas, type Image, type Canvas } from '@napi-rs/canvas';
import { promises as fs } from 'node:fs';

const OUT = 'grafika/zpracovane';
type Box = [number, number, number, number]; // x0,y0,x1,y1 (včetně)

function crop(img: Image, [x0, y0, x1, y1]: Box, pad = 4) {
  const w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2;
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.drawImage(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
  return c;
}
/** Ztrátová WebP má alfu kolem 250 místo 255 – zprůhlednit šum, zneprůhlednit téměř plné pixely. */
function cleanAlpha(c: Canvas) {
  const ctx = c.getContext('2d'); const id = ctx.getImageData(0, 0, c.width, c.height); const d = id.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 10 ? 0 : d[i] > 238 ? 255 : d[i];
  ctx.putImageData(id, 0, 0); return c;
}
/** Průhledný otvor uvnitř objektu (průhledné pixely nespojené s okrajem). */
function holeBox(c: Canvas): Box {
  const { width: W, height: H } = c; const d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const seen = new Uint8Array(W * H); const st: number[] = [];
  const tr = (i: number) => d[i * 4 + 3] < 128;
  for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); }
  while (st.length) { const i = st.pop()!; if (seen[i] || !tr(i)) continue; seen[i] = 1; const x = i % W, y = (i / W) | 0;
    if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W); }
  // Největší uzavřená průhledná oblast = otvor (menší oblasti jsou např. mezi lucernou a sloupkem).
  let best: Box = [0, 0, 0, 0], bestN = 0;
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!tr(s0) || seen[s0]) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0; const q = [s0];
    while (q.length) { const i = q.pop()!; if (seen[i] || !tr(i)) continue; seen[i] = 1; n++; const x = i % W, y = (i / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      if (x > 0) q.push(i - 1); if (x < W - 1) q.push(i + 1); if (y > 0) q.push(i - W); if (y < H - 1) q.push(i + W); }
    if (n > bestN) { bestN = n; best = [x0, y0, x1, y1]; }
  }
  const [x0, y0, x1, y1] = best;
  return [x0, y0, x1, y1];
}
async function save(name: string, c: Canvas) { await fs.writeFile(`${OUT}/${name}`, c.toBuffer('image/png')); console.log(name, c.width, 'x', c.height); }

await fs.mkdir(OUT, { recursive: true });
const sheet = await loadImage('grafika/zdroje/stanky-arch.webp');
const interiors: Box[] = [[26, 139, 417, 409], [470, 139, 861, 409], [913, 139, 1304, 409], [1356, 139, 1747, 409]];
const frames: Box[] = [[11, 466, 433, 852], [454, 466, 877, 852], [898, 466, 1320, 852], [1341, 466, 1764, 852]];
const names = ['hracky', 'pernik', 'napoje', 'pletene'];
for (let k = 0; k < 4; k++) {
  const frame = cleanAlpha(crop(sheet, frames[k]));
  const inter = cleanAlpha(crop(sheet, interiors[k], 0));
  const [hx0, hy0, hx1, hy1] = holeBox(frame);
  if (k === 0) console.log('otvor rámu', hx0, hy0, hx1, hy1);
  const out = createCanvas(frame.width, frame.height); const ctx = out.getContext('2d');
  // Interiér: šířka přes celý otvor (+ přesah za sloupky), horní hrana kousek nad otvorem (vidět horní police),
  // oříznutý na otvor rámu (+ malý přesah schovaný za rámem).
  const hw = hx1 - hx0 + 1;
  const s = (hw + 30) / inter.width;
  const iw = inter.width * s, ih = inter.height * s;
  ctx.save();
  ctx.beginPath(); ctx.rect(hx0, hy0 - 10, hw, hy1 - hy0 + 21); ctx.clip();
  ctx.drawImage(inter, hx0 + hw / 2 - iw / 2, hy0 - 22, iw, ih);
  ctx.restore();
  ctx.drawImage(frame, 0, 0);
  await save(`stanek-${names[k]}.png`, out);
  await save(`stanek-ram-${k + 1}.png`, frame);
  await save(`stanek-interier-${names[k]}.png`, inter);
}
const tl = await loadImage('grafika/zdroje/strom-lampy-arch.webp');
await save('lampa.png', cleanAlpha(crop(tl, [123, 10, 429, 918])));
await save('strom.png', cleanAlpha(crop(tl, [517, 10, 1154, 918])));
const bg = await loadImage('grafika/zdroje/pozadi-radnice.webp');
const bc = createCanvas(bg.width, bg.height); bc.getContext('2d').drawImage(bg, 0, 0);
await save('pozadi-radnice.png', bc);
