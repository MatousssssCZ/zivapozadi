# Rodič a dítě staví sněhuláka

Modul `src/core/activities/coopSnowman.ts`. Kdykoli jde rodina (rodič se stálým dítětem) stavět sněhuláka, staví ho rodič s dítětem spolu. Dvojice dospělých dál staví původním postupem (`snowman.ts`).

## Průběh (podmínky, ne časovače)
Každý z dvojice má vlastní úkol. Kroky se posouvají podle stavu: dojití na místo, dosažená hmotnost, položená koule, vyplněný spoj, převzetí koule. Sdílený stav stavby a rezervace (koule, předměty v košíku, prostor zvedání) jsou v datech session.

| Rodič | Dítě souběžně |
|---|---|
| nabere sníh, uplácá a válí **spodní kouli** (50 cm) po pásech až na místo | nabere sníh, uplácá a uválí **hlavu** (24 cm) |
| válí **prostřední kouli** (36 cm) | připraví ozdoby v košíku, nosí sníh, uhladí spodní kouli |
| **zvedne prostřední**: přidřep → úchop → zvednutí k hrudi → nese ji → nad stavbu → položí → pustí → odstoupí | drží odstup mimo dráhu zvedání (prostor zvedání rezervuje rodič) |
| čeká | **vyplní spoj** sněhem, který přinesl (hmotnost se připočte ke stavbě) |
| **převezme hlavu**: dítě ji přinese, obě ruce na kouli, převzetí, dítě pustí; když rodič není volný, dítě hlavu položí a rodič ji zvedne sám | |
| nasadí hlavu | |
| **zdobení z košíku** souběžně: vzít → nést → přiložit → pustit | dítě jen ozdoby do výšky svého dosahu (0,85 m, tj. knoflíky); oči, nos a šálu dává rodič |
| odstoupí a ukáže na dílo | odstoupí a radostně zvedne ruce |
| odchod (dítě se znovu připojí k rodiči) | |

## Materiál
- **Vrstva sněhu:** 5 cm, 180 kg/m³ (9 kg/m²) v mřížce 5 cm. Stav zóny přetrvá i pro další stavby a ubraný sníh se už znovu nenabere.
- **Vznik koule:** nabráním kotouče o poloměru 14 cm (≈ 0,55 kg).
- **Růst koule:** jen ze sněhu v pásu pod sebou:
  - šířka styku w = 2·√(2rh − h²),
  - poloměr r = ∛(3m / (4π·300 kg/m³)) (uplácaný sníh),
  - natočení koule (textura se otáčí) += dráha / r.
- **Stopa:** kde se sníh ubral, zůstane prošlapaný pás.
- **Přehmátnutí:** po každé čtvrtotáčce koule se ruce znovu chytí.
- **Zachování hmoty:** sníh ubraný ze země = koule + spoj + sníh v náručí (chyba < 1·10⁻⁹ kg).

## Ladění
- V horní liště je volba **„Ladění sněhuláka“** a tlačítko **„Postavit sněhuláka“** (nejbližší volná rodina začne hned). Zpomalení a pauza jsou ve spodním panelu.
- Překryv ukazuje:
  - úkol a krok obou postav,
  - koule (průměr, hmotnost, stav, kdo ji drží),
  - rezervace,
  - stav předání hlavy a čáru kontaktu,
  - košík,
  - bilanci sněhu.
- Kontrolní scéna: `npx tsx scripts/coop-snowman-check.ts [projekt] [složka] [--jen=val|zved|predani]` → vypíše měření a uloží `sneh-faze.png` a `sneh-ladeni.png`.
  - Volba `--jen` uloží snímky jen dané části (válení, zvedání, předání).
  - Stavba se vždy simuluje celá, aby stav na začátku části byl skutečný.

## Ověřeno (`tests/coopSnowman.test.ts`, Liberec)
- **Pořadí milníků:** spodní → prostřední → spoj → hlava → ozdoby → odchod.
- **Průměry** do ±9 % od cíle. Naměřeno 49,5 / 37,2 / 25,1 cm.
- **Bilance sněhu** (≈ 30,6 kg) sedí na 10⁻¹³ kg.
- **Souběžná práce** 35 s v 6 dvojicích úkolů (válení × hlava, válení × pomoc, zvedání × pomoc, …).
- **Odstup dítěte** od dráhy zvedání je nejméně 1,6 m.
- **Předání hlavy:** přiblížení → kontakt (postavy 0,75 m od sebe) → převzetí → puštění.
- **Ozdoby:** dítě dalo jen knoflíky, rodič oči, nos a šálu.
- **Stav nezávisí na FPS** (60 vs. 30 s výpadky) a obnovení z JSON stavu uprostřed stavby dává shodný průběh.

## Omezení
- **Košík a ozdoby v ruce** jsou kreslené vektorově. Malovaný košík chybí; uhlíky a mrkev na hotovém sněhulákovi jsou malované sprity.
- **Ruce na kouli** při nesení a předání vedou gesta (předpažení, přidřep), ne přesné IK na povrch koule. Koule leží před tělem ve výšce hrudi (u dítěte níž).
- **Dráhy válení** jsou pásy („had“) v dětské zóně. Na jiném tvaru zóny se omezí na její šířku.
