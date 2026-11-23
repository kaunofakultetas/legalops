# Naudotojo vadovas

Atitikties asistentas padeda nustatyti, kurie Lietuvos ir ES teisės aktai taikomi finansų sektoriaus įmonei. Jis parodo, kokias konkrečias pareigas tie aktai nustato, palygina jas su įmonės dokumentais ir parengia atitikties spragų ataskaitą. Pagrindinis darbo langas yra pokalbis; kiti puslapiai skirti peržiūrai ir administravimui.

> Asistentas yra dirbtinio intelekto sistema. Jo išvados yra pagalbinės: kiekvieną nuorodą į teisės aktą patikrinkite pagal oficialų tekstą (nuorodos veda į EUR-Lex ir e-TAR). Jūsų žinutės ir įkelti dokumentai apdorojami per universiteto DI tinklų sąsają (ai.knf.vu.lt). Kas mato jūsų duomenis, aprašyta 8 skyriuje.

## 1. Prisijungimas ir paskyra

Svetainės pradžios puslapis ir puslapiai **Produktas**, **Metodika**, **Teisės aktai** ir **Apie** pristato asistentą ir atviri visiems. Pats asistentas — konsolė — veikia adresu `/console`: į ją veda mygtukas **Prisijungti** svetainės viršuje. Senos nuorodos (pvz., į ataskaitą ar pokalbį, išsaugotos prieš konsolę perkeliant) veikia toliau — jos nukreipiamos į naują adresą.

Paskyras kuria administratorius; savarankiškai registruotis negalima. Prisijunkite el. paštu ir slaptažodžiu.

- Prisijungimas galioja 30 dienų. Vienu metu galioja ne daugiau kaip 10 jūsų prisijungimų (pvz., skirtingose naršyklėse); prisijungus vienuoliktą kartą, seniausias nutraukiamas. Sesijai pasibaigus, prisijunkite iš naujo – grįšite ten, kur buvote.
- Per 10 minučių į vieną paskyrą galima bandyti prisijungti ne daugiau kaip 10 kartų. Paskui matysite „Per daug bandymų“ ir turėsite šiek tiek palaukti.
- **Atsijungti** rasite paskyros meniu viršutinėje juostoje; taip nutraukiama tik ši sesija.

**Paskyra.** Puslapyje **Paskyra**:

- **Keisti slaptažodį.** Įveskite dabartinį slaptažodį, naują ir jo pakartojimą. Slaptažodis turi būti ne trumpesnis nei 10 simbolių ir ne ilgesnis nei 72 baitai (raidė, pvz., ą ar ž, užima du baitus). Pakeitus slaptažodį, kitos jūsų sesijos nutraukiamos. Neteisingai įvestas dabartinis slaptažodis skaičiuojamas kaip nesėkmingas prisijungimo bandymas.
- **Atsijungti visuose įrenginiuose** nutraukia visas jūsų sesijas, įskaitant šią. Naudokite, jei manote, kad jūsų prisijungimu galėjo pasinaudoti kas nors kitas.

**Pirmasis administratorius.** Diegiant sukurta administratoriaus paskyra gauna slaptažodį iš serverio konfigūracijos failo (`.env`), kuriame jis lieka atviru tekstu. Prisijungę pirmą kartą, iš karto pakeiskite jį puslapyje **Paskyra**.

**Meniu ir kalba.** Kairėje yra meniu: **Pokalbis**, **Apžvalga**, **Įmonės**, **Ataskaitos**, **Teisės aktų bazė**, **DI sąnaudos**, **Užduotys**, **Paskyra**. Administratoriai dar mato **Pareigų peržiūra**, **DI instrukcijos**, **MCP serveriai**, **Naudotojai** ir **Veiksmų žurnalas**. **Apžvalga** parodo jūsų įmones ir ataskaitas, šios dienos DI biudžetą, teisės aktų bazės būklę ir užduočių eilę. Smeigtuko mygtukas meniu viršuje (**Atsegti šoninį meniu**) suskleidžia meniu į siaurą ženklų juostą: užvedus ant jos pelę ar perėjus į ją klaviatūra, meniu išsiskleidžia virš puslapio, o tas pats mygtukas (**Prisegti šoninį meniu**) grąžina visą meniu. Pasirinkimas įsimenamas. Viršutinėje juostoje perjungiama sąsajos kalba (lietuvių / English).

**Grįžimas atgal.** Grįžus į puslapį naršyklės mygtuku „Atgal“ arba puslapio nuoroda atgal (pvz., iš ataskaitos į ataskaitų sąrašą), puslapis atsidaro ten, kur jį palikote: toje pačioje slinkties vietoje, su tais pačiais filtrais, paieška, skirtuku, lentelės puslapiu ir rikiavimu, o išvadų sąraše – su tomis pačiomis išskleistomis kortelėmis. Filtrai, skirtukai ir lentelės puslapis įrašomi puslapio adrese, todėl tokią nuorodą galima išsaugoti ar nusiųsti kolegai. Naujas puslapis, atidarytas per meniu, visada prasideda nuo viršaus.

## 2. Pokalbis

Po prisijungimo atsiveria pokalbis. Grįžus į **Pokalbis** iš kito puslapio, atsiveria paskutinis jūsų pokalbis, o jau esant pokalbyje **Pokalbis** meniu ar programos pavadinimas viršutinėje juostoje pradeda naują pokalbį.

**Įmonės aprašymas.** Aprašykite įmonę savais žodžiais – veiklą, klientus, paslaugas, turimas licencijas – arba tiesiog įkelkite jos dokumentus (žr. „Dokumentai“). Asistentas pats, neprašytas, sukurs įmonės profilį ir užpildys viską, ką nustato jūsų žodžiai ir dokumentai: teisinę formą, įstaigos tipą, sektorių, dydį, darbuotojų skaičių, veiklą, klasifikaciją. Jums nieko papildomai prašyti nereikia. To, ko niekas nenustato (pvz., ar įmonė naudoja DI), jis nespėlioja: toks laukas lieka „nežinoma“, o atsakymo pabaigoje asistentas paklausia trūkstamų faktų. Licenciją, kurią nurodote patys, asistentas įrašo kaip deklaruotą, nepatikrintą. Pasakius, pvz., „įmonė sertifikuota pagal ISO 27001“, asistentas įrašo standartą į įmonės skiltį **Standartai** (jei standartas yra teisės aktų bazėje), o sertifikatą – į leidimų sąrašą.

**Dokumentai.** Nutempkite failą į pokalbį, įklijuokite jį į žinutės laukelį arba spauskite sąvaržėlę (**Įkelti dokumentą**). Tinka PDF, DOCX, TXT, MD, HTML, CSV ir JSON – tie patys failai kaip įmonės dokumentų skiltyje – iki 50 MB vienam failui. Dokumentas iš karto įkeliamas ir perskaitomas. Išsiuntus žinutę su dokumentais, asistentas juos perskaito ir pats sutvarko įmonės duomenis: sukuria arba papildo profilį, kiekvieną dokumentą priskiria įmonei ir nurodo jo rūšį, dokumentuose minimas licencijas ir sertifikatus įrašo kaip deklaruotus leidimus, o kiekvienai juose apibrėžtai vadovavimo, pareigūno ar kontrolės pareigybei išsaugo rolės profilį (skiltis **Rolės**). Tik tada jis atsako – trumpai pasako, ką įrašė, ir pateikia dokumentų peržiūrą. Toks ėjimas užtrunka: su dviem dešimtimis dokumentų – apie šešias–septynias minutes; eigą matote iš įrankių kortelių. Tas pats įvyksta ir failus įkėlus įmonės puslapio skiltyje **Dokumentai**: kai įkėlimas baigtas, asistentas pats pradeda pokalbį apie įmonę, perskaito naujus dokumentus ir sutvarko įmonės duomenis. Skiltyje tuo metu rodomas pranešimas su nuoroda **Atidaryti pokalbį**; jame asistentas parašo, ką įrašė ir ko dar klausia. Puslapį galite palikti – darbas tęsiasi.

- Kitokio tipo ar didesnis failas neįkeliamas. Virš žinutės laukelio pasirodo pranešimas „Neįkelta:“ su failo pavadinimu ir priežastimi: „netinkamas failo tipas (tinka: .pdf, .docx, …)“ arba „per didelis failas (daugiausia 50 MB)“.
- Failo kortelėje matysite įkėlimo eigą, paskui „Įkelta — bus išsiųsta su žinute“. Jei teksto išgauti nepavyko (pvz., skenuotas PDF be teksto sluoksnio – teksto atpažinimo nėra), kortelėje parašyta „tekstas neišgautas“, ir asistentas tokio dokumento perskaityti negali.
- Įkeltas failas tampa jūsų dokumentu ir įskaitomas į jūsų įkėlimų kvotą (3 skyrius). Kortelės pašalinimo ženklas ištrina ir įkeltą dokumentą. Failas, kurio neišsiuntėte su žinute ir kuris nepriskirtas įmonei, po 7 dienų ištrinamas automatiškai.

**Atitikties programos dokumentai.** Paprašykite asistento parengti atitikties politiką, valdymo struktūrą su RACI matrica arba teisinės rizikos registrą, arba klauskite apie jau parengtus (pvz., „kokių dokumentų mums trūksta?“, „kas atskaitingas už atitikties rizikos vertinimą?“, „kurios rizikos didžiausios?“). Asistentas pirmiausia patikrina, ar toks dokumentas jau yra. Jei yra, atsako pagal jį ir nurodo jo versiją, ar tai projektas, ar patvirtintas dokumentas, bei nuorodą į jo puslapį. Jei nėra, pasiūlo jį sugeneruoti (apie penkias minutes, apie 0,5 USD dienos biudžeto) ir pradeda tik jums sutikus. Redaguoti ir patvirtinti dokumentą galima tik jo puslapyje (3 skyrius, „Atitikties programa“).

**Kalba.** Asistentas atsako ta kalba, kuria rašote: parašius angliškai, atsakys angliškai, net jei sąsaja lietuviška.

**Klausimai apie teisę.** Klauskite konkrečiai, pvz.:
- „Kokią licenciją turi turėti kriptoturto paslaugų teikėjas Lietuvoje?“
- „Ką reikalauja DORA 19 straipsnis?“

Asistentas ieško indeksuotuose oficialiuose teisės aktų tekstuose ir cituoja straipsnį su nuoroda į oficialų tekstą.

**Ką reiškia „(tikrintina)“.** Kiekvieną straipsnio numerį, sumą ar datą, kurios teksto tame pokalbyje asistentas neperskaitė teisės aktų bazėje, jis pažymi „(tikrintina)“: toks teiginys remiasi modelio žiniomis, o ne patikrintu tekstu. Atsakymo pabaigoje asistentas išvardija prielaidas ir tai, ką reikia patikrinti („Prielaidos / tikrintina“).

**Citatų tikrinimas.** Paprašykite: „Patikrink, ar F00 lentelėje MiCA straipsniai nurodyti teisingai“. Asistentas palygina kiekvieną nuorodą su tikruoju straipsniu galiojančioje akto redakcijoje ir parodo, kur dokumentas klysta: ar tokia nuostata yra ir ar ji reglamentuoja tai, kas apie ją teigiama. Ko patikrinti nepavyko, asistentas pažymi „nepatikrinta“. Tą patį be pokalbio atliksite teisės aktų bazės skiltyje **Citatų tikrinimas** (5 skyrius).

