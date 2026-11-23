import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useEditor } from '../store';
import { zs } from '../api';
import { ensureAsset } from '../ops';
import { newId } from '../../core/model/ids';
import type { CharacterManifest } from '../../core/anim/manifest';
import type { CharacterAppearance, GroupId, LockKey, PartLibrary } from '../../core/anim/partLibrary';
import { LOCK_LABELS } from '../../core/anim/partLibrary';
import { generateAppearance, generateGroup, nextSeed, variantCompatible, template, countCombos } from '../../core/anim/appearanceGenerator';
import { ALL_VIEWS, VIEW_LABELS, type ViewId } from '../../core/anim/skeleton';
import { initialAnimState, stepAnimator, type AnimState } from '../../core/anim/animator';
import type { Direction } from '../../core/anim/manifest';
import { characterVisual } from '../../core/render/characterPose';
import { drawRig } from '../../core/render/rigRenderer';
import type { AgentState } from '../../core/sim/types';
import type { CharacterInstance } from '../../core/model/types';
import { drawRigDiagnostics } from '../rigDiagnostics';
import { NumField, Check } from './fields';

export const RIG_ASSET_ID = 'builtin_postava_cg';
const NAMES = ['Adéla', 'Bohumil', 'Cecílie', 'David', 'Eliška', 'Filip', 'Gabriela', 'Hynek', 'Irena', 'Jakub', 'Klára', 'Lukáš', 'Marie', 'Norbert', 'Olga', 'Petr', 'Radka', 'Stanislav', 'Tereza', 'Urban', 'Věra', 'Vojtěch', 'Zdeňka', 'Zbyněk', 'Alžběta', 'Bedřich', 'Dagmar', 'Ema', 'Ferdinand', 'Jitka', 'Kamil', 'Ludmila', 'Matěj', 'Nela', 'Oldřich', 'Pavla', 'Rudolf', 'Simona', 'Tomáš', 'Vilma'];
const VIEW_DIR: Record<ViewId, Direction> = { side: 'E', front3q: 'SE', back3q: 'NE', front: 'S', back: 'N' };
const MIRROR_DIR: Partial<Record<Direction, Direction>> = { E: 'W', SE: 'SW', NE: 'NW' };
const EDIT_GROUPS: GroupId[] = ['jacket', 'hat', 'scarf'];
const ZERO_DEPTH = { enabled: false, yFar: 0, scaleFar: 1, yNear: 1, scaleNear: 1 };

export function useRigManifest(): { assetId: string; manifest: CharacterManifest; lib: PartLibrary } | null {
  const manifests = useEditor((s) => s.manifests);
  for (const [assetId, m] of Object.entries(manifests)) if (m.rigLibrary) return { assetId, manifest: m, lib: m.rigLibrary };
  return null;
}

async function addRigLibrary() {
  try {
    const builtin = store.state.builtins.find((a) => a.id === RIG_ASSET_ID);
    if (!builtin) { store.toast('error', 'Vestavěná knihovna malovaných postav nebyla nalezena.'); return; }
    const entry = await ensureAsset(builtin);
    const m = await zs().loadManifest(store.state.dir!, entry);
    await store.addManifest(entry.id, m);
    store.toast('info', 'Knihovna malovaných postav byla zkopírována do projektu.');
  } catch (e) { store.toast('error', (e as Error).message); }
}

