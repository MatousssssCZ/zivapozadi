/**
 * Vygeneruje vestavěné PROVIZORNÍ testovací assety (vlastní jednoduchá grafika, žádné cizí zdroje).
 * Obrázky jsou ve 2× rozlišení (pixelScale 0.5), aby byly ostré i ve 4K.
 * Spuštění: npx tsx scripts/generate-assets.ts
 */
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hashNoise } from '../src/core/math/rng';
import type { AssetEntry } from '../src/core/model/types';
import { testFigureManifest } from '../src/core/anim/manifest';

const OUT = path.resolve('resources/builtin');
const S = 2; // pixely na logickou jednotku

type C = SKRSContext2D;
const rnd = (i: number, j = 0) => hashNoise(777, i, j);

async function save(name: string, w: number, h: number, draw: (c: C) => void) {
  const cv = createCanvas(w * S, h * S);
  const c = cv.getContext('2d');
  c.scale(S, S);
  draw(c);
  await fs.writeFile(path.join(OUT, name), cv.toBuffer('image/png'));
}

function roundRect(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function glow(c: C, x: number, y: number, r: number, color: string, alpha = 0.55) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('ALPHA', String(alpha))); g.addColorStop(1, color.replace('ALPHA', '0'));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

function house(c: C, x: number, baseY: number, w: number, h: number, color: string, roof: string, seed: number) {
  // tělo
  c.fillStyle = color; c.fillRect(x, baseY - h, w, h);
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, baseY - h, w * 0.08, h);
  // štít / střecha
  const gable = rnd(seed, 1) > 0.45;
  c.fillStyle = roof;
  c.beginPath();
  if (gable) { c.moveTo(x - 6, baseY - h); c.lineTo(x + w / 2, baseY - h - w * 0.45); c.lineTo(x + w + 6, baseY - h); }
  else { c.moveTo(x - 6, baseY - h); c.lineTo(x + 10, baseY - h - 40); c.lineTo(x + w - 10, baseY - h - 40); c.lineTo(x + w + 6, baseY - h); }
  c.closePath(); c.fill();
  // sníh na střeše
  c.fillStyle = '#fbfdff';
  c.beginPath();
  if (gable) { c.moveTo(x - 8, baseY - h + 2); c.lineTo(x + w / 2, baseY - h - w * 0.45 - 4); c.lineTo(x + w + 8, baseY - h + 2); c.lineTo(x + w + 8, baseY - h + 8); c.quadraticCurveTo(x + w * 0.75, baseY - h - w * 0.15, x + w / 2, baseY - h - w * 0.36); c.quadraticCurveTo(x + w * 0.25, baseY - h - w * 0.1, x - 8, baseY - h + 8); }
  else { c.moveTo(x - 8, baseY - h + 2); c.lineTo(x + 8, baseY - h - 44); c.lineTo(x + w - 8, baseY - h - 44); c.lineTo(x + w + 8, baseY - h + 2); c.lineTo(x + w + 8, baseY - h + 9); c.quadraticCurveTo(x + w / 2, baseY - h - 22, x - 8, baseY - h + 9); }
  c.closePath(); c.fill();
  // komín
  if (rnd(seed, 2) > 0.5) { c.fillStyle = '#8c6a60'; c.fillRect(x + w * 0.7, baseY - h - (gable ? w * 0.3 : 40) - 18, 14, 26); c.fillStyle = '#fbfdff'; c.fillRect(x + w * 0.7 - 2, baseY - h - (gable ? w * 0.3 : 40) - 22, 18, 6); }
  // okna s teplým světlem
  const cols = Math.max(2, Math.floor(w / 46)), rows = Math.max(2, Math.floor((h - 50) / 62));
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const wx = x + (w / cols) * (k + 0.5) - 11, wy = baseY - h + 24 + r * 62;
    if (wy + 34 > baseY - 40) continue;
    const lit = rnd(seed * 31 + r * 7 + k, 3) > 0.3;
    if (lit) glow(c, wx + 11, wy + 17, 34, 'rgba(255,200,110,ALPHA)', 0.35);
    c.fillStyle = lit ? '#ffd98a' : '#5c6a8a'; roundRect(c, wx, wy, 22, 32, 3); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.beginPath(); c.moveTo(wx + 11, wy); c.lineTo(wx + 11, wy + 32); c.moveTo(wx, wy + 15); c.lineTo(wx + 22, wy + 15); c.stroke();
    c.fillStyle = '#fbfdff'; c.fillRect(wx - 3, wy + 31, 28, 4);
  }
  // dveře
  const dx = x + w / 2 - 14;
  c.fillStyle = '#7a4b3a'; roundRect(c, dx, baseY - 50, 28, 50, 12); c.fill();
  glow(c, dx + 14, baseY - 58, 18, 'rgba(255,210,130,ALPHA)', 0.7);
  c.fillStyle = '#ffe2a8'; c.beginPath(); c.arc(dx + 14, baseY - 58, 4, 0, Math.PI * 2); c.fill();
}

