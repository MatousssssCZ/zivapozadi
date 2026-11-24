# Katalog všech činností a efektů

Veškeré délky, intervaly a pravděpodobnosti níže jsou autorský animační návrh. Časy nezahrnují příchod, pokud není uvedeno jinak. Interval je cooldown od konce události pro danou zónu/postavu, nikoli záruka, že se v tomto intervalu aktivita spustí. Kontrola předpokladů a společný rozpočet mají přednost.

## A. Běžné činnosti

### A01 – Nákup u stánku

Rozšířit shop. Role zákazník + vendor. Potřebuje dosažitelný service, counter, queue a volnou ruku. Průběh: příchod → případná fronta → prohlížení 3–8 s → objednávka 5–12 s → příprava prodavače 2–5 s → předání 1,4–2 s → uvolnění pultu → odchod. Časování objednávky se smí částečně překrýt s přípravou. Při prohlížení 25 % zákazníků pouze odejde; tato větev nevytváří zboží. U nakupujících vytvořit jednu tašku/balíček, transfer až na události take. Typ zboží odpovídá stánku. Cooldown na osobu 120–300 s.

Fronta FIFO, orientační odstup 0,7–1 m měřit přes kameru. Posun po uvolnění předchozího místa za 0,4–1,2 s, cestou, nikoliv změnou pozice. Rezervovat cílové místo před uvolněním starého; zabránit prohození pořadí. Zrušení během výběru bez rekvizity; po převzetí zákazník odchází se zbožím. Kontrola: jeden nákup = jeden transfer, žádný současně držený a ležící předmět.

### A02 – Dvojice s horkým nápojem

Rozšířit coffee i o volné místo stranou stolu. Po získání obou nápojů setkání na dvou rezervovaných bodech. Stát 0,9–1,3 m od sebe, mírně natočeni do společného prostoru. Rozhovor 40–100 s, napití jednotlivce přibližně po 12–25 s s variací. Při mluvení nepít; listener může pít, ale nepřerušuje právě prováděné gesto rukou. Po dokončení domluvený odchod a stávající odložení do koše. Cooldown dvojice 180–360 s. Pára z otevřeného nápoje jemná; současný kelímek s víčkem má páru jen u otvoru, ne mohutný oblak.

### A03 – Rodič a dítě u stromku

Rodinná dvojice, viewpoint na stromku, dvě místa mimo průchod. Dítě zpomalí → dospělý počká → dítě ukáže rukavicí 1,5–2,5 s → rodič sleduje cíl 2–4 s a mírně skloní hlavu → klid 5–15 s → společný odchod. Celkem 12–30 s; cooldown zóny 120–240 s. Nutný dětský rig nebo schválená dětská varianta. Dospělý neodchází během dětské akce. Bez rodinného páru lze samostatně použít obyčejné prohlížení stromku, ale nenazývat jej scénou rodiče s dítětem.

### A04 – Prohlížení výlohy

Jeden člověk, view bod a místo před výlohou. Plynulé přibrzdění → natočení → pohled 5–18 s → orientace k trase → odchod. Jemně posouvat zájem mezi nejvýše dvěma cíli výlohy. Žádné neustálé otáčení hlavy. Cooldown místa 60–180 s. Pokud je cesta obsazená, nepřerušovat průchod jiným; prohlížení přeskočit.

### A05 – Setkání známých

Navázat na VisitState, dva návštěvníci s domluveným místem. Rozpoznání → zastavení/brzdění → orientace k sobě → kývnutí/mávnutí 1–2 s → rozhovor 15–45 s → loučení → odchod původním cílem. Cooldown dvojice 180–420 s. Rozhovor má jednoho vedoucího gesta a jednoho posluchače. Podání ruky a objetí nejsou nutné: současné pohledy a palčáky zvyšují riziko protnutí. Nedostaví-li se partner do 45 s, čekající přirozeně odejde.

### A06 – Fotografie u stromku

Jednotlivec nebo fotograf + doprovod. Pozice fotoaparátu i subjektu mimo trasu. Vytáhnout telefon 0,8–1,3 s → zvednout 0,8–1,2 s → hledat záběr 2–4 s → shutter event → krátká kontrola 1–2 s → spustit a schovat 1–2 s. Celkem 6–12 s. Bez blesku a bez záře přes celé náměstí. Cooldown zóny 180–360 s. Telefon se správně zrcadlí a drží; obě ruce jsou rezervované, pokud je póza obouruční.

### A07 – Venčení psa

