import { cameraFor, toWorld } from '../../core/scene/camera';
import { store, useEditor, useSimTick } from '../store';
import { Row, NumField, TextField, Select, Check, Section } from './fields';
import type { ProjectFile, SceneObject, Layer, InteractionPointKind, StopConfig } from '../../core/model/types';
import { getActivity, listActivityDefinitions } from '../../core/activities/registry';
import { newId } from '../../core/model/ids';
import { deleteSelection, duplicateSelection } from '../ops';
import { formatTime } from './BottomPanel';
import { AppearanceEditor, CharacterPreview } from './CharacterGenerator';

const deg = (r: number | undefined) => Math.round(((r ?? 0) * 180) / Math.PI);
const rad = (d: number) => (d * Math.PI) / 180;

function upd(label: string, fn: (p: ProjectFile) => void) { store.edit(label, fn); }

function Actions({ dup = true, del = true }: { dup?: boolean; del?: boolean }) {
  return <div className="actions">{dup && <button onClick={duplicateSelection} title="Ctrl+D">Duplikovat</button>}{del && <button className="danger" onClick={deleteSelection} title="Delete">Smazat</button>}</div>;
}

function ObjectProps({ o, p }: { o: SceneObject; p: ProjectFile }) {
  const set = (label: string, fn: (x: SceneObject) => void) => upd(label, (d) => fn(d.objects.find((x) => x.id === o.id)!));
  const asset = p.assets.find((a) => a.id === o.assetId);
  const inter = o.interaction;
  return (
    <>
      <Section title="Objekt">
        <Row label="Název"><TextField value={o.name} onCommit={(v) => set('Přejmenování', (x) => { x.name = v; })} /></Row>
        <Row label="Asset"><span className="muted">{asset?.name ?? 'chybí!'}</span></Row>
        <Row label="ID"><code className="small">{o.id}</code></Row>
        <Row label="X"><NumField value={o.x} onCommit={(v) => set('Poloha', (x) => { x.x = v; })} /></Row>
        <Row label="Y (kontakt se zemí)"><NumField value={o.y} onCommit={(v) => set('Poloha', (x) => { x.y = v; })} /></Row>
        <Row label="Měřítko" hint="Rovnoměrné – poměr stran se zachovává"><NumField testId="prop-scale" value={o.scale} step={0.05} min={0.05} max={20} onCommit={(v) => set('Měřítko', (x) => { x.scale = v; })} /></Row>
        <Row label="Kotva X / Y" hint="Bod kontaktu se zemí, 0–1 vůči obrázku">
          <NumField value={(o.anchor ?? asset?.anchor ?? { x: 0.5, y: 1 }).x} step={0.01} min={0} max={1} onCommit={(v) => set('Kotva', (x) => { x.anchor = { x: v, y: (x.anchor ?? asset?.anchor ?? { x: 0.5, y: 1 }).y }; })} />
          <NumField value={(o.anchor ?? asset?.anchor ?? { x: 0.5, y: 1 }).y} step={0.01} min={0} max={1} onCommit={(v) => set('Kotva', (x) => { x.anchor = { x: (x.anchor ?? asset?.anchor ?? { x: 0.5, y: 1 }).x, y: v }; })} />
        </Row>
        <Row label="Vrstva"><Select<Layer> value={o.layer} options={[{ value: 'background', label: 'Pevné pozadí' }, { value: 'world', label: 'Prostor (řazení podle země)' }, { value: 'foreground', label: 'Pevné popředí' }]} onChange={(v) => set('Vrstva', (x) => { x.layer = v; })} /></Row>
        <Row label="Úprava pořadí" hint="Přičte se k hloubce; kladné = více vpředu"><NumField value={o.zBias} step={5} onCommit={(v) => set('Pořadí', (x) => { x.zBias = v; })} /></Row>
        <div className="actions">
          <button onClick={() => set('Pořadí', (x) => { x.zBias += 20; })}>Dopředu</button>
          <button onClick={() => set('Pořadí', (x) => { x.zBias -= 20; })}>Dozadu</button>
          <button onClick={() => set('Zrcadlení', (x) => { x.flipX = !x.flipX; })}>Zrcadlit</button>
        </div>
        <Check label="Viditelný" value={o.visible} onChange={(v) => set(v ? 'Zobrazení' : 'Skrytí', (x) => { x.visible = v; })} />
        <Check label="Zamčený" value={o.locked} onChange={(v) => set(v ? 'Zamčení' : 'Odemčení', (x) => { x.locked = v; })} />
        <Check label="Kolizní stopa (pevná překážka)" value={!!o.footprint} onChange={(v) => set('Kolize', (x) => { x.footprint = v ? (asset?.defaultFootprint ? structuredClone(asset.defaultFootprint) : [{ x: -30, y: -10 }, { x: 30, y: -10 }, { x: 30, y: 6 }, { x: -30, y: 6 }]) : undefined; })} />
        <Actions />
      </Section>
      <Section title="Interakce">
        <Row label="Druh"><Select value={inter?.kind ?? 'none'} options={[{ value: 'none', label: 'Žádná' }, { value: 'stand', label: 'Stánek' }, { value: 'table', label: 'Stoleček' }, { value: 'viewpoint', label: 'Místo s výhledem' }, { value: 'bin', label: 'Koš' }, { value: 'generic', label: 'Obecná' }]}
          onChange={(v) => set('Druh interakce', (x) => { x.interaction = v === 'none' ? undefined : { kind: v as never, points: x.interaction?.points ?? (asset?.defaultInteraction?.kind === v ? structuredClone(asset.defaultInteraction.points) : []) }; })} /></Row>
        {inter && inter.points.map((pt, i) => (
          <div key={pt.id} className={`point-row${store.state.selection?.kind === 'point' && store.state.selection.pointId === pt.id ? ' sel' : ''}`}>
            <Select<InteractionPointKind> value={pt.kind} options={[{ value: 'service', label: 'obsluha' }, { value: 'queue', label: 'fronta' }, { value: 'seat', label: 'místo u stolu' }, { value: 'view', label: 'výhled' }, { value: 'drop', label: 'vhození' }, { value: 'counter', label: 'pult/otvor' }, { value: 'work', label: 'pracovní' }]}
              onChange={(v) => set('Druh bodu', (x) => { x.interaction!.points[i].kind = v; })} />
            <NumField value={pt.offset.x} onCommit={(v) => set('Bod', (x) => { x.interaction!.points[i].offset.x = v; })} />
            <NumField value={pt.offset.y} onCommit={(v) => set('Bod', (x) => { x.interaction!.points[i].offset.y = v; })} />
            <NumField value={deg(pt.facing)} step={15} onCommit={(v) => set('Směr pohledu', (x) => { x.interaction!.points[i].facing = rad(v); })} />
            <select value={pt.navNodeId ?? ''} onChange={(e) => set('Přístupový bod', (x) => { const q = x.interaction!.points[i]; if (e.target.value) q.navNodeId = e.target.value; else delete q.navNodeId; })}>
              <option value="">přístup: nejbližší</option>
              {p.nav.nodes.map((n) => <option key={n.id} value={n.id}>{n.name ?? n.id}</option>)}
            </select>
            <button className="icon" onClick={() => set('Smazání bodu', (x) => { x.interaction!.points.splice(i, 1); })}>✕</button>
          </div>
        ))}
        {inter && <div className="muted small">Sloupce: druh · posun X · posun Y · směr pohledu (°) · přístupový bod trasy. Body lze také táhnout na plátně.</div>}
        {inter && <button onClick={() => set('Přidání bodu', (x) => { x.interaction!.points.push({ id: newId('pt'), kind: 'work', offset: { x: 0, y: 40 }, facing: -Math.PI / 2 }); })}>+ Přidat bod</button>}
      </Section>
    </>
  );
}

