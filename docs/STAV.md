# Stav verze 0.1 – hotové funkce, omezení, ověření

## Hotové funkce

| Oblast | Stav |
|---|---|
| Projekt | nový / otevřít / uložit / uložit jako; složka `.zscena`, verze formátu, migrace, validace, atomický zápis + záloha `.bak`, srozumitelné chyby (poškozený JSON, novější verze, chybějící/neplatný asset, cesta mimo projekt) |
| Assety | import PNG/JPEG/WebP a hudby (kopie do projektu), vestavěná testová knihovna, pozadí, náhledy, přetažení na plátno |
| Editace | výběr, přesun, rovnoměrné měřítko (úchyt i číslo), kotva, vrstvy pozadí/prostor/popředí, ruční úprava pořadí, zrcadlení, duplikace, smazání, zamknutí, skrytí, zpět/vpřed (200 kroků), zoom/posun jen v editoru |
| Hloubka | automatické řazení podle bodu kontaktu se zemí, lineární měřítko postav podle Y (omezené na rozsah) |
| Trasy | body, spojení, jednosměrná/obousměrná (šipky), úzké průchody s rezervací, zastávky (čekání od–do, pohled směr/objekt, spuštění činnosti, vážené pokračování), zablokování spojení přes překážky + upozornění |
| Oblasti | ruční překážky, plochy se sněhem, kolizní stopy objektů |
| Zóny činností | celkový prostor, přiřazení objektů do rolí, pracovní a vstupní body, přístup z tras, rezervace, požadovaný povrch, parametry; značky jen v editoru |
| Postavy | procedurální testovací postava (provizorní) se 3 základními směry + zrcadlení/náhrady, chůze s rozeznatelnými nohama a pažemi, synchronizace kroků s posunem, plynulé zrychlení/brzdění, otáčení s omezenou rychlostí, přechod chůze/klid, individuální tempo |
| Animace | manifest postavy (směry, klipy, délka, opakování, události, úchopové body, podporované činnosti), explicitní náhrady chybějících směrů/klipů s upozorněním |
| Káva | výběr stánku → fronta/obsluha → objednávka → převzetí kelímku (událost `take`) → výběr místa (stoleček 2 místa / výhled na strom) → pití s doušky (událost `sip`) → koš (událost `release`, pád do koše); ošetření nedostupnosti, plných míst, limitu fronty, odebrání objektu, přerušení |
| Dění | automatické opakování s intervaly, plánované události v čase s pravidlem čekat s limitem / přeskočit / nahlásit konflikt |
| Simulace | pevný krok 1/60 s, seed, serializovatelný stav (checkpointy), pauza, restart, rychlosti 0,25–8×, skok na čas (vpřed dopočet, vzad restart + dopočet), diagnostika a záznam událostí |
| Export | MP4 H.264 yuv420p (BT.709), 1920×1080 a 3840×2160 @ 30 fps, délka ruční / podle hudby, bez zvuku / s hudbou (opakovat / ticho / zkrátit se zeslabením), průběh, ETA, zrušení, části s checkpointy + navázání, zahození zastaralých checkpointů, kontrola cesty a místa na disku, chyby enkodéru, diagnostický PNG režim |
| Demo | `demo/Vanocni-namesti.zscena`: pozadí, stánek, stoleček (2 místa), strom (2 výhledy), koš, 2 lampy, 2 závěje v popředí, 11 bodů a 15 spojení (1 jednosměrné, 1 úzké), překážka, plocha sněhu, 3 postavy, zóna kávy, plánovaná událost v 0:20 |

| Generátor postav | skládání z malovaných dílů na 2D kostře, 1 šablona dospělého, 2 bundy, 3 pokrývky hlavy, 2 šály, společné kalhoty/boty/rukavice, 7 palet (přebarvení přes masky), jednotlivec i skupina, zámky, uložení vzhledu, náhled klidu/chůze a pohledů, diagnostika kostry; díly zatím DOČASNÉ (viz POSTAVY.md) |

## Známá omezení

* Testováno pouze na **Linuxu** (kontejner bez GPU, Xvfb). Na Windows ani macOS aplikace spuštěna
  ani zabalena nebyla; instalátory `dist:win`/`dist:mac` je nutné sestavit a vyzkoušet na těchto systémech.
