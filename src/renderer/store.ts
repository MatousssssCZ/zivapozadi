import { useSyncExternalStore } from 'react';
import type { ProjectFile, AssetEntry } from '../core/model/types';
import type { CharacterManifest } from '../core/anim/manifest';
import type { ValidationIssue } from '../core/model/validate';
import { SimController } from './simController';
import { ImageCache } from './images';
import { zs, type OpenResult } from './api';

export type Tool = 'select' | 'action' | 'smoke' | 'route' | 'obstacle' | 'snow' | 'zone' | 'character' | 'pan';
export type Selection =
  | { kind: 'object' | 'node' | 'edge' | 'area' | 'zone' | 'character' | 'event'; id: string }
  | { kind: 'point'; id: string; pointId: string }
  | null;

export interface Toast { id: number; level: 'info' | 'warn' | 'error'; text: string }

export interface EditorState {
  dir: string | null;
  project: ProjectFile | null;
  manifests: Record<string, CharacterManifest>;
  issues: ValidationIssue[];
  missingAssets: string[];
  selection: Selection;
  tool: Tool;
  routeActiveNode: string | null;
  drawing: { x: number; y: number }[];
  zoneType: string;
  showMarkers: boolean;
  dirty: boolean;
  toasts: Toast[];
  builtins: AssetEntry[];
  canUndo: boolean;
  canRedo: boolean;
  exportOpen: boolean;
  exporting: boolean;
  rigDiagnostics: boolean;
  clearingDebug: boolean;
  gaitDebug: boolean;
  fallDebug: boolean;
  snowmanDebug: boolean;
  rinkDebug: boolean;
  /** otevřená nabídka akcí na místě ve scéně */
  actionMenu: import('./canvas/ActionMenu').ActionMenuState | null;
  /** galerie aktivit (sandbox) */ galleryOpen: boolean; galleryId: string | null;
  /** otevřené potvrzení smazání v sandboxu */ confirmDelete: boolean;
  /** laboratoř postav (vývojový náhled vektorových postav) */ labOpen: boolean;
  /** vektorové postavy ve scénách */ vectorFigures: boolean;
  /** otevřená ukázková scéna (galerie ví, zda ji musí načíst) */ sceneKey: string | null;
  /** požadavek na zaměření kamery: obdélník scény a/nebo sledovaná postava; n = pořadí požadavku */
  focus: { rect?: { x: number; y: number; w: number; h: number } | null; agentId?: string | null; n: number } | null;
}

const initial: EditorState = {
  dir: null, project: null, manifests: {}, issues: [], missingAssets: [], selection: null, tool: 'select', routeActiveNode: null,
  drawing: [], zoneType: 'coffee', showMarkers: true, dirty: false, toasts: [], builtins: [], canUndo: false, canRedo: false,
  exportOpen: false, exporting: false, rigDiagnostics: false, clearingDebug: false, gaitDebug: false, fallDebug: false, snowmanDebug: false, rinkDebug: false, actionMenu: null,
  galleryOpen: false, galleryId: null, confirmDelete: false, labOpen: false, vectorFigures: false, sceneKey: null, focus: null,
};

const HISTORY_LIMIT = 200;

class Store {
  state: EditorState = initial;
  readonly sim = new SimController();
  readonly images = new ImageCache();
  private listeners = new Set<() => void>();
  private undo: { project: ProjectFile; label: string }[] = [];
  private redo: { project: ProjectFile; label: string }[] = [];
  private gestureBase: ProjectFile | null = null;
  private toastId = 0;

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  set(p: Partial<EditorState>) {
    this.state = { ...this.state, ...p, canUndo: this.undo.length > 0, canRedo: this.redo.length > 0 };
    for (const l of this.listeners) l();
    if ('dirty' in p || 'project' in p || 'dir' in p) this.updateTitle();
  }
  private updateTitle() {
    const s = this.state;
    if (!s.project) { zs()?.setTitle('Zimní scéna'); return; }
    zs()?.setTitle(`${s.dirty ? '● ' : ''}${s.project.meta.name} – Zimní scéna`);
  }

  toast(level: Toast['level'], text: string, ms = 5000) {
    const t = { id: ++this.toastId, level, text };
    this.set({ toasts: [...this.state.toasts, t] });
    setTimeout(() => this.set({ toasts: this.state.toasts.filter((x) => x.id !== t.id) }), level === 'error' ? Math.max(ms, 9000) : ms);
  }

  // ---------------------------------------------------------------- projekt
  async load(r: OpenResult) {
    this.undo = []; this.redo = [];
    this.images.clear();
    this.set({ dir: r.dir, project: r.project, manifests: r.manifests, issues: r.issues, missingAssets: r.missingAssets, selection: null, dirty: false, drawing: [], routeActiveNode: null });
    this.sim.pause();
    this.sim.restart(r.project, r.manifests);
    this.images.onChange = () => this.set({});
    await this.images.sync(r.dir, r.project, r.missingAssets, r.manifests);
    for (const i of r.issues.filter((x) => x.level === 'warning').slice(0, 4)) this.toast('warn', i.message, 9000);
    // nedávné scény (úvodní menu): jméno + složka, nejnovější první
    try {
      const list = (JSON.parse(localStorage.getItem('zs-recent') ?? '[]') as { dir: string; name: string; t: number }[]).filter((x) => x.dir !== r.dir);
      list.unshift({ dir: r.dir, name: r.project.meta.name, t: Date.now() });
      localStorage.setItem('zs-recent', JSON.stringify(list.slice(0, 10)));
    } catch { /* soukromý režim */ }
  }

