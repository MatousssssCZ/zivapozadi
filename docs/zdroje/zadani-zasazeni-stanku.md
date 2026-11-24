# Zasazení malovaných stánků do zimního náměstí — zadání pro Claude

**Soubor:** `Zadani_zasazeni_stanku_Claude.md`  
**Datum:** 24. 11. 2026  
**Cíl:** Canvas2D, samostatné PNG, prodavač uvnitř, zákazníci venku, deterministické video 30 fps v 1080p/4K. Bez 3D rendereru. Níže použitá světová rovina a výšky jsou pouze metadata pro projekci 2D grafiky a efektů.

Hodnoty efektů jsou **výchozí návrhové parametry**, nikoli měření fyzikálních vlastností scény. Rozlišujeme závěry z přiložených obrazů, výpočty ze zadané kamery a hodnoty určené k výtvarnému doladění. Tento dokument předepisuje novou grafiku a implementaci; neobsahuje vygenerované nové stánky ani změny aplikace.

## Analýza

### Co je vidět v podkladech

| Oblast | Pozorování | Oprava podle dopadu |
|---|---|---|
| Kontakt se zemí | Spodek stánku je dlouhá pravidelná hrana; sníh ji nikde přirozeně nepřekrývá. Také podstavec stolku a lampy nemají výraznou vazbu na sníh. | Úzký kontaktní stín, jemné okolní zastínění, několik nepravidelných překrytí sněhem. Neskrývat celý problém širokou černou elipsou. |
| Prodavač | Postava má jednoduché plochy, zatímco police a zboží mají mnohem více modelace. Působí jako vystřižená postava položená před kulisou. | Správné zadní/přední vrstvy, společná barevnost, okluze z překladu a pultu, teplé světlo na straně lucerny. Lepší kresbu postavy může kompozice podpořit, nikoli plně nahradit. |
| Barva a světlo | Stánek je silně oranžový téměř v celé ploše; náměstí používá modrofialový sníh a teplé akcenty. Světlo stánku zůstává uvnitř jeho PNG a málo zasahuje okolí. | Modravé okolní světlo na vnějších plochách; teplé ostrůvky uvnitř; slabé světlo na sněhu a zákaznících. Zachovat teplý interiér, neobarvit vše stejně modře. |
| Malířský styl | Pozadí má širší viditelné tahy a měkčí modelaci. Stánek místy připomíná detailní digitální ilustraci s výrazným leskem kovu a jemným dřevěným zrnem. | Nový master s menším mikrokontrastem, měkčími odlesky, podobnou velikostí tahů po zmenšení. Malé rozostření je poslední korekce, ne náhrada správného stylu. |
| Perspektiva | Stánek je téměř čelní, s malým množstvím viditelné hloubky. To může uprostřed scény fungovat; u kraje pevně orientované řady by měla být vidět odpovídající boční stěna. | Nejdřív určit světovou orientaci, potom vybrat čelní/levou/pravou variantu. Nevytvářet automaticky silný pohled shora. |
| Měřítko | Ze samotného 720×440 výřezu není znám zoom editoru ani přesná poloha. Šířku stánku v něm nelze přímo považovat za 190 px ve scéně. | Kontrolovat projektové souřadnice 1920×1080 a metry. U šířky 190 px vychází přibližně 2.9–3.4 m podle hloubky. |
| Atmosféra | Nové prvky nemají společně nastavenou míru kontrastu/ostrosti podle vzdálenosti. | Velmi slabé barevné promíchání s okolím. Ve 30–37 m nepřidávat automaticky hustou mlhu. |
| Průhlednost | Arch skutečně obsahuje alfa kanál. Černá zobrazená za díly nemusí být černé pozadí. V souboru je mnoho pixelů s téměř nulovou alfou a sytou skrytou RGB barvou. | Kontrolovat kompozici přes černou, bílou a sníh; masky neodvozovat podmínkou `alpha>0`. Bez kontroly nemažte všechny červené pixely — červená patří i mašlím. |

**Priorita:** geometrie a fyzická velikost → správné vrstvy/prodavač → kontakt se sněhem → barva a lokální světlo → jemné sjednocení hran a atmosféry. Samotné přidání záře by současný dojem nálepky mohlo ještě zvýraznit.

### Rozměry příloh a souřadnicový systém

Kontrola dodaných souborů: screenshot 720×440 RGB; pozadí 1672×941 RGBA, alfa všude 255; arch stánků 1774×887 RGBA s proměnlivou alfou. Pozadí tedy není nativní 1920×1080 ani 4K. Načítat ho přes jednu dokumentovanou transformační matici; 4K export sám nepřidá chybějící detail malby.

Pro fit do 1920×1080 je výchozí uniformní faktor `min(1920/1672,1080/941)≈1.1477`, s nepatrným vodorovným doplněním. Pokud aplikace už používá jiný crop, zachovat jeho přesnou matici. Horizont `y=831` platí pro **projektovou scénu**, v původní příloze by bez dalšího cropu byl přibližně `y=724`. Nikdy nemíchat pixely přílohy, zoomovaný screenshot a projektové souřadnice.

### Číselná kontrola kamery

Z výšky postavy 130 j. = 1.75 m:

```text
q = 1.75/130 = 0.01346153846 m/j.
a = (1.3−0.36)/(1080−900) = 0.0052222222 /px
s(y) = a*(y−yh)
yh = 900−0.36/a = 831.06383 px
k(y) = s(y)/q                     // px/m ve svislé a příčné rovině
h = q/a = 2.5777414 m
```

Pro níže uvedené číselné příklady předpokládáme horizontální FOV 50°, `f=1920/(2 tan25°)=2058.7266 px`, `cx=960`. FOV není známý z obrázku ani ze samotné lineární změny velikosti; je to explicitní kalibrační předpoklad. Pokud aplikace už používá jinou kalibraci, převzít ji a čísla přepočítat.

Konzistentní jednoduchá pinhole projekce se svislými svislicemi a posunutým obrazovým středem:

```text
screenX = cx + f*X/Z
screenY = yh + f*(h−H)/Z
Z = f*h/(screenGroundY−yh)
X = (screenGroundX−cx)*Z/f
```

`X` doprava, `Z` od kamery, `H` výška nad zemí. To je model s horizontem v `yh` — odpovídá posunutému výřezu/off-axis kameře. Nevyvozovat z `yh=831` automaticky náklon kamery dolů při principal point v y=540. Výška kamery a pitch jsou dvě různé věci. Namalovaná architektura navíc nemusí být všude přesnou projekcí jedné kamery.

| Pata stánku y | Měřítko s | Z při FOV 50° | px/m | 190 px představuje | Pohled na zem pod úhlem |
|---:|---:|---:|---:|---:|---:|
| 975 | 0.75167 | 36.87 m | 55.84 | 3.40 m | 4.00° |
| 990 | 0.83000 | 33.39 m | 61.66 | 3.08 m | 4.41° |
| 1000 | 0.88222 | 31.41 m | 65.54 | 2.90 m | 4.69° |

Doporučený nový stánek: celková šířka se střechou **3.2 m**, hloubka **1.8 m**, hřeben **2.65 m**, okap **2.05 m**, pult **1.05 m**. Ve y=990 má šířku asi 197 px a výšku asi 163 px; člověk 1.75 m má asi 108 px. Neladit postavu a stánek nezávislými scale slidery tak, aby tento poměr zanikl.

## A) Grafika — pohledy, vrstvy a hotové prompty

### A.1 Správný pohled

Na zem se díváme pod úhlem přibližně 4–5°, ale na pult ve výšce 1.05 m jen asi 2.3–2.8° shora. Hřeben 2.65 m je dokonce o trochu výš než odvozená kamera. **Nezadávat „isometric, top-down, 20-degree elevated view“.** Frontální trojúhelník střechy a její sklon mohou být dobře vidět, aniž bychom viděli širokou horní plochu celé střechy.

Rozhodnutí závisí na skutečné orientaci:

- Pokud každý stánek fyzicky natočíte přímo ke kameře, jeden téměř čelní pohled může stačit. Světový půdorys, pult, servisní bod a fronta se musí natočit stejně. Nejde jen o billboard nezávislý na chování.
- Pro řadu stánků se společně rovnoběžnými fasádami doporučuji **FRONT, LEFT_PLACEMENT, RIGHT_PLACEMENT**. Stánek vlevo od středu obrazu ukazuje svou pravou boční stěnu, stánek vpravo levou. Názvy označují polohu ve scéně, nikoli „kam se stánek dívá“.
- Pro příčné posunutí a čelní fasádu je přibližný azimut `θ=atan((x−cx)/f)`. Při x=480/1440 je velikost asi 13.1°, při x=700/1220 asi 7.2°. U okrajů 1920px obrazu může dosahovat 25°. Kategorizaci řešit podle relativní orientace fasády ke kameře, ne jen podle x.

Výchozí tři varianty: 0°, ±12°. FRONT používat do přibližně 6°, boční variantu mezi 6–18°. Pro větší odchylku natočit fyzický stánek nebo dodat další malbu. Silné Canvas skew neudělá chybějící boční stěnu ani správný interiér. Přípustná korekce hotové malby: scale, posun a maximálně asi 2 % jemné afinní doladění; větší změna vyžaduje opravu assetu.

### A.2 Jedna společná šablona

