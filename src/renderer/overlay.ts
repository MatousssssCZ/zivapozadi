/**
 * Editorové značky (trasy, zóny, oblasti, výběr). Kreslí se POUZE na editorové plátno –
 * export ani náhled bez značek tento modul nikdy nevolají.
 */
import type { ProjectFile, SceneObject } from '../core/model/types';
import type { Simulation } from '../core/sim/simulation';
import type { Selection, Tool } from './store';
import { objectImageRect } from '../core/render/sceneRenderer';
import { objectFootprintWorld } from '../core/scene/geometry';
import { getActivity } from '../core/activities/registry';
import { polygonsOverlap } from '../core/math/geom';
import { characterVisual } from '../core/render/characterPose';
import type { Vec2 } from '../core/math/vec';

/** Jedinečná barva editorových bodů (testy ověřují, že se v exportu nevyskytuje). */
export const MARKER_ACCENT = '#ff00e6';

export interface OverlayInput {
  project: ProjectFile; sim: Simulation | null; selection: Selection; tool: Tool;
  px: number; // velikost 1 obrazovkového pixelu v logických jednotkách
  routeActiveNode: string | null; drawing: Vec2[]; mouse: Vec2 | null; dragRect: { a: Vec2; b: Vec2 } | null;
  hover: Selection;
}

type Ctx = CanvasRenderingContext2D;

