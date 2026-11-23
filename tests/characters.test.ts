import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import '../src/node/napiRender';
import type { PartLibrary, CharacterAppearance } from '../src/core/anim/partLibrary';
import { validateLibrary } from '../src/core/anim/partLibrary';
import { generateAppearance, generateGroup, validateAppearance, nextSeed, comboKey } from '../src/core/anim/appearanceGenerator';
import { characterVisual } from '../src/core/render/characterPose';
import { drawRig, rigImageKey } from '../src/core/render/rigRenderer';
import { initialAnimState, stepAnimator, playAction } from '../src/core/anim/animator';
import type { AgentState } from '../src/core/sim/types';
import type { CharacterManifest, Direction } from '../src/core/anim/manifest';
import { loadProject, saveProject } from '../src/node/projectIO';
import { generateRadnice } from '../scripts/generate-radnice-demo';
import { tmpDir } from './helpers';
import { Simulation } from '../src/core/sim/simulation';
import { canonicalJson } from '../src/core/model/hash';

const DIR = 'resources/builtin/painted-parts';
let lib: PartLibrary; let manifest: CharacterManifest;
const imgs = new Map<string, unknown>();
const images = { get: (k: string) => imgs.get(k) as never };
const ZD = { enabled: false, yFar: 0, scaleFar: 1, yNear: 1, scaleNear: 1 };

beforeAll(async () => {
  lib = JSON.parse(await fs.readFile(`${DIR}/library.json`, 'utf8'));
  manifest = { ...JSON.parse(await fs.readFile('resources/builtin/malovana-postava.json', 'utf8')), rigLibrary: lib, rigLibraryDir: 'L' };
  for (const p of lib.parts) for (const f of [p.texture, p.mask]) if (f && !imgs.has(rigImageKey('L', f))) imgs.set(rigImageKey('L', f), await loadImage(`${DIR}/${f}`));
});

function visual(app: CharacterAppearance, dir: Direction, phase: number, blend: number, action?: string, t = 0) {
  const anim = initialAnimState(dir); anim.walkPhase = phase; anim.walkBlend = blend; anim.idleTime = 2;
  if (action) { playAction(anim, manifest, action, { duration: 1 }); anim.action!.time = t * anim.action!.duration; }
  const agent = { id: 'a', pos: { x: 0, y: 0 }, facing: 0, lane: 0, anim, holding: action === 'drink' ? 'cup' : null } as unknown as AgentState;
  return characterVisual(agent, manifest, { baseScale: 1, appearance: app }, ZD);
}