Majitel + samostatná zvířecí entita. Chůze po trase, pes u boku, zastávka sniff 3–8 s přibližně po 20–50 s chůze. Majitel včas zpomalí a počká, poté společně pokračují. Vodítko délka 1,2–1,8 m, při prověšení oblouk; konce u ruky a obojku. Při velkém napnutí zpomalit účastníky, nikdy skokově netahat psa. Pes má vlastní footprint a vyhýbání. Cooldown vstupu takového páru 180–420 s. Nutná zvířecí grafika a chůze: neskládat psa z lidské kostry.

### A08 – Zahřívání v zimě

Mikroakce pouze u stojící postavy: tření rukou 2–4 s, přitažení šály 1,2–2 s, schoulení ramen 1–2 s, přešlápnutí 2–3 s. Vybrat jednu, potom 25–60 s pauza. Ruce s nákupem neprovádějí tření. V případě kelímku lze oběma rukama obejmout nádobu. Přešlápnutí vyžaduje odlepení a nové usazení chodidla. Pohyb pánve s oběma patami ukotvenými je jen mírné přenesení váhy, ne krok.

### A09 – Čekání na doprovod

Jeden čekající + vybraný přicházející partner. Čekání 15–45 s mimo cestu; rozhlédnutí po 7–15 s, kontrola telefonu nejvýše jednou za čekání. Partner musí mít dosažitelnou trasu před začátkem. Po příchodu pozdrav a společný odchod. Deadline 60 s, při neúspěchu telefon schovat a odejít. Cooldown místa 120–300 s. Nekolidovat s dosavadním meet-wait: jeden koordinátor, nikoli dvě nezávislé logiky.

### A10 – Práce prodejce

Vendor idle → volba jedné akce → tidy/replenish/wipe → idle. Srovnání zboží 2–4 s; otření pultu 3–5 s; doplnění kelímků 4–8 s. Mezera 20–60 s bez zákazníka. Zákazník má přednost; probíhající předání má přednost před vším. Výběr akce závisí na skutečné rekvizitě a dosažitelném cíli. Bez hadříku je možné srovnání zboží, nikoli mávání rukou nazvané otíráním. Potřebuje návaznost na A01 a serializovatelný VendorState.

### A11 – Odklízení sněhu

Pracovník s lopatou, pracovní pruh a místo hromady. Příchod → úchop lopaty → 3–6 s shrnutí → 1–2 s posun → opakování po jednotlivých pásech → přestávka → odchod. Celkem 45–90 s. Hotová plocha se stává cleared; hromada roste omezeně. Cooldown zóny 600–1200 s, start pouze zbývá-li skutečně sníh k odklizení. Průchod člověka práci pozastaví. Bez grafiky odhalené dlažby zvolit připravené místo při okraji s vhodnou maskou; neodhrnovat donekonečna neměnnou plochu.

### A12 – Odchod s nákupem

Není nezávislá náhodná aktivita, ale důsledek A01/A02. Taška v jedné ruce omezuje její švih; dva nápoje obsadí obě ruce. Chůzi se dvěma otevřenými nápoji zpomalit na 85–95 % osobního tempa. Nápoj nevylévat velkými gesty. Odchod portálem odstraní vlastníka i jeho odnesené předměty společně. Varianta dva kelímky vyžaduje dvě skutečná předání a model dvou úchopů.

## B. Vzácnější situace

### B01 – Chytání vloček

Dítě s doprovodem, aktivní sněžení, volný bod na okraji dění. Zastavit → zvednout jednu či obě ruce → sledovat vločky 3–6 s → spustit ruce → odejít. Celkem 5–10 s, cooldown zóny 240–480 s. Není nutné simulovat kontakt každé vločky s rukavicí. Dítě má zaměřený pohled, doprovod čeká. Nevytvářet skákání na místě.

### B02 – Sáňky

Dospělý táhne dítě sedící na sáňkách po celé předem ověřené sněhové trase. Vyžaduje sedící dětskou pózu, sáňky, kontakt sedadla a provázek. Jízda jedním průchodem 15–40 s, cooldown vstupního portálu 300–600 s. Sledují historii dráhy v definovaném odstupu, ne přímku přes zatáčku. Rozjezd i zastavení plynulé. Pokud sníh není souvislý, scénář nespustit; provázek nemůže prolínat stánkem. Velikost historie dráhy omezit podle délky provázku.

### B03 – Upadlá rukavice

