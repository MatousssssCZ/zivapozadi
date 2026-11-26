import { store, useEditor, type Tool } from '../store';
import { zs } from '../api';
import { importAssets, clearingCommand, fallCommand, coopSnowmanCommand, rinkCommand } from '../ops';
import { useState } from 'react';
import type { FallVariant } from '../../core/anim/fallPoses';

async function guardDirty(): Promise<boolean> {
  if (!store.state.dirty) return true;
  return window.confirm('Projekt má neuložené změny. Opravdu pokračovat bez uložení?');
}

/** Ukázková scéna podle názvu projektu (galerie aktivit ví, že ji nemusí znovu načítat). */
export function sceneKeyOf(name: string): string | null { const n = name.toLowerCase(); return n.includes('liberec') ? 'liberec' : n.includes('tramvaj') ? 'tram' : n.includes('kluzi') ? 'pastel' : null; }

export async function doOpen(kind: 'new' | 'open' | 'demo' | 'demo2' | 'liberec' | 'pastel' | 'tram', dir?: string): Promise<boolean> {
  if (!(await guardDirty())) return false;
  try {
    const r = kind === 'new' ? await zs().newProject() : kind === 'demo' ? await zs().openDemo() : kind === 'demo2' ? await zs().openDemo('radnice') : kind === 'liberec' ? await zs().openDemo('liberec') : kind === 'pastel' ? await zs().openDemo('pastel') : kind === 'tram' ? await zs().openDemo('tram') : await zs().openProject(dir);
    if (r) { await store.load(r); store.set({ sceneKey: kind === 'new' || kind === 'open' ? sceneKeyOf(r.project.meta.name) : kind }); store.toast('info', `Otevřen projekt „${r.project.meta.name}“.`, 2500); }
    return !!r;
  } catch (e) { store.toast('error', (e as Error).message, 12000); return false; }
}

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Výběr', key: 'V' },
  { id: 'action', label: '▶ Akce', key: 'A' },
  { id: 'smoke', label: 'Kouř', key: 'K' },
  { id: 'route', label: 'Trasa', key: 'T' },
  { id: 'obstacle', label: 'Překážka', key: 'O' },
  { id: 'snow', label: 'Sníh', key: 'S' },
  { id: 'zone', label: 'Zóna činnosti', key: 'Z' },
  { id: 'character', label: 'Postava', key: 'P' },
  { id: 'pan', label: 'Posun', key: 'H' },
];

/** Přepnutí vektorových postav = nastavení scény (uloží se s projektem; simulace se sestaví znovu). */
export function setVectorMode(on: boolean) {
  if (!store.state.project) return;
  store.edit(on ? 'Vektorové postavy' : 'Malované postavy', (d) => { d.scene.vectorFigures = on; });
}

