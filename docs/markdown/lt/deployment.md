# Atitikties asistentas — diegimas

Kaip įdiegti sistemą pagrindiniame kompiuteryje, ką turi daryti išorinis
tarpinis serveris ir kaip perjungti compose failą į gamybinį režimą.
Kasdienis eksploatavimas (atnaujinimai, paslapčių keitimas,
mastelio keitimas, trikčių šalinimas) aprašyta
[operations.md](operations.md).

## 1. Kas veikia

Vienas Docker Compose projektas iš `docker-compose.yml`, pavadintas pagal savo
katalogą (`comp-assistant`). Failas veikia kūrimo režimu; eilutės, pažymėtos
`# Dev` / `# Prod`, jį perjungia (§6).

| Paslauga | Atvaizdas | Paskirtis |
|---|---|---|
| `legalops-endpoint` | caddy:2.11-alpine | Įeinančio srauto tarpinis serveris pagrindinio kompiuterio 80 prievade: `/api/assistant/*` — asistentui, `/api/*` — Django, `/dbgate/*` — DbGate, prieš tai su `forward_auth` paklausus Django `/api/auth/checkauth/admin`, visa kita — grafinei sąsajai (viešoji svetainė šakniniame kelyje, konsolė kelyje `/console`); Origin apsauga, taip pat CSP ir HSTS kiekviename atsakyme, kuriuo jis užklausos neatmeta (§5); prieigos žurnalas JSON formatu |
| `legalops-exit` | vuknf/caddy-l4:2.11 | Išeinančio srauto tarpinis serveris: TLS SNI leidžiamų adresų sąrašas adresu 172.28.10.30 |
| `legalops-vite` | `vite/Dockerfile.dev` (gamyboje: `vite/Dockerfile`) | Grafinė sąsaja — viešoji svetainė ir konsolė: vite kūrimo serveris (gamyboje: sukompiliuoti failai, kuriuos pateikia Caddy) |
| `legalops-django` | `django/Dockerfile` | JSON API: `runserver` (gamyboje: gunicorn, 3 procesai × 8 gijos). Jame veikia ir užduočių vykdytojo ciklas |
| `legalops-worker` | docker:27-cli | Paleidžia užduočių ciklą konteineryje legalops-django (`docker exec … manage.py run_worker`): teisės aktų įkėlimas, dokumentų indeksavimas, pareigų išskyrimas, ataskaitų rengimo grandinė, priežiūros darbai |
| `legalops-assistant` | `assistant/Dockerfile.dev` (gamyboje: `assistant/Dockerfile`) | Pokalbis (SSE) ir visi modelio iškvietimai |
| `legalops-postgres` | `postgres/Dockerfile` | Postgres 17.11 + pgvector 0.8.6; tuščias klasteris įkelia `postgres/bootstrap.sql.gz` |
| `legalops-dbgate` | dbgate/dbgate:7.3.3-alpine | DbGate — duomenų bazės žiniatinklio klientas administratoriams: pateikiamas adresu `/dbgate/` už Django administratorių vartų; prie Postgres jungiasi kaip supernaudotojas `legalops` |

Kiekvieno konteinerio šakninė failų sistema yra tik skaitoma. Įėjimas,
išėjimas, Django ir Postgres veikia kaip uid 1000. Grafinė sąsaja ir
asistentas veikia kaip numatytasis jų atvaizdo naudotojas, root: compose
faile eilutė `user: 1000:1000` abiem užkomentuota, ir nė vienas jų
Dockerfile nenustato `USER`. `legalops-dbgate` taip pat veikia kaip root.
Kaip root veikia ir `legalops-worker` — kad galėtų naudotis Docker lizdu,
todėl pagrindiniame kompiuteryje jis faktiškai turi root teises; jis neturi
tinklo ir nevykdo nieko, išskyrus tą `docker exec`. Compose failas nenustato
nei `init`, nei galimybių atėmimo, nei išteklių limitų, nei būklės patikrų,
nei paleidimo tvarkos: paslaugos paleidžiamos kartu, o įėjimas atsako 502,
kol nepradeda veikti jo tiksliniai serveriai.

Tinklai:

- `isolated` (172.28.10.0/24, `internal: true`; compose prie jo pavadinimo
  prideda projekto priešdėlį) jungia visas paslaugas, išskyrus užduočių
  vykdytoją, ir neturi maršruto į išorę.