Produkční plátno každé vrstvy: **1536×1536 px, RGBA PNG, sRGB, bez ořezu transparentních okrajů**. Výtvarný master se generuje ve vysokém rozlišení podporovaném nástrojem a pak se jednou společně usadí do této šablony. Generátor nemusí garantovat přesně požadovaný rozměr. Všechny následující vrstvy vzniknou z tohoto zarovnaného masteru, nikoli nezávislým přegenerováním geometrie.

FRONT šablona, vodítka určená do editoru, **nesmí být vidět v obrázku**:

| Bod/prvek | Souřadnice / rozsah v plátně |
|---|---|
| Ground anchor | (768,1376), střed přední paty stánku |
| Referenční hustota | 400 asset px / metr čelní roviny |
| Celková šířka střechy 3.2 m | x≈128–1408 |
| Hřeben 2.65 m | y≈316 |
| Okap 2.05 m | y≈556 |
| Vnější sloupky / tělo 2.8 m | x≈208–1328 |
| Horní plocha pultu 1.05 m | přední hrana y≈956 |
| Viditelný otvor | přibližně x=250–1286, y=590–940; přesný polygon podle malby |
| Kontaktní pás sněhu | kolem y=1376, ponechat alespoň 96 px rezervu dole |
| Lucerny | orientačně (240,710), (1296,710); přesná světelná centra z masteru |

Boční varianty mohou mít jinou projekci bodů: musí mít vlastní metadata a všechny vrstvy téže varianty stejnou matici. **Nenuťte pravou/levou perspektivní variantu do identických pozic všech sloupků jako FRONT.** Zachovat pouze rozměr plátna, smysl anchoru a fyzické rozměry. Přesné body změřit po schválení masteru. Výše uvedené souřadnice jsou layout specifikace, nikoli tvrzení, že je AI dodrží na pixel.

### A.3 Povinné vrstvy

| Soubor | Co obsahuje | Co nesmí obsahovat | Jak získat |
|---|---|---|---|
| `back.png` | Zadní stěna, police, zboží, zadní podlaha, viditelné vnitřní boční plochy | Prodavač, přední pult, přední sloupky, vnější halo | Oddělit z masteru; odkryté části za prodavačem případně doplnit inpaintingem |
| `front.png` | Přední pult a jeho deska, sloupky, příslušná boční stěna, střecha, girlandy, lucernová tělesa | Vyplněný prodejní otvor, prodavač, pozadí | Výřez ze **stejného** masteru; zachovat překrytí pultu přes prodavače |
| `apertureMask.png` | Alfa průchozího prostoru pro prodavače/rekvizity | Barevná ilustrace a nechtěná plocha mimo otvor | Deterministická maska z geometrie; ne generovaný šum |
| `interiorShadeMask.png` | Alfa lokálního zastínění pod střechou, u sloupků a pultu | Černý obrazový obdélník | Odvodit z rámu a ručně doladit, aplikovat na vložený obsah |
| `emissionMask.png` | Alfa světelných jader luceren, žárovek, případně interiérového světla | Viditelná dřevěná konstrukce a velké žluté pozadí | Výběr zdrojů z masteru; slouží k výpočtu halo |
| `baseOcclusionMask.png` | Alfa míry kontaktního zastínění u spodní hrany samotného těla | Hotový směrový stín do země | Malovaná/odvozená maska; barvu a opacity dodá aplikace |
| `snowLip.png` | Volitelný úzký nepravidelný sněhový lem na stánku | Celá plocha náměstí, široký stín, postavy | Z referenční malby; podkladové napojení na zem řeší aplikace |
| `snowMaterialMask.png` | Sníh na střeše a pultu pro samostatné tónování | Dřevo, zboží a lucerny | Segmentace/ruční maska |

Masky mají stejných 1536×1536. Je-li maska běžný šedotónový obrázek s neprůhledným pozadím, import **musí převést jas na alfu**. `destination-in` čte alfu, nikoli černou/bílou RGB. Doporučený maskový PNG má bílé RGB a přímo požadovanou alfu.

`front.png` může bezpečně zakrývat prodavačův trup a nohy; prodavač se uvnitř kreslí jako celá postava na skutečné podlaze stánku, ne automaticky zvětšená „hlava v okně“. Ruce, které mají předat kelímek přes pult, jsou volitelná samostatná dynamická vrstva `vendorHandsAboveCounter`; nesmí se ořezat stejnou maskou jako spodní tělo.

Volitelné `glow.png` je pouze předpočítaná rozmazaná emise. Silnější halo může přesáhnout plátno: cache potřebuje padding. Nemá smysl nutit generátor, aby dokázal černobílou alfa masku záře přesně odhadnout; tyto pomocné vrstvy vytvářejte z hotové grafiky.

### A.4 Workflow generování — důležité pro přesné vrstvy

1. Přiložit **pozadí** jako hlavní stylovou a světelnou referenci. Původní arch pouze jako reference obsahu a výzdoby. Screenshot slouží pro posouzení usazení, ne jako referenční požadavek zachovat jeho chyby.
2. Nejprve vytvořit jeden celý neprůhledný stánek na skutečně průhledném okolí, bez prodavače. Schválit vzhled při cílových přibližně 200 px šířky, nikoli jen v detailu masteru.
3. Z masteru deterministicky vyříznout přední rám. Zadní vrstvu lze inpaintingem doplnit, ale neměnit polohu rámu. Nechat 8–16 asset px překrytí skrytých hran pod sloupky/pultem, aby nevznikaly průsvitné škvíry po zmenšení.
4. Masky, světelné zdroje a anchor doplnit v editoru. Všechny soubory exportovat jedinou společnou transformací, bez samostatného „trim transparent pixels“.
5. Teprve po schválení geometrie vyrobit další tři tematické obsahy a boční varianty. Sdílet rám a perspektivu, obměnit detaily střízlivě.

Prompt sám nezaručí přesné vrstvy. Dvě nezávislá generování „přední část“ a „vnitřek“ obvykle změní šířku pultu či výšku střechy. Produkční požadavek přesného zarovnání musí zajistit výřez/maska a kontrola, ne důvěra v textový prompt.

### A.5 Hotové prompty pro čtyři mastery (anglicky)

Prompty jsou připravené pro výchozí FRONT. Přiložit pozadí a původní arch. U každého následně použít vrstvové instrukce A.7. Generovat **jediný stánek**, ne arch více malých stánků.

#### 1. Dřevěné hračky a drobné dárky

```text
Create ONE painterly wooden Christmas-market toy stall as a production master for a layered 2D scene. Use the attached snowy Liberec town-square painting as the PRIMARY reference for brushwork, edge softness, pastel blue-lilac snow, muted color relationships and dusk lighting. Use the old stall sheet only for the general festive subject matter; do not copy its glossy, overly amber rendering.

The stall is about 3.2 metres wide including the roof, 1.8 metres deep, 2.65 metres high at the ridge, with a serving counter 1.05 metres above the ground. The camera is about 2.58 metres high and the stall is about 33 metres away: nearly frontal, very slight elevated observation, only a thin top surface of the counter visible. Do NOT use an isometric or bird's-eye view. Do not expose a broad top plane of the roof. Keep vertical posts vertical and the construction believable.

Square transparent canvas, intended delivery 1536 by 1536 pixels. Keep the entire structure uncropped with generous transparent margins. Intended layout guides: front ground anchor at (768,1376), roof width approximately x=128 to 1408, ridge near y=316, eaves near y=556, front counter top near y=956. These are invisible layout guides, not marks or labels.

Stock the left and right rear shelves with a small wooden rocking horse, a toy train, stacking rings, a few restrained nutcracker figures, small painted ceramic mugs and handmade wooden ornaments. Keep the middle service area visually quiet and empty for an animated adult vendor to be inserted later. No people. Include a clear rear wall and coherent interior depth behind the front frame.

Weathered painted timber, soft snow caps on the roof and a small irregular dusting on the counter. Fir garlands, a few subdued red bows and two modest warm lanterns. Exterior wood and snow receive cool blue-violet ambient light; restrained amber light illuminates the shelves from within. Keep the warm glow localized, soft and painterly, with no glossy toy-plastic finish and no photorealistic wood grain. Match the size of painted brush marks to the reference when reduced to about 200 pixels wide.

True transparent background. No ground plane, no town-square background, no baked ground shadow, no detached glow halo outside the structure, no falling snow, no text, signs, logos, watermark, border, checkerboard drawing or multiple views. Retain painted material shading and small luminous lantern cores inside the structure. This is a single approved master to be separated into registered layers afterwards, not a sheet of independent parts.
```

#### 2. Perník a pečivo

