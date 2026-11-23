import { contextBridge, ipcRenderer } from 'electron';

const invoke = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args).then((r: { ok: boolean; value?: unknown; error?: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
});

const api = {
  newProject: () => invoke('project:new'),
  openProject: (dir?: string) => invoke('project:open', dir),
  openDemo: (which?: string) => invoke('project:openDemo', which),
  saveProject: (dir: string, project: unknown) => invoke('project:save', dir, project),
  saveProjectAs: (fromDir: string, project: unknown) => invoke('project:saveAs', fromDir, project),
  readAsset: (dir: string, rel: string) => invoke('asset:read', dir, rel),
  importAssets: (dir: string, kind: 'image' | 'audio') => invoke('asset:import', dir, kind),
  listBuiltins: () => invoke('builtin:list'),
  readBuiltin: (file: string) => invoke('builtin:read', file),
  addBuiltin: (dir: string, id: string) => invoke('builtin:add', dir, id),
  loadManifest: (dir: string, asset: unknown) => invoke('character:loadManifest', dir, asset),
  ffmpegInfo: () => invoke('ffmpeg:info'),
  probeAudio: (dir: string, rel: string) => invoke('audio:probe', dir, rel),
  chooseExportPath: (suggested: string) => invoke('export:choosePath', suggested),
  exportInspect: (outputPath: string, jobHash: string) => invoke('export:inspect', outputPath, jobHash),
  exportPrepare: (outputPath: string, projectDir: string, plan: unknown) => invoke('export:prepare', outputPath, projectDir, plan),
  exportSaveCheckpoint: (i: number, state: unknown) => invoke('export:checkpoint', i, state),
  exportBeginChunk: (i: number) => invoke('export:beginChunk', i),
  exportFrame: (buf: Uint8Array) => invoke('export:frame', buf),
  exportEndChunk: (i: number) => invoke('export:endChunk', i),
  exportFinalize: () => invoke('export:finalize'),
  exportAbort: () => invoke('export:abort'),
  showInFolder: (p: string) => invoke('shell:show', p),
  setTitle: (t: string) => invoke('window:title', t),
  memory: () => invoke('app:memory'),
  onBeforeClose: (cb: () => void) => { ipcRenderer.on('app:beforeClose', cb); },
  confirmClose: () => ipcRenderer.send('app:closeConfirmed'),
  startupProject: () => invoke('app:startupProject'),
};
contextBridge.exposeInMainWorld('zs', api);
export type ZsApi = typeof api;
