# API žinynas

Visus toliau aprašytus maršrutus po `/api/*` aptarnauja Django paslauga. Maršrutus `/api/assistant/*` aptarnauja node asistentas. Caddy įeinančio srauto tarpinis serveris abu juos pateikia tuo pačiu adresu kaip ir naudotojo sąsają. Autoritetingas maršrutų turinys – `django/compliance/urls.py`: kiekvienas rodinių failas prasideda antrašte, kurioje išvardyti jo maršrutai ir užklausų bei atsakymų turinio formos.

## Susitarimai

- **Autentifikacija.** `Authorization: Bearer <token>`. Prieigos raktą išduoda `POST /api/auth/login`; jis galioja 30 dienų, o paskyra laiko 10 naujausių sesijų (vienuoliktas prisijungimas baigia seniausią). API nepriima autentifikacijos per slapukus (vienintelį slapuką – toliau aprašytą vartų slapuką – skaito tik administravimo įrankių vartai), o savarankiškos registracijos nėra.
- **Rolės.**
  - `user` mato tik savo įmones, dokumentus, pokalbius, ataskaitas, užduotis ir DI sąnaudas.
  - `admin` papildomai tvarko naudotojus, teisės aktų bazę, pareigas, instrukcijas, MCP serverius ir veiksmų žurnalą. Administratorius mato visas įmones, dokumentus, ataskaitas, užduotis ir modelio iškvietimus (DI sąnaudų žurnalą, įskaitant pokalbių įrašus), tačiau niekada nemato kitų naudotojų pokalbių.
  - Atsisakius parodyti duomenis atsakoma 404, ne 403: įrašo, kurio kviečiantysis matyti negali, jam tiesiog nėra. Paprastas naudotojas, kreipęsis į tik administratoriams skirtą maršrutą, gauna 403 `FORBIDDEN`.
- **Keliai.** Django maršrutai baigiasi be pasvirojo brūkšnio; tas pats kelias su juo grąžina 404.
- **Užklausų ir atsakymų turinys.** JSON į abi puses, UTF-8 simboliai paliekami tokie, kokie yra (neužkoduojami).
  - Data ir laikas pateikiami ISO 8601 formatu su laiko juostos poslinkiu (`2026-09-27T18:00:00+00:00`).
  - Identifikatoriai yra uuid4 eilutės.
  - Turinys, kuriame yra NaN/Infinity (taip pat perpildyti skaičiai, pvz., `1e999`), NUL simbolių ar pavienių surogatų arba kurio įdėjimo gylis viršija 32 lygius, atmetamas kaip nepateiktas (daugumoje maršrutų – 400 `INVALID_BODY`).
  - Įėjimas turinio dydžio neriboja. Django atmeta failą, viršijantį vienam failui leistiną dydį (413 `FILE_TOO_LARGE`; ribos nurodytos prie kiekvieno įkėlimo maršruto), o asistentas – didesnį nei 512 kB pokalbio užklausos turinį (413 `PAYLOAD_TOO_LARGE`).
- **Klaidos.** Django visada atsako `{"error": "prose", "code": "SLUG"}` su prasmingu HTTP būsenos kodu; paties įėjimo grąžinamas 502 (kai vidinė paslauga neveikia arba persikrauna) turinio neturi, kaip ir jo 403 atsakymas į užklausą, kurios `Origin` antraštė nurodo kitą svetainę (kitos kilmės puslapis, kviečiantis API; klientui, kuris `Origin` nesiunčia, tai įtakos neturi). Node asistentas (`/api/assistant/*`) atsako `{"message": "prose", "error": {"code": "SLUG", "message": "prose", "retryAfterS"?}}`. Django klaidų kodai:

| Būsena | Kodai |
|---|---|
| 400 | `INVALID_BODY`, `MISSING_FIELDS`, `INVALID_FIELD`, `INVALID_QUERY`, `INVALID_VALUE`, `EMPTY_UPDATE`, `BAD_REQUEST`, `MISSING_FILE`, `INVALID_EMAIL`, `INVALID_ROLE`, `WEAK_PASSWORD`, `WRONG_PASSWORD`, `LAST_ADMIN`, `SELF_LOCKOUT`, `UNKNOWN_MODEL`, `NOTHING_TO_ASSESS`, `NOTE_REQUIRED` |
| 401 | `AUTH_REQUIRED` (sesijos nėra arba ji nebegalioja), `INVALID_CREDENTIALS` (prisijungiant) |
| 402 | `AI_BUDGET_EXHAUSTED` – iš asistento (išnaudotas paties DI tiekėjo biudžetas); ataskaitos vykdymas, nutrūkęs dėl šios priežasties, šį kodą nurodo klaidos teksto pradžioje |
| 403 | `FORBIDDEN`, `ROLE_NOT_ALLOWED`, `INTERNAL_ONLY` |
| 404 | `NOT_FOUND`, `PROMPT_NOT_CONFIGURED` (vidinės durys: instrukcija be aktyvios versijos) |
| 405 | `METHOD_NOT_ALLOWED` (su antrašte `Allow`) |
| 409 | `ALREADY_RUNNING`, `CORPUS_EMPTY`, `NOT_CANCELLABLE`, `STILL_RUNNING`, `NOT_FINISHED`, `NOT_INGESTED`, `DUPLICATE_NAME`, `SLUG_TAKEN`, `MESSAGE_ID_TAKEN`, `EMAIL_TAKEN`, `UNCHANGED`, `NO_FILE`, `ALREADY_ADOPTED`, `NOT_WAITING`, `CLOSED_BY_REPORT`, `NO_DOCUMENTS`, `NOT_DRAFT`, `RULES_BROKEN`, `NOT_APPROVED`, `NEWER_VERSION`, `NOT_READY`, `UNKNOWN_KIND` |
| 413 | `FILE_TOO_LARGE`, `QUOTA_EXCEEDED`, `MESSAGE_TOO_LARGE` |
| 429 | `RATE_LIMITED` (su `Retry-After`), `BUDGET_EXCEEDED` |
| 500 | `SERVER_ERROR` |
| 502 | `MODEL_ERROR` |
| 503 | `MODELS_UNAVAILABLE` (nepavyko nuskaityti DI tinklų sąsajos modelių sąrašo) |

  Asistento pokalbių maršrutai prideda: 400 `INVALID_JSON`, `INVALID_THREAD`, `INVALID_TRIGGER`, `INVALID_MESSAGE`, `INVALID_PARENT`, `INVALID_PART`, `INPUT_TOO_LARGE`, `EMPTY_MESSAGE`; 401 `SESSION_INVALID`; 404 `THREAD_NOT_FOUND`; 413 `PAYLOAD_TOO_LARGE`; 415 `UNSUPPORTED_ENCODING`; 500 `HISTORY_UNREADABLE`; 502 `DJANGO_UNREACHABLE`; 503 `NOT_CONFIGURED`, `PROMPT_NOT_CONFIGURED`, `PROMPT_UNAVAILABLE`, `SHUTTING_DOWN`. Gedimas, įvykęs jau prasidėjus srautui, ateina pačiame sraute kaip klaidos dalis su kodu `MODEL_TIMEOUT`, `STREAM_FAILED`, `AI_BUDGET_EXHAUSTED` arba kodu, kuris pasako, ar verta bandyti dar kartą: `MODEL_UNAVAILABLE` (laikinas gedimas – tinklas, užklausų dažnio riba, tiekėjo 5xx: bandykite vėliau), `MODEL_REFUSED` (modelis šios užklausos nepriima: pasirinkite kitą modelį), `MODEL_CONTEXT_EXCEEDED` (pokalbis ilgesnis, nei modelis gali priimti: pradėkite naują), `MODEL_CONTENT_FILTERED` (sustabdė tiekėjo turinio filtras: performuluokite) arba `MODEL_ACCESS_DENIED` (DI tinklų sąsaja atmetė asistento raktą: tai administratoriaus reikalas). Asistento vidiniai maršrutai grąžina ir kitus kodus, kuriuos skaito tik Django, tarp jų 502 `MCP_UNREACHABLE` („Vidinės durys“, žr. toliau).

- **Biudžetai.** Modelio iškvietimai registruojami su jų kaina JAV doleriais (paieškos užklausų vektorizavimas neregistruojamas). Naudotojas per UTC parą gali išleisti `LLM_DAILY_BUDGET_USD` (numatytoji reikšmė 10,00 $) arba savo `dailyBudgetUsd`; numatytasis administratorių biudžetas neribotas. Išnaudojus biudžetą, pokalbio ėjimai ir instrukcijų bandomieji vykdymai atmetami. Ataskaitai pradėti turi likti bent 0,25 $; pradėtas vykdymas niekada nestabdomas pusiaukelėje. Skaičiuojamas ir dokumentų indeksavimas: išnaudojus biudžetą, įkelto dokumento užduotis `documents.index` nieko nevektorizuoja ir vėl įsirašo į eilę, kad būtų vykdoma 00:05 UTC (jos rezultatas: `{waitingForBudget: true, resumesAt}`). Pareigų išskyrimas ataskaitos vykdymo metu yra bendras teisės aktų bazės darbas ir ataskaitos naudotojui neapmokestinamas; išskyrimas, kurį administratorius paleidžia iš teisės aktų bazės puslapio, registruojamas to administratoriaus sąskaita. Kai išnaudojamas paties DI tiekėjo biudžetas, iškvietimai baigiasi klaida `AI_BUDGET_EXHAUSTED`.

## Būklė

| | |
|---|---|
| `GET /api/health` | `200 {status: "ok", service: "legalops-django", database: "ok", uploads: "ok"}` arba `503 {status: "error", service, reason: "database"\|"uploads", database, uploads}`, nurodant pirmą nepavykusią patikrą (bet ne priežastį – ji yra žurnale). Viešas; veikia ir `HEAD`. |