function NodeProps({ id, p }: { id: string; p: ProjectFile }) {
  const n = p.nav.nodes.find((x) => x.id === id)!;
  const set = (label: string, fn: (x: typeof n) => void) => upd(label, (d) => fn(d.nav.nodes.find((x) => x.id === id)!));
  const neighbors = p.nav.edges.filter((e) => e.a === id || (e.b === id && !e.oneWay)).map((e) => (e.a === id ? e.b : e.a));
  const s = n.stop;
  const setStop = (label: string, fn: (s: StopConfig) => void) => set(label, (x) => { if (x.stop) fn(x.stop); });
  return (
    <Section title="Bod trasy">
      <Row label="Název"><TextField value={n.name ?? ''} onCommit={(v) => set('Přejmenování', (x) => { x.name = v; })} /></Row>
      <Row label="X / Y"><NumField value={n.x} onCommit={(v) => set('Poloha', (x) => { x.x = v; })} /><NumField value={n.y} onCommit={(v) => set('Poloha', (x) => { x.y = v; })} /></Row>
      <Check label="Vstup / výstup ze scény" value={!!n.portal} onChange={(v) => set('Vstup/výstup', (x) => { x.portal = v || undefined; })} />
      <div className="muted small">Tudy návštěvníci přicházejí a odcházejí (bod dejte kousek za okraj obrazu).</div>
      <Check label="Zastávka" value={!!s} onChange={(v) => set('Zastávka', (x) => { x.stop = v ? { waitMin: 2, waitMax: 5, look: { mode: 'none' }, next: [] } : undefined; })} />
      {s && <>
        <Row label="Čekání od–do (s)"><NumField value={s.waitMin} min={0} step={0.5} onCommit={(v) => setStop('Čekání', (q) => { q.waitMin = v; q.waitMax = Math.max(q.waitMax, v); })} /><NumField value={s.waitMax} min={0} step={0.5} onCommit={(v) => setStop('Čekání', (q) => { q.waitMax = Math.max(v, q.waitMin); })} /></Row>
        <Row label="Pohled"><Select value={s.look.mode} options={[{ value: 'none', label: 'volný' }, { value: 'direction', label: 'směr' }, { value: 'object', label: 'na objekt' }]} onChange={(v) => setStop('Pohled', (q) => { q.look = { mode: v, angle: q.look.angle ?? Math.PI / 2, objectId: q.look.objectId ?? p.objects[0]?.id }; })} /></Row>
        {s.look.mode === 'direction' && <Row label="Směr (°)" hint="0 = vpravo, 90 = ke kameře, -90 = od kamery"><NumField value={deg(s.look.angle)} step={15} onCommit={(v) => setStop('Směr', (q) => { q.look.angle = rad(v); })} /></Row>}
        {s.look.mode === 'object' && <Row label="Objekt"><Select value={s.look.objectId ?? ''} options={p.objects.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => setStop('Cíl pohledu', (q) => { q.look.objectId = v; })} /></Row>}
        <Row label="Spustit činnost"><Select value={s.activity ?? ''} options={[{ value: '', label: '— žádná —' }, ...listActivityDefinitions().map((d) => ({ value: d.type, label: d.label }))]} onChange={(v) => setStop('Činnost v zastávce', (q) => { q.activity = v || undefined; })} /></Row>
        {s.activity && <Row label="Pravděpodobnost"><NumField value={s.activityChance ?? 1} min={0} max={1} step={0.1} onCommit={(v) => setStop('Pravděpodobnost', (q) => { q.activityChance = v; })} /></Row>}
        <div className="muted small">Pokračování (váhy; bez výběru = náhodný soused):</div>
        {neighbors.map((nb) => {
          const cur = s.next.find((x) => x.nodeId === nb);
          return <Row key={nb} label={`→ ${p.nav.nodes.find((q) => q.id === nb)?.name ?? nb}`}><NumField value={cur?.weight ?? 0} min={0} step={1} onCommit={(v) => setStop('Pokračování', (q) => { q.next = q.next.filter((x) => x.nodeId !== nb); if (v > 0) q.next.push({ nodeId: nb, weight: v }); })} /></Row>;
        })}
      </>}
      <Actions dup={false} />
    </Section>
  );
}

