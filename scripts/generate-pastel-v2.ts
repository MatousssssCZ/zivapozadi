/**
 * Pastelové kluziště 2: kopie kluziště s vektorovými těly a oděvy, malovanými hlavami a obličeji,
 * plnějšími postavami a dvojicemi za ruce (dvě děti; muž a žena stejného věku – rodiče, senioři).
 * Spuštění: npx tsx scripts/generate-pastel-v2.ts [cílová složka]
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
const src = 'demo/Pastelove-kluziste.zscena', dst = process.argv[2] ?? 'demo/Pastelove-kluziste-2.zscena';
await fs.rm(dst, { recursive: true, force: true });
await fs.cp(src, dst, { recursive: true });
const pf = path.join(dst, 'project.json');
const p = JSON.parse(await fs.readFile(pf, 'utf8'));
p.meta.name = 'Pastelové vánoční kluziště 2';
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
await fs.writeFile(pf, JSON.stringify(p, null, 2) + '\n');
console.log('Scéna vytvořena:', dst, `(${p.characters.length} postav, ${pairs.length / 2} dvojice za ruce)`);
