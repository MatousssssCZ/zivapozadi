/**
 * Anatomický profil vektorové postavy (oddělený od kostry, oblečení i pohybu).
 * Rozměry jsou v jednotkách postavy (výška dospělé šablony 130 j ≈ 1,75 m → 1 j ≈ 1,35 cm).
 * Variabilita: výška, šířka ramen, objem trupu, poměr nohou k tělu, velikost hlavy – vybírané
 * ve slučitelných kombinacích (širší ramena ↔ větší objem, dítě má vlastní proporce, ne zmenšeného dospělého).
 */
import type { SkeletonTemplate } from '../anim/skeleton';

export type AgeGroup = 'adult' | 'child' | 'senior';
export interface BodyProfile {
  age: AgeGroup;
  /** násobek výšky šablony */ height: number;
  /** poloviční šířky (j): krk, ramena (kloub), hrudník, pas, boky */ neckR: number; shoulder: number; chest: number; waist: number; hips: number;
  /** hloubka hrudníku/zadku v pohledu 3/4 (j) – vyklenutí vpřed / vzad */ chestDepth: number; seatDepth: number;
  /** končetiny – šířky (j): stehno, koleno, lýtko, kotník, paže, loket, zápěstí */ thighW: number; kneeW: number; calfW: number; ankleW: number; armW: number; elbowW: number; wristW: number;
  /** hlava: poloměr lebky, poměr výšky obličeje */ headR: number; jaw: number;
  /** poměr délky nohou (násobek kostí nohy) */ legRatio: number;
  /** ruka: délka dlaně (j) */ hand: number;
  /** barva kůže a líček */ skin: string; blush: string;
}

const SKINS = ['#f1cdb3', '#e8bc9c', '#d9a582', '#c48b68', '#a8704f', '#f4d6c1'];
const h = (seed: number, k: number) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };

/** Profil ze stabilního seedu: koordinované rozměry (jedna „stavba“ řídí ramena, objem i končetiny). */
export function bodyOf(seed: number, age: AgeGroup): BodyProfile {
  const r = (k: number) => h(seed, k);
  const build = r(1) * 2 - 1; // −1 štíhlý … +1 robustní
  const fem = r(2) < 0.5; // stavba spíše úzká v ramenou / širší v bocích
  const skin = SKINS[Math.floor(r(3) * SKINS.length) % SKINS.length];
  if (age === 'child') {
    // dítě: relativně velká hlava, kratší nohy, oblé tělo bez pasu
    return {
      age, height: 0.95 + r(4) * 0.1, neckR: 2.1, shoulder: 6.2 + build * 0.4, chest: 7.4 + build * 0.6, waist: 7.4 + build * 0.6, hips: 7.2 + build * 0.5,
      chestDepth: 1.2, seatDepth: 1.4, thighW: 8.6 + build * 0.6, kneeW: 6.6, calfW: 6.6, ankleW: 4.4, armW: 5.2, elbowW: 4.4, wristW: 3.4,
      headR: 8.3 + r(5) * 0.5, jaw: 0.9, legRatio: 1, hand: 4.6, skin, blush: '#e98d82',
    };
  }
  const senior = age === 'senior';
  return {
    age, height: 0.95 + r(4) * 0.1 - (senior ? 0.02 : 0), neckR: 2.6 + build * 0.25,
    shoulder: (fem ? 9.2 : 10.2) + build * 0.8, chest: (fem ? 9.6 : 10.6) + build * 1.1, waist: (fem ? 7.8 : 9.0) + build * 1.4 + (senior ? 0.8 : 0), hips: (fem ? 10.0 : 9.4) + build * 0.9,
    chestDepth: (fem ? 2.0 : 1.6) + build * 0.5, seatDepth: (fem ? 2.2 : 1.6) + build * 0.4,
    thighW: (fem ? 12.0 : 12.4) + build * 1.2, kneeW: 8.2 + build * 0.5, calfW: 8.6 + build * 0.7, ankleW: 5.0, armW: 6.6 + build * 0.6, elbowW: 5.2 + build * 0.3, wristW: 3.9,
    headR: 8.4 + r(5) * 0.6 - build * 0.1, jaw: fem ? 0.86 : 0.96, legRatio: 0.97 + r(6) * 0.06, hand: 6.2, skin, blush: senior ? '#d99088' : '#e9998c',
  };
}

/** Kostra podle profilu: výška a poměr nohou mění délky kostí (aktivity počítají v délkách nohou). */
export function templateFor(base: SkeletonTemplate, b: BodyProfile): SkeletonTemplate {
  const k = b.height, lr = b.legRatio, B = base.bones;
  const legK = k * lr, bodyK = k * (2 - lr); // delší nohy → mírně kratší trup (celková výška zůstane)
  return {
    ...base,
    height: base.height * k,
    bones: { ...B, thigh: B.thigh * legK, shin: B.shin * legK, ankleHeight: B.ankleHeight * k, torso: B.torso * bodyK, neck: B.neck * k, shoulderDrop: B.shoulderDrop * k, upperArm: B.upperArm * k, forearm: B.forearm * k },
    gait: { ...base.gait, strideLength: base.gait.strideLength * legK },
    foot: base.foot ? { heel: base.foot.heel * k, toe: base.foot.toe * k } : base.foot,
  };
}