  /** Zavře projekt a vrátí se do úvodního menu (neuložené změny potvrdí volající). */
  closeProject() {
    this.sim.pause();
    this.set({ dir: null, project: null, manifests: {}, issues: [], missingAssets: [], selection: null, dirty: false, sceneKey: null, focus: null, galleryId: null, actionMenu: null });
    this.undo = []; this.redo = [];
  }

  /** Doplní/aktualizuje manifest postavy (např. po přidání knihovny malovaných dílů). */
  async addManifest(assetId: string, m: CharacterManifest) {
    const manifests = { ...this.state.manifests, [assetId]: m };
    this.set({ manifests });
    if (this.state.dir && this.state.project) { await this.images.sync(this.state.dir, this.state.project, this.state.missingAssets, manifests); this.sim.rebuild(this.state.project, manifests, true); }
  }

  private applyProject(next: ProjectFile, rebuildSim = true) {
    this.set({ project: next, dirty: true });
    if (rebuildSim) this.sim.rebuild(next, this.state.manifests, true);
    if (this.state.dir) this.images.sync(this.state.dir, next, this.state.missingAssets, this.state.manifests);
  }

  /** Editační příkaz s historií zpět/vpřed. */
  edit(label: string, fn: (p: ProjectFile) => void) {
    const cur = this.state.project;
    if (!cur) return;
    const next = structuredClone(cur);
    fn(next);
    this.undo.push({ project: cur, label }); if (this.undo.length > HISTORY_LIMIT) this.undo.shift();
    this.redo = [];
    this.applyProject(next);
  }

  /** Úprava bez přestavění simulace (hustota davu, zdroje kouře): historie zpět/vpřed, simulace dostane změnu za běhu. */
  editLive(label: string, fn: (p: ProjectFile) => void) {
    const cur = this.state.project; if (!cur) return;
    const next = structuredClone(cur); fn(next);
    // do historie samostatná kopie: běžící simulace může sdílet objekt `cur` a patchProject ho mění
    this.undo.push({ project: structuredClone(cur), label }); if (this.undo.length > HISTORY_LIMIT) this.undo.shift();
    this.redo = [];
    this.applyProject(next, false);
    this.sim.sim?.patchProject(fn);
  }
  /** Průběžná změna během tažení (historie se zapíše až v `endGesture`). */
  beginGesture() { this.gestureBase = this.state.project; }
  live(fn: (p: ProjectFile) => void) {
    const cur = this.state.project; if (!cur) return;
    const next = structuredClone(cur); fn(next);
    const cheap = (this.sim.sim?.state.step ?? 0) === 0;
    this.applyProject(next, cheap);
  }
  endGesture(label: string) {
    const base = this.gestureBase; this.gestureBase = null;
    if (!base || base === this.state.project) return;
    this.undo.push({ project: base, label }); if (this.undo.length > HISTORY_LIMIT) this.undo.shift();
    this.redo = [];
    this.applyProject(this.state.project!);
  }

  undoOp() {
    const e = this.undo.pop(); if (!e || !this.state.project) return;
    this.redo.push({ project: this.state.project, label: e.label });
    this.applyProject(e.project); this.fixSelection();
    this.toast('info', `Zpět: ${e.label}`, 1800);
  }
  redoOp() {
    const e = this.redo.pop(); if (!e || !this.state.project) return;
    this.undo.push({ project: this.state.project, label: e.label });
    this.applyProject(e.project); this.fixSelection();
    this.toast('info', `Vpřed: ${e.label}`, 1800);
  }

  private fixSelection() {
    const s = this.state.selection, p = this.state.project;
    if (!s || !p) return;
    const exists = s.kind === 'object' || s.kind === 'point' ? p.objects.some((o) => o.id === s.id)
      : s.kind === 'node' ? p.nav.nodes.some((n) => n.id === s.id) : s.kind === 'edge' ? p.nav.edges.some((e) => e.id === s.id)
      : s.kind === 'area' ? p.areas.some((a) => a.id === s.id) : s.kind === 'zone' ? p.zones.some((z) => z.id === s.id)
      : s.kind === 'character' ? p.characters.some((c) => c.id === s.id) : p.schedule.some((e) => e.id === s.id);
    if (!exists) this.set({ selection: null });
  }

  async save(): Promise<boolean> {
    const { dir, project } = this.state;
    if (!dir || !project) return false;
    try {
      await zs().saveProject(dir, project);
      this.set({ dirty: false });
      this.toast('info', 'Projekt uložen.', 2000);
      return true;
    } catch (e) { this.toast('error', 'Uložení selhalo: ' + (e as Error).message); return false; }
  }
}

export const store = new Store();
(window as unknown as { __store: Store }).__store = store; // pro automatické testy UI

export function useEditor<T>(sel: (s: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store.state));
}
export function useSimTick(): number {
  return useSyncExternalStore(store.sim.subscribe, () => store.sim.time());
}
