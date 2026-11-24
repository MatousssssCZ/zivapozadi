# Chyby chůze a davu – stav, příčiny, návrh a zadání průzkumu pro ChatGPT

Stav k verzi `75834c0`. Dokument shrnuje, co je v aplikaci teď špatně, proč (podle kódu
a měření), co navrhuji a jaké zadání poslat ChatGPT, aby udělal průzkum a připravil
podrobný popis řešení (stejně jako dříve u chůze – `docs/zdroje/zadani-prirozene-chuze-2D.md`).

## 1. Jak to teď funguje (stručně, pro kontext)

* Scéna je malovaný obraz 1920×1080, postavy jsou 2D „cut-out“ loutky z malovaných dílů
  (hlava, trup, nadloktí, předloktí, palčák, stehno, lýtko, bota, čepice, šála) ve dvou
  pohledech: šikmo zepředu a šikmo zezadu (zrcadlením 4 směry). Postava je vysoká 130 jednotek,
  noha (stehno + lýtko) 62 j., šířka postavy 24 j.
* Perspektiva scény: měřítko postavy roste lineárně s polohou y (náměstí: y 900 → 0,36×,
  y 1080 → 1,3×).
* Pohyb: postavy jdou po síti tras (uzly, hrany), simulace má pevný krok 1/60 s a je
  deterministická. Hloubka se teď modeluje **jedním konstantním zkrácením K = 0,4**
  (1 px svisle po obrazovce = 2,5 j. skutečné dráhy).
* Chůze je řízená kontakty (tabulky z průzkumu): pata se při došlapu ukotví ve scéně, kotník
  dopočítá IK, švih jde po tabulkové dráze. Krok do hloubky se promítá do obrazu vektorem
  (cos φ, K·sin φ). Aby se koleno při chůzi do hloubky neohýbalo „do schodu“, noha se
  perspektivně zkosí a zkrátí (nejvýš ±15 %).
* Dav: každá postava má osobní poloměr 0,55–0,8 šířky postavy. Chodci plánují boční úhyb:
  pohodlný odstup je 1,3× součet poloměrů, posun do strany je nejvýš 2,4 šířky postavy a
  rychlost úhybu nejvýš 0,45 rychlosti chůze.
  * Za pomalejším postava zpomalí (nejméně na 9 j./s × měřítko).
  * Při křížení drah (výhled 1,6 s) dá přednost ten, kdo je od místa střetu dál, a zpomalí
    na max(14 j./s × měřítko; 0,4 rychlosti druhého).
  * Pevná podmínka: středy dvou postav se nesmí přiblížit víc než na součet poloměrů.
    Překrytí se rozestoupí rychlostí max(0,6 v; 1,4 šířky/s) a posun od trasy je nejvýš
    3 šířky.
  * Postavy na místě činnosti (fronta, pult, stolek) se neodstrkují.
  * Dvojice: druhý člen jde vedle vůdce a nemá vlastní plánování úhybu.

## 2. Seznam chyb

### A. Postavy stále procházejí skrz sebe
* Na náměstí za 5 minut je zhruba 130 snímko-dvojic, kdy jsou středy postav blíž než
  0,6 šířky postavy. Dříve jich bylo ~2 070.
* Příčiny podle kódu:
  1. Rozestup je jen „měkký“: posun se mění omezenou rychlostí, takže při rychlém
     přiblížení nestihne zabránit průniku.
  2. Druhý člen dvojice úhyb neplánuje, jen se nechá odstrkovat.
  3. Postavy na místě činnosti (fronta) se neuhýbají vůbec. Když trasa vede přes frontu,
     chodec ji může proříznout, pokud nestihne uhnout v mezích 2,4–3 šířek.
  4. Dvojice, která vyráží ze stejného bodu (po pozdravu ke stánku), začíná úplně překrytá.
  5. Plánování úhybu bere jen postavy před sebou (v pásu ±1,6 odstupu). Kdo přichází zboku
     nebo zezadu, se řeší až pevnou podmínkou.
  6. Perspektiva: kvůli chybné hloubce (bod E) jsou dvě postavy, které jsou „fyzicky“ metr
     od sebe v hloubce, na obrazovce skoro přes sebe. Zčásti jde o přirozené zakrytí, ale
     působí to jako průchod.

