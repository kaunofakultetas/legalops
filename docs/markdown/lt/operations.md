# Atitikties asistentas — eksploatavimas

Kasdienė sistemos priežiūra. Diegimas, `.env` aprašas, išorinis tarpinis
serveris ir gamybinis režimas aprašyti [deployment.md](deployment.md). Visos
komandos vykdomos kaip root kataloge
`/apps/aplikacijos/comp-assistant`. Sistemai pagrindiniame kompiuteryje nieko
neįdiegta (nėra nei node, nei pip): kiekvienas įrankis veikia konteineryje.

## 1. Kasdienės komandos

```bash
docker compose ps                                   # state of every service
docker compose logs -f --tail 100 legalops-django # follow one service
docker compose logs -f legalops-worker            # the job loop
docker compose restart legalops-endpoint          # e.g. after editing endpoint/Caddyfile
docker compose exec legalops-django python3 manage.py <command>
docker compose exec legalops-postgres psql -U legalops -d legalops   # superuser, local socket
```

`legalops-worker` tik paleidžia užduočių ciklą konteineryje legalops-django,
todėl jo žurnalas ir yra ciklo žurnalas. Kai legalops-django paleidžiamas iš
naujo, ciklas žūva kartu su juo: užduočių vykdytojo konteineris baigia darbą, o
jo paleidimo iš naujo politika pradeda naują ciklą. Jei užduočių vykdytojas
paleidžiamas iš naujo vienas, jis perima darbą: naujas ciklas paprašo dar
veikiančio ciklo sustoti (jo užduotis grąžinama į eilę, nesunaudojant bandymo) ir
pradeda veikti jo vietoje.

Pakeistas `endpoint/Caddyfile` arba `exit/Caddyfile` įsigalioja, kai tas
konteineris paleidžiamas iš naujo. `vite/Caddyfile` įtrauktas į gamybinį
atvaizdą, todėl jam reikia `./runUpdateThisStack.sh`.

## 2. Atnaujinimai

```bash
git pull
./runUpdateThisStack.sh
```

Scenarijus sustabdo visą sistemą, iš naujo sukuria atvaizdus (dėl podėlyje
esančių sluoksnių vien kodo pakeitimas užtrunka kelias sekundes), vėl viską
paleidžia ir vykdo `migrate` (deployment.md §3). Svetainė nepasiekiama nuo
`down` iki tol, kol konteineriai vėl veikia; jei pirmiau paleisite
`docker compose build`, atvaizdų kūrimas į šį laiko tarpą nepateks. `seed_prompts`
savaime nevykdomas niekada: po atnaujinimo, keičiančio
`django/compliance/prompts/defaults/`, paleiskite jį rankiniu būdu.

```bash
docker compose exec legalops-django python3 manage.py seed_prompts
```

`git pull` neliečia ir `docker-compose.yml`: tai paties diegimo turima
`docker-compose.sample.yml` kopija (deployment.md §3), todėl pavyzdžio
pakeitimas ją pasiekia tik tada, kai kas nors jį perkelia.

Ką pastebi naudotojai: sustoja kiekvienas konteineris, o Docker jį nutraukia
po numatytųjų 10 s (compose faile `stop_grace_period` nenustatytas).

- **django:** po 10 s dar vykdomos užklausos nutraukiamos; įėjimas atsako 502,
  kol Django vėl veikia.
- **užduočių vykdytojas:** ciklas žūva kartu su legalops-django. Vykdytą
  užduotį į eilę grąžina kitas ciklas, kai nuo paskutinio jos gyvybės signalo
  praeina dvi minutės, ir toks vykdymas laikomas vienu užduoties bandymu.
- **asistentas:** node iškart atsisako naujų ryšių (užklausa per palaikomą
  ryšį gauna 503 `SHUTTING_DOWN`) ir leidžia vykstantiems pokalbio ėjimams
  baigtis, tačiau Docker jį nutraukia po 10 s: tuo metu dar vykdomas ėjimas
  netenka atsakymo.
- **įėjimas:** atviri ryšiai užsidaro, įskaitant SSE srautus.

Baziniai atvaizdai užfiksuoti žyma, bet ne visi vienodu tikslumu:
`caddy:2.11-alpine`, `vuknf/caddy-l4:2.11` ir `python:3.13-slim` seka
šalutinės versijos liniją, `docker:27-cli` — pagrindinės versijos liniją, o
`node:24.16.0-alpine`, `postgres:17.11-alpine3.24` ir
`dbgate/dbgate:7.3.3-alpine` įvardija tikslią laidą: naujesnė šių trijų laida
atkeliauja tik su nauja žyma (§10). Kad gautumėte tai, kas naujai paskelbiama
su čia kuriamų atvaizdų žymomis, kartą per mėnesį:

```bash
docker compose build --pull && ./runUpdateThisStack.sh
docker image prune -f        # dangling layers of the previous builds
```

Atvaizdų kūrimas neliečia atvaizdų, kuriuos compose tik atsisiunčia, —
įėjimo, išėjimo, užduočių vykdytojo ir DbGate. Vieną iš jų iš naujo
atsisiunčia `docker compose pull <service>`, įvykdyta prieš atnaujinimą.

Prieš atnaujinimą, keičiantį kodą, paleiskite testų rinkinius (§12).

## 3. Žurnalai

- Kiekvienas konteineris rašo žurnalą į stdout. Žurnalų nesuka nei compose
  failas, nei Docker tarnyba, todėl konteinerio žurnalas auga, kol konteineris
  pašalinamas; kiekvienas atnaujinimas juos pašalina (§2).
- **Įėjimas:** JSON prieigos žurnalas, po eilutę kiekvienai užklausai, su TCP
  partneriu (`request.remote_ip`, viešam srautui — išorinis tarpinis serveris),
  būsenos kodu ir trukme. `Authorization` ir `Cookie` Caddy užmaskuoja.
- **Django:** gamybiniame režime gunicorn prieigos eilutė prasideda užklausos
  `X-Real-IP`, kurį įėjimas nustato iš gautos `X-Forwarded-For`
  (deployment.md §5), po jo eina užklausa, būsenos kodas, baitai ir
  milisekundės. Programos žurnalai rašomi išsamiu `settings.py` formatu.
- **Postgres:** registruojami SQL sakiniai, vykdomi ilgiau nei 2 s
  (`log_min_duration_statement=2000`).

```bash
docker compose logs --no-log-prefix --since 1h legalops-endpoint | jq -c 'select(.status >= 500) | {ts, uri: .request.uri, status, client: .request.client_ip}'
docker compose logs --since 1h legalops-django | grep -E '" (4|5)[0-9]{2} '
```

## 4. Paslapčių keitimas

`.env` reikšmės nuskaitomos tik kuriant konteinerį, todėl kiekvienas keitimas
baigiamas `docker compose up -d`, kuris iš naujo sukuria reikšmę naudojančius
konteinerius.

| Paslaptis | Procedūra | Poveikis |
|---|---|---|
| `AI_GATEWAY_KEY` | Pakeiskite `.env` (ir ištrinkite arba atnaujinkite kopiją `AI.txt`), tada `docker compose up -d legalops-assistant` | Pokalbis ir analizės grandinė pradeda naudoti naują raktą |
| `ASSISTANT_INTERNAL_SECRET` | `sed -i "s/^ASSISTANT_INTERNAL_SECRET=.*/ASSISTANT_INTERNAL_SECRET=$(openssl rand -hex 32)/" .env`, tada `docker compose up -d` | django (kartu su juo ir užduočių ciklas) ir asistentas sukuriami iš naujo kartu; kelias sekundes tarp šių dviejų įvykių vidiniai iškvietimai nepavyksta |
| `DJANGO_SECRET_KEY` | Tas pats `sed` šablonas, tada `docker compose up -d` | Naudotojai nieko nepastebi: sesijos yra maišos pavidalu saugomi prieigos raktai, o šiuo raktu nieko nešifruojama (MCP antraščių reikšmės saugomos atviru tekstu) |
| Duomenų bazės slaptažodis | Žr. toliau | Django ir DbGate prisijungia iš naujo su nauju slaptažodžiu |
| Administratoriaus slaptažodis | Pakeiskite jį konsolėje (Paskyra) | Užrakinta prieiga: žr. toliau |

