# 18 zimních aktivit – stav implementace a předávka

Zadání: `Ziva_pozadi_18_aktivit_zadani_pro_Claude.md`. Tento dokument je předávka podle kap. 10:
co je hotové pro každé ID, kde se nastavuje, jak to spustit, co bylo skutečně přehráno a ověřeno
a co chybí. Vizuálně ověřené znamená: vyrenderované snímky průběhu celé epizody jsem prohlédl
(kontrolní skripty níže); u ostatních to výslovně uvádím.

## Mapování na moduly projektu (kap. 1)

| Koncept zadání | Modul projektu |
|---|---|
| Kostra, IK, pózy z klíčů (kontakty) | `src/core/anim/skeleton.ts` (`applyKey`, nově `applyHands`), `src/core/anim/fallPoses.ts` (klíče póz, `sampleKeys`) |
| Cíle rukou / úchopy (bedýnka, madlo, kbelík, cedule) | `AnimState.hands` (`src/core/anim/animator.ts`) – IK na bod v rovině chůze, paže se nikdy neprodlužují |
| Skupiny, rezervace, koordinátor | sessions `src/core/sim/sessions.ts` + rezervace `reservations.ts` |
| Scénické režisérské události (jedna autorita) | `bakery.ts`, `pram.ts`, `sled.ts`, `tram.ts` v `src/core/sim/` |
| Pevný krok, determinismus | `SIM_DT` = 1/60 s, stav je JSON, náhoda ze seedu |
| Diagnostika | ladicí překryv (`src/renderer/overlay.ts`, „Ladění bruslení“ zobrazí i pekárnu/tramvaj), nabídka akcí na pravém tlačítku (`ActionMenu.tsx`), kontrolní skripty `scripts/*-check.ts` |

## Stav po aktivitách

| ID | Stav | Co je hotové / co chybí |
|---|---|---|
| A01 běžkování | **neimplementováno** | Chybí rig lyží a holí (osa lyže, vázání s volnou patou, hrot hole). Lze udělat na rovné zasněžené cestě, ale v tomto kole nezačato. |
| A02 bobování/sáňkování ze svahu | **blokováno podkladem** | Žádná scéna nemá kopec. Zadání zakazuje simulovat sjezd na vizuálně rovné ploše. Potřeba: pozadí s mírným svahem (5–12°), dojezdem a bočním návratem. Vektorové saně i boby a fyzika skluzu (tření, odpor sněhu) jsou připravené. |
| A03 tahání dítěte na saních | **hotovo** (Liberec) | Saně mají vlastní fyziku: tření skluznic, odpor sněhu, velký boční odpor, provaz jen v tahu (limit délky, měkký náběh, omezená špička síly). Při zastavení rodiče saně dojedou a provaz povolí, o nohy rodiče se zarazí. Dítě je postava z kostry v sedu (`sit: sled`), trup reaguje na zrychlení. Model je vektorový 3D (sáně / boby). **Chybí:** nasednutí a výstup dítěte v obraze (průchod začíná i končí mimo obraz) a péče rodiče o dítě (úprava čepice). |
| A04 první lyžování | **blokováno podkladem** | Potřeba svahu (3–7°) s dojezdem a rig lyží; nezačato. |
| A05 rodič + dítě na saních | **blokováno podkladem** | Potřeba svahu. Dvousedadlový model saní zatím není. |
| A06 vyšlapávání hlubokým sněhem | **částečně (dřívější)** | Boty se boří do sněhu podle hloubky (`snowDepth`), chůze se zpomalí, stopy vznikají jen pod zatíženou botou a přetrvají. **Chybí:** zvedání kolen podle hloubky, dítě šlapající do stop dospělého, zhutnění stopy pro další průchod. |
| A07 sněhový anděl | **hotovo, vizuálně ověřeno** (Liberec) | Session rodič + dítě, rezervuje se celá plocha. Dítě se přes dřep a sed položí, udělá 3 tahy (různé amplitudy), chvíli leží, vstává přes sed a dřep s rukou k rodiči, který se ke dítěti skloní. Otisk vzniká z tahů, jeho rozsah jen přibývá. Při vstávání zůstane otisk ruky a bot, celý otisk přetrvá (900 s) a pozvolna zapadá. Konfigurace: zóna `activityType: 'snowAngel'`. **Omezení:** ležící postava je dvourozměrná projekce stávajícího rigu (boční pohled), ruce se nesevřou s rukou rodiče (jen se k sobě natáhnou). |
| A08 stavba pevnosti | **neimplementováno** | Lze postavit na materiálovém modelu sněhu z kooperativního sněhuláka (`coopSnowman.ts`: odběr sněhu, bilance hmoty). |
| A09 hledání spadlého předmětu | **dřívější implementace (B03)** | Rukavice spadne z ruky, postava si všimne, vrátí se, dřepne a zvedne tentýž předmět. Pokud ne, zvedne ho a schová kolemjdoucí. Oprášení zatím chybí. |
| A10 chytání vloček | **dřívější implementace (B01)** | Jen za sněžení dítě zvedne dlaně a sleduje je, rodič počká. Vločka se nenavádí. |
| A11 zdobení stromku | **neimplementováno** | Mechanika předávání ozdob s košíkem existuje u sněhuláka (`coopSnowman.ts`). Pro stromek chybí body na větvích a kyvadlo ozdob. |
| A12 světýlka ve výloze | **neimplementováno** | Lze postavit na pekaři a cílech rukou. Chybí schůdky a výstup po stupních. |
| A13 odnášení stromku | **neimplementováno** | Chybí prodejní místo se stromky a koordinace dvou nositelů. |
| A14 zastavení u výlohy | **hotovo** (Tramvajová ulice) | Rodič s dítětem zastaví u výlohy pekárny. U výlohy si první všimne dítě, ukáže na konkrétní bod a oba se dívají na tentýž cíl. Rodič zareaguje po prodlevě (ukáže také), pak společně odejdou. **Chybí:** stání dítěte na špičkách. |
| A15 rozhovor sousedů | **dřívější implementace** | Setkání, pozdrav a rozhovor se střídáním mluvčího (`src/core/social`): gesta, přikyvování, přenos váhy. |
| A16 fotografování rodiny | **částečně (dřívější)** | Focení u stromu: telefon je skutečná rekvizita v obou rukou, s pauzou a uložením. **Chybí:** fotograf, který fotí seskupenou rodinu. |
| A17 kočárek a deka | **hotovo, vizuálně ověřeno** (Tramvajová ulice) | Vektorový 3D kočárek s madlem v rukou rodiče. Natáčí se omezenou rychlostí, nikdy kolem středu. Kola se otáčejí podle ujeté dráhy (dφ = ds/r, vnitřní a vnější zvlášť), otočná kolečka mají zpoždění. Brzda se zatáhne až po zastavení a pak se kola netočí. Rodič obejde kočárek na vzdálenou stranu, předkloní se v kyčlích a kolenou a uhladí deku (stav deky přetrvá), vrátí se k madlu, odbrzdí a odjede. Korba je odpružená. Kočárek je překážka pro chodce. Konfigurace: `project.pram`. |
| A18a zametání | **hotovo, vizuálně ověřeno** | Pekař s koštětem: tahy s kontaktem, val a drobky, zametené místo pozvolna zapadá. |
| A18b posyp chodníku | **hotovo, vizuálně ověřeno** | Kbelík drží vzdálená ruka před tělem. Blízká ruka nabere v kbelíku, švihem předloktí uvolní dávku a zrnka letí balisticky z ruky. Kbelík má konečný počet dávek (doplní se uvnitř). Posyp leží a pozvolna zapadá. |
| A18c přenesení bedýnky | **hotovo, vizuálně ověřeno** | Bedýnku nese oběma rukama u madel. Pro zvednutí i položení se přidřepne (kolena a kyčle). Bedýnka zůstane, kde ji položil (je překážka), a při další epizodě ji odnese zpět dovnitř. Nikdy neexistuje dvakrát. |
| A18d otočení cedule | **hotovo, vizuálně ověřeno** | Cedule „Otevřeno ↔ Hned jsem zpět“ visí na dveřích (otáčí se i s křídlem). Pekař k ní zvedne ruku a otočí ji kolem závěsu. Strana se přepne v hranové poloze, text není nikdy zrcadlový a po puštění cedule dozní. Stav přetrvá až do dalšího gesta. |

