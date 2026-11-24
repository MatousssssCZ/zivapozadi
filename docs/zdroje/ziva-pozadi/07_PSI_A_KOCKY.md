# Psi a kočky – rozšíření zadání

Revize 2, 24. 11. 2026. Zvířata jsou plnohodnotnou součástí požadovaného rozsahu. Tento dokument rozšiřuje A07 (venčení psa); nevytvářet druhý konkurenční systém venčení. Ostatní části balíčku zůstávají platné.

Jde o autorský návrh klidných animačních situací, nikoliv odborné doporučení péče o zvířata. Časy, rozestupy a četnosti jsou návrhové parametry k vizuálnímu doladění. V této revizi nebyl znovu auditován aktuální GitHub ani implementována nová funkce.

## 1. Výtvarný a režijní záměr

Psi přicházejí převážně s lidmi, kočky se mohou samostatně pohybovat při okrajích scény, kolem průchodů a předem označených míst. Obě zvířata mají vlastní cíle, pauzy a kontakt se zemí. Nejsou dekorace pohybující se neustále stejným směrem.

Výchozí limit pro radniční scénu: nejvýše 2 psi a 1 kočka současně. Není nutné, aby byli všichni stále přítomní. Počet lidí kvůli tomu automaticky nezvyšovat. Bez oblečků a vánočních čepiček; vánoční atmosféru vytváří okolí. Štěkání a mňoukání nejsou součástí této změny, export hudby zůstává beze změn.

## 2. Katalog situací

| ID | Situace | Průběh a návrhové časování | Podmínky a ukončení |
|---|---|---|---|
| Z01 | Pes s majitelem | Existující návrh A07: společná chůze, zastavení na očichání 3–8 s, potom pokračování | Vodítko, společný portál, majitel přizpůsobuje tempo psovi |
| Z02 | Pes čeká u stánku | Majitel nakupuje, pes zůstane vedle něj: stojí nebo si sedne, občas změní směr hlavy; 8–25 s podle nákupu | Psí místo mimo frontu a průchod, majitel drží vodítko; bez bezpečného místa se nákup nespustí |
| Z03 | Pohlazení psa | Známý člověk přistoupí, pes se natočí, člověk se mírně skloní, 1–2 tahy ruky, návrat do klidu; 4–8 s | Volná ruka, připravená póza psa, kontakt ruky se srstí; cooldown dvojice 120–240 s |
| Z04 | Dva psi se krátce očichají | Oba majitelé zpomalí, psi se přiblíží do volných bodů, krátké očichání 2–5 s a odchod | Jen pokud obě vodítka a prostor dovolují; bez rvačky, skákání a automatického křížení vodítek; cooldown scény 180–360 s |
| Z05 | Pes setřese sníh | Zastaví, krátká posloupnost pohybu hlavy, trupu a ocasu; 0,8–1,4 s | Jen po pobytu ve sněžení, mimo držící ruku člověka; pár jemných částic; cooldown psa 120–240 s |
| Z06 | Kočka přejde náměstí | Vyjde z průchodu, jde podél fasády nebo stánků, jednou se zastaví na 2–5 s a odejde jiným portálem; průchod 15–40 s | Dosažitelná trasa, žádné procházení kolizemi stánku; návrat nejdříve za 180–420 s |
| Z07 | Kočka pozoruje dění | Přijde na vyznačené místo, sedne si, klidně sleduje několik bodů; 20–60 s | Stranou davu, občas pohyb uší či špičky ocasu, nikoliv neustálé vrtění; pak vstane a odejde |
| Z08 | Kočka se očistí a protáhne | Ze sedu zvedne přední tlapku, několik malých pohybů hlavy 3–6 s; případně samostatné protažení 2–3 s | Ne obě akce automaticky při každém zastavení; cooldown kočky 60–150 s; bez vhodné pózy nehrát náhradní chůzi |
| Z09 | Kočka vyskočí na nízký sokl | Zastavení → krátká příprava → odraz → let → dopad → klid 10–30 s → seskok | Jen explicitně označený sokl 0,25–0,55 m, volná plocha a odpovídající assety; cooldown místa 180–360 s |
| Z10 | Krátké setkání psa s kočkou | Zaregistrují se, na 1–3 s se zastaví/natočí; majitel se psem pokračuje, kočka počká nebo zvolí jinou cestu | Bez honičky a agresivní reakce; cooldown scény 240–480 s; není povinné při každém přiblížení |