Duomenų bazės slaptažodžio keitimas. Jis įrašytas faile `docker-compose.yml` —
`DATABASE_URL`, `POSTGRES_PASSWORD` (šią nuskaito tik pirmasis
inicializavimas) ir konteinerio `legalops-dbgate`, kuris jungiasi ta pačia
role, `PASSWORD_con1` reikšmėse. Nauja reikšmė perduodama per aplinką į psql
`\getenv`, niekada komandinėje eilutėje:

```bash
NEW="$(openssl rand -hex 32)"
NEW="$NEW" docker compose exec -T -e NEW legalops-postgres \
    psql -X -v ON_ERROR_STOP=1 -U legalops -d legalops <<'SQL'
\getenv p NEW
ALTER ROLE legalops PASSWORD :'p';
SQL
sed -i "s|//legalops:[^@]*@|//legalops:$NEW@|; s|POSTGRES_PASSWORD: .*|POSTGRES_PASSWORD: $NEW|; s|PASSWORD_con1: .*|PASSWORD_con1: $NEW|" docker-compose.yml
unset NEW
docker compose up -d
```

Kitus konteinerius Postgres autentifikuoja scram-sha-256 metodu. Pačiame
postgres konteineryje lizdas ir 127.0.0.1 yra `trust` (oficialaus atvaizdo
numatytoji reikšmė): kas gali ten vykdyti `docker exec`, jau yra jame root.

**Užrakinta administratoriaus prieiga.** `create_admin --reset` vėl padaro
paskyrą aktyvia administratoriaus paskyra ir nustato slaptažodį. Slaptažodis
perduodamas per aplinką, niekada komandinėje eilutėje:

```bash
read -rsp 'New password: ' NEWPW; echo; export NEWPW
docker compose exec -T -e NEWPW legalops-django \
    python3 manage.py create_admin --email <admin email> --password-env NEWPW --reset
unset NEWPW
```

Taip nustatytas slaptažodis užbaigia visas esamas paskyros sesijas (kaip ir
turi būti įtarus kompromitavimą) ir įrašomas į veiksmų žurnalą kaip
„Slaptažodžio nustatymas“ (`users.reset_password`, be vykdytojo). `--reset` be
slaptažodžio tik vėl aktyvuoja paskyrą arba suteikia jai administratoriaus
teises ir išsaugo jos sesijas.

## 5. Mastelio keitimas

**API (`legalops-django`).**

- Lygiagrečiai vykdoma `GUNICORN_WORKERS` × `GUNICORN_THREADS` (numatytoji
  reikšmė 3 × 8 = 24) užklausų.
- Procesai suteikia CPU lygiagretumą PDF ir XLSX eksportams; gijos išnaudoja
  įvesties ir išvesties laukimo laiką (įkeltų failų teksto išgavimas, instrukcijų
  bandomieji vykdymai iki 15 minučių).
- Kiekviena gija gali `DB_CONN_MAX_AGE` sekundžių (60) laikyti vieną Postgres
  ryšį. Užtikrinkite, kad procesai × gijos + užduočių ciklo ~6 + ~10
  operatoriams neviršytų `max_connections=100`. Norėdami daugiau, padidinkite
  `-c max_connections=` postgres `command`; kiekvienas ryšys kainuoja apie
  10 MB.
- Taip yra su gunicorn. Kūrimo režimo (§11) kūrimo serveris kiekvienai
  užklausai paleidžia naują giją, todėl laikomas ryšys lieka be savo gijos —
  atviras ir nenaudojamas. Ten `DB_CONN_MAX_AGE` numatytoji reikšmė yra 0, ir
  kiekviena užklausa savo ryšį uždaro. (2026 m. lapkričio 17 d., kūrimo režime
  esant 60, per dvi naudojimo valandas be kodo perkrovimo liko 100 nenaudojamų
  ryšių — visi, kiek Postgres turi, — ir kiekviena užklausa baigdavosi klaida
  „too many clients already“; 150 užklausų vienkartinei kopijai paliko 30
  atvirų ryšių, o su 0 — nė vieno.)
- Pakeiskite reikšmes `.env`, tada `docker compose up -d legalops-django`.
- Atmintis: apie 150 MB kiekvienam neaktyviam gunicorn procesui ir iki 1,5 GB
  kiekvienam veikiančiam teksto išgavimo antriniam procesui, įskaitant užduočių
  ciklo procesą. Compose failas jokios ribos nenustato.

**Užduotys (`legalops-worker`).**

- Vienas užduočių ciklas vienu metu vykdo vieną užduotį. Ataskaitos vykdymas
  vienu metu laiko iki 4 vykdomų modelio iškvietimų (kiekvienas po 30–80 s).
- Darbo spartą riboja įvestis ir išvestis. Vieninteliai CPU apkrovos šuoliai —
  izoliuotas didelių teisės aktų struktūros atpažinimas (apie 1 s 13 MB aktui)
  antriniame procese, kurio adresų erdvė apribota iki 1,5 GB.
- Eilė naudoja `SELECT … FOR UPDATE SKIP LOCKED`, todėl keli ciklai saugūs. Kad
  pridėtumėte dar vieną, nukopijuokite `legalops-worker` bloką kaip
  `legalops-worker-2` su savo `container_name` ir suteikite jo ciklui atskirą
  PID failą (`docker exec -e WORKER_PID_FILE=/tmp/worker-2.pid
  legalops-django …`): ciklas, radęs pirmojo PID failą, perima jo darbą, o ne
  veikia šalia. Abu ciklai veikia konteineryje legalops-django.
- Praktinė riba yra DI tinklų sąsajos biudžetas, ne kompiuteris.

**Asistentas.** Vienas node procesas vienu metu srautu perduoda daug pokalbių.

## 6. Teisės aktų bazė ir jos atnaujinimo tvarkaraštis

Užduočių vykdytojo planuoklis (`compliance/jobs/schedule.py`, tikrinamas kas
minutę) įtraukia užduoties rūšį į eilę, kai jos paskutinis vykdymas senesnis už
intervalą:

| Užduotis | Intervalas | Ką daro |
|---|---|---|
| `ops.maintenance` | kasdien | Išvalo pasibaigusias sesijas; baigtas užduotis, senesnes nei 90 dienų (išskyrus užduotį, į kurią rodo ataskaita, — dviem dalimis sudarytai ataskaitai tai antrosios dalies užduotis; pirmosios dalies užduotis išvaloma kaip bet kuri kita); modelio iškvietimų telemetriją, įskaitant pokalbių įrašus, senesnę nei 400 dienų; pasibaigusius užklausų ribojimo langus; niekam nepriklausančius įkeltus failus (be dokumento eilutės, senesnius nei 6 valandos); niekur nepanaudotus pokalbių priedus (be įmonės, niekada neminėtus pokalbio žinutėje, senesnius nei 7 dienos) |
| `corpus.refresh_all` | kas savaitę | Iš naujo atsisiunčia kiekvieną įjungtą teisės aktą; nauja redakcija saugoma tik tada, kai pasikeitė tekstas: tie patys baitai arba ta pati redakcijos žyma patikrą užbaigia iš karto, o kiti baitai, kuriuose perskaitomas tas pats galiojantis tekstas, naujos redakcijos taip pat nesukuria. ES teisės aktas, kurio redakcijų rodyklė neatsako, paliekamas toks, koks yra (to teisės akto patikra nepavyksta ir kitą savaitę bandoma dar kartą); nauja redakcija, kurios tekstą teisės aktas jau yra turėjęs, perima tos ankstesnės redakcijos pareigas ir skaitymo rezultatus |

Rūšis, kuri dar laukia eilėje ar vykdoma, į eilę dukart neįtraukiama niekada.

- **Atnaujinimas rankiniu būdu:** administratoriaus konsolėje (Teisės aktų
  bazė) arba `POST /api/corpus/refresh-all` visiems aktams ir
  `POST /api/corpus/documents/{id}/refresh` vienam.
