/**
 * Webová verze aplikační vrstvy (ZsApi) – aplikace běží v prohlížeči z odkazu (GitHub Pages),
 * bez instalace. Hotové scény jsou přibalené jako statické soubory (`projekty/<název>.zscena/`),
 * vestavěné podklady v `builtin/`. Úpravy (project.json) a importované soubory se ukládají do
 * IndexedDB prohlížeče – po zavření a znovuotevření odkazu zůstanou zachované.
 * Export videa: WebCodecs (H.264) + MP4 kontejner; výsledek se stáhne jako soubor (bez zvukové stopy).
 */
import type { ZsApi, OpenResult } from './api';
import type { AssetEntry, ProjectFile } from '../core/model/types';
import type { CharacterManifest } from '../core/anim/manifest';
import type { PartLibrary } from '../core/anim/partLibrary';
import type { ValidationIssue } from '../core/model/validate';
import { migrateProject, validateProject } from '../core/model/validate';
import { validateLibrary } from '../core/anim/partLibrary';
import { validateAppearance } from '../core/anim/appearanceGenerator';
import { createEmptyProject } from '../core/model/defaults';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const BASE = new URL('.', document.baseURI).href;
/**
 * Výběr kodéru pro export v prohlížeči: konstantní kvalita (kvantizér odvozený z CRF), klíčový snímek po 10 s.
 * Měřeno na kluzišti (SSIM Y): AV1/VP9 kvantizér 28 ≈ 22,4 dB rovnoměrně, H.264 (OpenH264, pevný tok) 15,4 dB
 * s propadem na 12 dB u každého klíčového snímku.
 */
async function pickWebEncoder(w: number, h: number, fps: number, crf: number, pref: 'av1' | 'h264') {
  type Pick = { label: string; mux: 'av1' | 'vp9' | 'avc'; config: VideoEncoderConfig; perFrame?: Record<string, unknown> };
  const q = Math.max(4, Math.min(55, Math.round(28 + (crf - 20) * 2))), qAvc = Math.max(10, Math.min(45, Math.round(crf + 2)));
  const avcCodec = w * h > 1920 * 1088 ? 'avc1.640033' : 'avc1.640028';
  const cands: Pick[] = [
    { label: `AV1, konstantní kvalita q${q}`, mux: 'av1', config: { codec: w * h > 1920 * 1088 ? 'av01.0.12M.08' : 'av01.0.08M.08', width: w, height: h, framerate: fps, bitrateMode: 'quantizer' } as VideoEncoderConfig, perFrame: { av1: { quantizer: q } } },
    { label: `VP9, konstantní kvalita q${q}`, mux: 'vp9', config: { codec: 'vp09.00.40.08', width: w, height: h, framerate: fps, bitrateMode: 'quantizer' } as VideoEncoderConfig, perFrame: { vp9: { quantizer: q } } },
    { label: `H.264, konstantní kvalita q${qAvc}`, mux: 'avc', config: { codec: avcCodec, width: w, height: h, framerate: fps, bitrateMode: 'quantizer' } as VideoEncoderConfig, perFrame: { avc: { quantizer: qAvc } } },
    { label: 'H.264, vysoký proměnný datový tok', mux: 'avc', config: { codec: avcCodec, width: w, height: h, framerate: fps, bitrate: Math.round(w * h * fps * 0.25), bitrateMode: 'variable', latencyMode: 'quality' } },
  ];
  const order = pref === 'h264' ? cands.slice(2) : cands;
  for (const c of order) { try { if ((await VideoEncoder.isConfigSupported(c.config)).supported) return c; } catch { /* další */ } }
  return cands[3];
}

const DEMOS: Record<string, string> = { namesti: 'Vanocni-namesti', radnice: 'Namesti-radnice', liberec: 'Liberec-zivy-trh', pastel: 'Pastelove-kluziste', pastel2: 'Pastelove-kluziste-2', pastel3: 'Pastelove-kluziste-3', hory: 'Horske-mestecko', ulice: 'Zasnezena-ulice', tram: 'Tramvajova-ulice' };
const DEFAULT_DEMO = 'Liberec-zivy-trh';

// ------------------------------------------------------------------ IndexedDB (klíč → hodnota)
interface ProjRec { project: string; origin: string | null; savedAt: number }
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('zimni-scena', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('projects'); r.result.createObjectStore('files'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
async function idb<T>(store: 'projects' | 'files', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction(store, mode); const rq = fn(tx.objectStore(store)); rq.onsuccess = () => res(rq.result as T); rq.onerror = () => rej(rq.error); });
}
const getProj = (dir: string) => idb<ProjRec | undefined>('projects', 'readonly', (s) => s.get(dir));
const putProj = (dir: string, r: ProjRec) => idb('projects', 'readwrite', (s) => s.put(r, dir));
const listProj = () => idb<IDBValidKey[]>('projects', 'readonly', (s) => s.getAllKeys());
const getFile = (dir: string, rel: string) => idb<Uint8Array | undefined>('files', 'readonly', (s) => s.get(`${dir}|${rel}`));
const putFile = (dir: string, rel: string, b: Uint8Array) => idb('files', 'readwrite', (s) => s.put(b, `${dir}|${rel}`));

