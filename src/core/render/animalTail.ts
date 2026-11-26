/**
 * Vektorové ocasy psů a koček. Ocas je řetěz N článků od kořene (pod siluetou trupu) ke špičce;
 * úhel článku = nesení podle plemene (+ zahnutí ke špičce, − průvěs) + vlna, která běží od kořene
 * ke špičce se zpožděním (špička dobíhá). Pes: vrtění (rychlejší při vzrušení / setřesení), v chůzi
 * pohupování v rytmu kroku. Kočka: pomalé esovité vlnění, občas švihnutí špičkou. Kreslí se jako
 * jeden měkký obrys (šířka podél délky, u huňatých plemen nejširší v polovině), stínování po délce,
 * chlupy na okraji (nepohyblivé vůči ocasu – neblikají) a kresba plemene (bílá špička, skvrny,
 * kroužky). Délky a šířky jsou v metrech; vše deterministické (funkce času a fáze kroku).
 */
type Ctx = CanvasRenderingContext2D;
export interface TailProfile {
  /** nesení u kořene (rad, 0 = vodorovně dozadu, + = nahoru), zahnutí na článek, průvěs ke špičce */ base: number; curl: number; droop: number;
  /** šířka u kořene, max. a u špičky (podíl délky); poloha nejširšího místa (0–1) */ w0: number; wMax: number; w1: number; wAt: number;
  /** huňatost (chlupy na okraji 0–1), barvy kořen → střed → špička, podíl bílé špičky */ bush: number; colors: [string, string, string]; tip?: { color: string; frac: number };
  /** kresba: skvrny (dalmatin) / kroužky (mourek, mainská) */ spots?: string; rings?: string;
  /** vrtění: amplituda (rad), frekvence klidu / vzrušení (Hz) */ wag: number; wagHz: [number, number];
}
const P = (o: Partial<TailProfile> & Pick<TailProfile, 'colors'>): TailProfile => ({ base: 0.3, curl: 0.06, droop: 0.2, w0: 0.1, wMax: 0.12, w1: 0.035, wAt: 0.3, bush: 0.3, wag: 0.22, wagHz: [1.6, 3.6], ...o });
export const TAILS: Record<string, TailProfile> = {
  dog_collie: P({ base: -1.05, curl: 0.13, droop: 0.05, w0: 0.11, wMax: 0.2, w1: 0.06, wAt: 0.55, bush: 1, colors: ['#2a2a30', '#2f2f36', '#3a3a42'], tip: { color: '#f2eee6', frac: 0.3 }, wag: 0.16 }),
  dog_bernese: P({ base: -1.1, curl: 0.1, droop: 0.05, w0: 0.12, wMax: 0.19, w1: 0.07, wAt: 0.5, bush: 0.9, colors: ['#1f1d20', '#25221f', '#2b2724'], tip: { color: '#f0ebe2', frac: 0.12 }, wag: 0.14 }),
  dog_husky: P({ base: 1.25, curl: 0.3, droop: 0, w0: 0.12, wMax: 0.2, w1: 0.08, wAt: 0.45, bush: 0.9, colors: ['#6d7079', '#7a7d86', '#8a8c94'], tip: { color: '#e9e8ea', frac: 0.18 }, wag: 0.1 }),
  dog_small: P({ base: 0.9, curl: 0.06, droop: 0.05, w0: 0.16, wMax: 0.16, w1: 0.06, wAt: 0.1, bush: 0, colors: ['#f1ece4', '#efe9e1', '#ebe4dc'], wag: 0.3, wagHz: [2.2, 5] }),
  dog_retriever: P({ base: -0.55, curl: 0.12, droop: 0.15, w0: 0.1, wMax: 0.2, w1: 0.06, wAt: 0.45, bush: 0.9, colors: ['#d6a660', '#ddb06c', '#e6c48c'], wag: 0.2 }),
  dog_shepherd: P({ base: -1.15, curl: 0.13, droop: 0.05, w0: 0.11, wMax: 0.19, w1: 0.07, wAt: 0.5, bush: 0.8, colors: ['#3a302a', '#4a3c32', '#2a2420'], wag: 0.12 }),
  dog_dalmatian: P({ base: 0.12, curl: 0.05, droop: 0.25, w0: 0.13, wMax: 0.13, w1: 0.04, wAt: 0.1, bush: 0, colors: ['#f2f0ec', '#efedea', '#e9e7e3'], spots: '#1d1d1f', wag: 0.26 }),
  dog_dachshund: P({ base: -0.05, curl: 0.04, droop: 0.2, w0: 0.13, wMax: 0.13, w1: 0.04, wAt: 0.1, bush: 0.05, colors: ['#8a3f1c', '#93461f', '#7c391a'], wag: 0.24 }),
  dog_frenchie: P({ base: -0.5, curl: 0.5, droop: 0, w0: 0.35, wMax: 0.35, w1: 0.22, wAt: 0.1, bush: 0, colors: ['#c99b63', '#c4955e', '#b9895a'], wag: 0.12, wagHz: [2.5, 5] }),
  dog: P({ base: 0.9, curl: 0.1, droop: 0.05, w0: 0.1, wMax: 0.11, w1: 0.04, wAt: 0.25, bush: 0.35, colors: ['#9c6a3a', '#a8774a', '#b88b5c'], tip: { color: '#f3eee6', frac: 0.28 } }),
  cat_british: P({ base: -0.5, curl: 0.19, droop: 0.05, w0: 0.16, wMax: 0.17, w1: 0.11, wAt: 0.2, bush: 0.35, colors: ['#6e7486', '#737a8c', '#6a7082'], wag: 0.2, wagHz: [0.45, 0.9] }),
  cat_mainecoon: P({ base: -0.4, curl: 0.17, droop: 0.05, w0: 0.14, wMax: 0.22, w1: 0.1, wAt: 0.55, bush: 1, colors: ['#c97a3e', '#d98d4f', '#cf8247'], rings: '#a2582a', tip: { color: '#e6b07a', frac: 0.1 }, wag: 0.2, wagHz: [0.4, 0.85] }),
  cat: P({ base: -0.5, curl: 0.2, droop: 0.05, w0: 0.1, wMax: 0.1, w1: 0.06, wAt: 0.2, bush: 0.25, colors: ['#8d7b66', '#958470', '#7f6e5b'], rings: '#4e4337', tip: { color: '#4e4337', frac: 0.12 }, wag: 0.22, wagHz: [0.45, 0.9] }),
};
export const tailProfileOf = (breed: string | undefined, species: 'dog' | 'cat') => TAILS[breed ?? ''] ?? TAILS[species];

