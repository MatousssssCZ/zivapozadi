/**
 * Hustota davu bez horního limitu: chce-li scéna víc chodců, bruslařů, psů nebo koček, než má projekt
 * postav, doplní se deterministicky (ze seedu projektu) další – klony existujících postav stejného druhu
 * s novou identitou (seed vzhledu, jiná hlava, oblečení jiné postavy, jiná rasa psa/kočky).
 * Projekt se nemění; simulace pracuje s rozšířenou kopií.
 */
import type { CharacterInstance, ProjectFile } from '../model/types';

const ADULT_HEADS = ['head_01_cg', 'head_02_cg', 'head_03_cg', 'head_04_cg', 'head_05_cg', 'head_06_cg', 'head_07_cg', 'head_08_cg', 'head_09_cg', 'head_10_cg', 'head_11_cg', 'head_12_cg'];
const DOGS = ['dog_collie', 'dog_dalmatian', 'dog_husky', 'dog_bernese', 'dog_dachshund', 'dog_frenchie'];
const CATS = ['cat_british', 'cat_mainecoon', undefined];
const companions = (p: ProjectFile, id: string) => p.characters.filter((c) => c.companionId === id).length;

function cloneOf(p: ProjectFile, base: CharacterInstance, donor: CharacterInstance, id: string, n: number): CharacterInstance {
  const c = structuredClone(base) as CharacterInstance;
  c.id = id; c.name = `${base.name.replace(/\s*\(.*\)$/, '')} ${n + 2}`;
  delete c.companionId; delete (c as { holdHands?: boolean }).holdHands;
  if (c.appearance) {
    const a = c.appearance, d = donor.appearance;
    a.seed = (p.seed * 2654435761 + n * 40503 + id.length * 977) >>> 0;
    if (d && d.bodyTemplate === a.bodyTemplate) { a.variants = { ...d.variants }; a.colors = { ...d.colors }; }
    if (/head_(\d+_)?cg$/.test(a.variants.head ?? '')) a.variants = { ...a.variants, head: ADULT_HEADS[(n * 5 + 3) % ADULT_HEADS.length] };
  }
  return c;
}

/** Bobování: víc dětí, než má projekt (hill.kidsN) – klony dětí ze svahu; méně = jen prvních kidsN. */
function expandHill(p: ProjectFile): ProjectFile {
  const h = p.hill; if (!h || h.kidsN === undefined) return p;
  const want = Math.max(0, Math.round(h.kidsN));
  if (want <= h.kids.length) return want === h.kids.length ? p : { ...p, hill: { ...h, kids: h.kids.slice(0, want) } };
  const pool = h.kids.map((id) => p.characters.find((c) => c.id === id)).filter((c): c is CharacterInstance => !!c);
  if (!pool.length) return p;
  const q: ProjectFile = { ...p, characters: [...p.characters], hill: { ...h, kids: [...h.kids] } };
  for (let n = 0; n < want - h.kids.length; n++) {
    const c = cloneOf(p, pool[n % pool.length], pool[(n * 3 + 1) % pool.length], `gen_h_${n + 1}`, n + 200);
    q.characters.push(c); q.hill!.kids.push(c.id);
  }
  return q;
}

export function expandCrowd(p0: ProjectFile): ProjectFile {
  const p = expandHill(p0);
  const cr = p.crowd; if (!cr) return p;
  const walkPool = p.characters.filter((c) => c.routine === 'visitor' && !c.skate && !c.companionId && !c.pet);
  const ownerPool = p.characters.filter((c) => c.routine === 'visitor' && !c.skate && !c.companionId && c.pet);
  const skatePool = p.characters.filter((c) => !!c.skate && !c.skatePair);
  const persons = walkPool.reduce((s, c) => s + 1 + companions(p, c.id), 0);
  const addW = Math.max(0, (cr.walkersN ?? 0) - persons), addD = Math.max(0, (cr.dogs ?? 0) - ownerPool.length);
  const addS = Math.max(0, (cr.skatersN ?? 0) - skatePool.length), addC = Math.max(0, (cr.cats ?? 0) - (p.cats?.length ?? 0));
  if (!addW && !addD && !addS && !addC) return p;
  const q: ProjectFile = { ...p, characters: [...p.characters], cats: p.cats ? [...p.cats] : p.cats };
  const singles = walkPool.filter((c) => !companions(p, c.id) && !c.gaitProfile);
  const donors = p.characters.filter((c) => c.appearance && c.routine === 'visitor');
  for (let n = 0; n < addW && singles.length; n++) q.characters.push(cloneOf(p, singles[n % singles.length], donors[(n * 7 + 1) % donors.length], `gen_w_${n + 1}`, n));
  for (let n = 0; n < addD && ownerPool.length; n++) { const c = cloneOf(p, ownerPool[n % ownerPool.length], donors[(n * 5 + 2) % donors.length], `gen_d_${n + 1}`, n + 50); c.petBreed = DOGS[(n + ownerPool.length) % DOGS.length]; q.characters.push(c); }
  for (let n = 0; n < addS && skatePool.length; n++) { const c = cloneOf(p, skatePool[n % skatePool.length], skatePool[(n * 3 + 1) % skatePool.length], `gen_s_${n + 1}`, n + 100); delete c.skatePair; q.characters.push(c); }
  if (addC) { const base = p.cats?.length ?? 0; q.cats = [...(q.cats ?? [])]; for (let n = 0; n < addC; n++) q.cats.push({ firstDelay: 20 + ((base + n) * 37) % 90, breed: CATS[(base + n) % CATS.length] }); }
  return q;
}
