import { useEffect, useRef, useState } from 'react';
import { store, useEditor } from '../store';
import { drawScene } from '../../core/render/sceneRenderer';
import { drawOverlay } from '../overlay';
import { hitTest, type Hit } from './hitTest';
import type { Vec2 } from '../../core/math/vec';
import { dist } from '../../core/math/vec';
import { addArea, addCharacter, addNode, addZone, connectNodes, placeAsset } from '../ops';
import { ActionMenu, actionsAt, addSource } from './ActionMenu';
import { GalleryPlayer } from '../panels/ActivityGallery';

interface View { zoom: number; panX: number; panY: number }

export function EditorCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ zoom: 1, panX: 0, panY: 0 });
  const mouse = useRef<Vec2 | null>(null);
  const hover = useRef<Hit>(null);
  const drag = useRef<null | { hit: Hit | { kind: 'pan' } | { kind: 'zoneRect' }; start: Vec2; startScreen: Vec2; started: boolean; orig?: unknown; lastScreen: Vec2 }>(null);
  const dragRect = useRef<{ a: Vec2; b: Vec2 } | null>(null);
  const tool = useEditor((s) => s.tool);
  const [zoomPct, setZoomPct] = useState(100);

  // Transformace logické scény → pixely plátna (jen editor; export používá vždy celý záběr scény).
  const xf = () => {
    const c = ref.current!, p = store.state.project!;
    const fit = Math.min(c.width / p.scene.width, c.height / p.scene.height) * 0.94;
    const s = fit * view.current.zoom;
    const ox = c.width / 2 + view.current.panX - (p.scene.width / 2) * s;
    const oy = c.height / 2 + view.current.panY - (p.scene.height / 2) * s;
    return { s, ox, oy, dpr: window.devicePixelRatio || 1 };
  };
  const toScene = (e: { clientX: number; clientY: number }): Vec2 => {
    const c = ref.current!, r = c.getBoundingClientRect(), t = xf();
    const x = (e.clientX - r.left) * (c.width / r.width), y = (e.clientY - r.top) * (c.height / r.height);
    return { x: (x - t.ox) / t.s, y: (y - t.oy) / t.s };
  };

  useEffect(() => {
    let raf = 0, last = performance.now();
    // adaptivní rozlišení náhledu: při přehrávání se plátno zmenší, když snímky nestíhají (~30 fps),
    // a po zastavení se vrátí na plnou ostrost. Export ani simulace se tím nemění.
    let q = 1, avg = 16, settleUntil = 0;
    const LEVELS = [1, 0.8, 0.66, 0.5];
    const resize = () => {
      const c = ref.current, w = wrap.current; if (!c || !w) return;
      const dpr = (window.devicePixelRatio || 1) * q;
      const W = Math.max(10, Math.floor(w.clientWidth * dpr)), H = Math.max(10, Math.floor(w.clientHeight * dpr));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    };
    const loop = (now: number) => {
      // skryté okno: prohlížeč smyčku pozastaví; po návratu žádné dohánění (krok nejvýš 0,25 s)
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (!document.hidden) {
        const t0 = performance.now(); store.sim.tick(dt); draw(); const ms = performance.now() - t0;
        avg = avg * 0.9 + ms * 0.1;
        const W = window as unknown as { __perf?: number[][] }; if (W.__perf) { W.__perf.push([ms, q]); if (W.__perf.length > 4000) W.__perf.shift(); } // ladění výkonu
        const playing = store.sim.clock.playing;
        const want = !playing ? 0 : avg > 30 ? Math.min(LEVELS.length - 1, LEVELS.indexOf(q) + 1) : avg < 12 ? Math.max(0, LEVELS.indexOf(q) - 1) : LEVELS.indexOf(q);
        if (LEVELS[want] !== q && now > settleUntil) { q = LEVELS[want]; resize(); settleUntil = now + 600; avg = 16; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current!);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  /** prefers-reduced-motion: bez třpytu, bez ledové tříště, slabší sněžení */
  function reducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }

  /** Zaměření kamery (galerie): plynulý přechod na obdélník / za sledovanou postavou. */
  const focusN = useRef(-1), focusRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  function applyFocus() {
    const f = store.state.focus, c = ref.current, p = store.state.project; if (!f || !c || !p) return;
    if (f.n !== focusN.current) { focusN.current = f.n; focusRect.current = f.rect ?? null; if (!f.rect && !f.agentId) { view.current = { zoom: 1, panX: 0, panY: 0 }; setZoomPct(100); return; } }
    let R = focusRect.current;
    const a = f.agentId ? store.sim.sim?.state.agents.find((x) => x.id === f.agentId && !x.hidden) : undefined;
    if (a) { const w = R?.w ?? 760, h = R?.h ?? 430; R = { x: a.pos.x - w / 2, y: a.pos.y - h * 0.68, w, h }; }
    if (!R) return;
    const fit = Math.min(c.width / p.scene.width, c.height / p.scene.height) * 0.94;
    const zoom = Math.max(1, Math.min(4, Math.min(c.width / (R.w * fit), c.height / (R.h * fit)) * 0.95));
    const s2 = fit * zoom, cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    const tx = (p.scene.width / 2 - cx) * s2, ty = (p.scene.height / 2 - cy) * s2, v = view.current, k = 0.12;
    v.zoom += (zoom - v.zoom) * k; v.panX += (tx - v.panX) * k; v.panY += (ty - v.panY) * k;
    const pct = Math.round(v.zoom * 100); if (Math.abs(pct - zoomPctRef.current) >= 2) { zoomPctRef.current = pct; setZoomPct(pct); }
  }
  const zoomPctRef = useRef(100);
  function draw() {
    applyFocus();
    const c = ref.current; const st = store.state; if (!c || !st.project) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#151824'; ctx.fillRect(0, 0, c.width, c.height);
    const t = xf(), p = st.project;
    ctx.setTransform(t.s, 0, 0, t.s, t.ox, t.oy);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, p.scene.width, p.scene.height); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    drawScene(ctx, p, store.sim.sim, store.images, { time: store.sim.time(), reducedMotion: reducedMotion() });
    ctx.restore();
    const px = t.dpr / t.s;
    if (st.showMarkers) {
      drawOverlay(ctx, {
        project: p, sim: store.sim.sim, selection: st.selection, tool: st.tool, px, routeActiveNode: st.routeActiveNode,
        drawing: st.drawing, mouse: mouse.current, dragRect: dragRect.current, rigDiagnostics: st.rigDiagnostics, clearingDebug: st.clearingDebug, gaitDebug: st.gaitDebug, fallDebug: st.fallDebug, snowmanDebug: st.snowmanDebug, rinkDebug: st.rinkDebug, hover: hover.current && hover.current.kind === 'object' ? { kind: 'object', id: hover.current.id } : null,
      });
    }
    // rámeček exportovaného záběru
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = px; ctx.strokeRect(0, 0, p.scene.width, p.scene.height);
  }

  const onWheel = (e: React.WheelEvent) => {
    if (store.state.focus) store.set({ focus: null });
    const c = ref.current!, r = c.getBoundingClientRect();
    const before = toScene(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    view.current.zoom = Math.min(8, Math.max(0.2, view.current.zoom * factor));
    // zachovat bod pod kurzorem
    const t = xf();
    const sx = (e.clientX - r.left) * (c.width / r.width), sy = (e.clientY - r.top) * (c.height / r.height);
    view.current.panX += sx - (before.x * t.s + t.ox);
    view.current.panY += sy - (before.y * t.s + t.oy);
    setZoomPct(Math.round(view.current.zoom * 100));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const st = store.state; if (!st.project) return;
    const m = toScene(e); const t = xf(); const px = t.dpr / t.s;
    const screen = { x: e.clientX, y: e.clientY };
    if (e.button === 1 || st.tool === 'pan' || (e.button === 0 && e.altKey)) { drag.current = { hit: { kind: 'pan' }, start: m, startScreen: screen, started: true, lastScreen: screen }; return; }
    if (e.button === 2 || (e.button === 0 && st.tool === 'action')) { openActions(e, m, px); return; }
    if (e.button !== 0) return;
    const hit = hitTest(st.project, store.sim.sim, st.selection, m, px, st.showMarkers);
    if (st.tool === 'smoke') {
      // kouř / pára: klik na zdroj = posun tažením, jinam = nový komín
      const srcs = st.project.scene.environment?.sources ?? [], i = srcs.findIndex((q) => dist(q, m) <= 14 * px);
      if (i >= 0) drag.current = { hit: { kind: 'smoke', index: i } as never, start: m, startScreen: screen, started: true, lastScreen: screen };
      else addSource(e.shiftKey ? 'steam' : 'smoke', m);
      return;
    }
    switch (st.tool) {
      case 'route': {
        if (hit?.kind === 'node') {
          if (st.routeActiveNode && st.routeActiveNode !== hit.id) connectNodes(st.routeActiveNode, hit.id);
          store.set({ routeActiveNode: hit.id, selection: { kind: 'node', id: hit.id } });
          drag.current = { hit, start: m, startScreen: screen, started: false, lastScreen: screen };
        } else {
          const id = addNode(m.x, m.y, st.routeActiveNode);
          store.set({ routeActiveNode: id, selection: { kind: 'node', id } });
        }
        return;
      }
      case 'obstacle': case 'snow': {
        const d = st.drawing;
        if (d.length >= 3 && dist(d[0], m) < 12 * px) { addArea(st.tool, d); return; }
        store.set({ drawing: [...d, m] });
        return;
      }
      case 'zone': dragRect.current = { a: m, b: m }; drag.current = { hit: { kind: 'zoneRect' }, start: m, startScreen: screen, started: true, lastScreen: screen }; return;
      case 'character': addCharacter(m.x, m.y); return;
    }
    // nástroj Výběr
    if (!hit) { store.set({ selection: null }); drag.current = { hit: { kind: 'pan' }, start: m, startScreen: screen, started: false, lastScreen: screen }; return; }
    if (hit.kind === 'point') store.set({ selection: { kind: 'point', id: hit.id, pointId: hit.pointId } });
    else if (hit.kind === 'scaleHandle' || hit.kind === 'vertex') { /* výběr se nemění */ }
    else store.set({ selection: { kind: hit.kind, id: hit.id } });
    drag.current = { hit, start: m, startScreen: screen, started: false, lastScreen: screen };
  };

  const openActions = (e: React.MouseEvent, m: Vec2, px: number) => {
    const st = store.state; if (!st.project) return;
    const hit = hitTest(st.project, store.sim.sim, null, m, px, false);
    const items = actionsAt(m, hit?.kind === 'character' ? hit.id : null);
    const r = wrap.current!.getBoundingClientRect();
    store.set({ actionMenu: { x: Math.min(e.clientX - r.left, r.width - 230), y: Math.min(e.clientY - r.top, r.height - 24 * items.length - 10), items } });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const st = store.state; if (!st.project) return;
    const m = toScene(e); mouse.current = m;
    const t = xf(); const px = t.dpr / t.s;
    const d = drag.current;
    if (d && (d.hit as { kind: string }).kind === 'smoke') { (d as { last?: Vec2 }).last = m; return; } // posun se zapíše po puštění (bez přestavění simulace)
    if (!d) { if (st.tool === 'select') hover.current = hitTest(st.project, store.sim.sim, st.selection, m, px, st.showMarkers); return; }
    const screen = { x: e.clientX, y: e.clientY };
    if (!d.started) {
      if (Math.hypot(screen.x - d.startScreen.x, screen.y - d.startScreen.y) < 4) return;
      d.started = true;
      if (d.hit && d.hit.kind !== 'pan' && d.hit.kind !== 'zoneRect') store.beginGesture();
    }
    const h = d.hit;
    if (!h) return;
    if (h.kind === 'pan') {
      view.current.panX += (screen.x - d.lastScreen.x) * t.dpr; view.current.panY += (screen.y - d.lastScreen.y) * t.dpr;
      d.lastScreen = screen; return;
    }
    if (h.kind === 'zoneRect') { dragRect.current = { a: d.start, b: m }; return; }
    const dx = m.x - d.start.x, dy = m.y - d.start.y;
    d.start = m;
    const round = (v: number) => Math.round(v * 10) / 10;
    switch (h.kind) {
      case 'object': store.live((p) => { const o = p.objects.find((x) => x.id === h.id); if (o && !o.locked) { o.x = round(o.x + dx); o.y = round(o.y + dy); } }); break;
      case 'scaleHandle': store.live((p) => {
        const o = p.objects.find((x) => x.id === h.id); if (!o) return;
        const a = p.assets.find((x) => x.id === o.assetId);
        const h0 = (a?.height ?? 100) * (a?.pixelScale ?? 1);
        const an = o.anchor ?? a?.anchor ?? { x: 0.5, y: 1 };
        const H = Math.max(8, (o.y - m.y) / Math.max(0.05, an.y));
        o.scale = Math.max(0.05, Math.min(20, Math.round((H / h0) * 1000) / 1000)); // rovnoměrně ⇒ poměr stran zachován
      }); break;
      case 'point': store.live((p) => {
        const o = p.objects.find((x) => x.id === h.id); const pt = o?.interaction?.points.find((q) => q.id === h.pointId); if (!o || !pt) return;
        pt.offset = { x: round(pt.offset.x + (o.flipX ? -dx : dx) / o.scale), y: round(pt.offset.y + dy / o.scale) };
      }); break;
      case 'node': store.live((p) => { const n = p.nav.nodes.find((x) => x.id === h.id); if (n) { n.x = Math.round(n.x + dx); n.y = Math.round(n.y + dy); } }); break;
      case 'vertex': store.live((p) => { const arr = h.owner === 'plow' ? p.plow?.path : h.owner === 'area' ? p.areas.find((x) => x.id === h.id)?.polygon : p.zones.find((x) => x.id === h.id)?.bounds; if (arr) arr[h.index] = { x: Math.round(m.x), y: Math.round(m.y) }; }); break;
      case 'area': store.live((p) => { const a = p.areas.find((x) => x.id === h.id); if (a) a.polygon = a.polygon.map((q) => ({ x: q.x + dx, y: q.y + dy })); }); break;
      case 'zone': store.live((p) => { const z = p.zones.find((x) => x.id === h.id); if (z) z.bounds = z.bounds.map((q) => ({ x: q.x + dx, y: q.y + dy })); }); break;
      case 'character': store.live((p) => {
        const c = p.characters.find((x) => x.id === h.id); if (!c || !p.nav.nodes.length) return;
        const n = p.nav.nodes.reduce((b, q) => (dist(q, m) < dist(b, m) ? q : b)); c.startNodeId = n.id;
      }); break;
    }
  };

  const onMouseUp = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if ((d.hit as { kind: string }).kind === 'smoke') { const i = (d.hit as unknown as { index: number }).index, m = (d as { last?: Vec2 }).last; if (m) store.editLive('Přesun zdroje kouře', (p) => { const q = p.scene.environment!.sources[i]; q.x = Math.round(m.x); q.y = Math.round(m.y); }); return; }
    if (d.hit?.kind === 'zoneRect' && dragRect.current) { addZone(store.state.zoneType, dragRect.current.a, dragRect.current.b); dragRect.current = null; return; }
    if (d.started && d.hit && d.hit.kind !== 'pan') {
      const labels: Record<string, string> = { smoke: 'Přesun zdroje kouře', object: 'Přesun objektu', scaleHandle: 'Změna měřítka', point: 'Úprava interakčního bodu', node: 'Přesun bodu trasy', vertex: (d.hit as { owner?: string }).owner === 'plow' ? 'Úprava trasy traktoru' : 'Úprava tvaru', area: 'Přesun oblasti', zone: 'Přesun zóny', character: 'Změna počátečního bodu postavy' };
      store.endGesture(labels[d.hit.kind] ?? 'Úprava');
    }
  };

  const onDoubleClick = () => {
    const st = store.state;
    if ((st.tool === 'obstacle' || st.tool === 'snow') && st.drawing.length >= 3) addArea(st.tool, st.drawing);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('application/x-zs-asset');
    if (!id) return;
    const asset = store.state.project?.assets.find((a) => a.id === id) ?? store.state.builtins.find((a) => a.id === id);
    if (asset) await placeAsset(asset, toScene(e).x, toScene(e).y);
  };

  const cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : tool === 'action' ? 'pointer' : 'crosshair';
  return (
    <div className="canvas-wrap" ref={wrap} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <canvas ref={ref} data-testid="scene-canvas" style={{ cursor }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={() => { mouse.current = null; onMouseUp(); }}
        onDoubleClick={onDoubleClick} onContextMenu={(e) => e.preventDefault()} />
      <ActionMenu />
      <GalleryPlayer />
      <div className="canvas-hud">
        <span>Přiblížení {zoomPct} %</span>
        <button onClick={() => { view.current = { zoom: 1, panX: 0, panY: 0 }; setZoomPct(100); }}>Celý záběr</button>
        <span className="muted">Kolečko = zoom · prostřední tlačítko / Alt+tažení = posun · zoom nemění export</span>
      </div>
      <ToolHint />
    </div>
  );
}

function ToolHint() {
  const tool = useEditor((s) => s.tool);
  const drawing = useEditor((s) => s.drawing);
  const hints: Record<string, string> = {
    route: 'Trasa: klik do prázdna = nový bod (napojí se na aktivní), klik na bod = spojení / aktivace. Esc = ukončit.',
    obstacle: `Překážka: klikáním přidávejte body, uzavřete klikem na první bod nebo dvojklikem (Enter). Bodů: ${drawing.length}`,
    snow: `Plocha sněhu: klikáním přidávejte body, uzavřete klikem na první bod nebo dvojklikem (Enter). Bodů: ${drawing.length}`,
    zone: 'Zóna činnosti: tažením vymezte celkový prostor činnosti. Objekty uvnitř se přiřadí automaticky.',
    character: 'Postava: klikněte poblíž bodu trasy – postava v něm začne.',
    action: 'Akce: klikněte na postavu, bruslaře, kluziště nebo zónu – nabídka událostí, které se hned spustí. (Pravé tlačítko funguje v každém nástroji.)',
    smoke: 'Kouř: klik = nový komín (Shift+klik = pára), tažením zdroj posunete. Úprava síly a smazání vpravo v panelu Scéna → Živé prostředí.',
  };
  if (!hints[tool]) return null;
  return <div className="tool-hint">{hints[tool]}</div>;
}
