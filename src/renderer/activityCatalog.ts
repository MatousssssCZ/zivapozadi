/**
 * Katalog aktivit pro galerii (sandbox): každá položka ví, ve které scéně běží, jak ji spustit,
 * na co zaměřit kameru a jaké návazné akce nabídnout. Spouštění používá skutečné API simulace –
 * galerie nic nepředstírá, jen čerstvou simulaci rychle převine do chvíle, kdy jde akci spustit.
 */
import type { Simulation } from '../core/sim/simulation';
import type { TrickKind } from '../core/sim/rink';
import type { FallVariant } from '../core/anim/fallPoses';

export type SceneKey = 'liberec' | 'tram' | 'pastel';
export type Status = 'done' | 'partial' | 'blocked' | 'todo';
export interface R { ok: boolean; msg: string }
export interface FollowUp { label: string; run: (sim: Simulation) => R | string; hint?: string }
export interface CatalogEntry {
  id: string; code?: string; name: string; group: string; scene: SceneKey | null; status: Status;
  desc: string;
  /** spuštění; volá se opakovaně při převíjení, dokud nevrátí ok (nejvýš `maxWait` s) */ start?: (sim: Simulation) => R;
  maxWait?: number;
  /** zaměření kamery (px scény) a/nebo postava, kterou kamera sleduje */ focus?: { x: number; y: number; w: number; h: number };
  follow?: (sim: Simulation) => string | null | undefined;
  actions?: FollowUp[];
  /** proč nejde (blokované / chybí) */ missing?: string;
}

const TRICKS: [TrickKind, string][] = [['jump', 'Skok s otočkou'], ['arabesque', 'Holubička'], ['spin', 'Pirueta'], ['backward', 'Jízda vzad'], ['oneFoot', 'Skluz na jedné noze']];
const FALLS: [FallVariant, string][] = [['back', 'Pád dozadu do sedu'], ['forward', 'Zakopnutí dopředu'], ['side', 'Uklouznutí bokem'], ['saved', 'Zachycené uklouznutí']];
const ok = (msg: string): R => ({ ok: true, msg });
const fallR = (s: string, sim: Simulation): R => ({ ok: sim.state.agents.some((a) => a.name === s), msg: s });
const sessAgent = (sim: Simulation, type: string, role: string) => { const s = sim.state.sessions?.find((q) => q.type === type); if (!s) return null; return Object.entries(s.roles).find(([, r]) => r === role)?.[0] ?? s.participantIds[0]; };
const bakerActions: FollowUp[] = [
  { label: 'Zametání (A18a)', run: (s) => s.bakerNow('sweep') },
  { label: 'Posyp (A18b)', run: (s) => s.bakerNow('salt') },
  { label: 'Bedýnka (A18c)', run: (s) => s.bakerNow('crate') },
  { label: 'Přijede tramvaj', run: (s) => s.tramNow() },
];
const BAKERY = { x: 120, y: 380, w: 760, h: 430 };
const rinkActions: FollowUp[] = [
  ...TRICKS.map(([k, l]) => ({ label: l, run: (s: Simulation) => s.triggerRinkEvent('trick', null, k) })),
  { label: 'Pád na ledě', run: (s) => s.triggerRinkEvent('fall') },
];