- **Pirmasis diegimas:** teisės aktų bazė pateikiama su `postgres/bootstrap.sql.gz`
  (deployment.md §3), su pareigomis, bet be vektorių. Vienas veiksmas „Perskaičiuoti
  visus vektorius“ teisės aktų bazės puslapyje ją vektorizuoja (deployment.md §3).
  Nieko neatsisiunčiama ir pareigos iš naujo neišskiriamos. Tuščia duomenų bazė be pradinio rinkinio pradeda
  be teisės aktų bazės. Užpildykite ją su `seed_corpus`: jis sukuria 78 katalogo
  aktus (68 įjungti) ir įtraukia jų įkėlimą į eilę (apie 15–20 min., DI tinklų
  sąsajos žetonai vektoriams). Dviejų iš įjungtų aktų — EBI gairių — šaltinis
  yra „Įkeltas failas“: jiems nieko neatsisiunčiama, o jų eilutės laukia
  failo (žr. toliau). Jei DI tinklų sąsajos biudžetas išnaudotas arba kompiuteris
  dar neturi išėjimo į teisės aktų šaltinius, užpildykite vėliau arba dalimis:

  ```bash
  docker compose exec legalops-django python3 manage.py seed_corpus                   # every missing catalogue act, ingestion queued
  docker compose exec legalops-django python3 manage.py seed_corpus --only mica,dora  # just these slugs
  docker compose exec legalops-django python3 manage.py seed_corpus --no-ingest       # rows only; refresh them later
  ```

- **Pasikeitus išskyrimo instrukcijai ar jos modeliui:** jau išskirtos pareigos
  yra senesnės instrukcijos darbas. Įtraukite į eilę kiekvieną įjungtą aktą,
  kuris atsilieka — niekada neskaitytas arba skaitytas prieš parašant dabar
  galiojančią instrukcijos versiją:

  ```bash
  docker compose exec legalops-django python3 manage.py extract_obligations             # every act that is behind
  docker compose exec legalops-django python3 manage.py extract_obligations mica dora   # these acts, whatever their state
  ```

  Užduočių vykdytojas skaito aktus vieną po kito, pradėdamas nuo mažiausio, po
  keturis modelio iškvietimus vienu metu. Išmatuota su gpt-6.1-sol: 51 aktui,
  įjungtam 2026 m. lapkričio 10 d., prireikė 461 modelio iškvietimo, dviejų su
  puse valandos ir 23,61 $; 17 įjungtų aktų, pridėtų 2026 m. lapkričio 13 d., —
  36 iškvietimų ir 4,77 $; iš viso tai 68 aktai, 497 iškvietimai ir 28,38 $,
  o rezultatas — 5 960 pareigų.
  Šios užduotys laukia eilėje už naudotojų pradėto darbo, todėl tuo metu į eilę
  įtraukta ataskaita vykdoma pirmiau. Aktas išlaiko esamus pasiūlymus, kol visas
  naujas jo išskyrimas pavyksta; administratoriaus peržiūrėtos pareigos
  neliečiamos niekada. Anksčiau parengtos ataskaitos savo išvadas išlaiko
  nepakeistas. Jei kai kurie aktai nepavyksta (išnaudotas DI tinklų sąsajos
  biudžetas, sutrikimas), paleiskite komandą dar kartą: ji įtraukia į eilę tik
  tai, kas vis dar atsilieka. Užduotys ir jų klaidos matomos administratoriaus
  užduočių puslapyje.
- **Kiek gali kainuoti pažeidimas:** ataskaita prie kiekvienos spragos rodo
  sankciją, kurią numato tos spragos teisės aktas. Vertinamus aktus ataskaita
  perskaito pati; likusią teisės aktų bazės dalį — nacionalinis įstatymas,
  nustatantis baudas už ES reglamento pažeidimus, randamas tik jį perskaičius —
  perskaito viena užduotis:

  ```bash
  docker compose exec legalops-django python3 manage.py read_sanctions             # every enabled act never read
  docker compose exec legalops-django python3 manage.py read_sanctions mica dora   # these acts
  docker compose exec legalops-django python3 manage.py read_sanctions --again     # read anew (after the prompt changed)
  ```

  Išmatuota 2026 m. lapkričio 13 d. visai teisės aktų bazei: 29 modelio
  iškvietimai ir 0,71 $ su gpt-6.1-sol, niekam nepriskiriant sąnaudų, o
  rezultatas — 262 pakopos 27 aktuose; 2026 m. lapkričio 19 d. dar kartą
  perskaičius teisės aktų bazės kopijoje: su antrąja instrukcijos versija
  29 iškvietimai, 0,61 $, 309 pakopos tuose pačiuose 27 aktuose; su
  trečiąja 29 iškvietimai, 0,63 $, 288 pakopos; 2026 m. lapkričio 20 d.
  su ketvirtąja 29 iškvietimai, 0,61 $, 302 pakopos. Naują akto
  redakciją perskaito kita ją vertinanti ataskaita. Ataskaitos, parengtos
  prieš perskaitymą, išlaiko savo išvadas, tik jose nenurodyta pasekmė.
- **Veiksmų registras remiasi peržiūrėtomis pareigomis.** Įmonės registras
  uždaro veiksmą, kai vėlesnė patvirtinta ataskaita nustato, kad jo pareigos
  atitinka, o pareigą jis atpažįsta pagal jos id. Pareiga išlaiko savo id po
  akto perskaitymo iš naujo tik tada, kai administratorius ją patvirtino;
  „pasiūlyta“ pareiga pakeičiama. Prieš iš naujo išskirdami pareigas iš akto,
  kurio pareigos susietos su atvirais veiksmais, peržiūrėkite pareigų registrą,
  kitaip tuos veiksmus bus galima uždaryti tik rankiniu būdu.
- **Prieš peržiūrint registrą:** pareigos yra tai, kaip aktus perskaitė modelis, ir lieka
  „pasiūlytos“, kol administratorius jas patvirtina pareigų puslapyje. Pirmiau
  leiskite jas įvertinti, kad peržiūra prasidėtų ten, kur jos reikia:

  ```bash
  docker compose exec legalops-django python3 manage.py verify_obligations             # every act with unjudged obligations
  docker compose exec legalops-django python3 manage.py verify_obligations mica dora   # these acts
  docker compose exec legalops-django python3 manage.py verify_obligations --again     # judge anew (after the judge's prompt changed)
  ```

  Antrasis modelis kiekvieną pareigą palygina su nuostatomis, kuriomis ji
  remiasi, ir pažymi ją kaip pagrįstą, iš dalies pagrįstą arba nepagrįstą,
  pridėdamas pastabą. Apie minutę ir 15 centų šimtui pareigų su gpt-6.1-sol;
  išmatuota 2026 m. lapkričio 13 d.: visam 5 960 pareigų registrui prireikė
  369 iškvietimų ir 9,80 $. Tada puslapis pirmiausia rodo abejotinas.
  Vertintojas nieko netvirtina ir neatmeta, o pakartotinai paleista komanda
  skaito tik tai, kas dar neįvertinta.
- **Kaip buvo peržiūrėtas pateikiamas registras (2026-11-13).** Registras
  `postgres/bootstrap.sql.gz` — 5 960 pareigų iš 68 aktų — buvo įvertintas visas
  (apie 10 $), o tada administratoriaus nurodymu jį peržiūrėjo DI programavimo
  asistentas; žmogus jo įrašas po įrašo neskaitė. 5 777 įrašai, kuriuos
  vertintojas laikė pagrįstais, patvirtinti visi kartu, prieš tai 25 įrašų imtį
  patikrinus pagal aktų tekstą ir radus ją teisingą. 183 įrašai, kuriais
  vertintojas abejojo arba kurie turėjo tą patį trūkumą kaip abejotinas įrašas,
  perskaityti po vieną, lyginant su nuostatomis, kuriomis jie remiasi: 75
  patvirtinti nepakeisti, 86 pataisyti (kam pareiga taikoma, trūkstama sąlyga ar
  terminas; 38 performuluotus vertintojas perskaitė dar kartą), 10 atmesta —
  dublikatas, cituojantis formą ar skelbiamąjį straipsnį, arba valstybės narės
  pareiga — ir 12 palikta būsenos „pasiūlyta“, kad jas peržiūrėtų žmogus. Kiekvieno iš tų 183 pastabose
  nurodyta priežastis („Peržiūra 2026-11-13 …“). Kopijoje išvalyta, kas peržiūrėjo
  įrašą, kaip išvalyta ir kiekviena sąsaja su asmeniu. „Patvirtinta“ čia reiškia,
  kad vertintojas ir peržiūrėtojas nustatė, jog įrašą pagrindžia jo nuostatos;
  kas juo remiasi priimdamas sprendimą, nuostatą vis tiek perskaito.