- `external` (172.18.0.0/24) nėra paties compose projekto tinklas: tai
  Docker tinklas būtent tokiu pavadinimu, kurį compose failas tik nurodo
  (`external: true`), o `runUpdateThisStack.sh` sukuria, kai pagrindiniame
  kompiuteryje tokio nėra. Prie jo prisijungia įėjimas (jis publikuoja 80
  prievadą) ir išėjimas, o kūrimo režimu — dar vite ir asistentas, kad
  pasiektų npm. Visa kita, kas pagrindiniame kompiuteryje naudoja tinklą
  tokiu pavadinimu, juo dalijasi: gyvame pagrindiniame kompiuteryje jis buvo
  dar iki šios sistemos, ir jame yra ir prieglobos paslaugos
  `sistema-endpoint` bei `sistema-webssh2` (matyta 2026 m. lapkričio 16 d.).

Išeinantis srautas eina per išėjimą. Konteineris izoliuotame tinkle išorinį
serverį pasiekia tik per `extra_hosts` įrašą, nukreipiantį į 172.28.10.30,
kartu su `@exit_` bloku faile `exit/Caddyfile`, ir tik per HTTPS
(operations.md §7). Šiuo metu asistentas pasiekia `ai.knf.vu.lt`, o
legalops-django (užduočių vykdytojo ciklui) — `publications.europa.eu`,
`www.e-tar.lt` ir `www.lb.lt`; compose faile `ai.knf.vu.lt` įrašas yra ir
konteineriui legalops-django, nors niekas Django programoje DI tinklų
sąsajos nekviečia. Kūrimo režimu asistentas yra ir išoriniame tinkle, t. y.
aplenkia leidžiamų adresų sąrašą.

## 2. Būtinos sąlygos

- Linux pagrindinis kompiuteris su Docker Engine (išbandyta su 27.3.1) ir
  abiem compose sąsajomis: `runUpdateThisStack.sh` kviečia `docker-compose`,
  o ši dokumentacija ir scenarijai — `docker compose` (išbandyta su 2.40.3 ir
  2.29.7). Pagrindiniame kompiuteryje daugiau nieko nediegiama (nei node, nei
  pip).
- 4 procesoriaus branduolių ir 8 GB RAM pakanka su atsarga. Nė vienas konteineris neturi
  atminties limito; didžiausią apkrovą sukelia izoliuoti ištraukimo
  antriniai procesai (kiekvienas po 1,5 GB adresų erdvės) ir PDF
  generavimas.
- Diskas: apie 3 GB atvaizdams, plius `_DATA` (duomenų bazė ir įkelti
  failai).
- Laisvas pagrindinio kompiuterio 80 prievadas, o potinkliai 172.28.10.0/24
  ir 172.18.0.0/24 nenaudojami kitų Docker tinklų. Pirmasis nustatytas faile
  `docker-compose.yml`: prireikus pakeiskite jį ten ir kartu suderinkite
  išėjimo IP adresą bei visus `extra_hosts` įrašus. Antrasis nustatytas
  scenarijuje `runUpdateThisStack.sh`, kuris su juo sukuria tinklą
  `external`; pagrindinis kompiuteris, jau turintis tinklą tokiu pavadinimu,
  palieka jį tokį, koks yra, ir sistema prie jo prisijungia.
- Išeinantis HTTPS srautas iš pagrindinio kompiuterio į `ai.knf.vu.lt`,
  `publications.europa.eu`, `www.e-tar.lt`, `www.lb.lt`, o atvaizdų kūrimo
  metu — į Docker Hub, npm, PyPI, GitHub (pgvector) ir Debian bei Alpine
  paketų veidrodžius.
- Priekyje — atvirkštinis tarpinis serveris, užbaigiantis TLS (§5).

## 3. Naujas įdiegimas

```bash
git clone <repo> /apps/aplikacijos/comp-assistant
cd /apps/aplikacijos/comp-assistant
cp docker-compose.sample.yml docker-compose.yml
touch .env && chmod 600 .env
$EDITOR .env                  # one line: AI_GATEWAY_KEY=<the gateway key>
./runUpdateThisStack.sh
```

`docker-compose.yml` nėra versijuojamas: tai paties įdiegimo turima
`docker-compose.sample.yml` kopija, ir niekas jos už jus nepadaro. Failo
`.env.sample` taip pat nėra: `.env` prasideda nuo vienos eilutės su DI tinklų
sąsajos raktu, o scenarijus prideda paslaptis, kurias sugeneruoja.

Scenarijus kaskart atlieka tą patį:

1. Sukuria `_DATA/django/uploads` ir `_DATA/postgres` ir `_DATA` savininku
   nustato uid 1000.
