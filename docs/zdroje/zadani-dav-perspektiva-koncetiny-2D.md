# Zadání: dav, perspektiva a končetiny 2D postav

**Pro implementaci v TypeScriptu • 24. 11. 2026 • verze 1.0**

Cíl: deterministická desktopová aplikace s 5–30 malovanými chodci, pozadím 1920×1080, simulací 60 Hz a exportem 30 fps. Dokument je implementační předpis, nikoli tvrzení, že výsledná aplikace už byla otestována.

**Rozlišování původu hodnot:** **U** = zadání uživatele; **D** = matematicky odvozeno; **N** = navržený parametr aplikace, určený k ladění; **V** = publikovaný výsledek. Parametry N nejsou vydávány za naměřené univerzální vlastnosti chodců. Odkazy [S1]–[S13] jsou v závěru. Výsledky kontrol vzorců jsou v E; integrační testy jsou teprve požadavkem na vývojáře.

**Závazná architektura:** svět a všechny kontakty v metrech → plán tras a aktivit → předvídavá volba rychlosti → společné pevné kolizní omezení → skutečný posun těla → kontaktně řízené kroky a prostorová kinematika → jediná perspektivní projekce → 2D malované díly. Přímé dodatečné posouvání sprite po kolizním řešení je zakázáno.

## Výzkumný podklad a volba přístupu

| Oblast | Co zdroj podporuje | Co z toho používáme |
|---|---|---|
| Social force [S1] | Model kombinuje dosažení požadované rychlosti, odstup od lidí a hranic a přitažlivé sociální vlivy. | Srozumitelný rozklad motivací; samotné odpudivé síly nepoužijeme jako pevnou záruku nepřekročitelnosti. |
| ORCA [S2] | Odvozuje dostatečné podmínky bezkolizního pohybu z překážek v prostoru rychlostí a reciprokého podílu odpovědnosti. | Vhodná alternativa lokálního plánovače. Pokud ji implementace použije, nepovažovat následný libovolný clamp zrychlení nebo stojícího souseda za zachování původních předpokladů. |
| Predikce TTC [S3] | Interakce chodců souvisejí s odhadovaným časem budoucí kolize, ne pouze s okamžitou vzdáleností. | Vyhodnocovat budoucí střet a minimální předpokládanou vzdálenost. |
| Skutečné vyhýbání [S4] | Huber a kol. sledovali různé úhly střetu. Výrazné brzdění se nejstáleji objevovalo u 45° a 90°; protijdoucí míjení se více opíralo o změnu dráhy. U normální rychlosti průměrně 1,42 m/s začínala změna dráhy v jejich scénářích asi 1,7–2,4 m před bodem nejbližšího setkání. | Včasná malá odchylka je vhodný cíl pro volné protijdoucí míjení. Není správné vyžadovat nulové brzdění při všech kříženích. Výhled 3 s níže je N, nikoli převzatá naměřená konstanta. |
| Skupiny [S5] | Přibližně 1500 pozorovaných skupin: při malé hustotě často vedle sebe; při větší hustotě se formace přizpůsobují prostoru a sociálnímu kontaktu. | Dvojice má společný záměr, ale dvě samostatná kolizní těla. Přechod do zástupu je explicitní plán formace. |
| Proxemika [S6] | Studie 8943 lidí ze 42 zemí dokládá variabilitu preferovaných mezilidských vzdáleností. | Osobní prostor je preference, nikoli průměr fyzického těla. Dotazníkové vzdálenosti nejsou přímo kolizní poloměry při chůzi. |
| Projekce [S7] | Standardní pinhole model používá vnitřní parametry kamery a transformaci světa do kamery. | Jedna projektivní kamera pro trasu, kontakty, měřítko i stopy. |
| IK a footplant [S8, S9] | Dokumentace Spine upozorňuje na rychlý pohyb u úplného napřímení a změnu větve IK; Kovar a kol. řeší zachování pevných kontaktů při úpravách pohybu. | Nevyhlazovat hotový kontakt, neprohazovat větev kolena, nemaskovat chybnou perspektivu natahováním. |
| Spojitá kolize [S10] | Detekce času střetu slouží k prevenci průletu mezi diskrétními stavy. | Nestačí zkontrolovat vzdálenost na konci kroku; níže je podmínka pro celou úsečku pohybu a nezávislý analytický test. |

Doporučená implementace pro tento počet osob: **predikce kandidátních rychlostí + společná konvexní bezpečnostní projekce**. Je to návrh pro tuto aplikaci, nikoli nově naměřený model lidí. Není nutné zároveň implementovat plný social-force i ORCA. ORCA lze později dosadit za volbu kandidáta; společný validátor a vazba na kroky zůstávají.

# A. Perspektiva a mapování země

## A1. Jednotky a důležitá oprava předchozího zadání

Zde mají přednost nové rozměry od uživatele. Převod z rig jednotek:

\[
q=\frac{1.75}{130}=0.01346153846\;\mathrm{m/j.}
\]

| Rozměr | Rig jednotky | Metry | Původ |
|---|---:|---:|---|
| Celá postava | 130 | 1,750000 | U |
| Stehno | 32 | 0,430769 | U, D |
| Lýtko | 30 | 0,403846 | U, D |
| Délka nohy L | 62 | 0,834615 | D |
| Ramena | 24 | 0,323077 | U, D |
| Kotník nad podrážkou | 3 | 0,040385 | U, D |
| Pata za kotníkem | 3,3 | 0,044423 | U, D |
| Přednoží před kotníkem | 7,9 | 0,106346 | U, D |
| Vzdálenost pata–přednoží | 11,2 | 0,150769 | D |

Předchozí chodecký dokument používal návrhovou fyzickou délku nohy 0,9 m a jiné rozměry boty. Jeho normalizované úhlové křivky lze použít jako vodítko, ale **nelze současně převzít staré metrické převody, kotníkové dráhy a novou botu bez retargetingu**. Rozměry nohy a boty výše znovu vstupují do řešení kontaktu a IK. Krátká namalovaná bota je vlastnost tohoto assetu; stopu neprodlužovat automaticky na „běžnou dospělou botu“.

## A2. Co ze dvou měřítek lze a nelze určit

Měřítko s je počet obrazových pixelů na jednu rig jednotku, nikoli px/m. Z daných bodů:

\[
a=\frac{1.3-0.36}{1080-900}=0.005222222222,
\quad s(y)=a(y-y_h),
\quad y_h=900-\frac{0.36}{a}=831.0638298\;\mathrm{px}.
\]

**Doporučený přesný model zachovávající tuto přímku:** kamera bez rollu, optická osa vodorovná, posunutý hlavní bod `cx=960, cy=yh`. Jde o platnou pinhole kameru s posunutým obrazovým výřezem / lens shiftem, nikoli o standardní symetrický výřez s hlavním bodem uprostřed obrázku. Kamera je výše než oči; nemusí přitom opticky mířit dolů. V tomto modelu:

\[
h=\frac{q}{a}=2.577741408\;\mathrm{m}.
\]

**Výška kamery tedy už není volný parametr**, pokud zachováme přesnou přímku s(y), výšku postavy 1,75 m a tento model. Volné zůstává ohnisko f. Kdo současně nastaví jiné h a ponechá oba body s(y), zavede rozpor.

Jednoduché UI: dva stávající kalibrační body a jeden posuvník **horizontální FOV**, výchozí 50°, s náhledem metrové mřížky. Při šířce W=1920:

\[
f_x=f_y=f=\frac{W/2}{\tan(FOV_x/2)}=2058.726644\;\mathrm{px}.
\]

Při těchto zadaných měřítkách má referenční 130j. postava na 1080p podkladu výšku 46,8 px v y=900 a 169 px v y=1080. Při 4K exportu to bude 93,6 a 338 px. Kalibrační měřítka se vztahují ke stejné referenční stojné póze bez změn výšky způsobených krokem.

Hlavní bod je vertikálně mimo střed, proto celkový vertikální úhel není automaticky `2 atan(1080/(2f))`; je `atan(yh/f)+atan((1080-yh)/f)`.

Lepší uživatelská kalibrace, zná-li skutečný rozměr: označit dva body ležící přibližně za sebou ve směru hloubky a zadat jejich vzdálenost. Pro shodné x=cx:

\[
f=\frac{D}{h\left|1/(y_1-y_h)-1/(y_2-y_h)\right|}.
\]

Pro obecné dvě obrazové pozice platí `ΔX = h[(x1−cx)/(y1−yh)−(x2−cx)/(y2−yh)]`, které nezávisí na f, a `ΔZ = f h[1/(y1−yh)−1/(y2−yh)]`. Z délky D lze dopočítat f, pokud `D²>ΔX²` a body nemají stejné y. Vodorovná známá délka při stejném y sama ohnisko v této kalibraci neurčí. Nejasné nebo rozporné měření editor vysvětlí.

## A3. Projekt a inverze — jediný zdroj pravdy

Souřadnice světa: X doprava, Z od kamery, H výška nad rovinou sněhu/země. Kamera C=(0,h,0), Z>0. Obraz: x doprava, y dolů.

\[
\boxed{x=c_x+fX/Z,\qquad y=y_h+f(h-H)/Z}
\]

Pro rovinu H=0:

\[
\boxed{Z=\frac{fh}{y-y_h},\qquad X=\frac{h(x-c_x)}{y-y_h}}
\]

Lokální měřítko svislé postavy je `s=fq/Z`; počet px/m ve směru světové výšky nebo osy X je `m=f/Z=s/q`. Není to metrika roviny země ve všech směrech.

Vzdálenost dvou lidí: nejprve obě pozice chodidel převést na (X,Z), potom `sqrt((X1−X2)²+(Z1−Z2)²)`. Nikdy nepoužívat obrazovou vzdálenost dělenou průměrným měřítkem pro obecný pohyb do hloubky.

```ts
type V2 = { x: number; z: number };
type V3 = V2 & { h: number };
type Camera = { f: number; cx: number; yh: number; h: number; q: number };

function project(p: V3, c: Camera) {
  if (p.z <= 0) throw new Error('Point behind camera');
  return { x: c.cx + c.f*p.x/p.z,
           y: c.yh + c.f*(c.h-p.h)/p.z };
}
function unprojectGround(x: number, y: number, c: Camera): V2 {
  if (y-c.yh < 10) throw new Error('Ground point too close to horizon');
  return { x: c.h*(x-c.cx)/(y-c.yh), z: c.f*c.h/(y-c.yh) };
}
```

Limit 10 px od horizontu je N pro editor, nikoli matematická hranice. Produkční trasy omezit také například na Z≤150 m a Z≥5 m podle skutečné scény; body mimo oblast odmítnout místo clampingového teleportu. Při 4K změnit W, f, cx a yh dvojnásobně, nikoli světové metry. Interní původní podklady a masky mohou zůstat v návrhových pixelech 1920×1080.

## A4. Rychlost a promítnutí kroku

Jacobiho matice země:

\[
J(X,Z)=\begin{bmatrix}f/Z&-fX/Z^2\\0&-fh/Z^2\end{bmatrix},
\qquad (\dot x,\dot y)^T=J(v_X,v_Z)^T.
\]

Pro `v = speed·(cosφ,sinφ)` je φ úhel ve světové rovině, měřený od +X k +Z. Krok o délce l promítat přesně jako:

`deltaScreen = project(P + l·direction, H=0) − project(P,H=0)`.

Pro malé l lze použít J; pro kalibraci kontaktů použít přesnou projekci obou bodů. Uprostřed obrazu X=0 je poměr hloubkového a bočního lokálního posunu:

