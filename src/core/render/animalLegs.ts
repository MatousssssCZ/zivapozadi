/**
 * Vektorové nohy psů a koček (bez textur), napojené na malované trupy.
 *
 * Tři vrstvy:
 *  1. Anatomie (`LegProfile`): přední noha lopatka/rameno → loket → zápěstí → tlapka, zadní kyčel →
 *     koleno → hlezno → tlapka. Délky článků v metrech, šířky podél kostry, omezení kloubů.
 *  2. Pohyb: řídí se od tlapek. Fáze kroku je funkcí uražené dráhy (rychlost = délka cyklu × frekvence
 *     platí vždy, nezávisle na snímkové frekvenci); ve fázi opory se tlapka posouvá vůči trupu přesně
 *     rychlostí těla dozadu → ve světě stojí (nekloužou). Přenos: nízký oblouk s měkkým začátkem/koncem,
 *     odděleně podélný posun, výška, natočení tlapky. Klouby dopočítává IK: distální článek (záprstí /
 *     nárt) je řízený úhlem podle fáze, zbytek dvoučlánková IK se stálým směrem ohybu (loket vzad,
 *     koleno vpřed, hlezno vzad) – žádné přeskakování řešení.
 *  3. Vykreslení: souvislý měkký obrys (Bézierovy křivky přes body vlevo/vpravo od kostry se šířkou
 *     podél délky), tlapka jako samostatný měkký objem (zploští se při došlapu, odvaluje přes prsty),
 *     stínování přechodem, srst kotvená v lokálních souřadnicích článku (nemění se mezi snímky),
 *     kresba (ponožky, skvrny, žíhání) také v lokálních souřadnicích.
 * Všechny rozměry v metrech; převod na px dává volající (pxPerM). Bez alokací mimo malá pole bodů.
 */
export type LegId = 'LF' | 'RF' | 'LH' | 'RH';
export interface Marking { kind: 'spot' | 'stripe'; seg: 0 | 1 | 2; u: number; v: number; r: number; color: string }
export interface LegProfile {
  species: 'dog' | 'cat';
  /** délky článků (m): přední [nadloktí, předloktí, záprstí], zadní [stehno, bérec, nárt] */ front: [number, number, number]; hind: [number, number, number];
  /** šířky (m) v kořeni, kloubech a nad tlapkou: přední / zadní */ wFront: [number, number, number, number]; wHind: [number, number, number, number];
  /** tlapka: délka a výška (m) */ paw: [number, number];
  colors: { upper: string; lower: string; paw: string; hupper: string; hlower: string; hpaw: string; shade?: string };
  markings?: Marking[];
  /** dlouhá srst: nepravidelný obrys (0–1) */ shag: number;
  /** šířka postoje (m), délka cyklu (m), podíl opory při pomalé chůzi, zdvih tlapky (m) */ stance: number; stride: number; duty: number; lift: number;
  phase: Record<LegId, number>;
  /** pohyb těla: svislý pohyb (m), náklon (rad), kompenzace hlavy (0–1) */ body: { bob: number; pitch: number; headComp: number };
}

const DEFAULT_PHASE: Record<LegId, number> = { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 };
const C = (c?: Record<string, string>) => ({ upper: c?.upper ?? '#8a7a6a', lower: c?.lower ?? '#8a7a6a', paw: c?.paw ?? '#7a6a5a', hupper: c?.hupper ?? c?.upper ?? '#8a7a6a', hlower: c?.hlower ?? c?.lower ?? '#8a7a6a', hpaw: c?.hpaw ?? c?.paw ?? '#7a6a5a' });