- **Vėliau trūkstami katalogo aktai:** `seed_corpus` sukuria trūkstamus aktus,
  pvz., tuos, kurie į katalogą pateko jau po pradinio rinkinio kopijos, o esamus
  praleidžia. Jis taip pat iš naujo sukurtų aktą, kurį administratorius
  sąmoningai ištrynė; `--only <slug,…>` jį apriboja.
- **Antrojo lygio aktai, priežiūros institucijos nurodymai, EBI gairės**
  (kataloge nuo 2026-11-12): pagal MiCA ir DORA priimti techniniai standartai,
  privalomi paslaugų teikėjo veiklai (13 įjungta; 7 pateikiami išjungti — tie,
  kurie privalomi tik pareiškėjui, pranešančiajam subjektui ar subjektui,
  atrinktam grėsmėmis grindžiamam testavimui, ir du, kurie yra ataskaitų ir
  registrų šablonai laukas po lauko; įjunkite aktą jo puslapyje ir jis bus atsisiųstas), Lietuvos
  banko nurodymai dėl pinigų plovimo prevencijos (Nr. 03-17) ir dėl
  tarptautinių sankcijų (Nr. 03-98) bei EBI gairės dėl PP/TF rizikos veiksnių
  (EBA/GL/2021/02, konsoliduota redakcija, ir jų pakeitimas dėl kriptoturto
  paslaugų teikėjų EBA/GL/2024/01). Įkėlimas atliktas duomenų bazės kopijoje
  2026-11-12, įskaitant išjungtus: 24 aktai — 22 atsisiųsti, o dvi EBI gairės
  įkeltos iš failų — per 89 s, 0,075 $ vektoriams.

  EBI svetainės nėra leidžiamų adresų sąraše, todėl abi jos gairės įkeliamos:
  teisės aktų bazės puslapyje atidarykite kiekvieną aktą, atsisiųskite lietuvišką
  PDF iš jo šaltinio nuorodos ir įkelkite jį per „Įkelti naują redakciją“. (Kad
  jos būtų atsisiunčiamos, išėjimo leidžiamų adresų sąraše ir užduočių vykdytojo
  `extra_hosts` turėtų būti `www.eba.europa.eu`, o akto šaltinis turėtų būti
  pakeistas į žiniatinklio adresą.) Prieš skaitant PDF, pašalinamos jo puslapių
  antraštės ir puslapių numeriai; gairė, išspausdinta be pastraipų numerių —
  konsoliduoto teksto 2 gairė, — išsaugoma ir skaitoma kaip viena dalis.

  Jų pareigos išskiriamos kaip ir bet kurio akto — per pirmąją aktą vertinančią
  ataskaitą arba iš anksto visoms iš karto:

  ```bash
  docker compose exec legalops-django python3 manage.py extract_obligations   # every enabled act never read: the new ones
  ```

  17 įjungtų aktų reikia apie 36 modelio iškvietimų, apie 5 $ su gpt-6.1-sol
  (išmatuota šešiems iš jų: 10–18 centų už iškvietimą, 30–65 pareigos viename akte).
  Antrojo lygio aktas yra kandidatas toms įmonėms, kurioms kandidatas yra jo
  pagrindinis aktas, todėl kriptoturto paslaugų teikėjo ataskaita padidėja daugiausia
  13 aktų, abiem nurodymais ir gairėmis — keliais šimtais išvadų, jei
  įtraukiami visi. Apimties patvirtinimo lange kiekvienas aktas rodomas su jo įtraukimo
  kaina, o žmogus palieka nuošalyje tai, ko įmonei nereikia.
- Atsisiuntimo moduliai tam pačiam kompiuteriui siunčia ne daugiau kaip vieną
  užklausą per sekundę ir naudoja tik HTTPS. CELLAR `303` atsakymuose nurodomos
  `http://` vietos, kurias atsisiuntimo modulis perrašo į https.

### Pradinio rinkinio atnaujinimas

`postgres/bootstrap.sql.gz` yra šio egzemplioriaus teisės aktų bazės ir
instrukcijų momentinė kopija. Iš naujo sudarykite ją po teisės aktų bazės
atnaujinimo ar pareigų išskyrimo, kurį turėtų paveldėti nauji diegimai:

```bash
scripts/db_bootstrap_dump.sh
```

Scenarijus nukopijuoja gamybinę duomenų bazę į laikiną postgres (tas pats
atvaizdas, be tinklo) ir ištuština visas lenteles, išskyrus migracijų, teisės
aktų bazės lenteles ir instrukcijas. Jis pašalina naujesnių pakeistas aktų redakcijas,
išvalo nuorodas į paskyras ir pašalina įmonių vidaus pareigas. Jis taip pat
išvalo vektorius: SQL teksto pavidalu jie sudarė tris ketvirtadalius 156 MB
failo. Tada įrašo gzip suglaudintą paprastą SQL kopiją (apie 11 MB 2026 m. lapkričio 16 d. — saugykloje pateikiamas failas; kai kopija buvo 9 MB, tai truko apie 40 s). Gamybinė duomenų bazė tik skaitoma. Vėliau
pridėta lentelė pateikiama tuščia, kol neįtraukiama į scenarijaus `KEEP` sąrašą.
Neapdoroti šaltinio failai iš `_DATA/django/uploads/corpus/` neįtraukiami: kai
redakcija paruošta, jų niekas nebeskaito.

### Pavyzdinė įmonė 1009 LTD

`scripts/demo_1009.py` per API iš naujo sukuria kurso pavyzdinę įmonę. Jis užpildo profilį, įrašo deklaruotą MiCA licenciją ir įkelia 26 politikas iš pačios saugyklos turimos kopijos (`django/compliance/prompts/evals/data/1009-ltd/documents`; `MATERIALS` nurodo kitą katalogą). Jis idempotentiškas, o su `--analyse` dar išspausdina kainos įvertį ir pradeda ataskaitą, kurios apimtis — pagrindiniai kriptoturto paslaugų teikėjų (CASP) aktai. Naudojimas aprašytas scenarijaus antraštėje. Indeksavimas kainuoja centus; ataskaita kainuoja tiek, kiek išspausdina įvertis.

## 7. Leidžiamų adresų sąrašas išeinančiam srautui (teisės aktų šaltiniai, MCP serveriai)

Izoliuotame tinkle esantis konteineris išorinį kompiuterį pasiekia tik tada, kai
yra ABU dalykai:

1. `exit/Caddyfile` faile — `@exit_<name> tls sni <host>` blokas su
   `proxy <host>:443`;
2. `docker-compose.yml` faile — `extra_hosts` eilutė `"<host>:172.28.10.30"`
   jį naudojančioje paslaugoje.

Tada:

```bash
docker compose up -d
docker compose restart legalops-exit
```

`up -d` iš naujo sukuria naudojančią paslaugą; išėjimą reikia paleisti iš naujo,
nes pasikeitė tik jo Caddyfile.

| Naudojanti paslauga | Šiuo metu leidžiami kompiuteriai |
|---|---|
| `legalops-django` (užduočių ciklas) | „Teisės aktų šaltiniai“: CELLAR/SPARQL `publications.europa.eu`, `www.e-tar.lt`, `www.lb.lt`. Jo `extra_hosts` įrašuose yra ir `ai.knf.vu.lt`, nors niekas Django programoje DI tinklų sąsajos nekviečia |
| `legalops-assistant` | Kalbos modelių DI tinklų sąsaja `ai.knf.vu.lt`; čia pridedamas ir išorinio MCP serverio kompiuteris |

- **Konsolėje užregistruotas išorinis MCP serveris:** jo kompiuterį reikia
  pridėti, kaip aprašyta aukščiau, kitaip jo ryšio patikra nepavyksta dėl
  prisijungimo klaidos.
