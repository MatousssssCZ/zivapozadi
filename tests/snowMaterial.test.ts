import { describe, it, expect } from 'vitest';
import { createSnow, sweep, scoop, release, stepAir, dropRidge, total, stocks, heightAt, deposit, remainingIn, baseMass, DEFAULT_SNOW, type SnowState } from '../src/core/sim/snowMaterial';

/** Materiálový model odklízení – podmínky A–D, F, G zadání (čistý model bez postavy). */
const work = { x0: 0, x1: 2.4, z0: 0, z1: 0.8 }, pile = { x0: 2.6, x1: 3.2, z0: -0.4, z1: 0.2 };
const fwd = { X: 1, Z: 0 };
const edgeAt = (x: number, z = 0.2) => ({ A: { X: x, Z: z - 0.2 }, B: { X: x, Z: z + 0.2 } });
/** hrnutí hranou z x0 do x1 po krocích dx */
function push(s: SnowState, x0: number, x1: number, dx: number, z = 0.2) {
  s.edge = edgeAt(x0, z);
  for (let x = x0 + dx; x <= x1 + 1e-9; x += dx) { const e = edgeAt(Math.min(x, x1), z); sweep(s, e.A, e.B, fwd); }
}

describe('sníh – materiálový model', () => {
  it('A: záběr do nedotčeného sněhu – vznikne stopa, přibude val, povrch ztratí odpovídající množství', () => {
    const s = createSnow(work, pile), t0 = total(s), sur0 = stocks(s).surface;
    push(s, 0.2, 0.9, 0.02);
    // 0,4 m × 0,7 m × 0,04 m × 200 kg/m³ = 2,24 kg (minus film 4 %)
    const exp = 0.4 * 0.7 * 0.04 * 200 * (1 - DEFAULT_SNOW.residue);
    const st = stocks(s);
    expect(st.ridge + (s.moved.spilled)).toBeGreaterThan(exp * 0.85);
    expect(st.ridge + s.moved.spilled).toBeLessThan(exp * 1.15);
    expect(sur0 - st.surface).toBeCloseTo(s.moved.swept - 0, 6);
    expect(Math.abs(total(s) - t0)).toBeLessThan(1e-9);
    // stopa: buňky uprostřed projeté dráhy mají jen film
    expect(heightAt(s, 0.5, 0.2)).toBeLessThan(DEFAULT_SNOW.depth * 0.1);
    expect(heightAt(s, 0.5, 0.6)).toBeCloseTo(DEFAULT_SNOW.depth, 5); // vedle stopy nedotčeno
  });

  it('B: opakovaný záběr stejným místem přesune jen zbytek, z prázdné dlažby nic nevznikne', () => {
    const s = createSnow(work, pile);
    push(s, 0.2, 0.9, 0.02); dropRidge(s, fwd);
    const first = s.moved.swept;
    push(s, 0.2, 0.9, 0.02);
    const second = s.moved.swept - first;
    expect(second).toBeLessThan(first * 0.2); // jen val, který zůstal na konci, a okraje buněk
    dropRidge(s, fwd);
    push(s, 0.2, 0.8, 0.02); // dráha bez valu: jen film zůstává
    const third = s.moved.swept - first - second;
    expect(third).toBeLessThan(0.05);
  });

  it('zpětný pohyb ani stání lopatou nic nepřesune', () => {
    const s = createSnow(work, pile);
    s.edge = edgeAt(1.0);
    const e = edgeAt(0.7); sweep(s, e.A, e.B, fwd);
    const e2 = edgeAt(0.7); sweep(s, e2.A, e2.B, fwd);
    expect(s.moved.swept).toBe(0);
  });

  it('C: z velkého valu přejde na list jen množství podle kapacity listu', () => {
    const s = createSnow(work, pile);
    s.ridge = 6;
    const took = scoop(s);
    const cap = Math.min(DEFAULT_SNOW.bladeVolume * DEFAULT_SNOW.ridgeDensity, DEFAULT_SNOW.massLimit);
    expect(took).toBeCloseTo(cap, 9);
    expect(s.ridge).toBeCloseTo(6 - cap, 9);
    expect(scoop(s)).toBe(0); // plný list už nic nenabere
  });

  it('D: odhoz na existující hromadu – dopad na její povrch, materiál přetrvá, uloží se právě jednou', () => {
    const s = createSnow(work, pile);
    deposit(s, 2.9, -0.1, 8, 0.15); // existující hromada
    const h0 = heightAt(s, 2.9, -0.1);
    expect(h0).toBeGreaterThan(0.1);
    s.blade = 2;
    const t0 = total(s);
    const thrown = release(s, { X: 2.2, Z: 0.1, H: 0.6 }, { X: 1.4, Z: -0.4, H: 1.0 }, 0, 7);
    expect(thrown).toBeCloseTo(2 * (1 - DEFAULT_SNOW.adhesion), 9);
    let minH = Infinity, landed = 0;
    for (let k = 1; k < 300 && s.air.length; k++) {
      for (const c of s.air) { const u = k / 60 - c.t0, H = c.H + c.vH * u - 4.905 * u * u; minH = Math.min(minH, H); }
      landed += stepAir(s, k / 60);
      expect(Math.abs(total(s) - t0)).toBeLessThan(1e-9);
    }
    expect(s.air.length).toBe(0);
    expect(landed).toBeCloseTo(thrown, 9);
    expect(minH).toBeGreaterThan(0.02); // dopad na povrch hromady, ne na dlažbu pod ní
    expect(heightAt(s, 2.9, -0.1)).toBeGreaterThan(h0 * 0.9); // hromada přetrvala (sesedá, nezmizí)
    expect(s.blade).toBeCloseTo(2 * DEFAULT_SNOW.adhesion, 9); // přilnavý zbytek na listu
  });

  it('F: výsledek hrnutí nezávisí na velikosti kroku (60 Hz, 15 Hz, jeden velký výpadek)', () => {
    const run = (dx: number) => { const s = createSnow(work, pile); push(s, 0.2, 1.0, dx); return s.moved.swept + 0; };
    const a = run(0.8 / 48), b = run(0.8 / 12), c = run(0.8);
    expect(Math.abs(a - b) / a).toBeLessThan(0.03);
    expect(Math.abs(a - c) / a).toBeLessThan(0.05);
  });

  it('G: bilance – součet všech zásob se zachovává v celém řetězci', () => {
    const s = createSnow(work, pile), t0 = total(s);
    push(s, 0.1, 1.2, 0.02);
    scoop(s);
    release(s, { X: 1.3, Z: 0.2, H: 0.6 }, { X: 1.6, Z: -0.3, H: 1.2 }, 0, 3);
    for (let k = 1; k < 200; k++) stepAir(s, k / 60);
    dropRidge(s, fwd);
    push(s, 1.0, 2.7, 0.03); // až přes konec dlažby (vytlačení k okraji)
    dropRidge(s, fwd);
    expect(Math.abs(total(s) - t0) / t0).toBeLessThan(1e-9);
    // střed pruhu skoro čistý (do stran uniklý sníh může částečně sesednout zpět – zbytky do 5 %)
    expect(remainingIn(s, 0.12, 0.28, 0.15, 2.3)).toBeLessThan(0.1 * 2.15 * 0.16 * 0.04 * 200); // (do stran uniklý sníh částečně sesedne zpět – tenké zbytky do 10 %)
  });
});
