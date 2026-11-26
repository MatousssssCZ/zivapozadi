import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useEditor } from '../store';
import { zs } from '../api';
import { planExport, estimateOutputBytes, type ExportPlan } from '../../core/export/plan';
import type { ExportProgress } from '../../core/export/runExport';
import { ExportCancelled } from '../../core/export/runExport';
import { exportVideo } from '../exportRunner';
import { Row, NumField, Select, Check, Section } from './fields';
import { formatTime } from './BottomPanel';
import type { ExportResolution } from '../../core/model/types';

const fmtDur = (s: number | null) => (s === null || !Number.isFinite(s) ? '—' : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ' h ' : ''}${Math.floor((s % 3600) / 60)} min ${Math.round(s % 60)} s`);

export function ExportDialog() {
  const p = useEditor((s) => s.project)!;
  const isWeb = !navigator.userAgent.includes("Electron"); // prohlížeč kóduje přes WebCodecs, aplikace přes FFmpeg
  const dir = useEditor((s) => s.dir)!;
  const ex = p.export;
  const [ff, setFf] = useState<{ path: string; source: string; hasX264: boolean } | null | undefined>(undefined);
  const [resume, setResume] = useState<{ exists: boolean; compatible?: boolean; doneChunks?: number; totalChunks?: number } | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; path?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [mem, setMem] = useState<string>('');
  const signal = useRef({ cancelled: false });
  const audioAssets = p.assets.filter((a) => a.kind === 'audio');
  const audio = audioAssets.find((a) => a.id === ex.audioAssetId);

  useEffect(() => { zs().ffmpegInfo().then(setFf).catch(() => setFf(null)); }, []);
  const set = (label: string, fn: (e: typeof ex) => void) => store.edit(label, (d) => fn(d.export));

  const plan = useMemo<{ plan?: ExportPlan; error?: string }>(() => {
    try { return { plan: planExport(p) }; } catch (e) { return { error: (e as Error).message }; }
  }, [p]);

  useEffect(() => {
    if (!ex.outputPath || !plan.plan) { setResume(null); return; }
    zs().exportInspect(ex.outputPath, plan.plan.jobHash).then(setResume).catch(() => setResume(null));
  }, [ex.outputPath, plan.plan?.jobHash, running]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      const m = await zs().memory();
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      setMem(`paměť: hlavní proces ${(m.main / 1e6).toFixed(0)} MB${heap ? `, JS editoru ${(heap / 1e6).toFixed(0)} MB` : ''}`);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = async () => {
    if (!plan.plan || !ex.outputPath) return;
    setResult(null); setProgress(null); setRunning(true); store.set({ exporting: true });
    signal.current = { cancelled: false };
    store.sim.pause();
    const snapshot = structuredClone(p);
    try {
      await store.images.whenLoaded();
      const r = await exportVideo(snapshot, store.state.manifests, plan.plan, dir, ex.outputPath, store.images, setProgress, signal.current);
      setResult({ ok: true, text: `Hotovo: ${r.frames} snímků za ${fmtDur(r.elapsedSec)}${r.resumedFromChunk > 0 ? ` (navázáno od části ${r.resumedFromChunk + 1})` : ''}${r.discardedStale ? '; zastaralé části byly zahozeny' : ''}.`, path: r.outputPath });
    } catch (e) {
      if (e instanceof ExportCancelled || (e as Error).name === 'ExportCancelled') setResult({ ok: false, text: 'Export zrušen. Dokončené části zůstaly uloženy – příští export se stejným nastavením na ně naváže.' });
      else setResult({ ok: false, text: (e as Error).message });
    } finally { setRunning(false); store.set({ exporting: false }); }
  };

  const pl = plan.plan;
  return (
    <div className="modal-bg">
      <div className="modal" data-testid="export-dialog">
        <div className="modal-title">Export videa (MP4{isWeb ? '' : ', H.264'})</div>
        <div className="modal-body">
          <Section title="Obraz">
            <Row label="Rozlišení"><Select<ExportResolution> value={ex.resolution} options={[{ value: '1920x1080', label: '1920 × 1080 (Full HD)' }, { value: '3840x2160', label: '3840 × 2160 (4K UHD)' }]} onChange={(v) => set('Rozlišení exportu', (e) => { e.resolution = v; })} /></Row>
            <Row label="Snímková frekvence"><span>30 fps</span></Row>
            <Row label="Kvalita (CRF, nižší = lepší)"><NumField value={ex.crf} min={12} max={32} onCommit={(v) => set('Kvalita', (e) => { e.crf = Math.round(v); })} /></Row>
            {isWeb && <Row label="Kodek (prohlížeč)"><Select value={ex.webCodec ?? 'av1'} options={[{ value: 'av1', label: 'AV1 – nejostřejší, bez cyklického rozmazání (doporučeno)' }, { value: 'h264', label: 'H.264 – největší kompatibilita (starší přehrávače)' }]} onChange={(v) => set('Kodek', (e) => { e.webCodec = v as 'av1' | 'h264'; })} /></Row>}
            <Row label="Rychlost kódování"><Select value={ex.preset} options={[{ value: 'veryfast', label: 'velmi rychlé' }, { value: 'faster', label: 'rychlejší' }, { value: 'fast', label: 'rychlé' }, { value: 'medium', label: 'střední (doporučeno)' }, { value: 'slow', label: 'pomalé (menší soubor)' }]} onChange={(v) => set('Preset', (e) => { e.preset = v; })} /></Row>
          </Section>
          <Section title="Délka a zvuk">
            <Row label="Hudba"><Select value={ex.audioAssetId ?? ''} options={[{ value: '', label: '— bez zvuku —' }, ...audioAssets.map((a) => ({ value: a.id, label: `${a.name} (${formatTime(a.durationSec ?? 0)})` }))]} onChange={(v) => set('Hudba', (e) => { e.audioAssetId = v || null; if (!v) e.durationMode = 'manual'; })} /></Row>
            <Row label="Délka videa"><Select value={ex.durationMode} options={[{ value: 'manual', label: 'zadaná ručně' }, ...(audio ? [{ value: 'audio' as const, label: 'podle hudby' }] : [])]} onChange={(v) => set('Režim délky', (e) => { e.durationMode = v; })} /></Row>
            {ex.durationMode === 'manual' && <Row label="Délka (s)"><NumField testId="export-duration" value={ex.durationSec} min={1} max={21600} onCommit={(v) => set('Délka exportu', (e) => { e.durationSec = v; })} /></Row>}
            {audio && ex.durationMode === 'manual' && (audio.durationSec ?? 0) < ex.durationSec && (
              <Row label="Hudba je kratší než video"><Select value={ex.audioWhenShorter} options={[{ value: 'loop', label: 'opakovat hudbu' }, { value: 'silence', label: 'po skončení ticho' }]} onChange={(v) => set('Kratší hudba', (e) => { e.audioWhenShorter = v; })} /></Row>
            )}
            {audio && ex.durationMode === 'manual' && (audio.durationSec ?? 0) > ex.durationSec && <div className="muted small">Hudba je delší – bude na konci videa ukončena krátkým zeslabením (rychlost se nemění).</div>}
          </Section>
          <Section title="Zpracování">
            <Row label="Délka části s checkpointem (s)"><NumField value={ex.chunkSec} min={5} max={600} onCommit={(v) => set('Délka části', (e) => { e.chunkSec = v; })} /></Row>
            <Check label="Diagnostický režim: sekvence PNG místo MP4 (velmi velké!)" value={ex.diagnosticPngSequence} onChange={(v) => set('Diagnostický režim', (e) => { e.diagnosticPngSequence = v; })} />
            <Row label="Výstupní soubor">
              <span className="path">{ex.outputPath ?? '— nezvoleno —'}</span>
              <button onClick={async () => { const r = await zs().chooseExportPath(`${p.meta.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.mp4`); if (r) set('Výstupní cesta', (e) => { e.outputPath = r; }); }}>Zvolit…</button>
            </Row>
          </Section>
          {plan.error && <div className="err">{plan.error}</div>}
          {pl && <div className="small summary">
            {pl.width}×{pl.height} · {pl.fps} fps · {fmtDur(pl.durationSec)} · {pl.totalFrames} snímků · {pl.chunks.length} částí · zvuk: {pl.audio ? { loop: 'opakovat', silence: 'ticho po skončení', trim: 'zkrátit', exact: 'přesně' }[pl.audio.mode] : 'bez zvuku'} · odhad velikosti ≤ {(estimateOutputBytes(pl) / 1e6).toFixed(0)} MB
          </div>}
          {ff === null && <div className="err">FFmpeg nebyl nalezen – export není možný.</div>}
          {ff && <div className="muted small">FFmpeg: {ff.source}{ff.hasX264 ? '' : ' – CHYBÍ libx264!'}</div>}
          {resume?.exists && (resume.compatible
            ? <div className="ok">Nalezen rozpracovaný export ({resume.doneChunks}/{resume.totalChunks} částí hotovo) – export na něj naváže ze checkpointu.</div>
            : <div className="warn">Ve složce je rozpracovaný export s jiným projektem/nastavením – jeho checkpointy jsou zastaralé a budou zahozeny.</div>)}
          {progress && (
            <div className="progress-box" data-testid="export-progress">
              <div className="bar"><div style={{ width: `${(100 * progress.framesDone) / progress.totalFrames}%` }} /></div>
              <div className="small">{progress.phase === 'finalize' ? 'Spojování částí a připojení zvuku…' : progress.phase === 'done' ? 'Dokončeno.' : `Snímek ${progress.framesDone} / ${progress.totalFrames} · část ${progress.chunk + 1}/${progress.chunks}`}</div>
              <div className="small">Uplynulo {fmtDur(progress.elapsedSec)} · zbývá ≈ {fmtDur(progress.etaSec)} · {progress.fpsRate.toFixed(1)} snímků/s {mem && `· ${mem}`}</div>
            </div>
          )}
          {result && <div className={result.ok ? 'ok' : 'err'} data-testid="export-result">{result.text} {result.path && <button onClick={() => zs().showInFolder(result.path!)}>Zobrazit ve složce</button>}</div>}
        </div>
        <div className="modal-actions">
          {!running && <button onClick={() => store.set({ exportOpen: false })}>Zavřít</button>}
          {running && <button className="danger" onClick={() => { signal.current.cancelled = true; }}>Zrušit export</button>}
          {!running && <button className="primary" data-testid="export-start" disabled={!pl || !ex.outputPath || !ff} onClick={start}>{resume?.exists && resume.compatible ? 'Pokračovat v exportu' : 'Spustit export'}</button>}
        </div>
      </div>
    </div>
  );
}