2. Prie `.env` prideda tai, ko jame trūksta, o jei failo nėra, jį sukuria
   (tada su apvalkalo numatytosiomis teisėmis: `chmod 600 .env`):
   `DJANGO_SECRET_KEY` ir `ASSISTANT_INTERNAL_SECRET` (šešioliktainiu
   pavidalu) bei `DBGATE_PASSWORD` (šešioliktainiu pavidalu) kartu su
   `DBGATE_AUTH_HEADER` (`dbgate:<password>` Base64 koduote). Kiekvienas
   sugeneruojamas tik tada, kai `.env` neturi jam skirtos eilutės, — DbGate
   pora tada, kai nėra eilutės `DBGATE_PASSWORD`. Jau esanti eilutė, net ir
   tuščia, nekeičiama.
3. Sukuria Docker tinklą `external` (potinklis 172.18.0.0/24). Kai tinklas
   tokiu pavadinimu jau yra — kiekvieną vėlesnį kartą arba nuo pat pradžių
   pagrindiniame kompiuteryje, kuriame jį sukūrė kita sistema, — Docker
   atsako, kad jis yra, ir scenarijus tęsia darbą.
4. Sustabdo sistemą ir vėl ją paleidžia iš naujai sukurtų atvaizdų
   (`docker-compose down`, tada `up -d --build`).
5. Palaukia 5 s ir konteineryje legalops-django paleidžia
   `manage.py migrate --noinput`.

`seed_prompts` jis nepaleidžia (operations.md §2).

Pirmą kartą paleistas postgres randa tuščią `_DATA/postgres` ir įkelia
`postgres/bootstrap.sql.gz`, kurį compose prijungia tik skaitymui. Tai
gzip suglaudintas paprastas SQL failas, apie 11 MB (2026 m. lapkričio 19 d.
išklotinė). Jame yra:

- schema su visomis pritaikytomis migracijomis;
- teisės aktų bazė: 78 katalogo aktai ir 68 įjungtų aktų dabartinės
  redakcijos su jų struktūra, fragmentais ir išskirtomis pareigomis;
- instrukcijos: 23, iš viso 91 versija, kiekvienos naujausia — aktyvi.

Vektorių jame nėra. Jame taip pat nėra paskyrų, įmonių ar kitų duomenų iš
egzemplioriaus, iš kurio jis paimtas. Įkėlimas trunka apie 10 s, t. y.
ilgiau nei scenarijaus 5 s laukimas. Todėl scenarijaus paleistas `migrate`
gali baigtis klaida „connection refused“. Tai nekenkia: pradiniame rinkinyje
migracijos jau pritaikytos. Vėlesni paleidimai randa klasterį ir nieko
neįkelia.

Tada, tik pirmojo įdiegimo metu, sukurkite pirmąjį administratorių,
prisijunkite ir vektorizuokite teisės aktų bazę:

```bash
./runCreateAdmin.sh           # asks for the admin's e-mail and password
```

Numatytojo prisijungimo nėra. Scenarijus konteineryje legalops-django
įvykdo `manage.py create_admin`; slaptažodis jam perduodamas aplinkos
kintamuoju, o ne komandų eilute.

- **Vektorizavimas.** Puslapio „Teisės aktų bazė“ meniu
  punktas „Perskaičiuoti visus vektorius“ įtraukia į eilę `corpus.reembed`.
  Ši užduotis per DI tinklų sąsają vektorizuoja kiekvieną dabartinį
  fragmentą ir abiem kalbomis kiekvieną pareigą. Tai apie 4 100 fragmentų ir
  11 900 pareigų tekstų: kelios minutės ir mažiau nei 1 $. Kol ji neįvykdyta:
  - teisės aktų bazės paieška randa tik raktinių žodžių atitikmenis;
  - ataskaita apie įmonę, kurios dokumentai kartu viršija 600 000 simbolių
    (`DOCUMENT_PACK_CHARS`), negauna nė vieno iš jų: tokiai įmonei
    pateikiami tik kiekvienai pareigai artimiausi dokumentai, parenkami
    pagal vektorius. Mažesnis dokumentų rinkinys siunčiamas visas ir nuo
    to nepriklauso;
  - aktų redakcijų lentelėje vietoj vektorizavimo modelio rodomas „—“.
- Slaptažodis į konteinerį perduodamas kintamojo vardu, niekada komandinėje
  eilutėje. Prisijungimo forma priima bet kokį adresą, kurio pavidalas
  `something@something`, kaip ir Django.
