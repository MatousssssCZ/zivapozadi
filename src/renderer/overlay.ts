/**
 * Editorové značky (trasy, zóny, oblasti, výběr). Kreslí se POUZE na editorové plátno –
 * export ani náhled bez značek tento modul nikdy nevolají.
 */
import { bakeryLabel } from '../core/sim/bakery';
import type { ProjectFile, SceneObject } from '../core/model/types';
import type { Simulation } from '../core/sim/simulation';
import type { Selection, Tool } from './store';
import { objectImageRect } from '../core/render/sceneRenderer';
import { objectFootprintWorld } from '../core/scene/geometry';
import { getActivity } from '../core/activities/registry';
import { polygonsOverlap } from '../core/math/geom';
import { characterVisual, localToScene, gaitContextFor } from '../core/render/characterPose';
import { ELDER_PROFILES } from '../core/anim/elderGait';
import { FALL_LABEL, FALL_PHASE_LABEL } from '../core/anim/fallPoses';
import { coopMassBalance, type CoopData } from '../core/activities/coopSnowman';
import { LEG_PHYS_M } from '../core/anim/gaitProfile';
import { cameraFor, toScreen } from '../core/scene/camera';
import { baseMass, cellMass, cellCenter, stocks } from '../core/sim/snowMaterial';
import type { Vec2 } from '../core/math/vec';
import { drawRigDiagnostics } from './rigDiagnostics';

/** Jedinečná barva editorových bodů (testy ověřují, že se v exportu nevyskytuje). */
export const MARKER_ACCENT = '#ff00e6';

export interface OverlayInput {
  project: ProjectFile; sim: Simulation | null; selection: Selection; tool: Tool;
  px: number; // velikost 1 obrazovkového pixelu v logických jednotkách
  routeActiveNode: string | null; drawing: Vec2[]; mouse: Vec2 | null; dragRect: { a: Vec2; b: Vec2 } | null;
  hover: Selection;
  /** Diagnostika skládaných postav (kostra, kotvy, názvy dílů). */
  rigDiagnostics?: boolean;
  /** Ladění odklízení: mřížka sněhu, hrana, úchopy, chodidla, fáze a zásoby. */
  clearingDebug?: boolean;
  /** Ladění chůze seniorů: opěrné body chodidel, hrot hole (kotva / švih), rukojeť, profil, krok, kadence. */
  gaitDebug?: boolean;
  /** Ladění pádů: kontakty (zelená = stojí, červená = klouže), fáze, pomocník. */
  fallDebug?: boolean;
  /** Ladění sněhuláka (rodič + dítě): úkoly, rezervace, hmotnosti a velikosti koulí, kontakty, sněhové pole. */
  snowmanDebug?: boolean;
  /** Ladění bruslení: stavy, profily, rychlosti, brusle, obrys ledu, plánovač událostí. */
  rinkDebug?: boolean;
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
  if (o.clearingDebug && o.sim) drawClearingDebug(ctx, o);
  if (o.gaitDebug && o.sim) drawGaitDebug(ctx, o);
  if (o.fallDebug && o.sim) drawFallDebug(ctx, o);
  if (o.snowmanDebug && o.sim) drawSnowmanDebug(ctx, o);
  if (o.rinkDebug && o.sim?.state.rink && o.project.rink) drawRinkDebug(ctx, o);
  if (o.rinkDebug && o.sim && (o.project.tram || o.project.bakery)) drawTramDebug(ctx, o);
  // zdroje kouře a páry (značky – posun tažením v nástroji Kouř)
  for (const q of o.project.scene.environment?.sources ?? []) {
    ctx.save(); ctx.strokeStyle = MARKER_ACCENT; ctx.lineWidth = 1.5 * o.px; ctx.fillStyle = q.kind === 'smoke' ? 'rgba(90,90,100,0.6)' : 'rgba(220,230,255,0.7)';
    ctx.beginPath(); ctx.arc(q.x, q.y, 7 * o.px, 0, 7); ctx.fill(); ctx.stroke();
    label(ctx, q.kind === 'smoke' ? 'kouř' : 'pára', q.x, q.y - 9 * o.px, o.px); ctx.restore();
  }
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