Postava musí mít konkrétní rukavici nebo nést rezervní pár. Uvolnění → krátký pád → zastavení → otočení/přiblížení → dřep/předklon → pick event → narovnání → pokračování. Celkem 5–9 s, cooldown celé scény 300–600 s. Při variantě sundané rukavice musí existovat holá ruka pod ní; bez této grafiky padá rukavice nesená v ruce, ne ta namalovaná na dlani. Dočasný ground prop zůstává do skutečného zvednutí. Při abortu jej ponechat a naplánovat úklid, nemazat jej na očích.

### B04 – Koulovačka

2–3 děti, zasněžená zóna orientačně 4 × 3 m, odstupy 2–4 m. Jeden výrazný slot. Nutné: scoop, pack, throw, dodge, reagující dítě a runtime snowball. Trasy do míst i úhybné body dosažitelné a uvnitř zóny. Volná ruka, žádný kelímek.

| Fáze | Délka – návrh | Stav a událost |
|---|---:|---|
| gather | do 45 s včetně příchodu | rezervace dětí a zóny, sestavení na místech |
| scoop | 1,2–1,8 s | snížení pánve, dotyk rukavice se sněhem; spawn až při snow_take |
| pack | 0,8–1,4 s | dvě ruce před trupem, malá koule mezi nimi |
| aim | 0,5–1 s | natočení k partnerovi, klid před hodem |
| throw | 0,65–0,95 s | nápřah, zrychlení, release z aktuálního úchopu, doznění |
| flight | 0,45–0,8 s | světová balistika, ne interpolace přes výšku obrazovky |
| reaction | 0,6–1,2 s | drobný úhyb nebo otočení, žádná velká rána |
| pause | 2–6 s | klid; střídání rolí není striktně ABAB |
| finish | 3–6 s | spuštění rukou, společný odchod |

Celkem 30–65 s, obvykle 4–8 hodů na session; počet naplánovat při startu, poslední hod nepřerušovat kvůli časovému limitu. Cooldown zóny 240–480 s. Orientačně 45 % zamíření do volného sněhu poblíž partnera, zbytek na trup; nikdy na hlavu. Úspěšný zásah není podmínkou dokončení.

Trajektorie ve světě: při release známe P0 = (X,Z,H), zvolíme cílový bod P1 a T. Pro vodorovné složky v=(P1-P0)/T; svisle vH=(H1-H0+0,5*g*T²)/T, g=9,81. P(t)=P0+v*t+(0,0,-0,5*g*t²), pořadí složek v implementaci sjednotit. Promítnout camera.toScreen(world,H). Nekreslit let podle zemního y samotné koule; řadit podle její pozice na zemi. Při dosahu země či překážky skončit dříve. Segmentový test mezi kroky zabrání přeskočení překážky. Model výšky překážek je zjednodušený návrh; když nelze spolehlivě rozhodnout, hod nepovolit.

Před každým nápřahem ověřit cizí osoby v dráze včetně rezervy. Při vstupu kolemjdoucího hru pozastavit. Již vypuštěnou kouli nezmrazit ani nesmazat: normálně dokončí let; plánování má předem preferovat dráhu bez lidí. Úhyb nesmí vést mimo zónu nebo do další osoby. Při blokaci nad 15 s ukončit po dohrání aktuálního letu. Dopad = 4–8 drobných částic 0,25–0,6 s, pak návrat do poolu.

### B05 – Stavba sněhuláka

Výchozí dva účastníci: dospělý + dítě, případně dvě děti pro menšího sněhuláka. Zóna asi 4 × 4 m mimo průchod, tři krátké dráhy válení a stálé místo. Max. jeden sněhulák v zóně. Potřebuje klek/dřep, roll, lift, place, decorate a malované části.

| Fáze | Délka – návrh | Výsledek |
|---|---:|---|
| gather | do 45 s | všichni na místě, prostor zarezervován |
| rollBase | 20–35 s | koule roste po skutečně uražené dráze, vzniká stopa |
| rollMiddle | 15–25 s | druhý účastník může pomáhat, bez duplicitního růstu |
| liftMiddle | 3–5 s | společný start zvedání, kontakt rukou, place event |
| rollHead | 10–20 s | menší koule, přiměřený pohyb dítěte |
| placeHead | 2–4 s | dospělý pomůže podle dosahu |
| decorate | 15–25 s | postupně oči, nos, šála; každý doplněk má událost |
| admire | 8–15 s | klidné prohlížení, občasné ukázání |
| leave | podle trasy | účastníci odejdou, objekt zůstane |