- Pradinis rinkinys yra tiek aktualus, kiek jo paskutinė išklotinė. Kai
  saugykloje esantys numatytieji instrukcijų tekstai ar katalogas naujesni,
  `seed_prompts` (operations.md §2) ir `seed_corpus` (operations.md §6)
  prideda tai, ko trūksta. Suplanuotas teisės aktų bazės atnaujinimas aktus
  atnaujina iki dabartinių redakcijų.

Patikrinkite rezultatą:

```bash
docker compose ps                       # every service Up
curl -s http://127.0.0.1/api/health     # {"status": "ok", ...}
```

Tada prisijunkite viešuoju adresu ir pereikite operatoriaus kontrolinį sąrašą
operations.md pabaigoje.

## 4. `.env` aprašas

Failo `.env` teisės yra 600, ir jis niekada neįtraukiamas į saugyklą. Compose
įstato jo reikšmes; scenarijus jį skaito tik su grep, prideda tai, ko
trūksta, ir niekada jo neįkelia komanda source. Ką iš jo ima
`docker-compose.yml`:

| Kintamasis | Numatytoji reikšmė | Kas skaito | Pastabos |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | sugeneruojamas | django | Tik Django vidiniams poreikiams (API autentifikavimui naudojami prieigos raktai; juo niekas nešifruojama) |
| `ASSISTANT_INTERNAL_SECRET` | sugeneruojamas | django, assistant | Saugo abi `/internal/*` prieigas; tuščias — kiekvienas vidinis iškvietimas atmetamas |
| `DBGATE_PASSWORD` | sugeneruojamas | dbgate | Paties DbGate prisijungimo slaptažodis (naudotojas `dbgate`). Niekas jo neįveda: jį pateikia įėjimas |
| `DBGATE_AUTH_HEADER` | sugeneruojamas kartu su juo | endpoint | `dbgate:<DBGATE_PASSWORD>` Base64 koduotė: įėjimas ją prideda kaip Basic `Authorization` antraštę kelyje `/dbgate/*`, kai Django administratorių vartai užklausą praleidžia. Abu keičiami kartu |
| `AI_GATEWAY_URL` | `https://ai.knf.vu.lt/v1` | assistant | DI tinklų sąsaja, veikianti pagal OpenAI API: `/responses` (kalbos modeliai), `/embeddings`, `/models` |
| `AI_GATEWAY_KEY` | — (nustatomas rankiniu būdu) | assistant | Be jo pokalbis ir kiekvienas grandinės etapas atsako 503 |
| `AI_CHAT_MODEL` | `azure/gpt-5.5` | assistant | Pokalbio modelis, kai instrukcijos versija modelio nenurodo; kartu pateikiamos instrukcijos savo modelius nurodo |
| `AI_EMBED_MODEL` | `azure/text-embedding-3-large` | assistant | Prašoma 1536 dimensijų (modeliuose fiksuotas plotis; ilgesnis vektorius sutrumpinamas iki jo ir normalizuojamas iš naujo). Django kopija įrašyta pačiame `docker-compose.yml`: pakeiskite abi, tada paleiskite visų vektorių perskaičiavimą (puslapis „Teisės aktų bazė“ → „Perskaičiuoti visus vektorius“ arba `corpus.reembed` be dokumento — jis atnaujina teisės aktų bazę, pareigas ir įmonių dokumentus) |
| `LLM_DAILY_BUDGET_USD` | `10.0` | django | USD vienai paskyrai per UTC parą, 0 = neribota (operations.md §8) |
| `LOGIN_RATE_PER_IP` | `60` | django | Prisijungimo bandymai iš vieno kliento adreso per minutę |
| `UPLOAD_QUOTA_FILES` | `1000` | django | Dokumentų skaičius vienai paskyrai |
| `UPLOAD_QUOTA_BYTES` | `2147483648` | django | Baitai vienai paskyrai (2 GiB) |
| `GUNICORN_WORKERS` / `GUNICORN_THREADS` | `3` / `8` | django (gamyboje) | operations.md §5 |

Duomenų bazės rolė, kuria jungiasi Django, — supernaudotojas `legalops` —
ir jos slaptažodis įrašyti pačiame `docker-compose.yml` (`DATABASE_URL`,
`POSTGRES_PASSWORD` ir konteinerio `legalops-dbgate`, kuris jungiasi ta
pačia role, `PASSWORD_con1`). Postgres pasiekiamas tik izoliuotame tinkle —
o administratoriui dar ir per DbGate adresu `/dbgate/`.

