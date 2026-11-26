/**
 * Scéna „Vánoční tramvajová ulice“: klidná zasněžená ulice, občas přijede tramvaj (zprava doleva),
 * zastaví u zastávky, lidé vystoupí a nastoupí; pekař občas vyjde zamést sníh; drobný pouliční život.
 * Podklady: grafika/tramvaj (scripts/process-tram-graphics.py). Vše v souřadnicích scény 1920×1080
 * (pozadí 1672×941 zvětšené ×1,148 – px pozadí se převádějí funkcí B()).
 * Spuštění: npx tsx scripts/generate-tram-demo.ts [cílová složka]
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createEmptyProject } from '../src/core/model/defaults';
import type { ProjectFile, NavNode, NavEdge, CharacterInstance, AssetEntry, SceneObject } from '../src/core/model/types';
import type { Vec2 } from '../src/core/math/vec';
import { addBuiltinAsset } from '../src/node/builtin';
import type { PartLibrary } from '../src/core/anim/partLibrary';
import { generateGroup } from '../src/core/anim/appearanceGenerator';
import { createProjectDir, saveProject, importAssetFile } from '../src/node/projectIO';
import { defaultIntegration } from '../src/core/render/integration';
import { importBreeds } from './generate-liberec-demo';

const G = 'grafika/tramvaj';
/** Přehledná konfigurace scény (px pozadí 1672×941; převod B()). */
export const TRAM_SCENE = {
  /** perspektiva postav: plochá malba – horizont y ≈ 350, 0,00355/px (dveře pekárny ~2 m; zastávka ~7 m od kolejí) */
  depth: { yFar: 597, scaleFar: 0.877, yNear: 1080, scaleNear: 2.59 },
  /** vůz: výška střechy (px) u zastávky a u levého okraje (vlastní měřítko, viz TramConfig.scale) */
  tramScale: { y0: 612, h0: 190, y1: 790, h1: 300 },
  shelterFootY: 565,
  tram: { stopDoorX: 1478, interval: [100, 180] as [number, number], alight: [0, 3] as [number, number], board: [0, 4] as [number, number], firstAt: 35 },
  waitSpots: [[1462, 570], [1505, 574], [1548, 571], [1420, 580]] as [number, number][],
  bakery: { door: [219, 440, 281, 592] as [number, number, number, number], inside: [250, 589] as [number, number], outside: [262, 626] as [number, number], sweep: [[240, 631], [520, 624]] as [[number, number], [number, number]], interval: [180, 360] as [number, number], firstAt: 60, crateSpot: [312, 614] as [number, number] },
  farPath: [[-70, 628], [120, 627], [262, 629], [520, 623], [800, 600], [1000, 568], [1180, 547], [1350, 529], [1520, 516], [1730, 511]] as [number, number][],
  nearPath: [[-80, 772], [300, 766], [650, 742], [950, 700], [1200, 640], [1380, 597], [1460, 591], [1600, 596], [1760, 606]] as [number, number][],
  window: [[392, 628], [452, 624]] as [number, number][],
  visitors: 11, families: 2, seniors: 1, dogs: 1,
};

