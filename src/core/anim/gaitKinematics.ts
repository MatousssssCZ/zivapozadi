/**
 * Kontaktně řízená poloha chodidel (čisté funkce, sdílí kostra i animátor).
 * Stojná noha: pevný je vždy aktivní kontaktní bod – pata (po došlapu), celá podrážka, pak přednoží.
 * Kotník se dopočítá z kontaktního bodu a natočení tuhé boty: A = kontakt − R(θ)·kontaktLokálně.
 * Švih: tabulková dráha kotníku s plynulou korekcí koncových bodů na skutečné kontakty.
 * Souřadnice: u = vpřed od pánve, h = výška nad zemí (jednotky postavy).
 */
import { gaitEvents, sampleGait, tableStrideLegLen } from './gaitProfile';
import { smoothstep } from '../math/vec';

export interface FootGeom {
  /** délka nohy (stehno + lýtko) */ L: number;
  /** výška kotníku nad podrážkou */ AH: number;
  /** pata za kotníkem */ heel: number;
  /** opěrný bod přednoží před kotníkem */ toe: number;
}
export interface FootState { u: number; h: number; theta: number; contact: 'heel' | 'flat' | 'toe' | 'swing' }

const rot = (x: number, y: number, t: number) => ({ u: x * Math.cos(t) - y * Math.sin(t), h: x * Math.sin(t) + y * Math.cos(t) });
const DEG = Math.PI / 180;

/** Poloha paty při došlapu vůči pánvi (podle tabulky, měřítko podle délky kroku). */
export function heelAtContact(S: number, w: number, g: FootGeom): number {
  const k = S / (tableStrideLegLen(w) * g.L);
  const th0 = sampleGait('footToGroundDeg', 0, w) * DEG;
  return sampleGait('ankleForwardLegLen', 0, w) * g.L * k + rot(-g.heel, -g.AH, th0).u;
}

/**
 * Stojná fáze: kotník z pevného kontaktu. S = délka cyklu (jednotky), w = váha běžného profilu.
 * `heelRel` = skutečná poloha opěrného bodu paty vůči pánvi (ze světové kotvy). Bez ní se odhadne z fáze.
 */
function stance(q: number, S: number, w: number, g: FootGeom, heelRel?: number): FootState {
  const ev = gaitEvents(w);
  const k = S / (tableStrideLegLen(w) * g.L); // poměr naší délky kroku k tabulkové
  const th0 = sampleGait('footToGroundDeg', 0, w) * DEG;
  const uIC = sampleGait('ankleForwardLegLen', 0, w) * g.L * k;
  const heelIC = uIC + rot(-g.heel, -g.AH, th0).u; // pata při došlapu (vůči pánvi)
  // pevný bod na zemi se vůči pánvi posouvá o dráhu těla; se světovou kotvou je poloha přesná i při změně rychlosti
  const heelAt = (p: number) => (heelRel !== undefined ? heelRel : heelIC - p * S);
  if (q < ev.footFlat) {
    const th = sampleGait('footToGroundDeg', q, w) * DEG;
    const r = rot(g.heel, g.AH, th);
    return { u: heelAt(q) + r.u, h: r.h, theta: th, contact: 'heel' };
  }
  if (q < ev.heelRise) return { u: heelAt(q) + g.heel, h: g.AH, theta: 0, contact: 'flat' };
  // přednoží zůstává tam, kde bylo při zvednutí paty (pata + délka boty)
  const toeU = heelRel !== undefined ? heelRel + g.heel + g.toe : heelAt(ev.heelRise) + g.heel + g.toe - (q - ev.heelRise) * S;
  const th = Math.min(0, sampleGait('footToGroundDeg', q, w) * DEG);
  const r = rot(-g.toe, g.AH, th);
  return { u: toeU + r.u, h: r.h, theta: th, contact: 'toe' };
}

/** Poloha kotníku a natočení boty v lokální fázi q (0 = došlap paty). */
export function footAt(q: number, S: number, w: number, g: FootGeom, heelRel?: number): FootState {
  q = ((q % 1) + 1) % 1;
  const ev = gaitEvents(w);
  if (q < ev.toeOff) return stance(q, S, w, g, heelRel);
  // švih: tabulková dráha (měřítko podle délky kroku) + korekce na skutečné koncové kontakty
  const k = S / (tableStrideLegLen(w) * g.L);
  const tab = (p: number) => ({ u: sampleGait('ankleForwardLegLen', p, w) * g.L * k, h: sampleGait('ankleHeightLegLen', p, w) * g.L });
  const a0 = stance(ev.toeOff - 1e-6, S, w, g, heelRel), a1 = stance(0, S, w, g);
  const t0 = tab(ev.toeOff), t1 = tab(1);
  // korekce jen na začátku (odlepení) a na konci (došlap) švihu; střed jde po tabulkové dráze
  const s = (q - ev.toeOff) / (1 - ev.toeOff);
  const eStart = 1 - smoothstep(s / 0.3), eEnd = smoothstep((s - 0.65) / 0.35);
  const t = tab(q);
  return {
    u: t.u + (a0.u - t0.u) * eStart + (a1.u - t1.u) * eEnd,
    h: Math.max(g.AH * 0.6, t.h + (a0.h - t0.h) * eStart + (a1.h - t1.h) * eEnd),
    theta: sampleGait('footToGroundDeg', q, w) * DEG, contact: 'swing',
  };
}

/** Klidové polohy chodidel po zastavení ve fázi `phase`: opřená noha zůstane na místě (pata/špička se jen položí), švihová dokročí vedle ní. */
export function restFeet(phase: number, S: number, w: number, g: FootGeom, heelRel?: [number | null, number | null]): [number, number] {
  const out: number[] = [], contact: boolean[] = [];
  for (let i = 0; i < 2; i++) {
    const f = footAt(phase + i * 0.5, S, w, g, heelRel?.[i] ?? undefined);
    contact.push(f.contact !== 'swing');
    if (f.contact === 'heel') out.push(f.u - rot(g.heel, g.AH, f.theta).u + g.heel); // pata zůstane, špička klesne
    else if (f.contact === 'toe') out.push(f.u - rot(-g.toe, g.AH, f.theta).u - g.toe); // špička zůstane, pata klesne
    else out.push(f.u);
  }
  for (let i = 0; i < 2; i++) if (!contact[i]) out[i] = (contact[1 - i] ? out[1 - i] : 0) - 0.12 * g.L * Math.sign(out[1 - i] || 1);
  // klidný postoj: přední bota zůstane, zadní se přisune k ní (chodidla u sebe, ne „na schodech“)
  const f = out[0] >= out[1] ? 0 : 1, b = 1 - f;
  if (out[f] - out[b] > 0.1 * g.L) out[b] = out[f] - 0.06 * g.L;
  return [out[0], out[1]];
}

/** Počáteční fáze rozejití: noha vpředu se stane stojnou (celá podrážka v místě, kde stojí), zadní vykročí. */
export function startPhase(rest: [number, number], S: number, w: number, g: FootGeom): number {
  const ev = gaitEvents(w);
  const j = rest[1] > rest[0] ? 1 : 0; // vpředu stojící noha zůstane na zemi
  // ve fázi celé podrážky: u = heelIC + heel − q·S
  const flat0 = stance(ev.footFlat, S, w, g).u + ev.footFlat * S; // = heelIC + heel
  const q = Math.min(ev.heelRise - 0.02, Math.max(ev.footFlat, (flat0 - rest[j]) / S));
  return (((q - j * 0.5) % 1) + 1) % 1;
}