Asistento derinimo kintamieji (pokalbio ir modelio laiko limitai,
`RATE_LIMIT_TURNS`, `SHUTDOWN_GRACE_MS`, neprivalomi `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `OLLAMA_BASE_URL`, …) su numatytosiomis reikšmėmis
išvardyti faile `assistant/app/config.js`. Compose nė vieno iš jų neperduoda,
todėl norint kurį nors nustatyti, jį reikia pridėti prie
`legalops-assistant` skyriaus `environment` faile `docker-compose.yml`.
Tas pat galioja ir pačios API kintamiesiems: `DJANGO_DEBUG`,
`DB_CONN_MAX_AGE`, `UPLOAD_DIR` ir `ASSISTANT_URL`
(`django/compliance/settings.py`) išlaiko numatytąsias reikšmes, kol
nepridedami prie `legalops-django` skyriaus `environment`. Užduočių
vykdytojo ciklas `WORKER_PID_FILE` ir `WORKER_HEARTBEAT_FILE` skaito iš savo
paties aplinkos (operations.md §5 pirmąjį perduoda su `docker exec -e`).

## 5. TLS ir išorinis tarpinis serveris

`legalops-endpoint` pagrindinio kompiuterio 80 prievade veikia paprastu
HTTP. Adreso https://compliance.knf-hosting.lt TLS užbaigiamas prieglobos
paslaugos išoriniame atvirkštiniame tarpiniame serveryje.

**Kaip ateina užklausos (stebėta gyvame pagrindiniame kompiuteryje, 2026 m. rugsėjo 27 d.).**

- Viešasis vardas išsprendžiamas į 158.129.172.222 — prieglobos paslaugos
  priekinį serverį.
- Įėjimo konteineryje viešojo srauto TCP partnerių adresas yra
  **172.19.2.3**. Pagrindinis kompiuteris yra tinkle 172.19.2.128/24 už
  šliuzo 172.19.2.1, o Docker iptables DNAT išsaugo tarpinio serverio šaltinio
  adresą.
- Užklausos, atliekamos pačiame pagrindiniame kompiuteryje
  (`curl http://127.0.0.1/`), vietoj to eina per docker-proxy ir ateina iš
  išorinio tilto šliuzo adreso: 172.18.0.1 įėjimo prieigos žurnale nuo
  2026 m. lapkričio 9 d. iki 16 d. (172.28.11.1, kai tai buvo stebėta pirmą
  kartą, — tada tiltas buvo 172.28.11.0/24).

**Kliento adresas.** Išorinis tarpinis serveris siunčia
`X-Forwarded-For: 172.16.0.1` (matyta 2026 m. rugsėjo 27 d.) — prieš jį
esančio tarpinio mazgo adresą, todėl lankytojo adresas prarandamas dar iki
sistemos. Įėjimo prieigos žurnalas nuo 2026 m. lapkričio 9 d. iki 16 d.
rodo, kad taip yra lankytojams, kurie tarpinį serverį pasiekia per tą mazgą,
— keturios užklausos iš penkių, beveik visas prisijungusių naudotojų
darbas, — o kiti ateina su viešu adresu (operations.md, „Kliento adresas“).
Asistentui, API ir grafinei sąsajai įėjimas gautą `X-Forwarded-For` perduoda
toliau ir tą pačią reikšmę įrašo į `X-Real-IP`, pakeisdamas kliento atsiųstą
`X-Real-IP`. Django kliento adresą ima iš `X-Real-IP` — kai antraštė tuščia,
iš TCP partnerio adreso, — o asistentas šią antraštę perduoda toliau su
iškvietimais, kuriuos atlieka naudotojo vardu. Taigi adresas, kurį jie
registruoja žurnale ir pagal kurį riboja užklausų dažnį, yra tas, kurį į
`X-Forwarded-For` įrašė prieš įėjimą esantis tarpinis serveris arba
klientas, pasiekiantis įėjimą tiesiogiai; be tokios antraštės kiekvienas
lankytojas yra paties įėjimo adresas. Klientas negali pasirinkti savo
adreso, siųsdamas savą `X-Forwarded-For`: išorinis tarpinis serveris tą
antraštę perrašo (išbandyta 2026 m. lapkričio 16 d., nusiuntus užklausą į viešąjį adresą:
įėjimas gavo tarpinio serverio reikšmę, o ne išgalvotąją).

**Ką daro pats įėjimas (`endpoint/Caddyfile`).** Į užklausą, kurios
antraštė `Origin` nustatyta ir nesibaigia `://<the request's host>`, jis
atsako 403 be turinio: tai kitos svetainės puslapis, kviečiantis šią.
Klientas, kuris `Origin` nesiunčia, praleidžiamas. Serverio vardas lyginamas
be prievado, o `Origin` nurodo bet kurį prievadą, išskyrus numatytąjį, todėl
svetainė turi būti pateikiama numatytuoju prievadu. Kiekvienas kitas
atsakymas — taip pat peradresavimas, 502, kai tikslinis serveris neveikia,
ir vartų atsisakymas kelyje `/dbgate/` — turi
`Strict-Transport-Security: max-age=31536000` ir `Content-Security-Policy`:
viskas iš pačios svetainės, scenarijai ir stiliai — dar ir įterptiniai,
scenarijai — dar ir per `eval`, paveikslėliai ir šriftai — dar ir iš `data:`
adresų, rėminti gali tik pati svetainė, ir `upgrade-insecure-requests` —
naršyklei nurodoma viską atsisiųsti per HTTPS, kurį suteikia išorinis
tarpinis serveris. Įėjimas nenustato nei užklausos turinio dydžio ribos, nei
laiko limitų. `/dbgate` peradresuoja į `/dbgate/`, o užklausa po šiuo keliu
`legalops-dbgate` pasiekia tik po to, kai Django
`GET /api/auth/checkauth/admin` atsako, kad kviečiantysis yra
administratorius; tada įėjimas vietoj užklausos antraštės `Authorization`
įrašo paties DbGate Basic prisijungimą (`DBGATE_AUTH_HEADER`, §4). Vartų
atsisakymas grąžinamas toks, koks yra.

**Ką turi daryti išorinis tarpinis serveris:**

- Persiųsti `https://compliance.knf-hosting.lt/*` į `http://<host>:80` su
  antrašte `Host` tokia, kokią atsiuntė naršyklė: Origin apsauga su ja lygina
  užklausos `Origin`.
- Į `X-Forwarded-For` įrašyti lankytojo adresą, ir tik jį, perrašant tai, ką
  atsiuntė klientas: įėjimas antraštę nukopijuoja visą. Veikiančios sistemos
  tarpinis serveris lankytojams, kurie ateina per tarpinį mazgą, vietoj to
  nurodo tą mazgą (žr. aukščiau).
- Nebuferizuoti `text/event-stream`. Pokalbio atsakymai srautu per SSE
  siunčiami iki maždaug 3 minučių, o niekas sistemoje nesiunčia
  `X-Accel-Buffering: no`, todėl priekyje esančiam nginx reikia
  `proxy_buffering off` keliui `/api/assistant/`.
- Turėti bent 330 s skaitymo laiko limitą: ataskaitų eksportas ir
  instrukcijų bandomieji paleidimai minutėmis vykdomi sinchroniškai, o
  samprotaujantis modelis prieš pirmąjį žetoną gali tylėti 90 s. Lėto modelio
  bandomasis paleidimas su ilga įvestimi gali trukti iki 15 minučių; jei
  tarpinis serveris jį nutraukia anksčiau, instrukcijų redaktorius rodo
  klaidą, nors iškvietimas vis tiek baigiamas ir užregistruojamas.
- Leisti bent 62 MiB užklausų turinį (teisės aktų įkėlimai; Django atmeta
  didesnį nei 60 MiB failą) ir jo neperrašyti.
- Palikti įėjimo antraštes `Strict-Transport-Security` ir
  `Content-Security-Policy` nepakeistas. Pačiam nustatyti HSTS nebūtina: ją
  siunčia įėjimas.

## 6. Gamybinis režimas

Faile `docker-compose.yml` užkomentuokite eilutes, pažymėtas `# Dev`, ir
atkomentuokite pažymėtas `# Prod`, tada paleiskite `./runUpdateThisStack.sh`.
Tuomet gamyboje veikia:

- sukompiliuota SPA (ją pateikia Caddy) ir gamybinis asistento atvaizdas
  (`node server.js`), be prijungtų išeities kodo katalogų ir be išorinio
  tinklo;
- Django su gunicorn iš į atvaizdą įtraukto kodo (`DJANGO_RUNSERVER`
  nenustatytas).

Nuo tada kodo pakeitimas konteinerius pasiekia tik per
`./runUpdateThisStack.sh`. Ką vietoj to vykdo kūrimo režimas, aprašyta
operations.md §11.
