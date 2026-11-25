/**
 * Vykreslení psa a kočky z malovaných dílů (balík „Živá pozadí“): trup, hlava, čtyři nohy po dvou
 * článcích (vzdálené ztmavené za trupem), ocas. Chůze řízená uraženou dráhou (pořadí nohou
 * LH–LF–RH–RF), v klidu nohy rovně, sed = samostatný malovaný díl. Díly jsou assety `animal_*`.
 */
import type { AnimalState } from '../sim/animals';
import { SPECIES } from '../sim/animals';
import { Q } from '../scene/camera';
import { getCanvasFactory } from './rigRenderer';
import { BREEDS } from './animalBreeds';

type Img = CanvasImageSource & { width: number; height: number };
type Ctx = CanvasRenderingContext2D;
export type AnimalImages = (name: string) => Img | null;

interface Rig {
  /** klouby na trupu (podíl obrázku): rameno, kyčel, krk, ocas */
  shoulder: [number, number]; hip: [number, number]; neck: [number, number]; tail: [number, number];
  /** úchyt hlavy (podíl obrázku hlavy – spodek krku) */ headAt: [number, number];
  /** délky článků nohou (m), šířka hlavy (m), délka ocasu (m) */
  upper: number; lower: number; head: number; tailLen: number;
  /** úhel nohou při chůzi (rad) */ swing: number;
}
const RIGS: Record<'dog' | 'cat', Rig> = {
  dog: { shoulder: [0.78, 0.66], hip: [0.25, 0.6], neck: [0.88, 0.2], tail: [0.09, 0.47], headAt: [0.32, 0.86], upper: 0.13, lower: 0.12, head: 0.24, tailLen: 0.24, swing: 0.42 },
  cat: { shoulder: [0.8, 0.66], hip: [0.22, 0.62], neck: [0.9, 0.24], tail: [0.07, 0.48], headAt: [0.36, 0.9], upper: 0.085, lower: 0.08, head: 0.15, tailLen: 0.3, swing: 0.38 },
};

/** Úchyty článků nohou (podíl obrázku): a = horní kloub (střed dutého konce), b = dolní kloub / bod
 *  dotyku tlapky se zemí. Změřeno z alfa kanálu dílů (dutý konec nahoře, tlapka dole). */
