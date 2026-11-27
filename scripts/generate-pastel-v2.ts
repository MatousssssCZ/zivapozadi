/**
 * Pastelové kluziště 2: kopie kluziště s vektorovými těly a oděvy, malovanými hlavami a obličeji,
 * plnějšími postavami a dvojicemi za ruce (dvě děti; muž a žena stejného věku – rodiče, senioři).
 * Verze 3 (--v3): navíc živější scéna – prodavačka, víc návštěvníků a rodin, častěji ke stánku, víc
 * sněhuláků, odklízení chodníků před domy, hustota počty.
 * Spuštění: npx tsx scripts/generate-pastel-v2.ts [--v3] [cílová složka]
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
const V3 = process.argv.includes('--v3'), argDst = process.argv.slice(2).find((a) => !a.startsWith('--'));
const src = 'demo/Pastelove-kluziste.zscena', dst = argDst ?? (V3 ? 'demo/Pastelove-kluziste-3.zscena' : 'demo/Pastelove-kluziste-2.zscena');
await fs.rm(dst, { recursive: true, force: true });
await fs.cp(src, dst, { recursive: true });
const pf = path.join(dst, 'project.json');
const p = JSON.parse(await fs.readFile(pf, 'utf8'));
p.meta.name = V3 ? 'Pastelové vánoční kluziště 3' : 'Pastelové vánoční kluziště 2';
p.scene.vectorFigures = true; // vektorová těla a oděvy
p.scene.paintedHeads = true; // hlava a obličej z malované textury
type Ch = Record<string, any>;
const byId = (id: string) => p.characters.find((c: Ch) => c.id === id) as Ch;
const clone = (base: Ch, id: string, name: string, head: string, seed: number, extra: Ch = {}): Ch => ({
  ...JSON.parse(JSON.stringify(base)), id, name, ...extra,
  appearance: { ...JSON.parse(JSON.stringify(base.appearance)), seed, variants: { ...base.appearance.variants, head } },
});
// dvojice za ruce: vůdce = návštěvník, partner jde vedle a drží ho za ruku
const adult = byId('ch_1'), kid = byId('kid_1'), senior = byId('ch_senior_a');
const pairs: Ch[] = [
  clone(adult, 'pair_a1', 'Tomáš (pár)', 'head_01_cg', 910211, { startNodeId: 'pl', companionId: null }),
  clone(adult, 'pair_a2', 'Klára (pár)', 'head_03_cg', 910377, { startNodeId: 'pl', companionId: 'pair_a1', companionSide: 1, holdHands: true }),
  clone(adult, 'pair_b1', 'Petr (pár)', 'head_05_cg', 920511, { startNodeId: 'pr', companionId: null }),
  clone(adult, 'pair_b2', 'Eva (pár)', 'head_07_cg', 920733, { startNodeId: 'pr', companionId: 'pair_b1', companionSide: -1, holdHands: true }),
  clone(senior, 'pair_s1', 'Jaroslav (senioři)', 'head_10_cg', 930101, { startNodeId: 'pr', companionId: null, gaitProfile: 'elderA', walkSpeed: 44 }),
  clone(senior, 'pair_s2', 'Věra (senioři)', 'head_12_cg', 930233, { startNodeId: 'pr', companionId: 'pair_s1', companionSide: 1, holdHands: true, gaitProfile: 'elderA', walkSpeed: 44 }),
  clone(kid, 'pair_k1', 'Bára (děti)', 'head_child', 940117, { startNodeId: 'pl', companionId: null, walkSpeed: 52 }),
  clone(kid, 'pair_k2', 'Julie (děti)', 'head_child', 940229, { startNodeId: 'pl', companionId: 'pair_k1', companionSide: -1, holdHands: true, walkSpeed: 52 }),
];
for (const c of pairs) { delete c.skate; delete c.skatePair; delete c.pet; delete c.petBreed; if (!c.companionId) delete c.companionId; }
p.characters.push(...pairs);

// ---------------------------------------------------------------- živější scéna (verze 3)
if (V3) {
// víc návštěvníků (různé hlavy a vchody) a dvě další rodiny s dítětem (sněhulák, koulovačka)
const heads = ['head_02_cg', 'head_04_cg', 'head_05_cg', 'head_07_cg', 'head_08_cg', 'head_01_cg', 'head_03_cg', 'head_06_cg', 'head_11_cg', 'head_09_cg'];
const names = ['Radek', 'Lenka', 'Martin', 'Petra', 'Šárka', 'Jakub', 'Zuzana', 'Michal', 'Božena', 'Stanislav'];
const starts = ['pl', 'pr', 'fl', 'fr'];
const more: Ch[] = heads.map((h, i) => clone(adult, `ch_v2_${i + 1}`, names[i], h, 950101 + i * 7919, { startNodeId: starts[i % 4], companionId: null }));
const famParents = [clone(adult, 'fam_p1', 'Ondřej (rodina)', 'head_02_cg', 960011, { startNodeId: 'pl' }), clone(adult, 'fam_p2', 'Ivana (rodina)', 'head_08_cg', 960023, { startNodeId: 'pr' })];
const famKids = [clone(kid, 'fam_k1', 'Matyáš', 'head_child', 960101, { startNodeId: 'pl', companionId: 'fam_p1', companionSide: 1 }), clone(kid, 'fam_k2', 'Anička', 'head_child', 960117, { startNodeId: 'pr', companionId: 'fam_p2', companionSide: -1 })];
for (const c of [...more, ...famParents]) { delete c.skate; delete c.skatePair; delete c.pet; delete c.petBreed; delete c.companionId; delete c.holdHands; }
for (const c of famKids) { delete c.skate; delete c.skatePair; delete c.holdHands; }
p.characters.push(...more, ...famParents, ...famKids);
// ke stánku chodí častěji (první cesta brzy, pak každé 1–2 minuty)
for (const c of p.characters as Ch[]) if (c.routine === 'visitor' && !c.skate && c.activities?.coffee) c.activities.coffee = { ...c.activities.coffee, firstDelayMin: 5, firstDelayMax: 30, intervalMin: 45, intervalMax: 110 };

p.visitorMix = { coffee: 0.7 };

// prodavač(ka) ve stánku s horkými nápoji: za pultem vpravo od várnice, vidět jen v okně stánku
const stall = p.objects.find((o: Ch) => o.id === 'obj_stanek');
stall.seller = {
  assetId: 'builtin_postava_cg', name: 'Prodavačka nápojů',
  appearance: { ...JSON.parse(JSON.stringify(adult.appearance)), seed: 970001, variants: { ...adult.appearance.variants, head: 'head_04_cg', hat: 'hat_rib_cg' } },
  heightOfStall: 0.42, offset: { x: 15, y: -95 }, window: { x0: -303, y0: -598, x1: 187, y1: -305 },
};

// víc sněhuláků: dvě souběžné výrazné události, kratší pauzy, druhé místo na sněhu (vpravo od stromu, u domů)
p.director = { gap: [20, 50], maxSessions: 2 };
for (const z of p.zones as Ch[]) if (z.activityType === 'snowman') z.params = { ...z.params, chance: 0.85 };
const sm = (p.zones as Ch[]).find((z) => z.id === 'zone_snehulak');
p.zones.push({ ...JSON.parse(JSON.stringify(sm)), id: 'zone_snehulak2', name: 'Sněhulák (před domy vpravo)', bounds: [{ x: 1180, y: 704 }, { x: 1264, y: 704 }, { x: 1264, y: 742 }, { x: 1180, y: 742 }] });

// odklízení chodníků před domy: další úseky, každý s vlastním pracovníkem; opakuje se po 2–4 minutách
const worker = byId('ch_lopata');
p.clearing = { ...p.clearing, firstDelay: 20, repeat: [120, 240] };
const X = (x: number) => (x - 958) / 45.9, Z0 = p.clearing.work.z0, Z1 = p.clearing.work.z1;
const strip = (x0: number, x1: number, right: boolean, delay: number, id: string) => ({
  workerId: id, work: { x0: X(x0), x1: X(x1), z0: Z0, z1: Z1 }, pileAt: { X: X(x1) + 0.4, Z: Z1 + 0.75 },
  enter: right ? { x: 2000, y: 764 } : { x: -80, y: 758 }, approach: right ? [{ x: 1720, y: 768 }] : [{ x: Math.max(60, x0 - 120), y: 758 }],
  firstDelay: delay, repeat: [150, 300] as [number, number],
});
// chodník před každým domem má vlastní úsek; začátky rozložené, ať se odklízí průběžně (čistý chodník
// se znovu odklízí, až napadne nový sníh)
p.clearings = [strip(130, 250, false, 60, 'ch_lopata2'), strip(1230, 1350, true, 35, 'ch_lopata3'), strip(1570, 1690, true, 100, 'ch_lopata4'),
  strip(620, 740, false, 170, 'ch_lopata5'), strip(1400, 1520, true, 240, 'ch_lopata6'), strip(260, 380, false, 330, 'ch_lopata7')];
const wHeads = ['head_05_cg', 'head_02_cg', 'head_10_cg', 'head_07_cg', 'head_06_cg', 'head_12_cg'], wNames = ['Domovník Pavel', 'Paní Jarmila (dům vpravo)', 'Pan Vladimír', 'Paní Hana (zelený dům)', 'Pan Karel (modrý dům)', 'Paní Marta'];
p.characters.push(...wHeads.map((h, i) => clone(worker, `ch_lopata${i + 2}`, wNames[i], h, 980011 + i * 101)));

// hustota (počty) a tempo chodců – lze měnit v horní liště
// kočka: prochází po chodníku před domy, sedává u lampy a u lavičky
p.cats = [{ firstDelay: 15, breed: 'cat_british' }];
p.catSpots = [{ x: 470, y: 748 }, { x: 1255, y: 750 }, { x: 760, y: 1062 }];
p.crowd = { walkersN: 30, skatersN: 18, dogs: 3, cats: 1, walkSpeed: 1 };
}
await fs.writeFile(pf, JSON.stringify(p, null, 2) + '\n');
console.log('Scéna vytvořena:', dst, `(${p.characters.length} postav, ${pairs.length / 2} dvojice za ruce, ${(p.clearings?.length ?? 0) + 1} úseky odklízení)`);
