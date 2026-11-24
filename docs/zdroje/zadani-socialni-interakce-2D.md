# Zadání: sociální interakce malovaných 2D postav

**Soubor:** `Zadani_socialni_interakce_2D_Claude.md`  
**Určeno pro:** implementaci v TypeScriptu, deterministická simulace 60 Hz, video 30 fps, 5–30 postav.  
**Verze:** 1.0, 24. 11. 2026.

## A. Výzkumný základ a katalog chování

### A.1 Co implementovat a co výzkum skutečně říká

Cílem je čitelná, střídmá konverzace v malovaném zimním obrazu. Implementovat společného režiséra rozhovoru, knihovnu parametrických gest a řešič kontaktů. Nenahrazovat současný `talk` další nekonečnou sinusovkou. Postavy nemusí dělat viditelné gesto pokaždé, když mají slovo. Mluvení je interní stav; bez úst a zvuku nelze spolehlivě z obrazu určit všechny okamžiky řeči.

Značky původu v dokumentu:

- **[E]** výsledek konkrétního empirického výzkumu; platí pro jeho soubor a metodiku.
- **[K]** odborný koncept nebo animační princip, nikoli naměřená hodnota.
- **[N]** návrhový parametr této aplikace. Veškeré níže navržené úhly kloubů, pravděpodobnosti gest a animační křivky jsou [N], pokud není výslovně uvedeno jinak.
- **[R]** vstupní údaj vašeho rigu/aplikace.

| Oblast | Zjištění a zdroj | Důsledek pro implementaci |
|---|---|---|
| Střídání | Stivers et al. [S1]: v analyzovaných otázkách a odpovědích napříč deseti jazyky průměrný časový odstup +208 ms; vrchol distribucí v okolí 0–200 ms [E]. Nejde o univerzální délku každé pauzy. | Plánovat odpověď před koncem promluvy. Výchozí krátká mezera má být kolem 0,2 s, nikoli několik sekund. |
| Překryvy a příprava | Levinson & Torreira [S2] shrnují krátké mezery a predikci konce; jejich analýza telefonních dat uvádí krátké překryvy a méně než 5 % překryté řeči [E]. Jednotky řeči v takové analýze nejsou totéž jako náš delší vizuální blok. | Oddělit přípravu gesta, interní řeč a vlastnictví slova. Krátký překryv povolit, nikoli dvě nezávislé smyčky `talk`. |
| Naslouchání | Bavelas, Coates & Johnson [S3] rozlišují obecné reakce, např. kývnutí, a reakce specifické k příběhu; posluchači ovlivňují společné vyprávění [E]. | Reakce vázat na událost partnera; backchannel automaticky nepřebírá slovo. Číselnou četnost kývnutí tato specifikace ze studie nepřebírá. |
| Gesta | McNeill Lab [S4]: příprava, případné podržení, významový úder, případné podržení a návrat; kategorie se mohou překrývat [K]. | Klipy mají fáze a význam. Beat je rytmické zdůraznění, deiktické gesto má konkrétní cíl, ikonické zobrazuje jednoduchý tvar/rozměr. Regulátor řídí interakci, např. předání slova. |
| Skupiny | Setti et al. [S5] operacionalizují Kendonovy F-formace: společný vnitřní prostor a orientace účastníků do něj [K]. | Skupina rezervuje místa a společný střed; příchozí dostane slot, nevstoupí přímo mezi mluvčí. |
| Proxemika | Sorokowska et al. [S6] zkoumají preference vzdáleností v různých zemích [E]. Deklarovaná preference není fyzikální kolizní hranice. | Rozlišit tvrdý tělesný poloměr a měkké pohodlí. Nepřiřazovat všem identickou osobní vzdálenost ani stereotyp podle pohlaví/národnosti. |
| Pozdrav | Kingstone et al. [S7]: pořadí vzájemného pohledu a nabídnutí ruky ovlivňuje reakci. Cabibihan et al. [S8] měří fáze lidského podání ruky [E]. | Nejdřív oboustranné zaregistrování a natočení, potom ruce. Kontakt řeší jeden společný koordinátor. |
| Chlad | Flouris & Cheung [S9]: experiment s řízením tepelného komfortu potvrzuje behaviorální reakce na chlad [E]. Neudává četnost tření rukou na vánočním trhu. | `coldDiscomfort` je autorský ovladač atmosféry, nikoli fyziologický model. Intervaly zimních drobností jsou [N]. |
| Animace | Lasseter [S10] popisuje anticipaci, časování, doznění, překrývání pohybů a oblouky [K]. | Použít tyto principy střídmě; squash/stretch nepoužívat, protože díly jsou tuhé. |
| Procedurální individualita | Perlin [S11] odděluje trvalejší osobnost a okamžitou náladu při procedurálním doplňování základních pohybů [K]. | Seed určí stabilní styl jedince; situace mění jeho intenzitu. Nepřidávat nezávislý šum do každého kloubu. |

Omezení průzkumu: dostupné zdroje nedávají univerzální tabulku „kývnutí 4° každých 7 s“ ani jednotnou frekvenci zimních gest. Tyto hodnoty jsou níže explicitně navrženy pro malé malované loutky. U [S3] byl dostupný bibliografický abstrakt; nepřebíráme z něj detailní kinematiku. [S2] je přehled s vlastními analýzami. Ostatní citované webové podklady jsou původní studie, autorské metodiky či autorské animační texty. Přehled slouží k návrhu, nejde o systematickou metaanalýzu.

### A.2 Souřadnice a závazná omezení rigu

`q = 1.75 / 130 = 0.01346153846 m/j.` Nadloktí `L1=24 j.`, předloktí `L2=21 j.`, dosah zápěstí nejvýše `45 j. = 0.60577 m` od ramene. Stehno 32 j., lýtko 30 j. Díly se nenatahují a nemění tvar.

Všechny tabulkové cíle rukou jsou **2D lokální souřadnice vůči středu ramenní linie trupu**, nikoli vůči pánvi ani v pixelech. `x` vpravo v nezrcadleném výtvarném pohledu, `y` nahoru. Rameno A je `(+8.7,0)`, rameno B `(-8.7,0)`. Pro zápis jednoručního gesta používáme ruku A; přenos na B je `x→-x`. A/B jsou sloty v kresbě, nikoli označení anatomické pravé a levé ruky. Anatomickou identitu rukou drží zvláštní mapování `view.handSlots`; kelímek nikdy při změně pohledu nepřeskočí do jiné anatomické ruky.

Matice rodiče trupu převádí bod do výsledné pózy. Zrcadlení provést až přes konzistentní mapování pohledu; neotáčet jen texturu a ponechat původní IK. V každém pohledu autor nastaví pivoty, identitu blízké/vzdálené paže, loketní větev a sockety. Výchozí čísla tabulky jsou pracovní hodnoty, sockety konkrétní malby mají přednost.

`headRollDeg` a `trunkRollDeg` jsou pouze rotace v obrazové rovině. Kladný úhel matematicky proti směru hodinových ručiček před převodem do obrazové osy y dolů. Pseudokývnutí v daném pohledu má autorský znaménkový faktor `nodSign∈{-1,+1}`. **Skutečný pitch nebo yaw hlavy tím nevzniká.** Požadavek „podívat se na partnera“ znamená `attentionTarget` plus natočení celého těla/výběr pohledu; malé zakývání je jen výtvarný náznak. Neimplementovat pohyb očí, deformaci obličeje ani samostatné otáčení čepice proti hlavě.

#### Referenční polohy zápěstí [N]

| ID | Ruka A: (x,y) j. | Význam |
|---|---:|---|
| REST | (10.7, −44.5) | Uvolněná ruka podél těla, malý odstup od kabátu |
| READY | (18, −28) | Nízká příprava gesta |
| BEAT_UP | (21, −22) | Horní poloha malého zdůraznění |
| BEAT_DOWN | (22, −27) | Dolní poloha zdůraznění |
| OPEN | (31, −22) | Otevření paže ven; dlaň bez nové malby zůstává palčákem |
| SIZE_IN | (13, −22) | Dvě ruce blízko před tělem |
| SIZE_OUT | (29, −22) | Dvě ruce vymezují šířku |
| SHRUG | (27, −16) | Nízké rozpažení při pokrčení ramen |
| WAVE | (28, 10) | Zvednutý palčák při pozdravu |
| CUP | (12, −25) | Primární zápěstí držící kelímek |
| POCKET | (11, −32) | Cíl k přední kapse, musí jej nahradit skutečný pocket socket |
| RUB | (2.5, −18) | Ruce před hrudí; přesné rozteče podle tloušťky palčáků |
| FACE_NEAR | (5, 17) | Jen předběžný cíl, skutečný určí socket úst a kelímku |
| SCARF | (−7, 5) | Ruka A k protějšímu okraji šály, poté skutečný socket |
| CAP | (5, 18) | Ruka na okraji čepice, poté skutečný socket |

Obdobné cíle pro B jsou zrcadlené. `SIZE_OUT` vymezuje vzdálenost zápěstí 58 j. ≈ 0.78 m; není to délka jedné paže. CUP, FACE_NEAR a RUB jsou dosažitelné pracovní pozice, ale kontakt s rekvizitou vyžaduje správné sockety; číselná tabulka sama správný dotyk nezaručuje.

Při úpravě šály je důležitý poměr délek 24/21 j.: ruka se s limitem lokte 145° nedostane blíže než asi 13.83 j. k vlastnímu rameni. Proto A sahá k protějšímu okraji šály, nikoli přímo nad svůj ramenní pivot. Pokud konkrétní scarf/mouth socket leží v nedosažitelném vnitřku IK prstence, vybrat jiný povrchový kontakt, upravit postavení ruky nebo akci odmítnout; paži nezkracovat.

Pro IK vzdálenost `d=|W−S|` musí ležet v `[dMin, dMax]`, kde pro limity lokte 8° až 145°:

```text
dMin = sqrt(L1² + L2² + 2 L1 L2 cos(145°)) ≈ 13.83 j.
dMax = sqrt(L1² + L2² + 2 L1 L2 cos(8°))   ≈ 44.89 j.
elbowFlex = acos((d² − L1² − L2²)/(2 L1 L2))
alpha = atan2(W.y−S.y, W.x−S.x)
beta = acos((L1²+d²−L2²)/(2 L1 d))
E = S + L1 * (cos(alpha + branch*beta), sin(alpha + branch*beta))
```

Pro přesun mezi volnými cíli, jehož přímá dráha prochází vnitřkem IK prstence, použít polární dráhu kolem ramene: `d(u)=lerp(d0,d1,S(u))`, `a(u)=a0+unwrapDelta(a1−a0)*S(u)`, `W(u)=Srameno+d(u)*(cos(a(u)),sin(a(u)))`. Ta zaručí radiální dosažitelnost, ne absenci kolize s kabátem. Vyzkoušet deterministicky kratší i opačný úhlový oblouk, validovat obálku paže a limity; preferovat oblouk vně siluety. Pro kontaktní finální úsek použít přesný socket. Při pohybu ramene se celé lokální řešení transformuje s trupem; pevný světový kontakt se naopak každý tick převádí zpět do lokálního prostoru.

`branch` je stálá větev dané paže/pohledu. Cíle všech fází i interpolace validovat; dráha mezi dvěma dosažitelnými body může projít nedosažitelným vnitřkem prstence. Při neproveditelnosti zmenšit gesto nebo vložit cestu přes READY; během pevného kontaktu nepřesouvat kontakt clampem. Předem změnit postavení, případně klip odmítnout. Výsledný loketní úhel vždy diagnostikovat, nikoli současně nezávisle přičítat další loketní sinusovku.

### A.3 Společná gramatika klipů

Časové hodnoty katalogu jsou výchozí délka `T`, povolený interval a způsob losování: pokud není uvedeno jinak, `T~Tri(min, default, max)` — trojúhelníkové rozdělení s modem default. Rozptyl je `Var=(a²+b²+c²−ab−ac−bc)/18`, kde `a=min,b=default,c=max`. Vylosovat jednou při plánování, nikdy během přehrávání.

Standardní jednoruční klip G má klíče v normalizovaném čase:

| u | Fáze | Výchozí chování |
|---:|---|---|
| 0 | Aktuální póza | Navázat na skutečnou pózu a rychlost ruky, ne skočit na REST |
| 0–0.12 | Anticipace | Zastavení předchozího pohybu, malá příprava; žádné povinné výrazné protipohnutí |
| 0.12–0.35 | Příprava | Oblouk k pracovní poloze |
| 0.35–0.60 | Významový pohyb | Vlastní beat, ukázání, roztažení; událost `stroke` |
| 0.60–0.72 | Podržení | Krátké čitelné ustálení |
| 0.72–1 | Návrat a doznění | K další připravené póze nebo do klidu |