// dir = „název“ projektu v prohlížeči; origin = přibalená scéna, ze které se berou neupravené soubory
const originOf = new Map<string, string | null>();
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const r = await fetch(url);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}
const enc = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');

async function readAsset(dir: string, rel: string): Promise<Uint8Array> {
  const own = await getFile(dir, rel);
  if (own) return own;
  const origin = originOf.get(dir) ?? (await getProj(dir))?.origin ?? null;
  if (origin) { const b = await fetchBytes(`${BASE}projekty/${encodeURIComponent(origin)}.zscena/${enc(rel)}`); if (b) return b; }
  // vestavěné podklady (assets/<druh>/<soubor> → builtin/<soubor>)
  const m = /^assets\/(?:images|audio|characters)\/(.+)$/.exec(rel);
  if (m) { const b = await fetchBytes(`${BASE}builtin/${enc(m[1])}`); if (b) return b; }
  throw new Error(`Soubor „${rel}“ nebyl nalezen.`);
}
const readText = async (dir: string, rel: string) => new TextDecoder().decode(await readAsset(dir, rel));

async function loadManifest(dir: string, a: AssetEntry, issues: ValidationIssue[] = []): Promise<CharacterManifest> {
  const m = JSON.parse(await readText(dir, a.file)) as CharacterManifest;
  if (m.format !== 'zimni-scena-postava') throw new Error('neznámý formát manifestu');
  if (m.backend === 'skeleton') {
    if (!m.rig?.library) throw new Error('chybí odkaz na knihovnu dílů (rig.library)');
    const libDir = a.file.split('/').slice(0, -1).join('/');
    const libRel = [libDir, m.rig.library].filter(Boolean).join('/').replace(/\/\.\//g, '/');
    const lib = JSON.parse(await readText(dir, libRel)) as PartLibrary;
    for (const x of validateLibrary(lib)) issues.push({ level: 'warning', path: a.id, message: `Knihovna dílů „${lib.label}“: ${x.message}` });
    m.rigLibrary = lib; m.rigLibraryDir = libRel.split('/').slice(0, -1).join('/');
  }
  return m;
}

async function openDir(dir: string): Promise<OpenResult> {
  const rec = await getProj(dir);
  let text: string;
  if (rec) { text = rec.project; originOf.set(dir, rec.origin); }
  else {
    // přibalená scéna (poprvé): uloží se pod svým názvem, další úpravy jdou do prohlížeče
    const b = await fetchBytes(`${BASE}projekty/${encodeURIComponent(dir)}.zscena/project.json`);
    if (!b) throw new Error(`Projekt „${dir}“ neexistuje.`);
    text = new TextDecoder().decode(b); originOf.set(dir, dir);
    await putProj(dir, { project: text, origin: dir, savedAt: Date.now() });
  }
  const project = migrateProject(JSON.parse(text));
  const issues = validateProject(project);
  if (issues.some((i) => i.level === 'error')) throw new Error('Projekt nelze otevřít:\n' + issues.filter((i) => i.level === 'error').map((i) => `• ${i.message}`).join('\n'));
  const manifests: Record<string, CharacterManifest> = {}, missingAssets: string[] = [];
  for (const a of project.assets) {
    if (a.kind !== 'character') continue;
    try {
      const m = await loadManifest(dir, a, issues);
      if (m.rigLibrary) for (const c of project.characters.filter((c) => c.assetId === a.id)) if (c.appearance) for (const x of validateAppearance(m.rigLibrary, c.appearance)) issues.push({ level: 'warning', path: c.id, message: `Postava „${c.name}“: ${x.message}` });
      manifests[a.id] = m;
    } catch (e) { missingAssets.push(a.id); issues.push({ level: 'warning', path: a.id, message: `Postavu „${a.name}“ nelze načíst: ${(e as Error).message}` }); }
  }
  try { localStorage.setItem('zs-last', dir); } catch { /* (soukromý režim) */ }
  return { dir, project, manifests, issues, missingAssets };
}

/** Výběr uloženého projektu (jednoduchý seznam). */
async function chooseProject(): Promise<string | null> {
  const saved = (await listProj()).map(String);
  const all = [...new Set([...Object.values(DEMOS), ...saved])];
  const txt = all.map((n, i) => `${i + 1}) ${n}${saved.includes(n) ? ' (uloženo)' : ''}`).join('\n');
  const a = window.prompt(`Otevřít projekt – zadejte číslo:\n${txt}`, '1');
  const i = a ? Number(a) - 1 : -1;
  return all[i] ?? null;
}

const pickFiles = (accept: string): Promise<File[]> => new Promise((res) => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = accept;
  inp.onchange = () => res([...(inp.files ?? [])]); inp.click();
});
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset';