```text
Paint ONE coherent Christmas-market gingerbread and pastry stall for a layered 2D winter painting. Match the attached Liberec square background FIRST: visible soft painterly strokes, gently simplified details, blue-lilac ambient snow and restrained warm windows. The original stall sheet is a subject reference only. Avoid its excessive orange saturation, polished highlights and tiny hyper-detailed wood grain.

Use a wooden stall about 3.2 m wide including its snow-covered gabled roof, 1.8 m deep and 2.65 m high; counter height 1.05 m. Nearly straight frontal view from a camera 2.58 m above the ground, about 33 m away. Show only a narrow counter-top plane and subtle interior depth. No isometric perspective, no exaggerated overhead view, no wide visible upper roof plane. Vertical posts remain vertical.

One square RGBA composition intended for 1536x1536 output, with transparent margins and nothing cropped. Use invisible production guides: ground anchor (768,1376), roof extent around x128..1408, ridge y316, eaves y556, front counter y956. Preserve a broad unobstructed service opening for a separately animated vendor; draw no people.

On the rear left and right shelves place heart and star gingerbread, a small gingerbread house, a few braided pastries and round buns on simple trays. Icing is painted in warm off-white, with no lettering. Keep the central rear-wall region calm, leaving room for the vendor's silhouette. Use modest fir garlands, subdued red ribbons and two small warm lanterns, consistent with the other stalls of the set.

Blue-violet ambient fill on exterior timber and roof snow; localized soft honey-amber light on pastries and interior shelves. Preserve dark but readable interior recesses without crushed black. Broad, soft highlights, no plastic shine. Snow on the roof and counter is irregular and lightly tinted by the surrounding sky, never a pure white sticker. Maintain the same scale of brushwork and gentle edge treatment as the square painting.

Transparent surroundings only. No ground, background buildings, people, baked ground shadow, external bloom, falling snow, readable text, logos, watermark, frame or contact-sheet layout. Keep the solid construction and its material shading intact as one master; registered layers will be extracted from it, not independently redesigned.
```

#### 3. Teplé nápoje se samovarem

```text
Create ONE painterly hot-drink Christmas stall as an isolated layered-scene master, using the attached snowy Liberec square painting as the main style and lighting reference. It must belong to that painted world, not look like a sharp pasted commercial illustration. Use the old stall only as a content reference for a brass samovar and festive wooden construction.

Physical scale: 3.2 m roof width, 1.8 m depth, 2.65 m ridge height, 2.05 m eaves, 1.05 m serving counter. Camera height 2.58 m, viewing distance approximately 33 m, almost front-on. Very modest view of horizontal surfaces; no top-down or isometric angle, no broad overhead roof surface. Keep posts upright and the front opening spacious.

Single square transparent image intended for a 1536x1536 registered production canvas. Invisible guides: front ground contact centre (768,1376); roof from x128 to x1408; ridge near y316; eaves near y556; counter front edge near y956. Full structure visible with margins. No lettering or guide marks. No person inside; leave the centre suitable for a full-height animated vendor behind the counter.

Place a medium brass samovar on the rear LEFT counter, ceramic cups and a few cocoa tins on the rear RIGHT shelves, some cinnamon sticks and a small basket of oranges. The samovar is painted brass with broad subdued warm reflections, not a mirror-like glowing gold object. Preserve empty working room in the centre and believable space between the rear shelves and front counter. Two small lanterns, evergreen garlands, understated red bows and irregular snow on the roof and counter.

Exterior wood and snow pick up cool blue-lilac ambient light from the square. Warm amber light is concentrated around lanterns and inside the service area, with soft painterly transitions. Avoid uniform orange grading across the whole stall. Match the reference's softness, saturation and visible brush-mark scale at a final width of roughly 200 pixels. Do not paint visible steam; it may be added dynamically later.

True transparent background, no ground patch, no baked cast shadow on the snow, no external glow halo, no people, no falling snow, no signs, text, logos, watermark, borders or multiple stalls. Retain painted internal shadows and small light-source cores. Generate one aligned master suitable for later masked layer separation.
```

#### 4. Pletené zboží

```text
Paint ONE isolated wooden Christmas-market knitwear stall that matches the attached snowy Liberec town-square painting. Use soft, visible painterly strokes and the reference's pastel blue-lilac ambient light with localized warm lantern accents. The old stall sheet supplies the festive theme only; avoid glossy 3D rendering, overly crisp decorative detail, harsh outlines and photorealistic knit fibres.

The structure measures approximately 3.2 metres across the roof, 1.8 metres deep, 2.65 metres tall at the ridge; the counter is 1.05 metres high. View it nearly straight from the front, from a camera 2.58 metres high and about 33 metres away. Horizontal surfaces have very little visible depth. No isometric, aerial or steep elevated view. Upright posts, coherent gabled roof, subtle interior recess.

Use one square transparent production composition intended for 1536x1536 pixels. Preserve generous margins. Invisible layout guides: front ground anchor (768,1376), roof x128..1408, ridge y316, eaves y556, front counter y956. Keep all elements uncropped and leave the central service opening clear for an animated adult vendor to be added later. No people.

Arrange muted cream, dusty red and gray-blue knitted hats, folded scarves, pairs of mittens, a small basket of yarn and one modest cloth teddy bear on rear side shelves. Keep the central rear wall quiet and the items large enough to read after reduction to about 200 pixels wide. Add fir garlands, small restrained bows, two warm lanterns and irregular softly painted roof snow. Snow on the serving edge is light and patchy, with a usable clear working surface.

Cool ambient fill on the exterior and snow; gentle amber illumination inside, softly reflected onto nearby fabric. Keep highlights broad and subdued. No uniformly orange timber, black crushed shadows or pure white cut-out snow. Match the reference's brush texture and soft-but-readable silhouette.

True transparent surroundings. No floor or snow ground plane, no background architecture, no baked ground shadows, no glow outside the structure, no snowflakes, no text, prices, logos, watermarks, frame or contact sheet. Keep material shading and the small luminous lantern cores within the object. This is one consistent master for subsequent registered layer extraction.
```

### A.6 Přesné dodatky pro boční varianty

Použít s již schváleným masterem, stejné fyzické rozměry a stejný typ zboží. Pro každou variantu později znovu odvodit masky; nepoužít masky FRONT na natočený obrázek.

**LEFT_PLACEMENT:**

```text
Create a registered view variant of this approved stall for placement LEFT of the scene centre, with the stalls' front facades remaining parallel in the world. The camera sees the stall from its front-right at approximately 12 degrees of azimuth: show a narrow RIGHT side wall on the right side of the image. Preserve the same construction, merchandise, lighting direction, scale, vertical posts and painted style. Camera height remains 2.58 m at about 33 m distance, not an overhead view. Keep a 1536x1536 transparent canvas and the same semantic front-ground anchor; do not crop to content. Reproject the construction coherently; do not simply shear the original image. No ground, ground shadow, people, text or external halo.
```

**RIGHT_PLACEMENT:**

```text
Create a registered view variant of this approved stall for placement RIGHT of the scene centre, with the stalls' front facades remaining parallel in the world. The camera sees the stall from its front-left at approximately 12 degrees of azimuth: show a narrow LEFT side wall on the left side of the image. Preserve the same construction, merchandise, lighting direction, scale, vertical posts and painted style. Camera height remains 2.58 m at about 33 m distance, not an overhead view. Keep a 1536x1536 transparent canvas and the same semantic front-ground anchor; do not crop to content. Reproject the construction coherently; do not simply shear the original image. No ground, ground shadow, people, text or external halo.
```

Pro symetrický prázdný rám lze zrcadlení použít jako základ, ale přezrcadlí i stíny, samovar a zboží. Není to obecně plnohodnotná pravá varianta. V metadatech nesmí zrcadlení nepozorovaně změnit servisní bod nebo stranu fronty.

### A.7 Prompty a instrukce pro oddělení vrstev

Tyto instrukce aplikovat na **schválený master daného stánku**, u všech čtyř stejné. Výběr/maska má přednost před generováním. Pokud nástroj nedokáže zachovat původní pixely, nepoužít jeho výsledek pro `front.png`, pouze pro doplnění skrytého `back.png`.

**Přední vrstva — výřez, nikoli nový design:**

```text
Extract the FRONT OCCLUDING STRUCTURE from this exact approved image without redesigning or moving any pixel of the retained construction. Keep the complete roof, front posts, garlands, lantern bodies, front counter including its top, lower front wall and visible outer side wall. Remove the entire interior seen through the service opening to true transparency. Keep the exact original canvas, scale, ground anchor and coordinates. No new background, no ground shadow, no glow outside the silhouette, no people and no text. Do not independently resize or centre the remaining content. If exact extraction is not supported, provide a selection mask rather than repainting the frame.
```

**Zadní vrstva — řízené doplnění:**

```text
Using this exact approved master and its locked front-frame mask, isolate and complete ONLY the rear interior: rear wooden wall, shelves, the same merchandise, inner side surfaces and the small rear floor area. Remove the front roof, front posts and front counter from this layer. Inpaint only the missing interior that was hidden behind these elements, with a small hidden overlap under the locked front frame. Preserve the canvas, perspective, merchandise identity, scale and position. Keep the central vendor space empty. No person, no external background, no ground shadow, no exterior halo and no text. Do not change the approved front-frame geometry; it will be composited back separately.
```

**Volitelný sněhový lem:**

```text
Create a very restrained irregular snow lip attached to the bottom front edge of the approved stall, on the exact same transparent canvas and coordinate system. Match the blue-lilac snow and soft brushwork of the supplied square background. Cover only small portions of the bottom timber, representing roughly 2 to 6 centimetres of shallow snow; keep gaps and asymmetry. No continuous white horizontal strip, no large snowbank, no whole ground plane, no cast shadow, no other stall parts, no text. This is only the attached foreground lip; the application will blend the ground-side transition from its own snow material.
```

`emissionMask`, `apertureMask`, AO a materiálové masky vytvořit výběrem/algoritmem, nikoli nezávislým text-to-image generováním. Pro generátor masek by šlo zadat přesné kopírování existujícího alfa výběru, ale není důvod spoléhat na AI místo přímé editace.

