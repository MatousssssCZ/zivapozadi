import { newClearingState, resetClearing } from '../core/sim/clearing';
import { store } from './store';
import { newId } from '../core/model/ids';
import type { AssetEntry, ProjectFile, SceneObject, NavNode, CharacterInstance, ActivityZone, Area, ScheduledEvent } from '../core/model/types';
import type { Vec2 } from '../core/math/vec';
import { dist } from '../core/math/vec';
import { getActivity } from '../core/activities/registry';
import { pointInPolygon } from '../core/math/geom';
import { zs } from './api';

const P = () => store.state.project!;

export async function ensureAsset(a: AssetEntry): Promise<AssetEntry> {
  const p = P();
  const existing = p.assets.find((x) => x.id === a.id);
  if (existing) return existing;
  if (a.id.startsWith('builtin_')) {
    const entry = await zs().addBuiltin(store.state.dir!, a.id);
    store.edit('Přidání assetu', (d) => { d.assets.push(entry); });
    return entry;
  }
  return a;
}

export async function placeAsset(a: AssetEntry, x: number, y: number) {
  const asset = await ensureAsset(a);
  if (asset.kind !== 'image') return;
  const id = newId('obj');
  const name = asset.name.replace(/\s*\(test\)\s*/i, '');
  store.edit(`Vložení „${name}“`, (d) => {
    const o: SceneObject = {
      id, name, assetId: asset.id, x: Math.round(x), y: Math.round(y), scale: 1, layer: 'world', zBias: 0, flipX: false, visible: true, locked: false,
      footprint: asset.defaultFootprint ? structuredClone(asset.defaultFootprint) : undefined,
      interaction: asset.defaultInteraction ? structuredClone(asset.defaultInteraction) : undefined,
    };
    d.objects.push(o);
  });
  store.set({ selection: { kind: 'object', id }, tool: 'select' });
}

export async function setBackground(a: AssetEntry | null) {
  const asset = a ? await ensureAsset(a) : null;
  store.edit('Změna pozadí', (d) => { d.scene.backgroundAssetId = asset?.id ?? null; });
}

export function deleteSelection() {
  const s = store.state.selection; if (!s) return;
  const p = P();
  if (s.kind === 'object') {
    const o = p.objects.find((x) => x.id === s.id); if (!o) return;
    if (o.locked) { store.toast('warn', `Objekt „${o.name}“ je zamčený.`); return; }
    store.edit(`Smazání „${o.name}“`, (d) => {
      d.objects = d.objects.filter((x) => x.id !== s.id);
      for (const z of d.zones) for (const r of Object.keys(z.objectRoles)) z.objectRoles[r] = z.objectRoles[r].filter((id) => id !== s.id);
      for (const n of d.nav.nodes) if (n.stop?.look.objectId === s.id) n.stop.look = { mode: 'none' };
    });
  } else if (s.kind === 'point') {
    store.edit('Smazání interakčního bodu', (d) => { const o = d.objects.find((x) => x.id === s.id); if (o?.interaction) o.interaction.points = o.interaction.points.filter((pt) => pt.id !== s.pointId); });
  } else if (s.kind === 'node') {
    store.edit('Smazání bodu trasy', (d) => removeNode(d, s.id));
  } else if (s.kind === 'edge') {
    store.edit('Smazání spojení', (d) => { d.nav.edges = d.nav.edges.filter((e) => e.id !== s.id); });
  } else if (s.kind === 'area') store.edit('Smazání oblasti', (d) => { d.areas = d.areas.filter((a) => a.id !== s.id); });
  else if (s.kind === 'zone') store.edit('Smazání zóny', (d) => { d.zones = d.zones.filter((z) => z.id !== s.id); for (const e of d.schedule) if (e.zoneId === s.id) e.zoneId = null; });
  else if (s.kind === 'character') store.edit('Smazání postavy', (d) => { d.characters = d.characters.filter((c) => c.id !== s.id); for (const e of d.schedule) if (e.characterId === s.id) e.characterId = null; });
  else if (s.kind === 'event') store.edit('Smazání události', (d) => { d.schedule = d.schedule.filter((e) => e.id !== s.id); });
  store.set({ selection: null });
}

