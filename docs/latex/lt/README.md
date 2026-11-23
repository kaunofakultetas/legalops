# Sistemos dokumentacija (LaTeX)

Visa Atitikties asistento dokumentacija knygos pavidalu: ką sistema daro, kaip ji sukurta ir —
išsamiausiai — kiekviena vieta, kurioje kviečiamas kalbos modelis, ko jo klausiama, kaip
tikrinamas jo atsakymas ir kur sprendžia žmogus. Joje aprašoma sistema tokia, kokia ji buvo
įdiegta 2026 m. lapkričio 16 d.

Tai lietuviškasis `docs/latex/en` leidimas: tas pats turinys ir ta pati struktūra, o knyga
renkama taip pat — `docs/buildDocs.sh lt` sukuria `docs/output/lt/documentation.pdf`.

Galutinis PDF failas yra `docs/output/lt/documentation.pdf`.

## Rinkimas

Kompiuteryje reikia tik Docker. `docs/buildDocs.sh` paleidžia LuaLaTeX (per latexmk)
oficialiame TeX Live atvaizde, laikiname konteineryje be tinklo prieigos:

```bash
docs/buildDocs.sh       # abu leidimai
docs/buildDocs.sh lt    # tik šis → docs/output/lt/documentation.pdf
```

Pirmą kartą paleidus atsisiunčiamas `texlive/texlive:latest-full` (apie 6 GB). Šaltiniai
prijungiami tik skaitymui, o iš to, ką rinkimas įrašo, išsaugomas tik PDF.

## Struktūra

| Kelias | Kas jame |
|---|---|
| `main.tex` | Dokumento klasė, skyrių tvarka, aprašomos būsenos data ir autorius |
| `preamble.tex` | Viskas, kas bendra visiems skyriams: šriftai (Source Serif 4, Source Sans 3, Source Code Pro — paties produkto šriftai), prekės ženklo spalvos, tekste naudojamos makrokomandos (`\code`, `\file`, `\route`, `\prompt`, `\model`, `\ui`, `\lt`, `\status`), skydeliai, žymintys, kas ką daro (`aibox`, `codebox`, `humanbox`, `lessonbox`), DI iškvietimo kelio kortelė, pažodiniai blokai, brėžinių stiliai |
| `front/` | Titulinis puslapis ir „Apie šį dokumentą“ (kaip skaityti knygą) |
| `chapters/` | Devyniolika skyrių trijose dalyse: sistemos apžvalga; dirbtinis intelektas sistemoje; sistemos naudojimas ir eksploatavimas |
| `appendices/` | Instrukcijų katalogas, pokalbio įrankiai, teisės aktų katalogas, konfigūracija, terminų žodynėlis |
| `figures/samples/` | Pačios sistemos PDF eksportų puslapiai, sukurti kurso pavyzdinei įmonei |
| `figures/screens/` | Konsolės ekrano nuotraukos, padarytos naudojant imituotus duomenis |

Pirmoji kiekvieno skyriaus failo eilutė yra būsenos komentaras: `% STATUS: reviewed` reiškia, kad
skyrius išverstas iš angliškojo leidimo (`docs/latex/en`) ir vertimą patikrino antras vertėjas
(`translated` — išverstas, dar nepatikrintas). C priedas angliškame leidime generuojamas iš
veikiančios sistemos duomenų bazės; čia yra jo vertimas, todėl atnaujinus anglišką priedą jį reikia
išversti iš naujo.

## Taisyklės visiems, kurie ją redaguoja

- Kodas yra tiesa: kiekvieną knygos teiginį turi būti galima patikrinti repozitorijoje, o
  pavadinimai, konstantos ir maršrutai rašomi tiksliai taip, kaip kode.
- Matavimai yra datuoti stebėjimai, atlikti pavyzdinės įmonės atveju, niekada ne bendri teiginiai.
- Kiekvienas modelio iškvietimas turi kelio kortelę su tomis pačiomis dešimčia eilučių;
  paveiksle modelio iškvietimas žymimas geltonai, kodo patikra — mėlynai, žmogaus sprendimas —
  tamsia rašalo spalva.
- Jokių paslapčių, jokių asmens duomenų, jokių reikšmių iš `.env` ar `docker-compose.yml`.
- Eilutės kodas (`\code`, `\file`, `\model`) išsaugo tarpus ir dvitaškius; literalas su `#`, `%`
  ar riestiniais skliaustais rašomas `\texttt{…}` ekranuojant specialiuosius simbolius įprastu būdu.
- Kiekvienas skydelis su pavadinimu prieš prasidėdamas reikalauja šešių eilučių vietos
  (tai užtikrina kabliukas preambulėje). Skydelio, kurio pirmasis turinys yra kodo blokas,
  negalima perskelti prieš tą kodą, todėl jam rezervuokite vietos visam blokui su
  `\needspace{N\baselineskip}` (11 skyriuje tai padaryta vieną kartą).
