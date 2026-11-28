# Zasněžená městská ulice — zadání pro Claude
Použij přiložené pozadí a současné systémy aplikace Živá pozadí. Jde o grafický podklad a návrh chování, nikoli hotovou implementaci. Vozidla vytvoř jako 3D objekty, lidi pomocí stávajícího vektorového systému. Zachovej nostalgický malovaný styl, modrý podvečer a teplá okna.

## Kompozice a vrstvy
Pozadí má 1672 × 941 px. Pevná kamera s mírným nadhledem. Souřadnice níže jsou orientační podíly šířky a výšky a vyžadují kontrolu v aplikaci.
Fasády končí kolem y=0.52, vzdálenější chodník je kolem 0.54, parkování kolem 0.59. Silnice je přibližně mezi 0.61 a 0.74, přední parkování vlevo kolem 0.78, přední chodník kolem 0.83. Dětská plocha je vpravo dole kolem [0.75,0.92]. Vjezd vpravo nahoře slouží pro vzácné zapadnutí.
Veškeré dopravní trasy kalibruj podle skutečné šířky modelů. Auta nesmějí přesahovat do protisměru jen proto, aby byla větší.
Doprava je pravostranná: bližší pruh jede zleva doprava, vzdálenější zprava doleva. Trasy vodorovné, vozidla po délce ulice nemění velikost.
Namalované parkovací značky nejsou spolehlivá geometrická měřítka: umísti méně aut a respektuj jejich rozměry, podle potřeby překryj značení dynamickým sněhem.
Parkovaná auta, všechny odhrnovatelné závěje, sněhulák, lopaty, smetáky a tažné lano jsou samostatné objekty aplikace. V pozadí nejsou jejich kopie. Pevné keře v levém popředí jsou neprůchozí; neplánuj za nimi interakce bez odpovídající překryvné masky.
Postavy se správně řadí před a za vozidla. Při nastupování použij skutečný otvor dveří, interiér a maskování postavy karoserií. Nikdo neprochází zavřenými dveřmi auta ani namalovanými dveřmi domu. Pro příchody použij okraje scény nebo samostatně implementované dveře.

## Sníh jako měnitelný stav
Základní obrázek je spodní podklad. Nad vozovkou a vybranými chodníky vytvoř maskované vrstvy čerstvého sněhu, jejichž pokrytí a výška se mohou měnit. Neodstraňuj sníh globálním zeslabením celého obrázku.
Každé auto má oddělené sněhové plochy střechy, kapoty, kufru, skel a boků. Ukládej množství sněhu i po skončení animace. Zásah smetáku odstraňuje sníh lokálně; shluky padají směrem dolů a drobně přispějí k hromádce vedle auta. Žádné okamžité přepnutí zasněžené/čisté.
Sníh znovu přibývá jen pomalu při aktivním sněžení. Odhrnutý chodník, ometené auto i hotový sněhulák zůstávají ve změněném stavu. Reset mimo záběr nebo nenápadně v rámci dlouhodobého střídání scény, nikoli skokem před divákem.

## Běžná doprava a parkování
Převážně klidná ulice, krátké mezery mezi jednotlivými auty, žádná nepřetržitá kolona. Vozidla mají rozestupy, plynulé brzdění a kontrolu obsazeného prostoru. Kola odpovídají ujeté vzdálenosti.
Zaparkovaná auta nejsou dekorace: každý vůz má vlastníka, stav sněhu a případný plán odjezdu. Při příjezdu rezervuj místo, zpomal, signalizuj a zaparkuj skutečným manévrem. Návrat do provozu povol jen při dostatečné mezeře. Dveře a člověk u auta mají vlastní kolizní obrys.

## Ometání před odjezdem
Majitel přijde k autu, prohlédne ho, vezme smeták a postupně obejde dostupné strany. Ometá střechu, skla, kapotu a další plochy; nesmí dosahovat přes celý vůz bez přemístění. Pohyby rukou sledují povrch a sníh ubývá pouze v místech kontaktu.
Po dokončení uloží pomůcku, otevře dveře, nastoupí, zavře, rozhlédne se a teprve pak vyjede. Silně zasněžený vůz nesmí odjet s neprůhledným čelním sklem ani velkou čepicí sněhu na střeše.
Ometání orientačně 25–50 sekund; jde o režijní zkrácení, ne simulaci skutečné doby.

## Shrnovák s posypem
Občas projede komunální vůz s přední radlicí a zadním sypačem. Radlice skutečně odhrnuje dynamickou vrstvu vozovky a za vozem zůstává očištěný pás. Posyp se rozptyluje nízko za vozem v omezeném pruhu; vizuálně není bílý sněhový gejzír.
Při míjení zaparkovaných aut část nízké sněhové spršky dopadne na jejich spodní boky a oblast kol. Změna se projeví v jejich sněhové vrstvě a zůstane vidět. Nezasypávej celá auta mohutnou vlnou. Drobné odstříknutí mohou dělat i běžná auta podle množství břečky.
Pokud u auta stojí člověk, vůz zpomalí a omezí spršku; děti ani chodce nezasypává. Výchozí interval průjezdu 4–7 minut.

