# Zadání grafiky pro skládané postavy

Podklad pro přípravu dílů (např. v ChatGPT). Postava se skládá z dílů na 2D kostře a díly se
při animaci otáčejí v kloubech. Proto má každý díl obsahovat **jen svou část** a překrývat se jen
tam, kde je to nutné kvůli kloubu.

## 1. Obecná pravidla (platí pro všechny díly)

* **Styl:** malovaná zimní pohlednice, měkké tahy štětce, jemná textura, tlumené barvy, jednoduchá
  čitelná silueta, obličej jen naznačený, bez lesklého 3D vzhledu, bez tlustých černých obrysů.
* **Světlo:** vždy shora zleva, stejné u všech dílů.
* **Formát:** každý díl jako **samostatné PNG s průhledným pozadím** (skutečná alfa, ne bílé
  pozadí), bez vrženého stínu, bez textu a popisků, čisté okraje bez světlého lemu.
* **Měřítko:** jednotné pro všechny díly. Celá postava bez čepice je vysoká **520 px**
  (od podrážky po temeno). Rozměry v tabulkách níže jsou pro toto měřítko.
* **Orientace:**
  * Končetiny kreslit **svisle**, horní kloub nahoře, uprostřed šířky obrázku.
  * Trup a hlavu kreslit **vzpřímeně**.
  * Botu kreslit **špičkou doprava** (u pohledu z boku).
