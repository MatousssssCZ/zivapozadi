/**
 * Psi a kočky (balíček „živá pozadí“, 07_PSI_A_KOCKY: Z01 pes s majitelem, Z06 průchod kočky,
 * Z07 kočka pozoruje). Zvíře je samostatná entita (ne lidská kostra ani rekvizita), součást
 * SimState (checkpoint). Pohyb ve světových metrech, krok podle uražené dráhy.
 *
 *  - pes jde u boku majitele na vodítku (1,2–1,8 m), po 20–50 s chůze se zastaví a 3–8 s očichává;
 *    majitel mezitím počká (vodítko se nenatahuje přes limit),
 *  - kočka přijde od okraje scény, dojde na klidové místo, 20–60 s sedí a pozoruje (občas se otočí
 *    hlavou), pak odejde jiným okrajem; další návštěva za 180–420 s.
 */
import type { Vec2 } from '../math/vec';
import { cameraFor, toScreen, toWorld, screenAngleOfWorld, type World } from '../scene/camera';
import type { ProjectFile } from '../model/types';
import type { AgentState } from './types';
import { rand, randRange, seedRng, type RngState } from '../math/rng';

export type Species = 'dog' | 'cat';
export interface AnimalState {
  id: string; species: Species;
  ownerId?: string | null;
  pos: Vec2; facing: number; speed: number;
  /** uražená dráha (m) – fáze kroku */ dist: number;
  mode: 'follow' | 'sniff' | 'offstage' | 'walk' | 'sit' | 'leave';
  until: number;
  /** příští zastavení na očichání (s chůze) */ walkLeft: number;
  /** strana u majitele (−1 vlevo, +1 vpravo) */ side: number;
  hidden: boolean;
  /** cesta kočky (body ve scéně) */ path?: Vec2[];
  /** jak moc je hlava dole (0..1), sed (0..1) – plynule */ headDown: number; sit: number;
  /** kam se zvíře dívá (bod) */ look?: Vec2 | null;
  rng: RngState;
}

export const SPECIES = {
  /** výška v kohoutku, délka trupu, rychlost (m, m/s) */
  dog: { shoulder: 0.38, length: 0.62, speed: [0.7, 1.6], stride: 0.55 },
  cat: { shoulder: 0.24, length: 0.42, speed: [0.45, 0.85], stride: 0.32 },
} as const;
export const LEASH = { min: 1.2, max: 1.7 };

export function createAnimals(project: ProjectFile): AnimalState[] {
  const out: AnimalState[] = [];
  for (const c of project.characters) {
    if (c.pet !== 'dog') continue;
    out.push({ id: `dog_${c.id}`, species: 'dog', ownerId: c.id, pos: { x: -500, y: 1000 }, facing: 0, speed: 0, dist: 0, mode: 'follow', until: 0, walkLeft: 30, side: 1, hidden: true, headDown: 0, sit: 0, rng: seedRng(project.seed, `dog_${c.id}`) });
  }
  for (const [i, cs] of (project.cats ?? []).entries()) {
    out.push({ id: `cat_${i + 1}`, species: 'cat', pos: { x: -500, y: 1000 }, facing: 0, speed: 0, dist: 0, mode: 'offstage', until: cs.firstDelay ?? 30, walkLeft: 0, side: 1, hidden: true, headDown: 0, sit: 0, rng: seedRng(project.seed, `cat_${i + 1}`) });
  }
  return out;
}

/** Jeden krok všech zvířat. */
export function stepAnimals(animals: AnimalState[], agents: AgentState[], project: ProjectFile, t: number, dt: number): void {
  const cam = cameraFor(project.scene);
  for (const a of animals) {
    if (a.species === 'dog') stepDog(a, agents, cam, t, dt);
    else stepCat(a, project, cam, t, dt);
    a.headDown += ((a.mode === 'sniff' ? 1 : 0) - a.headDown) * Math.min(1, dt * 4);
    a.sit += ((a.mode === 'sit' ? 1 : 0) - a.sit) * Math.min(1, dt * 2.5);
  }
}

function moveToward(a: AnimalState, cam: ReturnType<typeof cameraFor>, P: World, T: World, vmax: number, dt: number): World {
  const dX = T.X - P.X, dZ = T.Z - P.Z, d = Math.hypot(dX, dZ);
  // plynulé zrychlení/zpomalení (žádné skoky), dojezd do cíle
  const want = Math.min(vmax, d * 2.2);
  const v = a.speed + Math.max(-2.5 * dt, Math.min(2 * dt, want - a.speed));
  a.speed = Math.max(0, v);
  if (d < 1e-4 || a.speed < 1e-4) return P;
  const step = Math.min(d, a.speed * dt);
  const N = { X: P.X + (dX / d) * step, Z: P.Z + (dZ / d) * step };
  a.dist += step;
  if (a.speed > 0.08) a.facing = screenAngleOfWorld(cam, a.pos, Math.atan2(dZ, dX));
  return N;
}