Použít `S(u)=6u^5−15u^4+10u^3`, `u∈[0,1]`, na přechodech mezi klíči s nulovou koncovou rychlostí. Oblouk zápěstí může být kvadratická Bézierova dráha `B(S(u))` s kontrolním bodem vychýleným o 2–4 j. ven od kabátu. Na nepřerušeném průchodu přes mezilehlý bod používat Hermitovu křivku s navazující tečnou; nezastavovat na každém klíči. Při přerušení převzít okamžitou rychlost, jinak vytvořit krátké C1 dobrzdění před novým segmentem.

Vyjma kontaktů končí předloktí o 2–4 simulační tickové kroky později než pohyb trupu; řešit pomocí posunu cílové trajektorie, nikoli následnou rotací předloktí po IK. Volnou hlavu lze opožďovat 3–6 ticků. Kontakty ruky, kelímku a chodidel mají přednost před dozněním. Šála zůstává rigidní; pokud má samostatný díl, dovolena malá rotace maximálně ±1.5° kolem skutečného závěsu, nikoli ohyb.

Normalizované časy jsou autorský návrh, který preflight smí přerozdělit mezi přípravu, úder a návrat. Ze skutečného REST trvá zvednutí ruky typicky 0.7–1.1 s a návrat 0.6–1.0 s [N]; z READY mohou být mnohem kratší. Zejména změna lokte z asi 16° v REST na 110° při gestu potřebuje při limitu 220°/s a quintic přechodu nejméně 0.80 s. Nelze ji vměstnat do 12 % krátkého klipu. Vyhradit jednotlivým segmentům alespoň jejich vypočtené minimum, zbytek nominální délky rozdělit podle autorských vah. Pokud součet minim překročí nominální T, výslednou délku prodloužit do povoleného preflight limitu nebo kandidát odmítnout. Při pohybu navazujícím z READY nepřehrávat znovu povinný sestup do REST.

Pokud klip vyžaduje příliš rychlý kloub, prodloužit jeho přípravu/návrat před rezervací událostí. V katalogu uvedené délky jsou cíle, ne povolení překročit limity. Významový úder nemusí čekat na kompletní návrat předchozího gesta; lze zůstat v READY. Žádné aditivní vrstvení dvou nezávislých trajektorií stejného zápěstí.

U každého klipu níže neuvedené kanály zůstávají v aktuální základní póze; pánev `Δ=0`, hlava `Δ=0`, nohy pevně na místě. Gesta dovolují malý dech a schválený posun váhy, pokud není výslovně zakázán. Pravděpodobnost je vždy **na popsanou příležitost**, nikoli na snímek. Cooldown začíná koncem klipu. `CD` je cooldown v sekundách.

### A.4 Mluvčí — katalog

Příležitosti jsou akcenty interní promluvy podle C.3. Při příležitosti pravděpodobnost výraznějšího gesta `p=0.45*gestureRate`, omezit na `[0.15,0.65]`. Po filtrech a cooldownu losovat z dostupných vah: beat 0.48, deiktické 0.16, ikonické 0.12, otevření 0.18, shrug 0.06. Chybí-li cíl/volná ruka, příslušnou váhu vynulovat a ostatní normalizovat. Nedostupnost nesmí způsobit povinné náhradní gesto. Nejvýše dvě výraznější gesta na vizuální promluvu kratší než 6 s.

**G01 `beat`: zdůraznění bez konkrétního významu.** `T=1.4 [1.1,2.0] s`, CD 2.5; z READY může mít lokální úder pouze 0.35–0.55 s, ale celá obálka dodrží rychlostní limity. G: 0.12 drobná příprava ze současné pózy, přes READY do 0.35 BEAT_UP, 0.53 BEAT_DOWN, 0.65 zpět o 1 j., 1 REST/READY. Posun amplitudy celé pracovní části ±15 %. Volitelně druhý slabší úder s pravděpodobností 0.20, odstup 0.25–0.45 s; prodlouží klip. Trup maximálně 0.8°, hlava náznak kývnutí 1.5° v úderu, pánev do 0.4 j. Ne s pitím, handshake nebo obsazenou rukou; při kelímku použít G06. Rytmus není konstantní metronom.

**G02 `point`: skutečný stánek, strom či cesta.** `T=2.1 [1.6,2.8] s`, CD 12. Vypočti projekci cíle P, `dir=normalize(P−shoulderScreen)`; v lokální póze cílové zápěstí `S+34*dirLocal`, s vertikální složkou směru omezenou na rozumný dostupný sektor a s kontrolou kabátu. G: READY → 0.40 cílový bod → držet do 0.70 → návrat. Hlava do 2°, trup směrem k cíli do 2° v rovině obrazu, bez nového kořenového posunu. Použít paži na straně cíle; při cíli za zády nejprve samostatný krok/natočení nebo gesto odmítnout. Palčák stačí pro hrubé „tamhle“, nikoli přesné ukazování prstem. `referentId` musí existovat. Předloktí má být čitelné mimo obrys kabátu.

**G03 `size`: jednoduché ikonické vymezení šířky.** `T=2.4 [1.9,3.1] s`, CD 18. Obě ruce: G s SIZE_IN v 0.35, SIZE_OUT v 0.58, držet do 0.75, návrat. Trup do 1°, hlava do 1.5°, žádný posun pánve nutný. Varianta rozsahu `x=22–31` pro A, záporně pro B; nepřekračovat IK. Pouze obě ruce volné, ne v těsné frontě. Význam při generování vybrat z témat „velký strom“, „rozměr stánku“; bez konkrétního dialogu pouze vizuální náznak. Dvouruční ikonické gesto neprovádět s kelímkem.

**G04 `open`: nabídka/vysvětlení, nikoli automaticky prosba.** `T=2.0 [1.5,2.8] s`, CD 8. READY → OPEN v 0.50 → podržení do 0.70 → návrat. Jedna ruka výchozí, obě pouze s pravděpodobností 0.25 a oběma volnými. Palčák natočit relativně k předloktí o 10–20° jen tam, kde kresba vypadá přirozeně. Nenazývat výslednou texturu otevřenou dlaní, pokud nemáme tuto variantu. Hlava lehký náklon 2°, trup do 1°. Ne přes stůl/partnera.

**G05 `shrug`: mírná nejistota či odlehčená poznámka.** `T=1.7 [1.3,2.3] s`, CD 30; žádná náhodná „negativní emoce“ každou chvíli. Obě ruce READY → SHRUG v 0.45 → podržet 0.60 → návrat. S rigidním trupem není skutečné zvednutí obou ramen dostupné: použít změnu úhlu nadloktí, trup do 1° a hlavu do 3°; **neposouvat ramenní pivoty ven z kabátu**. Bez obou volných rukou pouze jednostranné OPEN se sníženou amplitudou, ne nový shrug. Při budoucím samostatném ramenním rigu lze doplnit malý zdvih, nyní zakázán.

**G06 `cupBeat`: malé zdůraznění drženým kelímkem.** `T=1.5 [1.2,2.0] s`, CD 5. Z aktuálního CUP posun 0 → (0,+1) v 0.25 → (+2,+2) v 0.50 → (+1,+1) v 0.70 → 0. Kelímek držet ve svislici pomocí kompenzace zápěstí, odchylka výchozí ≤3°, tvrdý limit 5°. Hlava do 1°, trup do 0.6°, pelvis bez dodatečného posunu. Maximálně jedna taková akce za promluvu. Nesmí se kombinovat s drink, dvěma rukama na kelímku, předáváním nebo odkládáním. Je to vizuální omezení proti „mávání kávou“, nikoli simulace tekutiny.

**G07 `yield`: konec promluvy/předání slova.** `T=0.65 [0.45,0.95] s`, jednou na konec, CD 0. Významové gesto končí dříve; posledních 0.35–0.65 s promluvy začít stahovat ruku do READY/REST nebo CUP. Hlava návrat k neutrálu, trup uvolnit o 0.5–1°. Událost `turnEnd` je nezávislá na dokončení návratu ruky. Pokud je ruka vysoko, návrat trvá déle a pokračuje při partnerově řeči; nevynucovat skok. Příští mluvčí již připravuje vlastní pohyb, ale nedělá velký úder před převzetím slova.

### A.5 Posluchač a klid

**L01 `nod`: potvrzení naslouchání, nikoli nutně souhlasu.** `T=0.7 [0.5,1.0] s`, CD 4–7 (jednou vylosovaný na provedení). Na hranici fráze partnera `p=0.30*responsiveness`, omezit 0.15–0.50; vybraný adresát má tuto možnost, ostatní posluchači ve skupině mají p násobené 0.35. Reakce po 0.12–0.35 s. HeadRoll klíče `(0,0),(.18,−0.3a),(.45,a),(.72,−0.15a),(1,0)`, `a=nodSign*Tri(2,3.5,5)°`. Trup sleduje jen 0.3–0.6° o 2 tickové kroky později. S p=0.20 dva slabší pulzy s celkovou délkou 0.95–1.3 s. Ruce ponechat klidné. Ne při kontaktu kelímku s ústy, adjustCap, ani během smíchu. Z dálky stačí jeden dobře čitelný pulz; nulová mimika zůstává přiznaným omezením.

**L02 `attentiveTilt`: krátké zaujetí.** `T=2.4 [1.6,3.5] s`, CD 10. Nabídnout na zajímavou frázi s p=0.15. Hlava 0→±3° během 0.5 s, držet 0.7–1.4 s, vrátit 0.5–0.9 s. Znaménko držet konzistentně jako náklon k partnerovi podle pohledu, nestřídat ze strany na stranu. Trup do 0.5°, zápěstí bez změny. Exkluzivní s L01, smíchem, pitím a úpravou čepice.

**L03 `attentionAway`: krátká změna pozornosti.** `T=1.8 [1.0,3.0] s`, CD 12. Příležitost po ukázání na objekt nebo z nečinnosti s čekáním podle C.5 (výchozí 3/min). Interní `attentionTarget` se změní; pokud jiný cíl leží v témže výtvarném sektoru, nedělat falešné otáčení očí. Lze přidat pouze 1–2° náklon. Pro rozdíl světového headingu >30° požádat o natočení s kroky, jinak zůstat u symbolického náznaku. Posluchač se vrátí nejpozději před plánovaným převzetím slova. Nespouštět během oslovení/pozdravu/handshake; cílový partner zůstává sociálním partnerem i během odhlédnutí.

**L04 `weightShift`: pohodlnější stoj bez kroku.** `T=2.8 [2.0,4.0] s`, CD 8; čekací četnost 3/min, v aktivním rozhovoru 2/min. Zvolit bod pánve mezi oporami, typicky laterální posun 0.8–1.8 j. a pokles 0–0.3 j. 0–0.15 příprava, 0.15–0.65 plynulý přenos, 0.65–1 ustálení; nová poloha se stává základní, nemusí se hned vrátit. Poměr zatížení orientačně 45:55 až 30:70, bez modelu sil pouze značka pro plánovač. IK nohou obnoví kotvy; projekce těžiště zůstává v bezpečné oblasti mezi podešvemi. Trup protináklon do 0.8°, hlava kompenzuje do 0.5°. Během handshake a pití přesný kontakt dočasně snížit amplitudu na 0. Při chůzi tento klip nepoužívat.

**L05 `idle`: dech a neperiodická drobná aktivita.** Základní vrstva bez blokujícího CD. Dech `f=0.18–0.28 Hz`, výchozí 0.22 Hz; rigidní trup rotace ±0.15–0.30°, hlava kompenzace 50 %, neškálovat texturu hrudníku. Volitelná translace trupu do ±0.12 j. pouze pokud pod kabátem nevzniká mezera; jinak 0. Pánev nedýchá vertikálně jako při chůzi. Drobné odchylky hlavy ≤0.6° mají cíle po 3–7 s a plynulý přechod 1–2 s, nevzniká tím pseudopohled. Každý jedinec jiná fáze, frekvence a omezená změna amplitudy v čase. Při vyšší hlavové akci maska idle klesá na 0. Výchozí ruce REST nebo CUP, případně platná kapsová póza; žádné stálé mávání.

### A.6 Střídání, smích, pozdravy a odchod

**S01 `sharedAmusement`: lehké společné pobavení bez mimiky.** `T=2.2 [1.5,3.2] s`, CD 35 pro skupinu i jednotlivce. Na konci označené odlehčené promluvy p=0.06, pouze přátelé; nevynucovat v každém rozhovoru. Mluvčí začne, ostatní s pravděpodobností 0.75 a zpožděním 0.15–0.40 s. 0–0.20 uvolnění, 0.20–0.65 2–3 malé pulzy trupu, 0.65–1 uklidnění. Trup rotace 1–2°, hlava ve stejné obálce do 2.5° s menší a opožděnou amplitudou; paže nízko, CUP stabilní. Pulzy nemají přesně stejnou fázi mezi lidmi, frekvence 1.5–2.3 Hz. Žádný zdvih celé pánve/skákání, žádné nezávislé třesení čepice. Během společné akce není držitel řečového slova; poté další replika. Držitel kelímku může reagovat pouze hlavou/trupem sníženě; při samotném sip raději účast odmítne. Bez mimiky to má působit jako pobavení, nikoli garantovaně jako hlasitý smích.