**Ataskaitos.** Asistentas mato susietos įmonės ataskaitas ir pats jas suranda – ataskaitos numerio ar nuorodos jam nereikia. Klauskite, pvz., „Kiek mūsų įmonė atitinka?“, „Kokios kritinės spragos?“ arba „Patikrink penkias svarbiausias išvadas“. Jei ataskaitoje yra teisės aktų, kurių taikymą reikia patvirtinti (4 skyrius), paprašykite: „Padėk atsakyti į klausimus dėl nevertintų aktų“ – asistentas užduos klausimus ir atsakymus įrašys į įmonės profilį, o kita analizė tuos aktus įvertins arba atmes.

**Rolė.** Rolių (vaidmenų) profilius, pvz., atitikties pareigūno, asistentas parengia ir išsaugo pats, kai gauna įmonės dokumentus. Jei kurios nors rolės trūksta, paprašykite ją parengti pagal dokumentus – ji bus išsaugota iškart. Paprašius tęsti pokalbį kaip tam tikra rolė, asistentas atsakys iš tos rolės perspektyvos. Išsaugotą rolę pokalbiui galite parinkti ir patys įmonės skydelyje (žr. toliau).

**Įmonė ir rolė.** Mygtukas su įmonės pavadinimu pokalbio antraštėje (kol įmonė nesusieta, jame parašyta „Įmonė“; kai parinkta pokalbio rolė, šalia rodoma ir ji) atveria įmonės skydelį. Jo viršuje, laukelyje „Susieta įmonė“, pasirinkite vieną iš savo įmonių: pokalbis susiejamas iš karto, o kitas jūsų klausimas jau remiasi tos įmonės duomenimis. Administratorius mato visų naudotojų įmones: po kito naudotojo įmonės pavadinimu rodomas savininkas („Savininkas: …“), pagal jo vardą galima ir ieškoti. Laukelyje „Pokalbio rolė“ parinkite vieną iš įmonės rolių profilių arba „Be rolės“. Pakeitus įmonę, ankstesnės įmonės rolė pokalbiui nebetaikoma. Mygtukas „Atsieti įmonę“ pokalbį nuo įmonės atsieja. Naujame pokalbyje pasirinkus įmonę, pokalbis sukuriamas iš karto. Jei pakeitimo išsaugoti nepavyksta (pvz., įmonė jums nepriklauso), skydelyje parodoma priežastis, o susiejimas lieka koks buvo. Susieti įmonę ar parinkti rolę galite paprašyti ir asistento: jis įmonę randa ir pagal dalį pavadinimo, pvz., „1009“ ar „1009, LTD“ įmonei „1009 LTD (demo)“ – didžiosios raidės, skyrybos ženklai, teisinė forma (UAB, LTD…) ir žodis „įmonė“ nesvarbūs, o suklydus ar rašant be lietuviškų raidžių, pasiūlo panašiausias įmones. Žemiau skydelyje matysite įmonės profilį, leidimus, dokumentus ir roles, o **Atidaryti įmonės puslapį** nuveda į visą įmonės kortelę.

**Modelis.** Po žinutės laukeliu, dešinėje, matysite, kuris DI modelis atsako šiame pokalbyje. Paspaudę jį, matysite pokalbių modelius – naujausi viršuje – ir kiekvieno kainą už 1 mln. žetonų (įvesties ir išvesties); „(numatytasis)“ pažymėtas modelis, kurį administratorius nustatė pokalbio DI instrukcijai. Pasirinkimas išsaugomas iš karto ir galioja tik tam pokalbiui: kitą atsakymą jau rašys pasirinktas modelis. Naujame pokalbyje pasirinkus modelį, pokalbis sukuriamas iš karto. Grąžinus numatytąjį, pokalbis naudoja tą modelį, kurį nustato instrukcija, ir tada, kai administratorius jį pakeičia. Brangesnis modelis greičiau išnaudoja jūsų dienos DI biudžetą (7 skyrius). Jei modelio nebesiūloma, parodoma priežastis, o pokalbis lieka su ankstesniu modeliu.

**Analizė.** Paprašykite: „Įvertink įmonės atitiktį“. Asistentas pirmiausia apskaičiuoja didžiausią galimą analizės kainą (kortelė „Analizės kaina: iki …“ su jūsų likusiu DI biudžetu) ir paklausia, ar pradėti. Analizę jis paleidžia tik jums aiškiai sutikus su ta suma. Analizė vyksta fone ir trunka nuo kelių iki keliasdešimties minučių; pokalbyje matysite jos kortelę su eiga ir nuoroda **Atidaryti ataskaitą**. Tai ta pati analizė kaip 4 skyriuje. Pasakius „sustabdyk analizę“, asistentas ją nutraukia; tai, kas jau išleista, negrąžinama.

**Klausimai apie ataskaitą.** Kai pokalbis susietas su įmone, asistentas pats žino jos ataskaitas – nuorodos ar ataskaitos numerio jam nereikia. Klauskite, pvz.: „Kiek mūsų įmonė atitinka?“, „Kokios kritinės spragos pagal DORA?“, „Kurios nuorodos mūsų dokumentuose klaidingos?“, „Kas veiksmų plane pirmiausia?“. Jis atsako pagal naujausią baigtą ataskaitą: kiek pareigų atitinka, iš dalies atitinka, neatitinka, neįrodyta ir netaikoma – iš viso ir pagal kiekvieną teisės aktą, – tada svarbiausios spragos; paprašius parodo ir kitas. Jei ataskaitos dar nėra, pasiūlo analizę ir nurodo jos kainą.

**Akto pareigos.** Paklauskite: „Ko iš mūsų reikalauja DORA dėl incidentų?“. Asistentas parodo iš to akto išskirtas pareigas (kam taikoma, kokiomis sąlygomis, iki kada) su nuostata, iš kurios kiekviena kilo. Pareigą, kurios žmogus dar neperžiūrėjo, jis taip ir pažymi.

**Įrankių kortelės.** Kai asistentas naudoja įrankį (pvz., „Paieška teisės aktuose“, „Įmonės profilio kūrimas“), atsakyme matote jo kortelę su būsena: vykdoma…, atlikta, nepavyko arba nutraukta. Spustelėję kortelę, pamatysite užklausą ir rezultatą, o nepavykus – klaidos kodą.

- Teisės aktų paieškos ir nuostatų kortelėse yra nuorodos į oficialų tekstą (atsidaro naujame lange).
- Citatų patikros kortelė prie kiekvienos nuorodos parašo išvadą: patikrinta, rasta, reglamentuoja kitą dalyką, tokios nuostatos nėra arba akto nėra bazėje.
- Išorinių MCP serverių įrankiai pažymėti „Išorinis šaltinis: …“.

**Žinutės rašymas.** Enter išsiunčia žinutę, Shift+Enter pradeda naują eilutę. Kol asistentas rašo atsakymą, Enter nieko nedaro: galite toliau rašyti kitą klausimą ir išsiųsti jį, kai atsakymas bus baigtas. Žinutė gali būti iki 60 000 simbolių; ilgesnį tekstą įkelkite kaip dokumentą. Per minutę galima išsiųsti ne daugiau kaip 12 žinučių. Atsakymo kalba atitinka sąsajos kalbą.

**Atsakymas.**

- **Stabdyti atsakymą** nutraukia atsakymą; jau parašyta dalis lieka su pastaba „Atsakymas sustabdytas.“
- Atsakymas rašomas serveryje: uždarius ar perkrovus puslapį, jis nenutrūksta ir pasirodo, kai grįžtate į pokalbį. Jei bandote išeiti iš pokalbio puslapio, kol atsakymas dar rašomas, programa paklausia, ar tikrai išeiti.
- Vienas atsakymas gali būti rašomas iki 3 minučių; ilgiau užtrukęs nutraukiamas. Atnaujinant sistemą atsakymas gali nutrūkti; tada jį galima generuoti iš naujo.
- Jei atsakymo gauti nepavyksta, pranešimas paaiškina, ką daryti: jei DI modelis laikinai nepasiekiamas, bandykite po kelių minučių; jei pasirinktas modelis į užklausą atsakyti negali, pasirinkite kitą modelį (po žinutės laukeliu); jei pokalbis modeliui per ilgas, pradėkite naują pokalbį; jei žinutę užblokavo DI tiekėjo turinio filtras, perrašykite ją kitaip.
- Jei į jūsų žinutę atsakymo nėra, po ja rodomas mygtukas **Generuoti atsakymą**.
- Prie asistento atsakymo yra **Kopijuoti atsakymą** ir **Generuoti atsakymą iš naujo**.

**Žinutės redagavimas ir variantai.** Savo žinutę pataisysite ženklu **Redaguoti žinutę**; paspaudę **Siųsti pakeistą**, gausite naują atsakymą, o **Atšaukti** palieka, kaip buvo. Redagavimo laukelyje Enter išsiunčia pakeistą žinutę, o kol asistentas rašo atsakymą, nieko nedaro. Naujų failų ten pridėti negalima: įklijuotas failas nepridedamas. Ankstesnis variantas nedingsta: rodyklėmis **Ankstesnis variantas** ir **Kitas variantas** (pvz., „1 / 2“) perjungsite pokalbio variantus. Taip pat veikia ir iš naujo sugeneruoti atsakymai.

**Pokalbių sąrašas.** Pokalbiai išsaugomi. Kairėje matysite jų sąrašą ir mygtuką **Naujas pokalbis**, o pokalbio antraštėje – jo pavadinimą, susietą įmonę ir pokalbio rolę. Plačiame ekrane sąrašą galima praplatinti ar susiaurinti, tempiant jo dešinįjį kraštą; plotis įsimenamas, o dukart spustelėjus kraštą grąžinamas įprastas. Naujam pokalbiui pavadinimą pagal pirmąją jūsų žinutę parenka DI: kol atsakymas rašomas, sąraše rodoma žinutės pradžia, o atsakymui pasibaigus – keli žodžiai apie tai, apie ką pokalbis. Jūsų pačių suteiktas pavadinimas niekada nepakeičiamas. Norėdami pokalbį pervadinti, spauskite pieštuko ženklą jo eilutėje, įrašykite pavadinimą (iki 200 simbolių) ir spauskite Enter arba „Išsaugoti“; Esc atšaukia. Jūsų suteiktas pavadinimas automatiškai nebekeičiamas. Šiukšliadėžės ženklas, jums patvirtinus, pokalbį pašalina iš sąrašo; per programą jo grąžinti nebegalima (kas lieka serveryje, žr. 8 skyrių).

**DI pranešimas.** Po žinutės laukeliu, centre, visada rodomas priminimas „DI gali klysti“; informacijos ženklas prieš jį parodo visą tekstą.

## 3. Įmonės

Puslapyje **Įmonės** matysite savo įmones. Administratorius mato visų naudotojų įmones su stulpeliu **Savininkas**, o jungiklis **Tik mano** palieka tik jo paties. Ieškoti galima pagal pavadinimą ar įmonės kodą: surandamos įmonės, kurių pavadinime ar kode yra visi įvesti žodžiai, bet kuria tvarka (teisinė forma ir skyrybos ženklai nesvarbūs). **Nauja įmonė** sukuria profilį (pavadinimas, įmonės kodas, finansų įstaigos tipas, šalis); kitus duomenis užpildysite įmonės puslapyje arba aprašę įmonę pokalbyje.

