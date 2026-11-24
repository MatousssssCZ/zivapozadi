# Audit a výzkumné závěry

## 1. Ověřený výchozí stav

Zdrojovým kódem ověřeno na commitu uvedeném v 00. Starší dokumentace v repozitáři místy zaostává: například FORMAT_ASSETU.md označuje skeleton backend jako budoucí, přesto jej současný renderer již používá. Při rozporu vycházej z kódu.

| Oblast | Skutečný stav | Dopad na rozšíření |
|---|---|---|
| Platforma | Electron + React + TypeScript, Canvas 2D, CLI render přes @napi-rs/canvas | Nepřevádět do 3D ani zavádět nový engine |
| Čas | src/core/sim/types.ts: 60 kroků/s, SIM_STATE_VERSION = 3 | Nový stav musí být součástí checkpointu |
| Projekt | formatVersion = 1, validate.ts a migrateProject | Nové trvalé nastavení musí jít uložit, načíst a validovat |
| Činnosti | registry.ts registruje pouze coffee a shop; runner je orientovaný na jednu postavu | Více účastníků potřebuje společnou session |
| Nákup | shop.ts má frontu, objednávku a receive, ale props: [] a ignoruje events | Reálné předání tašky/zboží ještě neexistuje |
| Káva | coffee.ts vytváří kelímek, pití, partnera a odložení do koše | Rozšířit, neduplikovat jako nový nezávislý systém |
| Setkání | Simulation.stepVisitor/startMeeting, VisitState a follow/rejoin | Navázat koordinaci na již existující návštěvníky |
| Prodavač | drawSeller jej vytváří dočasně při renderu; reaguje na zákazníkovy fáze | Pro manipulaci se zbožím a úklid potřebuje serializovatelný stav |
| Rekvizity | PropKind = cup, holding je jediný string; renderer kreslí všechny rekvizity jako kelímek | Nutný typový model předmětů a dvou rukou |
| Rezervace | Reservations: kapacita 1 na klíč, vlastníkem string ID; FIFO fronty | Skupinové transakce a rozlišení vlastníka postava/session |
| Pohyb | síť tras, A*, crowd, doprovod; kamera převádí zem do metrů | Zachovat, rozšířit o dočasné a trvalé runtime překážky |
| Sníh | oblasti snow, snowDepth, kontaktní stopy; pool 16384, životnost 180 s, fade 30 s | Nepsat stopy od nuly; úklid potřebuje změnu povrchu |
| Sněžení | drawSnowfall: hash(seed,index,time), stálá hustota a parametr wind | Proměnlivý vítr nesmí vyvolat skok poloh |
| Postavy | skeleton, malované díly front3q/back3q, zrcadlení | Nepředpokládat mimiku, prsty nebo skutečný profil |
| Animace | jeden action, talk/receive/drink/drop/lidDrop; talk má sinusový rytmus | Přidat střídmé variace a arbitráž rukou |
| Export | společné jádro, snapshot/restore, exportJobHash zahrnuje verzi simulace | Stejný seed a čas musí dát stejný děj |
| Demo radnice | 24 postav, 11 objektů, 1 oblast snow, 2 zóny shop/coffee | Nové zóny a rekvizity nejsou automaticky k dispozici |

Dále prohlédnut existující referenční obrázek docs/img/postavy-cg-na-namesti.png. Jde o snímek uložený v repozitáři, ne o nově ověřený běh GUI. Ukazuje malé malované postavy mezi relativně detailními stánky: čitelné bude natočení, silueta a rekvizita; subtilní mimika by stejně nepomohla.

## 2. Primární zdroje a jejich použití

Zdroje vyhledány a otevřeny 24. 11. 2026. Závěry níže jsou stručné; následné parametry jsou vlastní návrh pro tuto aplikaci.

### R1 – pohyb a skupiny

Craig W. Reynolds, Steering Behaviors For Autonomous Characters, 1999.
https://www.red3d.com/cwr/steer/gdc99/

Zdroj odděluje výběr činnosti, řízení pohybu a lokomoci a popisuje kombinace příjezdu k cíli, vyhýbání a následování. Pro projekt z toho plyne zachovat oddělení plánovače, crowd/pohybu a kostry. Žádná aktivita nesmí opravovat neúspěšné plánování teleportem. Není důvod přepisovat existující crowd algoritmus.

### R2 – střídání v rozhovoru

Stivers et al., Universals and cultural variation in turn-taking in conversation, PNAS, 2009, DOI 10.1073/pnas.0903616106.
https://pmc.ncbi.nlm.nih.gov/articles/PMC2705608/

Studie porovnává rozhovory v deseti jazycích a popisuje tendenci omezovat současné mluvení i dlouhé mezery, s kulturními rozdíly. Pro tiché animované pozadí použijeme střídání rolí mluvčí/posluchač. Přesné délky vět, frekvence kývání ani četnosti zimních gest z ní neodvozujeme. Vizuální gesto není přímý ukazatel skutečné řeči.

### R3 – prostor rozhovoru

Setti, Russell, Bassetti, Cristani, F-Formation Detection: Individuating Free-Standing Conversational Groups in Images, PLOS ONE, 2015, DOI 10.1371/journal.pone.0123783.
https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0123783

Studie pracuje se společným prostorem a orientací účastníků. Pro naši scénu navrhujeme dvojice v otevřeném úhlu nebo proti sobě a menší skupiny kolem společného středu. Je to inspirace prostorovým modelem, nikoliv použití jejich detektoru skupin. Rozestupy níže jsou návrhové hodnoty, ne univerzální sociální norma.

### R4 – čas simulace

Glenn Fiedler, Fix Your Timestep!, 2004.
https://gafferongames.com/post/fix_your_timestep/

Článek vysvětluje důsledky proměnlivého kroku a oddělení simulace od vykreslování. Zachováme pevný krok; determinismus navíc vyžaduje ukládat RNG, pořadí událostí a celý proměnný stav. Náhodu nevolat z rendereru.

### Doplňková rešeršní stopa

John Lasseter, Principles of Traditional Animation Applied to 3D Computer Animation, 1987, DOI 10.1145/37402.37407. Ve vyhledávání dostupný úryvek primárního článku: https://users.cs.northwestern.edu/~animation/Lasseter_1987.pdf . Otevření plného PDF skončilo timeoutem. Nebereme jej jako plně prostudovaný podklad ani zdroj číselných parametrů. Anticipaci a doznění dále specifikujeme jako vlastní animační návrh.

## 3. Doporučená rozhodnutí

1. Největší přínos nejprve přinese zlepšení existujících situací: skutečné zboží, klidnější rozhovor, prodavač a drobná gesta.
2. Společné aktivity potřebují jedno autoritativní řízení, jinak každý účastník může začít jinou fázi.
3. Jednoduché drobnosti lze vytvořit na současné kostře. Děti, pes a hluboké předklony potřebují výtvarnou pozornost, nikoliv pouze menší měřítko dospělého.
4. Sněhulák je runtime objekt s kolizí a životností celé simulace. Nesmí měnit dokument projektu při každém přehrání.
5. Časování nesmí být založené na frekvenci vykreslování ani na systémovém čase.
6. Reálný průzkum neprokázal četnost koulovaček či délku stavění sněhuláků. Všechny jejich délky a pravděpodobnosti v tomto balíčku jsou autorské výchozí nastavení k doladění.
