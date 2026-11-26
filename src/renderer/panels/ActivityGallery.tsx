/**
 * Galerie aktivit (sandbox): seznam všech aktivit A01–A18 a dalších událostí. Výběr načte správnou
 * scénu, postaví čerstvou deterministickou simulaci, rychle ji převine do chvíle, kdy jde aktivitu
 * spustit, spustí ji a zaměří kameru (případně sleduje hlavní postavu). Přehrávač nahoře nad plátnem
 * nabízí opakování, pauzu, krokování, rychlost (0,25×–2×) a návazné akce (např. skok, holubička).
 */
import { useMemo, useState } from 'react';
import { store, useEditor } from '../store';
import { doOpen } from './TopBar';
import { CATALOG, STATUS_LABEL, SCENE_LABEL, type CatalogEntry, type R } from '../activityCatalog';
import { SIM_DT } from '../../core/sim/types';

const toastR = (r: R | string) => { const ok = typeof r === 'string' ? true : r.ok, msg = typeof r === 'string' ? r : r.msg; store.toast(ok ? 'info' : 'warn', msg, 2600); };

/** Spustí položku: scéna → čerstvá simulace → převinutí do spuštění → přehrávání a zaměření. */
export async function playEntry(e: CatalogEntry) {
  store.set({ galleryId: e.id, showMarkers: false, actionMenu: null });
  if (!e.scene || !e.start) { store.toast('warn', e.missing ?? 'Tuto aktivitu zatím nelze přehrát.', 5000); return; }
  if (store.state.sceneKey !== e.scene || !store.state.project) { const ok = await doOpen(e.scene); if (!ok) return; }
  const p = store.state.project!, m = store.state.manifests;
  store.sim.pause(); store.sim.restart(p, m);
  const sim = store.sim.sim; if (!sim) { store.toast('error', store.sim.error ?? 'Simulace nejde spustit.'); return; }
  // převinutí: po 0,5 s zkoušet spustit, nejvýš maxWait s (stav je vždy skutečně spočítaný)
  const max = e.maxWait ?? 60; let r: R = { ok: false, msg: 'Nepodařilo se spustit.' };
  sim.runSteps(Math.round(3 / SIM_DT));
  for (let t = 3; t <= max; t += 0.5) { r = e.start(sim); if (r.ok) break; sim.runSteps(Math.round(0.5 / SIM_DT)); }
  toastR(r);
  store.set({ focus: { rect: e.focus ?? null, agentId: e.follow?.(sim) ?? null, n: (store.state.focus?.n ?? 0) + 1 } });
  store.sim.play();
  // sledovaná postava může vzniknout až po spuštění (session, událost na ledě) – doplnit
  if (e.follow) setTimeout(() => { const s2 = store.sim.sim; const id = s2 && e.follow!(s2); if (id && store.state.galleryId === e.id) store.set({ focus: { ...(store.state.focus ?? { n: 0 }), agentId: id } }); }, 600);
}