## Autentifikacija – `users/api/auth_views.py`

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `POST /api/auth/login` | `{email, password}` → `{token, user}`. El. pašto adresas lyginamas neatsižvelgiant į raidžių dydį. Nežinomas el. pašto adresas, neteisingas slaptažodis ir išjungta paskyra gauna tą patį atsakymą 401 `INVALID_CREDENTIALS`. Ribojama iki `LOGIN_RATE_PER_IP` bandymų per minutę iš vieno kliento IP adreso (numatytoji reikšmė 60 – dosni, nes visa auditorija už vieno tarpinio serverio dalijasi tuo pačiu IP) ir iki 10 bandymų per 10 minučių vienai paskyrai (apsauga nuo slaptažodžio spėliojimo; skaičiuojamas kiekvienas bandymas pagal paskyrą, į kurią nukreipia el. pašto adresas, kad ir kaip jis parašytas) → 429 `RATE_LIMITED` su `Retry-After`. Prisijungimai ir nesėkmės registruojami veiksmų žurnale. |
| `GET /api/auth/me` | → `user` = `{id, email, displayName, role, active, dailyBudgetUsd, createdAt, lastLoginAt}` |
| `GET /api/auth/checkauth/admin` | Administravimo įrankių vartai, kurių Caddy `forward_auth` klausia prieš perduodamas užklausą į `/dbgate/` → `user` aktyviam administratoriui, 401 `AUTH_REQUIRED` be galiojančios sesijos, 403 `FORBIDDEN` bet kuriai kitai rolei. Sesija nustatoma pagal prieigos raktą arba – kadangi naršyklėje atidarytas įrankis siunčia tik slapukus – pagal vartų slapuką `compliance_gate`, kurį nustato prisijungimas (HttpOnly, SameSite=Strict, Secure ne DEBUG režimu, galioja sesijos 30 dienų) ir kurio galiojimą baigia abu atsijungimo maršrutai. Joks kitas maršrutas šio slapuko neskaito. |
| `POST /api/auth/logout` | Nutraukia pateiktą sesiją ir baigia vartų slapuko galiojimą → `{ok: true}`. |
| `POST /api/auth/logout-all` | Nutraukia visas kviečiančiojo sesijas, įskaitant pateiktąją, ir baigia vartų slapuko galiojimą → `{ok: true}`. Registruojama veiksmų žurnale. |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` → `{ok: true}`. Slaptažodžio taisyklės: bent 10 simbolių, ne daugiau kaip 72 baitai (400 `WEAK_PASSWORD`; neteisingas dabartinis slaptažodis – 400 `WRONG_PASSWORD`). Visos kitos sesijos nutraukiamos. Dabartinio slaptažodžio patikra įskaičiuojama į paskyros prisijungimų langą (429 `RATE_LIMITED`); neteisingas slaptažodis registruojamas veiksmų žurnale. |

## Naudotojai (administratoriui) – `users/api/users_views.py`

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET /api/users` | → `{users}`: visos paskyros, įskaitant išjungtas, nuo seniausios. |
| `POST /api/users` | `{email, displayName, role?: "user"\|"admin" (default user), password}` → 201 naudotojas. El. pašto adresas saugomas mažosiomis raidėmis; jau užimtas adresas, kad ir kokiu raidžių dydžiu parašytas, grąžina 409 `EMAIL_TAKEN`. Taip pat 400 `INVALID_EMAIL`, `MISSING_FIELDS`, `INVALID_ROLE`, `WEAK_PASSWORD`. |
| `GET /api/users/{id}` | → naudotojas |
| `PATCH /api/users/{id}` | `{displayName?, role?, active?: bool, dailyBudgetUsd?: null\|number}` → naudotojas. Lauke `dailyBudgetUsd` (0–10000) `null` reiškia numatytąją reikšmę, o `0` – neribotą biudžetą. Išjungus paskyrą, jos sesijos nutraukiamos. Tuščias pakeitimas – 400 `EMPTY_UPDATE`. |
| `DELETE /api/users/{id}` | Išjungia paskyrą ir nutraukia jos sesijas → išjungtas naudotojas. |
| `DELETE /api/users/{id}?purge=true` | Visam laikui ištrina paskyrą, aktyvią ar ne, kartu su tuo, kas jai priklauso: jos įmonėmis (jų ataskaitomis, leidimais ir rolėmis), dokumentais (tekstu, paieškos fragmentais ir, įvykdžius duomenų bazės transakciją, failais) ir pokalbiais → `{ok: true, removed: {companies, reports, documents, threads}}`. Dokumentas, kurį kita paskyra įdėjo į vieną iš jos įmonių, lieka, tik atsiejamas. DI sąnaudų žurnalas išsaugo iškvietimus ir jų kainas, bet netenka pokalbių įrašų; sąnaudų ir veiksmų žurnalo įrašai išsaugo savo istoriją, tik be sąsajos su paskyra. Niekada negalima ištrinti paties kviečiančiojo paskyros (400 `SELF_LOCKOUT`) ar paskutinio aktyvaus administratoriaus (400 `LAST_ADMIN`); 409 `STILL_RUNNING`, kol kurios nors jos įmonės analizė laukia eilėje ar vykdoma. Registruojama veiksmų žurnale (`users.purge`, su el. pašto adresu ir kiekiais). |
| `POST /api/users/{id}/reset-password` | `{password}` → `{ok: true}`. Visos tos paskyros sesijos nutraukiamos. |

Paskutinio aktyvaus administratoriaus negalima pažeminti ar išjungti (400 `LAST_ADMIN`), ir niekas negali pažeminti ar išjungti savęs paties (400 `SELF_LOCKOUT`). Kiekvienas pakeitimas registruojamas veiksmų žurnale.

## Įmonės – `companies/api/company_views.py`, `standard_views.py`, `role_views.py`

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET /api/companies?scope=own&q=` | → `{companies}`, ne daugiau kaip 500, pradedant vėliausiai atnaujintomis. `q` lyginamas žodis po žodžio: kiekvienas žodis turi būti pavadinime arba registracijos kode, bet kokia tvarka ir raidžių dydžiu; skyrybos ženklai, teisinės formos (UAB, LTD, …) ir žodžiai „company“ / „įmonė“ praleidžiami, o užklausa, sudaryta vien iš tokių žodžių, lyginama visa. `scope=own` administratoriui palieka tik jo paties įmones. Kiekviena įmonė turi `ownerId` ir `ownerName` (savininko rodomą vardą, o jei jo nėra – el. pašto adresą). |
| `POST /api/companies` | `{name, …profile}` → 201, įmonė su `credentials`, `standards`, `roles`, `documents` |
| `GET /api/companies/{id}` | Ta pati išsami forma. |
| `PUT /api/companies/{id}` | Dalinis atnaujinimas: bet koks profilio laukų poaibis; nežinomi raktai ignoruojami. Neteisinga reikšmė – 400 `INVALID_FIELD`. |
| `DELETE /api/companies/{id}` | Ištrina leidimus, taikomus standartus, roles, ataskaitas ir programos dokumentus; dokumentai atsiejami, bet neištrinami → `{ok: true}`. Grąžina 409 `STILL_RUNNING`, kol vykdoma analizė arba generuojamas programos dokumentas. |

**Profilio laukai**

| Laukas | Tipas |
|---|---|
| `name` | Privalomas tekstas (≤ 500 simbolių) |
| `registrationCode`, `legalForm`, `sector` | Tekstas (≤ 500 simbolių) |
| `country` | Tekstas, numatytoji reikšmė `LT`; dviejų raidžių kodas saugomas didžiosiomis raidėmis |
| `naceCodes` | Iki 50 kodų sąrašas (kiekvienas ≤ 20 simbolių) |
| `sizeCategory` | `micro\|small\|medium\|large\|unknown` (numatytoji reikšmė `unknown`) |
| `employees`, `annualTurnoverEur` | Sveikasis skaičius ≥ 0 (≤ 10 000 000 darbuotojų, ≤ 10¹⁴ EUR) arba null |
| `activities`, `aiDescription` | Tekstas (≤ 20 000 / ≤ 10 000 simbolių) |
| `usesAi`, `providesAi`, `processesPersonalData`, `isPublicSector` | `true\|false\|null`, kur **null = nežinoma** (niekada nespėjama) |
| `institutionType` | `bank\|credit_union\|payment_institution\|emi\|casp\|crowdfunding\|consumer_credit\|real_estate_credit\|currency_exchange\|investment_firm\|insurance\|other_financial\|none\|unknown` (numatytoji reikšmė `unknown`) |
| `financialMarket`, `attributes` | Objektai (≤ 60 000 simbolių kaip JSON) arba null |

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET` / `POST /api/companies/{id}/credentials` | GET → `{credentials}`. POST `{kind: certificate\|license\|permit\|registration, name, issuer?, identifier?, validFrom?, validTo? (ISO dates), scope?, notes?, status?: claimed\|verified, evidenceDocumentId?}` → 201 leidimas; naujas leidimas yra `claimed` (deklaruotas), nebent užklausoje nurodyta `verified`. |
| `PATCH` / `DELETE /api/companies/{id}/credentials/{cid}` | PATCH priima bet kokį tų pačių laukų poaibį. Nustačius `status: "verified"`, įrašomi `verifiedBy` / `verifiedAt`; `claimed` juos išvalo. Įrodymas turi būti vienas iš pačios įmonės dokumentų. DELETE → `{ok: true}`. |
| `GET` / `POST /api/companies/{id}/standards` | Įmonės taikomi standartai. GET → `{standards: [{id, documentId, shortTitle, title, ready, status, scope, certificateId, notes, …}]}` – `ready` nurodo, ar standarto egzempliorius teisės aktų bazėje įjungtas ir įkeltas (kitaip analizė jį praleidžia). POST `{documentId, status?: certified\|implementing\|planned (default implementing), scope?, certificateId?, notes?}` → 201. `documentId` turi būti teisės aktų bazės `standard` tipo dokumentas (400 `INVALID_FIELD`), `certificateId` – vienas iš pačios įmonės leidimų; to paties standarto pakartotinis taikymas grąžina 409 `ALREADY_ADOPTED`. Kiekviena įmonės ataskaita vertina jos taikomus standartus. |
| `PATCH` / `DELETE /api/companies/{id}/standards/{sid}` | PATCH priima bet kokį `{status, scope, certificateId, notes}` poaibį (`certificateId: null` atsieja sertifikatą); pats standartas niekada nesikeičia. DELETE → `{ok: true}`. Registruojama veiksmų žurnale (`companies.standard_add`, `standard_update`, `standard_remove`). |
| `GET` / `POST /api/companies/{id}/roles` | GET → `{roles}`. POST `{name, context (≤ 6000 chars), sources?: [{documentId?, title?, section?}] (≤ 50)}` → 201 rolė. Šaltinis savo dokumentą nurodo `documentId` arba `title`; jei tai vienas iš įmonės dokumentų — pagal identifikatorių arba pagal pavadinimą, kuris atitinka vieną ir tik vieną iš jų, su failo plėtiniu ar be jo, — rolė išsaugoma ir grąžinama su abiem, o pavadinimas yra dabartinis dokumento pavadinimas. Bet kuris kitas šaltinis paliekamas toks, koks parašytas. Toks pat pavadinimas toje pačioje įmonėje grąžina 409 `DUPLICATE_NAME`. |
| `GET` / `PATCH` / `DELETE /api/companies/{id}/roles/{rid}` | Rolės profilis, pvz., atitikties pareigūno. Pokalbis gali šią rolę perimti; ištrynus rolę, ji atsiejama nuo savo pokalbių. |

