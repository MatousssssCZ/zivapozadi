# Scéna „Pastelové vánoční kluziště“

Zasněžené viktoriánské náměstí za světlého dne. Kluziště je přímo v malovaném pozadí. Bruslení je hlavní činnost, na sněhu kolem probíhají vedlejší činnosti.

- **Otevření:** v aplikaci tlačítko **Demo: kluziště** (úvodní obrazovka i horní lišta).
- **Projekt:** `demo/Pastelove-kluziste.zscena`.
- **Vytvoření znovu:**
  ```bash
  python3 scripts/process-pastel-graphics.py
  ```
  ```bash
  npx tsx scripts/generate-pastel-demo.ts
  ```

## Podklady (`grafika/pastel`)

Skript `scripts/process-pastel-graphics.py` zpracuje dodané obrázky z `grafika/pastel/zdroje`:

- **Pozadí** (domy a kluziště) zvětší na 1920 × 1080 (16:9, společný souřadnicový systém).
- **Sady spritů** rozdělí podle mezer v neprůhlednosti:
  - stromy na `strom-listnaty-siroky` a `strom-listnaty-uzky`,
  - lampy, lavičku a koš na `lampa-rovna`, `lampa-oblouk`, `lavicka`, `kos`.
- **Ořez** průhledných okrajů dělá s prahem alfa 2/255. Jemné větve a průsvitné halo lamp tak zůstanou a žádné barvy se plošně neodstraňují.
- **Kotva** každého spritu je na patě (spodní řádek plné kresby):
  - u lampy s ramenem pod sloupem, ne pod lucernou,
  - u stánku pod tělem stánku, bez vývěsního štítu.
- **Obrys ledu** najde v pozadí, protože led lemuje jasně bílý sníh:
  - horní okraj svislým hledáním,
  - spodní okraj a boky paprsky ze středu,
  - vyhlazení mediánem.
- **Světýlka vánočního stromu** (jasné teplé body) zapíše pro třpyt.
- **Výstup:** `grafika/pastel/podklady.json` (obrys ledu, rozměry a kotvy spritů, světýlka).

**Převzato z projektu:**
- postavy dospělých a dětí,
- psi,
- sprity sněhuláka, koulí a páry,
- lopata, telefon a rukavice,
- brusle (kreslený nůž pod botou).

**Doplněno kódem ve stejném stylu:**
- sed a přezouvání na lavičce,
- klečení a předklon při tvoření koulí sněhuláka,
- odrazy postav v ledu,
- ledová tříšť,
- třpyt světýlek.

## Konfigurace (`scripts/generate-pastel-demo.ts`, konstanta `PASTEL`)

Vše je na jednom místě a laditelné:

- **Perspektiva:**
  - dospělý u dveří domů (y 726) má měřítko 0,51, horizont je zhruba na y 560;
  - kamera je 4,4 m vysoko a led má rozměry asi 18–40 × 24 m (malba je lichoběžník).
- **Bruslaři:**
  - počet 18;
  - podíly schopností: rekreační 60 %, začátečníci 20 % (z toho 2 děti poprvé), jistější 15 % (z toho 1 šikovné dítě), velmi dobří 5 %;
  - jeden rodič drží dítě za ruku;
  - věk je samostatná vlastnost: profil `good` mají dospělí i děti.
- **Strom:** 16 m (dvojnásobek proti první verzi), dominuje středu scény.
- **Výška objektů v metrech:** velikost se v místě paty odvodí z perspektivy, takže strom, stánek a lampy sedí k domům a lidem.
- **Rozmístění:**
  - strom v ústí ulice za zadním okrajem ledu;
  - stánek vpravo na sněhu, koš vedle něj mimo frontu;
  - lavička u vstupu na led vlevo;
  - čtyři lampy podél zadní promenády a po jedné na každé straně;
  - jeden listnatý strom na pravém okraji.
- **Bruslení:**
  - délka bruslení 420–900 s, mimo led 40–150 s;
  - na začátku je na ledě 85 % bruslařů, po bruslení jde 50 % na nápoj;
  - prvky s globální prodlevou 100–140 s;
  - váhy prvků: skok s otočkou 35, holubička 30, jízda vzad 20, jedna noha 15 (pirueta na místě vypnutá);
  - pády zhruba každých 110–210 s;
  - odrazy postav v ledu: síla 0,2, délka 0,42 výšky postavy.

Za běhu je totéž v `project.rink` (`entry`, `events`, `reflections`, `particles`). Profily bruslařů jsou v `SKATE_PROFILES` (`src/core/sim/rink.ts`).

## Zóny

1. **Led:** obrys z pozadí.
   - Bruslaři zůstávají uvnitř: nejméně 0,3 m od okraje, u okraje kloužou podél něj.
   - Pro chodce je led překážka (oblast `area_led`, o 0,5 m menší než obrys, takže sněhový lem je pěší).
2. **Pěší cesty:**
   - zadní promenáda s odbočkami ke stromu, lavičce a stánku;
   - přední pás u kamery.
   - Spolu se nespojují, takže nikdo nepřechází přes led.
3. **Nástup:** lavička se třemi místy, přístupový bod před ní a branka na okraji ledu.
   - Branka je 0,4 m před okrajem, první krok 0,35 m za ním (v metrech, ne v pixelech).
4. **Stánek:** výdej, dvě místa fronty (rezervovaná, mimo promenádu i led), pití u stromu a lamp, koš.
5. **Menší sněhové plochy** po stranách stromu: sněhulák vlevo, koulovačka vpravo, obojí střídmě. Odklízení probíhá na krátkém úseku promenády vlevo a sníh se hrne k domům.

## Bruslení (navazuje na `docs/BRUSLENI.md`)

