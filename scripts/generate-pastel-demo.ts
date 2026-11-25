/**
 * Scéna „Pastelové vánoční kluziště“: zasněžené viktoriánské náměstí za světlého dne, kluziště je
 * součástí malovaného pozadí (grafika/pastel). Podklady zpracovává scripts/process-pastel-graphics.py
 * (rozdělení sad, ořez, kotvy na patě, obrys ledu, světýlka stromu).
 *
 * Veškeré rozmístění a četnosti jsou v konstantě PASTEL níže (screen px 1920×1080, kotvy = pata).
 * Spuštění: npx tsx scripts/generate-pastel-demo.ts [cílová složka]
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createEmptyProject } from '../src/core/model/defaults';
import type { ProjectFile, SceneObject, NavNode, NavEdge, CharacterInstance, AssetEntry, InteractionPoint } from '../src/core/model/types';
import type { Vec2 } from '../src/core/math/vec';
import { addBuiltinAsset } from '../src/node/builtin';
import type { PartLibrary } from '../src/core/anim/partLibrary';
import { generateGroup } from '../src/core/anim/appearanceGenerator';
import { createProjectDir, saveProject, importAssetFile } from '../src/node/projectIO';
import { defaultIntegration, lantern } from '../src/core/render/integration';
import { cameraFor, toScreen, toWorld } from '../src/core/scene/camera';
import type { SkateProfile } from '../src/core/sim/rink';

const G = 'grafika/pastel', ZP = 'grafika/ziva-pozadi';

/** Přehledná konfigurace scény (vše laditelné). */
export const PASTEL = {
  /** perspektiva: dospělý u dveří domů (y 726) má 0,51 výšky testovací postavy, horizont y ≈ 560 */
  depth: { yFar: 726, scaleFar: 0.51, yNear: 1080, scaleNear: 1.596 },
  /** bruslaři: počet a podíly schopností (věk je samostatně); nejistí a začátečníci vypnutí – místo nich jistější (dospělí i šikovné děti) */
  skaters: { count: 18, mix: { rec: 0.6, beginner: 0, good: 0.35, expert: 0.05 }, kidsAmongBeginners: 0, kidsAmongGood: 2, parentWithKid: false },
  /** chodci */ visitors: 14, families: 3, seniors: 2, dogs: 2,
  /** výška objektů (m) – velikost se odvodí z perspektivy v místě paty */
  heights: { tree: 16, stall: 3.9, lamp: 3.6, lampArc: 3.7, bench: 0.95, bin: 0.95, leafyWide: 9.5, leafyNarrow: 10.5 },
  objects: {
    tree: { x: 960, y: 722 },
    stall: { x: 1800, y: 800 },
    bin: { x: 1660, y: 806 },
    bench: { x: 50, y: 764 },
    lamps: [{ x: 330, y: 744, arc: false }, { x: 700, y: 742, arc: true, flip: true }, { x: 1235, y: 742, arc: true }, { x: 1560, y: 746, arc: false }, { x: 14, y: 752, arc: false, front: true }, { x: 1906, y: 812, arc: true, front: true, flip: true }],
    leafy: [{ x: 1896, y: 768, kind: 'narrow' as const }],
  },
  /** nástup na led: místo na sněhu u lavičky a první bod na ledě */
  /** vstup na led: místo na okraji ledu (x obrazovky); branka 0,4 m před okrajem, první krok 0,35 m za ním */
  gateAtX: 168,
  /** jak dlouho bruslí (s), jak dlouho jsou mimo led, kolik jich je na začátku na ledě, kolik jde po bruslení na nápoj */
  session: [420, 900] as [number, number], offIce: [40, 150] as [number, number], startOnIce: 0.85, drinkChance: 0.5,
  /** prvky: globální prodleva ~120 s s mírnou náhodností; váhy (skok s otočkou, holubička, jízda vzad = půlotočka, jedna noha; pirueta na místě vypnutá) */
  tricks: { every: [100, 140] as [number, number], weights: { jump: 35, arabesque: 30, backward: 20, oneFoot: 15, spin: 0, hop: 0 } },
  falls: { every: [60, 120] as [number, number], personal: 160, chance: 0.85 },
  reflections: { alpha: 0.2, len: 0.42 },
};