\[
\boxed{K_{local}=h/Z=(y-y_h)/f.}
\]

Mimo střed má chůze čistě do hloubky také vodorovnou složku k úběžníku nebo od něj. Obecné K jako jediný skalár tam nevystihuje směr; použít celou J. Projekce úzkého pásu země je silně anizotropní.

**Číselný příklad pro FOVx=50°:**

| y [px] | s [px/j.] | Z [m] | f/Z [px/m] | Hloubka fh/Z² [px/m] | K_local | Bočně při 1,3 m/s [px/s] | Ke kameře při 1,3 m/s [px/s], X=0 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 900 | 0,3600 | 76,9823 | 26,7429 | 0,8955 | 0,03348 | 34,7657 | 1,1641 |
| 960 | 0,6733 | 41,1589 | 50,0190 | 3,1326 | 0,06263 | 65,0248 | 4,0724 |
| 1020 | 0,9867 | 28,0881 | 73,2952 | 6,7265 | 0,09177 | 95,2838 | 8,7445 |
| 1080 | 1,3000 | 21,3182 | 96,5714 | 11,6772 | 0,12092 | 125,5429 | 15,1803 |

Pás y=900→1080 je v tomto konkrétním nastavení **55,6641 m**, tedy asi 42,82 s při 1,3 m/s nebo 61,85 s při 0,9 m/s. Hodnota 56 m není určena samotnými dvěma měřítky: vyžaduje volbu ohniska. Pro 6 m by při zachování měřítek vyšlo f≈221,91 px a horizontální FOV≈153,97°, což většinou neodpovídá malbě náměstí.

Konstanta 0,4 tedy u zvoleného f nadhodnocuje hloubkový obrazový krok přibližně 3,3–11,9×. Srovnání „1 px = 2,5 jednotky dráhy“ bez upřesnění, zda jde o rig jednotky nebo metry a zda bylo započteno měřítko, nemá jednotný fyzikální význam. Nový model tuto konstantu odstraňuje.

**Praktický důsledek:** pokud skutečně chcete, aby šlo o malý prostor 6–12 m, je nutné změnit kalibraci velikostí / kompozici, ne napravovat kameru rychlejší chůzí nebo zkosením nohou. Editor má ukázat 1m mřížku a referenční postavy před potvrzením kalibrace.

## A5. Obecná nakloněná kamera — volitelný režim, ne směšování modelů

Pokud chcete hlavní bod `(960,540)` a fyzicky nakloněnou kameru, lineární s(y) již není přesné měřítko skutečné svislé postavy. Pro pitch α kladně dolů, c=cosα, t=sinα:

`D = Z c + (h−H)t`, `Yc = (h−H)c − Zt`,
`x = cx + fX/D`, `y = cy + fYc/D`, `yh=cy−f tanα`.

Pro H=0 a `v=(y−cy)/f`:

`Z=h(c−v t)/(v c+t)`, `D=Zc+ht`, `X=(x−cx)D/f`.

Přesná svislá výška postavy délky H0 ve středové rovině je:

`heightPx = f H0 Z / [Dground · (Dground−H0 sinα)]`.

Obecná výška postavy je rozdíl projekce hlavy a pat; při X≠0 se mění i x hlavy. Nezaměňovat výšku postavy za jediný lokální faktor f/D.

S hlavním bodem y=540 a horizontem y≈831 by α bylo záporné: kamera by mířila **nahoru**, nikoli dolů. Pro nakloněný režim je potřeba kalibrovat geometrii z obrazu, například horizont a známý rozměr, a oba body velikosti považovat za měření s tolerancí. Dvě velikosti při známé skutečné výšce samy obecnou kameru jednoznačně neurčí. UI nesmí současně slibovat přesnou starou přímku i libovolný pitch, výšku a ohnisko.

Pro první implementaci použít přesný model A2–A4; obecný režim ponechat jako rozšíření se samostatnou kalibrací.

## A6. Trasy, kotvy a kontakt

Uzly a polygony nakreslené v obraze převést při potvrzení na světové X,Z. Uložit i původní obrazové souřadnice pro případnou změnu kalibrace. Po změně kamery nabídnout explicitně buď zachování poloh v obraze s novým přepočtem světa, nebo zachování světových metrů; nikdy obojí automaticky.

Kotva opory má strukturu `{worldX, worldZ, supportHeight, contactType, createdTick}`. Nesmí být uložena pouze jako lokální offset pod měnícím se měřítkem postavy. V každém renderu projektovat kotvu znovu, odvodit kotník z tuhé boty a IK. Screen y ukotvené nohy může být odlišné od screen y kořene, aniž noha stojí na schodu. Schodem by byla změna **světového H**, nikoli rozdíl v obrazové souřadnici y.

Vyhlazovat požadovaný směr a plán budoucích kroků; nevyhlazovat samostatně projekci kotvy nebo měřítko. Zpožděné měřítko proti aktuální perspektivě oporu rozjede. Podrobné řešení končetin je v C.

# B. Chování davu a nepřekročitelnost

## B1. Tři různé obálky a rozsah záruky

1. **Fyzické tělo:** disk v rovině X,Z, výchozí poloměr `rBody=0.23 m`. Pro konkrétní postavu minimálně `shoulderWidth/2 + coatMargin`, výchozí coatMargin=0,04 m. Různé velikosti mají vlastní rBody. Průměr 0,46 m je konzervativnější než samotná zadaná šířka ramen 0,323 m a zahrnuje část pohybu rukou.
2. **Osobní prostor:** měkká preference, výchozí boční poloměr 0,42 m na osobu, individuálně 0,35–0,50 m. Nesmí tvořit tvrdou nepřekročitelnou zeď.
3. **Vizuální obálka:** celý sprite, ruce, hlava a kelímek. Překryv sprite v obraze při různých hloubkách je normální zakrývání, nikoli průchod těly. Renderovat správně podle hloubky. Záruka níže se vztahuje na fyzické disky a statické překážky, ne na zákaz jakéhokoli překryvu průhledných PNG.

Pro výrazně vystrčenou paži rozšířit rezervovaný fyzický obal před zahájením činnosti, je-li pro něj místo; při animaci nesmí kolizní poloměr náhle narůst do souseda. Přesné kolize jednotlivých rukou či bot lze později řešit kapslemi, ale nejsou implicitně zaručené tělovým diskem.

Dosavadní poloměry `0.55–0.8 × shoulderWidth` odpovídají asi 0,178–0,258 m. To jsou spíš rozměry těla než úplný osobní prostor. Násobič 1,3 nesmí nahrazovat oddělení obou významů.

## B2. Parametry pro první implementaci

Hodnoty N jsou doporučené výchozí nastavení tohoto náměstí. Zdroje podpírají princip, nikoli každé uvedené číslo.

| Parametr | Výchozí | Jednotka | Rozsah / pravidlo | Původ / opora |
|---|---:|---|---|---|
| Pevný krok | 1/60 | s | neměnný | U |
| Aktualizace prediktivních preferencí | 15 | Hz | každé 4 tick; tvrdá bezpečnost vždy 60 Hz | N |
| Preferovaná rychlost korzování | 0,9 | m/s | 0,7–1,2 | U, N |
| Běžná rychlost | 1,3 | m/s | do 1,5 pro tuto verzi | U, N |
| Maximální rychlost | 1,5 | m/s | spěch mimo základní scénáře | N |
| Fyzický poloměr | 0,23 | m | 0,20–0,28, nikdy pod obal assetu | N |
| Osobní boční poloměr | 0,42 | m | 0,35–0,50 | N; variabilita [S6] |
| Přední / zadní osa měkké obálky | 0,75 / 0,32 | m | 0,6–0,9 / 0,25–0,4 | N |
| Predikční horizont | 3,0 | s | 2,5–4,0 | N; anticipace [S3, S4] |
| Sociální sousedství | 8 | m | tvrdé kontroly všech párů, bez FOV filtru | N |
| Dopředné komfortní zrychlení | 0,8 | m/s² | 0,5–1,0 | N |
| Komfortní brzdění | 1,4 | m/s² | 1,0–1,8 | N |
| Boční komfortní zrychlení | 0,9 | m/s² | 0,6–1,2 | N |
| Celková změna v komfortním kroku | 1,4 | m/s² | disk dosažitelných rychlostí | N |
| Změna směru pohybu | 90 | °/s | 60–120 při v>0,2 m/s | N |
| Odchylka trupu od směru rychlosti | 15 | ° | běžná; větší vyžaduje přešlap / otáčení | N |
| Reakční vyhlazení požadavku | 0,20 | s | 0,15–0,30, před bezpečnostním řešením | N |
| Preference pravé strany | +1 | volba | měkká; neprocházet zdí kvůli pravidlu | N; strana je konvence scény |
| Paměť zvolené strany | 1,5 | s | prodloužit do ukončení setkání | N |
| Běžná boční odchylka | 0,2–0,6 | m | není tvrdý limit; koridor má přednost | N |
| Sledovací čas za pomalejším | 0,8 | s | 0,6–1,2 | N |
| Rezerva ve frontě mezi středy | 0,65 | m | 0,60–0,80 a ≥ součet rBody+0,10 | N |
| Rozestup dvojice vedle sebe | 0,75 | m | 0,65–0,90 | N; formace [S5] |
| Rozestup dvojice v zástupu | 0,85 | m | 0,75–1,05 | N |
| Přechod formace | 1,5 | s | 1–2,5; skutečně dojít na nové místo | N |
| Pozdrav / rozhovor, středy | 1,0 | m | 0,85–1,30 | N; kontextová proxemika [S6] |
| Kolizní numerická rezerva | 0,002 | m | navíc k součtu fyzických poloměrů | N |
| Kontrola výpočtu vzdálenosti | 1e−7 | m | diagnostická tolerance; ne zamýšlená penetrace | N |
| Limit projekčních sweepů | 64 | průchodů | druhý pokus 256; poté bezpečný fallback | N |
| Výchozí poloviční šířka běžného koridoru | 1,2 | m | uživatel upraví podle obrazu | N |

Poloměr ani šířka koridoru se nesmí přepočítávat ze změny velikosti sprite v pixelech. Stojící postavy mají `velocity=(0,0)` a jsou pevné překážky pro ostatní, nikoli vyřazené objekty.

## B3. Trasy a plánování

Každá hrana grafu dostane světovou polyline, průchozí koridor a šířku. Samotná tenká čára nestačí k rozhodnutí, zda lze obejít frontu nebo předjet. Uživatel kreslí také nepřístupné plochy stánků, stromku, stolů a okraje pochůzné země. Všechny překážky jsou ve světových metrech a plánovač je rozšíří o poloměr daného chodce.

Globální cesta: deterministická Dijkstra/A* po grafu s tie-breakem podle ID; lokální vyhýbání může využít šířku koridoru, nesmí však teleportovat na jinou hranu. Ve volné ploše nebo kolem fronty použít krátkou pomocnou cestu například visibility graph kolem nafouknutých konvexních překážek. Social force ani ORCA samy neřeší spolehlivě cestu kolem konkávní bariéry.

Preferovaný směr míří k look-ahead bodu 1–2 m podél přidělené cesty, nikoli k nejbližšímu grafovému uzlu bez ohledu na směr. Postup podél cesty má per-agent index a obloukovou souřadnici; u křížení se nesmí přepnout na jinou hranu jen podle nejbližšího bodu.

## B4. TTC a minimum předpokládané vzdálenosti

Pro dvojici i,j:

`r = p_j − p_i`, `w = v_j − v_i`, `R = rBody_i+rBody_j`.

