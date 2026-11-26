/**
 * Upadlá rukavice (balíček „živá pozadí“, B03). Postava nese v ruce rezervní palčák (oddělená
 * rekvizita – namalovaná rukavice na dlani nikdy neodpadá). Cestou jí upadne: krátký pád,
 * po 1–2 s si toho všimne, zastaví, vrátí se, dřepne (klip „scoop“), v polovině dřepu ji zvedne
 * (pick event), narovná se a pokračuje k původnímu cíli. Celkem 5–9 s, cooldown scény 300–600 s.
 *
 * Abort (postava uvízne / odejde jinudy): rukavice zůstane ležet (nemaže se na očích) a „úklid“
 * je naplánovaný – zvedne ji další kolemjdoucí, který jde blízko, a schová ji do kapsy.
 * Losování nebere z RNG postav (hashNoise ze seedu), takže ostatní průběh scény se nemění.
 */
import type { AgentState, PropState, SimState } from './types';
import { hashNoise } from '../math/rng';
import { cameraFor, toScreen, toWorld } from '../scene/camera';
import type { ProjectFile } from '../model/types';

export interface MittenIncident {
  phase: 'idle' | 'carry' | 'dropped' | 'back' | 'pick';
  /** kdy smí začít další (cooldown scény) */ next: number;
  agentId?: string; propId?: string;
  at?: number;
  /** nálezce cizí rukavice ji po zvednutí schová (nenese ji dál v ruce) */ pocket?: boolean;
  n: number;
}

export interface MittenHost {
  state: SimState; project: ProjectFile; seed: number;
  time(): number;
  isChild(a: AgentState): boolean;
  hand(a: AgentState): { x: number; y: number };
  newPropId(): string;
  walkTo(a: AgentState, p: { x: number; y: number }): void;
  stopRoute(a: AgentState): void;
  scoop(a: AgentState): boolean;
  resume(a: AgentState): void;
  log(msg: string, id?: string): void;
}

const H = (seed: number, n: number, k: number) => hashNoise(seed, 9100 + n, k);
const range = (u: number, lo: number, hi: number) => lo + (hi - lo) * u;

export function mittenState(s: SimState): MittenIncident {
  return (s.mitten ??= { phase: 'idle', next: 60, n: 0 });
}

/** Volá se, když se postava rozhodne jen projít scénou: občas dostane do ruky rezervní palčák. */
export function maybeCarryMitten(h: MittenHost, a: AgentState): void {
  const m = mittenState(h.state), t = h.time();
  if (m.phase !== 'idle' || t < m.next || a.holding || h.isChild(a)) return;
  if (h.state.props.some((p) => p.kind === 'mitten')) return; // jedna rukavice ve scéně
  if (h.state.agents.some((x) => x.follow?.leaderId === a.id || x.id === a.follow?.leaderId)) return;
  if (H(h.seed, m.n, 0) > 0.5) { m.n++; return; }
  const p: PropState = { id: h.newPropId(), kind: 'mitten', place: { kind: 'held', agentId: a.id }, appearedAt: t, sips: 0 };
  h.state.props.push(p);
  a.holding = p.id; a.holdingKind = 'mitten';
  Object.assign(m, { phase: 'carry', agentId: a.id, propId: p.id, at: t + range(H(h.seed, m.n, 1), 3, 9), pocket: false });
}

/** Je postava právě zaměstnaná rukavicí (návrat, dřep)? Pak ji návštěvnická logika nepřeplánuje. */
export function mittenBusy(s: SimState, a: AgentState): boolean {
  const m = s.mitten;
  return !!m && m.agentId === a.id && (m.phase === 'back' || m.phase === 'pick' || (m.phase === 'dropped' && !a.route));
}

function finish(h: MittenHost, m: MittenIncident) {
  const t = h.time();
  m.n++;
  Object.assign(m, { phase: 'idle', agentId: undefined, at: undefined, pocket: false, next: t + range(H(h.seed, m.n, 2), 300, 600) });
}