Z02 má vyšší prioritu než náhodné očichávání: pes neodtahuje právě obsluhovaného majitele. Z03 může být návaznost setkání známých; nepřidávat spontánní hlazení každým kolemjdoucím. Z07 je vhodná hlavní kočičí situace, Z09 vzácný detail.

Kočka na parapetu za sklem by vyžadovala samostatné vrstvy interiéru a skla. Do této verze není nutná; nepokoušet se ji nasadit před obyčejnou namalovanou výlohu.

## 3. Model a integrace

Přidat AnimalInstance do uloženého projektu a AnimalState do SimState. Nezneužívat lidské AgentState s lidskou kostrou ani neukládat zvíře jako PropKind. Sdílet navigaci, kameru, RNG a rezervace přes společné rozhraní pohybující se entity.

Návrh minimálního uloženého nastavení: id, species dog/cat, assetId, sizeVariant, startNodeId, ownerId pro psa, enabled a behaviorProfile. Runtime: pos/worldPos, facing, speed, route, hidden, rng, mode, phaseStartStep, nextDecisionStep, pose, footContacts, sessionId, attachment/surfaceId a leashState. Funkce a image objekty nejsou součástí snapshotu.

Základní stavy psa: followOwner → approachSniff → sniff → rejoin; nebo waitOwner → sit/stand → followOwner. Sociální setkání/hlazení probíhá přes ActivitySession. Kočka: offstage → enter → walk → observe/sit/groom → stand → walk → exit. Skok pouze přes explicitní jump link mezi zemí a povrchem; nejde o běžnou trasu po zemi.

Zánik majitele při editaci: ukončit navázané session, uvolnit rezervace, zvíře při přestavbě simulace validovat jako neaktivní s vysvětlením. Běžný odchod majitele ve scéně: nejprve společně dojít k portálu a teprve tam skrýt obě entity. Pes nikdy nezmizí uprostřed náměstí kvůli jinému tempu majitele.

### Vodítko a ruce

Vodítko má kotvu v anatomicky určené ruce majitele a na obojku/postroji psa. Rezervuje ruku ve stejném systému jako kelímky, telefon a taška. Majitel s vodítkem a jedním kelímkem už nemá volnou ruku pro telefon ani druhý kelímek. Přehmat je samostatný kontaktový přechod, ne okamžité přepnutí strany.

Výchozí délka 1,2–1,8 m. Vykreslit prověšenou křivku, která se s rostoucí vzdáleností narovnává. Omezovat relativní pohyb prediktivně, nepřitahovat psa teleportem k ruce. Volit psí bod na stejné straně trasy jako ruka. Kontrolovat provázek proti footprintům; při hrozícím omotání okolo stánku zastavit a přeplánovat společný průchod. Fyzikální simulace uzlů vodítka není požadována.

### Navigace a kontakt

Kolize zvířete nemá být lidský kruh stejné velikosti: použít kratší orientovanou kapsli nebo konzervativní dvojici kruhů podle velikosti psa/kočky. Lidé berou zvířata v úvahu při vyhýbání. Širší skupina člověk–vodítko–pes potřebuje průchod pro celý útvar. Není-li místo, pes přejde do pozice za majitelem přes skutečný pohyb.

Tlapky mají vlastní kontaktní cyklus, stopy jen při došlapu na snow. Využít stávající ohraničený pool, přidat typ otisku, nikoliv lidskou botu zmenšenou na kočku. Délku kroku a fázi odvozovat ze skutečně uražené vzdálenosti. Při stání se tlapky nehýbou s pohybem hlavy nebo ocasu. Pro tento balíček nejsou předepsány biologicky naměřené fáze chůze; pohyb doladit na čtyřnohém rigu a vizuálně ověřit. Výchozí tempo chůze jako návrh: pes 0,7–1,3 m/s, kočka 0,45–0,85 m/s, s přizpůsobením velikosti a okolí.

Sokl má výšku H a landing polygon. Při pobytu na něm promítat výšku přes camera.toScreen(world,H), ale řazení hloubky a kontakt počítat z povrchu. Tlapky na soklu nesmějí generovat stopy dole na zemi. Let skoku je deterministický s událostmi takeoff a landing; odraz nesmí nastat bez volného místa dopadu. Při odebrání soklu editací simulaci přestavět, ne kreslit kočku visící ve vzduchu.

## 4. Animační podklady

