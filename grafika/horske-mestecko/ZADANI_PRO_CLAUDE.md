# Horské městečko — růžový západ slunce
## Zadání pro Claude Code / Živá pozadí

Vytvoř v existující aplikaci samostatnou scénu z přiložených podkladů. Nejprve projdi současný renderer, správu postav, zvířat, aktivit a scén. Znovu použij stávající funkční systémy; toto zadání nepředpokládá konkrétní knihovnu ani vyžaduje přepis aplikace.

Uživatel zvolil horské městečko, nostalgickou pohlednicovou ilustraci, růžový západ slunce a aktivity: bobování, běžky, procházky, venčení psů a občasný průjezd traktoru odhrnujícího sníh. Vozidlo vytvoř programově jako stylizovaný 3D objekt. Lidé a psi mají navazovat na stávající vektorové postavy projektu.

## 1. Obsah balíčku a stav
- assets/pozadi.png — čistá malovaná scéna, 1672 × 941 px (poměr přibližně 16 : 9).
- assets/smrk.png — samostatný zasněžený smrk, PNG s alfa kanálem.
- assets/lampa.png — samostatná vánoční lampa, PNG s alfa kanálem.
- scena.json — počáteční konfigurace umístění a tras v normalizovaných souřadnicích.
- tento dokument — sestavení, chování, překrývání, integrace a vizuální ověření.

Jde o grafické podklady a implementační zadání, nikoli o implementovanou nebo v aplikaci otestovanou scénu. Trasy a velikosti v JSON jsou návrhové odhady z obrázku. Je nutné je vizuálně doladit v editoru vůči terénu a měřítku postav. Není přiložena hudba ani model traktoru. Obraz má vlastní kompozici; výchozí reference sloužily k určení výtvarného směru.

## 2. Vzhled a kamera
Pevná kamera, mírný nadhled. Nepoužívej zoom ani změny úhlu: malované pozadí neobsahuje skutečnou 3D geometrii. Růžovo-broskvové světlo, levandulové stíny, teplá okna, tlumené barvy oděvů s několika červenými akcenty. Postavy ani traktor nesmí vypadat plastově nebo přehnaně leskle.

Zachovej poměr stran zdrojového obrazu. Výchozí prezentace je 16 : 9, případné nepatrné dorovnání rámečkem. Nevytahuj obraz nezávisle v obou osách. Při jiné velikosti viewportu měň jednotně celý scene-root včetně tras, masek a interakčních bodů. U úzkých obrazovek raději zachovej celou scénu s okraji, než oříznout nástup na svah.

Souřadnice: u = x / šířka, v = y / výška; [0,0] je levý horní roh. Body tras označují kontakt nohou či vozidla se zemí, nikoli střed těla. Velikost objektu se uvádí jako podíl výšky celého obrazu. U průhledných PNG se anchor vztahuje k celému původnímu plátnu, včetně průhledných okrajů. Při ořezu alfa okrajů ho přepočítej.

## 3. Prostorové uspořádání
### Bobovací svah vlevo
Nástup přibližně [0.115,0.315], sestup šikmo doprava dolů, dojezd kolem [0.48,0.67]. Dvě blízké sjezdové trasy v široké volné ploše, žádný slalom mezi stromy. Nezajíždět do levé výstupové pěšiny ani do valu nad chodníkem.

Dojezd je plochý a musí stačit na zastavení ještě před chodníkem. Levá vyšlapaná cesta slouží pro návrat nahoru. Po dojezdu dítě vstane, vezme boby a přes volnou spodní část svahu přejde k výstupu. Návrat se koordinuje s dalšími jízdami: další dítě nesmí být vypuštěno do konfliktní dráhy. Žádné teleportování z dojezdu na vrchol.

### Běžky vpravo
Využij dvojici namalovaných stop v pravé střední části. Trasa vede od bližšího bodu kolem [0.69,0.55] obloukem k pravé části městečka [0.94,0.39]. Nevkládej běžkaře na bobovací svah, schody, chodník nebo silnici. Další část okruhu může být mimo záběr za pravým okrajem; nedělej z ničeho novou nesouvisející namalovanou stopu.

