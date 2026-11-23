# Přirozená chůze malovaných 2D postav — výzkumný podklad a zadání pro Claude Code

Verze 1.0 • 23. 11. 2026 • Pevná kamera, tuhé malované díly, postava 100–350 px.

## Jak tento dokument používat

Implementuj kontaktově řízenou 2D chůzi pro popsanou kostru. Zachovej tuhé délky dílů. Chůzi řiď plánováním kroků a kontakty bot se zemí; klouby dopočítej inverzní kinematikou (IK). Tabulky použij jako výchozí profil a diagnostiku, nikoli jako několik nezávislých současně vynucovaných animací jedné nohy. Nejprve implementuj a ověř boční pohled, poté pomalou chůzi a přechody a následně ostatní pohledy.

**Důležité rozlišení důkazů:**

- **Výzkumné údaje** níže mají odkazy [S1]–[S15] a uvedenou populaci či podmínky, pokud jsou podstatné.
- **Animační návrh** jsou konkrétní 5% tabulky, parametry individualizace, časy přechodů, drobný pohyb hlavy a pravidla stylizace. Nejsou to naměřené průměry zdravé populace.
- **Výpočet pro tento rig** znamená geometricky sladěné diskrétní polohy pro nohu 32 + 30 a zvolený model boty. Je to konstrukce podle biomechanických vodítek, nikoli stažený motion capture.

Nepodařilo se získat jednu společnou experimentální datovou sadu zahrnující současně všechny požadované veličiny, oba přesné rychlostní body, přechody, sníh a klidový postoj. Z publikovaných souhrnů nelze poctivě vyrobit „naměřený průměr“ po 5 %. Proto dokument poskytuje odděleně zdrojové poznatky a kompletní, označený návrh implementace. Surové soubory Fukuchiho databáze zde nebyly statisticky přepočítány.

## A. Co vyplývá z výzkumu

### A1. Fáze a kontakty

Cyklus je od kontaktu jedné nohy po další kontakt téže nohy, tedy dva kroky. Při běžné chůzi připadá přibližně 60 % na stoj a 40 % na švih; dvojí opora zabírá dohromady asi 20 %. Hranice nejsou univerzální: AAPM&R používá například konec předšvihu kolem 62 %, zatímco běžné zjednodušené schéma 60 %. V programu mají přednost konkrétní kontaktní události před zaokrouhleným názvem fáze. [S1]

Pohyb přes stojnou nohu zahrnuje postupné odvalení přes patu, pohyb bérce nad opřeným chodidlem a odvalení přes přednoží. Z toho plyne zásadní implementační pravidlo: **pevný je právě aktivní kontaktní bod, nikoli nutně kotník nebo celá bota**. Skutečné chodidlo se navíc ohýbá v přednoží; tuhá namalovaná bota tuto schopnost nemá a její toe rocker je aproximační náhrada. [S2]

### A2. Úhly a rychlost — co lze skutečně doložit

Winiarski a kol. sledovali 20 mladých aktivních žen, celkem 1320 cyklů. Jejich pomalá, preferovaná a rychlá chůze nejsou automaticky přesně naše 0,9 / 1,3 / 1,7 m/s. Publikovaná krajní data jsou užitečná jako měřítko, nikoli přímé hodnoty pro každého dospělého. [S4]

| Veličina | Pomalá v této studii | Preferovaná v této studii | Rychlá v této studii |
|---|---:|---:|---:|
| Největší flexe kyčle | 31,4° | 33,3° | 34,8° |
| Největší extenze kyčle | −12,3° | −13,0° | −15,6° |
| Největší flexe kolena | 60,3° | 61,5° | 61,8° |
| Největší dorziflexe kotníku | 15,7° | 14,5° | 13,9° |
| Největší plantární flexe kotníku | −17,8° | −19,3° | −19,2° |

**Důsledek pro návrh:** není správné všechny úhly násobit stejným koeficientem rychlosti. Například maximum kolena se v této studii měnilo málo, zatímco rozsah kyčle více. Úhel boty vůči podlaze je jiná veličina než úhel kotníku. Publikovaný „foot progression angle“ bývá úhel v horizontální rovině a není to náklon boty špičkou nahoru.

Pro případné pozdější nahrazení návrhových křivek skutečnými daty je vhodná veřejná databáze Fukuchi, Fukuchi a Duarte: 42 zdravých osob, chůze po zemi i na pásu a různé rychlosti. Obsahuje i zpracované křivky v 101 normalizovaných bodech. Při dalším zpracování je třeba vybírat rychlost každé zkoušky podle metadat, oddělit prostředí a věkové skupiny, převést souřadnicové konvence a nejprve průměrovat v rámci osoby. Pouhý výběr každého pátého bodu napříč všemi rychlostmi by nebyl korektní referencí pro 1,3 m/s. [S3]

### A3. Pánev

Lewis a kol. uvádějí vlastní měření 44 osob a rozbor literatury. U preferované chůze měli průměrný celkový rozsah obliquity 7,4 ± 2,5° a rotace pánve 9,5 ± 2,9°; individuální rozpětí bylo podstatné. Sagitální náklon měl celkový rozsah 4,3 ± 1,1°. Jde o **max−min**, nikoli amplitudu na každou stranu. Obliquita a rotace mají přibližně jeden cyklus na dva kroky, sagitální náklon dva. Při přebírání opory klesá protilehlá strana pánve. [S5]

Tyto údaje nedávají oprávnění převést „rotaci pánve 9,5°“ na kymácení celého namalovaného kabátu ±9,5° v rovině obrazu. Také svislý pohyb pánve, svislý pohyb těžiště celého těla a pohyb centra tlaku pod chodidly jsou různé veličiny. Konkrétní posuny pánve v tomto dokumentu jsou návrhové a geometricky přizpůsobené rigu.

### A4. Švih chodidla

Studie citovaná jako [S8] nalezla u 10 zdravých osob minimální vzdálenost špičky od země 1,9 ± 0,5 cm přibližně v 51 % švihu. Jde o vnitřní minimum během švihu, nikoli nulovou výšku při odlepení či došlapu. Pro referenční délku nohy 0,9 m odpovídá 1,9 cm přibližně 0,021 L. Výška špičky je velmi citlivá na kotník; samotná „výška zvednutí nohy“ proto nestačí. [S8]

Navržené rigidní boty nejsou anatomická chodidla. Jejich tabulky mají bezpečnou malou průchodnost nad podlahou, ale přesná poloha minima není rekonstrukcí experimentální křivky [S8]. Pro malé postavy je důležitější správná opora, přirozený oblouk a nezachytávání špičky než kopírování centimetrové hodnoty při jiné geometrii boty.

### A5. Paže, trup a hlava

Měření švihu paží v různých rychlostech a sklonech ukazuje závislost na rychlosti, sklonu i tělesné výšce. Jedna pevná amplituda pro všechny lidi a situace proto není vhodná. [S6] Studie boční stabilizace zároveň ukazuje, že pánev, hrudník a paže nejsou izolované oscilátory. [S7] Při velmi pomalé chůzi se může měnit i poměr frekvencí a vzájemné časování paží; předpoklad dokonale protifázové koordinace při každé rychlosti není univerzální biologický zákon. [S15]

Pro naši běžnou a pomalou procházku volíme jednoduchý protilehlý kyv: při kontaktu pravé nohy je pravá paže vzadu. Protirotace hrudníku je malá a při pomalé chůzi zeslabená. Přesné tabulky paží a trupu jsou autorský animační návrh, nikoli hodnoty z [S6] či [S7].

Výzkum podporuje stabilizaci hlavy při lokomoci. [S13] Z toho však neplyne, že by hlava měla být pevně přilepená k jednomu bodu obrazovky. Zachováváme pohyb krku a tlumíme zejména orientaci hlavy. Hodnoty ±0,15–0,25° v návrhu jsou záměrně jemná stylizace, nikoli naměřené fyziologické maximum.

### A6. Přechody, sníh a klid

Rozejití zahrnuje přípravné posturální změny a jejich podoba se mezi lidmi liší. Posun centra tlaku a posun těla nejsou totéž; nelze animovat pánev přímo podle křivky centra tlaku. [S10] Plánované zastavení obsahuje brzdění i řízení boční rovnováhy. [S11] Výzkum otočení ukazuje koordinaci hlavy, trupu, pánve a nohou závislou na rychlosti; laboratorní otočení o 180° není přesný předpis pro každou zakřivenou trasu. [S12]

Při očekávání kluzké podlahy byly zaznamenány kratší kroky, menší úhel chodidla při kontaktu a změny průběhu došlapu. [S9] To podporuje opatrný zimní preset, nikoli tvrzení, že stejná čísla platí pro hluboký sníh. Suchý ušlapaný sníh, náledí a hluboký prašan potřebují rozdílné chování. Časy a násobiče v C jsou návrhové.

Dýchání ovlivňuje posturální pohyby, ale laboratorní pohyb centra tlaku nelze převést jedna ku jedné na houpání postavy. [S14] Mikropohyby v klidu jsou proto uvedeny jako estetický, velmi jemný návrh.

## B. Zhodnocení současného modelu podle dopadu

Bez videa nebo kódu nelze určit, která chyba v implementaci opravdu nastává. Následující pořadí je pořadím technické kontroly, ne tvrzením, že všechny uvedené chyby už máte.

| Priorita | Riziko / hodnocení současné hodnoty | Oprava a důvod |
|---|---|---|
| 1 | Nezávisle nastavené koleno, kyčel, kotník, pánev a dráha boty si mohou odporovat. | Kontakty a délky jsou závazné, klouby se dopočítají IK. Jinak vznikají drobné skluzové opravy, cukání nebo natahování. |
| 2 | „Stojná noha v klidu“ může být chybně implementována jako nehybný kotník. | Ukotvit patu, později celou podrážku, nakonec opěrný bod přednoží. Kotník se při odvalování musí pohybovat. |
| 3 | Fáze = celková dráha / aktuální délka cyklu funguje pouze při neměnné délce. | Integrovat přírůstky fáze a délku plánovaného kroku měnit na hranici kroku. Přepočet celého podílu při změně rychlosti způsobí skok fáze. |
| 4 | Konce švihu bez správné rychlosti působí jako kopání nebo klouzání. | Pata při kontaktu má mít nulovou rychlost vůči zemi; rotující kotník obecně ne. Omezit tangenty švihové křivky podle budoucího kontaktu. |
| 5 | Chybějící první/poslední krok a kontaktově řízené zatáčky. | Použít vlastní přechodové stavy. Zpomalení celé smyčky až na nulu nechává jednu nohu ve vzduchu. |
| 6 | 60 % stoj, plná podrážka od 8 %, pata od 34 %. | Pro běžnou chůzi rozumné výchozí hodnoty. Pro 0,9 m/s navrhujeme 64 / 10 / 38 %, nikoli univerzální klinický předpis. |
| 7 | Koleno 4→15→4→36°, švih max. 54°. | Základní dvojí ohnutí je správně. 54° není samo o sobě chyba, zvlášť u pomalé procházky. Pro běžný referenční preset cílit přibližně 58–65°, vždy současně s botou a dosahem nohy. |
| 8 | Bota +20° při kontaktu a −45° při odrazu. | Nejde automaticky o špatné hodnoty. Jsou to úhly boty vůči zemi, ne kotníku. Potřebují rocker a kalibraci délky boty; v našem rigidním referenčním fitu je pozdní odvalení hlubší. |
| 9 | Kotník při kontaktu 0,3 L před pánví. | Samo o sobě přijatelné. Není to polovina délky kroku: bota, druhá noha a pohyb pánve mění vztah. Náš konstrukční fit vyšel přibližně 0,308 L a 0,285 L. |
| 10 | Pohupování pánve 2,2 % L. | Nutno říci, zda jde o amplitudu ±0,022 L, nebo rozsah 0,022 L. První dává dvojnásobný celkový pohyb. Pro tento malovaný preset vychází celkový rozsah přibližně 0,023–0,026 L. |
| 11 | Nejnižší pánev přesně při kontaktu. | Použitelná první aproximace, ale nesmí přebít požadavek dosažitelné opory. Dovol minimum kolem dvojí opory a drobnou úpravu IK. |
| 12 | Rameno −3,5° ±11,5°, loket 15–29°, zpoždění 4 %. | Rozumný jemný základ, ne důkaz robotického vzhledu. Ověřit zejména opačnou fázi paže vůči stejnostranné noze a globální/lokální souřadnice. |
| 13 | Předklon 2° a dva kmity za cyklus. | Použitelné. Roboticky působí spíš přesně shodný sinus hlavy, trupu, paží a pánve a nevhodná velikost kmitu. |
| 14 | Délka kroku roste s rychlostí na mocninu 0,45. | Zachovat jako návrhový zákon v omezeném rozsahu. Kadenci odvodit z rychlosti a délky kroku; netvrdit, že 0,45 je univerzálně naměřený exponent. |
| 15 | Převod 3/4 kroku na 0,72 a malé svislé posunutí. | Vhodná stylizovaná projekce země. Nelze tím automaticky nahradit projekci všech kostí nebo natáčet koleno stejnou hodnotou v čelním pohledu. |

