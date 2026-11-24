import { describe, it, expect } from 'vitest';
import '../src/node/napiRender';
import { createCanvas } from '@napi-rs/canvas';
import { cameraFor, toScreen, toWorld } from '../src/core/scene/camera';
import { defaultIntegration, gradedImage, groundLightEllipse, lantern, snowLipProfile, flickerAt, drawGroundIntegration } from '../src/core/render/integration';
import { createEmptyProject } from '../src/core/model/defaults';
import type { AssetEntry, SceneObject } from '../src/core/model/types';

/** Zadání zasazení stánků – kap. B.13 (měřitelné části). */
function setup(y = 990) {
  const p = createEmptyProject('t', 1);
  p.scene.depth = { enabled: true, yFar: 900, scaleFar: 0.36, yNear: 1080, scaleNear: 1.3 };
  const a: AssetEntry = { id: 'st', kind: 'image', name: 's', file: 'x.png', width: 400, height: 360, anchor: { x: 0.5, y: 1 }, pixelScale: 1, shape: { bodyU0: 0.0625, bodyU1: 0.9375, depthM: 1.8, lights: [lantern(0.1, 0.45)] } };
  const cam = cameraFor(p.scene);
  const k = cam.f / toWorld(cam, { x: 960, y }).Z; // px/m
  const scale = (3.2 * k) / 400; // střecha 3,2 m přes celou šířku obrázku
  const o: SceneObject = { id: 'obj_test', name: 's', assetId: 'st', x: 960, y, scale, layer: 'world', zBias: 0, flipX: false, visible: true, locked: false, integration: defaultIntegration() };
  p.assets.push(a); p.objects.push(o);
  return { p, a, o, cam, k };
}

describe('zapuštění stánku do scény', () => {
  it('kamera: měřítko a projekce půdorysu podle tabulky zadání (y 990)', () => {
    const { cam, k } = setup();
    const Z = toWorld(cam, { x: 960, y: 990 }).Z;
    expect(Math.abs(Z - 33.39)).toBeLessThan(0.05);
    expect(Math.abs(k - 61.66)).toBeLessThan(0.2);
    expect(Math.abs(3.2 * k - 197.3)).toBeLessThan(1);  // střecha ≈ 197 px
    // zadní hrana 1,8 m hlubokého půdorysu je jen ≈ 8,1 px výš
    const back = toScreen(cam, { X: 0, Z: Z + 1.8 });
    expect(Math.abs((990 - back.y) - 8.1)).toBeLessThan(0.3);
    // inverze projekce
    const w = toWorld(cam, { x: 700, y: 1000 }), s = toScreen(cam, w);
    expect(Math.hypot(s.x - 700, s.y - 1000)).toBeLessThan(0.01);
  });

  it('světlo lucerny na zemi: elipsa ≈ 99 × 8 px (poloměr 1,6 m)', () => {
    const { cam, o, a } = setup();
    const e = groundLightEllipse(cam, o, a, a.shape!.lights![0]);
    expect(e.rx).toBeGreaterThan(90); expect(e.rx).toBeLessThan(105);
    expect(e.ry).toBeGreaterThan(6.5); expect(e.ry).toBeLessThan(9.5);
  });

  it('sněhový lem: 1–4 px, nepravidelný, s mezerami, deterministický', () => {
    const { cam, o, a } = setup();
    const { top, y } = snowLipProfile(cam, o, a, o.integration!);
    const h = top.map((p) => y - p.y);
    expect(Math.max(...h)).toBeGreaterThan(1); expect(Math.max(...h)).toBeLessThan(4.5);
    expect(h.filter((v) => v < 0.25).length / h.length).toBeGreaterThan(0.08); // mezery
    const sd = Math.sqrt(h.reduce((s, v) => s + (v - h.reduce((x, z) => x + z, 0) / h.length) ** 2, 0) / h.length);
    expect(sd).toBeGreaterThan(0.25); // ne rovná čára
    expect(snowLipProfile(cam, o, a, o.integration!).top).toEqual(top);
  });

  it('blikání lucerny: ±3 % max, pomalé (< 2 Hz), deterministické', () => {
    const l = lantern(0.1, 0.4);
    let mn = Infinity, mx = -Infinity, maxStep = 0, prev = flickerAt(l, 5, 0);
    for (let t = 0; t < 60; t += 1 / 60) { const v = flickerAt(l, 5, t); mn = Math.min(mn, v); mx = Math.max(mx, v); maxStep = Math.max(maxStep, Math.abs(v - prev)); prev = v; }
    expect(mx - 1).toBeLessThanOrEqual(0.03); expect(1 - mn).toBeLessThanOrEqual(0.03);
    expect(maxStep).toBeLessThan(0.002);
    expect(flickerAt(l, 5, 12.3)).toBe(flickerAt(l, 5, 12.3));
  });

  it('sladění barev nemění alfu a snižuje sytost; světelná jádra zůstávají', () => {
    const { p, a, o } = setup();
    const c = createCanvas(4, 1); const x = c.getContext('2d');
    const id = x.createImageData(4, 1);
    const px = [[200, 110, 40, 255], [255, 240, 200, 255], [120, 80, 50, 128], [0, 0, 0, 0]];
    px.forEach((v, i) => id.data.set(v, i * 4)); x.putImageData(id, 0, 0);
    a.width = 4; a.height = 1;
    const g = gradedImage(o, a, c, p) as ReturnType<typeof createCanvas>;
    const d = g.getContext('2d').getImageData(0, 0, 4, 1).data;
    for (let i = 0; i < 4; i++) expect(d[i * 4 + 3]).toBe(px[i][3]);
    const sat = (r: number, gg: number, b: number) => (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(1, Math.max(r, gg, b));
    expect(sat(d[0], d[1], d[2])).toBeLessThan(sat(200, 110, 40));
    expect(Math.abs(d[4] - 255) + Math.abs(d[5] - 240)).toBeLessThan(14); // jádro lucerny téměř beze změny
  });

  it('zemní průchod nekreslí mimo okolí objektu a nemá NaN', () => {
    const { p, a, o } = setup();
    const c = createCanvas(1920, 1080), x = c.getContext('2d');
    x.fillStyle = '#e8ecf6'; x.fillRect(0, 0, 1920, 1080);
    drawGroundIntegration(x as never, p, [o], new Map([[a.id, a]]), 1.5);
    const d = x.getImageData(0, 0, 1920, 1080).data;
    let changedFar = 0, changedNear = 0;
    for (let y = 0; y < 1080; y += 2) for (let xx = 0; xx < 1920; xx += 2) {
      const i = (y * 1920 + xx) * 4, ch = Math.abs(d[i] - 0xe8) + Math.abs(d[i + 1] - 0xec) + Math.abs(d[i + 2] - 0xf6) > 2;
      const near = Math.abs(xx - 960) < 180 && Math.abs(y - 985) < 30;
      if (ch && near) changedNear++; if (ch && !near) changedFar++;
    }
    expect(changedNear).toBeGreaterThan(50);
    expect(changedFar).toBe(0);
  });
});
