# Živá pozadí – stav implementace balíčku

Zadání: `docs/zdroje/ziva-pozadi/` (ChatGPT, revize 2, 24. 11. 2026). Ukázka:
`demo/Zivy-trh.zscena` (samostatná kopie assetů, vytváří `npx tsx scripts/generate-radnice-demo.ts
demo/Zivy-trh.zscena --showcase`); běžné demo `demo/Namesti-radnice.zscena` má stejné zóny, ale
vzácné události jsou vzácné a koulovačka je vypnutá (chybí dětské postavy).

Legenda: **hotovo** = logika, vykreslení, testy · **částečně** = funguje s omezením ·
**blokováno** = chybí malované podklady (logika připravená nebo popsaná níže).

## Běžné činnosti (A)

| ID | Činnost | Stav | Poznámka |
|---|---|---|---|
| A01 | Nákup u stánku | hotovo | prohlížení 3–8 s (25 % odejde bez nákupu), objednávka 5–12 s jako rozhovor s prodavačem, balení 2–5 s, předání tašky jednou událostí `take`, poděkování; taška je procedurálně malovaná (barva podle stánku) |
| A02 | Dvojice s nápojem | hotovo | existující káva ve dvou + sociální vrstva (rozhovor, pití mimo vlastní řeč, pára z kelímku) |
| A03 | Rodič a dítě u stromku | částečně | v Liberci chodí 5 dětí s rodiči (stálá dvojice) a s nimi i k činnostem; samostatná scénka „rodič ukazuje dítěti strom“ zatím není |
| A04 | Prohlížení | hotovo | činnost `viewing`: volné místo výhledu, 5–18 s, nejvýš jeden přesun pozornosti, cooldown místa 60–180 s |
| A05 | Setkání známých | hotovo | zamávání na dálku, pozdrav kývnutím, rozhovor, společný odchod (dříve + sociální vrstva) |
| A06 | Fotografie u stromku | hotovo | u výhledu ~35 % lidí vytáhne telefon (skutečná rekvizita), zvedne ho do výšky očí, 7–10 s fotí a uklidí; zezadu je vidět displej, zepředu zadní strana (Liberec, `docs/img/liberec-foceni.png`) |
| A07 | Venčení psa | hotovo | viz Z01 (Liberec) |
| A08 | Zahřívání | částečně | tření palčáků, šála, čepice, schoulení, kelímek oběma rukama; přešlápnutí a ruce v kapsách potřebují podklady |
| A09 | Čekání na doprovod | částečně | čekání u místa setkání, rozhlédnutí po 7–15 s, limit a odchod; telefon při čekání se zatím nepoužívá (je jen u focení) |
| A10 | Práce prodejce | hotovo | `VendorState` v simulaci: obsluha, otočení k regálu, předání, srovnání zboží bez zákazníka (20–60 s) |
| A11 | Odklízení sněhu | hotovo | Liberec: pracovník po 6 pásech (tah 3–6 s, posun 1–2 s) odhrne pruh před pravou lavičkou; odkrývá se malovaná dlažba (plochý decal), sníh jde před lopatou na konkrétní hromadu (roste omezeně); průchod člověka práci pozastaví; při sněžení pruh zapadá, další úklid až když je co odklízet; cooldown 600–1200 s (`docs/img/liberec-odklizeni.png`) |
| A12 | Odchod s nákupem | hotovo | taška visí v ruce (omezený švih), odchází s majitelem portálem a zmizí s ním |

## Vzácnější situace (B)

| ID | Situace | Stav | Poznámka |
|---|---|---|---|
| B01 | Chytání vloček | nezačato | dětská postava už existuje (Liberec); scénka zatím není |
| B02 | Sáňky | hotovo | Liberec: sáně se sedícím dítětem složené z dodaných dílů (`scripts/compose-sled.py`), rodič je skutečná postava, sáně sledují historii jeho dráhy v odstupu provázku 1,25 m; dráha „vlásenkou“ po levém zasněženém poli (uprostřed dole je odhrnutá dlažba), kontrola celé dráhy na sníh a odstup od překážek; sáně a provázek jsou překážka pro chodce; průchod ~22 s, cooldown 300–600 s (`docs/img/liberec-sanky.png`) |
| B03 | Upadlá rukavice | hotovo | průchozí občas nese rezervní palčák (oddělená rekvizita); upadne, po 1–2 s si všimne, zastaví, vrátí se, dřepne a zvedne ji (pick v nejnižším bodě), ~7 s; při abortu zůstane ležet a zvedne ji další kolemjdoucí; cooldown scény 300–600 s (`docs/img/liberec-rukavice.png`) |
| B04 | Koulovačka | hotovo (Liberec) | session, nabrání **v dřepu** (klip `scoop`), uplácání, zamíření, hod, světová balistika, kontrola koridoru, dopad s kousky sněhu, reakce, 4–8 hodů; v Liberci dítě s rodičem na dětském sněhu. Ve starých scénách bez dětí se dál zamítá s důvodem |
| B05 | Stavba sněhuláka | hotovo | dva návštěvníci, válení tří koulí (růst r³ = r0³ + k·d jen pohybem), zvednutí, zdobení (oči, nos, šála, knoflíky), prohlížení; sněhulák zůstává jako runtime objekt s kolizí; zadání počítá i s dítětem – stavějí dospělí |

