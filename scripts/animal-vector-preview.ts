/** Náhled vektorových zvířat: řádky = tělesné typy, sloupce = pózy a fáze chůze. npx tsx scripts/animal-vector-preview.ts [typ…] [--kostra] */
import fs from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import { ANIMAL_BUILDS, drawVectorAnimal } from '../src/core/vector/animal';
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--')), dbg = process.argv.includes('--kostra');
const list = Object.values(ANIMAL_BUILDS).filter((b) => !ids.length || ids.includes(b.id));
const PPM = Number(process.env.PPM ?? 300), CW = 0.95 * PPM, CH = 0.75 * PPM;
type Col = { label: string; mode: string; speed: number; ph: number; yaw?: number; sit?: number; headDown?: number; alert?: number };
const colsFor = (dog: boolean): Col[] => [
  { label: 'stoj', mode: 'walk', speed: 0, ph: 0 },
  ...[0, 0.25, 0.5, 0.75].map((ph) => ({ label: `krok ${ph}`, mode: 'walk', speed: dog ? 0.9 : 0.6, ph })),
  ...(dog ? [0, 0.25].map((ph) => ({ label: `klus ${ph}`, mode: 'walk', speed: 1.9, ph })) : [0, 0.4].map((ph) => ({ label: `plížení ${ph}`, mode: 'notice', speed: 0.35, ph }))),
  { label: 'sed', mode: 'sit', speed: 0, ph: 0, sit: 1 },
  { label: dog ? 'čichá' : 'protažení', mode: dog ? 'sniff' : 'stretch', speed: 0, ph: 0, headDown: dog ? 1 : 0 },
  { label: '¾ k divákovi', mode: 'walk', speed: 0.8, ph: 0.25, yaw: 0.8 },
  { label: '¾ od diváka', mode: 'walk', speed: 0.8, ph: 0.25, yaw: -0.8 },
];
const ncol = 11;
const c = createCanvas(CW * ncol, CH * list.length), x = c.getContext('2d') as unknown as CanvasRenderingContext2D;
x.fillStyle = '#e3e7ef'; x.fillRect(0, 0, c.width, c.height);
list.forEach((b, r) => {
  colsFor(b.species === 'dog').forEach((cl, k) => {
    const stride = b.gait.stride * (cl.speed > b.gait.trotAt ? 1.32 : 1);
    x.save(); x.translate(k * CW + CW * 0.5, (r + 1) * CH - 0.06 * PPM);
    x.fillStyle = 'rgba(60,70,100,0.16)'; x.beginPath(); x.ellipse(0, 0, b.len * PPM * 0.9, b.len * PPM * 0.12, 0, 0, Math.PI * 2); x.fill();
    const pts = drawVectorAnimal(x, b, { dist: cl.ph * stride, speed: cl.speed, t: 1.2, mode: cl.mode, sit: cl.sit ?? 0, headDown: cl.headDown ?? 0, since: 0, until: 9, yaw: cl.yaw ?? 0, alert: cl.alert, seed: r + 1 }, PPM, dbg);
    if (dbg) for (const q of pts) { x.fillStyle = q.c; x.beginPath(); x.arc(q.x, q.y, 3, 0, Math.PI * 2); x.fill(); }
    x.restore();
    x.fillStyle = '#333'; x.font = `${0.035 * PPM}px sans-serif`; x.fillText(k === 0 ? `${b.label} – ${cl.label}` : cl.label, k * CW + 4, r * CH + 0.04 * PPM);
  });
});
const out = process.env.OUT ?? 'grafika/zvirata/vektorova-zvirata.png';
await fs.writeFile(out, c.toBuffer('image/png')); console.log(out);