## C. Implementační zadání

### C1. Rozsah a geometrie

Zachovat: výška 130 bez čepice; stehno 32; lýtko 30; kotník 3 nad podrážkou; pánev–krk 43; krk–střed hlavy 13; rameno 4 pod krkem; nadloktí 24; předloktí 21. Žádné dynamické natahování, smršťování nebo deformování malovaných dílů. L = 32 + 30 = 62 je v tomto dokumentu délka nohy. Není to výška pánve nad podlahou: při rovné noze a vodorovné botě je tato výška 65 jednotek.

Pro převod rychlosti zavést zvlášť fyzickou délku nohy. Referenční dospělý má zvolené L_phys = 0,90 m; jeden rig unit pak představuje 0,90/62 m. Perspektivní velikost postavy v pixelech tuto fyzickou délku nemění. Při změně skutečné tělesné výšky, ne pouze hloubky ve scéně, lze délku upravit.

Doplnit chybějící metadata assetů: pivot každého dílu, polohu paty a špičky vůči kotníku, skutečný obrys podrážky, šířku pánve a vzdálenost kyčlí. Tabulky předpokládají patu 0,08 L za kotníkem, špičku 0,20 L před kotníkem a kotník 3/62 L nad podrážkou. Tyto rozměry nebyly zadány uživatelem a jsou **návrhové**. Při jiném assetu se nesmí slepě převzít celý fit.

Výchozí vzdálenost kyčlí je 0,16 L a šířka kroku 0,12 L. Jsou to návrhové prostorové parametry; tabulková kontrola nohou je sagitální a nezahrnuje následné boční posuny a obliquitu. Po jejich aplikaci je nutné dosah znovu vyřešit.

Kořen je plynulý bod postupu na zemi. V klidu může ležet mezi chodidly. Za chůze ho **nepřepočítávat v každém snímku jako aritmetický průměr pohybujících se bot**; tím by se zaneslo kmitání do dráhy a vazby fáze na vzdálenost.

Nepotřebujeme fyzikální simulaci svalů ani dynamický ragdoll. Potřebujeme kinematický plánovač opor, přesné transformace, IK a test dosažitelnosti. Pozdější uklouznutí je samostatná činnost s jinými kontakty.

### C2. Souřadnice a názvy úhlů

- X dopředu ve směru chůze; Y nahoru. V rendereru s Y dolů se znaménko převádí až při projekci.
- 0 % je kontakt referenční pravé nohy. Levá noha a její paže používají lokální fázi (p + 50) mod 100.
- Pánev, trup a hlava jsou společné a počítají se jen jednou podle globální fáze. Nesmí je přepsat druhá noha.
- `hipFlexDeg` v technických tabulkách je **geometrická flexe stehna vůči svislici**, kladná dopředu. To není laboratorní flexe vůči souřadnému systému pánve. Proto například kontakt 21° zde nelze bez převodu porovnávat s klinickou kyčlí 30°.
- Koleno: 0° rovné, kladně ohnutí. Kotník: kladně dorziflexe, 0° podrážka kolmá k bérci. Bota: 0° vodorovná, kladně špička nahoru.
- Předklon trupu a pitch hlavy jsou absolutní vůči svislici. Rameno je lokální vůči trupu. Loket je relativní ohnutí předloktí.
- Pánevní rotace je kladná, když je pravá kyčel vpředu. Obliquita je kladná, když je pravá kyčel výše, tedy v pravém stoji je levá strana níže.
- Rotace hrudníku v tabulce je absolutní vůči směru trasy. Je-li hrudník potomkem pánve, jeho lokální yaw je `thoraxYaw − pelvisYaw`, ne samotná hodnota tabulky.
- Absolutní stabilizaci hlavy realizovat odečtením orientace rodiče. Nepřičítat znovu předklon trupu.

### C3. Fáze

| Událost / fáze | Běžná 1,3 m/s | Pomalá 0,9 m/s — navržený preset |
|---|---:|---:|
| Kontakt paty | 0 % | 0 % |
| Přijetí zatížení | 0–10 % | 0–14 % |
| Střed stoje | 10–30 % | 14–34 % |
| Konec stoje | 30–50 % | 34–50 % |
| Předšvih | 50–60 % | 50–64 % |
| Počáteční švih | 60–73 % | 64–76 % |
| Střední švih | 73–87 % | 76–88 % |
| Konečný švih | 87–100 % | 88–100 % |
| Celá podrážka položená | od 8 % | od 10 % |
| Začátek zvedání paty v tomto assetovém modelu | 34 % | 38 % |
| Součet dvojí opory | 20 % | 28 % |

Názvy fází mají přibližné hranice. Například nominalizovaný začátek konce stoje 30 % nemusí být přesně assetová událost zvednutí paty 34 %. **Kontaktní stavový automat se řídí řádky kontakt / plná podrážka / pata / toe-off**, nikoli automaticky hranicí popisné fáze.

### C4. Pořadí výpočtu v každém snímku

1. Z plánovače získat trasu, okamžitý posun kořene, rychlost, plánovaný následující došlap a kontaktní stav obou nohou.
2. Aktualizovat kontinuální fázi. Každý plánovaný krok má uloženou délku, budoucí kontakt a délku cyklu odpovídající jeho aktuálnímu plánu.
3. Vyhodnotit aktivní opěrné body v souřadnicích světa. Stojnou botu neodvozovat od nového relativního offsetu vůči pohybující se postavě.
4. Z opěrného bodu a rotace tuhé boty dopočítat kotník. Ve švihu použít plánovanou křivku boty.
5. Vyhodnotit návrhovou polohu pánve, šířku kyčlí a drobné pohyby. Najít nejbližší dosažitelnou pánev vzhledem k oporám a pevným délkám nohou. V dvojí opoře musí být dosažitelné obě nohy.
6. Dvoučlánkovou IK vyřešit stehno a lýtko. Zachovat správnou větev kolena a kontinuitu. Nedovolit náhlé převrácení kolena.
7. Dopočítat lokální úhel kotníku z finálního bérce a boty. Kyčel/koleno/kotník z tabulek slouží jako reference při retargetingu, nikoli jako další vynucení.
8. Přidat trup, paže, krk a hlavu s korektními lokálními transformacemi. Přídavné pohyby, které posunou kyčel, vyžadují znovu IK.
9. Promítnout do zvoleného pohledu, vyřešit vrstvy a vykreslit s podpixelovou přesností.
10. Zaznamenat chybu opor, délky kostí, průnik pod zem a případnou korekci pánve pro debug režim.

Při konfliktu má přednost kontakt, délky a nepronikání pod zem. Jestliže běžná korekce pánve přesahuje 0,01 L, změnit plán dalšího neukotveného kroku nebo rychlost kořene. Neřešit konflikt posunutím již ukotvené nohy či natažením stehna.

### C5. Tuhá bota a IK — závazné rovnice

Nechť A je kotník, θ úhel boty, R běžná 2D rotace v souřadnicích X dopředu / Y nahoru. Rozměry jsou v L:

- `heel = A + R(θ) · (−0.08, −3/62)`
- `toe = A + R(θ) · (+0.20, −3/62)`

Při opření o patu: `A = heelAnchorWorld − R(θ) · heelLocal`. Při opření o přednoží obdobně použít `toeAnchorWorld`. V plné opoře je θ = 0 a kotník stojí; přepnutí do toe rockeru používá špičku téže už stojící boty, nikoli nově zvolený bod.

Skutečný kontaktní bod může být uvnitř obrysu špičky; metadata musí odpovídat nakreslené podrážce. Je-li podrážka zakřivená nebo tlustá, testovat také její obrys, ne pouze dva body. Rovnice zde předpokládají rovnou kontaktní úsečku.

Pro IK: `a = 32/62`, `b = 30/62`, `dx = ankle.x − hip.x`, `dy = hip.y − ankle.y`, `d² = dx² + dy²`.

- `knee = acos((d² − a² − b²) / (2ab))`
- `hip = atan2(dx, dy) + atan2(b·sin(knee), a + b·cos(knee))`
- `ankle = footToGround − hip + knee`

Výpočty trigonometrie provádět v radiánech a až pak převést na stupně. Clamp argumentu acos je pojistka numeriky, **ne řešení nedosažitelného cíle**. Geometrický dosah ověřit předem: `|a−b| ≤ d ≤ a+b` s malou rezervou před úplným propnutím.

Úhly v těchto rovnicích jsou v boční sagitální konstrukci. Čelní a 3/4 rendering používá samostatný převod, viz C10.

### C6. Tabulky po 5 % pro obě rychlosti

**Status tabulek:** autorské výchozí profily pro tento rig, nikoli experimentální průměry. Nohy byly numericky sladěny v sagitální rovině s pevným rozměrem boty a délkami 32 + 30. Proto se od obecných klinických křivek liší. Doplňkové pohyby horního těla jsou navrženy samostatně.

Průměrná výška pánve je uvedena u každého profilu; `pelvisVerticalLegLen` je odchylka od tohoto průměru. Pomalý fit zde má nepatrně větší peak-to-peak posun než běžný. Je to důsledek tohoto konkrétního retargetingu, **nikoli výzkumný závěr, že pomalá chůze obecně více poskakuje**.

Čtyři desetinná místa jsou určena k reprodukovatelnosti geometrie. Nevyjadřují přesnost biologického měření. JSON obsahuje délky s pěti desetinnými místy a úhly se dvěma; markdownové tabulky jsou pro čtení zaokrouhlené.

### Běžná chůze — 1,3 m/s

**Úhly nohy a svislá poloha pánve.** H = průměrná výška pánve + ΔH. Průměrná výška v tomto profilu je 1.030263 L. Kyčel je zde geometrický úhel stehna vůči svislici, ne klinický úhel vůči pánevnímu segmentu.

| % | Kyčel ° | Koleno ° | Kotník ° | Bota ° | ΔH/L |
|---:|---:|---:|---:|---:|---:|
| 0 | 21.4 | 7.2 | 5.7 | 20.0 | -0.0081 |
| 5 | 19.2 | 10.3 | -2.0 | 7.0 | -0.0072 |
| 10 | 16.4 | 13.1 | -3.3 | 0.0 | -0.0037 |
| 15 | 12.8 | 14.9 | 2.1 | 0.0 | 0.0050 |
| 20 | 6.8 | 11.9 | 5.1 | 0.0 | 0.0125 |
| 25 | 0.7 | 8.5 | 7.8 | 0.0 | 0.0136 |
| 30 | -5.0 | 6.1 | 11.0 | 0.0 | 0.0073 |
| 35 | -10.5 | 3.8 | 13.3 | -1.0 | -0.0021 |
| 40 | -14.2 | 5.2 | 14.4 | -5.0 | -0.0080 |
| 45 | -17.2 | 7.6 | 12.8 | -12.0 | -0.0092 |
| 50 | -14.3 | 21.2 | 10.6 | -25.0 | -0.0081 |
| 55 | -9.8 | 35.8 | 0.6 | -45.0 | -0.0072 |
| 60 | -11.4 | 36.7 | -11.9 | -60.0 | -0.0037 |
| 65 | 4.0 | 54.7 | -14.3 | -65.0 | 0.0050 |
| 70 | 18.2 | 61.8 | -1.4 | -45.0 | 0.0125 |
| 75 | 27.8 | 57.8 | -0.1 | -30.0 | 0.0136 |
| 80 | 31.8 | 45.4 | 1.7 | -12.0 | 0.0073 |
| 85 | 30.8 | 29.2 | 3.4 | 5.0 | -0.0021 |
| 90 | 27.8 | 16.0 | 3.2 | 15.0 | -0.0080 |
| 95 | 24.3 | 8.6 | 4.3 | 20.0 | -0.0092 |
| 100 | 21.4 | 7.2 | 5.7 | 20.0 | -0.0081 |

**Dráhy bodů boty.** X je dopředu vůči pánvi; Y je výška nad zemí. Všechny délky jsou podíly L. Hodnoty paty a špičky jsou odvozené z kotníku a jedné tuhé boty, nikoli další animační vstupy.

