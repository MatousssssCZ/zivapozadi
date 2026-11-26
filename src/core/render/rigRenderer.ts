/**
 * Sestavení a vykreslení skládané postavy z malovaných dílů na hierarchické kostře.
 * Díl se nikdy libovolně nedeformuje: jen posun, otočení a koordinované měřítko šablony
 * (výška pro celé tělo, šířka postavy jen napříč trupem a končetinami).
 */
import type { Vec2 } from '../math/vec';
import type { SkeletonPose, SkeletonTemplate, ViewId } from '../anim/skeleton';
import type { BodyTemplateDef, CharacterAppearance, GroupId, PartDef, PartLibrary, PartSlot } from '../anim/partLibrary';
import type { AssetImages, ImageLike } from './sceneRenderer';
import type { AccessoryGeo, AccessorySpec } from './accessories';

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
  // díl má být přebarvený, ale maska se ještě nenačetla (načítání po souborech): nic neukládat do
  // mezipaměti – jinak by vzdálená ruka/noha zůstala natrvalo nepřebarvená (bílá)
  const pending = !!color && !mask;
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
  if (!pending) tintCache.set(ck, c as unknown as ImageLike);
  return c as unknown as ImageLike;
}

/**
 * Namalované čepice a nákrčníky mají v malbě i vnitřek (tmavý otvor pod lemem čepice, horní otvor
 * nákrčníku). Ten se odstraní: pixel mimo masku pleteniny, který je pleteninou uzavřený zleva i zprava
 * a u čepice i shora (otvor pod lemem), u nákrčníku/šály zdola v horní části (horní otvor). Bambule
 * (pod ní je pletenina, nad ní nic) zůstane.
 */
const insideCache = new Map<string, ImageLike>();
function stripInside(key: string, tex: ImageLike, mask: ImageLike, slot: 'hat' | 'scarf'): ImageLike {
  const hit = insideCache.get(key); if (hit) return hit;
  if (!canvasFactory) return tex;
  const W = tex.width, H = tex.height;
  const c = canvasFactory(W, H), ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const m = canvasFactory(W, H), mc = m.getContext('2d') as CanvasRenderingContext2D;
  try {
    ctx.drawImage(tex as CanvasImageSource, 0, 0); mc.drawImage(mask as CanvasImageSource, 0, 0);
    const img = ctx.getImageData(0, 0, W, H), d = img.data, md = mc.getImageData(0, 0, W, H).data;
    // maska pleteniny vyhlazená (otevření 5×5): drobné ostrůvky masky uvnitř otvoru se nepočítají
    const raw = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) raw[k] = md[k * 4 + 3] > 100 && md[k * 4] > 100 ? 1 : 0;
    const integ = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x < W; x++) { run += raw[y * W + x]; integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + run; } }
    const box = (x: number, y: number, r: number) => { const xa = Math.max(0, x - r), ya = Math.max(0, y - r), xb = Math.min(W, x + r + 1), yb = Math.min(H, y + r + 1); return { n: integ[yb * (W + 1) + xb] - integ[ya * (W + 1) + xb] - integ[yb * (W + 1) + xa] + integ[ya * (W + 1) + xa], a: (xb - xa) * (yb - ya) }; };
    const R = Math.max(2, Math.round(Math.min(W, H) * 0.03));
    const sm = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const b = box(x, y, R); sm[y * W + x] = raw[y * W + x] && b.n > b.a * 0.6 ? 1 : 0; }
    const isM = (x: number, y: number) => sm[y * W + x] === 1;
    // svislé meze pleteniny po sloupcích a vodorovné po řádcích
    const top = new Int32Array(W).fill(H), bot = new Int32Array(W).fill(-1), left = new Int32Array(H).fill(W), right = new Int32Array(H).fill(-1);
    let y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isM(x, y)) { if (y < top[x]) top[x] = y; bot[x] = y; if (x < left[y]) left[y] = x; right[y] = x; if (y < y0) y0 = y; y1 = y; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] === 0 || isM(x, y)) continue;
      if (!(x > left[y] && x < right[y])) continue;
      const inside = slot === 'hat' ? y > top[x] && y > y0 + (y1 - y0) * 0.45 : y < bot[x] && y < y0 + (y1 - y0) * 0.4;
      if (inside) d[i + 3] = 0;
    }
    if (slot === 'hat') {
      // spodní hrana lemu = první díra pod pleteninou ve sloupci; křivka se vyhladí (medián) a doplní
      // mezi sloupci, pod ní je jen vnitřek a zadní okraj zespodu → pryč
      const cut = new Float64Array(W).fill(NaN);
      for (let x = 0; x < W; x++) for (let y = Math.max(0, top[x]) + 1; y <= bot[x]; y++) { if (d[(y * W + x) * 4 + 3] === 0) { cut[x] = y; break; } }
      const xs: number[] = []; for (let x = 0; x < W; x++) if (!Number.isNaN(cut[x])) xs.push(x);
      if (xs.length > W * 0.1) {
        const xa = xs[0], xb = xs[xs.length - 1], hw = Math.max(2, Math.round(W * 0.05)), sm2 = new Float64Array(W).fill(NaN);
        for (let x = xa; x <= xb; x++) { const v: number[] = []; for (let k = x - hw; k <= x + hw; k++) if (k >= 0 && k < W && !Number.isNaN(cut[k])) v.push(cut[k]); if (v.length) { v.sort((a, b) => a - b); sm2[x] = v[Math.floor(v.length * 0.3)]; } }
        for (let x = xa; x <= xb; x++) { const c0 = sm2[x]; if (Number.isNaN(c0)) continue; for (let y = Math.floor(c0); y < H; y++) { const i = (y * W + x) * 4; d[i + 3] = y === Math.floor(c0) ? Math.round(d[i + 3] * (1 - (c0 - y))) : 0; } }
      }
    }
    ctx.putImageData(img, 0, 0);
  } catch { return tex; }
  insideCache.set(key, c as unknown as ImageLike);
  return c as unknown as ImageLike;
}