Budoucí relativní poloha je `r(t)=r+w t`. Při `A=w·w`, `B=2r·w`, `C=r·r−R²`:

- Je-li C≤0: již existující kontakt/průnik — nesmí vzniknout jako validní spawn; samostatně zaznamenat.
- Je-li A≈0 nebo `r·w≥0` a C>0: budoucí TTC=∞.
- Je-li diskriminant `B²−4AC<0`: TTC=∞.
- Jinak první nezáporný kořen `(-B−sqrt(B²−4AC))/(2A)` je TTC, pokud leží v horizontu.

Minimum vzdálenosti do horizontu T:

\[
t_*=\operatorname{clamp}\left(-\frac{r\cdot w}{w\cdot w},0,T\right),\qquad d_*=\|r+w t_*\|.
\]

Pro nulovou relativní rychlost nastavit `t*=0`. V implementaci použít numericky stabilní řešení kvadratické rovnice při téměř tečném kontaktu; diskriminant lehce pod nulou v toleranci ošetřit konzervativně. TTC není čas do průsečíku dvou nekonečných tras. Lidé mohou projít stejným bodem v různý čas bezpečně.

Pro osobní prostor počítat obdobnou veličinu s měkkým Rcomfort. V základní verzi použít `Rcomfort = rComfort_i+rComfort_j`. Volitelně podporovat směrové elipsy: podpůrný poloměr elipsy v jednotkovém směru n je `sqrt((a dot(n,d))²+(b dot(n,right))²)`; podle znaménka podélné složky použít přední/zadní osu. Součet podpůrných poloměrů je konzervativní směrový práh, ne přesný výpočet střetu dvou rotujících elips. Pro pohybující se míjení nesmí velká přední osa vynucovat zbytečné trvalé brzdění; použití elips je pouze měkká penalizace.

## B5. Předvídavá volba rychlosti — preferovat malý úhyb

Pro každého chodce vytvořit konečnou, deterministicky seřazenou sadu kandidátů. Všechny hodnotit ze stejného snapshotu, ne postupně podle už aktualizovaných sousedů.

- Směry kolem požadované trasy: 0°, ±5°, ±10°, ±15°, ±22,5°, ±30°, ±45°, ±60°. Přidat aktuální směr a stranu uloženého setkání.
- Rychlosti: 1,00 / 0,95 / 0,85 / 0,65 / 0,40 / 0 násobek preferované rychlosti. Přidat aktuální rychlost.
- Cílového kandidáta převést do komfortně dosažitelné oblasti za 0,25 s; bezpečnostní řešení pro následující tick omezuje skutečnou změnu za dt. Prediktivní rollout používá postupný přechod během 0,25 s a pak cílovou rychlost, nikoli okamžitý skok směru. Počítat 0,1s úseky, na každém analytické minimum vzdálenosti. Pro druhou osobu základní verze používá její poslední schválenou rychlost.
- Kandidáty mimo koridor / s budoucím průchodem pevnou překážkou vyřadit. Vyřadit i predikovaný tělový střet, pokud existuje bezpečný kandidát. Když není žádný, zvolit nejméně rizikový brzdný požadavek a nechat finální bezpečnostní řešení zabránit průniku.

Navržené bezrozměrné skóre:

\[
C=12(1-s/s_{pref})^2+1.2(\Delta\theta/30^\circ)^2
+0.25\|v-v_{prevPref}\|^2/(0.3\,\mathrm{m/s})^2
+4\sum_j\frac{\max(0,1-d_{*,j}/R_{comfort,ij})^2}{1+t_{*,j}/(1\,\mathrm{s})}
+C_{route}+C_{side}+C_{formation}.
\]

`Croute=2*(predictedCrossTrack/0.5m)²`; `Cside=0.4` při porušení právě zvolené průchozí strany, jinak 0; `Cformation=0.5*(slotError/0.4m)²`, ale nesmí přebít kolizi. Pokud je více téměř shodných kandidátů, rozhodne stabilní pořadí, nikoli nový random draw. Koeficienty jsou N; testy míjení rozhodnou, zda je potřeba je upravit.

Výhled 3 s při 1,3 m/s poskytuje necelé 4 m dopředné dráhy. Při rychlém protisměru kontrolovat všechny páry, i když jsou více než 4 m od sebe. Parametr sociální sousedství 8 m je jen optimalizace skóre; u 30 osob lze bezpečně hodnotit všechny.

**Pravá strana:** v souřadnicích X doprava/Z od kamery je pro jednotkový směr d pravý vektor `right=(d.z,−d.x)`. Při čelním setkání obě osoby preferují vlastní pravou stranu; jde o opačné světové posuny. Volbu uložit pod klíčem `(minId,maxId)` a držet, dokud se dvojice nemine a nevzdaluje se alespoň 0,5 s. Nepřepínat stranu podle nepatrné změny skóre každý snímek. Pokud pravá strana není průchozí, zvolit levou a tuto volbu také držet.

**Křížení:** vyhodnotit časové intervaly obsazení konfliktní oblasti, ne pouze vzdálenost k jejímu středu. Přednost má dřívější předpokládaný vstup; při rozdílu pod 0,25 s rozhodne dříve vytvořený encounter a poté ID. Rozhodnutí se drží do vyřešení setkání. Ten, kdo dává přednost, může zvolit trasu za zády druhého nebo mírně zpomalit. Zrychlovat „před nos“ není výchozí strategie. Později zjištěná fyzická nebezpečnost má přednost před přidělenou předností.

**Předjíždění:** za pomalejším nejprve vyzkoušet volný boční koridor. Není-li volný, sledovací rychlost přibližně `v≤max(0,(gap−gap0)/headway)` v podélném směru, s gap0=0,15 m mezi obaly a headway=0,8 s. Je to komfortní požadavek, ne důkaz bezpečnosti. Neomezovat každého vpředu stojícího člověka, pokud leží bezpečně vedle trasy.

## B6. Pevná nepřekročitelnost během celého kroku

**Nestačí:** odpudivá síla, omezeně rychlé rozestoupení po penetraci, finální kontrola jen na konci kroku nebo vypnutí vzájemného úhybu členů dvojice.

Použij společný vektor rychlostí `V=(v1x,v1z,...,vNx,vNz)` a najdi bod nejbližší požadovaným rychlostem při současném splnění omezení. Doporučený cíl:

\[
\min_V\frac12\sum_i w_i\|v_i-v^{want}_i\|^2,\quad w_i=1\text{ běžně}.
\]

Stojící ve frontě, u stolku nebo při pozdravu mají obě složky v_i pevně 0, jejich proměnné se ze solveru odstraní. Nejde o velkou, ale konečnou „hmotnost“. Priority tras lze dát měkkou vahou 1–2; nesmějí zrušit kolizní podmínku.

Pro každý pár spočti z aktuálního validního stavu:

`n=(pi−pj)/d`, `d=|pi−pj|`, `R=rBody_i+rBody_j`.

S numerickou rezervou g=0,002 m použij efektivní práh `Rstep=min(R+g,d)` a podmínku:

\[
\boxed{n\cdot(v_i-v_j)\geq\frac{R_{step}-d}{dt}.}
\]

To je jedna lineární nerovnost v 2N proměnných. `min` zajišťuje, že nulové rychlosti zůstávají přípustné i při mezeře menší než g, pokud současný stav není fyzicky penetrující. Ve validním spawn stavu požadovat plnou rezervu. V blízkém kontaktu není nutné nutit lidi okamžitě od sebe; stačí nezmenšit bezpečnou mezeru. Osobní prostor vrátí měkký plánovač později.

**Proč podmínka brání i průletu mezi snímky:** pro lineární pohyb v rámci ticku `r(t)=pi−pj+t(vi−vj)` je projekce na pevnou normálu n lineární a na obou koncích ≥Rstep. Proto pro každé t∈[0,dt] platí `|r(t)|≥n·r(t)≥Rstep≥R`. Je to dostatečná a konzervativní podmínka pro disky, nikoli optimální řešení všech budoucích interakcí. Normálu znovu spočti v dalším ticku. Fyzikálně nenatáčej disky podle směru.

V matematicky přesné aritmetice tak lze zachovat invariant z nepenetrujícího počátku. V JavaScript Float64 je nutné použít rezervu a nezávislou konzervativní kontrolu; „nikdy“ neznamená ignorovat numerickou toleranci. Nepřípustný výsledek se nesmí commitnout.

**Pevné překážky:** rozložit neconvexní půdorysy na konvexní části. Pro každou relevantní část najdi nejbližší bod q na obvodu a jednotkovou vnější normálu n=(p−q)/|p−q|. Konvexní překážka leží na opačné straně podpůrné přímky. Požaduj `n·(p+dt·v−q)≥rBody+g`, nebo menší už existující bezpečnou vzdálenost analogicky výše. Na ostrém vrcholu je normála od nejbližšího vrcholu k p platná podpůrná normála. U zdi použít nafouknutý segment/kapsli. Pro všechna omezení musí aktuální bod ležet na bezpečné straně; vnitřní bod překážky je chyba validace, nikoli důvod vymyslet normálu.

**Průchozí koridor:** příslušné lokální konvexní buňky musí obsahovat celý swept disk; hranice buňky posunout dovnitř o rBody. Přechod mezi buňkami povolit přes společný portál, který má dostatečnou šířku. Jediný globální konvexní obal konkávní pochůzné plochy je špatně.

Přidat konvexní omezení rychlostí. Limit absolutní rychlosti je tvrdý; zbývající limity jsou komfortní:

- `|vi|≤vmax` — zůstává i v nouzovém solve;
- `|vi−vi_old|≤1.4·dt`;
- podélně k předchozímu směru zrychlení nejvýše `+0.8·dt`, brzdění nejvýše `−1.4·dt`;
- bočně změna nejvýše `±0.9·dt`;
- při významné nenulové rychlosti směrový kužel ±ωmax·dt kolem aktuálního směru; obsahuje i nulu.

Zrychlení a směrový kužel mohou být v nouzi neproveditelné. Bezpečnost a nepronikání mají přednost. Nikdy nevyřešit bezpečnou rychlost a pak ji mimo solver libovolně omezit nebo low-pass filtrovat; tím by se bezpečná množina mohla opustit.

### B6.1. Solver použitelný v TypeScriptu

Průnik poloprostorů a disků rychlosti je konvexní; se všemi vahami 1 jde o eukleidovskou projekci. Pro ≤30 osob stačí Dykstrova cyklická projekce s rezidui [S12, S13], stabilním pořadím omezení a striktní validací výsledku. To není totéž jako několik nezávislých posunů penetrujících těl.

Pro poloprostor `a·V≥b`, diagonalní W:

`P(V)=V + max(0,b−a·V)/(a·W⁻¹a) · W⁻¹a`.

Disk jedné osoby se stejnou vahou pro obě složky se projektuje běžným radiálním clampem. Pevně stojící osoby jsou eliminované proměnné. Dykstrova korekce se při novém ticku bez správně transformovaného warm startu resetuje; v první verzi vždy nula. U řídkého párového poloprostoru stačí uložit skalár rezidua a čtyři nenulové koeficienty.

```ts
function projectDykstra(want: Float64Array, sets: ConvexSet[], sweeps: number) {
  let x = want.slice();
  const residual = sets.map(s => s.zeroResidual());
  for (let k=0; k<sweeps; ++k) {
    for (let c=0; c<sets.length; ++c) {
      const y = addSparse(x, residual[c]);
      const z = sets[c].project(y);
      residual[c] = subtractSparse(y, z, sets[c].support);
      x = z;
    }
  }
  return x;
}
```