export function stepMitten(h: MittenHost): void {
  const m = mittenState(h.state), t = h.time();
  const a = m.agentId ? h.state.agents.find((x) => x.id === m.agentId) : undefined;
  const prop = m.propId ? h.state.props.find((p) => p.id === m.propId) : undefined;
  const cam = cameraFor(h.project.scene), W = h.project.scene.width;
  switch (m.phase) {
    case 'idle': {
      // „úklid“: ležící rukavici zvedne kolemjdoucí, který jde těsně kolem
      const g = h.state.props.find((p) => p.kind === 'mitten' && p.place.kind === 'ground');
      if (!g || g.place.kind !== 'ground') return;
      const G = toWorld(cam, g.place);
      const finder = h.state.agents.find((x) => !x.hidden && x.route && x.visit?.mode === 'leave' && !x.activity && !x.holding && !x.follow && !h.isChild(x) && x.speed > 0.4
        && !h.state.agents.some((y) => y.follow?.leaderId === x.id)
        && (() => { const P = toWorld(cam, x.pos); return Math.hypot(P.X - G.X, P.Z - G.Z) < 2.2; })());
      if (!finder) return;
      Object.assign(m, { phase: 'dropped', agentId: finder.id, propId: g.id, at: t, pocket: true });
      return;
    }
    case 'carry': {
      if (!a || a.hidden || !prop || a.holding !== prop.id) { if (prop && prop.place.kind === 'held') h.state.props = h.state.props.filter((p) => p !== prop); finish(h, m); return; }
      if (a.activity || !a.route) { m.at = Math.max(m.at ?? t, t + 2); return; }
      // upadne jen v otevřeném místě uvnitř scény a za chůze
      const inside = a.pos.x > W * 0.12 && a.pos.x < W * 0.88 && a.pos.y > h.project.scene.height * 0.68;
      if (t < (m.at ?? 0) || a.speed < 0.5 || !inside) return;
      const hp = h.hand(a);
      prop.place = { kind: 'ground', x: hp.x, y: a.pos.y + 3 };
      prop.appearedAt = t; // začátek pádu (renderer: 0,35 s z výšky ruky)
      prop.variant = String(Math.max(0, a.pos.y - hp.y)); // výška pádu v px
      a.holding = null; a.holdingKind = null;
      Object.assign(m, { phase: 'dropped', at: t + range(H(h.seed, m.n, 3), 1, 2), pocket: false });
      h.log(`${a.name} ztratil(a) rukavici.`, a.id);
      return;
    }
    case 'dropped': {
      if (!a || a.hidden || !prop || prop.place.kind !== 'ground') { finish(h, m); return; }
      if (t < (m.at ?? 0)) return;
      // všimne si: nejdřív zastaví (dobrzdí), teprve pak se otočí zpět
      if (a.route) { h.stopRoute(a); m.at = t + 0.3; return; }
      if (a.speed > 4 && t < (m.at ?? 0) + 1.5) return;
      // otočí se a vrátí se, otočí se a vrátí se k rukavici (místo kousek vedle ní, na straně, odkud jde)
      const G = toWorld(cam, prop.place), P = toWorld(cam, a.pos);
      const d = Math.hypot(P.X - G.X, P.Z - G.Z) || 1;
      const spot = toScreen(cam, { X: G.X + ((P.X - G.X) / d) * 0.32, Z: G.Z + ((P.Z - G.Z) / d) * 0.32 });
      h.walkTo(a, spot);
      a.status = 'Vrací se pro rukavici';
      Object.assign(m, { phase: 'back', at: t + 20 });
      return;
    }
    case 'back': {
      if (!a || a.hidden || !prop) { finish(h, m); return; }
      a.status = 'Vrací se pro rukavici';
      if (a.route) {
        if (t > (m.at ?? 0) || (a.stuckT ?? 0) > 6) { h.stopRoute(a); h.resume(a); finish(h, m); } // abort: rukavice zůstane ležet
        return;
      }
      if (prop.place.kind === 'ground') a.look = { x: prop.place.x, y: prop.place.y };
      if (!h.scoop(a)) return; // počká, až má volné ruce
      Object.assign(m, { phase: 'pick', at: t + 0.95 });
      return;
    }
    case 'pick': {
      if (!a || a.hidden || !prop) { finish(h, m); return; }
      a.status = 'Zvedá rukavici';
      if (prop.place.kind === 'ground' && t >= (m.at ?? 0)) { // pick event v nejnižším bodě dřepu
        prop.place = { kind: 'held', agentId: a.id }; prop.variant = undefined;
        a.holding = prop.id; a.holdingKind = 'mitten';
      }
      if ((a.anim.gestures ?? []).some((g) => g.fam === 'scoop')) return;
      a.look = null;
      if (m.pocket && a.holding === prop.id) { h.state.props = h.state.props.filter((p) => p !== prop); a.holding = null; a.holdingKind = null; }
      h.log(`${a.name} zvedl(a) rukavici${m.pocket ? ' (cizí – schoval(a) ji)' : ''}.`, a.id);
      h.resume(a);
      finish(h, m);
      return;
    }
  }
}

/** Ladění / galerie aktivit: postava hned ponese rukavici, která jí za pár sekund upadne. */
export function forceMitten(h: MittenHost, a: AgentState): boolean {
  const m = mittenState(h.state), t = h.time();
  if (m.phase !== 'idle' || a.holding || h.state.props.some((p) => p.kind === 'mitten')) return false;
  const p: PropState = { id: h.newPropId(), kind: 'mitten', place: { kind: 'held', agentId: a.id }, appearedAt: t, sips: 0 };
  h.state.props.push(p); a.holding = p.id; a.holdingKind = 'mitten';
  Object.assign(m, { phase: 'carry', agentId: a.id, propId: p.id, at: t + 2.5, pocket: false });
  return true;
}
