/**
 * Scéna „Zasněžená ulice“ (zadání grafika/zasnezena-ulice/ZADANI_PRO_CLAUDE.md): řada domů v modrém
 * podvečeru, vzdálený chodník, parkování, dvoupruhová silnice (pravostranná doprava), přední parkování
 * vlevo, přední chodník, dětská plocha vpravo dole, boční vjezd vpravo nahoře.
 * Pozadí 1672 × 941 → scéna 1920 × 1080 (jednotné měřítko). Prvky (lampy, lavička, strom, plotek, koš)
 * zpracuje scripts/process-street-graphics.py (ořez, kotva z alfa masky).
 * Spuštění: npx tsx scripts/generate-street-demo.ts [cílová složka]
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

const G = 'grafika/zasnezena-ulice';
const U = (u: number, v: number): [number, number] => [Math.round(u * 1920), Math.round(v * 1080)];
type P2 = [number, number];
/** Kalibrace scény (px 1920 × 1080) – změřeno nad mřížkou pozadí. */
export const STREET = {
  /** dospělý na vzdáleném chodníku (y ≈ 585) ~ 97 px, na předním (y ≈ 900) ~ 120 px (dveře domů ≈ 2,1 m) */
  depth: { yFar: 540, scaleFar: 0.726, yNear: 1080, scaleNear: 1.017 },
  /** vzdálený chodník (střed průchozí šířky y 560–605); vpravo přes boční vjezd */
  farWalk: [[-70, 586], [300, 586], [700, 585], [1100, 585], [1500, 586], [1700, 590], [1990, 594]] as P2[],
  /** přední chodník: vlevo pod parkovištěm (y 880–925), vpravo širší dlažba (y 805–880) */
  nearWalk: [[-70, 903], [300, 903], [650, 903], [920, 900], [1000, 878], [1100, 848], [1400, 843], [1700, 842], [1990, 842]] as P2[],
  /** pásy silnice a parkování (y): vzdálený pruh jede zprava doleva, bližší zleva doprava */
  road: { farParkY: 633, farLaneY: 690, nearLaneY: 760, nearParkY: 838, nearParkX1: 930, kerbFar: 657, kerbNear: 800 },
  /** boční vjezd vpravo nahoře (zapadnutí): od vrat k silnici */
  driveway: [[1712, 486], [1760, 540], [1820, 600], [1880, 650]] as P2[],
  /** dětská plocha (sněhulák) vpravo dole */
  kids: { x0: 1300, x1: 1800, y0: 905, y1: 1060 },
  props: {
    lampFar: { at: U(0.25, 0.56), h: 0.17 }, lampNear: { at: U(0.53, 0.88), h: 0.24 },
    bench: { at: U(0.61, 0.91), h: 0.085 }, tree: { at: U(0.985, 0.985), h: 0.4 },
    fence1: { at: U(0.72, 0.86), h: 0.055 }, fence2: { at: U(0.87, 0.86), h: 0.055 }, bin: { at: U(0.545, 0.91), h: 0.065 },
  },
};

