# 1009, LTD — Digital Operational Resilience Testing Policy

## 1. Definitions

1.1. For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

1.2. **"Digital operational resilience testing"** ("DORT") means the programme of tests required by DORA Art. 24, covering the resilience of ICT systems and tools supporting the Company's business functions against potential disruptions.

1.3. **"Threat-led penetration testing"** ("TLPT") has the meaning given in DORA Art. 3(17): a framework that mimics the tactics, techniques and procedures of real-life threat actors perceived as posing a genuine cyber threat, that delivers a controlled, bespoke, intelligence-led red team test of the Company's critical live production systems.

## 2. Context

### Purpose

2.1. This Policy implements the digital operational resilience testing programme required by DORA Articles 24–27. It defines scope, frequency, methodologies, independence requirements and remediation discipline for the full spectrum of resilience tests.

### Scope

2.2. This Policy covers all ICT systems and applications supporting the Company's business operations, with priority focus on those supporting critical or important functions (CIFs).

### Legal and Regulatory Framework

2.3. Primary anchors:

- DORA Art. 24 — General requirements.
- DORA Art. 25 — Testing of ICT tools and systems.
- DORA Art. 26 — Advanced testing of ICT tools, systems and processes based on TLPT.
- DORA Art. 27 — Requirements for testers for the carrying out of TLPT.
- Commission Delegated Regulation (EU) 2024/1774 — RTS on specifying further elements of ICT risk management, including aspects of testing.
- Joint ESAs RTS on TLPT under DORA Art. 26.

## 3. Testing Programme

3.1. The Company operates a risk-based testing programme covering, at minimum, the following categories of tests (DORA Art. 25(1)):

| Category | Description | Minimum frequency |
|---|---|---|
| Vulnerability assessments | Identification of known vulnerabilities in systems and applications | Quarterly |
| Open-source software scans | Identification of vulnerable open-source components | Continuous |
| Network security assessments | Network architecture review and segmentation testing | Annually |
| Gap analyses | Comparison against industry standards (ISO/IEC 27001, NIST CSF) | Annually |
| Physical security reviews | Physical-perimeter testing of premises hosting ICT assets | Annually |
| Questionnaires and scanning software solutions | Targeted assessments | Annually |
| Source code reviews where feasible | Static and dynamic analysis | Per release; mandatory before production deployment of high-risk changes |
| Scenario-based tests | Functional testing of resilience controls under scenarios from the Company's risk register | Annually |
| Compatibility testing | After material change to ICT systems | Per change |
| Performance testing | Load and stress testing of CIF-supporting systems | Annually |
| End-to-end testing | Including resilience of payments and crypto-asset settlement flows | Annually |
| Penetration testing | Authorised simulated attack | Annually for CIFs |

3.2. All testing is planned in an **Annual Testing Plan** prepared by the Information Security Officer, reviewed by the Risk Officer and approved by the management body in its supervisory function.

## 4. Independence

4.1. Tests are carried out by independent parties — internal where the function is functionally and hierarchically independent from the audited area, or external. Conflict-of-interest safeguards apply equally to internal and external testers (DORA Art. 24(5)).

4.2. The testers shall be:

- Of the highest suitability and reputability.
- Possess the relevant technical and organisational capabilities and demonstrated specific expertise.
- Free from any conflict of interest in respect of the function tested.

## 5. Threat-Led Penetration Testing (TLPT)

5.1. The Company is subject to TLPT requirements under DORA Art. 26 to the extent identified by the National Competent Authority based on the Company's significance and risk profile. Where TLPT is required:

- **Frequency:** at minimum every three (3) years (or more frequently as determined by the NCA).
- **Scope:** covers several or all CIFs of the Company and is performed on live production systems supporting such functions.
- **Information gathering:** is intelligence-led, based on threat intelligence specific to the Company.
- **Coordination:** is managed by a dedicated control team, with strict need-to-know access controls and notification to a defined subset of management.

5.2. **Internal testers** may carry out TLPT only where:

- The NCA permits such use.
- The Company is not classified by the NCA as significant for the purpose of TLPT in a way that would require external testers.
- Adequate resources are allocated and conflicts of interest are managed.
- External testers are used at least every three (3) tests.

5.3. **External testers** for TLPT shall satisfy the requirements of DORA Art. 27, including:

- Highest suitability and reputability.
- Certified by an accreditation body in a Member State or adhering to formal codes of conduct or ethical frameworks.
- Provide an independent attestation of risk-management arrangements, including protection of confidential information.
- Be duly covered by relevant professional indemnity insurance.

5.4. Each TLPT exercise concludes with a final report including findings, root-cause analysis, recommendations and a remediation plan. The summary outcome and attestation of completion is shared with the NCA and, where applicable, other competent authorities in accordance with DORA Art. 26(6).

## 6. Test Execution and Safeguards

6.1. All tests are subject to formal authorisation (a "Rules of Engagement" document) defining scope, timing, in-scope systems, exclusions, communication channels, escalation paths, and rollback procedures.

6.2. The control team monitors all test activity in real time and may suspend or terminate a test where evidence of unintended impact on production or on clients emerges.

6.3. Production testing is conducted with controls to prevent unauthorised access to client crypto-assets, client funds or sensitive client data. Test data is segregated and synthetic where possible.

## 7. Findings and Remediation

7.1. All findings are logged in a single Findings Register and classified by severity. Each finding has an owner, a remediation plan and a target closure date.

7.2. Severity-based service levels for remediation:

| Severity | Target closure |
|---|---|
| Critical | 30 days |
| High | 90 days |
| Medium | 180 days |
| Low | Next planned release |

7.3. Findings remaining open beyond their target are escalated monthly to the Risk Officer and quarterly to the management body in its supervisory function.

7.4. The Company tracks repeated findings as a control-effectiveness indicator. Recurring findings trigger a root-cause review of the underlying control and, where appropriate, of the testing methodology itself.

## 8. Reporting

8.1. The Information Security Officer reports to the management body in its supervisory function, at minimum quarterly, on:

- Status of the Annual Testing Plan against the plan.
- Volume and severity of findings.
- Closure rates and ageing of open findings.
- Material outcomes of recent tests, including TLPT where applicable.

8.2. Reports are made available to the National Competent Authority on request.

## 9. Record-Keeping

9.1. The Company retains for at least five (5) years:

- The Annual Testing Plan and all amendments.
- Rules of Engagement, raw evidence, and final reports for each test.
- The Findings Register and full remediation evidence.
- TLPT final reports, summary outcomes and attestations.

## 10. Review

10.1. This Policy is reviewed at least annually and following any major ICT-related incident, any TLPT exercise, or the entry into force of new Level 2 measures under DORA Chapter IV.