**H01 `waveFar`: rozpoznání známého na dálku.** Vzdálenost středů 2.5–5 m, viditelná cesta k partnerovi, p=0.65 jednou na setkání, CD 45 na dvojici. `T=2.1 [1.6,2.8] s`. 0–0.30 příprava přes READY do WAVE; 0.30–0.70 2 kývnutí předloktím/zápěstím, cílový x ±2.5 j., y ±0.7 j.; 0.70–1 návrat. Hlava do 2°, trup do 1°, bez posunu pánve. Rameno nehybně neuzamykat, ale bez pohupování celého těla. Jen volná ruka; s oběma blokovanými nahradit H02. Lze při pomalé přímé chůzi ≤0.8 m/s, bez přepisování nohou.

**H02 `greetNod`: blízký pozdrav / kývnutí cizímu.** `T=0.85 [0.65,1.2] s`, CD 20 na dvojici. Použít L01 s amplitudou 4–6°, jedním pulzem; ruce zůstanou. Dva známí jej použijí jako výchozí blízký pozdrav po dosažení slotů, cizí jen při konkrétní interakci (přednost ve frontě, obsluha), nikoli na každého kolemjdoucího. Předklonový náznak trupu maximálně 1.2°. Reakce druhého 0.15–0.45 s po prvním. Bez zbytečného synchronního pohybu všech.

**H03 `handshake`: volitelný koordinovaný kontakt.** Pravděpodobnost 0.15 na setkání přátel, pouze oba připraveni, dostupné kompatibilní pravé anatomické ruce, žádná překážka/stůl mezi nimi. `T=3.4 [2.8,4.2] s`, CD 90 na dvojici. Fáze: 0–0.18 orientace a nabídnutí; 0.18–0.35 přiblížení obou zápěstí ke společnému bodu; 0.35 `grip`; 0.35–0.70 kontakt 1.0–1.5 s, 2–3 tlumené vertikální pohyby; 0.70 `release`; 0.70–1 návrat. Pohyb společného bodu ±0.8–1.4 j. ve výšce, frekvence 1.7–2.2 Hz s nulovou obálkou na začátku/konci. Hlava do 2°, trup do 1°, pánev fixní. Kontakt nikoli dvě nezávislé křivky! C.6 řeší dosažitelnost a synchronizaci. Pokud příprava neuspěje, oba přejdou na H02; nenechat jednu ruku viset neomezeně. [S8] podporuje fázování; zdejší čísla nejsou kopie univerzálního handshake.

**H04 `hug`: v první verzi vypnuto.** `enabled=false`, p=0. Potřebuje přirozené překrytí paží, vhodné kresby a blízký tělesný kontakt, který koliduje s nynějšími tělesnými kruhy. Neobcházet problém vypnutím kolizí ani přilepením dvou trupů. Náhrada: H02 + krátké OPEN obou po sobě, nikoli navíc k H03. Pro budoucí rozšíření samostatná párová choreografie s ověřenými obrysy, ne generické gesto přimíchané k idle.

**H05 `farewell`: ukončení a odchod.** Jednou na ukončení skupiny, CD na setkání. Celkový plán 3.5–6 s, výchozí 4.5 s, plus cesta. 0–0.8 poslední předání slova/nod; 0.8–1.5 READY→malý WAVE u jedné postavy (p=0.50); 1.5–2.5 první natočení a příprava kroku; poté odchod. Reakce partnera zpožděná 0.2–0.5 s. Poslední mávnutí jen jednou, během prvních 1–2 m odchodu s p=0.25, ne obrácení trupu o 180° na místě. Krok zpět 0.10–0.18 m pouze s volnou ověřenou plochou za postavou; jinak boční/otočný krok. Nohy řídí lokomoce, ne interpolace kořene gesta. Odchod od stolku až po skončení sip, zajištění kelímku a uvolnění slotu.

### A.7 Chlad a čekání

`coldDiscomfort c∈[0,1]`, výchozí 0.35, individuální odchylka ±0.15. Globální kandidátní četnost zimní akce `λ=0.3+1.4c za minutu` při stání; cooldown mezi libovolnými dvěma zimními akcemi 20 s. Při chůzi četnost násobit 0.25 a povolit jen bezpečné jednostranné úpravy/krátké schoulení. Při mluvení 0.2, při čekání 1.0. Jsou to vizuální parametry [N], ne simulace teploty těla. Volba dostupných kandidátů: rub 0.24, blow 0.10, step 0.16, pockets 0.20, scarf 0.12, cap 0.08, hunch 0.10. Neplatné kandidáty odstranit; pokud žádný nezbyl, nic neprovádět.

**W01 `rubHands`: tření palčáků.** `T=3.0 [2.3,4.2] s`, CD 50, obě ruce volné. 0–0.25 přiblížit k RUB, od 0.25 do 0.75 střídavý vertikální posun zápěstí ±0.8–1.2 j. při 1.8–2.5 Hz, poté návrat. Povrchy palčáků se dotýkají pomocí socketů, ne středy textur. Hlava do 2° k rukám, trup do 1°, pánev 0. Nenastavovat nesmyslné sálavé teplo ani měnící se barvu rukou. Ne s kelímkem, kapsami, telefonem, handshake.

**W02 `blowHands`: náznak zahřátí dlaní dechem.** `T=3.4 [2.8,4.5] s`, CD 90. 0–0.30 RUB→ruce před ústa dle socketu; 0.30–0.65 držet, jeden až dva malé trupové pulzy do 0.4°; 0.65–1 návrat. Hlava sklonový náznak 2°, bez pohybu úst. Pouze rukavice, jejichž silueta to unese; v palčácích není vidět sevření dlaní, akce je stylizovaná. Volitelný velmi slabý dechový obláček, ne nutná součást. Bez obou volných rukou nepoužít. Ne v řeči, při chůzi nebo na drink.

**W03 `warmStep`: přešlápnutí na místě.** `T=2.1 [1.6,3.0] s`, CD 30. 0–0.25 přenos pánve na podporu o 1–2 j.; 0.25–0.65 druhá noha krátký švih se zdvihem boty 0.015–0.025 m, nový kontakt ve vzdálenosti 0.02–0.05 m od původního; 0.65–1 ustálení. Stojná noha zůstává ukotvená. Trup do 1°, hlava do 1°, ruce aktuální póza. Nejvýše dva takové kroky v jedné akci, s nestejným časováním. S kelímkem amplitudy násobit 0.6. Nikdy současně s přesným dotykem úst/handshake, v obsazené ploše ani s už běžícím krokem lokomoce.

**W04 `pockets`: uložení volných rukou do kapes.** Vstup `T=1.6 [1.2,2.2] s`, držení `Tri(8,15,30) s`, výstup 0.8–1.3 s, CD 30 po výstupu. 0–0.25 příprava, 0.25–0.8 zápěstí do POCKET, 0.8–1 překrytí maskou kapsy. Ve skutečnosti ruka nezmizí: dlaň se ocitne za popředím kabátu/pocket maskou. Bez masky zůstat s rukou u boku kabátu a akci označit `restAtPocket`, nikoli ji schovat skokem opacity. Jedna kapsa možná při kelímku v druhé ruce. Hlava/trup bez dodatečného pohybu, weightShift povolen. Před potřebou ruky nejprve výstup; rukavice nesmí teleportovat z kapsy ke kávě.

**W05 `adjustScarf`: krátká úprava.** `T=2.5 [1.9,3.3] s`, CD 75. G: READY→SCARF v 0.40; dva posuny ruky po látce o 1–1.5 j. do 0.65; 0.72 uvolnit, návrat. Hlava 1–2°, trup do 0.5°, pánev 0. Šálu neohýbat a neprodlužovat; ruce jen vyhlazují/naznačují úpravu. Jedna volná ruka stačí, druhá CUP může zůstat. Ne při vlastním významovém gestu ani napití.

**W06 `adjustCap`: dotyk okraje čepice.** `T=2.7 [2.1,3.6] s`, CD 90. READY→CAP/socket v 0.40, ruční posun 1 j. dolů mezi 0.45–0.60, uvolnění 0.70 a návrat. Hlava se během kontaktu nehýbe nezávisle; ruka sleduje její socket. Čepice zůstává připojená k hlavě, nevytahovat ji nad vlasy. Pokud klip protne obličej nebo není čitelný ze zad, změnit na dotyk zadní části okraje podle view socketu. Jedna volná ruka, žádný současný nod.

**W07 `hunch`: krátké schoulení.** `T=3.2 [2.5,4.5] s`, CD 45. 0–0.25 jemné přitažení volných rukou z REST o 1–2 j. ke kabátu, trup náklon do 1.5°, hlava relativně proti němu o 1°; 0.25–0.65 držet, poté pomalý návrat. Rigidní kabát nedovoluje skutečnou elevaci ramen ani zakulacení zad, proto nepřehánět. S kelímkem ruka drží CUP a kompenzuje pohyb trupu. Bez chvění celého těla každou sekundu.

**Q01 `queuePeek`: sledování postupu fronty.** `T=2.2 [1.6,3.0] s`, CD 15. Jen když fronta stojí >5 s; příležitost 2/min nebo při obsluze předchozího zákazníka s p=0.25. 0–0.3 příprava, 0.3–0.65 laterální pánev 0.8–1.2 j. a trup do 1.5° do dostupné strany, hlava do 2°, poté návrat. Žádné natahování nohou ani posun kořene. Pokud by se obrys dotkl souseda, amplitudu omezit; nespouštět při zrovna postupující frontě. Natočení do jiné strany řeší skutečný přešlap, nikoli yaw hlavy.

**Q02 `checkItem`: telefon nebo peněženka, volitelné.** `T=5 [3.5,8] s`, CD 60, kandidátní četnost 0.25/min při čekání >10 s. Jen s existující rekvizitou a volnou rukou; bez ní akci vůbec nelosovat. 0–0.25 sáhnout k pocket socketu, `takeProp`; 0.25–0.45 cíl (10,−20), 0.45–0.75 držet, hlava 3–4° k předmětu, 0.75–1 vrátit do kapsy a `storeProp`. Jednoduchá tmavá obdélníková malovaná rekvizita stačí; prsty ani psaní na telefonu nesimulovat. Ve druhé ruce s kávou pouze prohlédnutí, žádné dvouruční ovládání. Postup fronty tuto akci přeruší bezpečným uložením, ne odstraněním rekvizity uprostřed vzduchu.

**Q03 `thanks`: poděkování u stánku.** `T=0.9 [0.7,1.3] s`, jednou po úspěšném receive/payment, p=0.85. Jeden L01 s 3–5°, trup 0.7°, ruce zachovají právě přijatý kelímek. Začít 0.15–0.5 s po dokončení transferu. Pokud vlastní řeč právě běží, jde o její ukončení, ne nový nezávislý turn. Nesmí přerušit fyzické převzetí.

### A.8 Pití a kelímek

**D01 `sip`: napití při naslouchání nebo v pauze.** `T=3.2 [2.7,4.3] s`, CD 12, kandidátní četnost 1.5/min u stolku (0.5–2.5/min individuálně); při samotném čekání 0.6/min. Blokovat během vlastního řečového bloku a rezervovaného začátku příštího slova. 0–0.12 příprava a uvolnění případné podpůrné ruky; 0.12–0.38 oblouk kelímku k mouth socketu; 0.38–0.65 držet, událost `sip` v 0.50; 0.65–0.85 návrat; 0.85–1 doznění. Událost se počítá z konkrétní výsledné délky klipu, nikoli napevno v 1.1 s.

Primární omezení je **okraj kelímku na mouth socketu**, ne zápěstí na FACE_NEAR. Pozice ruky vzniká z transformace kelímku a jeho grip socketu. U úst náklon kelímku 12–20°, výchozí 15°, výtvarný limit 25°. Hlava nanejvýš 1–2° jako obrazový náznak, nikoli nutný velký záklon. Pokud v dané malbě nejde okraj přiblížit k ústům bez kolize palčáku s obličejem, snížit náklon nebo upravit socket; netahat celou hlavu za kelímkem. Ze zad skrýt část kontaktu správným pořadím vrstev, ne přesunout kelímek skrz hlavu.

