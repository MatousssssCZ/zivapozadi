import type { SimState } from './types';

/** Rezervace s kapacitou 1 na klíč. Vlastník = ID postavy. */
export class Reservations {
  constructor(private st: SimState) {}
  owner(key: string): string | undefined { return this.st.reservations[key]; }
  isFree(key: string, by?: string): boolean { const o = this.st.reservations[key]; return o === undefined || o === by; }
  tryReserve(key: string, by: string): boolean {
    const o = this.st.reservations[key];
    if (o !== undefined && o !== by) return false;
    this.st.reservations[key] = by; return true;
  }
  /**
   * Atomická rezervace více klíčů (skupinové činnosti): buď všechny, nebo žádný.
   * Klíče se zpracují v ustáleném pořadí; cizí vlastník kteréhokoli z nich ⇒ false bez změny stavu.
   */
  tryReserveMany(keys: string[], by: string): boolean {
    const uniq = [...new Set(keys)].sort();
    if (uniq.some((k) => !this.isFree(k, by))) return false;
    for (const k of uniq) this.st.reservations[k] = by;
    return true;
  }
  release(key: string, by: string): void { if (this.st.reservations[key] === by) delete this.st.reservations[key]; }
  /** Uvolní vše, co postava drží (rezervace i místa ve frontách). Bezpečnostní síť při přerušení. */
  releaseAll(by: string): string[] {
    const freed: string[] = [];
    for (const [k, o] of Object.entries(this.st.reservations)) if (o === by) { delete this.st.reservations[k]; freed.push(k); }
    for (const q of Object.values(this.st.queues)) { const i = q.indexOf(by); if (i >= 0) q.splice(i, 1); }
    return freed;
  }
  releaseMatching(pred: (key: string) => boolean): void {
    for (const k of Object.keys(this.st.reservations)) if (pred(k)) delete this.st.reservations[k];
  }
  heldBy(by: string): string[] { return Object.entries(this.st.reservations).filter(([, o]) => o === by).map(([k]) => k); }
  // Fronty
  enqueue(q: string, by: string): number {
    const list = (this.st.queues[q] ??= []);
    if (!list.includes(by)) list.push(by);
    return list.indexOf(by);
  }
  queuePos(q: string, by: string): number { return (this.st.queues[q] ?? []).indexOf(by); }
  dequeue(q: string, by: string): void { const l = this.st.queues[q]; if (l) { const i = l.indexOf(by); if (i >= 0) l.splice(i, 1); } }
}
