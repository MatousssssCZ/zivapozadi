# Živá pozadí – výzkum a implementační balíček pro Claude Code

Datum: 24. 11. 2026. Jazyk: čeština. Revize 2 – doplněni psi a kočky.
Analyzovaný repozitář: https://github.com/MatousssssCZ/zivapozadi
Referenční commit: `b448f2b319e3823668c9a53ea1eac3229f37002d` (main v okamžiku stažení).

## Prompt pro Claude Code

Implementuj rozšíření vánočních městských scén podle tohoto balíčku. Výzkum a audit výchozího kódu jsou hotové; neopakuj celý výzkum. Nejprve porovnej současný checkout s referenčním commitem a zohledni případné novější změny. Respektuj místní AGENTS.md a uživatelské změny.

Přečti postupně 01_AUDIT_A_ZDROJE.md, 02_ARCHITEKTURA.md, 03_KATALOG_CINNOSTI.md, 04_ANIMACE_A_GRAFIKA.md , 05_IMPLEMENTACE_A_TESTY.md a 07_PSI_A_KOCKY.md. `navrh_parametru.json` je návrh ladicích dat, nikoliv existující formát projektu nebo hotový modul. Převod do typů aplikace proveď při implementaci.

Zachovej Electron, React, TypeScript, Canvas 2D, malované skládané postavy, pevný krok simulace a export přes společné jádro. Použij existující systémy shop, coffee, návštěvníků, dvojic, tras a rezervací. Změny dělej po etapách popsaných v souboru 05, průběžně ověřuj a pokračuj přes všechny etapy. Neomez se na sepsání dalšího návrhu.

Cíl: přirozený klidný vánoční trh, běžné lidské činnosti, jemné prostředí, vzácné drobné příběhy, koulovačka, postupná stavba sněhuláka a psi a kočky podle Z01–Z10. Všechny položky katalogu patří do rozsahu. Chybějící grafika může blokovat zveřejnění konkrétního efektu, nikoliv ostatní nezávislé práce. Nepředstírej, že virtuální animační klip znamená viditelně hotovou animaci. Bez potřebného podkladu aktivitu v běžné scéně nenabízej jako hotovou, ale dokonči její logiku, testovací scénář a přesný seznam chybějících podkladů.

Nepřepisuj uživatelské scény. Přidej samostatnou demonstrační scénu s kopiemi potřebných assetů. Uživatel nastavuje místa aktivit v editoru, nemusí upravovat JSON. Technickou diagnostiku dej do vývojářského režimu. Neprováděj automaticky push, publikování ani release.

Před odevzdáním proveď testy a vizuální kontrolu náhledu i krátkého exportu. Dolož dokončené aktivity, zablokované aktivity a konkrétní příčinu, nové ovládání, změny formátu a výsledky ověření.

## Obsah balíčku

| Soubor | Účel |
|---|---|
| 01_AUDIT_A_ZDROJE.md | Co skutečně existuje, omezení, primární zdroje a závěry |
| 02_ARCHITEKTURA.md | Koordinace skupin, rezervace, rekvizity, prostředí a export |
| 03_KATALOG_CINNOSTI.md | Všechny požadované situace včetně průběhu, četností a ukončení |
| 04_ANIMACE_A_GRAFIKA.md | Konkrétní pohyby pro současnou kostru a podklady pro grafiku |
| 05_IMPLEMENTACE_A_TESTY.md | Pořadí práce, integrační místa, akceptace a ověření |
| navrh_parametru.json | Výchozí hodnoty navržené k vizuálnímu doladění |
| 06_OVERENI_VYCHOZIHO_STAVU.md | Skutečně provedené kontroly při přípravě balíčku |
| 07_PSI_A_KOCKY.md | Psi a kočky: 10 situací, navigace, vodítko, rigy, editor a testy |

## Co balíček je a není

Jde o implementační specifikaci založenou na přečteném kódu, dokumentaci, existujícím referenčním obrázku a odborných zdrojích. Není to hotová implementace ani nově vytvořená grafika. Nové situace zatím nebyly animovány ani vizuálně validovány. Číselné hodnoty označené jako návrh nejsou naměřené chování reálných vánočních trhů.