Výchozí základní sip používá jednu ruku. Před sip v dvouručním držení se druhá ruka oddálí o 2–3 j. za 0.2–0.35 s a klesne do nízkého READY; po sip se může vrátit. Proto odpadá zbytečně složitý dvouruční kontakt u úst. Během sip bez nod, laugh, hlavy idle, kapsy dominantní ruky nebo výrazného přenosu váhy. Doba a velikost vypitého obsahu jsou herní stav, např. 1 dávka z 5–8, ne tvrzení o skutečném pití.

**D02 `warmCup`: držení oběma rukama.** Vstup `T=1.2 [0.9,1.7] s`, držení `Tri(5,10,20) s`, výstup 0.5–0.9 s; CD 10, kandidátní četnost 1/min pokud kelímek existuje a druhá ruka je volná. Primární ruka posune kelímek plynule k ose trupu (`cupCenter` podle assetu, orientačně x=0,y=−22); druhá k jeho `supportGrip`. Obě zápěstí se dopočítají ze stejné transformace kelímku. Hlava do 1°, trup bez dalších pohybů. Při mluvení může držení trvat; pouze žádná velká manuální gesta. Ukončit podporu před novým gestem nebo sip. Kelímek nemá dva rodiče a není dvakrát vykreslen.

Podávání, převzetí a vyhazování využijí existující `receive/drop/lidDrop`, ale připojí se ke stejnému systému vlastnictví rukou, rekvizit a kontaktních událostí jako nové akce. Víko má vlastní objekt a socket; když druhá ruka není volná, `lidDrop` se nesmí spustit. Konverzační režisér nepřekryje tyto akce gestem.

## B. Prostorové uspořádání

### B.1 Světová geometrie a kolize

Sociální rozestupy počítat v metrech na stávající rovině země. `P=(X,Z)`, X doprava, Z od kamery. Kamera a perspektiva zůstávají společnou službou scény; tento modul nesmí zavést vlastní konstantu pro hloubku. `heading ψ=atan2(dirZ,dirX)`.

Tvrdý poloměr osoby je 0.23 m [R]: středy se nesmějí přiblížit pod `r_i+r_j=0.46 m` (numerická tolerance 10⁻⁴ m). Osobní poloměr 0.35–0.5 m [R] je měkká preference; součet 0.7–1.0 m není tvrdý zákaz. Ve frontě 0.65 m znamená menší pohodlí, ale pořád 0.19 m mezeru mezi tělesnými kruhy. Neměnit kvůli frontě všechny kolize na výjimku. Vyčnívající ruce a kelímek navíc omezit gestovým prostorem a jednoduchými obálkami, tělesný kruh je nechrání automaticky.

| Situace | Výchozí vzdálenost středů | Rozsah | Orientace / poznámka [N] |
|---|---:|---:|---|
| Dva přátelé stojí | 1.0 m | 0.85–1.2 m | Proti sobě nebo lehce otevřená formace k objektu |
| Dva u stolku | 1.1 m | 0.8–1.2 m pokud se vejde stůl | Skutečná mezera musí respektovat radius stolu + oba body radii + odstup |
| Tři | sousedé 1.04 m | 0.95–1.25 m | Kruh poloměr 0.60 m, směrem ke středu |
| Čtyři | sousedé 1.02 m | 0.95–1.2 m | Kruh poloměr 0.72 m, směrem ke středu |
| Podání ruky | 0.85 m | 0.75–0.95 m | Pouze validovaný dosah paží a volný kontaktní prostor |
| Dvojice při chůzi | 0.75 m | 0.70–0.90 m | Stejný postupový heading, bez otáčení těla na partnera každou repliku |
| Fronta | 0.65 m | dle stávajících slotů | Směr fronty, ne automatická konverzační skupina |

U stolu poloměru `rT`: vzdálenost středu osoby od středu stolu alespoň `rT+0.23+0.05`. Dva protilehlí tedy minimálně `2(rT+0.28)`. Pro `rT=0.30` je minimum 1.16 m; nelze současně vynutit 0.8 m. Povolit větší rozestup nebo menší stůl, ne protnout desku/trup. Obě osoby drží kávu, ruce mohou nad deskou jen v odpovídající výšce a s ověřeným vrstvením.

### B.2 Sloty F-formace

Pro `n=2..4`: `slot_i=C+r*(cos(α+2πi/n), sin(α+2πi/n))`; heading ke středu `ψ_i=atan2(Cz−Piz,Cx−Pix)`. Pro dva `r=0.5`, tři `r=0.60`, čtyři `r=0.72`. Rozteč sousedů je `2r sin(π/n)`. Kolem stolu použít jeho ověřené sloty. Malá osobní odchylka slotu nejvýše 0.04 m se vylosuje jednou, nikdy ne každý frame.

Střední prostor o-space chránit měkkou navigační penalizací pro cizí postavy; členové do něj nemají kráčet při každém gestu. Obvod skupiny je fyzická překážka tvořená lidmi, ne neprůchozí kruh celé skupiny. Příchozí nesmí procházet středem; připojí se z vnější strany. V nouzi bezpečnost davu převáží sociální pohodlí a rozhovor se přeruší.

Příchod: rezervovat novou formaci; pro 2–4 osoby vyzkoušet všechna přiřazení současných osob ke slotům (nejvýše 24), minimalizovat součet délek cest + penalizaci křížení. Příchozí stojí dočasně 0.9–1.2 m od nejbližšího člena, pozdraví; vybrané osoby se jednotlivými krátkými kroky přeskupí. Přeskupení 1.5–4 s, pouze je-li průchozí a bez kontaktové akce. Pokud není místo, odložit vstup nebo přesunout celou skupinu; nevtlačit čtvrtou osobu dovnitř. Odchod: zbývající mohou zůstat 1–3 s v otevřené formaci, potom plynule upravit sloty; nesesouvat okamžitě všechny ke středu.

### B.3 Pouze čtyři výtvarné směry

Výchozí reprezentativní headingy jsou `−135°, −45°, +45°, +135°` v definici X,Z. Záporná Z znamená směrem ke kameře → přední 3/4; kladná Z → zadní 3/4. Kladná X je pohled doprava, záporná X zrcadlený doleva. Výběr minimalizuje úhlovou vzdálenost mezi cílovým headingem a reprezentací.

Celou F-formaci lze otočit o α tak, aby nebyly všechny pohledy na hranici sektorů. Pro dva zvolit osu spojnice zhruba diagonálně ve světě: jeden přední 3/4 a druhý zadní 3/4 přirozeně směřují k sobě. Čtyři diagonální headingy fungují pro čtvercovou formaci. U trojice nebude každé natočení přesné; chyba kresby může být až 45°. Je to omezení assetů, nikoli chyba solveru. Nesnažit se chybu odstranit head roll o 40°.

Hystereze při volbě pohledu 12° za hranicí sektoru; minimální držení assetu 1.0 s. Během kontaktu rukou nebo úst pohled uzamknout. Výměnu provést při krátkém otočném kroku a nízkých rukou, na konzistentních světových oporách a socketech. Krátký crossfade 0.12–0.18 s je volitelný pouze když nezpůsobí dva obličeje/kelímky; jinak jednorázový střih v nejméně nápadné fázi. Neexistující mezilehlý pohled nelze vyrobit rotací bitmapy v rovině.

Natočení světem do 20° lze tolerovat bez nového assetu a bez přetočení chodidel; při větším natočení plánovat 1–3 otočné kroky, jednotlivě do 30–45°. Rotace kořene není povolení smýkat botami. Při gestu na vnější referent se nejdřív ověří, že je v přibližném předním půlprostoru postavy; jinak požádat o změnu postavení.

## C. Řízení, koordinace a vrstvení

### C.1 Rozdělení odpovědností

Implementovat následující moduly; existující lokomoci a kameru připojit rozhraním, nepřepisovat je do sociálních klipů.

| Modul | Vlastní stav | Nesmí dělat |
|---|---|---|
| `SocialDirector` | Skupiny, role, řečové intervaly, témata, společné akce, sloty | Posouvat lokty přímo |
| `BehaviorScheduler` | Kandidáti, cooldowny, ruční prostředky, individuální styl | Losovat při renderování |
| `ClipPlayer` | Trajektorie, fáze, události, přerušení | Přepsat pevný kontakt dalším clipem |
| `ContactSolver` | Planted feet, grip, mouth rim, handshake, dosahy | Dodatečně odtlačovat celé postavy přes nohy |
| `PoseComposer` | Vrstvy, view sockety, IK/FK, výsledná póza | Znovu náhodně vybírat animaci |
| `LocomotionBridge` | Žádosti o slot, krok, otočení, uvolnění místa | Obcházet stávající kolizní solver |
| `Telemetry` | Události, časy, kontaktní chyby, hash | Měnit pořadí simulace nebo RNG |

```ts
type AgentId = number;
type Tick = number;
type Vec2 = { x: number; y: number };
type HandId = 'left' | 'right'; // anatomická identita

type Resource = 'head' | 'torso' | 'pelvis' | 'feet'
  | 'leftHand' | 'rightHand' | 'cup' | 'prop' | 'view';
type Role = 'speaker' | 'listener' | 'preparing' | 'unavailable';
type GroupPhase = 'approach' | 'orient' | 'greet' | 'settle'
  | 'dialogue' | 'sharedAction' | 'reform' | 'closing' | 'depart' | 'aborted';

interface SocialTraits {
  gestureRate: number;      // 0.65..1.30
  gestureAmplitude: number; // 0.80..1.15
  responsiveness: number;   // 0.70..1.30
  tempo: number;            // 0.85..1.15, větší = kratší klipy
  turnWeight: number;       // 0.70..1.30
  coldDiscomfort: number;   // 0..1
  preferredDistanceM: number;
  dominantHand: HandId;
}
interface TurnPlan {
  id: number;
  speaker: AgentId;
  addressee: AgentId;
  start: Tick;
  end: Tick;
  phraseEnds: Tick[];
  accents: Tick[];
  topic: 'tree' | 'stall' | 'coffee' | 'neutral' | 'amusement';
  referentId?: number;
}
interface ClipPlan {
  id: number;
  family: string;
  start: Tick;
  duration: Tick;
  priority: number;
  locks: Resource[];
  parameters: Record<string, number>;
  markers: { tick: Tick; name: string }[];
  safeExitTicks: Tick[];
  syncActionId?: number;
}
interface Conversation {
  id: number;
  members: AgentId[]; // vzestupně pro determinismus
  phase: GroupPhase;
  turns: TurnPlan[]; // současný a rezervovaný následující
  phaseDeadline: Tick;
  reservedSlots: Map<AgentId, Vec2>;
  lastSpeaker: AgentId | null;
  lastSharedActionEnd: Tick;
  rngTurns: { state: number };
}
```

Nastavení a persistentní snapshot musí obsahovat stav prostředků, kontakty, číslo ticku, naplánované události, čítače RNG streamů a cooldowny. Samotný seed nestačí pro pokračování uprostřed napití.

### C.2 Stavový automat skupiny

| Stav | Vstup / činnost | Přechod a timeout |
|---|---|---|
| approach | Zarezervovat kompatibilní setkání a sloty, možnost H01 | Po dosažení slotů → orient; po 12 s neúspěšného přiblížení zrušit/nově naplánovat |
| orient | Lokomoce zastaví a natočí postavy; potvrzení `facingReady` | Oba/všichni připraveni → greet; po 3 s na volné ploše fallback nod, případně zrušení |
| greet | Jedna společná handshake/nod událost; nejdřív připravenost | Po dokončení → settle; handshake deadline 2 s pro přípravu kontaktu |
| settle | Dokončit návraty rukou, 0.4–0.9 s oddech | → dialogue |
| dialogue | Řečové plány, backchannels, sip u dostupných posluchačů | Nový člen/sloty → reform; společný smích → sharedAction; cíl splněn → closing |
| sharedAction | Smích nebo jiná předem připravená skupinová akce | Po posledním návratu + 0.2–0.5 s → dialogue |
| reform | Přesun slotů, ne nové velké gesto; stávající promluva může doběhnout | Po dosažení → dialogue; po 6 s vrátit starou platnou formaci/odmítnout příchozího |
| closing | Dokončit větu, ukončit sip, pozdrav na rozloučenou | → depart; nepřerušit kontakt skokem |
| depart | Uvolňovat sloty až jak skutečně odcházejí; poslední mávnutí | Rozpustit skupinu po odchodu, nebo vytvořit novou walking-pair interakci |
| aborted | Bezpečně dokončit/uvolnit kontakt, zrušit budoucí akce | Návrat do nečinnosti/lokomoce |

Skupina u stánku se stejným seřazením není automaticky rozhovor cizích osob. Obsluha je samostatná krátká dyáda zákazník–prodavač, která dostane přednost před rozhovorem přátel. `queueAdvanced` blokuje spuštění nové zimní akce a vyžádá bezpečný konec současné.