export async function generateTram(dir: string): Promise<ProjectFile> {
  await fs.rm(dir, { recursive: true, force: true });
  await createProjectDir(dir);
  const meta = JSON.parse(await fs.readFile(path.join(G, 'podklady.json'), 'utf8'));
  const K = 1920 / meta.src[0], B = (x: number, y: number): Vec2 => ({ x: Math.round(x * K * 10) / 10, y: Math.round(y * K * 10) / 10 });
  const p = createEmptyProject('Vánoční tramvajová ulice', 4242);
  p.scene.depth = { enabled: true, ...TRAM_SCENE.depth };
  p.scene.snowfall = { enabled: true, density: 0.4, wind: 0.08 };
  p.scene.environment = { variableSnow: true, gusts: false, cupSteam: true, stallSteam: false, sources: [] };
  const imp = async (file: string, name: string, anchor: Vec2, id?: string): Promise<AssetEntry> => {
    const a = await importAssetFile(dir, path.join(G, file), 'image'); a.name = name; a.anchor = anchor; a.pixelScale = 1; if (id) a.id = id; p.assets.push(a); return a;
  };
  const bg = await imp('pozadi-ulice.png', 'Pozadí – vánoční tramvajová ulice', { x: 0, y: 0 }); p.scene.backgroundAssetId = bg.id;
  const z = meta.zastavka, fy = TRAM_SCENE.shelterFootY;
  const shelter = await imp('zastavka.png', 'Zastávka', { x: 0, y: (fy - z.y0) / z.h });
  const fg = await imp('popredi.png', 'Popředí – lampa, lavička, zábradlí', { x: 0, y: 0 });
  const tramA = await imp('tramvaj.png', 'Tramvaj', { x: 0, y: 0 }, 'tram_sprite');
  const inv = await imp('neviditelny.png', 'Výloha pekárny (bod pro prohlížení)', { x: 0.5, y: 1 });
  for (const id of ['builtin_postava_cg', 'builtin_postava_dite']) await addBuiltinAsset('resources/builtin', dir, p, id);
  const I = () => { const x = defaultIntegration(); x.grade.enabled = false; x.lights.enabled = false; return x; };
  const S0 = B(z.x0, fy);
  shelter.shape = { bodyU0: 0.1, bodyU1: 0.95, depthM: 1.6 };
  const obj = (o: Partial<SceneObject> & Pick<SceneObject, 'id' | 'name' | 'assetId' | 'x' | 'y' | 'scale'>): SceneObject => ({ layer: 'world', zBias: 0, flipX: false, visible: true, locked: false, ...o });
  p.objects = [
    // zastávka: kolizní jen sloupky (lidé stojí pod střechou)
    obj({ id: 'obj_zastavka', name: 'Zastávka', assetId: shelter.id, x: S0.x, y: S0.y, scale: K, integration: I(),
      footprint: [[1426, 558], [1436, 558], [1436, 568], [1426, 568]].map(([x, y]) => ({ x: Math.round((x - z.x0)), y: Math.round(y - fy) })) }),
    obj({ id: 'obj_popredi', name: 'Popředí – lampa, lavička, zábradlí', assetId: fg.id, x: 0, y: 0, scale: K, layer: 'foreground' }),
    obj({ id: 'obj_vyloha', name: 'Výloha pekárny', assetId: inv.id, ...B(422, 600), scale: 1,
      interaction: { kind: 'viewpoint', points: TRAM_SCENE.window.map(([x, y], i) => { const q = B(x, y), o = B(422, 600); return { id: `view${i + 1}`, kind: 'view' as const, offset: { x: Math.round(q.x - o.x), y: Math.round(q.y - o.y) }, facing: -Math.PI / 2, label: `U výlohy ${i + 1}` }; }) } }),
  ];
  // tramvaj (sprite: dotyk podvozků a dveře změřené v obrázku)
  const tm = meta.tramvaj;
  const doorOffset = ((tm.door[0] + tm.door[2]) / 2 - tm.bogieF[0]) * (TRAM_SCENE.tramScale.h0 / (tm.bogieF[1] - tm.roof[1])); // px scény u zastávky
  p.tram = {
    track: meta.track.map(([x, y]: [number, number]) => ({ x, y })), stopX: Math.round(TRAM_SCENE.tram.stopDoorX * K - doorOffset),
    sprite: { assetId: tramA.id, w: tm.w, h: tm.h, bogieF: tm.bogieF, bogieR: tm.bogieR, door: tm.door, heightM: 3.4, heightPx: tm.bogieF[1] - tm.roof[1] },
    scale: TRAM_SCENE.tramScale, interval: TRAM_SCENE.tram.interval, alight: TRAM_SCENE.tram.alight, board: TRAM_SCENE.tram.board, firstAt: TRAM_SCENE.tram.firstAt,
    waitSpots: TRAM_SCENE.waitSpots.map(([x, y]) => B(x, y)),
  };
  const bk = TRAM_SCENE.bakery, d0 = B(bk.door[0], bk.door[1]), d1 = B(bk.door[2], bk.door[3]);
  p.bakery = { bakerId: 'ch_pekar', door: { x0: d0.x, y0: d0.y, x1: d1.x, y1: d1.y, hinge: 'left' }, inside: B(...bk.inside), outside: B(...bk.outside), sweep: [B(...bk.sweep[0]), B(...bk.sweep[1])], interval: bk.interval, firstAt: bk.firstAt, crateSpot: B(...bk.crateSpot), sign: true, tasks: { sweep: 0.45, salt: 0.3, crate: 0.25 } };
  // trasy: vzdálený chodník a přední zasněžený chodník (nespojené – nikdo nepřechází koleje)
  const nodes: NavNode[] = [], edges: NavEdge[] = [];
  const chain = (pts: [number, number][], pre: string, names: Record<number, string> = {}) => pts.forEach(([x, y], i) => {
    const q = B(x, y), id = `${pre}${i}`;
    nodes.push({ id, ...q, name: names[i] ?? `${pre === 'f' ? 'Chodník u obchodů' : 'Přední chodník'} ${i}`, portal: q.x < 0 || q.x > 1920 || undefined });
    if (i) edges.push({ id: `e_${pre}${i}`, a: `${pre}${i - 1}`, b: id, oneWay: false, narrow: false });
  });
  chain(TRAM_SCENE.farPath, 'f', { 0: 'Vstup vlevo (chodník)', 2: 'Před pekárnou', 9: 'Vstup vpravo (chodník)' });
  chain(TRAM_SCENE.nearPath, 'n', { 0: 'Vstup vlevo (vpředu)', 6: 'Zastávka', 8: 'Vstup vpravo (vpředu)' });
  p.nav.nodes = nodes; p.nav.edges = edges;
  p.areas = [{ id: 'area_snih', name: 'Zasněžená ulice', kind: 'snow', polygon: [{ x: 0, y: 560 }, { x: 1920, y: 560 }, { x: 1920, y: 1080 }, { x: 0, y: 1080 }] }];
  p.zones = [{ id: 'zone_vyloha', name: 'Zastavení u výlohy pekárny', activityType: 'viewing', activityVersion: 1, enabled: true, bounds: [{ x: 0, y: 600 }, { x: 1920, y: 600 }, { x: 1920, y: 800 }, { x: 0, y: 800 }], objectRoles: { view: ['obj_vyloha'] }, params: { lookMin: 4, lookMax: 12 } }];
  // psi (díly ras), postavy
  await importBreeds(dir, p, ['dog_collie']);
  const lib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-cg/library.json', 'utf8')) as PartLibrary;
  const childLib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-child/library.json', 'utf8')) as PartLibrary;
  const pal = { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' };
  const vis = generateGroup(lib, TRAM_SCENE.visitors, 4243).appearances, portals = ['f0', 'f9', 'n0', 'n8'];
  const names = ['Adéla', 'Boris', 'Cyril', 'Dagmar', 'Erik', 'Fanny', 'Gerta', 'Hugo', 'Ilona', 'Jonáš', 'Kamila'];
  p.characters = vis.map((app, i): CharacterInstance => ({ id: `ch_${i + 1}`, name: names[i], assetId: 'builtin_postava_cg', startNodeId: portals[i % 4], baseScale: 1, walkSpeed: Math.round(60 * app.motion.speed * 10) / 10, palette: pal, wander: true, appearance: app, routine: 'visitor', activities: {} }));
  p.characters[2].pet = 'dog'; p.characters[2].petBreed = 'dog_collie';
  const kids = generateGroup(childLib, TRAM_SCENE.families, 4244).appearances;
  ['ch_4', 'ch_7'].slice(0, TRAM_SCENE.families).forEach((pid, i) => { const par = p.characters.find((c) => c.id === pid)!; p.characters.push({ id: `kid_${i + 1}`, name: ['Toník', 'Bára'][i], assetId: 'builtin_postava_dite', startNodeId: par.startNodeId, baseScale: 1, walkSpeed: par.walkSpeed, palette: pal, wander: true, appearance: kids[i], routine: 'visitor', activities: {}, companionId: par.id, companionSide: i % 2 ? 1 : -1 }); });
  const old = generateGroup(lib, 1, 4245).appearances[0]; if (lib.variants.some((v) => v.id === 'head_11_cg')) old.variants.head = 'head_11_cg';
  p.characters.push({ id: 'ch_senior', name: 'Pan Bohumil (senior)', assetId: 'builtin_postava_cg', startNodeId: 'f9', baseScale: 0.97, walkSpeed: 50, palette: pal, wander: true, appearance: old, routine: 'visitor', activities: {}, gaitProfile: 'elderA' });
  const baker = generateGroup(lib, 1, 4246).appearances[0];
  p.characters.push({ id: 'ch_pekar', name: 'Pekař', assetId: 'builtin_postava_cg', startNodeId: 'f2', baseScale: 1, walkSpeed: 55, palette: pal, wander: false, appearance: baker, routine: 'baker', activities: {} });
  p.crowd = { walkers: 0.75, skaters: 1 }; // výchozí hustota ~4–8 venku
  p.export = { ...p.export, durationSec: 60, chunkSec: 20 };
  await saveProject(dir, p);
  return p;
}

if (process.argv[1]?.includes('generate-tram-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Tramvajova-ulice.zscena');
  generateTram(dir).then(() => console.log('Demo vytvořeno:', dir));
}