function EdgeProps({ id, p }: { id: string; p: ProjectFile }) {
  const e = p.nav.edges.find((x) => x.id === id)!;
  const set = (label: string, fn: (x: typeof e) => void) => upd(label, (d) => fn(d.nav.edges.find((x) => x.id === id)!));
  const name = (nid: string) => p.nav.nodes.find((n) => n.id === nid)?.name ?? nid;
  const blocked = store.sim.sim?.graph.blocked.find((b) => b.edgeId === id);
  return (
    <Section title="Spojení trasy">
      <div className="small">{name(e.a)} {e.oneWay ? '→' : '↔'} {name(e.b)}</div>
      {blocked && <div className="warn">Spojení prochází překážkou „{blocked.obstacleName}“ – postavy ho nepoužijí.</div>}
      <Check label="Jednosměrné" value={e.oneWay} onChange={(v) => set('Směr spojení', (x) => { x.oneWay = v; })} />
      {e.oneWay && <button onClick={() => set('Otočení směru', (x) => { const t = x.a; x.a = x.b; x.b = t; })}>Otočit směr</button>}
      <Check label="Úzký průchod (jen 1 postava současně)" value={e.narrow} onChange={(v) => set('Úzký průchod', (x) => { x.narrow = v; })} />
      <Actions dup={false} />
    </Section>
  );
}

