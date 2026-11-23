/**
 * Procedurální testovací postava (PROVIZORNÍ vzhled). Póza je čistá funkce stavu animátoru,
 * takže úchopový bod ruky se počítá stejně v simulaci, náhledu i exportu.
 */
import { clamp } from '../math/vec';
import type { AnimState } from './animator';
import type { Direction } from './manifest';
import { skeletonPose, DEFAULT_MOTION, type SkeletonPose, type SkeletonTemplate, type ViewId, type Limb } from './skeleton';
export type { Limb } from './skeleton';

export type BaseDir = 'E' | 'SE' | 'NE';
export type FigurePose = SkeletonPose & { base: BaseDir };

/** Tělesná šablona testovací postavy (sdílí kinematiku se skládanými postavami). */
export const TEST_FIGURE_TEMPLATE: SkeletonTemplate = {
  id: 'test-figure', label: 'Testovací postava', height: 130,
  bones: { thigh: 32, shin: 30, ankleHeight: 2, torso: 40, neck: 13, shoulderDrop: 3, upperArm: 22, forearm: 21 },
  views: {
    side: { forward: { x: 1, y: 0 }, hipSpread: 0, shoulderSpread: 0, headOffsetX: 2, shoulderOffsetX: 1 },
    front3q: { forward: { x: 0.72, y: 0.3 }, hipSpread: 5, shoulderSpread: 9, headOffsetX: 0, shoulderOffsetX: 0 },
    back3q: { forward: { x: 0.72, y: -0.3 }, hipSpread: 5, shoulderSpread: 9, headOffsetX: 0, shoulderOffsetX: 0 },
  },
  gait: { strideLength: 92, stanceFraction: 0.58, stepLift: 7, armSwing: 0.42, maxDip: 2.5, sway: 1.2, lean: 0.03 },
  idle: { breathe: 0.6, headAmp: 0.02, shiftAmp: 1.4, shiftPeriod: 7 },
  proportions: { height: [1, 1], build: [1, 1] },
  motionRanges: { strideScale: [1, 1], armSwing: [1, 1], bob: [1, 1], sway: [1, 1], idleTempo: [1, 1], lean: [1, 1], speed: [1, 1] },
};

const VIEW_OF: Record<BaseDir, ViewId> = { E: 'side', SE: 'front3q', NE: 'back3q' };

export function baseDirFor(dir: Direction): { base: BaseDir; mirror: boolean } {
  switch (dir) {
    case 'E': return { base: 'E', mirror: false };
    case 'W': return { base: 'E', mirror: true };
    case 'SE': case 'S': return { base: 'SE', mirror: false };
    case 'SW': return { base: 'SE', mirror: true };
    case 'NE': case 'N': return { base: 'NE', mirror: false };
    case 'NW': return { base: 'NE', mirror: true };
  }
}

/** Póza v lokálních souřadnicích (chodidla = 0,0; nahoru záporné y), bez zrcadlení. */
export function figurePose(a: AnimState, holding: boolean, mirrorOverride?: { base: BaseDir; mirror: boolean }): FigurePose {
  const { base, mirror } = mirrorOverride ?? baseDirFor(a.dir);
  return { ...skeletonPose(TEST_FIGURE_TEMPLATE, VIEW_OF[base], mirror, a, holding, DEFAULT_MOTION), base };
}

export interface FigurePalette { coat: string; hat: string; scarf: string; skin: string; trousers: string }

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(clamp(((n >> 16) & 255) * f, 0, 255)), g = Math.round(clamp(((n >> 8) & 255) * f, 0, 255)), bb = Math.round(clamp((n & 255) * f, 0, 255));
  return `rgb(${r},${g},${bb})`;
};

/** Vykreslí postavu; kontext je již posunut na chodidla a zvětšen. Zrcadlení řeší volající. */
export function drawFigure(ctx: CanvasRenderingContext2D, pose: FigurePose, pal: FigurePalette, drawHeld?: () => void): void {
  const line = (l: Limb, color: string, w: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(l.root.x, l.root.y); ctx.lineTo(l.joint.x, l.joint.y); ctx.lineTo(l.end.x, l.end.y); ctx.stroke();
  };
  const boot = (l: Limb, color: string) => {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.ellipse(l.end.x + (pose.base === 'E' ? 3 : 0), l.end.y - 1.5, 6, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  };
  const mitten = (l: Limb, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(l.end.x, l.end.y, 3.8, 0, Math.PI * 2); ctx.fill(); };
  const away = pose.base === 'NE';

  if (away) drawHeld?.(); // předmět před postavou je při pohledu zezadu zakrytý tělem
  // zadní končetiny
  line(pose.legs[0], shade(pal.trousers, 0.78), 7.5); boot(pose.legs[0], '#3b2f2f');
  line(pose.arms[0], shade(pal.coat, 0.8), 7); mitten(pose.arms[0], shade(pal.scarf, 0.85));
  // tělo (kabát)
  const s = pose.shoulder, h = pose.hip;
  const wTop = pose.base === 'E' ? 10 : 13, wBot = pose.base === 'E' ? 13 : 16;
  ctx.fillStyle = pal.coat;
  ctx.beginPath();
  ctx.moveTo(s.x - wTop, s.y + 2); ctx.quadraticCurveTo(s.x, s.y - 4, s.x + wTop, s.y + 2);
  ctx.lineTo(h.x + wBot, h.y + 18); ctx.quadraticCurveTo(h.x, h.y + 21, h.x - wBot, h.y + 18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(pal.coat, 0.86);
  ctx.fillRect(h.x - wBot + 1, h.y + 4, wBot * 2 - 2, 3); // pásek
  // přední noha
  line(pose.legs[1], pal.trousers, 7.5); boot(pose.legs[1], '#2e2424');
  // šála
  ctx.fillStyle = pal.scarf;
  ctx.beginPath(); ctx.ellipse(s.x, s.y - 1, wTop - 1, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  if (!away) { ctx.fillRect(s.x + (pose.base === 'E' ? -1 : 3), s.y, 5, 14); }
  // hlava
  ctx.save(); ctx.translate(pose.head.x, pose.head.y); ctx.rotate(pose.headTilt);
  ctx.fillStyle = pal.skin; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  if (pose.base === 'SE') {
    ctx.fillStyle = '#3a2a2a'; ctx.beginPath(); ctx.arc(1, 1, 1.5, 0, Math.PI * 2); ctx.arc(7, 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(230,120,120,0.45)'; ctx.beginPath(); ctx.arc(9, 6, 2.6, 0, Math.PI * 2); ctx.fill();
  } else if (pose.base === 'E') {
    ctx.fillStyle = '#3a2a2a'; ctx.beginPath(); ctx.arc(6, 0, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(pal.skin, 0.9); ctx.beginPath(); ctx.arc(12, 3, 2.4, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#6b4a3a'; ctx.beginPath(); ctx.arc(0, 2, 11.5, 0, Math.PI); ctx.fill(); // vlasy zezadu
  }
  // čepice s bambulí
  ctx.fillStyle = pal.hat;
  ctx.beginPath(); ctx.arc(0, -2, 12.6, Math.PI, 0); ctx.lineTo(12.6, -1); ctx.lineTo(-12.6, -1); ctx.fill();
  ctx.fillStyle = shade(pal.hat, 0.8); ctx.fillRect(-13, -4, 26, 4.5);
  ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.arc(0, -16, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // přední paže (drží předměty)
  line(pose.arms[1], pal.coat, 7);
  if (!away) drawHeld?.();
  mitten(pose.arms[1], pal.scarf);
}
