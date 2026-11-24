/**
 * Sestavení a vykreslení skládané postavy z malovaných dílů na hierarchické kostře.
 * Díl se nikdy libovolně nedeformuje: jen posun, otočení a koordinované měřítko šablony
 * (výška pro celé tělo, šířka postavy jen napříč trupem a končetinami).
 */
import type { Vec2 } from '../math/vec';
import type { SkeletonPose, SkeletonTemplate, ViewId } from '../anim/skeleton';
import type { BodyTemplateDef, CharacterAppearance, GroupId, PartDef, PartLibrary, PartSlot } from '../anim/partLibrary';
import type { AssetImages, ImageLike } from './sceneRenderer';

// ---------------------------------------------------------------- 2D afinní matice [a b c d e f]
export type Mat = [number, number, number, number, number, number];
const I: Mat = [1, 0, 0, 1, 0, 0];
export function mul(m: Mat, n: Mat): Mat {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
const T = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const R = (a: number): Mat => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const S = (x: number, y: number): Mat => [x, 0, 0, y, 0, 0];
export const apply = (m: Mat, p: Vec2): Vec2 => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

// ---------------------------------------------------------------- továrna plátna (prohlížeč / Node)
type AnyCanvas = { width: number; height: number; getContext(t: '2d'): unknown };
let canvasFactory: ((w: number, h: number) => AnyCanvas) | null = null;
/** Registruje prostředí (OffscreenCanvas v editoru, @napi-rs/canvas v Node). */
export function setCanvasFactory(f: (w: number, h: number) => AnyCanvas) { canvasFactory = f; }
export function getCanvasFactory() { return canvasFactory; }

const tintCache = new Map<string, ImageLike>();
/** Přebarvení POUZE oblasti masky (násobení – zachová stínování); vzdálené končetiny mírně ztmavené. */
function tinted(key: string, tex: ImageLike, mask: ImageLike | null | undefined, color: string | undefined, shadeF: number): ImageLike {
  if ((!mask || !color) && shadeF >= 1) return tex;
  const ck = `${key}|${color ?? ''}|${shadeF}`;
  const hit = tintCache.get(ck);
  if (hit) return hit;
  if (!canvasFactory) return tex;
  const c = canvasFactory(tex.width, tex.height);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(tex as CanvasImageSource, 0, 0);
  if (mask && color) {
    const m = canvasFactory(tex.width, tex.height);
    const mc = m.getContext('2d') as CanvasRenderingContext2D;
    mc.drawImage(mask as CanvasImageSource, 0, 0);
    mc.globalCompositeOperation = 'source-in'; mc.fillStyle = color; mc.fillRect(0, 0, tex.width, tex.height);
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(m as unknown as CanvasImageSource, 0, 0);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(tex as CanvasImageSource, 0, 0);
  }
  if (shadeF < 1) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(20,18,24,${(1 - shadeF).toFixed(3)})`; ctx.fillRect(0, 0, tex.width, tex.height); }
  ctx.globalCompositeOperation = 'source-over';
  if (tintCache.size > 2000) tintCache.clear();
  tintCache.set(ck, c as unknown as ImageLike);
  return c as unknown as ImageLike;
}

// ---------------------------------------------------------------- sestavení
export interface RigItem { part: PartDef; m: Mat; color: string | undefined; far: boolean; key: string; order: number }
export interface RigAssembly {
  items: RigItem[];
  /** Úchopový bod přední ruky (lokálně vůči chodidlům, jednotky). */
  grip: Vec2;
  /** Kotvy dílů a klouby pro diagnostiku. */
  joints: { name: string; p: Vec2 }[];
  anchors: { name: string; p: Vec2 }[];
  missing: string[];
  view: ViewId;
  heldOrder: number;
  /** Závěje přes zabořené boty (vzdálená, blízká) v lokálních souřadnicích. */
  snowLips?: [SnowLip | null, SnowLip | null];
}

const GROUP_OF: Record<PartSlot, GroupId> = { torso: 'jacket', upperArm: 'jacket', forearm: 'jacket', hat: 'hat', scarf: 'scarf', thigh: 'trousers', shin: 'trousers', foot: 'boots', hand: 'gloves', head: 'head' };
const BUILD_SLOTS: PartSlot[] = ['torso', 'upperArm', 'forearm', 'thigh', 'shin'];

/** Šablona se zapracovanými proporcemi (koordinovaně – všechny kosti stejným poměrem). */
const scaledCache = new Map<string, SkeletonTemplate>();
export function scaledTemplate(tpl: BodyTemplateDef, prop: { height: number; build: number }): SkeletonTemplate {
  const k = `${tpl.id}|${prop.height}|${prop.build}`;
  let s = scaledCache.get(k);
  if (s) return s;
  const h = prop.height, bw = prop.build;
  const bones = Object.fromEntries(Object.entries(tpl.bones).map(([n, v]) => [n, v * h])) as SkeletonTemplate['bones'];
  const views = Object.fromEntries(Object.entries(tpl.views).map(([n, v]) => [n, { ...v!, hipSpread: v!.hipSpread * h * bw, shoulderSpread: v!.shoulderSpread * h * bw, headOffsetX: v!.headOffsetX * h, shoulderOffsetX: v!.shoulderOffsetX * h }]));
  s = { ...tpl, bones, views, foot: tpl.foot ? { heel: tpl.foot.heel * h, toe: tpl.foot.toe * h } : undefined, gait: { ...tpl.gait, strideLength: tpl.gait.strideLength * h, stepLift: tpl.gait.stepLift * h, maxDip: tpl.gait.maxDip * h, sway: tpl.gait.sway * h }, idle: { ...tpl.idle, shiftAmp: tpl.idle.shiftAmp * h } };
  if (scaledCache.size > 500) scaledCache.clear();
  scaledCache.set(k, s);
  return s;
}

export function partIndex(lib: PartLibrary): Map<string, PartDef> {
  const cached = (lib as PartLibrary & { _idx?: Map<string, PartDef> })._idx;
  if (cached) return cached;
  const idx = new Map(lib.parts.map((p) => [`${p.variantId}|${p.slot}|${p.view}`, p]));
  Object.defineProperty(lib, '_idx', { value: idx, enumerable: false });
  return idx;
}

export function assembleRig(lib: PartLibrary, tpl: BodyTemplateDef, app: CharacterAppearance, pose: SkeletonPose, view: ViewId): RigAssembly {
  const idx = partIndex(lib);
  const s = app.proportions.height / lib.pxPerUnit;
  const bw = app.proportions.build;
  const order = tpl.drawOrder[view] ?? tpl.drawOrder.side ?? [];
  const pal = new Map(lib.palettes.map((p) => [p.id, p.color]));
  const items: RigItem[] = [];
  const missing: string[] = [];
  const joints: RigAssembly['joints'] = [];
  const anchors: RigAssembly['anchors'] = [];
  const part = (slot: PartSlot) => {
    const g = GROUP_OF[slot];
    const p = idx.get(`${app.variants[g]}|${slot}|${view}`);
    if (!p) missing.push(`${slot}/${view}`);
    return p;
  };
  const colorOf = (slot: PartSlot) => { const c = app.colors[GROUP_OF[slot]]; return c ? pal.get(c) : undefined; };
  const frame = (p: PartDef, origin: Vec2, angle: number, stretch = 1): Mat => {
    const sx = BUILD_SLOTS.includes(p.slot) ? s * bw : s;
    // stretch: perspektivní zkrácení segmentu podél kosti (osa y dílu míří podél kosti)
    return mul(mul(mul(T(origin.x, origin.y), R(angle - p.boneDir)), S(sx, s * stretch)), T(-p.pivot.x, -p.pivot.y));
  };
  const push = (p: PartDef | undefined, m: Mat, side: 'far' | 'near' | null) => {
    if (!p) return;
    const key = side ? `${side}.${p.slot}` : p.slot;
    const o = order.indexOf(key);
    items.push({ part: p, m, color: colorOf(p.slot), far: side === 'far', key, order: (o < 0 ? 50 : o) * 100 + p.layerOrder });
    for (const [n, a] of Object.entries(p.anchors)) anchors.push({ name: `${p.id}:${n}`, p: apply(m, a) });
  };
  const ang = (a: Vec2, b: Vec2) => Math.atan2(b.y - a.y, b.x - a.x);
  // trup, hlava, doplňky
  const torso = part('torso');
  const mTorso = torso ? frame(torso, pose.hip, pose.torsoAngle) : I;
  push(torso, mTorso, null);
  const head = part('head');
  const mHead = head ? frame(head, pose.neck, pose.torsoAngle + pose.headTilt) : I;
  push(head, mHead, null);
  const hat = part('hat');
  if (hat && head) { const a = head.anchors.hat; if (a) push(hat, mul(mHead, T(a.x - hat.pivot.x, a.y - hat.pivot.y)), null); else missing.push('kotva hlavy „hat“'); }
  const scarf = part('scarf');
  if (scarf && torso) { const a = torso.anchors.scarf; if (a) push(scarf, mul(mTorso, T(a.x - scarf.pivot.x, a.y - scarf.pivot.y)), null); else missing.push('kotva trupu „scarf“'); }
  // končetiny (0 = vzdálená, 1 = blízká)
  let grip: Vec2 = pose.handR;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 'far' : 'near';
    const leg = pose.legs[i], arm = pose.arms[i];
    push(part('thigh'), frame(part('thigh')!, leg.root, ang(leg.root, leg.joint), leg.k1 ?? 1), side);
    push(part('shin'), frame(part('shin')!, leg.joint, ang(leg.joint, leg.end), leg.k2 ?? 1), side);
    const foot = part('foot'); if (foot) push(foot, frame(foot, leg.end, pose.feet[i]), side);
    const ua = part('upperArm'); if (ua) push(ua, frame(ua, arm.root, ang(arm.root, arm.joint), arm.k1 ?? 1), side);
    const fa = part('forearm'); const faAng = ang(arm.joint, arm.end);
    if (fa) push(fa, frame(fa, arm.joint, faAng, arm.k2 ?? 1), side);
    const hand = part('hand');
    if (hand) {
      const mh = frame(hand, arm.end, faAng);
      push(hand, mh, side);
      if (i === 1 && hand.anchors.grip) grip = apply(mh, hand.anchors.grip);
    }
    joints.push({ name: `${side} kyčel`, p: leg.root }, { name: `${side} koleno`, p: leg.joint }, { name: `${side} kotník`, p: leg.end },
      { name: `${side} rameno`, p: arm.root }, { name: `${side} loket`, p: arm.joint }, { name: `${side} zápěstí`, p: arm.end });
  }
  joints.push({ name: 'kořen', p: pose.root }, { name: 'pánev', p: pose.hip }, { name: 'krk', p: pose.neck }, { name: 'hlava', p: pose.head });
  items.sort((a, b) => a.order - b.order);
  const ho = order.indexOf('held');
  return { items, grip, joints, anchors, missing, view, heldOrder: (ho < 0 ? 999 : ho) * 100 };
}

/** Sníh na podrážce zabořené boty; otáčí se s botou kolem kotníku (px, py) o úhel rot. */
export interface SnowLip { x: number; y: number; w: number; h: number; px: number; py: number; rot: number }

function drawSnowLip(ctx: CanvasRenderingContext2D, l: SnowLip, color: string) {
  ctx.save();
  ctx.translate(l.px, l.py); ctx.rotate(l.rot); ctx.translate(-l.px, -l.py);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  // spodní polovina kopce (od povrchu sněhu dolů) + nízký lem nad povrchem
  ctx.ellipse(l.x, l.y + l.h * 0.55, l.w / 2, l.h * 0.95, 0, Math.PI, 0, false);
  ctx.lineTo(l.x + l.w / 2, l.y + l.h * 1.6);
  ctx.lineTo(l.x - l.w / 2, l.y + l.h * 1.6);
  ctx.closePath();
  ctx.fill();
  // drobné hrudky na okraji (deterministické podle tvaru)
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(l.x + (k - 1) * l.w * 0.3, l.y + l.h * 0.35, l.w * 0.1, l.h * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function rigImageKey(libDir: string, file: string) { return `rig:${libDir}/${file}`; }

/** Vykreslí sestavu; kontext je posunut na chodidla, zmenšen a případně zrcadlen. */
export function drawRig(ctx: CanvasRenderingContext2D, asm: RigAssembly, images: AssetImages, libDir: string, farShade: number, drawHeld?: () => void, snowColor?: string) {
  let heldDone = false;
  for (const it of asm.items) {
    if (!heldDone && drawHeld && it.order > asm.heldOrder) { drawHeld(); heldDone = true; }
    const p = it.part;
    const tex = images.get(rigImageKey(libDir, p.texture));
    if (!tex) continue;
    const mask = p.mask ? images.get(rigImageKey(libDir, p.mask)) : null;
    const img = tinted(rigImageKey(libDir, p.texture), tex, mask, p.mask ? it.color : undefined, it.far ? farShade : 1);
    ctx.save();
    ctx.transform(it.m[0], it.m[1], it.m[2], it.m[3], it.m[4], it.m[5]);
    ctx.drawImage(img as CanvasImageSource, p.trim.x, p.trim.y, p.trim.w, p.trim.h);
    ctx.restore();
    // zaboření do sněhu: spodek boty zakryje nepravidelná závěj v barvě sněhu z pozadí
    const lip = p.slot === 'foot' && asm.snowLips ? asm.snowLips[it.key === 'far.foot' ? 0 : 1] : null;
    if (lip && snowColor) drawSnowLip(ctx, lip, snowColor);
  }
  if (!heldDone && drawHeld) drawHeld();
}