### Procházky a psi
Hlavní chodník vede nad silnicí, od levého okraje přibližně v = 0.79 k pravému okraji v = 0.70. Průchozí šířku drž uvnitř skutečného chodníku. Lidé se mohou na dvou širších místech zastavit a sledovat děti. U domů použij jen samostatnou vzdálenou trasu podél prahů; nepropojuj ji přímkou přes běžkařskou stopu a svah.

### Silnice pro traktor
Spodní široký pás mezi sněhovými okraji. Přibližný střed stopy od [-0.08,0.87] přes [0.50,0.89] do [1.08,0.78]. Vizuálně dolaď skutečnou křivku mezi oběma okraji. Traktor musí mít po celé dráze místo pro šířku radlice. Průjezd nesmí zasahovat do pěšího chodníku nebo dojezdu bobů.

## 4. Sestavení a překrývání
1. Základní obraz.
2. Tenké lokální vrstvy sněhu a stop, ohraničené maskami příslušných ploch.
3. Kontaktní stíny.
4. Postavy, zvířata, boby, lyže, lampa a další objekty se správným hloubkovým pořadím.
5. Smrk v pravém blízkém rohu jako vědomá popřední clona.
6. Jemné lokální světlo lampy a řídké pohyblivé vločky v několika hloubkách.

V základním obrázku již nejsou nové popřední lampy ani tento smrk, takže nevznikne jejich dvojí otisk. Dálkové stromy a drobné dekorace u domů jsou součást malby a samostatně se nepohybují.

Lampa u chodníku potřebuje pozici kontaktu se zemí, malou kolizní oblast u paty a změnu pořadí podle toho, zda člověk prochází před ní nebo za ní. Zář lampy se nesmí použít jako neprůhledná maska. Smrk umísti na blízký sněhový okraj vpravo, mimo průjezd; zakrytí části vozidla korunou je záměrné. Před stromem nevede průchozí trasa, takže tato instance může být fixní popřední vrstva. Při přesunu stromu mezi trasy už musí mít hloubkové řazení.

Na svahu nestačí globálně řadit objekty podle obrazového y. Vytvoř jednoduchou pomocnou reprezentaci terénu: rovina silnice, rovina chodníku, nakloněný svah, rovina dojezdu a běžkařská plocha. Udržuj odděleně prostorovou hloubku a výšku terénu. Pozadí samo zůstává 2D. Hraniční případy ošetři explicitními vztahy překrývání či maskou.

Výchozí instance jsou v JSON. Pokud smrk zakrývá moc silnice nebo lampa hlavní sjezd, posuň je k okraji nebo zmenši. Hlavní dění musí zůstat viditelné.

## 5. Měřítko
Přibližná výška dospělého v popředí na chodníku 6–8 % výšky obrazu, u domů 2,5–4 %. Dítě podle věku přibližně 60–80 % výšky dospělého ve stejném místě. Jde o výchozí výtvarnou kalibraci, ne o biologickou tabulku.

Měřítko odvozuj od kamery / plochy / vzdálenosti, ne od absolutního obrazového y u všech objektů. Dítě stojící na vyšší části kopce nesmí být malé pouze proto, že je v obraze výš. Rychlost na obrazovce musí odpovídat perspektivě a tempu pohybového cyklu.

## 6. Klidný každodenní život
Následující počty a časy jsou nastavitelné režijní výchozí hodnoty, nikoli fyzikálně ověřené konstanty. Nepouštěj všechny aktivity synchronně.

