// -----------------------------------------------------------
//  [*] Site acts — the legal corpus as the public site lists it
//
//  The acts the assistant reads, for a visitor who cannot
//  open the corpus page: each by the short name the console
//  calls it, with its name in Lithuanian and in English. The
//  list follows the catalogue the corpus is seeded from
//  (django/compliance/corpus/catalog.yaml) as it stood in
//  November 2026, the acts switched off there left out —
//  change the two together. The console's own corpus page
//  stays the truth: it shows the edition in force and when
//  each act was last checked.
//
//  Split into:
//
//    EU_ACTS          — EU regulations and directives
//    LT_LAWS          — Lithuanian laws
//    SUPERVISOR_ACTS  — acts of the supervisors
//    HEADLINE_ACTS    — the short names the home page shows
// -----------------------------------------------------------







// -----------------------------------------------------------
// EU_ACTS
// -----------------------------------------------------------
//
// The EU acts, read from the Publications Office in their
// newest consolidated Lithuanian version.
//
// Used by:
//   - pages/Sources.jsx — the list
// -----------------------------------------------------------

export const EU_ACTS = [
  { short: 'MiCA', lt: 'Kriptoturto rinkų reglamentas (ES) 2023/1114', en: 'Markets in Crypto-Assets Regulation (EU) 2023/1114' },
  { short: 'DORA', lt: 'Skaitmeninės veiklos atsparumo reglamentas (ES) 2022/2554', en: 'Digital Operational Resilience Act, Regulation (EU) 2022/2554' },
  { short: 'TFR', lt: 'Lėšų ir kriptoturto pervedimų informacijos reglamentas (ES) 2023/1113', en: 'Transfer of Funds Regulation (EU) 2023/1113' },
  { short: 'AMLR', lt: 'Pinigų plovimo prevencijos reglamentas (ES) 2024/1624', en: 'Anti-Money Laundering Regulation (EU) 2024/1624' },
  { short: 'AMLD6', lt: 'Šeštoji pinigų plovimo prevencijos direktyva (ES) 2024/1640', en: 'Sixth Anti-Money Laundering Directive (EU) 2024/1640' },
  { short: 'AMLAR', lt: 'Kovos su pinigų plovimu institucijos reglamentas (ES) 2024/1620', en: 'Anti-Money Laundering Authority Regulation (EU) 2024/1620' },
  { short: 'PSD2', lt: 'Mokėjimo paslaugų direktyva (ES) 2015/2366', en: 'Payment Services Directive (EU) 2015/2366' },
  { short: 'EMD2', lt: 'Elektroninių pinigų direktyva 2009/110/EB', en: 'Electronic Money Directive 2009/110/EC' },
  { short: 'GDPR', lt: 'Bendrasis duomenų apsaugos reglamentas (ES) 2016/679', en: 'General Data Protection Regulation (EU) 2016/679' },
  { short: 'AI Act', lt: 'Dirbtinio intelekto aktas, reglamentas (ES) 2024/1689', en: 'Artificial Intelligence Act, Regulation (EU) 2024/1689' },
  { short: 'NIS2', lt: 'Kibernetinio saugumo direktyva (ES) 2022/2555', en: 'NIS 2 Directive (EU) 2022/2555' },
  { short: 'CRA', lt: 'Kibernetinio atsparumo aktas, reglamentas (ES) 2024/2847', en: 'Cyber Resilience Act, Regulation (EU) 2024/2847' },
  { short: 'ECSPR', lt: 'Sutelktinio finansavimo paslaugų teikėjų reglamentas (ES) 2020/1503', en: 'European Crowdfunding Service Providers Regulation (EU) 2020/1503' },
  { short: 'MAR', lt: 'Piktnaudžiavimo rinka reglamentas (ES) Nr. 596/2014', en: 'Market Abuse Regulation (EU) No 596/2014' },
  { short: 'Whistleblowing Directive', lt: 'Pranešėjų apsaugos direktyva (ES) 2019/1937', en: 'Whistleblower Protection Directive (EU) 2019/1937' },
  { short: 'CCD2', lt: 'Vartojimo kredito direktyva (ES) 2023/2225', en: 'Consumer Credit Directive (EU) 2023/2225' },
  { short: 'eIDAS 2', lt: 'Elektroninės atpažinties ir patikimumo užtikrinimo paslaugų reglamentas (ES) Nr. 910/2014', en: 'Electronic identification and trust services Regulation (EU) No 910/2014' },
  { short: 'DSA', lt: 'Skaitmeninių paslaugų aktas, reglamentas (ES) 2022/2065', en: 'Digital Services Act, Regulation (EU) 2022/2065' },
];







