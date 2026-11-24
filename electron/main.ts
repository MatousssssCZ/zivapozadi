import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron';
import path from 'node:path';
import { promises as fs, existsSync } from 'node:fs';
import { loadCharacterManifest, loadProject, saveProject, createProjectDir, importAssetFile, readProjectFile, copyProjectDir, PROJECT_EXT, ProjectIOError } from '../src/node/projectIO';
import { readBuiltinLibrary, copyBuiltinAsset } from '../src/node/builtin';
import { locateFfmpeg, ffmpegHasEncoder, probeDuration } from '../src/node/ffmpeg';
import { NodeEncoderHost } from '../src/node/exportHost';
import { createEmptyProject } from '../src/core/model/defaults';
import type { ProjectFile, AssetEntry } from '../src/core/model/types';
import type { ExportPlan } from '../src/core/export/plan';
import { IMAGE_EXTS, AUDIO_EXTS } from '../src/node/imageInfo';

const isDev = !!process.env.ZIMNI_SCENA_DEV_URL;
const appRoot = app.getAppPath();
const resDir = app.isPackaged ? path.join(process.resourcesPath, 'builtin') : path.join(appRoot, 'resources', 'builtin');
const demoRoot = app.isPackaged ? path.join(process.resourcesPath, 'demo') : path.join(appRoot, 'demo');
const DEMOS: Record<string, string> = { namesti: 'Vanocni-namesti', radnice: 'Namesti-radnice', liberec: 'Liberec-zivy-trh' };

let win: BrowserWindow | null = null;
let encoder: NodeEncoderHost | null = null;
let closeConfirmed = false;

if (process.env.ZIMNI_SCENA_HEADLESS_GPU === '0') app.disableHardwareAcceleration();

function handle(ch: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(ch, async (_e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; }
    catch (e) { return { ok: false, error: (e as Error).message ?? String(e) }; }
  });
}

async function openDir(dir: string) {
  const lp = await loadProject(dir);
  app.addRecentDocument(dir);
  return lp;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1680, height: 1000, minWidth: 1200, minHeight: 720, title: 'Zimní scéna', backgroundColor: '#1d2130',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (isDev) win.loadURL(process.env.ZIMNI_SCENA_DEV_URL!);
  else win.loadFile(path.join(appRoot, 'dist', 'index.html'));
  win.on('close', (e) => {
    if (closeConfirmed) return;
    e.preventDefault();
    win?.webContents.send('app:beforeClose');
  });
}

ipcMain.on('app:closeConfirmed', () => { closeConfirmed = true; win?.close(); });

handle('app:startupProject', () => process.env.ZIMNI_SCENA_OPEN ?? null);
handle('app:memory', () => ({ main: process.memoryUsage().rss }));
handle('window:title', (t: string) => { win?.setTitle(t); });

handle('project:new', async () => {
  const r = await dialog.showSaveDialog(win!, { title: 'Nový projekt – zvolte umístění a název', defaultPath: path.join(app.getPath('documents'), 'Nova-scena' + PROJECT_EXT), buttonLabel: 'Vytvořit projekt' });
  if (r.canceled || !r.filePath) return null;
  const dir = r.filePath.endsWith(PROJECT_EXT) ? r.filePath : r.filePath + PROJECT_EXT;
  await createProjectDir(dir);
  const p: ProjectFile = createEmptyProject(path.basename(dir, PROJECT_EXT), Math.floor(Math.random() * 1e9));
  p.assets.push(await copyBuiltinAsset(resDir, dir, 'builtin_postava'));
  await saveProject(dir, p);
  return openDir(dir);
});

handle('project:open', async (dir?: string) => {
  if (!dir) {
    const r = await dialog.showOpenDialog(win!, { title: 'Otevřít projekt (složka .zscena)', properties: ['openDirectory'], defaultPath: app.getPath('documents') });
    if (r.canceled || !r.filePaths[0]) return null;
    dir = r.filePaths[0];
  }
  return openDir(dir);
});

handle('project:openDemo', async (which: string = 'namesti') => {
  const name = DEMOS[which] ?? DEMOS.namesti;
  const demoSrc = path.join(demoRoot, name + PROJECT_EXT);
  const target = path.join(app.getPath('documents'), 'Zimní scéna', name + PROJECT_EXT);
  if (!existsSync(path.join(target, 'project.json'))) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(demoSrc, target, { recursive: true });
  }
  return openDir(target);
});

handle('project:save', async (dir: string, project: ProjectFile) => { await saveProject(dir, project); return project.meta.modifiedAt; });

handle('project:saveAs', async (fromDir: string, project: ProjectFile) => {
  const r = await dialog.showSaveDialog(win!, { title: 'Uložit projekt jako', defaultPath: fromDir.replace(PROJECT_EXT, '-kopie' + PROJECT_EXT), buttonLabel: 'Uložit' });
  if (r.canceled || !r.filePath) return null;
  const dir = r.filePath.endsWith(PROJECT_EXT) ? r.filePath : r.filePath + PROJECT_EXT;
  if (existsSync(path.join(dir, 'project.json'))) throw new ProjectIOError('V cílové složce už projekt existuje. Zvolte jiný název.');
  await copyProjectDir(fromDir, dir);
  await saveProject(dir, project);
  return dir;
});

