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
import { createProjectDir, saveProject, importAssetFile } from '../src/node/projectIO';

const G = 'grafika/zpracovane';

export async function generateRadnice(dir: string): Promise<ProjectFile> {
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
  for (const id of ['builtin_stolecek', 'builtin_kos', 'builtin_postava']) await addBuiltinAsset('resources/builtin', dir, p, id);
  p.scene.backgroundAssetId = bg.id;
  // Perspektiva: chodník u budov (y≈900) je daleko, spodní okraj blízko.
  p.scene.depth = { enabled: true, yFar: 900, scaleFar: 0.36, yNear: 1080, scaleNear: 1.3 };
  p.scene.snowfall = { enabled: true, density: 0.7, wind: 0.2 };

  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const stallFootprint = rect(-205, -40, 205, 8);
  const coffeeInteraction: InteractionSpec = { kind: 'stand', points: [
    { id: 'service1', kind: 'service', offset: { x: 0, y: 92 }, facing: -Math.PI / 2, label: 'Obsluha' },
    { id: 'queue1', kind: 'queue', offset: { x: -165, y: 110 }, facing: -0.9, label: 'Fronta 1' },
    { id: 'queue2', kind: 'queue', offset: { x: -300, y: 122 }, facing: -0.6, label: 'Fronta 2' },
    { id: 'counter', kind: 'counter', offset: { x: 70, y: -100 }, label: 'Pult' },
  ] };
  const O = (id: string, name: string, a: AssetEntry, x: number, y: number, scale: number, extra: Partial<SceneObject> = {}): SceneObject => ({
    id, name, assetId: a.id, x, y, scale, layer: 'world', zBias: 0, flipX: false, visible: true, locked: false,
    footprint: a.defaultFootprint ? structuredClone(a.defaultFootprint) : undefined,
    interaction: a.defaultInteraction ? structuredClone(a.defaultInteraction) : undefined, ...extra,
  });
  const table = p.assets.find((a) => a.id === 'builtin_stolecek')!, bin = p.assets.find((a) => a.id === 'builtin_kos')!;
  p.objects = [
    O('obj_st_hracky', 'Stánek – hračky', st.hracky, 175, 992, 0.45, { footprint: stallFootprint }),
    O('obj_st_pernik', 'Stánek – perník', st.pernik, 420, 976, 0.43, { footprint: stallFootprint }),
    O('obj_st_napoje', 'Stánek – nápoje', st.napoje, 1235, 985, 0.44, { footprint: stallFootprint, interaction: coffeeInteraction }),
    O('obj_st_pletene', 'Stánek – pletené zboží', st.pletene, 1765, 996, 0.46, { footprint: stallFootprint }),
    O('obj_strom', 'Vánoční strom', strom, 1490, 935, 0.49, {
      footprint: rect(-130, -30, 130, 15),
      interaction: { kind: 'viewpoint', points: [
        { id: 'view1', kind: 'view', offset: { x: -200, y: 95 }, facing: -1.1, label: 'Výhled 1' },
        { id: 'view2', kind: 'view', offset: { x: 210, y: 100 }, facing: -2.0, label: 'Výhled 2' },
      ] },
    }),
    O('obj_lampa1', 'Lampa vlevo', lampa, 600, 1000, 0.28, { footprint: rect(-22, -10, 22, 8) }),
    O('obj_lampa2', 'Lampa vpravo', lampa, 1150, 1005, 0.28, { footprint: rect(-22, -10, 22, 8) }),
    O('obj_stolecek', 'Stoleček (test)', table, 880, 995, 0.78),
    O('obj_kos', 'Koš (test)', bin, 1060, 985, 0.8),
  ];
  const N = (id: string, x: number, y: number, name: string, stop?: NavNode['stop']): NavNode => ({ id, x, y, name, stop });
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
    id: 'zone_kava', name: 'Káva u stánku s nápoji', activityType: 'coffee', activityVersion: 1, enabled: true,
    bounds: rect(700, 900, 1700, 1075),
    objectRoles: { stand: ['obj_st_napoje'], seating: ['obj_stolecek', 'obj_strom'], bin: ['obj_kos'] }, params: {},
  }];
  const C = (id: string, name: string, start: string, pal: CharacterInstance['palette'], coffee: [number, number, number, number] | null, speed: number): CharacterInstance => ({
    id, name, assetId: 'builtin_postava', startNodeId: start, baseScale: 1, walkSpeed: speed, palette: pal, wander: true,
    activities: { coffee: coffee ? { enabled: true, firstDelayMin: coffee[0], firstDelayMax: coffee[1], intervalMin: coffee[2], intervalMax: coffee[3] } : { enabled: false, firstDelayMin: 0, firstDelayMax: 0, intervalMin: 90, intervalMax: 180 } },
  });
  p.characters = [
    C('ch_anna', 'Anna', 'b', { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' }, [2, 5, 40, 70], 60),
    C('ch_bara', 'Bára', 'h', { coat: '#6a8fbf', hat: '#e07a8f', scarf: '#f2c14e', skin: '#e8b98f', trousers: '#4a3b4b' }, [10, 16, 50, 90], 56),
    C('ch_cyril', 'Cyril', 'k', { coat: '#5d8f6e', hat: '#c8553d', scarf: '#e9e1cf', skin: '#d9a982', trousers: '#2f2f3f' }, null, 64),
    C('ch_dana', 'Dana', 'a', { coat: '#9a6fb0', hat: '#8fc1d4', scarf: '#f4d06f', skin: '#c99272', trousers: '#33384d' }, [25, 35, 60, 100], 58),
    C('ch_emil', 'Emil', 'i', { coat: '#3f5a8a', hat: '#d9d9d9', scarf: '#c8553d', skin: '#f0cfae', trousers: '#2b2b33' }, [40, 50, 60, 110], 66),
  ];
  p.schedule = [{ id: 'ev_cyril', name: 'Cyril jde na kávu', time: 20, activityType: 'coffee', characterId: 'ch_cyril', zoneId: 'zone_kava', onUnavailable: 'wait', waitLimit: 40 }];
  p.export = { ...p.export, durationSec: 60, chunkSec: 20 };
  await saveProject(dir, p);
  return p;
}

if (process.argv[1]?.includes('generate-radnice-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Namesti-radnice.zscena');
  generateRadnice(dir).then(() => console.log('Demo vytvořeno:', dir));
}