  // Trasa traktoru s pluhem (oranžová čárkovaná; body se dají táhnout, když je trasa vybraná)
  if (p.plow && p.plow.path.length >= 2) {
    const selPl = sel?.kind === 'plowPath', pts = p.plow.path;
    ctx.strokeStyle = selPl ? 'rgba(255,150,40,0.95)' : 'rgba(255,150,40,0.55)'; ctx.lineWidth = (selPl ? 3 : 2) * px; ctx.setLineDash([12 * px, 7 * px]);
    poly(ctx, pts, false); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 1; i < pts.length; i++) arrow(ctx, pts[i - 1], pts[i], 0.55, 7 * px, 'rgba(220,110,20,1)');
    const mid = pts[Math.floor(pts.length / 2)];
    label(ctx, '🚜 Trasa traktoru', mid.x, mid.y - 12 * px, px, '#fff3e0', 'rgba(170,80,10,0.85)');
    if (selPl) pts.forEach((q, i) => { ctx.fillStyle = i === 0 || i === pts.length - 1 ? '#ffd8a8' : '#ffffff'; ctx.strokeStyle = '#7a3a00'; ctx.lineWidth = px; ctx.beginPath(); ctx.arc(q.x, q.y, 6 * px, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); label(ctx, String(i + 1), q.x, q.y - 10 * px, px); });
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
      if (a.hidden) continue; // návštěvník mimo scénu
      const c = o.sim.characterOf(a.id); if (!c) continue;
      const m = o.sim.manifests[c.assetId]; if (!m) continue;
      const cv = characterVisual(a, m, c, p.scene);
      const selected = isSel('character', a.id);
      if (o.rigDiagnostics) {
        ctx.save(); ctx.translate(cv.x, cv.y); ctx.scale(cv.mirror ? -cv.scale : cv.scale, cv.scale);
        drawRigDiagnostics(ctx, cv, px / cv.scale, selected);
        ctx.restore();
      }
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

/** Ladicí náhled odklízení (jen editor, nikdy v exportu ani v živém pozadí). */
function drawRinkDebug(ctx: Ctx, o: OverlayInput) {
  const sim = o.sim!, st = sim.state.rink!, cfg = o.project.rink!, px = o.px, cam = cameraFor(o.project.scene), t = sim.time();
  ctx.save();
  ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([6 * px, 4 * px]);
  ctx.beginPath(); cfg.ice.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(cfg.gate.x, cfg.gate.y, 4 * px, 0, 7); ctx.fill();
  const colOf: Record<string, string> = { glide: '#22ff66', push: '#ff9800', light: '#9ecbff', return: '#888' };
  for (const s of Object.values(st.sk)) {
    const a = sim.state.agents.find((x) => x.id === s.id); if (!a) continue;
    const g = toScreen(cam, { X: s.X, Z: s.Z });
    // plánovaný směr (1 s dopředu) a odstup 0,6 m + v·1 s
    const f = toScreen(cam, { X: s.X + Math.cos(s.psi) * Math.max(0.3, s.v), Z: s.Z + Math.sin(s.psi) * Math.max(0.3, s.v) });
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 * px; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(f.x, f.y); ctx.stroke();
    const gap = 0.6 + s.v, ring = [...Array(17)].map((_, k) => toScreen(cam, { X: s.X + Math.cos((k / 16) * 6.283) * gap, Z: s.Z + Math.sin((k / 16) * 6.283) * gap }));
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ring.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
    // brusle: barva podle stavu (zelená = zatížený skluz, oranžová = odraz)
    [0, 1].forEach((i) => {
      const b = s.feet[i], side = b.lat, q = toScreen(cam, { X: s.X + Math.cos(s.psi) * b.u * 0.9 - Math.sin(s.psi) * side * 0.9, Z: s.Z + Math.sin(s.psi) * b.u * 0.9 + Math.cos(s.psi) * side * 0.9 });
      ctx.fillStyle = colOf[b.c]; ctx.beginPath(); ctx.arc(q.x, q.y, 3 * px, 0, 7); ctx.fill();
    });
    const ph = s.push.on ? `odraz ${Math.round((s.push.t / s.push.int) * 100)} % (${s.push.left})` : 'skluz';
    label(ctx, `${s.prof} · ${s.st} · ${s.v.toFixed(2)} m/s · ${ph}${s.trick ? ' · ' + s.trick.kind : ''}`, g.x, g.y + 18 * px, px, '#fff', s.st === 'FALL' || s.st === 'WOBBLE' ? 'rgba(160,30,30,0.85)' : s.st.startsWith('TRICK') ? 'rgba(30,110,40,0.85)' : 'rgba(20,24,40,0.7)');
  }
  const S = st.stats;
  const lines = [
    `událost: ${st.event ? `${st.event.kind} – ${sim.state.agents.find((x) => x.id === st.event!.id)?.name}` : '—'}`,
    `další pokus o pád za ${Math.max(0, st.nextFall - t).toFixed(0)} s · další prvek za ${Math.max(0, st.nextTrick - t).toFixed(0)} s${st.trickWindow !== null ? ' (hledá prostor)' : ''}`,
    `prvky ${S.tricks} (${Object.entries(S.tricksByKind).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}) · pády ${S.falls} · zaváhání ${S.wobbles} · odloženo ${S.deferred} · stop na ledě ${st.trails.length}`,
  ];
  lines.forEach((l, i) => label(ctx, l, o.project.scene.width / 2, 40 * px + i * 18 * px, px));
  ctx.restore();
}

/** Ladění tramvajové ulice: trať (kotevní body), zastávka, dveře, čekací místa, pekárna, stavy aktérů. */
function drawTramDebug(ctx: Ctx, o: OverlayInput) {
  const sim = o.sim!, p = o.project, px = o.px; ctx.save();
  if (p.tram) {
    const g = sim.tramGeometry(), st = sim.state.tram;
    ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 2 * px; ctx.beginPath(); g.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
    for (const q of g.pts) { ctx.fillStyle = '#ffb000'; ctx.fillRect(q.x - 2 * px, q.y - 2 * px, 4 * px, 4 * px); }
    const sx = p.tram.stopX; ctx.strokeStyle = '#ff3030'; ctx.beginPath(); ctx.moveTo(sx, 480); ctx.lineTo(sx, 700); ctx.stroke(); label(ctx, 'zastavení (přední podvozek)', sx, 478, px);
    p.tram.waitSpots.forEach((w, i) => { ctx.strokeStyle = sim.res.isFree(`tram:spot:${i}`) ? '#22ff66' : '#ff9800'; ctx.beginPath(); ctx.arc(w.x, w.y, 6 * px, 0, 7); ctx.stroke(); });
    const d = sim.tramDoor(); if (d) { ctx.strokeStyle = '#00e5ff'; ctx.beginPath(); d.quad.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke(); ctx.fillStyle = '#00e5ff'; ctx.beginPath(); ctx.arc(d.ground.x, d.ground.y, 4 * px, 0, 7); ctx.fill(); }
    if (st) label(ctx, `tramvaj: ${st.phase} · ${st.v.toFixed(1)} m/s · dveře ${(st.door * 100).toFixed(0)} % · výstup ${st.alighted}/${st.nAlight} · nástup ${st.boarded}/${st.nBoard} · průjezdů ${st.runs}${st.phase === 'wait' ? ` · další za ${Math.max(0, st.until - sim.time()).toFixed(0)} s` : ''}`, p.scene.width / 2, 40 * px, px);
  }
  if (p.bakery) {
    const b = p.bakery, st = sim.state.bakery; ctx.strokeStyle = '#ff00e6'; ctx.strokeRect(b.door.x0, b.door.y0, b.door.x1 - b.door.x0, b.door.y1 - b.door.y0);
    ctx.beginPath(); ctx.moveTo(b.sweep[0].x, b.sweep[0].y); ctx.lineTo(b.sweep[1].x, b.sweep[1].y); ctx.stroke();
    if (b.crateSpot) { ctx.beginPath(); ctx.arc(b.crateSpot.x, b.crateSpot.y, 5 * px, 0, 7); ctx.stroke(); }
    if (st) label(ctx, `pekař: ${bakeryLabel(st)}${st.phase === 'inside' ? ` · venku za ${Math.max(0, st.until - sim.time()).toFixed(0)} s` : ''} · cedule ${st.sign.side === 'open' ? 'Otevřeno' : 'Hned jsem zpět'} · bedýnka ${st.crate.out ? 'venku' : 'uvnitř'} · kbelík ${st.grits} · hotovo: zam. ${st.done.sweep}, posyp ${st.done.salt}, bedýnka ${st.done.crate}, cedule ${st.done.sign}`, p.scene.width / 2, 58 * px, px);
  }
  for (const a of sim.state.agents) if (!a.hidden && (a.tram || sim.characterOf(a.id)?.routine === 'baker')) label(ctx, `${a.name}: ${a.tram ? a.tram.role : a.status}`, a.pos.x, a.pos.y + 16 * px, px, '#fff', 'rgba(30,60,140,0.8)');
  ctx.restore();
}

function drawSnowmanDebug(ctx: Ctx, o: OverlayInput) {
  const sim = o.sim!, px = o.px, cam = cameraFor(o.project.scene);
  ctx.save();
  for (const s of sim.state.sessions ?? []) {
    const d = s.data as unknown as CoopData; if (!d?.coop) continue;
    // koule: obrys, hmotnost, průměr, vlastník
    for (const b of d.balls) {
      const g = toScreen(cam, { X: b.X, Z: b.Z }, b.H), R = (b.r * cam.f) / b.Z;
      ctx.strokeStyle = b.state === 'carried' ? '#ff0' : b.state === 'placed' ? '#22ff66' : '#00e5ff'; ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.arc(g.x, g.y, R, 0, 7); ctx.stroke();
      const own = b.owner ? sim.state.agents.find((x) => x.id === b.owner)?.name : '—';
      label(ctx, `${['spodní', 'prostřední', 'hlava'][b.k]} ⌀${(b.r * 200).toFixed(0)} cm · ${b.m.toFixed(2)} kg · ${b.state} · ${own}`, g.x, g.y - R - 4 * px, px);
    }
    // úkoly účastníků
    for (const id of [d.parent, d.child]) {
      const a = sim.state.agents.find((x) => x.id === id); if (!a || a.hidden) continue;
      const t = d.task[id]; const c = sim.characterOf(a.id), m = c ? sim.manifests[c.assetId] : undefined;
      const top = c && m ? characterVisual(a, m, c, o.project.scene) : null;
      label(ctx, `${a.name}: ${t?.name}/${t?.step}`, a.pos.x, a.pos.y - (top ? 150 * top.scale : 120), px, '#fff', id === d.parent ? 'rgba(40,60,140,0.85)' : 'rgba(140,60,40,0.85)');
    }
    // košík, rezervace, předání, bilance
    const bq = toScreen(cam, { X: d.basket.X, Z: d.basket.Z });
    const bal = coopMassBalance(sim.state, s);
    const lines = [
      `fáze ${s.phase}${d.handover ? ` · předání: ${d.handover.stage}` : ''}`,
      `rezervace: ${Object.entries(d.res).map(([k, v]) => `${k}→${sim.state.agents.find((x) => x.id === v)?.name ?? v}`).join(', ') || '—'}`,
      `sníh ze země ${bal.removed.toFixed(2)} kg = koule ${bal.inBalls.toFixed(2)} + spoj ${bal.joint.toFixed(2)} + v náručí ${bal.carried.toFixed(2)}`,
      `košík: ${d.basket.items.map((it) => `${it.kind}:${it.state}`).join(' ') || 'nepřipraven'}`,
    ];
    lines.forEach((l, i) => label(ctx, l, bq.x, bq.y + 26 * px + i * 18 * px, px));
    if (d.handover && ['contact', 'transfer'].includes(d.handover.stage)) {
      const P = sim.state.agents.find((x) => x.id === d.parent)!, C = sim.state.agents.find((x) => x.id === d.child)!;
      ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(P.pos.x, P.pos.y - 60); ctx.lineTo(C.pos.x, C.pos.y - 40); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFallDebug(ctx: Ctx, o: OverlayInput) {
  const sim = o.sim!, px = o.px, st = sim.state.falls;
  if (!st) return;
  ctx.save();
  for (const e of st.active) {
    const a = sim.state.agents.find((x) => x.id === e.agentId); if (!a || !a.anim.fall) continue;
    const c = sim.characterOf(a.id), m = c ? sim.manifests[c.assetId] : undefined; if (!c || !m) continue;
    const cv = characterVisual(a, m, c, o.project.scene);
    for (const k of cv.pose.fall?.contacts ?? []) { const p = localToScene(cv, k.p); ctx.fillStyle = k.slide ? '#ff2d2d' : '#22ff66'; ctx.beginPath(); ctx.arc(p.x, p.y, 4 * px, 0, 7); ctx.fill(); }
    const hp = e.helperId ? sim.state.agents.find((x) => x.id === e.helperId) : null;
    if (hp) { ctx.strokeStyle = '#ffd400'; ctx.setLineDash([5 * px, 4 * px]); ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.moveTo(hp.pos.x, hp.pos.y); ctx.lineTo(a.pos.x, a.pos.y); ctx.stroke(); ctx.setLineDash([]); }
    label(ctx, `${FALL_LABEL[a.anim.fall.v]} · ${FALL_PHASE_LABEL[cv.pose.fall?.ph ?? 'loss']} · ${a.anim.fall.t.toFixed(2)} s${e.slow !== 1 ? ` (zpomaleno ${e.slow}×)` : ''}${hp ? ` · pomáhá ${hp.name}` : ''}`, cv.x, cv.y - 140 * cv.scale, px);
  }
  for (const mk of st.marks) { const p = toScreen(cameraFor(o.project.scene), { X: mk.X, Z: mk.Z }); ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1 * px; ctx.beginPath(); ctx.arc(p.x, p.y, 3 * px, 0, 7); ctx.stroke(); }
  ctx.restore();
}

function drawGaitDebug(ctx: Ctx, o: OverlayInput) {
  const sim = o.sim!, px = o.px;
  ctx.save();
  for (const a of sim.state.agents) {
    const e = a.anim.elder; if (!e || a.hidden) continue;
    const c = sim.characterOf(a.id), m = c ? sim.manifests[c.assetId] : undefined; if (!c || !m) continue;
    const cv = characterVisual(a, m, c, o.project.scene);
    for (const an of a.anim.anchorsXY ?? []) if (an) { ctx.fillStyle = '#00e5ff'; ctx.fillRect(an.x - 3 * px, an.y - 3 * px, 6 * px, 6 * px); }
    const cn = cv.pose.cane;
    if (cn) {
      const t = localToScene(cv, cn.tip), g = localToScene(cv, cn.grip), w = localToScene(cv, cv.pose.arms[cn.hand].end);
      const planted = cn.tipLift === 0 && e.tip != null;
      ctx.fillStyle = planted ? '#22ff66' : '#ff9f1a'; ctx.beginPath(); ctx.arc(t.x, t.y, 4 * px, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ff0'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(g.x, g.y, 4 * px, 0, 7); ctx.stroke();
      ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(w.x, w.y, 2 * px, 0, 7); ctx.fill();
    }
    const L = gaitContextFor(m, c).legLen, stepM = ((a.anim.stride ?? 0) / 2) * (LEG_PHYS_M / L), v = a.anim.speedMps ?? 0;
    const txt = `${ELDER_PROFILES[e.p].label} · krok ${stepM.toFixed(2)} m · ${(stepM > 0 ? (v / stepM) * 60 : 0).toFixed(0)}/min · ${v.toFixed(2)} m/s${cn ? ` · hůl ${cn.hand ? 'blízká' : 'vzdálená'} ruka, ${cn.tipLift === 0 && e.tip != null ? 'opřena' : 'přenos'}` : ''}`;
    label(ctx, txt, cv.x, cv.y - 150 * cv.scale, px);
  }
  ctx.restore();
}

function drawClearingDebug(ctx: Ctx, o: OverlayInput) {
  const sim = o.sim!, st = sim.state.clearing, cfg = o.project.clearing, px = o.px;
  if (!st?.snow || !cfg) return;
  const s = st.snow, cam = cameraFor(o.project.scene), b = baseMass(s);
  // mřížka: hmotnost v buňkách (modrá = původní vrstva, oranžová = navršeno, průhledná = odklizeno)
  ctx.save();
  for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nx; i++) {
    const m = cellMass(s, i, j); if (m < 1e-4) continue;
    const c = cellCenter(s, i, j), h = s.p.cell / 2;
    const q = [toScreen(cam, { X: c.X - h, Z: c.Z - h }), toScreen(cam, { X: c.X + h, Z: c.Z - h }), toScreen(cam, { X: c.X + h, Z: c.Z + h }), toScreen(cam, { X: c.X - h, Z: c.Z + h })];
    ctx.fillStyle = m > b * 1.05 ? `rgba(255,140,40,${Math.min(0.8, 0.15 + (m - b) / (b * 8)).toFixed(2)})` : `rgba(60,120,255,${(0.45 * Math.min(1, m / b)).toFixed(2)})`;
    poly(ctx, q); ctx.fill();
  }
  // pracovní plocha
  const w = cfg.work;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([4 * px, 3 * px]);
  poly(ctx, [toScreen(cam, { X: w.x0, Z: w.z0 }), toScreen(cam, { X: w.x1, Z: w.z0 }), toScreen(cam, { X: w.x1, Z: w.z1 }), toScreen(cam, { X: w.x0, Z: w.z1 })]); ctx.stroke(); ctx.setLineDash([]);
  // pracovní hrana v kontaktu
  if (s.edge) { const A = toScreen(cam, s.edge.A), B = toScreen(cam, s.edge.B); ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 3 * px; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
  // postava: úchopy, hrana listu, opěrné body chodidel
  const a = sim.state.agents.find((x) => x.id === cfg.workerId);
  if (a && !a.hidden) {
    const c = sim.characterOf(a.id), m = c ? sim.manifests[c.assetId] : undefined;
    if (c && m) {
      const cv = characterVisual(a, m, c, o.project.scene), T = cv.pose.tool;
      if (T) {
        for (const [k, g] of T.grips.entries()) { const p = localToScene(cv, g), e = localToScene(cv, cv.pose.arms[k].end); ctx.strokeStyle = '#ff0'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(p.x, p.y, 5 * px, 0, 7); ctx.stroke(); ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(e.x, e.y, 2.5 * px, 0, 7); ctx.fill(); }
        const e = localToScene(cv, T.edge); ctx.fillStyle = '#ff2d55'; ctx.beginPath(); ctx.arc(e.x, e.y, 4 * px, 0, 7); ctx.fill();
      }
      for (const an of a.anim.anchorsXY ?? []) if (an) { ctx.fillStyle = '#00e5ff'; ctx.fillRect(an.x - 3 * px, an.y - 3 * px, 6 * px, 6 * px); }
    }
  }
  // fáze a zásoby
  const sk = stocks(s);
  const lines = [`fáze: ${st.phase}  pruh ${st.lane + 1}`, `povrch ${sk.surface.toFixed(2)} kg · val ${sk.ridge.toFixed(2)} · list ${sk.blade.toFixed(2)} · vzduch ${sk.air.toFixed(2)}`, `okraj+hromada ${sk.edge.toFixed(2)} kg · celkem ${sk.total.toFixed(3)} kg`, `záběry ${st.stats.pushes} · nabrání ${st.stats.scoops} · odhozy ${st.stats.throws} · vytlačení ${st.stats.pushOffs}`];
  const p0 = toScreen(cam, { X: w.x0, Z: w.z1 });
  ctx.font = `${12 * px}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 10 * px;
  ctx.fillStyle = 'rgba(15,18,30,0.82)'; ctx.fillRect(p0.x, p0.y - 70 * px - lines.length * 15 * px, bw, lines.length * 15 * px + 6 * px);
  ctx.fillStyle = '#fff'; lines.forEach((l, k) => ctx.fillText(l, p0.x + 5 * px, p0.y - 67 * px - lines.length * 15 * px + k * 15 * px));
  ctx.restore();
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
