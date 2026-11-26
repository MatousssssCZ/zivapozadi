/**
 * Vykreslení scény v logických souřadnicích. Čistá funkce: projekt + stav simulace → obraz.
 * Neobsahuje editorové značky ani nekontrolovanou náhodu. Používá ji náhled i export.
 */
import { sessionBalls } from '../activities/snowman';
import { coopBalls, SNOW, type CoopData, type SnowField } from '../activities/coopSnowman';
import { drawAnimal, drawAnimalShadow } from './animalRenderer';
import { drawFacade } from './facade';
import { SPECIES } from '../sim/animals';
import { ballAt } from '../activities/snowballFight';
import { particleAt, snowDensityFactor, windIntegral } from '../sim/environment';
import { drawGroundIntegration, drawObjectIntegration, gradedImage, characterLightAt } from './integration';
import type { ProjectFile, SceneObject, AssetEntry } from '../model/types';
import type { Simulation } from '../sim/simulation';
import type { AgentState, PropState } from '../sim/types';
import { characterVisual, localToScene } from './characterPose';
import { drawFigure } from '../anim/testFigure';
import { SHOVEL_SPRITE } from '../anim/skeleton';
import { cameraFor, toScreen, toWorld, Q, type World } from '../scene/camera';
import { SLED } from '../sim/sled';
import { tramGeo, tramMatrix, trackYAt, doorQuad, tramVisible, type TramGeo } from '../sim/tram';
import { BAKERY_REFILL, GRIT_LIFE } from '../sim/bakery';
import { drawSnowSurface, snowItems } from './snowRender';
import type { SimState } from '../sim/types';
import { lidOpenness } from '../sim/simulation';
import { FOOTPRINT_LIFE, FOOTPRINT_FADE } from '../sim/types';
import { getCanvasFactory, drawRig, type AccPart } from './rigRenderer';
import { drawHat, drawPompom, drawScarf, drawMitten, hatTop, scarfKnots, stepAccessoryPhysics, TAIL_SEGS } from './accessories';
import { windFactor } from '../sim/environment';
import { SIM_DT } from '../sim/types';
import { drawVectorSled, sledRingScreen, drawRope } from './sledVector';
import { drawCrate, drawBucket, drawSign, drawGrit, drawAngelImprint } from './shopProps';
import { ANGEL_LIFE } from '../activities/snowAngel';
import { drawPram } from './pramVector';
import { pramPoints } from '../sim/pram';
import { depthScaleAt, objectLocalToScene } from '../scene/geometry';
import { hashNoise } from '../math/rng';
import { clamp, smoothstep } from '../math/vec';

export interface ImageLike { width: number; height: number }
export interface AssetImages { get(assetId: string): ImageLike | null | undefined }

type Ctx = CanvasRenderingContext2D;

export interface DrawOptions {
  /** Čas v sekundách (pro sněžení). */
  time: number;
  /** Omezený pohyb (prefers-reduced-motion): bez třpytu, bez částic ledu, slabší sněžení. */
  reducedMotion?: boolean;
  /** Zvýrazněné ID (jen editor – předává se dál overlayi, renderer ho ignoruje). */
}

export function objectImageRect(o: SceneObject, a: AssetEntry | undefined): { x: number; y: number; w: number; h: number } {
  const ps = a?.pixelScale ?? 1;
  const w = (a?.width ?? 100) * ps * o.scale, h = (a?.height ?? 100) * ps * o.scale;
  const an = o.anchor ?? a?.anchor ?? { x: 0.5, y: 1 };
  const ax = o.flipX ? 1 - an.x : an.x;
  return { x: o.x - ax * w, y: o.y - an.y * h, w, h };
}

/** Otvírací víko (koš): otáčí se kolem pantu; `open` 0 = zavřeno, 1 = plně otevřeno. */
function drawLid(ctx: Ctx, o: SceneObject, a: AssetEntry, r: { x: number; y: number; w: number; h: number }, open: number) {
  const L = a.lid!;
  const lw = (a.width ?? 1) * (a.pixelScale ?? 1), sx = r.w / lw; // logické px obrázku → scéna
  const left = L.hinge === 'left';
  const hx = r.x + (left ? L.x : L.x + L.w) * sx, hy = r.y + (L.y + L.h * 0.6) * sx;
  ctx.save();
  if (o.flipX) { ctx.translate(r.x + r.w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(r.x + r.w / 2), 0); }
  ctx.translate(hx, hy);
  ctx.rotate((left ? -1 : 1) * L.maxAngle * open);
  const x0 = left ? 0 : -L.w * sx, w = L.w * sx, h = L.h * sx, y0 = -L.h * 0.6 * sx;
  // při otevření je vidět tmavší spodní strana víka
  ctx.fillStyle = open > 0.15 ? '#2f333d' : L.color;
  rrect(ctx, x0, y0, w, h, h * 0.35); ctx.fill();
  ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = Math.max(0.6, h * 0.14); rrect(ctx, x0, y0, w, h, h * 0.35); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x0 + w * 0.08, y0 + h * 0.2, w * 0.84, h * 0.18);
  if (L.snow && open < 0.5) { ctx.fillStyle = `rgba(243,246,252,${(1 - open * 2).toFixed(3)})`; rrect(ctx, x0 + w * 0.12, y0 - h * 0.35, w * 0.76, h * 0.5, h * 0.25); ctx.fill(); }
  // úchyt na volném okraji
  ctx.fillStyle = '#2b2f38'; ctx.fillRect(left ? x0 + w - 3 * sx : x0, y0 + h * 0.25, 3 * sx, h * 0.5);
  ctx.restore();
}

function drawObject(ctx: Ctx, o: SceneObject, a: AssetEntry | undefined, img: ImageLike | null | undefined, lidOpen = 0) {
  const r = objectImageRect(o, a);
  if (!img) {
    ctx.save();
    ctx.fillStyle = 'rgba(150,150,160,0.55)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(90,90,100,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke();
    ctx.restore();
    return;
  }
  if (o.flipX) {
    ctx.save(); ctx.translate(r.x + r.w, r.y); ctx.scale(-1, 1);
    ctx.drawImage(img as CanvasImageSource, 0, 0, r.w, r.h); ctx.restore();
  } else ctx.drawImage(img as CanvasImageSource, r.x, r.y, r.w, r.h);
  if (a?.lid) drawLid(ctx, o, a, r, lidOpen);
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawCup(ctx: Ctx, x: number, y: number, s: number, sips = 0, tilt = 0) {
  // Papírový kelímek s víčkem; (x,y) = spodek kelímku. Naklonění kolem úchopu (6 j. nad spodkem).
  ctx.save(); ctx.translate(x, y - 6 * s); ctx.rotate(tilt); ctx.translate(0, 6 * s); ctx.scale(s, s);
  ctx.fillStyle = '#fbf6ee';
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(5.2, -11); ctx.lineTo(-5.2, -11); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c8553d'; ctx.fillRect(-4.8, -7.5, 9.6, 3.5);
  ctx.fillStyle = '#5b3a29'; ctx.fillRect(-5.8, -13, 11.6, 2.4);
  if (sips >= 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3.5, -10.5, 1.5, 9); }
  ctx.restore();
}

/** Papírová taška se zbožím (malovaný styl kelímku); (x,y) = úchop v uchu, taška visí dolů. */
const BAG_COLORS: Record<string, [string, string]> = { pernik: ['#b98a5a', '#7a4a2c'], hracky: ['#c9b48a', '#a33a32'], pletene: ['#a89c8c', '#3f5a7a'], zbozi: ['#bfa27c', '#6b5a43'] };
export function drawBag(ctx: Ctx, x: number, y: number, s: number, variant = 'zbozi') {
  const [paper, band] = BAG_COLORS[variant] ?? BAG_COLORS.zbozi;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  // ucho (provázek) – dvě poutka k ruce
  ctx.strokeStyle = 'rgba(70,50,35,0.85)'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(-3.2, 5); ctx.quadraticCurveTo(-1.5, -0.8, 0, 0); ctx.quadraticCurveTo(1.5, -0.8, 3.2, 5); ctx.stroke();
  // tělo tašky s mírným zúžením a měkkým stínováním
  const g = ctx.createLinearGradient(-6, 0, 6, 0);
  g.addColorStop(0, shadeHex(paper, 0.82)); g.addColorStop(0.45, paper); g.addColorStop(1, shadeHex(paper, 0.7));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-5.6, 4.5); ctx.lineTo(5.6, 4.5); ctx.lineTo(6, 17); ctx.lineTo(-6, 17); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shadeHex(paper, 0.6); ctx.fillRect(-5.6, 4.5, 11.2, 1.1); // přehnutý okraj
  ctx.fillStyle = band; ctx.globalAlpha = 0.85; ctx.fillRect(-5.8, 10, 11.7, 2.4); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(40,30,50,0.18)'; ctx.fillRect(2.8, 4.5, 3.2, 12.5); // zadní stěna ve stínu
  ctx.restore();
}
function shadeHex(h: string, k: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h)!;
  return `rgb(${[1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) * k)).join(',')})`;
}
/** Rekvizita podle druhu (kelímek nebo taška). */
function drawProp(ctx: Ctx, p: PropState, x: number, y: number, s: number, tilt = 0) {
  if (p.kind === 'bag') drawBag(ctx, x, y - 17 * s, s, p.variant);
  else drawCup(ctx, x, y, s, p.sips, tilt);
}