handle('asset:read', async (dir: string, rel: string) => new Uint8Array(await readProjectFile(dir, rel)));

handle('asset:import', async (dir: string, kind: 'image' | 'audio') => {
  const exts = (kind === 'image' ? IMAGE_EXTS : AUDIO_EXTS).map((e) => e.slice(1));
  const r = await dialog.showOpenDialog(win!, { title: kind === 'image' ? 'Importovat obrázky' : 'Importovat hudbu', properties: kind === 'image' ? ['openFile', 'multiSelections'] : ['openFile'], filters: [{ name: kind === 'image' ? 'Obrázky' : 'Zvuk', extensions: exts }] });
  if (r.canceled) return [];
  const out = [];
  for (const f of r.filePaths) {
    const entry = await importAssetFile(dir, f, kind);
    if (kind === 'audio') {
      const ff = locateFfmpeg();
      const d = ff ? probeDuration(ff.path, path.join(dir, entry.file)) : null;
      if (!d) throw new ProjectIOError(`Soubor „${path.basename(f)}“ nelze přečíst jako zvuk (FFmpeg nezjistil délku).`);
      entry.durationSec = d;
    }
    out.push(entry);
  }
  return out;
});

handle('builtin:list', async () => (await readBuiltinLibrary(resDir)).assets);
handle('builtin:read', async (file: string) => new Uint8Array(await fs.readFile(path.join(resDir, path.basename(file)))));
handle('builtin:add', async (dir: string, id: string) => copyBuiltinAsset(resDir, dir, id));
handle('character:loadManifest', async (dir: string, asset: AssetEntry) => loadCharacterManifest(dir, asset));

handle('ffmpeg:info', () => {
  const ff = locateFfmpeg();
  if (!ff) return null;
  return { ...ff, hasX264: ffmpegHasEncoder(ff.path, 'libx264') };
});
handle('audio:probe', (dir: string, rel: string) => { const ff = locateFfmpeg(); return ff ? probeDuration(ff.path, path.join(dir, rel)) : null; });

handle('export:choosePath', async (suggested: string) => {
  const r = await dialog.showSaveDialog(win!, { title: 'Exportovat video', defaultPath: path.join(app.getPath('videos'), suggested), filters: [{ name: 'Video MP4', extensions: ['mp4'] }] });
  if (r.canceled || !r.filePath) return null;
  return r.filePath.toLowerCase().endsWith('.mp4') ? r.filePath : r.filePath + '.mp4';
});

handle('export:inspect', async (outputPath: string, jobHash: string) => {
  try {
    const m = JSON.parse(await fs.readFile(path.resolve(outputPath) + '.casti/manifest.json', 'utf8'));
    const done = (m.chunks as { done: boolean }[]).filter((c) => c.done).length;
    return { exists: true, compatible: m.jobHash === jobHash, doneChunks: done, totalChunks: m.chunks.length };
  } catch { return { exists: false }; }
});

handle('export:prepare', async (outputPath: string, projectDir: string, plan: ExportPlan) => {
  const ff = locateFfmpeg();
  if (!ff) throw new Error('FFmpeg nebyl nalezen. Nastavte proměnnou ZIMNI_SCENA_FFMPEG nebo nainstalujte FFmpeg.');
  if (!plan.diagnosticPng && !ffmpegHasEncoder(ff.path, 'libx264')) throw new Error('Nalezený FFmpeg nepodporuje enkodér libx264.');
  encoder = new NodeEncoderHost(ff.path, outputPath, projectDir);
  return encoder.prepare(plan);
});
const enc = () => { if (!encoder) throw new Error('Export není připraven.'); return encoder; };
handle('export:checkpoint', (i: number, st) => enc().saveCheckpoint(i, st));
handle('export:beginChunk', (i: number) => enc().beginChunk(i));
handle('export:frame', (buf: Uint8Array) => enc().writeFrame(buf));
handle('export:endChunk', (i: number) => enc().endChunk(i));
handle('export:finalize', async () => { const r = await enc().finalize(); encoder = null; return r; });
handle('export:abort', async () => { await encoder?.abort(); encoder = null; });
handle('shell:show', (p: string) => shell.showItemInFolder(p));

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: 'Úpravy', submenu: [{ role: 'cut', label: 'Vyjmout' }, { role: 'copy', label: 'Kopírovat' }, { role: 'paste', label: 'Vložit' }] },
    { label: 'Zobrazení', submenu: [{ role: 'reload', label: 'Znovu načíst' }, { role: 'toggleDevTools', label: 'Vývojářské nástroje' }, { role: 'togglefullscreen', label: 'Celá obrazovka' }] },
  ]));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