### A.8 Kontrola registrace vrstev

- Rozměr, barevný prostor, anchor a varianta musí souhlasit. Import odmítne nesoulad pláten nebo chybějící metadata.
- Složit `back → testVendor → front` v plném i cílovém měřítku. TestVendor je jednobarevná silueta celé postavy, ne pouze hlava. Všude mimo otvor jej musí rám správně zakrýt.
- Bez prodavače porovnat složeninu s masterem: v oblastech bez záměrného doplnění `mean abs RGB error ≤2/255`, 99. percentil ≤8/255. Při přesném výřezu má být shoda ještě lepší. Pokud AI vrstvy přemalovala, tento test selže oprávněně.
- Zkontrolovat nejméně 8 landmarků (hřeben, oba okapy, sloupky, pult, lucerny, pata): odchylka registrovaných překryvů max. 1 asset px. Nezávisle vygenerované kusy obvykle limit nesplní.
- V masteru nejsou velké stíny ani vnější halo; v `front.png` má otvor skutečnou nulovou alfu. Po překrytí nesmí zůstat průsvitná šev široká ani 1 finální pixel.
- Kontrola na bílém, černém, 50% šedém a skutečném sněhu odhalí matting fringe. RGB pixelů s alfou 0 nejsou důkazem viditelného lemu; hodnotit skutečnou source-over kompozici.

## B) Zapuštění v aplikaci

### B.1 Jednotky, transformace a společná data

Výchozí efekty udávané v `px1080` jsou fyzické pixely referenčního projektu 1920×1080 při exportním scale=1, nikoli CSS pixely. Při 4K je násobit dvěma; `devicePixelRatio` editoru nesmí být druhý nezávislý násobitel exportu. Světové délky v metrech se vždy projektují kamerou.

Pro master s hustotou 400 px/m a FRONT orientací použít `assetScale = k(y)/400`. Např. y=990: 0.15414, střecha 1280 asset px →197.3 px. `drawX=anchorX−768*assetScale`, `drawY=anchorY−1376*assetScale`. Stejná matice pro back/front/masky/sněhový lem. Pro schválené boční varianty mít vlastní kalibrované `referencePxPerMeter` a landmarky, ne měnit šířku podle libovolného bounding boxu.

Světový půdorys vůči anchoru přední paty:

```text
F = [(-bodyWidth/2,0), (+bodyWidth/2,0),
     (+bodyWidth/2,depth), (-bodyWidth/2,depth)]
bodyWidth=2.8 m; depth=1.8 m
```

Nezapočítávat přesah střechy do kontaktu se zemí. Půdorys natočit světovým yaw a přičíst polohu; každý vrchol projektovat samostatně. U FRONT v y=990 je hloubka 1.8 m v obraze jen asi 8.1 px, zatímco šířka těla je asi 172.6 px. Proto je široká vysoká elipsa pod stánkem nápadně nesprávná. Obrazová hloubka se navíc mění podle x a orientace — nepoužívat konstantní zploštění 0.4.

### B.2 Kontaktní stín a ambientní okluze

Jsou to dva malé efekty, nikoli jeden univerzální vržený stín. Malované stíny uvnitř stánku ponechat; přidávaná AO má zakotvit kontakt s podkladem.

**Plošné zastínění půdorysu:** projektovat F, rozšířit o 0.04–0.12 m v rovině země, vyplnit tmavší modrofialovou barvou a jemně rozmazat. Default opacity 0.10, rozsah 0.04–0.18; blur sigma přibližně 1.5 px1080, rozsah 0.7–3.0. Neprůhledná část pod stánkem bude zakrytá; viditelný zůstane jen okraj. Barvu odvodit z okolního sněhu, výchozí orientační `#627196`, nikdy čistou černou. Použít source-over s nízkou alfou nebo multiply cache, ne oba plně současně.

**Úzký kontakt:** podél skutečně kontaktní přední a viditelné boční hrany nanést pás s profilem `alpha(d)=A*exp(−d²/(2 sigma²))`, kde d je vzdálenost v obraze od projektované kontaktní hrany. Default A=0.22, rozsah 0.12–0.35, sigma=0.6 px1080, rozsah 0.35–1.1. Intenzitu podél hrany modulovat stálým seeded profilem ±15 %, nikoli každým frame. Nepřidávat tmavý obrys kolem střechy a luceren.

`baseOcclusionMask` ztmaví spodní dřevo jemně směrem ke kontaktu, default 0.08 (0–0.15), ale neschovává sníh a netvoří další černý pás. Finální ztmavení kontrolovat vůči lokální sněhové referenci. Na připraveném prázdném podkladu je rozumný pokles jasu sněhu v těsném kontaktu 8–22 %; není to univerzální norma, textura již může mít vlastní stín.

Náklady: při posunu objektu přepočet malé ROI a blur O(N*radius) při separabilním filtru; za běžného snímku jeden až dva `drawImage` z cache. Filtrování celého 4K canvasu pro každý stánek zakázat. Pro statické pozadí a statické stánky lze ground AO složit do jedné pozemní cache.

### B.3 Zapracování do sněhu

Použít ručně nakreslené `snowRegions` v projektu s parametry `coverage`, `surfaceHeightCm`, `packedness`, `reflectivity`; detekce bílé barvy pozadí je jen návrhová pomůcka, ne autorita. Podobně světlé jsou fasády, nebe i svítící okna.

U paty vytvořit řídký nepravidelný lem: výška 0.02–0.06 m, default 0.035 m. V y=990 je to přibližně 1.2–3.7 px svisle. Sníh je objem nad zemí, takže jeho výšku promítat jako H, nikoli jako další vzdálenost po zemi. Přední vyběhnutí do země 0.03–0.12 m je při této kameře obrazově mnohem menší než stejná výška.

Algoritmus:

1. Podél kontaktní polyline v metrech vygenerovat stabilní hladký profil `height(l)=h0*(0.6+0.4*N(l/0.18))`, kde N∈[0,1] je jednorozměrný deterministický smooth noise. Na 15–30 % délky profilu umožnit téměř nulový sníh.
2. Horní hranu promítnout s H=height(l), spodní položit na zem. Sněhová maska překrývá malé části spodního dřeva, nekončí jen vedle něho.
3. Barvu a nízkofrekvenční texturu odebrat z čistého okolního sněhu, ale nekopírovat velkou fotografickou plošku s lampou či stínem. Vhodnější je předpřipravená malovaná snow textura se stálou světovou souřadnicí a jemným lokálním tónováním.
4. Přechod dolní hrany 0.8–1.8 px1080, horní malovaný obrys 0.5–1.2 px. Nekreslit hladkou bílou linku po celé patě.
5. Lem vykreslit za předními zákazníky a před spodní částí stánku. Masku lemů neroztahovat přes boty cizí osoby bez kontroly hloubky.

Sníh na střeše a pultu patří primárně do malby a `snowMaterialMask`; aplikace jej pouze barevně sladí. Pult má využitelnou plochu: nevytvářet 10cm závěj přes celou pracovní desku, kelímky a ruce. Dynamická změna množství sněhu je pozdější funkce.

Náklady: generování profilu a masky při editaci, 1 draw/objekt za frame. Výsledný tvar nesmí při animaci blikat nebo se měnit se zoomem. Akceptace: část spodního dřeva je překrytá 1–4 px při cílovém záběru, přechod navazuje barevně na místní sníh, bez opakující se rovné bílé čáry.

### B.4 Lucerny, interiér a světlo na zemi

Oddělit **zdroj**, **optický halo** a **osvětlení přijímače**. Samotná záře nakreslená přes celý obraz neosvětlí scénu správně.

**Halo lucerny:** z `emissionMask` vytvořit dvě rozmazané cache; malá sigma 1.0–1.8 px1080, větší 3–6 px1080. Default větší halo radius zhruba 7 px1080, opacity 0.10–0.18, barva orientačně `#FFD6A0`. Malé jádro je už v malbě; nepřepalovat ho podruhé. Doporučený režim `screen`; `lighter` jen slabě pro jádro. Screen není fyzikální osvětlení, je to kontrolovatelná kompoziční aproximace [Z1].

**Světlo na sněhu:** pro každou lucernu definovat světové centrum L=(X,Z,H), např. H=1.65 m, a pro interiér jedno širší virtuální světlo za pultem. Vzorkovat světlo na zemní síti pouze v jeho ROI. Pro bod P na zemi:

```text
d2 = (Px−Lx)^2 + (Pz−Lz)^2 + Lh^2
raw = Lh / (d2^(3/2))                  // dopad na horizontální rovinu, relativní
normalized = raw * Lh^2                // v bodě přímo pod světlem =1
u = groundDistance(P, lightGroundCentre) / radiusM
falloff = (1−smoothstep(0.65,1,u))      // 0 mimo dosah
E = intensity * normalized * falloff * visibility(P)
```

Pro měkký obraz lze profil rozšířit, ale nahradit fyzikální exponent výtvarnou křivkou pouze jako explicitní parametr. Výchozí radius 1.6 m (0.8–2.4), alpha/gain 0.12 (0.04–0.25), široký interiér 0.06–0.14. Malá lucerna nemá vytvořit žlutou louži stejně jasnou jako okno.