/** Geometrie složeného spritu sání s dítětem (px spritu, viz scripts/compose-sled.py). */
const SLED_SPRITE = { frameW: 626, cx: 353, ground: 606, ring: { x: 640, y: 470 }, head: { x: 295, y: 252 }, neck: { x: 295, y: 320 } };
function drawSled(ctx: Ctx, c: { x: number; y: number }, k: number, sx: number, t: number, speed: number) {
  const body = sprite('sled_child_body'), head = sprite('sled_child_head');
  ctx.save(); ctx.translate(c.x, c.y);
  // kontaktní stín pod skluznicemi
  ctx.fillStyle = 'rgba(60,70,100,0.18)'; ctx.beginPath(); ctx.ellipse(0, 0, SLED_SPRITE.frameW * k * 0.5 * Math.abs(sx), Math.max(1.5, 14 * k), 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(sx * k, k);
  ctx.translate(-SLED_SPRITE.cx, -SLED_SPRITE.ground);
  if (body) ctx.drawImage(body, 0, 0);
  else { ctx.fillStyle = '#8a5a34'; ctx.fillRect(40, 520, 626, 60); }
  if (head) {
    // hlava se při jízdě lehce pohupuje (drobné nerovnosti sněhu), v klidu se rozhlíží
    const bob = Math.sin(t * 7.3) * 0.03 * Math.min(1, speed / 1.5) + Math.sin(t * 0.6) * 0.05;
    ctx.translate(SLED_SPRITE.neck.x, SLED_SPRITE.neck.y); ctx.rotate(bob);
    ctx.drawImage(head, SLED_SPRITE.head.x - SLED_SPRITE.neck.x - head.width / 2, SLED_SPRITE.head.y - SLED_SPRITE.neck.y - head.height / 2);
  }
  ctx.restore();
}
/** Sáně z dodaného pohledu (plátno 1600×1200, linie země y = 1100, délka sání v bočním pohledu ~1,1 m). */
function drawSledView(ctx: Ctx, c: { x: number; y: number }, ppm: number, body: CanvasImageSource & { width: number; height: number }, head: (CanvasImageSource & { width: number; height: number }) | null, t: number, speed: number) {
  const k = (SLED.length * ppm) / (body.width * 0.62); // (sáně zabírají ~62 % šířky plátna v bočním pohledu)
  ctx.save(); ctx.translate(c.x, c.y); ctx.scale(k, k); ctx.translate(-body.width / 2, -body.height * (1100 / 1200));
  ctx.drawImage(body, 0, 0);
  if (head) { const bob = Math.sin(t * 7.3) * 2 * Math.min(1, speed / 1.5); ctx.drawImage(head, 0, bob); }
  ctx.restore();
}
/** Rukavice ležící na zemi (spodek na bodu dotyku), s = hloubkové měřítko. */
function drawGroundMitten(ctx: Ctx, x: number, y: number, s: number, rot: number) {
  const img = sprite('mitten_ground'), W = (0.17 * s) / Q;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = 'rgba(60,70,100,0.16)'; ctx.beginPath(); ctx.ellipse(0, 0, W * 0.5, W * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  if (img) { const H = (W * img.height) / img.width * 0.62; ctx.drawImage(img, -W / 2, -H, W, H); } // položená: zploštělá
  else { ctx.fillStyle = '#e8dcc6'; ctx.fillRect(-W / 2, -W * 0.3, W, W * 0.3); }
  ctx.restore();
}
/**
 * Geometrie lopaty v lokálních souřadnicích postavy. Osa násady spritu: D-držadlo G → objímka listu
 * (AX); spodní hrana listu C. Při tahu drží zadní (horní) ruka D-držadlo, osa vede přední rukou a list
 * dosedá na zem (měřítko z dosednutí v mezích délky 1,3 m). Mimo tah ji nese blízká ruka za násadu
 * (30 % od držadla), list šikmo na zemi vpředu. Přechod plynule podle váhy klipu. Vrací i bod listu na zemi.
 */
const SHOVEL = { G: { x: 50, y: 55 }, AX: { x: 525, y: 185 }, C: { x: 650, y: 385 } };
function shovelGeom(cv: ReturnType<typeof characterVisual>, agent?: AgentState) {
  const { G, AX, C } = SHOVEL;
  const axAng = Math.atan2(AX.y, AX.x), nominal = (1.3 / Q) / Math.hypot(C.x - G.x, C.y - G.y);
  const g = agent?.anim.gestures?.find((x) => x.fam === 'shovel');
  const w = g ? (() => { const e = Math.min(1, g.t / 0.6), f = Math.min(1, Math.max(0, (g.dur - g.t) / 0.6)); return e * e * (3 - 2 * e) * (f * f * (3 - 2 * f)); })() : 0;
  const A0 = cv.pose.arms[0].end, A1 = cv.pose.arms[1].end;
  const hi = A0.y < A1.y ? A0 : A1, lo = A0.y < A1.y ? A1 : A0;
  let ang = Math.atan2(lo.y - hi.y, lo.x - hi.x) - axAng;
  if (!(lo.x > hi.x && lo.y > hi.y)) ang = 0.9 - axAng;
  const rotP = (p: { x: number; y: number }, a: number, k: number) => ({ x: (p.x * Math.cos(a) - p.y * Math.sin(a)) * k, y: (p.x * Math.sin(a) + p.y * Math.cos(a)) * k });
  const ry = rotP({ x: C.x - G.x, y: C.y - G.y }, ang, 1).y;
  const kW = Math.min(1.15 * nominal, Math.max(0.7 * nominal, ry > 1e-3 ? -hi.y / ry : nominal));
  const gr = cv.grip, kC = nominal, angC = Math.atan2(-gr.y, 0.5 * (1.3 / Q)) - Math.atan2(C.y - G.y, C.x - G.x);
  const hC = rotP({ x: AX.x * 0.3, y: AX.y * 0.3 }, angC, kC), originC = { x: gr.x - hC.x, y: gr.y - hC.y };
  const a = angC + (ang - angC) * w, k = kC + (kW - kC) * w;
  const org = { x: originC.x + (hi.x - originC.x) * w, y: originC.y + (hi.y - originC.y) * w };
  const bl = rotP({ x: C.x - G.x, y: C.y - G.y }, a, k);
  return { org, ang: a, k, w, blade: { x: org.x + bl.x, y: org.y + bl.y } };
}

/** Ztmavení vzdálené ruky/nohy: jen polovina hodnoty z knihovny – silné ztmavení měnilo světlé barvy
 * (krémová, olivová) natolik, že vzdálený rukáv/nohavice působily jako jiná barva oblečení. */
const softFar = (f: number) => 1 - (1 - f) * 0.5;

/** Věc v ruce postavy (souřadnice postavy, 1 jednotka = Q m). */
function drawHeld(ctx: Ctx, held: PropState, cv: ReturnType<typeof characterVisual>, agent?: AgentState) {
  const g = cv.grip;
  if (held.kind === 'bag') return drawBag(ctx, g.x, g.y + 1, 1, held.variant);
  if (held.kind === 'crate') {
    // bedýnka mezi dlaněmi: madla ve výšce rukou (lokální jednotky postavy; k = jednotek na metr)
    const A = cv.pose.arms[0].end, B = cv.pose.arms[1].end, k = 1 / Q;
    return drawCrate(ctx, (A.x + B.x) / 2, (A.y + B.y) / 2 + 0.82 * 0.22 * k, k);
  }
  if (held.kind === 'bucket') { const A = cv.pose.arms[0].end, k = 1 / Q; return drawBucket(ctx, A.x, A.y + 0.02 * k, k, 1); }
  if (held.kind === 'phone') {
    // zezadu je vidět displej (focí scénu před sebou), zepředu zadní strana s fotoaparátem
    const back = /back/.test(cv.view?.used ?? '');
    const img = sprite(back ? 'phone_front' : 'phone_back');
    const H = 0.15 / Q;
    if (img) {
      const sw = back ? img.width : img.height * (230 / 415); // (zadní sprite má vpravo cizí kus – oříznout)
      const W = (H * sw) / img.height;
      ctx.drawImage(img, 0, 0, sw, img.height, g.x - W / 2, g.y - H * 0.75, W, H);
    } else { ctx.fillStyle = '#4a4650'; ctx.fillRect(g.x - H * 0.25, g.y - H * 0.75, H * 0.5, H); }
    return;
  }
  if (held.kind === 'shovel' && held.variant === 'broom' && cv.pose.tool) {
    // koště (vektorově) ve stejné afinní matici jako lopata: úchopy na násadě, kartáč dosedá na zem
    const T = cv.pose.tool, S = SHOVEL_SPRITE;
    ctx.save(); ctx.transform(...T.M);
    const tip = { x: 720, y: 300 }; // konec násady nad kartáčem
    ctx.strokeStyle = '#8a5a34'; ctx.lineCap = 'round'; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(S.G.x - 20, S.G.y - 8); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,0.35)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(S.G.x - 10, S.G.y - 16); ctx.lineTo(tip.x - 6, tip.y - 10); ctx.stroke();
    // hlava kartáče (dřevo) a štětiny k zemi (linie hull)
    ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.moveTo(640, 268); ctx.lineTo(800, 252); ctx.lineTo(812, 292); ctx.lineTo(652, 310); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(0, 290, 0, 370); g.addColorStop(0, '#c9a56a'); g.addColorStop(1, '#9c7a45');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(650, 300); ctx.lineTo(812, 284); ctx.lineTo(845, 345); ctx.lineTo(600, 364); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(80,55,30,0.45)'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i <= 10; i++) { const u = i / 10; ctx.moveTo(652 + 160 * u, 302 - 16 * u); ctx.lineTo(604 + 240 * u, 362 - 19 * u); } ctx.stroke();
    ctx.restore();
    return;
  }
  if (held.kind === 'shovel' && cv.pose.tool) {
    // tuhý nástroj z kostry: jediná afinní matice spritu (úchopy rukou jsou body téhož spritu)
    const img = sprite('shovel'), T = cv.pose.tool;
    if (img) {
      ctx.save(); ctx.transform(...T.M); ctx.drawImage(img, 0, 0);
      const load = agent?.anim.tool?.load ?? 0, snow = sprite('shovel_snow');
      if (snow && load > 0.02) {
        // náklad na listu: objem podle hmotnosti (zhutněný sníh), drží se v oblasti listu
        const vol = load / 280, sz = Math.min(1.25, Math.cbrt(vol / 0.009)) * 230;
        ctx.drawImage(snow, SHOVEL_SPRITE.load.x - sz * 0.5, SHOVEL_SPRITE.load.y - sz * 0.55, sz, (sz * snow.height) / snow.width);
      }
      ctx.restore();
    }
    return;
  }
  if (held.kind === 'shovel') {
    const img = sprite('shovel'), sg = shovelGeom(cv, agent);
    if (img) {
      ctx.save(); ctx.translate(sg.org.x, sg.org.y); ctx.rotate(sg.ang); ctx.scale(sg.k, sg.k);
      ctx.drawImage(img, -SHOVEL.G.x, -SHOVEL.G.y);
      ctx.restore();
    }
    return;
  }
  if (held.kind === 'mitten') {
    const img = sprite('mitten_held'), H = 0.17 / Q;
    if (img) { const W = (H * img.width) / img.height; ctx.drawImage(img, g.x - W / 2, g.y - H * 0.2, W, H); }
    return;
  }
  drawCup(ctx, g.x, g.y + 6, 1, held.sips, cv.pose.cupTilt ?? 0);
}

/** Vycházková hůl (vektorově – malovaný podklad zatím chybí): dřevěná násada, zahnutá rukojeť vpřed, gumová patka. */
export function drawCane(ctx: Ctx, c: NonNullable<ReturnType<typeof characterVisual>['pose']['cane']>) {
  const { tip, grip, top, fwd } = c;
  const dx = grip.x - tip.x, dy = grip.y - tip.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // násada (tmavší obrys + světlejší dřevo)
  ctx.strokeStyle = '#3b2516'; ctx.lineWidth = 2.3;
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(top.x, top.y);
  // rukojeť: oblouk nahoře a krátký vodorovný konec vpřed
  const r = 2.6, cx = top.x + fwd * r, cy = top.y;
  ctx.arc(cx, cy, r, fwd > 0 ? Math.PI : 0, fwd > 0 ? Math.PI * 2 : Math.PI, fwd < 0);
  ctx.lineTo(cx + fwd * (r + 3.2), cy + 0.6);
  ctx.stroke();
  ctx.strokeStyle = '#7a4f2e'; ctx.lineWidth = 1.2; ctx.stroke();
  // gumová patka
  ctx.strokeStyle = '#1d1d22'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x + ux * 2.2, tip.y + uy * 2.2); ctx.stroke();
  ctx.restore();
}

function drawShadow(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = 'rgba(60,70,100,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y, 17 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
}

/** Barva pozadí v daném místě (zmenšená kopie pozadí, vytvoří se jednou) – pro závěje u bot. */
const bgSample = new WeakMap<object, { w: number; h: number; d: Uint8ClampedArray; sx: number; sy: number }>();
function backgroundColorAt(project: ProjectFile, images: AssetImages, x: number, y: number): string | undefined {
  const id = project.scene.backgroundAssetId;
  const img = id ? (images.get(id) as unknown as { width: number; height: number } | undefined) : undefined;
  if (!img) return undefined;
  let s = bgSample.get(img);
  if (!s) {
    const f = getCanvasFactory();
    if (!f) return undefined;
    const w = 480, h = Math.round((480 * project.scene.height) / project.scene.width);
    const c = f(w, h); const cx = c.getContext('2d') as CanvasRenderingContext2D;
    cx.drawImage(img as unknown as CanvasImageSource, 0, 0, w, h);
    s = { w, h, d: cx.getImageData(0, 0, w, h).data, sx: w / project.scene.width, sy: h / project.scene.height };
    bgSample.set(img, s);
  }
  // průměr malé oblasti těsně pod chodidly (sníh kolem boty), mírně zesvětlený
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const px = Math.min(s.w - 1, Math.max(0, Math.round(x * s.sx) + dx)), py = Math.min(s.h - 1, Math.max(0, Math.round(y * s.sy) + dy));
    const i = (py * s.w + px) * 4; r += s.d[i]; g += s.d[i + 1]; b += s.d[i + 2]; n++;
  }
  const L = (v: number) => Math.min(255, Math.round((v / n) * 0.97));
  return `rgb(${L(r)},${L(g)},${L(b)})`;
}