// -----------------------------------------------------------
// LT_LAWS
// -----------------------------------------------------------
//
// The laws of the Republic of Lithuania, read from e-TAR in
// the edition valid on the day.
//
// Used by:
//   - pages/Sources.jsx — the list
// -----------------------------------------------------------

export const LT_LAWS = [
  { short: 'FĮĮ', lt: 'Finansų įstaigų įstatymas', en: 'Law on Financial Institutions' },
  { short: 'BĮ', lt: 'Bankų įstatymas', en: 'Law on Banks' },
  { short: 'MĮĮ', lt: 'Mokėjimo įstaigų įstatymas', en: 'Law on Payment Institutions' },
  { short: 'EPEPĮĮ', lt: 'Elektroninių pinigų ir elektroninių pinigų įstaigų įstatymas', en: 'Law on Electronic Money and Electronic Money Institutions' },
  { short: 'MĮ', lt: 'Mokėjimų įstatymas', en: 'Law on Payments' },
  { short: 'VKĮ', lt: 'Vartojimo kredito įstatymas', en: 'Law on Consumer Credit' },
  { short: 'NTSKĮ', lt: 'Su nekilnojamuoju turtu susijusio kredito įstatymas', en: 'Law on Credit Relating to Immovable Property' },
  { short: 'PPTFPĮ', lt: 'Pinigų plovimo ir teroristų finansavimo prevencijos įstatymas', en: 'Law on the Prevention of Money Laundering and Terrorist Financing' },
  { short: 'LBĮ', lt: 'Lietuvos banko įstatymas', en: 'Law on the Bank of Lithuania' },
  { short: 'KUĮ', lt: 'Kredito unijų įstatymas', en: 'Law on Credit Unions' },
  { short: 'PAĮ', lt: 'Pranešėjų apsaugos įstatymas', en: 'Law on the Protection of Whistleblowers' },
  { short: 'ADTAĮ', lt: 'Asmens duomenų teisinės apsaugos įstatymas', en: 'Law on Legal Protection of Personal Data' },
  { short: 'KSĮ', lt: 'Kibernetinio saugumo įstatymas', en: 'Law on Cyber Security' },
  { short: 'KRĮ', lt: 'Kriptoturto rinkų įstatymas', en: 'Law on Markets in Crypto-Assets' },
];







// -----------------------------------------------------------
// SUPERVISOR_ACTS
// -----------------------------------------------------------
//
// What the supervisors themselves have issued: resolutions
// of the Board of the Bank of Lithuania, its guidelines on
// the compliance function, and the order of the Financial
// Crime Investigation Service on identifying a customer
// remotely.
//
// Used by:
//   - pages/Sources.jsx — the list
// -----------------------------------------------------------

export const SUPERVISOR_ACTS = [
  { short: 'LB 03-126', lt: 'Lietuvos banko valdybos nutarimas dėl Baudų apskaičiavimo aprašo', en: 'Bank of Lithuania Board resolution on the Description of the Calculation of Fines' },
  { short: 'LB 03-175', lt: 'Lietuvos banko valdybos nutarimas dėl teisės akto pažeidimo pripažinimo mažareikšmiu', en: 'Bank of Lithuania Board resolution on recognising an infringement of a legal act as minor' },
  { short: 'LB gairės', lt: 'Lietuvos banko atitikties funkcijos gairės (2022)', en: 'Bank of Lithuania guidelines on the compliance function (2022)' },
  { short: 'FNTT V-314', lt: 'FNTT direktoriaus įsakymas dėl techninių reikalavimų kliento tapatybės nustatymui nuotoliniu būdu', en: 'FCIS Director\'s order on the technical requirements for remote customer identification' },
];







// -----------------------------------------------------------
// HEADLINE_ACTS
// -----------------------------------------------------------
//
// The short names the home page sets under "the texts come
// from their official sources": the acts a financial
// institution asks about first, EU and Lithuanian mixed.
//
// Used by:
//   - pages/Home.jsx — the sources band
// -----------------------------------------------------------

export const HEADLINE_ACTS = ['MiCA', 'DORA', 'TFR', 'AMLR', 'GDPR', 'PSD2', 'EMD2', 'AI Act', 'NIS2', 'MAR', 'PPTFPĮ', 'KRĮ', 'FĮĮ', 'MĮĮ', 'EPEPĮĮ', 'PAĮ', 'ADTAĮ'];
