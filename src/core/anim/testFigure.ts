/**
 * Procedurální testovací postava (PROVIZORNÍ vzhled). Póza je čistá funkce stavu animátoru,
 * takže úchopový bod ruky se počítá stejně v simulaci, náhledu i exportu.
 */
import type { Vec2 } from '../math/vec';
import { clamp, smoothstep } from '../math/vec';
import type { AnimState } from './animator';
import type { Direction } from './manifest';

export type BaseDir = 'E' | 'SE' | 'NE';

export interface FigurePose {
  base: BaseDir;
  mirror: boolean;
  hip: Vec2; shoulder: Vec2; head: Vec2; headTilt: number;
  legs: [Limb, Limb]; // [zadní, přední]
  arms: [Limb, Limb]; // [zadní (levá), přední (pravá – drží předměty)]
  handR: Vec2;
}
export interface Limb { root: Vec2; joint: Vec2; end: Vec2 }

const THIGH = 32, SHIN = 30, UPPER = 22, FORE = 21;

function ik(root: Vec2, target: Vec2, l1: number, l2: number, bendSign: number): Limb {
  const dx = target.x - root.x, dy = target.y - root.y;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.01;
  let tx = target.x, ty = target.y;
  if (d > maxD) { tx = root.x + (dx / d) * maxD; ty = root.y + (dy / d) * maxD; d = maxD; }
  const a = Math.atan2(ty - root.y, tx - root.x);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * Math.max(d, 1e-6)), -1, 1);
  const ang = a + bendSign * Math.acos(cosA);
  const joint = { x: root.x + Math.cos(ang) * l1, y: root.y + Math.sin(ang) * l1 };
  return { root, joint, end: { x: tx, y: ty } };
}

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
  const ph = a.walkPhase * Math.PI * 2;
  const b = a.walkBlend;
  const breathe = Math.sin((a.idleTime / 3.2) * Math.PI * 2) * 0.8 * (1 - b);
  const bob = Math.abs(Math.sin(ph)) * 2.6 * b;
  const hip = { x: 0, y: -62 + bob };
  const shoulder = { x: base === 'E' ? 1.5 * b : 0, y: -100 + bob + breathe * 0.5 };
  const head = { x: shoulder.x + (base === 'E' ? 2 : 0), y: -117 + bob + breathe * 0.4 };
  let headTilt = 0;

  // Nohy: kyvadlo s ohybem kolena při švihu vpřed.
  const forward = base === 'E' ? { x: 1, y: 0 } : base === 'SE' ? { x: 0.72, y: 0.3 } : { x: 0.72, y: -0.3 };
  const spread = base === 'E' ? 0 : 5;
  const amp = 0.37 * b;
  const legFor = (sign: number, side: number): Limb => {
    const s = Math.sin(ph) * sign;
    const swingDist = Math.sin(amp * s) * (THIGH + SHIN);
    const lift = Math.max(0, Math.cos(ph) * sign) * 7 * b; // zvednutí nohy při přenosu vpřed
    const root = { x: hip.x + side * spread, y: hip.y };
    const foot = { x: root.x + forward.x * swingDist, y: -lift + forward.y * swingDist * 0.5 };
    return ik(root, foot, THIGH, SHIN, base === 'NE' ? -1 : -1);
  };
  const legs: [Limb, Limb] = [legFor(-1, -1), legFor(1, 1)];

  // Paže: protipohyb k nohám; přední (pravá) může držet předmět nebo hrát akci.
  const armSwing = (sign: number) => Math.sin(ph) * sign * 0.5 * b;
  const armRoot = (side: number) => ({ x: shoulder.x + side * (base === 'E' ? 0 : 9), y: shoulder.y + 3 });
  const swingTarget = (root: Vec2, ang: number): Vec2 => ({
    x: root.x + Math.sin(ang) * (UPPER + FORE - 3) * forward.x + (base === 'E' ? 0 : root.x > 0 ? 2 : -2),
    y: root.y + Math.cos(ang) * (UPPER + FORE - 3) + Math.sin(ang) * forward.y * 6,
  });
  const backRoot = armRoot(-1), frontRoot = armRoot(1);
  let backTarget = swingTarget(backRoot, armSwing(1));
  const holdPos = { x: frontRoot.x + 13 * forward.x + (base === 'E' ? 0 : 3), y: -66 + bob };
  let frontTarget = holding ? holdPos : swingTarget(frontRoot, armSwing(-1));

  const act = a.action;
  if (act && act.clip !== null) {
    const t = act.duration > 0 ? act.time / act.duration : 1;
    const fx = forward.x;
    switch (act.clip) {
      case 'talk': {
        const g = Math.sin((act.time / 0.7) * Math.PI * 2);
        backTarget = { x: backRoot.x + 12 * fx, y: -78 + g * 5 };
        headTilt = g * 0.05;
        break;
      }
      case 'receive': {
        const reach = { x: frontRoot.x + 30 * fx, y: -80 + bob };
        const k = t < 0.55 ? smoothstep(t / 0.55) : 1 - smoothstep((t - 0.55) / 0.45);
        const rest = holding ? holdPos : swingTarget(frontRoot, 0);
        frontTarget = { x: rest.x + (reach.x - rest.x) * k, y: rest.y + (reach.y - rest.y) * k };
        break;
      }
      case 'drink': {
        const mouth = { x: head.x + 9 * fx + (base === 'E' ? 4 : 0), y: head.y + 7 };
        const k = t < 0.32 ? smoothstep(t / 0.32) : t < 0.62 ? 1 : 1 - smoothstep((t - 0.62) / 0.38);
        frontTarget = { x: holdPos.x + (mouth.x - holdPos.x) * k, y: holdPos.y + (mouth.y - holdPos.y) * k };
        headTilt = -0.12 * k;
        break;
      }
      case 'drop': {
        const down = { x: frontRoot.x + 26 * fx, y: -54 };
        const k = t < 0.5 ? smoothstep(t / 0.5) : 1 - smoothstep((t - 0.5) / 0.5);
        const rest = holding ? holdPos : swingTarget(frontRoot, 0);
        frontTarget = { x: rest.x + (down.x - rest.x) * k, y: rest.y + (down.y - rest.y) * k };
        break;
      }
    }
  }
  const arms: [Limb, Limb] = [ik(backRoot, backTarget, UPPER, FORE, 1), ik(frontRoot, frontTarget, UPPER, FORE, 1)];
  return { base, mirror, hip, shoulder, head, headTilt, legs, arms, handR: arms[1].end };
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