Kreslit rastr světel v rovině země a promítat jeho trojúhelníky nebo sestavit projektovaný mnohoúhelník s předpočítanou texturou. Canvas2D nemá obecné perspektivní `drawImage`: pro ground decal použít triangulaci a afinní mapování každého trojúhelníku s clipem; při malém efektu stačí lokální Jacobián projekce a elipsa. Při x daleko od středu je v Jacobiánu i příčné zkosení:

```text
J = [[f/Z, −f*X/Z^2], [0, −f*h/Z^2]]   // zemní pohyb (dX,dZ) → (dx,dy)
```

V y=990 při x=960 je příčný scale ≈61.66 px/m, hloubkový ≈4.76 px/m. Světelný kruh o poloměru 1.6 m se tedy projeví zhruba jako 99×8 px poloosy, nikoli velká kulatá žlutá záře na zemi. Může zasahovat asymetricky před pult, např. násobit směrovou měkkou maskou přední poloroviny. Pod stánkem a za neprůhlednými překážkami světlo omezit; malá statická maska visibility z půdorysů stačí.

Světlo sloučit pouze se zemním podkladem/sněhem. Nevykreslovat tento ground pass přes zákazníky. Režim screen lze v první verzi použít v sRGB s omezenou alfou; pokud implementujete přímou radiometrickou adici, dělat ji v lineárním RGB a až poté převést na sRGB. Nekombinovat obě metody naráz na plné intenzitě.

Náklady: cache světelného pole při změně polohy, za frame draw ROI s upravenou intenzitou; mapování trojúhelníků stačí při stavbě cache. Pro první verzi statické světlo, blikání až později.

### B.5 Světlo a okluze prodavače/zákazníků

Prodavač má světové chodidlo uvnitř stánku, typicky 0.5–0.8 m za přední hranou. Jeho výška se mění stejnou kamerou jako ostatním. Při y=990 je zmenšení kvůli této hloubce jen pár procent; nesmí z něj vzniknout miniaturní postava. Pult ve výšce 1.05 m zakryje zhruba spodní 60 % tělesné výšky stojícího dospělého, s korekcí perspektivy a pózy.

Postup na dočasné ROI:

1. Vykreslit samotnou postavu s její alfa maskou; nebo použít cache statických barevných variant dílů.
2. Osvětlení pro trup/hlavu/ruce vypočítat z blízkosti skutečných světel. `g=clamp(gain/(1+(d/r0)^2),0,gMax)` s r0≈1 m, gMax=0.14 pro zákazníka, 0.20 pro prodavače. To je výtvarné zjednodušení, bez normálových map nepravé Lambertovo osvětlení.
3. Přidat teplé zabarvení maskované alfou postavy, s měkkým směrovým gradientem k lucerně; odvrácená strana ponechá chladnou výplň. Nad/pod pultem respektovat okluzi. Jako základ zákazníkovi pouze jemný efekt na horní polovinu, ne oranžový celý kabát.
4. Prodavače omezit `apertureMask` a přes něj `interiorShadeMask` pod střechou/sloupky, default darkening 0.10–0.22. Pokud byl interiér už tmavý, nesčítat dvojitou silnou AO na stěny.
5. Front rám se vykreslí až potom. Ruce nad pultem jsou samostatný schválený pass se stejným osvětlením, ne znovu celá postava.

Při využití `source-atop` na postavě musí být podkladem **izolovaná postava**, ne hlavní canvas s náměstím; jinak se obarví i vše ostatní. U barevné masky lze vytvořit fill → `destination-in` alpha postavy a výsledný overlay kompozitovat. Pracovat v malých ROI. Žádné `getImageData` celé scény každý frame.

Test: při zapnutí/vypnutí lucerny se změna postavy omezuje na její alfu; neobarví se obdélník okolo ní. Při odchodu intenzita plynule klesá, bez skoku při překročení radiusu. Při zhasnutí se odstraní dynamické halo i reakce země/postav, ale světlo namalované do source PNG nezmizí — pro opravdové zhasínání by byla nutná samostatná „unlit“ malba. První verze proto nepředstírá vypínání namalovaného zdroje, pouze malé variace.

### B.6 Barevné sjednocení

Automaticky nesrovnávat průměrný jas celého hnědého stánku s bílým sněhem. Správně by se tím dřevo nepřirozeně zesvětlilo. Vzorkovat **srovnatelné materiály**: sníh na střeše vs. místní neosvětlený sníh, vnější dřevo vs. vhodná teplá architektura pouze jako ruční reference, emise vyjmout ze statistik.

Okolí vzorkovat z podkladového obrazu bez vloženého objektu v prstenci cca 8–30 px1080 kolem paty, s maskou snowRegion, bez svítících oken a bez jiných objektů. Pokud není dost čistých vzorků, použít ruční ambient barvu. Parametry neodvozovat z již upraveného frame, jinak vznikne zpětná vazba.

Doporučená korekce v lineárním RGB, před atmosférou:

```text
Y = 0.2126*R + 0.7152*G + 0.0722*B
C1 = Y + saturation*(C−Y)
C2 = contrast*(C1−pivot) + pivot + exposureOffset
C3 = mix(C2, C2*ambientTintNormalized, ambientMix)
```

Default pro současný teplý arch: saturation 0.88 (0.75–1.05), contrast 0.95 (0.85–1.05), ambientMix 0.08 (0–0.18). Exposure raději řídit v EV jako `C*=2^EV`, default 0, rozsah −0.25 až +0.20 EV; `exposureOffset` pak ponechat 0, nepoužívat obě úpravy bez důvodu. `ambientTintNormalized` je RGB tint normalizovaný na jednotkový jas, aby nebyl zároveň skrytým ztmavením. Pivot zvolit lineární šedou 0.18, ne sRGB číslo 0.5 bez převodu.

Korekce aplikovat po materiálech: vnější konstrukce plný ambientMix, interiér poloviční, světelná jádra 0; sníh samostatně podle snowMaterialMask. Začít novými mastery blíž požadovanému výsledku a redukovat korekce, ne každý objekt agresivně přebarvovat.

sRGB převod: pro kanál c∈[0,1], `linear=c/12.92` pro c≤0.04045, jinak `((c+0.055)/1.055)^2.4`; inverze standardní sRGB. Alfu neměnit korekcí barev. Pro importní CPU průchod lze použít LUT. Před rozostřením respektovat premultiplikovanou alfu, po exportu PNG korektní straight-alpha uložení; nikdy ručně „premultiply“ obrázek, který Canvas už interpretuje správně.

Výkon: materiálové grading cache aktualizovat při změně pozadí, objektu nebo hodnot; za frame používat výsledný bitmapový podklad. `ctx.filter` je vhodný pro prototyp, ale jeho podpora a barevná přesnost nejsou univerzální [Z2]; fallback je cache vytvořená přes ImageData na CPU. RGB grading není úprava alfa masky.

### B.7 Opar, ostrost a light wrap

**Opar:** `t(Z)=exp(−beta*max(0,Z−Z0))`, `Cout=t*Cobject+(1−t)*Cair`. Použít pouze na pixely objektu, **neměnit alfu objektu**, aby skrz dřevo nezačala prosvítat radnice. Default beta=0.0015 m⁻¹ (0–0.004), Z0=0 m; při Z=33.4 m je haze přibližně 4.9 %. Cair vzorkovat z vhodné atmosférické reference, nikoli náhodného jasného okna. Pro toto světlé malované pozadí obvykle stačí 0–6 %. Kontrast barevnou atmosférou klesá, neprůhlednost dřeva zůstává. Emise může mít vlastní jemnější útlum, např. beta×0.5. Nesmí být dvakrát aplikován stejný haze na vnořeného prodavače i kompletní skupinu.

**Ostrost:** srovnávat až v cílovém měřítku. Výchozí dodatečný Gaussian sigma 0.25 px1080 (0–0.6), maximum bez zvláštního důvodu 0.8. Prvně kvalitní downsample, potom malý blur. `imageSmoothingEnabled=true`, quality='high' je preference, ne záruka stejného filtru na všech platformách [Z3]. Pro pevný exportní runtime otestovat skutečné výsledky.

**Light wrap:** pouze úzké jemné přimíchání světla okolí do vnitřní hrany objektu, ne zářící obrys. Z alfa siluety A spočítat erodovanou verzi E, vnitřní prstenec `R=clamp(A−E,0,1)` s šířkou 0.5–1.2 px1080. Pozadí ve stejné poloze jemně rozmazat sigma=2–4 px1080 a jeho barvu B přimíchat `C'=mix(C,B,wrapStrength*R)`, default strength=0.08 (0–0.15). Alfu zachovat. Omezit na jasně osvětlené vnější okraje; na tmavých otvorech, kontaktní spodní hraně a uvnitř otvoru vypnout. Neprovádět wrap na všech vnitřních hranách každé vrstvy, jinak se kolem pultu objeví světlý šev.

Nejprve složit kompatibilní statické vrstvy nebo mít společnou outer silhouette mask; z ní odvodit wrap pro příslušné pixely front/back. Pokud pozadí kolem objektu není výrazně světlejší, wrap může být 0. Špatně vyříznutou bílou/červenou matting hranu opravit při importu, ne ji zamaskovat silnějším wrap.