* Vykreslování přes Canvas 2D; export čte snímky přes `getImageData` a IPC. Ve 4K bez GPU ~4–5 snímků/s
  (12 s videa ≈ 75 s); hodina 4K videa by v tomto prostředí trvala odhadem 6–8 hodin. Na stroji s GPU
  bude rychlejší, ale netestováno.
* Postavy: procedurální testovací + skládané z malovaných dílů (backend `skeleton`). Díly jsou zatím
  DOČASNÉ – dodaný výtvarný prototyp dílů do projektu nedorazil. Backend `frames` (snímkové animace)
  je jen připravený v datovém formátu. Chybí čelní a zadní pohled (explicitní náhrada šikmým pohledem).
* Jediná implementovaná činnost je káva. Prodavač ve stánku není postava – kelímek se „objeví“ na pultu.
* Žádné vyhýbání se postav mezi sebou mimo rezervace (úzké průchody, obslužná místa); v otevřeném prostoru
  se postavy mohou krátce překrýt (zmírněno bočním odsazením při chůzi).
* Pozadí je plochý obrázek – překážky, sníh a zakrývání se nastavují ručně (objekty v popředí).
* Náhled nepřehrává hudbu (hudba se uplatní jen v exportu).
* Posun v čase vzad = restart a dopočítání (u velmi dlouhých časů může trvat řádově sekundy).
* Editace polygonů: jen přesun vrcholů a celého tvaru (vrcholy nelze přidávat do hotového polygonu).
* Výchozí dialogy pro otevření/uložení jsou nativní; v automatických testech nebyly klikány (projekt se
  otevíral přes `ZIMNI_SCENA_OPEN` a výstupní cesta se nastavila přímo).
* Licence: `ffmpeg-static` přibaluje FFmpeg pod GPL (libx264) – před distribucí posoudit.

## Výsledky ověření (prostředí: Linux x64, 4 jádra, 15 GB RAM, bez GPU, Node 22, Electron 45.2.3)

### Automatické testy – `npm test` (Vitest): 26 testů, všechny prošly

* **Determinismus:** stejný hash stavu ve 90 s při náhledu 0,5×/1×/2×/4×/8× s nepravidelnými snímky;
  stejný seed ⇒ stejný průběh, jiný seed ⇒ jiný.
* **Checkpoint:** obnova serializovaného stavu v 47,3 s a pokračování do 120 s = shodný hash s během bez přerušení.
* **Kelímek:** každý kelímek prošel `pult → ruka → pád → koš`; v ruce vždy právě u držitele; za 400 s
  vydáno ≥ 3, vyhozeno ≥ 2, ≥ 4 doušky.
* **Rezervace:** po 300 s žádná rezervace bez aktivní činnosti, fronta skutečně nastala; úzký průchod
  nikdy nepoužívaly 2 postavy současně.
* **Odebrání stolku/stromu/koše za běhu:** činnost přerušena, rezervace uvolněny, kelímek viditelně odložen na zem s hlášením.
* **Nedosažitelný stánek:** hlášeno, nic se nevydá; **spojení přes překážku** zablokováno a hlášeno; **jednosměrné** spojení respektováno.
* **Plánované události:** čekání s limitem → konflikt po limitu, přeskočení, nahlášení konfliktu; demo událost spuštěna ve 20 s.
* **Chybějící klipy a směry:** upozornění + virtuální klip, scénář kávy přesto doběhne.
* **Ukládání:** uložení a otevření bez ztráty údajů (kanonický JSON shodný); přenos složky jinam
  (původní smazána) ⇒ assety nalezeny, simulace shodná; import kopíruje soubor; neplatné soubory odmítnuty.
* **Export (1080p):** 180 snímků, 6,00 s, h264/yuv420p/30 fps; přerušení po 2 částech a navázání ⇒
  **dekódované snímky shodné** (framemd5) s nepřerušeným exportem a shodný koncový stav simulace;
  změna projektu ⇒ zastaralé části zahozeny; hudba 2,5 s: ticho do 6 s, opakování do 6 s, délka podle hudby = 75 snímků;
  neplatná cesta / přípona ⇒ srozumitelná chyba; selhání enkodéru ⇒ srozumitelná chyba.