export function TopBar() {
  const vecOn = useEditor((s) => !!s.project?.scene.vectorFigures);
  const project = useEditor((s) => s.project);
  const dirty = useEditor((s) => s.dirty);
  const tool = useEditor((s) => s.tool);
  const canUndo = useEditor((s) => s.canUndo), canRedo = useEditor((s) => s.canRedo);
  const showMarkers = useEditor((s) => s.showMarkers);
  const rigDiag = useEditor((s) => s.rigDiagnostics);
  const clrDbg = useEditor((s) => s.clearingDebug);
  const hasClearing = useEditor((s) => !!s.project?.clearing);
  const gaitDbg = useEditor((s) => s.gaitDebug);
  const fallDbg = useEditor((s) => s.fallDebug);
  const smDbg = useEditor((s) => s.snowmanDebug);
  const rkDbg = useEditor((s) => s.rinkDebug);
  const hasRink = useEditor((s) => !!s.project?.rink || !!s.project?.tram);
  const hasSnowman = useEditor((s) => !!s.project?.zones.some((z) => z.activityType === 'snowman'));
  const [fv, setFv] = useState<FallVariant>('back'), [fs, setFs] = useState<1 | -1>(1), [fslow, setFslow] = useState(false), [fhelp, setFhelp] = useState(true);
  const hasElders = useEditor((s) => !!s.project?.characters.some((c) => c.gaitProfile));
  const has = !!project;
  const galleryOpen = useEditor((s) => s.galleryOpen);
  return (
    <div className="topbar">
      <div className="group">
        <button className="brand-btn" title="Zpět do úvodního menu" onClick={async () => { if (await guardDirty()) store.closeProject(); }}>❄ Menu</button>
        <button className={galleryOpen ? 'active' : 'accent'} onClick={() => store.set({ galleryOpen: !store.state.galleryOpen })} title="Galerie aktivit: projděte všechny aktivity, každá se přehraje v čerstvé simulaci a můžete spouštět návazné akce">🎬 Galerie aktivit</button>
        <button onClick={() => doOpen('new')}>Nový</button>
        <button onClick={() => doOpen('open')}>Otevřít…</button>
        <button onClick={() => doOpen('demo')}>Demo: náměstí</button>
        <button onClick={() => doOpen('demo2')}>Demo: radnice</button>
        <button onClick={() => doOpen('tram')} title="Vánoční tramvajová ulice: tramvaj, cestující, pekař">Demo: tramvaj</button>
        <button onClick={() => doOpen('pastel')} title="Pastelové vánoční kluziště: bruslení, nástup přes lavičku, stánek s nápoji">Demo: kluziště</button>
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
        <label className="check" title="Vektorová těla a oděvy místo malovaných dílů (stejné činnosti a pohyb); simulace se spustí znovu"><input type="checkbox" checked={vecOn} onChange={(e) => setVectorMode(e.target.checked)} /> Vektorové postavy</label>
      </div>
      {has && <Density />}
      <div className="group">
        <details className="debug-menu"><summary>Ladění ▾</summary><div className="debug-pop">
        <label className="check" title="Kostra, klouby, kotevní body a názvy dílů skládaných postav (jen v editoru)"><input type="checkbox" checked={rigDiag} onChange={(e) => store.set({ rigDiagnostics: e.target.checked, showMarkers: e.target.checked || store.state.showMarkers })} /> Kostra postav</label>
        {hasClearing && <label className="check" title="Mřížka sněhu, pracovní hrana, úchopy rukou, opěrné body chodidel, fáze a zásoby sněhu (jen v editoru)"><input type="checkbox" checked={clrDbg} onChange={(e) => store.set({ clearingDebug: e.target.checked, rigDiagnostics: e.target.checked || store.state.rigDiagnostics })} /> Ladění odklízení</label>}
        {hasElders && <label className="check" title="Senioři: opěrné body chodidel, hrot hole (zelená = opřený, oranžová = přenos), rukojeť, profil, délka kroku, kadence a rychlost (jen v editoru)"><input type="checkbox" checked={gaitDbg} onChange={(e) => store.set({ gaitDebug: e.target.checked })} /> Ladění chůze seniorů</label>}
        {hasSnowman && <label className="check" title="Sněhulák rodič + dítě: úkoly obou, rezervace, hmotnost a průměr koulí, předání hlavy, košík a bilance sněhu (jen v editoru)"><input type="checkbox" checked={smDbg} onChange={(e) => store.set({ snowmanDebug: e.target.checked })} /> Ladění sněhuláka</label>}
        {hasSnowman && smDbg && <button onClick={() => coopSnowmanCommand()} title="Nejbližší rodina (rodič + dítě) hned začne stavět; zpomalení a pauza ve spodním panelu">Postavit sněhuláka</button>}
        {hasRink && <label className="check" title="Kluziště: stav a profil bruslařů, rychlost, fáze odrazu, opěrná brusle, kontakty, obrys ledu, plánovaný směr, globální plánovač pádů a prvků (jen v editoru)"><input type="checkbox" checked={rkDbg} onChange={(e) => store.set({ rinkDebug: e.target.checked })} /> Ladění bruslení</label>}
        {hasRink && rkDbg && <button onClick={() => rinkCommand('fall')} title="Zaváhání zakončené pádem – u vybraného bruslaře, jinak u vhodného">Pád na ledě</button>}
        {hasRink && rkDbg && <button onClick={() => rinkCommand('trick')} title="Skluz na jedné noze nebo jízda vzad – u vybraného bruslaře, jinak u zdatného">Prvek</button>}
        {has && <label className="check" title="Pády: kontakty (zelená = stojí, červená = klouže), fáze, pomocník; ruční spuštění varianty (jen v editoru)"><input type="checkbox" checked={fallDbg} onChange={(e) => store.set({ fallDebug: e.target.checked })} /> Ladění pádů</label>}
        {has && fallDbg && <>
          <select value={fv} onChange={(e) => setFv(e.target.value as FallVariant)} title="Varianta"><option value="back">dozadu do sedu</option><option value="forward">dopředu na ruce a kolena</option><option value="side">bokem při otáčení</option><option value="saved">zachycené uklouznutí</option></select>
          <select value={fs} onChange={(e) => setFs(Number(e.target.value) as 1 | -1)} title="Strana"><option value={1}>pravá</option><option value={-1}>levá</option></select>
          <label className="check"><input type="checkbox" checked={fslow} onChange={(e) => setFslow(e.target.checked)} /> zpomalit 4×</label>
          <label className="check"><input type="checkbox" checked={fhelp} onChange={(e) => setFhelp(e.target.checked)} /> pomocník</label>
          <button onClick={() => fallCommand(fv, fs, { slow: fslow, helper: fhelp })} title="U vybrané postavy, jinak u vhodné postavy u středu obrazu">Spustit pád</button>
        </>}
        {hasClearing && clrDbg && <button onClick={() => clearingCommand('cycle')} title="Postava přijde a provede jeden pracovní cyklus (záběry až po odhoz / vytlačení), pak zůstane stát">Jeden cyklus</button>}
        {hasClearing && clrDbg && <button onClick={() => clearingCommand('reset')} title="Nová vrstva sněhu na celé ploše, hromada pryč, postava mimo scénu (explicitní reset)">Reset situace</button>}
        </div></details>
        <button className="primary" disabled={!has} onClick={() => store.set({ exportOpen: true })}>Export videa…</button>
      </div>
    </div>
  );
}