// ------------------------------------------------------------------ export (WebCodecs + MP4)
let ex: { muxer: Muxer<ArrayBufferTarget>; encoder: VideoEncoder; w: number; h: number; fps: number; n: number; name: string; err: Error | null; pick: { label: string; perFrame?: Record<string, unknown> } } | null = null;

export function createWebApi(): ZsApi {
  return {
    async deleteProject(d) {
      // prohlížeč: záznam projektu i jeho uložené soubory (u ukázky jen vaše úpravy – přibalené soubory zůstanou)
      await idb('projects', 'readwrite', (s) => s.delete(d));
      const keys = await idb<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys());
      for (const k of keys) if (String(k).startsWith(`${d}|`)) await idb('files', 'readwrite', (s) => s.delete(k));
      try { if (localStorage.getItem('zs-last') === d) localStorage.removeItem('zs-last'); } catch { /* */ }
    },
    async newProject() {
      const name = window.prompt('Název nového projektu:', 'Nová scéna'); if (!name) return null;
      const dir = name.trim();
      if (await getProj(dir)) throw new Error('Projekt s tímto názvem už v prohlížeči existuje.');
      const p: ProjectFile = createEmptyProject(dir, Math.floor(Math.random() * 1e9));
      const lib = JSON.parse(new TextDecoder().decode((await fetchBytes(`${BASE}builtin/builtin.json`))!)) as { assets: AssetEntry[] };
      const fig = lib.assets.find((a) => a.id === 'builtin_postava');
      if (fig) p.assets.push({ ...structuredClone(fig), file: `assets/characters/${fig.file}` });
      await putProj(dir, { project: JSON.stringify(p), origin: null, savedAt: Date.now() });
      return openDir(dir);
    },
    async openProject(dir) { const d = dir ?? (await chooseProject()); return d ? openDir(d) : null; },
    async openDemo(which = 'liberec') { return openDir(DEMOS[which] ?? DEFAULT_DEMO); },
    async saveProject(dir, project) {
      const rec = await getProj(dir);
      project.meta.modifiedAt = new Date().toISOString();
      await putProj(dir, { project: JSON.stringify(project), origin: rec?.origin ?? originOf.get(dir) ?? null, savedAt: Date.now() });
      return project.meta.modifiedAt;
    },
    async saveProjectAs(fromDir, project) {
      const name = window.prompt('Uložit jako – název:', `${fromDir} kopie`); if (!name) return null;
      if (await getProj(name)) throw new Error('Projekt s tímto názvem už existuje.');
      const origin = (await getProj(fromDir))?.origin ?? originOf.get(fromDir) ?? null;
      // importované soubory zkopírovat; přibalené se dál čtou ze stejného zdroje
      for (const a of project.assets) { const b = await getFile(fromDir, a.file); if (b) await putFile(name, a.file, b); }
      await putProj(name, { project: JSON.stringify(project), origin, savedAt: Date.now() }); originOf.set(name, origin);
      return name;
    },
    readAsset,
    async importAssets(dir, kind) {
      const files = await pickFiles(kind === 'image' ? '.png,.jpg,.jpeg,.webp' : 'audio/*');
      const out: AssetEntry[] = [];
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))].slice(0, 4).map((x) => x.toString(16).padStart(2, '0')).join('');
        const ext = (f.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase(), base = slug(f.name.replace(/\.[^.]+$/, ''));
        const rel = `assets/${kind === 'image' ? 'images' : 'audio'}/${base}-${hash}${ext}`;
        await putFile(dir, rel, bytes);
        const e: AssetEntry = { id: `asset_${kind}_${base}_${hash}`, kind, name: f.name.replace(/\.[^.]+$/, ''), file: rel };
        if (kind === 'image') {
          const bm = await createImageBitmap(f);
          e.width = bm.width; e.height = bm.height; e.anchor = { x: 0.5, y: 1 }; e.pixelScale = bm.width > 2400 ? 0.5 : 1; bm.close();
        }
        out.push(e);
      }
      return out;
    },
    async listBuiltins() { const b = await fetchBytes(`${BASE}builtin/builtin.json`); return b ? (JSON.parse(new TextDecoder().decode(b)).assets as AssetEntry[]) : []; },
    async readBuiltin(file) { const f = file.replace(/^assets\/(?:images|audio|characters)\//, ''); const b = await fetchBytes(`${BASE}builtin/${enc(f)}`); if (!b) throw new Error(`Vestavěný soubor ${file} chybí.`); return b; },
    async addBuiltin(_dir, id) {
      const lib = (await this.listBuiltins()).find((a) => a.id === id);
      if (!lib) throw new Error(`Vestavěný asset ${id} neexistuje.`);
      const sub = lib.kind === 'image' ? 'images' : lib.kind === 'audio' ? 'audio' : 'characters';
      return { ...structuredClone(lib), file: `assets/${sub}/${lib.file}` }; // (čte se z builtin/ – viz readAsset)
    },
    loadManifest: (dir, asset) => loadManifest(dir, asset),
    async ffmpegInfo() { return typeof VideoEncoder !== 'undefined' ? { path: 'WebCodecs (prohlížeč)', source: 'prohlížeč', hasX264: true } : null; },
    async probeAudio(dir, rel) {
      try { const b = await readAsset(dir, rel); const ac = new OfflineAudioContext(1, 1, 44100); return (await ac.decodeAudioData(b.slice().buffer)).duration; } catch { return null; }
    },
    async chooseExportPath(suggested) { return suggested; },
    async exportInspect() { return { exists: false }; },
    async exportPrepare(outputPath, _dir, plan) {
      if (typeof VideoEncoder === 'undefined') throw new Error('Tento prohlížeč neumí kódovat video (WebCodecs). Použijte Chrome nebo Edge.');
      const w = plan.width, h = plan.height, fps = plan.fps;
      // Kodér s konstantní kvalitou (bez cyklického rozmazání u klíčových snímků): AV1 → VP9 → H.264.
      // H.264 s pevným datovým tokem (OpenH264 v Chrome) má strop kvality a každé 2 s propad ostrosti.
      const pick = await pickWebEncoder(w, h, fps, plan.crf, plan.webCodec ?? 'av1');
      const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: pick.mux, width: w, height: h, frameRate: fps }, fastStart: 'in-memory' });
      const st = { muxer, encoder: null as unknown as VideoEncoder, w, h, fps, n: 0, name: outputPath.split(/[\\/]/).pop() || 'video.mp4', err: null as Error | null, pick };
      st.encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { st.err = e as Error; } });
      st.encoder.configure(pick.config);
      console.info('Export videa:', pick.label);
      ex = st;
      return { firstChunk: 0, checkpoint: null, discardedStale: false };
    },
    async exportSaveCheckpoint() { /* (v prohlížeči se export nenavazuje) */ },
    async exportBeginChunk() { /* jeden souvislý proud */ },
    async exportFrame(buf) {
      const s = ex!; if (s.err) throw s.err;
      const frame = new VideoFrame(buf, { format: 'RGBA', codedWidth: s.w, codedHeight: s.h, timestamp: Math.round((s.n * 1e6) / s.fps), duration: Math.round(1e6 / s.fps) });
      s.encoder.encode(frame, { keyFrame: s.n % (s.fps * 10) === 0, ...(s.pick.perFrame ?? {}) } as VideoEncoderEncodeOptions); frame.close(); s.n++;
      while (s.encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5));
    },
    async exportCanvasFrame(cv) {
      const s = ex!; if (s.err) throw s.err;
      const frame = new VideoFrame(cv, { timestamp: Math.round((s.n * 1e6) / s.fps), duration: Math.round(1e6 / s.fps) });
      s.encoder.encode(frame, { keyFrame: s.n % (s.fps * 10) === 0, ...(s.pick.perFrame ?? {}) } as VideoEncoderEncodeOptions); frame.close(); s.n++;
      while (s.encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
    },
    async exportEndChunk() { /* */ },
    async exportFinalize() {
      const s = ex!; await s.encoder.flush(); s.muxer.finalize(); s.encoder.close();
      const blob = new Blob([s.muxer.target.buffer], { type: 'video/mp4' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = s.name.endsWith('.mp4') ? s.name : `${s.name}.mp4`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000); ex = null;
      return { outputPath: a.download };
    },
    async exportAbort() { try { ex?.encoder.close(); } catch { /* */ } ex = null; },
    async showInFolder() { /* (stažený soubor je ve složce Stažené soubory) */ },
    async setTitle(t) { document.title = t; },
    async memory() { return { main: 0 }; },
    onBeforeClose() { window.addEventListener('beforeunload', (e) => { if ((window as unknown as { __zsDirty?: () => boolean }).__zsDirty?.()) e.preventDefault(); }); },
    confirmClose() { /* */ },
    // úvodní menu se zobrazí vždy; přímý odkaz na scénu: ?scena=liberec | tram | pastel | radnice | namesti
    async startupProject() { try { const q = new URLSearchParams(location.search).get('scena'); if (q) return DEMOS[q] ?? q; } catch { /* */ } return null; },
  };
}