type Anchor = { a: [number, number]; b: [number, number] };
const LEG_ANCHORS: Record<'dog' | 'cat', Record<'fu' | 'fl' | 'hu' | 'hl', Anchor>> = {
  dog: { fu: { a: [0.56, 0.1], b: [0.27, 0.8] }, fl: { a: [0.5, 0.14], b: [0.5, 0.985] }, hu: { a: [0.56, 0.1], b: [0.36, 0.8] }, hl: { a: [0.53, 0.14], b: [0.58, 0.985] } },
  cat: { fu: { a: [0.55, 0.1], b: [0.36, 0.8] }, fl: { a: [0.51, 0.14], b: [0.49, 0.985] }, hu: { a: [0.59, 0.1], b: [0.43, 0.8] }, hl: { a: [0.62, 0.14], b: [0.52, 0.985] } },
};
/** Rasy: velikost vůči druhu, úchyty na trupu a hlavě, ocas (kořen v obrázku, zrcadlení, náklon). Bez záznamu = jako druh. */
const BREED_RIG: Record<string, { scale: number; rig?: Partial<Rig>; tail?: { root: [number, number]; mirror: boolean; rot: number }; legk?: number }> = {
  dog_bernese: { scale: 1.3, rig: { shoulder: [0.78, 0.7], hip: [0.2, 0.66], neck: [0.88, 0.22], tail: [0.06, 0.3], headAt: [0.36, 0.9], head: 0.26, tailLen: 0.32 }, tail: { root: [0.85, 0.08], mirror: false, rot: 0.3 }, legk: 0.62 },
  dog_dalmatian: { scale: 1.2, rig: { shoulder: [0.8, 0.62], hip: [0.2, 0.58], neck: [0.9, 0.2], tail: [0.05, 0.25], headAt: [0.3, 0.92], head: 0.26, tailLen: 0.3 }, tail: { root: [0.04, 0.92], mirror: true, rot: -0.75 }, legk: 0.72 },
  dog_frenchie: { scale: 0.72, rig: { shoulder: [0.82, 0.66], hip: [0.2, 0.62], neck: [0.9, 0.3], tail: [0.04, 0.3], headAt: [0.4, 0.88], head: 0.25, tailLen: 0.08 }, tail: { root: [0.2, 0.6], mirror: false, rot: 0 }, legk: 0.62 },
  dog_husky: { scale: 1.18, rig: { shoulder: [0.82, 0.66], hip: [0.2, 0.62], neck: [0.92, 0.2], tail: [0.05, 0.3], headAt: [0.34, 0.9], head: 0.26, tailLen: 0.28 }, tail: { root: [0.06, 0.9], mirror: false, rot: -0.2 }, legk: 0.66 },
  dog_dachshund: { scale: 0.95, rig: { shoulder: [0.84, 0.72], hip: [0.16, 0.66], neck: [0.92, 0.25], tail: [0.04, 0.2], headAt: [0.3, 0.92], head: 0.23, tailLen: 0.22 }, tail: { root: [0.02, 0.85], mirror: false, rot: -0.15 }, legk: 0.62 },
  dog_collie: { scale: 1.12, rig: { shoulder: [0.8, 0.66], hip: [0.22, 0.62], neck: [0.86, 0.22], tail: [0.07, 0.38], headAt: [0.4, 0.9], head: 0.26, tailLen: 0.3 }, tail: { root: [0.8, 0.06], mirror: false, rot: 0.25 }, legk: 0.66 },
  cat_british: { scale: 1.08, rig: { shoulder: [0.78, 0.68], hip: [0.22, 0.64], neck: [0.84, 0.2], tail: [0.06, 0.55], headAt: [0.42, 0.88], head: 0.17, tailLen: 0.27 }, legk: 0.62 },
  cat_mainecoon: { scale: 1.2, rig: { shoulder: [0.8, 0.62], hip: [0.2, 0.6], neck: [0.9, 0.22], tail: [0.05, 0.42], headAt: [0.42, 0.9], head: 0.16, tailLen: 0.34 }, legk: 0.85 },
};
/** měřítko zvířete (rasa) vůči druhu – pro vykreslení i stín */
export const breedScale = (a: AnimalState) => (a.breed ? BREED_RIG[a.breed]?.scale ?? 1 : 1);
/** podíl cyklu, kdy je tlapka na zemi (chůze ≈ 0,6), a natažení nohy v klidu */
const DUTY = 0.62, STAND = 0.96;
/** měřítko nohou vůči trupu (malované díly mají nohy delší, než odpovídá plemeni) */
const LEGK = { dog: 0.62, cat: 0.6 };

/**
 * Vzdálené nohy ztmavené na 86 % jasu – předem, jednou na obrázek. (Dřív `ctx.filter = 'brightness(0.86)'`
 * při každém kreslení: plátno pro filtr kreslí přes celou vrstvu, ~155 ms na snímek 1920×1080.)
 * Černá přes obrázek s krytím 0,14 jen v jeho neprůhledné části = násobení barev 0,86, průhlednost beze změny.
 */
const darkCache = new WeakMap<object, Img>();
function darkened(im: Img): Img {
  const hit = darkCache.get(im); if (hit) return hit;
  const f = getCanvasFactory(); if (!f) return im;
  const c = f(im.width, im.height) as unknown as Img & { getContext(k: '2d'): Ctx };
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(0,0,0,0.14)'; x.fillRect(0, 0, im.width, im.height);
  darkCache.set(im, c);
  return c;
}