### B. Při míjení se postavy výrazně zpomalují
* Pravidla „za pomalejším zpomal“ a „při křížení dej přednost“ se spouští i při běžném
  míjení: dva chodci, kteří se jen těsně minou šikmo, dostanou strop rychlosti 9–14 j./s
  × měřítko, tedy výrazné zpomalení až skoro zastavení.
* Skuteční chodci se při míjení zpomalují jen málo. Hlavně mírně změní směr, a to včas,
  2–3 s předem.

### C. Občas poskočí kolena (hlavně při chůzi dolů po obrazovce)
* Příčina v kódu: omezení perspektivního zkrácení nohy na ±15 % hledá zkosení v pevných
  stupních (100 %, 75 %, 50 %, 25 %, 0 %). Když se mezi snímky přepne stupeň, koleno skočí.
* Druhý zdroj: zkosení podle směru chůze je až ±0,6 a mění se s natočením. Při zatáčení
  se mění skokem, protože se zároveň přepíná pohled (zrcadlení).

### D. Bota se nezaboří do sněhu
* Boty stojí na povrchu. V zasněžených místech by se měly trochu zabořit, případně
  zanechávat stopy.

### E. Chůze dolů po obrazovce působí jako sestup ze schodů
* Toto je hlavní chyba. Hloubka se modeluje konstantou K = 0,4, ale nastavení perspektivy
  scény (měřítko 0,36× → 1,3× na 180 px) odpovídá skutečné kameře, ze které vychází:
  * horizont y ≈ 831,
  * výška kamery ≈ 191 j. (≈ 2,6 m),
  * vzdálenost ke spodnímu okraji ≈ 21 m, k radnici ≈ 77 m,
  * tedy **skutečné K ≈ 0,12 dole a ≈ 0,03 u radnice**, ne 0,4.
* Náměstí je tak v chůzi „stlačené“: 180 px do hloubky odpovídá asi 6 m, ale měřítko se při
  tom změní 3,6×, jako by šlo o 56 m.
* Postava jdoucí dolů tedy rychle roste a chodidla se rozkračují příliš do výšky obrazu.
  Působí to jako sestup po svahu nebo schodech, ne jako chůze po rovině s měnící se
  perspektivou.

## 3. Návrh řešení (můj, ke srovnání s průzkumem)

1. **Perspektiva z jedné kamery.** K(y) = (y − y_horizontu) / f odvodit z nastavení hloubky
   scény. Ohnisková vzdálenost f vyjde z výšky kamery nebo zorného úhlu; v nastavení scény by
   byl „úhel záběru“ nebo „výška kamery“. Stejná funkce bude platit pro:
   * rychlost po obrazovce (do hloubky je postava po obrazovce pomalejší a jen roste),
   * promítání kroků (rozkrok do výšky obrazu je malý, takže žádné schody),
   * rozestupy (vzdálenost v metrech).
2. **Nohy:** zkosení plynule (spojitá funkce, žádné stupně), vyhladit v čase a navázat na
   K(y), které je malé. Při chůzi do hloubky se bude spoléhat hlavně na zkrácení kroku v
   obraze a na změnu měřítka.
3. **Dav:**
   * předvídavý úhyb (čas do srážky, sociální síla / ORCA) včas a jen změnou směru;
   * zpomalení jen při skutečném střetu, který nejde vyřešit úhybem;
   * pevná nepřekročitelná vzdálenost (projekce poloh na konci kroku);
   * dvojice jako jeden širší „objekt“;
   * fronta jako pevná překážka, kterou trasy obcházejí (přeplánování trasy, ne jen posun).
4. **Sníh:**
   * využít existující **oblasti typu „sníh“** (polygony v projektu, už jsou v datech); barva
     pozadí jen jako pomocník pro automatický první návrh oblasti;
   * v oblasti sněhu se bota při došlapu zaboří o 1–3 cm (podle hloubky sněhu oblasti):
     spodní část boty se překryje „návějí“ vzorkovanou z pozadí pod nohou, takže barva
     sedí;
   * volitelně slábnoucí stopy (otisky) na místě kotvy paty, které po desítkách sekund zmizí.

## 4. Zadání pro ChatGPT (vložit celé)