const rnd = (s: number) => { const x = Math.sin(s * 91.7) * 43758.5453; return x - Math.floor(x); };
const mix = (a: string, b: string, k: number) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), f = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); return `rgb(${f(16)},${f(8)},${f(0)})`; };

/**
 * Nakreslí ocas. Kořen v (rx, ry) lokálních px zvířete (hlava míří +x), `len` délka (px), `t` čas,
 * `walk` 0–1, `ph` fáze kroku (0–1), `excite` 0–1 (vzrušení / setřesení), `away` = pohled zezadu
 * (ocas míří k divákovi – zkrácený).
 */
export function drawVectorTail(ctx: Ctx, pr: TailProfile, species: 'dog' | 'cat', rx: number, ry: number, len: number, t: number, walk: number, ph: number, excite: number, away: boolean, seed = 1) {
  const N = 10, segL = (len * (away ? 0.6 : 1)) / N;
  const dog = species === 'dog';
  // vlna: pes – vrtění do stran (v profilu jako kmitání nahoru/dolů u kořene malé, u špičky větší),
  // kočka – pomalé esovité vlnění + občasné švihnutí špičkou
  const hz = pr.wagHz[0] + (pr.wagHz[1] - pr.wagHz[0]) * Math.max(excite, dog ? walk * 0.4 : 0);
  const mood = 0.5 + 0.5 * Math.sin(t * 0.13 + seed * 1.7) * Math.sin(t * 0.071 + seed * 0.3); // pomalá proměnlivost
  const amp = pr.wag * (dog ? Math.max(excite, 0.15 + 0.85 * mood * mood) : 0.4 + 0.6 * mood);
  const flick = dog ? 0 : Math.max(0, Math.sin(t * 0.37 + seed) - 0.85) * 4; // kočka: krátké švihnutí jednou za čas
  const pts: { x: number; y: number }[] = [{ x: rx, y: ry }];
  let a = pr.base + (away ? 0.5 : 0) - walk * (dog ? 0.08 : 0.12); // v chůzi nesen o kus níž
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    const wave = amp * Math.sin(2 * Math.PI * hz * t - u * (dog ? 1.4 : 3.2)) * (0.25 + 0.75 * u) + walk * 0.1 * Math.sin(2 * Math.PI * (ph * 2) - u * 1.6) * u;
    a += pr.curl + wave / N * 2.2 - pr.droop * u * 0.25 + (u > 0.7 ? flick * 0.15 : 0);
    const p = pts[i - 1];
    pts.push({ x: p.x - Math.cos(a) * segL, y: p.y - Math.sin(a) * segL });
  }
  // šířka po délce (podíl délky): kořen → maximum → špička (zaoblená)
  const W = (u: number) => len * (u < pr.wAt ? pr.w0 + (pr.wMax - pr.w0) * Math.sin((u / Math.max(pr.wAt, 1e-3)) * Math.PI / 2) : pr.wMax + (pr.w1 - pr.wMax) * ((u - pr.wAt) / (1 - pr.wAt)) ** 1.3) * 0.5;
  // hustší osa (Catmull-Rom) → hladký obrys bez zlomů
  const M = 48, C: { x: number; y: number }[] = [], T: { x: number; y: number }[] = [];
  for (let k = 0; k <= M; k++) {
    const f = (k / M) * N, i = Math.min(N - 1, Math.floor(f)), q = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(N, i + 2)];
    const cr = (a0: number, a1: number, a2: number, a3: number) => 0.5 * (2 * a1 + (-a0 + a2) * q + (2 * a0 - 5 * a1 + 4 * a2 - a3) * q * q + (-a0 + 3 * a1 - 3 * a2 + a3) * q * q * q);
    C.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
  }
  for (let k = 0; k <= M; k++) { const a0 = C[Math.max(0, k - 1)], b0 = C[Math.min(M, k + 1)], tl = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1; T.push({ x: (b0.x - a0.x) / tl, y: (b0.y - a0.y) / tl }); }
  // okraj: huňatá plemena mají chomáče (výběžky skloněné ke špičce), hladká jen mírné zvlnění
  const tufts = 6 + Math.round(pr.bush * 4);
  const edge = (sgn: number) => {
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k <= M; k++) {
      const u = k / M, w = W(u), ph0 = ((u * tufts + (sgn > 0 ? 0 : 0.5) + rnd(seed + sgn) * 0.3 + 0.35 * Math.sin(u * 9 + seed + sgn)) % 1 + 1) % 1;
      const tuft = pr.bush * Math.pow(Math.sin(Math.PI * ph0), 2) * (0.55 + 0.45 * rnd(seed * 5 + Math.floor(u * tufts) * 3 + sgn)) * Math.min(1, u * 4) * (1 - u * 0.4);
      const ww = w * (1 + 0.2 * tuft), sl = w * 0.35 * tuft; // chomáč se stáčí ke špičce
      out.push({ x: C[k].x - T[k].y * ww * sgn + T[k].x * sl, y: C[k].y + T[k].x * ww * sgn + T[k].y * sl });
    }
    return out;
  };
  const L = edge(1), R = edge(-1);
  const tdir = T[M], cap = { x: C[M].x + tdir.x * W(1) * 1.15, y: C[M].y + tdir.y * W(1) * 1.15 };
  const outline = () => {
    ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y);
    for (let k = 1; k <= M; k++) ctx.lineTo(L[k].x, L[k].y);
    ctx.bezierCurveTo(L[M].x + tdir.x * W(1) * 1.4, L[M].y + tdir.y * W(1) * 1.4, R[M].x + tdir.x * W(1) * 1.4, R[M].y + tdir.y * W(1) * 1.4, R[M].x, R[M].y);
    for (let k = M - 1; k >= 0; k--) ctx.lineTo(R[k].x, R[k].y);
    ctx.closePath();
  };
  ctx.save(); ctx.lineJoin = 'round';
  // výplň: barvy po délce (kořen → špička), bílá špička
  const g = ctx.createLinearGradient(C[0].x, C[0].y, cap.x, cap.y);
  g.addColorStop(0, pr.colors[0]); g.addColorStop(0.5, pr.colors[1]);
  if (pr.tip) { g.addColorStop(Math.max(0.5, 1 - pr.tip.frac - 0.1), pr.colors[2]); g.addColorStop(1 - pr.tip.frac + 0.05, pr.tip.color); g.addColorStop(1, pr.tip.color); } else g.addColorStop(1, pr.colors[2]);
  ctx.fillStyle = g; outline(); ctx.fill();
  ctx.save(); outline(); ctx.clip(); ctx.lineCap = 'round';
  // objem: spodní polovina tmavší, světlý lesk podél horní třetiny
  const band = (off: number, wk: number, col: string) => { ctx.strokeStyle = col; ctx.beginPath(); for (let k = 0; k <= M; k++) { const w = W(k / M), x = C[k].x - T[k].y * w * off, y = C[k].y + T[k].x * w * off; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.lineWidth = Math.max(1, W(0.4) * wk); ctx.stroke(); };
  band(-0.8, 0.9, 'rgba(0,0,0,0.16)'); band(0.45, 0.35, 'rgba(255,255,255,0.13)');
  // kroužky (mourek, mainská) – měkké pruhy kolmo na osu, drží na místě ocasu
  if (pr.rings) {
    ctx.strokeStyle = pr.rings; ctx.globalAlpha = 0.22;
    for (const u of [0.28, 0.44, 0.58, 0.71, 0.82, 0.92]) { const k = Math.round(u * M), w = W(u) * 1.4; ctx.lineWidth = Math.max(1, W(u) * 0.38); ctx.beginPath(); ctx.moveTo(C[k].x - T[k].y * w + T[k].x * w * 0.2, C[k].y + T[k].x * w + T[k].y * w * 0.2); ctx.quadraticCurveTo(C[k].x - T[k].x * w * 0.15, C[k].y - T[k].y * w * 0.15, C[k].x + T[k].y * w + T[k].x * w * 0.2, C[k].y - T[k].x * w + T[k].y * w * 0.2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  // skvrny (dalmatin) – malé, nepravidelně rozházené
  if (pr.spots) { ctx.fillStyle = pr.spots; for (let n = 0; n < 6; n++) { const u = 0.1 + 0.14 * n + rnd(seed + n * 11) * 0.05, k = Math.round(u * M), s = (rnd(seed + n) - 0.5) * 1.3 * W(u), r = W(u) * (0.45 + 0.25 * rnd(seed * 2 + n)); ctx.beginPath(); ctx.ellipse(C[k].x - T[k].y * s, C[k].y + T[k].x * s, r * 1.2, r * 0.85, Math.atan2(T[k].y, T[k].x), 0, Math.PI * 2); ctx.fill(); } }
  // srst: jemné tahy podél osy (světlé i tmavé), pevně svázané s ocasem
  const strands = 8 + Math.round(pr.bush * 10);
  ctx.lineWidth = Math.max(0.5, len * 0.007);
  for (let n = 0; n < strands; n++) {
    const off = (rnd(seed * 7 + n) - 0.5) * 1.8, u0 = rnd(seed * 13 + n) * 0.8, du = 0.12 + 0.1 * rnd(n + 3);
    ctx.strokeStyle = n % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.13)';
    ctx.beginPath();
    for (let k = Math.round(u0 * M); k <= Math.min(M, Math.round((u0 + du) * M)); k++) { const w = W(k / M) * (1 + 0.3 * pr.bush), x = C[k].x - T[k].y * w * off, y = C[k].y + T[k].x * w * off; k === Math.round(u0 * M) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
  // jemná kontura (odliší ocas od trupu stejné barvy)
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = Math.max(0.6, len * 0.006); outline(); ctx.stroke();
  ctx.restore();
}