/** Profily plemen (výchozí návrh, laditelný). `colors` doplní z malby `animalBreeds.ts`. */
export function legProfile(breed: string | undefined, species: 'dog' | 'cat', colors?: Record<string, string>): LegProfile {
  // dvoubarevná plemena: průměr z malby by smíchal barvy – ruční barvy podle předlohy
  const FIX: Record<string, Record<string, string>> = {
    dog_collie: { upper: '#2c2a31', lower: '#ece6e1', paw: '#f3eee9', hupper: '#2c2a31', hlower: '#ebe4df', hpaw: '#f3eee9' },
    dog_bernese: { upper: '#24222a', lower: '#8b4c28', paw: '#ece4dc', hupper: '#24222a', hlower: '#8b4c28', hpaw: '#ece4dc' },
    dog_husky: { upper: '#8e8a92', lower: '#e6dfd9', paw: '#ece6e0', hupper: '#9c97a0', hlower: '#e6dfd9', hpaw: '#ece6e0' },
    dog_dalmatian: { upper: '#e9e4e4', lower: '#e6e0df', paw: '#ddd5d3', hupper: '#e9e4e4', hlower: '#e6e0df', hpaw: '#ddd5d3' },
  };
  const col = C({ ...(colors ?? {}), ...(breed ? FIX[breed] ?? {} : {}) });
  const base = (o: Partial<LegProfile>): LegProfile => ({
    species, front: [0.13, 0.13, 0.055], hind: [0.14, 0.14, 0.08], wFront: [0.07, 0.05, 0.034, 0.03], wHind: [0.095, 0.06, 0.03, 0.03],
    paw: [0.06, 0.035], colors: col, shag: 0, stance: 0.06, stride: 0.36, duty: 0.68, lift: 0.045, phase: DEFAULT_PHASE, body: { bob: 0.008, pitch: 0.025, headComp: 0.6 }, ...o,
  });
  switch (breed) {
    case 'dog_bernese': return base({ front: [0.19, 0.18, 0.07], hind: [0.2, 0.2, 0.1], wFront: [0.12, 0.085, 0.06, 0.055], wHind: [0.15, 0.095, 0.055, 0.055], paw: [0.085, 0.05], shag: 0.8, stance: 0.1, stride: 0.56, duty: 0.68, lift: 0.05, body: { bob: 0.012, pitch: 0.03, headComp: 0.6 } });
    case 'dog_dalmatian': return base({ front: [0.19, 0.2, 0.07], hind: [0.21, 0.21, 0.11], wFront: [0.08, 0.05, 0.034, 0.034], wHind: [0.11, 0.06, 0.032, 0.033], paw: [0.07, 0.038], stance: 0.07, stride: 0.576, duty: 0.64, lift: 0.06,
      markings: [{ kind: 'spot', seg: 0, u: 0.35, v: 0.2, r: 0.018, color: '#1d1c22' }, { kind: 'spot', seg: 1, u: 0.55, v: -0.25, r: 0.012, color: '#1d1c22' }, { kind: 'spot', seg: 0, u: 0.7, v: -0.3, r: 0.012, color: '#1d1c22' }, { kind: 'spot', seg: 1, u: 0.2, v: 0.3, r: 0.009, color: '#1d1c22' }] });
    case 'dog_frenchie': return base({ front: [0.09, 0.08, 0.04], hind: [0.09, 0.09, 0.055], wFront: [0.08, 0.055, 0.04, 0.04], wHind: [0.1, 0.065, 0.04, 0.04], paw: [0.055, 0.032], stance: 0.08, stride: 0.24, duty: 0.66, lift: 0.03, body: { bob: 0.006, pitch: 0.02, headComp: 0.7 } });
    case 'dog_collie': return base({ front: [0.16, 0.16, 0.06], hind: [0.17, 0.17, 0.095], wFront: [0.08, 0.05, 0.034, 0.033], wHind: [0.12, 0.06, 0.033, 0.033], paw: [0.065, 0.036], shag: 0.6, stance: 0.065, stride: 0.496, duty: 0.65, lift: 0.055 });
    case 'dog_husky': return base({ front: [0.17, 0.17, 0.065], hind: [0.18, 0.18, 0.1], wFront: [0.09, 0.06, 0.04, 0.038], wHind: [0.12, 0.07, 0.04, 0.038], paw: [0.07, 0.04], shag: 0.4, stance: 0.07, stride: 0.52, duty: 0.65, lift: 0.055 });
    case 'dog_dachshund': return base({ front: [0.06, 0.05, 0.03], hind: [0.065, 0.055, 0.04], wFront: [0.06, 0.045, 0.034, 0.034], wHind: [0.07, 0.05, 0.034, 0.034], paw: [0.05, 0.03], stance: 0.07, stride: 0.176, duty: 0.66, lift: 0.025 });
    case 'cat_british': return base({ front: [0.085, 0.08, 0.035], hind: [0.09, 0.09, 0.055], wFront: [0.06, 0.045, 0.035, 0.034], wHind: [0.08, 0.05, 0.035, 0.034], paw: [0.045, 0.028], shag: 0.15, stance: 0.04, stride: 0.208, duty: 0.7, lift: 0.025, body: { bob: 0.004, pitch: 0.015, headComp: 0.75 } });
    case 'cat_mainecoon': return base({ front: [0.11, 0.1, 0.045], hind: [0.12, 0.12, 0.07], wFront: [0.07, 0.05, 0.036, 0.035], wHind: [0.1, 0.055, 0.036, 0.035], paw: [0.055, 0.032], shag: 0.7, stance: 0.045, stride: 0.272, duty: 0.7, lift: 0.03, body: { bob: 0.005, pitch: 0.015, headComp: 0.75 } });
    default: return species === 'cat'
      ? base({ front: [0.085, 0.085, 0.035], hind: [0.09, 0.095, 0.055], wFront: [0.05, 0.035, 0.026, 0.026], wHind: [0.07, 0.04, 0.026, 0.026], paw: [0.04, 0.024], stance: 0.035, stride: 0.192, duty: 0.7, lift: 0.025, body: { bob: 0.004, pitch: 0.015, headComp: 0.75 } })
      : base({});
  }
}