function stepDog(a: AnimalState, agents: AgentState[], cam: ReturnType<typeof cameraFor>, t: number, dt: number) {
  const o = agents.find((x) => x.id === a.ownerId);
  if (!o || o.hidden) {
    // majitel mimo scénu: pes je s ním (zmizí u portálu spolu s ním)
    a.hidden = true; a.speed = 0; a.mode = 'follow';
    if (o) o.speedFactor = o.speedFactor === 0 ? 1 : o.speedFactor;
    return;
  }
  const O = toWorld(cam, o.pos);
  if (a.hidden) {
    // objeví se spolu s majitelem, u jeho boku
    a.hidden = false; a.side = rand(a.rng) < 0.5 ? -1 : 1;
    const S = toScreen(cam, { X: O.X + a.side * 0.55, Z: O.Z + 0.15 });
    a.pos = S; a.speed = 0; a.walkLeft = randRange(a.rng, 20, 50);
  }
  const P = toWorld(cam, a.pos);
  const ov = o.vel ?? { X: 0, Z: 0 }, os = Math.hypot(ov.X, ov.Z);
  if (a.mode === 'sniff') {
    a.speed = Math.max(0, a.speed - 3 * dt);
    // majitel počká, až pes doočichá (vodítko nesmí přesáhnout délku)
    o.speedFactor = 0;
    if (t >= a.until) { a.mode = 'follow'; o.speedFactor = 1; a.walkLeft = randRange(a.rng, 20, 50); }
    return;
  }
  // u boku majitele, kousek za ním ve směru chůze
  const dir = os > 0.15 ? { X: ov.X / os, Z: ov.Z / os } : { X: Math.cos(0), Z: 0 };
  const T = { X: O.X - dir.Z * a.side * 0.5 - dir.X * 0.25, Z: O.Z + dir.X * a.side * 0.5 - dir.Z * 0.25 };
  const dO = Math.hypot(P.X - O.X, P.Z - O.Z);
  const vmax = Math.min(SPECIES.dog.speed[1], Math.max(os * 1.2, dO > LEASH.min ? 1.4 : 0.6));
  const N = moveToward(a, cam, P, T, vmax, dt);
  // vodítko: nikdy dál než max (pes se přitáhne pohybem, ne teleportem – mez je měkká)
  const dd = Math.hypot(N.X - O.X, N.Z - O.Z);
  const Nc = dd > LEASH.max ? { X: O.X + ((N.X - O.X) * LEASH.max) / dd, Z: O.Z + ((N.Z - O.Z) * LEASH.max) / dd } : N;
  a.pos = toScreen(cam, Nc);
  if (os < 0.15 && a.speed < 0.1) a.facing = screenAngleOfWorld(cam, a.pos, Math.atan2(O.Z - Nc.Z, O.X - Nc.X)); // v klidu k majiteli
  // zastavení na očichání po 20–50 s chůze (jen když majitel jde po trase, ne při činnosti)
  if (os > 0.3 && !o.activity) {
    a.walkLeft -= dt;
    if (a.walkLeft <= 0) { a.mode = 'sniff'; a.until = t + randRange(a.rng, 3, 8); }
  }
}

function stepCat(a: AnimalState, project: ProjectFile, cam: ReturnType<typeof cameraFor>, t: number, dt: number) {
  const spots = project.catSpots ?? [];
  if (a.mode === 'offstage') {
    a.hidden = true;
    if (t < a.until || !spots.length) return;
    // vstup od okraje, k náhodnému klidovému místu, odchod druhým okrajem
    const spot = spots[Math.floor(rand(a.rng) * spots.length)];
    const left = rand(a.rng) < 0.5, W = project.scene.width;
    const enter = { x: left ? -40 : W + 40, y: spot.y + randRange(a.rng, -20, 40) };
    const exit = { x: left ? W + 40 : -40, y: spot.y + randRange(a.rng, -20, 60) };
    a.pos = enter; a.path = [{ x: spot.x, y: spot.y }, exit]; a.hidden = false; a.mode = 'walk'; a.speed = 0;
    return;
  }
  const P = toWorld(cam, a.pos);
  if (a.mode === 'sit') {
    a.speed = 0;
    // občas otočí hlavou k dění (pomalu, ne neustálé vrtění)
    if (t >= a.until) { a.mode = 'leave'; return; }
    return;
  }
  const target = a.path?.[0];
  if (!target) { a.mode = 'offstage'; a.until = t + randRange(a.rng, 180, 420); a.hidden = true; return; }
  const T = toWorld(cam, target);
  const N = moveToward(a, cam, P, T, a.mode === 'leave' ? 0.75 : 0.6, dt);
  a.pos = toScreen(cam, N);
  if (Math.hypot(T.X - N.X, T.Z - N.Z) < 0.08) {
    a.path!.shift();
    if (a.mode === 'walk') { a.mode = 'sit'; a.until = t + randRange(a.rng, 20, 60); }
    else if (!a.path!.length) { a.mode = 'offstage'; a.hidden = true; a.until = t + randRange(a.rng, 180, 420); }
  }
}