Įmonės puslapio viršuje yra mygtukas **Pradėti atitikties analizę**, o meniu – **Naujas pokalbis apie įmonę** ir **Ištrinti įmonę**. Ištrinant įmonę, ištrinami jos profilis, leidimai, standartai, rolės, ataskaitos ir atitikties programos dokumentai; įkelti dokumentai lieka jūsų dokumentų sąraše, tik atsieti nuo įmonės. Kol vyksta įmonės analizė arba generuojamas programos dokumentas, įmonės ištrinti negalima.

Įmonės puslapio skiltys:

- **Profilis.** Pagrindiniai duomenys, veikla, dirbtinis intelektas ir asmens duomenys, papildomi duomenys (JSON). Laukai „Naudoja DI sistemas“, „Tvarko asmens duomenis“ ir pan. turi tris reikšmes: taip / ne / nežinoma. „Nežinoma“ reiškia, kad niekas to nepatvirtino, todėl analizė neatmeta su šiuo požymiu susijusių teisės aktų. Finansų rinkos klasifikaciją nustato asistentas pokalbyje; čia ji tik peržiūrima.
- **Leidimai ir licencijos.** Licencijos, leidimai, registracijos ir sertifikatai. Kiekvienas įrašas yra „Deklaruota“ (įmonė nurodė, niekas nepatikrino) arba „Patikrinta“. **Pažymėti patikrintu** spauskite tik patikrinę Lietuvos banko ar kito išdavėjo registre arba pagal įrodantį dokumentą: užfiksuojama, kas ir kada patikrino. Įrodantis dokumentas – vienas iš šios įmonės įkeltų dokumentų. Analizė deklaruotos licencijos nelaiko įrodymu.
- **Standartai.** Standartai, pagal kuriuos įmonė sertifikuota, kuriuos diegia ar planuoja taikyti (pvz., ISO/IEC 27001). **Pridėti standartą**: pasirinkite vieną iš teisės aktų bazėje esančių standartų, būseną (**Sertifikuota**, **Diegiama** arba **Planuojama**), taikymo sritį (ką apima valdymo sistema) ir, jei yra, sertifikatą – vieną iš skilties **Leidimai ir licencijos** įrašų, kurių rūšis „Sertifikatas“. Kiekviena vėlesnė įmonės analizė vertina įmonę ir pagal šių standartų reikalavimus, net jei standartas tik planuojamas: tada ataskaita parodo, ko dar trūksta. Kiekvieną standartą galima pridėti vieną kartą. Standartas, kurio kopija bazėje dar neparuošta, pažymėtas „Dar neindeksuotas — analizė jį praleidžia“. Kol bazėje nėra nė vieno standarto, juos pirmiausia turi įkelti administratorius (6 skyrius).
- **Dokumentai.** Vidaus politikos, procedūros, sutartys ir registrai – analizės įrodymai. Įkeltus dokumentus asistentas perskaito pats ir pagal juos užpildo profilį, licencijas, standartus ir roles (žr. „Dokumentai“ aukščiau).
  - Pasirinkite dokumento rūšį (politika, procedūra, sutartis, registras, kita), tada nutempkite failus arba spauskite **Pasirinkti failą**. Tinka PDF, DOCX, TXT, MD, HTML, CSV ir JSON, iki 50 MB vienam failui; kitokius failus programa atmeta iš karto ir parašo kodėl.
  - Sąraše matysite, ar tekstas išgautas („Tekstas išgautas“, „Teksto nėra“ – pvz., skenuotas PDF, „Nepavyko“), ar dokumentas jau paruoštas paieškai („Indeksuota“, „Indeksuojama…“), o po analizės – ir jo inventoriaus santrauką.
  - Paieškos laukelis („Ieškoti dokumentų tekste“, Enter) randa ištraukas; spustelėjus rezultatą, dokumentas atsiveria toje vietoje.
  - Atidarytame dokumente matysite turinį (antraštes), tekstą puslapiais ir įrodymų inventorių: kontrolės priemones su citatomis, pareigybes, registrus, patvirtinimą, peržiūros periodiškumą, minimus teisės aktus ir silpnąsias vietas. Inventorius sudaromas atliekant analizę.
  - Ištrinto dokumento failas ir tekstas ištrinami visam laikui; jau parengtos ataskaitos nepasikeičia.
  - **Kvota.** Kiekvienas naudotojas gali laikyti iki 1000 dokumentų ir iki 2 GB (numatytieji nustatymai; juos keičia sistemos prižiūrėtojas). Į kvotą įskaitomi visi jūsų dokumentai, ir įkelti pokalbyje. Pasiekę ribą, matysite „Išnaudota įkėlimų kvota — ištrinkite nebereikalingus dokumentus arba kreipkitės į administratorių.“
- **Rolės.** Pareigybių profiliai (pvz., „Atitikties pareigūnas“), kuriuos asistentas išsaugo pats iš pokalbyje įkeltų dokumentų ir kuriuos pokalbis gali perimti kaip kontekstą: pavadinimas, rolės kontekstas (iki 6000 simbolių) ir šaltiniai (dokumentas ir skirsnis). Pavadinimas įmonėje turi būti unikalus. Ištrinta rolė atsiejama nuo pokalbių, kurie ją naudojo.
- **Ataskaitos.** Įmonės atitikties analizės.
- **Veiksmai.** Įmonės veiksmų registras: patvirtintų ataskaitų veiksmų planai su atsakingais asmenimis, terminais ir būsenomis, taip pat teisės aktų pokyčiai, liečiantys paskutinės ataskaitos išvadas (žr. toliau „Veiksmų registras“).
- **Programa.** Atitikties programos dokumentai: atitikties politika, valdymo struktūra su atitikties procesu ir RACI matrica, teisinės rizikos registras (žr. toliau „Atitikties programa“).
- **Pokalbiai.** Jūsų pokalbiai, susieti su šia įmone.

### Veiksmų registras

Skiltyje **Veiksmai** matyti, kas nutiko ankstesnių ataskaitų išvadoms. Registras keičiasi tik vienu atveju – kai žmogus patvirtina baigtą ataskaitą (arba tą patvirtinimą atšaukia):

- **Ataskaitos veiksmų planas įtraukiamas į registrą.** Kiekvienas veiksmas ateina su išvadomis, kurias turi pašalinti, plane nurodytu atsakingu asmeniu ir terminu, skaičiuojamu nuo patvirtinimo dienos (14 dienų, 30 dienų, 90 dienų arba 12 mėnesių). Pareiga, kuriai jau yra neuždarytas veiksmas, antro veiksmo negauna. Veiksmai, nesusiję su konkrečia išvada (pvz., ištaisyti nuorodas dokumentuose), taip pat įtraukiami; juos uždaro tik žmogus.
- **Ankstesni veiksmai patikrinami pagal patvirtintų ataskaitų išvadas.** Jei vėlesnė patvirtinta ataskaita pareigą randa įvykdytą, išvada pažymima patvirtinta; kai patvirtintos visos veiksmo išvados, veiksmas uždaromas ir nurodoma, kuri ataskaita jį patvirtino. Pareiga, kurios ataskaita nevertino, nieko nepatvirtina. Jei veiksmas buvo pažymėtas įvykdytu, o po to parengta ataskaita pareigą vis dar randa neįvykdytą, jis grąžinamas vykdyti; ataskaita, parengta dar prieš pažymint veiksmą įvykdytu, jo negrąžina – atlikto darbo ji nematė.
- **Ataskaitos vertinamos parengimo, ne patvirtinimo eile.** Vėliau patvirtinta senesnė ataskaita nepakeičia to, ką apie tą pačią pareigą nustatė naujesnė patvirtinta ataskaita.
- **Uždarytas veiksmas lieka uždarytas.** Jei vėlesnė ataskaita tą pačią pareigą vėl randa neįvykdytą, jos planas įtraukia naują veiksmą, o santraukoje tai rodoma kaip vėl atsiradusi spraga.

Būsenos: **Atviras**, **Vykdomas**, **Įvykdytas – laukia patikros** (atsakingas asmuo nurodo, kad veiksmas atliktas; uždaro jį tik vėlesnė patvirtinta ataskaita), **Uždarytas**. **Vėluojantis** nėra atskira būsena: taip rodomas neuždarytas veiksmas, kurio terminas praėjo.

Išskleidę veiksmą, galite pakeisti atsakingą asmenį, terminą, būseną ir pastabą. Uždaryti veiksmą ranka (be ataskaitos patvirtinimo) galima tik pastaboje nurodžius priežastį – registre lieka, kas ir kodėl uždarė; tokį uždarymą galima ir atšaukti. Ataskaitos uždaryto veiksmo būsena ranka nekeičiama: jei su uždarymu nesutinkate, pakeiskite išvadą toje ataskaitoje. Atšaukus ataskaitos patvirtinimą (peržiūrėtojui pakeitus jos išvadą patvirtinimas atšaukiamas savaime) arba ištrynus patvirtintą ataskaitą, atšaukiama ir tai, ką registre patvirtino tik ji: išvada, kurią įvykdytą randa ir kita patvirtinta ataskaita, lieka patvirtinta, o vien ta ataskaita pagrįstas uždarymas panaikinamas. Ataskaitos įtraukti veiksmai lieka. Registrą galima eksportuoti į „Excel“.

Patvirtinimas remiasi pareigos tapatybe. Pareiga išlaiko tapatybę per teisės akto perskaitymus tik tada, kai ją patvirtino žmogus (**Pareigų peržiūra**); jei išvados pareiga po to buvo pakeista, vėlesnė ataskaita jos patvirtinti negali ir veiksmą tenka uždaryti ranka. Tas pats galioja įmonės vidaus reikalavimui, kai pakeičiama politika, iš kurios jis kilo.

**Teisės aktų pokyčiai.** Po veiksmų sąrašu rodoma, kurie paskutinėje ataskaitoje vertinti teisės aktai nuo tada gavo naują redakciją, kurios nuostatos pakeistos, pridėtos ar panaikintos ir kurios ataskaitos išvados remiasi pakeistomis nuostatomis – jas verta peržiūrėti arba paleisti naują analizę.

### Atitikties programa

Skiltyje **Programa** sistema iš įmonės dokumentų parengia tris atitikties vadybos sistemos dokumentus. Kiekvienas jų yra **projektas**, kol jo nepatvirtina žmogus – sistema pati nieko nepatvirtina.