function AreaProps({ id, p }: { id: string; p: ProjectFile }) {
  const a = p.areas.find((x) => x.id === id)!;
  const set = (label: string, fn: (x: typeof a) => void) => upd(label, (d) => fn(d.areas.find((x) => x.id === id)!));
  return (
    <Section title="Oblast">
      <Row label="Název"><TextField value={a.name} onCommit={(v) => set('Přejmenování', (x) => { x.name = v; })} /></Row>
      <Row label="Druh"><Select value={a.kind} options={[{ value: 'obstacle', label: 'Pevná překážka' }, { value: 'snow', label: 'Plocha se sněhem' }]} onChange={(v) => set('Druh oblasti', (x) => { x.kind = v; })} /></Row>
      <div className="muted small">{a.polygon.length} bodů. Vrcholy lze táhnout na plátně. Pozadí je plochý obrázek – překážky je nutné označit ručně.</div>
      <Actions />
    </Section>
  );
}

function ZoneProps({ id, p }: { id: string; p: ProjectFile }) {
  const z = p.zones.find((x) => x.id === id)!;
  const set = (label: string, fn: (x: typeof z) => void) => upd(label, (d) => fn(d.zones.find((x) => x.id === id)!));
  const def = getActivity(z.activityType)?.definition;
  return (
    <Section title="Zóna činnosti">
      <Row label="Název"><TextField value={z.name} onCommit={(v) => set('Přejmenování', (x) => { x.name = v; })} /></Row>
      <Row label="Činnost"><span>{def ? `${def.label} (v${z.activityVersion})` : `neznámá: ${z.activityType}`}</span></Row>
      <Check label="Povolena" value={z.enabled} onChange={(v) => set('Povolení zóny', (x) => { x.enabled = v; })} />
      {def?.requiredObjects.map((r) => (
        <div key={r.role} className="role-box">
          <div className="small"><b>{r.label}</b> (role „{r.role}“, min. {r.min})</div>
          {p.objects.filter((o) => o.interaction && r.interactionKinds.includes(o.interaction.kind)).map((o) => (
            <Check key={o.id} label={o.name} value={(z.objectRoles[r.role] ?? []).includes(o.id)} onChange={(v) => set('Přiřazení objektu', (x) => {
              const l = new Set(x.objectRoles[r.role] ?? []); if (v) l.add(o.id); else l.delete(o.id); x.objectRoles[r.role] = [...l];
            })} />
          ))}
          {(z.objectRoles[r.role] ?? []).length < r.min && <div className="warn">Chybí objekt této role.</div>}
        </div>
      ))}
      {def && Object.entries(def.defaultParams).map(([k, dv]) => typeof dv === 'number' && (
        <Row key={k} label={PARAM_LABELS[k] ?? k}><NumField value={(z.params[k] as number) ?? dv} min={0} step={0.5} onCommit={(v) => set('Parametr', (x) => { x.params[k] = v; })} /></Row>
      ))}
      <div className="legend small">
        <div><i className="sw" style={{ borderColor: '#9a5ae6' }} /> celkový prostor animace</div>
        <div><i className="dot" style={{ background: '#ffb02e' }} /> pracovní body (obsluha, místa, koš)</div>
        <div><i className="ring" style={{ borderColor: '#ffe7a0' }} /> vstupní/čekací místa (fronta)</div>
        <div><i className="sw" style={{ borderColor: '#46dc78' }} /> přístup z bodu trasy</div>
        <div>Povrch: {def?.surface === 'snow' ? 'vyžaduje sníh (zvýrazněno modře)' : 'libovolný'} · oranžový kroužek = rezervováno</div>
        <div>Překrytí zón není chyba – místa se rezervují v čase.</div>
      </div>
      <Actions />
    </Section>
  );
}
const PARAM_LABELS: Record<string, string> = { orderMin: 'Objednávka min (s)', orderMax: 'Objednávka max (s)', sipsMin: 'Doušků min', sipsMax: 'Doušků max', sipPauseMin: 'Pauza mezi doušky min (s)', sipPauseMax: 'Pauza max (s)', queueTimeout: 'Limit fronty (s)', spotWaitMax: 'Čekání na místo (s)' };