| % | Kotník X | Kotník Y | Pata X | Pata Y | Špička X | Špička Y |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0.3081 | 0.0728 | 0.2495 | 0.0000 | 0.5126 | 0.0958 |
| 5 | 0.2453 | 0.0578 | 0.1718 | 0.0000 | 0.4497 | 0.0341 |
| 10 | 0.1740 | 0.0484 | 0.0940 | 0.0000 | 0.3740 | 0.0000 |
| 15 | 0.0962 | 0.0484 | 0.0162 | 0.0000 | 0.2962 | 0.0000 |
| 20 | 0.0184 | 0.0484 | -0.0616 | 0.0000 | 0.2184 | 0.0000 |
| 25 | -0.0594 | 0.0484 | -0.1394 | 0.0000 | 0.1406 | 0.0000 |
| 30 | -0.1371 | 0.0484 | -0.2171 | 0.0000 | 0.0629 | 0.0000 |
| 35 | -0.2140 | 0.0519 | -0.2949 | 0.0049 | -0.0149 | 0.0000 |
| 40 | -0.2877 | 0.0656 | -0.3716 | 0.0244 | -0.0927 | 0.0000 |
| 45 | -0.3560 | 0.0889 | -0.4444 | 0.0582 | -0.1705 | 0.0000 |
| 50 | -0.4091 | 0.1284 | -0.5020 | 0.1183 | -0.2482 | 0.0000 |
| 55 | -0.4332 | 0.1756 | -0.5240 | 0.1980 | -0.3260 | 0.0000 |
| 60 | -0.4619 | 0.1974 | -0.5438 | 0.2425 | -0.4038 | 0.0000 |
| 65 | -0.3388 | 0.2139 | -0.4164 | 0.2660 | -0.2981 | 0.0122 |
| 70 | -0.1724 | 0.2021 | -0.2632 | 0.2245 | -0.0653 | 0.0265 |
| 75 | -0.0006 | 0.1681 | -0.0940 | 0.1662 | 0.1484 | 0.0262 |
| 80 | 0.1573 | 0.1285 | 0.0690 | 0.0978 | 0.3429 | 0.0396 |
| 85 | 0.2779 | 0.1012 | 0.2024 | 0.0460 | 0.4813 | 0.0704 |
| 90 | 0.3393 | 0.0920 | 0.2746 | 0.0245 | 0.5450 | 0.0970 |
| 95 | 0.3437 | 0.0849 | 0.2850 | 0.0121 | 0.5481 | 0.1079 |
| 100 | 0.3081 | 0.0728 | 0.2495 | 0.0000 | 0.5126 | 0.0958 |

**Pánev, trup, hlava a stejnostranná paže.** Tyto malé doplňkové pohyby jsou návrhové. Pánevní YAW a obliquita nesmějí být oba aplikovány jako rotace v rovině obrázku.

| % | Pánev bočně/L | Pánev yaw ° | Obliquita ° | Trup ° | Hrudník yaw ° | Hlava ° | Rameno ° | Loket ° |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0.0000 | 4.0 | 0.0 | 2.5 | -3.0 | 0.2 | -17.9 | 12.0 |
| 5 | 0.0056 | 3.8 | 0.9 | 2.4 | -2.9 | 0.2 | -17.8 | 12.4 |
| 10 | 0.0106 | 3.2 | 1.8 | 2.1 | -2.4 | 0.1 | -16.3 | 13.5 |
| 15 | 0.0146 | 2.4 | 2.4 | 1.9 | -1.8 | -0.1 | -13.6 | 15.3 |
| 20 | 0.0171 | 1.2 | 2.9 | 1.6 | -0.9 | -0.2 | -10.0 | 17.5 |
| 25 | 0.0180 | 0.0 | 3.0 | 1.5 | 0.0 | -0.2 | -5.8 | 20.0 |
| 30 | 0.0171 | -1.2 | 2.9 | 1.6 | 0.9 | -0.2 | -1.4 | 22.5 |
| 35 | 0.0146 | -2.4 | 2.4 | 1.9 | 1.8 | -0.1 | 2.7 | 24.7 |
| 40 | 0.0106 | -3.2 | 1.8 | 2.1 | 2.4 | 0.1 | 6.2 | 26.5 |
| 45 | 0.0056 | -3.8 | 0.9 | 2.4 | 2.9 | 0.2 | 8.7 | 27.6 |
| 50 | 0.0000 | -4.0 | 0.0 | 2.5 | 3.0 | 0.2 | 9.9 | 28.0 |
| 55 | -0.0056 | -3.8 | -0.9 | 2.4 | 2.9 | 0.2 | 9.8 | 27.6 |
| 60 | -0.0106 | -3.2 | -1.8 | 2.1 | 2.4 | 0.1 | 8.3 | 26.5 |
| 65 | -0.0146 | -2.4 | -2.4 | 1.9 | 1.8 | -0.1 | 5.6 | 24.7 |
| 70 | -0.0171 | -1.2 | -2.9 | 1.6 | 0.9 | -0.2 | 2.0 | 22.5 |
| 75 | -0.0180 | 0.0 | -3.0 | 1.5 | 0.0 | -0.2 | -2.2 | 20.0 |
| 80 | -0.0171 | 1.2 | -2.9 | 1.6 | -0.9 | -0.2 | -6.6 | 17.5 |
| 85 | -0.0146 | 2.4 | -2.4 | 1.9 | -1.8 | -0.1 | -10.7 | 15.3 |
| 90 | -0.0106 | 3.2 | -1.8 | 2.1 | -2.4 | 0.1 | -14.2 | 13.5 |
| 95 | -0.0056 | 3.8 | -0.9 | 2.4 | -2.9 | 0.2 | -16.7 | 12.4 |
| 100 | 0.0000 | 4.0 | 0.0 | 2.5 | -3.0 | 0.2 | -17.9 | 12.0 |

### Pomalá procházka — 0,9 m/s

**Úhly nohy a svislá poloha pánve.** H = průměrná výška pánve + ΔH. Průměrná výška v tomto profilu je 1.032349 L. Kyčel je zde geometrický úhel stehna vůči svislici, ne klinický úhel vůči pánevnímu segmentu.

| % | Kyčel ° | Koleno ° | Kotník ° | Bota ° | ΔH/L |
|---:|---:|---:|---:|---:|---:|
| 0 | 19.6 | 6.3 | -1.3 | 12.0 | -0.0113 |
| 5 | 18.7 | 11.6 | -1.1 | 6.0 | -0.0067 |
| 10 | 14.3 | 10.0 | -4.3 | 0.0 | -0.0015 |
| 15 | 11.5 | 12.0 | 0.5 | 0.0 | 0.0056 |
| 20 | 6.8 | 10.2 | 3.4 | 0.0 | 0.0115 |
| 25 | 1.8 | 7.7 | 5.9 | 0.0 | 0.0132 |
| 30 | -2.5 | 6.7 | 9.2 | 0.0 | 0.0094 |
| 35 | -6.5 | 6.2 | 12.7 | 0.0 | 0.0009 |
| 40 | -10.7 | 5.4 | 15.1 | -1.0 | -0.0084 |
| 45 | -13.2 | 7.9 | 16.1 | -5.0 | -0.0127 |
| 50 | -15.0 | 11.4 | 14.3 | -12.0 | -0.0113 |
| 55 | -11.8 | 24.0 | 10.9 | -25.0 | -0.0067 |
| 60 | -6.7 | 38.2 | -0.1 | -45.0 | -0.0015 |
| 65 | -0.9 | 47.9 | -9.2 | -58.0 | 0.0056 |
| 70 | 9.1 | 55.8 | -3.3 | -50.0 | 0.0115 |
| 75 | 19.5 | 57.3 | 5.8 | -32.0 | 0.0132 |
| 80 | 25.9 | 49.4 | 8.4 | -15.0 | 0.0094 |
| 85 | 27.4 | 34.9 | 5.6 | -2.0 | 0.0009 |
| 90 | 25.5 | 19.8 | 2.4 | 8.0 | -0.0084 |
| 95 | 23.0 | 10.5 | -0.5 | 12.0 | -0.0127 |
| 100 | 19.6 | 6.3 | -1.3 | 12.0 | -0.0113 |

**Dráhy bodů boty.** X je dopředu vůči pánvi; Y je výška nad zemí. Všechny délky jsou podíly L. Hodnoty paty a špičky jsou odvozené z kotníku a jedné tuhé boty, nikoli další animační vstupy.

| % | Kotník X | Kotník Y | Pata X | Pata Y | Špička X | Špička Y |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0.2846 | 0.0640 | 0.2164 | 0.0000 | 0.4903 | 0.0582 |
| 5 | 0.2250 | 0.0565 | 0.1505 | 0.0000 | 0.4289 | 0.0293 |
| 10 | 0.1646 | 0.0484 | 0.0846 | 0.0000 | 0.3646 | 0.0000 |
| 15 | 0.0987 | 0.0484 | 0.0186 | 0.0000 | 0.2987 | 0.0000 |
| 20 | 0.0327 | 0.0484 | -0.0473 | 0.0000 | 0.2327 | 0.0000 |
| 25 | -0.0332 | 0.0484 | -0.1132 | 0.0000 | 0.1668 | 0.0000 |
| 30 | -0.0991 | 0.0484 | -0.1791 | 0.0000 | 0.1009 | 0.0000 |
| 35 | -0.1650 | 0.0484 | -0.2450 | 0.0000 | 0.0350 | 0.0000 |
| 40 | -0.2301 | 0.0519 | -0.3109 | 0.0049 | -0.0309 | 0.0000 |
| 45 | -0.2919 | 0.0656 | -0.3758 | 0.0244 | -0.0968 | 0.0000 |
| 50 | -0.3483 | 0.0889 | -0.4366 | 0.0582 | -0.1628 | 0.0000 |
| 55 | -0.3895 | 0.1284 | -0.4824 | 0.1183 | -0.2287 | 0.0000 |
| 60 | -0.4018 | 0.1756 | -0.4926 | 0.1980 | -0.2946 | 0.0000 |
| 65 | -0.3724 | 0.2032 | -0.4558 | 0.2455 | -0.3074 | 0.0080 |
| 70 | -0.2708 | 0.2023 | -0.3593 | 0.2325 | -0.1793 | 0.0180 |
| 75 | -0.1240 | 0.1765 | -0.2175 | 0.1779 | 0.0200 | 0.0295 |
| 80 | 0.0334 | 0.1336 | -0.0564 | 0.1076 | 0.2141 | 0.0351 |
| 85 | 0.1737 | 0.0952 | 0.0921 | 0.0496 | 0.3719 | 0.0399 |
| 90 | 0.2697 | 0.0765 | 0.1973 | 0.0175 | 0.4745 | 0.0564 |
| 95 | 0.3059 | 0.0720 | 0.2377 | 0.0080 | 0.5115 | 0.0662 |
| 100 | 0.2846 | 0.0640 | 0.2164 | 0.0000 | 0.4903 | 0.0582 |

**Pánev, trup, hlava a stejnostranná paže.** Tyto malé doplňkové pohyby jsou návrhové. Pánevní YAW a obliquita nesmějí být oba aplikovány jako rotace v rovině obrázku.

| % | Pánev bočně/L | Pánev yaw ° | Obliquita ° | Trup ° | Hrudník yaw ° | Hlava ° | Rameno ° | Loket ° |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0.0000 | 3.0 | 0.0 | 1.8 | -1.5 | 0.1 | -10.9 | 12.0 |
| 5 | 0.0043 | 2.9 | 0.6 | 1.7 | -1.4 | 0.1 | -10.9 | 12.2 |
| 10 | 0.0082 | 2.4 | 1.2 | 1.6 | -1.2 | 0.1 | -10.0 | 12.9 |
| 15 | 0.0113 | 1.8 | 1.6 | 1.4 | -0.9 | -0.1 | -8.5 | 14.1 |
| 20 | 0.0133 | 0.9 | 1.9 | 1.3 | -0.5 | -0.1 | -6.4 | 15.4 |
| 25 | 0.0140 | 0.0 | 2.0 | 1.2 | 0.0 | -0.1 | -4.0 | 17.0 |
| 30 | 0.0133 | -0.9 | 1.9 | 1.3 | 0.5 | -0.1 | -1.5 | 18.6 |
| 35 | 0.0113 | -1.8 | 1.6 | 1.4 | 0.9 | -0.1 | 0.8 | 19.9 |
| 40 | 0.0082 | -2.4 | 1.2 | 1.6 | 1.2 | 0.1 | 2.8 | 21.1 |
| 45 | 0.0043 | -2.9 | 0.6 | 1.7 | 1.4 | 0.1 | 4.2 | 21.8 |
| 50 | 0.0000 | -3.0 | 0.0 | 1.8 | 1.5 | 0.1 | 4.9 | 22.0 |
| 55 | -0.0043 | -2.9 | -0.6 | 1.7 | 1.4 | 0.1 | 4.9 | 21.8 |
| 60 | -0.0082 | -2.4 | -1.2 | 1.6 | 1.2 | 0.1 | 4.0 | 21.1 |
| 65 | -0.0113 | -1.8 | -1.6 | 1.4 | 0.9 | -0.1 | 2.5 | 19.9 |
| 70 | -0.0133 | -0.9 | -1.9 | 1.3 | 0.5 | -0.1 | 0.4 | 18.6 |
| 75 | -0.0140 | 0.0 | -2.0 | 1.2 | 0.0 | -0.1 | -2.0 | 17.0 |
| 80 | -0.0133 | 0.9 | -1.9 | 1.3 | -0.5 | -0.1 | -4.5 | 15.4 |
| 85 | -0.0113 | 1.8 | -1.6 | 1.4 | -0.9 | -0.1 | -6.8 | 14.1 |
| 90 | -0.0082 | 2.4 | -1.2 | 1.6 | -1.2 | 0.1 | -8.8 | 12.9 |
| 95 | -0.0043 | 2.9 | -0.6 | 1.7 | -1.4 | 0.1 | -10.2 | 12.2 |
| 100 | 0.0000 | 3.0 | 0.0 | 1.8 | -1.5 | 0.1 | -10.9 | 12.0 |

