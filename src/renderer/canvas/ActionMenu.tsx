/**
 * Nabídka akcí na místě ve scéně (pravé tlačítko kdekoli, nebo nástroj „Akce“): podle toho, co je
 * pod kurzorem (postava, bruslař, zóna sněhuláka / koulovačky, kluziště, odklízený pruh), nabídne
 * události, které se hned spustí ve scéně, a přidání kouře / páry na dané místo.
 */
import { store, useEditor } from '../store';
import type { Vec2 } from '../../core/math/vec';
import type { FallVariant } from '../../core/anim/fallPoses';
import type { TrickKind } from '../../core/sim/rink';
import { pointInPolygon } from '../../core/math/geom';
import { clearingCommand } from '../ops';
import { cameraFor, toScreen } from '../../core/scene/camera';

export interface MenuItem { label: string; run?: () => void; head?: boolean }
export interface ActionMenuState { x: number; y: number; items: MenuItem[] }

const toast = (r: { ok: boolean; msg: string } | string, okPrefix = '') => {
  const ok = typeof r === 'string' ? true : r.ok, msg = typeof r === 'string' ? r : r.msg;
  store.toast(ok ? 'info' : 'warn', ok ? okPrefix + msg : msg, 2500);
};
const TRICKS: [TrickKind, string][] = [['jump', 'Skok s otočkou'], ['arabesque', 'Holubička'], ['backward', 'Jízda vzad'], ['oneFoot', 'Skluz na jedné noze'], ['spin', 'Pirueta na místě']];
const FALLS: [FallVariant, string][] = [['back', 'Pád dozadu do sedu'], ['forward', 'Zakopnutí dopředu'], ['side', 'Uklouznutí bokem'], ['saved', 'Zachycené uklouznutí']];

/** Položky nabídky pro bod ve scéně (m) a případnou postavu pod kurzorem. */
export function actionsAt(m: Vec2, agentId: string | null): MenuItem[] {
  const sim = store.sim.sim, p = store.state.project; if (!sim || !p) return [];
  const items: MenuItem[] = [];
  const a = agentId ? sim.state.agents.find((x) => x.id === agentId) : undefined;
  if (a?.onIce) {
    items.push({ label: `Bruslař: ${a.name}`, head: true });
    items.push({ label: 'Pád na ledě', run: () => toast(sim.triggerRinkEvent('fall', a.id), 'Pád: ') });
    for (const [k, l] of TRICKS) items.push({ label: l, run: () => toast(sim.triggerRinkEvent('trick', a.id, k), `${l}: `) });
  } else if (a) {
    items.push({ label: `Chodec: ${a.name}`, head: true });
    for (const [v, l] of FALLS) items.push({ label: l, run: () => toast(sim.triggerFall(v, 1, { agentId: a.id, helper: true }), `${l}: `) });
  }
  if (p.rink && pointInPolygon(m, p.rink.ice)) {
    items.push({ label: 'Kluziště (nejbližší bruslař)', head: true });
    items.push({ label: 'Pád na ledě', run: () => toast(sim.triggerRinkEvent('fall', null, undefined, m), 'Pád: ') });
    for (const [k, l] of TRICKS) items.push({ label: l, run: () => toast(sim.triggerRinkEvent('trick', null, k, m), `${l}: `) });
  }
  for (const z of p.zones) if (z.enabled && pointInPolygon(m, z.bounds)) {
    if (z.activityType === 'snowman') items.push({ label: z.name, head: true }, { label: 'Postavit sněhuláka (rodič s dítětem)', run: () => toast(sim.startCoopSnowmanNow()) });
    if (z.activityType === 'snowballFight') items.push({ label: z.name, head: true }, { label: 'Koulovačka', run: () => toast(sim.startFightNow()) });
  }
  if (p.clearing) {
    const cam = cameraFor(p.scene), w = p.clearing.work, poly = [[w.x0, w.z0], [w.x1, w.z0], [w.x1, w.z1], [w.x0, w.z1]].map(([X, Z]) => toScreen(cam, { X, Z }));
    const pad = 40, xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
    if (m.x > Math.min(...xs) - pad && m.x < Math.max(...xs) + pad && m.y > Math.min(...ys) - pad && m.y < Math.max(...ys) + pad)
      items.push({ label: 'Odklízení sněhu', head: true }, { label: 'Jeden pracovní cyklus', run: () => clearingCommand('cycle') }, { label: 'Obnovit sníh', run: () => clearingCommand('reset') });
  }
  if (p.tram) items.push({ label: 'Tramvaj a pekárna', head: true }, { label: 'Přijede tramvaj', run: () => toast(sim.tramNow()) });
  if (p.pram) items.push({ label: 'Přijde rodič s kočárkem (A17)', run: () => toast(sim.pramNow()) });
  if (p.bakery) {
    items.push({ label: 'Pekař jde zametat (A18a)', run: () => toast(sim.bakerNow('sweep')) });
    items.push({ label: 'Pekař sype chodník (A18b)', run: () => toast(sim.bakerNow('salt')) });
    if (p.bakery.crateSpot) items.push({ label: 'Pekař přenese bedýnku (A18c)', run: () => toast(sim.bakerNow('crate')) });
  }
  if (!a) {
    items.push({ label: 'Kdekoli', head: true });
    items.push({ label: 'Pád chodce (nejbližší)', run: () => toast(sim.triggerFall('back', 1, { helper: true }), 'Pád: ') });
    if (p.rink) items.push({ label: 'Prvek na ledě (kdokoli)', run: () => toast(sim.triggerRinkEvent('trick'), 'Prvek: ') });
  }
  items.push({ label: 'Přidat sem', head: true });
  items.push({ label: 'Kouř z komína', run: () => addSource('smoke', m) }, { label: 'Pára', run: () => addSource('steam', m) });
  return items;
}

let srcN = 0;
export function addSource(kind: 'smoke' | 'steam', m: Vec2) {
  store.editLive(kind === 'smoke' ? 'Kouř z komína' : 'Pára', (d) => {
    d.scene.environment ??= { variableSnow: true, gusts: true, cupSteam: true, stallSteam: true, sources: [] };
    d.scene.environment.sources.push({ id: `src_${Date.now().toString(36)}_${srcN++}`, kind, x: Math.round(m.x), y: Math.round(m.y), rate: kind === 'smoke' ? 2 : 4 });
  });
}

export function ActionMenu() {
  const menu = useEditor((s) => s.actionMenu);
  if (!menu) return null;
  const close = () => store.set({ actionMenu: null });
  return (
    <div className="action-backdrop" onMouseDown={close} onContextMenu={(e) => e.preventDefault()}>
      <div className="action-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
        {menu.items.map((it, i) => it.head
          ? <div key={i} className="action-head">{it.label}</div>
          : <button key={i} onClick={() => { close(); it.run?.(); }}>{it.label}</button>)}
      </div>
    </div>
  );
}