* **Značky v exportu:** editorové plátno obsahuje purpurové značky (pozitivní kontrola), exportovaný snímek 0 takových pixelů.

### Test skutečné aplikace – `npm run test:e2e` (Electron + Playwright pod Xvfb): 21 kontrol, všechny prošly

Výběr kliknutím, přesun tažením, zpět/vpřed, měřítko z panelu, Ctrl+D, zamčený objekt nelze smazat,
skrytí, Delete, kreslení trasy, uložení + znovuotevření (shodný dokument), pauza, **náhled 8× = restart
+ dopočítání (shodný hash)**, restart, **4K export z GUI** (3840×2160, 30/1, 90 snímků, 3,000 s,
yuv420p, 0 pixelů značek), paměť, **zrušení exportu z GUI a navázání od části 3** (240 snímků, 8,000 s).

### Skutečný 4K export

* Z aplikace: 12 s = 360 snímků 3840×2160 za 76 s (≈ 4,7 snímků/s), ffprobe: h264, yuv420p, 30/1,
  360 snímků, 12,000 s. Paměť všech procesů Electronu během exportu 0,77–1,05 GB bez růstu,
  hlavní proces max. 297 MB. Ukázkový snímek: `docs/img/export-4k-snimek.png`.

### Delší zpracování (paměť)

* CLI export 5 min 1080p (9000 snímků, 5 částí): 127 s, výstup 300,000 s / 9000 snímků / 41 MB,
  RSS procesu stabilně 270–330 MB (max. 378 MB) po celou dobu – bez růstu.
* Simulace 1 hodiny dema (bez vykreslení): 0,35 s výpočtu, 61 vydaných kelímků, 60 v koši (1 právě
  v rukou), žádné varování, nejdelší nečinnost postavy 31 s (pití), stav simulace 19 kB.

### Zabalení

* `electron-builder --linux dir`: aplikace se spustí, najde **přibalený** FFmpeg (s libx264) i bez
  systémového FFmpeg v PATH, vestavěná knihovna (8 assetů) a demo jsou v `resources/`.

### Neověřeno

* Běh a zabalení na **Windows a macOS**.
* Chování s hardwarovou akcelerací GPU (prostředí ji nemá).
* Skutečné zaplnění disku během exportu (ověřena jen předběžná kontrola místa a převod chybové hlášky FFmpeg).
* Export celé hodiny ve 4K (ověřeno 12 s 4K z GUI a 5 min 1080p; rychlost a paměť jsou konstantní na snímek).
* Ruční uživatelské testování ergonomie rozhraní.


## Ověření generátoru postav

* `tests/characters.test.ts` (10 testů): konzistence knihovny; stejný seed ⇒ stejný jednotlivec i
  skupina; 2000 vzorků bez nekompatibilní kombinace a s pravidly barev; skupina 12 bez opakování,
  při nedostatku kombinací hlášené duplicity; zámky při přegenerování (60 pokusů); uložení →
  otevření beze změny a rozšíření knihovny nezmění uložené postavy (shodná sestava dílů i simulace);
  mezery v kloubech (4 postavy × 4 směry × 8 póz, > 10 000 bodů podél kostí kryto); kadence úměrná
  rychlosti a stojná noha bez klouzání (< 0,6 jednotky); nesynchronní klid; diagnostika kostry není
  v exportovaném MP4 (s pozitivní kontrolou) a postavy v exportu jsou.
* `tests/e2e/characters.e2e.cjs` (Electron): uložení skupiny do projektu, změna čepice, zámek bundy
  při přegenerování v GUI, beze změny po znovuotevření, determinismus simulace.
* Čitelnost na náměstí: `docs/img/postavy-na-namesti-1080p.png` a `docs/img/postavy-na-namesti-4k-vyrez.png`
  (skutečná velikost ve výstupu) – posouzeno vizuálně.
* Neověřeno: dodaná grafika dílů (nedorazila); čelní a zadní pohled (bez podkladů).