### C7. Interpolace a kontakt mezi vzorky

Tabulka po 5 % není sama hotová animační smyčka. Doplň přesné události 8/34/60 % a 10/38/64 %. Pro pomalý toe-off vlož v 64 % úhel boty −55° a kotník dopočítej z dosavadní pevné špičky. Ve švihu začni v tomto přesném bodě, nikoli až v 65 %.

Uvnitř úseků použij tvarově zachovávající kubickou interpolaci. U horního těla použij periodické hladké křivky. Pro botu interpoluj její orientaci a švihový kotník, ale patu a špičku vždy odvoď z jedné transformace. Neinterpoluj jejich tři dráhy nezávisle. Během stoje nepoužívej interpolovanou tabulkovou X souřadnici jako světovou polohu: závazný je rocker kolem fixního kontaktu.

Před kontaktem vyžaduj spojitost světové pozice paty a nulovou kontaktní rychlost paty. Pro kotník platí `A_dot = −d(R(θ)·heelLocal)/dt` při kontaktu a analogicky u špičky při odlepení. Koncové tangenty švihu musí respektovat tuto vazbu. Nestačí dát nulovou derivaci relativní souřadnici kotníku vůči pánvi, protože pánev se dál pohybuje.

Události nastavují správnou rotaci i na hranici flat-foot. Při přechodu na plnou podrážku zabránit ostrému rohovému zlomu orientace. Dynamický kontakt může mít změnu zrychlení, ale ne viditelný skok polohy. V místě 0/100 zajistit navazující světový pohyb i lokální orientaci; shoda samotných hodnot nestačí.

Po interpolaci ověřovat dosah a průchodnost v hustém vzorkování. Data níže byla ověřena v 21 pózách každého profilu, nikoli v dosud neexistujícím rendereru pro každý snímek.

### C8. Závislost na rychlosti

Pro referenční dospělou postavu L_phys = 0,9 m použij následující **návrhové** vztahy v ustálené chůzi 0,7–1,7 m/s:

`stepLength(v) = 0.70 · (v/1.30)^0.45 [m]`

`strideLength = 2 · stepLength`

`cadence = 60 · v / stepLength [kroků/min]`

`cycleDuration = strideLength / v [s]`

| Rychlost | Délka jednoho kroku | Délka cyklu | Kadence | Trvání cyklu |
|---|---:|---:|---:|---:|
| 0,9 m/s | 0,593 m = 0,659 L | 1,186 m = 1,318 L | 91,0 kroků/min | 1,318 s |
| 1,3 m/s | 0,700 m = 0,778 L | 1,400 m = 1,556 L | 111,4 kroků/min | 1,077 s |
| 1,7 m/s | 0,790 m = 0,878 L | 1,580 m = 1,755 L | 129,1 kroků/min | 0,929 s |

Pro jinou fyzickou velikost lze jako návrhové normalizování použít `v0 = 1.3·sqrt(L_phys/0.9)` a `stepLength = L_phys·(0.7/0.9)·(v/v0)^0.45`. Výraz vychází z myšlenky dynamické podobnosti; není to zde validovaný regresní model pro libovolného člověka. Perspective scale na obrazovce nemá vstupovat do v ani L_phys.

Fázi aktualizuj `phase += ds / latchedStrideLength`, kde phase je v cyklech a ds je přírůstek skutečné dráhy po zemi. Přímý výraz `totalDistance / currentStrideLength` použij pouze při neměnné délce. Naplánovaná délka a budoucí kontakt tvoří jeden celek. Změna délky cyklu nesmí teleporovat rozběhnutý švih nebo zkrátit stoj tak, že se ukotvená noha musí posunout.

Mezi 0,9 a 1,3 m/s přecházej mezi odpovídajícími **událostmi** obou profilů. Například 60 % v běžném je toe-off, ale 60 % v pomalém ještě stoj. Prosté míchání póz podle stejného procenta by mohlo zvedat opřenou botu. Po převodu fáze přepočítej kontakty a IK.

Pro spěch kolem 1,7 m/s: stoj přibližně 58 %, švihové koleno cílově 60–66°, rameno zhruba střed −4° a amplituda 18°, předklon přibližně 3°. Jde o návrh třetího presetu, který je třeba retargetovat s novou délkou kroku. Není zde samostatně numericky ověřená 5% tabulka spěchu. Výška špičky se nemá násobit rychlostí bez limitu; neprodukovat vysoké pochodování.

### C9. Rozejití, zastavení, zatáčení a sníh

Všechny následující konkrétní časy a rozsahy jsou **animační parametry**, nikoli přesně naměřené fáze ze studií. Křivky ustálené chůze se nepoužívají jako univerzální řešení přechodů.

**Rozejití:**

1. Vybrat první švihovou nohu podle trasy, překážek a stabilního semene náhody. Výchozí stav má obě chodidla položená a v rozumné šířce.
2. Během 0,2–0,4 s jemně posunout pánev 0,01–0,025 L ke stojné noze. Neodlepovat obě boty a neposouvat jejich kontakty.
3. První krok plánovat na 55–80 % cílové ustálené délky, druhý na 85–100 %. Švih odvozovat od aktuální startovní polohy, nikoli přeskočit přímo do pózy z normální smyčky.
4. Rychlost zvýšit během přibližně 0,7–1,2 s. V přípravě a velmi malých rychlostech používat časový přechod; jinak nulová dráha zablokuje rozběh.
5. Napojení na ustálenou vzdálenostní fázi provést při jasně definovaném kontaktu. Paže plynule naběhnou během prvního až druhého kroku.

**Plánované zastavení:**

1. Plánovat zpravidla 1–2 kroky před cílem. Root nesmí projet zastávkou a následně přitáhnout chodidla zpět.
2. Zmenšit dopřednou rychlost během 0,7–1,4 s; poslední dopředný krok přibližně 35–70 % běžné délky podle dostupné vzdálenosti.
3. Dokončit rozběhnutý švih. Pokud je třeba, provést poslední krátký srovnávací krok druhou nohou, nikoli skluz po zemi.
4. Zachovat rozestup nohou. „Srovnání“ neznamená obě boty na stejném bodě nebo dokonale u sebe.
5. Doznívání trupu a paží 0,3–0,6 s. Až pak přejít do idle. Při dojezdu fáze nesmí zamrznout s nohou ve vzduchu.

Nouzové zastavení je jiný pohyb. Pro první verzi ho neimitovat extrémním zkrácením této sekvence.

**Zatáčení:**

- Mírná zatáčka: směr dalšího došlapu orientovat podle tečny trasy; změna směru zhruba 5–15° na krok, rutinní limit 25°.
- Pro poloměr R platí přibližně `Δheading = stepLength/R` v radiánech. Pokud je požadovaná změna větší, zpomalit a použít více kratších kroků.
- Pohled může předcházet směru trupu o 0,15–0,3 s, avšak jen pokud existuje odpovídající pohled hlavy. Malý yaw není otočení obličeje v rovině obrázku.
- Otočení o více než asi 60° řešit 2–4 přešlapy při nízké rychlosti, nikoli otočením celého sprite na místě kolem kořene s oběma chodidly přilepenými k zemi.
- Již opřený bod zachovat. Nový směr dostávají budoucí kontakty; lokální pivot na jedné botě případně realizovat explicitně.

**Zimní preset — ušlapaný sníh a opatrnost:**

| Parametr | Návrhový rozsah |
|---|---:|
| Rychlost | 0,6–1,0 m/s |
| Délka kroku vůči suché chůzi při stejné rychlosti | 80–95 % |
| Stoj | 64–68 % |
| Úhel boty při kontaktu | +5 až +12° |
| Úhel boty při odlepení | −30 až −45° |
| Šířka kroku | 1,1–1,35× základ |
| Kyv paží | 0,4–0,8× základ |
| Mírné odtažení paží | 3–8°, pokud asset dovolí |
| Koleno ve švihu | orientačně 50–60° po retargetingu |
| Výška špičky uvnitř švihu | cca 0,02–0,04 L, podle podlahy a čitelnosti |

Zkrátí-li se při stejné rychlosti krok, musí vzrůst kadence; alternativou je současně snížit rychlost. Nenastavovat všechny tři veličiny nezávisle. Na suché stabilní cestě zasněženým náměstím může zůstat běžný pomalý preset. Káva v ruce, ruce v kapsách nebo taška jsou stavové varianty horního těla, nikoli povinně nulový kyv obou paží.

Hluboký sníh vyžaduje výšku vrstvy, zaboření, jinou práci kolena a případně stopy. Tento dokument na něj nemá přímou datovou oporu ani hotový profil.

### C10. Boční, 3/4, čelní a zadní pohled

**Rozlišit svět a obrázek.** Kontakt je uložen v logické rovině země. Projekce do obrazovky se provádí až potom. Fázi nelze odvozovat od pixelové délky kroku: postava jdoucí do hloubky by změnila kadenci jen kvůli kameře.

V bočním pohledu se sagitální konstrukce použije nejpřímočařeji. V 3/4 projekci lze dopřednou souřadnici země vodorovně zkrátit na 0,72. Přiměřená výchozí svislá složka je 0,12× dopředný posun, se znaménkem podle pohybu ke kameře / od kamery. Koeficient 0,12 je **kalibrační návrh**, ne biomechanika. Výšku nad podlahou promítat samostatně nahoru. V čelním/zadním pohledu většinu dopředného kroku tvoří hloubkový a tedy mírně obrazově svislý posun.

**Omezení tuhého cut-out rigu:** přesná prostorová projekce by měnila promítnuté délky končetin podle natočení. S neměnnými délkami a bez deformace to nelze reprodukovat přesně. Pro každý z pěti pohledů proto připravit kalibrované attachmenty a namalované díly, případně pohledově specifické pevné délky kostí odpovídající assetům. Během animace je neměnit. Pokud renderer dovolí pouze jedinou sadu délek pro všechny pohledy, přijmout stylizovanou aproximaci a ověřit dosah v každém pohledu zvlášť.

Neaplikovat koeficient 0,72 jako zkrácení všech kostí ani jako násobič úhlu kolena. U čelního pohledu se sagitální flexe neprojeví velkým vybočením kolena do strany; čitelnost vytváří střídání hloubky, zvednutí boty, malé přirozené rozestupy a překryvy. Extrémně přesnou flexi tam omezují samotné assety.

Yaw pánve a hrudníku převádět na malé posuny attachmentů, pořadí bližší/vzdálenější paže a nohy a změnu vybraného pohledu. Obliquitu lze podle pohledu částečně zobrazit jako rozdíl výšek kyčlí. Nezaměňovat yaw za naklánění celého trupu do stran.

Pohled měnit ideálně při dvojí opoře. U kompatibilních assetů může pomoci 0,1–0,2 s maskovaný přechod; dvojitá průsvitná silueta není žádoucí. Zachovat světové kontakty a návaznost polohy hlavy. Vrstevní pořadí má stabilní pravidla a hysterezi, nikoli přepínání při každé nepatrné numerické změně hloubky.

### C11. Individualita bez náhodného třesu

Následující rozsahy jsou **omezená umělecká variabilita**, ne 95% intervaly zdravé populace. Volit je jednou na postavu, ideálně z oříznutého rozdělení kolem střední hodnoty. Každá postava má stabilní seed pro reprodukovatelný export.

