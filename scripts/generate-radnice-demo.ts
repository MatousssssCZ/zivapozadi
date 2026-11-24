/**
 * Demo „Náměstí s radnicí“ z dodané grafiky (grafika/zpracovane). Postavy, stoleček a koš jsou zatím
 * provizorní testovací (dodaná grafika je zatím neobsahuje).
 * Spuštění: npx tsx scripts/generate-radnice-demo.ts [cílová složka]
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createEmptyProject } from '../src/core/model/defaults';
import type { ProjectFile, SceneObject, NavNode, NavEdge, CharacterInstance, AssetEntry, InteractionSpec } from '../src/core/model/types';
import type { Vec2 } from '../src/core/math/vec';
import { addBuiltinAsset } from '../src/node/builtin';
import type { PartLibrary } from '../src/core/anim/partLibrary';
import { generateGroup } from '../src/core/anim/appearanceGenerator';
import { createProjectDir, saveProject, importAssetFile } from '../src/node/projectIO';
import { defaultIntegration, lantern } from '../src/core/render/integration';

const G = 'grafika/zpracovane';

/**
 * `showcase`: samostatná ukázka balíčku „živá pozadí“ (vlastní kopie assetů): výrazné události
 * častěji, koulovačka s dospělými jako vývojářská náhrada (dětské postavy zatím nejsou).
 */