export async function generateStreet(dir: string): Promise<ProjectFile> {
  await fs.rm(dir, { recursive: true, force: true });
  await createProjectDir(dir);
  const meta = JSON.parse(await fs.readFile(path.join(G, 'podklady.json'), 'utf8')) as Record<string, { w: number; h: number; fullH: number; anchor: [number, number] }>;
  const p = createEmptyProject('Zasněžená ulice – modrý podvečer', 8417);
  p.scene.depth = { enabled: true, ...STREET.depth };
  p.scene.fovDeg = 23; // užší zorný úhel: hloubka silnice odpovídá malbě (2 pruhy ≈ 6,9 m) – auta se vejdou do pruhu
  p.scene.snowfall = { enabled: true, density: 0.3, wind: 0.04 };
  p.scene.environment = { variableSnow: true, gusts: false, cupSteam: false, stallSteam: false, sources: [] };
  p.scene.vectorFigures = true; p.scene.paintedHeads = true;
  const imp = async (file: string, name: string, anchor: Vec2): Promise<AssetEntry> => {
    const a = await importAssetFile(dir, path.join(G, file), 'image'); a.name = name; a.anchor = anchor; a.pixelScale = 1; p.assets.push(a); return a;
  };
  const bg = await imp('pozadi.png', 'Pozadí – zasněžená ulice', { x: 0, y: 0 }); bg.pixelScale = 1920 / 1672; p.scene.backgroundAssetId = bg.id;
  const A = async (key: string, name: string) => imp(`${key}-scena.png`, name, { x: meta[key].anchor[0], y: meta[key].anchor[1] });
  const lamp = await A('lampa', 'Lampa'), bench = await A('lavicka', 'Lavička'), tree = await A('strom', 'Strom'), fence = await A('plotek', 'Plůtek'), bin = await A('kos', 'Koš');
  lamp.shape = { bodyU0: 0.4, bodyU1: 0.6, depthM: 0.3, lights: [{ u: 0.5, v: 0.08, color: '#FFD49A', heightM: 3.6, radiusM: 2.6, groundGain: 0.06, haloOpacity: 0.06, haloSigmaPx: 4, characterGain: 0.12, flicker: 0.01 }] };
  for (const id of ['builtin_postava_cg', 'builtin_postava_dite']) await addBuiltinAsset('resources/builtin', dir, p, id);
  const obj = (o: Partial<SceneObject> & Pick<SceneObject, 'id' | 'name' | 'assetId' | 'x' | 'y' | 'scale'>): SceneObject => ({ layer: 'world', zBias: 0, flipX: false, visible: true, locked: false, ...o });
  /** měřítko z výšky vůči obrazu (vztaženo k celému PNG, ne k ořezu) */
  const sc = (key: string, h: number) => (h * 1080) / meta[key].fullH;
  /** kolizní půdorys kolem paty (px scény → px obrázku) */
  const fp = (k: number, hw: number, hd: number) => [{ x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd }].map((q) => ({ x: Math.round(q.x / k), y: Math.round(q.y / k) }));
  const lampI = () => { const x = defaultIntegration(); x.grade.enabled = false; x.lights.enabled = true; x.lights.gain = 0.9; return x; };
  const P = STREET.props;
  const kLf = sc('lampa', P.lampFar.h), kLn = sc('lampa', P.lampNear.h), kB = sc('lavicka', P.bench.h), kT = sc('strom', P.tree.h), kF = sc('plotek', P.fence1.h), kK = sc('kos', P.bin.h);
  p.objects = [
    obj({ id: 'obj_lampa_far', name: 'Lampa (vzdálená)', assetId: lamp.id, x: P.lampFar.at[0], y: P.lampFar.at[1], scale: kLf, integration: lampI(), footprint: fp(kLf, 9, 4) }),
    obj({ id: 'obj_lampa_near', name: 'Lampa (blízká)', assetId: lamp.id, x: P.lampNear.at[0], y: P.lampNear.at[1], scale: kLn, integration: lampI(), footprint: fp(kLn, 12, 5) }),
    obj({ id: 'obj_lavicka', name: 'Lavička', assetId: bench.id, x: P.bench.at[0], y: P.bench.at[1], scale: kB, footprint: fp(kB, 62, 10) }),
    obj({ id: 'obj_kos', name: 'Koš', assetId: bin.id, x: P.bin.at[0], y: P.bin.at[1], scale: kK, footprint: fp(kK, 18, 8) }),
    obj({ id: 'obj_plotek1', name: 'Plůtek 1', assetId: fence.id, x: P.fence1.at[0], y: P.fence1.at[1], scale: kF, footprint: fp(kF, 58, 3) }),
    obj({ id: 'obj_plotek2', name: 'Plůtek 2', assetId: fence.id, x: P.fence2.at[0], y: P.fence2.at[1], scale: kF, footprint: fp(kF, 58, 3) }),
    // strom: kmen v pravém dolním rohu, koruna může překrýt projíždějící auta (řazení podle paty kmene)
    obj({ id: 'obj_strom', name: 'Strom', assetId: tree.id, x: P.tree.at[0], y: P.tree.at[1], scale: kT, footprint: fp(kT, 14, 6) }),
  ];
  // trasy chodců: vzdálený a přední chodník (portály mimo obraz); silnici chodci nepřecházejí
  const nodes: NavNode[] = [], edges: NavEdge[] = [];
  const chain = (pts: P2[], pre: string, label: string) => pts.forEach(([x, y], i) => {
    nodes.push({ id: `${pre}${i}`, x, y, name: `${label} ${i}`, portal: x < 0 || x > 1920 || undefined });
    if (i) edges.push({ id: `e_${pre}${i}`, a: `${pre}${i - 1}`, b: `${pre}${i}`, oneWay: false, narrow: false });
  });
  chain(STREET.farWalk, 'f', 'Vzdálený chodník'); chain(STREET.nearWalk, 'n', 'Přední chodník');
  p.nav.nodes = nodes; p.nav.edges = edges;
  const K = STREET.kids;
  p.areas = [
    { id: 'area_snih', name: 'Sníh (dětská plocha a okraje)', kind: 'snow', polygon: [{ x: 600, y: 935 }, { x: 1000, y: 905 }, { x: 1100, y: 888 }, { x: 1920, y: 885 }, { x: 1920, y: 1080 }, { x: 600, y: 1080 }] },
    { id: 'area_kere', name: 'Keře vlevo dole (neprůchozí)', kind: 'obstacle', polygon: [{ x: 0, y: 930 }, { x: 240, y: 935 }, { x: 610, y: 990 }, { x: 610, y: 1080 }, { x: 0, y: 1080 }] },
  ];
  void K;
  // postavy: chodci (jednotlivci, dvojice), pejskař, sousedé
  await importBreeds(dir, p, ['dog_dalmatian']);
  const lib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-cg/library.json', 'utf8')) as PartLibrary;
  const pal = { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' };
  const heads = ['head_02_cg', 'head_04_cg', 'head_06_cg', 'head_08_cg', 'head_01_cg', 'head_03_cg', 'head_09_cg', 'head_12_cg'];
  const names = ['Jakub', 'Lucie', 'Martin', 'Veronika', 'Pavel', 'Hana', 'Pan Karel', 'Paní Marie'];
  const apps = generateGroup(lib, heads.length, 8418).appearances;
  const starts = ['f0', 'n0', 'f6', 'n8'];
  p.characters = apps.map((app, i): CharacterInstance => {
    app.variants = { ...app.variants, head: heads[i] };
    return { id: `ch_${i + 1}`, name: names[i], assetId: 'builtin_postava_cg', startNodeId: starts[i % starts.length], baseScale: 1, walkSpeed: Math.round(56 * app.motion.speed * 10) / 10, palette: pal, wander: true, appearance: app, routine: 'visitor', activities: {}, ...(i >= 6 ? { gaitProfile: 'elderA' as const } : {}) };
  });
  Object.assign(p.characters[7], { companionId: 'ch_7', companionSide: 1, holdHands: true }); // senioři za ruce
  Object.assign(p.characters[2], { pet: 'dog', petBreed: 'dog_dalmatian' });
  // doprava: pravostranná, bližší pruh doprava, vzdálený doleva; parkování podél obou chodníků
  const RD = STREET.road;
  p.street = {
    lanes: [{ y: RD.nearLaneY, dir: 1 }, { y: RD.farLaneY, dir: -1 }],
    parks: [{ y: RD.nearParkY, x0: 20, x1: RD.nearParkX1, lane: 0 }, { y: RD.farParkY, x0: 40, x1: 1640, lane: 1 }],
    gap: [6, 24], speed: 7.5, parkShare: 0.3, parkedInit: [2, 2],
    roadSnow: 0.7, laneHalf: 1.3, plowTruck: { every: [240, 420], first: 150, speed: 4.2 },
  };
  // majitelé aut (přijdou ometat a odjet; vystoupí po zaparkování) – zásoba postav, mimo scénu, dokud nejsou potřeba
  const ownApps = generateGroup(lib, 4, 8419).appearances, ownHeads = ['head_05_cg', 'head_07_cg', 'head_01_cg', 'head_11_cg'], ownNames = ['Tomáš (řidič)', 'Jana (řidička)', 'Petr (řidič)', 'Alena (řidička)'];
  ownApps.forEach((app, i) => { app.variants = { ...app.variants, head: ownHeads[i] }; p.characters.push({ id: `ch_ridic${i + 1}`, name: ownNames[i], assetId: 'builtin_postava_cg', startNodeId: 'f0', baseScale: 1, walkSpeed: 55, palette: pal, wander: false, appearance: app, routine: 'driver', activities: {} }); });
  p.street!.owners = ownApps.map((_, i) => `ch_ridic${i + 1}`); p.street!.departEvery = [70, 150];
  p.crowd = { walkersN: 7, dogs: 1, walkSpeed: 0.95 };
  p.export = { ...p.export, durationSec: 60, chunkSec: 20 };
  await saveProject(dir, p);
  return p;
}

if (process.argv[1]?.includes('generate-street-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Zasnezena-ulice.zscena');
  generateStreet(dir).then(() => console.log('Demo vytvořeno:', dir));
}