| Parametr | Rozsah / pravidlo |
|---|---|
| Preferovaná rychlost na tržišti | většina 0,75–1,15 m/s; další presety podle činnosti |
| Délka kroku při stejné rychlosti | 0,90–1,10× preset; kadence se dopočítá |
| Amplituda paží | 0,65–1,35× preset |
| Zpoždění paže | −2 až +4 % cyklu; význam vzhledem k tabulce musí být explicitní |
| Poměr levé/pravé amplitudy paží | 0,85–1,15 |
| Průměrný předklon | offset −1 až +2° vůči presetu |
| Svislý pohyb pánve | 0,8–1,2×, pouze po kontrole dosažitelnosti |
| Boční pohyb pánve | 0,75–1,25× |
| Šířka kroku | 0,09–0,17 L |
| Drobné změny mezi kroky | délka ±2,5 %, paže ±3 %, hladce |
| Startovní fáze | libovolná při spawn-in-motion s inicializovanou historií opor; při skutečném rozejití použít startovací stav |

Nezávisle náhodně nevolit rychlost, kadenci a délku kroku. Nepřidávat náhodný úhel každý snímek. Náhodné drobnosti nesmějí posouvat stojný kontakt nebo vytvářet skok fáze. Silná asymetrie dolních končetin do neutrálního generátoru nepatří; mohla by číst jako kulhání.

### C12. Klidový postoj

Boty zůstávají ukotvené. Dýchání zobrazit rigidními mikropohyby, ne škálováním kabátu. Návrh: 10–18 dechových cyklů/min, náklon horní části 0,15–0,35° a případný svislý pohyb attachmentu 0,001–0,003 L. U celistvého tuhého kabátu použít zejména velmi malou rotaci kolem pánve; případný posun musí stále držet překryv s nohama.

Přenesení váhy nastává nepravidelně, přibližně po 4–12 s, trvá 0,8–2 s a posune pánev přibližně o 0,005–0,015 L. IK zachová obě boty. Nejde o nekonečné metronomické kývání.

Drobné gesto hlavy po 3–9 s: pitch přibližně do ±2°, yaw do ±6° pouze při odpovídajících assetech. Gesta nenastávají u celé skupiny ve stejný okamžik. Dýchání, hlava a přenášení váhy nesmějí automaticky dosahovat maxim současně. Přechod k činnosti může idle dočasně potlačit.

### C13. Čitelnost při 100–350 px

Pro postavu vysokou H_px má noha L_px přibližně `H_px·62/130`. Při 100 px jde o 47,7 px a výška špičky 0,02 L je necelý pixel; při 350 px jde o 3,34 px. Proto je úplně jiná potřeba stylizace u nejmenší a největší postavy.

- Zachovat subpixelové transformace. Nezaokrouhlovat každou kost na celé pixely před vykreslením.
- U nejmenší postavy lze vnitřní clearance zvýšit nejvýše zhruba o 10–20 % nebo zajistit čitelnou mez kolem 1 px. Nepřidávat 3 px všem postavám bez přepočtu na velikost.
- Kyv paží může být pro siluetu zvětšen asi o 10–15 %, pokud neprotíná kabát. Koleno nezveličovat jen proto, že ho dlouhý kabát zakrývá.
- Horní tělo držet klidnější než končetiny. Velké kývání hlavou a kabátem vytváří dojem loutky.
- U rukávů, kolen a kotníků zajistit malované překryvy přibližně 0,025–0,05 L podle assetu. Pivot musí být uvnitř překryvu, nikoli na viditelné hraně dílu.
- Rigidní kabát zůstává jedním pevným dílem. Nevytvářet iluzi látky velkým otáčením celého trupu. Šála může později dostat vlastní tuhý kyv konců, pokud jsou skutečně oddělené.
- Kontaktní stín, pokud bude samostatným efektem, váže pozorovatele k zemi; nesmí zakrývat chybu klouzání.

Nejčastější robotické chyby: všechny klouby sinusově ve stejné fázi; kyčel a koleno animované bez kontaktu; pata a špička se otáčejí kolem kotníku i v opoře; stejnostranná ruka i noha současně vpředu; příliš rovná švihová noha; ostrá změna rychlosti boty před došlapem; celočíselné chvění pixelů; identické parametry celé skupiny; tělo se při změně směru otočí i s oběma opřenými chodidly; postava zastaví v půlce švihu.

### C14. Pořadí implementace a předání

1. Načíst metadata a zobrazit debug kostru, podrážku, opěrné body a plánované kroky.
2. Implementovat boční ustálenou chůzi 1,3 m/s s přesnými kontakty, IK a interpolací.
3. Přidat profil 0,9 m/s, parametrickou rychlost a plánování kontaktů bez skoku fáze.
4. Přidat start, plánované zastavení a mírné zatáčení; poté ostré přešlapy.
5. Retargetovat ostatní čtyři pohledy a otestovat překryvy.
6. Přidat idle, omezenou individualitu a zimní variantu.
7. Ověřit export deterministicky při 24/30/60 fps a různých rozlišeních.

Další činnosti jako pád, běh, hod sněhovou koulí nebo stavění sněhuláka nejsou součástí této chůze. Architektura jim má dovolit převzít plán opor a ovládání horního těla bez rozbití zbytku scény.

## D. Jeden strojově čitelný JSON blok

Objekt obsahuje oba kompletní profily po 5 %. Základní `curves` platí pro 1,3 m/s, `slowProfile.curves` pro 0,9 m/s. Navíc obsahuje patu a špičku, definice znamének, geometrii boty, role křivek, přechody, zdroje a akceptační limity. Parametry se zřejmou jednotkou mají příponu `Deg`, `Pct`, `Sec`, `Mps`, `LegLen` nebo `Px`.

Nezaměňovat označení `draft-retargeted` za hotovou otestovanou animaci. Jde o úplný vstupní předpis, který musí projít níže uvedenými integračními testy. Zvláště pohledy, boční rotace a přechody potřebují kontrolu v cílovém rendereru.

