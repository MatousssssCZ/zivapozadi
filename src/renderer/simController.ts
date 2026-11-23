import { Simulation } from '../core/sim/simulation';
import { PreviewClock } from '../core/sim/previewClock';
import { SIM_DT } from '../core/sim/types';
import type { ProjectFile } from '../core/model/types';
import type { CharacterManifest } from '../core/anim/manifest';

/** Řízení náhledové simulace. Simulace se vždy staví z aktuálního dokumentu projektu. */
export class SimController {
  sim: Simulation | null = null;
  readonly clock = new PreviewClock();
  private listeners = new Set<() => void>();
  private lastNotify = 0;
  error: string | null = null;

  subscribe = (l: () => void) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  private notify(force = false) {
    const t = performance.now();
    if (!force && t - this.lastNotify < 100) return;
    this.lastNotify = t;
    for (const l of this.listeners) l();
  }

  time(): number { return this.sim?.time() ?? 0; }

  /** Přestaví simulaci a dopočítá ji do stejného času (pokud `keepTime`). */
  rebuild(project: ProjectFile, manifests: Record<string, CharacterManifest>, keepTime = true) {
    const step = keepTime ? this.sim?.state.step ?? 0 : 0;
    try {
      this.sim = Simulation.create(project, manifests);
      this.sim.runSteps(step);
      this.error = null;
    } catch (e) {
      this.sim = null; this.error = (e as Error).message;
    }
    this.notify(true);
  }

  tick(realDt: number) {
    if (!this.sim) return;
    const n = this.clock.tick(realDt);
    if (n > 0) { this.sim.runSteps(n); this.notify(); }
  }

  play() { this.clock.playing = true; this.clock.reset(); this.notify(true); }
  pause() { this.clock.playing = false; this.notify(true); }
  setSpeed(s: number) { this.clock.speed = s; this.notify(true); }

  restart(project: ProjectFile, manifests: Record<string, CharacterManifest>) {
    this.rebuild(project, manifests, false);
    this.clock.reset();
  }

  /** Skok na čas: vpřed dopočítá, vzad restartuje a dopočítá znovu (stav je vždy skutečně spočítaný). */
  seek(t: number, project: ProjectFile, manifests: Record<string, CharacterManifest>) {
    const target = Math.max(0, Math.round(t / SIM_DT));
    if (!this.sim || target < this.sim.state.step) this.rebuild(project, manifests, false);
    this.sim?.runSteps(target - (this.sim?.state.step ?? 0));
    this.notify(true);
  }
}
