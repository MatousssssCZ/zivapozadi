/** Diagnostický režim skládaných postav (kostra, klouby, kotvy, názvy dílů). JEN editor – nikdy export. */
import type { CharacterVisual } from '../core/render/characterPose';
import { apply } from '../core/render/rigRenderer';
import { VIEW_LABELS } from '../core/anim/skeleton';
import type { Vec2 } from '../core/math/vec';
import { MARKER_ACCENT } from './overlay';

/** Kreslí v lokálních souřadnicích postavy (kontext je posunut na chodidla, zmenšen a zrcadlen). `px` = 1 obrazovkový px. */
export function drawRigDiagnostics(ctx: CanvasRenderingContext2D, cv: CharacterVisual, px: number, names: boolean) {
  const p = cv.pose;
  ctx.save();
  ctx.lineCap = 'round';
  const line = (a: Vec2, b: Vec2) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.2 * px;
  line(p.root, p.hip); line(p.hip, p.neck); line(p.neck, p.head);
  for (const l of [...p.legs, ...p.arms]) { line(l.root, l.joint); line(l.joint, l.end); }
  ctx.strokeStyle = 'rgba(30,30,40,0.9)'; ctx.lineWidth = 0.9 * px;
  line(p.root, p.hip); line(p.hip, p.neck); line(p.neck, p.head);
  for (const l of [...p.legs, ...p.arms]) { line(l.root, l.joint); line(l.joint, l.end); }
  const dots = cv.rig?.joints ?? [{ name: 'pánev', p: p.hip }, { name: 'krk', p: p.neck }, { name: 'hlava', p: p.head }, ...[...p.legs, ...p.arms].flatMap((l) => [{ name: '', p: l.root }, { name: '', p: l.joint }, { name: '', p: l.end }])];
  for (const j of dots) { ctx.fillStyle = MARKER_ACCENT; ctx.beginPath(); ctx.arc(j.p.x, j.p.y, 2.6 * px, 0, Math.PI * 2); ctx.fill(); }
  if (cv.rig) {
    for (const a of cv.rig.anchors) { ctx.fillStyle = '#29d3ff'; ctx.fillRect(a.p.x - 2 * px, a.p.y - 2 * px, 4 * px, 4 * px); }
    if (names) {
      ctx.font = `${10 * px}px system-ui, sans-serif`; ctx.textAlign = 'left';
      const seen = new Set<string>();
      for (const it of cv.rig.items) {
        const c = apply(it.m, it.part.pivot);
        const label = `${it.key}: ${it.part.variantId}`;
        if (seen.has(label)) continue; seen.add(label);
        ctx.save(); ctx.translate(c.x, c.y); if (cv.mirror) ctx.scale(-1, 1);
        ctx.fillStyle = 'rgba(10,14,30,0.75)'; const w = ctx.measureText(label).width;
        ctx.fillRect(4 * px, -6 * px, w + 4 * px, 12 * px); ctx.fillStyle = '#fff'; ctx.fillText(label, 6 * px, 4 * px);
        ctx.restore();
      }
    }
  }
  // úchopový bod
  ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1.6 * px; ctx.beginPath(); ctx.arc(cv.grip.x, cv.grip.y, 4 * px, 0, Math.PI * 2); ctx.stroke();
  if (cv.view && names) {
    ctx.save(); if (cv.mirror) ctx.scale(-1, 1);
    ctx.font = `${11 * px}px system-ui, sans-serif`; ctx.textAlign = 'center';
    const t = `pohled: ${VIEW_LABELS[cv.view.used]}${cv.mirror ? ' (zrcadleno)' : ''}${cv.view.substituted ? ` – náhrada za ${VIEW_LABELS[cv.view.requested]}` : ''}`;
    ctx.fillStyle = cv.view.substituted ? 'rgba(160,90,0,0.85)' : 'rgba(10,14,30,0.75)';
    const w = ctx.measureText(t).width; ctx.fillRect(-w / 2 - 3 * px, 6 * px, w + 6 * px, 13 * px);
    ctx.fillStyle = '#fff'; ctx.fillText(t, 0, 16 * px);
    ctx.restore();
  }
  ctx.restore();
}