Zachovat malovaný vzhled a front3q/back3q se zrcadlením. Pro každý druh vlastní kostra nebo atlas; lidský rig není vhodná náhrada. Nejprve jeden středně velký pes a jedna kočka. Dvě až tři střídmé barevné varianty stačí; odlišné velikosti mohou využít schválené proporce, nikoliv libovolné deformace.

| Podklad | Požadavek |
|---|---|
| Pes | trup, hlava s čenichem, uši, ocas, čtyři končetiny s tlapkami; kotva obojku; dva 3/4 pohledy |
| Psí pózy/klipy | walk, idle, sniff, sitDown, sitIdle, standUp, look, shake; zvedání hlavy pro pohlazení |
| Kočka | vlastní trup, hlava, uši, segmentovaný ocas a čtyři končetiny; dva 3/4 pohledy |
| Kočičí pózy/klipy | walk, idle, sitDown, sitIdle, standUp, groom, stretch; crouchJump, flight, land pro Z09 |
| Kontaktové údaje | kotvy tlapek, obojku, hlavy pro pohlazení a boků; footprint; u soklu výška a přístupový bod |
| Stopy/efekty | psí a kočičí otisky, několik drobných částic setřeseného sněhu; vše s limity a alfou |

Ocas animovat střídmě, se zpožděním za trupem. Kočičí ocas nepřebírá trvale psí vrtění. Uši mohou měnit orientaci jen pokud jsou samostatným dílem. Bez dílů pro grooming nebo skok aktivitu zablokovat s konkrétní diagnostikou; zachovat chůzi a klid. Zvířata bez grafiky pouze ve vývojářském testu, ne jako barevné obdélníky v běžném exportu.

## 5. Začlenění do etap a editoru

Etapa 1: serializace animals, vlastnictví ruky vodítkem, společné entity a rezervace. Etapa 3: společné čekání/nákup/hlazení. Etapa 5: dokončit zvířecí navigaci, rigy, všechny Z01–Z10 a integrační demo. Pořadí uvnitř etapy: pes s majitelem a kočičí průchod → čekání a sed → drobná gesta → setkání → skok. Skok nesmí blokovat dokončení ostatních situací.

Editor: sekce Zvířata, výběr druh/vzhled/velikost, majitel psa, trasy a klidová místa, přepínač vzácných interakcí. Pro kočku označit vstup/výstup a případně sokl. Vhodnost prostoru ověřit stejným způsobem jako u lidských zón. Debug nabízí spuštění konkrétního Z scénáře a zobrazení tlapek, vodítka a footprintu; tyto značky nevstupují do exportu.

## 6. Akceptační testy

- ZT01: Stejný seed, různé rychlosti náhledu a snapshot uprostřed chůze, sedání, hlazení či skoku dávají stejný následný stav.
- ZT02: Pes s majitelem projde kolem stánku a úzkým průchodem bez kolize, protaženého vodítka a teleportu. Po ustálení délka nepřekračuje nastavení o více než 0,03 m; překročení řešit pohybem, ne kosmetickým zkrácením čáry.
- ZT03: Nákup s vodítkem respektuje obsazené ruce; telefon/dva kelímky nemohou přepsat attachment vodítka.
- ZT04: Z02/Z03/Z04 nemohou současně ovládat stejnou entitu; přerušení vyčistí rezervace a obnoví následování.
- ZT05: Při odchodu oba účastníci zmizí až u portálu. Kočka naopak funguje bez majitele.
- ZT06: Tlapky v klidu nekloužou, stopy vznikají jen při kontaktu ve sněhu a nepřekročí sdílený pool. Stopy na vyvýšeném povrchu se nekreslí na zemi.
- ZT07: Kočka může skočit pouze na definovaný volný sokl a správně se zakrývá před/za ním. Chybějící klip skoku start zablokuje.
- ZT08: Setkání psa s kočkou končí v určeném čase a nerozběhne honičku ani nekonečné vzájemné vyhýbání.
- ZT09: V hodinové simulaci nepřekročen limit 2 psů a 1 kočky; nedochází k růstu historie tras/vodítek ani částic.
- ZT10: Export přes hranici chunku při skoku nebo hlazení odpovídá nepřerušenému exportu ve stejném backendu; žádné editorové značky.

Vizuálně kontrolovat celý cyklus chůze, usednutí i vstávání ze všech podporovaných pohledů. Testy výchozí aplikace uvedené v 06 nejsou testy zvířat; nové ZT scénáře jsou požadavky pro budoucí implementaci.