| Dokumentas | Kas jame yra | Kuo remiasi |
|---|---|---|
| **Atitikties politika** | Aštuonių dalių politika: įvadas (tikslas, apimtis ir tinkamumas), vadovybės įsipareigojimas, atitikties funkcijos įgaliojimai, įsipareigojimas laikytis reikalavimų, rolės ir atsakomybės pagal tris linijas, pagrindiniai atitikties procesai, pranešimai apie pažeidimus, pasekmės už neatitikimą. Kiekvienas įmonės dokumentas priskirtas lygmeniui (1 – politika, 2 – teminė politika, 3 – procedūra ar instrukcija). Trūkstamų 2 ir 3 lygmens dokumentų sąrašas su paskirtimi, politikos dalimi, kurią dokumentas padeda įgyvendinti, prioritetu ir teisiniu pagrindu. | Įmonės dokumentais ir naujausia ataskaita |
| **Valdymo struktūra, atitikties procesas ir RACI** | Dokumentuose įvardytos pareigybės ir padaliniai; trūkstamos ar neaiškios rolės; siūloma valdymo struktūra (schema; tai, ko dokumentai neįvardija, pažymėta „siūloma“); atitikties valdymo procesas etapais, kiekvienas su periodiškumu ir pagrindu (ISO 37301 punktas arba Lietuvos banko gairių punktas); RACI matrica – etapai eilutėse, rolės stulpeliuose. | Dar ir atitikties politika |
| **Teisinės rizikos kriterijai ir registras** | Tikimybės ir poveikio kriterijai (5 lygiai, po 4 dimensijas, piniginės ribos pritaikytos įmonės dydžiui); 5×5 rizikos matrica su penkiais rizikos lygiais, sprendimų priėmėjais ir reagavimo būdais; ne mažiau kaip penki rizikos scenarijai pagal formulę „Tikėtinas [įvykis], kylantis iš [šaltinio], gali sukelti [pasekmes], kurios paveiks [saugomą tikslą]“, kiekvienas su teisinės rizikos rūšimi (ISO 31022 A priedas), šaltinio, pasekmių ir saugomo tikslo rūšimis (paskaitos tipologijos), padaliniu, vidaus politikomis, teisiniu pagrindu, veiksmų planu, atsakingais asmenimis ir terminu. | Dar ir politika bei struktūra |

**Generavimas.** Spauskite **Generuoti** prie dokumento (jei dokumentas jau yra – **Generuoti naują versiją**) ir patvirtinkite; ten pat pasirenkama dokumento kalba. Darbas vyksta fone apie penkias minutes ir sunaudoja apie 0,5 USD jūsų dienos DI biudžeto; tuo metu galite dirbti toliau – eiga matoma skiltyje ir dokumento puslapyje. Geriausia eilė: politika, tada struktūra, tada registras, nes kiekvienas remiasi ankstesniais (patvirtinta versija, o jei jos nėra – naujausiu projektu). Dokumentą galima sugeneruoti ir be ankstesnių, tik jis bus mažiau pagrįstas. Generuoti nepavyks, jei įmonė neturi nė vieno dokumento su išgautu tekstu, jei tos rūšies dokumentas jau generuojamas arba jei dienos biudžeto liko mažiau nei 0,25 USD.

**Dokumento puslapis.** **Atidaryti** atveria dokumentą: viršuje – būsena („Generuojama“, „Projektas“, „Patvirtinta“), versija ir veiksmai (**Redaguoti**, **Patvirtinti**, eksporto mygtukai), po jais – skydelis **Taisyklės**, žemiau – turinys skirtukuose. Politikos skirtukai: **Politika**, **Dokumentai**, **Kilmė**; struktūros: **Struktūra**, **Procesas ir RACI**, **Pareigybės ir spragos**, **Kilmė**; registro: **Registras**, **Kriterijai**, **Kilmė**. Skirtuke **Kilmė** nurodyta, kuria ataskaita, kuriais ankstesniais dokumentais ir kiek įmonės dokumentų remtasi, kokios DI instrukcijos ir modeliai naudoti ir kiek generavimas kainavo.

**Taisyklės.** Kiekvieną dokumentą sistema patikrina pagal jo rūšies taisykles ir rezultatą parodo skydelyje **Taisyklės**: „laikomasi“, „pažeista“ (privaloma taisyklė) arba „pastaba“. Pažeidus privalomą taisyklę, projekto patvirtinti negalima; kitos taisyklės yra pastabos peržiūrinčiam asmeniui.

- *Politika.* Privaloma: parašytos visos aštuonios dalys; kiekvienas nurodytas straipsnis yra teisės akte. Pastabos: teisės akto nėra teisės aktų bazėje; nuostata reglamentuoja ne tai, kam priskirta; citatos nerasta nurodytame dokumente; dokumentas nepriskirtas lygmeniui.
- *Struktūra ir RACI.* Privaloma: struktūra yra medis su valdymo organu viršuje ir be niekur nepriskirtų padalinių (šalia medžio gali stovėti tik išorės subjektas); antroji linija nepavaldi pirmajai, o vidaus auditas pavaldus tik valdymo organui; procesą sudaro bent penki etapai; **kiekvienas etapas turi lygiai vieną atskaitingą rolę (A) ir bent vieną vykdytoją (R)** – langelyje gali būti ir „AR“. Pastabos: rolė dalyvauja kiekviename etape; rolė atskaitinga už daugiau kaip pusę etapų.
- *Rizikos registras.* Privaloma: užpildytos kriterijų lentelės, rizikos apetitas (kiekvieno rizikos lygio reikšmė ir sprendimas) ir kriterijų pritaikymo paaiškinimas; bent penki scenarijai, apimantys bent keturias iš šešių teisinės rizikos rūšių; kiekvienas scenarijus turi visas keturias sakinio dalis, padalinį, bent vieną įmonės vidaus politiką ir visus aštuonis įvertinimus; kiekvienas nurodytas straipsnis yra teisės akte. Pastabos: nėra atsakingo asmens ar termino; reagavimo būdas neatitinka rizikos lygio; sakinys nukrypsta nuo nustatytos formos.

**Skaičius skaičiuoja sistema.** Scenarijaus tikimybė (T) yra keturių dimensijų įvertinimų vidurkis, suapvalintas iki sveikojo skaičiaus; poveikis (P) – didžiausias iš keturių dimensijų įvertinimų; balas – T × P; rizikos lygis – pagal ribas: 1–3 Nereikšminga, 4–6 Toleruotina, 8–12 Vidutinė, 15–16 Didelė, 20–25 Kritinė. Nei modelis, nei redaguojantis asmuo balo neįrašo: pakeitus dimensijos įvertinimą ir išsaugojus, balą ir lygį perskaičiuoja sistema.

**Redagavimas ir tvirtinimas.** Paspaudus **Redaguoti**, projektą galima taisyti: politikos dalių tekstą ir valdymo organui paliktus sprendimus, dokumentų lygmenis, struktūros mazgus, proceso etapus, RACI langelius, scenarijus, jų įvertinimus ir veiksmų planą, kriterijų tekstus. Pakeitimai lieka tik jūsų naršyklėje, kol nepaspaudžiate **Išsaugoti pakeitimus** (**Atmesti pakeitimus** grąžina išsaugotą projektą); išsaugojus sistema iš naujo patikrina taisykles ir parodo, kas dabar pažeista. RACI matricoje etapas, neturintis lygiai vienos atskaitingos rolės ar nė vieno vykdytojo, pažymimas iš karto, dar neišsaugojus. **Patvirtinti** gali tik žmogus ir tik tada, kai nepažeista nė viena privaloma taisyklė: užfiksuojama, kas ir kada patvirtino, ir pastaba (pvz., valdybos sprendimo data). Patvirtintas dokumentas nebekeičiamas; **Nauja versija** sukuria jo kopiją kaip naują projektą, o patvirtintoji lieka tokia, kokia buvo patvirtinta.

**Eksportas.** Kiekvienas dokumentas eksportuojamas PDF formatu; politika – ir „Word“ (kad valdymo organas galėtų ją redaguoti prieš priimdamas), rizikos registras – ir „Excel“. Viršelyje nurodyta, ar tai projektas, ar patvirtintas dokumentas ir kas jį patvirtino; paskutiniame skyriuje – kaip dokumentas atitinka taisykles ir kuo remiantis parengtas.

**Ką patikrinti prieš tvirtinant.**

- Dokumentas parengtas iš įkeltų įmonės dokumentų: ko juose nėra, to sistema nežino.
- Politikoje laužtiniuose skliaustuose pažymėti sprendimai, kuriuos turi priimti valdymo organas; jie surašyti ir prie kiekvienos dalies.
- Rizikos scenarijų įvertinimai yra siūlymas. Jei profilyje nenurodytos metinės pajamos, piniginės poveikio ribos remiasi prielaida – ji įrašyta prie kriterijų („Kaip kriterijai pritaikyti“) ir turi būti pakeista tikru skaičiumi.
- Įspėjimu pažymėtas nuostatas patikrinkite teisės akte: sistema nerado straipsnio arba mano, kad jis reglamentuoja ką kita.

## 4. Ataskaitos

Puslapyje **Ataskaitos** matysite savo įmonių analizes (administratorius – visų įmonių); sąrašą galima filtruoti pagal įmonę ir būseną.

**Analizės paleidimas.** Įmonės puslapyje spauskite **Pradėti atitikties analizę**, puslapyje **Ataskaitos** – **Nauja analizė** (tada pasirinkite įmonę), arba paprašykite asistento pokalbyje. Lange pasirinkite ataskaitos kalbą ir, jei norite, apimtį: „Tik šie teisės aktai (neprivaloma)“. Palikus tuščią, analizė pati atrinks taikytinus teisės aktus.

- **Vidaus reikalavimai.** Pažymėjus **Įvertinti ir įmonės vidaus reikalavimų laikymąsi**, ataskaita papildomai patikrina, ar įmonės procedūros įgyvendina tai, ko reikalauja pačios įmonės politikos. Reikalavimai išrenkami iš politikos lygmens dokumentų (jei parengta atitikties politika – iš jos dokumentų hierarchijos 1 ir 2 lygmens dokumentų, kitaip – iš dokumentų, kurių rūšis „politika“). Kiekvienas reikalavimas vertinamas pagal kitus įmonės dokumentus: pati politika, kurioje reikalavimas įrašytas, įrodymu nelaikoma. Šios išvados ataskaitoje sudaro atskirą grupę **Vidaus reikalavimai**, skaičiuojamos atskirai nuo teisės aktų išvadų ir reiškia spragas tarp įmonės politikų ir procedūrų, ne teisės aktų pažeidimus; neįvykdytų reikalavimų išvados įtraukiamos į veiksmų planą. Kainos įvertyje papildoma dalis rodoma atskira eilute. Jei įmonė neturi politikos lygmens dokumentų, pasirinkti negalima.
- **Kainos įvertis.** Prieš paleidžiant parodoma didžiausia tikėtina kaina, taikomų teisės aktų ir pareigų skaičius. Dalis kainos gali tekti bendram teisės aktų bazės darbui (pirmą kartą išskiriamoms pareigoms); jis apmokamas iš bendro biudžeto, ne iš jūsų dienos biudžeto. Jei kurio nors modelio kaina nežinoma, rodoma „Ne mažiau kaip …“: tikroji kaina gali būti didesnė.
- **Biudžetas.** Šalia parodomas jūsų likęs šios dienos DI biudžetas. Jei įvertis jį viršija, matysite įspėjimą: pradėta analizė nenutraukiama, todėl šiandienos išlaidos gali biudžetą viršyti.
- Analizės pradėti negalima, jei jūsų dienos biudžeto liko mažiau nei 0,25 USD, jei teisės aktų bazė tuščia arba jei tos įmonės analizė jau vyksta (tada pasiūloma atidaryti vykdomą analizę).

**Teisės aktų sąrašo patvirtinimas.** Analizė vyksta dviem dalimis. Pirmoji – trumpa ir pigi – nustato, kurie teisės aktai įmonei taikomi. Tada analizė sustoja, o ataskaita pažymima **Laukia apimties patvirtinimo**: brangioji dalis, kurioje vertinama kiekviena pareiga, pradedama tik jums patvirtinus aktų sąrašą.