## Dokumentai – `companies/api/document_views.py`

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET /api/documents?companyId=&q=&scope=own&limit=&offset=` | → `{documents, total}`, nuo naujausių; `limit` 1–500 (numatytoji reikšmė 500). Tekstas niekada nepateikiamas. `q` lyginamas su pavadinimu. `scope=own` administratoriui palieka tik jo paties įkeltus dokumentus. |
| `POST /api/documents` | multipart `file` (≤ 50 MiB), `companyId?`, `title?` (numatytoji reikšmė – failo vardas, ≤ 300 simbolių), `kind?: policy\|procedure\|contract\|register\|other` (numatytoji reikšmė `other`) → 201 dokumentas. Tekstas iš karto išgaunamas izoliuotoje aplinkoje (PDF, DOCX, HTML ir tekstas: `.txt`, `.md`, `.csv`, `.json`); jei tekstas yra, į eilę įrašomas įrodymų indekso kūrimas (užduotis `documents.index`). Bet koks kitas failas vis tiek išsaugomas, su `extractionStatus: failed` („Unsupported file type“); PDF be teksto sluoksnio baigiasi būsena `empty`. Pirmieji baitai svarbesni už vardą: dvejetainis turinys, pavadintas `.txt` ar `.html`, laikomas nepalaikomu. Paskyros kvota – `UPLOAD_QUOTA_FILES` / `UPLOAD_QUOTA_BYTES` (1000 failų / 2 GiB); ją viršijus įkėlimas grąžina 413 `QUOTA_EXCEEDED`. Per didelis failas – 413 `FILE_TOO_LARGE`, nėra failo dalies – 400 `MISSING_FILE`. |
| `GET /api/documents/search?q=&companyId=&documentIds=a,b&scope=own&k=8` | → `{hits: [{documentId, title, companyId, chunkId, heading, charStart, text, score}]}`. Mišrioji (vektorinė ir viso teksto) paieška dokumentuose, iš kurių išgautas tekstas; `q` privalomas (≤ 1000 simbolių), `k` 1–30, `documentIds` iki 50. `scope=own` administratoriui palieka tik jo paties įkeltus dokumentus (pokalbių asistento nefiltruota paieška). |
| `GET /api/documents/{id}` | Metaduomenys ir `outline: [{title, level, offset}]`, `inventory` (įrodymų inventorius), `documentType`, `inventorySummary`, `indexedAt` |
| `PATCH /api/documents/{id}` | `{companyId?: id\|null, title?, kind?}` → dokumentas; `companyId: null` jį atsieja. Tuščias pakeitimas – 400 `EMPTY_UPDATE`. |
| `DELETE /api/documents/{id}` | Ištrina įrašą, paskui failą → `{ok: true}` |
| `GET /api/documents/{id}/text?offset=0&limit=20000` | → `{id, title, text, offset, limit (≤100000), total, extractionStatus}` |

## Pokalbiai – `chat/api/views.py`

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET /api/chat/models` | → `{default, models: [{id, name, pricing: {promptPerToken, completionPerToken} \| null}]}`: DI tinklų sąsajos pokalbių modeliai, nuo naujausių, kuriais gali būti atsakoma pokalbyje, ir `default` – aktyvios `chat.assistant` versijos modelis (`null`, kai aktyvios versijos nėra). Prieinamas bet kuriam prisijungusiam naudotojui. Kol DI tinklų sąsaja nepasiekiama, sąrašas tuščias. |
| `GET /api/chat/threads?companyId=` / `POST` | GET → `{threads}`: paties kviečiančiojo nearchyvuoti pokalbiai (taip pat ir administratoriaus), pradedant vėliausiai atnaujintais, ne daugiau kaip 300. POST `{companyId?, title?}` → 201 pokalbis. |
| `GET` / `PATCH` / `DELETE /api/chat/threads/{id}` | Pokalbis: `{id, userId, companyId, companyName, roleId, role, title, model, messageCount, archived, createdAt, updatedAt}`. PATCH `{title? (≤ 200 characters), companyId?, roleId?, model?}`: `companyId: null` atsieja įmonę, o ją pakeitus ar atsiejus atsiejama ir rolė; `roleId` turi būti pokalbio įmonės rolė (kitaip 404); `model` yra vienas iš identifikatorių, kuriuos pateikia `GET /api/chat/models` (kitaip 400 `UNKNOWN_MODEL`, o kol DI tinklų sąsajos sąrašo nuskaityti nepavyksta – 503 `MODELS_UNAVAILABLE`), arba `null` – numatytasis modelis. Kiekviename ėjime asistentas atsako pokalbio `model` nurodytu modeliu, o jei jo nėra – aktyvios `chat.assistant` versijos modeliu. DELETE archyvuoja → `{ok: true}`; įrašai lieka. Pokalbis be pavadinimo gauna pirmuosius 80 savo pirmosios naudotojo žinutės simbolių; kol jis turi šį automatinį pavadinimą, asistentas vieną kartą jį pakeičia keliais savo modelio pasiūlytais žodžiais (instrukcija `chat.title`), bet niekada nekeičia naudotojo nustatyto pavadinimo. |
| `GET` / `POST /api/chat/threads/{id}/messages` | GET → assistant-ui istorijos eilutės, paprastas `{id, parent_id, format, content}` sąrašas. POST įrašo arba atnaujina vieną pokalbio eilutę → `{ok, created, autoTitle}`; `autoTitle` nurodo, ar pokalbis vis dar turi automatinį pavadinimą (tada asistentas paprašo savo modelio geresnio). Čia galima rašyti tik naudotojo žinutes (403 `ROLE_NOT_ALLOWED`; asistentas savąsias rašo per vidines duris); didesnė nei 400 000 simbolių žinutė – 413 `MESSAGE_TOO_LARGE`; kitam pokalbiui priklausantis identifikatorius grąžina 409 `MESSAGE_ID_TAKEN`. |
| `POST /api/assistant/chat` | Node asistento srautinis pokalbis (SSE, AI SDK UI žinučių srautas). Užklausa glausta: `{id, trigger: "submit-message"\|"regenerate-message", messageId, message, parentId, locale: "lt"\|"en"}` – viena nauja naudotojo žinutė iš ne daugiau kaip 30 dalių (`text`, kartu ne daugiau kaip 60 000 simbolių, arba įkeltų dokumentų žymės `data-document`); istoriją saugo Django. Ribos prieš bet kokį modelio iškvietimą: 12 ėjimų vienam naudotojui per minutę (429 `RATE_LIMITED`), dienos biudžetas (429 `BUDGET_EXCEEDED`), 512 kB JSON. Ėjimas trunka ne ilgiau kaip 180 s. Žr. `assistant/README.md`. |
| `POST /api/assistant/chat/{threadId}/stop` | Sustabdo kviečiančiojo vykstantį ėjimą tame pokalbyje → `{stopped}`; dalinis atsakymas išsaugomas kaip sustabdytas. |
| `GET /api/assistant/chat/{threadId}/status` | → `{running, startedAt}` – ar kviečiančiojo pokalbyje vyksta ėjimas (naudotojo sąsaja to klausia, kai puslapis perkraunamas atsakymo viduryje). |

## Teisės aktų bazė – `corpus/api/views.py`, `obligation_views.py`