function drawAgent(ctx: Ctx, project: ProjectFile, sim: Simulation, a: AgentState, cupScaleFallback: number, images: AssetImages) {
  if (a.clip?.length) {
    // průchod dveřmi: postava je vidět jen v otvoru (zmizí za rámem a karoserií)
    const clip = a.clip; ctx.save(); ctx.beginPath(); clip.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.clip();
    a.clip = null; try { drawAgent(ctx, project, sim, a, cupScaleFallback, images); } finally { a.clip = clip; ctx.restore(); }
    return;
  }
  const c = sim.characterOf(a.id);
  if (!c) return;
  const m = sim.manifests[c.assetId];
  if (!m) return;
  const cv = characterVisual(a, m, c, project.scene);
  drawShadow(ctx, cv.x, cv.y, cv.scale);
  // teplé světlo luceren na postavě (jen v její alfě, izolovaná ROI – B.5)
  const lit = litCtx ? characterLightAt(project, litCtx.objects, litCtx.assets, { x: cv.x, y: cv.y }, litCtx.t) : { g: 0, color: '', dx: 0 };
  if (lit.g > 0.006) {
    const H = 150 * cv.scale, W = 90 * cv.scale;
    const rect = { x: cv.x - W / 2, y: cv.y - H, w: W, h: H + 6 * cv.scale };
    if (drawLitROI(ctx, rect, (c) => drawAgentBody(c, project, sim, a, cv, m, images), (c) => warmOverlay(c, rect, lit.g, lit.color, lit.dx, 0.55))) return;
  }
  drawAgentBody(ctx, project, sim, a, cv, m, images);
  void cupScaleFallback;
}
function drawAgentBody(ctx: Ctx, project: ProjectFile, sim: Simulation, a: AgentState, cv: ReturnType<typeof characterVisual>, m: Simulation['manifests'][string], images: AssetImages) {
  const c = sim.characterOf(a.id)!;
  ctx.save();
  ctx.translate(cv.x, cv.y);
  ctx.scale(cv.mirror ? -cv.scale : cv.scale, cv.scale);
  // pád: malovaný kabát visí podél trupu – v sedu/na zemi se ořízne na úrovni země (nic pod dlažbu)
  if (a.anim.fall) { ctx.beginPath(); ctx.rect(-400, -400, 800, 401.5); ctx.clip(); }
  const held = a.holding ? sim.state.props.find((p) => p.id === a.holding) : undefined;
  if (m.backend === 'skeleton' && cv.rig && m.rigLibrary) {
    const top = held?.kind === 'phone' && /back/.test(cv.view?.used ?? '');
    const snowColor = cv.rig.snowLips ? backgroundColorAt(project, images, cv.x, cv.y + 3 * cv.scale) : undefined;
    // hůl seniora: ve vzdálené ruce za tělem, v blízké se kreslí s předměty v ruce (pod dlaní)
    const cane = cv.pose.cane;
    if (cane && cane.hand === 0) drawCane(ctx, cane);
    const heldFn = held && !top ? () => drawHeld(ctx, held, cv, a) : undefined;
    const nearCane = cane && cane.hand === 1 ? () => drawCane(ctx, cane) : undefined;
    drawRig(ctx, cv.rig, images, m.rigLibraryDir ?? '', softFar(m.rigLibrary.bodyTemplates[0]?.farShade ?? 0.8), heldFn || nearCane ? () => { nearCane?.(); heldFn?.(); } : undefined, snowColor, accessoryDrawer(ctx, project, sim, a, cv));
    // telefon při pohledu zezadu: displej před hlavou je vidět přes rameno → kreslit navrch
    if (held && top) drawHeld(ctx, held, cv);
  } else if (m.backend === 'procedural-test-figure') {
    drawFigure(ctx, cv.pose as Parameters<typeof drawFigure>[1], c.palette, held ? () => drawCup(ctx, cv.pose.handR.x, cv.pose.handR.y + 6, 1, held.sips) : undefined);
  } else {
    // Backend zatím není implementován – zástupný obrys (viz diagnostika).
    ctx.fillStyle = 'rgba(120,120,140,0.6)'; ctx.fillRect(-12, -m.height, 24, m.height);
  }
  ctx.restore();
}

/**
 * Vektorové doplňky postavy (čepice, bambule, šála, palčáky) – kreslí se v lokálních souřadnicích postavy,
 * fyzika (konce šály, bambule) běží ve scéně: lokální bod → scéna = (x·±scale + cv.x, y·scale + cv.y).
 */
function accessoryDrawer(ctx: Ctx, project: ProjectFile, sim: Simulation, a: AgentState, cv: ReturnType<typeof characterVisual>): ((p: AccPart) => void) | undefined {
  const acc = cv.rig?.acc; if (!acc) return undefined;
  const { spec, geo } = acc, sg = cv.mirror ? -1 : 1, k = cv.scale;
  const toS = (p: { x: number; y: number }) => ({ x: cv.x + p.x * sg * k, y: cv.y + p.y * k });
  const toL = (p: { x: number; y: number }) => ({ x: (p.x - cv.x) / (sg * k), y: (p.y - cv.y) / k });
  const ppm = k / Q, t = sim.state.step * SIM_DT;
  const env = project.scene.environment, wind = (project.scene.snowfall?.wind ?? 0.1) * 5 * windFactor(project.seed, t, !!env?.gusts); // m/s
  // vleže (anděl) leží šála na sněhu – volné konce se nekreslí jako visící
  const lying = a.anim.sit?.kind === 'angel' && a.anim.sit.t > 2.6 && a.anim.sit.t < 16;
  const knots = lying ? [] : scarfKnots(spec, geo), seg = ((spec.tailLen * (geo.back ? 0.3 : 0.4)) / Q / TAIL_SEGS) * (geo.neckW / 11);
  const top = spec.hat === 'pompom' ? hatTop(spec, geo) : null;
  // rovina hrudi (ve scéně): normála dopředu kolmo na trup, bod u uzlu
  const fwdL = { x: -geo.torsoUp.y, y: geo.torsoUp.x }; if (fwdL.x < 0) { fwdL.x = -fwdL.x; fwdL.y = -fwdL.y; }
  const chestN = geo.back ? { x: -fwdL.x * sg, y: -fwdL.y } : { x: fwdL.x * sg, y: fwdL.y };
  const ph = stepAccessoryPhysics(sim, a.id, t, {
    knots: knots.map(toS), segPx: knots.map((_, i) => seg * k * (i ? 0.86 : 1)), top: top ? toS(top) : null,
    up: { x: geo.headUp.x * sg, y: geo.headUp.y }, ppm, chestN, chestP: knots.length ? toS({ x: knots[0].x - (geo.back ? -1 : 1) * geo.neckW * 0.05, y: knots[0].y }) : { x: 0, y: 0 }, wind,
  });
  const far = 1;
  return (part) => {
    if (part === 'hat') {
      drawHat(ctx, spec, geo, far);
      if (top && ph.pom) drawPompom(ctx, spec, toL(ph.pom.p), geo.headR * 0.4, far);
      else if (spec.hat === 'earflap') drawPompom(ctx, spec, hatTop(spec, geo), geo.headR * 0.3, far);
    } else if (part === 'scarf') drawScarf(ctx, spec, geo, ph.tails.map((tl) => tl.p.map(toL)), far);
    else if (spec.mittens) {
      const i = part === 'mitten0' ? 0 : 1, hd = geo.hands[i];
      if (hd && !(a.holdingKind === 'mitten' && i === 1)) drawMitten(ctx, spec, hd, i === 0 ? 0.82 : 1, geo.back ? -1 : 1);
    }
  };
}

/** Kontext světel pro aktuální snímek (objekty se zapuštěním a čas). */
let litCtx: { objects: SceneObject[]; assets: Map<string, AssetEntry>; t: number } | null = null;

/**
 * Vykreslí obsah do izolované dočasné plochy (ROI v rozlišení výstupu), upraví ho jen v jeho
 * alfě (`source-atop`) a vloží do scény. Hlavní plátno se nikdy nemaskuje. Vrací false, když
 * plátna nejsou k dispozici (pak volající kreslí přímo).
 */
let roiPool: { c: { width: number; height: number; getContext(k: '2d'): unknown } } | null = null;
function drawLitROI(ctx: Ctx, rect: { x: number; y: number; w: number; h: number }, draw: (c: Ctx) => void, fx: (c: Ctx) => void): boolean {
  const f = getCanvasFactory();
  const tr = (ctx as unknown as { getTransform?: () => { a: number } }).getTransform?.();
  if (!f || !tr) return false;
  const k = Math.max(0.25, tr.a);
  const w = Math.max(1, Math.ceil(rect.w * k)), h = Math.max(1, Math.ceil(rect.h * k));
  if (!roiPool || roiPool.c.width < w || roiPool.c.height < h) roiPool = { c: f(Math.max(w, roiPool?.c.width ?? 0), Math.max(h, roiPool?.c.height ?? 0)) as never };
  const c = roiPool.c.getContext('2d') as Ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w + 1, h + 1);
  c.imageSmoothingEnabled = true;
  c.setTransform(k, 0, 0, k, -rect.x * k, -rect.y * k);
  draw(c);
  c.save(); c.globalCompositeOperation = 'source-atop'; fx(c); c.restore();
  c.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(roiPool.c as unknown as CanvasImageSource, 0, 0, w, h, rect.x, rect.y, w / k, h / k);
  return true;
}
/** Teplé světlo z boku lucerny, silnější nahoře (hlava, ramena); odvrácená strana zůstává chladná. */
function warmOverlay(c: Ctx, rect: { x: number; y: number; w: number; h: number }, g: number, color: string, dx: number, topBias: number) {
  const gx = c.createLinearGradient(dx >= 0 ? rect.x : rect.x + rect.w, 0, dx >= 0 ? rect.x + rect.w : rect.x, 0);
  const col = hexRgb(color);
  gx.addColorStop(0, `rgba(${col},0)`); gx.addColorStop(1, `rgba(${col},${(g * 1.4).toFixed(4)})`);
  c.fillStyle = gx; c.fillRect(rect.x, rect.y, rect.w, rect.h);
  const gy = c.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  gy.addColorStop(0, `rgba(${col},${(g * 0.6).toFixed(4)})`); gy.addColorStop(topBias, `rgba(${col},${(g * 0.25).toFixed(4)})`); gy.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = gy; c.fillRect(rect.x, rect.y, rect.w, rect.h);
}
function hexRgb(h: string): string { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)).join(',') : '255,214,160'; }

/** Obrys podrážky (metry; u = podél boty od středu, v = napříč): pata užší, přednoží širší. */
const SOLE: { u: number; v: number }[] = (() => {
  const L = 0.151 / 2, out: { u: number; v: number }[] = [];
  const width = (u: number) => { const t = (u / L + 1) / 2; return t < 0.35 ? 0.052 + (0.044 - 0.052) * (t / 0.35) : t < 0.55 ? 0.044 : 0.044 + (0.072 - 0.044) * Math.min(1, (t - 0.55) / 0.3); };
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2, u = L * Math.cos(a); out.push({ u, v: (width(u) / 2) * Math.sin(a) }); }
  return out;
})();

/**
 * Stopy ve sněhu: otisky na zemi promítnuté kamerou (do hloubky se zkrátí), jen v oblastech sněhu,
 * pod všemi objekty a postavami. Na konci životnosti plynule slábnou.
 */