/** Hustota davu: podíl chodců a bruslařů, kteří přicházejí (mění se za běhu, bez přestavění simulace). */
function Density() {
  const crowd = useEditor((s) => s.project?.crowd);
  const hasRink = useEditor((s) => !!s.project?.rink);
  const [w, setW] = useState<number | null>(null), [k, setK] = useState<number | null>(null);
  const cw = w ?? Math.round((crowd?.walkers ?? 1) * 100), ck = k ?? Math.round((crowd?.skaters ?? 1) * 100);
  const commit = (key: 'walkers' | 'skaters', v: number) => { store.editLive(key === 'walkers' ? 'Hustota chodců' : 'Hustota bruslařů', (p) => { p.crowd = { ...(p.crowd ?? {}), [key]: v / 100 }; }); setW(null); setK(null); };
  return (
    <div className="group density" title="Kolik lidí do scény přichází. Kdo je navíc, dokončí, co dělá, a odejde (bruslaři dojezdí a odejdou z ledu).">
      <span>Chodci</span><input type="range" min={10} max={100} step={5} value={cw} onChange={(e) => setW(Number(e.target.value))} onPointerUp={() => commit('walkers', cw)} onKeyUp={() => commit('walkers', cw)} /><span className="muted">{cw} %</span>
      {hasRink && <><span>Bruslaři</span><input type="range" min={10} max={100} step={5} value={ck} onChange={(e) => setK(Number(e.target.value))} onPointerUp={() => commit('skaters', ck)} onKeyUp={() => commit('skaters', ck)} /><span className="muted">{ck} %</span></>}
    </div>
  );
}
