/**
 * Perspektivní kamera scény (pinhole bez náklonu, posunutý hlavní bod – zadání dav/perspektiva A2–A4).
 *
 * Z lineárního měřítka postavy s(y) = a·(y − y_h) (nastavení hloubky scény) plyne horizont y_h a
 * výška kamery h = q / a (q = metry na jednotku postavy). Volné je jen ohnisko f, dané vodorovným
 * zorným úhlem (výchozí 50°). Svět: X doprava, Z od kamery, H výška nad zemí (metry).
 *
 * Jediný zdroj pravdy pro: rychlost po obrazovce, promítnutí kroků, vzdálenosti postav v metrech.
 */
import type { SceneSettings } from '../model/types';
import type { Vec2 } from '../math/vec';

/** Metry na jednu jednotku postavy (postava 130 j. = 1,75 m). */
export const Q = 1.75 / 130;
export const DEFAULT_FOV_DEG = 50;

export interface Camera { f: number; cx: number; yh: number; h: number; a: number; enabled: boolean }
export interface World { X: number; Z: number }

const cache = new WeakMap<object, { key: string; cam: Camera }>();

export function cameraFor(scene: SceneSettings): Camera {
  const d = scene.depth;
  const key = `${d.enabled}|${d.yFar}|${d.scaleFar}|${d.yNear}|${d.scaleNear}|${scene.width}|${scene.fovDeg ?? DEFAULT_FOV_DEG}`;
  const c = cache.get(scene);
  if (c && c.key === key) return c.cam;
  const fov = ((scene.fovDeg ?? DEFAULT_FOV_DEG) * Math.PI) / 180;
  const f = scene.width / 2 / Math.tan(fov / 2);
  let a = d.enabled && d.yNear !== d.yFar ? (d.scaleNear - d.scaleFar) / (d.yNear - d.yFar) : 0;
  let yh: number;
  if (a > 1e-6 && d.scaleFar > 0) yh = d.yFar - d.scaleFar / a;
  else {
    // bez perspektivy (stálé měřítko): kamera velmi daleko – téměř rovnoběžné promítání
    const s = d.enabled ? d.scaleNear : 1;
    yh = -40 * scene.height; a = s / (scene.height - yh);
  }
  const cam: Camera = { f, cx: scene.width / 2, yh, h: Q / a, a, enabled: a > 0 };
  cache.set(scene, { key, cam });
  return cam;
}

/** Bod na zemi (H = 0) pod obrazovým bodem. */
export function toWorld(c: Camera, p: Vec2): World {
  const dy = Math.max(4, p.y - c.yh);
  return { X: (c.h * (p.x - c.cx)) / dy, Z: (c.f * c.h) / dy };
}

/** Obrazový bod světového bodu (výška H nad zemí, metry). */
export function toScreen(c: Camera, w: World, H = 0): Vec2 {
  const Z = Math.max(1e-3, w.Z);
  return { x: c.cx + (c.f * w.X) / Z, y: c.yh + (c.f * (c.h - H)) / Z };
}

/** Měřítko postavy (px na jednotku postavy) v obrazové výšce y – shodné s nastavením hloubky. */
export const scaleAtY = (c: Camera, y: number) => c.a * Math.max(4, y - c.yh);

/** Vzdálenost dvou obrazových bodů na zemi v metrech. */
export function groundDist(c: Camera, p1: Vec2, p2: Vec2): number {
  const a = toWorld(c, p1), b = toWorld(c, p2);
  return Math.hypot(a.X - b.X, a.Z - b.Z);
}

/** Světový směr (úhel, X → cos, Z → sin) obrazového směru v daném místě. */
export function worldAngleOfScreen(c: Camera, p: Vec2, screenAngle: number): number {
  const a = toWorld(c, p), b = toWorld(c, { x: p.x + Math.cos(screenAngle) * 4, y: p.y + Math.sin(screenAngle) * 4 });
  return Math.atan2(b.Z - a.Z, b.X - a.X);
}

/** Obrazový úhel světového směru v daném místě (pro volbu pohledu postavy). */
export function screenAngleOfWorld(c: Camera, p: Vec2, worldAngle: number): number {
  const w = toWorld(c, p);
  const s = toScreen(c, { X: w.X + Math.cos(worldAngle) * 0.05, Z: w.Z + Math.sin(worldAngle) * 0.05 });
  return Math.atan2(s.y - p.y, s.x - p.x);
}

/**
 * Promítnutý krok: posun v obraze při kroku 1 jednotky postavy ve světovém směru, vydělený
 * měřítkem postavy (tj. v lokálních jednotkách postavy). Do strany ≈ (1, 0), do hloubky ≈ (0, −h/Z).
 */
export function groundStepLocal(c: Camera, p: Vec2, worldAngle: number): Vec2 {
  const w = toWorld(c, p), s = scaleAtY(c, p.y), L = Q * 10;
  const e = toScreen(c, { X: w.X + Math.cos(worldAngle) * L, Z: w.Z + Math.sin(worldAngle) * L });
  return { x: (e.x - p.x) / (10 * s), y: (e.y - p.y) / (10 * s) };
}