Celkově přibližně 90–150 s práce, nepočítaje příchod a odchod. Dílčí rozsahy mohou dát krajní součet mírně mimo toto doporučení; nenásilně zvolit fáze tak, aby nebylo třeba skokově uspěchat zvedání. Doporučené poloměry konečných koulí 0,30 / 0,22 / 0,14 m pro menšího sněhuláka. Velikost ověřit vůči dětskému a dospělému dosahu.

Růst návrhově r³=r0³+k*d (d je uražená délka vhodným sněhem), s horním limitem. Není to model fyziky sněhu, ale zajistí vazbu růstu na skutečné válení. Rotace koule podle uražené dráhy a aktuálního poloměru. Tlačící ruce u povrchu, ne uvnitř. Stojící postava kouli nezvětšuje. Během přestávky se fáze zastaví, nikoliv celý svět.

Převod rozestavěných částí na hotový runtime objekt je atomický: v jednom kroku odebrat použitý díl a přidat odpovídající stage, bez dvojího vykreslení. Nový footprint zohlednit již během stavby. Dekorace vyjmout z připravené tašky nebo mít položené vedle stavby. Fotografování po dokončení jen jako volitelná návaznost A06, s reálným telefonem.

Při abortu nesmazat koule. Zůstanou jako bounded runtime dílo, které může pozdější session dokončit, nebo je zóna označena jako obsazená do restartu. Po dokončení další stavbu na stejné místo nespouštět. Cooldown 600–1200 s platí jen pokud zbývá další povolené místo. Kolemjdoucí mohou krátce pozorovat hotové dílo přes stejný mechanismus jako výlohu.

## C. Prostředí – úplné pokrytí

| ID | Prvek | Konkrétní návrh a kontrola |
|---|---|---|
| E01 | Nepravidelné sněžení | Hustota pozvolně kolísá v pásmu 0,7–1,15 násobku nastavení, přechody 30–90 s. Vypnutí zůstává skutečné vypnutí. Žádný hromadný skok částic. |
| E02 | Společný vítr | Jemné poryvy 8–20 s, envelope 2–5 s; všechny efekty sdílejí pole, jednotlivé větve mají zpoždění. Směr vyjadřovat jednotně; neplést metry a obrazové px. |
| E03 | Pára od občerstvení | Zdroj na horké části stánku, život částice 1,5–3,5 s, měkký rozptyl. Bez zdroje žádná pára. |
| E04 | Pára z kelímku | Zdroj z aktuálního okraje/otvoru, život 0,8–1,8 s, rychlé zeslabení. Emitované částice zůstávají ve světě. |
| E05 | Kouř z komínů | Pouze explicitně označené komíny. Život 4–8 s, průhledný, lehký rozptyl; nevytvářet oblaka přes celou scénu. |
| E06 | Pohyb dekorací | Samostatné vystřižené závěsy/větvičky, pivot upevnění, výchylka cca 0,5–2°. Netřást celým stánkem ani fasádou. |
| E07 | Dveře a teplé světlo | Otevření 0,6–1 s, průchod podle osoby, zavření 0,8–1,3 s; světlo sleduje otevření. Maska a opravený podklad nezbytné. |
| E08 | Okna | Vybraná okna mění stav po 180–600 s, přechod 0,5–1,5 s. Ostatní okna beze změny. Žádné hromadné zhasnutí. |
| E09 | Vánoční řetězy | Výchozí stabilní; volitelně jemné kolísání max. ±3 % bez stroboskopu. Výzdoba již namalovaná v pozadí vyžaduje masku. |
| E10 | Stopy a vyšlapané cesty | Zachovat existující došlapy a limity. Statická vyšlapaná cesta = samostatný podklad; dynamické stopy nevytvářet při stání. Jejich životnost může reagovat na intenzitu sněhu, ale deterministicky. |
| E11 | Odlesky na mokrém povrchu | Maska wet/slush, tlumená barva a alfa 0,04–0,12 podle scény. Bez masky vypnuto. Odraz vázat na skutečný světelný zdroj, nikoliv kreslit zrcadlo na suchém sněhu. |

Průběžné efekty nepodléhají cooldownu činností, ale mají společný limit částic a nezávislý RNG. Společný vítr nemusí být fyzikálně přesný; vizuální soulad je důležitější než intenzita efektu.

## D. Psi a kočky – revize 2

Povinný katalog Z01–Z10 je v 07_PSI_A_KOCKY.md. Z01 rozšiřuje A07, nejde o další nezávislé venčení. Přidává čekání u stánku, hlazení, setkání psů, setřesení sněhu, kočičí průchod, pozorování, očistu/protažení, nízký skok a klidnou reakci psa s kočkou.