Použít 64 sweepů, pak ověřit všechna omezení i spojité vzdálenosti. Když výsledek není validní, zkusit 256 sweepů; pokud je problém komfortní neproveditelnost, druhé řešení odstraní pouze komfortní limity zrychlení a směru, nikoli těla, překážky, vmax nebo platné opory. Zaznamenat `emergencyComfortViolation`. Ani vyšší počet iterací se nesmí vydávat za automatickou záruku konvergence ve zvoleném čase.

Poslední bezpečný fallback pro celou simulaci je nulový posun všech chodců v daném ticku při zachování posledních validních kontaktů a bez posunu překážek. Nula je při validním statickém světě přípustná. Tento fallback není přijatelný běžný způsob vyhýbání; testovací scénáře mají mít jeho počet nula. Následná obnova pohybu je plánovaná, ne dodatečné odtlačení. Při libovolně hustém nebo zablokovaném světě nelze současně zaručit nepřekročitelnost, vždy plynulé zrychlení a dokončení všech tras.

### B6.2. Nezávislá spojitá kontrola a commit

Pro každý pár ověřit skutečnou navrženou rychlost, nikoli preferovanou:

```ts
function sweptDistance(pi: V2, pj: V2, vi: V2, vj: V2, dt: number) {
  const r = sub(pi,pj), w = sub(vi,vj);
  const ww = dot(w,w);
  const t = ww < 1e-16 ? 0 : clamp(-dot(r,w)/ww,0,dt);
  return length(add(r,mul(w,t)));
}
```

Pro aktivní stav uchovávat bezpečný invariant `distance≥sumR+guard`, guard=0,0005 m. Konstruované omezení se snaží udržet g=0,002 m. Kandidát musí před committem projít kontrolou se guard, s konzervativní chybovou rezervou numeriky; pokud aktuální dvojice leží přesně na spodní hranici, nepovolit další zmenšení mezery. Je-li ověření nejisté, přijmout nulový posun. Nezaokrouhlovat polohy v metrech na pixely.

Stejně kontrolovat swept disk proti statickým překážkám. Podpůrné poloprostory dávají konzervativní záruku; nezávislý segment–nafouknutá překážka test pomáhá zachytit chyby normál a rozkladu. Pokud později pohyb uvnitř ticku nebude lineární, je nutné použít nový spojitý test nebo konzervativní subsegmenty; důkaz výše se na libovolnou kubickou dráhu automaticky nepřenáší.

Ve validní simulaci se těla **neopravují pozičním teleportem po penetraci**. Import scény s překrytím nebo nemožným spawnem se odmítne, případně se před spuštěním v editoru nabídne rozmístění; tato oprava není viditelnou chůzí.

## B7. Dvojice, fronta, pozdrav a zdroje

### Dvojice

Virtuální střed dvojice má trasu a preferovanou rychlost, ale není třetím fyzickým chodcem. Sloty při chůzi vedle sebe jsou `c ± 0.375·right`. Každý skutečný člen i nadále plánuje predikci, účastní se všech párových podmínek a může lokálně uhýbat. Formace je měkký příspěvek; follower nikdy není jen kopie polohy leadera s posunem.

Nutná šířka vedle sebe je přibližně `spacing+r1+r2+2*wallMargin`, při margin=0,10 m asi 1,41 m. Pro pohodlný režim začít řazení do zástupu, když dostupná šířka klesne pod tuto hodnotu +0,15 m, nejméně 2 m před portálem. Návrat vedle sebe až při šířce o dalších 0,25 m větší a stabilní dostupnosti po 0,8 s. Hystereze zabrání přepínání.

Při změně na zástup si předem určit leadera; druhý míří na bod 0,85 m za ním podél trasy. Sloty mohou být hladce interpolované, ale postavy do nich musí dojít řešeným pohybem. Udržovat bezpečnou minimální vzdálenost i mezi členy. Společná rychlost vychází z pomalejšího člena; dočasné roztažení formace do 1,2 m povolit, větší znamená přeskupení/čekání, ne přitažení teleportem.

Dvojice nevzniká vložením obou osob do téhož bodu. Při spawnu rezervovat dvě volná místa atomicky, nebo vytvořit druhého později. Při setkání existujících přátel přejít přes pozdrav na dva volné formovací sloty.

### Fronta u kávy

Čtyři explicitní světové sloty, jejich pořadí, vstupní bod za posledním slotem a výstupní bod odlišný od vstupu. Slot pitch výchozí 0,65 m. Obsluha začíná až po dosažení čelního slotu a uklidnění těla. Fronta plná: čekající jde k jiné činnosti nebo do samostatně definované čekací plochy; nesmí se překrýt s posledním slotem.

Rozlišit fyzicky přítomné lidi a rezervované sloty. Přítomní jsou pevné disky; rezervace je dopravní omezení pro plánování, není neviditelná fyzická osoba. Pro ostatní chodce vytvořit nepreferovanou zónu kapslí podél obsazené fronty rozšířenou o 0,2 m; zabrání proplétání mezi jednotlivými čekajícími, i když je tam matematicky úzká mezera. Vstup povolit pouze konkrétnímu držiteli rezervace přes konec fronty.

Po odchodu předního chodce se ostatní posunou krátkými kroky. Následující slot uvolnit teprve po fyzickém odchodu jeho držitele; nepřeznačit hromadně stejné pozice jako volné. Stojící lidé se neodstrkují, ale ostatní se jim plně vyhýbají. Při použití ORCA by vůči takovému sousedovi pohybující se chodec musel převzít celou korekci, nikoli předpokládat polovinu od stojícího.

### Stolky, koš a rozhovor

Stolek má skutečný nepřístupný půdorys a dva volné uživatelské sloty vně něj. Slot musí být alespoň `tableRadius+rBody+0.10 m` od středu kruhového stolku. Obsazení stolku a koše řešit jako zdroj s příchodem, používáním a odchodem, nikoli jako teleport na bod. Koš má jeden přístupový slot a samostatný obal překážky.

Pozdrav/rozhovor: rezervovat dva body asi 1 m od sebe mimo hlavní úzký koridor; oba na ně skutečně dojdou a natočí se přibližně k partnerovi. Orientace hlavy může partnera sledovat jemně; při dostupných pouze 3/4 pohledech použít nejbližší pohled a neotáčet celý sprite v rovině obrázku. Rozhovor je sociální stav s pevnými těly; obcházející je neodsunují. Po skončení nejprve uvolnit plán výstupu, pak slot.

### Úzký průchod

Rezervace patří celé konfliktní zóně portálu, ne pouze nulovému uzlu grafu. Zahrnout obal rBody a zastavovací místo před vstupem. Směr rezervace držet do fyzického opuštění zóny posledním členem skupiny. Dvojice v zástupu získá kapacitu pro dva, ale každý má stále kolizní kontrolu. Pořadí čekatelů: čas žádosti v ticku, poté ID. Starší žádost má přednost, nikoli osoba, které aktuálně vyšel menší obrazový odstup.

Timeout může zrušit rezervaci člověka, který ještě nevstoupil; nesmí uvolnit obsazený průchod. Pokud držitel uvnitř uvízne, spustit plánované vycouvání/přešlapy nebo diagnostiku neproveditelné scény. Lokální vyhýbání samo nevyřeší dvě skupiny čelně uvnitř průchodu pro jednoho.

## B8. Datové stavy, determinismus a hlavní smyčka

```ts
type Activity =
  | 'ENTER' | 'TRANSIT' | 'QUEUE_APPROACH' | 'QUEUE_WAIT'
  | 'QUEUE_ADVANCE' | 'SERVICE' | 'TABLE_APPROACH' | 'DRINK'
  | 'BIN_APPROACH' | 'DISPOSE' | 'MEET_APPROACH' | 'GREET'
  | 'PAIR_FORM' | 'PAIR_WALK' | 'EXIT';

interface Pedestrian {
  id: number;
  p: V2; v: V2; preferredV: V2;
  radiusM: number; comfortRadiusM: number;
  headingRad: number;
  activity: Activity;
  groupId: number | null;
  resourceId: number | null;
  pathEdgeIndex: number; pathArcM: number;
  gait: GaitState; rngState: number;
}
```

RNG: například explicitní 32bit xorshift s nenulovým seedem; multiplikace a hash používat přes `Math.imul` a `>>>0`. Samostatné streamy pro chování postavy, vzhled a sníh. Žádný `Math.random`, `Date.now` nebo změna počtu náhodných tahů podle renderu. Random tahy jen při definovaných událostech. Seřazení podle stabilního ID; při shodě priorit vždy explicitní tie-break.

Determinismus garantovat pro stejnou verzi aplikace, konfiguraci a běhové prostředí. Bitově identická čísla napříč různými JS enginy a implementacemi transcendentních funkcí nejsou automaticky zaručena; požadavek mezi platformami znamená připnutý runtime nebo deterministickou matematickou vrstvu. Export nesmí měnit simulaci podle GPU snímkové frekvence.

```ts
function tick(state: WorldState): void {
  const dt = 1/60;
  const old = snapshotInIdOrder(state);
  validateCommittedState(old);

  // Požadavky a přidělení zdrojů atomicky; spawn pouze pokud validní.
  const staged = stageEventsReservationsAndAdmissibleSpawns(old, state.tick);
  const snap = snapshotInIdOrder(staged);

  if (state.tick % 4 === 0)
    computeAllPreferredVelocitiesFromSameSnapshot(snap);

  const want = makeComfortableNextTickVelocities(snap, dt);
  const posePlan = previewGaitAndStanceReachability(snap, want, dt);
  const hard = makeAllPairStaticContactAndMaxSpeedConstraints(snap, posePlan, dt);
  const comfort = makeAccelerationAndHeadingConstraints(snap, dt);

  let result = solveAndValidate(want, hard, comfort, 64);
  if (!result.valid) result = solveAndValidate(want, hard, comfort, 256);
  if (!result.valid) result = solveAndValidate(want, hard, [], 256);
  if (!result.valid) result = safeZeroDisplacementWithRecoveryPose(snap);

  // Znovu kontrola spojité kolize a dosažitelnosti skutečné finální pózy.
  assertValidSweptMotionAndPose(snap, result, dt);
  commitAllPositionsSimultaneously(state, snap, result, dt);
  commitAlreadyValidatedGaitPlan(state, result.gaitPlan);
  advanceSnowContactsAndActivityClocks(state, dt);
  state.tick++;
}
```

`solveAndValidate` musí pro skutečné vyřešené rychlosti znovu sestavit finální gaitPlan, ověřit jeho opory a vrátit jej společně s rychlostmi. Při commitu se pouze převezme tato ověřená fáze a póza; nesmí se fáze posunout podruhé nebo znovu vypočítat jinak. Pokud retargeting finální pózy změní omezení pánve, solve se zopakuje z původního snapshotu s novým preview. `previewGaitAndStanceReachability` a finální pose kontrola jsou podrobně v C. Pokud se při řešení změní plánovaná pánev/fáze, nesmí se potichu commitnout neověřená póza; transakci znovu spočítat z téhož snapshotu nebo použít recovery. Nové události se nesmějí při retry náhodně vylosovat jinak.

Pro offline video je snímek k ve stavu tick=2k. Exportovat počáteční stav k=0 a mezi dalšími snímky udělat přesně dva kroky simulace. Pro preview s jinou frekvencí použít interpolaci **světových** stavů; opory znovu projektovat a IK vyřešit pro interpolovaný čas. Neinterpolovat výsledné obrazové pozice stojné boty nezávisle na postavě.