- `eur-lex.europa.eu` (AWS WAF patikra) ir `e-seimas.lrs.lt` (Cloudflare JS
  patikra) sąmoningai neįtraukti: automatinis atsisiuntimas be žmogaus jų
  neįveikia.
- Trūkstamas įrašas pasirodo kaip `Cannot reach <host> (ConnectionError) — is it
  on the egress allowlist?` prie akto arba kaip DNS klaida (`EAI_AGAIN`)
  asistento žurnale.

## 8. Biudžetai ir kvotos

- **DI tinklų sąsajos rakto komandos biudžetas (fakulteto Bifrost DI tinklų
  sąsajoje; 2026 m. rugsėjo 27 d. — 10 $, vėliau padidintas)** yra griežta viso diegimo riba. Kai jis išnaudotas, DI
  tinklų sąsaja į kiekvieną iškvietimą atsako HTTP 402: pokalbis rodo
  `AI_BUDGET_EXHAUSTED`, o analizės grandinės ir vektorizavimo užduotys
  nepavyksta. Operatoriai šį biudžetą padidina DI tinklų sąsajoje; niekas šioje
  sistemoje jo nekeičia. 2026 m. rugsėjo 27 d. jis buvo išnaudotas
  („Team budget exceeded: 10.18 >= 10.00 dollars“).
- **`LLM_DAILY_BUDGET_USD`** (numatytoji reikšmė 10,0, 0 = neribota) yra
  paskyros riba vienai UTC parai. Ji tik neleidžia vienai paskyrai išeikvoti
  bendro rakto.
  - Iki 2026 m. lapkričio 20 d. numatytoji reikšmė buvo 2,0. Nuo lapkričio
    naudojamu pokalbio modeliu (gpt-6-astra) ėjimas, kuriuo perskaitomi
    įmonės dokumentai, kainuoja apie 2,90 $, o vėlesnis juos perskaičiusio
    pokalbio ėjimas — apie 1,00 $, todėl vienas dokumentų perdavimas
    išnaudodavo įprastos paskyros dieną. 10,0 užtenka tam ėjimui ir darbo
    dienos pokalbiui; ataskaitai pradėti pakanka 0,25 $ likučio, ir ji gali
    biudžetą viršyti. Kintamąjį arba atskiros paskyros sumą nustatykite
    pagal tai, kiek leidžia DI tinklų sąsajos biudžetas.
  - Administratoriams riba netaikoma, nebent administratorius jiems nustato
    sumą. Puslapyje „Naudotojai“ kiekviena paskyra gali gauti savo biudžetą:
    numatytąjį, neribotą arba sumą USD (`dailyBudgetUsd`).
  - **Kas įskaičiuojama:** kiekvienas paskyrai užregistruotas modelio
    iškvietimas — pokalbio ėjimai, ataskaitų vykdymai (išskyrus vienkartinį
    pareigų išskyrimą vykdymo metu, kuris niekam nepriskiriamas), instrukcijų
    bandomieji vykdymai, modelio vertinimas nuorodų patikrose, paskyros įkeltų
    dokumentų vektoriai ir pareigų išskyrimai, kuriuos administratorius
    įtraukia į eilę iš teisės aktų bazės puslapio.
  - **Kas atmetama, kai biudžetas išnaudotas:** pokalbio ėjimas; ataskaitos
    pradėjimas (reikia, kad liktų 0,25 $, o pradėtas vykdymas niekada
    nestabdomas pusiaukelėje); instrukcijos bandomasis vykdymas. Nuorodų
    patikra tada antraštes vertina pagal žodžių sutapimą, o ne modelio sprendimu. Įkelto
    failo indeksavimas laukia biudžeto atnaujinimo: užduotis pati save
    įtraukia į eilę 00:05 UTC (žr. operatoriaus kontrolinį sąrašą).
- **`UPLOAD_QUOTA_FILES` / `UPLOAD_QUOTA_BYTES`** (1000 failų / 2 GiB vienai
  paskyrai) riboja saugomus dokumentus: tiek įmonės dokumentus, tiek pokalbių
  priedus. Ištrintas dokumentas atlaisvina savo dalį.
- **Užklausų turinys.** Įėjimas nieko neriboja. Django atmeta didesnį nei
  50 MiB dokumentą ar pokalbio priedą (`MAX_FILE_BYTES` faile
  `django/compliance/companies/api/document_views.py`) ir didesnį nei 60 MiB
  teisės aktą (`MAX_UPLOAD_BYTES` faile `django/compliance/corpus/api/views.py`),
  kai turinys jau įrašytas į buferį (operatoriaus kontrolinis sąrašas,
  „Įkėlimų buferis“). Asistentas pokalbio maršrutuose priima ne daugiau kaip
  512 kB JSON. Konsolė didesnio failo atsisako dar prieš ką nors siųsdama; jos
  abiejų skaičių kopijos ir failų tipai, kuriuos priima kiekvienas įkėlimas,
  yra `vite/app/src/constants/uploads.js`. Ribą keiskite abiejose vietose, tada
  paleiskite `./runUpdateThisStack.sh`.

## 9. Trikčių šalinimas

| Požymis | Tikėtina priežastis | Sprendimas |
|---|---|---|
| `502` iš įėjimo | Paslauga, kuriai jis perduoda užklausas, neveikia arba dar paleidžiama (atnaujinimo metu — kol vėl veikia) | `docker compose ps`; `docker compose logs --tail 100 <service>` |
| `runUpdateThisStack.sh` baigiasi migracijos klaida | Migracija nepavyko; sistema veikia su sena schema | Ištaisykite, tada `docker compose exec legalops-django python3 manage.py migrate` |
| Analizės etapas nepavyksta: „Prompt '…' has no active version“ | `seed_prompts` niekada nevykdytas duomenų bazėje, kuri nebuvo sukurta iš pradinio rinkinio | `docker compose exec legalops-django python3 manage.py seed_prompts` |
| Užduotys lieka eilėje | Nėra užduočių ciklo: `legalops-worker` paleidžiamas iš naujo arba legalops-django neveikia | `docker compose logs --tail 20 legalops-worker`; `docker compose exec legalops-django cat /tmp/worker.pid` |
| `/api/health` 503 `"reason": "database"` | Postgres neveikia, neteisingas slaptažodis `DATABASE_URL` arba užimti visi ryšiai („too many clients already“ API žurnale) | `docker compose logs legalops-postgres`; palyginkite `docker-compose.yml` su role (§4); užimtus ryšius atlaisvina `docker compose restart legalops-django` — tada išsiaiškinkite, kas juos laiko (§5) |
| `/api/health` 503 `"reason": "uploads"` arba įkėlimo klaidos „Permission denied“ | Kataloge `_DATA/django` yra root priklausančių failų | `chown -R 1000:1000 _DATA/django` (atnaujinimo scenarijus tai daro) |
| postgres paleidžiamas iš naujo su „data directory has wrong ownership / invalid permissions“ | `_DATA/postgres` savininkas ne uid 1000 / teisės ne 0700 | `chown -R 1000:1000 _DATA/postgres && chmod 700 _DATA/postgres` |
| Pokalbis atsako 503 arba rodo `AI_BUDGET_EXHAUSTED`; užduotys nepavyksta su `[402] … budget exceeded` | Išnaudotas DI tinklų sąsajos komandos biudžetas arba tuščias `AI_GATEWAY_KEY` | §8 — padidinkite biudžetą DI tinklų sąsajoje / nustatykite raktą |
| Pokalbis praneša, kad asistentas paleidžiamas iš naujo (`SHUTTING_DOWN`) | Atnaujinimas paleidžia asistentą iš naujo | Palaukite kelias sekundes |
| Teisės aktas nepavyksta: „Cannot reach <host> … egress allowlist?“ | Kompiuteris neįtrauktas į leidžiamų adresų sąrašą | §7 |
| Prisijungimas atsako „Per daug bandymų“ (429 `RATE_LIMITED`) | 10 bandymų vienai paskyrai per 10 minučių arba `LOGIN_RATE_PER_IP` (60) per minutę iš vieno adreso — o lankytojai, kurie išorinį tarpinį serverį pasiekia per prieš jį esantį tarpinį mazgą, visi yra vienas adresas | Palaukite `Retry-After`; žr. „Kliento adresas“ |
| Veiksmų žurnale naudotojai dalijasi vienu IP, `172.16.0.1` | Jie išorinį tarpinį serverį pasiekia per tarpinį mazgą, kurio adresą tas serveris perduoda toliau, o įėjimas gautą `X-Forwarded-For` nukopijuoja į `X-Real-IP` (deployment.md §5) | Taip ir turi būti, kol išorinis tarpinis serveris lankytojo adreso nesužino iš to mazgo; žr. „Kliento adresas“ |
| Puslapiai įsikelia, bet prisijungimas ir kiekvienas kitas rašymas atsako 403 be turinio | Įėjimo Origin apsauga: naršyklės `Origin` nesibaigia užklausos `://<host>` — svetainė atidaryta ne numatytuoju prievadu arba išorinis tarpinis serveris keičia antraštę `Host` | Atidarykite svetainę jos viešuoju adresu; deployment.md §5 |
| Pokalbio atsakymas ateina visas iš karto arba nutrūksta po 60 s | Išorinis tarpinis serveris kaupia SSE buferyje arba jo skaitymo laiko limitas per trumpas | deployment.md §5 |
| Dokumentas lieka „Teksto nėra“ (`extractionStatus: empty`) | Nuskenuotas PDF be teksto sluoksnio; OCR nėra | Įkelkite PDF su tekstu arba DOCX |
| Caddyfile pakeitimas neturi poveikio | Konteineris vis dar naudoja seną failą | `docker compose restart legalops-endpoint` (arba `-exit`) |
| Įkeliamas failas atmetamas kaip per didelis | Viršyta Django vieno failo riba (§8) | Taip ir turi būti |