function CharacterProps({ id, p }: { id: string; p: ProjectFile }) {
  useSimTick();
  const c = p.characters.find((x) => x.id === id)!;
  const set = (label: string, fn: (x: typeof c) => void) => upd(label, (d) => fn(d.characters.find((x) => x.id === id)!));
  const agent = store.sim.sim?.state.agents.find((a) => a.id === id);
  const m = store.state.manifests[c.assetId];
  const rigLib = m?.rigLibrary;
  return (
    <>
      {rigLib && c.appearance && <Section title="Vzhled (generátor postav)">
        {rigLib.provisional && <div className="warn small">Dočasné díly – nejde o finální grafiku.</div>}
        <CharacterPreview app={c.appearance} manifest={m} />
        <AppearanceEditor app={c.appearance} lib={rigLib} onChange={(a, label) => set(label, (x) => { x.appearance = a; })} />
      </Section>}
      {rigLib && !c.appearance && <div className="warn">Postava nemá uložený vzhled – vygenerujte ho v panelu Postavy.</div>}
      <Section title="Postava">
        <Row label="Jméno"><TextField value={c.name} onCommit={(v) => set('Přejmenování', (x) => { x.name = v; })} /></Row>
        <Row label="Vzhled"><span className="muted">{m ? m.name : 'manifest chybí!'}</span></Row>
        <Row label="Počáteční bod"><Select value={c.startNodeId} options={p.nav.nodes.map((n) => ({ value: n.id, label: n.name ?? n.id }))} onChange={(v) => set('Počáteční bod', (x) => { x.startNodeId = v; })} /></Row>
        <Row label="Rychlost chůze"><NumField value={c.walkSpeed} min={10} max={200} step={2} onCommit={(v) => set('Rychlost', (x) => { x.walkSpeed = v; })} /></Row>
        <Row label="Měřítko"><NumField value={c.baseScale} min={0.3} max={3} step={0.05} onCommit={(v) => set('Měřítko postavy', (x) => { x.baseScale = v; })} /></Row>
        <Row label="Chování"><Select value={c.routine ?? 'wander'} options={[{ value: 'visitor', label: 'Návštěvník (projde / káva / setkání)' }, { value: 'wander', label: 'Volná procházka po trasách' }]} onChange={(v) => set('Chování postavy', (x) => { x.routine = v as 'wander' | 'visitor'; })} /></Row>
        {(c.routine ?? 'wander') === 'visitor' && <div className="muted small">Přijde vstupem, scénou buď jen projde, nebo si dojde na kávu, nebo se potká s přítelem a jdou na kávu spolu (fronta, stolek, povídání); pak odejde a po chvíli přijde znovu.{p.nav.nodes.some((x) => x.portal) ? '' : ' Pozor: trasa nemá žádný vstup/výstup – návštěvník bude jen chodit mezi body.'}</div>}
        {(c.routine ?? 'wander') === 'wander' && <Check label="Volná procházka po trasách" value={c.wander} onChange={(v) => set('Procházka', (x) => { x.wander = v; })} />}
        <Row label="Chodí ve dvojici s"><Select value={c.companionId ?? ''} options={[{ value: '', label: '— sám/sama —' }, ...p.characters.filter((o) => o.id !== c.id && !o.companionId).map((o) => ({ value: o.id, label: o.name }))]}
          onChange={(v) => set('Dvojice', (x) => { x.companionId = v || null; if (v) { const l = p.characters.find((o) => o.id === v); if (l) x.startNodeId = l.startNodeId; } })} /></Row>
        {c.companionId && <Row label="Strana"><Select value={String(c.companionSide === -1 ? -1 : 1)} options={[{ value: '1', label: 'vpravo od partnera' }, { value: '-1', label: 'vlevo od partnera' }]} onChange={(v) => set('Strana ve dvojici', (x) => { x.companionSide = Number(v); })} /></Row>}
        {c.companionId && <div className="muted small">Ve dvojici jde postava vedle partnera, přizpůsobí mu tempo a čeká s ním; vlastní činnosti a plánované události nemá.</div>}
        {(['coat', 'hat', 'scarf', 'trousers', 'skin'] as const).map((k) => (
          <Row key={k} label={{ coat: 'Kabát', hat: 'Čepice', scarf: 'Šála', trousers: 'Kalhoty', skin: 'Pleť' }[k]}>
            <input type="color" value={c.palette[k]} onChange={(e) => set('Barva', (x) => { x.palette[k] = e.target.value; })} />
          </Row>
        ))}
        <Actions />
      </Section>
      <Section title="Automatické činnosti">
        {listActivityDefinitions().map((d) => {
          const cfg = c.activities[d.type] ?? { enabled: false, firstDelayMin: 5, firstDelayMax: 20, intervalMin: d.repeat.defaultIntervalMin, intervalMax: d.repeat.defaultIntervalMax };
          const setCfg = (fn: (x: typeof cfg) => void) => set('Nastavení činnosti', (x) => { const q = x.activities[d.type] ?? structuredClone(cfg); fn(q); x.activities[d.type] = q; });
          return (
            <div key={d.type} className="role-box">
              <Check label={d.label} value={cfg.enabled} onChange={(v) => setCfg((q) => { q.enabled = v; })} />
              <Row label="První pokus od–do (s)"><NumField value={cfg.firstDelayMin} min={0} onCommit={(v) => setCfg((q) => { q.firstDelayMin = v; q.firstDelayMax = Math.max(v, q.firstDelayMax); })} /><NumField value={cfg.firstDelayMax} min={0} onCommit={(v) => setCfg((q) => { q.firstDelayMax = Math.max(v, q.firstDelayMin); })} /></Row>
              <Row label="Interval od–do (s)"><NumField value={cfg.intervalMin} min={0} onCommit={(v) => setCfg((q) => { q.intervalMin = v; q.intervalMax = Math.max(v, q.intervalMax); })} /><NumField value={cfg.intervalMax} min={0} onCommit={(v) => setCfg((q) => { q.intervalMax = Math.max(v, q.intervalMin); })} /></Row>
            </div>
          );
        })}
      </Section>
      {agent && <Section title="Stav v simulaci">
        <div className="small">Čas {formatTime(store.sim.time())}: <b>{agent.status}</b></div>
        <div className="small">Činnost: {agent.activity ? `${agent.activity.type} / fáze ${agent.activity.phase}` : '—'}</div>
        <div className="small">Drží: {agent.holding ? 'kelímek' : 'nic'} · Animace: {agent.anim.action?.clip ?? (agent.anim.walkBlend > 0.3 ? 'chůze' : 'klid')} · směr {agent.anim.dir}</div>
        <div className="small">Rezervace: {store.sim.sim!.res.heldBy(id).join(', ') || '—'}</div>
      </Section>}
    </>
  );
}