Skaityti gali kiekvienas prisijungęs naudotojas; rašyti – tik administratoriai, ir tai registruojama veiksmų žurnale. Teisės aktų bazėje yra teisės aktai ir standartai: standartas yra įkeltas `docType: standard` dokumentas (paprastai `jurisdiction: INTL`), kurio vienetai yra punktai (`unitType: clause`, numeruojami `4`, `6.1.2`, `A.5.15`) ir priedai. Visur, kur nurodomas teisės akto straipsnis (`article`, nuorodų patikros `article`), galima nurodyti standarto punkto nuorodą: `6.1.2`, `clause 6.1.2`, `A.5.15`, `Annex A 5.15`, `Annex A`; vien kontrolės priemonės numeris, kurio pagrindinėje dalyje nėra (`5.15`), ieškomas prieduose. Nuoroda, kurioje parašyta „control“ (`control 5.15`), reiškia priedo punktą net tada, kai pagrindinėje dalyje toks numeris yra. Standartas, kuris taip nenumeruotas, cituojamas pagal tai, ką turi jo vienetai: karkaso savą identifikatorių (`AC-2`, `AC-2(1)`, `GV.OC-01`, `03.01.02` – randami ir kaip `ac 2`, `3.1.2`), antraštę arba, jei standartas indeksuotas pagal puslapius, puslapį (`p. 12`, `page 12`, `12 psl.`); paieškos rezultato ar nuostatos `path` visada tinka kaip nuoroda. Standartą galima nurodyti jo žymeniu su leidėju ir metais arba be jų (`ISO 27001`, `ISO/IEC 27001:2022`) – nenurodžius metų, imamas naujausias leidimas; tarptautinis standartas ir jo nacionalinis ar europinis perėmimas atstoja vienas kitą, nors jų metai skiriasi (`ISO/IEC 27001:2022` ↔ `LST EN ISO/IEC 27001:2023`).

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET /api/corpus/documents?q=&jurisdiction=&docType=&domain=` | → `{documents}`, kiekvienas su dabartine redakcija, būsena, paskutine klaida ir pareigų skaičiumi. Naudotojai mato tik įjungtus teisės aktus; administratoriai – visus. `docType=standard` pateikia standartus. |
| `POST /api/corpus/documents` | `{title, jurisdiction: EU\|LT\|INTL, sourceKind: cellar\|etar\|eseimas\|lb\|url\|upload, externalId?, sourceUrl?, shortTitle?, titleEn?, docType?, language?, domains?, appliesTo?, applicabilityNotes?, status?, enabled?}` → 201 teisės aktas. `cellar`, `etar` ir `eseimas` (senas `etar` pavadinimas) reikalauja `externalId`; `lb` reikalauja `www.lb.lt` adreso `sourceUrl`; `url` reikalauja https `sourceUrl` per 443 prievadą (ar jo serveris pasiekiamas, sprendžia išeinančio srauto leidžiamų adresų sąrašas). Atsisiunčiamam teisės aktui į eilę įrašomas įkėlimas; `upload` teisės aktas laukia savo failo. 409 `SLUG_TAKEN`. Standartas (`docType: standard`) įkeliamas; jo trumpasis pavadinimas yra jo žymuo (`ISO/IEC 27001:2022`). |
| `GET` / `PATCH` / `DELETE /api/corpus/documents/{id}` | Išsami informacija su redakcijomis ir `latestJob` (jo nėra, jei jokia užduotis nevykdyta), taip pat tai, ką modeliai perskaitė iš paties dabartinės redakcijos teksto: `scopeReading` (`types`, `reasoning`, `readAt`) ir `sanctionsReading` (`tiers` – pakopų skaičius, `note`, `readAt`), kiekvienas lygus `null`, kol dar neskaityta; naudotojas išjungtam teisės aktui gauna 404. PATCH redaguoja tuos pačius laukus (administratorius). DELETE pašalina visas redakcijas, nuostatas, fragmentus ir saugomus failus → `{ok: true}` (administratorius). |
| `POST /api/corpus/documents/{id}/refresh` | `{force?, structure?}` į eilę įrašo atsisiuntimą ir įkėlimą → 202 užduotis (esama užduotis, jei ji jau laukia eilėje ar vykdoma). Nepasikeitęs šaltinis baigiasi kaip „unchanged“; `force` jį vis tiek apdoroja iš naujo. `upload` teisės aktas iš naujo apdoroja savo dabartinį failą (409 `NO_FILE`, kol pirmas failas neįkeltas). `structure` (`auto` \| `rules` \| `ai` \| `pages`; tik standartui, kitaip 400 `INVALID_FIELD`) nurodo, kaip šį kartą atpažįstama standarto struktūra: punktų taisyklėmis, o kur jų nepakanka – modeliu (`auto`, numatytoji reikšmė), vien taisyklėmis, modeliu per visą tekstą arba pagal puslapius. Užduoties rezultate yra `parser` (`standard`, `standard-refined`, `standard-ai`, `standard-pages`) ir `notes` apie tai, kas nepavyko taip, kaip prašyta. Redakcijos pareigos lieka susietos su tos pačios citatos vienetais; pasiūlymai, kurių vienetų nebeliko, ištrinami. |
| `POST /api/corpus/documents/{id}/upload` | multipart `file` (≤ 60 MiB) tampa nauja redakcija ir įkėlimo užduotimi → 202 užduotis. Failas, identiškas dabartinei redakcijai, – 409 `UNCHANGED`. Standarto tekstas skaitomas pagal jo struktūrą: puslapių apipavidalinimas (kolontitulai) ir turinys atmetami; sunumeruoti punktai ir priedai atpažįstami taisyklėmis, dokumentas, kurio taisyklės atpažinti negali (savi identifikatoriai, jokios numeracijos, DOCX su prarasta automatine numeracija), – modeliu (instrukcija `corpus.standard_outline`, niekam neapmokestinama), o kai nė vienas būdas netinka – pagal puslapius; redakcijos `parser` nurodo, kuris būdas pritaikytas. Redakcija nepavyksta tik dėl failo be skaitomo teksto: PDF, kuriam reikia slaptažodžio arba kurį užrakino teisių valdymo papildinys, nuskenuota kopija. |
| `GET /api/corpus/documents/{id}/units?type=&q=&version=&offset=&limit=` | Dabartinės (arba nurodytos) redakcijos nuostatos dokumento tvarka → `{units, total, offset, limit}`; `type` yra kableliais atskirtas sąrašas, `limit` ≤ 1000 (numatytoji reikšmė 200). |
| `GET /api/corpus/units/{id}` | Viena nuostata visa, su jos teisės aktu, `versionNo`, `isCurrent` ir `citationUrl` – nuoroda į oficialų tekstą: ES teisės aktui – EUR-Lex puslapis ties straipsnio inkaru; kitais atvejais – adresas, kurį teisės aktui nurodo katalogas, arba, teisės aktui iš e-TAR, – jo puslapis Teisės aktų registre (`https://www.e-tar.lt/portal/lt/legalAct/<id>/asr`), kuris atveria teisės aktą, o ne straipsnį; tuščia, kai teisės aktas neturi nei vieno, nei kito. Kiekvienas šiame dokumente minimas `citationUrl` sudaromas taip pat; tie, kuriuos saugo ataskaita, sudaromi ataskaitos vykdymo metu, todėl ataskaita, sudaryta iki 2026-11-16, išlaiko savo dienos nuorodas – teisės aktui iš e-TAR jokios. |
| `GET /api/corpus/provision?document=&article=&paragraph=&type=` | Tikslus tekstas: `{path, heading, text, docType, versionNo, versionDate, citationUrl, externalId, …}` arba 404. `document` gali būti trumpasis pavadinimas, slug, identifikatorius, CELEX numeris arba standarto žymuo; standarto punktas gali būti pateiktas kaip `clause=` vietoj `article=`. Įterpto straipsnio galima prašyti kaip `12-1` arba kaip `12¹`: jis randamas, kad ir kaip jį išsaugojo teisės akto struktūros atpažinimo modulis, – čia ir nuorodų patikroje. |
| `POST /api/corpus/search` | `{query, k? (1–30, default 8), documents? (≤ 50 acts by id, slug, short title or CELEX), jurisdiction?: EU\|LT\|INTL, kind?: acts\|standards}` → `{hits: [{path, heading, text, shortTitle, citationUrl, score, …}]}`. Mišrioji paieška dabartinėse redakcijose; dokumentas nurodomas taip, kaip jį priima bet kuri kita teisės akto paieška, neatsižvelgiant į raidžių dydį, o pavadinimas, neatitinkantis jokio teisės akto, paiešką susiaurina tiek, kad ji nieko neranda; užklausos vektorizavimas neregistruojamas ir neapmokestinamas. |
| `POST /api/corpus/check-citations` | `{citations: [{act, article, paragraph?, point?, claimedHeading?}]}` (≤ 50) → `{results: [{status: found\|not_found\|act_not_in_corpus, path, heading, excerpt, citationUrl, headingMatch: match\|mismatch\|unknown, note, judgedBy: model\|overlap\|null}]}`, po vieną kiekvienai nuorodai ta pačia tvarka, pakartojant, ko buvo klausta. Kiekvienas laukas ≤ 300 simbolių. Straipsnių intervalas ar sąrašas (`77–78`, `6–9, 26–29, 53`) tikrinamas straipsnis po straipsnio, o atsakymas grindžiamas geriausiu straipsniu (ne daugiau kaip 100 paieškų vienai užklausai); `63(2)(a)` straipsnio lauke išskaidomas į straipsnį, dalį ir punktą. Kai kviečiančiojo dienos biudžetas išnaudotas (arba modelis nepasiekiamas), antraštė vertinama ne modeliu, o žodžių sutapimu; `judgedBy` nurodo, kas vertino (null, kai teiginio nepateikta). Teisės aktą galima nurodyti trumpuoju pavadinimu, slug, CELEX / TAR numeriu, unikaliu pavadinimo fragmentu, ES teisės akto rūšimi ir numeriu (`Regulation (EU) 2023/1113`) arba nuoroda, prasidedančia trumpuoju pavadinimu (`MiCA Regulation`). |
| `POST /api/corpus/reembed` | `{documentId?}` → 202 užduotis (administratorius). Be identifikatoriaus iš naujo vektorizuojami visi teisės aktai; nežinomas identifikatorius – 404. Reikia tik pakeitus vektorizavimo modelį. |
| `POST /api/corpus/refresh-all` | → 202 užduotis (administratorius). Taip pat suplanuota kas savaitę. |
| `GET /api/obligations?document=&status=&category=&verification=&order=&q=&limit=&offset=` | → `{obligations, total}`; `limit` 1–2000 (numatytoji reikšmė 500). `status` priima vieną būseną (`proposed`, `approved`, `rejected`) arba kelias, atskirtas kableliais. `verification` filtruoja pagal vertintojo verdiktą (`supported`, `partly`, `unsupported`, `doubt` – dviem paskutiniams, `unchecked`); `order=review` pirmiausia pateikia abejotinas, o tarp jų – svarbiausias. Kiekviena pareiga turi `verification: {verdict, issue, note, model, promptVersionId, checkedAt}` arba null. Skaityti gali kiekvienas prisijungęs naudotojas; įmonių vidaus pareigos niekada nepateikiamos. |
| `POST /api/obligations` | Rankiniu būdu įvesta „standartinė“ pareiga (administratorius): `{title, text, documentId?, …}` → 201, iš karto patvirtinta. |
| `GET` / `PATCH` / `DELETE /api/obligations/{id}` | PATCH redaguoja laukus ir `status: proposed\|approved\|rejected` (administratorius); būsena įrašo peržiūrėtoją, o pakeistas pavadinimas ar tekstas iš naujo vektorizuojamas ir netenka vertintojo verdikto. |
| `POST /api/obligations/review` | `{ids (1–500), status}` masinė peržiūra (administratorius) → `{updated, status}` |
| `POST /api/corpus/documents/{id}/extract-obligations` | `{language?: "en"}` (kitaip – lietuvių kalba) → 202 užduotis arba jau vykdoma (administratorius). 409 `NOT_INGESTED`, kol teisės aktas neturi redakcijos. Išskyrimas apmokestinamas jį į eilę įrašiusiam administratoriui. Standarto atveju išskiriami standarto reikalavimai (instrukcija `corpus.extract_requirements`) iš jo punktų, praleidžiant įvadą, taikymo sritį, normines nuorodas, terminus ir informacinius priedus; tai `sourceKind: standard` pareigos, taikomos kiekvienai standartą taikančiai įmonei. |
| `POST /api/corpus/documents/{id}/verify-obligations` | `{again?}` → 202 užduotis arba jau vykdoma (administratorius). Vertintojas kiekvieną dar nevertintą dabartinės redakcijos pareigą (su `again` – visas) palygina su visu nuostatų, kuriomis ji remiasi, tekstu ir verdiktą išsaugo prie pareigos. Jis nieko nepatvirtina. Apmokestinama administratoriui, kuris užduotį įrašė į eilę. |