```text
Potřebuji od tebe průzkum a podrobné technické zadání pro implementaci v mé aplikaci. Pracuješ jako odborník na simulaci chodců (crowd simulation), 2D animaci postav a perspektivu. Výsledek bude implementovat jiný vývojář (AI) v TypeScriptu, takže potřebuji přesné vzorce, parametry s jednotkami, pseudokód a měřitelná akceptační kritéria. Nejdřív udělej průzkum (odborné zdroje o chování chodců, proxemice, skupinách, modelech typu social force / ORCA / predictive avoidance / time-to-collision, o animaci 2D loutek a o perspektivě), pak napiš zadání.

KONTEXT APLIKACE
- Desktopová aplikace vytváří živé zimní obrazy: malované pozadí 1920×1080 (vánoční náměstí, kamera mírně nad úrovní očí), po kterém chodí malované 2D postavy (cut-out loutky: hlava, trup kabátu, nadloktí, předloktí, palčák, stehno, lýtko, bota, čepice, šála). Pohledy: šikmo zepředu a šikmo zezadu (zrcadlením 4 směry), při chůzi se nepoužívá čistě čelní/zadní pohled. Výstup je video (30 fps), simulace má pevný krok 1/60 s a musí být deterministická (seed, žádný náhodný čas).
- Postava: výška 130 jednotek (≈1,75 m), noha (stehno 32 + lýtko 30) 62 j., šířka postavy (ramena) 24 j., kotník 3 j. nad zemí, pata 3,3 j. za kotníkem, přednoží 7,9 j. před kotníkem.
- Perspektiva scény je zadána lineárním měřítkem postavy podle svislé polohy chodidel na obrazovce: y = 900 px → měřítko 0,36, y = 1080 px → měřítko 1,3 (mezi tím lineárně). Z toho plyne horizont y ≈ 831 px; výšku kamery a ohniskovou vzdálenost neznám (navrhni, jak je odvodit nebo jak je má uživatel jednoduše zadat).
- Chůze je kontaktně řízená podle tabulek (fáze, došlap paty, celá podrážka, odvalení, švih; běžná 1,3 m/s a pomalá 0,9 m/s); pata se při došlapu ukotví ve scéně, kotník a koleno se dopočítají 2D IK. Pohyb po obrazovce teď počítá hloubku konstantou K = 0,4 (1 px svisle = 2,5 jednotky dráhy) a krok do hloubky promítá vektorem (cos φ, K·sin φ). Aby se při chůzi do hloubky koleno neohýbalo jako do schodu, noha se zkosí a díly se zkrátí/prodlouží nejvýš o 15 %.
- Postavy jdou po síti tras (uzly a hrany nakreslené uživatelem; úzké průchody s rezervací). Chování: přijdou zpoza okraje obrazu, buď projdou, nebo si dojdou na kávu ke stánku (fronta 4 místa, obsluha, stolky pro dva, koš), nebo se potkají s přítelem (pozdrav) a jdou spolu (dvojice jde vedle sebe). Rozestupy teď: osobní poloměr 0,55–0,8 šířky postavy; boční úhyb (pohodlný odstup 1,3× součet poloměrů, posun max 2,4 šířky, rychlost úhybu max 0,45 rychlosti chůze); zpomalení za pomalejším; při křížení drah (výhled 1,6 s) zpomalí ten, kdo je od místa střetu dál; pevná podmínka minimální vzdálenosti se rozestupuje omezenou rychlostí; postavy ve frontě/u stolku se neodstrkují; druhý z dvojice úhyb neplánuje.

CHYBY, KTERÉ MÁ ŘEŠENÍ ODSTRANIT
1) Postavy stále občas procházejí skrz sebe (zejména: rychlé přiblížení, křížení drah, druhý z dvojice, průchod kolem fronty, dvojice vyrážející ze stejného bodu, přicházející zboku/zezadu).
2) Při míjení se postavy zbytečně výrazně zpomalují (skoro zastaví); skuteční chodci se míjejí včasnou malou změnou směru téměř bez zpomalení.
3) Při chůzi dolů po obrazovce (ke kameře) občas poskočí kolena (zkosení nohy se omezuje po skocích a mění se se směrem a pohledem).
4) Chůze dolů po obrazovce působí jako sestup ze schodů/svahu. Konstanta K = 0,4 neodpovídá perspektivě scény: z měřítek plyne skutečné zkrácení hloubky ≈ 0,03–0,12, takže náměstí je pro chůzi „stlačené“ (180 px do hloubky ≈ 6 m chůze, ale měřítko se změní 3,6×, jako by to bylo ~56 m). Postava má jít po rovině, jen se mění perspektiva.
5) Boty se nezabořují do sněhu (chci jemné zaboření, příp. stopy, jen tam, kde je sníh).

CO MÁ ZADÁNÍ OBSAHOVAT
A) Perspektiva a mapování země: jeden konzistentní model kamery (pinhole), jak z lineárního měřítka (a případně jednoho dalšího parametru – výška kamery nebo zorný úhel) odvodit horizont, ohniskovou vzdálenost a převod obrazovka ↔ rovina země (metry). Vzorce pro: rychlost po obrazovce v daném směru, promítnutí kroku (posun chodidla) do obrazu, lokální měřítko, vzdálenost dvou postav v metrech. Jak zachovat kotvy pat (chodidlo nesmí klouzat) a přitom nemít „schody“. Doporuč, zda zkosení/zkrácení nohou vůbec použít a jak plynule (bez skoků), včetně vyhlazení v čase a chování při změně pohledu/zrcadlení. Ukaž číselně pro tuto scénu.
B) Chování davu: model chodců vhodný pro malé skupiny (5–30 osob) na náměstí s trasami – předvídavé vyhýbání (time-to-collision nebo podobné), preference strany (míjení vpravo), proxemika (osobní prostor s individuální odchylkou), chůze ve dvojici (formace vedle sebe, při zúžení za sebou), fronta u stánku (jak se k ní chovat, obcházet, napojit se na konec), stojící skupinky (pozdrav, rozhovor – vzdálenosti a natočení), zpomalování jen když je to opravdu nutné. Konkrétní parametry (vzdálenosti v metrech, časové horizonty, maximální úhly a rychlosti změny směru, zrychlení/zpomalení) s odkazy na zdroje. Algoritmus pro pevnou nepřekročitelnost (žádný průnik nikdy – např. projekce/kolizní omezení na konci kroku) tak, aby nevznikalo cukání a nohy pohyb „odkráčely“ (pohyb těla pohání kroky; boční úkrok musí vypadat jako krok, ne klouzání). Determinismus a výkon (do 30 postav, 60 kroků/s).
C) Končetiny: příčiny a řešení skákání kolen a „gumových“ nohou u 2D loutky s IK při perspektivě; doporučené limity a vyhlazení; jak má vypadat chůze ke kameře a od kamery u 2D cut-out postavy (co se mění v obraze: délka kroku, výška zvednutí, překrývání nohou, měřítko), aby působila jako chůze po rovině. Totéž stručně pro paže (švih, pití z kelímku) – co je přirozené.
D) Sníh: jak realisticky a levně zobrazit zaboření bot do sněhu u 2D postav (hloubka v cm, kdy během kroku, jak zakrýt spodek boty – maska/závěj vzorkovaná z pozadí, stín), stopy ve sněhu (tvar, životnost, kolik jich), jak určit, kde je sníh (polygony oblastí vs. barva pozadí – doporuč).
E) Akceptační testy: měřitelná kritéria, která lze automaticky ověřit v simulaci (např. minimální vzdálenost středů v metrech nikdy menší než X; podíl času se zpomalením > Y % při míjení; maximální změna úhlu kolena mezi snímky; poměr svislého a vodorovného rozkroku v obraze při chůzi ke kameře; skluz opory < 0,25 px; atd.), včetně testovacích scénářů (protijdoucí, křížení 90°, předjíždění, dvojice proti jednotlivci, průchod kolem fronty, hustý provoz 20 osob).
F) Priority a pořadí implementace, rizika, co nedělat.

FORMA VÝSTUPU
- Jeden dokument v Markdownu (česky), název „Zadani_dav_perspektiva_koncetiny_2D_Claude.md“, s kapitolami A–F, vzorci, tabulkou parametrů (hodnota, jednotka, rozsah, zdroj), pseudokódem a seznamem zdrojů. Piš tak, aby šel přímo implementovat; tam, kde si nejsi jistý, uveď rozsah a doporučenou výchozí hodnotu.
```

## 5. Co udělám po dodání zadání

Implementuji to v pořadí podle priorit:

1. perspektiva (opraví „sestupování“, rozkrok i část průchodů),
2. nohy bez skoků,
3. dav,
4. sníh.

Ke každému bodu doplním automatické testy podle kapitoly E.
