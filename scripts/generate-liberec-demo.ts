/**
 * Demo „Liberec – živý trh“ z balíku nové grafiky (grafika/ziva-pozadi, ChatGPT 11/2026).
 * Rozmístění, trasy, fronty a zóny podle grafika/ziva-pozadi/config/scene.json (normalizované
 * souřadnice 0–1, objekt x,y = dolní střed), perspektiva podle konceptu: horizont y 0,52, dospělý
 * u chodidel y 0,90 má 0,23 výšky obrazu.
 * Spuštění: npx tsx scripts/generate-liberec-demo.ts [cílová složka]
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createEmptyProject } from '../src/core/model/defaults';
import type { ProjectFile, SceneObject, NavNode, NavEdge, CharacterInstance, AssetEntry, InteractionSpec, InteractionPoint } from '../src/core/model/types';
import type { Vec2 } from '../src/core/math/vec';
import { addBuiltinAsset } from '../src/node/builtin';
import type { PartLibrary } from '../src/core/anim/partLibrary';
import { generateGroup } from '../src/core/anim/appearanceGenerator';
import { createProjectDir, saveProject, importAssetFile } from '../src/node/projectIO';
import { defaultIntegration, lantern } from '../src/core/render/integration';

const G = 'grafika/ziva-pozadi';
const SW = 1920, SH = 1080;

interface SceneCfg {
  objects: { id: string; asset: string | null; sprite: string | null; x: number; y: number; w: number; h: number; flipX: boolean }[];
  paths: { id: string; points: [number, number][]; users: string[] }[];
  zones: { id: string; polygon: [number, number][]; activities: string[] }[];
  interactions: Record<string, { service: [number, number]; queue: [number, number][]; vendorFootLocal: [number, number]; vendorHeightLocal: number }>;
}

/** Spodní okraj neprůhledné kresby (kotva = kontakt se zemí), zjištěný z alfa kanálu při tvorbě dema. */
const BOTTOM: Record<string, number> = {
  stall_drinks: 0.967, stall_food: 0.923, stall_gingerbread: 0.955, stall_toys: 0.947, stall_candles: 0.964, stall_ornaments: 0.939,
  tree: 0.974, lamp_tall: 0.986,
};
const NAMES: Record<string, string> = {
  stall_drinks: 'Stánek – teplé nápoje', stall_food: 'Stánek – pečivo a jídlo', stall_gingerbread: 'Stánek – perníčky',
  stall_toys: 'Stánek – hračky', stall_candles: 'Stánek – svíčky', stall_ornaments: 'Stánek – ozdoby',
  tree: 'Vánoční strom', lamp_tall: 'Lampa', bench: 'Lavička', table: 'Stolek na nápoje', fir: 'Smrček', nativity: 'Betlém', mailbox: 'Schránka Ježíškovi',
};

