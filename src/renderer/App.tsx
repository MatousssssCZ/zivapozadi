import { useEffect } from 'react';
import { store, useEditor } from './store';
import { TopBar, doOpen } from './panels/TopBar';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';
import { BottomPanel } from './panels/BottomPanel';
import { ExportDialog } from './panels/ExportDialog';
import { EditorCanvas } from './canvas/EditorCanvas';
import { deleteSelection, duplicateSelection, addArea } from './ops';
import { zs } from './api';
import type { Tool } from './store';

function Welcome() {
  return (
    <div className="welcome">
      <h1>❄ Zimní scéna</h1>
      <p>Editor animovaných zimních scén s deterministickou simulací a exportem do MP4.</p>
      <div className="welcome-actions">
        <button className="primary big" onClick={() => doOpen('liberec')}>Otevřít „Liberec – živý trh“</button>
        <button className="primary big" onClick={() => doOpen('tram')}>Otevřít „Vánoční tramvajová ulice“</button>
        <button className="primary big" onClick={() => doOpen('pastel')}>Otevřít „Pastelové vánoční kluziště“</button>
        <button className="big" onClick={() => doOpen('demo2')}>Demo „Náměstí s radnicí“ (vaše grafika)</button>
        <button className="big" onClick={() => doOpen('demo')}>Demo „Vánoční náměstí“ (testovací grafika)</button>
        <button className="big" onClick={() => doOpen('new')}>Nový projekt…</button>
        <button className="big" onClick={() => doOpen('open')}>Otevřít projekt…</button>
      </div>
      <p className="muted small">Projekt je složka s příponou .zscena obsahující project.json a zkopírované assety – lze ji přenášet celou.</p>
    </div>
  );
}

function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  return <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.level}`}>{t.text}</div>)}</div>;
}

const KEY_TOOLS: Record<string, Tool> = { v: 'select', t: 'route', o: 'obstacle', s: 'snow', z: 'zone', p: 'character', h: 'pan', a: 'action', k: 'smoke' };

export function App() {
  const project = useEditor((s) => s.project);
  const exportOpen = useEditor((s) => s.exportOpen);
  useEffect(() => {
    zs().startupProject().then((d) => { if (d) doOpen('open', d); });
    zs().onBeforeClose(() => {
      if (!store.state.dirty || window.confirm('Projekt má neuložené změny. Zavřít bez uložení?')) zs().confirmClose();
    });
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      const typing = (tag === 'INPUT' && !['checkbox', 'radio', 'color', 'button'].includes((el as HTMLInputElement).type)) || tag === 'SELECT' || tag === 'TEXTAREA';
      if (typing) return;
      if (!store.state.project || store.state.exporting) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); store.save(); return; }
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undoOp(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); store.redoOp(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
      if (e.key === 'Escape') { store.set({ actionMenu: null, drawing: [], routeActiveNode: null, selection: store.state.tool === 'select' ? null : store.state.selection }); return; }
      if (e.key === 'Enter' && store.state.drawing.length >= 3 && (store.state.tool === 'obstacle' || store.state.tool === 'snow')) { addArea(store.state.tool, store.state.drawing); return; }
      if (e.key === ' ') { e.preventDefault(); store.sim.clock.playing ? store.sim.pause() : store.sim.play(); return; }
      if (!mod && KEY_TOOLS[e.key.toLowerCase()]) store.set({ tool: KEY_TOOLS[e.key.toLowerCase()], drawing: [], routeActiveNode: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <LeftPanel />
        <div className="center">{project ? <EditorCanvas /> : <Welcome />}</div>
        <RightPanel />
      </div>
      <BottomPanel />
      {exportOpen && project && <ExportDialog />}
      <Toasts />
    </div>
  );
}
