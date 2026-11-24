/**
 * Vykreslení psa a kočky z malovaných dílů (balík „Živá pozadí“): trup, hlava, čtyři nohy po dvou
 * článcích (vzdálené ztmavené za trupem), ocas. Chůze řízená uraženou dráhou (pořadí nohou
 * LH–LF–RH–RF), v klidu nohy rovně, sed = samostatný malovaný díl. Díly jsou assety `animal_*`.
 */
import type { AnimalState } from '../sim/animals';
import { SPECIES } from '../sim/animals';
import { Q } from '../scene/camera';

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
  dog: { shoulder: [0.78, 0.66], hip: [0.25, 0.6], neck: [0.88, 0.2], tail: [0.07, 0.32], headAt: [0.32, 0.86], upper: 0.13, lower: 0.12, head: 0.24, tailLen: 0.24, swing: 0.42 },
  cat: { shoulder: [0.8, 0.66], hip: [0.22, 0.62], neck: [0.9, 0.24], tail: [0.05, 0.38], headAt: [0.36, 0.9], upper: 0.085, lower: 0.08, head: 0.15, tailLen: 0.3, swing: 0.38 },
};

/** Vykreslí zvíře s chodidly v (0,0) – volající nastaví posun a měřítko (px na metr). */
export function drawAnimal(ctx: Ctx, a: AnimalState, img: AnimalImages, pxPerM: number, t: number): void {
  const sp = a.species, R = RIGS[sp], S = SPECIES[sp];
  const pre = `${sp}_`;
  const mirror = Math.cos(a.facing) < -0.05;
  const away = Math.sin(a.facing) < -0.45; // jde od kamery → zadní pohled trupu
  const walk = Math.min(1, a.speed / 0.25);
  ctx.save();
  if (mirror) ctx.scale(-1, 1);
  // ---- sed (samostatná malovaná póza)
  if (a.sit > 0.5) {
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
  const tw = S.length * pxPerM, th = (tw * torso.height) / torso.width;
  const legLen = (R.upper + R.lower) * pxPerM;
  // trup tak, aby ramena a kyčle byly ve výšce nohou nad zemí (mírné pohupování v chůzi)
  const ph = (a.dist / S.stride) % 1;
  const bob = Math.sin(ph * Math.PI * 4) * 0.012 * pxPerM * walk;
  const tx = -tw / 2, ty = -legLen * 0.97 - th * R.shoulder[1] + bob;
  const J = (q: [number, number]) => ({ x: tx + q[0] * tw, y: ty + q[1] * th });
  // Z08 protažení: předek dolů, přední tlapky natažené vpřed (obálka 0,4 s náběh/doběh)
  const age = t - (a.since ?? t), dur = Math.max(0.5, a.until - (a.since ?? t));
  const envl = (x: number) => Math.max(0, Math.min(1, x));
  const st = a.mode === 'stretch' ? envl(age / 0.45) * envl((dur - age) / 0.45) : 0;
  if (st > 0) { const hp = J(R.hip); ctx.translate(hp.x, hp.y); ctx.rotate(0.24 * st); ctx.translate(-hp.x, -hp.y); }
  // Z05 setřesení: rychlé kývání trupu (~7 Hz), hlava napřed, ocas se zpožděním
  const sh = a.mode === 'shake' ? Math.sin(Math.PI * envl(age / dur)) : 0;
  const shakeAt = (lag: number) => sh * 0.11 * Math.sin((t - lag) * 2 * Math.PI * 7);
  // ---- nohy: vzdálené (ztmavené) za trupem, blízké také za trupem (horní otvor kryje trup)
  const leg = (kind: 'f' | 'h', side: 'a' | 'b', off: number, far: boolean) => {
    const up = img(`${pre}${kind}u_${side}`), lo = img(`${pre}${kind}l_${side}`);
    if (!up || !lo) return;
    const j = J(kind === 'f' ? R.shoulder : R.hip);
    const s = Math.sin(2 * Math.PI * (ph + off));
    const th1 = R.swing * s * walk + (kind === 'f' ? 0.95 : -0.12) * st; // + = dopředu
    // koleno/hlezno: ohnutí při švihu (noha jde dopředu nad zemí)
    const lift = Math.max(0, Math.cos(2 * Math.PI * (ph + off))) * walk;
    const th2 = (kind === 'f' ? -0.9 : 0.7) * lift * (1 - st);
    const uL = R.upper * pxPerM, lL = R.lower * pxPerM;
    ctx.save();
    if (far) ctx.globalAlpha = 1; // (ztmavení řeší filtr níže)
    ctx.translate(j.x + (far ? 0.02 * pxPerM : 0), j.y - (far ? 0.015 * pxPerM : 0));
    ctx.rotate(-th1);
    const uw = (uL * up.width) / up.height / 0.82;
    ctx.drawImage(up, -uw / 2, -uL * 0.1, uw, uL / 0.82);
    ctx.translate(0, uL * 0.86);
    ctx.rotate(-th2);
    const lw = (lL * lo.width) / lo.height / 0.9;
    ctx.drawImage(lo, -lw / 2, -lL * 0.06, lw, lL / 0.9);
    if (far) { ctx.globalCompositeOperation = 'source-atop'; }
    ctx.restore();
  };
  // pořadí kroku: LH 0, LF 0.25, RH 0.5, RF 0.75 (vzdálená strana = levá)
  ctx.save(); ctx.filter = 'brightness(0.78)';
  leg('h', 'b', 0, true); leg('f', 'b', 0.25, true);
  ctx.restore();
  const tc = J([0.5, 0.45]);
  const rotAbout = (r: number) => { if (!r) return; ctx.translate(tc.x, tc.y); ctx.rotate(r); ctx.translate(-tc.x, -tc.y); };
  // ocas za trupem
  ctx.save(); rotAbout(shakeAt(0.09));
  const tail = img(`${pre}tail`);
  if (!tail && img(`${pre}tail_1`)) {
    // kočičí ocas ze tří článků: oblouk nahoru, pomalé vlnění špičky se zpožděním za trupem
    const tj = J(R.tail), seg = (R.tailLen * pxPerM) / 3;
    ctx.save(); ctx.translate(tj.x, tj.y);
    [1, 2, 3].forEach((k) => {
      const im = img(`${pre}tail_${k}`); if (!im) return;
      const ang = (k === 1 ? 0.4 : 0.22) + 0.15 * Math.sin(t * 1.3 - k * 0.7) * (k / 3);
      ctx.rotate(ang);
      const h = (seg * im.height) / im.width * 1.15;
      ctx.drawImage(im, -seg * 1.1, -h / 2, seg * 1.15, h); // článek od kořene (vpravo) dozadu
      ctx.translate(-seg, 0);
    });
    ctx.restore();
  }
  if (tail) {
    const tj = J(R.tail), tl = R.tailLen * pxPerM;
    const wag = (sp === 'dog' ? 0.22 * Math.sin(t * (walk > 0.3 || sh > 0 ? 9 : 4)) * (1 + sh) : 0.12 * Math.sin(t * 1.6)) ;
    ctx.save(); ctx.translate(tj.x, tj.y); ctx.rotate(wag);
    const w = tl, h = (w * tail.height) / tail.width;
    // malovaný ocas psa jde zdola zleva nahoru doprava – zrcadlit, aby mířil od těla
    ctx.scale(-1, 1); ctx.drawImage(tail, -w * 0.08, -h * 0.85, w, h);
    ctx.restore();
  }
  ctx.restore();
  leg('h', 'a', 0.5, false); leg('f', 'a', 0.75, false);
  ctx.save(); rotAbout(shakeAt(0.04));
  ctx.drawImage(torso, tx, ty, tw, th);
  ctx.restore();
  ctx.save(); rotAbout(shakeAt(0) * 1.6);
  // hlava (u psa sklopená při očichávání)
  const head = a.headDown > 0.5 && img(`${pre}head_down`) ? img(`${pre}head_down`)! : img(`${pre}head${away ? '_back' : ''}`);
  if (head) {
    const nj = J(R.neck), hw = R.head * pxPerM, hh = (hw * head.height) / head.width;
    ctx.save(); ctx.translate(nj.x, nj.y + a.headDown * 0.08 * pxPerM); ctx.rotate(0.03 * Math.sin(ph * Math.PI * 2) * walk);
    ctx.drawImage(head, -hw * R.headAt[0], -hh * R.headAt[1], hw, hh); ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

/** Kontaktní stín zvířete (malá měkká elipsa). */
export function drawAnimalShadow(ctx: Ctx, a: AnimalState, pxPerM: number): void {
  const L = SPECIES[a.species].length * pxPerM;
  ctx.fillStyle = 'rgba(60,70,100,0.16)';
  ctx.beginPath(); ctx.ellipse(0, 0, L * 0.55, Math.max(1, L * 0.09), 0, 0, Math.PI * 2); ctx.fill();
}
export const pxPerMeter = (depthScale: number) => depthScale / Q;