- Ataskaitos kortelėje **Teisės aktai** prie kiekvieno akto matysite, ką su juo ketinama daryti ir kodėl, o jungikliu **Vertinti** galite tai pakeisti: įtraukti aktą, kurio taikymą dar reikia patvirtinti, direktyvą ar net įmonei neprivalomą aktą; arba neįtraukti taikomo akto.
- Įmonei neprivalomas aktas vertinamas kaip **geroji praktika** – visos jo pareigos, tarsi jos būtų skirtos įmonei. Tokio akto išvados rodo atotrūkį nuo gerosios praktikos, ne teisės akto pažeidimą. Taip, pavyzdžiui, kriptoturto paslaugų teikėją galima įvertinti pagal Lietuvos banko atitikties funkcijos gaires, kurios jam tiesiogiai neskirtos.
- Viršuje rodoma **Vertinimo apimtis ir kaina**: kiek aktų ir pareigų bus vertinama, didžiausia tikėtina antrosios dalies kaina ir jūsų likęs dienos biudžetas. Skaičiai perskaičiuojami kaskart pakeitus jungiklį.
- **Patvirtinti ir tęsti** paleidžia antrąją dalį; **Atšaukti analizę** ją nutraukia. Kol ataskaita laukia, kitos tos įmonės analizės pradėti negalima.
- Ataskaitoje ir jos eksportuose lieka įrašas, kas ir kada patvirtino sąrašą, o aktai, dėl kurių nuspręsta kitaip, nei siūlė analizė, rodomi atskirai: **Neprivalomi — įvertinti įmonės pasirinkimu** ir **Taikomi — apimtį tvirtinusio asmens sprendimu nevertinti**.
- Jei peržiūros nereikia, paleidimo lange pažymėkite **Tęsti nelaukiant aktų sąrašo patvirtinimo** – tada analizė nesustos, o ataskaitoje bus pažymėta, kad sąrašo niekas netvirtino. Pokalbyje asistentas parodo sąrašą ir kainą ir tęsia tik gavęs jūsų sutikimą.

**Eiga.** Kol analizė vyksta, ataskaitos puslapyje matysite kortelę „Vyksta atitikties analizė“: analizės etapus, kiekvieno baigto etapo modelį ir kainą, bendrą „DI kaina iki šiol“ ir trukmę. Puslapį galite palikti – analizė tęsis, rezultatai išsisaugos. **Stabdyti analizę** sustabdo ją artimiausiame etape; jau sunaudotos DI sąnaudos negrąžinamos. Etapų eigą mato analizę pradėjęs naudotojas. Nepavykusią ar atšauktą analizę galima **Paleisti iš naujo**.

Analizės žingsniai:

1. **Dokumentai.** Kiekvienas įmonės dokumentas perskaitomas vieną kartą: ką jis įrodo ir kokias konkrečias teisės aktų nuostatas (straipsnius, dalis, punktus) jis nurodo.
2. **Nuorodų patikra.** Kiekviena dokumento nuoroda į konkrečią nuostatą patikrinama pagal teisės aktų bazę: ar tokia nuostata yra galiojančioje akto redakcijoje ir ar ji reglamentuoja tai, ką teigia dokumentas.
3. **Taikymas.** Iš katalogo atrenkami aktai, kurie gali būti taikomi įmonės tipui. Tada modelis perskaito jų taikymo srities nuostatas ir nusprendžia: taikomas / netaikomas / neaišku, su pagrindimu, o jei aktas įmonei pradedamas taikyti vėliau – ir nuo kada. Nuo šio sprendimo priklauso, ką ataskaita su aktu daro:
   - **taikomas** aktas vertinamas;
   - aktas, kuris bus **taikomas vėliau**, vertinamas kaip pasirengimas, o jo išvados skaičiuojamos atskirai nuo šiandienos rezultato;
   - aktas, kurio taikymas **neaiškus** (priklauso nuo faktų, kurių įmonės profilyje nėra), **nevertinamas**: ataskaitoje pateikiami klausimai, į kuriuos reikia atsakyti, ir tik atsakius kita analizė jį įvertins arba atmes;
   - **direktyva** nevertinama atskirai – ji įmonei taikoma per ją perkeliančius Lietuvos teisės aktus, kurie ir vertinami;
   - aktas, kuris nustato **priežiūros institucijos veiklą ar procedūras** (pvz., Lietuvos banko įstatymas, baudų skaičiavimo ar licencijavimo tvarkos aprašas), atskirai nevertinamas – įmonę jis veikia per institucijos sprendimus;
   - aktas, kurį patys pasirinkote analizės apimtyje, vertinamas visada.

   Įmonės skiltyje **Standartai** nurodyti standartai taikomi be DI vertinimo – įmonė juos pasirinko. Jei analizės apimtyje pasirinkote standartą, jis vertinamas net ir neįrašytas įmonės skiltyje.
4. **Pareigos.** Iš vertinamų aktų paimamos konkrečios pareigos, iš standartų – jų reikalavimai. Jie išgaunami vieną kartą kiekvienai akto ar standarto redakcijai; administratorius juos peržiūri.
5. **Atotrūkio vertinimas.** Kiekvieną pareigą modelis vertina perskaitęs įmonės profilį, licencijas ir **visus įmonės dokumentus ištisai** (ne atskiras ištraukas), todėl mato, ar klausimą apskritai reglamentuoja kuris nors dokumentas ir ar dokumentas nukreipia į kitą, nepateiktą. Kiekviena išvadoje pateikta citata surandama dokumente – ją galima atverti toje vietoje.
6. **Veiksmų planas ir santrauka.** Planas apima kiekvieną neįvykdytą ar neįrodytą pareigą: kiekvieną išvadą uždaro vienas veiksmas. Didelėje ataskaitoje persidengiantys veiksmai (pvz., keli tos pačios politikos papildymai) sujungiami į vieną. Klaidingos dokumentų nuorodos tampa taisomaisiais veiksmais, o nevertinti aktai – veiksmu išsiaiškinti trūkstamus faktus. Pasirengimo vėliau taikomiems aktams veiksmai plane pateikiami paskutiniai.

**Ataskaitos skiltys.** Baigtos ataskaitos skiltys (nuorodų patikros skiltis aprašyta žemiau):

- **Santrauka.** Pagrindiniai skaičiai (įvertinti teisės aktai, įvertintos pareigos ir kiek jų patvirtino žmogus, neatitinka, iš dalies, veiksmai plane), išvados pagal būseną, neįvykdytos pareigos pagal reikšmingumą, vadovybės santrauka ir analizės kilmė: kurios DI instrukcijų versijos, modeliai ir teisės aktų redakcijos naudotos, bei DI sąnaudos. Šie skaičiai – **šiandienos rezultatas**: į juos įeina tik įmonei jau taikomų aktų išvados. Jei yra nevertintų aktų, kortelė „Nevertinti teisės aktai“ juos išvardija ir nuveda prie klausimų; jei yra vėliau taikomų aktų, jų išvados rodomos atskiroje kortelėje „Vėliau taikomi aktai — pasirengimas“.
- **Teisės aktai.** Aktai pagal tai, ką ataskaita su jais padarė: **įvertinti**; **taikomi vėliau** (su data, nuo kurios taikomi; įvertintas pasirengimas); tie, kurių **taikymą reikia patvirtinti** (nevertinti; kiekvieno kortelėje – atsakytini klausimai). Kiekvienam aktui rodomas patikimumas, pagrindimas ir teisinis pagrindas. Įmonės standartai rodomi tarp įvertintų su žyma „Standartas“ ir be patikimumo: jie taikomi pagal įmonės pasirinkimą. Suskleisti rodomi: direktyvos (taikomos per nacionalinę teisę), institucijų veiklą ir procedūras nustatantys aktai, aktai, kuriuos DI įvertino kaip netaikomus, ir aktai, atmesti pagal katalogą. Aktas, atnaujintas po analizės, pažymėtas „Atnaujintas po analizės“.
- **Išvados.** Kiekviena įvertinta pareiga. Išvadas galima grupuoti pagal teisės aktą arba sritį, filtruoti pagal būseną ir reikšmingumą bei ieškoti tekste. Išskleidę išvadą, matysite pareigą, vertinimą, įrodymus su citatomis, rekomendaciją ir terminą. Įrodymas iš dokumento atveria dokumentą toje vietoje, kurią išvada cituoja; cituojama ištrauka pažymėta. Jei citatos pažodžiui dokumente rasti nepavyko, po ja tai parašyta – tokią citatą sutikrinkite su dokumentu. Vėliau taikomo akto išvados pažymėtos „Taikoma nuo …“, o grupuojant pagal aktą toks aktas rodomas paskutinis ir suskleistas: tai pasirengimas, ne šiandienos spraga.
- **Veiksmų planas.** Prioritetizuoti veiksmai: atsakingas asmuo, sąnaudos, terminas ir sritis. „Susijusios išvados“ parodo tik tas išvadas, kurias veiksmas uždaro. Veiksmas, kuris tik parengia įmonę dar netaikomam aktui, pažymėtas „Pasirengimas“.
- **Analizės duomenys.** Įmonės duomenys analizės metu ir analizės apimtis. Vėlesni profilio pakeitimai ataskaitos nekeičia.

Išvadų būsenos:

| Būsena | Reikšmė |
|---|---|
| **Atitinka** | Įmonės dokumentai nustato visus pareigos elementus. Jei svarbu patikrinti, ar tvarka taikoma praktikoje, analizėje nurodoma „Praktikoje patikrinkite: …“. |
| **Iš dalies** | Dokumentai pareigą aprašo, bet trūksta konkretaus elemento (atsakingo asmens, termino, dažnumo, turinio) – jis įvardijamas. |
| **Neatitinka** | Šiai sričiai skirtas pateiktas dokumentas apie pareigą nieko nenustato arba jai prieštarauja. |
| **Neįrodyta** | Iš pateiktos medžiagos spręsti negalima: nė vienas pateiktas dokumentas šios srities neaprašo (pvz., neįkelta privatumo politika); reikalingas dokumentas nurodytas, bet neįkeltas; arba pareiga reikalauja fakto apie pačią įmonę (kur ji valdoma, kas jos vadovai, kokį kapitalą ar draudimą turi), kurio nenurodo nei profilis, nei dokumentai. Politikos tylėjimas apie faktą nėra neatitiktis. |
| **Netaikoma** | Pareiga skirta kitam asmeniui (pvz., žetonų emitentui) arba priklauso nuo veiklos, struktūros ar žingsnio, kurio įmonė neturi ir neketina turėti (paslaugos, kurios neteikia, filialų, papildomo leidimo). Tai, kas nutinka įprastoje veikloje (priežiūros institucijos paklausimas, incidentas, skundas), nėra priežastis pareigos netaikyti. |

