import { SIM_DT } from './types';

/**
 * Hodiny náhledu: převádí reálný čas × rychlost na počet pevných kroků simulace.
 * Rychlost ovlivňuje jen tempo přehrávání, nikdy průběh simulace.
 */
export class PreviewClock {
  private acc = 0;
  playing = false;
  speed = 1;
  /** Maximální počet kroků za snímek (při přetížení se náhled zpomalí, ale nic se nevynechá). */
  maxStepsPerFrame = 240;
  /** Vrátí počet kroků, které se mají v tomto snímku provést. */
  tick(realDtSec: number): number {
    if (!this.playing) return 0;
    this.acc += Math.min(realDtSec, 0.25) * this.speed;
    let n = Math.floor(this.acc / SIM_DT + 1e-9);
    if (n > this.maxStepsPerFrame) n = this.maxStepsPerFrame;
    this.acc -= n * SIM_DT;
    if (this.acc > SIM_DT * this.maxStepsPerFrame) this.acc = 0;
    return n;
  }
  reset() { this.acc = 0; }
}