export async function generateLiberec(dir: string): Promise<ProjectFile> {
  await fs.rm(dir, { recursive: true, force: true }); // demo se vždy vytváří znovu
  await createProjectDir(dir);
  const cfg = JSON.parse(await fs.readFile(path.join(G, 'config/scene.json'), 'utf8')) as SceneCfg;
  const masks = JSON.parse(await fs.readFile(path.join(G, 'config/stall_masks.json'), 'utf8')) as Record<string, { vendorOpening: [number, number][] }>;
  const p = createEmptyProject('Liberec – živý vánoční trh', 2611);
  const cache = new Map<string, AssetEntry>();
  const imp = async (key: string, file: string, anchor: Vec2): Promise<AssetEntry> => {
    const hit = cache.get(key);
    if (hit) return hit;
    const a = await importAssetFile(dir, path.join(G, file), 'image');
    a.name = NAMES[key] ?? key; a.anchor = anchor; a.pixelScale = 1;
    p.assets.push(a); cache.set(key, a);
    return a;
  };
  const bg = await imp('background', 'assets/background_clean.png', { x: 0, y: 0 });
  p.scene.backgroundAssetId = bg.id;
  // perspektiva konceptu: výška dospělého h(y) = 0,23·H·(y/H − 0,52)/0,38 → měřítko = h/130
  const sc = (yN: number) => (0.23 * SH * (yN - 0.52)) / 0.38 / 130;
  p.scene.depth = { enabled: true, yFar: 640, scaleFar: Math.round(sc(640 / SH) * 1000) / 1000, yNear: 1080, scaleNear: Math.round(sc(1) * 1000) / 1000 };
  p.scene.snowfall = { enabled: true, density: 0.55, wind: 0.15 };
  p.scene.environment = { variableSnow: true, gusts: true, cupSteam: true, stallSteam: true, sources: [] };
  for (const id of ['builtin_kos', 'builtin_kos_vika', 'builtin_postava_cg', 'builtin_postava_dite']) await addBuiltinAsset('resources/builtin', dir, p, id);

  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const px = (q: [number, number]): Vec2 => ({ x: Math.round(q[0] * SW), y: Math.round(q[1] * SH) });

  // ------------------------------------------------------------------ objekty
  const integ = (grade: boolean, lights: boolean) => { const I = defaultIntegration(); I.grade.enabled = grade; I.lights.enabled = lights; I.grade.saturation = 0.94; I.grade.contrast = 0.97; return I; };
  for (const o of cfg.objects) {
    const key = o.asset ?? o.sprite!;
    const file = o.asset ? `assets/${o.asset}.png` : `sprites/${o.sprite}.png`;
    const a = await imp(key, file, { x: 0.5, y: BOTTOM[key] ?? 0.985 });
    const W = a.width!, H = a.height!;
    // dodané w je šířka zobrazovacího obdélníku (podíl šířky obrazu)
    const scale = Math.round(((o.w * SW) / W) * 10000) / 10000;
    // kotva u spodního okraje kresby: dolní střed obdélníku (y) se posune na skutečnou patu
    const y = Math.round(o.y * SH - (1 - (BOTTOM[key] ?? 0.985)) * H * scale);
    const so: SceneObject = { id: `obj_${o.id}`, name: NAMES[key] ?? key, assetId: a.id, x: Math.round(o.x * SW), y, scale, layer: 'world', zBias: 0, flipX: o.flipX, visible: true, locked: false };
    if (key.startsWith('stall_')) {
      a.shape = { bodyU0: 0.08, bodyU1: 0.92, depthM: 1.8, lights: [] };
      so.integration = integ(false, false);
      so.footprint = rect(-0.44 * W, -0.1 * H, 0.44 * W, -0.005 * H); // za viditelnou patou (stánek je ve 3/4 pohledu)
      const it = cfg.interactions[o.id];
      const loc = (q: [number, number]): Vec2 => ({ x: Math.round((q[0] * SW - so.x) / scale), y: Math.round((q[1] * SH - so.y) / scale) });
      const facing = o.x < 0.5 ? -Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5; // obsluha čelem ke stánku (šikmo)
      const pts: InteractionPoint[] = [{ id: 'service1', kind: 'service', offset: loc(it.service), facing, label: 'Obsluha' }];
      it.queue.forEach((q, k) => pts.push({ id: `queue${k + 1}`, kind: 'queue', offset: loc(q), facing, label: `Fronta ${k + 1}` }));
      pts.push({ id: 'counter', kind: 'counter', offset: { x: Math.round((it.service[0] * SW - so.x) / scale * 0.6), y: Math.round(-0.38 * H) }, label: 'Pult' });
      so.interaction = { kind: 'stand', points: pts };
      // okno prodavače = konzervativní otvor z masky (souřadnice obrázku → vůči kotvě)
      const op = masks[o.id].vendorOpening, b = BOTTOM[key];
      so.seller = {
        assetId: 'builtin_postava_cg', appearance: null as never, name: 'Prodavač', heightOfStall: Math.round((it.vendorFootLocal[1] - op[0][1] - 0.035) * 1000) / 1000, // temeno kousek pod horním okrajem otvoru (0,62 z balíku by vyčnívalo)
        offset: { x: Math.round(((op[0][0] + op[1][0]) / 2 - 0.5) * W), y: Math.round((it.vendorFootLocal[1] - b) * H) }, // uprostřed otvoru
        window: { x0: Math.round((op[0][0] - 0.5) * W), y0: Math.round((op[0][1] - b) * H), x1: Math.round((op[1][0] - 0.5) * W), y1: Math.round((op[2][1] - b) * H) },
      };
    } else if (key === 'lamp_tall') {
      const tall = o.h > 0.5; // přední lampy jsou v konceptu velmi vysoké (rámují obraz)
      a.shape = { bodyU0: 0.416, bodyU1: 0.587, depthM: 0.35, lights: [0.242, 0.499, 0.756].map((u, i) => ({ ...lantern(u, i === 1 ? 0.233 : 0.216, tall ? 5.6 : 3.2), radiusM: 3, groundGain: 0.13, haloOpacity: 0.04 })) };
      so.integration = integ(false, true);
      so.footprint = rect(-0.1 * W, -0.012 * H, 0.1 * W, 0.004 * H);
    } else if (key === 'tree') {
      a.shape = { bodyU0: 0.43, bodyU1: 0.57, depthM: 2.4 };
      so.integration = integ(false, false);
      so.footprint = rect(-0.12 * W, -0.03 * H, 0.12 * W, 0.005 * H); // kmen a spodní větve, ne celá koruna
      so.interaction = { kind: 'viewpoint', points: [
        { id: 'view1', kind: 'view', offset: { x: Math.round((0.585 * SW - so.x) / scale), y: Math.round((0.705 * SH - so.y) / scale) }, facing: -Math.PI / 2 + 0.3, label: 'Výhled 1' },
        { id: 'view2', kind: 'view', offset: { x: Math.round((0.615 * SW - so.x) / scale), y: Math.round((0.715 * SH - so.y) / scale) }, facing: -Math.PI / 2 - 0.2, label: 'Výhled 2' },
      ] };
    } else {
      a.shape ??= { bodyU0: 0.15, bodyU1: 0.85, depthM: key === 'bench' ? 0.6 : 0.4 };
      so.integration = integ(false, false);
      if (key === 'bench') so.footprint = rect(-0.45 * W, -0.25 * H, 0.45 * W, 0.02 * H);
      else if (key === 'table') {
        so.footprint = rect(-0.25 * W, -0.04 * H, 0.25 * W, 0.01 * H);
        so.interaction = { kind: 'table', points: [
          // u stolku vlevo vpředu je vlevo stánek: obě místa vpravo a vpředu
          ...(o.id === 'table_left_1'
            ? [{ id: 'seat1', kind: 'seat' as const, offset: { x: Math.round(0.95 * W), y: 2 }, facing: Math.PI, label: 'Místo 1' }, { id: 'seat2', kind: 'seat' as const, offset: { x: Math.round(0.1 * W), y: Math.round(0.16 * H) }, facing: -Math.PI / 2, label: 'Místo 2' }]
            : [{ id: 'seat1', kind: 'seat' as const, offset: { x: Math.round(-0.95 * W), y: 4 }, facing: 0, label: 'Místo 1' }, { id: 'seat2', kind: 'seat' as const, offset: { x: Math.round(0.95 * W), y: 6 }, facing: Math.PI, label: 'Místo 2' }]),
        ] };
      } else if (key !== 'nativity') so.footprint = rect(-0.3 * W, -0.06 * H, 0.3 * W, 0.01 * H);
      else so.footprint = rect(-0.45 * W, -0.15 * H, 0.45 * W, 0.01 * H);
    }
    p.objects.push(so);
  }
  // malované sprity sněhuláka, koulí a páry (renderer je najde podle id `sprite_*`)
  for (const n of ['door_interior', 'snowman_base', 'snowman_middle', 'snowman_head', 'snowball', 'carrot', 'scarf', 'coal_0', 'coal_1', 'coal_2', 'coal_3', 'coal_4', 'steam_1', 'steam_2', 'steam_3', 'steam_4', 'steam_5', 'steam_6']) {
    const a = await importAssetFile(dir, path.join(G, 'sprites_clean', `${n}.png`), 'image');
    a.id = `sprite_${n}`; a.name = `Sprite – ${n}`; a.anchor = { x: 0.5, y: 0.5 }; a.pixelScale = 1;
    p.assets.push(a);
  }
  // rekvizity živých situací (telefon, rukavice, lopata, odhrnutý chodník, hromada sněhu)
  for (const n of ['phone_front', 'phone_back', 'mitten_ground', 'mitten_held', 'shovel', 'shovel_snow', 'snow_pile', 'pavement']) {
    const a = await importAssetFile(dir, path.join(G, 'sprites', `${n}.png`), 'image');
    a.id = `sprite_${n}`; a.name = `Sprite – ${n}`; a.anchor = { x: 0.5, y: 0.5 }; a.pixelScale = 1;
    p.assets.push(a);
  }
  // koše (nová grafika je neobsahuje): u stolků vlevo a vpravo vpředu
  const binLid = p.assets.find((a) => a.id === 'builtin_kos_vika')!, bin = p.assets.find((a) => a.id === 'builtin_kos')!;
  binLid.shape = { bodyU0: 0.167, bodyU1: 0.824, depthM: 0.45 }; bin.shape = { bodyU0: 0.185, bodyU1: 0.806, depthM: 0.45 };
  const B = (id: string, name: string, a: AssetEntry, x: number, y: number, s: number): SceneObject => ({
    id, name, assetId: a.id, x, y, scale: s, layer: 'world', zBias: 0, flipX: false, visible: true, locked: false,
    footprint: a.defaultFootprint ? structuredClone(a.defaultFootprint) : undefined, interaction: a.defaultInteraction ? structuredClone(a.defaultInteraction) : undefined, integration: integ(false, false),
  });
  p.objects.push(B('obj_kos', 'Koš s víkem', binLid, 520, 830, sc(830 / SH) * 0.62), B('obj_kos2', 'Koš (bez víka)', bin, 1395, 905, sc(905 / SH) * 0.62));

  // ------------------------------------------------------------------ trasy (vodicí polyliny → síť; shodné body se sloučí)
  const nodes: NavNode[] = [], edges: NavEdge[] = [];
  const nodeAt = (q: [number, number], label: string): string => {
    const P = px(q);
    const near = nodes.find((n) => Math.hypot(n.x - P.x, n.y - P.y) < 30);
    if (near) return near.id;
    const id = `n${nodes.length + 1}`;
    nodes.push({ id, x: P.x, y: P.y, name: label, portal: P.x < 0 || P.x > SW || P.y > SH || undefined });
    return id;
  };
  // úpravy vodicích tras po zkoušce v rendereru: vstup zleva vede před nápojovým stánkem,
  // zadní trasa nezačíná uvnitř stánku s perníčky
  const fix: Record<string, [number, number][]> = {
    left_entry: [[-0.05, 0.885], [0.26, 0.84], [0.36, 0.77], [0.46, 0.77]],
    rear: [[0.4, 0.62], [0.5, 0.59], [0.55, 0.62]],
  };
  for (const pa of cfg.paths) {
    if (fix[pa.id]) pa.points = fix[pa.id];
    if (pa.id === 'sled') continue; // sáňky jedou po vlastní dráze (bez chodců)
    let prev: string | null = null;
    pa.points.forEach((q, i) => {
      const id = nodeAt(q, `${pa.id} ${i + 1}`);
      if (prev && prev !== id && !edges.some((e) => (e.a === prev && e.b === id) || (e.a === id && e.b === prev))) edges.push({ id: `e${edges.length + 1}`, a: prev, b: id, oneWay: false, narrow: false });
      prev = id;
    });
  }
  // zastávky: u stromu a u schodů radnice
  const stopAt = (q: [number, number], s: NavNode['stop'], name: string) => { const id = nodeAt(q, name); const n = nodes.find((x) => x.id === id)!; n.stop = s; n.name = name; };
  stopAt([0.5, 0.59], { waitMin: 3, waitMax: 7, look: { mode: 'direction', angle: -Math.PI / 2 }, next: [] }, 'Schody radnice');
  // dveře radnice: portál nad schody (návštěvníci občas vyjdou/vejdou; dveře se otevřou)
  const schody = nodes.find((n) => n.name === 'Schody radnice')!;
  nodes.push({ id: 'n_dvere', x: 958, y: 600, name: 'Dveře radnice', portal: true, door: true });
  edges.push({ id: `e${edges.length + 1}`, a: schody.id, b: 'n_dvere', oneWay: false, narrow: false });
  p.nav.nodes = nodes; p.nav.edges = edges;
  // okna radnice (sklo v pozadí, px pozadí × 1,148) a otvor dveří
  const bgK = SW / 1672, bgKy = SH / 941;
  const W8: [number, number, number, number][] = [[645, 411, 14, 12], [903, 408, 15, 13], [1013, 411, 13, 12], [674, 451, 14, 12], [983, 451, 13, 12], [717, 490, 15, 17], [904, 490, 13, 17], [1014, 490, 12, 17]];
  p.scene.environment!.windows = W8.map(([x, y, w, h]) => ({ x: Math.round((x - 4) * bgK), y: Math.round((y - 13) * bgKy), w: Math.round((w + 8) * bgK), h: Math.round((h + 15) * bgKy) })); // celé okno (obě křídla i oblouk)
  p.scene.environment!.door = { x: Math.round(820 * bgK), y: Math.round(462 * bgKy), w: Math.round(31 * bgK), h: Math.round(58 * bgKy) };

  // ------------------------------------------------------------------ sníh (dlažba uprostřed je odhrnutá)
  p.areas = [
    { id: 'area_snih_l', name: 'Sníh vlevo', kind: 'snow', polygon: [{ x: 0, y: 600 }, { x: 880, y: 612 }, { x: 800, y: 1080 }, { x: 0, y: 1080 }] },
    { id: 'area_snih_p', name: 'Sníh vpravo', kind: 'snow', polygon: [{ x: 1040, y: 612 }, { x: 1920, y: 600 }, { x: 1920, y: 1080 }, { x: 1560, y: 1080 }] },
    // dětský sníh (v konceptu sněhová plocha vpravo od středu, kde děti staví sněhuláka)
    { id: 'area_snih_deti', name: 'Dětský sníh', kind: 'snow', polygon: cfg.zones.find((z) => z.id === 'snow_play')!.polygon.map((q, i) => { const P = px(q); return { x: P.x + (i === 0 || i === 3 ? -60 : 60), y: P.y + (i < 2 ? -25 : 25) }; }) },
  ];

  // ------------------------------------------------------------------ zóny
  const zpoly = (id: string) => cfg.zones.find((z) => z.id === id)!.polygon.map(px);
  p.zones = [
    { id: 'zone_nakup', name: 'Nákup u stánků', activityType: 'shop', activityVersion: 1, enabled: true, bounds: rect(0, 600, SW, SH),
      objectRoles: { stand: ['obj_stall_food', 'obj_stall_gingerbread', 'obj_stall_toys', 'obj_stall_candles', 'obj_stall_ornaments'] }, params: { queueTimeout: 420 } }, // náměstí je hluboké – cesta k zadním stánkům trvá desítky sekund
    { id: 'zone_kava', name: 'Teplé nápoje', activityType: 'coffee', activityVersion: 1, enabled: true, bounds: rect(0, 600, SW, SH),
      objectRoles: { stand: ['obj_stall_drinks'], seating: ['obj_table_left_1', 'obj_table_left_2'], bin: ['obj_kos', 'obj_kos2'] }, params: { queueTimeout: 420 } },
    { id: 'zone_vyhled', name: 'Prohlížení stromu', activityType: 'viewing', activityVersion: 1, enabled: true, bounds: zpoly('tree_watch'), objectRoles: { view: ['obj_tree'] }, params: { lookMin: 5, lookMax: 18 } },
    { id: 'zone_snehulak', name: 'Dětský sníh – sněhulák', activityType: 'snowman', activityVersion: 1, enabled: true, bounds: zpoly('snow_play'), objectRoles: {}, params: { chance: 0.5 } },
    { id: 'zone_koulovacka', name: 'Dětský sníh – koulovačka', activityType: 'snowballFight', activityVersion: 1, enabled: true, bounds: zpoly('snow_play'), objectRoles: {}, params: { chance: 0.4, allowAdults: false } },
  ];

  // ------------------------------------------------------------------ postavy: 24 návštěvníků + 6 prodavačů
  const lib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-cg/library.json', 'utf8')) as PartLibrary;
  const group = generateGroup(lib, 24, 2611);
  const names = ['Alena', 'Bohdan', 'Cecílie', 'David', 'Eliška', 'Filip', 'Gabriela', 'Hynek', 'Irena', 'Jakub', 'Klára', 'Libor', 'Magda', 'Norbert', 'Olga', 'Pavel', 'Renata', 'Stanislav', 'Tereza', 'Vít', 'Wanda', 'Zbyněk', 'Žofie', 'Matěj'];
  const portals = nodes.filter((n) => n.portal).map((n) => n.id), inner = nodes.filter((n) => !n.portal).map((n) => n.id);
  const sellers = generateGroup(lib, 6, 4242).appearances;
  p.objects.filter((o) => o.seller).forEach((o, i) => { o.seller!.appearance = sellers[i]; });
  const testPal = { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' };
  p.characters = group.appearances.map((app, i): CharacterInstance => ({
    id: `ch_${i + 1}`, name: names[i], assetId: 'builtin_postava_cg', startNodeId: i % 3 === 0 ? portals[i % portals.length] : inner[(i * 7) % inner.length], baseScale: 1,
    walkSpeed: Math.round(60 * app.motion.speed * 10) / 10, palette: testPal, wander: true, appearance: app, routine: 'visitor',
    activities: { coffee: { enabled: true, firstDelayMin: 4 + i * 6, firstDelayMax: 10 + i * 6, intervalMin: 70, intervalMax: 160 } },
  }));
  // psi (Z01): dva majitelé bez dětí; kočka (Z06/Z07) si sedá u betléma nebo u lavičky
  for (const id of ['ch_3', 'ch_11']) p.characters.find((c) => c.id === id)!.pet = 'dog';
  p.cats = [{ firstDelay: 25 }];
  p.catSpots = [{ x: Math.round(0.585 * SW), y: Math.round(0.655 * SH) }, { x: 560, y: 1000 } /* (ne na dráze sání) */, { x: Math.round(0.83 * SW), y: Math.round(0.965 * SH) }];
  for (const n of ['dog_torso', 'dog_torso_back', 'dog_fu_a', 'dog_fu_b', 'dog_fl_a', 'dog_fl_b', 'dog_hu_a', 'dog_hu_b', 'dog_hl_a', 'dog_hl_b', 'dog_head', 'dog_head_back', 'dog_head_down', 'dog_tail', 'dog_sit',
    'cat_torso', 'cat_torso_back', 'cat_fu_a', 'cat_fu_b', 'cat_fl_a', 'cat_fl_b', 'cat_hu_a', 'cat_hu_b', 'cat_hl_a', 'cat_hl_b', 'cat_head', 'cat_head_back', 'cat_sit', 'cat_tail_1', 'cat_tail_2', 'cat_tail_3']) {
    const a = await importAssetFile(dir, path.join(G, 'animals', `${n}.png`), 'image');
    a.id = `animal_${n}`; a.name = `Zvíře – ${n}`; a.anchor = { x: 0.5, y: 0.5 }; a.pixelScale = 1;
    p.assets.push(a);
  }
  // rodiny: 5 dětí chodí po boku rodiče (stálá dvojice – dítě následuje)
  const childLib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-child/library.json', 'utf8')) as PartLibrary;
  const kids = generateGroup(childLib, 5, 777).appearances;
  const kidNames = ['Adámek', 'Bětka', 'Kubík', 'Majda', 'Toník'];
  const parents = ['ch_2', 'ch_5', 'ch_9', 'ch_14', 'ch_20'];
  kids.forEach((app, i) => {
    const par = p.characters.find((c) => c.id === parents[i])!;
    p.characters.push({
      id: `kid_${i + 1}`, name: kidNames[i], assetId: 'builtin_postava_dite', startNodeId: par.startNodeId, baseScale: 1,
      walkSpeed: par.walkSpeed, palette: testPal, wander: true, appearance: app, routine: 'visitor', activities: {},
      companionId: par.id, companionSide: i % 2 ? 1 : -1,
    });
  });
  // sáňky (B02): rodič táhne dítě „vlásenkou“ po levém zasněženém poli u spodního okraje (uprostřed je
  // odhrnutá dlažba – tam sáňky nejedou; zpáteční větev vede před lavičkou); začátek i konec mimo obraz
  const sledParent = generateGroup(lib, 1, 5150).appearances[0];
  p.characters.push({
    id: 'ch_sane', name: 'Rodič se sáňkami', assetId: 'builtin_postava_cg', startNodeId: portals[0], baseScale: 1,
    walkSpeed: 60, palette: testPal, wander: false, appearance: sledParent, routine: 'sled', activities: {},
  });
  p.sled = { parentId: 'ch_sane', firstDelay: 35, path: [[-520, 1072], [-160, 1072], [250, 1073], [520, 1070], [680, 1062], [760, 1048], [740, 1032], [640, 1030], [470, 1040], [250, 1047], [-160, 1047], [-560, 1047]].map(([x, y]) => ({ x, y })) };
  for (const n of ['sled_child_body', 'sled_child_head']) {
    const a = await importAssetFile(dir, path.join(G, 'sled', `${n}.png`), 'image');
    a.id = `sprite_${n}`; a.name = `Sprite – ${n}`; a.anchor = { x: 0.5, y: 0.5 }; a.pixelScale = 1;
    p.assets.push(a);
  }
  p.export = { ...p.export, durationSec: 60, chunkSec: 20 };
  await saveProject(dir, p);
  return p;
}

if (process.argv[1]?.includes('generate-liberec-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Liberec-zivy-trh.zscena');
  generateLiberec(dir).then(() => console.log('Demo vytvořeno:', dir));
}