```json
{
  "schemaVersion": "1.0-draft-retargeted",
  "provenance": {
    "kind": "authored_animation_reference_not_measured_population_mean",
    "method": "Literature-informed sagittal pose fitting to a rigid 32+30 leg and a rigid boot; upper-body curves are authored. No raw mocap cohort averaging was performed.",
    "validation": "Discrete 5-percent sagittal samples only; continuous contact solver, multi-view render and transitions still require implementation and acceptance testing."
  },
  "units": {
    "legLengthRigUnits": 62,
    "referencePhysicalLegLengthM": 0.9,
    "lengths": "multiples of thigh+shank length",
    "angles": "degrees",
    "phase": "percent of ipsilateral heel-contact to next ipsilateral heel-contact",
    "forwardAxis": "forward along body heading",
    "upAxis": "up",
    "hipAngle": "thigh forward from gravity-down; geometric rig angle, NOT laboratory pelvic-frame hip angle",
    "ankleAngle": "positive dorsiflexion; zero when sole is perpendicular to shank",
    "pelvisLateral": "positive toward reference right leg",
    "pelvisRotation": "positive when reference right hip is forward",
    "pelvisObliquity": "positive when reference right hip is higher",
    "trunkPitch": "absolute forward lean",
    "headPitch": "absolute head forward pitch",
    "thoraxRotation": "absolute yaw relative to path heading; not relative-to-pelvis",
    "shoulderFlex": "positive arm forward relative to trunk, same-side leg phase",
    "elbowFlex": "positive flexion"
  },
  "rig": {
    "heightWithoutHat": 130,
    "thigh": 32,
    "shank": 30,
    "ankleSoleHeight": 3,
    "pelvisToNeck": 43,
    "neckToHeadCenter": 13,
    "shoulderBelowNeck": 4,
    "upperArm": 24,
    "forearm": 21,
    "stretchAllowed": false,
    "meshDeformationAllowed": false,
    "bootHeelBehindAnkleLegLen": 0.08,
    "bootToeAheadAnkleLegLen": 0.2,
    "bootAnkleHeightLegLen": 0.04838709677419355,
    "bootGeometryStatus": "assumed; calibrate to actual painted sole and reretarget",
    "hipSeparationLegLen": 0.16,
    "stepWidthLegLen": 0.12,
    "widthStatus": "authored initial settings, not supplied anatomy"
  },
  "phases": {
    "normal": {
      "initialContactPct": 0,
      "loadingResponsePct": [0,10],
      "midStancePct": [10,30],
      "terminalStancePct": [30,50],
      "preSwingPct": [50,60],
      "initialSwingPct": [60,73],
      "midSwingPct": [73,87],
      "terminalSwingPct": [87,100],
      "stancePct": 60,
      "doubleSupportTotalPct": 20,
      "footFlatPct": 8,
      "heelRisePct": 34
    },
    "slow": {
      "initialContactPct": 0,
      "loadingResponsePct": [0,14],
      "midStancePct": [14,34],
      "terminalStancePct": [34,50],
      "preSwingPct": [50,64],
      "initialSwingPct": [64,76],
      "midSwingPct": [76,88],
      "terminalSwingPct": [88,100],
      "stancePct": 64,
      "doubleSupportTotalPct": 28,
      "footFlatPct": 10,
      "heelRisePct": 38
    },
    "oppositeLegOffsetPct": 50,
    "timingStatus": "normal conventional approximation; slow authored preset"
  },
  "referenceSpeedMps": 1.3,
  "pelvisMeanHeightLegLen": 1.0302631288560131,
  "curves": {
    "hipFlexDeg": [[0,21.45],[5,19.22],[10,16.41],[15,12.79],[20,6.84],[25,0.71],[30,-4.95],[35,-10.53],[40,-14.24],[45,-17.23],[50,-14.33],[55,-9.8],[60,-11.37],[65,3.97],[70,18.21],[75,27.82],[80,31.76],[85,30.82],[90,27.79],[95,24.31],[100,21.45]],
    "kneeFlexDeg": [[0,7.16],[5,10.26],[10,13.08],[15,14.93],[20,11.95],[25,8.53],[30,6.09],[35,3.78],[40,5.16],[45,7.59],[50,21.23],[55,35.75],[60,36.73],[65,54.68],[70,61.82],[75,57.76],[80,45.42],[85,29.22],[90,16.02],[95,8.58],[100,7.16]],
    "ankleDeg": [[0,5.71],[5,-1.96],[10,-3.33],[15,2.14],[20,5.11],[25,7.81],[30,11.04],[35,13.32],[40,14.4],[45,12.82],[50,10.55],[55,0.55],[60,-11.9],[65,-14.29],[70,-1.39],[75,-0.06],[80,1.67],[85,3.4],[90,3.23],[95,4.27],[100,5.71]],
    "footToGroundDeg": [[0,20.0],[5,7.0],[10,0],[15,0],[20,0],[25,0],[30,0],[35,-1.0],[40,-5.0],[45,-12.0],[50,-25.0],[55,-45.0],[60,-60.0],[65,-65.0],[70,-45.0],[75,-30.0],[80,-12.0],[85,5.0],[90,15.0],[95,20.0],[100,20.0]],
    "ankleHeightLegLen": [[0,0.07283],[5,0.05778],[10,0.04839],[15,0.04839],[20,0.04839],[25,0.04839],[30,0.04839],[35,0.05187],[40,0.06563],[45,0.08891],[50,0.12838],[55,0.17564],[60,0.1974],[65,0.21394],[70,0.20214],[75,0.16807],[80,0.12848],[85,0.1012],[90,0.09198],[95,0.08492],[100,0.07283]],
    "ankleForwardLegLen": [[0,0.30815],[5,0.24526],[10,0.17397],[15,0.09619],[20,0.01842],[25,-0.05936],[30,-0.13714],[35,-0.21404],[40,-0.28772],[45,-0.35604],[50,-0.40906],[55,-0.43323],[60,-0.4619],[65,-0.33879],[70,-0.17245],[75,-0.00057],[80,0.1573],[85,0.27789],[90,0.33931],[95,0.34365],[100,0.30815]],
    "heelHeightLegLen": [[0,0],[5,0],[10,0],[15,0],[20,0],[25,0],[30,0],[35,0.00489],[40,0.0244],[45,0.05822],[50,0.11833],[55,0.19799],[60,0.24249],[65,0.266],[70,0.22449],[75,0.16617],[80,0.09778],[85,0.04602],[90,0.02454],[95,0.01209],[100,0]],
    "heelForwardLegLen": [[0,0.24953],[5,0.17175],[10,0.09397],[15,0.01619],[20,-0.06158],[25,-0.13936],[30,-0.21714],[35,-0.29487],[40,-0.37163],[45,-0.44435],[50,-0.50202],[55,-0.52402],[60,-0.54381],[65,-0.41645],[70,-0.26324],[75,-0.09405],[80,0.06899],[85,0.20241],[90,0.27456],[95,0.28502],[100,0.24953]],
    "toeHeightLegLen": [[0,0.09577],[5,0.03412],[10,0],[15,0],[20,0],[25,0],[30,0],[35,0],[40,0],[45,0],[50,0],[55,0],[60,0],[65,0.01223],[70,0.0265],[75,0.02617],[80,0.03956],[85,0.07043],[90,0.09701],[95,0.10786],[100,0.09577]],
    "toeForwardLegLen": [[0,0.51264],[5,0.44966],[10,0.37397],[15,0.29619],[20,0.21842],[25,0.14064],[30,0.06286],[35,-0.01492],[40,-0.09269],[45,-0.17047],[50,-0.24825],[55,-0.32603],[60,-0.40381],[65,-0.29812],[70,-0.06525],[75,0.14844],[80,0.34287],[85,0.48134],[90,0.54501],[95,0.54814],[100,0.51264]],
    "pelvisVerticalLegLen": [[0,-0.00814],[5,-0.00715],[10,-0.00373],[15,0.00498],[20,0.01253],[25,0.01359],[30,0.00725],[35,-0.00213],[40,-0.00797],[45,-0.00922],[50,-0.00814],[55,-0.00715],[60,-0.00373],[65,0.00498],[70,0.01253],[75,0.01359],[80,0.00725],[85,-0.00213],[90,-0.00797],[95,-0.00922],[100,-0.00814]],
    "pelvisLateralLegLen": [[0,0],[5,0.00556],[10,0.01058],[15,0.01456],[20,0.01712],[25,0.018],[30,0.01712],[35,0.01456],[40,0.01058],[45,0.00556],[50,0],[55,-0.00556],[60,-0.01058],[65,-0.01456],[70,-0.01712],[75,-0.018],[80,-0.01712],[85,-0.01456],[90,-0.01058],[95,-0.00556],[100,0]],
    "pelvisRotationDeg": [[0,4.0],[5,3.8],[10,3.24],[15,2.35],[20,1.24],[25,0],[30,-1.24],[35,-2.35],[40,-3.24],[45,-3.8],[50,-4.0],[55,-3.8],[60,-3.24],[65,-2.35],[70,-1.24],[75,0],[80,1.24],[85,2.35],[90,3.24],[95,3.8],[100,4.0]],
    "pelvisObliquityDeg": [[0,0],[5,0.93],[10,1.76],[15,2.43],[20,2.85],[25,3.0],[30,2.85],[35,2.43],[40,1.76],[45,0.93],[50,0],[55,-0.93],[60,-1.76],[65,-2.43],[70,-2.85],[75,-3.0],[80,-2.85],[85,-2.43],[90,-1.76],[95,-0.93],[100,0]],
    "trunkPitchDeg": [[0,2.5],[5,2.4],[10,2.15],[15,1.85],[20,1.6],[25,1.5],[30,1.6],[35,1.85],[40,2.15],[45,2.4],[50,2.5],[55,2.4],[60,2.15],[65,1.85],[70,1.6],[75,1.5],[80,1.6],[85,1.85],[90,2.15],[95,2.4],[100,2.5]],
    "thoraxRotationDeg": [[0,-3.0],[5,-2.85],[10,-2.43],[15,-1.76],[20,-0.93],[25,0],[30,0.93],[35,1.76],[40,2.43],[45,2.85],[50,3.0],[55,2.85],[60,2.43],[65,1.76],[70,0.93],[75,0],[80,-0.93],[85,-1.76],[90,-2.43],[95,-2.85],[100,-3.0]],
    "headPitchDeg": [[0,0.25],[5,0.2],[10,0.08],[15,-0.08],[20,-0.2],[25,-0.25],[30,-0.2],[35,-0.08],[40,0.08],[45,0.2],[50,0.25],[55,0.2],[60,0.08],[65,-0.08],[70,-0.2],[75,-0.25],[80,-0.2],[85,-0.08],[90,0.08],[95,0.2],[100,0.25]],
    "shoulderFlexDeg": [[0,-17.89],[5,-17.75],[10,-16.27],[15,-13.58],[20,-9.96],[25,-5.75],[30,-1.38],[35,2.74],[40,6.21],[45,8.67],[50,9.89],[55,9.75],[60,8.27],[65,5.58],[70,1.96],[75,-2.25],[80,-6.62],[85,-10.74],[90,-14.21],[95,-16.67],[100,-17.89]],
    "elbowFlexDeg": [[0,12.0],[5,12.39],[10,13.53],[15,15.3],[20,17.53],[25,20.0],[30,22.47],[35,24.7],[40,26.47],[45,27.61],[50,28.0],[55,27.61],[60,26.47],[65,24.7],[70,22.47],[75,20.0],[80,17.53],[85,15.3],[90,13.53],[95,12.39],[100,12.0]]
  },
  "slowProfile": {
    "referenceSpeedMps": 0.9,
    "pelvisMeanHeightLegLen": 1.0323489238391377,
    "curves": {
      "hipFlexDeg": [[0,19.59],[5,18.68],[10,14.35],[15,11.5],[20,6.83],[25,1.82],[30,-2.46],[35,-6.53],[40,-10.7],[45,-13.19],[50,-15.0],[55,-11.84],[60,-6.69],[65,-0.92],[70,9.07],[75,19.5],[80,25.94],[85,27.37],[90,25.49],[95,22.98],[100,19.59]],
      "kneeFlexDeg": [[0,6.27],[5,11.59],[10,10.01],[15,12.01],[20,10.23],[25,7.7],[30,6.7],[35,6.16],[40,5.4],[45,7.89],[50,11.36],[55,24.03],[60,38.23],[65,47.89],[70,55.76],[75,57.26],[80,49.35],[85,34.93],[90,19.84],[95,10.52],[100,6.27]],
      "ankleDeg": [[0,-1.33],[5,-1.09],[10,-4.34],[15,0.51],[20,3.4],[25,5.88],[30,9.15],[35,12.69],[40,15.1],[45,16.09],[50,14.35],[55,10.87],[60,-0.08],[65,-9.19],[70,-3.31],[75,5.76],[80,8.42],[85,5.56],[90,2.35],[95,-0.46],[100,-1.33]],
      "footToGroundDeg": [[0,12.0],[5,6.0],[10,0],[15,0],[20,0],[25,0],[30,0],[35,0],[40,-1.0],[45,-5.0],[50,-12.0],[55,-25.0],[60,-45.0],[65,-58.0],[70,-50.0],[75,-32.0],[80,-15.0],[85,-2.0],[90,8.0],[95,12.0],[100,12.0]],
      "ankleHeightLegLen": [[0,0.06396],[5,0.05648],[10,0.04839],[15,0.04839],[20,0.04839],[25,0.04839],[30,0.04839],[35,0.04839],[40,0.05187],[45,0.06563],[50,0.08891],[55,0.12838],[60,0.17564],[65,0.20325],[70,0.20231],[75,0.1765],[80,0.13359],[85,0.09521],[90,0.0765],[95,0.07196],[100,0.06396]],
      "ankleForwardLegLen": [[0,0.28459],[5,0.22499],[10,0.16457],[15,0.09865],[20,0.03274],[25,-0.03318],[30,-0.0991],[35,-0.16501],[40,-0.23005],[45,-0.29186],[50,-0.34833],[55,-0.38949],[60,-0.4018],[65,-0.37236],[70,-0.27077],[75,-0.12398],[80,0.03344],[85,0.17369],[90,0.26975],[95,0.30586],[100,0.28459]],
      "heelHeightLegLen": [[0,0],[5,0],[10,0],[15,0],[20,0],[25,0],[30,0],[35,0],[40,0.00489],[45,0.0244],[50,0.05822],[55,0.11833],[60,0.19799],[65,0.24545],[70,0.23249],[75,0.17786],[80,0.10756],[85,0.04965],[90,0.01745],[95,0.008],[100,0]],
      "heelForwardLegLen": [[0,0.2164],[5,0.15048],[10,0.08457],[15,0.01865],[20,-0.04726],[25,-0.11318],[30,-0.1791],[35,-0.24501],[40,-0.31088],[45,-0.37578],[50,-0.43664],[55,-0.48244],[60,-0.49258],[65,-0.45578],[70,-0.35926],[75,-0.21747],[80,-0.05636],[85,0.09205],[90,0.19726],[95,0.23767],[100,0.2164]],
      "toeHeightLegLen": [[0,0.05822],[5,0.02927],[10,0],[15,0],[20,0],[25,0],[30,0],[35,0],[40,0],[45,0],[50,0],[55,0],[60,0],[65,0.008],[70,0.018],[75,0.02948],[80,0.03509],[85,0.03988],[90,0.05642],[95,0.06621],[100,0.05822]],
      "toeForwardLegLen": [[0,0.49028],[5,0.42895],[10,0.36457],[15,0.29865],[20,0.23274],[25,0.16682],[30,0.1009],[35,0.03499],[40,-0.03093],[45,-0.09684],[50,-0.16276],[55,-0.22867],[60,-0.29459],[65,-0.30741],[70,-0.17928],[75,0.01998],[80,0.2141],[85,0.37188],[90,0.47454],[95,0.51155],[100,0.49028]],
      "pelvisVerticalLegLen": [[0,-0.0113],[5,-0.00674],[10,-0.00146],[15,0.00565],[20,0.01152],[25,0.01323],[30,0.0094],[35,0.00087],[40,-0.00844],[45,-0.01273],[50,-0.0113],[55,-0.00674],[60,-0.00146],[65,0.00565],[70,0.01152],[75,0.01323],[80,0.0094],[85,0.00087],[90,-0.00844],[95,-0.01273],[100,-0.0113]],
      "pelvisLateralLegLen": [[0,0],[5,0.00433],[10,0.00823],[15,0.01133],[20,0.01331],[25,0.014],[30,0.01331],[35,0.01133],[40,0.00823],[45,0.00433],[50,0],[55,-0.00433],[60,-0.00823],[65,-0.01133],[70,-0.01331],[75,-0.014],[80,-0.01331],[85,-0.01133],[90,-0.00823],[95,-0.00433],[100,0]],
      "pelvisRotationDeg": [[0,3.0],[5,2.85],[10,2.43],[15,1.76],[20,0.93],[25,0],[30,-0.93],[35,-1.76],[40,-2.43],[45,-2.85],[50,-3.0],[55,-2.85],[60,-2.43],[65,-1.76],[70,-0.93],[75,0],[80,0.93],[85,1.76],[90,2.43],[95,2.85],[100,3.0]],
      "pelvisObliquityDeg": [[0,0],[5,0.62],[10,1.18],[15,1.62],[20,1.9],[25,2.0],[30,1.9],[35,1.62],[40,1.18],[45,0.62],[50,0],[55,-0.62],[60,-1.18],[65,-1.62],[70,-1.9],[75,-2.0],[80,-1.9],[85,-1.62],[90,-1.18],[95,-0.62],[100,0]],
      "trunkPitchDeg": [[0,1.8],[5,1.74],[10,1.59],[15,1.41],[20,1.26],[25,1.2],[30,1.26],[35,1.41],[40,1.59],[45,1.74],[50,1.8],[55,1.74],[60,1.59],[65,1.41],[70,1.26],[75,1.2],[80,1.26],[85,1.41],[90,1.59],[95,1.74],[100,1.8]],
      "thoraxRotationDeg": [[0,-1.5],[5,-1.43],[10,-1.21],[15,-0.88],[20,-0.46],[25,0],[30,0.46],[35,0.88],[40,1.21],[45,1.43],[50,1.5],[55,1.43],[60,1.21],[65,0.88],[70,0.46],[75,0],[80,-0.46],[85,-0.88],[90,-1.21],[95,-1.43],[100,-1.5]],
      "headPitchDeg": [[0,0.15],[5,0.12],[10,0.05],[15,-0.05],[20,-0.12],[25,-0.15],[30,-0.12],[35,-0.05],[40,0.05],[45,0.12],[50,0.15],[55,0.12],[60,0.05],[65,-0.05],[70,-0.12],[75,-0.15],[80,-0.12],[85,-0.05],[90,0.05],[95,0.12],[100,0.15]],
      "shoulderFlexDeg": [[0,-10.94],[5,-10.86],[10,-10.01],[15,-8.48],[20,-6.41],[25,-4.0],[30,-1.5],[35,0.85],[40,2.83],[45,4.24],[50,4.94],[55,4.86],[60,4.01],[65,2.48],[70,0.41],[75,-2.0],[80,-4.5],[85,-6.85],[90,-8.83],[95,-10.24],[100,-10.94]],
      "elbowFlexDeg": [[0,12.0],[5,12.24],[10,12.95],[15,14.06],[20,15.45],[25,17.0],[30,18.55],[35,19.94],[40,21.05],[45,21.76],[50,22.0],[55,21.76],[60,21.05],[65,19.94],[70,18.55],[75,17.0],[80,15.45],[85,14.06],[90,12.95],[95,12.24],[100,12.0]]
    }
  },
  "curveRoles": {
    "hard": "world contact anchors, rigid segment lengths, nonpenetration",
    "soft": "sampled pelvis displacement, swing ankle path, boot pitch and upper body",
    "derived": "hipFlexDeg, kneeFlexDeg, ankleDeg, heel and toe coordinates after final IK",
    "sampling": "0 and 100 are the same pose; extra contact knots must be inserted before interpolation",
    "extraFootAngleKnots": {
      "normal": [[8,0],[34,0]],
      "slow": [[10,0],[38,0],[64,-55]]
    },
    "interpolation": "event-segmented shape-preserving cubic; world swing endpoint derivatives clamped to contact motion; never independently interpolate derived heel/toe/ankle angles",
    "swingEndpointGroundVelocity": "heel zero at initial contact; toe zero at toe-off; ankle velocity follows active rigid-boot pivot"
  },
  "speedScaling": {
    "status": "authored control law, not fitted population equation",
    "validSteadySpeedMps": [0.7,1.7],
    "referenceSpeedMps": 1.3,
    "referenceStepLengthLegLen": 0.7777777777777777,
    "stepLengthExponent": 0.45,
    "formulas": {
      "v0": "1.3*sqrt(physicalLegLengthM/0.9)",
      "stepLengthM": "physicalLegLengthM*(0.7/0.9)*pow(speedMps/v0,0.45)*individualStepScale",
      "strideLengthM": "2*stepLengthM",
      "cadenceStepsPerMin": "60*speedMps/stepLengthM",
      "cycleDurationSec": "2*stepLengthM/speedMps",
      "phaseUpdate": "phase += distanceIncrement/latchedStrideLength; never distanceTotal/currentStrideLength",
      "interpolationWeight": "clamp((speedMps-0.9)/0.4,0,1)"
    },
    "normal": {
      "speedMps": 1.3,
      "stepLengthM": 0.7,
      "cadenceStepsPerMin": 111.4286,
      "cycleDurationSec": 1.076923
    },
    "slow": {
      "speedMps": 0.9,
      "stepLengthM": 0.593243,
      "cadenceStepsPerMin": 91.0251,
      "cycleDurationSec": 1.318318
    },
    "brisk": {
      "speedMps": 1.7,
      "stepLengthM": 0.789815,
      "cadenceStepsPerMin": 129.1441,
      "stancePct": 58,
      "kneeSwingPeakTargetDeg": [60,66],
      "shoulderMeanDeg": -4,
      "shoulderAmplitudeDeg": 18,
      "trunkMeanPitchDeg": 3,
      "note": "retarget normal by event phase mapping and new foot placements; no separately validated brisk 5% table"
    },
    "betweenPresets": "Map phases by named gait events before blending; rebuild world contacts and solve IK. Do not blend planted positions."
  },
  "solver": {
    "priority": ["rigid_lengths_and_contact","nonpenetration","reachable_pelvis","planned_swing_path","nominal_joint_shape","secondary_body_motion"],
    "stanceContactModes": ["heel_pivot","flat_sole","toe_pivot"],
    "root": "continuous progression point on ground, not instantaneous average of moving foot positions",
    "kneeBranch": "anatomically forward flexion; retain continuity",
    "reachMarginLegLen": 0.0001,
    "maxRoutinePelvisCorrectionLegLen": 0.01,
    "unreachable": "replan unplanted landing or slow root; do not stretch or move planted anchor",
    "sagittalEquations": {
      "heel": "A + R(footAngle)*[-0.08,-3/62]",
      "toe": "A + R(footAngle)*[0.20,-3/62]",
      "knee": "acos((distanceHipAnkle^2-a^2-b^2)/(2*a*b))",
      "hip": "atan2(ankleX-hipX,hipY-ankleY)+atan2(b*sin(knee),a+b*cos(knee))",
      "ankle": "footAngle - hip + knee"
    },
    "phaseTransitionFallback": "time-based step transition near zero speed; never leave a swing leg frozen"
  },
  "transitions": {
    "parameterStatus": "authored timings",
    "start": {
      "prepareSec": [0.2,0.4],
      "pelvisShiftTowardStanceLegLen": [0.01,0.025],
      "firstStepScale": [0.55,0.8],
      "secondStepScale": [0.85,1],
      "speedRampSec": [0.7,1.2],
      "firstSwingFoot": "explicitly selected; unload before lift",
      "initialDoubleStance": "both anchors remain fixed during preparatory shift"
    },
    "stop": {
      "planningSteps": [1,2],
      "speedRampSec": [0.7,1.4],
      "finalStepScale": [0.35,0.7],
      "settleSec": [0.3,0.6],
      "feet": "finish swing, optional final short closing step; retain nonzero stance width",
      "emergency": "separate behavior, not this controller"
    },
    "turn": {
      "lookAheadSec": [0.15,0.3],
      "headingChangePerStepDeg": [5,15],
      "maxRoutineHeadingChangePerStepDeg": 25,
      "sharpTurnThresholdDeg": 60,
      "sharpTurnSteps": [2,4],
      "sharpTurnSpeedMps": [0.2,0.5],
      "curvatureFormula": "deltaHeadingRad = stepLengthM/turnRadiusM",
      "footAnchorRule": "rotate future placements, never orbit both planted feet around root",
      "headLocalYawClampDeg": 15,
      "noYawAsset": "omit local head yaw; use view transition"
    },
    "snow": {
      "surface": "packed snow with perceived slipperiness; artistic extrapolation",
      "speedMps": [0.6,1],
      "stepScaleRelativeSameSpeed": [0.8,0.95],
      "stancePct": [64,68],
      "contactFootPitchDeg": [5,12],
      "toeOffFootPitchDeg": [-45,-30],
      "stepWidthScale": [1.1,1.35],
      "armSwingScale": [0.4,0.8],
      "armAbductionDeg": [3,8],
      "kneeSwingPeakTargetDeg": [50,60],
      "toeClearanceInteriorSwingLegLen": [0.02,0.04],
      "deepSnow": "separate gait with snow height and foot lifting; unsupported by these data"
    }
  },
  "individualRanges": {
    "status": "bounded artistic distributions, not clinical percentiles",
    "sampleOncePerCharacter": {
      "preferredSpeedMps": [0.75,1.15],
      "stepLengthScale": [0.9,1.1],
      "armAmplitudeScale": [0.65,1.35],
      "armPhaseLagPct": [-2,4],
      "leftRightArmAmplitudeRatio": [0.85,1.15],
      "trunkMeanPitchOffsetDeg": [-1,2],
      "pelvisVerticalScale": [0.8,1.2],
      "pelvisLateralScale": [0.75,1.25],
      "stepWidthLegLen": [0.09,0.17],
      "phaseOffsetPct": [0,100]
    },
    "perStepSmoothVariation": {
      "stepLengthFraction": [-0.025,0.025],
      "armAmplitudeFraction": [-0.03,0.03],
      "cyclePhaseNoise": false,
      "randomEveryFrame": false
    },
    "constraints": ["cadence derived from speed and step length","reevaluate reach after variation","initial phase only if foot history initialized","do not infer disability or age stereotype from randomization"]
  },
  "idle": {
    "status": "authored subtle rigid-body motion; not measured physiological displacement",
    "breathingCyclesPerMin": [10,18],
    "trunkPitchAmplitudeDeg": [0.15,0.35],
    "neckOrChestVerticalAmplitudeLegLen": [0.001,0.003],
    "weightShiftIntervalSec": [4,12],
    "weightShiftDurationSec": [0.8,2],
    "weightShiftLegLen": [0.005,0.015],
    "headGestureIntervalSec": [3,9],
    "headPitchGestureDeg": [-2,2],
    "headYawGestureDeg": [-6,6],
    "headYawRequiresViewAsset": true,
    "feetStayAnchored": true,
    "noScalingToBreathe": true,
    "doNotSumAllMotionPeaks": true
  },
  "projection": {
    "logicalGroundPlane": "forward and lateral coordinates independent of screen pixels",
    "threeQuarterForwardHorizontalFactor": 0.72,
    "threeQuarterForwardVerticalFactor": 0.12,
    "verticalFactorStatus": "scene calibration default; signed by travel toward/away from camera",
    "formula": "screen = projectGround(worldFoot) + projectedHeight; screenY normally down",
    "frontBack": "forward displacement predominantly screen-depth; do not replace sagittal knee flexion with large sideways knee motion",
    "fixedRigLengths": "view-specific skeleton and art calibration; full 3D projection cannot be reproduced exactly with fixed undeformed 2D pieces",
    "yaw": "translate/layer shoulder and hip attachments; never turn all yaw into screen roll",
    "depthSort": "sort at group/contact boundaries with stable tie-break, no alternating every frame",
    "frontSwingReadability": "use foot height, overlap, timing and small lateral separation"
  },
  "smallScaleStyle": {
    "sizePx": [100,350],
    "legPxPerCharacterPx": 0.47692307692307695,
    "toeClearanceFloorPx": 1,
    "toeClearanceOptionalScale": [1,1.2],
    "armOptionalScale": [1,1.15],
    "pelvisVerticalMaxRoutineScale": 1.2,
    "render": "subpixel transforms; avoid per-frame integer rounding",
    "rigidCoat": "keep torso coat subtle; legs overlap beneath hem, never rotate coat as if hinged at shoulder",
    "assetOverlapLegLen": [0.025,0.05],
    "head": "absolute pitch stabilized, follows neck position; no bob cancellation by excessive neck translation",
    "viewSwitch": "at double support, 0.1-0.2 s masked crossfade if compatible; keep anchors"
  },
  "acceptance": {
    "contactAnchorDriftScreenPxMax": 0.25,
    "lengthRelativeErrorMax": 0.001,
    "groundPenetrationLegLenMax": 0.001,
    "phaseAndPositionFpsInvariant": true,
    "testFps": [24,30,60],
    "normalKneeSwingPeakDeg": [58,65],
    "slowKneeSwingPeakDeg": [53,62],
    "normalPelvisVerticalPeakToPeakLegLen": [0.018,0.035],
    "slowPelvisVerticalPeakToPeakLegLen": [0.018,0.035],
    "cadenceToleranceStepsPerMin": 1,
    "samplesEqualAtCycleBoundary": true,
    "continuousLoopVelocityCheckRequired": true,
    "noStretch": true,
    "transitionFeetMustSettle": true,
    "allViewsAndSizesRequired": true,
    "multiminuteCrowdTestSec": 180
  },
  "sources": [
    {
      "id": "S1",
      "title": "Kim et al. Biomechanics of Normal Gait. AAPM&R KnowledgeNow, aktualizace 2025",
      "url": "https://now.aapmr.org/biomechanics-normal-gait/",
      "supports": "Definice cyklu, fáze a přibližný poměr stoj/švih; nikoli naše 5% vzorky."
    },
    {
      "id": "S2",
      "title": "Perry. Normal Gait. Atlas of Limb Prosthetics, 2nd ed.",
      "url": "https://www.oandplibrary.org/alp/chap13-01.asp",
      "supports": "Pata, kotník a přednoží jako postupné rockery; biomechanické funkce končetin."
    },
    {
      "id": "S3",
      "title": "Fukuchi, Fukuchi, Duarte (2018). A public dataset of overground and treadmill walking kinematics and kinetics in healthy individuals",
      "url": "https://doi.org/10.7717/peerj.4640",
      "dataUrl": "https://doi.org/10.6084/m9.figshare.5722711",
      "supports": "42 osob, různé rychlosti, 101 normalizovaných vzorků; publikace a popis dat byly použity, surová data nebyla statisticky přepočítána."
    },
    {
      "id": "S4",
      "title": "Winiarski et al. (2019). Three-Dimensional Human Gait Pattern: Reference Data for Young, Active Women Walking with Low, Preferred, and High Speeds",
      "url": "https://doi.org/10.1155/2019/9232430",
      "supports": "Publikovaná maxima a minima kyčle, kolena a kotníku; 20 mladých aktivních žen, nikoli univerzální průměr dospělých."
    },
    {
      "id": "S5",
      "title": "Lewis et al. (2017). The Human Pelvis: Variation in structure and function during gait",
      "url": "https://doi.org/10.1002/ar.23552",
      "supports": "Pohyby pánve a variabilita, 44 osob; obliquita 7.4 ± 2.5 stupně peak-to-peak, rotace 9.5 ± 2.9 při preferované chůzi."
    },
    {
      "id": "S6",
      "title": "Comprehensive quantitative investigation of arm swing during walking at various speed and surface slope conditions (2016)",
      "url": "https://pubmed.ncbi.nlm.nih.gov/27367784/",
      "supports": "Závislost švihu paží na rychlosti, sklonu a tělesné výšce; nikoli naše přesné amplitudy."
    },
    {
      "id": "S7",
      "title": "Mahaki et al. (2021). How does external lateral stabilization constrain normal gait, apart from improving medio-lateral gait stability?",
      "url": "https://doi.org/10.1098/rsos.202088",
      "supports": "Vazby pohybů pánve, hrudníku a paží, rychlosti 0.83 / 1.25 / 1.66 m/s; amplituda definována max-minus-min."
    },
    {
      "id": "S8",
      "title": "Methodology for determining the sensitivity of swing leg toe clearance and leg length to swing leg joint angles during gait",
      "url": "https://pubmed.ncbi.nlm.nih.gov/16439130/",
      "supports": "10 osob, minimum výšky špičky 1.9 ± 0.5 cm přibližně v 51 % švihu; nelze zaměnit za výšku kotníku."
    },
    {
      "id": "S9",
      "title": "Cham, Redfern (2002). Changes in gait when anticipating slippery floors",
      "url": "https://doi.org/10.1016/S0966-6362(01)00150-3",
      "supports": "Kratší krok, menší úhel boty při kontaktu a změna došlapu při očekávaném klouzání; není to měření chůze hlubokým sněhem."
    },
    {
      "id": "S10",
      "title": "Anticipatory postural adjustment patterns during gait initiation across the adult lifespan",
      "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC5546309/",
      "supports": "Přípravné přenosy zatížení při rozejití a jejich individuální variabilita."
    },
    {
      "id": "S11",
      "title": "Biomechanical mechanisms and centre of pressure trajectory during planned gait termination",
      "url": "https://pubmed.ncbi.nlm.nih.gov/24930945/",
      "supports": "Plánované zastavování zahrnuje dopředné i boční brzdění; naše časy jsou návrhové."
    },
    {
      "id": "S12",
      "title": "Khobkhun, Hollands, Richards (2021). The Effect of Different Turn Speeds on Whole-Body Coordination in Younger and Older Healthy Adults",
      "url": "https://doi.org/10.3390/s21082827",
      "supports": "Koordinace hlavy, trupu, pánve a nohou při otočení; experiment s 180stupňovým otočením nelze přímo vydávat za všechny zatáčky za chůze."
    },
    {
      "id": "S13",
      "title": "Head stabilization strategies in the sagittal plane during locomotor tasks",
      "url": "https://pubmed.ncbi.nlm.nih.gov/15132026/",
      "supports": "Aktivní stabilizace orientace hlavy; neposkytuje použité stylizované amplitudy."
    },
    {
      "id": "S14",
      "title": "Respiratory disturbance to posture varies according to respiratory mode",
      "url": "https://pubmed.ncbi.nlm.nih.gov/20350584/",
      "supports": "Dýchání souvisí s posturálními pohyby; pohyb centra tlaku není přímo pohyb sprite pánve."
    },
    {
      "id": "S15",
      "title": "Biomechanical mechanism for transitions in phase and frequency of arm and leg swing during walking",
      "url": "https://pubmed.ncbi.nlm.nih.gov/15351887/",
      "supports": "Při velmi nízkých rychlostech není univerzální jedna fáze a poměr frekvencí paží a nohou."
    }
  ]
}
```