function EventProps({ id, p }: { id: string; p: ProjectFile }) {
  useSimTick();
  const e = p.schedule.find((x) => x.id === id)!;
  const set = (label: string, fn: (x: typeof e) => void) => upd(label, (d) => fn(d.schedule.find((x) => x.id === id)!));
  const rt = store.sim.sim?.state.schedule[id];
  return (
    <Section title="Plánovaná událost">
      <Row label="Název"><TextField value={e.name} onCommit={(v) => set('Přejmenování', (x) => { x.name = v; })} /></Row>
      <Row label="Čas (s)"><NumField value={e.time} min={0} step={1} onCommit={(v) => set('Čas události', (x) => { x.time = v; })} /></Row>
      <Row label="Činnost"><Select value={e.activityType} options={listActivityDefinitions().map((d) => ({ value: d.type, label: d.label }))} onChange={(v) => set('Činnost', (x) => { x.activityType = v; })} /></Row>
      <Row label="Postava"><Select value={e.characterId ?? ''} options={[{ value: '', label: 'kterákoli volná' }, ...p.characters.map((c) => ({ value: c.id, label: c.name }))]} onChange={(v) => set('Postava', (x) => { x.characterId = v || null; })} /></Row>
      <Row label="Zóna"><Select value={e.zoneId ?? ''} options={[{ value: '', label: 'kterákoli' }, ...p.zones.map((z) => ({ value: z.id, label: z.name }))]} onChange={(v) => set('Zóna', (x) => { x.zoneId = v || null; })} /></Row>
      <Row label="Když není dostupné"><Select value={e.onUnavailable} options={[{ value: 'wait', label: 'čekat s limitem' }, { value: 'skip', label: 'přeskočit' }, { value: 'report', label: 'nahlásit konflikt' }]} onChange={(v) => set('Pravidlo', (x) => { x.onUnavailable = v; })} /></Row>
      {e.onUnavailable === 'wait' && <Row label="Limit čekání (s)"><NumField value={e.waitLimit} min={0} onCommit={(v) => set('Limit', (x) => { x.waitLimit = v; })} /></Row>}
      <div className="small">Stav v náhledu: <b>{rt?.status ?? '—'}</b></div>
      <Actions dup={false} />
    </Section>
  );
}

