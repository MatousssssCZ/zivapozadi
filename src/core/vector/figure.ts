/**
 * Vektorová lidská postava: souvislé obrysy těla a oděvů vykreslené z pózy kostry (SkeletonPose).
 * Kostra, aktivity i kontakty se zemí zůstávají společné – mění se jen viditelný povrch.
 *
 * Konstrukce:
 *  - rámec trupu (pánev → krk, osa u, normála n) – silueta trupu z kloubů (ramena, kyčle) + profil těla,
 *  - končetiny jako souvislé trubice (kořen → kloub → konec) s asymetrickým stlačením vnitřní strany ohybu,
 *  - oděv = střih nad tělem: přídavek objemu (materiál), lem (jeden pro celý kabát, ne po stehnech),
 *    zakončení (manžeta, nohavice nad botou), límec, zapínání, kapsy, prošívání – vše kotvené v rámci
 *    trupu/končetiny (deformuje se s oděvem, neklouže),
 *  - záhyby jen v ohybech, síla podle úhlu ohybu (narovnáním mizí), pevné pozice (nepřeskakují),
 *  - hlava: lebka, čelist, ucho, vlasy podle účesu, jednoduchá tvář (čitelná v malé velikosti).
 * Pořadí vrstev podle pohledu (vzdálené končetiny → zadní díl kabátu → nohy → trup → hlava → blízká paže).
 */
import type { SkeletonPose, Limb } from '../anim/skeleton';
import type { FootGeom } from '../anim/gaitKinematics';
import type { BodyProfile } from './body';
import { MATERIALS, type Outfit } from './outfit';
import { add, bendAt, clamp, hn, len, lerp, lightOf, mixc, mul, norm, perp, shadeEdges, shadeOf, smoothClosed, smoothThrough, sub, tubePath, tubeSides, type Ctx, type P, type TubeNode } from './geom';

export interface FigureGeo {
  headC: P; headUp: P; headR: number; neck: P; torsoUp: P; neckW: number;
  hands: ({ E: P; d: P; L: number; W: number } | null)[]; back: boolean; skin: string;
}
export interface FigureOpts { view: string; foot: FootGeom; detail: number; seed: number; t: number }

/** Geometrie pro doplňky (čepice, šála) – stejná jako při kreslení, počítá se předem. */
export function figureGeo(pose: SkeletonPose, body: BodyProfile, view: string): FigureGeo {
  const back = /back/.test(view), u = norm(sub(pose.neck, pose.hip)), headUp = norm(sub(pose.head, pose.neck)), R = body.headR;
  const hands = pose.arms.map((a) => { const d = norm(sub(a.end, a.joint)); return { E: a.end, d, L: body.hand, W: body.wristW * 1.2 }; });
  return { headC: add(pose.head, mul(headUp, -R * 0.05)), headUp, headR: R, neck: add(pose.neck, mul(u, 1.2)), torsoUp: u, neckW: (body.neckR + 2.2) * 2 * 1.35, hands, back, skin: body.skin };
}

const FAR = (c: string) => mixc(c, '#2a2d44', 0.16);

/** Bod limbu ve výšce y (lineární po článcích) – pro šířku lemu kabátu nad nohama. */
function limbXAtY(l: Limb, y: number): number | null {
  const pts = [l.root, l.joint, l.end];
  for (let i = 0; i < 2; i++) { const a = pts[i], b = pts[i + 1]; if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x); }
  return null;
}