export function ActivityGallery() {
  const [q, setQ] = useState('');
  const sel = useEditor((s) => s.galleryId);
  const groups = useMemo(() => {
    const f = q.trim().toLowerCase();
    const list = CATALOG.filter((e) => !f || `${e.code ?? ''} ${e.name} ${e.group}`.toLowerCase().includes(f));
    const g = new Map<string, CatalogEntry[]>(); for (const e of list) g.set(e.group, [...(g.get(e.group) ?? []), e]);
    return [...g.entries()];
  }, [q]);
  const cur = CATALOG.find((e) => e.id === sel);
  const done = CATALOG.filter((e) => e.status === 'done').length;
  return (
    <div className="gallery">
      <div className="gallery-head">
        <h2>🎬 Galerie aktivit</h2>
        <button className="ghost" onClick={() => store.set({ galleryOpen: false })} title="Zavřít galerii">✕</button>
      </div>
      <p className="muted small">Klikněte na aktivitu – přehraje se v čerstvé simulaci své scény. Nahoře nad scénou pak můžete opakovat, zpomalit a spouštět návazné akce. Hotovo {done} z {CATALOG.length}.</p>
      <input className="gallery-search" placeholder="Hledat (např. A07, sáně, pekař)…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="gallery-list">
        {groups.map(([g, items]) => (
          <div key={g} className="gallery-group">
            <div className="gallery-group-title">{g}</div>
            {items.map((e) => (
              <button key={e.id} className={`gallery-item ${sel === e.id ? 'sel' : ''} st-${e.status}`} onClick={() => playEntry(e)} title={e.missing ?? e.desc}>
                <span className="gi-code">{e.code ?? '•'}</span>
                <span className="gi-name">{e.name}</span>
                <span className={`gi-badge st-${e.status}`}>{STATUS_LABEL[e.status]}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {cur && (
        <div className="gallery-detail">
          <div className="gd-title">{cur.code ? `${cur.code} · ` : ''}{cur.name}</div>
          {cur.scene && <div className="muted small">Scéna: {SCENE_LABEL[cur.scene]}</div>}
          <p className="small">{cur.desc || cur.missing}</p>
          {cur.missing && cur.desc && <p className="small warn-text">{cur.missing}</p>}
        </div>
      )}
    </div>
  );
}

/** Přehrávač nad plátnem (jen při otevřené galerii a vybrané aktivitě). */
export function GalleryPlayer() {
  const open = useEditor((s) => s.galleryOpen), sel = useEditor((s) => s.galleryId), focus = useEditor((s) => s.focus);
  const [, force] = useState(0);
  const e = CATALOG.find((x) => x.id === sel);
  if (!open || !e || !e.start || store.state.sceneKey !== e.scene) return null;
  const playing = store.sim.clock.playing, speed = store.sim.clock.speed;
  const set = (fn: () => void) => { fn(); force((n) => n + 1); };
  const sim = store.sim.sim;
  return (
    <div className="gallery-player">
      <span className="gp-title">{e.code ? `${e.code} · ` : ''}{e.name}</span>
      <button onClick={() => playEntry(e)} title="Znovu od začátku (čerstvá simulace)">⟲ Znovu</button>
      <button onClick={() => set(() => (playing ? store.sim.pause() : store.sim.play()))}>{playing ? '⏸ Pauza' : '▶ Přehrát'}</button>
      <button onClick={() => set(() => { store.sim.pause(); store.sim.sim?.runSteps(6); })} title="Krok o 0,1 s (pozastaví)">⏭ Krok</button>
      <span className="gp-speeds">{[0.25, 0.5, 1, 2].map((v) => <button key={v} className={speed === v ? 'active' : ''} onClick={() => set(() => store.sim.setSpeed(v))}>{v === 0.25 ? '¼×' : v === 0.5 ? '½×' : `${v}×`}</button>)}</span>
      <button className={focus?.agentId ? 'active' : ''} disabled={!e.follow} onClick={() => { const id = focus?.agentId ? null : (sim && e.follow?.(sim)); store.set({ focus: { rect: e.focus ?? null, agentId: id ?? null, n: (focus?.n ?? 0) + 1 } }); }} title="Kamera sleduje hlavní postavu">🎯 Sledovat</button>
      <button onClick={() => store.set({ focus: { rect: null, agentId: null, n: (focus?.n ?? 0) + 1 } })} title="Celý záběr scény">⤢ Celek</button>
      {!!e.actions?.length && <span className="gp-sep">Návazné akce:</span>}
      {e.actions?.map((a) => <button key={a.label} className="gp-action" onClick={() => { const s = store.sim.sim; if (!s) return; toastR(a.run(s)); if (e.follow) setTimeout(() => { const s2 = store.sim.sim; const id = s2 && e.follow!(s2); if (id) store.set({ focus: { ...(store.state.focus ?? { n: 0 }), agentId: id } }); }, 400); if (!store.sim.clock.playing) store.sim.play(); }}>{a.label}</button>)}
    </div>
  );
}
