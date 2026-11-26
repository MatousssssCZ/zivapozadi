/**
 * Náhled vektorových saní a bobů v 8 natočeních (perspektiva kamery scény Liberec):
 *   npx tsx scripts/sled-preview.ts výstup.png
 */
import { promises as fs } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { cameraFor, toWorld } from '../src/core/scene/camera';
import { drawVectorSled } from '../src/core/render/sledVector';
import { depthScaleAt } from '../src/core/scene/geometry';
import { Q } from '../src/core/scene/camera';
import { loadProject } from '../src/node/projectIO';
const scene = (await loadProject('demo/Liberec-zivy-trh.zscena')).project.scene as never;
const cam = cameraFor(scene);
const W = 1600, H = 520, cv = createCanvas(W, H), x = cv.getContext('2d') as unknown as CanvasRenderingContext2D;
x.fillStyle = '#e8ecf6'; x.fillRect(0, 0, W, H);
(['sane', 'boby'] as const).forEach((kind, r) => {
  for (let i = 0; i < 8; i++) {
    const sx = 100 + i * 200, sy = 1000, hd = (i / 8) * Math.PI * 2;
    const S = toWorld(cam, { x: 960 + (i - 3.5) * 200, y: sy });
    const ppm = depthScaleAt((scene as { depth: never }).depth, sy) / Q;
    x.save(); x.translate(sx - (960 + (i - 3.5) * 200), r * 260 - (sy - 170)); drawVectorSled(x, cam, S, hd, kind, i * 0.3, ppm, '#c8302c'); x.restore();
  }
});
await fs.writeFile(process.argv[2] ?? 'sane.png', cv.toBuffer('image/png'));