type P = { x: number; y: number };
export interface LegSolve { pts: [P, P, P, P]; paw: P; pawAng: number; contact: boolean; flat: number; target: P }
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ss = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/**
 * Cíl tlapky (y dolů, zem y = 0, x vpřed) a stav pro jednu nohu.
 * `ph` 0..1 fáze cyklu této nohy, `walk` 0..1 síla chůze, `rootX` x kořene (rameno/kyčel) vůči středu,
 * `L` celkový dosah (px), `S` délka cyklu (px). Opora: tlapka jde dozadu rychlostí těla (ve světě stojí).
 */
export function pawTarget(ph: number, duty: number, walk: number, rootX: number, S: number, lift: number, front: boolean): { x: number; y: number; contact: boolean; q: number; roll: number } {
  const A = 0.5 * duty * S * walk, d = duty; // polovina posunu tlapky během opory
  const base = rootX + (front ? 0.04 : -0.06) * S * 0.5;
  if (ph < d) { const k = ph / d; return { x: base + A * (1 - 2 * k), y: 0, contact: true, q: k, roll: ss((k - 0.75) / 0.25) }; }
  // přenos: podélně měkce (smoothstep), výška – nízký oblouk s rychlým zdvihem a pozvolným došlapem
  const q = (ph - d) / (1 - d), u = q * q * (3 - 2 * q);
  const h = lift * walk * Math.sin(Math.PI * Math.pow(q, 0.8)) * (1 - 0.15 * q);
  return { x: base - A + 2 * A * u, y: -h, contact: false, q, roll: 1 - ss(q / 0.35) };
}

/**
 * IK končetiny: kořen R (rameno/kyčel), cíl tlapky T. Distální článek (záprstí/nárt) je řízený úhlem
 * (fáze), horní dva články dvoučlánková IK s pevným směrem ohybu: přední loket vzad (−1), zadní koleno
 * vpřed (+1); hlezno je pak zlom vzad. Dosah omezen (žádné natahování kostí).
 */
export function solveLeg(R: P, T: P, segs: [number, number, number], front: boolean, swingQ: number, contact: boolean, roll: number): LegSolve {
  const [l1, l2, l3] = segs;
  // distální článek: přední záprstí skoro svisle (mírně vpřed), v odrazu se sklápí; zadní nárt šikmo vzad nahoru
  let a3: number; // úhel od svislice (+ = horní konec vzad)
  if (front) a3 = contact ? -0.12 + 0.9 * roll : 0.9 - 0.95 * ss(swingQ / 0.8);
  else a3 = contact ? 0.38 + 0.35 * roll : 0.75 - 0.4 * ss(swingQ / 0.8);
  const W: P = { x: T.x + Math.sin(a3) * l3 * 1, y: T.y - Math.cos(a3) * l3 };
  // kloub mezi l1 a l2 (loket / koleno)
  let dx = W.x - R.x, dy = W.y - R.y, d = Math.hypot(dx, dy);
  const dMax = (l1 + l2) * 0.995, dMin = Math.abs(l1 - l2) + 1e-3;
  if (d > dMax) { dx *= dMax / d; dy *= dMax / d; d = dMax; } else if (d < dMin) { dx *= dMin / d; dy *= dMin / d; d = dMin; }
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), base = Math.atan2(dy, dx);
  const bend = (front ? 1 : -1) * Math.acos(ca); // y dolů: + = loket vzad (−x), − = koleno vpřed
  const J = { x: R.x + Math.cos(base + bend) * l1, y: R.y + Math.sin(base + bend) * l1 };
  const W2 = { x: R.x + dx, y: R.y + dy };
  // distální článek z omezeného W2 k tlapce (zachová délku l3)
  const vx = T.x - W2.x, vy = T.y - W2.y, vl = Math.hypot(vx, vy) || 1;
  const paw = { x: W2.x + (vx / vl) * l3, y: W2.y + (vy / vl) * l3 };
  const flat = contact ? 1 - 0.6 * roll : 0;
  return { pts: [R, J, W2, paw], paw, pawAng: contact ? -roll * 0.6 : (front ? 0.25 : 0.35) * (1 - swingQ), contact, flat, target: T };
}

