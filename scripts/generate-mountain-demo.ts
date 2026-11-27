/**
 * Scéna „Horské městečko – růžový západ slunce“ (zadání grafika/horske-mestecko/ZADANI_PRO_CLAUDE.md):
 * bobovací svah vlevo, běžkařské stopy vpravo, chodník s lampami, silnice s traktorem, smrk v popředí.
 * Souřadnice ze zadání jsou normalizované (u, v) vůči obrázku 1672 × 941; scéna je 1920 × 1080
 * (stejný poměr, U() převádí). Trasy a měřítko jsou vizuálně doladěné vůči malbě (viz dokument scény).
 * Spuštění: npx tsx scripts/generate-mountain-demo.ts [cílová složka]
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

const G = 'grafika/horske-mestecko';
const U = (u: number, v: number): Vec2 => ({ x: Math.round(u * 1920 * 10) / 10, y: Math.round(v * 1080 * 10) / 10 });
/** Konfigurace scény (px scény 1920 × 1080). */
export const MOUNTAIN = {
  /** měřítko: dospělý na chodníku (y ≈ 835) ~7 % výšky obrazu, u domů (y ≈ 425) ~3,2 % */
  depth: { yFar: 425, scaleFar: 0.27, yNear: 1080, scaleNear: 0.773 },
  /** hlavní chodník (střed průchozí šířky, mezi horním valem a obrubou) */
  promenade: [[-70, 842], [180, 842], [420, 840], [700, 839], [960, 837], [1200, 831], [1440, 820], [1680, 808], [1990, 792]] as [number, number][],
  /** vzdálená trasa podél prahů domů (samostatná, nepropojená přes svah ani stopy) */
  houses: [[1990, 432], [1820, 430], [1620, 432], [1420, 434], [1220, 432], [1060, 430]] as [number, number][],
  /** místa, kde se chodci zastaví a dívají se na děti na svahu */
  watch: [[346, 836], [1075, 832]] as [number, number][],
  lamps: [{ x: 461, y: 872, h: 0.19 }, { x: 1536, y: 848, h: 0.165 }],
  spruce: { x: 1882, y: 1069, h: 0.5 },
  /** běžkařská dvojitá stopa: tam po horní, zpět po dolní (obrat na otevřeném konci obloukem) */
  ski: [[1990, 410], [1842, 414], [1814, 421], [1709, 452], [1536, 495], [1402, 543], [1334, 586], [1318, 606], [1340, 612], [1414, 566], [1548, 515], [1720, 470], [1828, 436], [1990, 428]] as [number, number][],
};

