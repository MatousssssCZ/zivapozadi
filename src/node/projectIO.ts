import { promises as fs, constants as fsc } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AssetEntry, ProjectFile } from '../core/model/types';
import { migrateProject, validateProject, ProjectFormatError, type ValidationIssue } from '../core/model/validate';
import type { CharacterManifest } from '../core/anim/manifest';
import { readImageInfo, IMAGE_EXTS, AUDIO_EXTS } from './imageInfo';
import { APP_VERSION } from '../core/model/defaults';

export const PROJECT_FILE = 'project.json';
export const PROJECT_EXT = '.zscena';

export interface LoadedProject {
  dir: string;
  project: ProjectFile;
  manifests: Record<string, CharacterManifest>;
  issues: ValidationIssue[];
  missingAssets: string[];
}

export class ProjectIOError extends Error {
  constructor(message: string, public issues: ValidationIssue[] = []) { super(message); this.name = 'ProjectIOError'; }
}

async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

/** Bezpečný zápis: dočasný soubor → fsync → záloha předchozí verze → atomické přejmenování. */
export async function writeFileAtomic(file: string, data: string | Buffer): Promise<void> {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const fh = await fs.open(tmp, 'w');
  try { await fh.writeFile(data); await fh.sync(); } finally { await fh.close(); }
  try { await fs.rename(tmp, file); }
  catch (e) { await fs.rm(tmp, { force: true }); throw e; }
}

export async function saveProject(dir: string, project: ProjectFile): Promise<void> {
  const issues = validateProject(project).filter((i) => i.level === 'error');
  if (issues.length) throw new ProjectIOError('Projekt obsahuje chyby a nelze ho uložit: ' + issues.map((i) => i.message).join(' '), issues);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, PROJECT_FILE);
  project.meta.modifiedAt = new Date().toISOString();
  project.meta.appVersion = APP_VERSION;
  if (await exists(file)) await fs.copyFile(file, path.join(dir, PROJECT_FILE + '.bak'));
  await writeFileAtomic(file, JSON.stringify(project, null, 2));
}

export async function createProjectDir(dir: string): Promise<void> {
  if (await exists(path.join(dir, PROJECT_FILE))) throw new ProjectIOError(`Ve složce ${dir} už projekt existuje.`);
  for (const sub of ['assets/images', 'assets/audio', 'assets/characters']) await fs.mkdir(path.join(dir, sub), { recursive: true });
}

export function resolveInside(dir: string, rel: string): string {
  const full = path.resolve(dir, rel);
  const root = path.resolve(dir) + path.sep;
  if (!full.startsWith(root)) throw new ProjectIOError(`Cesta „${rel}“ vede mimo projektovou složku.`);
  return full;
}