// ---------------------------------------------------------------- náhled postavy
export function CharacterPreview({ app, manifest, width = 220, height = 300, compact = false }: { app: CharacterAppearance; manifest: CharacterManifest; width?: number; height?: number; compact?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'idle' | 'walk'>('idle');
  const [view, setView] = useState<ViewId>('front3q');
  const [mirror, setMirror] = useState(false);
  const [diag, setDiag] = useState(false);
  const animRef = useRef<AnimState>(initialAnimState('SE'));
  const dist = useRef(0);
  const tpl = manifest.rigLibrary!.bodyTemplates.find((t) => t.id === app.bodyTemplate)!;
  const stateTick = useEditor((s) => s); // překreslení náhledu po načtení obrázků dílů
  const live = useRef({ app, mode, view, mirror, diag });
  live.current = { app, mode, view, mirror, diag };
  useEffect(() => {
    if (compact) { draw(0); return; }
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (t: number) => {
      acc += Math.min(0.1, (t - last) / 1000); last = t;
      const L = live.current;
      const speed = L.mode === 'walk' ? 60 * L.app.motion.speed : 0;
      // pevný krok 1/60 s – stejný animátor jako simulace
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        const strideF = L.app.motion.strideScale * L.app.proportions.height;
        stepAnimator(animRef.current, manifest, 1 / 60, speed, 60 * L.app.motion.speed, strideF);
        dist.current += speed / 60;
      }
      draw(speed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [compact]);
  useEffect(() => { if (compact) draw(0); }, [app, compact, stateTick]);

  function draw(speed: number) {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== width * dpr) { c.width = width * dpr; c.height = height * dpr; }
    const ctx = c.getContext('2d')!;
    const L = live.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e9eef5'; ctx.fillRect(0, 0, c.width, c.height);
    const S = (c.height * 0.8) / 140;
    const groundY = c.height * 0.9;
    // zem s pohyblivými značkami (kontrola, že stojná noha neklouže)
    ctx.fillStyle = '#d6dfea'; ctx.fillRect(0, groundY, c.width, c.height - groundY);
    if (!compact) {
      ctx.fillStyle = 'rgba(80,90,120,0.35)';
      const step = 30 * S, off = ((dist.current * S) % step + step) % step;
      const dirSign = L.mirror ? 1 : -1;
      for (let x = -step; x < c.width + step; x += step) ctx.fillRect(x + dirSign * off, groundY + 2, 3 * S, 2 * S);
    }
    const anim = animRef.current;
    let dir = VIEW_DIR[L.view];
    if (L.mirror && MIRROR_DIR[dir]) dir = MIRROR_DIR[dir]!;
    anim.dir = dir;
    const agent = { id: 'preview', pos: { x: 0, y: 0 }, facing: 0, lane: 0, anim, holding: null } as unknown as AgentState;
    const cv = characterVisual(agent, manifest, { baseScale: 1, appearance: L.app }, ZERO_DEPTH);
    ctx.save(); ctx.translate(c.width / 2, groundY); ctx.scale(cv.mirror ? -S : S, S);
    ctx.fillStyle = 'rgba(60,70,100,0.18)'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    drawRig(ctx, cv.rig!, store.images, manifest.rigLibraryDir ?? '', tpl.farShade);
    if (L.diag) drawRigDiagnostics(ctx, cv, dpr / S, true);
    ctx.restore();
    void speed;
  }

  if (compact) return <canvas ref={ref} style={{ width, height, borderRadius: 4 }} />;
  return (
    <div className="preview">
      <canvas ref={ref} style={{ width, height, borderRadius: 6 }} data-testid="char-preview" />
      <div className="actions">
        <button className={mode === 'idle' ? 'active' : ''} onClick={() => setMode('idle')}>Klid</button>
        <button className={mode === 'walk' ? 'active' : ''} onClick={() => setMode('walk')} data-testid="preview-walk">Chůze</button>
        <Check label="Kostra" value={diag} onChange={setDiag} />
      </div>
      <div className="actions">
        {ALL_VIEWS.map((v) => {
          const ok = tpl.availableViews.includes(v);
          const fb = tpl.viewFallbacks[v]?.use;
          return <button key={v} disabled={!ok} className={view === v ? 'active' : ''} title={ok ? '' : `Chybí podklad – ve scéně se použije náhrada: ${fb ? VIEW_LABELS[fb] : 'žádná'}`} onClick={() => setView(v)}>{VIEW_LABELS[v]}{ok ? '' : ' ✕'}</button>;
        })}
        {view !== 'front' && view !== 'back' && <Check label="zrcadlit (opačný směr)" value={mirror} onChange={setMirror} />}
      </div>
      {tpl.availableViews.length < ALL_VIEWS.length && <div className="muted small">✕ = pohled bez podkladů (ve scéně explicitní náhrada: {Object.entries(tpl.viewFallbacks).map(([k, v]) => `${VIEW_LABELS[k as ViewId]} → ${VIEW_LABELS[v!.use]}`).join(', ')}).</div>}
    </div>
  );
}

// ---------------------------------------------------------------- editor vzhledu
export function AppearanceEditor({ app, lib, onChange }: { app: CharacterAppearance; lib: PartLibrary; onChange: (a: CharacterAppearance, label: string) => void }) {
  const tpl = template(lib, app.bodyTemplate);
  const pal = new Map(lib.palettes.map((p) => [p.id, p]));
  const setVariant = (g: GroupId, id: string) => {
    const v = lib.variants.find((x) => x.id === id)!;
    const colors = { ...app.colors };
    if (v.paletteOptions.length && !v.paletteOptions.includes(colors[g] ?? '')) colors[g] = v.paletteOptions[0];
    onChange({ ...app, variants: { ...app.variants, [g]: id }, colors }, 'Změna dílu postavy');
  };
  const toggleLock = (k: LockKey, on: boolean) => onChange({ ...app, locks: on ? [...new Set([...app.locks, k])] : app.locks.filter((x) => x !== k) }, 'Zámek vlastnosti');
  return (
    <div className="appearance">
      {EDIT_GROUPS.map((g) => {
        const group = lib.groups.find((x) => x.id === g)!;
        const cur = lib.variants.find((v) => v.id === app.variants[g]);
        const lockV = g as LockKey, lockC = `${g}Color` as LockKey;
        return (
          <div key={g} className="role-box">
            <div className="row"><span className="row-label">{group.label}</span>
              <span className="row-field">
                <select value={app.variants[g]} onChange={(e) => setVariant(g, e.target.value)} data-testid={`variant-${g}`}>
                  {lib.variants.filter((v) => v.group === g).map((v) => {
                    const ok = variantCompatible(lib, tpl, v, app.variants);
                    return <option key={v.id} value={v.id} disabled={!ok}>{v.label}{ok ? '' : ' (nekompatibilní)'}{v.provisional ? ' · dočasné' : ''}</option>;
                  })}
                </select>
              </span>
            </div>
            <div className="swatches">
              {(cur?.paletteOptions ?? []).map((pid) => (
                <button key={pid} title={pal.get(pid)?.label} className={`swatch${app.colors[g] === pid ? ' sel' : ''}`} style={{ background: pal.get(pid)?.color }}
                  onClick={() => onChange({ ...app, colors: { ...app.colors, [g]: pid } }, 'Změna barvy')} />
              ))}
              {!cur?.paletteOptions.length && <span className="muted small">bez přebarvení (chybí maska)</span>}
            </div>
            <div className="actions">
              <Check label={`zamknout ${LOCK_LABELS[lockV]}`} value={app.locks.includes(lockV)} onChange={(on) => toggleLock(lockV, on)} />
              <Check label="zamknout barvu" value={app.locks.includes(lockC)} onChange={(on) => toggleLock(lockC, on)} />
            </div>
          </div>
        );
      })}
      <div className="actions">
        <Check label="zamknout proporce" value={app.locks.includes('proportions')} onChange={(on) => toggleLock('proportions', on)} />
        <Check label="zamknout pohyb" value={app.locks.includes('motion')} onChange={(on) => toggleLock('motion', on)} />
      </div>
      <div className="muted small">Kalhoty, boty a rukavice jsou společné; barva rukavic ladí s čepicí nebo šálou. Výška ×{app.proportions.height}, postava ×{app.proportions.build}, krok ×{app.motion.strideScale}, tempo ×{app.motion.speed}. Seed {app.seed}.</div>
      <button className="primary" data-testid="regenerate" onClick={() => onChange(generateAppearance(lib, { seed: nextSeed(app.seed, 1), base: app }), 'Přegenerování postavy')}>Přegenerovat (zamčené zůstanou)</button>
    </div>
  );
}

// ---------------------------------------------------------------- panel generátoru
export function GeneratorPanel() {
  const rig = useRigManifest();
  const project = useEditor((s) => s.project)!;
  const [count, setCount] = useState(12);
  const [seed, setSeed] = useState(2024);
  const [palettes, setPalettes] = useState<string[] | null>(null);
  const [cands, setCands] = useState<{ app: CharacterAppearance; on: boolean }[]>([]);
  const [sel, setSel] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const lib = rig?.lib;
  const pals = palettes ?? lib?.palettes.map((p) => p.id) ?? [];
  const combos = useMemo(() => (lib ? countCombos(lib, lib.bodyTemplates[0].id, pals) : 0), [lib, pals.join(',')]);
  if (!rig || !lib) {
    return (
      <div className="lib">
        <div className="small">Generátor skládá postavy z malovaných dílů (bunda, čepice, šála, barvy, proporce, pohyb). Projekt zatím knihovnu dílů nemá.</div>
        <button className="primary" onClick={addRigLibrary}>Přidat knihovnu malovaných postav</button>
        <div className="warn">Díly z ChatGPT: zatím jen pohled šikmo zepředu, jedna bunda, čepice a šála.</div>
      </div>
    );
  }
  const generate = () => {
    const g = generateGroup(lib, count, seed, { palettes: pals });
    setCands(g.appearances.map((app) => ({ app, on: true })));
    setSel(0); setNote(g.note);
  };
  const save = () => {
    const chosen = cands.filter((c) => c.on);
    if (!chosen.length) return;
    const nodes = project.nav.nodes;
    if (!nodes.length) { store.toast('warn', 'Nejdřív nakreslete trasu – postavy začínají v bodech trasy.'); return; }
    const used = new Set(project.characters.map((c) => c.name));
    const names = NAMES.filter((n) => !used.has(n));
    store.edit(`Vložení ${chosen.length} vygenerovaných postav`, (d) => {
      chosen.forEach((c, i) => {
        const ci: CharacterInstance = {
          id: newId('ch'), name: names[i] ?? `Postava ${d.characters.length + 1}`, assetId: rig.assetId,
          startNodeId: nodes[(d.characters.length + i * 3) % nodes.length].id, baseScale: 1, walkSpeed: Math.round(60 * c.app.motion.speed * 10) / 10,
          palette: { coat: '#888888', hat: '#888888', scarf: '#888888', skin: '#e8c0a0', trousers: '#444444' }, wander: true, appearance: c.app,
          activities: { coffee: { enabled: true, firstDelayMin: 5 + i * 5, firstDelayMax: 12 + i * 5, intervalMin: 70, intervalMax: 160 } },
        };
        d.characters.push(ci);
      });
    });
    store.toast('info', `Do projektu přidáno ${chosen.length} postav. Vzhled je uložen (konkrétní díly, barvy, proporce i seed).`);
    setCands([]);
  };
  const cur = cands[sel];
  return (
    <div className="lib" data-testid="generator-panel">
      {lib.provisional && <div className="warn">Knihovna „{lib.label}“ – díly jsou DOČASNÉ, nejde o finální grafiku.</div>}
      <div className="row"><span className="row-label">Počet postav</span><span className="row-field"><NumField testId="gen-count" value={count} min={1} max={60} onCommit={(v) => setCount(Math.round(v))} /></span></div>
      <div className="row"><span className="row-label">Seed</span><span className="row-field"><NumField testId="gen-seed" value={seed} step={1} onCommit={(v) => setSeed(Math.round(v))} /><button onClick={() => setSeed(Math.floor(Math.random() * 1e6))} title="Náhodný seed">⚄</button></span></div>
      <div className="small">Palety:</div>
      <div className="swatches">
        {lib.palettes.map((p) => (
          <label key={p.id} className="check small" title={p.label}>
            <input type="checkbox" checked={pals.includes(p.id)} onChange={(e) => setPalettes(e.target.checked ? [...pals, p.id] : pals.filter((x) => x !== p.id))} />
            <i className="swatch-dot" style={{ background: p.color }} />{p.label}
          </label>
        ))}
      </div>
      <div className="muted small">Různých viditelných kombinací: {combos}</div>
      <button className="primary" onClick={generate} data-testid="gen-generate">Generovat</button>
      {note && <div className="warn">{note}</div>}
      {cands.length > 0 && <>
        <div className="cand-grid">
          {cands.map((c, i) => (
            <div key={i} className={`cand${i === sel ? ' sel' : ''}`} onClick={() => setSel(i)}>
              <CharacterPreview app={c.app} manifest={rig.manifest} width={56} height={96} compact />
              <input type="checkbox" checked={c.on} onClick={(e) => e.stopPropagation()} onChange={(e) => setCands(cands.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
            </div>
          ))}
        </div>
        <div className="actions">
          <button onClick={() => setCands(cands.map((c, k) => (k === sel ? { ...c, app: generateAppearance(lib, { seed: nextSeed(c.app.seed, 1), base: c.app }) } : c)))}>Přegenerovat vybranou</button>
          <button className="primary" onClick={save} data-testid="gen-save">Uložit výběr do projektu ({cands.filter((c) => c.on).length})</button>
        </div>
        {cur && <>
          <CharacterPreview app={cur.app} manifest={rig.manifest} />
          <AppearanceEditor app={cur.app} lib={lib} onChange={(a) => setCands(cands.map((c, k) => (k === sel ? { ...c, app: a } : c)))} />
        </>}
      </>}
    </div>
  );
}