/** Vykreslí zvíře s chodidly v (0,0) – volající nastaví posun a měřítko (px na metr). */
export function drawAnimal(ctx: Ctx, a: AnimalState, img0: AnimalImages, pxPerM0: number, t: number, debug = false): void {
  const dbg: { x: number; y: number; c: string }[] = [];
  const sp = a.species, BR = a.breed ? BREED_RIG[a.breed] : undefined, BI = a.breed ? BREEDS[a.breed] : undefined;
  const R: Rig = { ...RIGS[sp], ...(BR?.rig ?? {}) }, S = SPECIES[sp];
  const pre = `${a.breed && BI ? a.breed : sp}_`;
  // rasa bez některého dílu (sed, sklopená hlava): nikdy díl jiné rasy – jiná póza místo něj
  const img: AnimalImages = (n) => img0(n);
  const pxPerM = pxPerM0 * (BR?.scale ?? 1);
  const mirror = Math.cos(a.facing) < -0.05;
  const away = Math.sin(a.facing) < -0.45; // jde od kamery → zadní pohled trupu
  const walk = a.mode === 'jump' || a.mode === 'jumpDown' || a.mode === 'prep' ? 0 : Math.min(1, a.speed / 0.25);
  ctx.save();
  if (mirror) ctx.scale(-1, 1);
  // ---- sed (samostatná malovaná póza)
  if (a.sit > 0.5 && img(`${pre}sit`)) {
    const body = img(`${pre}sit`); const head = img(`${pre}head${away ? '_back' : ''}`);
    if (body) {
      const h = S.shoulder * 1.25 * pxPerM, w = (h * body.width) / body.height;
      ctx.drawImage(body, -w * 0.45, -h, w, h);
      if (head) {
        const hw = R.head * pxPerM, hh = (hw * head.height) / head.width;
        const look = Math.sin(t * 0.35 + a.dist) * 0.06; // klidné pozorování, občas pootočí hlavou
        // Z08 očista: hlava sklopená k hrudi/tlapce, drobné rychlé pohyby (olizování)
        const gr = a.mode === 'groom' ? Math.min(1, (t - (a.since ?? t)) / 0.5) : 0;
        const lick = gr * (0.95 + 0.12 * Math.sin(t * 9));
        ctx.save(); ctx.translate(w * (0.12 - 0.02 * gr), -h * (0.92 - 0.2 * gr)); ctx.rotate(look * (1 - gr) + lick);
        ctx.drawImage(head, -hw * R.headAt[0], -hh * R.headAt[1], hw, hh); ctx.restore();
      }
    }
    ctx.restore();
    return;
  }
  const torso = img(`${pre}torso${away ? '_back' : ''}`) ?? img(`${pre}torso`);
  if (!torso) { ctx.restore(); return; }
  const tw = S.length * pxPerM * (sp === 'dog' ? 0.9 : 1), th = (tw * torso.height) / torso.width;
  const k = (tw / torso.width) * (BR?.legk ?? LEGK[sp]);
  const bk = away && BI?.legs_back ? '_back' : ''; // zadní pohled: vlastní díly nohou (ne zrcadlení předních)
  const LA = (bk ? BI!.legs_back : BI?.legs) ?? LEG_ANCHORS[sp];
  const segLen = (kind: 'f' | 'h') => {
    const u = LA[`${kind}u`], l = LA[`${kind}l`];
    const up = img(`${pre}${kind}u_a${bk}`), lo = img(`${pre}${kind}l_a${bk}`);
    if (!up || !lo) return [0, 0];
    return [Math.hypot((u.b[0] - u.a[0]) * up.width, (u.b[1] - u.a[1]) * up.height) * k, Math.hypot((l.b[0] - l.a[0]) * lo.width, (l.b[1] - l.a[1]) * lo.height) * k];
  };
  const legLen = 0.5 * (segLen('f')[0] + segLen('f')[1] + segLen('h')[0] + segLen('h')[1]) * STAND;
  // trup tak, aby ramena a kyčle byly ve výšce nohou nad zemí (mírné pohupování v chůzi)
  const ph = (a.dist / S.stride) % 1;
  const bob = Math.sin(ph * Math.PI * 4) * 0.012 * pxPerM * walk;
  const tx = -tw / 2, ty = -legLen - th * R.shoulder[1] + bob;
  const J = (q: [number, number]) => ({ x: tx + q[0] * tw, y: ty + q[1] * th });
  // Z08 protažení: předek dolů, přední tlapky natažené vpřed (obálka 0,4 s náběh/doběh)
  const age = t - (a.since ?? t), dur = Math.max(0.5, a.until - (a.since ?? t));
  const envl = (x: number) => Math.max(0, Math.min(1, x));
  const st = a.mode === 'stretch' ? envl(age / 0.45) * envl((dur - age) / 0.45) : 0;
  // transformace trupu (protažení – předek dolů kolem kyčle, přikrčení) – nohy ji použijí pro klouby,
  // ale kreslí se v rámci země, aby tlapky zůstaly na zemi
  const hp0 = J(R.hip), sa = 0.24 * st;
  const BT = (q: { x: number; y: number }) => { const x0 = q.x - hp0.x, y0 = q.y - hp0.y; return { x: hp0.x + x0 * Math.cos(sa) - y0 * Math.sin(sa), y: hp0.y + x0 * Math.sin(sa) + y0 * Math.cos(sa) + prDy }; };
  const bodyTf = () => { ctx.translate(0, prDy); if (sa) { ctx.translate(hp0.x, hp0.y); ctx.rotate(sa); ctx.translate(-hp0.x, -hp0.y); } };
  // Z09: příprava ke skoku (přikrčení) a let (nohy natažené, trup se při odrazu zvedá, při dopadu sklání)
  const pr = a.mode === 'prep' ? envl(age / 0.25) : 0;
  const prDy = legLen * 0.22 * pr;
  const fl = a.mode === 'jump' || a.mode === 'jumpDown' ? Math.sin(Math.PI * envl(age / 0.5)) : 0;
  if (fl > 0) { const c0 = J([0.5, 0.5]); const pitch = (a.mode === 'jump' ? -0.35 : 0.3) * (1 - 2 * envl(age / 0.5)); ctx.translate(c0.x, c0.y); ctx.rotate(pitch * fl); ctx.translate(-c0.x, -c0.y); }
  // Z05 setřesení: rychlé kývání trupu (~7 Hz), hlava napřed, ocas se zpožděním
  const sh = a.mode === 'shake' ? Math.sin(Math.PI * envl(age / dur)) : 0;
  const shakeAt = (lag: number) => sh * 0.11 * Math.sin((t - lag) * 2 * Math.PI * 7);
  // ---- nohy: díly ve stejném měřítku jako trup (k = px obrazovky na px obrázku), dvoučlánková IK
  // s chodidly pevně na zemi ve fázi opory (stance) a obloukem ve švihu → tlapky neklouzají.
  const leg = (kind: 'f' | 'h', side: 'a' | 'b', off: number, far: boolean) => {
    const up0 = img(`${pre}${kind}u_${side}${bk}`) ?? img(`${pre}${kind}u_${side}`), lo0 = img(`${pre}${kind}l_${side}${bk}`) ?? img(`${pre}${kind}l_${side}`);
    if (!up0 || !lo0) return;
    const up = far ? darkened(up0) : up0, lo = far ? darkened(lo0) : lo0;
    const [L1, L2] = segLen(kind), u = LA[`${kind}u`], l = LA[`${kind}l`];
    const j0 = BT(J(kind === 'f' ? R.shoulder : R.hip));
    const j = { x: j0.x + (far ? 0.015 * pxPerM : 0), y: j0.y - (far ? 0.012 * pxPerM : 0) };
    // cíl tlapky (zem y = 0): opora 0..DUTY posouvá chodidlo dozadu rychlostí těla, švih vrací vpřed obloukem
    const p = (((ph + off) % 1) + 1) % 1, A = 0.5 * DUTY * S.stride * pxPerM * walk;
    let fx: number, fy: number;
    if (p < DUTY) { fx = A * (1 - 2 * p / DUTY); fy = 0; }
    else { const q = (p - DUTY) / (1 - DUTY); fx = -A + 2 * A * (0.5 - 0.5 * Math.cos(Math.PI * q)); fy = -Math.sin(Math.PI * q) * (kind === 'f' ? 0.32 : 0.26) * (L1 + L2) * walk; }
    fx += j.x + (kind === 'f' ? 0.02 : -0.03) * (L1 + L2);
    // protažení: přední tlapky vpřed; příprava ke skoku: tlapky zůstávají; skok: nohy natažené vpřed/vzad
    fx += (kind === 'f' ? 0.55 : 0) * (L1 + L2) * st;
    if (fl > 0) { const ang = (kind === 'f' ? 0.9 : -0.95) * fl, R2 = (L1 + L2) * 0.98; fx = j.x + Math.sin(ang) * R2; fy = j.y + Math.cos(ang) * R2; }
    // dvoučlánková IK: přední koleno (zápěstí) vystupuje vpřed, zadní hlezno vzad
    let dx = fx - j.x, dy = fy - j.y; let d = Math.hypot(dx, dy);
    const dMax = (L1 + L2) * 0.999; if (d > dMax) { dx *= dMax / d; dy *= dMax / d; d = dMax; }
    const ca = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const base = Math.atan2(dy, dx), bend = (kind === 'f' ? -1 : 1) * Math.acos(ca); // y dolů: −1 = koleno vpřed (+x)
    const kn = { x: j.x + Math.cos(base + bend) * L1, y: j.y + Math.sin(base + bend) * L1 };
    const ft = { x: j.x + dx, y: j.y + dy };
    const seg = (im: Img, an: { a: [number, number]; b: [number, number] }, P: { x: number; y: number }, Qp: { x: number; y: number }) => {
      const ax = an.a[0] * im.width, ay = an.a[1] * im.height, bx = an.b[0] * im.width, by = an.b[1] * im.height;
      const rot = Math.atan2(Qp.y - P.y, Qp.x - P.x) - Math.atan2(by - ay, bx - ax);
      ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(rot); ctx.scale(k, k); ctx.drawImage(im, -ax, -ay); ctx.restore();
    };
    seg(lo, l, kn, ft); // spodní článek pod horním (horní kryje kloub)
    seg(up, u, j, kn);
    if (debug) dbg.push({ ...j, c: '#ff00e6' }, { ...kn, c: '#ffd400' }, { ...ft, c: '#00e5ff' });
  };
  // pořadí kroku: LH 0, LF 0.25, RH 0.5, RF 0.75 (vzdálená strana = levá)
  leg('h', 'b', 0, true); leg('f', 'b', 0.25, true);
  const tc = J([0.5, 0.45]);
  const rotAbout = (r: number) => { if (!r) return; ctx.translate(tc.x, tc.y); ctx.rotate(r); ctx.translate(-tc.x, -tc.y); };
  // ocas za trupem
  ctx.save(); bodyTf(); rotAbout(shakeAt(0.09));
  const tail = (away ? img(`${pre}tail_back`) : null) ?? img(`${pre}tail`), TB = BR?.tail;
  if (!tail && img(`${pre}tail_1`)) {
    // kočičí ocas ze tří článků (jedno společné měřítko archu): kořen každého článku je vpravo
    // (u článků 1–2 dutý konec), koncový článek je malovaný špičkou doprava → zrcadlit.
    // Řetěz od kořene: oblouk nahoru, pomalé vlnění se zpožděním; kreslí se od špičky ke kořeni,
    // aby každý bližší článek zakryl dutý konec následujícího.
    const ims = [1, 2, 3].map((k) => (away ? img(`${pre}tail_${k}_back`) : null) ?? img(`${pre}tail_${k}`));
    if (ims.every(Boolean)) {
      const L = [ims[0]!.width * 0.86, ims[1]!.width * 0.86, ims[2]!.width * 0.8];
      const k = (R.tailLen * pxPerM) / (L[0] + L[1] + L[2]);
      const tj = J(R.tail);
      const mats: DOMMatrix[] = [];
      ctx.save(); ctx.translate(tj.x, tj.y);
      for (let i = 0; i < 3; i++) {
        const ang = [0.55, 0.3, 0.25][i] + 0.14 * Math.sin(t * 1.3 - i * 0.7) * ((i + 1) / 3) + (walk > 0.3 ? -0.15 : 0) * (i === 0 ? 1 : 0);
        ctx.rotate(ang);
        mats.push(ctx.getTransform());
        ctx.translate(-L[i] * k, 0);
      }
      ctx.restore();
      for (let i = 2; i >= 0; i--) {
        const im = ims[i]!, w = im.width * k, h = im.height * k;
        ctx.save(); ctx.setTransform(mats[i]);
        if (i < 2) ctx.drawImage(im, -w * 0.97, -h / 2, w, h); // kořen = pravý (dutý) konec
        else { ctx.scale(-1, 1); ctx.drawImage(im, -w * 0.05, -h * 0.73, w, h); } // zrcadlený konec: kořen vlevo dole
        ctx.restore();
      }
    }
  }
  if (tail) {
    // psí ocas: kořen je na obrázku vlevo dole, špička nahoře – zrcadlit, aby šel od zádě nahoru dozadu;
    // kořen leží uvnitř obrysu trupu (trup se kreslí přes něj)
    const tj = J(R.tail), tl = R.tailLen * pxPerM;
    const wag = 0.22 * Math.sin(t * (walk > 0.3 || sh > 0 ? 9 : 4)) * (1 + sh);
    ctx.save(); ctx.translate(tj.x, tj.y);
    const w = tl, h = (w * tail.height) / tail.width;
    if (TB) { ctx.rotate(wag * 0.5 + TB.rot); if (TB.mirror) ctx.scale(-1, 1); ctx.drawImage(tail, -w * TB.root[0], -h * TB.root[1], w, h); } // visící ocas (kolie)
    else { ctx.rotate(wag - 0.15); ctx.scale(-1, 1); ctx.drawImage(tail, -w * 0.14, -h * 0.82, w, h); }
    ctx.restore();
  }
  ctx.restore();
  leg('h', 'a', 0.5, false); leg('f', 'a', 0.75, false);
  ctx.save(); bodyTf(); rotAbout(shakeAt(0.04));
  ctx.drawImage(torso, tx, ty, tw, th);
  ctx.restore();
  ctx.save(); bodyTf(); rotAbout(shakeAt(0) * 1.6);
  // hlava (u psa sklopená při očichávání)
  const hdImg = img(`${pre}head_down`), down = a.headDown > 0.5 && !hdImg ? a.headDown : 0; // bez dílu: hlava se skloní natočením
  const head = a.headDown > 0.5 && hdImg ? hdImg : img(`${pre}head${away ? '_back' : ''}`);
  if (head) {
    const nj = J(R.neck), hw = R.head * pxPerM, hh = (hw * head.height) / head.width;
    ctx.save(); ctx.translate(nj.x, nj.y + a.headDown * 0.08 * pxPerM); ctx.rotate(0.03 * Math.sin(ph * Math.PI * 2) * walk + down * 0.55);
    // kočičí uši (samostatné díly): za hlavou, spodní střed ucha na místě z archu
    const ears = away ? BI?.ears_back : BI?.ears;
    if (ears) for (const e of ears) { const ei = img(`${pre}${e.part}`); if (!ei) continue; const ew = e.w * hw, eh = (ew * ei.height) / ei.width; ctx.drawImage(ei, -hw * R.headAt[0] + e.u * hw - ew / 2, -hh * R.headAt[1] + e.v * hh - eh, ew, eh); }
    ctx.drawImage(head, -hw * R.headAt[0], -hh * R.headAt[1], hw, hh); ctx.restore();
  }
  ctx.restore();
  if (debug) {
    // kostra: rameno–kyčel–krk–kořen ocasu (bílé), klouby nohou (rameno/kyčel růžová, koleno žlutá, dotyk tlapky tyrkys), bod umístění (zem)
    const P = [J(R.hip), J(R.shoulder), J(R.neck)], tl = J(R.tail);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tl.x, tl.y); for (const q of P) ctx.lineTo(q.x, q.y); ctx.stroke();
    for (const q of [...P.map((x) => ({ ...x, c: '#fff' })), { ...tl, c: '#fff' }, ...dbg, { x: 0, y: 0, c: '#ff3030' }]) { ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

/** Kontaktní stín zvířete (malá měkká elipsa). */
export function drawAnimalShadow(ctx: Ctx, a: AnimalState, pxPerM: number): void {
  const L = SPECIES[a.species].length * pxPerM * breedScale(a);
  ctx.fillStyle = 'rgba(60,70,100,0.16)';
  ctx.beginPath(); ctx.ellipse(0, 0, L * 0.55, Math.max(1, L * 0.09), 0, 0, Math.PI * 2); ctx.fill();
}
export const pxPerMeter = (depthScale: number) => depthScale / Q;