Ve dvojici při chůzi lze udržet konverzační role, ale povolit pouze G01 se 60 % amplitudy, G06, L01 se 70 % amplitudy a krátké volné G02, pokud nehrozí kolize ruky. Handshake, dvouruční gesta, warmStep a sip při chůzi ve výchozím profilu zakázat. Nohy zůstávají plně v lokomoci. Tělo se kvůli každé odpovědi neotáčí proti směru chůze.

### C.3 Plán řeči bez hlasového zvuku

Tento model generuje **vizuální promluvy**, nikoli lingvisticky věrnou řeč. Obsah není slyšet; simulované akcenty nejsou odvozeny z přehrávané vánoční hudby. Nesynchronizovat celé náměstí s rytmem písně.

Výchozí délka promluvy [N]:

`Tturn ~ truncatedLogNormal(mu=ln(3.8), sigma=0.45, min=1.2, max=9.0) s`.

Jde o odmítnutí vzorků mimo interval, nikoli clamp (clamp by vytvořil hromady přesně na min/max). Medián neomezeného rozdělení je 3.8 s; po ořezu se mírně změní. Tento delší vizuální blok může zahrnovat více krátkých frází a nesmí být vydáván za empirickou průměrnou délku tahu ze [S2]. `tempo` rozdělení dělí, pak se výsledek omezí do povoleného intervalu opět výběrem, ne periodickým střídáním krátké/dlouhé věty.

Uvnitř bloku rozdělit čas na 1–4 fráze délky přibližně 0.9–2.0 s. Poslední fráze může být kratší. Akcent jednou na frázi, poloha mezi 35–70 % fráze. Gesto nemusí vzniknout při každém akcentu. Přípravná část gesta může začít před akcentem; `stroke` leží u akcentu s odchylkou −0.10 až +0.15 s. Pokud časově nevychází dostupná dráha ruky, vynechat gesto nebo použít již připravenou nízkou pózu, ne zpomalit celý rozhovor.

Podepsaný odstup `gap = next.start − current.end`:

| Větev | Pravděpodobnost | Rozdělení v sekundách [N] |
|---|---:|---|
| Běžná krátká pauza | 0.80 | Tri(0.05, 0.18, 0.40) |
| Delší přemýšlení | 0.15 | Tri(0.35, 0.55, 0.90) |
| Krátké překrytí | 0.05 | −Tri(0.05, 0.12, 0.22) |

To je autorská směs inspirovaná krátkým střídáním, ne fit korpusu. Překryv znamená max. dvě interní řečové aktivity. Reakce L01/L02 nejsou řečí a do překryvu se nepočítají. Událost `turnEnd` stále uzavře původní tah; starý mluvčí nedostane druhé navazující velké gesto.

Prvního mluvčího vybrat při setkání: iniciátor pozdravu s p=0.65, jinak váženě ostatní. Dalšího vybírat z dostupných členů kromě současného, váha `turnWeight*(1 + min(2, waitingTurns*0.25))`; po 5 přeskočených příležitostech dostupnému účastníkovi dát přednost, při shodě delší čekání a poté seed. Dva dostupní se střídají; při busy druhém (napití) současný může pokračovat kratším novým blokem 1.2–3 s nebo skupina přejde do záměrné pauzy. U 3–4 lidí aktuální adresát má váhu ×1.7. Jednou za 2–4 fráze lze pozornost rozšířit na jiného posluchače; žádné točení assetu každých 200 ms.

**Rezervace dalšího tahu vzniká nejméně 0.8 s před koncem aktuálního.** V případě velmi krátké promluvy vznikne ihned po jejím vytvoření. Nedostupným je člen, jehož sip/handshake/contact je v konfliktu s přípravou a startem. Nové sip lze povolit pouze pokud nezabere již rezervovaný začátek slova. Při neschopnosti odpovědět není nutné všechny pauzy nacpat do 0.2 s: dlouhá sociální pauza je samostatný stav s důvodem `cupBusy`, `watchingTree`, `reforming`, nikoli chyba vzorkovače krátkých gapů.

### C.4 Pseudokód: pevný čas a řečové události

```ts
const DT = 1 / 60;
const toTicks = (seconds: number) => Math.max(1, Math.round(seconds * 60));

function fixedTick(sim: Simulation) {
  const tick = sim.tick;
  // Všechny smyčky mají stabilní pořadí podle ID.
  applyInputsForTick(tick);
  deliverEventsSortedByTickPriorityId(tick);
  for (const group of groupsById()) updateGroup(group, tick);
  for (const agent of agentsById()) scheduleEligibleActions(agent, tick);
  resolveReservationsAtomically(tick); // celé párové akce, nikoli po jedné ruce
  updateNavigationAndCollisionSolver(DT);
  for (const agent of agentsById()) {
    const intents = evaluateClipsAtTick(agent, tick);
    const pose = composeBaseAndIntents(agent, intents);
    solvePlantedFeetAndSupport(agent, pose);
    solveHandsAndProps(agent, pose);
    validateAndCommitPose(agent, pose);
  }
  solveAndValidateSharedContacts(); // společné cíle, bez dodatečného posunu kořene
  emitTelemetryAndHash(tick);
  sim.tick++;
}

function reserveNextTurn(g: Conversation, now: Tick) {
  const current = currentTurn(g);
  if (alreadyReserved(current.id)) return;
  const gap = sampleGap(g.rngTurns); // podepsaný počet ticků
  const start = current.end + gap;
  const eligible = g.members.filter(id => id !== current.speaker
    && canOwnFloorAndPrepare(id, start - toTicks(.45), start));
  if (!eligible.length) {
    scheduleContinuationOrSocialPause(g, current.end);
    return;
  }
  const next = weightedFairChoice(eligible, g);
  const plan = makeTurnPlan(next, start, g);
  reserveFloorAndPreparation(plan);
  g.turns.push(plan);
  // Události se vkládají dopředu, včetně záporného gapu.
  enqueue(plan.start, 'turnStart', plan.id);
  enqueue(plan.end, 'turnEnd', plan.id);
  plan.phraseEnds.forEach(t => enqueue(t, 'listenerOpportunity', plan.id));
  scheduleCompatibleGestures(plan);
}

function onTurnStart(turn: TurnPlan) {
  activeSpeechIntervals.add(turn.id); // role odvozená z intervalů, ne jeden boolean
  setRole(turn.speaker, 'speaker');
}
function onTurnEnd(turn: TurnPlan) {
  activeSpeechIntervals.delete(turn.id);
  if (!hasOtherActiveSpeech(turn.speaker)) setRole(turn.speaker, 'listener');
  startYieldIfNeeded(turn.speaker); // pokud nezačal již před koncem
}
```

`reserveNextTurn` se nevolá až při konci: při každém ticku zkontrolovat `now >= end−48` a existenci rezervace. Termín s negativním gapem tak nezůstane v minulosti. Když se změní členství před startem, zrušit související eventy přes jejich ID a přeplánovat od aktuálního ticku. Po startu zásah pouze přes kontrolovaný konec, nikdy zpětně neměnit historii.

Řešič společných kontaktů musí používat cíle připravené **před** individuálními IK; poslední volání v pseudokódu kontroluje výsledek a případně znovu řeší ruce vůči stejnému cíli. Neprůchodný kontakt se nesmí „opravit“ posledním posunem trupu po solvePlantedFeet.

### C.5 Deterministické losování a cooldowny

Použít vlastní verzi PRNG s explicitním stavem nebo counter-based generátor. Zakázat `Math.random()`, `Date.now()`, wall-clock pro chování a RNG v renderu. Streamy oddělit podle `(sceneSeed, entityId, subsystemId)`; rozhovor má vlastní stream tahů a společných akcí. Změna počtu stop ve sněhu nesmí změnit, kdo začne mluvit. Při všech shodách pořadí rozhoduje stabilní ID.

Možná jednoduchá přesně specifikovaná varianta pro nenáročnou simulaci je Mulberry32; stav se ukládá jako uint32:

```ts
function nextU01(rng: { state: number }): number {
  rng.state = (rng.state + 0x6D2B79F5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  // Otevřený interval (0,1): bezpečné pro log.
  return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
}
function tri(a: number, m: number, b: number, u: number) {
  const split = (m-a)/(b-a);
  return u < split
    ? a + Math.sqrt(u*(b-a)*(m-a))
    : b - Math.sqrt((1-u)*(b-a)*(b-m));
}
function exponentialWaitTicks(ratePerMinute: number, u: number): Tick {
  if (ratePerMinute <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.ceil(-Math.log(u) * 3600 / ratePerMinute));
}
```

Seed streamu vytvořit např. FNV-1a nad UTF-8 `sceneSeed/entityId/subsystemId`, s `Math.imul(hash ^ byte, 16777619) >>> 0`, počátek 2166136261. Oddělovače a kódování verzovat. Pro normální variátu v lognormálu použít Box–Muller `z=sqrt(−2 ln u1)*cos(2πu2)` a odmítání mimo interval; odmítnutí spotřebuje další dvojici. Stejný runtime a stejná verze dat dávají stejnou sekvenci. Pro bitovou shodu napříč různými JS enginy navíc deterministické aproximace transcendentních funkcí nebo předem serializované plány; nativní `sin/log` nejsou automaticky záruka bitové shody všude.

Poissonovy čekací hodiny běží jen v součtu **způsobilých ticků** (např. stojí, má volnou ruku). Když akce není způsobilá, pozastavit hodiny; nesbírat desítky odložených gest. Po provedení počkat CD, poté nový exponenciální interval. Reálná četnost je proto menší než kandidátní λ; λ není slib počtu akcí za každou minutu. Pro příležitosti řeči platí Bernoulli pokus na konkrétní `opportunityId`, zpracovat nejvýše jednou.

Antirepetice:

- U **výrazných manuálních** gest zakázat stejnou rodinu jako poslední výrazné gesto po dobu 8 s od jejího konce, kromě druhého úderu uvnitř jednoho beat klipu.
- CD konkrétní akce platí navíc; využít maximum obou blokací.
- Na 60 s max. 2 zimní akce stejné rodiny, nejvýše 3 výrazné zimní akce celkem. Kapsová póza a warmCup nejsou při držení každou vteřinu nová akce.
- Nod, yield, sip a nutné `receive/drop` mají vlastní pravidla a nejsou blokovány obecným zákazem „stejného gesta“.
- Parametry jedince vylosovat při vytvoření; klip délku, amplitudu a drobnou stranovou variaci při spuštění. Ne každý klip nutně opačnou rukou. Volba dominantní ruky má p=0.75, pokud je volná a vhodná vzhledem k cíli.
- Globální rozpočet: speaker maximálně 55 % svého řečového času v aktivním manuálním gestu; listener maximálně 20 % doby naslouchání v aktivním gestu mimo dlouhé držení kelímku/kapsy. Kontrolovat klouzavé okno 30 s, při nedostatku historie pouze základní cooldowny. Předvídatelný závěr klipu nerušit kvůli rozpočtu; odmítat nový kandidát podle plánovaného pokrytí.

### C.6 Synchronizace handshake, pozdravu a smíchu

Společná akce je objekt s jedním časem, nikoli dvojice volných `playClip()` volání. Má participant IDs, role, rezervované prostředky, `ready`, deadline a společné marker ID.

```ts
function tryStartHandshake(a: Agent, b: Agent, tick: Tick): boolean {
  if (!bothFacingReady(a,b) || !bothStopped(a,b)) return false;
  if (!rightHandsFree(a,b) || obstacleBetween(a,b)) return false;
  const geometry = findSharedHandContact(a,b);
  if (!geometry.feasible) return false; // případně nejdřív domluvit krok
  const id = allocateStableActionId();
  const plans = preflightPairedHandshake(a,b,geometry,id);
  if (!plans.withinLimits) return false;
  reserveAtomically([a,b], ['rightHand','view'], id);
  // Od tohoto okamžiku kontaktní trajektorii vlastní pouze pair coordinator.
  publishSharedTimeline(id, plans, tick + 1);
  return true;
}
```

Společný kontaktní bod zvolit poblíž středu mezi rameny, ve výšce přibližně 0.95–1.10 m nad zemí [N]. Přesnější hodnota závisí na nakreslené ruce. Každý palčák má `shakeContact` na povrchu. `W_i = inverse(M_i) * (contactScreen − rotatedContactOffset_i)` určí zápěstí; `M_i` obsahuje místní měřítko/pohled. Ověřit IK prstenec obou paží a průchod jejich obálek. Výpočet v obrazovém prostoru s převodem přes obě místní matice je nutný, protože dvě osoby mohou mít různou hloubku a měřítko.

