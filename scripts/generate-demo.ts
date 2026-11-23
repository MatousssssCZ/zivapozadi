/**
 * Vytvoří demo projekt „Vánoční náměstí“ (demo/Vanocni-namesti.zscena).
 * Spuštění: npm run demo:generate
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createEmptyProject } from '../src/core/model/defaults';
import type { ProjectFile, SceneObject, NavNode, NavEdge, CharacterInstance } from '../src/core/model/types';
import { addBuiltinAsset } from '../src/node/builtin';
import { createProjectDir, saveProject } from '../src/node/projectIO';

const RES = path.resolve('resources/builtin');

export async function generateDemo(dir: string): Promise<ProjectFile> {
  await fs.rm(dir, { recursive: true, force: true });
  await createProjectDir(dir);
  const p = createEmptyProject('Vánoční náměstí (demo)', 20241224);
  for (const id of ['builtin_pozadi', 'builtin_stanek', 'builtin_stolecek', 'builtin_strom', 'builtin_kos', 'builtin_lampa', 'builtin_zavej', 'builtin_postava'])
    await addBuiltinAsset(RES, dir, p, id);
  p.scene.backgroundAssetId = 'builtin_pozadi';
  const asset = (id: string) => p.assets.find((a) => a.id === id)!;
  const obj = (id: string, name: string, assetId: string, x: number, y: number, extra: Partial<SceneObject> = {}): SceneObject => {
    const a = asset(assetId);
    return { id, name, assetId, x, y, scale: 1, layer: 'world', zBias: 0, flipX: false, visible: true, locked: false,
      footprint: a.defaultFootprint ? structuredClone(a.defaultFootprint) : undefined,
      interaction: a.defaultInteraction ? structuredClone(a.defaultInteraction) : undefined, ...extra };
  };
  p.objects = [
    obj('obj_stanek', 'Stánek s kávou', 'builtin_stanek', 560, 650),
    obj('obj_stolecek', 'Stoleček', 'builtin_stolecek', 830, 805),
    obj('obj_strom', 'Vánoční strom', 'builtin_strom', 1290, 700),
    obj('obj_kos', 'Koš', 'builtin_kos', 1030, 668),
    obj('obj_lampa1', 'Lampa vlevo', 'builtin_lampa', 290, 760),
    obj('obj_lampa2', 'Lampa vpravo', 'builtin_lampa', 1660, 800, { scale: 1.05 }),
    obj('obj_zavej', 'Závěj s plotem', 'builtin_zavej', 300, 1092, { layer: 'foreground', scale: 0.9 }),
    obj('obj_zavej2', 'Závěj s plotem 2', 'builtin_zavej', 1700, 1100, { layer: 'foreground', scale: 0.8, flipX: true }),
  ];
  const N = (id: string, x: number, y: number, name?: string, stop?: NavNode['stop']): NavNode => ({ id, x, y, name, stop });
  p.nav.nodes = [
    N('n_zapad', 120, 905, 'Vstup západ', { waitMin: 0.5, waitMax: 2, look: { mode: 'none' }, next: [] }),
    N('n_lampa', 400, 760, 'U lampy'),
    N('n_stanek', 650, 735, 'Před stánkem'),
    N('n_stred', 900, 712, 'Střed nahoře'),
    N('n_kos', 1080, 735, 'U koše'),
    N('n_strom_l', 1170, 830, 'Strom vlevo'),
    N('n_strom_p', 1420, 830, 'Strom vpravo', { waitMin: 3, waitMax: 6, look: { mode: 'object', objectId: 'obj_strom' }, next: [{ nodeId: 'n_vychod', weight: 1 }, { nodeId: 'n_strom_l', weight: 2 }] }),
    N('n_vychod', 1800, 915, 'Vstup východ'),
    N('n_dole', 1080, 960, 'Dole uprostřed'),
    N('n_dole_l', 640, 930, 'Dole vlevo'),
    N('n_stul', 830, 880, 'U stolečku'),
  ];
  const E = (id: string, a: string, b: string, oneWay = false, narrow = false): NavEdge => ({ id, a, b, oneWay, narrow });
  p.nav.edges = [
    E('e1', 'n_zapad', 'n_lampa'), E('e2', 'n_lampa', 'n_stanek'), E('e3', 'n_stanek', 'n_stred'), E('e4', 'n_stred', 'n_kos'),
    E('e5', 'n_kos', 'n_strom_l', false, true), // úzký průchod mezi košem a stromem
    E('e6', 'n_strom_l', 'n_strom_p'), E('e7', 'n_strom_p', 'n_vychod'),
    E('e8', 'n_vychod', 'n_dole', true), // jednosměrně
    E('e9', 'n_dole', 'n_dole_l'), E('e10', 'n_dole_l', 'n_zapad'), E('e11', 'n_dole_l', 'n_stul'), E('e12', 'n_stul', 'n_dole'),
    E('e13', 'n_stanek', 'n_dole_l'), E('e14', 'n_strom_l', 'n_dole'), E('e15', 'n_stul', 'n_stred'),
  ];
  p.areas = [
    { id: 'area_zahon', name: 'Zasněžený záhon', kind: 'obstacle', polygon: [{ x: 1470, y: 630 }, { x: 1560, y: 612 }, { x: 1650, y: 630 }, { x: 1650, y: 670 }, { x: 1560, y: 682 }, { x: 1470, y: 668 }] },
    { id: 'area_snih', name: 'Volný sníh (pro budoucí činnosti)', kind: 'snow', polygon: [{ x: 1250, y: 930 }, { x: 1700, y: 930 }, { x: 1760, y: 1040 }, { x: 1200, y: 1040 }] },
  ];
  p.zones = [{
    id: 'zone_kava', name: 'Káva na náměstí', activityType: 'coffee', activityVersion: 1, enabled: true,
    bounds: [{ x: 380, y: 520 }, { x: 1460, y: 520 }, { x: 1460, y: 900 }, { x: 380, y: 900 }],
    objectRoles: { stand: ['obj_stanek'], seating: ['obj_stolecek', 'obj_strom'], bin: ['obj_kos'] },
    params: {},
  }];
  const C = (id: string, name: string, start: string, pal: CharacterInstance['palette'], coffee: [number, number, number, number] | null, speed = 62): CharacterInstance => ({
    id, name, assetId: 'builtin_postava', startNodeId: start, baseScale: 1, walkSpeed: speed, palette: pal, wander: true,
    activities: { coffee: coffee ? { enabled: true, firstDelayMin: coffee[0], firstDelayMax: coffee[1], intervalMin: coffee[2], intervalMax: coffee[3] } : { enabled: false, firstDelayMin: 0, firstDelayMax: 0, intervalMin: 90, intervalMax: 180 } },
  });
  p.characters = [
    C('ch_anna', 'Anna', 'n_zapad', { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' }, [2, 5, 35, 60], 64),
    C('ch_bara', 'Bára', 'n_vychod', { coat: '#6a8fbf', hat: '#e07a8f', scarf: '#f2c14e', skin: '#e8b98f', trousers: '#4a3b4b' }, [12, 18, 45, 80], 58),
    C('ch_cyril', 'Cyril', 'n_dole', { coat: '#5d8f6e', hat: '#c8553d', scarf: '#e9e1cf', skin: '#d9a982', trousers: '#2f2f3f' }, null, 66),
  ];
  p.schedule = [{ id: 'ev_cyril_kava', name: 'Cyril jde na kávu', time: 20, activityType: 'coffee', characterId: 'ch_cyril', zoneId: 'zone_kava', onUnavailable: 'wait', waitLimit: 30 }];
  p.export = { ...p.export, durationSec: 30, resolution: '1920x1080', chunkSec: 10 };
  await saveProject(dir, p);
  return p;
}

if (process.argv[1] && process.argv[1].includes('generate-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Vanocni-namesti.zscena');
  generateDemo(dir).then(() => console.log('Demo projekt vytvořen:', dir));
}
