# Animace pro současné 2D postavy a potřebná grafika

## 1. Souřadnice a omezení

Referenční dospělý: 130 lokálních jednotek = 1,75 m (Q v camera.ts). Paže z aktuální knihovny; hodnoty 24/21 jednotek z projektového zadání vždy porovnat s konkrétním bodyTemplate. Každý cíl ruky vyjadřovat v lokální soustavě postavy a převést přes stávající pohled/zrcadlení, ne přičítat obrazové souřadnice bez měřítka.

V tabulce je F směr dopředu, U směr nahoru a P poloha ramene aktivní ruky. Souřadnicové cíle jsou výchozí hodnoty pro referenční postavu, nikoliv absolutní pixelové cíle pro každou scénu. IK clamp: maximálně 95 % součtu délek paže při běžném gestu; kontakt s rekvizitou raději vyřešit pozicí postavy než prodloužením paže. Hlavu naklánět v rovině obrázku, ne předstírat namalovaný obličej z nového úhlu.

## 2. Knihovna pohybů

| Klip | Fáze a lokální cíle | Délka – návrh | Konflikty a kontrola |
|---|---|---:|---|
| beatSmall | zápěstí přiblížit k P+12F−20U, jeden nepravidelný zdvih 3–5 j., vrátit | 0,8–1,4 s | jen volná ruka; nepoužívat nekonečný sinus |
| pointMitten | anticipace u trupu, směr k cíli, zápěstí do P+25F−8U, krátce držet, zpět | 1,5–2,5 s | palčák ukazuje celou rukou, nepřidávat prst |
| listenNod | hlava 2–5° dolů a zpět, nejvýše dvě menší kývnutí | 0,6–1 s | vlastní fáze, ne kopie mluvčího |
| greetWave | ruka do P+10F+8U, 1–2 malé výchylky předloktí, pomalé spuštění | 1,2–2 s | volná ruka, jen při viditelném partnerovi |
| rubHands | oba úchopy před hrudníkem; protisměrný posun 1,5–2,5 j. | 2–4 s | obě ruce volné, žádné prolnutí palčáků |
| adjustScarf | cíl na existující kotvě šály u krku; lehký dotyk a návrat | 1,2–2 s | šálu neodtrhnout od trupu |
| holdCupBoth | druhá ruka přejde na opačnou stranu kelímku | 3–8 s | jeden kelímek, dvě kontaktní místa |
| phoneCheck | kapsa → cíl P+14F−18U, hlava 5–8° dolů → kapsa | 3–5 s | reálný prop, ruka obsazená po celou dobu |
| photo | kapsa → telefon pod úroveň očí; obouruční stabilizace → dolů | 6–12 s | nohy pevné, žádný blesk |
| wipe | kontakt s pultem → 2–3 tahy délky 8–15 j. → zpět | 3–5 s | hadřík a geometrie pultu; nepropadat skrz |
| scoop | pokles pánve s ohybem kolen, předklon 10–20°, kontakt se sněhem, návrat | 1,2–1,8 s | nutné řešení nohou a kabátu při dřepu |
| throw | nápřah 25 %, zrychlení 30 %, release v 55 %, doznění 45 % | 0,65–0,95 s | release jednou, koule začíná v úchopu |
| dodge | přenos váhy, jeden krok do rezervovaného bodu, stabilizace | 0,6–1,2 s | skutečný pohyb kořene, zachované došlapy |
| roll | mírný předklon, obě ruce na kouli, pomalé kroky | dle dráhy | koule i ruce musí být dostupné, růst podle dráhy |
| lift/place | dřep → kontakt → společný zdvih → usazení → uvolnění | 3–5 s | partneři čekají na bariéře prepared, objekt není dvakrát |
| decorate | dosah k tašce → doplněk → konkrétní místo na sněhulákovi | 2–4 s / kus | každé přidání vlastním eventem |
| pickGlove | krok k rukavici, pokles pánve, kontakt, pick, narovnání | 3–5 s | rukavice nezmizí před kontaktem |
| shovel | dvě ruce na násadě, lopata po povrchu, tělo následuje | 3–6 s / tah | pohyb materiálu musí odpovídat nástroji |

Návrhové přechody: náběh/doběh 0,18–0,35 s. Použít hladké ease-in/out u kontaktu a klidu, u hodu rychlejší akcent. Výchozí náklon hlavy pro běžné gesto do 8°, trup do 5° mimo práci/dřep. Posun pánve v klidu 0,5–1,5 j. Není povoleno rozkmitat tělo stejnou sinusoidou jako ruce.

## 3. Řízení rozhovoru a vrstev

Session conversation uchovává speakerId, turnEndStep, nextTurnStep a plán drobných reakcí. Návrh promluv 3–7 s; mezera 0,2–0,8 s, občasná klidná pauza 1–2 s. Pouze jeden mluvčí, listener může kývnout. Jedna promluva obsahuje 0–2 malá gesta; není povinné gestikulovat celou dobu. Listener kývne přibližně v 35 % promluv, termín losován při jejich startu. Tato čísla nejsou výsledkem studie R2.