## 10. Komponentų atnaujinimas

- **Postgres 17.x šalutinė versija:** pakeiskite `FROM` žymą faile
  `postgres/Dockerfile`, tada `./runUpdateThisStack.sh`. Disko formatas
  nesikeičia.
- **Nauja pagrindinė versija** (18): duomenų bazę reikia išrašyti su
  `pg_dump` ir įkelti su `pg_restore` į tuščią naujos versijos klasterį;
  saugykloje niekas to neautomatizuoja.
- **pgvector:** padidinkite `PGVECTOR_VERSION`, iš naujo sukurkite atvaizdą,
  tada supernaudotojo teisėmis atnaujinkite plėtinį:

  ```bash
  docker compose exec legalops-postgres psql -U legalops -d legalops -c "ALTER EXTENSION vector UPDATE"
  ```

- **Caddy, node, python, DbGate:** pakeiskite žymą Dockerfile ar compose
  faile, tada `./runUpdateThisStack.sh`.

## 11. Kūrimo režimas

`docker-compose.yml` veikia kūrimo režimu; deployment.md §6 jį perjungia į
gamybinį. Kūrimo režimas reiškia:

- vite kūrimo serveris su HMR, nodemon asistentui, Django
  `runserver`;
- prijungti šaltinio katalogai: įrašytas failas iš naujo įkelia konsolę,
  kūrimo režimo asistentą ir Django. Užduočių ciklas iš naujo neįsikelia:
  `docker compose restart
  legalops-worker` paleidžia jį su nauju kodu;
- vite ir asistentas išoriniame tinkle dėl npm, o tai asistentui suteikia ir
  išėjimą, aplenkiantį išėjimo leidžiamų adresų sąrašą.

## 12. Testai

Kiekvienas rinkinys vykdomas konteineriuose. `runUpdateThisStack.sh` nė vieno iš
jų nevykdo: paleiskite juos prieš diegdami kodo pakeitimą.

| Vykdyklė | Kuria | Vykdo |
|---|---|---|
| `django/runTests.sh` | `legalops-postgres` iš `postgres/` ir `legalops-django-test` iš `django/` (su įtrauktu dabartiniu šaltinio kodu) | Laikiną Postgres + pgvector (duomenys tmpfs) privačiame tinkle, tada `makemigrations --check --dry-run` ir `manage.py test` su 4 lygiagrečiais procesais. Modelis ir vektorizavimo modelis yra imitacijos |
| `assistant/runTests.sh` | Gamybinį atvaizdą kaip `legalops-assistant-check` (`npm ci --omit=dev`) | `node --test` be tinklo, su tik skaitoma šaknine failų sistema, uid 1000, 4 CPU ir 3 GB, konteineryje, pavadintame `legalops-assistant-tests-<pid>`. Testai ir paslaugos README prijungiami tik skaitymui; nieko už `assistant/` ribų neprijungiama |
| `vite/runTests.sh` | `vite/Dockerfile` kūrimo etapą kaip `legalops-vite-check` (`npm ci`, tada `npm run build` su vertimų sargu) | vitest (jsdom, msw užpakalinės sistemos dublis) be tinklo, konteineryje, pavadintame `legalops-vite-tests-<pid>`, 4 procesai |

- **Pačių instrukcijų atvejai.** Aukščiau išvardyti rinkiniai vykdomi su modelio
  imitacija: jie įrodo, kad veikia sistemos jungtys, o ne instrukcijos. Ką instrukcijos pakeitimas
  daro modelio atsakymams, matuojama saugykloje laikomais pažymėtais atvejais
  (`django/compliance/prompts/evals/cases/*.yaml`, kiekvienas su atsakymu, kurį
  pateikia atidus skaitytojas, ir jo priežastimi):

  ```bash
  docker compose exec legalops-django python3 manage.py eval_prompts            # every suite
  docker compose exec legalops-django python3 manage.py eval_prompts verify     # one suite
  docker compose exec legalops-django python3 manage.py eval_prompts --record   # accept the scores as the baseline
  ```

  Komanda kviečia tikrą modelį per tą patį kodą, kurį vykdo produktas (apie
  dolerį šešiems rinkiniams, išmatuota 2026 m. lapkričio 12 d., — registro
  vertintojui, akto apimčiai, nuorodų patikrai, kurie aktai taikomi įmonei,
  kiek gali kainuoti pažeidimas, ir atitikties spragų analizei, kuri sudaro
  beveik pusę sumos — 0,42 $),
  išspausdina kiekvieną atvejį, kuriame modelis suklydo, ir baigiasi klaida, kai
  rinkinio rezultatas žemesnis už `prompts/evals/baseline.json`. Paleiskite ją
  prieš keisdami vieną iš šių instrukcijų, jos modelį ar atsakymo schemą ir po
  to — schemos forma yra dalis to, ką modelis skaito (2026 m. lapkričio 17 d.
  dviem formomis parašyta schema spragų rinkiniui kainavo tris atvejus), — ir
  lyginkite du tos pačios dienos vykdymus, o ne vien kiekvieną su baziniu
  rezultatu: tiekėjo modelis kinta, ir tą dieną vienas sankcijų atvejis nepavyko
  ir su nepakeistu kodu. Vienu metu vykdykite vieną rinkinį: keli greta paleisti
  rinkiniai viršija DI tinklų sąsajos žetonų spartos ribą, o atmestas vykdymas
  baigiasi klaida. Naują bazinį rezultatą įrašykite tik perskaitę, kas vis dar
  neteisinga. Bazinis rezultatas
  instrukcijos versiją įvardija jos numeriu toje duomenų bazėje, kurioje jis
  buvo įrašytas: ta pati formuluotė kitame diegime gali turėti kitą numerį.
  Apimties, nuorodų,
  taikytinumo ir sankcijų rinkiniai skaito šio diegimo teisės aktų bazę; spragų rinkinys dar skaito pavyzdinės įmonės 26
  politikas ir profilį, laikomus šalia atvejų
  (`prompts/evals/data/1009-ltd`), todėl bet kuriame diegime vertina tuos pačius
  dokumentus. Jo 71 atvejį pažymėjo du skaitytojai, kurie nematė modelio
  atsakymų; atvejis, kuriame atidus skaitytojas galėtų atsakyti ir taip, ir
  kitaip, antrąjį atsakymą nurodo po `accept`. Modelio atsakymai nuo vykdymo
  iki vykdymo šiek tiek skiriasi, todėl bazinio rezultato įrašas gali turėti
  `slack` — atvejų skaičių, kurį vykdymas gali prarasti, kol rinkinys dar
  nelaikomas nepavykusiu (spragų rinkiniui — 2). Žyma keičiama redaguojant jos atvejį.