Pro hledání postačí deterministická mřížka kandidátů: 5 výšek 0.95–1.10 m a 5 poloh v úsečce mezi kontaktními oblastmi ramen. Vybrat nejnižší součet odchylek od pohodlných loktů 60–110° + penalizace obrysových kolizí. Není-li bod, krok do handshake slotu, nové ověření, jinak nod. Hmatový kontakt je povrch–povrch, zápěstí se nemusí shodovat. Perspektivní projekce společného světového bodu musí být totožná pro obě ruce.

Při `grip` se obě ruce připojí ve **stejném ticku** ke společné křivce kontaktu. Po `release` obě pokračují z dosažené pozice/rychlosti. Trup a pánev během kontaktní fáze držet téměř stabilní, nechat ruce řešit drobné pohyby. Žádné přepnutí pohledu nebo zrcadlení za kontaktu. Těla nepřibližovat pod tvrdou mez; neřešit handshake dotykem trupů.

Pozdrav nod/wave nepotřebuje shodný start: plánuje jeden režisér se záměrným reakčním zpožděním. Smích sdílí sociální událost a obálku, ale jednotlivé pulzy mají odlišnou fázi a amplitudu. Společná akce může být zamítnuta nedostupným členem; nespouštět smích automaticky tomu, kdo právě pije.

### C.7 Priorita a kompatibilita vrstev

Priority jsou číselné, ale samotná vyšší priorita neznamená okamžité přervání kontaktu. Rezervované kontakty jsou nepřerušitelné do bezpečného markeru, kromě nouzové obsluhy, která musí mít vlastní bezpečný výstup.

| Priorita | Vrstva/akce | Vlastnictví |
|---:|---|---|
| 100 | Kolizní bezpečnost, pevné opory, integrita rekvizit | Tvrdá omezení, platí všude |
| 90 | Převzetí, koš/víko, aktivní handshake | Potřebné ruce a objekty; kontakty |
| 80 | Drink/sip | Ruka+cup+head+view; druhá jen při přechodu z warmCup |
| 70 | Pozdrav, loučení, plánovaný směrový krok | Příslušné ruce, případně locomotion |
| 60 | Smysluplné gesto mluvčího | Vybraná ruka/trup/head maska dle klipu |
| 50 | Backchannel, listener tilt | Hlava, malá složka trupu |
| 40 | Chlad, fronta, item check | Dle aktivity, některé dlouhé držení |
| 20 | Přenášení váhy | Pánev/nohy přes opory |
| 10 | Dech a jemný idle | Pouze dosud volné/additivní kanály |

Každý klip deklaruje `exclusive` a `additive` masky. Příklad: G01 vlastní A wrist, max. 0.8° trupu může být aditivní s idle, ale výsledný trup se omezí na rozpočet. D01 vlastní hlavu a cup ruku; L01 je odložen/zahozen, ne sečten. Podpůrná ruka D02 sleduje cup socket a nedostane G01. H01 při chůzi nemění nohy. Q01 a L04 nesčítat, protože oba navrhují polohu pánve.

Výsledná vrstva na kloubu není prostý součet všech rotací. Pořadí:

1. Základní stoj/chůze a platné opory.
2. Schválený posun pánve, rotace trupu; re-solve nohou na původní kontakty.
3. Póza hlavy s prioritami, transformace mouth/cap socketů.
4. Primární ruce/rekvizity: pro sip nejprve cup od mouth, poté wrist z grip; pro hold cup od primární ruky; pro handshake od společného bodu.
5. Sekundární ruce: supportGrip, touchScarf atd.
6. Zbývající volné paže a omezený idle. Validace rychlosti, kontaktů, obrysů, vrstev.

Závislosti tvoří DAG. Není dovolena smyčka „hlava podle cup, cup podle ruky, ruka podle hlavy“. Při sip je hlava primární, cup sekundární, wrist terciární. Během běžného držení je primární wrist a cup se připojí na něj. Při přepnutí režimu inicializovat nové omezení přesně ze současné transformace a plánovat spojitý přechod.

### C.8 Kontakty, cup a přechody bez skoků

Kelímek potřebuje `gripPrimary`, `gripSupport`, `rim`, `uprightAngle`, `ownerAgent`, `ownerHand`, stav `held|transferring|discarded|stored`. Počet vlastníků 0 nebo 1, při transferu se vlastnictví změní atomicky na markeru. Podpůrná ruka není další vlastník. Úhel kelímku je vůči obrazové svislici scény, nikoli vůči rotujícímu předloktí. Pro udržení ve svislici kompenzovat rotaci zápěstí; pokud by ji rig neuměl, je nutné přidat rotační pivot palčáku, nikoli otáčet cup nezávisle mimo úchop.

Blend běžných póz 0.20–0.35 s; velká změna ruky 0.4–0.8 s. Toto je náběh vlastnictví/obálky, celá cesta z REST nad hlavu může trvat déle. Změnu kontaktového režimu nepovažovat za obyčejný crossfade dvou póz: udržet grip, měnit trajektorii cíle. Události `sip/grip/release/takeProp/storeProp/drop` se provedou přesně jednou při překročení jejich ticku, včetně přehrání po obnovení snapshotu. Renderové subframové interpolace události nespouštějí.

Pro vyhlazení volného parametru lze použít `xNew=x+(target−x)*(1−exp(−dt/τ))`, `τ=0.08–0.16 s`, ale **nepoužít post-IK filtr na lokty/zápěstí v kontaktu**. Ten by odtrhl ruku/kelímek. Kontaktní pohyb vyhlazovat ve vstupním cíli; při nedosažitelnosti opravit plán/postoj před startem.

Minimum času pro čistý quintic přechod úhlu Δ je `T >= 1.875*abs(Δ)/omegaMax`, protože maximum derivace S je 1.875. Pro skutečnou IK trajektorii hodnotit všechny klouby po 1/120 s ještě při preflight; časy prodlužovat deterministicky, dokud splní limity, maximálně na 1.6× nominální délku. Pokud to nestačí, zmenšit gesto nebo jej zamítnout. Marker akcentu řeči zůstává pevný: prodlužuje se předpříprava a doznění, případně gesto odpadne. U společných akcí přepočítat společnou časovou osu před potvrzením oběma. Nekorigovat špatný klip náhodným zpomalením jen jedné ruky během kontaktu.

### C.9 Dostupný prostor a stabilita

Před spuštěním velkého gesta odhadnout obálku paže jako kapsle úseček rameno–loket–zápěstí plus poloměr rukavice. Velikost kapsle odvodit z malovaných dílů, ne jednotnou nulovou čáru. Světové objekty převést do stejného prostoru jako testovaná ruka; rozlišit skutečnou kolizi od pouhého perspektivního překrytí. Pro běžná gesta stačí konzervativní lokální zákaz směrem k velmi blízkému sousedovi. U handshake se dotyk vybraných palčáků povolí, ostatní kolize zůstávají.

Pro váhový posun používat podpůrný polygon bot promítnutý do roviny země, zmenšený o 0.01 m. Orientační těžiště ponechat uvnitř; jde o kinematickou kontrolu, nikoli dynamickou fyziku. Pokud ho plán překročí nebo IK nohou dosáhne limitu, amplitudu snížit; větší změna vyžaduje krok. Bota v opoře nemění světový kontakt. Překlopení páteře nenahrazovat vertikálním posunem celé postavy.

## D. Parametry a měřitelné rozsahy

Všechny hodnoty [N] jsou výchozí konfigurace pro tento projekt. Studie neurčují přesné limity animovaných palčáků. Hodnoty [E] nemají sloužit jako tvrdá omezení každého člověka.

| Parametr | Default | Rozsah / jednotka | Původ / odůvodnění |
|---|---:|---|---|
| Výška / převod | 130 j. = 1.75 m | q=0.01346153846 m/j. | [R] |
| Paže | 24 + 21 | j. | [R] |
| Ramenní pivoty | ±8.7 | j. od středu | [R], není to tělesný poloměr |
| Průměr reakčního offsetu ve studii otázek | +208 | ms | [E S1], nesměšovat s naším průměrem všech pauz |
| Typická krátká mezera v přehledu | řád 100–200 | ms | [E/K S2], závisí na datech |
| Nominální medián vizuální promluvy | 3.8 | s; sigma log 0.45, ořez 1.2–9 | [N], ne kopie řečového korpusu |
| Krátká mezera | 0.18 mod | s; 0.05–0.40 | [N] inspirováno S1/S2 |
| Delší mezera | 0.55 mod | s; 0.35–0.90 | [N] |
| Překryv | 0.12 mod | s; 0.05–0.22, 5 % přechodů | [N], ne 5 % času |
| Předpříprava tahu | 0.8 | s | [N], rezerva pro plánování pohybů |
| Speaker gesto na akcent | 0.45 | p; 0.15–0.65 po individualizaci | [N] |
| Gesto amplituda | 1.0 | násobek; 0.8–1.15 | [N], aplikovat jen na pracovní odchylku, ne délku kostí |
| Nadloktí rychlost | 180 | °/s; tvrdý limit | [N], velké mávnutí prodloužit |
| Předloktí/loket rychlost | 220 | °/s; tvrdý limit | [N] |
| Palčák rychlost | 180 | °/s; tvrdý limit | [N] |
| Hlava rychlost | 70 | °/s; běžně <35 | [N] |
| Trup rychlost | 35 | °/s; běžně <15 | [N] |
| Zrychlení horních končetin | 1600 | °/s² max. | [N], hodnotit změnu rychlosti, spojité přechody |
| Zrychlení hlavy/trupu | 600 / 250 | °/s² max. | [N] |
| Loket flexe | podle IK | 8–145° | [N], vyhnout se singularitám |
| Rameno úhlový rozsah | dle pohledu | max. 150° od směru volně dolů | [N], view-specific užší limit může převážit |
| Palčák vůči předloktí | dle socketu | od kalibrovaného neutrálu ±60° | [N], povolena kompenzace cup pokud fyzicky/kresbou proveditelná |
| Head roll běžný / výjimečný | ±3.5 / ±6 | ° | [N], tvrdý součet vrstev ±8° |
| Trunk roll běžný / maximální | ±1 / ±4 | ° | [N], bez squash/stretch |
| Listener nod na frázi | 0.30 | p; 0.15–0.50 | [N], význam reakcí S3 |
| Reakční prodleva posluchače | 0.23 | s; 0.12–0.35 | [N] |
| Nod cooldown | 5.5 | s; 4–7 | [N] |
| Dech | 0.22 | Hz; 0.18–0.28 | [N], jemná animační frekvence |
| Dech trupu | 0.2 | ° špičková amplituda; 0.15–0.30 | [N], nepřidávat velké poskakování |
| Weight shift | 1.2 | j.; 0.8–1.8, 2–4 s | [N] |
| Head drift | 0.4 | °; ≤0.6 | [N], pomalý hladký signál |
| Cold discomfort | 0.35 | 0–1 | [N]; S9 je pouze podklad pro kontext |
| Zimní kandidáti ve stoji | 0.79 | /min při c=0.35; 0.3–1.7 | [N], ještě redukuje CD a dostupnost |
| Sip kandidáti u stolku | 1.5 | /min; 0.5–2.5 | [N] |
| Sip cooldown | 12 | s; nastavitelně 10–25 | [N] |
| Cup tilt při gestu | ≤3 | °; tvrdý limit 5 | [N], svislice scény |
| Cup tilt při sip | 15 | °; 12–20, maximum 25 | [N], nikoli fluidní záruka nevylití |
| Handshake kontakt | 1.2 | s; 1.0–1.5 v nominálním plánu | [N]; fáze podloženy S8 |
| Pozdrav partner reakce | 0.3 | s; 0.15–0.45 | [N]; pořadí pozornosti podloženo S7 |
| Rychlost otočení při krokování | 60 | °/s; 30–90 | [N], nejsou to otáčky bot po zemi |
| View hystereze | 12 | °, držení ≥1 s | [N] |
| Standardní blend | 0.25 | s; 0.20–0.35 | [N] |
| Rigidní follow-through | 3 | ticků; 2–4 | [N], jen volné kanály |
| Hard body radius | 0.23 | m | [R] |
| Komfortní radius | 0.42 | m; 0.35–0.50 | [R/N]; není přímo parametr naměřený S6 |

### D.1 Individuální profil

Losovat profil jednou ze seedu: `gestureRate~Tri(.65,1,1.3)`, `gestureAmplitude~Tri(.8,1,1.15)`, `responsiveness~Tri(.7,1,1.3)`, `tempo~Tri(.85,1,1.15)`, `turnWeight~Tri(.7,1,1.3)`. Nekorelovat všechno do dvou stereotypních typů „živý“ a „mrtvý“. Slabá korelace gestureRate–amplitude je volitelná, ne povinná. Pravděpodobnost dominantní pravé ruky lze uměle nastavit 0.85 [N]; není to zde citovaný populační odhad.