Pro N=30 existuje 435 párů. Kontrolovat všechny je jednoduché a odstraní chyby od neúplného FOV nebo limitu sousedů. Prediktivní scoring lze dělat 15 Hz, tvrdá omezení a integraci vždy 60 Hz. Použít předalokované Float64Array, řídké čtyřprvkové párové řádky, žádné alokace v každém vnitřním testu a žádné DOM operace. Cíl p95 simulace <5 ms/tick na zvoleném referenčním počítači; musí se změřit, není to slib z odhadu. Při pomalém exportu zpomalí export, nikoli simulovaný čas nebo počet bezpečnostních iterací.

# C. Končetiny, kroky a odstranění „schodů“

## C1. Příčiny skoků kolen

Kontrolovat v tomto pořadí:

1. Obrazový posun do hloubky je omylem přičten jako fyzická výška kotníku vůči pánvi. Pak se rovina země pro IK mění ve schody.
2. Pata je ukládána v pixelech / lokálním prostoru a po změně měřítka nebo zrcadlení se její poloha přepočte jinak.
3. Jedna délka nohy je současně požadována pro fyzickou anatomii i pro promítnutou obrazovou délku. Tyto veličiny nejsou stejné.
4. `acos` je poblíž plně nataženého kolena citlivý na malou změnu vzdálenosti. Pro `cosκ=(d²−a²−b²)/(2ab)` platí `dκ/dd=−d/(ab sinκ)`, což u κ→0 diverguje.
5. Změna pohledu otočí znaménko pole vectoru, přepne větev IK nebo resetuje lokální pivot.
6. Zkosení či délka je zaokrouhlená po prahových pásmech, případně se aplikuje tvrdý clamp ±15 % na více propojených transformací různým způsobem. Samotný spojitý clamp neskáče v hodnotě, ale vytváří zlom derivace; skutečný skok obvykle přidává přepnutí větve/pohledu nebo nespojitý vstup.
7. Kolizní oprava posune tělo až po výpočtu nohou a fázi stále pohání preferovaná rychlost.

## C2. Doporučené řešení: prostorové body, stále 2D malba

Není potřeba 3D renderer ani modelování postav. Uchovávat však body kostry jako **(X,Z,H) v metrech** a projekci provést až po kinematice. To je 2.5D rig: malované díly zůstávají 2D obrázky.

Planted foot: fixní X,Z opěrného bodu, H=0 nebo řízená komprese sněhu. Swing foot: světová trajektorie od posledního kontaktu k předem naplánovanému dalšímu kontaktu plus výška zvednutí H. Posun do hloubky nikdy nepřevádět na výšku H.

Pro reference heel/forefoot boty použít rozměry z A1, směr chodidla d v rovině země a svislou osu eH. Rotace boty o θ probíhá v rovině (d,eH). Ze známé paty nebo přednoží odvodit kotník pomocí stejné pevné transformace. Při přechodu heel→flat→forefoot použít body téže boty ve světě. Během švihu zůstává fyzická délka boty konstantní.

Dvoučlánková prostorová IK nepotřebuje obecný numerický solver. Pro kyčel P a kotník A:

`D=A−P`, `d=|D|`, `u=D/d`, `a=32q`, `b=30q`,
`c=(a²−b²+d²)/(2d)`, `k=sqrt(max(0,a²−c²))`.

Z kontinuálního směru chůze vytvořit přední vodorovný pole vector F. Odstranit jeho složku podél u:

`e = normalize(F − u·dot(F,u))`, `Knee=P+c·u+k·e`.

Je-li pole téměř rovnoběžný s u, promítnout předchozí platný e do nové kolmé roviny a normalizovat. V úplné degeneraci použít deterministickou pevnou pomocnou osu; držet znaménko kompatibilní s předchozí větví. Zrcadlení textury na e nemá vliv. U pravé a levé nohy je koleno anatomicky vpřed; zrcadlit obraz neznamená obrátit anatomickou flexi.

Před výpočtem ověřit `|a−b|<d<a+b`. Pokud cíl není dosažitelný, upravit plán budoucího došlapu nebo pánev; neprovádět skryté fyzické natažení. Světovou pánev lze plynule upravit zhruba o ±0,02 L; větší opakovaná korekce je chyba kalibrace/plánu, která se musí ukázat v debug režimu.

## C3. Vazba s bezpečným pohybem těla

Fázi ustálené chůze pohání skutečná přijatá délka dráhy `ds=|pNew−pOld|` ve světě, včetně boční složky. Integrace `phase += ds/latchedStrideLength` s explicitními událostmi kontaktů. Ne `totalDistance/currentStrideLength`; ne obrazová dráha; ne požadovaná rychlost před vyhýbáním.

Délka konkrétního dalšího kroku je naplánovaná a uložená. Budoucí došlap lze v časném švihu jemně upravit podle změny trasy, ale v posledních přibližně 20 % švihu cíl zamknout a změny řešit dalším krokem. Velká změna v posledním okamžiku nesmí natáhnout nohu ani přesunout stojnou oporu.

**Kontaktní dosažitelnost patří do plánování rychlosti.** Při dané plánované výšce kyčle Hhip a kotníku Hank je maximální horizontální vzdálenost:

`rho = sqrt(Lsafe² − (Hhip−Hank)²)`.

Pro stojnou nohu musí `|rootXZ + hipOffsetXZ − ankleXZ|≤rho`. To je disk povolených pozic kořene, tedy po dosazení `rootNext=root+dt·v` také konvexní disk rychlostí. V dvojí opoře platí oba. V průběhu jednoho solve zmrazit offset kyčle a plánovanou výšku, jinak už nejde o deklarované pevné konvexní omezení. Poté ověřit finální pózu. Při významné změně headingu/pánve udělat nový preview a solve z téhož snapshotu. `Lsafe` držet jen nepatrně pod L, například `L·0.9999`; větší trvalá rezerva by vynucovala podřep.

Fallback nulového pohybu používá aktuální validní výšku pánve a aktuální kontakty, takže si sám nevytvoří nedosažitelnou oporu. Nedokončený švih přejde do časově řízeného recovery kroku na dosažitelnou volnou pozici; fáze nesmí zůstat navždy zmrazená s nohou ve vzduchu. Kroky z klidu, zastavení, přešlap a zotavení jsou časové přechody. Při neproveditelném recovery se v debug/export validaci hlásí chyba, nikoli přilepení boty na náhodný bod.

**Boční úhyb:** při běžném míjení nejprve mírně změnit trajektorii těla a směr budoucího kroku. Typická dodatečná boční složka jednotlivého došlapu 0,05–0,12 m, výchozí limit 0,18 m (N). Pokud požadavek vyžaduje výrazný boční přesun při téměř stojícím těle, spustit skutečný boční přešlap: odlehčit jednu nohu, přemístit ji, převzít váhu, přisunout druhou. Není přípustné posunout obě opory současně po podlaze.

Světová trajektorie nemusí dokonale odpovídat preferované orientaci trupu; běžný rozdíl držet přibližně do 15°. Při větší změně přejít na zatáčecí kroky. Přepnutí končetiny k nové kotvě má přesný čas uvnitř ticku; nezahazovat překročené kontaktní události při nižší render frekvenci.

## C4. Jak promítnout kosti do malovaných dílů

Každý kloub nejprve projektovat přes A3. Pro díl mezi klouby B a E je obrazová osa `e=project(E)−project(B)`. Pozice a rotace dílu vycházejí z této osy a jeho pivot metadata, nikoli z klinického úhlu kolena přímo aplikovaného na 2D PNG.

**Důležitý limit:** přesnou perspektivní projekci pohybu do hloubky nelze obecně zobrazit jedním tuhým 2D dílem s konstantní obrazovou délkou. Skutečná kost má stále stejnou délku v metrech, ale její promítnutá délka se mění. Proto jsou dvě explicitní varianty:

- **Doporučená varianta:** fyzické délky konstantní, obrazový díl se otočí a podélně přizpůsobí promítnutým koncovým kloubům. Nejde o fyzicky gumovou nohu, nýbrž o zkrácení projekcí. Příčné měřítko vychází z f/Z ve středu dílu. Zkosení celé nohy jako náhradu hloubky odstranit.
- **Striktně tuhé PNG pouze posun/rotace:** použít pohledově/pose-specifické díly nebo přijmout přibližnou projekci. Nelze současně slíbit přesné klouby, všechny směry, pevné obrazové délky, neměnné pivoty a nulový skluz bez dalšího stupně volnosti.

Pro doporučenou variantu:

`scaleAlong = |e| / assetJointDistancePx`,
`scaleAcross = (f/Zmid) · metersPerAssetPixel`,
`rotation = atan2(e.y,e.x) − assetBoneAxisAngle`.

To je afinní transformace v rámci jednoho dílu; nevytváří se ohýbaná síť. Promítnutá délka se **nesmí následně samostatně clampnout na ±15 %**, protože by už oba konce nesedly na vypočtené klouby. Nejprve lze ±15 % používat jako diagnostický limit vzhledem k příslušnému pohledovému referenčnímu dílu; opakované překročení znamená změnit referenční díl nebo rozsah podporovaných póz, ne rozpojit kotník. Některé platné směry a fáze přirozeně vyžadují více než 15 % projekčního zkrácení.

Konkrétní vizuální kompromis musí být v konfiguraci `projectionMode`, nikoli skrytá sada výjimek podle směru. Pro první verzi otestovat skutečný poměr zkrácení u obou 3/4 assetů a uložit jeho histogram; nepředstírat, že univerzální mez 0,85–1,15 je fyzikální zákon.

## C5. Čtyři směry z pouhých dvou pohledů

Výběr přední/zadní 3/4 podle znaménka světového vZ; levá/pravá varianta podle vX. Při malé složce držet předchozí volbu: například hystereze 0,12 na normalizované složce směru a stabilita nové volby 0,15 s. Při v<0,15 m/s použít směr činnosti/poslední stabilní heading, nikoli náhodný směr malého vektoru.

Zrcadlit **texturu a její pivot metadata**, ne světové kotvy, ID levé/pravé nohy nebo celý fyzický root pomocí scaleX=−1. Kinematická kostra a světové kontakty pokračují bez resetu. Změnu assetu provést ideálně v dvojí opoře, případně 0,12–0,20 s kontrolovaný přechod. Blend nesmí vytvořit dva prostorově odlišné obrysy stojné boty; společný aktivní kontakt obou obrázků se zarovná na stejný projektovaný bod.

Při téměř čisté chůzi ke kameře nebo od ní je dostupný 3/4 obrázek **stylizací**, nikoli přesným pohledem na anatomii. Horizontální amplitudu kroku nezvětšovat, aby se „vešel“ do 3/4. Směr pohybu musí zůstat podle skutečné trasy. Nový čistě čelní/zadní pohled celé postavy není v této verzi vyžadován, ale lze potřebovat doplňkový pohled samotné boty, aby viditelná podrážka nevyžadovala extrémní deformaci.

Tři kontaktní body boty v její sagitální rovině se při přímém čelním pohledu mohou promítnout téměř na jednu přímku. Pokus vynutit jejich přesnou shodu v jednom bočním PNG přes invertovanou afinní matici je numericky nestabilní. Při takové degeneraci použít pohledový asset boty ukotvený aktivním kontaktem a jeho kalibrovanými metadaty; neobcházet degeneraci obrovským shear. Pro plnou přesnost všech opěrných bodů je potřeba dostatečná sada pohledů nebo deformovatelná/objemová reprezentace boty. Tento limit dvou 3/4 maleb nelze odstranit samotnými vzorci IK.