Výkon: haze a blur jsou statické per-instance cache; wrap se přepočte při posunu objektu nebo změně podkladu. Na frame max. další kompozice malé ROI. Měřítko blur v asset pixelech odvodit `sigmaAsset=sigma1080/assetScale`, jinak bude efekt při zmenšení téměř nulový.

### B.8 Odrazy, sněžení a blikání

**Odraz na ušlapaném/mokrém sněhu, volitelný:** jen v oblasti s reflectivity>0, běžný prašan téměř 0. Nezrcadlit celý stánek pod jeho patu. Vytvořit prodloužené slabé fragmenty odrazů **světelných zdrojů**, s barvou jejich světla, opacity 0.02–0.08, default 0.04, podélná délka 0.25–0.8 m na zemi, rozpad stabilní noise maskou. Projektovat jako ground decal; směr světové stopy ke kameře, ne pevně svislý 30px obdélník. Použít screen nebo source-over s malou alfou. Má být sotva patrný, ne mokré asfaltové zrcadlo. Jedna statická ROI cache; u blikání měnit intenzitu společně se zdrojem.

**Sníh před a za stánkem:** částice mají světovou hloubku a výšku, nebo alespoň spolehlivé depth buckets. Daleké se vykreslí před stánkem v render pořadí (tedy vizuálně za ním), blízké po něm. Nikdy nechat zadní částici prosvítat přes neprůhlednou střechu. Ve výchozím 1080p záběru cca 120–240 částic, 4K stejný svět a stejný počet, dvojnásobné pixelové rozměry. Daleké poloměr 0.3–0.8 px1080, blízké 0.8–1.8 px1080, opacity 0.12–0.45. Jde o výtvarné nastavení, hustotu sněžení řídí scéna. Particle sprite atlas, bez individuálního Gaussian blur v každém frame. Částice u interiéru neosvětlovat automaticky skrz zavřenou střechu.

**Mírné blikání:** olejová/elektrická vánoční lucerna nesmí blikat jako porouchaná zářivka. Výchozí relativní odchylka ±1.5 %, maximum ±3 %, frekvenční obsah převážně <2 Hz. Např. `I(t)=I0*(1+0.012*sin(2π*0.73t+phi1)+0.006*sin(2π*1.13t+phi2))`; fáze z objectSeed, t=tick/60. LED řetězy mohou být zcela konstantní. Stejný I(t) použít pro halo, sníh a postavu, ne tři nezávislé náhodné signály. Namalované jádro zůstává konstantní; v první verzi proto mikrovariace, ne hluboké zhasínání.

Náklady: odraz 1 cached draw, sněžení O(particles) atlasové draw operace, blikání O(lights) bez regenerování bitmap. Při softwarovém Canvas backendu měřit limit částic. Náhodnost se nikdy neřídí renderovým fps.

### B.9 Pořadí vykreslování a okluze

Základní pořadí scény:

1. Pozadí náměstí v projektové matici.
2. Pozemní cache: statické stíny/AO, případné odrazy a světelné skvrny na sněhu. Úzké kontaktní stíny zůstávají tmavé i poblíž lucerny; při sestavování zemní cache dejte kontaktní stín po široké světelné skvrně, nebo z její masky odečtěte nejbližší kontakt.
3. Hloubkově řazené objekty, externí postavy a sněhové depth buckets, zezadu dopředu. Klíč vychází ze světové země, ne ze spodního pixelu textury.
4. U jedné stánkové skupiny lokálně: `back → vendor clipped/shaded → front → vendorHandsAboveCounter (jen povolená část) → snowLip → local emission halo`. Podle art direction může sněhový lem ležet pod předávající rukou; v praxi se tyto oblasti nekříží.
5. Zákazníci před stánkem, jejich ruce a kelímky se vykreslí v jejich vlastních skupinách s odpovídající hloubkou. Jejich osvětlení je součástí jejich sprite passu, ne žlutý full-screen overlay.
6. Přední sněhové částice a jednotný finální výstupní barevný transform, pokud jej scéna má. Vyhnout se druhému silnému gradingu pouze stánků.

Prodavač patří do stánkové skupiny, ne do obecného sortu podle chodidel. Jinak se může celý vykreslit před rámem. Vložené pozadí a frame nejsou dva nezávislé běžné objekty, které se mohou rozdělit náhodným zákazníkem mezi sebou. Externí postava nikdy nesmí vstoupit do půdorysu stánku mimo vyhrazený servisní prostor.

Pro FRONT a malé boční úhly může být stánek atomická skupina s key=zemní přední anchor. Když externí postava obejde viditelnou boční stěnu, samotné jedno y nestačí ve všech možných konfiguracích. Robustnější varianta: mít polygon přední a boční okluzní plochy a rozdělit velkou boční stěnu do 2–4 hloubkových pruhů, nebo sestavit párové před/za vazby při překrytí bboxů a řadit DAG. Cyklus vazeb znamená potřebu dělení sprite, nikoli náhodný tie-break. První verze může prostor kolem boku navrhnout tak, aby toto křížení nevznikalo; omezení musí být zjevné v editoru. Stromy/lampy s malým půdorysem obvykle zvládne jedno ground-anchor řazení.

Předávání kávy: světový servisní socket na pultu; prodavačova ruka se přesune k němu a je zobrazena v horním hand passu. Kelímek má právě jednoho vlastníka, který se změní na události transfer. Ruka se nevykresluje duplicitně v hlavním vendor spritu a v horním passu. Zákazník, který stojí před pultem, přirozeně překryje pult částí svého těla; hloubkový sort to musí umožnit.

### B.10 Ukázka rozhraní projektu

```ts
type V2 = { x: number; z: number };
type V3 = V2 & { h: number };
type PxPoint = { x: number; y: number };

interface AssetView {
  id: 'front' | 'leftPlacement' | 'rightPlacement';
  canvasPx: [number, number];
  groundAnchorPx: PxPoint;
  referencePxPerMeter: number;
  referenceDistanceM: number;
  representativeAzimuthDeg: number;
  layers: {
    back: string;
    front: string;
    apertureMask?: string;
    interiorShadeMask?: string;
    emissionMask?: string;
    baseOcclusionMask?: string;
    snowLip?: string;
    snowMaterialMask?: string;
  };
  socketsPx: Record<string, PxPoint>;
  outerSilhouetteMask: string;
}
interface InsertedObject {
  id: string;
  seed: number;
  assetId: string;
  viewId: AssetView['id'];
  positionM: V2;
  yawDeg: number;
  dimensionsM: { bodyWidth: number; roofWidth: number; depth: number; height: number };
  footprintLocalM: V2[];
  contactPolylinesLocalM: V2[][];
  vendorId?: string;
  vendorLocalM?: V2;
  serviceSocketLocalM?: V3;
  effects: {
    contact: { enabled: boolean; opacity: number; sigmaPx1080: number; color: string };
    groundAO: { enabled: boolean; opacity: number; sigmaPx1080: number; expandM: number };
    snow: { enabled: boolean; regionId: string; heightM: number; coverage: number };
    grade: { saturation: number; contrast: number; exposureEV: number; ambientMix: number };
    haze: { betaPerM: number; startM: number; color: string };
    edge: { blurSigmaPx1080: number; wrapPx1080: number; wrapStrength: number };
    reflection: { enabled: boolean; opacity: number; lengthM: number };
  };
  lights: {
    id: string;
    localM: V3;
    color: string;
    radiusM: number;
    groundGain: number;
    characterGain: number;
    haloSigmaPx1080: number;
    haloOpacity: number;
    flickerAmplitude: number;
  }[];
}
```

Ukázkový předvolbový profil pro nápojový stánek ve středu:

```json
{
  "schemaVersion": 1,
  "assetId": "drinks-v1",
  "viewId": "front",
  "positionM": { "x": 0, "z": 33.389913 },
  "yawDeg": 0,
  "dimensionsM": { "bodyWidth": 2.8, "roofWidth": 3.2, "depth": 1.8, "height": 2.65 },
  "vendorLocalM": { "x": 0.15, "z": 0.65 },
  "serviceSocketLocalM": { "x": 0.35, "z": -0.04, "h": 1.05 },
  "effects": {
    "contact": { "enabled": true, "opacity": 0.22, "sigmaPx1080": 0.6, "color": "#627196" },
    "groundAO": { "enabled": true, "opacity": 0.10, "sigmaPx1080": 1.5, "expandM": 0.07 },
    "snow": { "enabled": true, "regionId": "squareSnow", "heightM": 0.035, "coverage": 0.75 },
    "grade": { "saturation": 0.88, "contrast": 0.95, "exposureEV": 0, "ambientMix": 0.08 },
    "haze": { "betaPerM": 0.0015, "startM": 0, "color": "#BBC9E4" },
    "edge": { "blurSigmaPx1080": 0.25, "wrapPx1080": 0.8, "wrapStrength": 0.08 },
    "reflection": { "enabled": false, "opacity": 0.04, "lengthM": 0.45 }
  },
  "lights": [
    { "id": "lanternLeft", "localM": { "x": -1.32, "z": -0.05, "h": 1.665 }, "color": "#FFD6A0", "radiusM": 1.6, "groundGain": 0.12, "characterGain": 0.12, "haloSigmaPx1080": 3.5, "haloOpacity": 0.12, "flickerAmplitude": 0.015 },
    { "id": "lanternRight", "localM": { "x": 1.32, "z": -0.05, "h": 1.665 }, "color": "#FFD6A0", "radiusM": 1.6, "groundGain": 0.12, "characterGain": 0.12, "haloSigmaPx1080": 3.5, "haloOpacity": 0.12, "flickerAmplitude": 0.015 }
  ]
}
```

