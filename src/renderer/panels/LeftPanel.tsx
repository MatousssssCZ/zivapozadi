import { useEffect, useState } from 'react';
import { store, useEditor, useSimTick } from '../store';
import { zs } from '../api';
import type { AssetEntry } from '../../core/model/types';
import { listActivityDefinitions } from '../../core/activities/registry';
import { placeAsset, setBackground, addEvent } from '../ops';
import { formatTime } from './BottomPanel';

const thumbCache = new Map<string, string>();
function Thumb({ asset, builtin }: { asset: AssetEntry; builtin: boolean }) {
  const dir = useEditor((s) => s.dir);
  const [url, setUrl] = useState<string | null>(thumbCache.get(asset.id) ?? null);
  useEffect(() => {
    if (url || asset.kind !== 'image') return;
    let alive = true;
    (builtin ? zs().readBuiltin(asset.file) : zs().readAsset(dir!, asset.file)).then((b) => {
      const u = URL.createObjectURL(new Blob([b as BlobPart])); thumbCache.set(asset.id, u); if (alive) setUrl(u);
    }).catch(() => {});
    return () => { alive = false; };
  }, [asset.id]);
  if (asset.kind === 'character') return <div className="thumb glyph">🧍</div>;
  if (asset.kind === 'audio') return <div className="thumb glyph">♫</div>;
  return url ? <img className="thumb" src={url} alt="" draggable={false} /> : <div className="thumb glyph">…</div>;
}

function center() { const p = store.state.project!; return { x: p.scene.width / 2, y: p.scene.height * 0.7 }; }

function AssetCard({ a, builtin }: { a: AssetEntry; builtin: boolean }) {
  const missing = useEditor((s) => s.missingAssets.includes(a.id));
  const isBg = a.kind === 'image' && (a.anchor?.y === 0 || (a.width ?? 0) >= 3000);
  return (
    <div className={`asset-card${missing ? ' missing' : ''}`} draggable={a.kind === 'image'} onDragStart={(e) => e.dataTransfer.setData('application/x-zs-asset', a.id)}>
      <Thumb asset={a} builtin={builtin} />
      <div className="asset-info">
        <div className="asset-name">{a.name}{a.provisional ? <span className="badge">test</span> : null}{missing ? <span className="badge err">chybí</span> : null}</div>
        <div className="asset-actions">
          {a.kind === 'image' && !isBg && <button onClick={() => placeAsset(a, center().x, center().y)}>Vložit</button>}
          {a.kind === 'image' && <button onClick={() => setBackground(a)}>Jako pozadí</button>}
          {a.kind === 'audio' && <><span className="muted">{formatTime(a.durationSec ?? 0)}</span><button onClick={() => store.edit('Výběr hudby', (d) => { d.export.audioAssetId = a.id; })}>Použít v exportu</button></>}
        </div>
      </div>
    </div>
  );
}

function Library() {
  const builtins = useEditor((s) => s.builtins);
  const project = useEditor((s) => s.project)!;
  const projectIds = new Set(project.assets.map((a) => a.id));
  const own = project.assets.filter((a) => !a.id.startsWith('builtin_') && a.kind !== 'character');
  return (
    <div className="lib">
      <div className="lib-title">Assety projektu</div>
      {own.length === 0 && <div className="muted small">Zatím žádné importované. Použijte „Importovat obrázky“ (PNG s průhledností, JPEG, WebP) nebo „Importovat hudbu“. Soubory se zkopírují do projektu.</div>}
      {own.map((a) => <AssetCard key={a.id} a={a} builtin={false} />)}
      <div className="lib-title">Testovací knihovna (provizorní grafika)</div>
      {builtins.filter((a) => a.kind === 'image').map((a) => <AssetCard key={a.id} a={projectIds.has(a.id) ? project.assets.find((x) => x.id === a.id)! : a} builtin={true} />)}
      <div className="muted small">Tip: asset lze přetáhnout myší přímo na plátno.</div>
    </div>
  );
}

function Activities() {
  const zoneType = useEditor((s) => s.zoneType);
  return (
    <div className="lib">
      {listActivityDefinitions().map((d) => (
        <div key={d.type} className={`activity-card${zoneType === d.type ? ' active' : ''}`}>
          <div className="asset-name">{d.label} <span className="badge ok">v{d.version} · hotovo</span></div>
          <div className="small">{d.description}</div>
          <ul className="small">
            <li>Účastníci: {d.participants.map((p) => `${p.role} (${p.min}–${p.max}; schopnosti: ${p.requiredCapabilities.join(', ')})`).join('; ')}</li>
            <li>Objekty: {d.requiredObjects.map((r) => `${r.label} (min. ${r.min})`).join(', ')}</li>
            <li>Rekvizity: {d.props.map((p) => p.label).join(', ')}</li>
            <li>Povrch: {d.surface ?? 'libovolný'}</li>
            <li>Kapacita: {d.capacity.description}</li>
            <li>Fáze: {d.phases.map((p) => p.label).join(' → ')}</li>
          </ul>
          <button className="primary" onClick={() => store.set({ tool: 'zone', zoneType: d.type })}>Nakreslit zónu činnosti</button>
        </div>
      ))}
      <div className="activity-card disabled">
        <div className="asset-name">Stavba sněhuláka <span className="badge">jen návrh</span></div>
        <div className="small">Není implementováno. Struktura definice je popsána v docs/PRIDANI_CINNOSTI.md.</div>
      </div>
    </div>
  );
}