- **Jízdní smyčky:** každý bruslař jede po vlastní zmenšenině skutečného obrysu ledu kolem mírně posunutého středu. Nejde o kruh ani o společnou dráhu.
  - Nejistí jezdí blíž okraji.
  - Zdatní jezdí v celé ploše a pomalejší předjíždějí s odstupem.
- **Cyklus bruslaře:**
  1. příchod vstupem, ze kterého vede trasa k lavičce;
  2. rezervace místa na lavičce, sednutí, nazutí bruslí (předklon, ruce u boty, jedna noha, pak druhá);
  3. chůze v bruslích k brance a první krok na led (opatrný rozjezd);
  4. bruslení;
  5. odjezd k brance a sestup z ledu;
  6. přezutí na lavičce a krok od lavičky na přístupový bod;
  7. horký nápoj (fronta, převzetí kelímku, pití, kelímek do koše), nebo odchod.

  Dvojice rodič a dítě odchází i přichází spolu.
- **Skok s otočkou:**
  - nájezd na jedné noze s pokrčeným kolenem a rukama vzadu;
  - rozmach volnou nohou dozadu a prudký švih vpřed nahoru, ruce vpřed;
  - odraz a let 0,62 s (výška 0,47 m, celé tělo i brusle nad ledem, stín zůstává na ledě), ve vzduchu nohy u sebe, ruce na hrudi a jedna celá otočka;
  - dopad na jednu nohu s pokrčením, volná noha dozadu, ruce do stran, výjezd.
- **Holubička:** opěrná noha propnutá, volná noha natažená dozadu do výšky pánve, trup v předklonu, ruce rozpažené, hlava zvednutá; 3–4,5 s.
- **Pirueta na místě** zůstává v kódu (váha 0).
- **Jízda vzad:** začíná plynulou půlotočkou a končí návratem, sprite se nikdy neotočí naráz.
- **Pád:** zaváhání a pokus o vyrovnání, nízký pád, krátké sklouznutí, pak jedna ze dvou variant:
  - dozadu do sedu, vstává s oporou rukou;
  - bokem, vstává přes klek.

  Následuje obnovení rovnováhy a 5–12 s opatrné jízdy. Ostatní padajícího objíždějí.
- **Nástup a výstup** jsou ve stavech `EXIT` a `OUT` (`rink.ts`) a ve fázích `life` (`simulation.ts`, `stepSkaterLife`).

## Efekty

- **Odrazy bruslařů v ledu:** převrácené, zkrácené a slabé. Kreslí se v 1/3 rozlišení a zvětšené zpět dávají rozostření. Ořezává je obrys ledu a odrazy domů z malby se nezdvojují.
- **Ledová tříšť:** jen při prudším brzdění a na začátku pádu, nejvýš 60 částic.
- **Třpyt světýlek stromu:** pomalé nepravidelné záblesky, průhlednost stromu se nemění.
- **Sněžení:** lehké, vločky mají různou hloubku (velikost a rychlost).
- **Kontaktní stíny:** stávající.
- **Omezený pohyb (`prefers-reduced-motion`):** bez třpytu a tříště, sněžení na 40 %.
- **Skryté okno:** smyčka stojí a po návratu nic nedohání (krok nejvýš 0,25 s).
- **Změna velikosti okna:** celá scéna se škáluje společně (pozadí, kolize, body interakcí).

## Sněhulák (změna pro všechny scény)

Koule se už neválí, a to při stavbě rodiče s dítětem i dvou dospělých. Přijdou na místo a tvoří koule u země zády ke kameře:

- spodní kouli vkleče,
- prostřední v mírném předklonu,
- hlavu (dítě) v předklonu.

Koule roste podle sněhu skutečně nabraného z okolí. Bilance hmoty platí dál (chyba < 1·10⁻¹⁴ kg). Rozměry jsou 50,2 / 36,3 / 25,1 cm. Zvedání, předání hlavy a zdobení zůstávají beze změny.

## Ověřeno

**`tests/pastel.test.ts` (5 min běhu):**
- bruslaři jsou vždy v obrysu ledu (nejméně 0,15 m od okraje), bez NaN a bez prolnutí těl (> 0,4 m);
- chodci ani psi nevstoupí na led;
- na led se jde jen přes přezutí a branku;
- prvky mají odstup ≥ 95 s a nikdy neprobíhají dva zároveň;
- kelímky končí v koši.

**Dále:**
- **Ruční běh 15 min:** 15 úplných cyklů bruslaře (lavička → led → lavička → nápoj nebo odchod → návrat). Na ledě je ustáleně kolem 14 lidí.
- **Výkon:** simulace stojí asi 75 ms na sekundu scény. Plánovač chodců teď rychle odmítá hrany překážek mimo obálku, výsledky jsou bitově shodné. Dřív to bylo 250 ms.
- **Ostatní scény:** testy, kontrola sněhuláka (`scripts/coop-snowman-check.ts`) a `perf-check` (snímky a otisk stavu Liberce a Radnice) jsou beze změny. Výjimkou je změna sněhuláka.

## Omezení

- **Pohledy:** postavy mají jen 3/4 pohledy, takže předklon u lavičky a při tvoření koulí se ve 3/4 pohledu kreslí jako náklon do strany. Pirueta prochází dostupnými pohledy, plynulejší otáčení by chtělo víc pohledů.
- **Brusle při chůzi po sněhu** jsou zabořené (nůž sahá pod úroveň boty).
- **Prodavačka** je ořezaná oknem stánku podle odhadnutého obdélníku otvoru, ne podle přesné masky.
- **Přední pás u kamery** má velké postavy, proto jsou na něm jen dva chodci.