**Šaltiniai.**
- **CELLAR** (`cellar`, `externalId` = CELEX): naujausia galiojanti konsoliduota redakcija, lietuviškas XHTML.
- **e-TAR** (`etar`, `externalId` = e-TAR dokumento identifikatorius, pvz., `TAR.4A05AB3730DD`, ne e-seimo identifikatorius): šiandien galiojanti redakcija.
- **lb.lt** (`lb`, `sourceUrl` adresu `www.lb.lt`).
- **Paprastas HTTPS** (`url`): tik leidžiamų adresų sąraše esantiems serveriams.
- **Įkelti failai.**

## Ataskaitos – `analysis/api/views.py`

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET /api/reports?companyId=&status=&scope=own` | → `{reports}`: 200 naujausių ataskaitų, kurias kviečiantysis gali matyti, nuo naujausios. `companyId` ir `status` (`queued`, `running`, `scope_review`, `done`, `failed`, `cancelled`) susiaurina sąrašą prieš jį taip apkarpant, o `scope=own` administratoriaus sąrašą susiaurina iki jo paties įmonių ataskaitų; nežinoma būsena neatitinka nė vienos ataskaitos. |
| `GET /api/reports/estimate?companyId=&documentIds=&internal=` | → `{acts, obligations, actsToExtract, documentsToRead, citationChecks, analysisUsd, extractionUsd, totalUsd, upperBound: true, pricesKnown, budget}`; su `internal=true` taip pat `internal: {documents, requirements, usd}` – įmonės politikos lygmens dokumentai, juose esantys ar iš jų laukiami reikalavimai ir kiek kainuoja juos perskaityti ir įvertinti; tai įskaičiuojama į `totalUsd`. Tai viršutinė vykdymo, pradėto dabar, kainos riba, apskaičiuota pagal kiekvieno etapo aktyvaus modelio kainą; `pricesKnown` yra false, kai kurio nors modelio kaina nežinoma (tada suma yra apatinė riba). `documentsToRead`: dokumentai, kurių įrodymų inventorių vykdymas skaito (iš naujo) – dar nėra podėlyje arba podėlyje yra kitam tekstui, kitai inventoriaus instrukcijos versijai ar kitai inventoriaus formai. `citationChecks`: teisės aktų nuorodų patikros vertintojo iškvietimai (kiekvienas ≤ 50 paieškų; nuoroda į straipsnių intervalą ar sąrašą yra viena paieška kiekvienam straipsniui). 400 `INVALID_FIELD`, kai `documentIds` atmestų ir paleidimas, – teisės akto nėra teisės aktų bazėje arba jis išjungtas. |
| `POST /api/reports` | `{companyId, language: lt\|en, documentIds?, review?, internal?}` (`documentIds`: teisės aktų bazės apimtis) → 201 ataskaita. Su `internal: true` ataskaita papildomai vertina įmonės vidaus reikalavimus (architecture.md §3): papildoma teisės akto eilutė su `docType: "internal"`, jos išvados su `sourceKind: "internal"` ir nuorodos, rodančios į įmonės dokumentą (`documentId`, `quote`, `start`), skaičiuojamos atskirai `stats.internal`. Su `review: true` vykdymas, nusprendęs, kurie teisės aktai taikomi, sustoja būsenoje `scope_review` ir laukia `POST /api/reports/{id}/scope`; be jo ataskaita vykdoma iki galo ir patvirtinimą įrašo pati (laiką, be asmens). Atsisakymai: 409 `CORPUS_EMPTY` / `ALREADY_RUNNING` (taip pat kol kuri nors įmonės ataskaita laukia apimties patvirtinimo), 429 `BUDGET_EXCEEDED`. |
| `GET /api/reports/{id}` | Visa ataskaita: `acts`, `findings`, `actions`, `citations` (teisės aktų nuorodų patikros eilutės, žr. toliau), `summary`, `stats`, `outdatedActs` (teisės aktai, kurie po vykdymo turi naujesnę redakciją), `approvedBy` / `approvedByName` / `approvedAt` / `approvalNote` ir vykdymo `jobId` / `jobStatus` / `progress` (sąrašo eilutės ir sukūrimo atsakymas turi tuos pačius tris laukus). Dalys aprašytos toliau. |
| `PATCH /api/reports/{id}` | `{approved: true\|false, note?}`. Baigtos ataskaitos patvirtinimas, registruojamas veiksmų žurnale. Bet koks vėlesnis peržiūrėtojo sprendimas dėl išvados patvirtinimą atšaukia. |
| `DELETE /api/reports/{id}` | Grąžina 409 `STILL_RUNNING`, kol vykdoma analizė. |
| `POST /api/reports/{id}/cancel` | Sustabdo eilėje laukiančią ar vykdomą analizę; apimties patvirtinimo laukiančią atšaukia iš karto. |
| `POST /api/reports/{id}/scope` | `{acts?: {reportActId: "assess"\|"skip"}, approved?}` ataskaitai, esančiai būsenoje `scope_review`. `assess` įtraukia teisės aktą, kad ir koks buvo verdiktas (laukiantį faktų, direktyvą, įmonės nesaistantį teisės aktą – tada jis vertinamas pasirinktinai, kaip geroji praktika, su visomis jo pareigomis); `skip` vertinamą teisės aktą praleidžia; nepaminėtas teisės aktas lieka toks, kokį nusprendė vykdymas. Be `approved` niekas neišsaugoma: → `{estimate: {pricesKnown, acts: [{id, obligations, toExtract}], obligations, analysisUsd, extractionUsd, totalUsd, upperBound}, budget}` – antrosios dalies kaina tokiam pasirinkimui. Su `approved: true` pasirinkimai pritaikomi, patvirtinimas įrašomas ir registruojamas veiksmų žurnale su kiekvienu pakeitimu, o užduotis vėl įrašoma į eilę → ataskaita. Atsisakymai: 400 `INVALID_FIELD` / `NOTHING_TO_ASSESS`, 409 `NOT_WAITING`, 429 `BUDGET_EXCEEDED`. |
| `PATCH /api/reports/{id}/findings/{fid}` | `{overrideStatus?: met\|partial\|missing\|unknown\|not_applicable\|null, reviewerNote?, cause?}`. Peržiūrėtojo sprendimas galioja visur, įskaitant eksportus. `cause` (iki 2000 simbolių, null išvalo) – kodėl spraga atsirado; ją rašo tik žmogus; galima siųsti ir vieną. Registruojama veiksmų žurnale. |
| `GET /api/reports/{id}/export?format=pdf\|xlsx` | Atsisiunčiamas failas. Eksportuoti galima tik baigtas ataskaitas. |

Išvada taip pat turi `consequence` – ką gali kainuoti jos nuostatos pažeidimas, pagal sankcijų pakopas, buvusias teisės aktų bazėje ataskaitos vykdymo metu: `[{act, path, where, condition, maxFineEur, maxFinePercent, benefitMultiple, persons, measures, measuresFrom, via?}]` (`persons` – asmenų rūšys, kurias saisto pakopa, kai ji saisto tik dalį tų, kuriuos reguliuoja aktas; ataskaitoje, sudarytoje iki 2026 m. lapkričio 19 d., šio lauko nėra) (tuščias ataskaitai, sudarytai prieš nuskaitant pakopas, standarto reikalavimui ir įmonės vidaus reikalavimui), – ir `cause`. 2 lygio akto atveju `consequence` įrašai yra pagrindinio akto straipsnio, pagal kurį jis priimtas, įrašai, kiekvienas su `via: {act, path}`, kuris įvardija tą aktą ir straipsnį.

**Teisės aktų nuorodų patikra.** Kiekviena ataskaita (nuo 2026 m. rugsėjo 28 d.) patikrina įmonės dokumentuose esančias nuorodas į konkrečias teisės aktų nuostatas (kiekvieno dokumento įrodymų inventoriaus `citations`) su teisės aktų baze: ar dabartinėje teisės akto redakcijoje yra toks straipsnis / dalis / punktas ir ar nuostata reglamentuoja tai, ką teigia dokumentas. Nuoroda, kurią keli dokumentai pateikia žodis žodin, vertinama vieną kartą; kiekvienas dokumentas vis tiek gauna savo eilutę. Nuoroda į straipsnių intervalą ar sąrašą („17–23 str.“) vertinama straipsnis po straipsnio, o atsakymas grindžiamas geriausiu straipsniu (atitikimas, kitaip neišspręstas teiginys, kitaip neatitikimas) – eilutės `unitPath` / `heading` įvardija tą straipsnį. `stats.citations` pateikia kiekius – `{checked, match, mismatch, notFound, notInCorpus, unknown}` – taip pat ir kiekvienoje sąrašo eilutėje; pačios eilutės pateikiamos tik su visa ataskaita, pirmiausia problemos:

```
citations: [{
  id, documentId,            // the company document (null once it is deleted)
  documentTitle,             // its title when the report ran
  act, article, paragraph, point,   // the reference exactly as the document wrote it ("" when absent)
  claim,                     // what the document says the provision requires / covers
  quote,                     // ≤ 200 characters of the document where it cites it
  status: found | not_found | act_not_in_corpus,
  headingMatch: match | mismatch | unknown | null,   // null unless found
  verdict: mismatch | not_found | unknown | act_not_in_corpus | match,
  judgedBy: model | overlap | null,                  // who compared claim and provision
  legalDocumentId, shortTitle,   // the act it resolved to (null / "" when not in the corpus)
  unitId, unitPath, heading,     // the provision found (null / "" unless found)
  note, excerpt, citationUrl     // the judge's note, the provision's opening, the official link
}]
```

`verdict` yra tai, ką rodo naudotojo sąsaja ir eksportai: `match` – teisinga; `mismatch` – nuostata reglamentuoja ką kita; `not_found` – teisės akte tokios nuostatos nėra; `act_not_in_corpus` – teisės akto nėra teisės aktų bazėje (netikrinta); `unknown` – teiginio įvertinti nepavyko. Ataskaita, sudaryta prieš atsirandant patikrai, turi `citations: []` ir neturi `stats.citations`. Veiksmų planas remiasi neatitikimais ir nerastomis nuostatomis, santrauka – kiekiais; PDF ir Excel eksportuose yra nuorodų patikros skyrius / lapas.

**Išvadų būsenos** (lietuviškos žymos):

| Būsena | LT | Reikšmė |
|---|---|---|
| `met` | atitinka | |
| `partial` | iš dalies | |
| `missing` | neatitinka | |
| `unknown` | neįrodyta | Neįrodyta: nė vienas pateiktas dokumentas šios srities neapima arba dokumentas, kuris ją apimtų, yra minimas, bet nepateiktas. |
| `not_applicable` | netaikoma | |

**Teisės aktai.** Kiekvienas teisės aktas turi verdiktą (`applicability: applies\|not_applies\|uncertain`, `confidence`, `reasoning`, `conditionsToVerify`, `citations`), savo `docType` (`standard` – taikomam standartui, kuris taikomas dėl paties pasirinkimo jį taikyti, be modelio verdikto), `screenedOut` ir tai, ką ataskaita su juo padarė:

| `assessment` | Reikšmė |
|---|---|
| `assessed` | Teisės aktas saisto įmonę: jo pareigos įvertintos, o jų išvados yra ataskaitos rezultatas. |
| `upcoming` | Įmonę jis saistys tik nuo `appliesFrom` (datos): įvertintas pasirengimo tikslu, skaičiuojamas atskirai. |
| `unconfirmed` | Ar jis taikomas, priklauso nuo faktų, kurių profilis nenurodo: **nevertinamas**; `conditionsToVerify` pateikia klausimus, į kuriuos reikia atsakyti. |
| `indirect` | Įmonę jis saisto per ką nors kita: direktyva (`docType` `directive`) – per ją perkeliantį nacionalinį įstatymą, kuris vertinamas vietoj jos; teisės aktas, nustatantis institucijos organizavimą ar procedūrą joje, – per tos institucijos sprendimus. |
| `none` | Netaikomas (taip įvertintas arba atmestas katalogo atrankoje). |

**Apimties patvirtinimas.** `scopeApprovedAt` ir `scopeApprovedBy` / `scopeApprovedByName` nurodo, kada ir kas patvirtino teisės aktų sąrašą; ataskaita, vykdyta be peržiūros, turi tik laiką. Kol ataskaita laukia būsenoje `scope_review`, ji turi savo teisės aktus ir nuorodų patikrą, bet neturi išvadų, o `stats` rodo, kiek kainavo pirmoji dalis. Tvirtinantis asmuo gali nuspręsti priešingai nei verdiktas, ir tada eilutė rodo abu: `assessment` `assessed` ar `upcoming` su `applicability: not_applies` yra teisės aktas, vertinamas įmonės pasirinkimu (jo išvados yra spragos geriosios praktikos atžvilgiu, ne pažeidimai); `assessment: none` su `applicability: applies` yra taikomas, bet praleistas teisės aktas.

Teisės aktas, kurį nurodo ataskaitos apimtis (`documentIds`), vertinamas nepaisant abejonės – verdikto `uncertain`, priskyrimo `indirect`, – bet ne nepaisant neigiamos katalogo atrankos ar verdikto `not_applies`: tokį teisės aktą žmogus gali įtraukti per apimties peržiūrą (`assess`) kaip gerąją praktiką. Ataskaitos, sudarytos iki 2026 m. lapkričio 10 d., vertino kiekvieną taikomą ir neaiškų teisės aktą: jų teisės aktai pažymėti `assessed` (arba `none`).

**Išvados.** `upcoming` teisės akto išvada turi to teisės akto `appliesFrom`; visų kitų – null. Jos `severity` (`critical` / `high` / `medium` / `low`) yra pačios pareigos svarba, ne spragos įvertinimas. Jos `evidence` yra `[{kind: credential\|document\|passage\|profile, id, title, quote}]`; ištrauka – citata iš įmonės dokumento – papildomai turi `documentId` ir `charStart`, t. y. citatos vietą dokumento tekste (`GET /api/documents/{id}/text` `offset`); null, kai dokumente nėra žodis žodin tokios citatos (ataskaitoje, sudarytoje iki 2026 m. lapkričio 10 d.: kai ištraukos nebėra). Išvados peržiūros atsakymas turi tą patį.

**Statistika.** `findings` (pagal galiojančią būseną) ir `openBySeverity` skaičiuoja įmonei galiojančius teisės aktus; `upcoming: {findings, openBySeverity}` skaičiuoja pasirengimo tikslu vertinamus teisės aktus ir yra tik tada, kai ataskaitoje tokių yra. `acts` skaičiuoja teisės aktus pagal verdiktą (`applies`, `uncertain`, `not_applies`) ir pagal vertinimą (`assessed`, `upcoming`, `unconfirmed`, `indirect`); toliau – `actions`, `citations` (patikros kiekiai), `reviewedObligations`, `provenance: {prompts, models, corpus}`, `tokens` ir `costUsd`. Peržiūra išvadas perskaičiuoja.

### Veiksmų registras – `analysis/register.py`

| Maršrutas | Veiksmas |
|---|---|
| `GET /api/companies/{id}/actions` | `{actions, counts}`: įmonės registras – pirmiausia neuždaryti veiksmai (vėluojantys prieš kitus, pagal terminą), paskui uždaryti; `counts` – pagal rodomą būseną (`late`, `open`, `in_progress`, `done`, `closed`). |
| `PATCH /api/actions/{id}` `{status?, owner?, dueDate?, note?}` | Žmogaus pakeitimas viename veiksme. `status`: `open`, `in_progress`, `done`, `closed`; uždarant rankiniu būdu reikia pastabos (400 `NOTE_REQUIRED`); rankinis uždarymas atšaukiamas nustačius kitą būseną, o ataskaitos atliktas uždarymas – ne (409 `CLOSED_BY_REPORT` – tokiu atveju peržiūrėkite išvadą toje ataskaitoje). `done` įrašo laiką: tik po jo sudaryta ataskaita gali grąžinti veiksmą į darbą. Registruojama veiksmų žurnale. |
| `GET /api/companies/{id}/actions/export?language=` | Registras kaip skaičiuoklės failas (`.xlsx`). |
| `GET /api/companies/{id}/law-changes` | `{reportId, reportDate, acts}`: naujausios baigtos ataskaitos vertinti teisės aktai, turintys naujesnę redakciją – `changed`, `added`, `removed` nuostatos, `recorded` (false, kai tarpinė redakcija įkelta dar prieš pradedant registruoti pakeitimus) ir `findings`, kurios remiasi pakeista nuostata. |

Veiksmas: `id`, `companyId`, `reportId`, `reportDate`, `title`, `description`, `category`, `priority`, `effort`, `owner`, `dueDate`, `status`, `state` (būsena arba `late`, kai veiksmas neuždarytas ir terminas praėjęs), `items` (išvados, kurias jis turi uždaryti: `obligationId`, `findingId`, `title`, `act`, `path`, `sourceKind`, `status`, `confirmed` – null arba `{reportId, at}`), `byHandOnly` (jokia ataskaita jo niekada nepatvirtins: jis neuždaro jokios išvados arba kuri nors jo išvada neteko savo pareigos), `note`, `closedAt`, `closedByName`, `closedHow` (`confirmed` – patvirtintas vėlesnės ataskaitos, arba `manual`), `confirmedReportId`.

Registras keičiasi tik patvirtinus ataskaitą: `PATCH /api/reports/{id} {approved: true}` taip pat grąžina `register: {added, covered, confirmed, closed, reopened}`, o `{approved: false}` grąžina `register: {withdrawn}`. Ištrinant patvirtintą ataskaitą (`DELETE /api/reports/{id}`), pirmiausia atšaukiamas jos patvirtinimas. Elemento `obligationId` pateikiamas kaip null, kai jo pareigos nebėra (jos teisės aktas ar politika perskaityti iš naujo) ir elementas nepatvirtintas. Visoje ataskaitoje kiekviena išvada turi `history` (`[{reportId, date, status}]` – ta pati pareiga ankstesnėse ataskaitose), o ataskaita turi `stats.changes` (`{since, sinceDate, closed, new, back}`, kiekvienas `{count, titles}`) – kai įmonė turi ankstesnę ataskaitą.

## Atitikties programa – `programme/api/views.py`

Įmonės atitikties programos dokumentai (architecture.md §3): atitikties politika (`policy`), valdymo struktūra su atitikties procesu ir RACI (`governance`), teisinės rizikos kriterijai ir registras (`risks`). Prieiga tokia pati kaip prie įmonės.

| Maršrutas | Veiksmas |
|---|---|
| `GET /api/companies/{id}/programme` | `{products, kinds}`: įmonės programos dokumentai pagal rūšį, nuo naujausios versijos, kiekvienas su savo užduoties `progress` ir `jobStatus`, be turinio; rūšys su jų pavadinimais (`lt`, `en`) ir tuo, kuo kiekviena remiasi (`needs`). |
| `POST /api/companies/{id}/programme` `{kind, language?}` | Pradeda naujos versijos generavimą (užduotis `programme.generate`, 4–6 minutės, apie 0,4–0,5 $ kviečiančiojo dienos biudžeto). 201 su eilėje laukiančiu programos dokumentu. `INVALID_FIELD`; 409 `NO_DOCUMENTS` (nėra skaitomo dokumento), 409 `ALREADY_RUNNING` (šios rūšies dokumentas jau laukia eilėje ar generuojamas), 429 `BUDGET_EXCEEDED` (šiandien liko mažiau nei 0,25 $). |
| `GET /api/programme/{id}` | Programos dokumentas su jo `content`. |
| `PUT /api/programme/{id}/content` `{content}` | Žmogaus atliktas viso projekto pakeitimas. Turinys suvedamas į rūšies formą ir be modelio iškvietimo patikrinamas pagal jos taisykles; atsakymas – programos dokumentas taip, kaip išsaugotas, su perskaičiuotomis išvestinėmis reikšmėmis (scenarijaus lygiais, balu ir zona; identifikatoriais; surastomis nuostatomis; susietomis citatomis). 400 `MISSING_FIELDS`, `INVALID_FIELD`; 409 `NOT_DRAFT`, `UNKNOWN_KIND` (programos dokumentas tokios rūšies, kurios kode nebėra). |
| `PATCH /api/programme/{id}` `{approved: true, note?}` | Žmogaus atliekamas projekto patvirtinimas. 409 `NOT_DRAFT`; 409 `RULES_BROKEN`, kol pažeista kuri nors blokuojanti rūšies taisyklė (pranešime jos išvardijamos). |
| `POST /api/programme/{id}/revise` | Naujas projektas, versija + 1, nukopijuotas iš patvirtinto programos dokumento. 409 `NOT_APPROVED`, `NEWER_VERSION`. |
| `POST /api/programme/{id}/cancel` | Sustabdo eilėje laukiantį ar vykdomą generavimą. 409 `NOT_CANCELLABLE`. |
| `DELETE /api/programme/{id}` | Pašalina versiją. 409 `STILL_RUNNING`. |
| `GET /api/programme/{id}/chart` | `image/svg+xml`: valdymo struktūros dokumento struktūra kaip organizacinė schema – tas pats brėžinys, kuris yra jo PDF. 404, kai programos dokumentas struktūros neturi. |
| `GET /api/programme/{id}/export?format=` | Programos dokumentas kaip failas: `pdf` – bet kuriai rūšiai, `docx` – politikai, `xlsx` – rizikos registrui. Tik projektas arba patvirtintas dokumentas (kitaip 409 `NOT_READY`); 400 `INVALID_QUERY` formatui, kurio rūšis neturi. |

Programos dokumentas: `id`, `companyId`, `companyName`, `kind`, `version`, `language`, `status` (`queued`, `running`, `draft`, `approved`, `failed`, `cancelled`), `title`, `checks` (po eilutę kiekvienai rūšies taisyklei: `rule`, `ok`, `detail`, `blocking`), `basis` (ataskaita, ankstesni programos dokumentai su jų versijomis ir dokumentai, iš kurių jis sudarytas), `stats` (žetonai, `costUsd`, `provenance` su instrukcijų versijomis ir modeliais), `error`, `jobId`, kas ir kada jį sukūrė, redagavo ir patvirtino, `approvalNote`.

Turinys pagal rūšį:

- **policy** – `title`; `parts` (visada aštuonios, raktai `purpose`, `commitment`, `mandate`, `compliance`, `roles`, `processes`, `whistleblowing`, `consequences`): `heading`, `text`, `decisions`, `sources` (susietos citatos: `documentId`, `document`, `quote`, `start`), `legalBasis` (surastos nuostatos); `hierarchy`: kiekvienas dokumentas su savo `level` (1, 2, 3; 0 = ne taisyklė), `topic`, `note`; `missing`: `level` (2 arba 3), `title`, `purpose`, `supports` (dalies raktas), `priority`, `legalBasis`, `partlyCoveredBy`.
- **governance** – `positions` (`name`, `unit`, `line`, `duties`, `sources`), `gaps` (`role`, `line`, `why`), `structure` (mazgai: `id`, `name`, `kind` organas / komitetas / funkcija / padalinys, `line` valdymo / pirmoji / antroji / trečioji / išorinė, `parentId`, `proposed`, `note`), `process` (etapai: `id`, `name`, `description`, `frequency`, `basis` kaip `{source, ref}`), `raci` (langeliai: `stepId`, `roleId` – mazgo identifikatorius – ir `value` R, A, AR, C arba I).
- **risks** – `criteria` (`likelihood`: penkios eilutės su `control`, `clarity`, `counterparty`, `frequency`; `impact`: penkios eilutės su `financial`, `regulatory`, `reputation`, `reach`; `calibration`), `appetite` (penkios zonos: `band`, `name`, `from`, `to`, `responses`, `comment`, `decision`), `scenarios`: `id` (LR-01 …), `area`, `unit`, `sentence` su keturiomis dalimis (`event`, `source`, `consequences`, `objective`), `categories` (1–6, ne daugiau kaip dvi), `legalBasis`, `policies`, `internalConclusion`, `externalConclusion`, `likelihood` ir `impact` (keturi lygiai, `level`, `why`), `score`, `band`, `response`, `actions`, `owners`, `deadline`.

Surasta nuostata yra `{act, article, paragraph, why, found, status (found / not_found / act_not_in_corpus), match (match / mismatch / unknown), shortTitle, path, citationUrl}`. Redaguojant nuostata siunčiama atgal visa – tada išlieka verdiktas, kurį generavimo metu jai davė nuorodų vertintojas (`match`), – arba, jei nuostatą prideda žmogus, tik `act`, `article`, `paragraph` ir `why`; serveris kiekvieną nuostatą suranda iš naujo, bet nė vienos nevertina, todėl rankiniu būdu pridėta nuostata `match` neturi. Kol programos dokumentas generuojamas, jo `progress` yra užduoties `{step, percent, message}`.

## Instrukcijos (administratoriui) – `prompts/api/views.py`

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET /api/prompts` | → `{prompts: [{slug, name, kind, variables, activeVersion, activeModel, pendingDefault, …}]}` |
| `GET /api/prompts/{slug}` | Su `versions`, nuo naujausios (`{version, text, model, temperature, maxTokens, note, source: default\|user, createdBy, createdAt}`). |
| `POST /api/prompts/{slug}/versions` | `{text (≤ 60 000 characters), model, temperature? (0–2), maxTokens? (1–128000), note? (≤ 500), activate?}` → 201 versija. `model` yra `provider:model` (`gateway:azure/gpt-5.5`); vien identifikatorius reiškia DI tinklų sąsają. |
| `POST /api/prompts/{slug}/versions/{n}/activate` | → instrukcija |
| `POST /api/prompts/{slug}/test` | `{input (≤ 200 000 characters), versionNo? \| text?, model?, temperature?, maxTokens?, variables? (≤ 50)}` → `{text, object, model, finishReason, usage, costUsd, durationMs, renderedInstructions}`. Atlieka vieną modelio iškvietimą su etapo griežtąja schema (naudojama aktyvi versija, nebent nurodytas `versionNo` arba projekto `text`); iškvietimas įskaičiuojamas į kviečiančiojo biudžetą: 429 `BUDGET_EXCEEDED`, kai jis išnaudotas, 502 `MODEL_ERROR`, kai iškvietimas nepavyksta. Bet kuriuo atveju registruojama veiksmų žurnale. |
| `GET /api/llm/models` | → `{providers, models: [{id, name, kind: chat\|embedding, contextLength, maxOutputTokens, pricing: {promptPerToken, completionPerToken, cacheReadPerToken, cacheWritePerToken} \| null}]}`, nuo naujausių. Dvi podėlio kainos – įvesties, nuskaitytos iš tiekėjo instrukcijų podėlio, ir į jį įrašytos – yra null, kai DI tinklų sąsaja jų nenurodo. |