/** Otisky pádu ve sněhu (sed, dlaně, kolena) – jednou při dopadu, slábnou jako stopy. */
function drawFallMarks(ctx: Ctx, project: ProjectFile, sim: Simulation, time: number) {
  const cam = cameraFor(project.scene);
  ctx.save();
  for (const m of sim.state.falls!.marks) {
    const age = time - m.t0; if (age < 0) continue;
    const fade = Math.min(1, age / 0.2) * Math.min(1, Math.max(0, (FOOTPRINT_LIFE * 2 - age) / FOOTPRINT_FADE));
    if (fade <= 0) continue;
    const ex = m.kind === 's' ? 1.25 : 1, j = ((m.seed % 13) / 13) * 0.5;
    const pts = Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2, rr = m.r * (1 + 0.08 * Math.sin(3 * a + j * 7)); return toScreen(cam, { X: m.X + Math.cos(a + j) * rr * ex, Z: m.Z + Math.sin(a + j) * rr }); });
    const path = (dy: number) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy))); ctx.closePath(); };
    ctx.fillStyle = `rgba(255,255,255,${(0.16 * fade).toFixed(3)})`; path(-0.8); ctx.fill();
    ctx.fillStyle = `rgba(46,62,104,${(0.24 * fade).toFixed(3)})`; path(0); ctx.fill();
  }
  ctx.restore();
}

/** Stopy válení: z buněk sněhového pole, odkud koule sníh nabraly, prosvítá uhlazený podklad. */
function drawSnowFieldTrails(ctx: Ctx, project: ProjectFile, sim: Simulation) {
  const cam = cameraFor(project.scene), fields = (sim.state as { snowFields?: Record<string, SnowField> }).snowFields!;
  const full = SNOW.depth * SNOW.density * SNOW.cell * SNOW.cell;
  ctx.save();
  for (const f of Object.values(fields)) {
    if (!f.removed) continue;
    for (let j = 0; j < f.nz; j++) for (let i = 0; i < f.nx; i++) {
      const m = f.m[j * f.nx + i]; if (m < 0 || m > full * 0.5) continue; // −1 = mimo sníh
      const X = f.gx + (i + 0.5) * SNOW.cell, Z = f.gz + (j + 0.5) * SNOW.cell;
      const a = toScreen(cam, { X: X - SNOW.cell * 0.55, Z: Z - SNOW.cell * 0.55 }), b = toScreen(cam, { X: X + SNOW.cell * 0.55, Z: Z + SNOW.cell * 0.55 });
      ctx.fillStyle = `rgba(118,128,168,${(0.5 * (1 - m / full)).toFixed(3)})`; // uhlazený, prošlapaný pás
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 0.6, Math.abs(b.y - a.y) + 0.6);
    }
  }
  ctx.restore();
}

/** Proutěný košík s ozdobami (vektorově – malovaný podklad chybí). */
function drawBasket(ctx: Ctx, cam: ReturnType<typeof cameraFor>, d: CoopData) {
  const c = toScreen(cam, { X: d.basket.X, Z: d.basket.Z }), px = (m: number) => (m * cam.f) / d.basket.Z;
  const w = px(0.34), h = px(0.16);
  ctx.save();
  ctx.fillStyle = 'rgba(98,113,150,0.22)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, w * 0.6, Math.max(0.8, h * 0.25), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a5a32'; ctx.beginPath(); ctx.moveTo(c.x - w / 2, c.y - h); ctx.lineTo(c.x + w / 2, c.y - h); ctx.lineTo(c.x + w * 0.4, c.y); ctx.lineTo(c.x - w * 0.4, c.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#6b4224'; ctx.lineWidth = Math.max(0.5, px(0.012));
  for (let k = 1; k < 4; k++) { const y = c.y - h + (h * k) / 4; ctx.beginPath(); ctx.moveTo(c.x - w * (0.5 - 0.1 * k / 4), y); ctx.lineTo(c.x + w * (0.5 - 0.1 * k / 4), y); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(c.x, c.y - h, w / 2, Math.max(0.6, h * 0.22), 0, 0, Math.PI * 2); ctx.stroke();
  let k = 0;
  for (const it of d.basket.items) if (it.state === 'basket') { drawOrnament(ctx, cam, it.kind, c.x - w * 0.25 + k * w * 0.17, c.y - h * 1.05, d.basket.Z); k++; }
  ctx.restore();
}
function drawOrnament(ctx: Ctx, cam: ReturnType<typeof cameraFor>, kind: string, x: number, y: number, Z: number) {
  const px = (m: number) => (m * cam.f) / Z;
  if (kind === 'nose') { const c = sprite('carrot'); const w = px(0.12); if (c) ctx.drawImage(c, x - w / 2, y - (w * c.height) / c.width / 2, w, (w * c.height) / c.width); else { ctx.fillStyle = '#e0782f'; ctx.fillRect(x - w / 2, y - 1, w, 2); } return; }
  if (kind === 'scarf') { ctx.fillStyle = '#a3322f'; ctx.beginPath(); ctx.ellipse(x, y, px(0.08), Math.max(0.8, px(0.03)), 0.2, 0, Math.PI * 2); ctx.fill(); return; }
  const n = kind === 'eyes' ? 2 : 3; ctx.fillStyle = '#26262e';
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x + (i - (n - 1) / 2) * px(0.035), y, Math.max(0.6, px(0.016)), 0, Math.PI * 2); ctx.fill(); }
}

/**
 * Led kluziště (testovací vzhled – malované pozadí kluziště dodá grafik): plocha s jemným odleskem a
 * stopy nožů (jen skutečný kontakt, omezený počet, postupně mizí).
 */
function drawRinkIce(ctx: Ctx, project: ProjectFile, sim: Simulation | null, images: AssetImages, reduced = false) {
  const cfg = project.rink!, cam = cameraFor(project.scene);
  ctx.save();
  ctx.beginPath(); cfg.ice.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
  if (cfg.paintedIce) ctx.clip(); else {
  const ys = cfg.ice.map((p) => p.y), g = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  g.addColorStop(0, 'rgba(206,222,240,0.92)'); g.addColorStop(1, 'rgba(226,236,248,0.94)');
  ctx.fillStyle = g; ctx.fill(); ctx.clip();
  // tlumený odraz světel (pruhy)
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let k = 0; k < 4; k++) { const x0 = Math.min(...cfg.ice.map((p) => p.x)) + k * 340; ctx.beginPath(); ctx.moveTo(x0, Math.min(...ys)); ctx.lineTo(x0 + 60, Math.min(...ys)); ctx.lineTo(x0 + 160, Math.max(...ys)); ctx.lineTo(x0 + 120, Math.max(...ys)); ctx.closePath(); ctx.fill(); }
  }
  const st = sim?.state.rink, t = sim?.time() ?? 0;
  if (st) {
    ctx.lineCap = 'round'; ctx.lineWidth = 0.8;
    for (const q of st.trails) {
      const age = t - q.t0, a = Math.max(0, 1 - age / 60) * 0.35; if (a <= 0.01) continue;
      const A = toScreen(cam, { X: q.X, Z: q.Z }), B = toScreen(cam, { X: q.X2, Z: q.Z2 });
      ctx.strokeStyle = `rgba(150,166,196,${a.toFixed(3)})`; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    if (sim && cfg.reflections !== false) drawIceReflections(ctx, project, sim, images, cfg.reflections ?? { alpha: 0.18, len: 0.4 });
    if (sim && cfg.particles && !reduced) drawIceSpray(ctx, project, sim, cam, t);
  }
  ctx.restore();
}
/**
 * Odrazy bruslařů v ledu: převrácené, zkrácené (len × výška), slabé a rozostřené (vykreslené v 1/3
 * rozlišení a zvětšené zpět), omezené maskou ledu (volající ořezává obrysem). Odrazy domů už v kresbě jsou.
 */