`preferredDistanceM~Tri(.85,1.0,1.2)` se u přátel použije jako preferovaná **vzdálenost středů**, nikoli radius. Při tvorbě dvojice preferovat maximum obou nebo jejich průměr + 0.03 m, poté ověřit prostor; výchozí maximum brání tomu, aby jeden druhého neustále tlačil k sobě. Skupinové sloty mají přednost před nekonečným drobným opravováním vzdálenosti. Během jednoho rozhovoru se preference nemění každou sekundu.

### D.2 Čitelnost ve výsledném videu

Primární rozsah testů: výška postavy 100, 200 a 350 px. Pro jednotkový pohyb v lokálním rigu přibližně `deltaPx=deltaUnits*heightPx/130` před zohledněním skutečné projekce. Posun zápěstí 3 j. tedy zhruba 2.3 px při výšce 100 px; 0.2 j. nebude výrazně čitelný a nemá se násilně zvětšovat.

Při ≤120 px ponechat jen čitelné beat, point, wave, nod, sip a váhový posun. Scarf/cap lze vynechat nebo snížit četnost, ne zvětšit ruku dvojnásobně. Speaker významový úder má typicky obrazovou dráhu alespoň 2 px, pokud to bezpečný dosah dovoluje. Idle smí být podpixelový; renderer musí udržet subpixelové souřadnice bez zaokrouhlení každého kloubu na celý pixel. Kamera/exportní rozlišení nesmí měnit sociální rozhodnutí — LOD může pouze omezit vykreslované detaily nebo předem zvolený vizuální profil, ne RNG/řečové role.

Pro přirozenost upřednostnit čitelný obrys, asymetrii rukou, pauzu po úderu a pomalejší návrat. Nezvyšovat amplitudu hlavy jen proto, že nejsou ústa. Klíčová je reakce partnera v kontextu, nikoli co největší množství pohybu.

## E. Akceptační kritéria a testovací scénáře

### E.1 Co lze a nelze automaticky dokázat

Automatické testy ověří časování, determinismus, integritu kontaktů a statistiku předepsaného generátoru. Nedokážou samy potvrdit, že pevný malovaný obličej vypadá „zaujatě“. Vizuální kontrola je samostatný test s referenčními záběry. Následující prahy jsou požadavky na budoucí implementaci; nejsou tvrzením, že již byly splněny ve vaší aplikaci.

### E.2 Tvrdé invarianty — každý tick

| ID | Metrika | Požadavek |
|---|---|---|
| I01 | Kontaktní drift stojné boty ve světě | ≤0.001 m od jejího uloženého kontaktu; cílově numerická nula |
| I02 | Drift téhož kontaktu po projekci | <0.25 px při 1920×1080; <0.5 px při 4K, při pevné kameře |
| I03 | Kolize těl | `distance >= r_i+r_j−0.0001 m`, i při pozdravu a přeskupování |
| I04 | Délky kostí | Nemění se; relativní odchylka <10⁻⁵ v prostoru, kde jsou definované rigové délky |
| I05 | Chyba gripu kelímku | <0.35 j. v lokální míře a <0.75 px při 1080p; pro větší scale použít přísnější z těchto limitů |
| I06 | Handshake povrchové sockety | ≤0.005 m projekčního ekvivalentu a ≤0.75 px při 1080p; začátek/ukončení obou ve stejném ticku |
| I07 | Náklon kelímku | `abs(tilt)≤5°` mimo drink/transfer; při sip ≤25°; odchylka nesmí být skryta kompenzačním odtržením gripu |
| I08 | Exkluzivní prostředky | Nejvýše jeden vlastník každého exclusive kanálu; dva vlastníci jen jako jeden společný contact objekt |
| I09 | Vlastnictví rekvizity | Jeden kelímek má nejvýše jednoho vlastníka, `sip/drop` marker přesně jednou |
| I10 | Překryv rolí | Max. dva interní mluvčí; sip nikdy v jeho vlastním aktivním řečovém intervalu |
| I11 | NaN/IK | Žádné NaN, nekonečna, změny loketní větve při běžícím klipu; elbow 8–145° |
| I12 | Joint velocity | Všechny kanály pod limity D; `wrapAngle` před výpočtem rozdílu, ne falešný skok 359°→0° |
| I13 | Joint acceleration | Limity D na simulačních úhlech; žádný jednokrokový skok při předání vrstvy |
| I14 | Asset přepnutí | Žádné přepnutí view při aktivním handshake/sip kontaktu; cup a anatomická ruka zachovány |
| I15 | Support | Váhový posun bez kroku udrží pomocný bod těžiště v zmenšeném podpůrném polygonu |

I04 se netýká pixelové délky, která se může měnit projekcí/pohledem. Podobně I01 měří uložený kontaktní bod podešve, ne střed kotníku nebo špičku během odvalení. Při opravdovém kroku má nová kotva jinou hodnotu; test platí jen pro interval s `contactActive=true`.

Pro úhlovou rychlost používat `omega=wrap(theta[t]−theta[t−1])/dt`, zrychlení `(omega[t]−omega[t−1])/dt`. Testovat i 30fps výstup: při trupu 35°/s může mezi snímky být nanejvýš 1.167° a při hlavě 70°/s 2.333° (plus 10⁻⁴ numerická tolerance). Test nezakazuje malé rychlé ruční beat, ale odhalí přeskočení mezi pózami.

### E.3 Statistické testy řízení rozhovoru

Test generátoru: alespoň 10 000 přechodů bez busy účastníků, fixní profil `tempo=1`. Samostatně integrační test 2, 3 a 4 osob po 20 minutách s více seedy. Všechny níže uvedené rozptylové tolerance platí pro velký soubor; jednotlivý třicetisekundový rozhovor je nemusí splnit.

| ID | Test | Kritérium |
|---|---|---|
| S01 | Směs gapů před zaokrouhlením | 80/15/5 % větve s absolutní tolerancí 2 procentní body každá |
| S02 | Pozitivní krátké gapy | Všechny v 0.05–0.40 s ±1 tick; střední hodnota 0.21 s ±0.015 s |
| S03 | Delší gapy | Všechny v 0.35–0.90 s ±1 tick; střední hodnota 0.60 s ±0.025 s |
| S04 | Překryvy | Délka 0.05–0.22 s ±1 tick; průměr 0.13 s ±0.015 s |
| S05 | Délka promluv | Ořez 1.2–9 s; empirické kvantily versus referenční truncatedLogNormal max. chyba CDF 0.025 při 10 000 vzorcích |
| S06 | Právě jeden mluvčí | 90–98 % analyzovaného dialogue času u referenční dyády bez sip a společných akcí |
| S07 | Dva mluvčí | >0 a <2 % téhož času; 5 % překrytých přechodů není 5 % celé doby |
| S08 | Bez mluvčího | 2–10 % v témže testu; součet všech tří podílů =100 % |
| S09 | Naslouchání | 100 % backchannelů má platnou vazbu na frázi/událost partnera nebo explicitní pozdrav; žádná stálá globální nod sinusovka |
| S10 | Anti-repetition | Žádná stejná výrazná manuální rodina jako poslední do 8 s od konce, vlastní CD rovněž dodrženo |
| S11 | Rovnost příležitostí | Nikdo dostupný není přeskočen >5 po sobě jdoucích možností převzetí; nikoli požadavek přesně stejných délek řeči |
| S12 | Odpověď při nedostupnosti | Nedostupný držitel sip nepřevezme slovo; mezera s důvodem busy není zahrnuta do S02–S04 |
| S13 | Množství pohybu | Rozpočty manuálních gest C.5 dodrženy; posluchač nesmí bez ustání hrát rukama |

`dialogue` v S06–S08 znamená souvislý referenční test od prvního startu do posledního konce, včetně jeho krátkých gapů. Vyjmout náběh/odchod, sharedAction, reform a explicitní dlouhé pauzy. V reálné scéně navíc vždy reportovat **celkový** čas skupiny a podíl vyjmutých stavů; nelze maskovat rozbitý rozhovor tím, že se téměř vše označí jako pauza. V běžné dyádě u stolku má být dialogue alespoň 65 % doby po usazení a před loučením (návrhový cíl, sip může běžet souběžně s cizí řečí).

Nody: testovat Bernoulli pokusy před cooldownem, zda konvergují k nastavenému p; skutečný počet klipů bude nižší. Nelze současně požadovat přesnou frekvenci kývání a blokovat je dlouhým cooldownem. U zimních akcí měřit zvlášť `eligibleSeconds`, počet pokusů, zamítnutí a realizací.

### E.4 Funkční scénáře

1. **Dva přátelé bez kávy, 90 s.** Oba přijdou z různých směrů, vzájemná připravenost do 2 s od zastavení na volné ploše, pozdrav s reakční prodlevou; potom střídání s nody a jedním deiktickým cílem. Žádný náhodný handshake během cizí promluvy.
2. **Dva s kávou u stolku, 180 s.** Přirozené střídání včetně sip posluchače, warmCup, návratu do jedné ruky; nikdo nepije během vlastní řeči. Při plném zaměstnání obou krátká společná pauza, pak obnovení. Žádné gesto levou rukou, když levá právě podpírá cup.
3. **Připojení třetího a čtvrtého.** Příchod ve 20. a 45. sekundě, odchod jednoho v 70. sekundě. Sloty se upraví bez teleportů, cizí osoba projde kolem skupiny bez průchodu jejím středem, členové se neodstrkují ručními gesty.
4. **Handshake matice pohledů.** Všechny kompatibilní kombinace přední/zadní 3/4 a zrcadlení, vzdálenosti 0.75/0.85/0.95 m, alespoň dva perspektivní scale. Validní contact společný; nedosažitelná kombinace má explicitní fallback nod. Žádné nucené zvětšení paže.
5. **Fronta čtyř osob po 0.65 m.** Čekají 30 s, poté postupují po jednom. Rub/pocket/peek nesmí blokovat posun nekonečně ani zasahovat do souseda. Cizí lidé se bez důvodu nedávají do společného smíchu. Receive→thanks→departure respektuje transfer cup.
6. **Přerušení akcí.** Spustit odchod během pocket, přechodu warmCup, návratu sip, přípravy handshake. Ověřit bezpečné dokončení, max. čekání 4.5 s pro běžný sip; nepřerušit kontaktní část skokem. Při delším preflight klipu použít skutečnou rezervovanou délku jako deadline.
7. **Nedostupné assety.** Odebrat všechny nové obrázky, phone/wallet i pocket masku. Základní talk/listen/wave/sip fungují, itemCheck není v kandidátech, pocket má viditelný fallback. Žádné neviditelné předměty v ruce.
8. **Výdrž a determinismus.** 30 postav, 30 simulovaných minut, alespoň 10 seedů, export 30 fps i render preview 60/144 fps. Stejná verze runtime a seed → identický hash simulačního stavu po každém ticku, stejné události a contacts. Pause/resume snapshot uprostřed handshake a sip musí dát totožný výsledek.
9. **Vizuální měřítka.** Tentýž záběr s výškami 100/200/350 px, přední a zadní pohled. Bez zdvojení obličejů, rukou a kelímků při view swap; palčák se při ukázání oddělí od obrysu kabátu. Zvlášť zpomalený záznam kontaktů a normální rychlost pro posouzení přehánění.
10. **Zátěž nemožnou geometrií.** Stůl příliš velký pro 0.8m rozestup, nedosažitelný cup socket, chybné loketní mapování, obsazený odchod. Musí vzniknout diagnostika a bezpečný fallback, nikoli NaN, stretch nebo vypnutí kolizí.

Vizuální kontrolu dělat bez zvuku: hodnotitel má rozpoznat smysl wave/point/sip a rozdíl aktivního mluvčího oproti klidnému posluchači v delším úseku, ne nutně na každém statickém snímku. Pro interní pilot alespoň 5 nezávislých hodnotitelů, náhodné pořadí 12 krátkých záběrů, cíl ≥80 % rozpoznání wave/point/sip. U přesného střídání řeči bez úst hodnotit srozumitelnost celé scény, nevydávat ji za objektivní rekonstrukci hlasu.

### E.5 Kontrola samotného zadání

Při přípravě dokumentu byla numericky ověřena dosažitelnost 15 referenčních poloh zápěstí pro L1=24, L2=21 a limit lokte 8–145°. Jde o klíčové body; neověřuje to skutečné assetové masky ani všechny mezilehlé dráhy. Preflight implementace musí zkontrolovat celou křivku.

Pomocné vzorkování 100 000 přechodů z předepsaných rozdělení, s nezávislým testovacím RNG a bez busy stavů, dalo přibližně 93.81 % času právě jednoho mluvčího, 6.04 % bez mluvčího a 0.15 % dvou mluvčích. Potvrzuje to vzájemný soulad distribucí a prahů S06–S08; není to test budoucího TypeScriptového scheduleru ani empirický údaj o lidech. Bitovou deterministickou shodu, cup kontakty a výsledný vzhled musí ověřit teprve implementace.

