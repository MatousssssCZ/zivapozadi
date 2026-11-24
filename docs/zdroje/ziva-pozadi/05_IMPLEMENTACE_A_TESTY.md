# Implementační postup a akceptace

## 1. Etapy

Všechny etapy patří do rozsahu. Pořadí zohledňuje závislosti, nikoliv doporučení skončit po první etapě.

| Etapa | Výsledek | Konkrétní integrační místa |
|---|---|---|
| 0 | Ověření rozdílu proti referenčnímu commitu, baseline | package.json, tests/*, docs/STAV.md |
| 1 | Typovaný model rekvizit, dvě ruce, session, atomické rezervace, save/restore | sim/types.ts, sim/context.ts, sim/reservations.ts, sim/simulation.ts, model/types.ts, model/defaults.ts, model/validate.ts |
| 2 | Zlepšení nákupu, prodavač, rozhovor, zimní mikroakce | activities/shop.ts, coffee.ts, registry.ts, anim/animator.ts, skeleton.ts, render/characterPose.ts, sceneRenderer.ts |
| 3 | Prohlížení, rodič s dítětem, čekání, fotografie a malé události | nové runnery v activities, adaptace VisitState, registry, manifesty a knihovny dílů |
| 4 | Koulovačka a sněhulák včetně runtime kolizí a checkpointů | nové snowballFight/snowman runnery, nový runtime world, nav/navGraph.ts, sim/crowd.ts, scene/camera.ts |
| 5 | Pes, sáňky a odklízení | zvířecí entita/render, historie dráhy, snowPatches, pracovní rig a povrchy |
| 6 | Počasí, pára, dveře, okna, dekorace, odlesky | společné worldEffects, sceneRenderer.ts, model/types.ts, editor masek/kotev |
| 7 | Integrovaná demo scéna, kvalita, diagnostika, testy a export | renderer/panels/RightPanel.tsx, LeftPanel.tsx, BottomPanel.tsx, store.ts, ops.ts, overlay.ts, simController.ts, exportRunner.ts, core/export/* |

Nové názvy souborů jsou doporučené, existující cesty mají prefix src/core/ pokud není uvedeno renderer. Nezvětšovat monolit simulation.ts o všechny podrobnosti: nové řízení session, prostředí a rekvizit rozdělit do modulů, orchestrace zůstává v Simulation.

## 2. Editor

Zóna aktivity: druh, zapnuto, kapacita, intenzita/interval, role účastníků, přiřazené objekty, pracovní body a případná dráha. Nabízet české srozumitelné názvy. Zobrazit konkrétní příčinu, proč se činnost nemůže spustit: chybí sníh, chybí dva účastníci, není dosažitelný bod, chybí dětská postava apod.

Značky, rezervované oblasti, dráhy hodu a pracovní body jen v editor overlay. U prostředí možnost umístit zdroj páry, světelnou masku a pivot dekorace. Ruční editace přes store.edit, aby fungovalo undo/redo. Změna projektu přestaví simulaci dle stávajícího mechanismu; výsledky simulace samy nevytvářejí stovky kroků historie.

Vývojářské spuštění situace musí použít stejné start preconditions a stejnou transakci jako automatický plánovač. Volba seedu a zrychlený náhled usnadní reprodukci; neobcházet fyziku pro hezký screenshot.

## 3. Nové testy chování

| ID | Scénář | Očekávaný výsledek |
|---|---|---|
| T01 | Každá nová session, stejný seed a různé rychlosti náhledu | Shodný stav ve stejném kroku; render nemění RNG ani stav |
| T02 | Serialize/restore v gather, před transferem, v letu koule, v polovině stavby a po dokončení | Kontinuální a obnovený běh dají stejný hash i následující události |
| T03 | Dva souběžné pokusy rezervovat stejné účastníky/místa | Vyhraje právě jeden, neúspěšný nezanechá žádnou rezervaci |
| T04 | Abort z každé fáze, opakovaný abort, odebrání objektu/postavy | Žádné osiřelé session/rezervace; rekvizity ve vysvětlitelném stavu |
| T05 | Předání zboží, dvě ruce, zrcadlené pohledy | Jeden vlastník, transfer jen jednou, předmět drží správná ruka |
| T06 | Obsazené ruce + rozhovor/telefon/pití | Neplatná kombinace se nespustí, žádné ztracené předměty |
| T07 | Fronta s obsazeným pultem a střídáním shop/coffee | FIFO, žádné předbíhání; nový service cíl dosažitelný; fronta se posouvá cestou |
| T08 | Partner nedorazí a následovník ztratí vedoucího | Timeout a bezpečný odchod, žádné věčné čekání |
| T09 | Koulovačka: cizí osoba v koridoru, překážka, abort za letu | Nový hod zablokován, již letící koule doletí/dopadne, pool se uvolní |
| T10 | Koulovačka bez sněhu nebo vhodného rigu | Start zamítnut s konkrétním důvodem, žádný virtuálně dokončený hod |
| T11 | Sněhulák: stavba, odchod, nový pokus, restore | Stage postupuje logicky; objekt a kolize zůstávají; duplicitní stavba zamítnuta |
| T12 | Rozestavěný sněhulák po abortu | Žádné viditelné zmizení; zóna zůstane obsazená nebo navazuje stejná stavba |
| T13 | Růst koule při stání a pohybu | Roste jen po vhodné uražené dráze, poloměr má limit |
| T14 | Uklizená plocha a další průchod | Změna vizuálního podkladu, dotazu na sníh, zaboření a nových stop |
| T15 | Vítr se mění a přehrávání je obnoveno | Žádné skoky polohy vloček; pára, kouř a dekorace sdílejí směr |
| T16 | Kelímek se pohne po vypuštění páry | Starší pára nezůstane přilepená k ruce |
| T17 | Dveře s průchodem dvou lidí | Nezavřou se skrz druhou postavu, světlo sleduje otevření |
| T18 | Pes a sáňky v zatáčce/úzkém průchodu | Vodítko/provázek nepřekračuje limit; přívěs neřeže překážku |
| T19 | Odchod nákupu portálem | Vlastník a rekvizita opustí obraz spolu; žádná taška zůstávající ve vzduchu |
| T20 | Nové nastavení uložit/načíst; stará scéna | Nové hodnoty zachovány, stará scéna otevřitelná a rozšíření vypnuto |
| T21 | Export přes hranici chunku během předání/letu/stavby | Shodné výsledky s nepřerušeným exportem v témže backendu |
| T22 | Dlouhý běh a plné zóny | Žádné deadlocky, nepřekročené limity a omezené logování |

Testy nemají ověřovat jen opsané konstanty; musí vyvolat skutečné kolize zájmů, obnovu a chyby. Zachovat stávající gait/crowd testy. Při odchylce uvést konkrétní scénář a seed.

## 4. Měřitelná akceptace animací

Navržené cíle pro nové akce, které se doladí po první vizuální kontrole:

- Přenos předmětu přesně jednou, vzdálenost předmět–úchop během držení ≤ 1 lokální jednotka; záměrný posun při přehmatu musí mít dvě kontaktní fáze.
- Na stabilním klidu během nových gest drift opřené paty ≤ 0,5 logického pixelu za celou akci; u změny opory testovat pouze interval bez kroku. Nezaměňovat to za tvrzení, že dosavadní chůze je bez jakéhokoliv driftu.
- Gesta s otevřeným nápojem: náklon do 10° mimo vlastní pití, žádný máchající kelímek.
- Vyhrazený mluvčí nejvýše jeden; nekonečná smyčka talk nesmí běžet celou společenskou session. Z dlouhého záznamu reportovat podíl klidu a četnosti gest, nikoliv vynucovat každé osobě stejné procento.
- Žádný actor patří do dvou aktivních session zároveň.
- Každá session se dokončí nebo po dokumentovaném timeoutu ukončí. Dlouhodobě nevyužitelná zóna je diagnostika, ne opakující se log každý frame.
- Žádný nový efekt se neobjeví bez deklarovaného zdroje/assetu nebo vhodné procedurální varianty.

## 5. Výkon a dlouhý běh

Referenční scénáře: 5, 24 a 30 viditelných lidí, jednotlivě i se všemi efekty. Zaznamenat CPU čas simulace, renderu a celkový čas, p50/p95, rozlišení, hardware a počet efektů. Cíl náhledu 1080p 30 fps je návrh, ne zde doložený benchmark. 4K export nemusí běžet v reálném čase.

Porovnat 10 minut simulace na stejném hardwaru před a po rozšíření. Profilovat nejdražší části; nevytvářet zbytečně objekty v render loop. Seedovaná rozhodnutí 0,5 Hz, simulace 60 Hz. LOD může zjednodušit vizuál vzdálených osob, ale nesmí měnit jejich rozhodování ani výsledek exportu.

Navržené výchozí limity: 1 výrazná aktivita, 3 společenské session, 2 sněhuláci, 128 runtime props, 256 krátkodobých částic páry/kouře/dopadů; stávající vločky a footprint pool mají vlastní limity. Aktivně držené předměty se při naplnění poolu nesmějí vymazat; zamítnout nový spawn nebo snížit kosmetickou emisi. Historii letů, sessions a rekvizit po ukončení kompaktovat, neuchovávat nekonečné seznamy event IDs.

Pro dlouhý běh použít 60 minut simulace bez renderu + 10 minut náhledu/exportního renderu podle dostupnosti. Po zahřátí cache se nesmí počet živých objektů neomezeně zvyšovat. Stav po JSON roundtripu nesmí obsahovat NaN, Infinity ani undefined potřebné pro obnovu.

## 6. Ruční kontrola a předání

V každé situaci zkontrolovat 3–5 klíčových snímků: před akcí, kontakt, hlavní pohyb, ukončení. Navíc přehrát celé sekvence v reálném tempu. Nehodnotit přirozenost pouze z jednotkových testů. Zkontrolovat skutečnou velikost ve scéně, 1080p a 4K výřez. V exportu nesmějí být editorové značky.

Samostatná demo scéna má ukázat všechny dostupné aktivity postupně; nesnažit se je všechny nacpat do stejné minuty. Pro běžný klidný režim nechat vzácné děje skutečně vzácné. Dlouhý export není automaticky bezešvá smyčka: konec se sněhulákem se neshoduje se začátkem bez něj. Nepřidávat skryté resetování sněhuláka kvůli smyčce; bezešvý loop by byl samostatný požadavek.

Předat: souhrn změn, tabulku A01–A12/B01–B05/E01–E11 se stavem, testy, dostupnou ukázku a chybějící assety s přesnou specifikací. Položka může být hotová, částečná nebo blokovaná grafikou; nikdy nezaměňovat připravený runner za hotový vizuální výsledek.

## 7. Psi a kočky – revize 2

Rozšířit etapy 1, 3 a 5 dle 07_PSI_A_KOCKY.md. Předání musí obsahovat také stavy Z01–Z10 a výsledky testů ZT01–ZT10. Výchozí limit 2 psi a 1 kočka, jejichž entity nezapočítávat do limitu rekvizit. Celkový render a crowd budget ale zvířata zahrnuje.