function removeNode(d: ProjectFile, id: string) {
  d.nav.nodes = d.nav.nodes.filter((n) => n.id !== id);
  d.nav.edges = d.nav.edges.filter((e) => e.a !== id && e.b !== id);
  for (const n of d.nav.nodes) if (n.stop) n.stop.next = n.stop.next.filter((x) => x.nodeId !== id);
  for (const o of d.objects) for (const pt of o.interaction?.points ?? []) if (pt.navNodeId === id) delete pt.navNodeId;
  for (const c of d.characters) if (c.startNodeId === id) c.startNodeId = d.nav.nodes[0]?.id ?? '';
}

export function duplicateSelection() {
  const s = store.state.selection; if (!s) return;
  const p = P();
  if (s.kind === 'object') {
    const o = p.objects.find((x) => x.id === s.id); if (!o) return;
    const id = newId('obj');
    store.edit(`Duplikace „${o.name}“`, (d) => { d.objects.push({ ...structuredClone(o), id, name: o.name + ' (kopie)', x: o.x + 40, y: o.y + 20, locked: false }); });
    store.set({ selection: { kind: 'object', id } });
  } else if (s.kind === 'character') {
    const c = p.characters.find((x) => x.id === s.id); if (!c) return;
    const id = newId('ch');
    store.edit(`Duplikace „${c.name}“`, (d) => { d.characters.push({ ...structuredClone(c), id, name: c.name + ' 2' }); });
    store.set({ selection: { kind: 'character', id } });
  } else if (s.kind === 'area' || s.kind === 'zone') {
    const id = newId(s.kind);
    store.edit('Duplikace', (d) => {
      if (s.kind === 'area') { const a = d.areas.find((x) => x.id === s.id)!; d.areas.push({ ...structuredClone(a), id, name: a.name + ' (kopie)', polygon: a.polygon.map((q) => ({ x: q.x + 30, y: q.y + 30 })) }); }
      else { const z = d.zones.find((x) => x.id === s.id)!; d.zones.push({ ...structuredClone(z), id, name: z.name + ' (kopie)', bounds: z.bounds.map((q) => ({ x: q.x + 30, y: q.y + 30 })) }); }
    });
    store.set({ selection: { kind: s.kind, id } });
  }
}

export function addNode(x: number, y: number, connectFrom: string | null): string {
  const id = newId('n');
  store.edit('Přidání bodu trasy', (d) => {
    const n: NavNode = { id, x: Math.round(x), y: Math.round(y), name: `Bod ${d.nav.nodes.length + 1}` };
    d.nav.nodes.push(n);
    if (connectFrom && d.nav.nodes.some((q) => q.id === connectFrom)) d.nav.edges.push({ id: newId('e'), a: connectFrom, b: id, oneWay: false, narrow: false });
  });
  return id;
}

export function connectNodes(a: string, b: string) {
  if (a === b) return;
  const p = P();
  if (p.nav.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) { store.toast('info', 'Body už jsou spojené.', 1500); return; }
  store.edit('Spojení bodů', (d) => { d.nav.edges.push({ id: newId('e'), a, b, oneWay: false, narrow: false }); });
}

export function addArea(kind: Area['kind'], poly: Vec2[]) {
  if (poly.length < 3) { store.toast('warn', 'Oblast potřebuje alespoň 3 body.'); return; }
  const id = newId('area');
  store.edit(kind === 'obstacle' ? 'Přidání překážky' : 'Přidání plochy sněhu', (d) => {
    d.areas.push({ id, name: kind === 'obstacle' ? `Překážka ${d.areas.filter((a) => a.kind === 'obstacle').length + 1}` : `Sníh ${d.areas.filter((a) => a.kind === 'snow').length + 1}`, kind, polygon: poly.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })) });
  });
  store.set({ selection: { kind: 'area', id }, drawing: [] });
}

export function addZone(type: string, a: Vec2, b: Vec2) {
  const runner = getActivity(type);
  if (!runner) return;
  const def = runner.definition;
  if (def.status !== 'implemented') { store.toast('warn', `Činnost „${def.label}“ zatím není implementována.`); return; }
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  if (x1 - x0 < 30 || y1 - y0 < 30) { store.toast('warn', 'Táhněte myší pro vymezení prostoru zóny.'); return; }
  const bounds = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
  const id = newId('zone');
  const p = P();
  // Automaticky přiřadí objekty uvnitř prostoru do rolí podle druhu interakce.
  const roles: Record<string, string[]> = {};
  for (const req of def.requiredObjects) roles[req.role] = p.objects.filter((o) => o.interaction && req.interactionKinds.includes(o.interaction.kind) && pointInPolygon(o, bounds)).map((o) => o.id);
  store.edit(`Přidání zóny „${def.label}“`, (d) => {
    const z: ActivityZone = { id, name: `${def.label} ${d.zones.length + 1}`, activityType: type, activityVersion: def.version, enabled: true, bounds, objectRoles: roles, params: {} };
    d.zones.push(z);
  });
  store.set({ selection: { kind: 'zone', id }, tool: 'select' });
}