**Reikšmingumas** yra pačios pareigos svarba – ką reiškia jos nevykdyti – ir visose ataskaitose tas pats; kiek įmonė nuo pareigos nutolusi, rodo būsena. **Kritinė**: veikla be leidimo ar licencijos, draudžiama veikla, grėsmė netekti licencijos ar baudžiamoji atsakomybė. **Aukšta**: pagrindiniai riziką ribojantys, pinigų plovimo prevencijos, IRT rizikos ir klientų turto apsaugos reikalavimai, pareigos teikti informaciją, už kurių nevykdymą gresia didelės baudos. **Vidutinė**: organizaciniai, politikų ir dokumentavimo reikalavimai. **Žema**: formalūs duomenys ir pranešimai. Todėl kritinė pareiga su būsena „Neįrodyta“ reiškia trūkstamą įrodymą, o ne nustatytą kritinį pažeidimą.

**Ankstesnės ataskaitos.** Jei ta pati pareiga buvo vertinta ankstesnėse įmonės ataskaitose, išvadoje rodoma eilutė **Anksčiau** – kaip pareiga buvo įvertinta tada. Santraukoje rodoma, kas pasikeitė nuo ankstesnių ataskaitų: kiek spragų pašalinta, kiek naujų ir kiek anksčiau įvykdytų pareigų vėl tapo spragomis. Kiekviena pareiga lyginama su paskutiniu ankstesniu jos vertinimu, todėl siauresnės apimties ataskaita tarp dviejų pilnų palyginimo neiškreipia.

**Pasekmė.** Prie spragos (išvados „Neatitinka“, „Iš dalies“ ar „Neįrodyta“) rodoma, kuo gresia nuostatos pažeidimas: didžiausia bauda ir poveikio priemonės, kurias numato pats teisės aktas ar jį įgyvendinantis nacionalinis įstatymas, su nuoroda į sankcijų nuostatą (pvz., „bauda iki 5 000 000 EUR arba 5 % metinės apyvartos (pajamų) … (MiCA 111 str. 3 d.)“). Kai aktas didesnę baudą sieja su pažeidimo pobūdžiu (sistemingas, šiurkštus, pakartotinis), ta sąlyga nurodoma. Kai bauda numatyta tik tam tikriems asmenims (pvz., finansų įstaigoms, o ne kitiems įpareigotiesiems subjektams), tai taip pat nurodoma: „tik šiems asmenims: …“ – ar jūsų įmonė jiems priklauso, vertinate patys. Tai teisės akte numatyta riba, ne prognozė. Pasekmė paimama iš teisės aktų sankcijų nuostatų, kurias sistema perskaito vieną kartą; anksčiau parengtose ataskaitose jos nėra.

**Peržiūra.** Mygtukas **Peržiūrėti** leidžia išvadą pakeisti savo vertinimu (arba palikti DI vertinimą) su pastaba. Ten pat įrašoma **Priežastis** – kodėl spraga atsirado (pvz., procedūra neatnaujinta pasikeitus teisės aktui, nepaskirtas atsakingas asmuo). Priežastį įrašo tik peržiūrintis asmuo: dokumentai parodo, ko trūksta, bet ne kodėl, todėl sistema jos nerašo ir asistentas pokalbyje jos neįrašo. Priežastį galima įrašyti ir nekeičiant išvados. Jūsų vertinimas rodomas ataskaitoje ir eksportuose, išvada pažymima „Peržiūrėta“, o pakeitimas įrašomas į veiksmų žurnalą. Žyma „Nepatvirtinta pareiga“ reiškia, kad išvada remiasi DI išskirta pareiga, kurios dar nepatvirtino žmogus.

**Nuorodų patikra.** Skiltyje **Nuorodos** matysite kiekvieną įmonės dokumentuose nurodytą konkrečią teisės akto nuostatą: kaip ji nurodyta, ką dokumentas apie ją teigia, ir išvadą — **teisinga**, **ne ta nuostata** (nuostata reglamentuoja ką kita), **tokios nuostatos nėra**, **akto nėra bazėje** arba **nepavyko įvertinti**. Rastai nuostatai rodoma tikroji antraštė, patikros pastaba, ištrauka ir nuoroda į oficialų tekstą. Problemos rodomos pirmiausia; galite filtruoti pagal išvadą ir ieškoti. Senesnėse ataskaitose ši patikra nebuvo atlikta.

**Patvirtinimas.** **Patvirtinti ataskaitą** (su neprivaloma pastaba) reiškia, kad peržiūrėjote išvadas ir veiksmų planą; ataskaitoje rodoma, kas ir kada patvirtino. **Atšaukti patvirtinimą** grąžina ataskaitą į nepatvirtintą. Bet koks vėlesnis išvados pakeitimas patvirtinimą panaikina.

**Eksportas.** Mygtukai **PDF** ir **Excel** (tik baigtai ataskaitai). PDF skirtas vadovybei, todėl pradedamas nuo rezultato: viršelis, turinys su poskyriais, rezultatas trumpai (kiek pareigų vertinta, kiek atvirų spragų pagal reikšmingumą, kiekvieno akto eilutė), santrauka ir veiksmų planas. Toliau – medžiaga, kuria jis pagrįstas: įmonės profilis, taikomi ir atmesti aktai, išvados, dokumentų nuorodų patikra, metodika su būsenų paaiškinimu ir kilmė (naudotos instrukcijų versijos, modeliai, teisės aktų redakcijos). Išvados pateikiamos pagal aktą – kiekvienas aktas yra atskiras turinio poskyris ir pradedamas naujame puslapyje: pirma spragos (svarbiausios viršuje) su vertinimu, rekomendacija ir cituojamu įrodymu, tada neįrodytos pareigos, o įvykdytos – glausta lentele; įmonei netaikomos pareigos tik suskaičiuojamos. Kiekviename puslapyje matyti, kur esate: viršuje – įmonė su teisine forma ir skyrius (išvadų skyriuje ir aktas, pvz., „Išvados · MiCA“), apačioje – ženklas, data ir puslapio numeris, o išvados kortelėje prieš nuostatą nurodytas aktas (pvz., „MiCA 40 str.“). Excel faile yra visos išvados darbui.

**Kiti veiksmai.** Jei po analizės buvo atnaujinti jos naudoti teisės aktai, ataskaitos viršuje matysite įspėjimą „Teisės aktai atnaujinti“ – analizę verta paleisti iš naujo. **Ištrinti ataskaitą** ją ištrina visam laikui (vykstančios analizės pirmiausia sustabdykite).

## 5. Teisės aktų bazė

Puslapis **Teisės aktų bazė** atviras visiems naudotojams. Jame yra trys skiltys.

- **Katalogas.** Indeksuoti aktai, jų jurisdikcija, rūšis, galiojimas, redakcija, nuostatų skaičius (administratoriams – ir pareigų), paskutinės patikros data ir klaida, jei įkelti nepavyko. Šaltiniai:
  - ES aktai paimami iš Leidinių biuro (CELLAR): naujausia galiojanti konsoliduota redakcija lietuvių kalba;
  - Lietuvos aktai – iš e-TAR (šiandien galiojanti redakcija);
  - Lietuvos banko puslapiai – iš lb.lt;
  - EBA gairės – iš administratoriaus įkelto oficialaus PDF failo.

  Be pagrindinių aktų, bazėje yra ir juos detalizuojantys tekstai: MiCA ir DORA techniniai reguliavimo ir įgyvendinimo standartai (deleguotieji ir įgyvendinimo reglamentai, pvz., „MiCA RTS 2025/294“ – skundų nagrinėjimas, „DORA RTS 2024/1774“ – IRT rizikos valdymas), Lietuvos banko nurodymai dėl pinigų plovimo prevencijos (Nr. 03-17) ir dėl tarptautinių sankcijų įgyvendinimo (Nr. 03-98) bei EBA PP / TF rizikos veiksnių gairės. Ataskaitoje jie vertinami kaip atskiri aktai; aktų sąrašo tvirtinimo lange galite palikti tik tuos, kurių įmonei reikia.
- **Paieška.** Parodo, ką asistentas ir analizė randa pagal klausimą ar frazę (paieška pagal prasmę ir pagal žodžius). Galite riboti teisės aktus ir jurisdikciją bei pasirinkti rezultatų skaičių. Kiekvienas rezultatas turi nuorodą į nuostatą bazėje ir į oficialų tekstą.
- **Citatų tikrinimas.** Kiekvienoje eilutėje įrašykite teisės aktą ir straipsnį (dalis, punktas ir „Nurodyta tema“ neprivalomi); vienu kartu – iki 50 eilučių. Straipsnio laukelyje galima įrašyti ir intervalą ar sąrašą, kaip jį rašo dokumentai („77–78“, „6–9, 26–29, 53“): kiekvienas straipsnis patikrinamas atskirai, o eilutei atsako labiausiai atitinkantis. Rezultatas: nuostata „Rasta“, „Nerasta“ arba „Akto nėra bazėje“, jos tikrasis pavadinimas, pradžia ir nuorodos. Jei nurodėte temą, DI modelis įvertina, ar pavadinimas su ja sutampa („Pavadinimas sutampa“, „Pavadinimas nesutampa“, „Neaišku, ar sutampa“); tai skaičiuojama į jūsų dienos biudžetą. Kai biudžetas išnaudotas, temą su pavadinimu palygina paprastas žodžių sutapimas.

Akto puslapyje yra skiltys **Struktūra** (skyriai, straipsniai, priedai; paieška tekste; nuostatos tekstas, **Kopijuoti citatą** ir **Oficialus tekstas**), **Redakcijos**, **Pareigos** (iš akto išskirtos pareigos; naudotojams tik peržiūrai) ir **Informacija** (katalogo įrašas ir tai, ką iš paties akto teksto perskaitė modeliai: kam aktas taikomas ir kiek sankcijų pakopų jis nustato, kiekvienas su modelio pastaba; kol aktas neskaitytas – „Dar neskaityta“).

**Standartai.** Bazėje gali būti ir standartai (ISO/IEC, EN, LST), kuriuos įkėlė administratorius: kataloge jų rūšis „Standartas“, jurisdikcija dažniausiai „Tarptautinis“. Standarto struktūrą sudaro punktai ir priedai: „4 skyrius“, „6.1.2“, „A priedas“, priedo punktas „A.5.15“. Taip juos ir nurodykite citatų tikrinime (teisės aktu įrašykite standarto žymenį, pvz., „ISO/IEC 27001:2022“ arba tiesiog „ISO 27001“, o straipsnio laukelyje – punktą; „kontrolės priemonė 5.15“ reiškia priedo punktą A.5.15). Ne ISO tvarka sunumeruotas standartas ar kontrolės priemonių katalogas cituojamas taip, kaip jame pačiame žymimos dalys: savais identifikatoriais (pvz., NIST SP 800-53 „AC-2“ ar „AC-2(1)“, NIST CSF „GV.OC-01“), antraštėmis, o jei struktūros atpažinti nepavyko – puslapiais („12 psl.“). Tinka visada ta nuoroda, kurią rodo paieškos rezultatas ar skiltis **Struktūra**. Tarptautinis standartas ir jo perimtasis leidimas atpažįstami kaip tas pats tekstas, nors jų metai skiriasi: nuoroda į „ISO/IEC 27001:2022“ tikrinama pagal bazėje esantį „LST EN ISO/IEC 27001:2023“ ir atvirkščiai. Standarto tekstas yra jo kopijos kalba, dažniausiai anglų. Standarto skiltyje **Pareigos** matysite iš jo išskirtus reikalavimus.

Aktai atnaujinami kas savaitę automatiškai; nepasikeitę aktai nepaliečiami. Išjungti aktai naudotojams nerodomi ir nenaudojami nei paieškoje, nei analizėje.