- **Persidengimas.** Trys vykdyklės gali veikti vienu metu, kiekviena — ir šalia
  antro savo paties vykdymo:
  - Django savo duomenų bazės konteinerį ir tinklą pavadina pagal vykdymą
    (`legalops-test-db-<run>`), o kiekvienas lygiagretus procesas gauna savo
    įkėlimų katalogą (`compliance/tests/runner.py`);
  - konsolės ir asistento vykdyklės savo konteinerius pavadina pagal vykdymą.
- `django/runTests.sh` savo kuriamą Postgres atvaizdą pažymi `legalops-postgres`
  — ta pačia žyma, kurią naudoja sistema: paredagavus `postgres/Dockerfile`, kitas
  sistemos `up` iš naujo sukuria postgres iš patikrinto atvaizdo.
- Asistento rinkinys skaito paslaugos README (`assistant/README.md`, kurį
  vykdyklė prijungia šalia testų) ir nė vieno failo iš `docs/`: jei README
  faile trūksta maršruto arba jame nurodytas kelias, kurio asistentas
  neaptarnauja, rinkinys nepavyksta.

Rinkinio dalių vykdymas:

```bash
django/runTests.sh compliance.tests.test_corpus               # one module
django/runTests.sh compliance.tests.test_audit.AuditPagingTests  # one class
PARALLEL=1 VERBOSITY=2 django/runTests.sh compliance.tests.test_jobs   # serial, verbose

assistant/runTests.sh tests/server.test.mjs                    # some files (paths inside app/)
assistant/runTests.sh --test-name-pattern='SIGTERM'            # any node --test flag

vite/runTests.sh tests/pages/users.test.jsx                    # some files (paths inside app/)
vite/runTests.sh -t 'route sweep'                              # any vitest argument
```

Kai dirbama su vienu failu, greičiau vykdyti testus tiesiai su darbiniu medžiu,
nekuriant atvaizdo:

```bash
docker run --rm --network none -v "$PWD/assistant/app:/app" -w /app --cpus=4 --memory=3g \
    node:24.16.0 node --test --test-force-exit tests/<file>.test.mjs
docker run --rm --network none -v "$PWD/vite/app:/app" -w /app node:24.16.0 npx vitest run tests/pages/users.test.jsx
docker run --rm --network none -v "$PWD/vite/app:/app" -w /app node:24.16.0 npm run lint   # eslint + the translation guard
```

Šios komandos naudoja `node_modules`, kuriuos kūrimo konteineriai įdiegė į
prijungtus katalogus (naujai paimtoje saugyklos kopijoje pirmiau tame pačiame konteineryje
paleiskite `npm ci`). Be vykdyklės prijungtų katalogų praleidžiamos asistento
README taisyklės, todėl prieš diegimą lemia tik visas
`runTests.sh` vykdymas. Rinkinių struktūra ir susitarimai aprašyti
`assistant/app/tests/README.md` ir `vite/app/tests/README.md`.

**Veikiančios sistemos greitoji patikra (asistentas).** `assistant/app/tests/live-smoke.test.mjs`
nemokamai patikrina veikiantį asistentą: `/health`, atsisakymus, ar Django
atsako į tapatybės patikrą, ar DI tinklų sąsajos modelių sąraše yra
sukonfigūruoti modeliai, ir ar jokiame atsakyme nėra paslapties. Jis nepradeda
jokio pokalbio ėjimo. Vykdyklė jį praleidžia; paleiskite jį po diegimo:

```bash
# Dev mode: app/ is mounted in the running container
docker exec -w /app -e RUN_LIVE=1 legalops-assistant node --test tests/live-smoke.test.mjs

# Either mode (the production image carries no tests): the stack's own image, on the assistant's network
docker run --rm --network container:legalops-assistant --read-only --tmpfs /tmp --user 1000:1000 \
    --env-file .env -e RUN_LIVE=1 -v "$PWD/assistant/app/tests:/app/tests:ro" -w /app \
    legalops-assistant node --test tests/live-smoke.test.mjs
```

## Kliento adresas

Gamybiniame kompiuteryje viešos užklausos pasiekia `legalops-endpoint` iš išorinio tarpinio serverio `172.19.2.3`. Tas tarpinis serveris siunčia `X-Forwarded-For: 172.16.0.1` — privatų prieš jį esančio tarpinio mazgo adresą, todėl tikrasis lankytojo adresas prarandamas dar prieš mūsų sistemą (patikrinta 2026 m. rugsėjo 27 d.). Tikėtina priežastis — Docker naudotojo erdvės tarpinis serveris išorinio tarpinio serverio paskelbtame prievade arba dar vienas tarpinis mazgas. Paties įėjimo prieigos žurnalas nuo 2026 m. lapkričio 9 d. 13:16 iki lapkričio 16 d. 10:00 UTC tai patikslina: iš 59 993 užklausų, turėjusių šią antraštę, 47 407 joje buvo `172.16.0.1` — tarp jų 7 573 iš 7 795 atėjusių su antrašte `Authorization`, t. y. prisijungusių naudotojų darbas, — 12 585 — viešas adresas, iš viso 258 skirtingi, ir vienoje — kitas privatus adresas; dar 2 345 užklausos šios antraštės neturėjo (jos atėjo ne per tarpinį serverį). Antraštėje kaskart buvo lygiai vienas adresas, niekada ne sąrašas. Taigi adresas prarandamas tiems lankytojams, kurie tarpinį serverį pasiekia per tą mazgą, — tai beveik visas prisijungusių naudotojų darbas, — o lankytojas, kurį tarpinis serveris mato tiesiogiai, ateina su viešu adresu.

Įėjimas gautą `X-Forwarded-For` nukopijuoja į `X-Real-IP`, pakeisdamas kliento atsiųstą `X-Real-IP`, o Django kliento adresą ima iš šios antraštės — kai ji tuščia, iš TCP partnerio adreso; asistentas ją perduoda toliau su iškvietimais, kuriuos atlieka naudotojo vardu (deployment.md §5). Pasekmės:
- Kiekvienas lankytojas už to mazgo veiksmų žurnale ir prisijungimų iš vieno IP ribojime matomas kaip vienas adresas `172.16.0.1`; lankytojas, kurį tarpinis serveris mato tiesiogiai, matomas viešu adresu, kurį nurodo tarpinis serveris. Užklausa, kuri įėjimą pasiekia be `X-Forwarded-For`, — atlikta pačiame kompiuteryje — matoma kaip paties įėjimo adresas.
- Todėl lankytojams už to mazgo prisijungimų iš vieno IP riba (`LOGIN_RATE_PER_IP`, numatytoji reikšmė 60 per minutę) yra vienas langas, kuriuo jie visi dalijasi: ji nė vieno iš jų neatskiria, o 60 bandymų per minutę, kad ir kuris iš jų juos atliktų, sulaiko prisijungimą jiems visiems, kol langas baigiasi. Nuo slaptažodžių spėliojimo saugo paskyros riba (10 per 10 minučių).
- Viešuoju keliu klientas savo adreso pasirinkti negali: išorinis tarpinis serveris kliento atsiųstą `X-Forwarded-For` perrašo. Išbandyta 2026 m. lapkričio 16 d., į viešąjį adresą nusiuntus vieną užklausą su išgalvotomis antraštėmis `X-Forwarded-For` ir `X-Real-IP`: įėjimas gavo paties tarpinio serverio `X-Forwarded-For` (`172.16.0.1`), o išgalvotą antraštę `X-Real-IP`, kurią tarpinis serveris praleido, pakeičia įėjimas. Klientas, kuris įėjimą pasiekia tiesiogiai — iš kompiuterio arba iš prieglobos tinklo, — vis tiek gali atsiųsti bet kokį adresą.
- Visa kita ištaisyti dabar turi vien išorinis tarpinis serveris: srautui, kuris ateina per tą mazgą, jis turi sužinoti lankytojo adresą (pasitikėti prieš jį esančiu mazgu arba išjungti Docker `userland-proxy`, kad paskelbti prievadai išlaikytų šaltinio adresą) ir į `X-Forwarded-For` įrašyti jį, ir tik jį. Įėjimas antraštę jau perduoda toliau. Tada veiksmų žurnalo eilutėje (`auth.login_failed`) patikrinkite, ar matomas tikrasis adresas.

