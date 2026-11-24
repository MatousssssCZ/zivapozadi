# Návrh rozšíření jádra

Následující typy a soubory jsou návrhy, nikoliv tvrzení o již existujícím API.

## 1. Model činností

Jednotlivé aktivity ponechat jako ActivityRunner. Přidat nad ně ActivitySession pro sdílený děj. Agent.activity zůstane adaptérem účasti; společná fáze a termíny patří pouze do session. Nepouštět společnou fázi jednou za každého účastníka.

```ts
interface ActivitySession {
  id: string;
  type: string;
  zoneId: string;
  participantIds: string[];
  roles: Record<string, string[]>;
  phase: string;
  phaseStartStep: number;
  deadlineStep: number;
  rng: RngState;
  ownedResourceKeys: string[];
  emittedEventIds: string[]; // pouze po dobu session, ohraničené
  data: Record<string, unknown>;
}
```

Nové části SimState: sessions, runtimeObjects, vendors, worldEffects, director, monotónní čítače ID. Ukládat jen JSON; žádné Map, funkce, canvas, DOM ani reference na agenty. Odvozené indexy znovu sestavit po restore.

Session lifecycle: eligible → reserve → gathering → active → finishing → released. Každá fáze může přejít do aborting. Sběr účastníků má timeout 30–60 s podle vzdálenosti; příliš vzdálené účastníky raději nevybrat. Zánik postavy, zóny nebo objektu řešit abortem celé závislé session. Následovníka dočasně odpojit a po skončení obnovit jeho původní follow/rejoin pouze pokud vedoucí existuje.

## 2. Atomické rezervace

Dosavadní releaseAll(agentId) nestačí pro skupinu. Vlastníky rozlišit jako `agent:<id>` a `session:<id>` nebo typovaným ekvivalentem. Dosavadní kód musí přes adaptér používat jednotnou reprezentaci.

```text
tryReserveMany(keys, owner):
  uniqueKeys = stabilně seřazené jedinečné klíče
  pokud je některý klíč cizí, vrať false bez změny stavu
  jinak přiřaď všechny klíče ownerovi
  vrať true
```

Rezervovat zároveň účastníky, pracovní místa a prostor aktivity. Výběr kandidátů seřadit podle ID před seeded losováním. Při neúspěšné cestě rollback celé transakce. Dvojí abort musí být bezpečný. Session se uvolňuje až po bezpečném ukončení, ne při ukončení osobního klipu.

Logická rezervace polygonu sama nebrání průchodu. Koulovačka musí kontrolovat okolní lidi a lokální pohyb musí prostor respektovat. Sněhulák potřebuje runtime footprint, který se zohlední v reachability, plánování i crowd vyhýbání. Při vzniku nové překážky invalidovat pouze dotčené cesty a odvozené cache; po restore je zrekonstruovat.

## 3. Plánovač scény

Nový SceneDirector rozhoduje např. každých 120 kroků (2 s), vždy podle simulačního času. Kandidáty filtruje podle schopností, dostupných assetů, sněhu, místa, volných rukou, vztahů a cooldownů. Pak provede jediný vážený výběr, kde má vysokou váhu také možnost nic nového nezahájit.

Rozpočet navržen pro 24 lidí: nejvýše 1 výrazná událost a 3 společenské session. Existující běžné nakupování nespotřebovává výrazný slot. Koulovačka, stavba sněhuláka a odklízení jsou výrazné. Startovat je nejdříve po náhodném rozestupu 90–180 s od konce předchozí výrazné události. U sněhuláka účast dokončením končí, ale objekt zůstává.

Cooldown události se nastaví jednou po jejím ukončení. Délky losovat při vstupu do fáze a uložit jako cílový step; ne každý snímek. Opakovaně neúspěšné aktivity mají retry delay a omezené logování. Ruční časová událost může mít vyšší prioritu, nikdy však nesmí obejít kolize, obsazené ruce nebo chybějící assety.

## 4. Rekvizity a ruce

Rozšířit PropKind na cup, bag, phone, glove, snowball, shovel, sled, snowmanPart/accessory. Vhodnější je discriminated union: cup má sips, snowball radius a let, ostatní nenesou nesouvisející pole.

Ponechat kompatibilitu starého holding. Nový model `heldProps: {left: string|null,right:string|null}`; u obouručního předmětu jeden prop se dvěma úchopy, nikoliv dvě kopie. Zkontrolovat, že prop je vlastněn právě jednou postavou či světem. Explicitně migrovat starý cup do dosavadní přední ruky; označení anatomická levá/pravá nesmí přehazovat identitu při zrcadlení pohledu.

