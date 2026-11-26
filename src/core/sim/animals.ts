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
  /** pes: místo za okrajem, kam doběhne za majitelem, který už odešel */
  exitAt?: World | null;
  /** rasa (díly `animal_<rasa>_*`); chybí = původní díly druhu */ breed?: string;
  id: string; species: Species;
  ownerId?: string | null;
  pos: Vec2; facing: number; speed: number;
  /** uražená dráha (m) – fáze kroku */ dist: number;
  mode: 'follow' | 'sniff' | 'offstage' | 'walk' | 'sit' | 'leave'
    /** Z05 setřesení sněhu, Z04 očichání s druhým psem, Z10 zaregistrování psa/kočky */
    | 'shake' | 'meet' | 'notice'
    /** Z03 pohlazení */
    | 'pet'
    /** Z08 očista a protažení kočky */
    | 'groom' | 'stretch'
    /** Z09 skok na sokl: příprava, let, (sed na soklu = 'sit'), seskok */
    | 'prep' | 'jump' | 'jumpDown';
  /** výška nad zemí (m) – kočka na soklu / ve skoku */ h?: number;
  /** index soklu (Z09) a body skoku */ perch?: number | null; jumpFrom?: Vec2; jumpTo?: Vec2; jumpH0?: number; jumpH1?: number;
  /** začátek aktuálního režimu (pro animaci) */ since?: number;
  /** jak dlouho majitel stojí (s) – Z02 */ stillT?: number;
  /** příští možné setřesení / očista (cooldown zvířete) */ nextShake?: number;
  /** partner setkání (Z04/Z10) / hladící člověk (Z03) */ partnerId?: string | null;
  /** příští možné pohlazení (cooldown dvojice 120–240 s) */ nextPet?: number;
  /** po sedu se kočka může protáhnout (Z08) */ stretchDone?: boolean;
  /** režim, do kterého se kočka vrátí po zaregistrování psa (Z10) */ resume?: 'walk' | 'leave';
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
    out.push({ id: `dog_${c.id}`, species: 'dog', ...(c.petBreed ? { breed: c.petBreed } : {}), ownerId: c.id, pos: { x: -500, y: 1000 }, facing: 0, speed: 0, dist: 0, mode: 'follow', until: 0, walkLeft: 30, side: 1, hidden: true, headDown: 0, sit: 0, rng: seedRng(project.seed, `dog_${c.id}`) });
  }
  for (const [i, cs] of (project.cats ?? []).entries()) {
    out.push({ id: `cat_${i + 1}`, species: 'cat', ...(cs.breed ? { breed: cs.breed } : {}), pos: { x: -500, y: 1000 }, facing: 0, speed: 0, dist: 0, mode: 'offstage', until: cs.firstDelay ?? 30, walkLeft: 0, side: 1, hidden: true, headDown: 0, sit: 0, rng: seedRng(project.seed, `cat_${i + 1}`) });
  }
  return out;
}

let byId = new Map<string, AnimalState>();

/** Prostředí pro zvířata: sněží-li (Z05), pool částic, scénický režisér setkání (Z04/Z10). */
export interface AnimalEnv {
  snowing: boolean;
  puff(x: number, y: number, n: number, t: number, seed: number): void;
  dir: { nextDogs: number; nextDogCat: number; perchNext?: number[] };
  /** Z03: známý člověk poblíž (přítel majitele, jinak sám majitel), který může psa pohladit */
  petter?(owner: AgentState, dog: AnimalState): AgentState | null;
  /** spustí klip pohlazení; false = ruka/trup obsazené */
  startPet?(person: AgentState, dur: number, dogPos: Vec2): boolean;
  endPet?(person: AgentState): void;
}

/** Jeden krok všech zvířat. */
export function stepAnimals(animals: AnimalState[], agents: AgentState[], project: ProjectFile, t: number, dt: number, env?: AnimalEnv): void {
  const cam = cameraFor(project.scene);
  byId = new Map(animals.map((x) => [x.id, x]));
  for (const a of animals) {
    const before = a.mode;
    if (a.species === 'dog') stepDog(a, agents, cam, t, dt, env);
    else stepCat(a, project, cam, t, dt, env);
    if (a.mode !== before) a.since = t;
    a.headDown += ((a.mode === 'sniff' || (a.mode === 'meet' && a.speed < 0.1) ? 1 : 0) - a.headDown) * Math.min(1, dt * 4);
    const sitting = a.mode === 'sit' || a.mode === 'groom';
    a.sit += ((sitting ? 1 : 0) - a.sit) * Math.min(1, dt * 2.5);
  }
  if (env) meetings(animals, agents, cam, t, env);
}

