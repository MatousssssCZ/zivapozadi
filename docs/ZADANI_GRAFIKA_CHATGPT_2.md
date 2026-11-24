# Grafika pro ChatGPT – 2. kolo (sáňky z více pohledů, boty jako 3D „otočka“, odklízení sněhu)

Ke každému zadání přilož jako stylovou předlohu **pozadí Liberce** (`grafika/ziva-pozadi/assets/background_clean.png`),
**arch dílů dospělé postavy** a u dětských věcí **arch dítěte** (`grafika/ziva-pozadi/assets/child_parts.png`).
Vždy chtěj: skutečně průhledné PNG, bez textu a popisků, bez stínu na zemi, stejné světlo (studené
modrofialové okolí, teplé odlesky zprava), ve 2× rozlišení (kvůli 4K). Každý pohled na **vlastní plátno
stejné velikosti**, předmět vždy stejně velký a se stejnou **linií země** (spodní okraj skluznic / podrážky
na stejném řádku pixelů) – podle toho se pohledy v aplikaci střídají bez poskočení.

Úhly pohledu: kamera je nízko u země (asi 1,6 m), díváme se mírně shora (asi 10–15°). „Směr“ je kam
předmět míří vůči divákovi: 0° = doprava (z boku), 45° = šikmo doprava k divákovi, 90° = přímo k divákovi,
135° = šikmo doleva k divákovi, 180° = doleva, 225° = šikmo doleva od diváka, 270° = přímo od diváka,
315° = šikmo doprava od diváka. Levé směry (135°, 180°, 225°) aplikace umí zrcadlit, ale lépe je mít je
zvlášť (světlo zrcadlením přejde na špatnou stranu).

## 1. Sáňky se sedícím dítětem z 8 směrů – P1 (B02)

Proč: dnes existuje jen boční pohled; když rodič s dítětem zatáčí nebo jde ke kameře, sáňky se jen
zmáčknou a v půlce obratu přeskočí. S 8 pohledy se zvolí nejbližší a mezi sousedními se plynule prolne.

Na každý směr **dvě vrstvy** zvlášť (stejné plátno, stejná poloha):
1. sáňky + dítě bez hlavy (hlava se v aplikaci mírně pohupuje),
2. hlava dítěte s čepicí (krk na stejném místě jako na vrstvě 1).

Dítě sedí, nohy natažené dopředu, botky opřené o přední oblouk, rukama v palčácích drží okraje sání.
Provázek **nekreslit** (aplikace ho kreslí od ruky rodiče k úchytu).

```text
Using the attached background and the attached child parts sheet as the exact style, colour and lighting
reference, paint a classic wooden sled (curved wooden runners with snow on them, three slats, a small
metal rope ring at the front tip) with a 7-year-old child sitting on it, legs stretched forward, boots
resting against the front curve, mittens holding the side rails. Same child as the reference sheet
(cream coat, grey trousers, pompom hat). No rope.
Render the SAME sled and child from 8 directions, each on its own transparent canvas of identical size
(1600 x 1200 px), identical scale, the bottom of the runners touching the same horizontal ground line
at y = 1100 px, centred horizontally: facing right (side view), facing right-towards-viewer (45 degrees),
facing the viewer, facing left-towards-viewer, facing left, facing left-away-from-viewer, facing away
from the viewer, facing right-away-from-viewer. Camera slightly above, about 12 degrees downward.
For each direction deliver two layers: (1) sled and child WITHOUT the head, (2) only the child's head
with hat, positioned exactly where it belongs. Soft painterly brushwork, cool blue-lilac ambient light,
warm highlights from the right, no ground shadow, no text, true transparent background.
```

Kontrola po dodání: skluznice na stejném řádku ve všech 8 pohledech, stejná délka sání v bočním pohledu
(~1,1 m vůči dítěti), u pohledu zepředu/zezadu je vidět úchyt provázku (vpředu dole uprostřed).

## 2. Boty jako otočný „3D render“ – P1 (chůze)

Proč: bota je dnes jeden malovaný obrázek pro pohled 3/4, který se při chůzi jen natáčí v rovině obrazu
a zkracuje. Při šikmé chůzi pak vypadá „naplocho“. S otočkou se vybere obrázek podle skutečného směru
chodidla vůči kameře a podle sklonu chodidla (došlap patou / celá podrážka / odraz špičkou).

Dodat pro **dospělou botu** (barva podle archu dospělého) i **dětskou botu**:
- 16 směrů po 22,5° (0° = špička doprava, 90° = špička k divákovi …),
- v každém směru 3 sklony: špička nahoru 20° (došlap patou), rovně, pata nahoru 35° (odraz).
- Bota bez nohy, horní otvor holínky viditelný jen tam, kde by ho nezakryla nohavice (bota bude pod
  nohavicí – horní okraj holínky v obrázku musí být čistý, bez „vyskakující“ textury).
