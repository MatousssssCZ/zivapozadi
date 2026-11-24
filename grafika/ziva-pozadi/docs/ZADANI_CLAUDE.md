# Implementační zadání

## Cíl a rozhodnutí

Nově navržená scéna libereckého náměstí, rodinný vánoční trh, modrá hodinka, tradiční bohatá výzdoba. Pevná kamera z úrovně náměstí, přibližně 2,6 m; jde o výtvarnou perspektivu, nikoli geometricky zaměřenou fotografii. Počítač, poměr stran 16:9. Žádná interakce diváka, přibližování ani denní cyklus. Radnice a její celá věž musí zůstat čitelné, vstup nesmí zakrýt stánek ani strom.

Referenční rastr má 1672 × 941 px, tedy téměř 16:9. V aplikaci zachovat jednotný transform celého světa: ideálně contain v cílové ploše, případně nepatrné oříznutí okraje. Neškálovat x/y postav nezávisle. Schválený koncept má přednost před původní slovní tabulkou pozic; nové pozice v JSON odpovídají tomuto konceptu přibližně.

## Architektura scény

Pozadí → podlahové efekty a stopy → hloubkově řazené objekty a návštěvníci → lokální efekty páry a sněhu. Sněžení rozdělit na vzdálenou a přední vrstvu. Interiéry stánků jsou lokální podscény. Nezařazovat prodavače do globálního řazení mezi běžné návštěvníky.

`config/scene.json` používá normalizované souřadnice 0–1, počátek nahoře vlevo. Objekt x,y = dolní střed jeho zobrazovacího obdélníku, ne vrchol obrázku. w,h jsou podíly šířky/výšky celého obrazu. Všechny objekty potřebují po prvním sestavení jemnou kalibraci podle viditelné alpha siluety.

Stánky vlevo: nápoje vpředu, jídlo uprostřed, perníčky vzadu. Vpravo: ozdoby vpředu, svíčky uprostřed, hračky vzadu. Čtyři historické lampy, strom napravo od hlavní osy, betlém a schránka u jeho paty. Dvě lavičky na okrajích popředí, dva nápojové stolky vlevo, několik malých smrčků. Muzikanti vzadu vlevo od hlavní osy pouze občas.

## Perspektiva a překrývání

Počáteční odhad horizontu y=0,52. Výška dospělého při chodidlech y=0,90 je 0,23 výšky obrazu. Vzorec v JSON je jen kalibrační aproximace; v záběru otestovat postavu u předního, prostředního a zadního stánku. Dítě přibližně 70 % výšky dospělého ve stejné hloubce. Psi a kočky mají vlastní skutečnou relativní výšku. Na přímém přechodu napříč obrazem nesmí výška postavy kolísat.

Každá postava má stabilní ground anchor mezi chodidly. Krok se řídí uraženou vzdáleností, ne pouze časem. V opěrné fázi chodidlo neklouže. Při zastavení doznít krok, vyrovnat váhu, poté idle. Úhlové změny vyhlazovat; přední/zadní pohled přepínat s hysterezí podle směru chůze. Horizontální zrcadlení je přijatelné pro orientaci vlevo, ale zrcadlí světlo; nepoužívat ho k vytvoření zadního pohledu.

Globální řazení podle kontaktního bodu se zemí a skutečné průchozí hrany, ne podle horního okraje sprite. Pro strom použít masku koruny a ověřit přechod před/za kmenem. Pro rozměrné stánky použít footprint a zakázat průchod jejich objemem; prosté přepnutí z-indexu uprostřed půdorysu nestačí. Lampy mají úzkou pevnou základnu, kolem které se chodí. Stín je samostatná měkká deformovaná elipsa přizpůsobená kontaktu a lokálnímu světlu; nedělat silné černé fleky.

## Navigace

Trasy v JSON jsou vodicí polyliny, ne garantovaný navigační mesh. Vytvoř footprint polygon každé překážky při zemi, nafoukni o poloměr chodce a ověř všechny úseky. Když úsek koliduje, přepočítej lokální cestu; neprocházet dekorací a nepřeskočit ji teleportem. Na rohu trasy se chodci nepřeklápějí okamžitě.

Hlavní cesta: popředí → střed → schody radnice. Boční příchody se napojují přes vnitřní okraje trhu. Trasa k pravým stánkům obchází dětský prostor. Sáňky jedou po zasněženém spodním okraji, nikoli prostředkem odhrnuté dlažby. Dětská zóna se nepoužívá jako hlavní koridor. Strom se obchází vlevo a podél pravého okraje pouze tam, kde zbývá skutečný prostor.