let reflCanvas: { c: ReturnType<NonNullable<ReturnType<typeof getCanvasFactory>>>; w: number; h: number } | null = null;
function drawIceReflections(ctx: Ctx, project: ProjectFile, sim: Simulation, images: AssetImages, R: { alpha: number; len: number }) {
  const fac = getCanvasFactory(); if (!fac) return;
  const W = project.scene.width, H = project.scene.height, D = 3, w = Math.ceil(W / D), h = Math.ceil(H / D);
  if (!reflCanvas || reflCanvas.w !== w || reflCanvas.h !== h) reflCanvas = { c: fac(w, h), w, h };
  const rc = reflCanvas.c.getContext('2d') as unknown as Ctx;
  rc.setTransform(1, 0, 0, 1, 0, 0); rc.clearRect(0, 0, w, h); rc.setTransform(1 / D, 0, 0, 1 / D, 0, 0);
  let any = false;
  for (const a of sim.state.agents) {
    if (!a.onIce || a.hidden) continue;
    const c = sim.characterOf(a.id), m = c ? sim.manifests[c.assetId] : undefined; if (!c || !m) continue;
    const cv = characterVisual(a, m, c, project.scene);
    rc.save(); rc.translate(cv.x, cv.y); rc.scale(1, -R.len); rc.translate(-cv.x, -cv.y);
    drawAgentBody(rc, project, sim, a, cv, m, images); rc.restore(); any = true;
  }
  if (!any) return;
  // dál od chodidel slábne (zeslabení směrem dolů v rámci každého odrazu nahrazuje krátká délka)
  ctx.save(); ctx.globalAlpha = R.alpha; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(reflCanvas.c as unknown as CanvasImageSource, 0, 0, W, H); ctx.restore();
}
/** Ledová tříšť: drobné částice u bruslí při prudším brzdění (deterministické z času a id, počet omezený). */
function drawIceSpray(ctx: Ctx, project: ProjectFile, sim: Simulation, cam: ReturnType<typeof cameraFor>, t: number) {
  const st = sim.state.rink!; let budget = 60;
  for (const s of Object.values(st.sk)) {
    const hard = (s.st === 'BRAKE' && s.v > 0.35) || (s.st === 'FALL' && (s.fall?.t ?? 9) < 0.8 && s.v > 0.3);
    if (!hard || budget <= 0) continue;
    const seed = s.id.length * 131 + s.id.charCodeAt(s.id.length - 1), fx = Math.cos(s.psi), fz = Math.sin(s.psi), px = toScreen(cam, { X: s.X, Z: s.Z }), k = depthScaleAt(project.scene.depth, px.y);
    for (let i = 0; i < 8 && budget > 0; i++, budget--) {
      const ph = (t * 3 + hashNoise(seed, i, 1)) % 1, side = i % 2 ? 1 : -1; // každá částice žije 1/3 s
      const out = 0.15 + ph * 0.45 * (0.6 + hashNoise(seed, i, Math.floor(t * 3 + hashNoise(seed, i, 1))) * 0.8);
      const P = toScreen(cam, { X: s.X + fx * 0.25 * ph - fz * side * out, Z: s.Z + fz * 0.25 * ph + fx * side * out }, 0.02 + Math.sin(Math.PI * ph) * 0.12);
      ctx.fillStyle = `rgba(250,252,255,${(0.75 * (1 - ph)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(P.x, P.y, Math.max(0.6, 1.6 * k), 0, Math.PI * 2); ctx.fill();
    }
  }
}
/** Pomalé nepravidelné třpytění světýlek stromu (jen malé záblesky nad kresbou, průhlednost stromu se nemění). */
function drawSparkles(ctx: Ctx, o: SceneObject, a: AssetEntry, t: number) {
  const r = objectImageRect(o, a), pts = a.sparkle ?? [];
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  pts.forEach(([u, v], i) => {
    const w = 0.35 + hashNoise(7, i, 1) * 0.7, ph = hashNoise(7, i, 2) * 6.283, s0 = Math.sin(t * w + ph) * 0.5 + Math.sin(t * w * 0.37 + ph * 1.7) * 0.5;
    const I = Math.pow(Math.max(0, s0), 6); if (I < 0.03) return;
    const x = r.x + (o.flipX ? 1 - u : u) * r.w, y = r.y + v * r.h, R = Math.max(1.5, r.w * 0.012);
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 2.2);
    g.addColorStop(0, `rgba(255,246,214,${(0.85 * I).toFixed(3)})`); g.addColorStop(0.35, `rgba(255,220,150,${(0.35 * I).toFixed(3)})`); g.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 2.2, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}
const tramGeoCache = new WeakMap<object, TramGeo>();
function tramGeoOf(p: ProjectFile): TramGeo {
  let g = tramGeoCache.get(p.tram!); if (!g) { g = tramGeo(p.tram!, (y) => depthScaleAt(p.scene.depth, y) / Q); tramGeoCache.set(p.tram!, g); } return g;
}
/** Tramvaj: sprite v matici (přední podvozek na koleji, měřítko hloubky, zkosení), dveře jako lokální vrstva. */
function drawTram(ctx: Ctx, project: ProjectFile, sim: Simulation, g: TramGeo, images: AssetImages) {
  const c = project.tram!, st = sim.state.tram!, img = images.get(c.sprite.assetId) as (CanvasImageSource & { width: number; height: number }) | undefined; if (!img) return;
  const { M } = tramMatrix(c, g, st.m, (y) => depthScaleAt(project.scene.depth, y) / Q);
  ctx.save(); ctx.transform(...M); ctx.drawImage(img, 0, 0);
  if (st.door > 0.001) {
    // otevřené dveře: dvě křídla se odsouvají ke stranám (výřez z téhož spritu), mezi nimi teplý vstup
    const [x0, y0, x1, y1] = c.sprite.door, mx = (x0 + x1) / 2, hw = (x1 - x0) / 2, o = st.door * hw * 0.92;
    const gr = ctx.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#5a3a22'); gr.addColorStop(0.55, '#c98a3e'); gr.addColorStop(1, '#3a2416');
    ctx.fillStyle = gr; ctx.fillRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 6);
    ctx.fillStyle = 'rgba(255,210,140,0.25)'; ctx.fillRect(mx - o, y0 + 10, 2 * o, (y1 - y0) * 0.5);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.drawImage(img, x0, y0, hw, y1 - y0, x0 - o, y0, hw, y1 - y0);
    ctx.drawImage(img, mx, y0, hw, y1 - y0, mx + o, y0, hw, y1 - y0);
    ctx.restore();
  }
  ctx.restore();
  void doorQuad;
}
/** Dveře pekárny (křídlo z výřezu pozadí, otáčí se dovnitř kolem pantu), zametená místa a drobky sněhu. */
function drawBakery(ctx: Ctx, project: ProjectFile, sim: Simulation, images: AssetImages) {
  const c = project.bakery!, st = sim.state.bakery, t = sim.time(); if (!st) return;
  // zametená místa: jemně tmavší (vlhká dlažba), pozvolna znovu zapadají sněhem
  for (const q of st.patches) {
    const k = 1 - (t - q.t0) / BAKERY_REFILL; if (k <= 0) continue;
    const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
    g.addColorStop(0, `rgba(120,120,140,${(0.22 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(120,120,140,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r, q.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const q of st.crumbs) {
    const a = t - q.t0, k = 1 - a / 0.7; if (k <= 0) continue;
    const x = q.x + q.vx * a, y = q.y + q.vy * a + 0.5 * 9.81 * a * a * (q.vy === 0 ? 0 : -q.vy / 0.9 / 3);
    ctx.fillStyle = `rgba(250,252,255,${(0.9 * k).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, Math.min(y, q.y), 1.6, 0, Math.PI * 2); ctx.fill();
  }
  drawGrit(ctx, st.grit, t, GRIT_LIFE);
  // cedule na dveřích (A18d): závěs v horní části křídla, otáčí se jen gestem pekaře, pak dozní
  const sign = () => { if (!c.sign) return; const d = c.door, w = d.x1 - d.x0, sw = (t - st.sign.rel) < 4 ? 0.12 * Math.exp(-(t - st.sign.rel) * 1.4) * Math.sin((t - st.sign.rel) * 7) : 0; drawSign(ctx, w * 0.5, (d.y1 - d.y0) * 0.36, w * 0.62, st.sign.side, st.sign.flip, sw); };
  if (st.door <= 0.001) { ctx.save(); ctx.translate(c.door.x0, c.door.y0); sign(); ctx.restore(); return; }
  const bg = project.scene.backgroundAssetId ? images.get(project.scene.backgroundAssetId) as (CanvasImageSource & { width: number; height: number }) | undefined : undefined; if (!bg) return;
  const d = c.door, w = d.x1 - d.x0, h = d.y1 - d.y0, kx = bg.width / project.scene.width, ky = bg.height / project.scene.height;
  // otvor: teplé světlo obchodu (lehce tlumené), na podlaze odlesk
  const gr = ctx.createLinearGradient(0, d.y0, 0, d.y1); gr.addColorStop(0, '#6b4524'); gr.addColorStop(0.5, '#e0a55a'); gr.addColorStop(1, '#8a5a30');
  ctx.fillStyle = gr; ctx.fillRect(d.x0, d.y0, w, h);
  ctx.fillStyle = 'rgba(80,45,20,0.35)'; ctx.fillRect(d.x0 + w * 0.15, d.y0 + h * 0.15, w * 0.7, h * 0.85); // police v hloubce
  // křídlo: otáčí se dovnitř kolem levého pantu – zúžené (cos úhlu), lehce ztmavené a zkosené perspektivou
  const ang = st.door * 1.35, cw = Math.max(2, w * Math.cos(ang)), sk = Math.sin(ang) * h * 0.06;
  ctx.save(); const hx = c.door.hinge === 'left' ? d.x0 : d.x1;
  const sgn = c.door.hinge === 'left' ? 1 : -1;
  ctx.transform((cw / w) * sgn, -sgn * sk / w, 0, 1, hx, d.y0);
  ctx.drawImage(bg, d.x0 * kx, d.y0 * ky, w * kx, h * ky, sgn > 0 ? 0 : -w, 0, w, h);
  ctx.fillStyle = `rgba(30,18,10,${(0.35 * st.door).toFixed(3)})`; ctx.fillRect(0, 0, w, h);
  if (sgn < 0) ctx.translate(-w, 0);
  sign();
  ctx.restore();
}
/** Mantinel: krátké úseky řazené podle hloubky (postavy za ním i před ním), výška `boardH` (0,95 m). */
function rinkBoardItems(ctx: Ctx, project: ProjectFile): { key: number; tie: number; draw: () => void }[] {
  const cfg = project.rink!, cam = cameraFor(project.scene), W = cfg.ice.map((p) => toWorld(cam, p)), out: { key: number; tie: number; draw: () => void }[] = [];
  const gate = toWorld(cam, cfg.gate), H = cfg.boardH ?? 0.95;
  for (let i = 0; i < W.length; i++) {
    const a = W[i], b = W[(i + 1) % W.length], L = Math.hypot(b.X - a.X, b.Z - a.Z), n = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 0; k < n; k++) {
      const p = { X: a.X + ((b.X - a.X) * k) / n, Z: a.Z + ((b.Z - a.Z) * k) / n }, q = { X: a.X + ((b.X - a.X) * (k + 1)) / n, Z: a.Z + ((b.Z - a.Z) * (k + 1)) / n };
      const mid = { X: (p.X + q.X) / 2, Z: (p.Z + q.Z) / 2 };
      if (Math.hypot(mid.X - gate.X, mid.Z - gate.Z) < 0.45) continue; // branka
      const p0 = toScreen(cam, p), q0 = toScreen(cam, q), p1 = toScreen(cam, p, H), q1 = toScreen(cam, q, H), pr = toScreen(cam, p, H - 0.12), qr = toScreen(cam, q, H - 0.12);
      out.push({ key: Math.max(p0.y, q0.y) - 0.5, tie: 9000, draw: () => {
        ctx.fillStyle = 'rgba(244,246,250,0.96)'; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(p1.x, p1.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b8322f'; ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(qr.x, qr.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(p1.x, p1.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(120,130,160,0.5)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(q0.x, q0.y); ctx.stroke();
      } });
    }
  }
  return out;
}

function drawFootprints(ctx: Ctx, project: ProjectFile, sim: Simulation, time: number) {
  const fps = sim.state.footprints;
  const snow = project.areas.filter((a) => a.kind === 'snow' && a.polygon.length >= 3);
  if (!fps?.length || !snow.length) return;
  const cam = cameraFor(project.scene);
  ctx.save();
  ctx.beginPath();
  for (const a of snow) { a.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
  ctx.clip();
  for (const f of fps) {
    const age = time - f.t0;
    if (age < 0) continue;
    const fade = Math.min(1, age / 0.15) * Math.min(1, Math.max(0, (FOOTPRINT_LIFE - age) / FOOTPRINT_FADE));
    if (fade <= 0) continue;
    const c = Math.cos(f.yaw), sn = Math.sin(f.yaw), j = ((f.seed % 97) / 97 - 0.5) * 0.06; // drobná odchylka tvaru
    const pts = SOLE.map((q) => toScreen(cam, { X: f.X + (q.u * c - q.v * (1 + j) * sn) * f.size, Z: f.Z + (q.u * sn + q.v * (1 + j) * c) * f.size }));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    if (maxX < 0 || minX > project.scene.width || maxY < 0 || minY > project.scene.height) continue;
    if (Math.max(maxX - minX, maxY - minY) < 0.35) continue; // daleko: neviditelné
    // čitelnost: otisk aspoň ~1,2 px vysoký (jen vykreslení, ne fyzická stopa – zadání D4)
    const hgt = maxY - minY;
    if (hgt < 1.2) { const cy = (minY + maxY) / 2, k = 1.2 / Math.max(1e-3, hgt); for (const p of pts) p.y = cy + (p.y - cy) * k; minY = cy - 0.6; maxY = cy + 0.6; }
    const path = (dy: number) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy))); ctx.closePath(); };
    // vyhrnutý světlý okraj (o kousek výš), pak studená prohlubeň
    const rim = Math.max(0.35, (maxY - minY) * 0.18);
    ctx.fillStyle = `rgba(255,255,255,${(0.13 * fade).toFixed(3)})`; path(-rim); ctx.fill();
    ctx.fillStyle = `rgba(46,62,104,${(0.2 * fade).toFixed(3)})`; path(0); ctx.fill();
  }
  ctx.restore();
}

/**
 * Prodavač ve stánku: postava za pultem (ve stavu klidu), vidět jen v okně stánku nad pultem.
 * Když zákazník objednává, mluví s ním a natočí se k němu; při předání podává zboží.
 */
/** Měřítko prodavače: podíl výšky stánku (koncept) vůči výšce postavy v dané hloubce scény. */
function sellerBaseScale(project: ProjectFile, o: SceneObject, sl: NonNullable<SceneObject['seller']>, y: number): number {
  if (!sl.heightOfStall) return 1;
  const a = project.assets.find((x) => x.id === o.assetId);
  const H = (a?.height ?? 100) * (a?.pixelScale ?? 1) * o.scale;
  return (sl.heightOfStall * H) / 130 / Math.max(0.05, depthScaleAt(project.scene.depth, y));
}

function drawSeller(ctx: Ctx, project: ProjectFile, sim: Simulation, o: SceneObject, images: AssetImages) {
  const sl = o.seller!;
  const m = sim.manifests[sl.assetId];
  if (!m || m.backend !== 'skeleton') return;
  const t = sim.time();
  const pos = objectLocalToScene(o, sl.offset);
  // stav prodavače ze simulace (attend / retrieve / handover / tidy)
  const vs = sim.state.vendors?.[o.id];
  const cust = vs?.customerId ? sim.state.agents.find((a) => a.id === vs.customerId) : undefined;
  const seed = hashNoise(o.id.length * 31 + o.x, 7) * 10;
  const since = vs ? t - vs.since : 0;
  // při přípravě zboží se otočí k regálu (zády), jinak k zákazníkovi nebo do volného prostoru
  const dir = vs?.mode === 'retrieve' && since > 0.4 && since < 2.2 ? (seed > 5 ? 'NE' : 'NW') : cust ? (cust.pos.x < pos.x ? 'SW' : 'SE') : seed > 5 ? 'SE' : 'SW';
  const anim = { dir, walkPhase: 0, walkBlend: 0, idleTime: t + seed, action: null as AgentState['anim']['action'] } as AgentState['anim'];
  if (vs?.mode === 'attend' && cust?.activity?.phase === 'order') {
    // rozhovor se zákazníkem řídí režisér (prodavač je jeho virtuální účastník): mluví ve svých
    // tazích a na akcentech frází občas zdůrazní řeč rukou; když mluví zákazník, poslouchá
    const vid = `v:${o.id}`;
    const conv = sim.state.social?.convs.find((c) => c.members.includes(vid));
    const turn = conv?.turns.find((x) => x.speaker === vid && x.start <= t && t < x.end);
    anim.speaking = !!turn;
    if (turn) {
      const ph = turn.phrases.find((p, i) => (turn.id + i) % 2 === 0 && t >= p.accent - 0.62 && t < p.accent - 0.62 + 1.4);
      if (ph) anim.gestures = [{ fam: 'beat', t: t - (ph.accent - 0.62), dur: 1.4, hand: 0, amp: 0.9, sgn: 1 }];
    }
  } else if (vs?.mode === 'retrieve' || vs?.mode === 'tidy') {
    // sáhne do regálu / srovná zboží na pultu (krátké opakované dosahy)
    const per = vs.mode === 'retrieve' ? 1.6 : 1.3;
    anim.action = { requested: 'drop', clip: 'drop', time: (since % per) / per * 1.1, duration: 1.1, loop: 'once', events: [], finished: false };
  } else if (vs?.mode === 'handover' && cust?.activity) {
    anim.action = { requested: 'receive', clip: 'receive', time: Math.min(1.1, t - cust.activity.phaseStart), duration: 1.1, loop: 'once', events: [], finished: false };
  }
  const agent = { id: 'seller:' + o.id, name: sl.name ?? 'Prodavač', pos, facing: dir === 'SE' ? 0.6 : Math.PI - 0.6, anim, holding: null } as unknown as AgentState;
  const cv = characterVisual(agent, m, { baseScale: sellerBaseScale(project, o, sl, pos.y), appearance: sl.appearance }, project.scene);
  if (!cv.rig || !m.rigLibrary) return;
  const a0 = objectLocalToScene(o, { x: sl.window.x0, y: sl.window.y0 }), a1 = objectLocalToScene(o, { x: sl.window.x1, y: sl.window.y1 });
  const win = { x: Math.min(a0.x, a1.x), y: a0.y, w: Math.abs(a1.x - a0.x), h: a1.y - a0.y };
  const body = (c: Ctx) => {
    c.save();
    c.beginPath(); c.rect(win.x, win.y, win.w, win.h); c.clip();
    c.translate(cv.x, cv.y);
    c.scale(cv.mirror ? -cv.scale : cv.scale, cv.scale);
    drawRig(c as unknown as CanvasRenderingContext2D, cv.rig!, images, m.rigLibraryDir ?? '', softFar(m.rigLibrary!.bodyTemplates[0]?.farShade ?? 0.8));
    c.restore();
  };
  // prodavač je uvnitř: pod střechou zastíněný (interiorShade 0,10–0,22), od luceren teplé světlo
  const integ = !!o.integration?.lights.enabled;
  const fx = (c: Ctx) => {
    const g = c.createLinearGradient(0, win.y, 0, win.y + win.h);
    g.addColorStop(0, 'rgba(28,24,46,0.22)'); g.addColorStop(0.55, 'rgba(28,24,46,0.12)'); g.addColorStop(1, 'rgba(28,24,46,0.06)');
    c.fillStyle = g; c.fillRect(win.x, win.y, win.w, win.h);
    if (integ) warmOverlay(c, win, 0.13 * (o.integration!.lights.gain), '#FFD6A0', 0, 0.6);
  };
  if (!(integ || o.integration) || !drawLitROI(ctx, win, body, fx)) body(ctx);
}

/** Vykreslí scénu do kontextu, jehož transformace mapuje logické souřadnice scény na výstup. */
export function drawScene(ctx: Ctx, project: ProjectFile, sim: Simulation | null, images: AssetImages, opts: DrawOptions) {
  const sc = project.scene;
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  ctx.fillStyle = sc.backgroundColor; ctx.fillRect(0, 0, sc.width, sc.height);
  if (sc.backgroundAssetId) {
    const img = images.get(sc.backgroundAssetId);
    if (img) ctx.drawImage(img as CanvasImageSource, 0, 0, sc.width, sc.height);
  }
  const removed = new Set(sim?.state.removedObjects ?? []);
  const visible = project.objects.map((o, i) => ({ o, i })).filter(({ o }) => o.visible && !removed.has(o.id));
  const fixed = (layer: 'background' | 'foreground') => visible.filter(({ o }) => o.layer === layer).sort((a, b) => a.o.zBias - b.o.zBias || a.i - b.i);
  for (const { o } of fixed('background')) drawObject(ctx, o, assets.get(o.assetId), images.get(o.assetId));
  // okna a dveře budovy v pozadí (rozsvícení, otevření při průchodu)
  // odklizený pruh (A11): plochý decal dlažby pod chodci; odkrývá se zleva podle postupu, při sněžení zapadá
  if (sim?.state.clearing?.snow) drawSnowSurface(ctx, project, sim.state.clearing.snow, sprite('pavement'));
  if (sc.environment && (sc.environment.windows?.length || sc.environment.door)) drawFacade(ctx, project, (sc.backgroundAssetId ? images.get(sc.backgroundAssetId) : null) as never, (images.get('sprite_door_interior') ?? null) as never, sim?.state.doorPasses, opts.time);
  if (sim) drawFootprints(ctx, project, sim, sim.time());
  if (sim?.state.falls?.marks.length) drawFallMarks(ctx, project, sim, sim.time());
  if (project.rink) drawRinkIce(ctx, project, sim, images, !!opts.reducedMotion);
  if (project.bakery && sim) drawBakery(ctx, project, sim, images);
  // otisky sněhových andělů (A07): na zemi pod postavami
  if (sim?.state.angels?.length) { const cm = cameraFor(project.scene); for (const an of sim.state.angels) { const c = Math.cos(an.dir), s = Math.sin(an.dir); drawAngelImprint(ctx, (a, b) => toScreen(cm, { X: an.X + a * c - b * s, Z: an.Z + a * s + b * c }), an.arms, an.legs, 1 - (opts.time - an.t0) / ANGEL_LIFE, an.getup); } }
  if (sim && (sim.state as { snowFields?: Record<string, SnowField> }).snowFields) drawSnowFieldTrails(ctx, project, sim);
  const worldObjs = visible.filter(({ o }) => o.layer === 'world').map(({ o }) => o);
  drawGroundIntegration(ctx, project, worldObjs, assets, opts.time);
  litCtx = { objects: worldObjs.filter((o) => o.integration), assets, t: opts.time };
  spriteSrc = images;

  // Světová vrstva: řazení podle bodu kontaktu se zemí (+ ruční úprava pořadí).
  type Item = { key: number; tie: number; draw: () => void };
  const items: Item[] = [];
  const objKey = new Map<string, number>();
  for (const { o, i } of visible) if (o.layer === 'world') {
    const key = o.y + o.zBias; objKey.set(o.id, key);
    items.push({ key, tie: i, draw: () => {
      const as = assets.get(o.assetId), im = images.get(o.assetId);
      drawObject(ctx, o, as, (o.integration && as ? gradedImage(o, as, im, project) : im) as typeof im, sim ? lidOpenness(sim.state, o.id, sim.time()) : 0);
      if (as?.sparkle?.length && !opts.reducedMotion) drawSparkles(ctx, o, as, opts.time);
      if (o.seller && sim) drawSeller(ctx, project, sim, o, images);
      if (o.integration && as) drawObjectIntegration(ctx, project, o, as, opts.time, backgroundColorAt(project, images, o.x, o.y + 6));
    } });
  }
  if (sim) {
    // tramvaj: kdo stojí za kolejemi (vzdálený chodník), je vždy za ní; kdo před nimi, před ní
    const tr = project.tram && sim.state.tram && tramVisible(sim.state.tram) ? project.tram : null, trG = tr ? tramGeoOf(project) : null, K_TRAM = 600;
    const keyOf = (a: AgentState) => {
      if (!trG) return a.pos.y;
      if (a.clip && a.tram) return K_TRAM + 0.5; // ve dveřích: hned po voze (ořez rámem)
      const ty = trackYAt(trG, a.pos.x); if (ty === null) return a.pos.y;
      return a.pos.y < ty ? a.pos.y - 5000 : Math.max(a.pos.y, K_TRAM + 1);
    };
    for (const a of sim.state.agents) if (!a.hidden) items.push({ key: keyOf(a), tie: 10000 + sim.state.agents.indexOf(a), draw: () => drawAgent(ctx, project, sim, a, 1, images) });
    if (tr && trG) items.push({ key: K_TRAM, tie: 9500, draw: () => drawTram(ctx, project, sim, trG, images) });
    const pst = sim.state.pram;
    if (pst?.S && pst.phase !== 'offstage') { const cc = toScreen(cameraFor(sc), pramPoints(pst).center), k = depthScaleAt(sc.depth, cc.y) / Q; items.push({ key: cc.y, tie: 12490, draw: () => drawPram(ctx, cameraFor(sc), pst, k) }); }
    const bst = sim.state.bakery;
    if (bst?.crate.out && project.bakery?.crateSpot) { const cr = bst.crate, k = depthScaleAt(sc.depth, cr.y) / Q; items.push({ key: cr.y, tie: 19990, draw: () => drawCrate(ctx, cr.x, cr.y, k) }); }
    for (const p of sim.state.props) {
      const s = depthScaleAt(sc.depth, propY(p)) * 1.0;
      if (p.place.kind === 'counter') {
        const pl = p.place;
        const age = opts.time - p.appearedAt;
        const pop = 0.6 + 0.4 * smoothstep(clamp(age / 0.3, 0, 1));
        items.push({ key: (objKey.get(pl.objectId) ?? pl.y) + 0.5, tie: 20000, draw: () => drawProp(ctx, p, pl.x, pl.y, s * pop) });
      } else if (p.place.kind === 'ground') {
        const pl = p.place;
        if (p.kind === 'mitten') {
          // upadlá rukavice: 0,35 s pád z výšky ruky (zrychleně), malé odskočení, pak leží
          const k = clamp((opts.time - p.appearedAt) / 0.35, 0, 1), h0 = Number(p.variant ?? 0);
          const lift = h0 * (1 - k * k) + (k >= 1 ? 0 : 0), rot = (1 - k) * 1.2;
          items.push({ key: pl.y, tie: 20000, draw: () => drawGroundMitten(ctx, pl.x, pl.y - lift, s, rot) });
        } else items.push({ key: pl.y, tie: 20000, draw: () => drawProp(ctx, p, pl.x, pl.y, s) });
      } else if (p.place.kind === 'falling') {
        const pl = p.place;
        const k = clamp((opts.time - pl.t0) / Math.max(1e-3, pl.t1 - pl.t0), 0, 1);
        const x = pl.from.x + (pl.to.x - pl.from.x) * k, y = pl.from.y + (pl.to.y - pl.from.y) * k * k - Math.sin(k * Math.PI) * 10;
        items.push({ key: (objKey.get(pl.binId) ?? pl.to.y) - 0.5, tie: 20000, draw: () => drawCup(ctx, x, y + 6, s * (1 - 0.25 * k), p.sips) });
      }
    }
  }
  if (sim) {
    // sněhuláci (runtime objekty) a rozpracované koule – řazené podle bodu dotyku se zemí
    const cam = cameraFor(sc);
    for (const o of sim.state.runtimeObjects ?? []) items.push({ key: o.y, tie: 15000, draw: () => drawSnowman(ctx, cam, o, opts.time) });
    // psi a kočky (+ vodítko od ruky majitele k obojku)
    for (const an of sim.state.animals ?? []) {
      if (an.hidden) continue;
      const ds = depthScaleAt(sc.depth, an.pos.y), ppm = ds / Q;
      // kočka na soklu / ve skoku (Z09): zvednutá o výšku h, řazená před objekt soklu
      const lift = (an.h ?? 0) > 0.005 ? an.pos.y - toScreen(cam, toWorld(cam, an.pos), an.h ?? 0).y : 0;
      const perch = an.perch !== null && an.perch !== undefined ? project.catPerches?.[an.perch] : undefined;
      const akey = lift > 0 && perch ? Math.max(an.pos.y, perch.sortY) : an.pos.y;
      items.push({ key: akey, tie: 12000, draw: () => {
        ctx.save(); ctx.translate(an.pos.x, an.pos.y);
        if (lift > 0 && an.mode !== 'sit' && an.mode !== 'groom') { drawAnimalShadow(ctx, an, ppm * Math.max(0.5, 1 - (an.h ?? 0))); }
        ctx.translate(0, -lift);
        if (!(lift > 0 && an.mode !== 'sit' && an.mode !== 'groom')) drawAnimalShadow(ctx, an, ppm);
        drawAnimal(ctx, an, (n) => (images.get(`animal_${n}`) ?? null) as never, ppm, opts.time); ctx.restore();
      } });
      const owner = an.ownerId ? sim.state.agents.find((x) => x.id === an.ownerId) : undefined;
      if (owner && !owner.hidden) {
        const oc = sim.characterOf(owner.id), om = oc ? sim.manifests[oc.assetId] : undefined;
        if (oc && om) {
          const cv = characterVisual(owner, om, oc, sc), hand = localToScene(cv, cv.grip);
          const dir = Math.cos(an.facing) < 0 ? -1 : 1;
          const collar = { x: an.pos.x + dir * SPECIES.dog.length * 0.42 * ppm, y: an.pos.y - SPECIES.dog.shoulder * 1.05 * ppm };
          const key = Math.max(owner.pos.y, an.pos.y) + 0.1;
          items.push({ key, tie: 12001, draw: () => {
            const mx = (hand.x + collar.x) / 2, my = Math.max(hand.y, collar.y) + Math.max(4, Math.abs(hand.x - collar.x) * 0.18) * Math.min(1, ds);
            ctx.save(); ctx.strokeStyle = 'rgba(70,40,30,0.85)'; ctx.lineWidth = Math.max(0.6, 0.012 * ppm);
            ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.quadraticCurveTo(mx, my, collar.x, collar.y); ctx.stroke(); ctx.restore();
          } });
        }
      }
    }
    // sníh z odklízení (A11): val, vytlačený sníh, hromada, shluky ve vzduchu
    if (sim.state.clearing?.snow) items.push(...snowItems(ctx, project, sim.state.clearing.snow, opts.time, sprite('snow_pile'), sprite('snowball')));
    // sáňky s dítětem (B02) + provázek od ruky rodiče k úchytu
    const sl = sim.state.sled;
    if (sl?.phase === 'run' && sl.center && project.sled?.riderId && sl.S) {
      // vektorové saně / boby (3D model) + provaz s prověšením; jezdce kreslí běžná vrstva postav
      const par = sim.state.agents.find((x) => x.id === project.sled?.parentId), kind = project.sled.kind ?? 'sane';
      const S = sl.S, hd = sl.wang ?? 0, c = toScreen(cam, S), ppm = depthScaleAt(sc.depth, c.y) / Q;
      items.push({ key: c.y, tie: 12500, draw: () => drawVectorSled(ctx, cam, S, hd, kind, sl.dist ?? 0, ppm, kind === 'boby' ? '#c8302c' : undefined) });
      if (par && !par.hidden) {
        const oc = sim.characterOf(par.id), om = oc ? sim.manifests[oc.assetId] : undefined;
        if (oc && om) {
          const cv = characterVisual(par, om, oc, sc), hand = localToScene(cv, cv.grip), ring = sledRingScreen(cam, S, hd, kind);
          items.push({ key: Math.max(par.pos.y, c.y) + 0.1, tie: 12501, draw: () => drawRope(ctx, hand, ring, sl.ropeK ?? 1, ppm) });
        }
      }
    } else if (sl?.phase === 'run' && sl.center) {
      const par = sim.state.agents.find((x) => x.id === project.sled?.parentId);
      const c = sl.center, ppm = depthScaleAt(sc.depth, c.y) / Q;
      const cosA = Math.cos(sl.angle ?? 0), dir = cosA < 0 ? -1 : 1, sx = dir * Math.max(0.4, Math.abs(cosA));
      const k = (SLED.length * ppm) / SLED_SPRITE.frameW;
      const ringS = { x: c.x + (SLED_SPRITE.ring.x - SLED_SPRITE.cx) * k * sx, y: c.y + (SLED_SPRITE.ring.y - SLED_SPRITE.ground) * k };
      items.push({ key: c.y, tie: 12500, draw: () => {
        // pohledy z 8 směrů (sprite_sled_view_<úhel>_body/_head), mezi sousedními plynulé prolnutí;
        // bez nich boční pohled: zkrácení podle směru a v obratu prolnutí zrcadlených verzí (žádný přeskok)
        const deg = ((-(sl.wang ?? 0) * 180) / Math.PI + 720) % 360;
        const lo = Math.floor(deg / 45) * 45, hi = (lo + 45) % 360, f = (deg - lo) / 45;
        const vb = (d: number) => sprite(`sled_view_${d}_body`), vh = (d: number) => sprite(`sled_view_${d}_head`);
        if (vb(lo) && vb(hi)) {
          for (const [d, a] of [[lo, 1 - f], [hi, f]] as const) if (a > 0.01) { ctx.save(); ctx.globalAlpha = a; drawSledView(ctx, c, ppm, vb(d)!, vh(d), opts.time, sl.speed ?? 0); ctx.restore(); }
          return;
        }
        const ac = Math.abs(cosA);
        if (ac > 0.35) { drawSled(ctx, c, k, sx, opts.time, sl.speed ?? 0); return; }
        const fr = 0.5 + 0.5 * (cosA / 0.35); // −0,35 → 0 (vlevo), +0,35 → 1 (vpravo)
        for (const [s2, a] of [[1, fr], [-1, 1 - fr]] as const) if (a > 0.01) { ctx.save(); ctx.globalAlpha = a; drawSled(ctx, c, k, s2 * 0.4, opts.time, sl.speed ?? 0); ctx.restore(); }
      } });
      if (par && !par.hidden) {
        const oc = sim.characterOf(par.id), om = oc ? sim.manifests[oc.assetId] : undefined;
        if (oc && om) {
          const cv = characterVisual(par, om, oc, sc), hand = localToScene(cv, cv.grip);
          items.push({ key: Math.max(par.pos.y, c.y) + 0.1, tie: 12501, draw: () => {
            // napnutý provázek s mírným prověšením (víc, když rodič zpomalí)
            const sag = Math.max(2, Math.hypot(hand.x - ringS.x, hand.y - ringS.y) * 0.06);
            ctx.save(); ctx.strokeStyle = 'rgba(205,185,150,0.95)'; ctx.lineWidth = Math.max(1, 0.014 * ppm);
            ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.quadraticCurveTo((hand.x + ringS.x) / 2, Math.max(hand.y, ringS.y) + sag, ringS.x, ringS.y); ctx.stroke(); ctx.restore();
          } });
        }
      }
    }
    for (const p of sim.state.props) if (p.place.kind === 'flying') {
      const q = ballAt(p.place, opts.time); if (!q) continue;
      const g = toScreen(cam, { X: q.X, Z: q.Z });
      items.push({ key: g.y, tie: 15200, draw: () => drawSnowBall(ctx, cam, q.X, q.Z, Math.max(0.03, q.H), p.radius ?? 0.045, opts.time * 9, 3, false) });
    }
    if (project.rink && project.rink.boards !== false) rinkBoardItems(ctx, project).forEach((it) => items.push(it));
    coopBalls(sim.state).forEach((b, i) => { const g = toScreen(cam, { X: b.X, Z: b.Z }); items.push({ key: g.y, tie: 15050 + i, draw: () => drawSnowBall(ctx, cam, b.X, b.Z, b.H, b.r, b.rot, 11 + i, b.H < b.r * 1.5) }); });
    // košík s ozdobami (stavba rodič + dítě) a ozdoba nesená v ruce
    for (const ss of sim.state.sessions ?? []) {
      const d = ss.data as unknown as CoopData; if (!d?.coop) continue;
      const g = toScreen(cam, { X: d.basket.X, Z: d.basket.Z });
      items.push({ key: g.y, tie: 15000, draw: () => drawBasket(ctx, cam, d) });
      for (const it of d.basket.items) if (it.state === 'carried' && it.owner) {
        const a = sim.state.agents.find((x) => x.id === it.owner); if (!a || a.hidden) continue;
        const P = toWorld(cam, a.pos), hd = a.groundHeading ?? 0, Q = { X: P.X + Math.cos(hd) * 0.3, Z: P.Z + Math.sin(hd) * 0.3 };
        const q = toScreen(cam, Q, sim.isChild(a) ? 0.6 : 0.85);
        items.push({ key: toScreen(cam, Q).y + 0.5, tie: 15400, draw: () => drawOrnament(ctx, cam, it.kind, q.x, q.y, P.Z) });
      }
    }
    sessionBalls(sim.state).forEach((b, i) => { const g = toScreen(cam, { X: b.X, Z: b.Z }); items.push({ key: g.y, tie: 15100 + i, draw: () => drawSnowBall(ctx, cam, b.X, b.Z, b.H, b.r, b.rot, 7 + i, true) }); });
  }
  items.sort((a, b) => a.key - b.key || a.tie - b.tie);
  for (const it of items) it.draw();
  if (sim && sc.environment && sim.state.particles?.length) drawParticles(ctx, project, sim.state.particles, opts.time);

  for (const { o } of fixed('foreground')) drawObject(ctx, o, assets.get(o.assetId), images.get(o.assetId));
  if (sc.snowfall.enabled) drawSnowfall(ctx, project, opts.time, opts.reducedMotion ? 0.4 : 1);
}

/**
 * Koule sněhu (malovaná): mírně nepravidelný obrys, chladný stín vpravo dole, světlejší horní
 * plocha, pár stop válení (otáčí se podle dráhy), úzký kontaktní stín na zemi.
 */
/** Malované sprity z projektu (assety s id `sprite_*`, např. ze sady „Živá pozadí“); chybí = kresba kódem. */
let spriteSrc: AssetImages | null = null;
const sprite = (name: string) => (spriteSrc?.get(`sprite_${name}`) ?? null) as (CanvasImageSource & { width: number; height: number }) | null;
/** Sprite vycentrovaný na bod, s průměrem `d` px (podle šířky), volitelně otočený. */
function drawSpriteAt(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, d: number, rot = 0, flip = false) {
  const w = d, h = (d * img.height) / img.width;
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
}

function drawSnowBall(ctx: Ctx, cam: ReturnType<typeof cameraFor>, X: number, Z: number, H: number, r: number, rot: number, seed: number, shadow: boolean, spriteName = 'snowball') {
  const c = toScreen(cam, { X, Z }, H), R = (r * cam.f) / Math.max(1e-3, Z);
  if (R < 0.4) return;
  if (shadow) {
    const g0 = toScreen(cam, { X, Z });
    ctx.save(); ctx.fillStyle = 'rgba(98,113,150,0.22)';
    ctx.beginPath(); ctx.ellipse(g0.x + R * 0.1, g0.y, R * 1.05, Math.max(0.8, R * 0.18), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const img = sprite(spriteName) ?? sprite('snowball');
  if (img) { drawSpriteAt(ctx, img, c.x, c.y, 2.06 * R, rot); return; } // malovaná koule (okraj sprite je měkký)
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const k = 1 + 0.035 * Math.sin(a * 3 + seed) + 0.025 * Math.sin(a * 7 + seed * 1.7);
    const x = c.x + Math.cos(a) * R * k, y = c.y + Math.sin(a) * R * k;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(c.x - R * 0.35, c.y - R * 0.4, R * 0.1, c.x, c.y, R * 1.05);
  g.addColorStop(0, '#fbfcff'); g.addColorStop(0.55, '#e9edf7'); g.addColorStop(1, '#b9c3dc');
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  // stopy válení – krátké oblouky, které se otáčejí s koulí
  ctx.strokeStyle = 'rgba(150,163,196,0.35)'; ctx.lineWidth = Math.max(0.4, R * 0.06);
  for (let k = 0; k < 3; k++) {
    const a = rot + k * 2.1 + seed;
    ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * R * 0.45, c.y + Math.sin(a) * R * 0.3, R * 0.35, a, a + 1.2); ctx.stroke();
  }
  ctx.restore();
}

/** Sněhulák ze tří koulí (runtime objekt) s ozdobami podle postupu stavby. */
function drawSnowman(ctx: Ctx, cam: ReturnType<typeof cameraFor>, o: NonNullable<SimState['runtimeObjects']>[number], t = 0) {
  const P = toWorld(cam, { x: o.x, y: o.y });
  if (o.collapseAt !== undefined && t >= o.collapseAt) { drawFallenSnowman(ctx, cam, o, P, t - o.collapseAt); return; }
  const [r0, r1, r2] = o.radii;
  const h0 = r0, h1 = 2 * r0 * 0.92 + r1 * 0.92, h2 = 2 * r0 * 0.92 + 2 * r1 * 0.92 + r2 * 0.9;
  drawSnowBall(ctx, cam, P.X, P.Z, h0, r0, 0, o.seed % 97, true, 'snowman_base');
  if (r1) drawSnowBall(ctx, cam, P.X, P.Z - 0.01, h1, r1, 0, (o.seed % 97) + 3, false, 'snowman_middle');
  const px = (m: number) => (m * cam.f) / P.Z;
  const at = (H: number, dx = 0) => { const q = toScreen(cam, { X: P.X, Z: P.Z }, H); return { x: q.x + px(dx), y: q.y }; };
  const coal = (k: number) => sprite(`coal_${k % 5}`);
  if (coal(0) && sprite('snowman_head')) { drawSnowmanSprites(ctx, o, at, px, coal, h1, h2, r1, r2); return; }
  if (o.decorations.includes('buttons') && r1) {
    ctx.fillStyle = '#2b2b33';
    for (const k of [-0.35, 0.1]) { const q = at(h1 + r1 * k, 0.02); ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, px(0.018)), 0, Math.PI * 2); ctx.fill(); }
  }
  if (r2) {
    drawSnowBall(ctx, cam, P.X, P.Z - 0.02, h2, r2, 2.1, (o.seed % 97) + 5, false);
    if (o.decorations.includes('scarf')) {
      const q = at(h2 - r2 * 0.85), w = px(r2 * 1.15), hh = Math.max(1, px(0.045));
      ctx.fillStyle = '#a3322f'; ctx.beginPath(); ctx.ellipse(q.x, q.y, w, hh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a2826'; ctx.fillRect(q.x + w * 0.3, q.y, Math.max(1, px(0.05)), px(0.16)); // volný konec
    }
    if (o.decorations.includes('eyes')) {
      ctx.fillStyle = '#26262e';
      for (const dx of [-0.045, 0.045]) { const q = at(h2 + r2 * 0.25, dx); ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, px(0.016)), 0, Math.PI * 2); ctx.fill(); }
    }
    if (o.decorations.includes('nose')) {
      const q = at(h2 + r2 * 0.02, 0.0);
      ctx.fillStyle = '#e0782f'; ctx.beginPath(); ctx.moveTo(q.x, q.y - px(0.014)); ctx.lineTo(q.x + px(0.09), q.y + px(0.006)); ctx.lineTo(q.x, q.y + px(0.014)); ctx.closePath(); ctx.fill();
    }
  }
}

/**
 * Shozený sněhulák: hlava a prostřední koule se skutálí na stranu a sesednou (0,9 s), pak zůstane
 * nízká hromádka sněhu (sprite hromady), která během 2 min zapadne (nemizí naráz).
 */
function drawFallenSnowman(ctx: Ctx, cam: ReturnType<typeof cameraFor>, o: NonNullable<SimState['runtimeObjects']>[number], P: World, age: number) {
  const [r0, r1, r2] = o.radii, u = Math.min(1, age / 0.9), e = u * u, dir = (o.seed % 2) ? 1 : -1;
  const fade = age < 60 ? 1 : Math.max(0, 1 - (age - 60) / 60);
  const pile = sprite('snow_pile'), px = (m: number) => (m * cam.f) / P.Z, g = toScreen(cam, { X: P.X, Z: P.Z });
  ctx.save(); ctx.globalAlpha = fade;
  if (pile) { ctx.globalAlpha = fade * Math.min(1, 0.25 + u); const W = px(r0 * 3.2 + 0.2), H = (W * pile.height) / pile.width * (0.6 + 0.6 * u); ctx.drawImage(pile, g.x - W / 2, g.y - H * 0.92, W, H); }
  if (u < 1) {
    // koule při pádu: spodní se rozplácne, prostřední a hlava odpadnou stranou a rozpadnou se
    // (plně viditelné, až na konci pádu splynou s hromádkou)
    ctx.globalAlpha = fade * Math.min(1, (1 - u) / 0.3);
    drawSnowBall(ctx, cam, P.X, P.Z, r0 * (1 - 0.5 * e), r0 * (1 - 0.25 * e), 0, o.seed % 97, false, 'snowman_base');
    if (r1) drawSnowBall(ctx, cam, P.X + dir * r0 * 1.2 * e, P.Z - 0.02, (2 * r0 + r1) * (1 - e) + r1 * 0.6 * e, r1 * (1 - 0.3 * e), e * 1.5 * dir, (o.seed % 97) + 3, false, 'snowman_middle');
    if (r2) drawSnowBall(ctx, cam, P.X + dir * (r0 + r1) * 1.6 * e, P.Z - 0.03, (2 * r0 + 2 * r1 + r2) * (1 - e) + r2 * 0.6 * e, r2 * (1 - 0.3 * e), e * 2.5 * dir, (o.seed % 97) + 5, false);
  }
  ctx.restore();
}

/** Sněhulák z malovaných spritů: hlava, uhlíky (oči, knoflíky), mrkev, pletená šála. */
function drawSnowmanSprites(ctx: Ctx, o: NonNullable<SimState['runtimeObjects']>[number], at: (H: number, dx?: number) => { x: number; y: number }, px: (m: number) => number,
  coal: (k: number) => (CanvasImageSource & { width: number; height: number }) | null, h1: number, h2: number, r1: number, r2: number) {
  const dot = (H: number, dx: number, k: number, size: number) => { const q = at(H, dx); drawSpriteAt(ctx, coal(k)!, q.x, q.y, Math.max(1.2, px(size)), (k * 1.3) % 6.28); };
  if (o.decorations.includes('buttons') && r1) for (const [i, kH] of [[0, 0.35], [1, -0.05], [2, -0.45]] as const) dot(h1 + r1 * kH, 0.015, i + o.seed, 0.04);
  if (!r2) return;
  const head = sprite('snowman_head')!, q0 = at(h2);
  drawSpriteAt(ctx, head, q0.x, q0.y, 2.06 * px(r2));
  if (o.decorations.includes('scarf') && sprite('scarf')) { const q = at(h2 - r2 * 0.95); drawSpriteAt(ctx, sprite('scarf')!, q.x + px(0.01), q.y + px(r2 * 0.22), px(r2 * 1.95)); }
  if (o.decorations.includes('eyes')) { dot(h2 + r2 * 0.28, -0.045, o.seed + 3, 0.032); dot(h2 + r2 * 0.28, 0.045, o.seed + 4, 0.032); }
  if (o.decorations.includes('nose') && sprite('carrot')) { const q = at(h2 + r2 * 0.02); const c = sprite('carrot')!; const w = px(0.12); ctx.drawImage(c, q.x - w * 0.12, q.y - (w * c.height) / c.width / 2, w, (w * c.height) / c.width); }
}

/** Pára a kouř: měkké průsvitné obláčky (malovaný dojem, bez ostrých okrajů). */
function drawParticles(ctx: Ctx, project: ProjectFile, ps: NonNullable<Simulation['state']['particles']>, t: number) {
  const env = project.scene.environment!;
  ctx.save();
  for (const p of ps) {
    const q = particleAt(p, t, project.scene.snowfall.wind, project.seed, env.gusts);
    if (!q || q.a < 0.004) continue;
    const st = p.kind !== 'snowPuff' && p.kind !== 'breath' ? sprite(`steam_${(p.seed % 6) + 1}`) : null;
    if (st) {
      // malovaný obláček páry: nízká celková průhlednost, pomalý růst (sprite nikdy nezesilovat)
      ctx.globalAlpha = Math.min(0.55, q.a * (p.kind === 'smoke' ? 1.4 : 1.8));
      drawSpriteAt(ctx, st, q.x, q.y - q.r * 0.6, q.r * 2.6, ((p.seed % 7) - 3) * 0.08);
      ctx.globalAlpha = 1;
      continue;
    }
    const col = p.kind === 'smoke' ? '214,216,228' : '248,248,252';
    const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
    g.addColorStop(0, `rgba(${col},${q.a.toFixed(3)})`); g.addColorStop(0.6, `rgba(${col},${(q.a * 0.45).toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(q.x - q.r, q.y - q.r, 2 * q.r, 2 * q.r);
  }
  ctx.restore();
}

function propY(p: PropState): number {
  switch (p.place.kind) { case 'counter': case 'ground': return p.place.y; case 'falling': return p.place.to.y; default: return 800; }
}

/** Deterministické sněžení: poloha vločky je čistá funkce (seed, index, čas). */
export function drawSnowfall(ctx: Ctx, project: ProjectFile, t: number, densityK = 1) {
  const { width: W, height: H } = project.scene;
  const env = project.scene.environment;
  const df = snowDensityFactor(project.seed, t, !!env?.variableSnow);
  // stabilní ID vloček: při změně hustoty se jednotlivé vločky jen plynule zjeví / zmizí
  const n = Math.round(project.scene.snowfall.density * 420 * (env?.variableSnow ? 1.15 : 1) * densityK);
  const wind = project.scene.snowfall.wind;
  const WI = windIntegral(project.seed, t, !!env?.gusts); // integrál – poryv nezpůsobí skok
  const seed = project.seed;
  for (let i = 0; i < n; i++) {
    const vis = env?.variableSnow ? Math.max(0, Math.min(1, ((df / 1.15) - hashNoise(seed, i, 9)) / 0.04 + 0.5)) : 1;
    if (vis <= 0) continue;
    const depth = hashNoise(seed, i, 1); // 0 = daleko, 1 = blízko
    const size = 1.2 + depth * 3.2;
    const speed = 22 + depth * 55;
    const y0 = hashNoise(seed, i, 2) * (H + 40);
    const x0 = hashNoise(seed, i, 3) * W;
    const sway = 6 + hashNoise(seed, i, 4) * 14, freq = 0.3 + hashNoise(seed, i, 5) * 0.6, ph = hashNoise(seed, i, 6) * 6.283;
    const y = ((y0 + t * speed) % (H + 40)) - 20;
    let x = x0 + Math.sin(t * freq + ph) * sway + wind * speed * WI;
    x = ((x % (W + 20)) + W + 20) % (W + 20) - 10;
    ctx.fillStyle = `rgba(255,255,255,${((0.45 + depth * 0.45) * vis).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
}

/** Vykreslí jeden výstupní snímek v daném rozlišení (export / náhled bez editorových značek). */
export function renderFrame(ctx: Ctx, outW: number, outH: number, project: ProjectFile, sim: Simulation | null, images: AssetImages, time: number) {
  ctx.setTransform(outW / project.scene.width, 0, 0, outH / project.scene.height, 0, 0);
  ctx.imageSmoothingEnabled = true;
  (ctx as Ctx & { imageSmoothingQuality?: string }).imageSmoothingQuality = 'high';
  drawScene(ctx, project, sim, images, { time });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