## C6. Jak má vypadat chůze ke kameře

- Kořen se po obraze posouvá dolů nelineárně a postupně zrychluje v pixelech, přestože světová rychlost je konstantní.
- Celá postava se zvětšuje podle 1/Z; levá a pravá opora mohou mít mírně jiné Z a tedy jiné lokální měřítko.
- Dopředný krok na zemi je obrazově mnohem menší než stejně dlouhý boční krok. Na středu scény jeho poměr plyne z K_local, nikoli z konstanty 0,4.
- Zvednutí boty je změna H, která se promítá přibližně jako `−(f/Z)·ΔH`. Proto může obrazové zvednutí švihové boty být větší než její dopředný posun po zemi. To samo o sobě není sestup po schodech.
- Koleno se ohýbá ve světě; jeho sagitální ohnutí může být v téměř čelním pohledu obrazově slabé. Nesnažit se ho nahradit velkým vybočením do strany.
- Nohy se přirozeně překrývají podle hloubky. Vrstevní pořadí používat stabilně podle Z jednotlivých částí a topologie postavy, s tie-breakem na ID části. Neprohazovat je podle jediného hlučného prahu úhlu.

Například při y=1080 je 2cm výška boty asi 1,93 px. Krok 0,6 m ke kameře se promítne přibližně na 7,21 px, zatímco stejný boční krok na 57,94 px. Při y=900 jde zhruba o 0,54 px zvednutí a jen 0,54 px hloubkového kroku proti 16,05 px bočního kroku. Hodnoty pohybu po zemi se u konečného kroku mírně liší od lokálního Jacobiánu, viz E.

## C7. Vyhlazení bez porušení kontaktů

Směr budoucího kroku / požadovanou orientaci filtrovat například `alpha=1−exp(−dt/tau)`, tau=0,15–0,25 s, úhel přes nejkratší rozdíl po rozbalení fáze. Poté omezit rychlost změny plánovaného směru. Filtr je před bezpečnostním solverem a před plánováním kontaktu, nikoli na jeho již schváleném výsledku.

Pro swung IK lze použít měkké přiblížení k maximálnímu dosahu; například s d0=0,995 L a w=0,005 L `dSoft=d0+w(1−exp(−(d−d0)/w))` pro d>d0. Je to estetická úprava **švihového cíle**, nikoli platné řešení pevně stojného chodidla. U opory musí vyřešit přesný kontakt pánev a plán pohybu. Nepoužívat tuto funkci k odtažení ukotvené paty.

Nehladit finální kolenní úhel samostatně po IK, protože by se kotník odpojil od opory. Omezovat plynule trajektorii cíle, pánev a pole vector. Změna výšky pánve pro korekci dosažitelnosti má vlastní plynulý plán; když tvrdá podmínka vyžaduje rychlejší změnu než komfort, upravit budoucí krok / rychlost kořene dříve, ne až na hranici dosahu.

## C8. Paže a kelímek

Volná paže je vůči stejnostranné noze přibližně v protifázi. Švih řídit skutečnou lokomoční fází a při zpomalování plynule zmenšovat amplitudu; nechat drobné doznívání v časovém stop přechodu. Při běžné chůzi může zůstat dosavadní jemný rozsah, například střed −3,5° a amplituda 8–14°, u pomalé chůze menší. Jsou to animační hodnoty N; není důvod nutit paže k výraznému houpání.

Ruka s kávou má zvláštní stav `CARRY_CUP`: cíl zápěstí v lokálním prostoru trupu, např. před pasem, minimální kyv a kelímek orientovaný vzhůru ve světě. Druhá paže může dál jemně kmitat. Rozměry ruky a pivot kelímku kalibrovat podle assetů, nikoli odhadovat z obdélníku PNG.

`SIP`: přechod 0,6–1,0 s k cíli u úst, podržení 0,5–1,2 s, návrat 0,6–1,0 s (N). Použít dvoučlánkovou IK ruky, stabilní větev lokte a plynulý cíl, ne přímo lineární interpolaci dvou nesouvisejících úhlů. Zkontrolovat dosah skutečného nadloktí a předloktí. Hlava se mírně skloní; není nutné hýbat celou pánví. Pití během chůze je možné, ale výchozí chování na tržišti ať pije až u stolku nebo po zastavení. Stojící tělo je stále pevná překážka pro dav.

# D. Sníh, zaboření a stopy

## D1. Kde sníh je

**Doporučení: uživatelské polygony sněhu ve světové rovině**, případně měkká namalovaná maska v návrhových pixelech. Každá oblast má `depthM`, `compressibility`, `footprintEnabled`, `surfaceStyle` a prioritu. Výchozí viditelná komprese 0,02 m, rozsah 0,01–0,03 m, horní mez 0,04 m pro tento jemný efekt (N). Skutečná hloubka závisí na materiálu a zátěži; nejde o univerzální měření zimního sněhu.

Výchozí maska odvozená jen z bílé barvy pozadí je nespolehlivá: zamění střechy, světla, šálu nebo světlou dlažbu za sníh. Barvu lze použít jako návrh při kreslení masky, ale potvrzená oblast je autoritativní. Chodec na střeše nevznikne jen proto, že je tam bílá barva.

Uvažovat průnik půdorysu boty s polygonem, ne pouze pixel pod kotníkem. Na hraně sněhu maskovat jen odpovídající část boty. Styl a lokální šum ukládat podle světové polohy a seed, aby okraj neblikal v čase.

## D2. Komprese během kroku

Pro nový kontakt v čase t0 použít:

`u=clamp((t−t0)/0.12s,0,1)`, `smooth(u)=3u²−2u³`,
`delta=regionMaxCompression * contactLoad * smooth(u)`.

Výchozí doba 0,12 s, rozsah 0,08–0,18 s (N). `contactLoad` plynule odpovídá podpoře, v běžné plné opoře přibližně 1; nevytvářet náhodnou hloubku každý frame. Když je sněhu méně než delta, omezit delta na tloušťku. Opěrný bod má X,Z pevné a H=−delta. Jeho svislé sednutí je záměrná komprese, ne skluz.

Pánev přizpůsobit zatíženým oporám, typicky váženým průměrem komprese. Jinak by samotné snížení kotníku protáhlo nohu. Při odvalení zůstává zatížené přednoží v prohlubni a pata se zvedá. Po odlepení nenutit botu okamžitě vyskočit nad původní povrch; švihová křivka začíná v aktuální poloze a plynule projde nad H=0.

Kontakt, který už sedl, nezačíná nové zaboření při každém drobném zakolébání trupu. Přechod pata→přednoží během téhož kroku nevytvoří druhou celou stopu.

## D3. Levný 2D rendering

Pro každý kotník/botu vykreslit izolovanou vrstvu. Z ní maskou odebrat oblast, kterou zakrývá sníh; pak přidat malý nepravidelný lem před špičkou/podrážkou. U Canvas2D lze použít samostatný offscreen canvas a `destination-out` / `destination-in`; u GPU ekvivalentní maskovací shader. Obecné kompozitní režimy popisuje [S11].

Zásady:

- Masku vztáhnout k projektované sněhové ploše a aktuálnímu opěrnému bodu. Nepřilepit masku ke kotníku tak, že během zvedání cestuje s botou.
- Vzorek pozadí lze použít jako barvu/texturu lemu, ale nevykreslovat obdélníkovou kopii pozadí přes celé okolí — vymazala by jiné postavy nebo stopy. Vzorek omezit na lokální alfa masku boty a sněhového lemu.
- Hlubší část boty skrýt, ne celý sprite posunout dolů v pixelech. Světové H komprese už řeší její skutečnou polohu; maska přidává zakrytí, nemá přidat druhé stejné sednutí.
- Kontaktní stín je malá měkká tmavší oblast pod oporou, opacita přibližně 0,08–0,16 (N), barva studená šedomodrá podle pozadí. Nesmí vypadat jako černá díra.
- Při y=900 odpovídají 2 cm asi 0,535 px, při y=1080 asi 1,931 px. U vzdálených postav bude efekt přirozeně sotva patrný. Nedávat všem stejný 3px zářez.

## D4. Stopy

Vznik jednou na dokončené zatížení příslušného footfall ID; levá a pravá stopa mají vlastní variantu. Footprint obsahuje světový střed, yaw boty, skutečnou délku/šířku, seed textury, createdTick a expireTick. Délka základní boty podle A1 je přibližně 0,151 m; šířku odečíst z asset metadat, výchozí návrh 0,075 m. Půdorys je zaoblená podrážka s jemně odlišnou patou a špičkou; ne dvě náhodné kružnice.

Footprint je decal na zemi, promítá se projektivně. Při chůzi do hloubky má proto silné zkrácení. Není to stejně velká otočená kopie obrazové boty. Zakrýt části mimo sněhovou oblast a pod pevnými překážkami. Ztluštění kvůli čitelnosti připustit pouze v renderu do cca 1 px minimum, nikoli změnou fyzického kontaktu či stopy v metrech.

| Parametr | Výchozí | Rozsah | Původ |
|---|---:|---:|---|
| Životnost | 180 s | 60–600 s podle intenzity sněžení | N |
| Zmizování na konci | 30 s | 10–60 s | N |
| Pool aktivních záznamů | 16384 | konfigurovat podle maximálního toku | N |
| Ztmavení prohlubně | 0,08 | 0,04–0,15 | N |
| Výška světlého lemu | vizuální | subpixel až cca 1 px podle hloubky | N |

Při 30 lidech a 90 krocích/min vzniká asi 8100 stop za 180 s; při 130 krocích/min asi 11700. Pool 16384 tedy pokryje tento výchozí interval. Při delší životnosti už nejde tvrdit, že stejné maximum vystačí. Po naplnění deterministicky uvolnit nejstarší record a zapsat metriku dropCount. Pořadí stop i textur musí být nezávislé na počtu renderů.

Pro výkon dělit rovinu do dlaždic a cacheovat vrstvy stop; obnovovat jen změněné oblasti a změny fade. Při dlouhém videu nevytvářet neomezený seznam ani novou texturu na každý krok. Stopy nejsou překážky v kolizním modelu.

# E. Akceptační testy

## E1. Automatické invarianty — každý tick a také mezi tickami