Fronty jsou nejvýše tři místa. První stojí u obslužného bodu; další místa vedou podél vnitřní hrany stánku. Rezervace slotu je atomická: dva chodci nemohou zvolit stejné místo. Po odchodu se fronta posune až po uvolnění místa. Počáteční body v JSON mohou vyžadovat posun po zkoušce v rendereru. Skupina se nesmí zastavit v hlavním koridoru, pokud je vedle volná sociální zóna.

Spawn/despawn mimo okraj nebo za ověřenou neprůhlednou překážkou. Dveře radnice mají samostatný práh: otevřít → postava překročí práh → zavřít. Nezmizet před zavřenými dveřmi. Katastrofální blokaci řešit zrušením cíle a novým cílem, nikoli přesunem viditelné postavy.

## Chování a rytmus

Výchozí obsazení 24 návštěvníků včetně dětí, šest prodavačů, nejvýše dva psi a jedna vzácnější kočka. Není to pevný výkonový slib; hustotu upravit podle měření. Nezapínat všechny události současně. Prioritní jsou nakupování, povídání s nápoji, rodiny se sáňkami, dětské hraní a zvířata.

| Událost | Výchozí délka | Omezení a návaznost |
|---|---:|---|
| Nákup | 12–35 s | Přijít, fronta, pohled na zboží, gesto prodavače, převzetí, odejít |
| Povídání/pití | 20–70 s | 2–3 lidé, střídavá gesta; hrnek patří do ruky a pára k hrnku |
| Rodič a dítě | 25–65 s | Sdílená trasa, dítě přizpůsobí rychlost; případné držení ruky má společný cíl |
| Sáňky | jeden průchod | Rodič, lano a sáňky sdílejí pohyb; žádné protažení lana skrz lidi |
| Sněhulák | 45–100 s | Rezervace dětské zóny, nabrat/kutálet/položit, trvalý stav koulí |
| Koulovačka | 12–25 s | Nejvýše dvě děti, oblouk mezi nimi uvnitř zóny, krátká pauza mezi hody |
| Pes | průběžně | Vodítko napojené na ruku a obojek, zastavení u majitele, očichávání |
| Kočka | 15–45 s | Okraj scény, posed, čištění, vzácný skok na ověřenou plochu |
| Fotka | 6–12 s | Zastavení v zóně u stromu, zvednutí telefonu, malé gesto, odchod |
| Údržba | 15–35 s | Vzácně; sníh z lopaty přidat ke konkrétní hromadě, nezmizí ve vzduchu |
| Radnice | 5–9 s | Nízká četnost, synchronizace dveří a průchodu |
| Koledníci | 40–90 s | Vzácná dvojice, zpočátku bez zvuku, nevytvářet velký dav |

Časy jsou návrhové hodnoty, randomizovat jednotlivé intervaly i starty. Globálně nejvýše jedna výrazná dětská událost a jedna vzácná událost současně. Psi mají vlastní cooldown po očichávání; setkání psů potřebuje dvě rezervace a souhlas stavu obou skupin. Hladící osoba musí nejdřív dojít a pokleknout, ruka má cíl na hřbetu psa.

Stavový automat jednotlivce: spawn → walk → arrive → reserve → interact → release → walk → exit. Přerušení interakce vždy uvolní všechny sloty a navázané rekvizity. Skupiny mají koordinátor a členové nesmějí nezávisle přepnout na nesouvisející úkol. Na opuštění tabu animace pozastavit; po návratu nepřeskočit dlouhý časový krok.

## Světlo a počasí

Zdrojové stánky, strom a lampy mají základní světlo již namalované. Nepřidávat na ně plošný oranžový filtr ani druhý silný bloom. Runtime světelné plochy mají být slabé a pod objekty. Okna pomalu přecházejí mezi dvěma stavy; neblikají jako reklama. Světýlka na stromě přirozeně velmi jemně kolísají, nikoli synchronní stroboskop. Sníh padá ve dvou až třech hloubkách se společným větrem, jemně a bez trvalého zakrývání dění.

## Realizace v pořadí

1. Prozkoumat repo, renderer, současné rigy a nastavení rozlišení; nic nepřepisovat bez důvodu.
2. Statické prostředí a měřítko podle preview, doladit pozice a footprinty.
3. Jeden dospělý, jedno dítě, jeden prodavač — průchod v celém hloubkovém rozsahu a správné překrytí.
4. Export výřezů, rigy a stavové automaty; doplnit čtyřnožce ze supplementu.
5. Prioritní interakce, fronty a skupiny; potom méně časté události.
6. Dveře, okna, pára, sněžení a jemné dekorativní pohyby.
7. Měření výkonu a přejímka. Cílit na 60 fps na běžném desktopu, ale reportovat skutečně naměřené zařízení a fps; fallback omezí počet postav/částic, nikoli správnost navigace.