export function addCharacter(x: number, y: number) {
  const p = P();
  if (!p.nav.nodes.length) { store.toast('warn', 'Nejdřív nakreslete trasu – postava začíná v bodě trasy.'); return; }
  const charAsset = p.assets.find((a) => a.kind === 'character');
  if (!charAsset) { store.toast('error', 'Projekt nemá manifest postavy.'); return; }
  const node = p.nav.nodes.reduce((b, n) => (dist(n, { x, y }) < dist(b, { x, y }) ? n : b));
  const id = newId('ch');
  const palettes: CharacterInstance['palette'][] = [
    { coat: '#c8553d', hat: '#f2c14e', scarf: '#f7f3e3', skin: '#f1c9a5', trousers: '#3b4a6b' },
    { coat: '#6a8fbf', hat: '#e07a8f', scarf: '#f2c14e', skin: '#e8b98f', trousers: '#4a3b4b' },
    { coat: '#5d8f6e', hat: '#c8553d', scarf: '#e9e1cf', skin: '#d9a982', trousers: '#2f2f3f' },
    { coat: '#9a6fb0', hat: '#8fc1d4', scarf: '#f4d06f', skin: '#c99272', trousers: '#33384d' },
  ];
  store.edit('Vložení postavy', (d) => {
    d.characters.push({
      id, name: `Postava ${d.characters.length + 1}`, assetId: charAsset.id, startNodeId: node.id, baseScale: 1, walkSpeed: 62,
      palette: palettes[d.characters.length % palettes.length], wander: true,
      activities: { coffee: { enabled: true, firstDelayMin: 5, firstDelayMax: 20, intervalMin: 60, intervalMax: 120 } },
    });
  });
  store.set({ selection: { kind: 'character', id }, tool: 'select' });
}

export function addEvent() {
  const p = P();
  const id = newId('ev');
  const t = Math.round(store.sim.time() + 10);
  store.edit('Přidání plánované události', (d) => {
    const ev: ScheduledEvent = { id, name: `Událost ${d.schedule.length + 1}`, time: t, activityType: 'coffee', characterId: p.characters[0]?.id ?? null, zoneId: p.zones[0]?.id ?? null, onUnavailable: 'wait', waitLimit: 30 };
    d.schedule.push(ev);
  });
  store.set({ selection: { kind: 'event', id } });
}

export async function importAssets(kind: 'image' | 'audio') {
  const dir = store.state.dir; if (!dir) return;
  try {
    const entries = await zs().importAssets(dir, kind);
    if (!entries.length) return;
    store.edit(kind === 'image' ? 'Import obrázků' : 'Import hudby', (d) => {
      for (const e of entries) if (!d.assets.some((a) => a.id === e.id)) d.assets.push(e);
      if (kind === 'audio' && entries[0]) d.export.audioAssetId = entries[0].id;
    });
    store.toast('info', kind === 'image' ? `Importováno obrázků: ${entries.length} (zkopírováno do projektu).` : `Hudba „${entries[0].name}“ importována (${Math.round(entries[0].durationSec ?? 0)} s).`);
  } catch (e) { store.toast('error', (e as Error).message); }
}

/** Ladění odklízení: jeden pracovní cyklus / reset testovací situace (mění jen náhledovou simulaci). */
export function clearingCommand(kind: 'cycle' | 'reset') {
  const sim = store.sim.sim, cfg = store.state.project?.clearing;
  if (!sim || !cfg) return;
  const st = (sim.state.clearing ??= newClearingState(0)), now = sim.time();
  if (kind === 'reset') { resetClearing(st, cfg, now); st.until = now + 1e9; const w = sim.state.agents.find((a) => a.id === cfg.workerId); if (w) { w.hidden = true; w.route = null; w.anim.tool = null; } }
  else if (st.phase === 'offstage' || st.phase === 'hold') { st.single = true; st.until = now; }
  store.toast('info', kind === 'reset' ? 'Sníh obnoven, postava mimo scénu.' : 'Spuštěn jeden pracovní cyklus.', 2000);
}