### Bobování
- Přibližně 4–6 dětí v celém okruhu; běžně jen 1–2 současně sjíždějí.
- Jeden až dva rodiče sledují svah nebo pomohou menšímu dítěti.
- Cyklus: příchod → vyčkání → položení bobů → usednutí → odraz → jízda → brzdění → zastavení → vstání → uchopení šňůry → návrat pěšky.
- Průjezd křivkou řídí fyzika či zjednodušený model sklonu, tření a brzdění. Žádná konstantní rychlost po celém svahu. Jedna jízda může výtvarně trvat přibližně 7–12 s.
- Na začátku lehký předklon, při jízdě drobné reakce trupu, při brzdění jasný přenos váhy. Nohy a ruce se nesmějí protínat s boby.
- Šňůra je během jízdy volná a při tahání reaguje na vzdálenost ruky a bobů; boby nesmějí klouzat před dítětem do kopce.
- Sněhový prášek jen při kontaktech a brzdění, úměrný rychlosti. Stopy lokální, postupně slábnou.
- Před startem rezervuj sjezdovou dráhu a její dojezd. Další dítě vyčká, dokud předchozí neodejde z konfliktní plochy.
- Pády nejsou pro tuto scénu nutné. Upřednostni plynulé, pohodové ježdění.

### Běžkaři
- Přibližně 1–3 současně viditelní, převážně rekreační klasický styl.
- Střídavý skluz: přenos váhy, odraz, protilehlá práce paží a nohou, krátká fáze skluzu.
- Hůl po zapíchnutí drží kontakt se zemí po dobu odrazu; neposouvá se spolu s rukou po povrchu. Lyže drží směr stopy.
- Zpomalení v oblouku a při přibližování k jinému lyžaři. Na úzké stopě se přednostně nepředjíždí.
- Zajisti odlišné fáze pohybu a rozestupy. Příchod a odchod mimo obraz nebo za vhodnou clonou, nikdy náhlé zmizení na otevřeném sněhu.

### Procházky
- Přibližně 4–7 chodců, směs jednotlivců a dvojic; počet může pomalu kolísat.
- Někteří jen projdou, jiní se na 8–25 s zastaví směrem ke svahu, lehce změní postoj a pokračují.
- Při zastavení nejprve dokončí krok a přenesou váhu; chodící nohy se nesmí pohybovat na místě.
- Vyhýbání drž uvnitř chodníku; nepoužívej silnici jako náhradní trasu.
- Před lampou obejdi její patu, ale dovol průchod před i za ní podle průchozí šířky.

### Venčení psů
- Jedna až dvě dvojice člověk–pes. Pes zůstává u svého člověka.
- Krátké čichání u okraje sněhu, zastavení, otočení hlavy, pak dojití k majiteli.
- Během krátké pauzy může člověk zpomalit nebo počkat. Vodítko vizuálně propojuje ruku a obojek/postroj, reaguje na prověšení a nesmí být pevná tyč.
- Pes nesmí vstoupit do dojezdu, běžkařské stopy nebo před radlici.
- Chůze a klus navazují na stávající vektorovou animaci zvířat. Měnit tempo podle skutečné rychlosti.

## 7. Traktor s radlicí
Malý obecní traktor, tlumená červená nebo zelená karoserie, kabina, zimní pneumatiky, přední radlice a nenápadný oranžový maják. Vytvoř jako 3D objekt s malovaně stylizovanými materiály. Použij projekci kalibrovanou na scénu. Lesklý realistický traktor by se k malbě nehodil.

- První průjezd po přibližně 60–120 s, další náhodně po 4–7 minutách.
- Výchozí směr zleva doprava. Opakovaný průjezd může znovu začít mimo levou hranou; vozidlo nepřemisťuj ve viditelné části.
- Pomalý průjezd trvá přibližně 25–40 s. Rychlost a otáčky kol musí souhlasit.
- Radlice drží kontakt s povrchem a shrnuje sníh k bližšímu okraji vozovky. Směr natočení urči v souřadnicích silnice, nikoli jen podle obrazové strany traktoru.
- Žádné odhazování sněhu na lidi nebo do běžkařské stopy.
- Řidič může být jednoduchá silueta uvnitř kabiny. Jemné chvění vozidla, žádné přehnané poskakování.

