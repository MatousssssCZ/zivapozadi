# Nové oblečení a hlavy

Zdrojové archy (originály beze změny):
- `grafika/zdroje/postava-dily-perova-vesta-v1.webp` – péřová bunda a doplňky, šikmo zepředu i zezadu.
- `grafika/zdroje/hlavy-3q-zepredu-v1.webp` – 12 hlav, jen šikmo zepředu.

Zpracování: `npx tsx scripts/process-character-parts.ts` (stejný postup jako u původních dílů: výřez, vyčištění alfy, změření kloubů, měřítko podle délek kostí, maska přebarvení). Výstup jde do `resources/builtin/painted-parts-cg/`.

## Nové varianty v knihovně (dospělý)

### Oblečení z archu bundy
| Skupina | Varianta | Díly | Poznámka |
|---|---|---|---|
| Bunda | `jacket_puffer_cg` – Péřová bunda | vesta (trup), prošívaný rukáv, předloktí s manžetou | Krátká bunda končí u boků. Rukávy jsou širší (11,5 / 9,8 j.) než u kabátu. |
| Rukavice | `gloves_puffer_cg` – Palčáky s pletenou manžetou | palčák | |
| Kalhoty | `trousers_slim_cg` – Úzké kalhoty | stehno, lýtko | |
| Boty | `boots_hiking_cg` – Šněrovací boty | bota | Pata 3,4 j., přednoží 6–7 j. |
| Čepice | `hat_rib_cg` – Žebrovaný kulich | čepice | |
| Šála | `scarf_neckwarmer_cg` – Nákrčník | nákrčník | Šířka 15 j. |

- **Barvy:** všechny díly se přebarvují stejnými paletami jako dosud. Arch je béžový, proto se při tvorbě masky toleruje teplejší odstín látky.
- **Generátor** vybírá varianty náhodně ze všech dostupných, takže vznikají i kombinace s původním kabátem a šálou.

### Hlavy (`head_01_cg` … `head_12_cg`)
1. mladý muž s hnědými kudrnatými vlasy
2. muž s tmavými kudrnami a strništěm
3. žena s hnědým mikádem
4. žena s blond drdolem
5. muž s plnovousem
6. prošedivělý muž s brýlemi
7. žena s tmavými vlnitými vlasy
8. žena s krátkými zrzavými vlasy
9. starší muž, šedé vlasy, pleš (`senior`)
10. starší muž s bílým vousem a brýlemi (`senior`)
11. starší žena se šedým drdolem (`senior`)
12. starší žena se šedými vlnami a brýlemi (`senior`)

Senioři v Liberci dostali hlavy 11 (paní Věra) a 10 (pan Josef).

## Chybí / provizorní
- **Zadní pohled hlav 2–12 není v archu.** Používá se základní zadní hlava s vlasy přebarvenými na barvu dané hlavy. Tvar účesu proto zezadu neodpovídá: drdol, mikádo a dlouhé vlasy jsou vidět jen zepředu. Díly jsou v knihovně označené jako provizorní a v `artIssues` je u každého poznámka. Hlava 1 má zadní pohled z archu bundy.
- **Hlava z archu bundy (zepředu)** je stejná jako hlava 1 v archu hlav, proto se nepoužívá dvakrát.
- **Rozlišení archu bundy** je nízké (díly ~200 px). Při velkém přiblížení jsou méně ostré než původní kabát.
- **Žebrovaný kulich zepředu** ukazuje světlý vnitřní okraj (je namalovaný, ne průhledný).