/** deterministický šum (srst) */
const hn = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * Vykreslí nohu: souvislý obrys (kořen schovaný pod trupem – volající kreslí trup přes kořen u vzdálených
 * nohou, u bližších dokreslí lokální překryv srsti), stínování, srst, kresbu, tlapku.
 * `w` šířky [kořen, kloub1, kloub2, nad tlapkou] v px, `pawSz` [délka, výška] px.
 */
export function drawLeg(ctx: CanvasRenderingContext2D, s: LegSolve, w: [number, number, number, number], pawSz: [number, number], col: { upper: string; lower: string; paw: string }, shag: number, markings: Marking[] | undefined, far: boolean, seed: number, front: boolean) {
  const [A, B, Cp, D] = s.pts;
  // body obrysu: v kořeni rozšířený (napojení pod trupem), zúžení k zápěstí/hleznu, tlapka mírně širší
  const nodes = [{ p: { x: A.x, y: A.y - w[0] * 0.35 }, w: w[0] * 1.05 }, { p: A, w: w[0] }, { p: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, w: (w[0] + w[1]) / 2 * (front ? 1 : 1.04) }, { p: B, w: w[1] }, { p: { x: (B.x + Cp.x) / 2, y: (B.y + Cp.y) / 2 }, w: (w[1] + w[2]) / 2 }, { p: Cp, w: w[2] }, { p: { x: (Cp.x + D.x) / 2, y: (Cp.y + D.y) / 2 }, w: w[3] * 0.95 }, { p: D, w: w[3] }];
  const L: P[] = [], Rr: P[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[Math.max(0, i - 1)].p, b = nodes[Math.min(nodes.length - 1, i + 1)].p, tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl, ny = tx / tl, hw = nodes[i].w / 2;
    const j = shag ? (hn(seed + i, 3) - 0.5) * shag * hw * 0.22 : 0; // pevné nepravidelnosti (nemění se v čase)
    L.push({ x: nodes[i].p.x + nx * (hw + j), y: nodes[i].p.y + ny * (hw + j) }); Rr.push({ x: nodes[i].p.x - nx * (hw - j), y: nodes[i].p.y - ny * (hw - j) });
  }
  const path = () => {
    ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < L.length - 1; i++) { const m = { x: (L[i].x + L[i + 1].x) / 2, y: (L[i].y + L[i + 1].y) / 2 }; ctx.quadraticCurveTo(L[i].x, L[i].y, m.x, m.y); }
    ctx.lineTo(L[L.length - 1].x, L[L.length - 1].y);
    const e = L[L.length - 1], f = Rr[Rr.length - 1]; ctx.quadraticCurveTo(D.x + (D.x - nodes[nodes.length - 2].p.x) * 0.3, D.y + (D.y - nodes[nodes.length - 2].p.y) * 0.3, f.x, f.y); void e;
    for (let i = Rr.length - 2; i > 0; i--) { const m = { x: (Rr[i].x + Rr[i - 1].x) / 2, y: (Rr[i].y + Rr[i - 1].y) / 2 }; ctx.quadraticCurveTo(Rr[i].x, Rr[i].y, m.x, m.y); }
    ctx.lineTo(Rr[0].x, Rr[0].y); ctx.closePath();
  };
  ctx.save();
  // výplň: horní barva → spodní (ponožka / tmavší spodek) podél nohy
  const g = ctx.createLinearGradient(A.x, A.y, D.x, D.y);
  g.addColorStop(0, col.upper); g.addColorStop(0.38, col.upper); g.addColorStop(0.62, col.lower); g.addColorStop(1, col.lower);
  path(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); path(); ctx.clip();
  // stínování: světlo shora zepředu (přední hrana světlejší, zadní tmavší), vzdálená noha tmavší
  const sx = (L[3].x + Rr[3].x) / 2, sy = (L[3].y + Rr[3].y) / 2, nx = (L[3].x - Rr[3].x), ny = (L[3].y - Rr[3].y);
  const sh = ctx.createLinearGradient(sx - nx * 0.6, sy - ny * 0.6, sx + nx * 0.6, sy + ny * 0.6);
  sh.addColorStop(0, 'rgba(0,0,0,0.18)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,240,220,0.12)');
  ctx.fillStyle = sh; ctx.fillRect(Math.min(A.x, D.x) - w[0] * 2, Math.min(A.y, D.y) - w[0], Math.abs(D.x - A.x) + w[0] * 4, Math.abs(D.y - A.y) + w[0] * 2);
  // kresba (skvrny, žíhání) v lokálních souřadnicích článku
  const segP: [P, P][] = [[A, B], [B, Cp], [Cp, D]];
  for (const m of markings ?? []) {
    const [p0, p1] = segP[m.seg], ux = p1.x - p0.x, uy = p1.y - p0.y, ul = Math.hypot(ux, uy) || 1, wseg = (w[m.seg] + w[m.seg + 1]) / 2;
    const cx = p0.x + ux * m.u + (-uy / ul) * m.v * wseg, cy = p0.y + uy * m.u + (ux / ul) * m.v * wseg, r = m.r * (ul / 0.15) * 0.15 * 10;
    ctx.fillStyle = m.color; ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, r), Math.max(1, r * 0.8), Math.atan2(uy, ux), 0, Math.PI * 2); ctx.fill();
  }
  // srst: několik krátkých tahů podél článků (pevně kotvené)
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = Math.max(0.6, w[1] * 0.06); ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) {
    const [p0, p1] = segP[k], u = 0.15 + 0.2 * i + 0.05 * hn(seed, i + k * 7), v = (hn(seed, i * 3 + k) - 0.5) * 0.6, ux = p1.x - p0.x, uy = p1.y - p0.y, ul = Math.hypot(ux, uy) || 1, ww = w[k];
    const cx = p0.x + ux * u + (-uy / ul) * v * ww, cy = p0.y + uy * u + (ux / ul) * v * ww;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (ux / ul) * ww * 0.35, cy + (uy / ul) * ww * 0.35); ctx.stroke();
  }
  ctx.restore();
  // tlapka: měkký objem vpředu od konce nohy, při došlapu zploštělá, v odrazu se odvaluje přes prsty
  const pl = pawSz[0], ph = pawSz[1] * (1 - 0.18 * s.flat), cx = D.x + pl * 0.28, cy = D.y - ph * 0.5;
  ctx.save(); ctx.translate(D.x, D.y); ctx.rotate(s.pawAng); ctx.translate(-D.x, -D.y);
  const pg = ctx.createLinearGradient(0, cy - ph / 2, 0, cy + ph / 2); pg.addColorStop(0, col.lower); pg.addColorStop(1, col.paw);
  ctx.fillStyle = pg; ctx.beginPath();
  ctx.moveTo(D.x - pl * 0.25, D.y - ph * 0.9);
  ctx.bezierCurveTo(D.x + pl * 0.2, D.y - ph * 1.15, cx + pl * 0.55, cy - ph * 0.6, cx + pl * 0.5, D.y - ph * 0.1);
  ctx.quadraticCurveTo(cx + pl * 0.45, D.y + ph * 0.05, cx, D.y);
  ctx.lineTo(D.x - pl * 0.3, D.y); ctx.quadraticCurveTo(D.x - pl * 0.42, D.y - ph * 0.45, D.x - pl * 0.25, D.y - ph * 0.9); ctx.fill();
  ctx.restore();
  if (far) { path(); ctx.fillStyle = 'rgba(20,20,40,0.12)'; ctx.fill(); }
  ctx.restore();
}
