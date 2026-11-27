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
export function sceneKeyOf(name: string): string | null { const n = name.toLowerCase(); return n.includes('liberec') ? 'liberec' : n.includes('tramvaj') ? 'tram' : n.includes('kluzi') ? (/3\b/.test(n) ? 'pastel3' : /2\b/.test(n) ? 'pastel2' : 'pastel') : null; }

export async function doOpen(kind: 'new' | 'open' | 'demo' | 'demo2' | 'liberec' | 'pastel' | 'pastel2' | 'pastel3' | 'tram', dir?: string): Promise<boolean> {
  if (!(await guardDirty())) return false;
  try {
    const r = kind === 'new' ? await zs().newProject() : kind === 'demo' ? await zs().openDemo() : kind === 'demo2' ? await zs().openDemo('radnice') : kind === 'liberec' ? await zs().openDemo('liberec') : kind === 'pastel' ? await zs().openDemo('pastel') : kind === 'pastel2' ? await zs().openDemo('pastel2') : kind === 'pastel3' ? await zs().openDemo('pastel3') : kind === 'tram' ? await zs().openDemo('tram') : await zs().openProject(dir);
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
        <button onClick={() => doOpen('pastel2')} title="Kluziště 2: vektorová těla a oděvy s malovanými obličeji, plnější postavy, dvojice za ruce">Demo: kluziště 2</button>
        <button onClick={() => doOpen('pastel3')} title="Kluziště 3: živější – prodavačka, víc lidí u stánku, sněhuláci, odklízení před domy, hustota počty">Demo: kluziště 3</button>
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
/**
 * Hustota davu počty (ne procenty): kolik lidí, bruslařů, psů a koček smí být ve scéně, a tempo chodců.
 * Ukládá se do scény (export je pak stejný). Kdo je navíc, dokončí, co dělá, a odejde.
 */
/** Kluziště: četnost pádů, skoků a holubiček (násobek; 0 = vypnuto). Mění se živě, uloží se do scény. */
function RinkRates() {
  const ev = useEditor((s) => s.project?.rink?.events);
  const item = (label: string, key: 'fallRate' | 'jumpRate' | 'arabesqueRate', title: string) => (
    <label className="dens-n" title={title}>{label}
      <select value={String(ev?.[key] ?? 1)} onChange={(e) => store.editLive(`Kluziště: ${label}`, (q) => { if (q.rink) q.rink.events = { ...(q.rink.events ?? {}), [key]: Number(e.target.value) }; })}>
        {[0, 0.25, 0.5, 1, 1.5, 2, 3, 4].map((v) => <option key={v} value={v}>{v === 0 ? 'vypnuto' : `${v}×`}</option>)}
      </select>
    </label>
  );
  return <>{item('Pády', 'fallRate', 'Jak často bruslaři zaváhají a upadnou (násobek výchozí četnosti)')}{item('Skoky', 'jumpRate', 'Četnost skoků s otočkou')}{item('Holubičky', 'arabesqueRate', 'Četnost holubiček')}</>;
}

function Density() {
  const p = useEditor((s) => s.project);
  const crowd = p?.crowd;
  const [w, setW] = useState<number | null>(null);
  if (!p) return null;
  // kolik postav každého druhu už má (rozšířená) simulace – navýšení nad to ji přestaví (doplní nové postavy)
  const sp0 = store.sim.sim?.project ?? p, chars = sp0.characters, comp = (id: string) => chars.filter((c) => c.companionId === id).length;
  const walkPool = chars.filter((c) => c.routine === 'visitor' && !c.skate && !c.companionId);
  const have = { walkersN: walkPool.filter((c) => !c.pet).reduce((a, c) => a + 1 + comp(c.id), 0), skatersN: chars.filter((c) => !!c.skate && !c.skatePair).length, dogs: walkPool.filter((c) => c.pet).length, cats: sp0.cats?.length ?? 0 };
  const cur = { walkersN: crowd?.walkersN ?? Math.round(have.walkersN * (crowd?.walkers ?? 1)), skatersN: crowd?.skatersN ?? Math.round(have.skatersN * (crowd?.skaters ?? 1)), dogs: crowd?.dogs ?? have.dogs, cats: crowd?.cats ?? have.cats };
  const setN = (key: keyof typeof have, v: number) => {
    const n = Math.max(0, Math.round(v || 0)), fn = (q: NonNullable<typeof p>) => { q.crowd = { ...(q.crowd ?? {}), [key]: n }; };
    if (n > have[key]) store.edit('Hustota davu', fn); else store.editLive('Hustota davu', fn);
  };
  const sp = w ?? Math.round((crowd?.walkSpeed ?? 1) * 100);
  const num = (label: string, key: keyof typeof have, title: string) => (
    <label className="dens-n" title={title}>{label}<input type="number" min={0} value={cur[key]} onChange={(e) => setN(key, Number(e.target.value))} /></label>
  );
  return (
    <div className="group density">
      {num('Chodci', 'walkersN', 'Kolik lidí bez psa smí být ve scéně (doprovod a děti se počítají). Bez horní hranice – chybějící postavy se doplní. Navíc přidaní dokončí, co dělají, a odejdou.')}
      {p.rink && num('Bruslaři', 'skatersN', 'Kolik bruslařů smí být na ledě (bez horní hranice)')}
      {num('Psi', 'dogs', 'Kolik lidí se psem chodí scénou (bez horní hranice)')}
      {num('Kočky', 'cats', 'Kolik koček se ve scéně objevuje (bez horní hranice; potřebují místa pro kočky ve scéně)')}
      {p.rink && <RinkRates />}
      <span title="Rychlost chůze chodců (násobek; bruslaři a pracovníci mají vlastní tempo)">Rychlost chůze</span>
      <input type="range" min={50} max={160} step={5} value={sp} onChange={(e) => setW(Number(e.target.value))} onPointerUp={() => { store.editLive('Rychlost chodců', (q) => { q.crowd = { ...(q.crowd ?? {}), walkSpeed: sp / 100 }; }); setW(null); }} onKeyUp={() => { store.editLive('Rychlost chodců', (q) => { q.crowd = { ...(q.crowd ?? {}), walkSpeed: sp / 100 }; }); setW(null); }} />
      <span className="muted">{(sp / 100).toFixed(2)}×</span>
    </div>
  );
}
