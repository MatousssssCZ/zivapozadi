import { PROJECT_FORMAT, PROJECT_FORMAT_VERSION, type ProjectFile } from './types';
import { defaultExportSettings } from './defaults';

export interface ValidationIssue { level: 'error' | 'warning'; path: string; message: string }

export class ProjectFormatError extends Error {
  constructor(message: string, public issues: ValidationIssue[] = []) { super(message); this.name = 'ProjectFormatError'; }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

/**
 * Migrace starších verzí formátu na aktuální. Novější verze se odmítne srozumitelnou chybou.
 */
export function migrateProject(raw: unknown): ProjectFile {
  if (!isObj(raw)) throw new ProjectFormatError('Soubor projektu neobsahuje objekt JSON.');
  if (raw.format !== PROJECT_FORMAT) throw new ProjectFormatError('Soubor není projekt Zimní scény (chybí označení formátu).');
  const ver = raw.formatVersion;
  if (!isNum(ver)) throw new ProjectFormatError('Projekt nemá platnou verzi datového formátu.');
  if (ver > PROJECT_FORMAT_VERSION)
    throw new ProjectFormatError(`Projekt používá novější formát (verze ${ver}); tato aplikace podporuje nejvýše verzi ${PROJECT_FORMAT_VERSION}. Aktualizujte aplikaci.`);
  // Verze 1 je první. Budoucí migrace: if (ver === 1) { ...; raw.formatVersion = 2 }
  const p = raw as unknown as ProjectFile;
  // Doplnění chybějících nepovinných položek (tolerance ke ručně upraveným souborům).
  p.export = { ...defaultExportSettings(), ...(isObj(p.export) ? p.export : {}) };
  p.schedule ??= []; p.zones ??= []; p.areas ??= []; p.characters ??= []; p.objects ??= []; p.assets ??= [];
  p.nav ??= { nodes: [], edges: [] };
  return p;
}

/** Strukturální a referenční validace. Chyby brání otevření, varování se zobrazí uživateli. */
export function validateProject(p: ProjectFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  if (!isNum(p.seed)) err('seed', 'Seed projektu musí být číslo.');
  if (!isObj(p.scene) || !isNum(p.scene.width) || !isNum(p.scene.height) || p.scene.width <= 0 || p.scene.height <= 0)
    err('scene', 'Neplatné rozměry scény.');
  for (const k of ['assets', 'objects', 'areas', 'zones', 'characters', 'schedule'] as const)
    if (!Array.isArray(p[k])) err(k, `Položka „${k}“ musí být seznam.`);
  if (!isObj(p.nav) || !Array.isArray(p.nav.nodes) || !Array.isArray(p.nav.edges)) err('nav', 'Síť tras je poškozená.');
  if (issues.some((i) => i.level === 'error')) return issues;

  const ids = new Set<string>();
  const uniq = (id: unknown, path: string) => {
    if (!isStr(id) || !id) { err(path, 'Chybí ID.'); return; }
    if (ids.has(id)) err(path, `Duplicitní ID „${id}“.`);
    ids.add(id);
  };
  const assetIds = new Set<string>();
  p.assets.forEach((a, i) => {
    uniq(a.id, `assets[${i}]`); assetIds.add(a.id);
    if (!['image', 'character', 'audio'].includes(a.kind)) err(`assets[${i}]`, `Nepodporovaný typ assetu „${a.kind}“.`);
    if (!isStr(a.file) || !a.file) err(`assets[${i}]`, `Asset „${a.name}“ nemá soubor.`);
    else if (a.file.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(a.file) || a.file.split(/[\\/]/).includes('..'))
      err(`assets[${i}]`, `Asset „${a.name}“ odkazuje mimo projektovou složku (${a.file}).`);
  });
  const objIds = new Set<string>();
  p.objects.forEach((o, i) => {
    uniq(o.id, `objects[${i}]`); objIds.add(o.id);
    if (!assetIds.has(o.assetId)) err(`objects[${i}]`, `Objekt „${o.name}“ odkazuje na neexistující asset „${o.assetId}“.`);
    if (!isNum(o.x) || !isNum(o.y) || !isNum(o.scale) || o.scale <= 0) err(`objects[${i}]`, `Objekt „${o.name}“ má neplatnou polohu nebo měřítko.`);
    if (!['background', 'world', 'foreground'].includes(o.layer)) err(`objects[${i}]`, `Objekt „${o.name}“ má neznámou vrstvu.`);
  });
  const nodeIds = new Set<string>();
  p.nav.nodes.forEach((n, i) => { uniq(n.id, `nav.nodes[${i}]`); nodeIds.add(n.id); if (!isNum(n.x) || !isNum(n.y)) err(`nav.nodes[${i}]`, 'Bod trasy má neplatnou polohu.'); });
  p.nav.edges.forEach((e, i) => {
    uniq(e.id, `nav.edges[${i}]`);
    if (!nodeIds.has(e.a) || !nodeIds.has(e.b)) err(`nav.edges[${i}]`, 'Spojení trasy odkazuje na neexistující bod.');
    if (e.a === e.b) warn(`nav.edges[${i}]`, 'Spojení trasy vede do stejného bodu.');
  });
  p.nav.nodes.forEach((n, i) => n.stop?.next.forEach((nx) => { if (!nodeIds.has(nx.nodeId)) warn(`nav.nodes[${i}].stop`, `Zastávka „${n.name ?? n.id}“ odkazuje na neexistující pokračování.`); }));
  p.areas.forEach((a, i) => { uniq(a.id, `areas[${i}]`); if (!Array.isArray(a.polygon) || a.polygon.length < 3) warn(`areas[${i}]`, `Oblast „${a.name}“ má méně než 3 body a bude ignorována.`); });
  p.zones.forEach((z, i) => {
    uniq(z.id, `zones[${i}]`);
    for (const [role, list] of Object.entries(z.objectRoles ?? {}))
      for (const oid of list) if (!objIds.has(oid)) warn(`zones[${i}]`, `Zóna „${z.name}“: objekt role „${role}“ (${oid}) neexistuje.`);
  });
  p.characters.forEach((c, i) => {
    uniq(c.id, `characters[${i}]`);
    if (!assetIds.has(c.assetId)) err(`characters[${i}]`, `Postava „${c.name}“ odkazuje na neexistující manifest „${c.assetId}“.`);
    if (!nodeIds.has(c.startNodeId)) warn(`characters[${i}]`, `Postava „${c.name}“ nemá platný počáteční bod trasy.`);
  });
  const charIds = new Set(p.characters.map((c) => c.id));
  p.schedule.forEach((s, i) => {
    uniq(s.id, `schedule[${i}]`);
    if (s.characterId && !charIds.has(s.characterId)) warn(`schedule[${i}]`, `Událost „${s.name}“ odkazuje na neexistující postavu.`);
    if (!isNum(s.time) || s.time < 0) err(`schedule[${i}]`, `Událost „${s.name}“ má neplatný čas.`);
  });
  if (p.export.audioAssetId && !assetIds.has(p.export.audioAssetId)) warn('export', 'Vybraný hudební soubor není v projektu.');
  return issues;
}