### E.6 Výkon a diagnostika

Cíl sociálního plánování + vyhodnocení klipů + ruční IK pro 30 osob: p95 <2 ms na tick na deklarovaném testovacím desktopu, bez renderu a stávající crowd simulace. Je to rozpočet [N], nikoli slib bez benchmarku. Uvést CPU, JS runtime, build, seed a délku testu. Nevytvářet každým tickem stovky objektů; bufferovat klíče, kontakty a telemetry.

Nabídnout debug overlay: ID role, target pozornosti, řečový interval, action/fáze, prostředky rukou, kontaktní body, IK větev, o-space/sloty, obálka paže, důvod zamítnutí klipu. CSV/JSON log událostí: tick, groupId, agentId, actionId, marker, floorOwner(s), cupOwner, maxFootDrift, maxGripError, viewId. Odmítnutá gesta s rozumným důvodem nejsou automaticky chyba; opakované odmítání >30 % kandidátů ve volné referenční scéně už znamená špatné sockety/limity.

## F. Nové malované díly, pořadí implementace a rizika

### F.1 Co připravit ve výtvarných podkladech

| Priorita | Doplněk | Přínos | Bez něj |
|---|---|---|---|
| P0 — metadata, ne nový obrázek | Pivoty a sockety pro všechny 4 pohledy: shoulder/elbow/wrist, grip, mouth, scarf, cap, pocket, shakeContact; masky před/za trupem | Konzistentní dotyk a vrstvení, největší přínos | Ručně kalibrovat existující díly; nepředstírat dosah |
| P0 | Kelímek s definovaným okrajem a úchopem, pokud nynější nemá metadata | Sip bez průchodu ruky obličejem | Použít stávající cup a doplnit sockety |
| P1 | Malá kapsová překryvná maska ze stejného kabátu | Ruka přirozeně zajede za lem kapsy | `restAtPocket`, žádné zmizení palčáku |
| P1 | Palčák držený otevřenou rukou / jiná orientace palce pro přední i zadní 3/4 | Čitelnější open/wave a handshake | Stávající palčák, větší důraz na dráhu a obrys |
| P2 | Úchopový palčák pro cup a kontaktní handshake varianta | Méně dojmu, že cup je přilepený k ploše | Přesné sockety a částečné překrytí stávajícího palčáku |
| P2 | Malovaný telefon/peněženka, přibližně 3–5 × 6–8 j. | Konkrétní důvod čekacího pohybu | Q02 vypnutý; nemávat prázdnou rukou před obličejem |
| P3 | Další směrové hlavy nebo několik celých pohledů | Skutečné změny pozornosti, méně tvrdých přepnutí | Body heading + omezený head roll; žádný falešný yaw |
| P3 | Jedna decentní pobavená/zavřené oči varianta hlavy | Čitelnější smích | Malé trupové pulzy bez tvrzení o mimice |
| Později | Speciální párové paže pro objetí | Pouze pokud má být objetí důležitá akce | H04 vypnutý, přátelský nod/wave |

Ukazováček u palčáku není anatomicky vhodný bez přechodu na jiný typ rukavice. Pro ukazování doporučit spíš protažený směr celého palčáku a jasnou orientaci předloktí. Nový díl musí zachovat měřítko, pivot a obrys překrytí; nesmí měnit anatomickou délku ruky. Při výměně rukavice vybrat okamžik přípravy/překrytí, ne přeblikávat tvar při samotném významovém úderu.

### F.2 Pořadí práce pro Claude

1. **Základ kontaktů a dat.** Zavést anatomické identity rukou, view mapy a sockety, invariantu cupOwner, resource locks, pevný tick a oddělené RNG. Ověřit REST/CUP a malý weightShift ve všech pohledech; ještě žádná náhodná gesta.
2. **Dvě osoby a jeden režisér.** Role, délky promluv, podepsané gapy, rezervace budoucího tahu. Implementovat G01/G07/L01/L05 a debug overlay. Ověřit S01–S08 bez kávy.
3. **Káva a kompatibilita.** D01/D02, přednost drink, navázání receive/drop/lidDrop, zamykání hlavy a cup. Testovat I05/I07/I09/I10; řeč se nesmí rozpadnout, když se posluchač napije.
4. **Čitelné smysluplné gesta.** G02/G03/G04, wave a nod, správné předání pozornosti; cooldowny a pohybové rozpočty. Každý klip validovat na všech výtvarných pohledech.
5. **Formace a přeskupování.** 2–4 sloty, vstup/odchod, stůl a fronta, krátké otočné kroky. Ověřit tvrdé rozestupy a zachování nožních kontaktů.
6. **Zimní atmosféra.** W01/W04/W05/W06/W07, Q01/Q03, warmStep; rozumné pauzy. Teprve pak společné pobavení a méně důležité itemCheck.
7. **Volitelné párové dotyky.** H03 až po stabilních socketech/kolizích. H04 zůstává vypnutý. Jestli handshake v některé kombinaci pohledů nevypadá dobře, explicitně ji nepovolit.
8. **Zátěž a vizuální ladění.** 30 osob, delší export, stejné seedy, referenční velikosti. Ladit konfiguraci, ne opravovat chyby nekontrolovaným přičítáním šumu nebo posuny po IK.

Každý krok má dodat malou reprodukovatelnou scénu a naměřené metriky. Při problému zachovat seed, snapshot a log, aby šlo opravu porovnat na stejném záběru. Neměnit současně gait, kameru i sociální scheduler, pokud to daný problém nevyžaduje.

### F.3 Rizika a co nedělat

- **Bez mimiky nelze vyjádřit každý význam.** Náklon hlavy nemá univerzální význam souhlasu/nejistoty; nepoužívat psychologické nálepky jako automatickou pravdu. Kontext a reakce partnera mají přednost.
- **Trvalé gestikulování působí strojově.** Po každém gestu nemusí přijít jiné. Dlouhé držení kelímku a klidný posluchač jsou plnohodnotné stavy.
- **Synchronizace není unisono.** Lidé mohou reagovat na stejnou událost, ale nemají shodnou dechovou fázi, periodu rukou ani pohyb hlavy.
- **Pevná hlava není 3D koule.** Nenastavovat yaw tím, že se celá bitmapa natočí o 30° v obraze. Nedostatek pohledů přiznat a řešit kompozicí/novým assetem.
- **Sčítání vrstev rozbíjí kontakty.** Nikdy nepřičítat nod na hlavu pod kelímkem, idle na pevný grip ani sway po vyřešení bot.
- **Přehnané rameno nebo předklon v rigidním kabátu vytváří mezery.** Skutečné pokrčení ramen/zakulacení páteře není dostupné bez nových stupňů volnosti; použít decentní náznak.
- **Pauzy není vhodné losovat rovnoměrně 0–5 s.** Krátké přechody a delší společné ticho jsou dva odlišné mechanismy s jinými důvody.
- **Pravděpodobnost na frame mění chování s fps.** Vše rozhodovat na ticku/příležitosti, render musí být bez vedlejších efektů.
- **Kávy si nesmějí konkurovat s rukama.** Držený objekt není dekorace nezávislá na skeletu; jeho vlastník a kontakt mají jednu pravdu.
- **Proxemika není kolizní norma.** .35–.5 m comfort radius nelze tvrdě vynutit ve frontě s .65 m rozestupy; současně nesmí být fronta průchozí překážkou.
- **Vědecké zdroje nepokrývají naše přesné amplitudy.** Neuvádět navržené četnosti, rysy nebo chování v chladu jako naměřené normy. Parametry ladit na obrazovém výsledku a zachovat jejich označení [N].

### F.4 Seznam zdrojů a rozsah jejich využití

Zdroje konzultované 24. 11. 2026. Odkazy směřují na publikaci, autorskou metodiku nebo univerzitně hostovaný originál. Konkrétní parametry implementace jsou od zdrojů odděleny značkami [N].

**[S1]** Stivers, T. et al. (2009). *Universals and cultural variation in turn-taking in conversation*. PNAS 106(26), 10587–10592. DOI: [10.1073/pnas.0903616106](https://doi.org/10.1073/pnas.0903616106), [otevřený článek](https://pmc.ncbi.nlm.nih.gov/articles/PMC2705608/). Použito pro časování otázka–odpověď a kulturní variabilitu, nikoli jako zdroj gestových úhlů.

**[S2]** Levinson, S. C., & Torreira, F. (2015). *Timing in turn-taking and its implications for processing models of language*. Frontiers in Psychology 6:731. [Plný text a DOI](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.00731/full). Použito pro krátké pauzy, překryvy a předvídání konce řeči; výslovně odlišujeme jejich analyzované jednotky od vizuálních bloků aplikace.

**[S3]** Bavelas, J. B., Coates, L., & Johnson, T. (2000). *Listeners as co-narrators*. Journal of Personality and Social Psychology 79(6), 941–952. [DOI 10.1037/0022-3514.79.6.941](https://doi.org/10.1037/0022-3514.79.6.941), [bibliografický záznam s abstraktem](https://pubmed.ncbi.nlm.nih.gov/11138763/). Použito pro aktivní roli posluchače a obecné/specifické reakce; detailní experimentální kinematika nebyla podkladem této specifikace.

**[S4]** McNeill Lab, University of Chicago. *Brief Introduction to Annotation*. [Autorská metodika](https://mcneilllab.uchicago.edu/analyzing-gesture/intro_to_annotation.html). Použito pro fáze gesta a neostré hranice kategorií; beat/deiktické/ikonické jsou funkční označení, ne vzájemně výlučné biologické moduly.

**[S5]** Setti, F., Russell, C., Bassetti, C., & Cristani, M. (2015). *F-Formation Detection: Individuating Free-Standing Conversational Groups in Images*. PLOS ONE 10(5):e0123783. [Plný text](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0123783). Podklad pro o-space, p-space, r-space a orientaci skupiny. Zdejší rozmístění slotů je vlastní generativní návrh, ne převzatý detekční algoritmus.

**[S6]** Sorokowska, A. et al. (2017). *Preferred Interpersonal Distances: A Global Comparison*. Journal of Cross-Cultural Psychology 48(4), 577–592. [DOI 10.1177/0022022117698039](https://journals.sagepub.com/doi/abs/10.1177/0022022117698039). Použito pro variabilitu preferencí a opatrnost při universalizaci; nepřebíráme z něj tělesné kolizní radiusy.

**[S7]** Kingstone, A., Walker, E., Amin, S., & Bischof, W. F. (2024). *Eyes meet, hands greet: The art of timing in social interactions*. Perception 53(4), 287–290. [Plný text](https://journals.sagepub.com/doi/full/10.1177/03010066231223440). Podklad pro pořadí pozornosti a nabídnutí ruky; v našem omezeném rigu pozornost zastupuje postavení a směr těla.

**[S8]** Cabibihan, J.-J., El-Noamany, A., Ahmed, A. M. R. M., & Ang, M. H., Jr. (2022). *Guidelines for Robot-to-Human Handshake From the Movement Nuances in Human-to-Human Handshake*. Frontiers in Robotics and AI 9:758519. [Plný text](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2022.758519/full). Podklad pro rozčlenění lidského handshake na fáze. Nejde o normu pro české přátele v palčácích.

**[S9]** Flouris, A. D., & Cheung, S. S. (2009; online 2008). *Human conscious response to thermal input is adjusted to changes in mean body temperature*. British Journal of Sports Medicine 43(3), 199–203. [Abstrakt](https://pubmed.ncbi.nlm.nih.gov/18216157/), [DOI 10.1136/bjsm.2007.044552](https://doi.org/10.1136/bjsm.2007.044552). Podklad pouze pro behaviorální termoregulaci; experiment s tepelným oděvem neurčuje četnost tření rukou či pití kávy.

**[S10]** Lasseter, J. (1987). *Principles of Traditional Animation Applied to 3D Computer Animation*. SIGGRAPH / Computer Graphics 21(4), 35–44. [Originální článek PDF](https://users.cs.northwestern.edu/~animation/Lasseter_1987.pdf), [DOI 10.1145/37401.37407](https://doi.org/10.1145/37401.37407). Podklad pro obecné animační principy; deformace záměrně nepřenášíme na rigidní díly.

**[S11]** Perlin, K. (2002). *Embodying Emotion*, GDC course notes. [Autorský text NYU](https://mrl.cs.nyu.edu/~perlin/gdc/). Podklad pro procedurální doplnění základního pohybu a rozdíl osobnosti/nálady. Naše konkrétní idle křivky a algoritmus plánování jsou vlastní návrh.