export const CATALOG: CatalogEntry[] = [
  // ------------------------------------------------------------ ulice (Tramvajová ulice)
  { id: 'tram', name: 'Tramvaj a cestující', group: 'Ulice', scene: 'tram', status: 'done', desc: 'Tramvaj přijede zprava, plynule zabrzdí u zastávky, otevře dveře, cestující vystoupí a nastoupí, dveře se zavřou a vůz odjede.', start: (s) => s.tramNow(), focus: { x: 900, y: 250, w: 1020, h: 560 }, actions: [{ label: 'Další tramvaj', run: (s) => s.tramNow() }] },
  { id: 'A18a', code: 'A18a', name: 'Zametení sněhu u vstupu', group: 'Péče o obchod', scene: 'tram', status: 'done', desc: 'Pekař otevře dveře, vyjde s koštětem, otočí ceduli a tahy s kontaktem zametá tenkou vrstvu sněhu. Zametené místo pozvolna zapadá.', start: (s) => s.bakerNow('sweep'), focus: BAKERY, follow: () => 'ch_pekar', actions: bakerActions },
  { id: 'A18b', code: 'A18b', name: 'Posypání chodníku', group: 'Péče o obchod', scene: 'tram', status: 'done', desc: 'Kbelík před tělem, nabrání v kbelíku, švih předloktí – zrnka letí z ruky a zůstanou ležet. Kbelík má konečný počet dávek.', start: (s) => s.bakerNow('salt'), focus: BAKERY, follow: () => 'ch_pekar', actions: bakerActions },
  { id: 'A18c', code: 'A18c', name: 'Přenesení bedýnky', group: 'Péče o obchod', scene: 'tram', status: 'done', desc: 'Bedýnku s pečivem nese oběma rukama, přidřepne si při položení i zvednutí. Bedýnka zůstane, kde ji položil; příště ji odnese zpět.', start: (s) => s.bakerNow('crate'), focus: BAKERY, follow: () => 'ch_pekar', actions: bakerActions },
  { id: 'A18d', code: 'A18d', name: 'Otočení cedule', group: 'Péče o obchod', scene: 'tram', status: 'done', desc: 'Při odchodu ven pekař rukou otočí ceduli „Hned jsem zpět“, při návratu zpět na „Otevřeno“. Strana se přepne v hraně, cedule pak dozní. (Součást epizod pekaře – cedule se otáčí v 60 % epizod.)', start: (s) => s.bakerNow('sweep'), focus: { x: 150, y: 380, w: 420, h: 330 }, actions: bakerActions },
  { id: 'A17', code: 'A17', name: 'Kočárek a úprava deky', group: 'Rodina', scene: 'tram', status: 'done', desc: 'Rodič tlačí kočárek (kola podle ujeté dráhy), u lavičky zastaví a zabrzdí, obejde kočárek, předkloní se a uhladí deku, vrátí se k madlu, odbrzdí a odjede.', start: (s) => s.pramNow(), follow: () => 'ch_kocarek', actions: [{ label: 'Další kočárek', run: (s) => s.pramNow() }] },
  { id: 'A14', code: 'A14', name: 'Zastavení u výlohy', group: 'Rodina', scene: 'tram', status: 'done', desc: 'Rodič s dítětem jdou kolem pekárny; dítě si první všimne, ukáže do výlohy, oba se dívají na stejné místo, rodič zareaguje. (Vzniká samo během procházek – v galerii se čeká, až rodina přijde.)', start: (s) => ({ ok: (s.state.agents.some((a) => a.activity?.type === 'viewing')), msg: 'Rodina u výlohy.' }), maxWait: 400, focus: BAKERY },
  // ------------------------------------------------------------ Liberec – trh a sníh
  { id: 'A03', code: 'A03', name: 'Tahání dítěte na saních', group: 'Saně a lyže', scene: 'liberec', status: 'done', desc: 'Saně mají vlastní fyziku: provaz jen v tahu, tření, dojíždění. Dítě z kostry sedí a trup reaguje na rozjezd.', start: (s) => s.sledNow(), maxWait: 120, follow: () => 'kid_sane', actions: [{ label: 'Další jízda', run: (s) => s.sledNow() }, { label: 'Saně ↔ boby', run: (s) => { const c = s.project.sled; if (!c) return { ok: false, msg: 'Scéna nemá sáňky.' }; c.kind = c.kind === 'boby' ? 'sane' : 'boby'; return { ok: true, msg: c.kind === 'boby' ? 'Dítě se veze na bobech.' : 'Dítě se veze na dřevěných sáňkách.' }; } }] },
  { id: 'A07', code: 'A07', name: 'Sněhový anděl', group: 'Sníh', scene: 'liberec', status: 'done', desc: 'Dítě si přes dřep a sed lehne, udělá tři tahy, s pomocí rodiče vstane. Otisk vzniká z tahů a zůstane.', start: (s) => s.startSnowAngelNow(), maxWait: 300, focus: { x: 420, y: 760, w: 560, h: 320 }, follow: (s) => sessAgent(s, 'snowAngel', 'child') },
  { id: 'snowman', name: 'Sněhulák rodič + dítě', group: 'Sníh', scene: 'liberec', status: 'done', desc: 'Válení koulí z materiálu sněhu, zvedání, předání hlavy, zdobení z košíku.', start: (s) => s.startCoopSnowmanNow(), maxWait: 300, focus: { x: 950, y: 720, w: 620, h: 360 }, actions: [{ label: 'Koulovačka', run: (s) => s.startFightNow() }] },
  { id: 'fight', name: 'Koulovačka dětí', group: 'Sníh', scene: 'liberec', status: 'done', desc: 'Děti se koulují, koule letí balisticky; rodiče se dívají z kraje.', start: (s) => s.startFightNow(), maxWait: 300, focus: { x: 950, y: 720, w: 620, h: 360 } },
  { id: 'A09', code: 'A09', name: 'Spadlá rukavice', group: 'Drobné situace', scene: 'liberec', status: 'done', desc: 'Rukavice vypadne z ruky, chodec si všimne, vrátí se, dřepne a zvedne tentýž předmět.', start: (s) => s.mittenNow(), maxWait: 120, follow: (s) => s.state.mitten?.agentId, actions: [{ label: 'Znovu', run: (s) => s.mittenNow() }] },
  { id: 'A10', code: 'A10', name: 'Chytání vloček', group: 'Drobné situace', scene: 'liberec', status: 'done', desc: 'Za sněžení se rodina zastaví a dítě chytá vločky do dlaní; rodič počká.', start: (s) => { const r = s.flakesNow(); return r.ok ? { ok: !!s.state.flakes?.kidId, msg: r.msg } : r; }, maxWait: 300, follow: (s) => s.state.flakes?.kidId },
  { id: 'falls', name: 'Pády chodců', group: 'Drobné situace', scene: 'liberec', status: 'done', desc: 'Tři varianty pádu a zachycené uklouznutí; pomocník přijde a pomůže.', start: (s) => fallR(s.triggerFall('back', 1, { helper: true }), s), maxWait: 60, actions: FALLS.map(([v, l]) => ({ label: l, run: (s: Simulation) => fallR(s.triggerFall(v, 1, { helper: true }), s) })) },
  { id: 'A15', code: 'A15', name: 'Rozhovor sousedů', group: 'Drobné situace', scene: 'liberec', status: 'done', desc: 'Setkání, pozdrav a rozhovor se střídáním mluvčího. Vzniká samo – galerie převine do prvního pozdravu.', start: (s) => ({ ok: s.state.log.some((l) => l.msg.includes('se zdraví')), msg: 'Sousedé se zdraví.' }), maxWait: 400 },
  // ------------------------------------------------------------ kluziště
  { id: 'rink', name: 'Bruslení: prvky a pády', group: 'Kluziště', scene: 'pastel', status: 'done', desc: 'Bruslaři na ledě; vyberte prvek – skok s otočkou, holubičku, piruetu, jízdu vzad, skluz na jedné noze nebo pád.', start: (s) => s.triggerRinkEvent('trick', null, 'jump'), maxWait: 90, follow: (s) => s.state.rink?.event?.id, actions: rinkActions },
  // ------------------------------------------------------------ zatím chybějící / blokované
  { id: 'A01', code: 'A01', name: 'Běžkování', group: 'Saně a lyže', scene: 'tram', status: 'done', desc: 'Klasický střídavý běh po rovné stopě: rychlost přibývá jen při odrazu (zatížená lyže + opřená hůl), jinak skluz s třením. Fáze kroku podle ujeté dráhy, paže a nohy křížově, pata zadní nohy se zvedá, zapíchnutý hrot hole drží místo. Pauza o hole, rozjezd krátkými kroky. Střídá se jistý běžkař a začátečník. Za ním zůstane stopa.', start: (s) => s.episodeNow('ep_bezky'), follow: () => 'ch_bezkar', actions: [{ label: 'Další běžkař (střídá jistý / začátečník)', run: (s) => s.episodeNow('ep_bezky') }] },
  { id: 'A02', code: 'A02', name: 'Bobování a sáňkování ze svahu', group: 'Saně a lyže', scene: null, status: 'blocked', desc: '', missing: 'Žádná scéna nemá kopec – zadání zakazuje sjezd po vizuálně rovné ploše. Potřebné pozadí: mírný svah 5–12° s dojezdem a bočním návratem.' },
  { id: 'A04', code: 'A04', name: 'První lyžování dítěte', group: 'Saně a lyže', scene: null, status: 'blocked', desc: '', missing: 'Potřeba svahu 3–7° s dojezdem.' },
  { id: 'A05', code: 'A05', name: 'Rodič a dítě společně na saních', group: 'Saně a lyže', scene: null, status: 'blocked', desc: '', missing: 'Potřeba svahu.' },
  { id: 'A06', code: 'A06', name: 'Vyšlapávání hlubokým sněhem', group: 'Sníh', scene: 'liberec', status: 'partial', desc: 'Boty se boří podle hloubky sněhu, chůze se zpomalí, stopy vznikají pod zatíženou botou a přetrvají. Chybí vysoké zvedání kolen a dítě ve stopách dospělého.' },
  { id: 'A08', code: 'A08', name: 'Stavba sněhové pevnosti', group: 'Sníh', scene: 'tram', status: 'done', desc: 'Dvě děti: jedno nabírá sníh v dřepu (hrouda roste v dlaních) a nosí ji oběma rukama, druhé pokládá a uhlazuje; v polovině si role vymění. Zeď roste po jednotlivých hroudách, v místě odběru vzniká prohlubeň. Hotová vrstva zůstane, další epizoda přidá další.', start: (s) => s.episodeNow('ep_pevnost'), focus: { x: 1250, y: 760, w: 640, h: 330 }, actions: [{ label: 'Přistavět další vrstvu', run: (s) => s.episodeNow('ep_pevnost') }] },
  { id: 'A11', code: 'A11', name: 'Zdobení venkovního stromku', group: 'Rodina', scene: 'tram', status: 'done', desc: 'Rodič přinese krabici s ozdobami, dítě vybírá ozdoby; nízké větve zdobí samo, vysoké podá rodiči (předání rukama), zavěšené ozdoby se kývají a zůstanou. Krabice ubývá, obsazené háčky se znovu nepoužijí.', start: (s) => s.episodeNow('ep_zdobeni'), follow: () => 'ch_herec_dite', actions: [{ label: 'Další zdobení', run: (s) => s.episodeNow('ep_zdobeni') }] },
  { id: 'A12', code: 'A12', name: 'Světýlka ve výloze', group: 'Péče o obchod', scene: 'tram', status: 'done', desc: 'Květinářka přinese štafle, vystoupá po stupních, upevňuje úseky řetězu na háčky (průvěs z konečné délky), sestoupí a přenese štafle, nakonec stiskne vypínač – světla se rozsvítí až tímto gestem.', start: (s) => s.episodeNow('ep_svetylka'), focus: { x: 560, y: 360, w: 520, h: 420 }, follow: () => 'ch_kvetinarka' },
  { id: 'A13', code: 'A13', name: 'Vybírání a odnášení stromku', group: 'Rodina', scene: 'tram', status: 'done', desc: 'Dva dospělí prohlížejí stromky (pohled od paty ke špičce), jeden ukáže, druhý obejde stromek. Vytáhnou ho ze stojanu, sklopí, převezmou úchopy a nesou ho téměř vodorovně; zadní jde po stopě předního. Stromek zmizí z nabídky až při zvednutí.', start: (s) => s.episodeNow('ep_stromky'), follow: () => 'ch_herec2', actions: [{ label: 'Další pár pro stromek', run: (s) => s.episodeNow('ep_stromky') }] },
  { id: 'A16', code: 'A16', name: 'Fotografování', group: 'Drobné situace', scene: 'liberec', status: 'partial', desc: 'Focení u stromu telefonem (skutečná rekvizita v obou rukou). Chybí fotograf a seskupená rodina.' },
];

export const STATUS_LABEL: Record<Status, string> = { done: 'hotovo', partial: 'částečně', blocked: 'chybí podklad', todo: 'zatím chybí' };
export const SCENE_LABEL: Record<SceneKey, string> = { liberec: 'Liberec – živý trh', tram: 'Vánoční tramvajová ulice', pastel: 'Pastelové kluziště' };
