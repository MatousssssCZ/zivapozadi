# Odklízení sněhu (A11) – postava, lopata a sníh jako jeden systém

## Co je implementováno
- **Materiálový model sněhu** (`src/core/sim/snowMaterial.ts`, světové metry, deterministický):
  mřížka 5 × 5 cm (povrch, vytlačený sníh, hromada), val před listem, náklad na listu, shluky ve vzduchu.
  Každý přesun odečte z jedné zásoby a přičte do druhé; bilance drží na ~1e-13 kg.
  Hrnutí zpracovává plochu, kterou pracovní hrana skutečně prošla mezi dvěma stavy (nezávislé na kroku);
  zpětný pohyb ani stání nic nehrne; na dlažbě zůstává tenký film. Přebytek valu nad mez soudržnosti
  uniká do stran. Nabrání bere jen kapacitu listu (objem × hustota valu, limit hmotnosti). Odhoz:
  3–5 shluků z oblasti nákladu s rychlostí listu (p = p0 + v t + ½ g t²), dopad na místní povrch včetně
  výšky hromady, hmotnost se uloží právě jednou; hromada sesedá podle sypného úhlu; přilnavý zbytek
  zůstává na listu (oklepnutí). Okraj dlažby drží hromadu (sníh nesesedá zpět do vyčištěné stopy).
- **Lopata jako tuhý nástroj** (`skeleton.ts` – `solveShovel`, `AnimState.tool`): řízení určuje jen polohu
  pracovní hrany v rovině chůze (u vpřed, h nad zemí); kostra najde natočení násady, při kterém obě dlaně
  skutečným IK dosednou na úchopy (D-držadlo, dolní úchop) a paže se nenatahují; kreslí se jedinou
  afinní maticí spritu (úchopy jsou body téhož spritu). List nikdy neprochází zemí (nejnižší bod obrysu
  listu leží přesně v h). Pokrčení kolen a předklon trupu jsou součástí pózy nástroje.
- **Řízení činnosti** (`src/core/sim/clearing.ts`): fáze příprava 0,6 s → nasazení 0,5 → hrnutí
  (0,5–0,9 m, se zvětšujícím se valem kratší a pomalejší) → přehmátnutí / krátké narovnání → podle
  množství valu a polohy hromady: nabrání 0,6 → zdvih 0,9 (×1–1,6 podle nákladu, zatížená křivka) →
  natočení k hromadě **přešlápnutím** (nebo dojde blíž) → odhoz 0,7 (zrychlení do uvolnění, doběh) →
  případně oklepnutí → návrat 1,8 (uvolněná křivka) – nebo na konci pruhu **vytlačení valu za okraj**.
  Po všech pruzích kontrola plochy, dočištění pruhu se zbytkem, odchod. Kolemjdoucí práci pozastaví.
  Pohyb těla jen skutečnými kroky (chodidla kotvená k zemi). Události (nabrání, uvolnění, oklepnutí)
  se spouštějí při překročení okamžiku a jsou jištěné příznakem. Variace ze seedu (hashNoise).
  Při sněžení přibývá vrstva podle intenzity; nová návštěva až když je co odklízet.
- **Vykreslení** (`src/core/render/snowRender.ts`): odkrytá dlažba podle zbývající vrstvy (měkká maska
  z mřížky → nepravidelné okraje, tenké zbytky), val a hromada z výškové mapy, shluky ve vzduchu,
  náklad na listu (sprite podle objemu).

## Parametry
- Sníh: `DEFAULT_SNOW` v `snowMaterial.ts` (vrstva 4 cm, 200 kg/m³, šířka listu 0,4 m, soudržnost 0,5,
  přilnavost 0,05, film 4 %, objem listu 9 l, limit 3 kg, hustota valu 280 / hromady 330 kg/m³,
  sypný úhel 36°, buňka 5 cm). Pro scénu lze přepsat v `project.clearing.snow`.
- Časy fází: `TIMES` v `clearing.ts`; pózy nástroje: `P` tamtéž; práh nabrání `SCOOP_AT`, dosah odhozu `MAX_THROW`.
- Scéna: `project.clearing` = `{ workerId, work: {x0,x1,z0,z1} (m), pileAt: {X,Z}, enter, approach, firstDelay }`
  (Liberec: `scripts/generate-liberec-demo.ts`).

## Kontrolní scéna a ladění
- `npx tsx scripts/clearing-check.ts demo/Liberec-zivy-trh.zscena docs/img` – výpis fází a zásob, bilance,
  snímky `odklizeni-faze.png` a `odklizeni-ladeni.png`.
- Editor: zaškrtnout **Ladění odklízení** (mřížka sněhu, pracovní hrana, úchopy a dlaně, opěrné body chodidel,
  fáze, zásoby povrch / val / list / vzduch / okraj+hromada), tlačítka **Jeden cyklus** a **Reset situace**,
  rychlost přehrávání až 0,1×, pauza. Nic z toho se nevykresluje do exportu.
- Testy: `tests/snowMaterial.test.ts` (A–D, F, G na modelu), `tests/clearing.test.ts` (E, G, F na celé
  činnosti, jednorázové události, dlaně na úchopech, list nad zemí, jeden cyklus z ladění).

## Omezení a chybějící podklady
- Pracovník používá běžné díly postavy; předklon je natočení trupu (chybí malovaný trup v pracovním
  předklonu a díly pro pokrčená kolena) – viz `docs/ZADANI_GRAFIKA_CHATGPT_2.md`, část 3.
- Lopata má jediný boční pohled; při práci směrem ke kameře se jen perspektivně zkracuje (chybí pohledy
  z 5 směrů). Sníh na listu je jeden sprite škálovaný podle objemu.
- Val, hromada a shluky jsou kreslené procedurálně (přechody barev podle výšky), nikoli malované – vzhled
  je zjednodušený, množství odpovídá modelu.
- Pracovní pruhy vedou podél osy X scény; obecný tvar plochy (polygon) zatím není podporovaný.
