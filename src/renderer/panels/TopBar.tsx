import { store, useEditor, type Tool } from '../store';
import { zs } from '../api';
import { importAssets, clearingCommand } from '../ops';

async function guardDirty(): Promise<boolean> {
  if (!store.state.dirty) return true;
  return window.confirm('Projekt má neuložené změny. Opravdu pokračovat bez uložení?');
}

export async function doOpen(kind: 'new' | 'open' | 'demo' | 'demo2' | 'liberec', dir?: string) {
  if (!(await guardDirty())) return;
  try {
    const r = kind === 'new' ? await zs().newProject() : kind === 'demo' ? await zs().openDemo() : kind === 'demo2' ? await zs().openDemo('radnice') : kind === 'liberec' ? await zs().openDemo('liberec') : await zs().openProject(dir);
    if (r) { await store.load(r); store.toast('info', `Otevřen projekt „${r.project.meta.name}“.`, 2500); }
  } catch (e) { store.toast('error', (e as Error).message, 12000); }
}

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Výběr', key: 'V' },
  { id: 'route', label: 'Trasa', key: 'T' },
  { id: 'obstacle', label: 'Překážka', key: 'O' },
  { id: 'snow', label: 'Sníh', key: 'S' },
  { id: 'zone', label: 'Zóna činnosti', key: 'Z' },
  { id: 'character', label: 'Postava', key: 'P' },
  { id: 'pan', label: 'Posun', key: 'H' },
];

export function TopBar() {
  const project = useEditor((s) => s.project);
  const dirty = useEditor((s) => s.dirty);
  const tool = useEditor((s) => s.tool);
  const canUndo = useEditor((s) => s.canUndo), canRedo = useEditor((s) => s.canRedo);
  const showMarkers = useEditor((s) => s.showMarkers);
  const rigDiag = useEditor((s) => s.rigDiagnostics);
  const clrDbg = useEditor((s) => s.clearingDebug);
  const hasClearing = useEditor((s) => !!s.project?.clearing);
  const gaitDbg = useEditor((s) => s.gaitDebug);
  const hasElders = useEditor((s) => !!s.project?.characters.some((c) => c.gaitProfile));
  const has = !!project;
  return (
    <div className="topbar">
      <div className="group">
        <span className="brand">❄ Zimní scéna</span>
        <button onClick={() => doOpen('new')}>Nový</button>
        <button onClick={() => doOpen('open')}>Otevřít…</button>
        <button onClick={() => doOpen('demo')}>Demo: náměstí</button>
        <button onClick={() => doOpen('demo2')}>Demo: radnice</button>
        <button disabled={!has} onClick={() => store.save()} title="Ctrl+S">Uložit{dirty ? ' •' : ''}</button>
        <button disabled={!has} onClick={async () => {
          const s = store.state; if (!s.dir || !s.project) return;
          try { const d = await zs().saveProjectAs(s.dir, s.project); if (d) { const r = await zs().openProject(d); if (r) await store.load(r); } } catch (e) { store.toast('error', (e as Error).message); }
        }}>Uložit jako…</button>
      </div>
      <div className="group">
        <button disabled={!has} onClick={() => importAssets('image')}>Importovat obrázky</button>
        <button disabled={!has} onClick={() => importAssets('audio')}>Importovat hudbu</button>
      </div>
      <div className="group tools">
        {TOOLS.map((t) => (
          <button key={t.id} disabled={!has} className={tool === t.id ? 'active' : ''} title={`Klávesa ${t.key}`}
            onClick={() => store.set({ tool: t.id, drawing: [], routeActiveNode: null })}>{t.label}</button>
        ))}
      </div>
      <div className="group">
        <button disabled={!canUndo} onClick={() => store.undoOp()} title="Ctrl+Z">↶ Zpět</button>
        <button disabled={!canRedo} onClick={() => store.redoOp()} title="Ctrl+Y / Ctrl+Shift+Z">↷ Vpřed</button>
        <label className="check"><input type="checkbox" checked={showMarkers} onChange={(e) => store.set({ showMarkers: e.target.checked })} /> Značky editoru</label>
        <label className="check" title="Kostra, klouby, kotevní body a názvy dílů skládaných postav (jen v editoru)"><input type="checkbox" checked={rigDiag} onChange={(e) => store.set({ rigDiagnostics: e.target.checked, showMarkers: e.target.checked || store.state.showMarkers })} /> Kostra postav</label>
        {hasClearing && <label className="check" title="Mřížka sněhu, pracovní hrana, úchopy rukou, opěrné body chodidel, fáze a zásoby sněhu (jen v editoru)"><input type="checkbox" checked={clrDbg} onChange={(e) => store.set({ clearingDebug: e.target.checked, rigDiagnostics: e.target.checked || store.state.rigDiagnostics })} /> Ladění odklízení</label>}
        {hasElders && <label className="check" title="Senioři: opěrné body chodidel, hrot hole (zelená = opřený, oranžová = přenos), rukojeť, profil, délka kroku, kadence a rychlost (jen v editoru)"><input type="checkbox" checked={gaitDbg} onChange={(e) => store.set({ gaitDebug: e.target.checked })} /> Ladění chůze seniorů</label>}
        {hasClearing && clrDbg && <button onClick={() => clearingCommand('cycle')} title="Postava přijde a provede jeden pracovní cyklus (záběry až po odhoz / vytlačení), pak zůstane stát">Jeden cyklus</button>}
        {hasClearing && clrDbg && <button onClick={() => clearingCommand('reset')} title="Nová vrstva sněhu na celé ploše, hromada pryč, postava mimo scénu (explicitní reset)">Reset situace</button>}
        <button className="primary" disabled={!has} onClick={() => store.set({ exportOpen: true })}>Export videa…</button>
      </div>
    </div>
  );
}