/** Z04 (dva psi se krátce očichají) a Z10 (pes a kočka se zaregistrují) – vzácné, s cooldownem scény. */
function meetings(animals: AnimalState[], agents: AgentState[], cam: ReturnType<typeof cameraFor>, t: number, env: AnimalEnv) {
  const W = (x: AnimalState) => toWorld(cam, x.pos);
  const dogs = animals.filter((x) => x.species === 'dog' && !x.hidden && x.mode === 'follow');
  const owner = (d: AnimalState) => agents.find((x) => x.id === d.ownerId);
  if (t >= env.dir.nextDogs) {
    for (let i = 0; i < dogs.length; i++) for (let j = i + 1; j < dogs.length; j++) {
      const A = dogs[i], B = dogs[j], oa = owner(A), ob = owner(B);
      if (!oa || !ob || oa.activity || ob.activity) continue;
      const PA = W(A), PB = W(B);
      if (Math.hypot(PA.X - PB.X, PA.Z - PB.Z) > 2.4) continue;
      // oba majitelé zastaví, psi se přiblíží (v mezích vodítek), krátce se očichají
      const until = t + randRange(A.rng, 2, 5) + 1.2;
      for (const [d, o] of [[A, B], [B, A]] as const) { d.mode = 'meet'; d.partnerId = o.id; d.until = until; }
      oa.speedFactor = 0; ob.speedFactor = 0;
      env.dir.nextDogs = t + randRange(A.rng, 180, 360);
      return;
    }
  }
  if (t >= env.dir.nextDogCat) {
    for (const c of animals) {
      if (c.species !== 'cat' || c.hidden || (c.mode !== 'walk' && c.mode !== 'sit' && c.mode !== 'leave')) continue;
      const PC = W(c);
      for (const d of dogs) {
        const PD = W(d);
        if (Math.hypot(PC.X - PD.X, PC.Z - PD.Z) > 2.6) continue;
        env.dir.nextDogCat = t + randRange(c.rng, 240, 480);
        if (rand(c.rng) < 0.35) return; // není povinné při každém přiblížení
        // zaregistrují se: krátce se zastaví a natočí k sobě; majitel se psem pokračuje
        d.mode = 'notice'; d.partnerId = c.id; d.until = t + randRange(d.rng, 1, 2.2);
        c.look = { ...d.pos };
        if (c.mode !== 'sit') { c.resume = c.mode as 'walk' | 'leave'; c.mode = 'notice'; c.until = t + randRange(c.rng, 1.5, 3); }
        return;
      }
    }
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

function stepDog(a: AnimalState, agents: AgentState[], cam: ReturnType<typeof cameraFor>, t: number, dt: number, env?: AnimalEnv) {
  const o = agents.find((x) => x.id === a.ownerId);
  if (o && o.hidden && !a.hidden) {
    // majitel už odešel za okraj: pes za ním doběhne a zmizí až tam (ne uprostřed obrazu)
    // (cíl o 1 m dál za místem, kde majitel zmizel – majitel mizí těsně za okrajem, pes je menší)
    const T0 = toWorld(cam, o.pos), P = toWorld(cam, a.pos);
    a.exitAt ??= (() => { const dx = T0.X - P.X, dz = T0.Z - P.Z, d = Math.hypot(dx, dz) || 1; return { X: T0.X + (dx / d) * 1.0, Z: T0.Z + (dz / d) * 1.0 }; })();
    const T = a.exitAt;
    if (Math.hypot(T.X - P.X, T.Z - P.Z) > 0.35) { a.pos = toScreen(cam, moveToward(a, cam, P, T, 1.4, dt)); a.mode = 'follow'; return; }
  }
  if (!o || o.hidden) {
    // majitel mimo scénu: pes je s ním
    a.hidden = true; a.speed = 0; a.mode = 'follow'; a.exitAt = null;
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
  if (a.mode === 'shake') {
    // Z05: setřese sníh (krátká posloupnost hlava → trup → ocas; animuje renderer)
    a.speed = Math.max(0, a.speed - 4 * dt);
    if (t >= a.until) a.mode = 'follow';
    return;
  }
  if (a.mode === 'meet' || a.mode === 'notice') {
    const other = a.partnerId ? (byId.get(a.partnerId) ?? null) : null;
    if (a.mode === 'meet') o.speedFactor = 0;
    if (other && !other.hidden) {
      const Q = toWorld(cam, other.pos), P0 = toWorld(cam, a.pos), d = Math.hypot(Q.X - P0.X, Q.Z - P0.Z) || 1;
      if (a.mode === 'meet' && d > 0.55) {
        // přiblížit se k druhému psovi (nos k nosu), ale jen v mezích vodítka
        const T = { X: Q.X - ((Q.X - P0.X) / d) * 0.5, Z: Q.Z - ((Q.Z - P0.Z) / d) * 0.5 };
        let N = moveToward(a, cam, P0, T, 0.6, dt);
        const dd = Math.hypot(N.X - O.X, N.Z - O.Z);
        if (dd > LEASH.max) N = { X: O.X + ((N.X - O.X) * LEASH.max) / dd, Z: O.Z + ((N.Z - O.Z) * LEASH.max) / dd };
        a.pos = toScreen(cam, N);
      } else a.speed = Math.max(0, a.speed - 3 * dt);
      if (a.speed < 0.1) a.facing = screenAngleOfWorld(cam, a.pos, Math.atan2(Q.Z - P0.Z, Q.X - P0.X));
    }
    if (t >= a.until || !other || other.hidden) { a.mode = 'follow'; a.partnerId = null; o.speedFactor = 1; a.walkLeft = randRange(a.rng, 20, 50); }
    if (a.mode === 'notice') { /* majitel jde dál – vodítko psa za chvíli dotáhne */ } else return;
  }
  if (a.mode === 'pet') {
    // Z03: pes přijde na dosah ruky hladícího (kus před ním) a natočí se k němu
    const p = agents.find((x) => x.id === a.partnerId);
    if (!p || p.hidden || os > 0.2 || t >= a.until) {
      if (p) env?.endPet?.(p);
      a.mode = 'follow'; a.partnerId = null; a.stillT = 0;
    } else {
      const Pp = toWorld(cam, p.pos), hd = p.groundHeading ?? 0, P0 = toWorld(cam, a.pos);
      const T = { X: Pp.X + Math.cos(hd) * 0.42, Z: Pp.Z + Math.sin(hd) * 0.42 };
      let N = moveToward(a, cam, P0, T, 0.5, dt);
      const dd = Math.hypot(N.X - O.X, N.Z - O.Z);
      if (dd > LEASH.max) N = { X: O.X + ((N.X - O.X) * LEASH.max) / dd, Z: O.Z + ((N.Z - O.Z) * LEASH.max) / dd };
      a.pos = toScreen(cam, N);
      if (a.speed < 0.1) a.facing = screenAngleOfWorld(cam, a.pos, Math.atan2(Pp.Z - N.Z, Pp.X - N.X));
      return;
    }
  }
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
  // Z02: majitel stojí (nakupuje, čeká ve frontě, povídá si) → pes se po chvíli posadí vedle něj;
  // Z05: předtím se po pobytu ve sněžení občas setřese
  if (a.mode === 'notice') return;
  a.stillT = os < 0.12 && a.speed < 0.12 ? (a.stillT ?? 0) + dt : 0;
  if (a.mode === 'sit' && os > 0.2) a.mode = 'follow';
  if (a.mode === 'follow' && (a.stillT ?? 0) > 2.2) {
    if (env?.snowing && t >= (a.nextShake ?? 30) && rand(a.rng) < 0.5) {
      a.mode = 'shake'; a.until = t + randRange(a.rng, 0.8, 1.4); a.nextShake = t + randRange(a.rng, 120, 240);
      const top = toScreen(cam, toWorld(cam, a.pos), SPECIES.dog.shoulder * 0.9);
      env.puff(a.pos.x, top.y, 6, t, Math.floor(t * 100));
      return;
    }
    a.nextShake = Math.max(a.nextShake ?? 0, t + 20); // (nesetřásat se při každém zastavení)
    a.mode = 'sit';
  }
  // Z03: sedícího psa občas pohladí známý člověk (cooldown dvojice 120–240 s)
  if (a.mode === 'sit' && env?.petter && (a.stillT ?? 0) > 4 && t >= (a.nextPet ?? 45)) {
    const p = env.petter(o, a);
    const dur = randRange(a.rng, 4, 8);
    if (p) {
      const Pp = toWorld(cam, p.pos), hd = p.groundHeading ?? 0, T = { X: Pp.X + Math.cos(hd) * 0.42, Z: Pp.Z + Math.sin(hd) * 0.42 };
      // jen když je místo před ním na dosah vodítka
      if (Math.hypot(T.X - O.X, T.Z - O.Z) < LEASH.max - 0.05 && env.startPet!(p, dur, a.pos)) {
        a.mode = 'pet'; a.partnerId = p.id; a.until = t + dur; a.nextPet = t + randRange(a.rng, 120, 240);
        return;
      }
    }
    a.nextPet = t + 15;
  }
  // zastavení na očichání po 20–50 s chůze (jen když majitel jde po trase, ne při činnosti)
  if (os > 0.3 && !o.activity) {
    a.walkLeft -= dt;
    if (a.walkLeft <= 0) { a.mode = 'sniff'; a.until = t + randRange(a.rng, 3, 8); }
  }
}

function stepCat(a: AnimalState, project: ProjectFile, cam: ReturnType<typeof cameraFor>, t: number, dt: number, env?: AnimalEnv) {
  const spots = project.catSpots ?? [], perches = project.catPerches ?? [];
  if (a.mode === 'offstage') {
    a.hidden = true; a.h = 0; a.perch = null;
    if (t < a.until || !spots.length) return;
    const lim = project.crowd?.cats; if (lim !== undefined && Number(a.id.split('_')[1]) > lim) { a.until = t + 5; return; } // počet koček
    // vstup od okraje, k náhodnému klidovému místu (vzácně na sokl – Z09), odchod druhým okrajem
    const pn = env ? (env.dir.perchNext ??= perches.map(() => 0)) : [];
    const pi = perches.findIndex((_, i) => t >= (pn[i] ?? 0));
    const usePerch = pi >= 0 && rand(a.rng) < 0.4;
    const spot = usePerch ? perches[pi].from : spots[Math.floor(rand(a.rng) * spots.length)];
    const left = rand(a.rng) < 0.5, W = project.scene.width;
    const enter = { x: left ? -90 : W + 90, y: spot.y + randRange(a.rng, -20, 40) }; // celá kočka za okrajem
    const exit = { x: left ? W + 90 : -90, y: spot.y + randRange(a.rng, -20, 60) };
    a.pos = enter; a.path = [{ x: spot.x, y: spot.y }, exit]; a.hidden = false; a.mode = 'walk'; a.speed = 0; a.stretchDone = false;
    a.perch = usePerch ? pi : null;
    if (usePerch && env) pn[pi] = t + 1e6; // obsazeno do seskoku
    return;
  }
  if (a.mode === 'prep') {
    // Z09: krátká příprava (přikrčení, pohled nahoru na sokl)
    a.speed = 0;
    if (t >= a.until) { a.mode = 'jump'; a.until = t + 0.5; }
    return;
  }
  if (a.mode === 'jump' || a.mode === 'jumpDown') {
    // let po oblouku (svět): odraz → let → dopad; výška h nad zemí
    const dur = 0.5, u = Math.min(1, 1 - (a.until - t) / dur);
    const F = toWorld(cam, a.jumpFrom!), T = toWorld(cam, a.jumpTo!);
    a.pos = toScreen(cam, { X: F.X + (T.X - F.X) * u, Z: F.Z + (T.Z - F.Z) * u });
    a.h = (a.jumpH0 ?? 0) + ((a.jumpH1 ?? 0) - (a.jumpH0 ?? 0)) * u + 0.22 * Math.sin(Math.PI * u);
    a.speed = 0.6;
    if (u >= 1) {
      a.h = a.jumpH1 ?? 0; a.speed = 0;
      if (a.mode === 'jump') { a.mode = 'sit'; a.until = t + randRange(a.rng, 10, 30); }
      else {
        a.mode = 'leave';
        const pn = env?.dir.perchNext; if (pn && a.perch !== null && a.perch !== undefined) pn[a.perch] = t + randRange(a.rng, 180, 360);
        a.perch = null;
      }
    }
    return;
  }
  const P = toWorld(cam, a.pos);
  if (a.mode === 'notice') {
    // Z10: zastaví se a dívá na psa, pak pokračuje svou cestou
    a.speed = Math.max(0, a.speed - 2.5 * dt);
    if (a.look) { const L = toWorld(cam, a.look); a.facing = screenAngleOfWorld(cam, a.pos, Math.atan2(L.Z - P.Z, L.X - P.X)); }
    if (t >= a.until) { a.mode = a.resume ?? 'walk'; a.look = null; }
    return;
  }
  if (a.mode === 'groom') {
    // Z08: očista vsedě (hlava k hrudi/tlapce, drobné pohyby), pak dál sedí
    a.speed = 0;
    if (t >= (a.since ?? t) + (a.walkLeft || 4)) a.mode = 'sit';
    return;
  }
  if (a.mode === 'stretch') {
    // Z08: protažení vestoje (přední tlapky dopředu, záď nahoře) 2–3 s, pak odchod
    a.speed = 0;
    if (t >= a.until) a.mode = 'leave';
    return;
  }
  if (a.mode === 'sit') {
    a.speed = 0;
    // občas se očistí (ne při každém sedu; cooldown kočky 60–150 s)
    if (t >= (a.nextShake ?? 0) && t < a.until - 8 && t - (a.since ?? t) > 5) {
      a.nextShake = t + randRange(a.rng, 60, 150);
      if (rand(a.rng) < 0.6) { a.mode = 'groom'; a.walkLeft = randRange(a.rng, 3, 6); return; }
    }
    if (t >= a.until && (a.h ?? 0) > 0.05) {
      // Z09: seskok ze soklu zpět na odrazový bod, pak odchod
      const pr = perches[a.perch ?? 0];
      a.mode = 'jumpDown'; a.until = t + 0.5; a.jumpFrom = { ...a.pos }; a.jumpTo = pr ? { ...pr.from } : { ...a.pos }; a.jumpH0 = a.h; a.jumpH1 = 0;
      return;
    }
    if (t >= a.until) {
      // vstane; občas se před odchodem protáhne
      if (!a.stretchDone && rand(a.rng) < 0.45) { a.stretchDone = true; a.mode = 'stretch'; a.until = t + randRange(a.rng, 2, 3); return; }
      a.mode = 'leave'; return;
    }
    return;
  }
  const target = a.path?.[0];
  if (!target) { a.mode = 'offstage'; a.until = t + randRange(a.rng, 180, 420); a.hidden = true; return; }
  const T = toWorld(cam, target);
  const N = moveToward(a, cam, P, T, a.mode === 'leave' ? 0.75 : 0.6, dt);
  a.pos = toScreen(cam, N);
  if (Math.hypot(T.X - N.X, T.Z - N.Z) < 0.08) {
    a.path!.shift();
    if (a.mode === 'walk' && a.perch !== null && a.perch !== undefined && perches[a.perch]) {
      const pr = perches[a.perch];
      a.mode = 'prep'; a.until = t + randRange(a.rng, 0.35, 0.6);
      a.jumpFrom = { ...a.pos }; a.jumpTo = { ...pr.at }; a.jumpH0 = 0; a.jumpH1 = pr.height;
      const Tw = toWorld(cam, pr.at); a.facing = screenAngleOfWorld(cam, a.pos, Math.atan2(Tw.Z - N.Z, Tw.X - N.X));
    }
    else if (a.mode === 'walk') { a.mode = 'sit'; a.until = t + randRange(a.rng, 20, 60); }
    else if (!a.path!.length) { a.mode = 'offstage'; a.hidden = true; a.until = t + randRange(a.rng, 180, 420); }
  }
}
