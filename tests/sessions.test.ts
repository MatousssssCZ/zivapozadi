import { describe, it, expect } from 'vitest';
import { Reservations } from '../src/core/sim/reservations';
import { createSession, endSession, sessionOf } from '../src/core/sim/sessions';
import type { SimState } from '../src/core/sim/types';

const st = (): SimState => ({ version: 5, step: 0, rng: [1, 2, 3, 4], agents: [], props: [], nextPropId: 1, reservations: {}, queues: {}, schedule: {}, removedObjects: [], binCounts: {}, log: [], stats: { cupsServed: 0, cupsDisposed: 0, sips: 0 } });
const init = (ids: string[], keys: string[]) => ({ type: 'snowman', zoneId: 'z', participantIds: ids, roles: {}, keys, now: 0, deadline: 60, seed: 1, phase: 'gather' });

describe('společné činnosti – sessions a atomické rezervace (T03, T04)', () => {
  it('dva souběžné pokusy o stejné účastníky: vyhraje právě jeden, druhý nic nedrží', () => {
    const s = st(), r = new Reservations(s);
    const a = createSession(s, r, init(['p1', 'p2'], ['zone:z']));
    const b = createSession(s, r, init(['p2', 'p3'], ['zone:y']));
    expect(a).not.toBeNull(); expect(b).toBeNull();
    expect(Object.values(s.reservations).every((o) => o === 'session:ses1')).toBe(true);
    expect(r.isFree('actor:p3')).toBe(true); expect(r.isFree('zone:y')).toBe(true);
    expect(sessionOf(s, 'p2')?.id).toBe('ses1');
  });
  it('tryReserveMany: cizí klíč ⇒ žádná změna', () => {
    const s = st(), r = new Reservations(s);
    r.tryReserve('b', 'x');
    expect(r.tryReserveMany(['a', 'b', 'c'], 'y')).toBe(false);
    expect(s.reservations).toEqual({ b: 'x' });
    expect(r.tryReserveMany(['c', 'a', 'a'], 'y')).toBe(true);
    expect(s.reservations).toEqual({ a: 'y', b: 'x', c: 'y' });
  });
  it('ukončení (i opakované) uvolní přesně vše, co session vlastnila; JSON roundtrip', () => {
    const s = st(), r = new Reservations(s);
    r.tryReserve('other', 'agentX');
    const a = createSession(s, r, init(['p1'], ['zone:z', 'spot:1']))!;
    const copy = JSON.parse(JSON.stringify(s)) as SimState;
    expect(copy.sessions![0]).toEqual(a);
    endSession(s, r, a.id); endSession(s, r, a.id);
    expect(s.reservations).toEqual({ other: 'agentX' });
    expect(s.sessions).toEqual([]);
    expect(createSession(s, r, init(['p1'], ['zone:z']))?.id).toBe('ses2');
  });
});