function poly(ctx: Ctx, pts: Vec2[], close = true) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (close) ctx.closePath();
}
function label(ctx: Ctx, text: string, x: number, y: number, px: number, color = '#fff', bg = 'rgba(20,24,40,0.78)') {
  ctx.font = `${12 * px}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 8 * px;
  ctx.fillStyle = bg; ctx.fillRect(x - w / 2, y - 16 * px, w, 16 * px);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - 8 * px);
}
function arrow(ctx: Ctx, a: Vec2, b: Vec2, at: number, size: number, color: string) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const x = a.x + (b.x - a.x) * at, y = a.y + (b.y - a.y) * at;
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
  ctx.lineTo(x + Math.cos(ang + 2.5) * size, y + Math.sin(ang + 2.5) * size);
  ctx.lineTo(x + Math.cos(ang - 2.5) * size, y + Math.sin(ang - 2.5) * size);
  ctx.closePath(); ctx.fill();
}
function facingTick(ctx: Ctx, p: Vec2, facing: number | undefined, px: number, color: string) {
  if (facing === undefined) return;
  ctx.strokeStyle = color; ctx.lineWidth = 2 * px;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(facing) * 16 * px, p.y + Math.sin(facing) * 16 * px); ctx.stroke();
}

export function drawOverlay(ctx: Ctx, o: OverlayInput) {
  const { project: p, px, selection: sel } = o;
  const isSel = (kind: string, id: string) => sel?.kind === kind && sel.id === id;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // Oblasti
  for (const a of p.areas) {
    if (a.polygon.length < 2) continue;
    poly(ctx, a.polygon);
    if (a.kind === 'obstacle') { ctx.fillStyle = 'rgba(230,60,60,0.18)'; ctx.strokeStyle = 'rgba(220,40,40,0.9)'; ctx.setLineDash([]); }
    else { ctx.fillStyle = 'rgba(90,170,255,0.16)'; ctx.strokeStyle = 'rgba(60,140,255,0.9)'; ctx.setLineDash([8 * px, 5 * px]); }
    ctx.fill(); ctx.lineWidth = (isSel('area', a.id) ? 3 : 1.5) * px; ctx.stroke(); ctx.setLineDash([]);
    const c = a.polygon.reduce((s, q) => ({ x: s.x + q.x / a.polygon.length, y: s.y + q.y / a.polygon.length }), { x: 0, y: 0 });
    label(ctx, (a.kind === 'obstacle' ? '⛔ ' : '❄ ') + a.name, c.x, c.y, px);
    if (isSel('area', a.id)) for (const q of a.polygon) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = px; ctx.fillRect(q.x - 4 * px, q.y - 4 * px, 8 * px, 8 * px); ctx.strokeRect(q.x - 4 * px, q.y - 4 * px, 8 * px, 8 * px); }
  }

  // Kolizní stopy objektů (pevné překážky)
  for (const ob of p.objects) {
    if (!ob.visible || ob.layer !== 'world') continue;
    const fp = objectFootprintWorld(ob); if (!fp) continue;
    poly(ctx, fp); ctx.fillStyle = 'rgba(230,60,60,0.12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(220,40,40,0.55)'; ctx.lineWidth = px; ctx.stroke();
  }

  // Zóny činností
  for (const z of p.zones) {
    const selected = isSel('zone', z.id);
    const def = getActivity(z.activityType)?.definition;
    poly(ctx, z.bounds);
    ctx.setLineDash([10 * px, 6 * px]);
    ctx.strokeStyle = z.enabled ? 'rgba(150,90,230,0.95)' : 'rgba(150,150,150,0.8)'; ctx.lineWidth = (selected ? 3 : 1.5) * px; ctx.stroke(); ctx.setLineDash([]);
    if (selected) { ctx.fillStyle = 'rgba(150,90,230,0.10)'; ctx.fill(); }
    const top = z.bounds.reduce((b, q) => (q.y < b.y ? q : b), z.bounds[0]);
    label(ctx, `◆ ${z.name}${def ? '' : ' (neznámá činnost)'}`, top.x + 80 * px, top.y + 18 * px, px, '#f0e6ff', 'rgba(90,50,150,0.85)');
    if (selected) {
      for (const q of z.bounds) { ctx.fillStyle = '#e8dcff'; ctx.fillRect(q.x - 4 * px, q.y - 4 * px, 8 * px, 8 * px); }
      // Požadovaný povrch
      if (def?.surface === 'snow') {
        for (const a of p.areas) if (a.kind === 'snow' && polygonsOverlap(a.polygon, z.bounds)) { poly(ctx, a.polygon); ctx.fillStyle = 'rgba(80,200,255,0.3)'; ctx.fill(); }
      }
      drawZonePoints(ctx, o, z.objectRoles);
    }
  }

  // Síť tras
  const nodes = new Map(p.nav.nodes.map((n) => [n.id, n]));
  const blocked = new Set(o.sim?.graph.blocked.map((b) => b.edgeId) ?? []);
  for (const e of p.nav.edges) {
    const a = nodes.get(e.a), b = nodes.get(e.b); if (!a || !b) continue;
    const selected = isSel('edge', e.id);
    ctx.strokeStyle = blocked.has(e.id) ? 'rgba(235,40,40,0.95)' : e.narrow ? 'rgba(255,150,30,0.95)' : 'rgba(20,170,170,0.9)';
    ctx.lineWidth = (selected ? 5 : e.narrow ? 4 : 2.5) * px;
    if (e.narrow) ctx.setLineDash([6 * px, 4 * px]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    const col = blocked.has(e.id) ? 'rgba(235,40,40,1)' : 'rgba(10,120,130,1)';
    if (e.oneWay) { arrow(ctx, a, b, 0.4, 9 * px, col); arrow(ctx, a, b, 0.6, 9 * px, col); }
    else { arrow(ctx, a, b, 0.62, 6 * px, col); arrow(ctx, b, a, 0.62, 6 * px, col); }
    if (blocked.has(e.id)) { const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; label(ctx, 'přes překážku!', m.x, m.y - 6 * px, px, '#fff', 'rgba(200,30,30,0.9)'); }
  }
  for (const n of p.nav.nodes) {
    const selected = isSel('node', n.id), active = o.routeActiveNode === n.id;
    ctx.fillStyle = MARKER_ACCENT; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * px;
    const r = (n.stop ? 8 : 6) * px;
    ctx.beginPath();
    if (n.stop) ctx.rect(n.x - r, n.y - r, r * 2, r * 2); else ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (selected || active) { ctx.strokeStyle = active ? '#ffe14d' : '#ffffff'; ctx.lineWidth = 2.5 * px; ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 * px, 0, Math.PI * 2); ctx.stroke(); }
    if (n.stop) { label(ctx, `⏱ ${n.name ?? ''} ${n.stop.waitMin}–${n.stop.waitMax} s${n.stop.activity ? ' + ' + n.stop.activity : ''}`, n.x, n.y - 12 * px, px); facingTick(ctx, n, n.stop.look.mode === 'direction' ? n.stop.look.angle : undefined, px, '#ffe14d'); }
  }
  if (o.tool === 'route' && o.routeActiveNode && o.mouse) {
    const a = nodes.get(o.routeActiveNode);
    if (a) { ctx.strokeStyle = 'rgba(255,225,77,0.8)'; ctx.setLineDash([6 * px, 6 * px]); ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(o.mouse.x, o.mouse.y); ctx.stroke(); ctx.setLineDash([]); }
  }

  // Vybraný objekt
  if (sel && (sel.kind === 'object' || sel.kind === 'point')) {
    const ob = p.objects.find((x) => x.id === sel.id);
    if (ob) drawObjectSelection(ctx, o, ob);
  }
  if (o.hover && o.hover.kind === 'object' && !(sel && sel.id === o.hover.id)) {
    const ob = p.objects.find((x) => x.id === o.hover!.id);
    if (ob) { const r = objectImageRect(ob, p.assets.find((a) => a.id === ob.assetId)); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = px; ctx.setLineDash([4 * px, 4 * px]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]); }
  }

  // Postavy: jméno, stav, označení provizorního vzhledu
  if (o.sim) {
    for (const a of o.sim.state.agents) {
      const c = o.sim.characterOf(a.id); if (!c) continue;
      const m = o.sim.manifests[c.assetId]; if (!m) continue;
      const cv = characterVisual(a, m, c.baseScale, p.scene.depth);
      const selected = isSel('character', a.id);
      const top = cv.y - m.height * cv.scale - 8;
      label(ctx, `${a.name}${m.provisional ? ' · provizorní' : ''}`, cv.x, top, px, selected ? '#ffe14d' : '#fff');
      if (selected) {
        label(ctx, a.status, cv.x, top - 18 * px, px, '#cde', 'rgba(20,24,40,0.6)');
        ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.ellipse(cv.x, cv.y, 22 * cv.scale, 7 * cv.scale, 0, 0, Math.PI * 2); ctx.stroke();
        if (a.route) {
          ctx.strokeStyle = 'rgba(255,225,77,0.9)'; ctx.setLineDash([3 * px, 5 * px]); ctx.lineWidth = 2 * px;
          poly(ctx, [a.pos, ...a.route.wps.slice(a.route.idx)], false); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
  } else {
    for (const c of p.characters) { const n = nodes.get(c.startNodeId); if (n) label(ctx, c.name + ' (start)', n.x, n.y - 30 * px, px); }
  }

  // Rozpracovaný polygon / obdélník zóny
  if (o.drawing.length) {
    const pts = o.mouse ? [...o.drawing, o.mouse] : o.drawing;
    ctx.strokeStyle = o.tool === 'obstacle' ? '#ff5050' : '#5aaaff'; ctx.lineWidth = 2 * px; ctx.setLineDash([5 * px, 4 * px]);
    poly(ctx, pts, false); ctx.stroke(); ctx.setLineDash([]);
    for (const q of o.drawing) { ctx.fillStyle = '#fff'; ctx.fillRect(q.x - 3 * px, q.y - 3 * px, 6 * px, 6 * px); }
  }
  if (o.dragRect) {
    const { a, b } = o.dragRect;
    ctx.strokeStyle = 'rgba(170,110,255,1)'; ctx.setLineDash([8 * px, 5 * px]); ctx.lineWidth = 2 * px;
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawZonePoints(ctx: Ctx, o: OverlayInput, roles: Record<string, string[]>) {
  const { px } = o;
  const ids = new Set(Object.values(roles).flat());
  const nodes = new Map(o.project.nav.nodes.map((n) => [n.id, n]));
  for (const id of ids) {
    const ob = o.project.objects.find((x) => x.id === id); if (!ob) continue;
    const r = objectImageRect(ob, o.project.assets.find((a) => a.id === ob.assetId));
    ctx.strokeStyle = 'rgba(190,150,255,0.9)'; ctx.lineWidth = 1.5 * px; ctx.strokeRect(r.x, r.y, r.w, r.h);
    for (const rp of o.sim?.pointsOf(id) ?? []) drawPoint(ctx, rp.pos, rp.point.kind, rp.facing, px, o.sim?.state.reservations[rp.key] !== undefined);
    for (const rp of o.sim?.pointsOf(id) ?? []) {
      const n = rp.entryNode ? nodes.get(rp.entryNode) : null;
      if (rp.point.kind === 'counter') continue;
      if (n) { ctx.strokeStyle = 'rgba(70,220,120,0.9)'; ctx.setLineDash([2 * px, 4 * px]); ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(rp.pos.x, rp.pos.y); ctx.stroke(); ctx.setLineDash([]); }
      else label(ctx, 'nedosažitelné!', rp.pos.x, rp.pos.y - 10 * px, px, '#fff', 'rgba(200,30,30,0.9)');
    }
  }
}

const POINT_COLORS: Record<string, string> = { service: '#ffb02e', queue: '#ffe7a0', seat: '#5fd38d', view: '#6fc3ff', drop: '#c0a080', counter: '#ffffff', work: '#ff8a65' };
const POINT_LABELS: Record<string, string> = { service: 'obsluha', queue: 'fronta', seat: 'místo', view: 'výhled', drop: 'koš', counter: 'pult', work: 'práce' };

function drawPoint(ctx: Ctx, pos: Vec2, kind: string, facing: number | undefined, px: number, reserved: boolean) {
  const col = POINT_COLORS[kind] ?? '#fff';
  const entry = kind === 'queue';
  ctx.lineWidth = 2 * px; ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, 6 * px, 0, Math.PI * 2);
  if (entry || kind === 'counter') ctx.stroke(); else ctx.fill();
  if (reserved) { ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 2.5 * px; ctx.beginPath(); ctx.arc(pos.x, pos.y, 10 * px, 0, Math.PI * 2); ctx.stroke(); }
  facingTick(ctx, pos, facing, px, col);
  ctx.font = `${10 * px}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3 * px;
  ctx.strokeText(POINT_LABELS[kind] ?? kind, pos.x, pos.y + 18 * px); ctx.fillText(POINT_LABELS[kind] ?? kind, pos.x, pos.y + 18 * px);
}

