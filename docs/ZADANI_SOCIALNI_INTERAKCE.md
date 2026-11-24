# Zadání průzkumu pro ChatGPT: sociální interakce a přirozené animace

Cíl: aby postavy, které spolu mluví, zdraví se, stojí ve frontě nebo pijí u stolku, měly víc
přirozených pohybů (gesta, naslouchání, střídání v řeči, drobné zimní pohyby) a aby tyto pohyby
navazovaly a nepůsobily roboticky. Výsledek zpracuje ChatGPT po průzkumu jako implementační
zadání (stejně jako zadání chůze a davu v `docs/zdroje/`).

## Co aplikace teď umí (kontext pro zadání)

* **Postavy** jsou 2D „cut-out“ loutky z malovaných dílů: hlava (jeden obrázek, lze naklonit),
  trup kabátu, nadloktí, předloktí, palčák, stehno, lýtko, bota, čepice, šála.
* **Pohledy:** šikmo zepředu a šikmo zezadu (zrcadlením 4 směry). Obličej je namalovaný
  napevno – bez mimiky a bez pohybu úst.
* **Výpočet póz:** ruce IK nebo FK (rameno, loket, zápěstí), nohy kontaktně řízené.
* **Pohyb těla:** pánev, lehké přenášení váhy v klidu, dech, náklon hlavy.
* **Akce:**

  | Akce | Co dělá |
  |---|---|
  | `talk` | rytmický pohyb jedné ruky |
  | `drink` | zvednutí kelímku, naklonění, záklon hlavy |
  | `receive` | převzetí kelímku |
  | `drop` | vhození do koše |
  | `lidDrop` | otevření víka, vhození, zavření |
  | `look` | rozhlédnutí |

* **Sociální situace:**
  * přátelé se potkají, pozdraví (natočí se k sobě, krátce mluví);
  * jdou spolu na kávu: fronta, stoleček pro dva, povídání se střídáním, pití;
  * pak odejdou;
  * dvojice chodí vedle sebe.
* **Simulace:** pevný krok 1/60 s, deterministická (seed), export videa 30 fps, 5–30 postav.

## Prompt (vložit do ChatGPT celý)