## E. Akceptační kritéria

Všechny níže uvedené tolerance jsou **technická kritéria tohoto projektu**, nikoli hranice zdravé a patologické chůze.

| Oblast | Test a očekávaný výsledek |
|---|---|
| Tuhé díly | Délka každé kosti se nemění; relativní numerická odchylka pod 0,1 %. Scale dílu se za chůze nemění. |
| Stojná noha | Aktivní kontakt driftuje nejvýše 0,25 px v největším testovaném zobrazení. Při toe rockeru se smí pohybovat pata a kotník, nesmí klouzat aktivní bod špičky. |
| Přepnutí rockerů | Pata→plná podrážka→špička bez skoku boty. Světové souřadnice starého a nového kontaktu odpovídají téže transformaci boty. |
| Podlaha | Žádný viditelný průnik podrážky; numerická tolerance nejvýše 0,001 L. Kontrolovat skutečný obrys assetu. |
| Dosah | Žádné skryté natažení nebo clamp nedosažitelného cíle. Při každém snímku `d ≤ a+b` pro obě nohy; korekce pánve běžně do 0,01 L. |
| Koleno | Výchozí běžný preset: maximum švihu 58–65°; pomalý 53–62°. Musí být vidět malé ohnutí při přijetí váhy, následné napřímení a oddělený větší švihový vrchol. |
| Pánev | Výchozí profily mají celkový svislý rozsah v toleranci 0,018–0,035 L. U H=100 px přibližně 0,86–1,67 px, u H=350 px 3,00–5,84 px. Nezaměnit s ±amplitudou. |
| Kadence | Při 0,9 m/s a referenční velikosti přibližně 91 kroků/min; při 1,3 m/s přibližně 111,4; tolerance ±1 krok/min v dlouhém ustáleném úseku. |
| Kontakt a fáze | Opačná noha je v ustáleném symetrickém presetu posunuta o 50 %. Toe-off 60 %, respektive 64 %, a dvojí opora 20 %, respektive 28 %. |
| Švih | Špička neškrtá o zem; pata a špička nejsou nezávisle animované. Vnitřní clearance odpovídá assetu a velikosti, nikoli automaticky klinické hodnotě z jiné boty. |
| Smyčka | Poloha a orientace v 0/100 % navazují; žádný viditelný skok rychlosti v důsledku špatné tangenty. Samotná shoda prvního/posledního řádku nestačí. |
| Paže | Při kontaktu pravé nohy je pravá paže přibližně vzadu. Ruka nepřeskakuje přes trup a loket nemění větev. |
| Start | Obě boty nejprve drží, jedna se odlehčí a následuje kratší první krok. Žádné teleportování na pózu z cyklu. |
| Stop | Postava opravdu dojde na plánovanou zastávku, dokončí švih a případně přešlápne. Obě boty pak drží; tělo se neusadí skluzem. |
| Zatáčka | Nové kontakty sledují zakřivení, staré se neposouvají. Otočení o 90/180° není otočení celého obrázku s oběma přilepenými nohami. |
| Pohledy | Zkouška side / front 3/4 / back 3/4 / front / back v 100, 200, 350 px. Žádná změna kadence způsobená projekcí. Žádné koleno vybočující jako boční pant v čelním pohledu. |
| FPS a export | Stejný seed, čas a trasa dávají stejné pózy při 24/30/60 fps a při offline renderu. Veškeré časování používá sekundy/dráhu, nikoli počet snímků. |
| Skupina | Aspoň 180 s scény s 12–20 lidmi. Žádná nechtěná synchronizace, hromadný pohyb hlavy nebo společná perioda idle. |
| Změna rychlosti | Zkouška 0,9→1,3→0,9 m/s bez skoku fáze, změny ukotvené nohy a krátkého zrychleného „kopnutí“. |
| Zimní varianta | Kratší kroky a plošší došlap jsou čitelné; nevzniká vysoké vojenské pochodování nebo trvalý hluboký podřep. |