function SceneProps({ p }: { p: ProjectFile }) {
  const sc = p.scene;
  return (
    <>
      <Section title="Projekt a scéna">
        <Row label="Název projektu"><TextField value={p.meta.name} onCommit={(v) => upd('Název projektu', (d) => { d.meta.name = v; })} /></Row>
        <Row label="Seed náhody" hint="Všechny náhodné volby simulace se odvozují od seedu"><NumField value={p.seed} step={1} onCommit={(v) => upd('Seed', (d) => { d.seed = Math.round(v); })} /></Row>
        <Row label="Logická velikost"><span className="muted">{sc.width} × {sc.height} (nezávislá na exportu)</span></Row>
        <Row label="Barva pozadí"><input type="color" value={sc.backgroundColor} onChange={(e) => upd('Barva pozadí', (d) => { d.scene.backgroundColor = e.target.value; })} /></Row>
        <Row label="Obrázek pozadí"><Select value={sc.backgroundAssetId ?? ''} options={[{ value: '', label: '— žádný —' }, ...p.assets.filter((a) => a.kind === 'image').map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => upd('Pozadí', (d) => { d.scene.backgroundAssetId = v || null; })} /></Row>
      </Section>
      <Section title="Měřítko podle hloubky">
        <Check label="Zapnuto" value={sc.depth.enabled} onChange={(v) => upd('Hloubka', (d) => { d.scene.depth.enabled = v; })} />
        <Row label="Daleko: Y / měřítko"><NumField value={sc.depth.yFar} onCommit={(v) => upd('Hloubka', (d) => { d.scene.depth.yFar = v; })} /><NumField value={sc.depth.scaleFar} step={0.05} min={0.1} max={3} onCommit={(v) => upd('Hloubka', (d) => { d.scene.depth.scaleFar = v; })} /></Row>
        <Row label="Blízko: Y / měřítko"><NumField value={sc.depth.yNear} onCommit={(v) => upd('Hloubka', (d) => { d.scene.depth.yNear = v; })} /><NumField value={sc.depth.scaleNear} step={0.05} min={0.1} max={3} onCommit={(v) => upd('Hloubka', (d) => { d.scene.depth.scaleNear = v; })} /></Row>
        <div className="muted small">Postavy se zmenšují lineárně podle svislé polohy chodidel (mimo rozsah se měřítko nemění). Vodorovný pohyb velikost nemění.</div>
      </Section>
      <Section title="Sněžení">
        <Row label="Zorný úhel kamery (°)"><NumField value={sc.fovDeg ?? 50} min={20} max={120} step={1} onCommit={(v) => upd('Zorný úhel kamery', (d) => { d.scene.fovDeg = v; })} /></Row>
        {(() => { const cam = cameraFor(sc); const near = toWorld(cam, { x: sc.width / 2, y: sc.depth.yNear }), far = toWorld(cam, { x: sc.width / 2, y: sc.depth.yFar }), wNear = toWorld(cam, { x: 0, y: sc.depth.yNear }); return sc.depth.enabled ? <div className="muted small">Skutečné rozměry podle kamery: hloubka od spodní po vzdálenou hranu {(far.Z - near.Z).toFixed(1)} m, šířka obrazu dole {(2 * Math.abs(wNear.X)).toFixed(1)} m, kamera {cam.h.toFixed(2)} m nad zemí. Užší zorný úhel = hlubší scéna; chůze do hloubky je na obrazovce pomalá (perspektiva).</div> : null; })()}
        <Row label="Max. sklon chůze (°)"><NumField value={sc.maxWalkSlopeDeg ?? 45} min={20} max={90} step={5} onCommit={(v) => upd('Sklon chůze', (d) => { d.scene.maxWalkSlopeDeg = v; })} /></Row>
        <div className="muted small">Postavy nikdy nejdou po obrazovce strměji (čistě dopředu/dozadu) – strmý úsek projdou šikmo. 90 = bez omezení.</div>
        <Check label="Padající sníh" value={sc.snowfall.enabled} onChange={(v) => upd('Sněžení', (d) => { d.scene.snowfall.enabled = v; })} />
        <Row label="Hustota"><NumField value={sc.snowfall.density} min={0} max={3} step={0.1} onCommit={(v) => upd('Sněžení', (d) => { d.scene.snowfall.density = v; })} /></Row>
        <Row label="Vítr"><NumField value={sc.snowfall.wind} min={-2} max={2} step={0.05} onCommit={(v) => upd('Sněžení', (d) => { d.scene.snowfall.wind = v; })} /></Row>
      </Section>
    </>
  );
}

export function RightPanel() {
  const p = useEditor((s) => s.project);
  const sel = useEditor((s) => s.selection);
  if (!p) return <div className="panel right" />;
  let body: React.ReactNode = <SceneProps p={p} />;
  if (sel) {
    const o = (sel.kind === 'object' || sel.kind === 'point') ? p.objects.find((x) => x.id === sel.id) : undefined;
    if (o) body = <ObjectProps o={o} p={p} />;
    else if (sel.kind === 'node' && p.nav.nodes.some((x) => x.id === sel.id)) body = <NodeProps id={sel.id} p={p} />;
    else if (sel.kind === 'edge' && p.nav.edges.some((x) => x.id === sel.id)) body = <EdgeProps id={sel.id} p={p} />;
    else if (sel.kind === 'area' && p.areas.some((x) => x.id === sel.id)) body = <AreaProps id={sel.id} p={p} />;
    else if (sel.kind === 'zone' && p.zones.some((x) => x.id === sel.id)) body = <ZoneProps id={sel.id} p={p} />;
    else if (sel.kind === 'character' && p.characters.some((x) => x.id === sel.id)) body = <CharacterProps id={sel.id} p={p} />;
    else if (sel.kind === 'event' && p.schedule.some((x) => x.id === sel.id)) body = <EventProps id={sel.id} p={p} />;
  }
  return <div className="panel right" data-testid="props-panel"><div className="panel-body">{body}</div></div>;
}