Předání předmětu realizovat jedinou událostí s ID session/phase/event/index. Nejprve jej drží prodavač nebo leží na pultu, v okamžiku kontaktu přechází do zákazníkovy ruky. Renderer pouze čte. Při předání vyžadovat dosažitelný úchop: těla mohou zůstat správně rozestoupená, ale ruce musí skutečně dosáhnout na pult.

Odchod portálem dovoluje odnést tašku/kelímky mimo scénu a odstranit je až s odchozím vlastníkem. Pro aktuální coffee zachovat vyhození do koše; varianta takeaway je explicitní nastavení. Telefon existuje v kapse/skrytém attachmentu a při vytažení přejde do ruky, nevzniká opakovaně jako nový předmět.

## 5. Prodavač

Nový VendorState v SimState podle objectId: idle, attend, turnToShelf, retrieve, handover, tidy. Má vlastní seeded variace a termíny. drawSeller bude zobrazovat tento stav místo odvozování celé logiky z první nalezené postavy.

Na stánek standardně jedna obsluha; více service bodů automaticky neznamená více prodavačů. Doplnit rezervaci `vendor:<standId>`, aby se dvě předání neodehrála současně. Tidy přerušit v bezpečné fázi během 0,3–0,8 s. Zachovat seller.window masku, ale ruce při předávání řešit zvláštní vrstvou nad pultem; nelze bez kontroly nakreslit celou postavu před stánkem. Nové plné otáčení použít jen pokud existuje vhodná grafika.

## 6. Trvalé objekty a změny sněhu

RuntimeObject sněhuláka: id, zoneId, worldPosition, stage, scale, footprint, appearanceId, createdStep. Je součást SimState; do ProjectFile.objects se při simulaci nevkládá. Max. 1 stavba na zónu a výchozí 2 sněhuláci celkem. Obsazené místo znemožní další start. Restart simulace vrátí svět do výchozího stavu; prostá pauza ani exportní chunk nic nemaže.

Odklízení a válení ukládá omezené snowPatches: polygon/pruh, stav cleared/rolled/pile, createdStep. Uklizená plocha má při dotazu na sníh přednost před původní oblastí snow; ovlivní zaboření bot a vznik stop. Vizuální odhalený podklad musí existovat nebo být stylově vhodně připraven. Bez něj pracovníka nespouštět na viditelně neměnném sněhu.

## 7. Prostředí

Sdílené WindField vzorkuje seed a simulační čas, vrací směr, sílu i integrál posunu. Nepoužít novou sílu větru ve staré rovnici `wind(t)*t`: při změně by vločky skákaly. Pro částice používat integrál mezi narozením a aktuálním časem nebo deterministickou integraci v checkpointovaném stavu.

Pára od pohyblivého kelímku vzniká v tehdejší poloze okraje. Již vypuštěná pára necestuje dodatečně s rukou. Buď ukládat omezený pool emitovaných částic do SimState, nebo rekonstruovat z deterministické historie emitteru; jednodušší je pool. Kouř komína sdílí vítr, má delší životnost a měkkou texturu. Přechody hustoty sněhu realizovat stabilními particle IDs a průhledností, ne náhlou výměnou všech vloček.

Dveře, okna, dekorace a odlesky vyžadují ručně umístěné masky/kotvy. Automatické rozpoznání namalovaných dveří z pozadí není součástí tohoto zadání. WindowState/DoorState má start, end, intenzitu a vazbu na portál. Dveře se otevřou před průchodem, zavřou po uvolnění prahu. Světelný polygon leží na zemi, zakrývá se podle scény; ne plošný filtr přes celou fasádu.

## 8. Kompatibilita a export

Při změně struktury SimState zvýšit SIM_STATE_VERSION a ověřit odmítnutí starých checkpointů. exportJobHash již verzi zahrnuje. Pokud se persistované schéma projektu mění nekompatibilně, zvýšit PROJECT_FORMAT_VERSION a napsat migraci 1→2. Staré projekty doplnit tak, aby nové aktivity byly výchozím stavem vypnuté. Nevyhazovat ručně nastavené parametry uživatele.

Při vypnutém rozšíření zachovat vizuální chování existující scény; samotné hash hodnoty se mohou kvůli verzi změnit. Při zapnutí nových efektů držet oddělené RNG streamy pro prostředí a aktivity, aby přidání kouře neměnilo rozhodování lidí. Identitu simulace porovnávat mezi různými rychlostmi náhledu a kontinuálním/obnoveným během. Pixelovou shodu vyžadovat v rámci stejného render backendu, nikoliv mezi Canvas v Electronu a Skia.

## 9. Zvířata – revize 2

Doplnit AnimalInstance a AnimalState, druhově specifické rigy a sdílené pohybové entity podle 07_PSI_A_KOCKY.md. Zvíře není rekvizita ani lidská postava. Vodítko rezervuje ruku majitele. Zvířata jsou součástí checkpointu a podléhají limitům scény.