| ID | Kritérium | Měření / tolerance |
|---|---|---|
| G1 | Nikdy necommitnout průnik fyzických těl. | Pro všechny páry analytické minimum během ticku ≥ ri+rj; provozní cíl navíc guard=0,0005 m. Numerická diagnostika 1e−7 m, žádná vědomá vizuální penetrace. Pro dvě výchozí osoby základní hranice 0,46 m. |
| G2 | Neproniknout pevnou překážkou. | Swept disk proti statickým konvexním dílům/segmentům, nejen kontrola koncových bodů. |
| G3 | Fronta a stolek se neodstrkují. | Při pevném stavu změna X,Z <1e−9 m; přechod do `QUEUE_ADVANCE` se měří zvlášť. |
| G4 | Žádné poziční opravy po commitu. | Počet `postSolvePositionPush` = 0. Kořen má pouze schválený integrovaný posun. |
| G5 | Platné spawny a nové poloměry. | Vložení pouze pokud platí G1/G2; dvě žádosti na stejném bodě nesmějí vytvořit dvě překrytá těla. |
| G6 | Žádné natažení fyzických kostí. | Světová délka stehna/lýtka odpovídá 32q/30q s chybou <1e−6 m. Obrazové projekční škálování se do této metriky nepočítá. |
| G7 | Dosažitelné opory. | Každá plánovaná/commitnutá póza musí splnit geometrický dosah. Chyba cílového kotníku <1e−5 m. |
| G8 | Skluz opory. | Projektovaný aktivní kontaktní bod vůči projekci své světové kotvy <0,25 výstupního px; testovat také 3840×2160. Při sněhu použít aktuální řízené H kotvy, nikoli původní H=0. |
| G9 | Rovina není schodiště. | Na suché ploše jsou všechny opěrné body H=0 ±1e−6 m; rozdíl jejich screen y není chyba. |
| G10 | Projekce a inverze. | Náhodné validní body: round-trip chyba <1e−6 m; numerická derivace proti J s tolerancí 0,01 px/s při malé perturbaci. |
| G11 | View/mirror nemění anatomii. | Při zmrazené světové póze přepnutí textury nezmění světové klouby ani fázi; aktivní kontakt dál G8. Žádná změna větve IK. |
| G12 | Rychlost respektuje čas. | V ustálené volné chůzi měřit skutečné m/s, nikoli pixely/s. Překročení vmax o více než 1e−6 m/s je chyba. |
| G13 | Bezpečnostní fallback není normální lokomoce. | Ve scénářích níže kromě explicitních neproveditelných/rezervačních situací emergency freeze count=0. Každý výskyt zaznamenat s důvodem. |
| G14 | Sníh jen v masce. | Žádné nové stopy v oblastech bez sněhu; stopa na hranici je oříznutá. Počet stop na footfall ID nejvýše 1. |
| G15 | Omezená paměť. | Aktivní footprint records≤16384; nedochází k neomezenému růstu za hodinový export. |

**Pozor na počátek:** nelze dokázat invariant „nikdy žádný průnik“, pokud vstup už obsahuje dvě osoby ve stejné pozici. Takový fixture má ověřovat odmítnutí spawnu/importu, nikoli následný zázračný bezprůnikový rozchod.

## E2. Míjení bez zbytečného brzdění

Pro každý encounter definovat okno od prvního predikovaného d*<Rcomfort v horizontu T do 0,5 s po definitivním míjení. Osoby nesmějí v tomto okně zároveň plánovaně zastavovat kvůli cílové aktivitě. Metriky počítat ze skutečné rychlosti:

`slowFraction = time(speed<0.8*freeSpeed)/encounterDuration`;
`speedLoss = integral(max(0,1−speed/freeSpeed)dt)/encounterDuration`;
`nearStopTime = time(speed<0.2m/s)`.

Pro volné **protijdoucí míjení** v koridoru širokém 3 m požadovat pro obě osoby `slowFraction≤0.05`, `speedLoss≤0.08`, `nearStopTime=0`. Boční odchylka nemá překročit 0,8 m od výchozí přímky, pokud není překážka. Nejvýše jedna změna zvolené strany, ideálně žádná. Jde o projektová kritéria N, nikoli univerzální empirické percentily.

U **křížení 90°** není nulové zpomalení podmínkou. Požadovat G1–G13, žádné vzájemné opakované zastavování a změny přednosti; jeden držitel přednosti a druhý plánované uvolnění. Ve volné ploše celkové zpoždění proti samotné chůzi výchozím testem ≤2 s na osobu, nečekané stání >1 s je důvod analýzy. Je-li scéna úmyslně úzká/hustá, použít jiné kritérium průchodnosti, ne tento rychlostní limit.

## E3. Perspektiva a anatomická plynulost

**Přesný kontrolní krok 0,6 m ze středu obrazu ke kameře**, FOVx=50°:

| Start y | Boční srovnávací krok [px] | Krok ke kameře [px] | Poměr |
|---:|---:|---:|---:|
| 900 | 16,0457 | 0,5415 | 0,033748 |
| 960 | 30,0114 | 1,9074 | 0,063556 |
| 1020 | 43,9771 | 4,1240 | 0,093777 |
| 1080 | 57,9429 | 7,2092 | 0,124419 |

Pro konečný krok l ke kameře je přesný poměr `h/(Z−l)`, zatímco diferenciální limit je h/Z. Proto konečný poměr na posledním řádku mírně přesahuje 0,12. Testovat ground displacement mezi kontakty, **ne rozdíl obrazové polohy švihové boty obsahující její zdvih H**. Tolerance analytického renderového testu 0,01 px; u vizuálního exportu bez odečtu antialiasingu používat souřadnice rig/debug bodů.

Anatomická flexe kolena se měří z prostorových vektorů, nikoli z úhlu mezi jejich čelními projekcemi. Pro ustálenou normální chůzi 1,3 m/s navržený limit změny ≤14° mezi 30fps snímky a ≤7° mezi 60Hz stavy (420°/s); pro pomalou 0,9 m/s ≤10°/30fps (300°/s). Limity N mají odhalit prudké skoky, nikoli nahradit chodeckou křivku. Pokud korektně retargetovaná referenční křivka vyžaduje vyšší rychlost, změnu odůvodnit testem, ne filtrovat hotové koleno a porušit kontakt.

Samostatný test skoků při změně pohledu: zmrazit světový stav, změnit view/mirror a ověřit změnu anatomického úhlu <1e−6 rad a projektovaného kolenního bodu <1e−6 px. Viditelný přechod textury může mít jinou siluetu, ale pivot musí zůstat na stejném kloubu. Při pohybu kontrolovat navíc zrychlení obrazové trajektorie a přírůstky kolem view-switch proti běžné křivce; žádný jednosnímkový offset >0,5 px způsobený pouze přepnutím assetu.

Pokud se přední/zadní pohled mění během stejné stojné fáze, aktivní kontakt stále splňuje G8. Pokud to konkrétní bota nedovolí bez deformace, změnu view odložit nebo dodat vhodný asset; automatický „skok při přepnutí je normální“ není přijatelný výsledek.

## E4. Povinné scénáře

Souřadnice níže jsou místní metry (x,z), při renderu lze přičíst např. Z0=40 m. Fyzické r=0,23 m, seed 20261124, pokud není uvedeno jinak. Každý scénář navíc spustit pro 20 předem daných seedů; v random variantách měnit preference, ne základní proveditelnost prostoru.

| Scénář | Nastavení | Požadavek |
|---|---|---|
| T1 Protijdoucí | Start (−4,0),(4,0), opačné cíle, oba 1,3 m/s, koridor šířky 3 m. | G1–G13, míjení vpravo, rychlostní kritéria E2. |
| T2 Křížení 90° | Start (−4,0),(0,−4), cíle (4,0),(0,4), oba 1,3; pak varianta 0,9 a 1,3. | Časová přednost stabilní, bez průniku, bez oscillujícího „ty první“. |
| T3 Předjíždění | Pomalý (0,1) rychlost 0,75, rychlý (0,−2) rychlost 1,3, směr +Z, šířka 3 m. | Předjet, je-li prostor; G1; rychlý se po manévru vrátí k 1,3. |
| T4 Bez prostoru k předjetí | Totéž v koridoru 0,75 m. | Bez pokusu projít tělem/stěnou; následování a postup vpřed. Nevyžadovat rychlost 1,3. |
| T5 Dvojice proti jednotlivci | Dvojice sloty ±0,375 m, protijdoucí jednotlivec, koridor 3 m. | Všechny tři páry kontrolované, zejména druhý člen; formace může dočasně povolit. |
| T6 Dvojice a zúžení | Portál 0,8 m, délka 2 m, před ním široká plocha; druhá skupina z protisměru. | Řazení za sebe před vstupem, rezervace jedním směrem, žádný timeout během obsazení. |
| T7 Fronta | 4 obsazené sloty po 0,65 m, kolem jdoucí v obou směrech a nový zákazník. | Čekající se nehýbou, nikdo se neproplétá mezi sloty; nový přijde na konec nebo při plné frontě zvolí alternativu. |
| T8 Pozdrav a odchod dvojice | Dvě osoby dojdou na body 1 m od sebe, pozdrav, pak společný odchod. | Žádný teleport do stejného bodu; sloty formace obsazeny chůzí. |
| T9 Přiblížení zezadu/zboku | Jedna stojí, druhá přichází mimo její přední FOV; měnit směry 0/90/180/270°. | Stejná fyzická ochrana ze všech stran, stojící neuhýbá. |
| T10 Chybný spawn | Dvě současné žádosti na stejném bodu, druhá další tick. | Nejvýše jedna vložená osoba, druhá pending; žádný opravný viditelný rozstřel. |
| T11 Spojitý průlet | Samostatný test geometrie: dvě těla od sebe 0,6 m s velmi vysokými protichůdnými rychlostmi, konečné body už opět vzdálené. | Nezávislý swept test rozpozná střet; hard solver přijme bezpečný pohyb/stop. Není to test uvěřitelné chůze takovou rychlostí. |
| T12 Hustý provoz | 20 osob na průchozí ploše 8×10 m, čtyři vstupy, starty nepenetrující; fronta mimo hlavní osu, dva stolky. 180 s. | G1–G15; žádný trvalý deadlock >5 s mimo platnou frontu/obsluhu/rezervaci; zablokování logovat. |
| T13 Perspektiva | Stejná osoba jde po H=0 z y=900 k y=1080 a zpět rychlostí 0,9 a 1,3 m/s. | Správná délka trasy a časy podle A4, G8/G9, měřítko bez filtračního zpoždění. |
| T14 View/mirror | Trasa do oblouku přes všechny čtyři kvadranty, pomalé změny směru u téměř čistého +Z/−Z. | Žádné přepínání sem a tam u nulové složky, nezměněné kotvy a větev kolena. |
| T15 Sníh | Chůze po hraně polygonu sněhu, suchý pás, stání, odvalení, opětovný příchod. | Jen skutečné kontakty tvoří stopy; stejný footprint nespouštět každým tickem; komprese jen ve sněhu. |
| T16 Export | Stejný seed a scéna: rychlý offline export, pomalý preview, různá render FPS. | Stejné snapshoty na stejných simulačních tickách; renderer nečerpá behavior RNG. |

U T12 zapisovat časy průchodů a čekání, nepožadovat arbitrární nulové zpomalení všech lidí. Jestliže uživatel nakreslí příliš malou plochu nebo uzavřený průchod, aplikace musí umět hlásit neproveditelnost místo porušení kolizí.

## E5. Diagnostika a výkon

Debug overlay přepíná: metrovou mřížku, fyzické disky, osobní obálky, predikované trajektorie, t*/d*, stranu encounteru, koridor, držitele rezervací, světové kontakty, pole vector a klouby, projekční délkové poměry, masku sněhu. Nezakreslovat pouze kruhy v pixelech bez perspektivy — světový disk na zemi se promítá jinak než šířka svislé postavy.

Log za encounter: min swept clearance, max speed loss, počet změn strany, největší bezpečnostní korekce rychlosti, emergency count, zpoždění, změna formace. Za postavu: fáze/footfall ID, vzdálenost, počet kroků, plant error, max world-bone error, knee angular velocity, view-switch count. Za běh: seed, verze konfigurace, runtime a hash stavů například každých 60 ticků. Hash nezahrnuje GPU textura cache ani wall clock.

Výkon měřit po 5s zahřátí, alespoň 60 s simulace 30 osob na zaznamenaném CPU/runtime. Cíl p95 <5 ms na 60Hz tick bez renderu; p99 a nejhorší fallback vykázat samostatně. Výkon při exportu nerozhoduje o tom, zda se bezpečnostní test přeskočí. Zpomalí se reálná doba renderování.

## E6. Co bylo ověřeno při tvorbě dokumentu