## Spuštění a diagnostika

* Nabídka akcí (pravé tlačítko ve scéně) nabízí:
  * Tramvajová ulice: „Pekař jde zametat (A18a)“, „Pekař sype chodník (A18b)“, „Pekař přenese bedýnku (A18c)“ a „Přijde rodič s kočárkem (A17)“;
  * Liberec: „Dítě udělá sněhového anděla (A07)“.
* Ladicí překryv („Ladění bruslení“ v tramvajové scéně) vypisuje krok pekaře, stav cedule, bedýnky a kbelíku a počty hotových variant.
* Kontrolní skripty (renderují průběh epizody do PNG a vypisují fáze):
  ```bash
  npx tsx scripts/shop-check.ts obchod.png
  ```
  ```bash
  npx tsx scripts/pram-check.ts kocarek.png
  ```
  ```bash
  npx tsx scripts/angel-check.ts andel.png
  ```
  ```bash
  npx tsx scripts/sled-check.ts sane.png
  ```
  ```bash
  npx tsx scripts/sled-preview.ts modely-sani.png
  ```
* Cílené testy:
  * `tests/shopCare.test.ts`: všechny varianty A18 proběhnou, cedule se mění jen gestem, bedýnka se nezdvojí a kbelík nejde do mínusu;
  * `tests/pram.test.ts`: kola odpovídají dráze, při brzdě se netočí a deka se upraví;
  * `tests/snowAngel.test.ts`: otisk jen přibývá, nikdo nezůstane ležet, místo se uvolní a otisk přetrvá;
  * `tests/sledPhysics.test.ts`: provaz se nenatáhne ani netlačí, saně dojedou bez chvění a nejedou bokem;
  * `tests/accessories.test.ts`: fyzika šály a bambule nezávislá na fps.

## Fyzikální profily a parametry

* Saně: `SLED_PHYS` v `src/core/sim/sled.ts`.
* Kočárek: `PRAM` v `src/core/sim/pram.ts`.
* Pekárna: `BakeryConfig.tasks` (váhy variant), `interval`, `GRIT_DOSES`, `GRIT_LIFE`.
* Anděl: časování `ANGEL_KEYS` / `ANGEL_TIMES` v `fallPoses.ts`, `ANGEL_LIFE`.
