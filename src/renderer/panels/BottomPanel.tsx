import { useState } from 'react';
import { store, useEditor, useSimTick } from '../store';
import { NumField } from './fields';

export function formatTime(t: number): string {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export function BottomPanel() {
  const t = useSimTick();
  const project = useEditor((s) => s.project);
  const issues = useEditor((s) => s.issues);
  const [seekT, setSeekT] = useState(0);
  const [open, setOpen] = useState(false);
  if (!project) return <div className="bottombar" />;
  const sim = store.sim.sim;
  const playing = store.sim.clock.playing;
  const diags = sim?.diagnostics ?? [];
  const log = sim?.state.log ?? [];
  const warnCount = diags.length + issues.filter((i) => i.level !== 'error').length;
  return (
    <div className={`bottombar${open ? ' open' : ''}`}>
      <div className="transport">
        <button data-testid="play" className="primary" onClick={() => (playing ? store.sim.pause() : store.sim.play())} title="Mezerník">{playing ? '❚❚ Pauza' : '▶ Přehrát'}</button>
        <button data-testid="restart" onClick={() => { store.sim.pause(); store.sim.restart(store.state.project!, store.state.manifests); }} title="Restart do počátečního stavu">⟲ Restart</button>
        <span className="time" data-testid="sim-time">{formatTime(t)}</span>
        <span className="muted small">krok {sim?.state.step ?? 0}</span>
        <label className="small">Rychlost
          <select data-testid="speed" value={store.sim.clock.speed} onChange={(e) => store.sim.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <label className="small">Skok na čas (s) <NumField value={seekT} min={0} step={1} onCommit={setSeekT} /></label>
        <button onClick={() => store.sim.seek(seekT, store.state.project!, store.state.manifests)} title="Dopočítá simulaci do zadaného času (vzad = restart a nové dopočítání)">Přejít</button>
        <span className="grow" />
        {sim && <span className="small muted">kelímky: vydáno {sim.state.stats.cupsServed}, v koši {sim.state.stats.cupsDisposed} · rezervace: {Object.keys(sim.state.reservations).length}</span>}
        <button onClick={() => setOpen(!open)} className={warnCount ? 'warnbtn' : ''}>{open ? '▾' : '▸'} Diagnostika a záznam ({warnCount})</button>
      </div>
      {open && (
        <div className="drawer">
          <div className="drawer-col">
            <div className="section-title">Upozornění</div>
            {store.sim.error && <div className="warn">Simulaci nelze sestavit: {store.sim.error}</div>}
            {issues.map((i, k) => <div key={'i' + k} className={i.level === 'error' ? 'err' : 'warn'}>{i.message}</div>)}
            {diags.map((d, k) => <div key={'d' + k} className="warn">{d.message}</div>)}
            {!issues.length && !diags.length && !store.sim.error && <div className="muted small">Bez upozornění.</div>}
          </div>
          <div className="drawer-col">
            <div className="section-title">Záznam simulace</div>
            {[...log].reverse().slice(0, 80).map((l, k) => <div key={k} className={`small ${l.level === 'warn' ? 'warn' : ''}`}><span className="muted">{formatTime(l.t)}</span> {l.msg}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