/** Průměrná barva krku (spodek ořezu hlavy, střed) – výplň otvoru nákrčníku/šály. */
const skinCache = new Map<string, string>();
function neckTone(key: string, tex: ImageLike, trim: { x: number; y: number; w: number; h: number }): string | undefined {
  const hit = skinCache.get(key); if (hit) return hit;
  if (!canvasFactory) return undefined;
  const sw = Math.max(1, Math.round(trim.w * 0.36)), sh = Math.max(1, Math.round(trim.h * 0.16));
  const c = canvasFactory(sw, sh), ctx = c.getContext('2d') as CanvasRenderingContext2D;
  try {
    ctx.drawImage(tex as CanvasImageSource, trim.x + trim.w * 0.32, trim.y + trim.h * 0.8, sw, sh, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data; let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (!n) return undefined;
    const col = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
    skinCache.set(key, col); return col;
  } catch { return undefined; }
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
  /** nůž brusle pod botou (lokálně): pata, špička, výška držáku */
  blades?: [{ heel: { x: number; y: number }; toe: { x: number; y: number }; drop: number }, { heel: { x: number; y: number }; toe: { x: number; y: number }; drop: number }];
  /** vektorové doplňky: popis, geometrie a pořadí kreslení (vkládají se mezi malované díly) */
  acc?: { spec: AccessorySpec; geo: AccessoryGeo; order: { hat: number; scarf: number; mitten: [number, number] } };
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

export function assembleRig(lib: PartLibrary, tpl: BodyTemplateDef, app: CharacterAppearance, pose: SkeletonPose, view: ViewId, acc?: AccessorySpec | null): RigAssembly {
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
  const frame = (p: PartDef, origin: Vec2, angle: number, stretch = 1, kx = 1): Mat => {
    const sx = (BUILD_SLOTS.includes(p.slot) ? s * bw : s) * kx;
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
  // trup, hlava, doplňky; delší bunda (torsoStretch): díl se protáhne dolů, ramena a krk zůstanou na místě
  // perspektivně zkrácený trup (leží podél hloubky – anděl): malovaný díl se zkrátí podle pózy
  const tShort = Math.min(1, Math.hypot(pose.neck.x - pose.hip.x, pose.neck.y - pose.hip.y) / (tpl.bones.torso || 1) / 0.97);
  const torso = part('torso'), kT = (tpl.torsoStretch ?? 1) * (tShort < 0.9 ? tShort : 1);
  const tOrigin = { x: pose.hip.x - (pose.neck.x - pose.hip.x) * (kT - 1), y: pose.hip.y - (pose.neck.y - pose.hip.y) * (kT - 1) };
  const mTorso = torso ? frame(torso, kT === 1 ? pose.hip : tOrigin, pose.torsoAngle, kT) : I;
  push(torso, mTorso, null);
  const head = part('head');
  const mHead = head ? frame(head, pose.neck, pose.torsoAngle + pose.headTilt) : I;
  push(head, mHead, null);
  const hat = acc ? undefined : part('hat');
  if (hat && head) { const a = head.anchors.hat; if (a) push(hat, mul(mHead, T(a.x - hat.pivot.x, a.y - hat.pivot.y)), null); else missing.push('kotva hlavy „hat“'); }
  const scarf = acc ? undefined : part('scarf');
  if (scarf && torso) { const a = torso.anchors.scarf; if (a) push(scarf, mul(mTorso, T(a.x - scarf.pivot.x, a.y - scarf.pivot.y)), null); else missing.push('kotva trupu „scarf“'); }
  // končetiny (0 = vzdálená, 1 = blízká)
  let grip: Vec2 = pose.handR;
  const hands: AccessoryGeo['hands'] = [null, null];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 'far' : 'near';
    const leg = pose.legs[i], arm = pose.arms[i];
    push(part('thigh'), frame(part('thigh')!, leg.root, ang(leg.root, leg.joint), leg.k1 ?? 1), side);
    push(part('shin'), frame(part('shin')!, leg.joint, ang(leg.joint, leg.end), leg.k2 ?? 1), side);
    const foot = part('foot'); if (foot) push(foot, frame(foot, leg.end, pose.feet[i], 1, pose.feetK?.[i] ?? 1), side);
    const ua = part('upperArm'); if (ua) push(ua, frame(ua, arm.root, ang(arm.root, arm.joint), arm.k1 ?? 1), side);
    const fa = part('forearm'); const faAng = ang(arm.joint, arm.end);
    if (fa) push(fa, frame(fa, arm.joint, faAng, arm.k2 ?? 1), side);
    const hand = part('hand');
    if (hand) {
      const mh = frame(hand, arm.end, faAng);
      push(hand, mh, side);
      const d = { x: Math.cos(faAng), y: Math.sin(faAng) };
      hands[i] = { E: arm.end, d, L: hand.trim.h * s * 0.82, W: hand.trim.w * s * 0.98 };
      if (i === 1 && hand.anchors.grip) grip = apply(mh, hand.anchors.grip);
    }
    joints.push({ name: `${side} kyčel`, p: leg.root }, { name: `${side} koleno`, p: leg.joint }, { name: `${side} kotník`, p: leg.end },
      { name: `${side} rameno`, p: arm.root }, { name: `${side} loket`, p: arm.joint }, { name: `${side} zápěstí`, p: arm.end });
  }
  joints.push({ name: 'kořen', p: pose.root }, { name: 'pánev', p: pose.hip }, { name: 'krk', p: pose.neck }, { name: 'hlava', p: pose.head });
  items.sort((a, b) => a.order - b.order);
  const ho = order.indexOf('held');
  const asm: RigAssembly = { items, grip, joints, anchors, missing, view, heldOrder: (ho < 0 ? 999 : ho) * 100 };
  if (acc && head && torso) {
    // hlava: střed lebky a poloměr z ořezu malby (temeno ≈ horní okraj), směr „nahoru“ z matice hlavy
    const hc = apply(mHead, { x: head.trim.x + head.trim.w * 0.5, y: head.trim.y + head.trim.h * 0.37 });
    const ht = apply(mHead, { x: head.trim.x + head.trim.w * 0.5, y: head.trim.y });
    const ul = Math.hypot(ht.x - hc.x, ht.y - hc.y) || 1;
    const neckA = torso.anchors.scarf ?? torso.anchors.neck;
    const nk = neckA ? apply(mTorso, { x: neckA.x, y: neckA.y + 8 }) : pose.neck;
    const tu = { x: pose.neck.x - pose.hip.x, y: pose.neck.y - pose.hip.y }, tl = Math.hypot(tu.x, tu.y) || 1;
    const oi = (k: string, d: number) => { const o = order.indexOf(k); return (o < 0 ? d : o) * 100 + 60; };
    const handOrder = (sd: 'far' | 'near') => (items.find((it) => it.key === `${sd}.hand`)?.order ?? 0) + 1;
    asm.acc = {
      spec: acc,
      geo: { headBottom: apply(mHead, { x: head.trim.x + head.trim.w * 0.5, y: head.trim.y + head.trim.h }), headC: hc, headUp: { x: (ht.x - hc.x) / ul, y: (ht.y - hc.y) / ul }, headR: head.trim.w * s * 0.45, neck: nk, torsoUp: { x: tu.x / tl, y: tu.y / tl }, neckW: torso.trim.w * s * bw * 0.36, hands, back: view === 'back3q' || view === 'back' },
      order: { hat: oi('hat', 12), scarf: oi('scarf', 13), mitten: [handOrder('far'), handOrder('near')] },
    };
  }
  return asm;
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
/** Nůž brusle (kreslený – malovaný podklad brusle zatím chybí): dva držáky a ocelová lišta s odleskem. */
function drawBlade(ctx: CanvasRenderingContext2D, b: NonNullable<RigAssembly['blades']>[number], far: boolean) {
  const { heel, toe, drop } = b, dx = toe.x - heel.x, dy = toe.y - heel.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L; // normála dolů (lokálně y dolů)
  const at = (k: number, d: number) => ({ x: heel.x + dx * k + nx * d, y: heel.y + dy * k + ny * d });
  ctx.save(); ctx.lineCap = 'round';
  // držáky (u paty a pod přednožím)
  ctx.strokeStyle = far ? '#4d5058' : '#5d616b'; ctx.lineWidth = 1.3;
  for (const k of [0.18, 0.78]) { const a = at(k, 0), q = at(k, drop * 0.85); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  // lišta: mírně prodloužená dopředu, zaoblená špička
  const a = at(-0.04, drop), q = at(1.08, drop * 0.92), tip = at(1.12, drop * 0.55);
  ctx.strokeStyle = far ? '#8a8f9b' : '#a9afbc'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(q.x, q.y); ctx.quadraticCurveTo(tip.x + nx * 0.3, tip.y + ny * 0.3, tip.x, tip.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(a.x, a.y - 0.35); ctx.lineTo(q.x, q.y - 0.35); ctx.stroke();
  ctx.restore();
}

export type AccPart = 'hat' | 'scarf' | 'mitten0' | 'mitten1';
export function drawRig(ctx: CanvasRenderingContext2D, asm: RigAssembly, images: AssetImages, libDir: string, farShade: number, drawHeld?: () => void, snowColor?: string, drawAcc?: (part: AccPart) => void) {
  let heldDone = false;
  // vektorové doplňky se vkládají podle pořadí (čepice po hlavě, šála, palčák hned po ruce)
  const acc = asm.acc && drawAcc ? ([['hat', asm.acc.order.hat], ['scarf', asm.acc.order.scarf], ['mitten0', asm.acc.order.mitten[0]], ['mitten1', asm.acc.order.mitten[1]]] as [AccPart, number][]).sort((a, b) => a[1] - b[1]) : [];
  let ai = 0;
  for (const it of asm.items) {
    while (ai < acc.length && acc[ai][1] < it.order) drawAcc!(acc[ai++][0]);
    if (!heldDone && drawHeld && it.order > asm.heldOrder) { drawHeld(); heldDone = true; }
    const p = it.part;
    const tex = images.get(rigImageKey(libDir, p.texture));
    if (!tex) continue;
    if (p.slot === 'head' && asm.acc) asm.acc.geo.skin = neckTone(rigImageKey(libDir, p.texture), tex, p.trim);
    const mask = p.mask ? images.get(rigImageKey(libDir, p.mask)) : null;
    const strip = mask && (p.slot === 'hat' || p.slot === 'scarf');
    const tkey = rigImageKey(libDir, p.texture) + (strip ? '|bez-vnitrku' : '');
    const img = tinted(tkey, strip ? stripInside(tkey, tex, mask, p.slot as 'hat' | 'scarf') : tex, mask, p.mask ? it.color : undefined, it.far ? farShade : 1);
    // brusle: nůž a držák se kreslí pod botu (bota je přes ně)
    if (p.slot === 'foot' && asm.blades) drawBlade(ctx, asm.blades[it.key === 'far.foot' ? 0 : 1], it.far);
    ctx.save();
    ctx.transform(it.m[0], it.m[1], it.m[2], it.m[3], it.m[4], it.m[5]);
    ctx.drawImage(img as CanvasImageSource, p.trim.x, p.trim.y, p.trim.w, p.trim.h);
    ctx.restore();
    // zaboření do sněhu: spodek boty zakryje nepravidelná závěj v barvě sněhu z pozadí
    const lip = p.slot === 'foot' && asm.snowLips ? asm.snowLips[it.key === 'far.foot' ? 0 : 1] : null;
    if (lip && snowColor) drawSnowLip(ctx, lip, snowColor);
  }
  while (ai < acc.length) drawAcc!(acc[ai++][0]);
  if (!heldDone && drawHeld) drawHeld();
}


/** Pro vektorové postavy: nůž brusle a závěj u boty (stejné jako u malovaných). */
export const drawBladeVec = (ctx: CanvasRenderingContext2D, b: NonNullable<RigAssembly['blades']>[number]) => drawBlade(ctx, b, false);
export const drawSnowLipVec = (ctx: CanvasRenderingContext2D, l: SnowLip, color: string) => drawSnowLip(ctx, l, color);

/**
 * Jeden malovaný díl ze sestavy (vektorové postavy s malovanou hlavou): stejná matice i přebarvení
 * jako v drawRig. Vrací barvu krku z malby (navázání vektorového krku a rukou).
 */
export function drawRigSlot(ctx: CanvasRenderingContext2D, asm: RigAssembly, images: AssetImages, libDir: string, slot: PartSlot, draw = true): string | undefined {
  const it = asm.items.find((x) => x.part.slot === slot); if (!it) return undefined;
  const p = it.part, tex = images.get(rigImageKey(libDir, p.texture)); if (!tex) return undefined;
  const tone = slot === 'head' ? neckTone(rigImageKey(libDir, p.texture), tex, p.trim) : undefined;
  if (tone && asm.acc) asm.acc.geo.skin = tone;
  if (!draw) return tone;
  const mask = p.mask ? images.get(rigImageKey(libDir, p.mask)) : null;
  const img = tinted(rigImageKey(libDir, p.texture), tex, mask, p.mask ? it.color : undefined, 1);
  ctx.save(); ctx.transform(it.m[0], it.m[1], it.m[2], it.m[3], it.m[4], it.m[5]);
  ctx.drawImage(img as CanvasImageSource, p.trim.x, p.trim.y, p.trim.w, p.trim.h); ctx.restore();
  return tone;
}