## 6. Administratoriui

- **Teisės aktai.** Mygtukas **Pridėti teisės aktą ar standartą** puslapyje **Teisės aktų bazė**. Šaltinis:
  - EUR-Lex – CELEX numeris (pvz., `32023R1114`);
  - e-TAR – dokumento identifikatorius (pvz., `TAR.4A05AB3730DD`; e-seimas identifikatoriai netinka);
  - Lietuvos banko svetainė – www.lb.lt puslapio adresas;
  - interneto adresas – https:// adresas, tik iš sistemos prižiūrėtojo leistų svetainių;
  - įkeltas failas – PDF, DOCX, HTML, TXT, MD arba XML, iki 60 MB.

  Kataloge esančių EBA gairių (EBA/GL/2021/02 ir EBA/GL/2024/01) sistema pati neatsisiunčia: atidarykite aktą, iš jo šaltinio nuorodos atsisiųskite lietuvišką PDF ir įkelkite jį mygtuku **Įkelti naują redakciją**. Iš PDF įkeltam aktui sistema pašalina kiekviename puslapyje pasikartojančias eilutes (antraštes, puslapių numerius). Keli techniniai standartai kataloge yra išjungti, nes taikomi tik leidimo prašančiai ar pranešimą teikiančiai įmonei (pvz., „MiCA RTS 2025/305“) – įjunkite juos, kai tokios įmonės analizei jų reikia.

  Akto puslapyje: **Atnaujinti iš šaltinio**, **Apdoroti iš naujo (net jei nepasikeitė)**, **Įkelti naują redakciją** (iki 60 MB; dabartinei redakcijai tapatus failas atmetamas), **Išskirti pareigas** (pasirenkama pareigų kalba), **Perskaičiuoti vektorius** (reikia tik pakeitus vektorizavimo modelį), **Redaguoti metaduomenis**, **Įjungti** / **Išjungti** ir **Ištrinti teisės aktą**. Ištrynus aktą, ištrinamos visos jo redakcijos ir failai (parengtos ataskaitos nepasikeičia); jei aktą norite tik laikinai nenaudoti, geriau jį išjunkite. Katalogo meniu yra **Tikrinti visus šaltinius** ir **Perskaičiuoti visus vektorius**. Pareigų išskyrimas ir vektorių perskaičiavimas naudoja DI modelį ir kainuoja; jūsų paleistas pareigų išskyrimas skaičiuojamas į jūsų DI sąnaudas.
- **Standartai.** Tuo pačiu mygtuku pasirinkite rūšį **Standartas**: forma persijungia į įkeltą failą, tarptautinę jurisdikciją ir anglų kalbą (LST leidimui pakeiskite jurisdikciją ir kalbą). Į **Trumpą pavadinimą** įrašykite žymenį, pvz., `ISO/IEC 27001:2022` – pagal jį standartą randa nuorodos, pokalbis ir įmonių skiltis **Standartai**. Įkelkite licencijuotą kopiją, geriausia PDF formatu su pažymimu tekstu. Sistema pašalina kiekviename puslapyje pasikartojančias eilutes (žymenį, autorių teisių eilutę, licencijos ar pardavėjo žymą, puslapio numerį, skyriaus antraštę puslapio viršuje) ir turinį, tada perskaito struktūrą pirmuoju tinkamu būdu:
  1. **Punktų taisyklės.** Numeruoti punktai ir raidėmis žymimi priedai (ISO, IEC, EN, ETSI, LST ir panašiai parengti dokumentai, pvz., NIST SP 800-171) atpažįstami be DI: net ir be raidės sunumeruotos A priedo kontrolės priemonės („5.15“ tampa „A.5.15“), sunumeruotos pastraipos be antraščių tampa atskirais punktais, o sunumeruoti sąrašai punktų viduje skyriais nelaikomi. Jei taip perskaitytame standarte lieka labai ilgas punktas, kuriame yra savaip pažymėtų dalių (pvz., kontrolės priemonių katalogas viename skyriuje), jo vidų perskaito DI modelis.
  2. **DI modelis.** Jei taisyklės struktūros neranda – standartas žymi dalis savais identifikatoriais („AC-2“, „GV.OC-01“, „V2.1“), yra visai nenumeruotas arba numeriai prarasti (DOCX su automatiniu numeravimu) – DI modelis pažymi, kurios teksto eilutės yra antraštės, o sistema iš jų sudaro struktūrą. Modelis teksto nerašo ir nekeičia: kiekviena antraštė ir identifikatorius paimami iš paties dokumento, o tai, ko dokumente nėra, atmetama. Tai naudoja DI modelį ir kainuoja: kelių dešimčių puslapių dokumentas – nuo kelių iki kelių dešimčių centų, kelių šimtų puslapių katalogas – apie pusantro dolerio. Skaitoma vieną kartą kiekvienai redakcijai, sąnaudos nepriskiriamos jokiam naudotojui.
  3. **Puslapiai.** Jei nepavyksta nė vienu būdu (arba DI paslauga tuo metu nepasiekiama), kiekvienas puslapis tampa atskiru vienetu, cituojamu jo numeriu. Standarto puslapyje tada rodoma pastaba, kad jis indeksuotas puslapiais.

  Kuriuo būdu perskaityta redakcija, rodo skilties **Redakcijos** stulpelis **Analizatorius**. Įkėlus atidarykite skiltį **Struktūra** ir peržvelkite, ar dalys atpažintos teisingai. Jei ne, standarto meniu pasirinkite **Skaityti struktūrą kitaip**: tas pats failas apdorojamas iš naujo pasirinktu būdu (automatiškai, tik taisyklėmis, DI modeliu arba puslapiais). Peržiūrėti reikalavimai lieka; pasiūlymai, kurių punktų nebelieka, pašalinami, o reikalavimai išskiriami iš naujo. Labai ilgas punktas, kurio smulkiau suskaidyti nepavyko, padalijamas puslapiais („5 skyrius, 31 psl.“), kad reikalavimas nebūtų cituojamas keliasdešimčia puslapių iš karto.

  Failo perskaityti nepavyks tik tada, kai jame nėra teksto (priežastis parodoma standarto puslapyje):
  - PDF, kuriam atidaryti reikia slaptažodžio, arba PDF su teisių valdymo įskiepiu (pvz., FileOpen) – paprašykite leidėjo kopijos be šios apsaugos. PDF, apsaugotas tik nuo kopijavimo ar redagavimo, perskaitomas;
  - skenuota kopija (paveikslėliai be teksto) – prieš įkeliant ją reikia paversti tekstu (OCR).

  Pataisius ar pakeitus failą, naudokite **Įkelti naują redakciją**: patvirtinti reikalavimai perkeliami į naują redakciją, jei jų punktų nuoroda ir tekstas nepasikeitė. Kai standartas paruoštas, **Išskirti pareigas** jo puslapyje išskiria reikalavimus (atskira DI instrukcija; aiškinamosios dalys, terminai, žodynėliai ir informaciniai priedai praleidžiami); kitu atveju tai padaroma per pirmą analizę. Reikalavimus peržiūrėkite puslapyje **Pareigų peržiūra**. Įkelkite tik tas kopijas, kurias leidžia jūsų organizacijos licencija: standarto tekstas matomas visiems sistemos naudotojams ir siunčiamas DI paslaugai (vektorizavimui, reikalavimų išskyrimui ir, kai reikia, struktūrai perskaityti).
- **Pareigų peržiūra.** Šis puslapis skirtas tik administratoriams. DI iš teisės aktų išskirtas pareigas tvirtinkite, atmeskite, redaguokite arba ištrinkite; filtruokite pagal teisės aktą, būseną, sritį ir reikšmingumą. Pažymėtas eilutes galima patvirtinti, atmesti arba grąžinti į pasiūlytas iš karto. Patvirtintos pareigos naudojamos analizėje ir išlieka naujoje akto redakcijoje, jei cituojamų nuostatų tekstas nepasikeitė. Atmestos pareigos niekada nepatenka į ataskaitas ir nebesiūlomos. Ištrintą pareigą pakartotinis išskyrimas gali pasiūlyti vėl, todėl geriau ją atmesti. Naudotojai pareigas mato tik akto puslapio skiltyje **Pareigos**. **Nuo ko pradėti.** Akto puslapyje **Patikrinti pareigas** paleidžia antrą DI modelį, kuris kiekvieną pareigą palygina su visu ją pagrindžiančių nuostatų tekstu ir pažymi: **Pagrįsta**, **Iš dalies** (pareiga yra, bet netiksliai nurodyta, kam ji skirta, kokia sąlyga ar terminas) arba **Nepagrįsta** (nurodytos nuostatos tokios pareigos nenustato), su pastaba, kas netikslu. Peržiūros puslapyje abejotinos pareigos rodomos pirmos (**Abejotinos pirmiausia**), o filtras **Tikrinimas** atrenka pagal išvadą. Šis modelis nieko netvirtina ir neatmeta – sprendžiate jūs: abejotinas pareigas peržiūrėkite po vieną, pagrįstas galima tvirtinti kartu. Pakeitus pareigos pavadinimą ar tekstą, jos tikrinimo išvada išvaloma. Visų aktų pareigas vienu kartu tikrina komanda `verify_obligations` (žr. operations.md §6).
- **DI instrukcijos.** Pokalbis ir kiekvienas analizės etapas turi redaguojamą instrukciją. Kiekvienas pakeitimas išsaugomas kaip nauja versija su modeliu, temperatūra (samprotaujantys modeliai – GPT-5 ir naujesni – jos nenaudoja), didžiausiu atsakymo ilgiu ir pakeitimo pastaba; versiją galima iš karto aktyvuoti. Skiltyse **Versijos**, **Palyginimas** ir **Bandymas** versijas aktyvuosite, palyginsite ir išbandysite su pavyzdine įvestimi; bandymas kviečia DI modelį, ir jo kaina skaičiuojama į jūsų dienos biudžetą. Kai atnaujinama sistema, nauja numatytoji instrukcija neperrašo jūsų versijos, o pasiūloma šalia („Laukia nauja numatytoji versija“) – ją galite palyginti ir aktyvuoti.
- **MCP serveriai.** Išoriniai įrankių serveriai (pvz., kitas teisės aktų korpusas), kurių įrankius asistentas gali naudoti pokalbyje. **Pridėti serverį**: pavadinimas (2–31 simbolis: mažosios raidės, skaitmenys ir _, pradžioje raidė), aprašymas, adresas, transportas, antraštės (pvz., `Authorization`; išsaugotų reikšmių programa nebeparodo) ir leidžiami įrankiai (tuščia – visi). Naujas serveris sukuriamas išjungtas: spauskite **Tikrinti ryšį** (iki 45 s), tada įjunkite.
  - Serverio adresas turi būti viešo serverio https:// adresas (DNS vardas, standartinis prievadas). Programa atmeta adresą su prievadu, su naudotojo vardu ir slaptažodžiu, IP adresą ir vidinius vardus (konteinerį, localhost, .local, .internal ir pan.).
  - Anksčiau išsaugoto serverio, kurio adresas šios taisyklės neatitinka, įjungti ar tikrinti negalima: bandant jį įjungti, pranešama „Serverio „…“ adresas nebeleidžiamas — pirmiausia jį pataisykite.“ ir nurodoma priežastis. Pirmiausia pataisykite adresą.
  - Serverio adresą turi leisti ir išeinančio srauto taisyklės (žr. `operations.md`); kitaip patikra baigsis ryšio klaida.