function Outline() {
  const p = useEditor((s) => s.project)!;
  const sel = useEditor((s) => s.selection);
  const item = (kind: 'object' | 'character' | 'zone' | 'area', id: string, label: string, extra?: React.ReactNode) => (
    <div key={id} className={`outline-item${sel?.id === id ? ' sel' : ''}`} onClick={() => store.set({ selection: { kind, id }, tool: 'select' })}>
      <span className="grow">{label}</span>{extra}
    </div>
  );
  return (
    <div className="lib">
      <div className="lib-title">Objekty ({p.objects.length})</div>
      {p.objects.map((o) => item('object', o.id, o.name, <>
        <span className="muted small">{o.layer === 'background' ? 'pozadí' : o.layer === 'foreground' ? 'popředí' : 'prostor'}</span>
        <button className="icon" title={o.visible ? 'Skrýt' : 'Zobrazit'} onClick={(e) => { e.stopPropagation(); store.edit(o.visible ? 'Skrytí' : 'Zobrazení', (d) => { const x = d.objects.find((q) => q.id === o.id)!; x.visible = !x.visible; }); }}>{o.visible ? '👁' : '◌'}</button>
        <button className="icon" title={o.locked ? 'Odemknout' : 'Zamknout'} onClick={(e) => { e.stopPropagation(); store.edit(o.locked ? 'Odemčení' : 'Zamčení', (d) => { const x = d.objects.find((q) => q.id === o.id)!; x.locked = !x.locked; }); }}>{o.locked ? '🔒' : '🔓'}</button>
      </>))}
      <div className="lib-title">Postavy ({p.characters.length})</div>
      {p.characters.map((c) => item('character', c.id, c.name))}
      <div className="lib-title">Zóny činností ({p.zones.length})</div>
      {p.zones.map((z) => item('zone', z.id, z.name, <span className="muted small">{z.enabled ? '' : 'vypnuto'}</span>))}
      <div className="lib-title">Oblasti ({p.areas.length})</div>
      {p.areas.map((a) => item('area', a.id, `${a.kind === 'obstacle' ? '⛔' : '❄'} ${a.name}`))}
      <div className="lib-title">Síť tras</div>
      <div className="muted small">{p.nav.nodes.length} bodů, {p.nav.edges.length} spojení ({p.nav.edges.filter((e) => e.oneWay).length} jednosměrných, {p.nav.edges.filter((e) => e.narrow).length} úzkých)</div>
    </div>
  );
}

function Events() {
  useSimTick();
  const p = useEditor((s) => s.project)!;
  const sel = useEditor((s) => s.selection);
  return (
    <div className="lib">
      <button className="primary" onClick={addEvent}>+ Přidat plánovanou událost</button>
      {p.schedule.length === 0 && <div className="muted small">Žádné plánované události.</div>}
      {[...p.schedule].sort((a, b) => a.time - b.time).map((e) => {
        const rt = store.sim.sim?.state.schedule[e.id];
        return (
          <div key={e.id} className={`outline-item${sel?.id === e.id ? ' sel' : ''}`} onClick={() => store.set({ selection: { kind: 'event', id: e.id } })}>
            <span className="grow">{formatTime(e.time)} · {e.name}</span>
            <span className={`badge ${rt?.status === 'conflict' ? 'err' : rt?.status === 'started' ? 'ok' : ''}`}>{STATUS[rt?.status ?? 'pending']}</span>
          </div>
        );
      })}
    </div>
  );
}
const STATUS: Record<string, string> = { pending: 'čeká na čas', waiting: 'čeká na dostupnost', started: 'spuštěno', skipped: 'přeskočeno', conflict: 'konflikt' };

export function LeftPanel() {
  const [tab, setTab] = useState<'lib' | 'act' | 'out' | 'ev'>('lib');
  const has = useEditor((s) => !!s.project);
  useEffect(() => { zs().listBuiltins().then((b) => store.set({ builtins: b })).catch(() => {}); }, []);
  if (!has) return <div className="panel left" />;
  return (
    <div className="panel left">
      <div className="tabs">
        <button className={tab === 'lib' ? 'active' : ''} onClick={() => setTab('lib')}>Knihovna</button>
        <button className={tab === 'act' ? 'active' : ''} onClick={() => setTab('act')}>Činnosti</button>
        <button className={tab === 'out' ? 'active' : ''} onClick={() => setTab('out')}>Scéna</button>
        <button className={tab === 'ev' ? 'active' : ''} onClick={() => setTab('ev')}>Události</button>
      </div>
      <div className="panel-body">
        {tab === 'lib' && <Library />}
        {tab === 'act' && <Activities />}
        {tab === 'out' && <Outline />}
        {tab === 'ev' && <Events />}
      </div>
    </div>
  );
}