## Prostředí (E)

| ID | Efekt | Stav |
|---|---|---|
| E01 | Proměnlivé sněžení | hotovo – 0,7–1,15×, přechody 30–90 s, stabilní vločky se plynule zjeví/zmizí |
| E02 | Společný vítr | hotovo – poryvy 8–20 s, obálka 2–5 s; sněžení i pára berou integrál větru (žádné skoky) |
| E03 | Pára ze stánku | hotovo – zdroj v tvaru obrázku (samovar), částice 1,5–3,5 s |
| E04 | Pára z kelímku | hotovo – vzniká u kelímku a zůstává ve světě |
| E05 | Kouř z komínů | hotovo pro ručně umístěné zdroje (editor → Živé prostředí → + Komín); v demu žádný (pozadí nemá označený komín) |
| E06 | Pohyb dekorací | blokováno – vystřižené závěsy s pivotem |
| E07 | Dveře a světlo | hotovo (Liberec) – při průchodu portálem dveří se otevřou (malovaný osvětlený interiér, teplé světlo na schodech) |
| E08 | Okna | hotovo (Liberec) – 8 oken radnice pomalu zhasíná/rozsvěcí (3–10 min, přechod 1 s, každé jinak); ztmaví se jen teplé sklo |
| E09 | Vánoční řetězy | částečně – lucerny stánků a lamp mají mikroblikání ±1,5 %; řetězy v pozadí potřebují masku |
| E10 | Stopy | hotovo (dřívější) |
| E11 | Odlesky na mokrém povrchu | blokováno – maska wet/slush |

## Psi a kočky (Z)

| ID | Stav |
|---|---|
| Z01 Pes s majitelem | hotovo – vodítko 1,2–1,7 m (nikdy delší), očichávání 3–8 s, majitel počká |
| Z02 Pes čeká u stánku | hotovo – když majitel stojí (fronta, nákup, povídání), pes se posadí vedle něj; při pohybu vstane |
| Z03 Pohlazení psa | hotovo – přítel majitele (nebo majitel sám při čekání ve frontě) se skloní/přidřepne, 1–2 tahy ruky; pes přijde na dosah a natočí se; cooldown dvojice 120–240 s |
| Z04 Dva psi se očichají | hotovo – majitelé zastaví, psi se přiblíží v mezích vodítek, 2–5 s; cooldown scény 180–360 s |
| Z05 Pes setřese sníh | hotovo – jen při sněžení, 0,8–1,4 s (trup ~7 Hz, hlava napřed, ocas se zpožděním), pár kousků sněhu; cooldown 120–240 s |
| Z06/Z07 Kočka přejde / pozoruje | hotovo – přijde od okraje, sedí 20–60 s, odejde jiným okrajem; návrat za 180–420 s |
| Z08 Očista a protažení | hotovo – vsedě občas očista (hlava k hrudi, 3–6 s, cooldown 60–150 s), před odchodem někdy protažení |
| Z09 Skok na sokl | hotovo – explicitní sokl (Liberec: sedák lavičky 0,44 m): příprava, let po oblouku, sed 10–30 s, seskok; cooldown místa 180–360 s |
| Z10 Pes a kočka | hotovo (vzácné) – zaregistrují se 1–3 s, majitel pokračuje, kočka pak jde dál; ne při každém přiblížení, cooldown 240–480 s; v 15min běhu dema se nemusí vyskytnout |

Pózy psa a kočky jsou kombinací dodaných dílů (rig: trup, hlava, 4 nohy po dvou článcích, ocas) a
malovaného sedu; setřesení, protažení a skok jsou natočení těchže dílů (`docs/img/liberec-zvirata-pozy.png`,
`docs/img/liberec-kocka-skok.png`).

## Nové ovládání v editoru

* Objekt → **Zapuštění do scény** (viz `docs/ZAPUSTENI_OBJEKTU.md`).
* Scéna → **Živé prostředí**: proměnlivé sněžení, poryvy, pára z kelímků a stánků, zdroje kouře/páry.
* Zóny činností: nové druhy **Prohlížení** (`viewing`, role `view`), **Stavba sněhuláka**
  (`snowman`, parametr `chance`), **Koulovačka** (`snowballFight`, `chance`, `allowAdults`).
  Prostor zóny se kreslí jako polygon; sněhulák stojí v jejím středu (musí být ve sněhu).

## Změny formátu

* Projekt (zpětně kompatibilní, nová pole volitelná – staré scény beze změny):
  `scene.environment`, `asset.shape` (`bodyU0/U1`, `depthM`, `lights`, `steam`),
  `object.integration`, nové druhy zón.
* Simulace (`SIM_STATE_VERSION` 5): `sessions`, `vendors`, `runtimeObjects`, `particles`,
  `director`, `placeCooldowns`, `social`; rekvizity `bag`, `snowball` (let), `snowmanPart`.

## Ověření