- Otočný bod = kotník: na všech obrázcích na stejném místě plátna (střed horního okraje holínky).

```text
Paint a turntable sheet of ONE winter boot (the same boot as on the attached adult parts sheet: brown
leather ankle boot with a dark rubber sole) as if rendered from a 3D model, in the soft painterly style of
the attached references. 16 views around the vertical axis in 22.5 degree steps (0 = toe pointing right,
90 = toe pointing towards the viewer, 180 = toe pointing left, 270 = toe pointing away), camera about 12
degrees from above. For every direction three pitches: toe raised 20 degrees, flat on the ground, heel
raised 35 degrees with the toe on the ground. 48 images, each on its own transparent 512 x 512 canvas,
the ankle point (centre of the boot opening) always at x = 256, y = 160. Clean boot opening with no leg
inside, no ground shadow, no text, true transparent background, same light direction as the references.
Then the same sheet for the child boot from the attached child sheet.
```

## 3. Odklízení sněhu – P2 (A11)

Proč: dnes se pracovník skládá z běžných dílů (rovný trup, předklon jen natočením) a lopata je jeden
obrázek z boku. Pro přesnou animaci tahu je potřeba:

1. **Trup v pracovním předklonu** (25° a 40°) s kratším, nakrčeným lemem kabátu – 3/4 zepředu
   i zezadu; stehna a lýtka pro pokrčená kolena (30° a 60°). Postava pracovníka údržby: tmavě zelená
   pracovní bunda s reflexním pruhem, pletená čepice, pracovní rukavice.
2. **Lopata (shrnovač sněhu) z 5 směrů**: z boku, 45° k divákovi, zepředu (list k divákovi), 45° od
   diváka, zezadu. Na každém obrázku vyznačené (jen v popisu souboru, ne v obrázku) body: střed
   D-držadla, místo úchopu přední ruky na násadě, střed spodní hrany listu.
3. **Sníh na listu** jako samostatná vrstva ve 3 velikostech (málo / plno / s převisem).
4. **Valoun shrnutého sněhu před listem** – 4 velikosti (narůstá během tahu), z boku a zepředu.
5. **Hromada u okraje** – 4 stádia (malá → velká), stejná linie země.
6. **Odkrytá dlažba jako dlaždicový pás** (bezešvě navazující doleva/doprava, výška 256 px, délka 1024 px)
   + samostatná **maska okraje** (rozhrnutý sníh po stranách pruhu), aby šel pruh prodlužovat po kouscích.

```text
Using the attached background and adult parts sheet as the exact style reference, paint production assets
for a municipal worker clearing snow with a snow pusher shovel: (1) separate body parts of the worker
(dark green work jacket with a reflective stripe, knitted hat, work gloves): torso bent forward 25 and 40
degrees with a shorter bunched jacket hem, thigh and shin for knees bent 30 and 60 degrees, front
three-quarter and back three-quarter views, rounded overlapping joint ends; (2) the snow pusher (D-grip
handle, wooden shaft, wide metal blade) from 5 directions: side, 45 degrees towards the viewer, front,
45 degrees away, back - same scale, same ground line; (3) a separate layer of snow sitting on the blade in
3 amounts; (4) a ridge of pushed snow in front of the blade in 4 growing sizes, side and front view;
(5) a snow pile at the edge of a pavement in 4 growing stages on the same ground line; (6) a seamless
horizontally tileable strip of cleared cobblestone pavement 1024 x 256 px and a separate soft edge mask of
pushed-aside snow along both long sides. Soft painterly brushwork, cool blue-lilac ambient light, warm
highlights, no ground shadows, no text, true transparent backgrounds, every asset on its own canvas.
```

## Jak se to zapojí

- Sáňky: renderer vybere 2 nejbližší z 8 směrů podle směru jízdy v obraze a prolne je (cross-fade
  ~0,3 s), hlava zvlášť; dokud podklady nejsou, platí současný boční pohled se zkrácením.
- Boty: z kostry je známý skutečný směr chodidla (svět) a jeho sklon – vybere se obrázek z otočky;
  dokud chybí, používá se současná projekce malované boty (natočení + zkrácení podle 3D směru).
- Odklízení: nové díly trupu a nohou se přidají do knihovny dílů pracovníka, lopata podle směru,
  pruh dlažby se prodlužuje po dlaždicích a valoun/hromada se střídají podle množství sněhu.