export async function generatePastel(dir: string): Promise<ProjectFile> {
  await fs.rm(dir, { recursive: true, force: true });
  await createProjectDir(dir);
  const meta = JSON.parse(await fs.readFile(path.join(G, 'podklady.json'), 'utf8')) as { ice: [number, number][]; sprites: Record<string, { w: number; h: number; anchor: [number, number]; lights?: [number, number][] }> };
  const p = createEmptyProject('Pastelové vánoční kluziště', 3141);
  p.scene.depth = { enabled: true, ...PASTEL.depth };
  p.scene.backgroundColor = '#dfe8f4';
  p.scene.snowfall = { enabled: true, density: 0.35, wind: 0.1 }; // lehké sněžení za světlého dne
  p.scene.environment = { variableSnow: true, gusts: false, cupSteam: true, stallSteam: true, sources: [] };
  const cam = cameraFor(p.scene);
  const W = (q: Vec2) => toWorld(cam, q), S = (w: { X: number; Z: number }, H = 0) => toScreen(cam, w, H);
  /** px na metr v místě paty */ const ppm = (y: number) => cam.f / toWorld(cam, { x: 960, y }).Z;

  const imp = async (file: string, name: string, anchor: Vec2, id?: string): Promise<AssetEntry> => {
    const a = await importAssetFile(dir, path.join(G, file), 'image');
    a.name = name; a.anchor = anchor; a.pixelScale = 1; if (id) a.id = id; p.assets.push(a); return a;
  };
  const bg = await imp('pozadi-kluziste.png', 'Pozadí – pastelové náměstí s kluzištěm', { x: 0, y: 0 });
  p.scene.backgroundAssetId = bg.id;
  const spr = async (n: string, name: string) => { const m = meta.sprites[n]; return imp(`sprites/${n}.png`, name, { x: m.anchor[0], y: m.anchor[1] }); };
  const A = {
    tree: await spr('vanocni-strom', 'Vánoční strom'), stall: await spr('stanek-napoje', 'Stánek – horké nápoje'),
    lamp: await spr('lampa-rovna', 'Lampa s věncem'), lampArc: await spr('lampa-oblouk', 'Lampa s ramenem'),
    bench: await spr('lavicka', 'Lavička'), bin: await spr('kos', 'Odpadkový koš'),
    leafyWide: await spr('strom-listnaty-siroky', 'Listnatý strom (široký)'), leafyNarrow: await spr('strom-listnaty-uzky', 'Listnatý strom (úzký)'),
  };
  for (const id of ['builtin_postava_cg', 'builtin_postava_dite']) await addBuiltinAsset('resources/builtin', dir, p, id);
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const integ = (lights = false) => { const I = defaultIntegration(); I.grade.enabled = false; I.lights.enabled = lights; return I; };
  /** měřítko objektu, aby měl v místě paty danou výšku (m) */
  const scaleFor = (a: AssetEntry, y: number, hM: number) => Math.round(((hM * ppm(y)) / a.height!) * 10000) / 10000;
  /** obdélník půdorysu (m kolem paty) → obrazové jednotky objektu (vůči kotvě, před měřítkem) */
  const fp = (x: number, y: number, sc: number, hw: number, d0: number, d1: number): Vec2[] => {
    const w = W({ x, y }), P = (dx: number, dz: number) => { const q = S({ X: w.X + dx, Z: w.Z + dz }); return { x: Math.round((q.x - x) / sc), y: Math.round((q.y - y) / sc) }; };
    return [P(-hw, d1), P(hw, d1), P(hw, -d0), P(-hw, -d0)];
  };
  /** bod ve vzdálenosti (m) od paty → offset v obrazových jednotkách objektu */
  const off = (x: number, y: number, sc: number, dx: number, dz: number): Vec2 => { const w = W({ x, y }), q = S({ X: w.X + dx, Z: w.Z + dz }); return { x: Math.round((q.x - x) / sc), y: Math.round((q.y - y) / sc) }; };
  const O = (id: string, name: string, a: AssetEntry, x: number, y: number, scale: number, extra: Partial<SceneObject> = {}): SceneObject => ({ id, name, assetId: a.id, x, y, scale, layer: 'world', zBias: 0, flipX: false, visible: true, locked: false, integration: integ(), ...extra });
  const ob = PASTEL.objects;

  // ------------------------------------------------------------------ objekty
  // vánoční strom v ústí ulice za ledem; výhledy z promenády (pozorování stromu, místa k pití)
  const ts = scaleFor(A.tree, ob.tree.y, PASTEL.heights.tree);
  A.tree.shape = { bodyU0: 0.3, bodyU1: 0.7, depthM: 2.6 };
  A.tree.sparkle = meta.sprites['vanocni-strom'].lights ?? [];
  const tree = O('obj_strom', 'Vánoční strom', A.tree, ob.tree.x, ob.tree.y, ts, {
    footprint: fp(ob.tree.x, ob.tree.y, ts, 2.5, 2.0, 2.0), // podstavec (koruna je nad hlavami)
    interaction: { kind: 'viewpoint', points: [
      { id: 'view1', kind: 'view', offset: off(ob.tree.x, ob.tree.y, ts, -3.4, -3.4), facing: -Math.PI / 2 + 0.5, label: 'Výhled 1' },
      { id: 'view2', kind: 'view', offset: off(ob.tree.x, ob.tree.y, ts, 3.5, -3.5), facing: -Math.PI / 2 - 0.5, label: 'Výhled 2' },
      { id: 'view3', kind: 'view', offset: off(ob.tree.x, ob.tree.y, ts, 0.4, -4.4), facing: -Math.PI / 2, label: 'Výhled 3' },
    ] },
  });
  // stánek s nápoji vpravo na sněhu: výdej před okénkem, fronta doprava (mimo promenádu i led)
  const ss = scaleFor(A.stall, ob.stall.y, PASTEL.heights.stall), sm = meta.sprites['stanek-napoje'];
  const ax = sm.anchor[0] * sm.w, ay = sm.anchor[1] * sm.h; // kotva v px obrázku
  A.stall.shape = { bodyU0: 0.13, bodyU1: 0.97, depthM: 2.0, lights: [lantern(0.247, 0.545, 2.3), lantern(0.782, 0.545, 2.3)], steam: [{ u: 0.371, v: 0.59 }] };
  const facingStall = -Math.PI / 2;
  const stallPts: InteractionPoint[] = [
    { id: 'service1', kind: 'service', offset: off(ob.stall.x, ob.stall.y, ss, -0.95, -0.75), facing: facingStall, label: 'Výdej' },
    { id: 'queue1', kind: 'queue', offset: off(ob.stall.x, ob.stall.y, ss, -0.1, -1.9), facing: facingStall - 0.4, label: 'Fronta 1' },
    { id: 'queue2', kind: 'queue', offset: off(ob.stall.x, ob.stall.y, ss, 0.9, -2.6), facing: facingStall - 0.6, label: 'Fronta 2' },
    { id: 'counter', kind: 'counter', offset: { x: Math.round(576 - ax), y: Math.round(868 - ay) }, label: 'Pult' },
  ];
  const stall = O('obj_stanek', 'Stánek – horké nápoje', A.stall, ob.stall.x, ob.stall.y, ss, {
    footprint: fp(ob.stall.x, ob.stall.y, ss, 1.75, 0.15, 1.9), interaction: { kind: 'stand', points: stallPts },
    // obsluha uvnitř otvoru: spodní část těla zakryje pult, ořez oknem (bez kreslení přes stánek)
    seller: { assetId: 'builtin_postava_cg', appearance: null as never, name: 'Prodavačka', heightOfStall: 0.44, offset: { x: Math.round(560 - ax), y: -40 }, window: { x0: Math.round(330 - ax), y0: Math.round(592 - ay), x1: Math.round(826 - ax), y1: Math.round(868 - ay) } },
  });
  stall.integration = integ(true);
  // koš vedle stánku (mimo frontu): vhazuje se zleva
  const bs = scaleFor(A.bin, ob.bin.y, PASTEL.heights.bin);
  A.bin.shape = { bodyU0: 0.12, bodyU1: 0.88, depthM: 0.5 };
  const bin = O('obj_kos', 'Odpadkový koš', A.bin, ob.bin.x, ob.bin.y, bs, {
    footprint: fp(ob.bin.x, ob.bin.y, bs, 0.28, 0.25, 0.25),
    interaction: { kind: 'bin', points: [
      { id: 'drop1', kind: 'drop', offset: off(ob.bin.x, ob.bin.y, bs, -0.6, -0.15), facing: 0, label: 'Vhození zleva' },
      { id: 'drop2', kind: 'drop', offset: off(ob.bin.x, ob.bin.y, bs, 0.05, -0.65), facing: -Math.PI / 2, label: 'Vhození zepředu' },
      { id: 'opening', kind: 'counter', offset: { x: 0, y: -Math.round(0.82 * A.bin.height! * meta.sprites.kos.anchor[1]) }, label: 'Otvor koše' },
    ] },
  });
  // lavička pro přezouvání u vstupu na led (tři místa, sedí se čelem do scény)
  const bns = scaleFor(A.bench, ob.bench.y, PASTEL.heights.bench);
  A.bench.shape = { bodyU0: 0.06, bodyU1: 0.94, depthM: 0.7 };
  const bench = O('obj_lavicka', 'Lavička u vstupu na led', A.bench, ob.bench.x, ob.bench.y, bns, {
    footprint: fp(ob.bench.x, ob.bench.y, bns, 0.85, 0.12, 0.35),
    interaction: { kind: 'generic', points: [-0.55, 0.05, 0.6].map((dx, i) => ({ id: `seat${i + 1}`, kind: 'seat' as const, offset: off(ob.bench.x, ob.bench.y, bns, dx, -0.32), facing: Math.PI / 2, label: `Místo ${i + 1}` })) },
  });
  p.objects.push(tree, stall, bin, bench);
  // lampy (zadní promenáda + velké v předních rozích); na lampách u promenády výhled na bruslaře
  ob.lamps.forEach((L, i) => {
    const a = L.arc ? A.lampArc : A.lamp, sc = scaleFor(a, L.y, L.arc ? PASTEL.heights.lampArc : PASTEL.heights.lamp);
    a.shape = L.arc ? { bodyU0: 0.18, bodyU1: 0.32, depthM: 0.35, lights: [{ ...lantern(0.83, 0.33, 3.0), radiusM: 2.6, groundGain: 0.06, haloOpacity: 0.05 }] } : { bodyU0: 0.3, bodyU1: 0.7, depthM: 0.35, lights: [{ ...lantern(0.5, 0.17, 3.2), radiusM: 2.6, groundGain: 0.06, haloOpacity: 0.05 }] };
    const view = !L.front ? { interaction: { kind: 'viewpoint' as const, points: [{ id: 'view1', kind: 'view' as const, offset: off(L.x, L.y, sc, 0.9, -1.3), facing: Math.PI / 2, label: 'Pohled na led' }] } } : {};
    p.objects.push(O(`obj_lampa${i + 1}`, `Lampa ${i + 1}`, a, L.x, L.y, sc, { flipX: !!L.flip, footprint: fp(L.x, L.y, sc, 0.2, 0.2, 0.2), integration: integ(true), ...view }));
  });
  ob.leafy.forEach((T, i) => {
    const a = T.kind === 'narrow' ? A.leafyNarrow : A.leafyWide, sc = scaleFor(a, T.y, T.kind === 'narrow' ? PASTEL.heights.leafyNarrow : PASTEL.heights.leafyWide);
    a.shape = { bodyU0: 0.42, bodyU1: 0.58, depthM: 0.6 };
    p.objects.push(O(`obj_listnaty${i + 1}`, `Listnatý strom ${i + 1}`, a, T.x, T.y, sc, { footprint: fp(T.x, T.y, sc, 0.3, 0.3, 0.3) }));
  });

  // ------------------------------------------------------------------ led, sníh, pěší zóny
  const ice = meta.ice.map(([x, y]) => ({ x, y }));
  // vstup: okraj ledu pod zvoleným x (horní, vzdálená hrana), posun v metrech podél Z
  const topY = (x: number) => { const n = ice.length / 2, tp = ice.slice(0, n); for (let i = 1; i < tp.length; i++) if (tp[i].x >= x) { const a = tp[i - 1], b = tp[i]; return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1); } return tp[tp.length - 1].y; };
  const ge = W({ x: PASTEL.gateAtX, y: topY(PASTEL.gateAtX) }), rnd = (q: Vec2) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 });
  const gate = { snow: rnd(S({ X: ge.X, Z: ge.Z + 0.4 })), ice: rnd(S({ X: ge.X, Z: ge.Z - 0.35 })) };
  // led je pro chodce překážka (o 0,5 m menší než skutečný obrys: chodci smějí na sněhový lem, bruslaři na sníh nevyjedou)
  const Wi = ice.map(W), cxW = Wi.reduce((q, w) => q + w.X, 0) / Wi.length, czW = Wi.reduce((q, w) => q + w.Z, 0) / Wi.length;
  const inset = Wi.map((w) => { const dx = w.X - cxW, dz = w.Z - czW, d = Math.hypot(dx, dz) || 1, k = Math.max(0, d - 0.5) / d; return S({ X: cxW + dx * k, Z: czW + dz * k }); });
  p.areas = [
    { id: 'area_led', name: 'Kluziště (jen bruslaři)', kind: 'obstacle', polygon: inset.filter((_, i) => i % 3 === 0).map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })) },
    { id: 'area_snih', name: 'Zasněžené náměstí', kind: 'snow', polygon: rect(0, 690, 1920, 1080) },
  ];
  p.rink = {
    ice, gate: gate.snow, dir: 1, boards: false, paintedIce: true,
    entry: { benchId: 'obj_lavicka', gate: gate.snow, inIce: gate.ice, session: PASTEL.session, offIce: PASTEL.offIce, startOnIce: PASTEL.startOnIce, drinkChance: PASTEL.drinkChance },
    events: { trickEvery: PASTEL.tricks.every, tricks: PASTEL.tricks.weights, fallEvery: PASTEL.falls.every, fallPersonal: PASTEL.falls.personal, fallChance: PASTEL.falls.chance },
    reflections: PASTEL.reflections, particles: true,
  };

  // ------------------------------------------------------------------ trasy: zadní promenáda (s odbočkami ke stromu, lavičce, stánku) a přední pás
  const N = (id: string, x: number, y: number, name: string, stop?: NavNode['stop']): NavNode => ({ id, x, y, name, stop, portal: x < 0 || x > 1920 || undefined });
  const nodes: NavNode[] = [
    N('pl', -50, 744, 'Vstup vlevo (promenáda)'), N('p1', 135, 750, 'Promenáda u lavičky'), N('p0', 112, 786, 'Před lavičkou (nástup na led)'), N('p2', 330, 760, 'Promenáda 2'), N('p3', 560, 756, 'Promenáda 3'),
    N('p4', 780, 752, 'Ústí ulice vlevo'), N('p5', 960, 754, 'Před stromem', { waitMin: 2, waitMax: 6, look: { mode: 'object', objectId: 'obj_strom' }, next: [] }),
    N('p6', 1140, 752, 'Ústí ulice vpravo'), N('p7', 1380, 756, 'Promenáda 7'), N('p8', 1585, 760, 'Promenáda u koše'), N('s0', 1702, 816, 'Před stánkem'), N('p9', 1720, 768, 'Za stánkem'), N('pr', 1975, 772, 'Vstup vpravo (promenáda)'),
    N('t1', 838, 736, 'Strom vlevo'), N('t2', 1082, 736, 'Strom vpravo'),
    N('fl', -60, 1068, 'Vstup vlevo (vpředu)'), N('f1', 520, 1066, 'Vpředu 1'), N('f2', 1000, 1072, 'Vpředu 2'), N('f3', 1460, 1066, 'Vpředu 3'), N('fr', 1985, 1066, 'Vstup vpravo (vpředu)'),
  ];
  const E = (a: string, b: string): NavEdge => ({ id: `e_${a}_${b}`, a, b, oneWay: false, narrow: false });
  const edges: NavEdge[] = [E('p1', 'p0'), E('pl', 'p1'), E('p1', 'p2'), E('p2', 'p3'), E('p3', 'p4'), E('p4', 'p5'), E('p5', 'p6'), E('p6', 'p7'), E('p7', 'p8'), E('p8', 'p9'), E('p8', 's0'), E('p9', 'pr'),
    E('p4', 't1'), E('t1', 't2'), E('t2', 'p6'), E('fl', 'f1'), E('f1', 'f2'), E('f2', 'f3'), E('f3', 'fr')];
  p.nav.nodes = nodes; p.nav.edges = edges;

  // ------------------------------------------------------------------ zóny činností (na sněhu, nikdy na ledě)
  p.zones = [
    { id: 'zone_napoje', name: 'Horké nápoje (káva, svařák, dětský punč)', activityType: 'coffee', activityVersion: 1, enabled: true, bounds: rect(0, 690, 1920, 880),
      objectRoles: { stand: ['obj_stanek'], seating: ['obj_strom', 'obj_lampa3', 'obj_lampa4'], bin: ['obj_kos'] }, params: { queueTimeout: 300 } },
    { id: 'zone_vyhled', name: 'Pozorování stromu a bruslařů', activityType: 'viewing', activityVersion: 1, enabled: true, bounds: rect(0, 690, 1920, 800), objectRoles: { view: ['obj_strom', 'obj_lampa1', 'obj_lampa2', 'obj_lampa3', 'obj_lampa4'] }, params: { lookMin: 6, lookMax: 20 } },
    // menší sněhové plochy po stranách stromu v ústí ulice
    { id: 'zone_snehulak', name: 'Sněhulák (vlevo od stromu)', activityType: 'snowman', activityVersion: 1, enabled: true, bounds: rect(762, 704, 846, 742), objectRoles: {}, params: { chance: 0.35 } },
    { id: 'zone_koulovacka', name: 'Koulovačka (vpravo od stromu)', activityType: 'snowballFight', activityVersion: 1, enabled: true, bounds: rect(1066, 702, 1132, 742), objectRoles: {}, params: { chance: 0.3, allowAdults: false } },
  ];

  // ------------------------------------------------------------------ zvířata, rekvizity (převzaté z balíku živých pozadí)
  for (const n of ['dog_torso', 'dog_torso_back', 'dog_fu_a', 'dog_fu_b', 'dog_fl_a', 'dog_fl_b', 'dog_hu_a', 'dog_hu_b', 'dog_hl_a', 'dog_hl_b', 'dog_head', 'dog_head_back', 'dog_head_down', 'dog_tail', 'dog_sit']) {
    const a = await importAssetFile(dir, path.join(ZP, 'animals', `${n}.png`), 'image'); a.id = `animal_${n}`; a.name = `Zvíře – ${n}`; a.anchor = { x: 0.5, y: 0.5 }; a.pixelScale = 1; p.assets.push(a);
  }
  for (const n of ['snowman_base', 'snowman_middle', 'snowman_head', 'snowball', 'carrot', 'scarf', 'coal_0', 'coal_1', 'coal_2', 'coal_3', 'coal_4', 'steam_1', 'steam_2', 'steam_3', 'steam_4', 'steam_5', 'steam_6']) {
    const a = await importAssetFile(dir, path.join(ZP, 'sprites_clean', `${n}.png`), 'image'); a.id = `sprite_${n}`; a.name = `Sprite – ${n}`; a.anchor = { x: 0.5, y: 0.5 }; a.pixelScale = 1; p.assets.push(a);
  }
  for (const n of ['phone_front', 'phone_back', 'mitten_ground', 'mitten_held', 'shovel', 'shovel_snow', 'snow_pile', 'pavement']) {
    const a = await importAssetFile(dir, path.join(ZP, 'sprites', `${n}.png`), 'image'); a.id = `sprite_${n}`; a.name = `Sprite – ${n}`; a.anchor = { x: 0.5, y: 0.5 }; a.pixelScale = 1; p.assets.push(a);
  }

  // ------------------------------------------------------------------ postavy
  const lib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-cg/library.json', 'utf8')) as PartLibrary;
  const childLib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-child/library.json', 'utf8')) as PartLibrary;
  const pal = { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' };
  const portals = ['pl', 'pr', 'fl', 'fr'];
  const vis = generateGroup(lib, PASTEL.visitors, 3141).appearances;
  const names = ['Anna', 'Bedřich', 'Dana', 'Emil', 'Františka', 'Gustav', 'Hana', 'Ivan', 'Jana', 'Karel', 'Lucie', 'Marek', 'Nela', 'Oto'];
  p.characters = vis.map((app, i): CharacterInstance => ({
    id: `ch_${i + 1}`, name: names[i % names.length], assetId: 'builtin_postava_cg', startNodeId: portals[i % 2], baseScale: 1,
    walkSpeed: Math.round(60 * app.motion.speed * 10) / 10, palette: pal, wander: true, appearance: app, routine: 'visitor',
    activities: { coffee: { enabled: true, firstDelayMin: 20 + i * 9, firstDelayMax: 40 + i * 9, intervalMin: 120, intervalMax: 260 } },
  }));
  // přední pás: jen dva chodci (velké postavy u kamery – střídmě)
  for (const id of ['ch_13', 'ch_14']) { const c = p.characters.find((x) => x.id === id); if (c) c.startNodeId = id === 'ch_13' ? 'fl' : 'fr'; }
  for (const id of ['ch_3', 'ch_8'].slice(0, PASTEL.dogs)) p.characters.find((c) => c.id === id)!.pet = 'dog';
  // rodiny (dítě chodí po boku rodiče; staví sněhuláka, koulují se)
  const kids = generateGroup(childLib, PASTEL.families + 4, 3142).appearances;
  ['ch_2', 'ch_5', 'ch_10'].slice(0, PASTEL.families).forEach((pid, i) => {
    const par = p.characters.find((c) => c.id === pid)!;
    p.characters.push({ id: `kid_${i + 1}`, name: ['Ema', 'Vojta', 'Rozárka'][i], assetId: 'builtin_postava_dite', startNodeId: par.startNodeId, baseScale: 1, walkSpeed: par.walkSpeed, palette: pal, wander: true, appearance: kids[i], routine: 'visitor', activities: {}, companionId: par.id, companionSide: i % 2 ? 1 : -1 });
  });
  // senioři (A pomalá chůze, B s holí)
  const elders = generateGroup(lib, PASTEL.seniors, 3143).appearances;
  if (lib.variants.some((v) => v.id === 'head_11_cg')) { elders[0].variants.head = 'head_11_cg'; if (elders[1]) elders[1].variants.head = 'head_10_cg'; }
  p.characters.push(
    { id: 'ch_senior_a', name: 'Paní Marie (senior A)', assetId: 'builtin_postava_cg', startNodeId: 'pl', baseScale: 0.97, walkSpeed: 57, palette: pal, wander: true, appearance: elders[0], routine: 'visitor', activities: {}, gaitProfile: 'elderA' },
    { id: 'ch_senior_b', name: 'Pan Alois (senior B, hůl)', assetId: 'builtin_postava_cg', startNodeId: 'pr', baseScale: 0.98, walkSpeed: 36, palette: pal, wander: true, appearance: elders[1], routine: 'visitor', activities: {}, gaitProfile: 'elderB', caneSide: 'R' },
  );
  // odklízení krátkého úseku promenády vlevo (sníh se hrne ke straně u domů, nikdy na led)
  const worker = generateGroup(lib, 1, 3144).appearances[0];
  p.characters.push({ id: 'ch_lopata', name: 'Pracovník údržby', assetId: 'builtin_postava_cg', startNodeId: 'pl', baseScale: 1, walkSpeed: 55, palette: pal, wander: false, appearance: worker, routine: 'shovel', activities: {} });
  const w0 = W({ x: 420, y: 760 }), w1 = W({ x: 560, y: 749 });
  p.clearing = { workerId: 'ch_lopata', work: { x0: Math.min(w0.X, w1.X), x1: Math.max(w0.X, w1.X), z0: w0.Z, z1: w0.Z + 0.75 }, pileAt: { X: Math.max(w0.X, w1.X) + 0.4, Z: w0.Z + 1.5 }, enter: { x: -80, y: 758 }, approach: [{ x: 300, y: 758 }], firstDelay: 150 };
  // bruslaři: podíly schopností (konfigurovatelné), děti jako samostatná vlastnost
  const n = PASTEL.skaters.count, mix = PASTEL.skaters.mix;
  const cnt = { expert: Math.max(1, Math.round(n * mix.expert)), good: Math.round(n * mix.good), beginner: Math.round(n * mix.beginner) };
  const rec = n - cnt.expert - cnt.good - cnt.beginner;
  const kidB = PASTEL.skaters.kidsAmongBeginners, kidG = PASTEL.skaters.kidsAmongGood;
  const adultsN = n - kidB - kidG;
  const sAd = generateGroup(lib, adultsN, 3145).appearances, sKid = generateGroup(childLib, kidB + kidG, 3146).appearances;
  const mk = (id: string, name: string, app: CharacterInstance['appearance'], child: boolean, skate: SkateProfile, pair?: string): CharacterInstance => ({
    id, name, assetId: child ? 'builtin_postava_dite' : 'builtin_postava_cg', startNodeId: 'pl', baseScale: 1, walkSpeed: 60, palette: pal, wander: true,
    appearance: app, routine: 'visitor', activities: {}, skate, ...(pair ? { skatePair: pair } : {}),
  });
  const profs: SkateProfile[] = [...Array(rec).fill('rec'), ...Array(cnt.beginner - kidB).fill('unsure'), ...Array(cnt.good - kidG).fill('good'), ...Array(cnt.expert).fill('expert')];
  profs.slice(0, adultsN).forEach((pr, i) => p.characters.push(mk(`sk_${i + 1}`, `Bruslař ${i + 1}`, sAd[i], false, pr)));
  for (let k = 0; k < kidB; k++) p.characters.push(mk(`sk_kid_b${k + 1}`, `Dítě poprvé na ledě ${k + 1}`, sKid[k], true, 'beginnerKid', k === 0 && PASTEL.skaters.parentWithKid ? 'sk_1' : undefined));
  for (let k = 0; k < kidG; k++) p.characters.push(mk(`sk_kid_g${k + 1}`, `Šikovné dítě ${k + 1}`, sKid[kidB + k], true, 'goodKid'));
  p.falls = { enabled: true, meanIntervalSec: 300, minGapSec: 180 }; // výjimečné uklouznutí chodce
  p.export = { ...p.export, durationSec: 60, chunkSec: 20 };
  await saveProject(dir, p);
  return p;
}

if (process.argv[1]?.includes('generate-pastel-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Pastelove-kluziste.zscena');
  generatePastel(dir).then(() => console.log('Demo vytvořeno:', dir));
}