`npm test`: 91 testů (Liberec: nákupy, nikdo neuvízne, těla se neprotnou, vodítko, sáně – provázek,
sníh, nikdo jimi neprojde –, focení s telefonem, rukavice, odklízení, Z02/Z03/Z05/Z09, samostatný test
kočky Z07/Z08) a dříve – mj. `sessions` (atomické rezervace, T03/T04), `market` (jedno předání,
taška odchází s majitelem, prodavač, prohlížení, checkpoint), `environment` (vítr, hustota, pool),
`snowman` (fáze, růst, checkpoint uprostřed válení, přerušení), `snowball` (zamítnutí bez dětí,
4–8 hodů, koule nezůstane viset, checkpoint za letu), `social`, `integration`. Vizuálně
zkontrolováno: taška, prodavač, pára, stavba sněhuláka (`docs/img/snehulak-stavba.png`), hod.

## Chybějící podklady (přesná specifikace)

> **Stav 11/2026:** dětská postava, dřep, telefon, rukavice, lopata, dlažba, hromada sněhu, pes, kočka,
> sáňky se sedícím dítětem, dveře a okna radnice byly dodány v balíčku `grafika/ziva-pozadi` a jsou
> použité ve scéně `demo/Liberec-zivy-trh.zscena`. Dál chybí jen masky pro E06 (pohyb dekorací),
> E09 (řetězy v pozadí) a E11 (mokrá místa). Tabulka níže je původní specifikace.

Styl všech: malované jako současná knihovna dílů (`resources/builtin/painted-parts-cg`),
studené okolní světlo, teplé odlesky, měkké kontury, skutečně průhledné PNG, 2× rozlišení
pro 4K. Díly postav ve formátu archu (pohledy front3q a back3q, každý díl zvlášť s přesahem v kloubech).

| Priorita | Podklad | Co přesně | Odemkne |
|---|---|---|---|
| P1 | Dětská postava | arch dílů jako dospělý (hlava, trup, paže, ruce, stehna, lýtka, boty, čepice, šála), proporce dítěte 6–9 let (výška 1,15–1,30 m, větší hlava), front3q + back3q | A03, B01, B04, B05 s dítětem |
| P1 | Póza dřepu | trup s kratším lemem kabátu pro předklon 10–20° a pokrčená kolena (dospělý i dítě) | nabrání sněhu (B04), sbírání (B03) |
| P1 | Telefon | malý tmavý obdélník s odleskem, přední i zadní strana | A06, A09 |
| P2 | Lopata | násada + list, dva úchopy, sníh na listu zvlášť | A11 |
| P2 | Odkrytá dlažba | malovaný pás dlažby a hromada sněhu, maska | A11 |
| P2 | Pes | čtyřnohý rig: trup, hlava s čenichem, uši, ocas, 4 nohy s tlapkami, kotva obojku; front3q + back3q; pózy walk, idle, sniff, sitDown, sitIdle, standUp, shake | Z01–Z05, Z10 |
| P2 | Kočka | trup, hlava, uši, segmentovaný ocas, 4 nohy; walk, idle, sitDown, sitIdle, groom, stretch, crouchJump, flight, land | Z06–Z10 |
| P2 | Sáňky + sedící dítě | rám, sedák, provázek, sedící dětské díly | B02 |
| P2 | Masky pozadí | dveře (křídlo, otvor, opravený podklad), okna, řetězy, mokrá místa | E06–E09, E11 |

### Prompt pro ChatGPT – dětská postava (arch dílů)

```text
Create a production sheet of separate painted body parts for a CHILD character (about 7 years old,
1.2 m tall, slightly larger head relative to body) that matches the attached adult parts sheet exactly
in style: soft painterly brushwork, cool blue-lilac ambient light with gentle warm highlights, muted
winter clothing colours, soft outlines. Two views, each in its own half of the sheet: front three-quarter
(facing right) and back three-quarter (facing right, seen from behind). For each view draw every part
separately with transparent space between them: head (with hair), winter hat with pompom, scarf,
torso in a short winter coat, upper arm, forearm, mitten hand, thigh, shin, boot. Parts must overlap at
the joints (rounded ends) so they can be rotated in 2D. Neutral straight pose, no shadows on the
ground, true transparent background, no text or labels, same lighting direction as the adult sheet.
```

### Prompt pro ChatGPT – pes (díly pro 2D rig)

```text
Create a production sheet of separate painted body parts for a medium-sized friendly dog (e.g. a
beagle-like mixed breed) for a 2D cut-out rig, matching the attached winter town-square painting and
character sheet in style: painterly, soft edges, cool blue-lilac ambient light, small warm highlights.
Two views, each in its own half: three-quarter front (facing right) and three-quarter back (facing
right). Separate parts with transparent space: torso, head with muzzle and collar (collar anchor
visible), left ear, right ear, tail, front upper leg, front lower leg with paw, hind upper leg, hind
lower leg with paw. Rounded overlapping joint ends for rotation. Neutral standing pose, no ground
shadow, no clothes or Christmas hats, true transparent background, no text.
```

(Kočka: stejný prompt, „slender tabby cat“, ocas rozdělený na 3 segmenty, bez obojku.)