export async function loadProject(dir: string): Promise<LoadedProject> {
  const file = path.join(dir, PROJECT_FILE);
  let text: string;
  try { text = await fs.readFile(file, 'utf8'); }
  catch { throw new ProjectIOError(`Složka „${dir}“ neobsahuje soubor projektu ${PROJECT_FILE}.`); }
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch (e) { throw new ProjectIOError(`Soubor projektu je poškozený (neplatný JSON): ${(e as Error).message}. Záloha předchozí verze: ${PROJECT_FILE}.bak`); }
  let project: ProjectFile;
  try { project = migrateProject(raw); }
  catch (e) { if (e instanceof ProjectFormatError) throw new ProjectIOError(e.message, e.issues); throw e; }
  const issues = validateProject(project);
  if (issues.some((i) => i.level === 'error')) throw new ProjectIOError('Projekt nelze otevřít:\n' + issues.filter((i) => i.level === 'error').map((i) => `• ${i.message}`).join('\n'), issues);

  const missingAssets: string[] = [];
  const manifests: Record<string, CharacterManifest> = {};
  for (const a of project.assets) {
    let full: string;
    try { full = resolveInside(dir, a.file); } catch (e) { issues.push({ level: 'error', path: a.id, message: (e as Error).message }); missingAssets.push(a.id); continue; }
    if (!(await exists(full))) {
      missingAssets.push(a.id);
      issues.push({ level: 'warning', path: a.id, message: `Chybí soubor assetu „${a.name}“ (${a.file}). Objekty se zobrazí jako zástupný obdélník.` });
      continue;
    }
    if (a.kind === 'character') {
      try {
        const m = JSON.parse(await fs.readFile(full, 'utf8')) as CharacterManifest;
        if (m.format !== 'zimni-scena-postava') throw new Error('neznámý formát manifestu');
        if (m.formatVersion !== 1) throw new Error(`nepodporovaná verze manifestu ${m.formatVersion}`);
        if (!m.clips || !m.directions?.length) throw new Error('manifest nemá klipy nebo směry');
        if (m.backend !== 'procedural-test-figure') issues.push({ level: 'warning', path: a.id, message: `Postava „${a.name}“ používá backend „${m.backend}“, který v této verzi není implementován – zobrazí se zástupný tvar.` });
        manifests[a.id] = m;
      } catch (e) {
        missingAssets.push(a.id);
        issues.push({ level: 'warning', path: a.id, message: `Manifest postavy „${a.name}“ je neplatný: ${(e as Error).message}. Postavy s ním nebudou v simulaci.` });
      }
    } else if (a.kind === 'image') {
      const head = Buffer.alloc(64 * 1024);
      const fh = await fs.open(full, 'r');
      try { await fh.read(head, 0, head.length, 0); } finally { await fh.close(); }
      if (!readImageInfo(head)) { missingAssets.push(a.id); issues.push({ level: 'warning', path: a.id, message: `Soubor „${a.file}“ není podporovaný obrázek (PNG, JPEG, WebP).` }); }
    }
  }
  return { dir, project, manifests, issues, missingAssets };
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset';
}

/** Zkopíruje podklad do spravované projektové složky a vrátí položku assetu. */
export async function importAssetFile(dir: string, src: string, kindHint?: 'image' | 'audio' | 'character'): Promise<AssetEntry> {
  const ext = path.extname(src).toLowerCase();
  const kind = kindHint ?? (IMAGE_EXTS.includes(ext) ? 'image' : AUDIO_EXTS.includes(ext) ? 'audio' : ext === '.json' ? 'character' : null);
  if (!kind) throw new ProjectIOError(`Nepodporovaný typ souboru „${ext}“. Podporované obrázky: ${IMAGE_EXTS.join(', ')}; zvuk: ${AUDIO_EXTS.join(', ')}.`);
  let buf: Buffer;
  try { buf = await fs.readFile(src); } catch (e) { throw new ProjectIOError(`Soubor nelze přečíst: ${src} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}).`); }
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  const base = slug(path.basename(src, ext));
  const sub = kind === 'image' ? 'images' : kind === 'audio' ? 'audio' : 'characters';
  const rel = `assets/${sub}/${base}-${hash}${ext}`;
  const dest = resolveInside(dir, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (!(await exists(dest))) await fs.writeFile(dest, buf);
  const entry: AssetEntry = { id: `asset_${kind}_${base}_${hash}`, kind, name: path.basename(src, ext), file: rel };
  if (kind === 'image') {
    const info = readImageInfo(buf);
    if (!info) { await fs.rm(dest, { force: true }); throw new ProjectIOError(`Soubor „${path.basename(src)}“ není platný obrázek PNG/JPEG/WebP.`); }
    entry.width = info.width; entry.height = info.height; entry.anchor = { x: 0.5, y: 1 };
    entry.pixelScale = info.width > 2400 ? 0.5 : 1;
  }
  return entry;
}

export async function readProjectFile(dir: string, rel: string): Promise<Buffer> { return fs.readFile(resolveInside(dir, rel)); }

/** Ověří, že lze zapisovat do složky. */
export async function checkWritableDir(d: string): Promise<string | null> {
  try { const st = await fs.stat(d); if (!st.isDirectory()) return `„${d}“ není složka.`; }
  catch { return `Složka „${d}“ neexistuje.`; }
  try { await fs.access(d, fsc.W_OK); } catch { return `Do složky „${d}“ nelze zapisovat (oprávnění).`; }
  return null;
}

/** Zkopíruje celý projekt (Uložit jako / přenos). */
export async function copyProjectDir(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  await fs.cp(path.join(from, 'assets'), path.join(to, 'assets'), { recursive: true, force: true });
}