- **Naudotojai.** **Naujas naudotojas**: vardas, el. paštas, rolė (administratorius ar naudotojas) ir slaptažodis (ne trumpesnis nei 10 simbolių; perduokite jį naudotojui saugiu kanalu). Redaguojant keičiami vardas, rolė, būsena ir **Dienos DI biudžetas**: numatytasis, neribotas arba individualus (USD per parą pagal UTC). **Keisti slaptažodį** nustato naują slaptažodį ir nutraukia visas to naudotojo sesijas. **Deaktyvuoti** išjungia paskyrą ir nutraukia jos sesijas; paskyra neištrinama. **Ištrinti su visais duomenimis**: laikykite šį mygtuką nuspaustą 2 sekundes (pele, pirštu arba, kai jis pažymėtas, klavišu Tarpas ar Enter) – paskyra iš karto, be papildomo patvirtinimo, ištrinama visam laikui kartu su jos įmonėmis (jų ataskaitomis, licencijomis, standartais ir rolėmis), dokumentais (ir jų failais) bei pokalbiais. Atleidus mygtuką anksčiau, nieko neištrinama; po ištrynimo pranešimas parodo, kiek ko ištrinta. DI sąnaudų ir veiksmų žurnalų įrašai lieka, bet nebesusieti su paskyra, o pokalbių ištraukos iš sąnaudų žurnalo ištrinamos. Kol vienos iš naudotojo įmonių analizė vykdoma, ištrinti negalima. Savos paskyros ištrinti negalite. Savo rolės ir būsenos keisti negalite, o paskutinio aktyvaus administratoriaus negalima nei pažeminti, nei deaktyvuoti.
- **Veiksmų žurnalas.** Kas, kada ir ką pakeitė: prisijungimai (ir nesėkmingi), naudotojai, įmonės, dokumentai, teisės aktai, pareigos, ataskaitos, DI instrukcijos, MCP serveriai ir užduotys. Filtruokite pagal veiksmą, naudotoją ir laiką („Iki (imtinai)“); **Įkelti senesnius** rodo ankstesnius įrašus. IP adresų stulpeliu kol kas pasikliauti negalima: už universiteto tarpinio serverio visi lankytojai gali turėti tą patį adresą.
- **DI sąnaudos.** Administratorius mato visų naudotojų sąnaudas („Visų naudotojų“ arba vieno naudotojo) ir kiekvieno DI iškvietimo įrašą, įskaitant pokalbių ištraukas (žr. 8 skyrių).

## 7. Užduotys, DI sąnaudos ir biudžetas

**Užduotys.** Puslapyje **Užduotys** matysite fonines užduotis: teisės akto įkėlimą, dokumento indeksavimą, atitikties analizę, pareigų išskyrimą, visų šaltinių patikrą, vektorių perskaičiavimą ir sistemos priežiūrą. Naudotojas mato savo užduotis, administratorius – visas. Užduotis galima filtruoti pagal būseną ir rūšį. **Atšaukti užduotį**: eilėje laukianti užduotis atšaukiama iš karto, vykdoma sustoja artimiausiame etape. **Užduoties informacija** rodo užduoties etapus su būsena ir trukme. Prie kiekvieno baigto etapo parašyta, kuri DI instrukcija jį atliko (pvz., „Instrukcija: report.summary v3“), kuris modelis ar modeliai, kiek buvo iškvietimų, žetonų ir kiek tai kainavo; apačioje – visos užduoties DI sąnaudos.

**DI sąnaudos.** Puslapyje **DI sąnaudos** matysite:

- šios dienos biudžetą ir kiek jo išnaudota (biudžetas skaičiuojamas pagal UTC parą ir atsinaujina vidurnaktį UTC, t. y. 2 ar 3 val. Lietuvos laiku);
- pasirinkto laikotarpio kainą, iškvietimų ir žetonų skaičių, dienos grafikus;
- sąnaudas pagal paskirtį (pokalbis, analizės etapas, vektorizavimas, instrukcijos bandymas) ir modelį;
- **Iškvietimų žurnalą**: kiekvieno iškvietimo laiką, paskirtį, modelį, žetonus, kainą, trukmę, rezultatą ir įrankių skaičių. Atvėrę pokalbio iškvietimą, matysite ir pokalbio ištrauką (klausimą ir atsakymą).

**Dienos DI biudžetas.** Kiekvienas naudotojas turi dienos DI biudžetą JAV doleriais. Numatytasis nustatomas diegiant (paprastai 10 USD per parą); administratoriams jis numatytuoju atveju neribotas, o kiekvienam naudotojui administratorius gali nustatyti savą (puslapyje **Naudotojai**).

- Į biudžetą skaičiuojami jūsų pokalbiai, jūsų paleistos analizės, instrukcijų bandymai, citatų tikrinimas su DI modeliu ir jūsų įkeltų dokumentų indeksavimas. Pirmą kartą išskiriamos pareigos analizės metu skaičiuojamos į bendrą biudžetą.
- Kai biudžetas išnaudotas, pokalbis naujų klausimų nebepriima („Jūsų šiandienos DI naudojimo limitas išnaudotas. Bandykite rytoj.“), naujos analizės pradėti negalima, instrukcijų bandymai atmetami, o citatų tikrinimas naudoja žodžių sutapimą. Vykdoma analizė nenutraukiama. Įkelti dokumentai išsaugomi ir perskaitomi, bet jų indeksavimas atidedamas iki biudžeto atnaujinimo (00:05 UTC): iki tol dokumento turinio paieška jo neranda, o puslapyje **Užduotys** prie indeksavimo užduoties parašyta „Laukia dienos DI biudžeto“.
- Be jūsų dienos biudžeto, visa sistema turi bendrą DI paslaugos biudžetą. Jam pasibaigus, DI neveikia niekam („DI paslaugos biudžetas išnaudotas“), kol sistemos prižiūrėtojai jo nepadidina.

## 8. Privatumas: kas mato jūsų duomenis

- **Pokalbiai asmeniniai.** Jūsų pokalbių kiti naudotojai, net administratoriai, pokalbių lange atidaryti negali.
- **Tačiau administratoriai gali skaityti pokalbių ištraukas.** Kiekvienas asistento atsakymas įrašomas į DI iškvietimų žurnalą (puslapis **DI sąnaudos**) su jūsų klausimo ir asistento atsakymo tekstu bei naudotais įrankiais. Tai DI naudojimo auditas: savo įrašus matote jūs, o administratoriai – visų naudotojų įrašus. Įrašai saugomi iki 400 dienų.
- **Pašalintas pokalbis** dingsta iš jūsų sąrašo, bet serveryje lieka archyve, o jo ištraukos lieka iškvietimų žurnale.
- **Įmonės, dokumentai ir ataskaitos** matomi jums ir administratoriams (administratoriai mato visų naudotojų įmones, dokumentus ir ataskaitas). Kiti naudotojai jų nemato.
- **DI sąsaja.** Jūsų žinutės, įkelti dokumentai (indeksavimui, analizei ir tai, ką asistentas perskaito pokalbyje) ir įmonės duomenys siunčiami universiteto DI tinklų sąsajai (ai.knf.vu.lt), per kurią veikia DI modeliai. Neįkelkite duomenų, kurių negalima perduoti šiai sąsajai.

## 9. Dažni klausimai

**Kodėl išvada „neįrodyta“, nors įmonė turi politiką?**
Tikėtina, kad ta politika neįkelta arba ji šios srities neaprašo. Įkelkite dokumentą ir paleiskite analizę iš naujo. Analizė vertina, ką nustato dokumentai; ar tvarka veikia praktikoje, nurodoma pastaba „Praktikoje patikrinkite: …“ – tai patikrinkite patys pagal registrus ir ataskaitas.

**Kodėl ataskaitoje kai kurie teisės aktai nevertinti?**
Ar jie taikomi, priklauso nuo faktų, kurių įmonės profilyje nėra (pvz., ar įmonė naudoja DI sistemas). Tokių aktų pareigų vertinimas duotų šimtus „netaikoma“ ir „neįrodyta“ išvadų, todėl ataskaita vietoj to pateikia klausimus (skiltis **Teisės aktai**). Atsakykite į juos pokalbyje su asistentu arba papildykite įmonės profilį ir paleiskite analizę iš naujo. Jei aktą norite įvertinti bet kuriuo atveju, pasirinkite jį analizės apimtyje.

**Kodėl kritinė pareiga pažymėta „Neįrodyta“, o ne „Neatitinka“?**
Reikšmingumas rodo pareigos svarbą, būsena – ką pavyko nustatyti. „Neįrodyta“ reiškia, kad pateikta medžiaga neleidžia spręsti: trūksta dokumento arba fakto apie įmonę. Pateikite įrodymą ir peržiūrėkite išvadą (mygtukas **Peržiūrėti**) arba paleiskite analizę iš naujo.

**Asistentas cituoja straipsnį, kurio nėra teisės aktų bazėje.**
Toks teiginys pažymimas „(tikrintina)“. Paprašykite administratoriaus pridėti aktą.

**Dokumento būsena „Teksto nėra“.**
Tai dažniausiai skenuotas PDF be teksto sluoksnio: teksto atpažinimo sistema neturi. Įkelkite PDF su tekstu arba DOCX.

**Kodėl negaliu patvirtinti atitikties programos dokumento?**
Pažeista bent viena privaloma jo rūšies taisyklė – dokumento puslapyje parašyta, kuri ir kas ją pažeidžia (pvz., proceso etapas be atskaitingos rolės). Pataisykite projektą, išsaugokite pakeitimus ir tvirtinkite.

**Pakeičiau rizikos įvertinimą, bet balas nepasikeitė.**
Balą ir rizikos lygį skaičiuoja sistema, kai išsaugote pakeitimus; iki tol rodoma, kad balas bus perskaičiuotas.

**Kodėl prie išvados nėra pasekmės?**
Pasekmė rodoma tik spragoms ir tik tada, kai teisės akto sankcijų nuostatos perskaitytos ir apima išvados straipsnį. Jos nėra prie standartų, gairių, techninių standartų (MiCA ir DORA deleguotųjų ir įgyvendinimo reglamentų – sankcijas nustato pagrindinis aktas ir mini savo paties straipsnius) ir įmonės vidaus reikalavimų išvadų, prie ataskaitų, parengtų iki šios galimybės, ir prie aktų, kurie sankcijų patys nenustato, jei jas nustatantis aktas ataskaitoje nevertintas.

**Įkėliau naują dokumentą – kodėl veiksmas neuždarytas?**
Veiksmą uždaro tik vėlesnė patvirtinta ataskaita, radusi jo pareigas įvykdytas. Paleiskite naują analizę ir ją patvirtinkite; iki tol veiksmą galite pažymėti „Įvykdytas – laukia patikros“.

**Atsakymas nutrūko.**
Jei sistema buvo atnaujinama arba atsakymas užtruko ilgiau nei 3 minutes, spauskite **Generuoti atsakymą iš naujo** arba užduokite siauresnį klausimą.

**Baigėsi dienos biudžetas.**
Biudžetas atsinaujina 00:00 UTC. Administratorius gali jį padidinti.