### Skutečně viditelné odhrnování
Samotný obrázek se nemá přemalovávat každý snímek. Vymez masku vozovky a nad ní samostatnou tenkou vrstvu čerstvého sněhu. Její pokrytí snižuj pouze v pruhu přejetém radlicí; odkryje se původní tmavší struktura silnice. Stopu radlice odvozuj od skutečné šířky a projekce vozidla.

Shrnovaný sníh řeš krátce žijícími částicemi / malými shluky a omezeným přírůstkem při okraji. Změna musí zůstat viditelná po projetí. Nový sníh se může velmi pomalu hromadit při aktivním sněžení, bez náhlého resetu. Pokud sněžení vypneme, automatické zasněžení vypni také. Kapacitu částic a stop omez.

## 8. Atmosféra a hudba
Západ slunce zůstává stabilní. Pohyb světel jen velmi jemný, bez blikání celého městečka. Padající sníh přidej samostatně, řídký a pomalý, aby nezakrýval jemné kreslené detaily. Několik velikostí vloček odpovídá hloubce; velké popřední vločky jen vzácně.

Hudbu připoj přes existující audio systém aplikace. Tento balíček žádnou skladbu ani licenci nepřidává. Ambientní zvuky nastav nezávisle na hudbě; motor traktoru má pomalý nástup a útlum podle vzdálenosti, bez hlasitých špiček. Není nutné přidávat zvuky ke každému pohybu.

## 9. Pořadí implementace
1. Vlož pozadí bez animací, zachovej rozměry a poměr.
2. Přidej volitelný debug překryv tras, zakázaných oblastí a bodů kontaktu.
3. Umísti lampy a smrk, ověř alfakanál a ukotvení.
4. Kalibruj jednu dospělou postavu, dítě, psa a obrys traktoru na všech relevantních plochách.
5. Ověř vrstvení před lampou / za lampou, za smrkem a u sněhových valů.
6. Přidej kompletní bobovací cyklus včetně návratu a rezervace dráhy.
7. Přidej běžkaře, chodce a dvojice se psy.
8. Přidej 3D traktor a masku odhrnování.
9. Přidej řídké efekty a příchody/odchody; dolaď počty a časování.
10. Vypni debug a zkontroluj celou scénu v cílovém rozlišení.

## 10. Ověření výsledku
- Postavy jsou usazené chodidly na sněhu a mají přiměřené měřítko.
- Nikdo neprochází skrz lampu, radlici nebo dekorace.
- U každé lampy je správné překrytí z obou stran.
- Boby zastaví před chodníkem; návrat nekoliduje s další jízdou.
- Běžkaři respektují namalovanou stopu a nemizí na otevřené ploše.
- Traktor je po celé trase mezi obrubami a skutečně za sebou nechává odhrnutý pás.
- Sníh se neobnoví skokem; vozovka se nemění mimo plochu radlice.
- Objekty se při změně velikosti okna nerozjedou vůči pozadí.
- Bez aktivních postav nezůstanou v pozadí jejich namalované kopie.
- Alfa PNG neukazuje obdélník či výrazné barevné lemy na růžovém sněhu.
- Zkontroluj alespoň dva celé bobovací cykly a jeden průjezd traktoru. Pro kontrolu použij dočasné spuštění událostí; nečekej na náhodný časovač.
- Počet částic, stop a postav je omezený a po odchodu se uvolňuje či recykluje.
- Výkon změř na cílovém zařízení; tento balíček žádné naměřené FPS nepředpokládá.

## 11. Výtvarný směr pro další doplňky
Nostalgic hand-painted Christmas postcard illustration; European mountain village; rose-peach sunset; lavender snow shadows; warm amber windows; fine outlines and tactile gouache brushwork; fixed mildly elevated camera; no glossy photorealism.

Nové objekty musí respektovat stejný směr světla a kameru. Při změně denní doby nestačí přebarvit jen pozadí: uprav i postavy, vozidlo, světla a samostatné prvky.