## Vzácné zapadnutí a vyproštění
Událost přibližně jednou za 10–15 minut, nikdy současně více aut. Vhodné místo je boční vjezd vpravo nebo okraj parkování, nikoli náhodný střed čistého jízdního pruhu.
Auto se pokusí vyjet přes dynamickou závěj, kola proklouznou, karoserie se mírně pohne, ale postup se zastaví. Omez počet pokusů, nevytvářej nekonečné protáčení.
Řidič zastaví, krátce situaci zkontroluje a přivolá pomoc. Traktor přijede z okraje, zastaví v použitelném směru tahu. Nejdříve rezervuj prostor a zastav konfliktní dopravu.
Připojení lana vyžaduje klid obou vozidel a postavu u skutečných tažných bodů. Pak osoba odstoupí. Lano nejprve prověšené, po pomalém rozjezdu se napne; auto následuje až po přenosu tahu. Žádné trhání, teleport nebo tažení pod úhlem skrz jiné auto.
Po uvolnění oba zastaví, lano povolí, postava odpojí a uloží lano, traktor odjede a zachráněné auto se zařadí do provozu. Během tahu nikdo nestojí mezi vozidly. Jde o stylizovanou herní událost, nikoli návod k reálnému vyprošťování.

## Chodníky a děti
Lidé uklízejí krátké úseky před domy. Lopata tlačí malou vrstvu, zvedá přiměřenou dávku a vysypává ji na vyhrazený okraj, nikoli do silnice nebo přes kolemjdoucí. Průchozí část zůstává volná. Odklizená místa jsou skutečně vidět.
Děti s rodičem staví sněhuláka na ploše vpravo v popředí. Postup: nabrat sníh, vytvořit základ, válet rostoucí kouli, umístit základ, společně zvednout druhou kouli, doplnit hlavu a ozdobit. Koule rostou postupně, ruce mají kontakt, rodič pomáhá s těžší částí. Hotový sněhulák zůstane a děti si jej mohou chvíli prohlížet. V místě sběru sněhu lze lehce ubrat pokrytí.
Děti nevstupují do vozovky, parkovacích manévrů ani prostoru traktoru. Další drobné dění: procházky, pes s majitelem, krátké pozdravení sousedů. Nezahlcovat scénu současnými atrakcemi.

## Režie a ověření
Běžně 5–9 chodců, nejvýše jedna dopravní mimořádná událost. Stavba sněhuláka a občasný úklid mohou běžet souběžně mimo dopravu. Časy a počty jsou návrhové hodnoty.
Ověř celou posloupnost ometení–nástup–výjezd, kompletní odhrnování s posypem a nahazováním aut, kompletní vyproštění včetně lana a stavbu sněhuláka. Použij debug spouštění událostí, nečekej na náhodné intervaly.
Kontroluj kontakty nohou, kol a nástrojů, dveřní masky, kolize protisměru, přetrvávající změny sněhu a správné pořadí překrývání. Všechny vrstvy jednotně škáluj s pozadím. Částice a stopy mají omezenou kapacitu. Výkon změř v aplikaci; balíček netvrdí žádné naměřené FPS.



## Doplněné samostatné prvky — kompletní verze 2
Balíček nyní obsahuje původní pozadí, celé zadání a pět transparentních PNG ve složce prvky. Nepotřebuješ předchozí balíček.

| Soubor | Počáteční kontakt se zemí (x,y) | Výška vůči obrazu |
|---|---|---|
| lampa.png — vzdálená instance | (0.25,0.56) | 0.17 |
| lampa.png — blízká instance | (0.53,0.88) | 0.24 |
| lavicka.png | (0.61,0.91) | 0.085 |
| strom.png | (0.985,0.985) | 0.40 |
| plotek.png — první úsek | (0.72,0.86) | 0.055 |
| plotek.png — druhý úsek | (0.87,0.86) | 0.055 |
| kos.png | (0.545,0.91) | 0.065 |

Souřadnice jsou návrhové a vyžadují kontrolu v aplikaci. Výška se vztahuje k celému PNG; ukotvení odvoď od skutečné paty objektu v alfa masce, nikoli automaticky od spodní hrany plátna. Zachovej poměr stran a průhlednost. Strom může přesahovat pravý okraj, ale kmen nesmí zabírat místo pro sněhuláka. Jeho koruna může částečně překrývat projíždějící auta.

Plůtek umísti mezi dětskou plochu a chodník, nech dostatečně širokou mezeru pro rodiče s dítětem. Je to nízká dekorativní hranice; chování dětí musí nezávisle zakazovat vstup do vozovky. Přístup k autům, jejich dveřím a bočnímu vjezdu musí zůstat volný. Pokud prvky kolidují s animacemi, posuň dekorace, nikoli jízdní pruhy.

Lampy, koš a kmen mají lokální kolizní půdorys. Kolemjdoucí se řadí před nebo za objekt podle kontaktu se zemí. Průhledné mezery mezi větvemi a plaňkami musí zůstat průhledné. Nezaměňuj celý obdélník PNG za neprůchozí plochu. Světlo lampy řeš samostatnou jemnou září bez kolize.

Lavička je dodaná jako jediný celistvý obrázek. Pro chůzi před a za ní stačí hloubkové řazení. Pokud přidáš sezení, vytvoř masky opěradla, sedáku a předních područek, aby postava seděla uvnitř tvaru a nepřekrývala nesprávné části. Samostatné rozdělené vrstvy lavičky nejsou v balíčku; bez těchto masek zatím používej lavičku jen jako dekoraci.

Závěrečná kontrola: každý PNG na pozadí bez barevného obdélníku; průchod před a za lampou; auto za korunou stromu; mezera v plůtku; žádná dekorace v jízdní dráze nebo prostoru tažného lana. Původní pravidla dopravy, sněhu, ometání aut, úklidu chodníků a stavby sněhuláka zůstávají platná.