**Atnaujinimai.** Kartu su sistema pateikiamos numatytosios instrukcijos yra `django/compliance/prompts/defaults/*.yaml`. `manage.py seed_prompts` aktyvuoja pakeistą numatytąją instrukciją, kol instrukcija vis dar naudoja pateiktą tekstą: pateiktą numatytąją arba tokią, kurią administratorius tik perkėlė kitam modeliui ar kitiems parametrams (tas pats tekstas, žodis žodin), – tada naujas tekstas aktyvuojamas su tais parametrais, kaip administratoriaus versija šalia pateiktos numatytosios. Administratoriaus parašytas tekstas lieka aktyvus; nauja numatytoji instrukcija siūloma kaip `pendingDefault`.

## MCP serveriai (administratoriui) – `assistant/api/mcp_views.py`

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET` / `POST /api/mcp/servers` | GET → `{servers}`. POST `{name, url, transport?: http\|sse, headers?, allowedTools?, description?, enabled?}` → 201 serveris. `name` – 2–31 simbolis: mažosios raidės, skaitmenys ir `_`, pradedant raide. `url` turi būti `https://` per 443 prievadą į viešą DNS vardą – jokio IP adreso, konteinerio ar vietinio vardo (`.local`, `.internal`, …), jokio user:password (asistentas jungiasi iš izoliuoto tinklo vidaus). Ne daugiau kaip 10 antraščių; antraščių reikšmės niekada negrąžinamos, tik `headerNames`. Tuščias `allowedTools` = visi serverio įrankiai. Naujas serveris iš pradžių išjungtas. Pasikartojantis vardas – 409 `DUPLICATE_NAME`. |
| `GET` / `PATCH` / `DELETE /api/mcp/servers/{id}` | PATCH priima bet kokį tų pačių laukų poaibį; lauke `headers` reikšmė `null` pašalina tą antraštę, o kitos išlieka. Serverio, kurio išsaugotas URL pažeidžia taisyklę, įjungti negalima (400 `INVALID_FIELD`). |
| `POST /api/mcp/servers/{id}/test` | Prisijungia per asistentą (iki 45 s) ir pateikia įrankių sąrašą → 200 `{…server, ok}`: pavykus `tools` pateikia sąrašą, nepavykus `ok` yra false, o `lastError` nurodo priežastį. Registruojama veiksmų žurnale. Išsaugotas URL, pažeidžiantis taisyklę, – 400 `INVALID_FIELD`. |