Profil je částečný příklad instance, ne kompletní validní `InsertedObject`: ID, seed, půdorys a asset registry doplní projekt. Souřadnice luceren nahradit skutečnými sockety schválené grafiky, například orientační y710 při 400px/m dává výšku 1.665 m. Barvy jsou startovní návrhy; v editoru je možné je vybrat z pozadí. Do uloženého projektu persistovat skutečné hodnoty a verze assetů, nikoli jen odkaz na měnící se default.

### B.11 Pseudokód vykreslování a cache

```ts
function renderFrame(scene: Scene, tick: number, outputScale: 1 | 2) {
  // Exportní rozměry, nikoli CSS/DPR náhled.
  const t = tick / 60;
  const commands = buildDepthCommands(scene, t);
  beginFrame(outputScale);
  drawBackground(scene.backgroundTransform);
  drawGroundCache(scene.groundCache);
  drawDynamicGroundLightDelta(scene, t); // jen pokud je efekt implementován

  for (const command of stableDepthOrder(commands)) {
    if (command.kind === 'stall') drawStallGroup(command.object, t);
    else if (command.kind === 'person') drawLitPerson(command.person, scene.lights, t);
    else drawOtherCommand(command, t);
  }
  drawNearSnow(scene.snow, tick);
  endFrame();
}

function drawStallGroup(o: InsertedObject, t: number) {
  const cache = requireObjectCache(o); // nesmí každým frame dělat readback pixelů
  const transform = objectAssetTransform(o);
  drawCached(cache.back, transform);
  if (o.vendorId) {
    const vendorROI = renderVendorPoseAndLighting(o, t);
    // clip jen v jeho vlastní dočasné ROI, ne destination-in na celém náměstí
    applyAlphaMask(vendorROI, cache.apertureMask, transform);
    applyInteriorShade(vendorROI, cache.interiorShadeMask, transform);
    drawROI(vendorROI);
  }
  drawCached(cache.front, transform);
  drawPermittedVendorHandPass(o, t);
  drawCached(cache.snowLip, transform);
  drawLocalLanternHalos(cache.halos, t); // pozdější bližší objekty je překryjí
}
```

`groundCache` ve výchozí první verzi obsahuje již statické světlo; pokud se přidá blikání, nesmí se každý frame znovu přičítat celá stejná světelná skvrna. Nejjednodušší řešení: mít ground base bez světla a předřazené světelné overlay cache s aktuální alfou. Funkce `drawDynamicGroundLightDelta` v pseudokódu je pouze místo pro zvolený mechanismus, ne požadavek použít záporné světlo přes Canvas. Buď statická kompletní cache, nebo dynamicky skládané samostatné světlo, nikdy obojí dvojmo.

Pro každý dočasný canvas platí: `save/restore`, explicitní `globalAlpha=1`, `globalCompositeOperation='source-over'`, `filter='none'`, správný clip a čisté transformace. Maska musí být v přesně stejné projektové/ROI matici jako kreslený obsah. Po aplikaci `destination-in` se canvas nesmí bez resetu použít pro další nesouvisející objekt [Z1].

**Cache key:** asset hash, view, grade, ambient/haze, depth/scale bucket, resolution scale, ground material/sample version a relevantní light geometry. Nové osvětlení či změna podkladu invaliduje příslušný výřez. Při změně pouze ticku nezneplatňovat statické bitmapy. Při přesunu objektu přepočítat ground efekty, barvu okolí a wrap; při změně úhlu vybrat odpovídající asset, ne přegenerovat masky za běhu.

### B.12 Náklady a rozpočty

| Efekt | Výchozí nastavení | Runtime náklad po cachování | Přepočet při změně |
|---|---|---|---|
| Kontaktní stín + ground AO | 0.22 / 0.10 alpha; sigma 0.6 / 1.5 px1080 | 1–2 ROI draw nebo sdílená ground cache | Projekce polygonu, raster + separabilní blur |
| Sněhový lem | 3.5 cm, coverage 0.75 | 1 draw | Profil, maska, vzorek materiálu |
| Ground light | 1.6 m, gain 0.12 | 1 draw/zdroj nebo společná cache | Raster pole/Jacobián/mesh |
| Halo | sigma 3.5 px, alpha 0.12 | 1–2 malé draw/zdroj | Blur emission masky |
| Postava osvětlení | gain ≤0.14/0.20 | Malá izolovaná ROI a 1–2 kompozice/postavu v dosahu | Pose alpha se aktualizuje, světelné směry levně |
| Grade | saturation 0.88, contrast 0.95 | 0 extra průchodů, již v bitmapě | O(asset pixelů) CPU/LUT |
| Haze | beta 0.0015/m | 0 extra průchodů, již v cache | O(ROI pixelů) |
| Hrany/wrap | sigma 0.25 px, wrap 0.8 px/0.08 | 0–1 draw | Eroze, blur okolí, alpha-aware blend |
| Odraz | alpha 0.04, length 0.45 m | 1 draw, default vypnutý | Ground decal maska |
| Sníh | 120–240 částic | O(N) sprite draws | Pouze update/projekce částic |

Pixelové náklady 4K jsou přibližně 4× proti 1080p při stejném počtu překreslovaných ploch; počet objektů a simulačních kroků se nemění. Toto není tvrzení, že přesný čas bude 4×: závisí na backendu, paměti a GPU akceleraci Canvasu.

1536² RGBA vrstva zabírá přibližně 9.44 MB dekódovaně. Osm vrstev × čtyři stánky × tři pohledy je přibližně 906 MB ještě bez kopií, mipmap a cache. **Nedekódovat celou knihovnu do canvasů naráz.** Načíst používané varianty, připravit runtime bitmapy v cílové velikosti a zdrojové vrstvy podle potřeby uvolnit. Maska může mít na CPU jednokanálové uložení; Canvas surface má obvykle více kanálů.

Při šířce stánku cca 200 px1080 a 400 px4K stačí většina runtime vrstev v ROI kolem 250² / 500² podle paddingu. Pět 500² RGBA cache je asi 5 MB na stánek; započíst skutečné halo paddingy a dočasné plochy. Jeden plný 4K RGBA buffer má 33.18 MB, 1080p 8.29 MB. Udržovat malý pool znovupoužitelných ROI, nikoli nový canvas na každou ruku každý frame.

Výkonové cíle, které je nutné změřit na konkrétním desktopu:

- 4 stánky, 8 světel, 20 postav, 200 vloček: p95 renderu bez videoenkodéru <20 ms při 1080p a <30 ms při 4K, pokud zvolený backend reálný čas zvládá. Je to rozpočet, nikoli garantovaný benchmark.
- Pro offline export je důležitější správnost a stabilní paměť než dosažení 30 skutečných snímků za sekundu. Video má stále 30 fps, i když render jednoho snímku trvá déle než 33 ms. Nikdy nesnižovat simulační kvalitu podle doby renderu.
- Žádný celoscénový `getImageData` ani blur celého frame na každý stánek. V 10min exportu po zahřátí nesmí cache bezdůvodně růst.
- Zaznamenat CPU, GPU/backend, runtime, exportní rozlišení, počet efektů, průměr/p95 a špičku paměti. `OffscreenCanvas` může pomoci oddělit práci, ale neznamená automaticky levný blur nebo hardwarovou akceleraci.

### B.13 Ověření obrazu — metriky a scénáře

Metriky používat jako detektory problémů, ne jako náhradu výtvarného úsudku. Například oranžový samovar může mít záměrně vyšší sytost než okolní sníh.

| Test | Požadavek / výchozí limit |
|---|---|
| Fyzické měřítko | Ve y990 má 3.2m střecha kolem 197 px a 1.75m postava kolem 108 px při uvedené kalibraci; odchylka algoritmu <1 %, malířská silueta ±5 % |
| Projekce půdorysu | Projekce a inverze země se vrací s chybou <0.01 px; zadní hrana 1.8m půdorysu u středu y990 asi 8.1 px výš |
| Registrace vrstev | Stejná plátna; landmark chyby ≤1 asset px; žádné samostatné trim/scale |
| Okluze prodavače | Testovací celé tělo neprosvítá skrz pult/střechu/sloupky; ruce nad pultem jen v explicitním hand passu |
| Kontaktní hrana | Stánek nemá souvislou světlou mezeru >0.5 px1080 mezi patou a podkladem; úzký AO pás má šířku zhruba 1–3 px, ne 15px černý mrak |
| Sněhový lem | Překrývá vybrané úseky dřeva ve výšce cca 1–4 px1080 a nepřekrývá bližší boty bez správné hloubky |
| Jas srovnatelného sněhu | Po vyloučení osvětlení/slunečních míst rozdíl mediánu lineárního Y v asset snow vs. reference obvykle ≤0.08; nezvyšovat tím jas dřeva |
| Barva sněhu | Pokud implementujete Lab: ΔE00 mediánů srovnatelných sněhových vzorků cílově <6, tolerance až 10 podle záměrného světla; ne test všech materiálů |
| Sytost okolních materiálů | Na srovnatelném sněhu rozdíl mediánu HSV S orientačně ≤0.10; v téměř bílé oblasti brát metrickou nestabilitu hue v úvahu |
| Hrany | Měřit alpha/kontrastní 10–90% přechod po normále v cílovém rozlišení; orientačně 0.8–2 px1080 u většiny netexturovaných hran, ne stejná šířka na každém vlasu/girlandě |
| Halo | Bez světlého obdélníku ROI; na vnější hranici cache max. alpha <1/255 nebo dostatečný padding, žádné uříznutí bluru |
| Světlo na zemi | Světlo zasahuje jen příslušné ground plochy; vzorek za neprůhlednou překážkou má visibility=0 nebo explicitní ambient zbytek |
| Postavy ve světle | Při vypnutí vrstvy barevného příspěvku se pixely mimo alfu postavy nemění; světlo neprosvítá přes rám |
| Haze | Zvyšování Z mění RGB směrem k Cair, nikdy neudělá díru do neprůhledného dřeva; žádná dvojitá aplikace na prodavače |
| Alfa/matting | Na bílé/černé/sněhu bez neodůvodněného barevného lemu; téměř transparentní prázdná oblast neovlivní maskový bbox |
| Determinismus | Stejný seed, tick a runtime → stejné efekty/částice; 30fps export a 60fps preview mají ve společných tickových časech stejný stav |
| 4K | Kompozice po zmenšení na 1080p odpovídá referenci v geometrii a intenzitě; šířky efektů se dvojnásobí, světlost se nezčtyřnásobí |