Byly provedeny nezávislé numerické kontroly vzorců, nikoli implementace celé aplikace:

- 10 000 náhodných validních bodů: projekce a inverze, největší návratová chyba přibližně 1,14×10⁻¹³ m.
- 10 000 numerických derivací: největší odchylka proti analytické J přibližně 1,38×10⁻⁴ px/s při perturbaci 10⁻⁵ s.
- 10 000 náhodných dvojic s fyzickou mezí 0,46 m a vysokými testovacími rychlostmi: přesná projekce na jeden párový podpůrný poloprostor a analytické minimum v intervalu; žádný průnik, nejmenší mezera nad fyzickou hranicí přibližně 0,00200006 m.
- Ověřeny číselné tabulky A4 a E3 včetně konečného kroku 0,6 m.

To **neověřuje konvergenci víceagentového Dykstrova solveru, komfortní rychlost míjení, pohyb konkrétních assetů, sněhové masky ani determinismus hotové aplikace**. Tyto výsledky musí dodat implementace podle T1–T16. Tyto kontroly nenahrazují zkoušky plného systému; ověřují podkladové rovnice.

# F. Priority, rizika a pořadí implementace

## F1. Pořadí práce

| Priorita | Změna | Výstup / podmínka dokončení |
|---|---|---|
| P0 | Oddělit metry, rig jednotky a pixely. | Typy, konverze q, metadata boty; odstranit směšování se starým L_phys=0,9 m. |
| P0 | Implementovat kameru A2–A4 a kalibrační overlay. | Round-trip test, tabulka perspektivy, uživatelské potvrzení měřítka náměstí. Bez toho neladit K ani úhyby v pixelech. |
| P0 | Všechny osoby v jednotné fyzické evidenci. | Dvojice, fronta, stolek i příchozí zezadu zahrnuté; validace spawnů. |
| P0 | Tvrdý bezpečný krok + analytický swept validátor. | T10/T11 a základní víceagentové testy; žádná oprava těla po commitu. |
| P1 | Převést kontakty a klouby do X,Z,H, odstranit screen-depth→height. | T13, G6–G11; jedna osoba bez davu jde po rovině oběma směry. |
| P1 | Předvídavé míjení a paměť strany. | T1–T4 a rychlostní kritéria E2, až potom dolaďovat hustotu davu. |
| P1 | Vazba přijatelné rychlosti na stance reach a plán došlapu. | Žádný skluz při úhybu, žádné zamrznutí švihu při zastavení. |
| P2 | Dvojice a úzké průchody. | T5/T6/T8, žádný follower bez kolizí. |
| P2 | Fronta a aktivity. | T7/T9, transakční rezervace a průchozí obcházení. |
| P2 | View/mirror a projekční adaptace assetů. | T14 ve všech velikostech, žádné skoky kolen ani reset opor. |
| P3 | Komprese sněhu, masky a stopy. | T15, omezená paměť a správné vrstvení. |
| P3 | Dlouhé deterministické běhy a optimalizace. | T12/T16, profil CPU, hour-long export bez růstu záznamů. |

## F2. Co nedělat

- Neladit konstantu K podle směru, y pásma nebo pohledu. Jedna kamera už poskytuje správnou lokální metriku.
- Nepočítat TTC ani vzdálenosti ve screen pixelech a pak je přepočítávat jedním průměrným měřítkem.
- Nepovažovat osobní prostor za tvrdý fyzický poloměr ani skutečnou šířku těla za celý osobní prostor.
- Nevypínat kolize followera, čekajícího, stojícího nebo člověka mimo přední FOV.
- Nespawnovat dva lidi ve stejném bodu s tím, že se „pak pomalu rozestoupí“.
- Nepoužít omezeně rychlé odtlačení už penetrujících těl jako důkaz nulového průniku.
- Nekontrolovat jen konec ticku; dva lidé si mohou mezi tickami vyměnit strany a na konci už se nepřekrývat.
- Nefiltrovat/clampovat finální bezpečné rychlosti mimo množinu omezení.
- Nepřepisovat ukotvené boty podle nové délky kroku, view nebo scaleX postavy.
- Nenatahovat fyzické nohy kvůli chybě obrazové perspektivy; neclampovat podélnou projekci nezávisle na kontaktech.
- Nepřetáčet yaw těla jako velkou 2D rotaci v rovině obrázku.
- Neinterpretovat správné perspektivní překrytí postav jako fyzickou kolizi jejich těl.
- Nepředpokládat, že pouhé dva pohledy PNG dokážou přesně všechny prostorové směry bez vizuálního kompromisu.
- Neurčovat sníh automaticky pouze podle bílých pixelů a nekreslit neprůhledný obdélník pozadí přes jiné postavy.
- Nenechat počet náhodných tahů, fyzikálních kroků nebo stop záviset na FPS renderu.

## F3. Rizika a rozhodnutí, která musí být v aplikaci viditelná

1. **Kalibrace malby:** současná přesná měřítka mohou představovat mnohem větší náměstí, než autor zamýšlel. Doporučený FOV=50° je pracovní volba, ne zjištěná vlastnost obrázku. Uživatel má vidět reálné metry a zvolit, zda zachovat velikosti nebo změnit kompozici.
2. **Tuhé assety vs. perspektiva:** fyzicky pevná kost může mít proměnnou obrazovou délku. Je nutné zvolit obrazové podélné škálování, více assetů nebo přiznanou aproximaci. Samotné vyhlazení neslučitelnou geometrii nevyřeší.
3. **Bezpečnost vs. komfort:** při neproveditelném světě musí dostat přednost nepřekročitelnost. Výjimka z komfortního zrychlení se loguje; nesmí se zaměnit za běžnou animaci. Nikdo nemůže garantovat plynulý průchod všech lidí uzavřeným portálem.
4. **Konvergence solveru:** konečný počet iterací není důkaz. Commit podmínit nezávislou kontrolou; nevalidní pohyb se neprovede.
5. **Parametry chování:** rozsahy N jsou implementační startovní hodnoty. Zdroje podkládají predikci a sociální organizaci, ale neopravňují vydávat zvolený rozestup 0,75 m či limit 90°/s za všeobecné biologické konstanty.
6. **Determinismus mezi platformami:** pevný tick a seed jsou nutné, ale pro bitovou shodu přes různé runtime je třeba další omezení matematiky. V první verzi garantovat stejný připnutý runtime a vstupy.

## Zdroje

**[S1] Helbing, D.; Molnár, P. (1995). Social Force Model for Pedestrian Dynamics. Physical Review E 51, 4282–4286.** [DOI](https://doi.org/10.1103/PhysRevE.51.4282), [autorský preprint](https://arxiv.org/abs/cond-mat/9805244). Základ silových motivací; nejde o zdroj navržených numerických limitů aplikace.

**[S2] van den Berg, J.; Guy, S. J.; Lin, M.; Manocha, D. Reciprocal n-body Collision Avoidance.** [Autorská stránka ORCA](https://gamma-web.iacs.umd.edu/ORCA/), [plný text](https://gamma.cs.unc.edu/ORCA/publications/ORCA.pdf). Předpoklady recipročního vyhýbání a rychlostních poloprostorů. Zde navržená společná krátkodobá projekce není označována za implementaci ORCA.

**[S3] Karamouzas, I.; Skinner, B.; Guy, S. J. (2014). Universal Power Law Governing Pedestrian Interactions. Physical Review Letters 113, 238701.** [DOI](https://doi.org/10.1103/PhysRevLett.113.238701), [autorský preprint](https://arxiv.org/abs/1412.1082). Empirická opora anticipace prostřednictvím času do budoucí kolize; použité skóre kandidátů je vlastní návrh.

**[S4] Huber, M. et al. (2014). Adjustments of Speed and Path when Avoiding Collisions with Another Pedestrian. PLOS ONE 9(2), e89589.** [Plný text](https://pmc.ncbi.nlm.nih.gov/articles/PMC3935867/), [DOI](https://doi.org/10.1371/journal.pone.0089589). Rozdíly změny dráhy a rychlosti podle úhlu střetu; tabulka 1 udává vzdálenosti zahájení úprav. Přesné výsledky experimentu nejsou zárukou každé situace na náměstí.

**[S5] Moussaïd, M.; Perozo, N.; Garnier, S.; Helbing, D.; Theraulaz, G. (2010). The Walking Behaviour of Pedestrian Social Groups and Its Impact on Crowd Dynamics. PLOS ONE 5(4), e10047.** [Plný text](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0010047), [DOI](https://doi.org/10.1371/journal.pone.0010047). Pozorované skupinové formace; naše konkrétní sloty a přechody formace jsou N.

**[S6] Sorokowska, A. et al. (2017). Preferred Interpersonal Distances: A Global Comparison. Journal of Cross-Cultural Psychology 48(4), 577–592.** [DOI / abstrakt vydavatele](https://doi.org/10.1177/0022022117698039). Velký mezikulturní soubor preferencí. Použito pro variabilitu a kontext; nikoli jako přímé měření kolizních disků. Dostupný abstrakt nepostačuje k převzetí detailních lokálních percentilů.

**[S7] OpenCV. Camera Calibration and 3D Reconstruction.** [Oficiální dokumentace](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html). Standardní pinhole model. Konkrétní odvození h, f, inverze a Jacobiánu v A je vlastní matematický výpočet pro uživatelova data.

**[S8] Esoteric Software. Spine User Guide — IK constraints.** [Oficiální dokumentace](https://us.esotericsoftware.com/spine-ik-constraints). Větve IK, stretch, softness a chování u napřímení. Není požadováno použití knihovny Spine ani její licence; principy jsou zde vyjádřeny vlastními rovnicemi.

**[S9] Kovar, L.; Gleicher, M.; Schreiner, J. (2002). Footskate Cleanup for Motion Capture Editing. ACM SIGGRAPH Symposium on Computer Animation.** [Autorský PDF](https://research.cs.wisc.edu/graphics/Papers/Gleicher/Mocap/cleanup.pdf), [stránka publikace](https://graphics.cs.wisc.edu/Papers/2002/KSG02/). Zachování footplant jako zásadní animační omezení; naše 2.5D implementace není reprodukcí celého jejich algoritmu.

**[S10] Box2D. Collision — Time of Impact.** [Oficiální dokumentace](https://box2d.org/documentation/md_collision.html). Princip kontinuálních kolizí a prevence tunnelingu. Pro disky v tomto zadání je analytický swept test explicitně odvozen; není nutné zavádět celý rigid-body engine.

**[S11] MDN. CanvasRenderingContext2D.globalCompositeOperation.** [Dokumentace](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation). Kompozitní operace pro maskování. Zvolené cm sněhu, opacita a životnost stop jsou estetické parametry N, nikoli výsledek této dokumentace či sněhového experimentu.

**[S12] Dykstra, R. L. (1983). An Algorithm for Restricted Least Squares Regression. Journal of the American Statistical Association 78(384), 837–842.** [DOI](https://doi.org/10.1080/01621459.1983.10477029). Původ projekční metody s korekcemi; původní článek nebyl v tomto průzkumu dostupný jako plný text. Pseudokód je explicitní implementační předpis, který musí projít testy konvergence a validity.

**[S13] Boyd, S.; Vandenberghe, L. (2004). Convex Optimization. Cambridge University Press.** [Autorská stránka a volně dostupná kniha](https://web.stanford.edu/~boyd/cvxbook/). Podklad konvexních množin a optimalizace. Bezpečnostní podpůrná podmínka a její důkaz v B6 jsou vlastní odvození pro tento diskrétní model.
