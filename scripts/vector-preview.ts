/**
 * Vývojový náhled vektorových postav: řádky = outfity, sloupce = pohled × fáze chůze (+ klid, krajní pózy).
 * Volby: PPU (px na jednotku), --kostra (kosti a kontakty), filtr id outfitů jako argumenty, SIT=… póza.
 *   npx tsx scripts/vector-preview.ts [a_coat_navy k_snowsuit_petrol] [--kostra]
 */
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { skeletonPose, DEFAULT_MOTION, footGeomOf } from '../src/core/anim/skeleton';
import { bodyOf, templateFor } from '../src/core/vector/body';
import { OUTFITS } from '../src/core/vector/outfit';
import { drawVectorFigure } from '../src/core/vector/figure';

const lib = (f: string) => JSON.parse(readFileSync(`demo/Tramvajova-ulice.zscena/assets/characters/${f}/library.json`, 'utf8')).bodyTemplates[0];
const ADULT = lib('painted-parts-cg'), CHILD = lib('painted-parts-child');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const bones = process.argv.includes('--kostra');
const list = OUTFITS.filter((o) => !ids.length || ids.includes(o.id));
if (process.argv.includes('--katalog')) {
  // katalog: mřížka outfitů, každý ¾ zepředu v kroku + ¾ zezadu ve stoji
  const P2 = Number(process.env.PPU ?? 2.2), cw = 62 * P2, ch = 150 * P2, per = 8, rows = Math.ceil(list.length / per);
  const cc = createCanvas(cw * 2 * per, ch * rows), xx = cc.getContext('2d') as unknown as CanvasRenderingContext2D;
  xx.fillStyle = '#dfe3ec'; xx.fillRect(0, 0, cc.width, cc.height);
  list.forEach((of, i) => {
    const body = bodyOf(i * 7 + 3, of.age), tpl = templateFor(of.age === 'child' ? CHILD : ADULT, body), g = footGeomOf(tpl);
    for (const [k, view, ph, wb] of [[0, 'front3q', 0.25, 1], [1, 'back3q', 0, 0]] as const) {
      const pose = skeletonPose(tpl, view, false, { dir: view === 'front3q' ? 'SE' : 'NE', walkPhase: ph, walkBlend: wb, idleTime: 3, action: null } as never, false, DEFAULT_MOTION, 1);
      xx.save(); xx.translate(((i % per) * 2 + k) * cw + cw / 2, (Math.floor(i / per) + 1) * ch - 8 * P2); xx.scale(P2, P2);
      xx.fillStyle = 'rgba(60,70,100,0.18)'; xx.beginPath(); xx.ellipse(0, 0, 17, 5, 0, 0, Math.PI * 2); xx.fill();
      drawVectorFigure(xx, pose, body, of, { view, foot: g, detail: 1, seed: i, t: 0 }); xx.restore();
    }
    xx.fillStyle = '#333'; xx.font = `${4.2 * P2}px sans-serif`; xx.fillText(`${i + 1}. ${of.label}`, (i % per) * 2 * cw + 4, Math.floor(i / per) * ch + 6 * P2);
  });
  const out = process.env.OUT ?? 'grafika/vektorove-postavy-katalog.png';
  await fs.writeFile(out, cc.toBuffer('image/png')); console.log(out); process.exit(0);
}
const PPU = Number(process.env.PPU ?? 3);
const cols: { view: 'front3q' | 'back3q'; ph: number; walk: number; label: string; sit?: string }[] = [
  { view: 'front3q', ph: 0, walk: 0, label: 'stoj' }, ...[0, 0.25, 0.5, 0.75].map((ph) => ({ view: 'front3q' as const, ph, walk: 1, label: `krok ${ph}` })),
  { view: 'back3q', ph: 0, walk: 0, label: 'zezadu stoj' }, ...[0, 0.5].map((ph) => ({ view: 'back3q' as const, ph, walk: 1, label: `zezadu krok ${ph}` })),
  { view: 'front3q', ph: 0, walk: 0, label: 'dřep', sit: 'squat' }, { view: 'front3q', ph: 0, walk: 0, label: 'předklon', sit: 'bend' },
];
const CW = 70 * PPU, CH = 150 * PPU, SMALL = 1.0;
const c = createCanvas(CW * cols.length + 90, CH * list.length), x = c.getContext('2d') as unknown as CanvasRenderingContext2D;
x.fillStyle = '#dfe3ec'; x.fillRect(0, 0, c.width, c.height);
list.forEach((of, r) => {
  const body = bodyOf(r * 7 + 3, of.age), base = of.age === 'child' ? CHILD : ADULT, tpl = templateFor(base, body), g = footGeomOf(tpl);
  cols.forEach((cl, k) => {
    const anim = { dir: cl.view === 'front3q' ? 'SE' : 'NE', walkPhase: cl.ph, walkBlend: cl.walk, idleTime: 3, action: null, sit: cl.sit ? { kind: cl.sit, t: 2, dur: 4, w: 1 } : null } as never;
    const pose = skeletonPose(tpl, cl.view, false, anim, false, DEFAULT_MOTION, 1);
    x.save(); x.translate(k * CW + CW / 2, (r + 1) * CH - 8 * PPU); x.scale(PPU, PPU);
    x.fillStyle = 'rgba(60,70,100,0.18)'; x.beginPath(); x.ellipse(0, 0, 17, 5, 0, 0, Math.PI * 2); x.fill();
    drawVectorFigure(x, pose, body, of, { view: cl.view, foot: g, detail: 1, seed: r, t: 0 });
    if (bones) { x.strokeStyle = '#ff00c8'; x.lineWidth = 0.5; for (const l of [...pose.legs, ...pose.arms]) { x.beginPath(); x.moveTo(l.root.x, l.root.y); x.lineTo(l.joint.x, l.joint.y); x.lineTo(l.end.x, l.end.y); x.stroke(); } x.beginPath(); x.moveTo(pose.hip.x, pose.hip.y); x.lineTo(pose.neck.x, pose.neck.y); x.lineTo(pose.head.x, pose.head.y); x.stroke(); }
    x.restore();
    x.fillStyle = '#333'; x.font = `${4 * PPU}px sans-serif`; x.fillText(cl.label, k * CW + 4, r * CH + 5 * PPU);
  });
  // skutečná velikost (≈ postava v popředí scény)
  x.save(); x.translate(CW * cols.length + 45, (r + 1) * CH - 8 * PPU); x.scale(SMALL, SMALL);
  const pose = skeletonPose(tpl, 'front3q', false, { dir: 'SE', walkPhase: 0.25, walkBlend: 1, idleTime: 3, action: null } as never, false, DEFAULT_MOTION, 1);
  drawVectorFigure(x, pose, body, of, { view: 'front3q', foot: g, detail: 0.3, seed: r, t: 0 }); x.restore();
  x.fillStyle = '#333'; x.fillText(of.label, 4, r * CH + 10 * PPU);
});
const out = process.env.OUT ?? 'grafika/vektorove-postavy-nahled.png';
await fs.writeFile(out, c.toBuffer('image/png')); console.log(out);
