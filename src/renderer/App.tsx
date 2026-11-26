import { FigureLab } from './panels/FigureLab';
import { useEffect, useState } from 'react';
import { store, useEditor } from './store';
import { TopBar, doOpen } from './panels/TopBar';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';
import { BottomPanel } from './panels/BottomPanel';
import { ExportDialog } from './panels/ExportDialog';
import { ActivityGallery } from './panels/ActivityGallery';
import { EditorCanvas } from './canvas/EditorCanvas';
import { deleteSelection, duplicateSelection, addArea } from './ops';
import { zs } from './api';
import type { Tool } from './store';

/** Úvodní menu: Scény (ukázkové i vlastní – otevřít a upravit, nová) a Sandbox (galerie aktivit). */
const SCENES: { key: 'liberec' | 'tram' | 'pastel' | 'demo2' | 'demo'; dir: string; name: string; desc: string }[] = [
  { key: 'tram', dir: 'Tramvajova-ulice', name: 'Vánoční tramvajová ulice', desc: 'Tramvaj, pekař, květinářka, kočárek, stromky, běžkař, pevnost' },
  { key: 'liberec', dir: 'Liberec-zivy-trh', name: 'Liberec – živý trh', desc: 'Stánky, rodiny, sněhulák, koulovačka, sáňky, psi a kočky' },
  { key: 'pastel', dir: 'Pastelove-kluziste', name: 'Pastelové vánoční kluziště', desc: 'Bruslaři, skoky, holubička, pirueta, lavička a přezouvání' },
  { key: 'demo2', dir: 'Namesti-radnice', name: 'Náměstí s radnicí', desc: 'Starší ukázková scéna' },
  { key: 'demo', dir: 'Vanocni-namesti', name: 'Vánoční náměstí', desc: 'Testovací grafika' },
];
function Welcome() {
  const [tab, setTab] = useState<'home' | 'scenes'>('home');
  let recent: { dir: string; name: string }[] = [];
  try { recent = (JSON.parse(localStorage.getItem('zs-recent') ?? '[]') as { dir: string; name: string }[]).filter((r) => !SCENES.some((x) => r.dir === x.dir || r.dir.endsWith('/' + x.dir) || r.dir.endsWith(x.dir + '.zscena'))); } catch { /* */ }
  if (tab === 'home') return (
    <div className="welcome home">
      <h1>❄ Živá pozadí</h1>
      <p className="muted">Zimní scény s deterministickou simulací, animovanými postavami a exportem do videa.</p>
      <div className="home-tiles">
        <button className="home-tile" onClick={() => setTab('scenes')}>
          <span className="ht-icon">🏙</span><span className="ht-title">Scény</span>
          <span className="ht-desc">Otevřít a upravit hotovou scénu, vytvořit novou nebo otevřít vlastní projekt.</span>
        </button>
        <button className="home-tile accent" onClick={() => store.set({ galleryOpen: true })}>
          <span className="ht-icon">🎬</span><span className="ht-title">Sandbox</span>
          <span className="ht-desc">Galerie všech aktivit – každá se přehraje v čerstvé simulaci, s návaznými akcemi a zpomalením.</span>
        </button>
        <button className="home-tile" onClick={() => store.set({ labOpen: true })}>
          <span className="ht-icon">🧥</span><span className="ht-title">Laboratoř postav</span>
          <span className="ht-desc">Vektorové postavy: oděvy, tělesné typy, pohledy, chůze a krajní pózy – zpomaleně, s kostrou a kontakty.</span>
        </button>
      </div>
    </div>
  );
  return (
    <div className="welcome scenes">
      <div className="scenes-head"><button className="ghost" onClick={() => setTab('home')}>← Menu</button><h2>Scény</h2><span /></div>
      <div className="scene-grid">
        {SCENES.map((sc) => (
          <div key={sc.key} className="scene-card">
            <div className="sc-thumb"><img src={`projekty/${sc.dir}.zscena/nahled.jpg`} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
            <div className="sc-body"><div className="sc-name">{sc.name}</div><div className="muted small">{sc.desc}</div></div>
            <div className="sc-actions"><button className="primary" onClick={() => doOpen(sc.key)}>Otevřít a upravit</button></div>
          </div>
        ))}
        {recent.map((r) => (
          <div key={r.dir} className="scene-card own">
            <div className="sc-thumb own">📁</div>
            <div className="sc-body"><div className="sc-name">{r.name}</div><div className="muted small">Vlastní scéna · {r.dir}</div></div>
            <div className="sc-actions"><button className="primary" onClick={() => doOpen('open', r.dir)}>Otevřít a upravit</button></div>
          </div>
        ))}
        <button className="scene-card new" onClick={() => doOpen('new')}><span className="ht-icon">＋</span><span className="sc-name">Nová scéna</span><span className="muted small">Prázdný projekt – pozadí, trasy a postavy přidáte v editoru.</span></button>
        <button className="scene-card new" onClick={() => doOpen('open')}><span className="ht-icon">📂</span><span className="sc-name">Otevřít projekt…</span><span className="muted small">Složka .zscena z disku.</span></button>
      </div>
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
  const galleryOpen = useEditor((s) => s.galleryOpen);
  const labOpen = useEditor((s) => s.labOpen);
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
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (store.state.galleryOpen) { if (store.state.selection) store.set({ confirmDelete: true }); } else deleteSelection(); return; }
      if (e.key === 'Escape') { store.set({ confirmDelete: false, actionMenu: null, drawing: [], routeActiveNode: null, selection: store.state.tool === 'select' ? null : store.state.selection }); return; }
      if (e.key === 'Enter' && store.state.drawing.length >= 3 && (store.state.tool === 'obstacle' || store.state.tool === 'snow')) { addArea(store.state.tool, store.state.drawing); return; }
      if (e.key === ' ') { e.preventDefault(); store.sim.clock.playing ? store.sim.pause() : store.sim.play(); return; }
      if (!mod && KEY_TOOLS[e.key.toLowerCase()]) store.set({ tool: KEY_TOOLS[e.key.toLowerCase()], drawing: [], routeActiveNode: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // úvodní menu na celé obrazovce (bez nástrojů editoru), dokud není otevřená scéna ani sandbox
  if (labOpen) return (<div className="app home-only"><FigureLab /><Toasts /></div>);
  if (!project && !galleryOpen) return (<div className="app home-only"><Welcome /><Toasts /></div>);
  return (
    <div className="app">
      <TopBar />
      <div className={galleryOpen ? "main gallery-mode" : "main"}>
        {galleryOpen ? <ActivityGallery /> : <LeftPanel />}
        <div className="center">{project ? <EditorCanvas /> : <Welcome />}</div>
        {!galleryOpen && <RightPanel />}
      </div>
      <BottomPanel />
      {exportOpen && project && <ExportDialog />}
      <Toasts />
    </div>
  );
}