describe('generátor postav', () => {
  it('knihovna dílů je konzistentní (délky kostí, kotvy, palety)', () => {
    expect(validateLibrary(lib).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('stejný seed a vstupy ⇒ stejný výsledek (jednotlivec i skupina)', () => {
    expect(generateAppearance(lib, { seed: 99 })).toEqual(generateAppearance(lib, { seed: 99 }));
    expect(generateGroup(lib, 12, 5, { palettes: ['vinova', 'okrova', 'olivova'] })).toEqual(generateGroup(lib, 12, 5, { palettes: ['vinova', 'okrova', 'olivova'] }));
    expect(generateAppearance(lib, { seed: 99 })).not.toEqual(generateAppearance(lib, { seed: 100 }));
  });

  it('nevytváří nekompatibilní kombinace (2000 vzorků) a dodržuje pravidla barev', () => {
    for (let s = 1; s <= 2000; s++) {
      const a = generateAppearance(lib, { seed: s, palettes: s % 3 ? undefined : ['vinova', 'petrolejova', 'kremova'] });
      expect(validateAppearance(lib, a)).toEqual([]);
      if (a.variants.jacket === 'jacket_puffer') expect(a.variants.scarf).not.toBe('scarf_snood'); // vysoký límec × nákrčník
      expect(a.colors.hat).not.toBe(a.colors.jacket);
      expect([a.colors.hat, a.colors.scarf].includes(a.colors.gloves) || !lib.variants.find((v) => v.id === 'gloves_basic')!.paletteOptions.includes(a.colors.hat!)).toBe(true);
      for (const g of ['jacket', 'hat', 'scarf'] as const) expect(lib.variants.find((v) => v.id === a.variants[g])!.paletteOptions).toContain(a.colors[g]);
    }
  });

  it('skupina omezuje opakování; nad počet kombinací hlásí duplicity', () => {
    const g = generateGroup(lib, 12, 2024);
    expect(new Set(g.appearances.map(comboKey)).size).toBe(12);
    for (let i = 1; i < 12; i++) expect(g.appearances[i].colors.jacket).not.toBe(g.appearances[i - 1].colors.jacket);
    expect(g.note).toBeNull();
    const small = generateGroup(lib, 30, 1, { palettes: ['vinova', 'okrova', 'olivova'] }); // kombinací je víc než 30
    expect(small.duplicates).toBe(0);
    const tiny = generateGroup(lib, 40, 1, { palettes: ['tmave-seda'] });
    expect(tiny.uniqueAvailable).toBeLessThan(40);
    expect(tiny.duplicates).toBeGreaterThan(0);
    expect(tiny.note).toMatch(/opakuje/);
  });

  it('přegenerování respektuje zamknuté vlastnosti', () => {
    let a = generateAppearance(lib, { seed: 3 });
    a = { ...a, locks: ['jacket', 'jacketColor', 'hat', 'proportions'] };
    for (let i = 1; i <= 60; i++) {
      const b = generateAppearance(lib, { seed: nextSeed(a.seed, i), base: a });
      expect(b.variants.jacket).toBe(a.variants.jacket);
      expect(b.colors.jacket).toBe(a.colors.jacket);
      expect(b.variants.hat).toBe(a.variants.hat);
      expect(b.proportions).toEqual(a.proportions);
      expect(validateAppearance(lib, b)).toEqual([]);
    }
  });

  it('uložené postavy se po otevření nezmění ani po rozšíření knihovny', async () => {
    const dir = path.join(await tmpDir(), 'R.zscena');
    await generateRadnice(dir);
    const lp = await loadProject(dir);
    const before = canonicalJson(lp.project.characters.map((c) => c.appearance));
    expect(lp.project.characters.length).toBe(12);
    await saveProject(dir, lp.project);
    const lp2 = await loadProject(dir);
    expect(canonicalJson(lp2.project.characters.map((c) => c.appearance))).toBe(before);
    expect(lp2.issues.filter((i) => i.level === 'error')).toEqual([]);
    // rozšíření knihovny o novou bundu: uložené postavy mají konkrétní díly ⇒ vzhled i sestava beze změny
    const libPath = path.join(dir, 'assets/characters/painted-parts-cg/library.json');
    const ext = JSON.parse(await fs.readFile(libPath, 'utf8')) as PartLibrary;
    const coat = ext.variants.find((v) => v.id === 'jacket_coat_cg')!;
    ext.variants.push({ ...coat, id: 'jacket_new', label: 'Nová bunda' });
    ext.parts.push(...ext.parts.filter((p) => p.variantId === 'jacket_coat_cg').map((p) => ({ ...p, id: p.id.replace('jacket_coat_cg', 'jacket_new'), variantId: 'jacket_new' })));
    await fs.writeFile(libPath, JSON.stringify(ext));
    const lp3 = await loadProject(dir);
    const sim = Simulation.create(lp2.project, lp2.manifests); sim.advanceTo(20);
    const sim3 = Simulation.create(lp3.project, lp3.manifests); sim3.advanceTo(20);
    expect(sim3.stateHash()).toBe(sim.stateHash());
    for (const c of lp3.project.characters) {
      const a = sim.state.agents.find((x) => x.id === c.id)!;
      const k1 = characterVisual(a, lp2.manifests[c.assetId], c, lp2.project.scene.depth).rig!.items.map((i) => i.part.id + i.color);
      const k3 = characterVisual(a, lp3.manifests[c.assetId], c, lp3.project.scene.depth).rig!.items.map((i) => i.part.id + i.color);
      expect(k3).toEqual(k1);
    }
  });
});

describe('sestavení a pohyb', () => {
  it('v kloubech nevznikají mezery (chůze, klid, akce, všechny pohledy)', () => {
    const S = 4, W = 140 * S, H = 160 * S;
    const c = createCanvas(W, H); const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
    let checked = 0;
    for (const seed of [1, 2, 3, 4]) {
      const app = generateAppearance(lib, { seed });
      for (const dir of ['E', 'SE', 'NE', 'W'] as Direction[]) for (const [phase, blend, action, t] of [[0, 0], [0.1, 1], [0.3, 1], [0.55, 1], [0.8, 1], [0, 0, 'drink', 0.5], [0, 0, 'receive', 0.55], [0, 0, 'drop', 0.5]] as [number, number, string?, number?][]) {
        const cv = visual(app, dir, phase, blend, action, t);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
        ctx.setTransform(cv.mirror ? -S : S, 0, 0, S, W / 2, H - 10 * S);
        drawRig(ctx, cv.rig!, images, 'L', 0.8);
        const d = ctx.getImageData(0, 0, W, H).data;
        const alpha = (p: { x: number; y: number }) => { const x = Math.round(W / 2 + (cv.mirror ? -p.x : p.x) * S), y = Math.round(H - 10 * S + p.y * S); return d[(y * W + x) * 4 + 3]; };
        // body podél kostí (každých 0,5 jednotky) včetně kloubů musí být kryté dílem
        const segs = [...cv.pose.legs, ...cv.pose.arms].flatMap((l) => [[l.root, l.joint], [l.joint, l.end]]);
        segs.push([cv.pose.hip, cv.pose.neck]);
        for (const [a, b] of segs) {
          const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
          for (let k = 0; k <= n; k++) {
            const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
            const al = alpha(p);
            if (al < 200) throw new Error(`Mezera: ${dir} fáze ${phase} ${action ?? ''} bod ${p.x.toFixed(1)},${p.y.toFixed(1)} alfa ${al}`);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });

  it('tempo kroků odpovídá rychlosti a stojná noha na zemi neklouže', () => {
    const app = generateAppearance(lib, { seed: 8 });
    const strideF = app.motion.strideScale * app.proportions.height;
    const cadence: number[] = [];
    for (const v of [35, 60, 90]) {
      const anim = initialAnimState('E'); anim.walkBlend = 1;
      let cycles = 0, prev = 0, x = 0;
      // stojná noha: zaznamenat světovou polohu kotníku během kontaktu se zemí
      let drift = 0, stanceStart: number | null = null, samples = 0;
      for (let i = 0; i < 60 * 20; i++) {
        stepAnimator(anim, manifest, 1 / 60, v, 60, strideF);
        x += v / 60;
        if (anim.walkPhase < prev) cycles++;
        prev = anim.walkPhase;
        if (i > 120) {
          const agent = { id: 'a', pos: { x: 0, y: 0 }, facing: 0, lane: 0, anim, holding: null } as unknown as AgentState;
          const cv = characterVisual(agent, manifest, { baseScale: 1, appearance: app }, ZD);
          const near = cv.pose.legs[1].end;
          const onGround = Math.abs(near.y + 3 * app.proportions.height) < 0.05;
          const wx = x + near.x;
          if (onGround) { samples++; if (stanceStart === null) stanceStart = wx; else drift = Math.max(drift, Math.abs(wx - stanceStart)); }
          else stanceStart = null;
        }
      }
      cadence.push(cycles / 20);
      expect(samples).toBeGreaterThan(150); // fáze celého chodidla na zemi opravdu měřena
      expect(drift).toBeLessThan(0.6); // jednotek (≈ 0,8 cm) – bez klouzání
    }
    // rychlost = délka kroku × kadence: rychlejší chůze má delší i častější kroky (biomechanika, exponent ~0,45)
    expect(cadence[1]).toBeGreaterThan(cadence[0]);
    expect(cadence[2]).toBeGreaterThan(cadence[1]);
    const strideLen = [35, 60, 90].map((v, i) => v / cadence[i]);
    expect(strideLen[1]).toBeGreaterThan(strideLen[0]);
    expect(cadence[2] / cadence[0]).toBeLessThan(90 / 35); // ne čistě úměrně
  });

  it('klid: různé postavy nejsou synchronní a pohyb je jemný', () => {
    const a1 = generateAppearance(lib, { seed: 11 }), a2 = generateAppearance(lib, { seed: 12 });
    const heads = (app: CharacterAppearance) => Array.from({ length: 50 }, (_, i) => { const cv = visual(app, 'SE', 0, 0); const anim = initialAnimState('SE'); anim.idleTime = i * 0.2; const ag = { id: 'a', pos: { x: 0, y: 0 }, facing: 0, lane: 0, anim, holding: null } as unknown as AgentState; void cv; return characterVisual(ag, manifest, { baseScale: 1, appearance: app }, ZD).pose.head.y; });
    const h1 = heads(a1), h2 = heads(a2);
    const range = (h: number[]) => Math.max(...h) - Math.min(...h);
    expect(range(h1)).toBeGreaterThan(0.1); expect(range(h1)).toBeLessThan(2.5); // dýchání < 2,5 jednotky
    expect(h1).not.toEqual(h2);
  });
});

describe('export se skládanými postavami', () => {
  it('diagnostika kostry je jen v editoru, export ji neobsahuje; postavy jsou v exportu vidět', async () => {
    const { spawnSync } = await import('node:child_process');
    const { loadNodeImages, createNodeFrameRenderer } = await import('../src/node/napiRender');
    const { planExport } = await import('../src/core/export/plan');
    const { runExport } = await import('../src/core/export/runExport');
    const { NodeEncoderHost } = await import('../src/node/exportHost');
    const { locateFfmpeg } = await import('../src/node/ffmpeg');
    const { drawOverlay } = await import('../src/renderer/overlay');
    const { renderFrame } = await import('../src/core/render/sceneRenderer');
    const dir = path.join(await tmpDir(), 'R.zscena');
    await generateRadnice(dir);
    const lp = await loadProject(dir);
    lp.project.export = { ...lp.project.export, durationSec: 2, chunkSec: 2, preset: 'veryfast' };
    const img = await loadNodeImages(lp);
    const W = 1920, H = 1080;
    const magenta = (d: Uint8Array | Uint8ClampedArray) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] < 60 && d[i + 2] > 200) n++; return n; };
    const sim = Simulation.create(lp.project, lp.manifests); sim.advanceTo(1);
    const c = createCanvas(W, H); const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
    renderFrame(ctx, W, H, lp.project, sim, img, 1);
    const clean = ctx.getImageData(0, 0, W, H).data;
    expect(magenta(clean)).toBe(0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawOverlay(ctx, { project: lp.project, sim, selection: null, tool: 'select', px: 1, routeActiveNode: null, drawing: [], mouse: null, dragRect: null, hover: null, rigDiagnostics: true });
    expect(magenta(ctx.getImageData(0, 0, W, H).data)).toBeGreaterThan(100); // pozitivní kontrola
    const out = path.join(await tmpDir(), 'p.mp4');
    const plan = planExport(lp.project);
    await runExport(lp.project, lp.manifests, plan, new NodeEncoderHost(locateFfmpeg()!.path, out, lp.dir), createNodeFrameRenderer(lp, img, W, H));
    const raw = spawnSync(locateFfmpeg()!.path, ['-v', 'error', '-i', out, '-vf', 'select=eq(n\\,30)', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 26 }).stdout as Buffer;
    expect(raw.length).toBe(W * H * 4);
    expect(magenta(raw)).toBe(0);
    // postavy jsou ve snímku: oblast chodidel postavy se liší od snímku bez postav
    const noChars = { ...lp.project, characters: [] };
    const c2 = createCanvas(W, H); const ctx2 = c2.getContext('2d') as unknown as CanvasRenderingContext2D;
    renderFrame(ctx2, W, H, noChars, Simulation.create(noChars, lp.manifests), img, 1);
    const empty = ctx2.getImageData(0, 0, W, H).data;
    let diff = 0; for (let i = 0; i < clean.length; i += 16) if (Math.abs(clean[i] - empty[i]) > 40) diff++;
    expect(diff).toBeGreaterThan(2000);
  });
});

describe('knihovna dílů z ChatGPT (painted-parts-cg)', () => {
  it('je konzistentní, generuje jen platné kombinace a v kloubech nemá mezery', async () => {
    const D = 'resources/builtin/painted-parts-cg';
    const L = JSON.parse(await fs.readFile(`${D}/library.json`, 'utf8')) as PartLibrary;
    expect(validateLibrary(L).filter((i) => i.level === 'error')).toEqual([]);
    for (let s = 1; s <= 300; s++) expect(validateAppearance(L, generateAppearance(L, { seed: s }))).toEqual([]);
    const man = { ...JSON.parse(await fs.readFile('resources/builtin/malovana-postava-cg.json', 'utf8')), rigLibrary: L, rigLibraryDir: 'C' } as CharacterManifest;
    const im = new Map<string, unknown>();
    for (const p of L.parts) for (const f of [p.texture, p.mask]) if (f) im.set(rigImageKey('C', f), await loadImage(`${D}/${f}`));
    const imgs2 = { get: (k: string) => im.get(k) as never };
    const S = 4, W = 140 * S, H = 160 * S;
    const c = createCanvas(W, H); const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
    let checked = 0;
    for (const seed of [1, 2]) {
      const app = generateAppearance(L, { seed });
      for (const dir of ['SE', 'SW', 'E', 'NE'] as Direction[]) for (const [phase, blend] of [[0, 0], [0.1, 1], [0.3, 1], [0.55, 1], [0.8, 1]]) {
        const anim = initialAnimState(dir); anim.walkPhase = phase; anim.walkBlend = blend; anim.idleTime = 2;
        const cv = characterVisual({ id: 'a', pos: { x: 0, y: 0 }, facing: 0, lane: 0, anim, holding: null } as unknown as AgentState, man, { baseScale: 1, appearance: app }, ZD);
        expect(cv.view!.used).toBe('front3q');
        if (dir === 'E' || dir === 'NE') expect(cv.view!.substituted).toBe(true); // explicitní náhrada chybějícího pohledu
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
        ctx.setTransform(cv.mirror ? -S : S, 0, 0, S, W / 2, H - 10 * S);
        drawRig(ctx, cv.rig!, imgs2, 'C', 0.82);
        const d = ctx.getImageData(0, 0, W, H).data;
        const alpha = (p: { x: number; y: number }) => d[(Math.round(H - 10 * S + p.y * S) * W + Math.round(W / 2 + (cv.mirror ? -p.x : p.x) * S)) * 4 + 3];
        const segs = [...cv.pose.legs, ...cv.pose.arms].flatMap((l) => [[l.root, l.joint], [l.joint, l.end]]);
        segs.push([cv.pose.hip, cv.pose.neck]);
        for (const [a, b] of segs) { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2); for (let k = 0; k <= n; k++) { const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }; const al = alpha(p); if (al < 200) throw new Error(`Mezera ${dir} ${phase}: ${p.x.toFixed(1)},${p.y.toFixed(1)} alfa ${al}`); checked++; } }
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });
});