Šířku hran měřit na zvolených kontrolních úsecích sloupku/střechy; malované nepravidelnosti přirozeně odlišují místa. Rozdíl průměrů **celého** objektu a okolí není vhodné akceptační kritérium. Automatická optimalizace nesmí za účelem splnění prahu vybělit dřevo nebo odbarvit mašli.

Testovací záběry:

1. Jeden nápojový stánek FRONT uprostřed, efekty po jednom A/B zapínat. Ověřit, že největší zlepšení dělá kontakt a správná barva, ne bloom.
2. Tentýž stánek ve y975/990/1000; poměry velikosti, rozměry stínu a sněhu se řídí stejnou kamerou.
3. Dva rovnoběžné stánky na x480/x1440 se správnými bočními variantami. Půdorys a viditelný bok se nesmějí rozcházet.
4. Prodavač stojí, podá kelímek, sáhne pod pult; zákazník přijde, zakryje část pultu, odejde kolem boku. Kontrolovat zakrývání, ne jen statickou pózu.
5. Lamely/pult a průhledné otvory na bílém/černém/sněhovém podkladu při 100 % zoomu a v cílové velikosti. Případné červené okraje nejsou opraveny odstraněním skutečných mašlí.
6. Sníh vypnutý/zapnutý a regions s nulovou coverage: lem vzniká jen na vhodném materiálu. Zář na světle modrém i tmavším ušlapaném sněhu nesmí přepálit scénu.
7. Všechna světla s konstantní intenzitou a poté s microflicker: bez strobování, bez nesouvisejícího pulzování postav.
8. 10 minut 4K exportu s opakovaným načtením stejného projektu: žádný růst paměti bez stropu, žádná změna světelných fází podle rychlosti stroje.

### B.14 Obecně pro strom, lampy, koše a stolky

Sdílený systém má vždy ground anchor, fyzické rozměry/půdorys, outer silhouette, materiálové masky, volitelné emise a sněhovou kompatibilitu. Ne každý efekt je vhodný pro každý objekt:

| Objekt | Kontakt | Sníh | Světlo | Specifikum |
|---|---|---|---|---|
| Stánek | Polygon a kontaktní hrany | Lem + střecha/pult | Lucerny + interiér | Vnořený prodavač, rozdělený rám |
| Strom | Pata kmene, malá plocha nejnižších větví podle malby | Okolí kmene, již namalované větve | Mnoho drobných jader sloučených do 1–2 emise cache | Nedělat obrovskou černou elipsu přes celou korunu |
| Lampa | Malý základ/patka | 1–3 cm lokální lem | Jeden zdroj a zemní pool | Světlo nemusí odpovídat výšce žárovky jen podle PNG y bez socketu |
| Koš | Malý polygon paty | Závěj podle regionu | Obvykle pouze přijímá světlo | Otevíratelné víko samostatná vrstva |
| Stolek | Patka/nohy, nikoli celá deska | Malý lem u nohy; případně povrchová maska na desce | Přijímá světlo | Deska překrývá předměty a lidi podle výšky, ne jen podle bottom y |

Editor: přepínače Kontakt, Sníh, Přijímat světlo, Emitovat světlo, Sladění barev, Atmosféra, Měkkost hran, Odraz. Nabídnout „základní / detailní“ panel; běžný uživatel potřebuje hlavně anchor, fyzickou velikost, vhodný pohled a několik intenzit. Diagnostika zobrazí půdorys, kontakt, světla a servisní body. Technické masky a numerické sigma jsou v rozšířeném panelu.

## Priority a postup

### 1. Opravit současnou scénu ještě před novou grafikou

- Potvrdit transformaci skutečného pozadí do 1920×1080, kameru a fyzickou velikost jednoho stánku. Zkontrolovat postavu proti pultu 1.05 m.
- Použít aktuální back/front výřezy ze společné geometrie, správně umístit celou postavu uvnitř a překrýt ji pultem. Je-li původní arch nezarovnaný, nejdřív jej registrovat.
- Přidat úzký kontakt, jemný sněhový lem a jednu slabou světelnou plochu na zemi. Bez odrazů a blikání.
- Mírně snížit saturaci/kontrast vnějších ploch, sníh sladit samostatně. Ve výsledku posoudit, kolik stylového nesouladu zbývá.

### 2. Vytvořit jeden nový master a skutečné vrstvy

Začít nápojovým stánkem, protože má nejvíce vazeb na postavy a světlo. Schválit FRONT v původním náměstí při cca 200 px šířce; potom přesné rozdělení do vrstev, masky a sockety. Dokud nevychází produkční zarovnání a vendor test, negenerovat všechny varianty všech stánků.

### 3. Rozšířit na čtyři obsahy a boční pohledy

Převzít schválenou konstrukci, měřítko, štětec a světelný poměr. Přidat hračky, perník a pletené zboží. Boční varianty generovat podle skutečného rozmístění — nemusí být hned potřeba všech 12 kombinací. Zrcadlení je omezená úspora, ne univerzální řešení.

### 4. Zobecnit efekty a doladit výkon

Uložit parametry do projektu, zavést cache a diagnostiku, otestovat 1080p/4K. Až potom přidat light wrap, mokré odrazy, microflicker a sněžení. Dobrý výsledek má fungovat už při vypnutých posledních čtyřech ozdobných efektech.

### Rizika, kterým se vyhnout

- Nefixovat grafiku silným globálním rozostřením: ztrácí se kresba i čitelnost zboží.
- Negenerovat interiér a rám nezávisle a neočekávat přesné pixelové sesazení.
- Neřešit perspektivu pouze zploštěním PNG; obsah v 2D obrázku se tím správně nepřekreslí.
- Nepoužívat `destination-in` na hlavní scénu; zmizela by její velká část.
- Nezapomenout na alpha masky: černá RGB ve zcela neprůhledné masce není průhlednost.
- Nekreslit stejné světlo v masteru, halo, ground passu a finálním bloom ještě jednou se stejnou silou.
- Nemíchat screen a fyzikální adici bez určení barevného prostoru a intenzit.
- Neudělat z večerní modré scény noční černý obraz: přiložené pozadí je poměrně světlé a pastelové, text „večer“ není důvod k jinému výtvarnému osvětlení.
- Nepovažovat export 3840×2160 za skutečnou novou kresbu 4K; dodané pozadí má 1672×941. Kompozice může být ve 4K, zdrojový detail zůstává omezený.

### Technické zdroje

Zdroje ověřené při přípravě 24. 11. 2026. Číselné intenzity efektů výše jsou návrhem pro dodané obrazy, nikoli hodnotami převzatými z dokumentace API.

- **[Z1]** W3C: [Compositing and Blending Level 1](https://www.w3.org/TR/compositing-1/). Definice kompozice, blend režimů a izolovaných skupin. Doplňkově [MDN globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation).
- **[Z2]** MDN: [CanvasRenderingContext2D.filter](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter). Filtry a omezení podpory; proto je v návrhu záložní tvorba bitmapových cache.
- **[Z3]** MDN: [imageSmoothingQuality](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality) a [imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled). Preference pro resampling, nikoli náhrada validace výsledných hran.
- **[Z4]** WHATWG: [HTML Standard — Canvas](https://html.spec.whatwg.org/multipage/canvas.html). Referenční specifikace Canvas API, stav kontextu a kreslení. Pro konkrétní export zafixovat runtime a otestovat jeho backend.

### Rozsah provedené kontroly tohoto dokumentu

Byly prohlédnuty dodané obrázky, ověřeny jejich rozměry a alfa kanály a přepočteny měřítko, vzdálenosti a úhly pro výslovně uvedenou kameru. Hodnoty shaderových/kompozičních efektů jsou startovní nastavení pro implementaci; jejich vzhled a výkon nebyly benchmarkovány ve vaší aplikaci. Hotové prompty samy nezaručují přesnou geometrii vrstev — tu musí zajistit popsané maskování, registrace a kontrolní složenina.