Serverio adresas taip pat turi būti išeinančio srauto leidžiamų adresų sąraše; žr. [operations.md](operations.md).

## Užduotys, DI sąnaudos, veiksmų žurnalas

| Maršrutas | Užklausa → atsakymas |
|---|---|
| `GET /api/jobs?status=&kind=&subject=&limit=` | → `{jobs}`, nuo naujausių; `limit` 1–500 (numatytoji reikšmė 100); nežinoma `status` reikšmė – 400 `INVALID_QUERY`. Savos užduotys; administratoriai mato visas. Užduotis, susijusi su teisės aktu (`subject` `corpus:<id>` arba `obligations:<id>`), lauke `subjectTitle` turi teisės akto pavadinimą (trumpąjį, o jei jo nėra – pirmuosius 80 pavadinimo simbolių); bet kuri kita užduotis turi `subjectTitle: null`. |
| `GET /api/jobs/counts` | → `{queued, running, done, failed, cancelled}` pagal užduotis, kurias kviečiantysis gali matyti |
| `GET /api/jobs/{id}` | Su `steps` (pavadinimas, būsena, įvesties ir išvesties santraukos, trukmė, klaida ir tai, ką sunaudojo etapo modelio iškvietimai, užpildoma iš jo DI sąnaudų žurnalo įrašų, kai etapas baigiasi sėkmingai ar nesėkmingai: `usage: {calls, inputTokens, outputTokens, costUsd, models: [{model, calls, inputTokens, outputTokens, costUsd}]}` (pradedant daugiausia iškvietimų turinčiu), `model` (dažniausiai naudotas) ir `promptVersionId` (kai naudota lygiai viena instrukcijos versija)). Šalia vien identifikatoriaus `prompt` įvardija tą versiją: `{slug, version}` (pvz., `{"slug": "report.summary", "version": 3}`), arba null, kai versija neužregistruota ar jos įrašo nebėra. Etapas be modelio iškvietimų turi `usage: {}`, o `model` – tik tada, kai jį nurodė etapo apdorojimo funkcija. |
| `POST /api/jobs/{id}/cancel` | Eilėje laukianti užduotis atšaukiama iš karto; vykdoma gauna `cancelRequested` ir sustoja per kitą patikrą → užduotis. Baigta užduotis – 409 `NOT_CANCELLABLE`. Registruojama veiksmų žurnale. |
| `GET /api/usage?days=30&scope=all&userId=` | → `{days: [{date, calls, inputTokens, outputTokens, costUsd}], from, to, byKind, byModel, byUser?, totals, budget: {limit, used, remaining, unit: "USD"}}`. `days` 1–366, UTC paros, užpildytos nuliais. Kiekvienas skaito savo DI sąnaudas; administratorius jas išplečia su `scope=all` (tada pridedamas `byUser`) arba žiūri vieną paskyrą su `userId` (naudotojas, prašantis bet kurio iš jų, gauna 403 `FORBIDDEN`). `budget` – žiūrimos paskyros šiandienos biudžetas; `remaining` yra null, kai biudžetas neribotas. |
| `GET /api/usage/calls?kind=&limit=&offset=&scope=all&userId=` | → `{calls, total}`, nuo naujausių, ta pačia apimtimi kaip aukščiau; `kind` yra `chat\|job_step\|embed\|prompt_test`, `limit` 1–200 (numatytoji reikšmė 50). Kiekvienas iškvietimas turi `userName`, `toolCallCount` ir savo žetonus: `inputTokens` (visa įvestis), iš kurių `cachedInputTokens` nuskaityti iš tiekėjo instrukcijų podėlio, o `cacheWriteTokens` į jį įrašyti, `outputTokens` ir `reasoningTokens`. `costUsd` kiekvieną įvesties rūšį įkainoja jos pačios kaina. |
| `GET /api/usage/calls/{id}` | Su `toolCalls` ir, pokalbio ėjimo atveju, `transcript` `{user, assistant}` (ko naudotojas paklausė ir ką asistentas atsakė). Naudotojas skaito tik savo iškvietimus; administratorius – visus. |
| `GET /api/audit?limit=&before=&beforeId=&action=&user=` | → `{entries: [{id, userId, userName, action, targetType, targetId, details, ip, createdAt}], next}` (administratorius). Nuo naujausių pagal `(createdAt, id)`; `limit` apribojamas iki 1–500 (numatytoji reikšmė 100; ne skaičius – 400 `INVALID_QUERY`), `action` yra prefiksas (`users.`), `user` – vienos paskyros identifikatorius. `next` yra kito puslapio žymeklis, `{before, beforeId}` (seniausio įrašo laiko žyma ir identifikatorius): grąžinkite abu tokius, kokie yra, užkoduotus URL. Po paskutinio puslapio jis yra `null`. Vien `before` yra griežta riba „anksčiau nei“; `beforeId` be jo arba `before`, kuris nėra ISO 8601 data ir laikas, – 400 `INVALID_QUERY`. |