async function background() {
  await save('pozadi-namesti.png', 1920, 1080, (c) => {
    // obloha (soumrak)
    const sky = c.createLinearGradient(0, 0, 0, 600);
    sky.addColorStop(0, '#6f86b8'); sky.addColorStop(0.55, '#b9a7cf'); sky.addColorStop(1, '#f3c9c0');
    c.fillStyle = sky; c.fillRect(0, 0, 1920, 620);
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,240,${0.3 + rnd(i, 9) * 0.5})`; c.beginPath(); c.arc(rnd(i, 1) * 1920, rnd(i, 2) * 260, 0.8 + rnd(i, 3) * 1.4, 0, Math.PI * 2); c.fill(); }
    glow(c, 1600, 140, 70, 'rgba(255,250,230,ALPHA)', 0.5);
    c.fillStyle = '#fff8e8'; c.beginPath(); c.arc(1600, 140, 26, 0, Math.PI * 2); c.fill();
    // vzdálené kopce
    c.fillStyle = '#c9cfe6'; c.beginPath(); c.moveTo(0, 470);
    for (let x = 0; x <= 1920; x += 40) c.lineTo(x, 430 - Math.sin(x / 260) * 40 - rnd(x, 4) * 10);
    c.lineTo(1920, 600); c.lineTo(0, 600); c.fill();
    // kostel ve středu
    c.fillStyle = '#e8dcc8'; c.fillRect(905, 250, 110, 330);
    c.fillStyle = '#6d8f7a'; c.beginPath(); c.moveTo(895, 250); c.lineTo(960, 120); c.lineTo(1025, 250); c.fill();
    c.fillStyle = '#fbfdff'; c.beginPath(); c.moveTo(905, 252); c.lineTo(960, 136); c.lineTo(1015, 252); c.lineTo(1000, 252); c.lineTo(960, 168); c.lineTo(920, 252); c.fill();
    c.strokeStyle = '#d9b44a'; c.lineWidth = 4; c.beginPath(); c.moveTo(960, 120); c.lineTo(960, 88); c.moveTo(948, 100); c.lineTo(972, 100); c.stroke();
    c.fillStyle = '#fff3d6'; c.beginPath(); c.arc(960, 300, 22, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#7a6a58'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.moveTo(960, 300); c.lineTo(960, 286); c.moveTo(960, 300); c.lineTo(970, 304); c.stroke();
    // řada domů
    const palette = ['#f2b8b5', '#f6d9a8', '#b9d8c2', '#a9c6e8', '#e9c3e0', '#f4e4b8', '#c7e0e8', '#f0c6a4'];
    const roofs = ['#a65d57', '#8a5a4a', '#6f7f9a', '#9b6b5e'];
    let x = -20, i = 0;
    while (x < 1940) {
      const w = 130 + rnd(i, 5) * 90, h = 220 + rnd(i, 6) * 120;
      if (!(x + w > 880 && x < 1040)) house(c, x, 585, w, h, palette[i % palette.length], roofs[i % roofs.length], i + 3);
      x += w + 4; i++;
    }
    // zem – zasněžené náměstí
    const ground = c.createLinearGradient(0, 560, 0, 1080);
    ground.addColorStop(0, '#e7eef8'); ground.addColorStop(1, '#f7f9fc');
    c.fillStyle = ground; c.fillRect(0, 575, 1920, 505);
    c.fillStyle = 'rgba(190,200,225,0.35)'; c.fillRect(0, 575, 1920, 10);
    // vyšlapaná dlažba (cestičky)
    c.fillStyle = 'rgba(170,160,170,0.18)';
    c.beginPath(); c.ellipse(960, 820, 820, 190, 0, 0, Math.PI * 2); c.fill();
    for (let k = 0; k < 900; k++) {
      const px = rnd(k, 7) * 1920, py = 600 + rnd(k, 8) * 470;
      const inPath = ((px - 960) / 820) ** 2 + ((py - 820) / 190) ** 2 < 1;
      if (!inPath) continue;
      c.fillStyle = `rgba(150,140,150,${0.08 + rnd(k, 10) * 0.12})`;
      roundRect(c, px, py, 18 + rnd(k, 11) * 10, 8 + rnd(k, 12) * 4, 3); c.fill();
    }
    // sněhové závěje a stopy
    for (let k = 0; k < 40; k++) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(rnd(k, 13) * 1920, 600 + rnd(k, 14) * 460, 40 + rnd(k, 15) * 80, 8 + rnd(k, 16) * 10, 0, 0, Math.PI * 2); c.fill(); }
    // zasněžený záhon (pevná překážka v demu)
    c.fillStyle = '#8f7a6a'; c.beginPath(); c.ellipse(1560, 648, 92, 30, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fbfdff'; c.beginPath(); c.ellipse(1560, 640, 88, 28, 0, 0, Math.PI * 2); c.fill();
    for (let k = 0; k < 7; k++) { c.fillStyle = '#4f7a5f'; c.beginPath(); c.arc(1500 + k * 20, 632 - (k % 2) * 6, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(1500 + k * 20, 627 - (k % 2) * 6, 6, Math.PI, 0); c.fill(); }
  });
}

async function stand() {
  // 280 × 260 logických jednotek, kotva dole uprostřed.
  await save('stanek.png', 280, 260, (c) => {
    c.fillStyle = 'rgba(60,70,110,0.16)'; c.beginPath(); c.ellipse(140, 252, 130, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9c6b4a'; c.fillRect(22, 70, 236, 182);
    for (let y = 80; y < 250; y += 16) { c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(22, y, 236, 2); }
    c.fillStyle = '#5c3b2a'; c.fillRect(34, 96, 212, 70); // otvor
    glow(c, 140, 130, 120, 'rgba(255,200,120,ALPHA)', 0.55);
    c.fillStyle = '#ffe9b8'; c.fillRect(40, 102, 200, 58);
    c.fillStyle = '#b07d58'; c.fillRect(28, 158, 224, 14); // pult
    c.fillStyle = '#fbfdff'; c.fillRect(26, 156, 228, 4);
    c.fillStyle = '#f4f0e8'; for (let k = 0; k < 4; k++) c.fillRect(60 + k * 14, 140, 9, 16);
    // stříška s pruhy
    for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#fbf3ea' : '#c8553d'; c.beginPath(); c.moveTo(6 + k * 33.5, 72); c.lineTo(6 + (k + 1) * 33.5, 72); c.lineTo(6 + (k + 1) * 33.5, 48); c.lineTo(6 + k * 33.5, 48); c.fill(); c.beginPath(); c.arc(6 + k * 33.5 + 16.75, 72, 16.75, 0, Math.PI); c.fill(); }
    c.fillStyle = '#fbfdff'; roundRect(c, 0, 26, 280, 26, 12); c.fill();
    c.fillStyle = '#7a4f38'; roundRect(c, 86, 0, 108, 30, 6); c.fill();
    c.fillStyle = '#fff3d6'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.fillText('KÁVA', 140, 22);
    // světýlka
    for (let k = 0; k < 12; k++) { const lx = 18 + k * 22, ly = 90 + Math.sin(k * 0.9) * 3; glow(c, lx, ly, 10, 'rgba(255,215,120,ALPHA)', 0.8); c.fillStyle = ['#ffd36b', '#ff9a7a', '#a8e0ff'][k % 3]; c.beginPath(); c.arc(lx, ly, 3, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#fbfdff'; c.fillRect(20, 246, 240, 8);
  });
}

async function table() {
  await save('stolecek.png', 90, 110, (c) => {
    c.fillStyle = 'rgba(60,70,110,0.18)'; c.beginPath(); c.ellipse(45, 104, 32, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a4a58'; c.fillRect(42, 20, 6, 82); c.fillRect(26, 98, 38, 6);
    c.fillStyle = '#7a5a48'; c.beginPath(); c.ellipse(45, 18, 42, 11, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fbfdff'; c.beginPath(); c.ellipse(45, 14, 40, 8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c8553d'; c.fillRect(38, 2, 14, 10); glow(c, 45, 4, 14, 'rgba(255,200,110,ALPHA)', 0.7);
  });
}

async function tree() {
  await save('strom.png', 300, 480, (c) => {
    c.fillStyle = 'rgba(60,70,110,0.18)'; c.beginPath(); c.ellipse(150, 468, 120, 12, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6b4a3a'; c.fillRect(136, 420, 28, 52);
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const top = 40 + t * 72, bot = top + 120, half = 40 + t * 26;
      c.fillStyle = ['#2f6b55', '#2a6150', '#2f6b55', '#346f58', '#2a6150'][t];
      c.beginPath(); c.moveTo(150, top); c.lineTo(150 + half, bot); c.quadraticCurveTo(150, bot + 14, 150 - half, bot); c.closePath(); c.fill();
      c.fillStyle = '#fbfdff'; c.beginPath(); c.moveTo(150 - half, bot); c.quadraticCurveTo(150, bot + 14, 150 + half, bot); c.quadraticCurveTo(150 + half * 0.6, bot - 6, 150, bot - 2); c.quadraticCurveTo(150 - half * 0.6, bot - 6, 150 - half, bot); c.fill();
    }
    // světýlka a ozdoby
    for (let k = 0; k < 46; k++) {
      const ty = 70 + rnd(k, 20) * 360, half = ((ty - 40) / 420) * 150;
      const tx = 150 + (rnd(k, 21) * 2 - 1) * half * 0.85;
      glow(c, tx, ty, 12, 'rgba(255,215,120,ALPHA)', 0.65);
      c.fillStyle = ['#ffd36b', '#ff8f7a', '#ffe9b8', '#b5e3ff'][k % 4]; c.beginPath(); c.arc(tx, ty, k % 5 === 0 ? 6 : 3, 0, Math.PI * 2); c.fill();
    }
    glow(c, 150, 36, 40, 'rgba(255,230,140,ALPHA)', 0.8);
    c.fillStyle = '#ffd34d'; c.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 9 : 22, a = -Math.PI / 2 + (k * Math.PI) / 5; c.lineTo(150 + Math.cos(a) * r, 36 + Math.sin(a) * r); }
    c.closePath(); c.fill();
    c.fillStyle = '#fbfdff'; roundRect(c, 60, 456, 180, 16, 8); c.fill();
  });
}

async function bin() {
  await save('kos.png', 54, 80, (c) => {
    c.fillStyle = 'rgba(60,70,110,0.18)'; c.beginPath(); c.ellipse(27, 76, 22, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4f6f5e'; c.beginPath(); c.moveTo(6, 16); c.lineTo(48, 16); c.lineTo(44, 76); c.lineTo(10, 76); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 4; k++) c.fillRect(13 + k * 8, 22, 3, 48);
    c.fillStyle = '#3c5548'; roundRect(c, 2, 10, 50, 9, 4); c.fill();
    c.fillStyle = '#fbfdff'; roundRect(c, 4, 4, 46, 9, 4); c.fill();
  });
}

async function lamp() {
  await save('lampa.png', 60, 300, (c) => {
    glow(c, 30, 40, 60, 'rgba(255,205,120,ALPHA)', 0.55);
    c.fillStyle = '#3d3f52'; c.fillRect(26, 50, 8, 245); c.fillRect(18, 285, 24, 12);
    c.fillStyle = '#3d3f52'; c.beginPath(); c.moveTo(14, 26); c.lineTo(46, 26); c.lineTo(40, 58); c.lineTo(20, 58); c.fill();
    c.fillStyle = '#ffe2a0'; c.fillRect(21, 30, 18, 24);
    c.fillStyle = '#fbfdff'; roundRect(c, 10, 18, 40, 9, 4); c.fill();
  });
}

async function snowbank() {
  await save('zavej-plot.png', 640, 150, (c) => {
    c.fillStyle = '#8a6a55';
    for (let k = 0; k < 13; k++) { c.fillRect(20 + k * 48, 20, 12, 110); c.beginPath(); c.moveTo(20 + k * 48, 20); c.lineTo(26 + k * 48, 10); c.lineTo(32 + k * 48, 20); c.fill(); }
    c.fillRect(10, 45, 620, 10); c.fillRect(10, 85, 620, 10);
    c.fillStyle = '#fbfdff';
    c.beginPath(); c.moveTo(0, 150); c.quadraticCurveTo(80, 70, 200, 110); c.quadraticCurveTo(320, 60, 440, 105); c.quadraticCurveTo(560, 70, 640, 120); c.lineTo(640, 150); c.fill();
    c.fillStyle = 'rgba(180,195,225,0.5)'; c.beginPath(); c.moveTo(0, 150); c.quadraticCurveTo(160, 120, 320, 140); c.quadraticCurveTo(480, 120, 640, 145); c.lineTo(640, 150); c.fill();
  });
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await Promise.all([background(), stand(), table(), tree(), bin(), lamp(), snowbank()]);
  const assets: AssetEntry[] = [
    { id: 'builtin_pozadi', kind: 'image', name: 'Pozadí – zimní náměstí (test)', file: 'pozadi-namesti.png', width: 3840, height: 2160, anchor: { x: 0, y: 0 }, pixelScale: 0.5, provisional: true },
    {
      id: 'builtin_stanek', kind: 'image', name: 'Stánek s kávou (test)', file: 'stanek.png', width: 560, height: 520, anchor: { x: 0.5, y: 0.975 }, pixelScale: 0.5, provisional: true,
      defaultFootprint: [{ x: -125, y: -40 }, { x: 125, y: -40 }, { x: 125, y: 6 }, { x: -125, y: 6 }],
      defaultInteraction: { kind: 'stand', points: [
        { id: 'service1', kind: 'service', offset: { x: 0, y: 40 }, facing: -Math.PI / 2, label: 'Obsluha' },
        { id: 'queue1', kind: 'queue', offset: { x: -70, y: 85 }, facing: -Math.PI / 2 + 0.5, label: 'Fronta 1' },
        { id: 'queue2', kind: 'queue', offset: { x: -130, y: 120 }, facing: -Math.PI / 2 + 0.6, label: 'Fronta 2' },
        { id: 'counter', kind: 'counter', offset: { x: 20, y: -92 }, label: 'Pult' },
      ] },
    },
    {
      id: 'builtin_stolecek', kind: 'image', name: 'Stoleček (test)', file: 'stolecek.png', width: 180, height: 220, anchor: { x: 0.5, y: 0.95 }, pixelScale: 0.5, provisional: true,
      defaultFootprint: [{ x: -22, y: -8 }, { x: 22, y: -8 }, { x: 22, y: 6 }, { x: -22, y: 6 }],
      defaultInteraction: { kind: 'table', points: [
        { id: 'seat1', kind: 'seat', offset: { x: -52, y: 12 }, facing: -0.2, label: 'Místo 1' },
        { id: 'seat2', kind: 'seat', offset: { x: 52, y: 12 }, facing: Math.PI + 0.2, label: 'Místo 2' },
      ] },
    },
    {
      id: 'builtin_strom', kind: 'image', name: 'Vánoční strom (test)', file: 'strom.png', width: 600, height: 960, anchor: { x: 0.5, y: 0.975 }, pixelScale: 0.5, provisional: true,
      defaultFootprint: [{ x: -75, y: -28 }, { x: 75, y: -28 }, { x: 75, y: 14 }, { x: -75, y: 14 }],
      defaultInteraction: { kind: 'viewpoint', points: [
        { id: 'view1', kind: 'view', offset: { x: -105, y: 75 }, facing: -1.0, label: 'Výhled 1' },
        { id: 'view2', kind: 'view', offset: { x: 105, y: 75 }, facing: -2.14, label: 'Výhled 2' },
      ] },
    },
    {
      id: 'builtin_kos', kind: 'image', name: 'Koš (test)', file: 'kos.png', width: 108, height: 160, anchor: { x: 0.5, y: 0.95 }, pixelScale: 0.5, provisional: true,
      defaultFootprint: [{ x: -18, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 5 }, { x: -18, y: 5 }],
      defaultInteraction: { kind: 'bin', points: [
        { id: 'drop1', kind: 'drop', offset: { x: 0, y: 34 }, facing: -Math.PI / 2, label: 'Vhození' },
        { id: 'opening', kind: 'counter', offset: { x: 0, y: -64 }, label: 'Otvor koše' },
      ] },
    },
    { id: 'builtin_lampa', kind: 'image', name: 'Lampa (test)', file: 'lampa.png', width: 120, height: 600, anchor: { x: 0.5, y: 0.985 }, pixelScale: 0.5, provisional: true,
      defaultFootprint: [{ x: -9, y: -5 }, { x: 9, y: -5 }, { x: 9, y: 4 }, { x: -9, y: 4 }] },
    { id: 'builtin_zavej', kind: 'image', name: 'Závěj s plotem – popředí (test)', file: 'zavej-plot.png', width: 1280, height: 300, anchor: { x: 0.5, y: 1 }, pixelScale: 0.5, provisional: true },
    { id: 'builtin_postava', kind: 'character', name: 'Testovací postava (provizorní)', file: 'test-figure.json', provisional: true },
  ];
  await fs.writeFile(path.join(OUT, 'test-figure.json'), JSON.stringify(testFigureManifest(), null, 2));
  await fs.writeFile(path.join(OUT, 'builtin.json'), JSON.stringify({ format: 'zimni-scena-knihovna', version: 1, assets }, null, 2));
  console.log('Vestavěné assety vygenerovány do', OUT);
}
main();