export function drawVectorFigure(ctx: Ctx, pose: SkeletonPose, body: BodyProfile, of: Outfit, o: FigureOpts, accDraw?: (part: 'hat' | 'scarf') => void): FigureGeo {
  const back = /back/.test(o.view);
  const M = MATERIALS[of.top.material], C = of.colors, det = o.detail;
  const H = pose.hip, Nk = pose.neck;
  const u = norm(sub(Nk, H)), n = perp(u); // u nahoru podél trupu, n vpravo (k přední straně v ¾ pohledu)
  const nn = { x: -n.x, y: -n.y };
  const TL = len(sub(Nk, H));
  const F = (lv: number, off: number): P => ({ x: H.x + u.x * lv * TL + n.x * off, y: H.y + u.y * lv * TL + n.y * off });
  const offN = (p: P) => (p.x - H.x) * n.x + (p.y - H.y) * n.y;
  const lvl = (p: P) => ((p.x - H.x) * u.x + (p.y - H.y) * u.y) / TL;
  const legL = len(sub(pose.legs[0].joint, pose.legs[0].root)) + len(sub(pose.legs[0].end, pose.legs[0].joint));
  const ease = M.ease;
  const isSuit = of.top.kind === 'snowsuit';
  const trouserCol = isSuit ? C.main : of.bottom.kind === 'skirt' ? (of.bottom.tights ?? '#2e2a2c') : C.bottom;
  const skinC = body.skin;

  // -------------------------------------------------- končetiny
  const legW = (of.bottom.kind === 'skirt' ? 0 : of.bottom.width === 'slim' ? 0.4 : of.bottom.width === 'straight' ? 1.2 : of.bottom.width === 'loose' ? 2.4 : 3.0) + (isSuit ? 1.2 : 0);
  const drawLeg = (i: number) => {
    const l = pose.legs[i], far = i === 0;
    const bend = bendAt(l.root, l.joint, l.end), bf = clamp(bend / 1.6, 0, 1);
    const t1 = norm(sub(l.joint, l.root)), t2 = norm(sub(l.end, l.joint)), z = t1.x * t2.y - t1.y * t2.x, inner = z > 0 ? 1 : -1;
    const ins = of.bottom.width === 'insulated' || isSuit;
    const comp = (ins ? 0.12 : 0.18) * bf;
    const nodes: TubeNode[] = [
      { p: add(l.root, mul(t1, -3)), w: body.thighW + legW + 1 },
      { p: l.root, w: body.thighW + legW },
      { p: add(l.root, mul(sub(l.joint, l.root), 0.5)), w: (body.thighW + body.kneeW) / 2 + legW * 0.9 },
      { p: l.joint, w: body.kneeW + legW * 0.85 + (ins ? 0.8 : 0), a: -inner * (body.kneeW * comp) },
      { p: add(l.joint, mul(sub(l.end, l.joint), 0.35)), w: body.calfW + legW * 0.8 },
      { p: add(l.end, mul(t2, -3)), w: body.ankleW + legW * (of.bottom.width === 'slim' ? 0.5 : 1.15) + (ins ? 1.2 : 0) },
      { p: add(l.end, mul(t2, 0.6)), w: body.ankleW + legW * (of.bottom.width === 'slim' ? 0.5 : 1.25) + (ins ? 1.4 : 0) },
    ];
    const col = far ? FAR(trouserCol) : trouserCol;
    let sides: [P[], P[]] = [[], []];
    const path = () => { sides = tubePath(ctx, nodes, false); };
    ctx.fillStyle = col; path(); ctx.fill();
    shadeEdges(ctx, path, sides[1], det > 0.4 ? sides[0] : null, body.kneeW * 0.7, col, far ? 1.2 : 1);
    if (det > 0.35) {
      // záhyby pod kolenem (jen v ohybu, pevná místa), zesílené koleno u dětí
      ctx.save(); path(); ctx.clip();
      const k = l.joint, tn = perp(norm(sub(l.end, l.root)));
      if (bf > 0.12) { ctx.strokeStyle = shadeOf(col, 0.45); ctx.lineWidth = 0.55; ctx.globalAlpha = Math.min(1, bf * 1.6); ctx.lineCap = 'round';
        for (let f = 0; f < 3; f++) { const s = (f - 1) * 1.6, c0 = add(add(k, mul(tn, inner * body.kneeW * 0.45)), mul(t2, s)); ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.quadraticCurveTo(c0.x - tn.x * inner * 2.2 + t2.x, c0.y - tn.y * inner * 2.2 + t2.y, c0.x - tn.x * inner * 3.4 + t2.x * 0.4, c0.y - tn.y * inner * 3.4 + t2.y * 0.4); ctx.stroke(); } }
      ctx.globalAlpha = 1;
      if (of.bottom.kneePads || isSuit) { ctx.fillStyle = shadeOf(col, 0.18); ctx.beginPath(); const kp = add(k, mul(tn, -inner * body.kneeW * 0.15)); ctx.ellipse(kp.x, kp.y, body.kneeW * 0.55, body.kneeW * 0.7, Math.atan2(t2.y, t2.x), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  };
  const drawBoot = (i: number) => {
    const l = pose.legs[i], far = i === 0, g = o.foot, A = l.end, r = pose.feet[i], fk = pose.feetK?.[i] ?? 1;
    const cs = Math.cos(r), sn = Math.sin(r), B = (x: number, y: number): P => ({ x: A.x + x * cs - y * sn, y: A.y + x * sn + y * cs });
    const heel = g.heel * 1.12 * fk, toe = g.toe * 1.12 * fk, sole = g.AH; // podrážka ve výšce kotníku (y dolů)
    const shaft = of.boots.kind === 'tall' ? legL * 0.42 : of.boots.kind === 'snow' ? 9 : 5.2;
    const bw = body.ankleW + (of.boots.kind === 'snow' ? 2.4 : 1.2);
    const up = norm(sub(l.joint, l.end)), sh = add(A, mul(up, shaft)), sn2 = perp(up);
    const col = far ? FAR(of.boots.color) : of.boots.color;
    const path = () => {
      ctx.beginPath();
      // kolem: horní lem holenky → zadní strana → pata → podrážka → špička → nárt → přední strana holenky
      const t0 = add(sh, mul(sn2, -bw * 0.5)), t1 = add(sh, mul(sn2, bw * 0.5));
      const hb = B(-heel, sole * 0.15), hs = B(-heel * 0.92, sole), ts = B(toe, sole), tt = B(toe * 1.05, sole * 0.25), inst = B(toe * 0.35, -sole * 0.9);
      ctx.moveTo(t0.x, t0.y);
      ctx.quadraticCurveTo(hb.x - (hb.x - t0.x) * 0.1, hb.y - (hb.y - t0.y) * 0.45, hb.x, hb.y);
      ctx.quadraticCurveTo(hs.x - 0.4, hs.y, hs.x + 0.6, hs.y);
      ctx.lineTo(ts.x, ts.y);
      ctx.quadraticCurveTo(tt.x + 1.2, tt.y + 0.2, tt.x, tt.y - 0.6);
      ctx.quadraticCurveTo(inst.x + 1.5, inst.y + 0.2, inst.x, inst.y);
      ctx.quadraticCurveTo(t1.x + (inst.x - t1.x) * 0.2, t1.y + (inst.y - t1.y) * 0.6, t1.x, t1.y);
      ctx.closePath();
    };
    ctx.fillStyle = col; path(); ctx.fill();
    shadeEdges(ctx, path, [B(-heel, sole * 0.2), B(toe * 0.3, sole * 0.9), B(toe, sole * 0.9)], null, 2, col);
    // podrážka (pata + špička rozlišené)
    ctx.fillStyle = far ? FAR(of.boots.sole) : of.boots.sole; ctx.beginPath();
    const s0 = B(-heel * 0.95, sole - 1.1), s1 = B(toe * 1.02, sole - 1.0), s2 = B(toe * 1.04, sole + 0.2), s3 = B(-heel * 0.95, sole + 0.25);
    ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.quadraticCurveTo(s2.x + 0.6, s2.y - 0.5, s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath(); ctx.fill();
    if (of.boots.kind === 'snow' && det > 0.3) { // lem sněhule (kožíšek / pruh)
      ctx.fillStyle = of.boots.trim ?? mixc(of.boots.color, '#efe6d6', 0.75); const t0 = add(sh, mul(sn2, -bw * 0.58)), t1 = add(sh, mul(sn2, bw * 0.58));
      ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t1.x - up.x * 2.2, t1.y - up.y * 2.2); ctx.lineTo(t0.x - up.x * 2.2, t0.y - up.y * 2.2); ctx.closePath(); ctx.fill();
    }
  };
  const tucked = of.boots.kind === 'tall' || (of.boots.kind === 'snow' && of.bottom.width === 'slim') || of.bottom.kind === 'skirt';
  const legWithBoot = (i: number) => { if (tucked) { drawLeg(i); drawBoot(i); } else { drawBoot(i); drawLeg(i); } };

  // paže + rukáv + manžeta + rukavice
  const sleeveCol = (i: number) => (of.top.panels ? C.support : C.main);
  const drawArm = (i: number) => {
    const a = pose.arms[i], far = i === 0;
    const bend = bendAt(a.root, a.joint, a.end), bf = clamp(bend / 1.8, 0, 1);
    const t1 = norm(sub(a.joint, a.root)), t2 = norm(sub(a.end, a.joint)), z = t1.x * t2.y - t1.y * t2.x, inner = z > 0 ? 1 : -1;
    const vol = of.top.sleeveVol, e = ease * 0.8 * vol;
    const comp = M.compress * bf;
    const wr = add(a.end, mul(t2, -2.2));
    const nodes: TubeNode[] = [
      { p: add(a.root, mul(t1, -2.5)), w: body.armW + e + 1.6 },
      { p: a.root, w: body.armW + e + 1.2 },
      { p: add(a.root, mul(sub(a.joint, a.root), 0.55)), w: body.armW + e * 1.05 },
      { p: a.joint, w: body.elbowW + e, a: -inner * body.elbowW * comp },
      { p: add(a.joint, mul(sub(wr, a.joint), 0.5)), w: (body.elbowW + body.wristW) / 2 + e * 0.95 },
      { p: wr, w: body.wristW + e * 0.85 },
    ];
    const base = sleeveCol(i), col = far ? FAR(base) : base;
    let sides: [P[], P[]] = [[], []];
    const path = () => { sides = tubePath(ctx, nodes, false); };
    ctx.fillStyle = col; path(); ctx.fill();
    shadeEdges(ctx, path, sides[1], det > 0.4 ? sides[0] : null, body.armW * 0.55, col, far ? 1.2 : 1);
    if (det > 0.35) {
      ctx.save(); path(); ctx.clip(); ctx.lineCap = 'round';
      // prošívání rukávu (péřová): komory kolmo na osu, pevně na délce článku
      if (M.quilt) { ctx.strokeStyle = shadeOf(col, 0.4); ctx.lineWidth = 0.5; for (const s of [0.35, 0.7]) for (const [p0, p1, w] of [[a.root, a.joint, body.armW + e], [a.joint, wr, body.elbowW + e]] as [P, P, number][]) { const c0 = add(p0, mul(sub(p1, p0), s)), tn = perp(norm(sub(p1, p0))); ctx.beginPath(); ctx.moveTo(c0.x + tn.x * w * 0.6, c0.y + tn.y * w * 0.6); ctx.quadraticCurveTo(c0.x + norm(sub(p1, p0)).x * 1.2, c0.y + norm(sub(p1, p0)).y * 1.2, c0.x - tn.x * w * 0.6, c0.y - tn.y * w * 0.6); ctx.stroke(); } }
      // záhyby v lokti: vnitřní strana (stlačení), síla podle ohybu
      if (bf > 0.1) { ctx.strokeStyle = shadeOf(col, 0.5); ctx.lineWidth = 0.6; ctx.globalAlpha = Math.min(1, bf * 1.5 * (0.6 + M.folds)); const tn = perp(norm(sub(a.end, a.root)));
        for (let f = 0; f < 2 + (M.folds > 0.5 ? 1 : 0); f++) { const c0 = add(add(a.joint, mul(tn, inner * body.elbowW * 0.5)), mul(t1, (f - 0.5) * 1.5)); ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.quadraticCurveTo(c0.x - tn.x * inner * 2 + t2.x * (1 - M.sharp), c0.y - tn.y * inner * 2 + t2.y * (1 - M.sharp), c0.x - tn.x * inner * 3.2, c0.y - tn.y * inner * 3.2); ctx.stroke(); } ctx.globalAlpha = 1; }
      ctx.restore();
    }
    // manžeta
    const cuffCol = of.top.cuff === 'rib' ? shadeOf(of.top.panels ? C.main : C.main, 0.22) : col;
    const cw = body.wristW + e * 0.7;
    const cuff: TubeNode[] = [{ p: add(wr, mul(t2, -2.2)), w: cw + 0.6 }, { p: add(wr, mul(t2, 0.4)), w: cw }];
    const cfill = far ? FAR(cuffCol) : cuffCol; ctx.fillStyle = cfill; tubePath(ctx, cuff, false); ctx.fill();
    if (of.top.cuff === 'rib' && det > 0.5) { ctx.save(); tubePath(ctx, cuff, false); ctx.clip(); ctx.strokeStyle = shadeOf(cfill, 0.3); ctx.lineWidth = 0.35; const tn = perp(t2); for (let k = -2; k <= 2; k++) { const c0 = add(wr, mul(tn, k * cw * 0.2)); ctx.beginPath(); ctx.moveTo(c0.x - t2.x * 2.4, c0.y - t2.y * 2.4); ctx.lineTo(c0.x + t2.x * 0.6, c0.y + t2.y * 0.6); ctx.stroke(); } ctx.restore(); }
    // ruka / rukavice / palčák
    const hc = of.hands === 'none' ? skinC : of.hands === 'mittens' ? C.accent : mixc(C.bottom, '#1e1d22', 0.4);
    const hcol = far ? FAR(hc) : hc, d = t2, tn = perp(d), hl = body.hand * (of.hands === 'mittens' ? 1.12 : 1), hw = body.wristW * (of.hands === 'mittens' ? 1.35 : 1.15);
    const h0 = a.end, tip = add(h0, mul(d, hl));
    ctx.fillStyle = hcol; ctx.beginPath();
    smoothClosed(ctx, [add(h0, mul(tn, hw * 0.45)), add(add(h0, mul(d, hl * 0.55)), mul(tn, hw * 0.55)), add(tip, mul(tn, hw * 0.12)), add(tip, mul(tn, -hw * 0.18)), add(add(h0, mul(d, hl * 0.5)), mul(tn, -hw * 0.55)), add(h0, mul(tn, -hw * 0.45))], 0.9);
    ctx.fill();
    // palec (na straně k tělu)
    const th = add(add(h0, mul(d, hl * 0.35)), mul(tn, -inner * hw * 0.55));
    ctx.beginPath(); ctx.ellipse(th.x, th.y, hw * 0.24, hw * 0.36, Math.atan2(d.y, d.x) + 0.5 * inner, 0, Math.PI * 2); ctx.fill();
    if (det > 0.4) { ctx.save(); ctx.beginPath(); smoothClosed(ctx, [add(h0, mul(tn, hw * 0.45)), add(add(h0, mul(d, hl * 0.55)), mul(tn, hw * 0.55)), add(tip, mul(tn, hw * 0.12)), add(tip, mul(tn, -hw * 0.18)), add(add(h0, mul(d, hl * 0.5)), mul(tn, -hw * 0.55)), add(h0, mul(tn, -hw * 0.45))], 0.9); ctx.clip(); ctx.fillStyle = shadeOf(hcol, 0.25); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(tip.x - tn.x * hw * 0.3, tip.y - tn.y * hw * 0.3, hw * 0.5, hl * 0.5, Math.atan2(d.y, d.x), 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; }
    return { E: a.end, d, L: hl, W: hw };
  };

  // -------------------------------------------------- trup + oděv
  const arms = [pose.arms[0].root, pose.arms[1].root], legsR = [pose.legs[0].root, pose.legs[1].root];
  const shR = Math.max(...arms.map(offN)), shL = Math.min(...arms.map(offN));
  const hipR = Math.max(...legsR.map(offN)) + body.thighW * 0.42, hipL = Math.min(...legsR.map(offN)) - body.thighW * 0.42;
  const shLv = clamp(lvl(arms[0]) * 0.5 + lvl(arms[1]) * 0.5, 0.8, 1);
  const fitted = of.top.fit === 'fitted' ? 1 : 0;
  const capR = (body.armW + ease) * 0.55;
  // body obrysu (n-souřadnice) v hladinách: kyčel 0, pas 0.42, hrudník 0.72, podpaží 0.8, rameno shLv
  const waistIn = (body.chest - body.waist) * (0.35 + 0.65 * fitted) * 0.6;
  const fwdBulge = back ? body.chestDepth * 0.4 : body.chestDepth, seat = body.seatDepth;
  const Rx = (lv: number) => lv < 0.42 ? lerp(hipR + ease * 0.6, shR + capR * 0.55 - waistIn, lv / 0.42) : lv < 0.72 ? lerp(shR + capR * 0.55 - waistIn, shR + capR * 0.7 + fwdBulge, (lv - 0.42) / 0.3) : shR + capR * 0.75 + fwdBulge * (1 - (lv - 0.72) / 0.3);
  const Lx = (lv: number) => lv < 0.42 ? lerp(hipL - ease * 0.6 - seat * 0.5, shL - capR * 0.55 + waistIn * 0.7, lv / 0.42) : shL - capR * 0.75;
  const hemLv = -(of.top.length * legL) / TL; // pod kyčlí (záporné hladiny)
  const hemY = H.y - u.y * (of.top.length * legL) * -1; void hemY;
  const legsAt = (lv: number) => { const p = F(lv, 0); const xs = [0, 1].map((i) => limbXAtY(pose.legs[i], p.y)).filter((v): v is number => v !== null).map((x) => (x - H.x) * n.x + (p.y - H.y) * n.y); return xs; };
  const flare = of.top.fit === 'aline' ? 3 : of.top.kind === 'coat' ? 1.4 : 0.6;
  const skirtSides = (lv: number) => {
    const xs = legsAt(lv), lw = body.kneeW * 0.5 + legW * 0.5 + ease;
    const r = Math.max(hipR + ease * 0.6, ...(xs.length ? xs.map((x) => x + lw) : [hipR])) + flare * clamp(-lv / 0.8, 0, 1);
    const l = Math.min(hipL - ease * 0.6 - seat * 0.4, ...(xs.length ? xs.map((x) => x - lw) : [hipL])) - flare * clamp(-lv / 0.8, 0, 1);
    return [l, r];
  };
  const isPuffer = of.top.material === 'down' && of.top.kind !== 'kidJacket' ? true : of.top.kind === 'kidJacket';
  const quilt = isPuffer ? M.quilt : 0;
  const scallop = (lv: number) => quilt ? Math.pow(Math.abs(Math.sin(Math.PI * (lv - hemLv) / ((1 - hemLv) / quilt))), 0.6) * 0.9 : 0;
  // obrys oděvu (body po obvodu): pravá strana zdola nahoru, ramena, krk, levá strana shora dolů, lem
  const garment = (): P[] => {
    const pts: P[] = [];
    const lowLv = of.top.length > 0.2 ? -0.06 : hemLv; // dlouhý oděv: trup končí u kyčle, dál sukně (zvlášť)
    const lows = of.top.length > 0.2 ? [lowLv] : [hemLv];
    pts.push(F(lows[0], (of.top.length > 0.2 ? Rx(0) : skirtSides(hemLv)[1])));
    for (const lv of [0.2, 0.42, 0.6, 0.72]) pts.push(F(lv, Rx(lv) + scallop(lv)));
    const sr = F(shLv, shR), srTop = add(sr, mul(u, capR * 0.95));
    pts.push(add(sr, mul(n, capR * 0.9)), add(srTop, mul(n, capR * 0.35)));
    pts.push(F(1.0, offN(Nk) + body.neckR + 1.6), F(1.02, offN(Nk) - body.neckR - 1.6));
    const sl = F(shLv, shL), slTop = add(sl, mul(u, capR * 0.95));
    pts.push(add(slTop, mul(n, -capR * 0.35)), add(sl, mul(n, -capR * 0.9)));
    for (const lv of [0.72, 0.6, 0.42, 0.2]) pts.push(F(lv, Lx(lv) - scallop(lv)));
    pts.push(F(lows[0], (of.top.length > 0.2 ? Lx(0) : skirtSides(hemLv)[0])));
    if (of.top.length <= 0.2) { const [l, r] = skirtSides(hemLv); pts.splice(pts.length, 0, F(hemLv - 0.015, lerp(l, r, 0.5))); void r; }
    return pts;
  };
  // sukně dlouhého oděvu: obal kyčlí, kolen a lemu visícího ve směru tíže (omezený zemí) – jeden kus
  // látky: v kroku se jen mírně rozevře, v dřepu přejde přes kolena a spadne k zemi
  const skirtHull = (drop = 0): P[] | null => {
    if (of.top.length <= 0.2) return null;
    const hw = (hipR - hipL) / 2, cx = (hipR + hipL) / 2, lw = body.kneeW * 0.5 + legW * 0.5 + ease * 0.8;
    const hemY = Math.min(H.y + of.top.length * legL + drop, -1.2 + drop * 0.3);
    const pts: P[] = [F(0.02, Lx(0)), F(0.02, Rx(0))];
    for (const l of pose.legs) { if (l.joint.y > H.y + 4) { pts.push(add(l.joint, mul(n, lw)), add(l.joint, mul(n, -lw))); } }
    const xs = [0, 1].map((i) => limbXAtY(pose.legs[i], hemY - 2)).filter((v): v is number => v !== null);
    const hc = H.x + n.x * cx, lim = hw + flare + 2.2;
    let hl = Math.min(...pts.map((p) => p.x)), hr = Math.max(...pts.map((p) => p.x));
    if (xs.length) { hl = Math.min(hl, ...xs.map((x) => x - lw)); hr = Math.max(hr, ...xs.map((x) => x + lw)); }
    hl = Math.max(hl, Math.min(hc - lim, ...pts.slice(2).map((p) => p.x))); hr = Math.min(hr, Math.max(hc + lim, ...pts.slice(2).map((p) => p.x)));
    pts.push({ x: hl - flare * 0.5, y: hemY }, { x: hr + flare * 0.5, y: hemY });
    // konvexní obal
    const P2 = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo: P[] = [], up: P[] = [];
    for (const p of P2) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P2.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  /** zaoblený mnohoúhelník (malý poloměr rohů – lem drží hranu) */
  const roundPoly = (pts: P[], r: number) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c2 = pts[(i + 1) % pts.length];
      const d1 = norm(sub(a, b)), d2 = norm(sub(c2, b)), rr = Math.min(r, len(sub(a, b)) / 2, len(sub(c2, b)) / 2);
      const p1 = add(b, mul(d1, rr)), p2 = add(b, mul(d2, rr));
      if (i === 0) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
      ctx.quadraticCurveTo(b.x, b.y, p2.x, p2.y);
    }
    ctx.closePath();
  };
  const gpts = garment();
  const gPath = () => { ctx.beginPath(); smoothClosed(ctx, gpts, 0.85); };
  const hemPts = () => { const [l, r] = skirtSides(hemLv); return [F(hemLv, l), F(hemLv + 0.01, (l + r) / 2), F(hemLv, r)]; };

  // zadní díl kabátu (vidět mezi nohama při kroku) – před nohama
  const drawBackPanel = () => {
    const hull = skirtHull((of.top.backDrop ?? 1) * 1.2); if (!hull || isSuit) return;
    ctx.fillStyle = shadeOf(C.main, 0.32); roundPoly(hull, 2.5); ctx.fill();
  };

  const drawTorso = () => {
    const col = C.main;
    const hull = skirtHull();
    const sPath = () => roundPoly(hull!, 2.2);
    if (hull) {
      ctx.fillStyle = col; sPath(); ctx.fill();
      // sukně kabátu: stín na zadní straně, záhyb od kolena ke lemu (podle rozkročení), těžký lem
      const hb = hull.filter((p) => p.y > H.y + 1).sort((a, b) => a.x - b.x);
      shadeEdges(ctx, sPath, hb.length ? [F(0, Lx(0)), hb[0]] : null, null, body.thighW * 0.5, col, 1);
      ctx.save(); sPath(); ctx.clip(); ctx.lineCap = 'round';
      const hemY = Math.max(...hull.map((p) => p.y)), kx = pose.legs.map((l) => l.joint.x);
      ctx.strokeStyle = shadeOf(col, 0.38); ctx.lineWidth = 0.7; ctx.globalAlpha = clamp(Math.abs(kx[0] - kx[1]) / 14, 0.15, 0.9);
      for (const l of pose.legs) { const k0 = l.joint; ctx.beginPath(); ctx.moveTo(k0.x, Math.min(k0.y, hemY - 3)); ctx.quadraticCurveTo(k0.x + (l.end.x - k0.x) * 0.3, (k0.y + hemY) / 2, k0.x + (l.end.x - k0.x) * 0.45, hemY); ctx.stroke(); }
      ctx.globalAlpha = 1;
      // otevření předních dílů mezi nohama (rozevření podle kroku) + zapínání pokračuje do lemu
      if (!back) {
        const cf0 = F(0, Lx(0) + (Rx(0) - Lx(0)) * 0.62), xs = legsAt(0.0); void xs;
        const gap = clamp(Math.abs(kx[0] - kx[1]) * 0.14, 0.3, 3), cfb = { x: cf0.x + (kx[0] + kx[1] - 2 * cf0.x) * 0.25, y: hemY };
        ctx.fillStyle = shadeOf(col, 0.5); ctx.beginPath(); ctx.moveTo(cf0.x + (cfb.x - cf0.x) * 0.45, cf0.y + (hemY - cf0.y) * 0.45); ctx.lineTo(cfb.x + gap, hemY + 1); ctx.lineTo(cfb.x - gap * 0.4, hemY + 1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = shadeOf(col, 0.45); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(cf0.x, cf0.y); ctx.lineTo(cfb.x, hemY); ctx.stroke();
        if (det > 0.3 && (of.top.closure === 'buttons' || of.top.closure === 'double')) { ctx.fillStyle = mixc(C.accent, '#1e1b1a', 0.35); for (const k of [0.18]) for (const dx of of.top.closure === 'double' ? [-2.2, 1.2] : [-0.6]) { ctx.beginPath(); ctx.arc(cf0.x + (cfb.x - cf0.x) * k + dx, cf0.y + (hemY - cf0.y) * k, 0.75, 0, Math.PI * 2); ctx.fill(); } }
        if (det > 0.3 && of.top.pockets !== 'none') { ctx.strokeStyle = shadeOf(col, 0.48); ctx.fillStyle = shadeOf(col, 0.1); ctx.lineWidth = 0.55; for (const fx of [0.25, 0.8]) { const p = F(-0.12, lerp(Lx(0), Rx(0), fx)); ctx.beginPath(); ctx.rect(p.x - 3, p.y - 1, 6, 2.6); ctx.fill(); ctx.stroke(); } }
      } else if (of.top.vent) { const c0 = F(-0.15, lerp(Lx(0), Rx(0), 0.52)); ctx.strokeStyle = shadeOf(col, 0.4); ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c0.x + (kx[0] + kx[1] - 2 * c0.x) * 0.15, hemY); ctx.stroke(); }
      ctx.restore();
      // tloušťka spodního lemu
      const hm = hull.filter((p) => p.y >= hemY - 0.5).sort((a, b) => a.x - b.x);
      if (hm.length >= 2) { ctx.strokeStyle = shadeOf(col, 0.42); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(hm[0].x + 1.5, hemY - 0.4); ctx.lineTo(hm[hm.length - 1].x - 1.5, hemY - 0.4); ctx.stroke(); }
    }
    ctx.fillStyle = col; gPath(); ctx.fill();
    // stín: zadní strana a spodek, akcent: přední horní část
    shadeEdges(ctx, gPath, gpts.slice(gpts.length - 9), det > 0.4 ? gpts.slice(3, 9) : null, body.chest * 0.55, col);
    ctx.save(); gPath(); ctx.clip(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // barevné panely (sportovní): ramenní sedlo v podpůrné barvě
    if (of.top.panels) { ctx.fillStyle = C.support; ctx.beginPath(); smoothThrough(ctx, [F(0.78, shL - capR * 2), F(0.86, offN(Nk)), F(0.78, shR + capR * 2)], true); ctx.lineTo(F(1.3, shR + 10).x, F(1.3, shR + 10).y); ctx.lineTo(F(1.3, shL - 10).x, F(1.3, shL - 10).y); ctx.closePath(); ctx.fill(); ctx.fillStyle = C.accent; ctx.beginPath(); smoothThrough(ctx, [F(0.76, shL - capR * 2), F(0.84, offN(Nk)), F(0.76, shR + capR * 2)], true); smoothThrough(ctx, [F(0.78, shR + capR * 2), F(0.86, offN(Nk)), F(0.78, shL - capR * 2)], false); ctx.closePath(); ctx.fill(); }
    // prošívání (péřová): komory sledují trup a lem, oblouky dolů (vyboulení)
    if (quilt && det > 0.25) {
      ctx.strokeStyle = shadeOf(col, 0.42); ctx.lineWidth = 0.6;
      const step = (1 - hemLv) / quilt;
      for (let k = 1; k < quilt + (of.top.length > 0.4 ? 0 : 0); k++) { const lv = hemLv + k * step; if (lv > 0.9) break; const l = lv < 0 ? skirtSides(lv)[0] : Lx(lv), r = lv < 0 ? skirtSides(lv)[1] : Rx(lv); ctx.beginPath(); smoothThrough(ctx, [F(lv, l - 2), F(lv - step * 0.12, (l + r) / 2), F(lv, r + 2)], true); ctx.stroke(); }
      // měkké světlo na horní části každé komory
      ctx.strokeStyle = lightOf(col, 0.22); ctx.lineWidth = 1.2; ctx.globalAlpha = 0.45;
      for (let k = 0; k < quilt; k++) { const lv = hemLv + (k + 0.65) * step; if (lv > 0.95) break; const l = lv < 0 ? skirtSides(lv)[0] : Lx(lv), r = lv < 0 ? skirtSides(lv)[1] : Rx(lv); ctx.beginPath(); smoothThrough(ctx, [F(lv, l * 0.5 + r * 0.5 - (r - l) * 0.25), F(lv - step * 0.08, (l + r) / 2 + (r - l) * 0.1), F(lv, l * 0.5 + r * 0.5 + (r - l) * 0.3)], true); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // stažení v pase (parka s páskem / vypasovaný kabát)
    if (of.top.belt) { ctx.strokeStyle = shadeOf(col, 0.35); ctx.lineWidth = 1.1; ctx.beginPath(); smoothThrough(ctx, [F(0.4, Lx(0.4) - 2), F(0.37, (Lx(0.4) + Rx(0.4)) / 2), F(0.4, Rx(0.4) + 2)], true); ctx.stroke(); }
    // předek: zapínání a rozparek / zadní díl: rozparek a švy
    const cfOff = (lv: number) => { const l = lv < 0 ? skirtSides(lv)[0] : Lx(lv), r = lv < 0 ? skirtSides(lv)[1] : Rx(lv); return back ? l + (r - l) * 0.52 : l + (r - l) * 0.62; };
    if (!back) {
      // otevření lemu mezi nohama (kabát: jeden oděv, mírně se rozevírá podle kroku)
      if (of.top.length > 0.3 && !isSuit) {
        const xs = legsAt(hemLv), gap = clamp((xs.length === 2 ? Math.abs(xs[0] - xs[1]) : 0) * 0.16, 0.4, 3.2), c0 = cfOff(hemLv);
        ctx.fillStyle = shadeOf(C.main, 0.5); ctx.beginPath(); const a0 = F(-0.08, cfOff(-0.08)); ctx.moveTo(a0.x, a0.y); const b0 = F(hemLv - 0.05, c0 + gap), b1 = F(hemLv - 0.05, c0 - gap * 0.5); ctx.quadraticCurveTo(F(hemLv * 0.6, c0 + gap * 0.3).x, F(hemLv * 0.6, c0 + gap * 0.3).y, b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = shadeOf(col, 0.45); ctx.lineWidth = 0.6;
      const top = of.top.collar === 'lapel' ? 0.68 : 0.98;
      ctx.beginPath(); smoothThrough(ctx, [F(top, cfOff(top)), F(0.4, cfOff(0.4)), F(0, cfOff(0)), F(hemLv, cfOff(hemLv))], true); ctx.stroke();
      if (det > 0.3) {
        if (of.top.closure === 'buttons' || of.top.closure === 'double') {
          ctx.fillStyle = mixc(C.accent, '#1e1b1a', 0.35);
          const rows = of.top.closure === 'double' ? [-2.2, 1.2] : [-0.6];
          for (const lv of [0.6, 0.42, 0.24, 0.06, -0.12].filter((x) => x > hemLv + 0.05)) for (const dx of rows) { const p = F(lv, cfOff(lv) + dx); ctx.beginPath(); ctx.arc(p.x, p.y, 0.75, 0, Math.PI * 2); ctx.fill(); }
        } else if (of.top.closure === 'zip') {
          ctx.strokeStyle = mixc(col, '#cfcac0', 0.35); ctx.lineWidth = 0.5; ctx.beginPath(); smoothThrough(ctx, [F(0.98, cfOff(0.98) + 0.4), F(0.4, cfOff(0.4) + 0.4), F(hemLv, cfOff(hemLv) + 0.4)], true); ctx.stroke();
          const zp = F(0.9, cfOff(0.9) + 0.6); ctx.fillStyle = '#d9d4cc'; ctx.fillRect(zp.x - 0.4, zp.y, 0.8, 1.8);
        }
        // kapsy (kotvené na boku, jdou s kabátem)
        const pl = lerp(Lx(0) + 2.5, cfOff(0) - 2, 0.45), pr = lerp(cfOff(0) + 2, Rx(0), 0.5);
        ctx.strokeStyle = shadeOf(col, 0.48); ctx.fillStyle = shadeOf(col, 0.1); ctx.lineWidth = 0.55;
        const pocketLv = of.top.length > 0.3 ? -0.06 : 0.12;
        for (const px of [pl, pr]) {
          if (of.top.pockets === 'flap') { const a0 = F(pocketLv, px - 3.2), a1 = F(pocketLv, px + 3.2), b1 = F(pocketLv - 0.07, px + 3.0), b0 = F(pocketLv - 0.07, px - 3.0); ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b0.x, b0.y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
          else if (of.top.pockets === 'welt') { const a0 = F(pocketLv + 0.08, px - 2.5), a1 = F(pocketLv - 0.02, px + 2.2); ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke(); }
          else if (of.top.pockets === 'patch') { ctx.beginPath(); smoothClosed(ctx, [F(pocketLv + 0.04, px - 2.6), F(pocketLv + 0.04, px + 2.6), F(pocketLv - 0.12, px + 2.4), F(pocketLv - 0.13, px - 2.4)], 0.4); ctx.fill(); ctx.stroke(); }
        }
      }
    } else {
      // záda: středový šev, rozparek, sedlo
      ctx.strokeStyle = shadeOf(col, 0.4); ctx.lineWidth = 0.55;
      if (of.top.vent && of.top.length > 0.3) { ctx.beginPath(); const v0 = F(-0.15, cfOff(-0.15)); ctx.moveTo(v0.x, v0.y); const v1 = F(hemLv, cfOff(hemLv)); ctx.lineTo(v1.x, v1.y); ctx.stroke(); }
      if (det > 0.4 && of.top.kind !== 'puffer') { ctx.beginPath(); smoothThrough(ctx, [F(0.82, Lx(0.82) - 2), F(0.86, cfOff(0.86)), F(0.82, Rx(0.82) + 2)], true); ctx.stroke(); }
    }
    ctx.restore();
    // spodní lem: tloušťka látky (tmavší linka u kabátu, žebrování u bundy)
    ctx.strokeStyle = shadeOf(col, of.top.material === 'wool' ? 0.4 : 0.3); ctx.lineWidth = of.top.material === 'down' ? 1.4 : 0.9; ctx.lineCap = 'round';
    if (of.top.length <= 0.2) { ctx.beginPath(); smoothThrough(ctx, hemPts(), true); ctx.stroke(); }
  };

  // límec / kapuce
  const drawCollar = () => {
    const c = Nk, w = body.neckR + 1.2 + ease * 0.4, col = of.top.collar === 'hood' ? (isSuit ? C.main : C.main) : of.top.kind === 'coat' ? shadeOf(C.main, 0.08) : C.main;
    if (of.top.collar === 'lapel') {
      // klopy: V k zapínání, vzadu stojáček kolem krku
      const cf = back ? 0 : 0.62;
      ctx.fillStyle = shadeOf(C.main, 0.06); ctx.beginPath();
      const l0 = add(c, mul(n, -w - 1.5)), r0 = add(c, mul(n, w + 1.5)), tip = F(0.66, lerp(Lx(0.66), Rx(0.66), cf));
      if (!back) { smoothClosed(ctx, [add(l0, mul(u, 1.5)), add(r0, mul(u, 1.5)), add(r0, mul(n, 2.5)), add(tip, mul(n, 1.6)), add(tip, mul(n, -1.2)), add(l0, mul(n, -2.5))], 0.5); }
      else smoothClosed(ctx, [add(l0, mul(u, 2.2)), add(r0, mul(u, 2.2)), add(r0, mul(u, -1.2)), add(l0, mul(u, -1.2))], 0.6);
      ctx.fill();
      if (!back && det > 0.35) { ctx.strokeStyle = shadeOf(C.main, 0.42); ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(r0.x + n.x * 2.5, r0.y + n.y * 2.5); ctx.lineTo(tip.x + n.x * 1.6, tip.y + n.y * 1.6); ctx.moveTo(l0.x - n.x * 2.5, l0.y - n.y * 2.5); ctx.lineTo(tip.x - n.x * 1.2, tip.y - n.y * 1.2); ctx.stroke(); }
      return;
    }
    if (of.top.collar === 'stand' || of.top.collar === 'funnel') {
      const hgt = of.top.kind === 'puffer' ? 4.2 : 3.2;
      ctx.fillStyle = col; ctx.beginPath();
      smoothClosed(ctx, [add(c, mul(n, -w - 0.6)), add(add(c, mul(n, -w)), mul(u, hgt)), add(add(c, mul(n, w)), mul(u, hgt + (back ? 0 : -0.6))), add(c, mul(n, w + 0.6)), add(add(c, mul(u, -1.2)), mul(n, 0))], 0.6);
      ctx.fill();
      ctx.strokeStyle = shadeOf(col, 0.3); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(c.x - n.x * w + u.x * hgt, c.y - n.y * w + u.y * hgt); ctx.lineTo(c.x + n.x * w + u.x * (hgt - 0.6), c.y + n.y * w + u.y * (hgt - 0.6)); ctx.stroke();
      return;
    }
    if (of.top.collar === 'hood' && !back) {
      // shrnutá kapuce za krkem (zepředu vidět okraj za ramenem)
      ctx.fillStyle = shadeOf(col, 0.12); ctx.beginPath();
      smoothClosed(ctx, [add(c, mul(n, -w - 4.5)), add(add(c, mul(n, -w - 3)), mul(u, 5)), add(add(c, mul(n, -1)), mul(u, 3.5)), add(c, mul(n, w + 1)), add(add(c, mul(u, -2)), mul(n, -w))], 0.7);
      ctx.fill();
    }
  };
  const drawHoodBack = () => {
    if (of.top.collar !== 'hood' || !back) return;
    const c = Nk, w = body.neckR + 5, col = C.main;
    const path = () => { ctx.beginPath(); smoothClosed(ctx, [add(c, mul(n, -w)), add(add(c, mul(n, -w * 0.8)), mul(u, 6.5)), add(add(c, mul(n, w * 0.6)), mul(u, 7.5)), add(c, mul(n, w)), add(add(c, mul(u, -5)), mul(n, 0.5))], 0.8); };
    ctx.fillStyle = col; path(); ctx.fill();
    ctx.save(); path(); ctx.clip(); ctx.strokeStyle = shadeOf(col, 0.4); ctx.lineWidth = 0.7; ctx.beginPath(); smoothThrough(ctx, [add(add(c, mul(n, -w * 0.6)), mul(u, 4)), add(add(c, mul(n, 0)), mul(u, 1)), add(add(c, mul(n, w * 0.5)), mul(u, 4.5))], true); ctx.stroke();
    if (of.top.kind === 'parka' && det > 0.4) { ctx.strokeStyle = mixc(C.support, '#ffffff', 0.2); ctx.lineWidth = 1.6; ctx.setLineDash([0.6, 0.8]); ctx.beginPath(); smoothThrough(ctx, [add(add(c, mul(n, -w * 0.85)), mul(u, 5.6)), add(add(c, mul(n, 0)), mul(u, 7.4)), add(add(c, mul(n, w * 0.6)), mul(u, 6.8))], true); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  };

  // kalhoty: sed/rozkrok spojí obě nohy (nohy nepůsobí jako dvě tyčky)
  const drawSeat = () => {
    if (of.bottom.kind === 'skirt') return;
    const col = trouserCol;
    ctx.fillStyle = col; ctx.beginPath();
    const crotch = F(-0.22, (hipL + hipR) / 2);
    smoothClosed(ctx, [F(0.12, hipL + 0.5), F(0.12, hipR - 0.5), F(-0.05, hipR), add(crotch, mul(n, 2.5)), add(crotch, mul(n, -2.5)), F(-0.05, hipL)], 0.6);
    ctx.fill();
  };
  const drawSkirt = () => {
    if (of.bottom.kind !== 'skirt') return;
    const lv = -(of.bottom.skirtLen ?? 0.5) * legL / TL, [l, r] = skirtSides(lv), col = C.bottom;
    ctx.fillStyle = col; ctx.beginPath(); smoothClosed(ctx, [F(0.1, hipL), F(0.1, hipR), F(lv, r - 0.5), F(lv - 0.02, (l + r) / 2), F(lv, l + 0.5)], 0.5); ctx.fill();
  };

  // -------------------------------------------------- hlava
  const headUp = norm(sub(pose.head, Nk)), hn2 = perp(headUp); // hn2 vpravo (k obličeji v ¾ zepředu)
  const R = body.headR, Ch = add(pose.head, mul(headUp, -R * 0.05));
  const HP = (x: number, y: number): P => ({ x: Ch.x + hn2.x * x * R - headUp.x * y * R, y: Ch.y + hn2.y * x * R - headUp.y * y * R }); // y dolů v jednotkách R
  const hair = of.hair;
  const drawNeckSkin = () => {
    ctx.fillStyle = shadeOf(skinC, 0.18); const nodes: TubeNode[] = [{ p: add(Nk, mul(u, -1.5)), w: body.neckR * 2 }, { p: HP(back ? 0.05 : -0.1, 0.55), w: body.neckR * 2 }];
    tubePath(ctx, nodes, false); ctx.fill();
  };
  const hairCol = hair.color;
  const drawHairBack = () => {
    // dlouhé vlasy / culík / mikádo: zadní hmota za hlavou (před trupem i po něm podle délky)
    if (hair.style === 'long') { ctx.fillStyle = shadeOf(hairCol, 0.12); ctx.beginPath(); smoothClosed(ctx, back ? [HP(-0.95, -0.3), HP(0.95, -0.3), HP(1.05, 1.0), HP(0.9, 2.1), HP(-0.9, 2.1), HP(-1.05, 1.0)] : [HP(-0.9, -0.5), HP(0.3, -0.9), HP(-0.1, 0.6), HP(-0.35, 1.9), HP(-1.1, 1.9), HP(-1.1, 0.4)], 0.8); ctx.fill(); }
  };
  const drawHead = () => {
    const face: P[] = back
      ? [HP(0, -1.02), HP(0.8, -0.62), HP(1.0, 0.05), HP(0.75, 0.68), HP(0.15, 0.98), HP(-0.55, 0.78), HP(-0.98, 0.1), HP(-0.78, -0.62)]
      : [HP(0, -1.02), HP(0.78, -0.65), HP(0.98, -0.05), HP(1.02, 0.28), HP(0.88, 0.62), HP(0.55, 0.96 * body.jaw + 0.06), HP(0.1, 0.98), HP(-0.5, 0.72), HP(-0.95, 0.1), HP(-0.8, -0.62)];
    const hpth = () => { ctx.beginPath(); smoothClosed(ctx, face, 0.9); };
    ctx.fillStyle = skinC; hpth(); ctx.fill();
    shadeEdges(ctx, hpth, back ? face.slice(4, 8) : [HP(-0.95, 0.1), HP(-0.6, 0.7), HP(0.1, 1.0)], null, R * 0.35, skinC, 0.7);
    // ucho
    const ear = back ? HP(0.78, 0.18) : HP(-0.42, 0.15);
    ctx.fillStyle = shadeOf(skinC, 0.08); ctx.beginPath(); ctx.ellipse(ear.x, ear.y, R * 0.16, R * 0.23, Math.atan2(headUp.y, headUp.x) + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    if (!back) {
      // tvář: oči, obočí, nos, ústa, líčka – čitelné i v malé velikosti
      const eyeY = 0.12, e1 = HP(0.22, eyeY), e2 = HP(0.68, eyeY - 0.02);
      if (det > 0.15) {
        ctx.fillStyle = mixc(skinC, body.blush, 0.55); ctx.globalAlpha = 0.45; ctx.beginPath(); const ck = HP(0.32, 0.46); ctx.ellipse(ck.x, ck.y, R * 0.2, R * 0.13, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#2b2220'; for (const [e, s] of [[e1, 1], [e2, 0.82]] as [P, number][]) { ctx.beginPath(); ctx.ellipse(e.x, e.y, R * 0.075 * s, R * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
        if (det > 0.45) {
          ctx.strokeStyle = shadeOf(hairCol, 0.1); ctx.lineWidth = R * 0.06; ctx.lineCap = 'round'; ctx.beginPath(); const b1 = HP(0.1, -0.08), b2 = HP(0.36, -0.12), b3 = HP(0.58, -0.12), b4 = HP(0.78, -0.08); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.moveTo(b3.x, b3.y); ctx.lineTo(b4.x, b4.y); ctx.stroke();
          ctx.strokeStyle = shadeOf(skinC, 0.35); ctx.lineWidth = R * 0.05; ctx.beginPath(); const n1 = HP(0.86, 0.18), n2 = HP(0.98, 0.4), n3 = HP(0.84, 0.44); ctx.moveTo(n1.x, n1.y); ctx.quadraticCurveTo(n2.x, n2.y, n3.x, n3.y); ctx.stroke();
          ctx.strokeStyle = mixc(skinC, '#7a3a34', 0.5); ctx.lineWidth = R * 0.055; ctx.beginPath(); const m1 = HP(0.46, 0.66), m2 = HP(0.6, 0.7), m3 = HP(0.72, 0.64); ctx.moveTo(m1.x, m1.y); ctx.quadraticCurveTo(m2.x, m2.y, m3.x, m3.y); ctx.stroke();
        }
      }
      if (hair.beard) { ctx.fillStyle = shadeOf(hairCol, 0.05); ctx.beginPath(); smoothClosed(ctx, [HP(-0.45, 0.35), HP(0.15, 0.55), HP(0.48, 0.58), HP(0.62, 0.78), HP(0.95, 0.5), HP(0.82, 0.86), HP(0.3, 1.08), HP(-0.4, 0.82)], 0.8); ctx.fill(); }
    }
    // vlasy (kryt hlavy podle účesu; ucho zůstává vidět)
    const hp = (pts: P[]) => { ctx.fillStyle = hairCol; ctx.beginPath(); smoothClosed(ctx, pts, 0.85); ctx.fill(); };
    const capF = back
      ? [HP(-0.88, -0.55), HP(0, -1.1), HP(0.85, -0.6), HP(0.98, 0.0), HP(0.6, 0.12), HP(0.45, 0.55), HP(-0.2, 0.62), HP(-0.85, 0.35)]
      : [HP(-0.95, 0.25), HP(-0.85, -0.6), HP(0, -1.12), HP(0.75, -0.72), HP(0.95, -0.32), HP(0.55, -0.42), HP(0.1, -0.3), HP(-0.25, -0.02), HP(-0.55, 0.05), HP(-0.7, 0.45)];
    switch (hair.style) {
      case 'bald': hp(back ? [HP(-0.9, 0.0), HP(0.95, 0.0), HP(0.7, 0.45), HP(-0.6, 0.5)] : [HP(-0.95, 0.0), HP(-0.6, -0.2), HP(-0.5, 0.4), HP(-0.85, 0.45)]); break;
      case 'crop': hp(capF.map((p) => add(Ch, mul(sub(p, Ch), 0.98)))); break;
      case 'curly': hp(capF.flatMap((p, i) => [p, add(Ch, mul(sub(p, Ch), 1.08 + 0.04 * hn(i)))])); break;
      case 'bob': hp(back ? [HP(-1.0, -0.5), HP(0, -1.12), HP(1.0, -0.5), HP(1.08, 0.5), HP(0.8, 0.85), HP(-0.6, 0.9), HP(-1.05, 0.55)] : [HP(-1.05, 0.7), HP(-0.95, -0.6), HP(0, -1.12), HP(0.8, -0.7), HP(1.0, -0.2), HP(0.6, -0.35), HP(0.2, -0.15), HP(-0.3, 0.1), HP(-0.55, 0.75)]); break;
      case 'long': hp(capF); break;
      case 'pony': case 'bun': hp(capF); { const bp = back ? HP(0.1, -0.35) : HP(-0.85, hair.style === 'bun' ? -0.75 : -0.2); ctx.fillStyle = shadeOf(hairCol, 0.06); ctx.beginPath(); if (hair.style === 'bun') ctx.arc(bp.x, bp.y, R * 0.34, 0, Math.PI * 2); else smoothClosed(ctx, [bp, add(bp, mul(hn2, -R * 0.35)), add(add(bp, mul(hn2, -R * 0.45)), mul(headUp, -R * 1.1)), add(add(bp, mul(hn2, -R * 0.1)), mul(headUp, -R * 0.9))], 0.8); ctx.fill(); } break;
      default: hp(capF);
    }
    if (det > 0.5 && hair.style !== 'bald') { ctx.save(); ctx.beginPath(); smoothClosed(ctx, capF, 0.85); ctx.clip(); ctx.strokeStyle = lightOf(hairCol, 0.25); ctx.globalAlpha = 0.5; ctx.lineWidth = R * 0.08; ctx.beginPath(); smoothThrough(ctx, [HP(-0.5, -0.75), HP(0.1, -0.95), HP(0.55, -0.75)], true); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; }
  };

  // -------------------------------------------------- pořadí vrstev
  const hands: FigureGeo['hands'] = [null, null];
  hands[0] = drawArm(0);
  drawHairBack();
  drawBackPanel();
  legWithBoot(0); legWithBoot(1);
  drawSeat(); drawSkirt();
  if (!back) drawCollar();
  drawTorso();
  if (back) drawCollar();
  accDraw?.('scarf');
  if (!back) drawNeckSkin();
  drawHead();
  drawHoodBack();
  accDraw?.('hat');
  hands[1] = drawArm(1);
  return { headC: HP(0, 0), headUp, headR: R, neck: add(Nk, mul(u, 1.2)), torsoUp: u, neckW: (body.neckR + 2.2) * 2 * 1.35, hands, back, skin: skinC };
}