## Vidinės durys (tik izoliuotame tinkle)

Maršrutai `/internal/*` nėra perduodami per tarpinį serverį (įėjimas į Django ir asistentą perduoda tik `/api/…`) ir reikalauja antraštės `X-Internal-Secret`, lyginamos pastoviu laiku. Kai slaptas raktas nenustatytas, jie atmeta visas užklausas: 403 `INTERNAL_ONLY`.

| Maršrutas | Paskirtis |
|---|---|
| `GET /internal/assistant/prompt?slug=` | Aktyvi instrukcijos versija su tekstu arba 404 `PROMPT_NOT_CONFIGURED` (tada pokalbis atsako 503). |
| `POST /internal/assistant/turn-log` | Vieno pokalbio ėjimo telemetrija – jo žetonai (`input_tokens`, iš kurių `cached_input_tokens` ir `cache_write_tokens`; `output_tokens`, `reasoning_tokens`), įrankių iškvietimai, trukmė, baigtis – ir įrašas (naudotojo tekstas iki 20 000 simbolių, atsakymas iki 100 000) → 201 `{id, budget}`. |
| `GET /internal/assistant/budget?user_id=` | Naudotojo šiandienos biudžetas: `{limit, used, remaining, unit: "USD"}` (`remaining` null = neribotas). |
| `POST /internal/assistant/threads/{id}/messages` | `{user_id, id, parent_id, format, content}`: vienintelis asistento žinučių rašytojas; pokalbis turi priklausyti `user_id`. |
| `POST /internal/assistant/threads/{id}/title` | `{user_id, title}` → `{ok, applied}`: modelio sugalvotas pokalbio pavadinimas, pritaikomas tik tol, kol pokalbis turi automatinį pavadinimą (naudotojo nustatytas pavadinimas visada išlieka); apkarpomas ir sutrumpinamas iki 200 simbolių. Pokalbis turi priklausyti `user_id` (kitaip 404); tuščias pavadinimas – 400 `INVALID_FIELD`. |
| `GET /internal/assistant/mcp-servers` | Įjungti serveriai su prisijungimo duomenimis; serveris, kurio išsaugotas URL pažeidžia adreso taisyklę, praleidžiamas. |

Node asistentas užduočių vykdytojui ir žiniatinklio paslaugai teikia šiuos maršrutus, apsaugotus tuo pačiu bendru slaptu raktu:

| Maršrutas | Paskirtis |
|---|---|
| `POST /internal/llm/generate` | `{prompt, system?, shared?, model?, schema?, schemaName?, temperature?, maxOutputTokens?}` → `{model, text, object, finishReason, usage: {inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, reasoningTokens}, durationMs}`. Vienas modelio iškvietimas; su JSON schema atsakymas patikrinamas pagal ją (502, kai neatitinka). `shared` – duomenys, kuriuos neša kiekvienas vieno etapo iškvietimas (ataskaitos įmonės profilis ir dokumentai): jie dedami po instrukcijų – tai vienintelė užklausos dalis, kurią tiekėjas laiko podėlyje. Samprotaujančiam modeliui (GPT-5 ir vėlesniems) temperatūra nesiunčiama. Nutraukiama po `GENERATE_TIMEOUT_MS` (numatytoji reikšmė 900 s). Išnaudotas tiekėjo biudžetas – 402 `AI_BUDGET_EXHAUSTED`; tiekėjo užklausų dažnio riba – 429 su `retryAfterS`, kai tiekėjas nurodo laukimo trukmę, – Django užduočių vykdytojas ją išlaukia. |
| `POST /internal/llm/embed` | Iki 256 tekstų paketo vektoriai; nutraukiama po `EMBED_TIMEOUT_MS` (numatytoji reikšmė 60 s, mažiau nei Django 120 s). |
| `GET /internal/llm/models` | DI tinklų sąsajos modelių sąrašas su kainomis, nuo naujausių pagal datą, kurią DI tinklų sąsaja nurodo kiekvienam modeliui (modelis be datos – paskutinis); laikomas podėlyje 10 minučių, o nepavykus atnaujinti išlaikomas paskutinis geras sąrašas. |
| `POST /internal/mcp/list-tools` | Prisijungia prie vieno MCP serverio ir pateikia jo įrankių sąrašą (administravimo puslapio ryšio patikra); nesėkmė – 502 `MCP_UNREACHABLE`. |
| `GET /health` | Gyvybingumas ir konfigūracija: `{status, model: "configured"\|"missing-key", providers, activeTurns}` (neperduodama per tarpinį serverį; compose failas būklės patikros nenustato, todėl savaime jo niekas neklausia – tai daro veikiančios sistemos greitoji patikra). |