export async function generateRadnice(dir: string, opts: { showcase?: boolean } = {}): Promise<ProjectFile> {
  await fs.rm(dir, { recursive: true, force: true });
  await createProjectDir(dir);
  const p = createEmptyProject('Náměstí s radnicí (test dodané grafiky)', 1224);
  const imp = async (file: string, name: string, anchor = { x: 0.5, y: 0.985 }): Promise<AssetEntry> => {
    const a = await importAssetFile(dir, path.join(G, file), 'image');
    a.name = name; a.anchor = anchor; a.pixelScale = 1; p.assets.push(a); return a;
  };
  const bg = await imp('pozadi-radnice.png', 'Pozadí – náměstí s radnicí', { x: 0, y: 0 });
  const st = {
    hracky: await imp('stanek-hracky.png', 'Stánek – hračky'),
    pernik: await imp('stanek-pernik.png', 'Stánek – perník'),
    napoje: await imp('stanek-napoje.png', 'Stánek – nápoje (káva)'),
    pletene: await imp('stanek-pletene.png', 'Stánek – pletené zboží'),
  };
  const lampa = await imp('lampa.png', 'Lampa', { x: 0.5, y: 0.99 });
  const strom = await imp('strom.png', 'Vánoční strom', { x: 0.5, y: 0.985 });
  for (const id of ['builtin_stolecek', 'builtin_kos', 'builtin_kos_vika', 'builtin_postava_cg']) await addBuiltinAsset('resources/builtin', dir, p, id);
  // tvar pro zapuštění do scény: kontaktní šířka těla, hloubka půdorysu, lucerny (zadání stánků B)
  for (const a of Object.values(st)) a.shape = { bodyU0: 0.063, bodyU1: 0.932, depthM: 1.8, lights: [lantern(0.098, 0.468, 1.6), lantern(0.9, 0.456, 1.6)] };
  st.napoje.shape!.steam = [{ u: 0.235, v: 0.34 }]; // samovar
  lampa.shape = { bodyU0: 0.387, bodyU1: 0.622, depthM: 0.3, lights: [0.206, 0.5, 0.794].map((u, i) => ({ ...lantern(u, i === 1 ? 0.311 : 0.325, 2.65), radiusM: 2.4, groundGain: 0.14, haloOpacity: 0.05 })) };
  strom.shape = { bodyU0: 0.272, bodyU1: 0.647, depthM: 1.2 };
  p.scene.backgroundAssetId = bg.id;
  // Perspektiva: chodník u budov (y≈900) je daleko, spodní okraj blízko.
  p.scene.depth = { enabled: true, yFar: 900, scaleFar: 0.36, yNear: 1080, scaleNear: 1.3 };
  p.scene.snowfall = { enabled: true, density: 0.7, wind: 0.2 };
  p.scene.environment = { variableSnow: true, gusts: true, cupSteam: true, stallSteam: true, sources: [] };

  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const stallFootprint = rect(-205, -40, 205, 8);
  const coffeeInteraction: InteractionSpec = { kind: 'stand', points: [
    { id: 'service1', kind: 'service', offset: { x: 0, y: 92 }, facing: -Math.PI / 2, label: 'Obsluha' },
    { id: 'queue1', kind: 'queue', offset: { x: -165, y: 110 }, facing: -0.9, label: 'Fronta 1' },
    { id: 'queue2', kind: 'queue', offset: { x: -300, y: 122 }, facing: -0.6, label: 'Fronta 2' },
    { id: 'queue3', kind: 'queue', offset: { x: -435, y: 134 }, facing: -0.4, label: 'Fronta 3' },
    { id: 'queue4', kind: 'queue', offset: { x: -570, y: 146 }, facing: -0.3, label: 'Fronta 4' },
    { id: 'counter', kind: 'counter', offset: { x: 70, y: -100 }, label: 'Pult' },
  ] };
  // nákupní stánky: obsluha vpředu uprostřed, fronta 3 místa do strany (směr podle volného místa)
  const shopInteraction = (dir: 1 | -1): InteractionSpec => ({ kind: 'stand', points: [
    { id: 'service1', kind: 'service', offset: { x: 0, y: 92 }, facing: -Math.PI / 2, label: 'Obsluha' },
    ...[1, 2, 3].map((k) => ({ id: `queue${k}`, kind: 'queue' as const, offset: { x: dir * (150 + (k - 1) * 135), y: 104 + k * 6 }, facing: dir > 0 ? Math.PI + 0.9 - k * 0.15 : -0.9 + k * 0.15, label: `Fronta ${k}` })),
  ] });
  const O = (id: string, name: string, a: AssetEntry, x: number, y: number, scale: number, extra: Partial<SceneObject> = {}): SceneObject => ({
    id, name, assetId: a.id, x, y, scale, layer: 'world', zBias: 0, flipX: false, visible: true, locked: false,
    footprint: a.defaultFootprint ? structuredClone(a.defaultFootprint) : undefined,
    interaction: a.defaultInteraction ? structuredClone(a.defaultInteraction) : undefined, ...extra,
  });
  // zapuštění: stánky vše (vč. sladění barev a oparu), ostatní kontakt + sníh (+ světlo lampy)
  const integ = (grade: boolean, lights: boolean): Partial<SceneObject> => {
    const I = defaultIntegration(); I.grade.enabled = grade; I.lights.enabled = lights; return { integration: I };
  };
  const table = p.assets.find((a) => a.id === 'builtin_stolecek')!, bin = p.assets.find((a) => a.id === 'builtin_kos')!, binLid = p.assets.find((a) => a.id === 'builtin_kos_vika')!;
  table.shape = { bodyU0: 0.289, bodyU1: 0.706, depthM: 0.5 };
  bin.shape = { bodyU0: 0.185, bodyU1: 0.806, depthM: 0.45 };
  binLid.shape = { bodyU0: 0.167, bodyU1: 0.824, depthM: 0.45 };
  p.objects = [
    O('obj_st_hracky', 'Stánek – hračky', st.hracky, 175, 992, 0.45, { ...integ(true, true), footprint: stallFootprint, interaction: shopInteraction(1) }),
    O('obj_st_pernik', 'Stánek – perník', st.pernik, 420, 976, 0.43, { ...integ(true, true), footprint: stallFootprint, interaction: shopInteraction(1) }),
    O('obj_st_napoje', 'Stánek – nápoje', st.napoje, 1235, 985, 0.44, { ...integ(true, true), footprint: stallFootprint, interaction: coffeeInteraction }),
    O('obj_st_pletene', 'Stánek – pletené zboží', st.pletene, 1765, 996, 0.46, { ...integ(true, true), footprint: stallFootprint, interaction: shopInteraction(-1) }),
    O('obj_strom', 'Vánoční strom', strom, 1490, 935, 0.49, { ...integ(false, false),
      footprint: rect(-130, -30, 130, 15),
      interaction: { kind: 'viewpoint', points: [
        { id: 'view1', kind: 'view', offset: { x: -200, y: 95 }, facing: -1.1, label: 'Výhled 1' },
        { id: 'view2', kind: 'view', offset: { x: 210, y: 100 }, facing: -2.0, label: 'Výhled 2' },
      ] },
    }),
    O('obj_lampa1', 'Lampa vlevo', lampa, 600, 1000, 0.28, { ...integ(false, true), footprint: rect(-22, -10, 22, 8) }),
    O('obj_lampa2', 'Lampa vpravo', lampa, 1150, 1005, 0.28, { ...integ(false, true), footprint: rect(-22, -10, 22, 8) }),
    O('obj_stolecek', 'Stoleček (test)', table, 880, 995, 0.78, integ(false, false)),
    O('obj_stolecek2', 'Stoleček u stromu', table, 1290, 1005, 0.78, integ(false, false)),
    O('obj_kos', 'Koš s víkem', binLid, 1060, 985, 0.8, integ(false, false)),
    O('obj_kos2', 'Koš u stromu (bez víka)', bin, 1560, 1010, 0.8, integ(false, false)),
  ];
  const N = (id: string, x: number, y: number, name: string, stop?: NavNode['stop']): NavNode => ({ id, x, y, name, stop, portal: x < 0 || x > 1920 || undefined });
  p.nav.nodes = [
    N('a', -40, 1055, 'Vstup západ', { waitMin: 1, waitMax: 4, look: { mode: 'none' }, next: [] }),
    N('b', 290, 1040, 'Před hračkami', { waitMin: 2, waitMax: 5, look: { mode: 'object', objectId: 'obj_st_hracky' }, next: [] }),
    N('c', 560, 1045, 'Před perníkem'),
    N('d', 800, 1030, 'Střed vpředu'),
    N('e', 1000, 1045, 'U koše'),
    N('f', 1225, 1058, 'Před nápoji'),
    N('g', 1480, 1040, 'Vpředu vpravo'),
    N('h', 1750, 1050, 'Před pleteným zbožím', { waitMin: 2, waitMax: 5, look: { mode: 'object', objectId: 'obj_st_pletene' }, next: [] }),
    N('i', 1960, 1060, 'Vstup východ', { waitMin: 1, waitMax: 4, look: { mode: 'none' }, next: [] }),
    N('j', 760, 960, 'U radnice vlevo'),
    N('k', 1000, 952, 'Schody radnice', { waitMin: 3, waitMax: 6, look: { mode: 'direction', angle: -Math.PI / 2 }, next: [] }),
    N('l', 1330, 955, 'Za stánkem'),
    N('m', 1400, 990, 'Strom vlevo'),
    N('n', 1640, 990, 'Strom vpravo', { waitMin: 3, waitMax: 6, look: { mode: 'object', objectId: 'obj_strom' }, next: [] }),
  ];
  const E = (id: string, a: string, b: string, oneWay = false, narrow = false): NavEdge => ({ id, a, b, oneWay, narrow });
  p.nav.edges = [
    E('e1', 'a', 'b'), E('e2', 'b', 'c'), E('e3', 'c', 'd'), E('e4', 'd', 'e'), E('e5', 'e', 'f'), E('e6', 'f', 'g'),
    E('e7', 'g', 'h'), E('e8', 'h', 'i'), E('e9', 'c', 'j'), E('e10', 'j', 'k'), E('e11', 'k', 'l'),
    E('e12', 'l', 'm', false, true), E('e13', 'm', 'n'), E('e14', 'n', 'h'), E('e15', 'm', 'g'), E('e16', 'd', 'j'), E('e17', 'e', 'k'),
  ];
  p.areas = [{ id: 'area_snih', name: 'Zasněžené náměstí', kind: 'snow', polygon: rect(0, 905, 1920, 1080) }];
  p.zones = [{
    id: 'zone_nakup', name: 'Nákup u stánků', activityType: 'shop', activityVersion: 1, enabled: true,
    bounds: rect(0, 900, 1920, 1080),
    objectRoles: { stand: ['obj_st_hracky', 'obj_st_pernik', 'obj_st_pletene'] }, params: {},
  }, {
    id: 'zone_kava', name: 'Káva u stánku s nápoji', activityType: 'coffee', activityVersion: 1, enabled: true,
    bounds: rect(700, 900, 1700, 1075),
    objectRoles: { stand: ['obj_st_napoje'], seating: ['obj_stolecek', 'obj_stolecek2', 'obj_strom'], bin: ['obj_kos', 'obj_kos2'] }, params: {},
  }, {
    id: 'zone_vyhled', name: 'Prohlížení stromu', activityType: 'viewing', activityVersion: 1, enabled: true,
    bounds: rect(1200, 900, 1800, 1075), objectRoles: { view: ['obj_strom'] }, params: { lookMin: 5, lookMax: 18 },
  }, {
    // stavba sněhuláka: volný sníh vpředu (koule se válí vodorovně podél okraje)
    id: 'zone_snehulak', name: 'Sněhulák vpředu', activityType: 'snowman', activityVersion: 1, enabled: true,
    bounds: rect(600, 1060, 800, 1076), objectRoles: {}, params: { chance: 0.5 },
  }, {
    // koulovačka: zadání počítá s dětmi (zatím nejsou podklady) – dospělí jen s allowAdults (vývojářská náhrada)
    id: 'zone_koulovacka', name: 'Koulovačka vpravo vpředu', activityType: 'snowballFight', activityVersion: 1, enabled: true,
    bounds: rect(1280, 1060, 1440, 1076), objectRoles: {}, params: { chance: 0.4, allowAdults: false },
  }];
  // 24 návštěvníků z generátoru (malované díly z ChatGPT) + 4 prodavači ve stáncích
  const lib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-cg/library.json', 'utf8')) as PartLibrary;
  const group = generateGroup(lib, 24, 2024);
  const names = ['Anna', 'Bára', 'Cyril', 'Dana', 'Emil', 'Františka', 'Gustav', 'Hana', 'Ivan', 'Jana', 'Karel', 'Lenka', 'Marek', 'Nikola', 'Ota', 'Petra', 'Radek', 'Šárka', 'Tomáš', 'Uršula', 'Václav', 'Věra', 'Zdeněk', 'Žaneta'];
  const starts = ['b', 'h', 'k', 'a', 'i', 'c', 'g', 'd', 'n', 'j', 'e', 'l', 'a', 'i', 'a', 'i', 'a', 'i', 'b', 'h', 'c', 'g', 'd', 'n'];
  const sellers = generateGroup(lib, 4, 777).appearances;
  const sellerNames = ['Prodavačka hraček', 'Perníkář', 'Prodavač nápojů', 'Prodavačka pleteného zboží'];
  ['obj_st_hracky', 'obj_st_pernik', 'obj_st_napoje', 'obj_st_pletene'].forEach((id, i) => {
    const o = p.objects.find((x) => x.id === id)!;
    // okno stánku nad pultem (souřadnice obrázku → vůči kotvě 0,5/0,985 obrázku 431×395)
    o.seller = { assetId: 'builtin_postava_cg', appearance: sellers[i], name: sellerNames[i], offset: { x: i % 2 ? 18 : -18, y: -4 }, window: { x0: -155, y0: -259, x1: 156, y1: -105 } };
  });
  const testPal = { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' };
  p.characters = group.appearances.map((app, i): CharacterInstance => ({
    id: `ch_${i + 1}`, name: names[i], assetId: 'builtin_postava_cg', startNodeId: starts[i], baseScale: 1,
    walkSpeed: Math.round(60 * app.motion.speed * 10) / 10, palette: testPal, wander: true, appearance: app, routine: 'visitor',
    activities: { coffee: names[i] === 'Cyril' ? { enabled: false, firstDelayMin: 0, firstDelayMax: 0, intervalMin: 90, intervalMax: 180 }
      : { enabled: true, firstDelayMin: 4 + i * 6, firstDelayMax: 10 + i * 6, intervalMin: 70, intervalMax: 160 } },
  }));
  // dvě dvojice: Františka jde s Emilem, Jana s Ivanem
  for (const [f, l, side] of [['ch_6', 'ch_5', 1], ['ch_10', 'ch_9', -1]] as const) {
    const fc = p.characters.find((c) => c.id === f)!, lc = p.characters.find((c) => c.id === l)!;
    fc.companionId = l; fc.companionSide = side; fc.startNodeId = lc.startNodeId; fc.activities = {};
  }
  p.schedule = [{ id: 'ev_cyril', name: 'Cyril jde na kávu', time: 20, activityType: 'coffee', characterId: 'ch_3', zoneId: 'zone_kava', onUnavailable: 'wait', waitLimit: 40 }];
  p.export = { ...p.export, durationSec: 60, chunkSec: 20 };
  if (opts.showcase) {
    p.meta.name = 'Živý trh (ukázka balíčku „živá pozadí“)';
    for (const z of p.zones) {
      if (z.activityType === 'snowman') z.params.chance = 0.9;
      if (z.activityType === 'snowballFight') { z.params.chance = 0.9; z.params.allowAdults = true; z.name += ' (dospělí – vývojářská náhrada)'; }
    }
    p.export = { ...p.export, durationSec: 300, chunkSec: 30 };
  }
  await saveProject(dir, p);
  return p;
}

if (process.argv[1]?.includes('generate-radnice-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Namesti-radnice.zscena');
  generateRadnice(dir, { showcase: process.argv.includes('--showcase') }).then(() => console.log('Demo vytvořeno:', dir));
}
