# Živá pozadí — předání pro Claude Code

Závazná varianta je první návrh z úrovně náměstí, nikoli pozdější pohled z 10 metrů. Schválený výtvarný cíl: `reference/approved_concept.png`.

## Co je v balíku

- 23 nově vytvořených PNG a původní přední arch dospělé postavy.
- Čisté náměstí bez návštěvníků, stánků, stromu, lamp a padajících vloček.
- Šest samostatných stánků, samostatný strom a arch vybavení náměstí.
- Dítě zepředu a zezadu, zadní pohled dospělého, díly předklonu, pes, kočka, doplněk pro chůzi zvířat, sáňky se sedícím dítětem.
- Rekvizity, sníh, sněhulák, pára, girlandy a překryvné díly dveří a oken.
- 82 samostatně vyříznutých PNG a 12 vrstev stánků v exported/, vytvořených z původních pixelů bez překreslení.
- JSON rozmístění, tras, interakcí, výřezů a konzervativních masek pro prodavače.
- `PREVIEW.html`: lokální kontrolní náhled statického sestavení, plán tras a galerie průhledných podkladů. Otevřít po rozbalení. Nejde o finální aplikaci ani ukázku hotových animací.

## Instrukce k převzetí

1. Přečti `docs/ZADANI_CLAUDE.md`, `docs/GRAFIKA_A_VRSTVY.md` a `docs/AKCEPTACE.md`.
2. Projdi existující aplikaci a zachovej její funkční animace a renderer. Balík neurčuje nový framework.
3. Nejdřív sestav statickou scénu a porovnej ji se schváleným konceptem. Koncept není runtime pozadí — obsahuje lidi a rekvizity, které by se jinak zdvojily.
4. Přenes source PNG, atlasové výřezy a konfigurační data. Zdrojové soubory nemaž; změny výřezů, pivotů a barev dělej vratně.
5. Dokonči rigy, kalibraci masek a tras. Potom připoj chování a proveď přejímací kontroly.

## Důležité vymezení připravenosti

Grafika je výtvarný zdroj pro implementaci, nikoli již odladěný sprite pack s hotovými rigy. Některé položky jsou atlasové archy. Souřadnice a pivoty jsou výchozí návrh. Dveře a okna jsou nové překryvné patche; nejsou pixelově shodné s architekturou. Stánky mají master a přesně lícující přední/zadní vrstvy pro konzervativní centrální otvor prodavače. Nejde o šest plně rekonstruovaných skrytých interiérů. To není skrytá závislost: bezpečný postup sestavení je uveden v dokumentaci.

Grafika byla vytvořena vestavěným generováním obrázků. Sada zadávacích promptů je v `config/generation_prompts.json`. Zdrojová PNG se při tvorbě předávací konfigurace nepřekreslovala.

## Text, který lze vložit Claude

> Implementuj redesign živého vánočního náměstí podle tohoto balíku. Začni START_HERE.md. Závazný je první návrh reference/approved_concept.png, nikoli kamera z 10 metrů. Projdi současný projekt, zachovej použitelné části a dokonči scénu v existující aplikaci. Nejdřív ověř statické sestavení a perspektivu, potom dokonči výřezy a rigy, správné překrývání a pěší trasy, potom chování. Nepovažuj odhadnuté pivoty ani masky za finálně ověřené. Neumísťuj celou ilustraci s lidmi jako pozadí pod další postavy. Použij dodanou malovanou grafiku. Výsledek má samostatně žít, bez ovládacích prvků a klikacích interakcí pro diváka. Proveď kontroly z docs/AKCEPTACE.md a stručně popiš skutečně dokončené a zbývající části.