Pohled převážně na partnera, občas na stromek/stánek; nikoliv neustálý scan. Skupina 3–4 osob stojí v otevřeném oblouku kolem středu; pro začátek implementovat dobře dvojice a stejný session model použít pro rozšíření. Příchod dalšího člověka vyžaduje rezervaci nového místa a došlápnutí při přeskupení.

Priority vrstev: bezpečné dokončení kontaktu/předání → pracovní akce/telefon/pití → komunikační gesto → zimní mikroakce → idle. Lokomoce a opory mají vlastní vrstvu. Každá akce deklaruje masku těla a potřebné ruce; současné kompatibilní akce lze míchat. Napití nesmí pustit tašku z jiné ruky. Pro začátek stačí jeden dominantní action plus aditivní hlava/idle, není nutné stavět rozsáhlý animační engine.

Žádný stejný mikroklip dvakrát bez alespoň jedné jiné akce či 20 s pauzy. Náhodné amplitudy a trvání vzorkovat při startu a uložit. Výběr pohledu s existující hysterezí, ne střídání front/back při každém drobném pohybu cíle.

## 4. Grafické podklady – zadání k vytvoření

Všechny nové podklady: malovaná textura odpovídající současné knihovně, studené okolní světlo a jemné teplé odlesky, měkké kontury, průhledné PNG bez bílé podložky. Pro 4K počítat s 2× zdrojovou velikostí proti logickému použití, podle stávajícího pixelScale. U dílů kostry zachovat formát partLibrary včetně pivotů, překryvů v kloubech a barevných masek, pokud se mají přebarvovat. U statických předmětů definovat anchor, úchop a footprint odděleně.

| Priorita | Podklad | Potřebné pohledy/vrstvy | Použití a náhrada |
|---|---|---|---|
| P1 | Taška / papírový balíček | front3q/back3q nebo kontrolovaně zrcadlitelná varianta, úchop v uchu | A01/A12; bez podkladu ponechat původní nákup, ale neoznačit odchod s nákupem za dokončený |
| P1 | Telefon | přední/zadní plocha v perspektivě, dva úchopy | A06/A09; bez něj pouze čekání bez telefonu |
| P1 | Rukavice + hadřík | oddělený předmět, kotevní body | B03/A10; rukavice nesená navíc nepotřebuje holou ruku |
| P1 | Snowball a 3 části sněhuláka | nepravidelná textura sněhu, kontaktní stín zvlášť; oči/nos/šála odděleně | B04/B05; žádné zářivě bílé geometrické koule ve finální scéně |
| P1 | Dětská postava | vlastní bodyTemplate a proporce; front3q/back3q; díly stejných kategorií jako dospělý | A03/B01/B04/B05; pouhé zmenšení dospělého jen vývojářský placeholder |
| P2 | Pracovní varianty kabátu | trup pro hlubší předklon/dřep, případně překryv spodního lemu | sbírání, stavba, rukavice; bez nich omezit rozsah pózy po vizuální kontrole |
| P2 | Lopata | násada, list, dva úchopy; sníh na listu samostatně | A11; bez nástroje aktivita vypnutá |
| P2 | Pes | front3q/back3q, hlava/tělo/čtyři nohy/ocas, sniff pose nebo atlas | A07; bez assetu bez psa, nikoliv náhradní lidská postava |
| P2 | Sáňky a sedící dítě | rám, sedák, přední/zadní překrytí; sedící dětské díly | B02; sedící pózu nelze nahradit chodící postavou posunutou dolů |
| P2 | Dveře a opravený podklad | zakryté původní dveře, otvor/interiér, křídlo, rám, světelná maska | E07; bez vrstev nerozhýbávat celou fasádu |
| P2 | Masky oken a výzdoby | ruční alfa masky, pivoty zavěšených částí | E06/E08/E09; bez masky ponechat stabilní malované pozadí |
| P2 | Povrchy sněhu | odkrytá dlažba, maska uklizeného pásu, hromada, mokrá maska | A11/E10/E11; nepřidávat odlesky na suchý sníh |
| P3 | Pára/kouř | několik měkkých malovaných nepravidelných sprite variant | E03–E05; procedurální měkké částice přijatelné po vizuálním sladění |

Koulovačka a sněhulák jsou prioritní požadované scénáře, ne nepovinný bonus. Po dodání podkladů mají přednost před psem a sáňkami.

## 5. Vizuální akceptace

Kontrolovat výstup při skutečné velikosti postavy v 1080p i 4K, nikoliv jen zvětšený rig. Čitelná musí být silueta činnosti a rekvizita. Na 3–5 klíčových snímcích každé akce ověřit překryv ramen, loktů, lem kabátu, držení předmětu a oporu bot. Nepřidávat velké pohyby jen proto, že drobná akce z dálky není vidět. Některé mikroakce mohou být záměrně téměř nepostřehnutelné.

## 6. Zvířecí grafika – revize 2

Řádek Pes doplňuje podrobná specifikace v 07_PSI_A_KOCKY.md; nově je požadována také kočka s vlastními díly a pózami. Základní chůze a klid obou druhů mají přednost před vzácnými zvířecími situacemi. Současné lidské díly se pro zvířata nepoužijí.