```text
Potřebuji od tebe průzkum a podrobné implementační zadání. Pracuješ jako odborník na neverbální komunikaci, proxemiku, konverzační analýzu a animaci postav (2D cut-out / procedurální animace). Výsledek bude implementovat jiný vývojář (AI) v TypeScriptu, takže potřebuji přesné popisy pohybů v řeči kloubů, časování, pravděpodobnosti, stavové automaty a měřitelná akceptační kritéria. Nejdřív udělej průzkum (odborné zdroje: konverzační střídání a pauzy, backchanneling, kývání a naslouchání, typy gest – beat, deiktická, ikonická, regulátory; F-formace a proxemika ve skupinách; pozdravy a loučení; chování v chladu; animační principy – anticipace, follow-through, overlap, easing; procedurální idle animace), pak napiš zadání.

KONTEXT APLIKACE
- Desktopová aplikace vytváří živé zimní obrazy (vánoční trh na náměstí). Postavy jsou malované 2D „cut-out“ loutky: hlava (jeden obrázek s namalovaným obličejem – bez mimiky, bez pohybu úst; lze ji jen natočit/naklonit v rovině obrazu), trup kabátu, nadloktí, předloktí, palčák (rukavice-palčák, bez prstů), stehno, lýtko, bota, čepice, šála. Pohledy: šikmo zepředu a šikmo zezadu (zrcadlením 4 směry; čistě čelní ani boční pohled není). Postava 1,75 m = 130 jednotek; nadloktí 24 j., předloktí 21 j., stehno 32 j., lýtko 30 j., ramena ±8,7 j. od středu.
- Póza se počítá každý snímek: pánev (výška, boční posun, natočení), trup (předklon), hlava (náklon), ruce přes IK/FK (cíl zápěstí v souřadnicích postavy nebo úhly ramene a lokte), nohy kontaktně (chodidla na zemi nesmí klouzat; přenesení váhy je posun pánve nad oporami). Jedna ruka může držet kelímek s kávou. Akce se spouštějí jako klipy s délkou a událostmi (např. „sip“ v čase 1,1 s).
- Existující akce: talk (rytmický pohyb jedné ruky), drink (zvednutí kelímku obloukem, naklonění, záklon hlavy), receive, drop, lidDrop (druhou rukou otevřít víko koše, vhodit, zavřít), look. Klidová póza: dech, drobné přenášení váhy, mírné kývání hlavy.
- Sociální situace v simulaci: dva přátelé se potkají a pozdraví (natočí se k sobě, chvíli mluví), jdou spolu na kávu (fronta, objednávka, stoleček pro dva – stojí naproti sobě asi 0,8–1,2 m), povídají si a pijí (střídají se v mluvení), počkají na sebe, vyhodí kelímky a odejdou; dvojice chodí vedle sebe. Ve frontě stojí cizí lidé za sebou (0,65 m). Simulace je deterministická (pevný krok 1/60 s, seed), export 30 fps, 5–30 postav, počítá se na CPU.
- Omezení: žádná mimika ani pohyb úst; žádné nové 3D; nové obrázky dílů jsou možné jen omezeně (můžeš doporučit pár dalších variant, např. palčák s ukazováčkem/otevřenou dlaní, hlavu se zavřenýma očima pro smích, ale řešení musí fungovat i bez nich).

CO MÁ ZADÁNÍ OBSAHOVAT
A) Katalog chování (pro každé: účel, kdy se použije, délka a její rozptyl, pravděpodobnost/frekvence, popis pohybu po fázích v řeči kloubů – cíl zápěstí vůči rameni/trupu v jednotkách postavy nebo úhly ramene a lokte, náklon a natočení hlavy ve stupních, posun pánve, křivky/easing, anticipace a doznění, s čím se nesmí kombinovat):
   1. Rozhovor – mluvčí: beat gesta podle rytmu řeči, deiktická (ukázat na stánek/strom), ikonická jednoduchá (velikost, „tamhle“), otevřené dlaně, pokrčení ramen, gesta s kelímkem v ruce (menší, nevylít), konec promluvy (stažení rukou – signál předání slova).
   2. Rozhovor – posluchač: kývání (frekvence, amplituda, kdy), drobné náklony hlavy, backchannel pohyby, pohled střídavě na mluvčího a jinam, přešlápnutí, ruce v klidu / v kapsách / na kelímku.
   3. Střídání v řeči: délky promluv (rozložení), pauzy mezi mluvčími (typicky krátké), překryvy, kdo začne; jak to koordinovat mezi dvěma až čtyřmi postavami deterministicky; jak vypadá „smích“ obou (trup, ramena, hlava bez mimiky).
   4. Pozdrav a loučení: zamávání z dálky (kdy, vzdálenost), podání ruky v palčácích, objetí známých (zjednodušeně pro 2D – je to vůbec vhodné?), kývnutí cizímu; loučení a odchod (pootočení, krok vzad, poslední mávnutí).
   5. Chlad a zimní drobnosti: tření dlaní, dýchání do dlaní, přešlapování, ruce v kapsách, upravení šály/čepice, schoulení ramen; kdy a jak často, aby to nepůsobilo opakovaně.
   6. Fronta a čekání: drobné nudné pohyby, kontrola telefonu/peněženky (pokud jde bez nových dílů, jinak doporuč), natahování se, kdo je na řadě, poděkování u pultu (kývnutí).
   7. Pití během rozhovoru: kdy se napít vzhledem k řeči (ne uprostřed vlastní věty), držení kelímku oběma rukama pro zahřátí.
B) Prostorové uspořádání: F-formace pro 2–4 osoby (vzdálenosti, úhly natočení těla vzhledem k obrazu a vzhledem k sobě), jak natočit 3/4 pohledy k sobě, kdy se přeskupit, když někdo přijde/odejde; vztah k dosavadním kolizním poloměrům 0,23 m a osobnímu prostoru 0,35–0,5 m.
C) Řízení a vrstvení: stavový automat konverzace (role mluvčí/posluchač, přechody, časovače), vrstvy animace (nohy/opora – trup – ruce – hlava), co se smí míchat (např. gesto + přenesení váhy), jak přecházet mezi akcemi bez skoků (blend časy, zachování kontaktů a drženého kelímku), priority (pití > gesto), jak vyhnout se opakování (variace parametrů ze seedu, „cool-down“ jednotlivých gest), synchronizace dvou postav (pozdrav, smích, podání ruky).
D) Parametry: tabulka (hodnota, jednotka, rozsah, zdroj/odůvodnění) – délky, četnosti, amplitudy, rychlosti; uveď, co je převzato ze studií a co je návrh pro animaci.
E) Akceptační kritéria a testy, které lze automaticky ověřit v simulaci: např. podíl času, kdy v rozhovoru mluví právě jeden; rozložení pauz; žádné stejné gesto dvakrát za sebou u jedné postavy do X s; chodidla neklouzají během gest; kelímek se při gestu nenakloní víc než Y°; úhlová rychlost kloubů pod limitem; pozdrav vždy synchronizovaný (oba se otočí do Z s); determinismus.
F) Doporučení nových malovaných dílů (pokud výrazně pomohou) s prioritou a co dělat do jejich dodání; priority implementace a rizika (např. „uncanny“ přehánění gest u postav bez mimiky).

FORMA VÝSTUPU
- Jeden dokument v Markdownu (česky), název „Zadani_socialni_interakce_2D_Claude.md“, kapitoly A–F, tabulky parametrů, pseudokód stavových automatů, seznam zdrojů. Piš tak, aby šel přímo implementovat; kde si nejsi jistý, uveď rozsah a doporučenou výchozí hodnotu.
```