export function objectHandles(ob: SceneObject, p: ProjectFile, px: number) {
  const r = objectImageRect(ob, p.assets.find((a) => a.id === ob.assetId));
  return { rect: r, scale: { x: r.x + r.w, y: r.y, size: 10 * px } };
}

function drawObjectSelection(ctx: Ctx, o: OverlayInput, ob: SceneObject) {
  const { px, project: p } = o;
  const h = objectHandles(ob, p, px);
  const r = h.rect;
  ctx.strokeStyle = ob.locked ? 'rgba(255,170,60,0.95)' : 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([6 * px, 4 * px]);
  ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
  // kotevní bod (kontakt se zemí)
  ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2 * px;
  ctx.beginPath(); ctx.moveTo(ob.x - 8 * px, ob.y); ctx.lineTo(ob.x + 8 * px, ob.y); ctx.moveTo(ob.x, ob.y - 8 * px); ctx.lineTo(ob.x, ob.y + 8 * px); ctx.stroke();
  if (!ob.locked) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = px; ctx.fillRect(h.scale.x - h.scale.size / 2, h.scale.y - h.scale.size / 2, h.scale.size, h.scale.size); ctx.strokeRect(h.scale.x - h.scale.size / 2, h.scale.y - h.scale.size / 2, h.scale.size, h.scale.size); }
  label(ctx, `${ob.name}${ob.locked ? ' 🔒' : ''}`, r.x + r.w / 2, r.y - 4 * px, px);
  const fp = objectFootprintWorld(ob);
  if (fp) { poly(ctx, fp); ctx.strokeStyle = 'rgba(255,60,60,1)'; ctx.lineWidth = 2 * px; ctx.stroke(); }
  for (const rp of o.sim?.pointsOf(ob.id) ?? []) {
    drawPoint(ctx, rp.pos, rp.point.kind, rp.facing, px, o.sim?.state.reservations[rp.key] !== undefined);
    if (o.selection?.kind === 'point' && o.selection.pointId === rp.point.id) { ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(rp.pos.x, rp.pos.y, 12 * px, 0, Math.PI * 2); ctx.stroke(); }
  }
}