export async function generateMountain(dir: string): Promise<ProjectFile> {
  await fs.rm(dir, { recursive: true, force: true });
  await createProjectDir(dir);
  const meta = JSON.parse(await fs.readFile(path.join(G, 'podklady.json'), 'utf8'));
  const p = createEmptyProject('Horské městečko – západ slunce', 7311);
  p.scene.depth = { enabled: true, ...MOUNTAIN.depth };
  p.scene.snowfall = { enabled: true, density: 0.22, wind: 0.05 }; // řídké, pomalé vločky (nezakrývají malbu)
  p.scene.environment = { variableSnow: true, gusts: false, cupSteam: false, stallSteam: false, sources: [] };
  p.scene.vectorFigures = true; p.scene.paintedHeads = true; // vektorová těla a oděvy, malované obličeje
  const imp = async (file: string, name: string, anchor: Vec2): Promise<AssetEntry> => {
    const a = await importAssetFile(dir, path.join(G, file), 'image'); a.name = name; a.anchor = anchor; a.pixelScale = 1; p.assets.push(a); return a;
  };
  const bg = await imp('pozadi.png', 'Pozadí – horské městečko', { x: 0, y: 0 }); bg.pixelScale = 1920 / 1672; p.scene.backgroundAssetId = bg.id;
  const lamp = await imp('lampa-scena.png', 'Vánoční lampa', { x: meta.lampa.anchor[0], y: meta.lampa.anchor[1] });
  lamp.shape = { bodyU0: 0.42, bodyU1: 0.58, depthM: 0.3, lights: [{ u: 0.5, v: 0.17, color: '#FFD6A0', heightM: 3.4, radiusM: 2.4, groundGain: 0.05, haloOpacity: 0.05, haloSigmaPx: 3.5, characterGain: 0.1, flicker: 0.01 }] };
  const spruce = await imp('smrk-scena.png', 'Smrk (popředí)', { x: meta.smrk.anchor[0], y: meta.smrk.anchor[1] });
  const inv = await importAssetFile(dir, 'grafika/tramvaj/neviditelny.png', 'image'); inv.name = 'Místo pro pozorování'; inv.anchor = { x: 0.5, y: 1 }; p.assets.push(inv);
  for (const id of ['builtin_postava_cg', 'builtin_postava_dite']) await addBuiltinAsset('resources/builtin', dir, p, id);
  const obj = (o: Partial<SceneObject> & Pick<SceneObject, 'id' | 'name' | 'assetId' | 'x' | 'y' | 'scale'>): SceneObject => ({ layer: 'world', zBias: 0, flipX: false, visible: true, locked: false, ...o });
  const lampI = () => { const x = defaultIntegration(); x.grade.enabled = false; x.lights.enabled = true; x.lights.gain = 0.8; return x; };
  p.objects = [
    // lampy na okraji chodníku: řazení podle paty, kolizní jen pata (lidé ji obejdou z obou stran)
    ...MOUNTAIN.lamps.map((l, i) => obj({ id: `obj_lampa${i + 1}`, name: `Lampa ${i + 1}`, assetId: lamp.id, x: l.x, y: l.y, scale: (l.h * 1080) / meta.lampa.h, integration: lampI(),
      footprint: [{ x: -14, y: -5 }, { x: 14, y: -5 }, { x: 14, y: 5 }, { x: -14, y: 5 }].map((q) => ({ x: Math.round(q.x / ((l.h * 1080) / meta.lampa.h)), y: Math.round(q.y / ((l.h * 1080) / meta.lampa.h)) })) })),
    // smrk: vědomá popřední clona v pravém blízkém rohu (před ním nevede žádná trasa)
    obj({ id: 'obj_smrk', name: 'Smrk v popředí', assetId: spruce.id, x: MOUNTAIN.spruce.x, y: MOUNTAIN.spruce.y, scale: (MOUNTAIN.spruce.h * 1080) / meta.smrk.h, layer: 'foreground' }),
    obj({ id: 'obj_vyhled', name: 'Pohled na svah', assetId: inv.id, x: 700, y: 836, scale: 1,
      interaction: { kind: 'viewpoint', points: MOUNTAIN.watch.map(([x, y], i) => ({ id: `watch${i + 1}`, kind: 'view' as const, offset: { x: x - 700, y: y - 836 }, facing: -Math.PI / 2 - 0.4, label: `Dívá se na děti ${i + 1}` })) } }),
  ];
  // trasy: chodník (portály mimo obraz) a vzdálená trasa u domů (portál vpravo)
  const nodes: NavNode[] = [], edges: NavEdge[] = [];
  const chain = (pts: [number, number][], pre: string, label: string) => pts.forEach(([x, y], i) => {
    nodes.push({ id: `${pre}${i}`, x, y, name: `${label} ${i}`, portal: x < 0 || x > 1920 || undefined });
    if (i) edges.push({ id: `e_${pre}${i}`, a: `${pre}${i - 1}`, b: `${pre}${i}`, oneWay: false, narrow: false });
  });
  chain(MOUNTAIN.promenade, 'c', 'Chodník'); chain(MOUNTAIN.houses, 'd', 'U domů');
  p.nav.nodes = nodes; p.nav.edges = edges;
  p.areas = [{ id: 'area_snih', name: 'Sníh', kind: 'snow', polygon: [{ x: 0, y: 250 }, { x: 1920, y: 250 }, { x: 1920, y: 1080 }, { x: 0, y: 1080 }] }];
  p.zones = [{ id: 'zone_svah', name: 'Pozorování dětí na svahu', activityType: 'viewing', activityVersion: 1, enabled: true, bounds: [{ x: 0, y: 790 }, { x: 1920, y: 790 }, { x: 1920, y: 880 }, { x: 0, y: 880 }], objectRoles: { view: ['obj_vyhled'] }, params: { lookMin: 8, lookMax: 25 } }];
  // postavy: chodci (jednotlivci, dvojice), majitelé psů
  await importBreeds(dir, p, ['dog_collie', 'dog_dachshund']);
  const lib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-cg/library.json', 'utf8')) as PartLibrary;
  const pal = { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' };
  const heads = ['head_01_cg', 'head_03_cg', 'head_05_cg', 'head_07_cg', 'head_02_cg', 'head_08_cg', 'head_06_cg', 'head_04_cg', 'head_10_cg', 'head_11_cg'];
  const names = ['Tereza', 'Lukáš', 'Monika', 'Filip', 'Hedvika', 'Ondřej', 'Kristýna', 'Radim', 'Pan Josef', 'Paní Alena'];
  const apps = generateGroup(lib, heads.length, 7312).appearances;
  const starts = ['c0', 'c8', 'd0', 'c0', 'c8', 'd0'];
  p.characters = apps.map((app, i): CharacterInstance => {
    app.variants = { ...app.variants, head: heads[i] };
    return { id: `ch_${i + 1}`, name: names[i], assetId: 'builtin_postava_cg', startNodeId: starts[i % starts.length], baseScale: 1, walkSpeed: Math.round(56 * app.motion.speed * 10) / 10, palette: pal, wander: true, appearance: app, routine: 'visitor', activities: {}, ...(i >= 8 ? { gaitProfile: 'elderA' as const } : {}) };
  });
  // dvojice: senioři za ruce, mladý pár vedle sebe
  Object.assign(p.characters[9], { companionId: 'ch_9', companionSide: 1, holdHands: true });
  Object.assign(p.characters[3], { companionId: 'ch_3', companionSide: -1 });
  // psi: kolie a jezevčík
  Object.assign(p.characters[1], { pet: 'dog', petBreed: 'dog_collie' }); Object.assign(p.characters[6], { pet: 'dog', petBreed: 'dog_dachshund' });
  // běžkaři (epizoda A01): tam po horní stopě, obrat na konci, zpět po dolní
  const skiApps = generateGroup(lib, 2, 7313).appearances;
  ['ch_bezkar1', 'ch_bezkar2'].forEach((id, i) => { skiApps[i].variants = { ...skiApps[i].variants, head: ['head_02_cg', 'head_07_cg'][i] }; p.characters.push({ id, name: ['Běžkař Vítek', 'Běžkařka Jitka'][i], assetId: 'builtin_postava_cg', startNodeId: 'c8', baseScale: 1, walkSpeed: 55, palette: pal, wander: false, appearance: skiApps[i], routine: 'actor', activities: {} }); });
  p.episodes = [
    { id: 'ep_bezky1', type: 'ski', actors: ['ch_bezkar1'], interval: [70, 140], firstAt: 12, pts: {}, paths: { track: MOUNTAIN.ski.map(([x, y]) => ({ x, y })) } },
    { id: 'ep_bezky2', type: 'ski', actors: ['ch_bezkar2'], interval: [90, 170], firstAt: 55, pts: {}, paths: { track: MOUNTAIN.ski.map(([x, y]) => ({ x, y })) } },
  ];
  // bobování: 5 dětí v cyklu (fronta → jízda → dojezd → návrat → výstup), rodič u dojezdu
  const kidLib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-child/library.json', 'utf8')) as PartLibrary;
  const kidApps = generateGroup(kidLib, 6, 7314).appearances;
  const kidNames = ['Vojta', 'Eliška', 'Kuba', 'Natálka', 'Šimon', 'Bára'];
  kidApps.forEach((app, i) => p.characters.push({ id: `kid_bob${i + 1}`, name: kidNames[i], assetId: 'builtin_postava_dite', startNodeId: 'c0', baseScale: 1, walkSpeed: 50, palette: pal, wander: false, appearance: app, routine: 'hill', activities: {} }));
  const parApp = generateGroup(lib, 1, 7315).appearances[0]; parApp.variants = { ...parApp.variants, head: 'head_06_cg' };
  p.characters.push({ id: 'ch_rodic_svah', name: 'Táta u svahu', assetId: 'builtin_postava_cg', startNodeId: 'c0', baseScale: 1, walkSpeed: 54, palette: pal, wander: false, appearance: parApp, routine: 'hill', activities: {} });
  const V = (pts: [number, number][]) => pts.map(([x, y]) => ({ x, y }));
  // tři dráhy vějířem přes svah (nekříží se, nejmenší rozestup 2,45 m); návrat pod konci všech drah
  const lanes: [number, number][][] = [
    [[215, 345], [385, 418], [560, 535], [715, 640], [805, 700], [855, 728]],
    [[360, 338], [540, 410], [725, 515], [890, 622], [1000, 692], [1060, 722]],
    [[515, 334], [700, 400], [885, 495], [1060, 598], [1185, 680], [1260, 714]],
  ];
  const bottom: [number, number][] = [[1110, 754], [800, 753], [560, 752], [330, 750], [150, 742]];
  p.hill = {
    footY: 700, rise: 0.75, blend: 70, firstDelay: 2, laneCount: 5, kidsN: 10, runShare: 0.4, rideSpeed: 1, paused: false,
    lanes: lanes.map(V),
    returnLine: V(bottom),
    returns: lanes.map((L) => { const e = L[L.length - 1]; return V([[e[0] - 18, e[1] + 24], ...bottom.filter(([x]) => x < e[0] - 60)]); }),
    ascent: V([[150, 742], [120, 690], [100, 620], [85, 540], [78, 460], [80, 390], [95, 335], [130, 312]]),
    queue: V([[185, 322], [150, 309], [118, 298], [90, 290]]),
    kids: kidApps.map((_, i) => `kid_bob${i + 1}`), watchers: ['ch_rodic_svah'], watchSpots: V([[250, 712]]),
  };
  // traktor s radlicí po silnici (osa podle obou okrajů silnice; začátek i konec mimo obraz)
  p.plow = { path: V([[-320, 968], [300, 965], [800, 960], [1200, 951], [1600, 936], [1950, 918], [2260, 902]]), firstDelay: [60, 120], interval: [240, 420], traversal: [25, 40], bandW: 2.6, enabled: true };
  p.crowd = { walkersN: 6, dogs: 2, walkSpeed: 0.95 };
  p.export = { ...p.export, durationSec: 60, chunkSec: 20 };
  await saveProject(dir, p);
  return p;
}

if (process.argv[1]?.includes('generate-mountain-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Horske-mestecko.zscena');
  generateMountain(dir).then(() => console.log('Demo vytvořeno:', dir));
}