* **Přebarvitelné oblečení** (bundy, rukávy, čepice, šály, kalhoty, boty, rukavice) malovat ve
  **světlé neutrální šedé** (asi #E8E4DE) se stínováním. Barvu doplní aplikace. Části, které se
  přebarvovat nemají, malovat v konečné barvě: bambule (krémová), kožešina (béžová), knoflíky,
  podrážky, proužky na šále (krémové).
* **Stejný díl pro levou i pravou stranu:** rukáv, nohavice, bota a rukavice se kreslí jen jednou
  a použijí se pro obě strany. Proto mají být souměrné, bez detailu jen na jedné straně.

## 2. Pohledy

| Pohled | Priorita |
|---|---|
| z boku (postava jde doprava) | nutné |
| šikmo zepředu (3/4, postava jde doprava dolů ke kameře) | nutné |
| šikmo zezadu (3/4, postava jde doprava nahoru od kamery) | nutné |
| zepředu | doplňkové (jinak se nahradí šikmým pohledem) |
| zezadu | doplňkové (nesmí vzniknout zrcadlením předního) |

Každý díl, který vypadá v různých pohledech jinak, je potřeba v každém pohledu zvlášť. Vždy jde o
**tutéž postavu**: stejný střih, stejné detaily, jen jiný úhel.

## 3. Seznam dílů

### Tělo (jediná viditelná část těla je hlava, zbytek zakrývá oblečení)

| Díl | Pohledy | Obsah | Rozměr (přibližně) | Pozor |
|---|---|---|---|---|
| Hlava s krkem | každý pohled | hlava, krátké vlasy těsně u hlavy, naznačené oči a tváře, krk | hlava ⌀ 84–92 px, krk 24 px široký a 40 px dlouhý pod bradou | **bez čepice, bez šály, bez límce**. Krk nahoře navazuje na hlavu, dole končí rovně (schová se pod šálu nebo límec). |

Volitelně: 2–3 varianty vlasů nebo pleti jako samostatné hlavy.

### Bunda (každá varianta: 3 díly × každý pohled)

| Díl | Obsah | Délka a šířka | Překryv |
|---|---|---|---|
| **Trup** | bunda **bez rukávů** (jen ramena), límec, knoflíky nebo zip | od krku po pas 152 px. Kabát pokračuje dolů dalších 80 px (do půli stehen), krátká bunda 25 px. Šířka v ramenou ~100 px (3/4 pohled), ~65 px (bok) | ramena zaoblená, aby rukáv mohl začít těsně pod nimi |
| **Nadloktí (rukáv)** | horní část rukávu | kloub ramene → loket **84 px**; šířka ~40 px, dole ~36 px | nahoře začít **nejvýš 4 px** nad ramenním kloubem, dole zaoblit a přesáhnout loket o ~15 px |
| **Předloktí (rukáv s manžetou)** | dolní část rukávu včetně manžety | loket → zápěstí **80 px**; šířka ~34 px | nahoře začít jen ~5 px nad loktem, dole končí manžetou (bez ruky) |

**Nekreslit:** rukávy přimalované k trupu, ruce v rukávech, hlavu ani šálu na trupu.

Varianty pro první verzi: **dlouhý kabát** a **krátká prošívaná bunda** (s vysokým límcem).

### Kalhoty (společné, 2 díly; stačí jedna verze pro všechny pohledy)

| Díl | Délka | Překryv |
|---|---|---|
| **Stehno** | kyčel → koleno **124 px**, šířka ~46 px nahoře, ~37 px u kolena | nahoře přesah ~20 px (schová se pod bundu), dole zaoblené koleno přes kloub ~15 px |
| **Lýtko** | koleno → kotník **116 px**, šířka ~37 px | nahoře začít jen ~5 px nad kolenem, dole končit nad botou (spodek nohavice se kreslí přes kotník) |

**Nekreslit:** boty v nohavicích ani pásek přes oba díly.

### Boty (společné, 1 díl na pohled, platí pro obě nohy)

| Díl | Obsah | Rozměr | Překryv |
|---|---|---|---|
| **Bota** | zimní bota se svrškem kolem kotníku a tmavou podrážkou | svršek ~34 px široký a ~36 px vysoký. Z boku od paty po špičku ~65 px, šikmo zepředu ~55 px, zezadu ~45 px | horní okraj svršku se schová pod nohavici. **Kotník je 12 px nad podrážkou.** |

### Rukavice (společné, 1 díl na pohled)

| Díl | Obsah | Rozměr |
|---|---|---|
| **Palčák** | palčák s naznačeným palcem, bez rukávu | ~32 × 38 px; horní okraj navazuje na manžetu předloktí |

### Pokrývky hlavy (každá varianta × každý pohled)

| Díl | Obsah | Pozor |
|---|---|---|
| **Kulich s bambulí** | pletený kulich s ohrnutým okrajem, bambule v konečné krémové barvě | sedí na hlavě ⌀ ~90 px, okraj nad obočím |
| **Baret** | plochý baret mírně do strany | stejná velikost hlavy |
| **Beranice / ušanka** | čepice s kožešinovým lemem a klapkami na uši, kožešina v konečné barvě | klapky sahají k bradě. Z boku je vidět jedna klapka, šikmo dvě. |

Kreslit **jen čepici**: bez hlavy, bez vlasů vyčnívajících z čepice. Spodní okraj má sledovat
tvar hlavy, aby nevznikla mezera.

### Šály (každá varianta × každý pohled)

| Díl | Obsah | Pozor |
|---|---|---|
| **Pletená šála** | ovinutí kolem krku a dva konce volně visící vpředu (asi do půli hrudi), krémové proužky na koncích | konce mají být souměrné. Zezadu je vidět jen ovinutí. |
| **Nákrčník** | silný pletený tubus kolem krku | jen krk, bez konců |

Šála zakrývá spodek krku a horní okraj límce. Šíře ovinutí odpovídá krku ~24 px plus tloušťka šály.

## 4. Čeho se vyvarovat (zbytečné překryvy a chyby)

* Rukávy přimalované k trupu, ruce v rukávech, boty v nohavicích, šála nebo čepice na hlavě.
* Díl, který zasahuje do sousedního víc, než je uvedeno výše (vzniká „boule“ v ohnutém kloubu).
* Ořezaná nebo nakloněná končetina. Díl musí být celý, svislý a souměrný.
* Různé měřítko dílů mezi obrázky.
* Bílé nebo barevné pozadí, vržený stín, perspektivní zkreslení.
* Výrazné nesouměrné detaily na rukávech a nohavicích (díl se používá pro obě strany).

## 5. Minimální sada pro první funkční postavu

Pro jeden pohled (nejlépe **šikmo zepředu**), potom stejně pro bok a šikmo zezadu:

1. hlava s krkem
2. trup kabátu (bez rukávů)
3. nadloktí kabátu
4. předloktí kabátu
5. stehno
6. lýtko
7. bota
8. palčák
9. kulich
10. pletená šála

Plná sada podle zadání:

* 3 pohledy × (hlava + 2 bundy × 3 díly + 3 čepice + 2 šály + bota + palčák) + 2 díly kalhot
* celkem **~50 obrázků**

## 6. Doporučený postup v ChatGPT

1. Nejdřív nechat vygenerovat **referenční celou postavu** ve třech pohledech vedle sebe (jen pro
   kontrolu stylu a proporcí, nepoužije se v animaci).
2. Pak generovat díly **po jednom**, vždy s odkazem na referenci, se stejným popisem stylu a měřítka.
3. Každý díl si nechat dodat jako PNG s průhledností. Pokud nástroj vrátí bílé pozadí, uveďte to
   – průhlednost doplním, ale okraje budou horší.

Ukázkový pokyn pro jeden díl:

> Namaluj jen horní část rukávu zimního kabátu (nadloktí) pro skládanou 2D postavu: svislý,
> souměrný, horní okraj rovný a zaoblený na rameni, dole zaoblený konec u lokte, bez ruky a bez
> trupu. Délka 84 px, šířka asi 40 px. Styl: malovaná zimní pohlednice, měkké tahy štětce, jemná
> textura, světlá neutrální šedá látka se stínováním, světlo shora zleva. Bez obrysu, bez stínu na
> pozadí, průhledné pozadí, PNG.

## 7. Co udělám po dodání

* Originály uložím beze změny.
* Zkontroluji průhlednost a okraje.
* Doplním přesné body kloubů a kotvy, masky barev, sjednotím měřítko.
* Díly zapíšu do knihovny.
* Spustím testy mezer v kloubech a čitelnosti na náměstí.
* Co nepůjde připravit čistě, označím jako dočasné a sepíšu požadovanou opravu.

## 8. Prompt – arch dílů, pohled šikmo zepředu (schválená reference v2)

Reference: `grafika/zdroje/postava-reference-v2.webp` (dospělý, ~7 hlav, styl schválen).

```text
Podle této referenční postavy namaluj ARCH DÍLŮ pro 2D animaci – stejný styl, stejná postava, stejné měřítko, pohled ŠIKMO ZEPŘEDU (jako prostřední postava). Každý díl samostatně, nic se nedotýká, mezi díly velké mezery (aspoň 60 px), rozmístění v mřížce 5 × 2. Průhledné pozadí, žádný text, žádné popisky, žádný stín, světlo shora zleva, šedé oblečení stejné jako na referenci.

Díly:
1) Hlava s krkem – bez čepice, bez šály, bez límce; krátké vlasy těsně u hlavy; krk dole rovně uříznutý.
2) Trup kabátu BEZ RUKÁVŮ – od límce po spodní lem kabátu, knoflíky, kapsy; v místě ramen jen zaoblená ramena, žádné rukávy ani jejich začátky; bez hlavy a bez šály (límec ano).
3) Nadloktí – horní polovina rukávu kabátu, SVISLE, nahoře zaoblená (rameno), dole zaoblená (loket), bez ruky.
4) Předloktí – dolní polovina rukávu s ohrnutou manžetou, SVISLE, bez ruky.
5) Palčák – SVISLE, palec naznačený, nahoře otevřený okraj (navazuje na manžetu).
6) Stehno – horní polovina nohavice, SVISLE, nahoře rovně uříznutá, dole zaoblené koleno.
7) Lýtko – dolní polovina nohavice, SVISLE, dole rovný okraj nohavice, bez boty.
8) Bota – jedna zimní bota s tmavou podrážkou, špička doprava a mírně ke kameře.
9) Kulich s bambulí – jen čepice, bez hlavy a vlasů, spodní okraj kopíruje tvar hlavy.
10) Šála – omotaná kolem neviditelného krku (prázdný otvor uprostřed), dva souměrné konce visící dolů, krémové proužky.

Končetiny (3–7) kresli přesně svisle, souměrně a celé, se stejnou šířkou jako na referenci. Nic nekresli dvakrát a nic nepřimalovávej k jinému dílu.
```


## 9. Prompty pro všechny směry (stejný postup jako u šikmo zepředu)

Každý prompt posílejte ve **stejné konverzaci** s referenční postavou v2 a předchozími archy.
Společný úvod je stejný, mění se jen pohled a popis dílů.

**Společný úvod (vložit na začátek každého promptu):**

```text
Podle stejné referenční postavy a ve stejném stylu jako předchozí archy dílů namaluj nový ARCH DÍLŮ pro 2D animaci v pohledu [POHLED]. Stejná postava, stejné měřítko jako předchozí arch, stejná šedá barva oblečení, světlo shora zleva. Každý díl samostatně, nic se nedotýká, mezi díly velké mezery (aspoň 60 px), rozmístění v mřížce 5 × 2. Průhledné pozadí, žádný text, žádné popisky, žádný stín. Končetiny (díly 3–7) kresli přesně svisle, souměrně a celé; nadloktí a stehno užší a delší (délka asi trojnásobek šířky); předloktí stejně široké jako nadloktí, lýtko stejně široké jako spodek stehna. Nic nekresli dvakrát a nic nepřimalovávej k jinému dílu. Trup bez tmavých otvorů v průramcích a límci, čepice bez tmavého průhledu dovnitř, otvor šály vyplněný látkou nebo stínem.
```

### Z boku (postava jde doprava)

```text
[společný úvod s POHLED = „Z BOKU – postava je otočená přesně doprava, vidíme její pravý bok“]

Díly:
1) Hlava s krkem z profilu – obličej doprava (naznačené oko, nos, tvář), vlasy, ucho; bez čepice, šály a límce; krk dole rovně uříznutý.
2) Trup kabátu z boku BEZ RUKÁVŮ – úzký profil, přední okraj s knoflíky na pravé straně obrázku, záda vlevo, límec, spodní lem.
3) Nadloktí – horní polovina rukávu, SVISLE, nahoře i dole zaoblené, bez ruky.
4) Předloktí – dolní polovina rukávu s manžetou, SVISLE, bez ruky.
5) Palčák z boku – SVISLE, palec směřuje doprava (dopředu).
6) Stehno – horní polovina nohavice z boku, SVISLE.
7) Lýtko – dolní polovina nohavice z boku, SVISLE, bez boty.
8) Bota z profilu – špička přesně doprava, pata vlevo, tmavá podrážka rovně.
9) Kulich s bambulí z boku.
10) Šála z boku – smyčka kolem krku, konce visí dopředu (doprava) před hrudí.
```

### Šikmo zezadu (postava jde doprava a od kamery)

```text
[společný úvod s POHLED = „ŠIKMO ZEZADU – jako pravá postava na referenci; postava je natočená doprava a od kamery, vidíme hlavně záda“]

Díly:
1) Hlava s krkem zezadu – vlasy na zátylku, naznačené ucho, z obličeje nejvýš kousek tváře; bez čepice, šály a límce.
2) Trup kabátu ze zad BEZ RUKÁVŮ – zadní šev, límec zezadu, spodní lem, žádné knoflíky.
3) Nadloktí – SVISLE, nahoře i dole zaoblené, bez ruky.
4) Předloktí s manžetou – SVISLE, bez ruky.
5) Palčák ze hřbetu ruky – SVISLE.
6) Stehno ze zadní strany – SVISLE.
7) Lýtko ze zadní strany – SVISLE, bez boty.
8) Bota zezadu – vidíme hlavně patu, špička míří doprava a od kamery.
9) Kulich s bambulí zezadu.
10) Šála zezadu – smyčka kolem krku viděná ze zad, konce visí dopředu a nejsou vidět.
```

### Zepředu (postava jde přímo ke kameře)

```text
[společný úvod s POHLED = „ZEPŘEDU – postava stojí čelem přímo ke kameře“]

Díly:
1) Hlava s krkem zepředu – souměrný obličej jen naznačený (oči, tváře), vlasy; bez čepice, šály a límce.
2) Trup kabátu zepředu BEZ RUKÁVŮ – souměrný, knoflíky uprostřed, límec, kapsy, spodní lem.
3) Nadloktí zepředu – SVISLE, nahoře i dole zaoblené, bez ruky.
4) Předloktí s manžetou zepředu – SVISLE, bez ruky.
5) Palčák zepředu (dlaní k tělu, palec dopředu) – SVISLE.
6) Stehno zepředu – SVISLE.
7) Lýtko zepředu – SVISLE, bez boty.
8) Bota zepředu – špička míří přímo ke kameře, vidíme špičku a svršek.
9) Kulich s bambulí zepředu, souměrný.
10) Šála zepředu – smyčka kolem krku, dva souměrné konce visí dolů s krémovými proužky.
```

### Zezadu (postava jde přímo od kamery)

```text
[společný úvod s POHLED = „ZEZADU – postava stojí zády přímo ke kameře“. Nemaluj zrcadlený přední pohled – opravdu záda.]

Díly:
1) Hlava s krkem zezadu – zátylek s vlasy, obě uši naznačené, žádný obličej; bez čepice, šály a límce.
2) Trup kabátu ze zad BEZ RUKÁVŮ – souměrný, zadní šev uprostřed, límec zezadu, spodní lem.
3) Nadloktí zezadu – SVISLE, bez ruky.
4) Předloktí s manžetou zezadu – SVISLE, bez ruky.
5) Palčák ze hřbetu ruky – SVISLE.
6) Stehno zezadu – SVISLE.
7) Lýtko zezadu – SVISLE, bez boty.
8) Bota zezadu – vidíme patu a zadní část svršku.
9) Kulich s bambulí zezadu, souměrný.
10) Šála zezadu – jen smyčka kolem krku, konce nejsou vidět.
```

Doporučené pořadí: **šikmo zezadu → z boku → zezadu → zepředu** (podle toho, jak často postavy
v typické scéně těmito směry chodí).
