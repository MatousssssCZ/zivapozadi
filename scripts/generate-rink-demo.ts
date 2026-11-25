/**
 * Testovací scéna „Kluziště“: logika a pohyb bruslení na podkladu Liberce. Konečný vzhled kluziště
 * (malované pozadí s ledem a mantinelem) dodá grafik – zde je led i mantinel jen vektorový zástupce.
 * 16 bruslařů podle kvót zadání (rekreační 8 vč. rodiče s dítětem poprvé, nejistí 2, děti poprvé 2,
 * zdatné děti 2, velmi dobří 2). Ostatní činnosti (sáňky, odklízení, pády chodců, zvířata) jsou vypnuté.
 * Spuštění: npx tsx scripts/generate-rink-demo.ts [cílová složka]
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { ProjectFile, CharacterInstance } from '../src/core/model/types';
import type { PartLibrary } from '../src/core/anim/partLibrary';
import type { SkateProfile } from '../src/core/sim/rink';
import { generateGroup } from '../src/core/anim/appearanceGenerator';
import { saveProject } from '../src/node/projectIO';
import { cameraFor, toScreen, toWorld } from '../src/core/scene/camera';
import { generateLiberec } from './generate-liberec-demo';

/** obrys ledu ve světě (m): zaoblený obdélník */
export const RINK_WORLD = { x0: -6.5, x1: 6.5, z0: 13.8, z1: 25.0, r: 2.0 };

export async function generateRink(dir: string): Promise<ProjectFile> {
  const p = await generateLiberec(dir);
  const cam = cameraFor(p.scene);
  const { x0, x1, z0, z1, r } = RINK_WORLD, ice = [];
  const corners = [[x1 - r, z0 + r, -Math.PI / 2], [x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI]] as const;
  for (const [cx, cz, a0] of corners) for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); ice.push(toScreen(cam, { X: cx + Math.cos(a) * r, Z: cz + Math.sin(a) * r })); }
  const round = (v: { x: number; y: number }) => ({ x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10 });
  // nízký zástupný mantinel (0,55 m), aby byly vidět brusle; branka na levé straně
  p.rink = { ice: ice.map(round), gate: round(toScreen(cam, { X: x0, Z: (z0 + z1) / 2 })), dir: 1, boardH: 0.55 };
  // objekty na ledu pryč (stánky v pozadí zůstanou)
  const W = (o: { x: number; y: number }) => toWorld(cam, o);
  p.objects = p.objects.filter((o) => { const w = W(o); return !(w.X > x0 - 0.6 && w.X < x1 + 0.6 && w.Z > z0 - 0.6 && w.Z < z1 + 0.6); });
  p.zones = []; p.areas = []; p.cats = []; p.catPerches = []; p.catSpots = [];
  delete p.sled; delete p.clearing; p.falls = { enabled: false, meanIntervalSec: 210, minGapSec: 120 };

  const lib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-cg/library.json', 'utf8')) as PartLibrary;
  const childLib = JSON.parse(await fs.readFile('resources/builtin/painted-parts-child/library.json', 'utf8')) as PartLibrary;
  const adults = generateGroup(lib, 12, 9021).appearances, kids = generateGroup(childLib, 4, 9022).appearances;
  const pal = { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' };
  const node = p.nav.nodes.find((n) => !n.portal)!.id;
  const mk = (id: string, name: string, app: CharacterInstance['appearance'], child: boolean, skate: SkateProfile, pair?: string): CharacterInstance => ({
    id, name, assetId: child ? 'builtin_postava_dite' : 'builtin_postava_cg', startNodeId: node, baseScale: 1, walkSpeed: 60, palette: pal,
    wander: false, appearance: app, routine: 'visitor', activities: {}, skate, ...(pair ? { skatePair: pair } : {}),
  });
  const prof: SkateProfile[] = ['rec', 'rec', 'rec', 'rec', 'rec', 'rec', 'rec', 'rec', 'unsure', 'unsure', 'expert', 'expert'];
  p.characters = adults.map((app, i) => mk(`sk_${i + 1}`, `Bruslař ${i + 1} (${prof[i]})`, app, false, prof[i]));
  p.characters.push(
    mk('kid_b1', 'Dítě poprvé (s rodičem)', kids[0], true, 'beginnerKid', 'sk_1'),
    mk('kid_b2', 'Dítě poprvé (u mantinelu)', kids[1], true, 'beginnerKid'),
    mk('kid_g1', 'Zdatné dítě 1', kids[2], true, 'goodKid'),
    mk('kid_g2', 'Zdatné dítě 2', kids[3], true, 'goodKid'),
  );

  await saveProject(dir, p);
  return p;
}

if (process.argv[1]?.includes('generate-rink-demo')) {
  const dir = path.resolve(process.argv[2] ?? 'demo/Kluziste-test.zscena');
  generateRink(dir).then(() => console.log('Demo vytvořeno:', dir));
}
