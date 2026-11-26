/**
 * Laboratoř postav (vývojový náhled vektorových postav a zvířat): jedna postava na „běžícím pásu“.
 * Rychlost a směr, pauza / krok / zpomalení, kostra a kontaktní body, přepínání oděvu, tělesného typu
 * a pohybového profilu, skutečná velikost vedle zvětšení, běžné i krajní pózy. Pás se posouvá přesně
 * uraženou drahou – stojná noha na něm musí stát (neklouže), jinak je chyba vidět hned.
 */
import { useEffect, useRef, useState } from 'react';
import { store } from '../store';
import { skeletonPose, DEFAULT_MOTION, footGeomOf, viewForDirection, type MotionParams } from '../../core/anim/skeleton';
import type { Direction } from '../../core/anim/manifest';
import { bodyOf, templateFor } from '../../core/vector/body';
import { OUTFITS } from '../../core/vector/outfit';
import { drawVectorFigure } from '../../core/vector/figure';
import { BASE_TEMPLATES } from '../../core/vector/templates';
import { Q } from '../../core/scene/camera';
import { LAB_ANIMALS, drawLabAnimal } from './figureLabAnimals';

type PoseId = 'walk' | 'stand' | 'squat' | 'bend' | 'kneel' | 'rest' | 'lift' | 'reach' | 'hold2' | 'angel';
const POSES: [PoseId, string][] = [['walk', 'Chůze'], ['stand', 'Stoj'], ['squat', 'Dřep'], ['bend', 'Předklon'], ['kneel', 'Klek'], ['rest', 'Sed'], ['lift', 'Zvedání'], ['reach', 'Zvednutá ruka'], ['hold2', 'Držení oběma rukama'], ['angel', 'Leh (anděl)']];
const PROFILES: Record<string, { label: string; speed: number; m: Partial<MotionParams> }> = {
  calm: { label: 'Klidná procházka', speed: 1.1, m: {} },
  slow: { label: 'Pomalá chůze', speed: 0.8, m: { strideScale: 0.85, armSwing: 0.6 } },
  brisk: { label: 'Svižná chůze', speed: 1.55, m: { strideScale: 1.12, armSwing: 1.35 } },
  careful: { label: 'Opatrně na sněhu', speed: 0.7, m: { strideScale: 0.72, armSwing: 0.55, bob: 0.5, lean: 1.4 } },
  child: { label: 'Dítě', speed: 1.0, m: { armSwing: 1.2, bob: 1.3 } },
  senior: { label: 'Senior', speed: 0.85, m: { strideScale: 0.85, armSwing: 0.7, lean: 1.2 } },
};
const DIRS: Direction[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

export function FigureLab() {
  const cv = useRef<HTMLCanvasElement>(null);
  const [kind, setKind] = useState<'human' | string>('human');
  const [outfit, setOutfit] = useState(OUTFITS[0].id);
  const [bodySeed, setBodySeed] = useState(3);
  const [dir, setDir] = useState<Direction>('SE');
  const [pose, setPose] = useState<PoseId>('walk');
  const [profile, setProfile] = useState('calm');
  const [speedK, setSpeedK] = useState(1);
  const [rate, setRate] = useState(1);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(3);
  const [bones, setBones] = useState(false);
  const st = useRef({ t: 0, dist: 0, step: 0 });
  const cfg = useRef({ kind, outfit, bodySeed, dir, pose, profile, speedK, rate, paused, zoom, bones });
  cfg.current = { kind, outfit, bodySeed, dir, pose, profile, speedK, rate, paused, zoom, bones };

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const c = cfg.current, canvas = cv.current; if (!canvas) return;
      let dt = Math.min(0.05, (now - last) / 1000) * c.rate; last = now;
      if (c.paused) dt = 0;
      if (st.current.step) { dt = (1 / 60) * st.current.step; st.current.step = 0; }
      const ctx = canvas.getContext('2d')!; const W = canvas.width = canvas.clientWidth * devicePixelRatio, H = canvas.height = canvas.clientHeight * devicePixelRatio;
      ctx.fillStyle = '#e3e7ef'; ctx.fillRect(0, 0, W, H);
      const prof = PROFILES[c.profile], walking = c.pose === 'walk', mps = walking ? prof.speed * c.speedK : 0;
      st.current.t += dt; st.current.dist += (mps / Q) * dt; // jednotky postavy
      const gy = H * 0.86, zx = W * 0.42, ppu = c.zoom * devicePixelRatio;
      // pás: příčné značky ve směru chůze (posouvají se uraženou drahou)
      const vd = viewForDirection(c.dir), fwd = vd.view === 'side' ? { x: 1, y: 0 } : vd.view === 'front3q' ? { x: 0.72, y: 0.3 * 0.35 } : vd.view === 'back3q' ? { x: 0.72, y: -0.3 * 0.35 } : vd.view === 'front' ? { x: 0.05, y: 0.9 * 0.35 } : { x: 0.05, y: -0.9 * 0.35 };
      const sg = vd.mirror ? -1 : 1;
      ctx.strokeStyle = 'rgba(70,80,110,0.25)'; ctx.lineWidth = 1.5 * devicePixelRatio;
      for (let k = -14; k <= 14; k++) { const u = (k * 12 - (st.current.dist % 12)); const px = zx + sg * fwd.x * u * ppu, py = gy + fwd.y * u * ppu; ctx.beginPath(); ctx.ellipse(px, py, 1.6 * ppu, 0.6 * ppu, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = 'rgba(60,70,100,0.15)'; ctx.fillRect(0, gy, W, H - gy);
      const draw = (x0: number, scale: number, detail: number) => {
        ctx.save(); ctx.translate(x0, gy); ctx.scale(sg * scale, scale);
        if (c.kind !== 'human') { drawLabAnimal(ctx, c.kind, st.current.t, st.current.dist * Q, mps, c.dir, c.pose, c.bones); ctx.restore(); return; }
        const of = OUTFITS.find((o) => o.id === c.outfit) ?? OUTFITS[0];
        const age = of.age, body = bodyOf(c.bodySeed, age), tpl = templateFor(BASE_TEMPLATES[age === 'child' ? 'child' : 'adult'], body), g = footGeomOf(tpl);
        const stride = tpl.gait.strideLength * (prof.m.strideScale ?? 1);
        const motion: MotionParams = { ...DEFAULT_MOTION, ...prof.m };
        const sitKind = ({ squat: 'squat', bend: 'bend', kneel: 'kneel', rest: 'rest', lift: 'lift', angel: 'angel' } as Record<string, string>)[c.pose];
        const hands = c.pose === 'reach' ? { t: [null, { u: 0.25, h: 1.95, lat: 0 }], w: 1 } : c.pose === 'hold2' ? { t: [{ u: 0.4, h: 1.05, lat: -0.15 }, { u: 0.4, h: 1.05, lat: 0.15 }], w: 1 } : null;
        const anim = { dir: c.dir, walkPhase: walking ? (st.current.dist / stride) % 1 : 0, walkBlend: walking ? 1 : 0, idleTime: st.current.t, action: null, stride, sit: sitKind ? { kind: sitKind, t: 3, dur: 30, w: 1 } : null, hands } as never;
        const p = skeletonPose(tpl, vd.view, false, anim, false, motion, 7);
        drawVectorFigure(ctx, p, body, of, { view: vd.view, foot: g, detail, seed: c.bodySeed, t: st.current.t });
        if (c.bones) {
          ctx.lineWidth = 0.6; ctx.strokeStyle = '#ff00c8';
          for (const l of [...p.legs, ...p.arms]) { ctx.beginPath(); ctx.moveTo(l.root.x, l.root.y); ctx.lineTo(l.joint.x, l.joint.y); ctx.lineTo(l.end.x, l.end.y); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(p.hip.x, p.hip.y); ctx.lineTo(p.neck.x, p.neck.y); ctx.lineTo(p.head.x, p.head.y); ctx.stroke();
          for (let i = 0; i < 2; i++) { const e = p.legs[i].end, r = p.feet[i], cs = Math.cos(r), sn = Math.sin(r); for (const [x, y, col] of [[-g.heel, g.AH, '#00e676'], [g.toe, g.AH, '#00b0ff']] as [number, number, string][]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(e.x + x * cs - y * sn, e.y + x * sn + y * cs, 1.1, 0, Math.PI * 2); ctx.fill(); } }
        }
        ctx.restore();
      };
      draw(zx, ppu, 1);
      // skutečná velikost (postava v popředí scény ≈ 1 px na jednotku při 1080p)
      draw(W * 0.86, devicePixelRatio * 1.0, 0.3);
      ctx.fillStyle = '#556'; ctx.font = `${12 * devicePixelRatio}px sans-serif`; ctx.fillText('skutečná velikost', W * 0.86 - 50 * devicePixelRatio, gy + 24 * devicePixelRatio);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="figure-lab">
      <div className="fl-side">
        <div className="fl-head"><h2>Laboratoř postav</h2><button className="ghost" onClick={() => store.set({ labOpen: false })} title="Zpět do menu">✕</button></div>
        <label>Postava<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="human">Člověk</option>{LAB_ANIMALS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
        {kind === 'human' && <>
          <label>Oděv<select value={outfit} onChange={(e) => setOutfit(e.target.value)}>{OUTFITS.map((o, i) => <option key={o.id} value={o.id}>{i + 1}. {o.label}</option>)}</select></label>
          <label>Tělesný typ (seed) <input type="range" min={1} max={60} value={bodySeed} onChange={(e) => setBodySeed(+e.target.value)} /> <span className="muted">{bodySeed}</span></label>
          <label>Pohybový profil<select value={profile} onChange={(e) => setProfile(e.target.value)}>{Object.entries(PROFILES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select></label>
        </>}
        <label>Póza<select value={pose} onChange={(e) => setPose(e.target.value as PoseId)}>{POSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Směr<div className="fl-dirs">{DIRS.map((d) => <button key={d} className={d === dir ? 'active' : ''} onClick={() => setDir(d)}>{({ E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖', N: '↑', NE: '↗' } as Record<string, string>)[d]}</button>)}</div></label>
        <label>Rychlost ×{speedK.toFixed(2)} <input type="range" min={0} max={1.6} step={0.05} value={speedK} onChange={(e) => setSpeedK(+e.target.value)} /></label>
        <div className="fl-row">
          <button onClick={() => setPaused(!paused)}>{paused ? '▶ Přehrát' : '⏸ Pauza'}</button>
          <button onClick={() => { setPaused(true); st.current.step = 3; }} title="Krok o 3 snímky (pozastaví)">⏭ Krok</button>
        </div>
        <div className="fl-row">{[1, 0.5, 0.25, 0.1].map((r) => <button key={r} className={rate === r ? 'active' : ''} onClick={() => setRate(r)}>{r === 1 ? '1×' : `${r}×`}</button>)}</div>
        <div className="fl-row">{[1.5, 3, 5].map((z) => <button key={z} className={zoom === z ? 'active' : ''} onClick={() => setZoom(z)}>zoom {z}×</button>)}</div>
        <label className="check"><input type="checkbox" checked={bones} onChange={(e) => setBones(e.target.checked)} /> Kostra a kontaktní body</label>
        <p className="muted small">Pás se posouvá přesně uraženou drahou: stojná noha (zelená pata, modrá špička) se s ním má pohybovat – jinak noha klouže.</p>
      </div>
      <canvas ref={cv} className="fl-canvas" />
    </div>
  );
}