### Co bylo skutečně ověřeno při přípravě tohoto zadání

Programově byly zkontrolovány oba profily v jejich 21 tabulkových vzorcích: dosažitelnost sagitální nohy, zpětný přepočet z úhlů na kotník, nepenetrace paty a špičky v těchto vzorcích a shoda hodnot 0/100 %. JSON byl znovu načten parserem. Výsledky:

| Rychlost m/s | Největší dosah kyčel–kotník/L | Max. koleno | Pánev peak-to-peak/L | Max. chyba FK po zaokrouhlení/L |
|---:|---:|---:|---:|---:|
| 1.3 | 0.999455 | 61.82° | 0.022817 | 0.000120 |
| 0.9 | 0.998890 | 57.26° | 0.025966 | 0.000097 |

Jde pouze o numerickou kontrolu referenčních póz. **Nebylo ověřeno** video skutečných malovaných assetů, spojité chování mezi tabulkovými body, dynamické změny rychlosti, pohledová projekce ani přechody v cílové aplikaci. Z těchto tabulek proto nelze vyvozovat, že výsledná animace už prošla všemi akceptačními kritérii. Při výměně boty, délek nebo pivotů se musí retargeting a kontroly opakovat.

## Zdroje a dohledatelnost hodnot

Číselné údaje převzaté z publikací jsou vyznačeny v A. Konkrétní tabulky C a JSON D jsou vlastní konstrukční návrh; odkazy níže nemají vyvolávat dojem, že dané studie publikovaly právě tyto tabulky. U některých zdrojů byl dostupný zejména publikovaný abstrakt; bez dostupných surových dat z nich nejsou odvozovány vlastní statistické odhady.

**[S1] [Kim et al. Biomechanics of Normal Gait. AAPM&R KnowledgeNow, aktualizace 2025](https://now.aapmr.org/biomechanics-normal-gait/)** — Definice cyklu, fáze a přibližný poměr stoj/švih; nikoli naše 5% vzorky.

**[S2] [Perry. Normal Gait. Atlas of Limb Prosthetics, 2nd ed.](https://www.oandplibrary.org/alp/chap13-01.asp)** — Pata, kotník a přednoží jako postupné rockery; biomechanické funkce končetin.

**[S3] [Fukuchi, Fukuchi, Duarte (2018). A public dataset of overground and treadmill walking kinematics and kinetics in healthy individuals](https://doi.org/10.7717/peerj.4640)** — 42 osob, různé rychlosti, 101 normalizovaných vzorků; publikace a popis dat byly použity, surová data nebyla statisticky přepočítána. [Databáze](https://doi.org/10.6084/m9.figshare.5722711).

**[S4] [Winiarski et al. (2019). Three-Dimensional Human Gait Pattern: Reference Data for Young, Active Women Walking with Low, Preferred, and High Speeds](https://doi.org/10.1155/2019/9232430)** — Publikovaná maxima a minima kyčle, kolena a kotníku; 20 mladých aktivních žen, nikoli univerzální průměr dospělých.

**[S5] [Lewis et al. (2017). The Human Pelvis: Variation in structure and function during gait](https://doi.org/10.1002/ar.23552)** — Pohyby pánve a variabilita, 44 osob; obliquita 7.4 ± 2.5 stupně peak-to-peak, rotace 9.5 ± 2.9 při preferované chůzi.

**[S6] [Comprehensive quantitative investigation of arm swing during walking at various speed and surface slope conditions (2016)](https://pubmed.ncbi.nlm.nih.gov/27367784/)** — Závislost švihu paží na rychlosti, sklonu a tělesné výšce; nikoli naše přesné amplitudy.

**[S7] [Mahaki et al. (2021). How does external lateral stabilization constrain normal gait, apart from improving medio-lateral gait stability?](https://doi.org/10.1098/rsos.202088)** — Vazby pohybů pánve, hrudníku a paží, rychlosti 0.83 / 1.25 / 1.66 m/s; amplituda definována max-minus-min.

**[S8] [Methodology for determining the sensitivity of swing leg toe clearance and leg length to swing leg joint angles during gait](https://pubmed.ncbi.nlm.nih.gov/16439130/)** — 10 osob, minimum výšky špičky 1.9 ± 0.5 cm přibližně v 51 % švihu; nelze zaměnit za výšku kotníku.

**[S9] [Cham, Redfern (2002). Changes in gait when anticipating slippery floors](https://doi.org/10.1016/S0966-6362(01)00150-3)** — Kratší krok, menší úhel boty při kontaktu a změna došlapu při očekávaném klouzání; není to měření chůze hlubokým sněhem.

**[S10] [Anticipatory postural adjustment patterns during gait initiation across the adult lifespan](https://pmc.ncbi.nlm.nih.gov/articles/PMC5546309/)** — Přípravné přenosy zatížení při rozejití a jejich individuální variabilita.

**[S11] [Biomechanical mechanisms and centre of pressure trajectory during planned gait termination](https://pubmed.ncbi.nlm.nih.gov/24930945/)** — Plánované zastavování zahrnuje dopředné i boční brzdění; naše časy jsou návrhové.

**[S12] [Khobkhun, Hollands, Richards (2021). The Effect of Different Turn Speeds on Whole-Body Coordination in Younger and Older Healthy Adults](https://doi.org/10.3390/s21082827)** — Koordinace hlavy, trupu, pánve a nohou při otočení; experiment s 180stupňovým otočením nelze přímo vydávat za všechny zatáčky za chůze.

**[S13] [Head stabilization strategies in the sagittal plane during locomotor tasks](https://pubmed.ncbi.nlm.nih.gov/15132026/)** — Aktivní stabilizace orientace hlavy; neposkytuje použité stylizované amplitudy.

**[S14] [Respiratory disturbance to posture varies according to respiratory mode](https://pubmed.ncbi.nlm.nih.gov/20350584/)** — Dýchání souvisí s posturálními pohyby; pohyb centra tlaku není přímo pohyb sprite pánve.

**[S15] [Biomechanical mechanism for transitions in phase and frequency of arm and leg swing during walking](https://pubmed.ncbi.nlm.nih.gov/15351887/)** — Při velmi nízkých rychlostech není univerzální jedna fáze a poměr frekvencí paží a nohou.