## Operatoriaus kontrolinis sąrašas (likusios rizikos)

Ko kodas neapima ir ką turi nuspręsti ar padaryti operatorius. Patikrinta
gamybiniame kompiuteryje 2026 m. rugsėjo 28 d.

1. **Nėra patikimo kliento adreso.** Žr. „Kliento adresas“. Veiksmų žurnalo IP
   stulpelis rodo vieną adresą, `172.16.0.1`, kiekvienam lankytojui, kuris
   išorinį tarpinį serverį pasiekia per prieš jį esantį tarpinį mazgą, — tai
   beveik visas prisijungusių naudotojų darbas, — o prisijungimų iš vieno IP
   riba yra vienas langas, kuriuo jie visi dalijasi. (Įėjimo dalis — pagal
   `endpoint/Caddyfile` 2026 m. lapkričio 16 d. būklę; tarpinio serverio
   antraštė — tokia, kokią rodo įėjimo prieigos žurnalas nuo 2026 m. lapkričio
   9 d. iki 16 d.)
2. **Prieglobos valdymo sistema gali skaityti ir rašyti šį katalogą.**
   - `sistema-filebrowser` prijungia `/apps/aplikacijos` skaitymui ir rašymui;
     `sistema-dockge` jį prijungia skaitymui ir rašymui kartu su Docker lizdu.
     Abu pasiekia `.env`, įkeltus failus ir `_DATA/postgres`.
   - Juos aptarnauja `sistema-endpoint` (kompiuterio prievadas 10080, per kurį
     taip pat perduodamas Docker lizdas ir žiniatinklio SSH). Jis įsileidžia tik
     prieglobos valdymo tarpinius serverius pagal šaltinio adresą (172.19.2.2 ir
     172.19.2.11).
   - Apribokite, kas gali pasiekti tuos valdymo tarpinius serverius, ir
     kiekvieną, kas gali, laikykite turinčiu root teises šiame kompiuteryje.
3. **Gamyboje veikia kūrimo režimas.**
   `docker-compose.yml` vykdo kūrimo serverius iš prijungtų šaltinio katalogų,
   o asistentas yra išoriniame tinkle (neribotas išėjimas); gamybinis režimas
   (deployment.md §6) tai panaikina. Pats įėjimas dabar tikrina Origin ir
   siunčia CSP bei HSTS (deployment.md §5, pagal `endpoint/Caddyfile`
   2026 m. lapkričio 16 d. būklę); jo CSP vis dar leidžia įterptinius
   scenarijus bei stilius ir `eval`.
4. **DI tinklų sąsajos raktas.** `.env` ir `AI.txt` dabar turi teises 600;
   anksčiau gamybiniame kompiuteryje juos galėjo skaityti visi (644). Jei
   tuomet juos galėjo perskaityti kiti vietiniai naudotojai ar valdymo sistemos
   naudotojai, pakeiskite `AI_GATEWAY_KEY` DI tinklų sąsajoje (§4). `AI.txt` tik
   dubliuoja raktą: ištrinkite jį, kai raktas yra `.env`.
5. **Likučiai `.env` (patikrinta 2026 m. lapkričio 4 d.).** Senasis atnaujinimo
   scenarijus į gamybinį `.env` įrašė `ADMIN_EMAIL` ir `ADMIN_PASSWORD` (pirmojo
   administratoriaus slaptažodį atviru tekstu), o `AI_EMBED_DIMENSIONS` iš kodo
   jau pašalintas. Nė vieno iš šių trijų niekas neskaito: ištrinkite juos, o jei
   administratoriaus slaptažodis niekada nebuvo keistas, pakeiskite jį puslapyje
   „Paskyra“.
6. **Dokumentų vektorizavimas ir biudžetas.** Įkelto failo indeksavimas
   priskiriamas įkėlėjui. Kai jo dienos biudžetas išnaudotas, indeksavimo
   užduotis nieko nevektorizuoja: ji vėl įtraukia save į eilę 00:05 UTC, po
   biudžeto atnaujinimo, o jos rezultatas tai nurodo puslapyje „Užduotys“
   („Laukia dienos DI biudžeto“). Paskyros su neribotu biudžetu
   (pagal numatymą — administratoriai) niekada nesulaikomos.
   - Įkėlimų kvota riboja, kiek viena paskyra laiko vienu metu. Su
     numatytosiomis reikšmėmis (1000 failų, 2 GiB, daugiausia 4 milijonai
     išgautų simbolių dokumente, text-embedding-3-large už 0,13 $ už milijoną
     žetonų) tai apytiksliai 65–100 $ už 2 GiB paprasto teksto ir daugiausia
     apie 160–195 $, kai 1000 suglaudintų PDF ar DOCX failų kiekvienas pasiekia
     simbolių ribą.
   - Dokumentų trynimas atlaisvina kvotą, todėl paskyra, kuri cikliškai
     įkelia ir trina, kasdien išleidžia iki savo dienos biudžeto — ne daugiau.
   - Stebėkite sąnaudų puslapį („Vektorizavimas“); jei taip nutinka,
     sumažinkite paskyros biudžetą ar `UPLOAD_QUOTA_*` arba deaktyvuokite
     paskyrą.
7. **Įkėlimų buferis.** Django užklausų failus iki 5 MB laiko atmintyje
   (`FILE_UPLOAD_MAX_MEMORY_SIZE`), o didesnius įrašo į buferį `/tmp`
   (`FILE_UPLOAD_TEMP_DIR` nenustatytas). `legalops-django` konteineryje tai
   512 MB tmpfs kompiuterio atmintyje, bendras su WeasyPrint šriftų podėliu.
   Jį užpildo maždaug dešimt vienu metu vykstančių didžiausio dydžio įkėlimų,
   taip pat vienas per didelis užklausos turinys, nes įėjimas nieko neriboja;
   tada vėlesni įkėlimai nepavyksta, kol buferis atsilaisvina.
8. **Instrukcijų injekcija tarp įmonių** (angl. prompt injection). Pokalbis
   veikia savo naudotojo teisėmis, o administratoriaus teisės apima visas
   įmones.
   - Dokumente įterptas nurodymas, kurį perskaito administratoriaus pokalbis,
     galėtų priversti modelį kviesti įmonių ir ataskaitų įrankius kitoms
     įmonėms: skaityti ar redaguoti profilius, prisijungimo duomenis ir roles, keisti
     išvadų būsenas, pradėti analizę administratoriaus biudžeto ribose.
   - Įrankiai negali pasiekti naudotojų, teisės aktų bazės, instrukcijų, MCP
     nustatymų ar veiksmų žurnalo.
   - Administratoriai turėtų kiekvieną pokalbį susieti su įmone, apie kurią jis
     vyksta, tikrinti kiekvieno atsakymo įrankių žymes ir kasdieniam analizės
     darbui naudoti paprasto naudotojo paskyrą.
9. **MCP serveriai mato tai, ką jiems siunčia modelis.** Įjungtas serveris
    gauna savo įrankių iškvietimų argumentus, kuriuose gali būti įmonės duomenų
    iš pokalbio. Įjungkite tik serverius, kuriais pasitikite, o
    `allowedTools` susiaurinkite iki to, ko reikia.
10. **Administratorių duomenų bazės įrankis.** `/dbgate/` kiekvienam
    prisijungusiam administratoriui atveria visą duomenų bazę: DbGate prie
    Postgres jungiasi kaip supernaudotojas, o tai, kas ten skaitoma ar
    keičiama, aplenkia API — be tikrinimo, be nuosavybės taisyklės, be veiksmų
    žurnalo eilutės (įėjimo prieigos žurnalas rodo užklausas, ne SQL
    sakinius). Todėl administratoriaus paskyra ar pavogta administratoriaus
    sesija yra visa prieiga prie duomenų bazės: administratorių turėkite
    nedaug. (Perskaityta iš `endpoint/Caddyfile` ir versijuojamo compose
    pavyzdžio 2026 m. lapkričio 16 d.; tą dieną įrankis veikė gamybiniame
    kompiuteryje.)
