# 1009, LTD — Business Continuity Policy

## Definitions

For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

If not specified, other terms used in this document have the same meaning as specified in the applicable laws and regulations.

## Context

### Purpose

The purpose of this Business Continuity Policy ("Policy") is to ensure continuous business operations and resilience against disruptions. By applying this Policy, 1009 aims to strengthen operational resilience, and adhere to the industry best practice for Business Continuity Management (BCM).

The document is prepared under the principle of proportionality, considering the scale and complexity of the Company's operations, the nature of the activity engaged in, the types of services provided, and the corresponding IT and information security risks to 1009's processes and services.

### Scope

Its scope encompasses all aspects of BCM within 1009, including governance, scenario-based planning, testing and third-party dependencies to support the continuity and resilience of business operations.

This Policy extends to all 1009's employees, contractors, and any third-party providers.

### Limitations and Exclusions

Non-critical IT assets that do not directly affect core business operations are excluded from priority recovery but may be restored at a later phase. Personal devices and non-approved applications fall outside the scope of formal BCM arrangements. Temporary or trial IT assets without approved IT BCP may have limited or no coverage.

## IT Business Continuity Management

Policy aligns BCM with overall BCM within 1009, setting Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO) based on the Business Impact Analysis (BIA). This integration prioritizes IT and information assets according to their impact on business operations.

**The objectives of the Policy are to:**

- Ensure the continuity of business operations.
- Safeguard Company's assets and maintain operational resilience.
- Minimize financial, operational, and reputational impact.
- Ensure compliance with legal, regulatory, and contractual requirements.

To achieve its goals, 1009 establishes BCM governance structure, assigns responsibilities, defines escalation procedures and allocates adequate human resources to ensure effective and consistent implementation of BCM within the Company. Governance structure is integrated into the Company's overall BCM system and focuses on IT and information assets required to supporting business operations.

**The BCM governance structure includes the following key roles and responsibilities:**

- **CTO** ensures the deployment and maintenance of IT assets required for business operations continuity. CTO oversees the establishment and execution of IT-specific controls related to IT risk management results and IT Business Continuity and Response Plans (IT BCP). Manages IT recovery processes, including backups, system redundancy, and incident response. Reports IT BCP-related activities and incidents to CISO and CEO when required.
- **CISO** is responsible for establishing and governing the IT BCM, ensuring its alignment with 1009 overall BCM. CISO in collaboration with CTO and CRO, oversees BCM measures, such as system redundancy, backups, and incident response. CISO monitors BCM effectiveness and reports key outcomes to Senior management.
- **CRO** oversee and monitor IT risks associated with IT BCM, including risk identification, evaluation, and mitigation. Ensures alignment of BCM measures with the Company's risk appetite. Conducts BIA and ensures that risk assessment results are reflected in IT BCP. Reports results and adherence to the Policy to the Management Board. Acts as single point of contact for external communication with third-parties and Bank of Lithuania.

For specific details regarding the escalation procedure please refer to the document titled IT Business Continuity and Response Plans.

### IT Business Continuity Planning

The IT BCP at 1009 shall be designed in alignment with Risk Management Policy, BIA and shall be integrated into the Company's overall BCM framework. Following a threat-based risk assessment approach, a range of different severe, but plausible disruption scenarios to which the Company might be exposed to is described. Disruption scenarios outlined in IT BCP are based on the current landscape of threats and on lessons learned from previous occurrences of 1009's business operation disruptions.

Based on these scenarios, 1009 compiles IT BCP which describes the measures to ensure the IT business continuity during these severe disruptions. IT BCP shall address a range of severe disruption scenarios, including cyber-attacks, system failures, power outages, natural disasters, vendor disruptions and other.

In the event of a severe business disruption that necessitates the activation of IT BCP, 1009 prioritizes IT business continuity recovery actions using a risk-based approach. Following this approach the recovery actions outlined in the IT BCP are designed to be proportionate to the potential impact of these severe disruption scenarios, ensuring that the cost and effort of mitigation actions do not exceed the likely damage of the disruption. IT BCP at 1009 are developed, tested, and reviewed to ensure effective restoration of business continuity and incident management.

For specific details regarding the disruption scenarios and recovery objectives please refer to the document IT Business Continuity and Response Plans.

### Business Impact Analysis

As part of the established overall BCM, 1009 shall conduct BIA of its exposures to severe business disruptions. During BIA, the criticality of identified and classified business functions, supporting processes, third-parties, IT and information assets, and their interdependencies are assessed based on the potential financial, operational, and reputational impact, the failure of assets would bring to the 1009 in the event of a severe business disruption. The impact is assessed by means of quantitative and qualitative criteria, using internal and external data and scenario analysis. The greater the potential impact of an asset to the Company, the higher the criticality of this asset in the event of a severe disruption.

During BIA, 1009 shall evaluate the criticality of IT and information assets to the business operations of the Company. Necessary timeframes for Recovery time objective (RTO) and a Recovery point objective (RPO) shall be specified for IT and information assets and further refined during BIA re-assessment, so that 1009 could effectively react to disruptions and 1009 recover business operations within acceptable timeframes. 1009 shall ensure that IT and information assets and relevant control measures are designed and used in full alignment with BIA, in particular with regard to adequately ensuring the redundancy of IT and information assets.

### The Criteria for IT BCP Activation and Deactivation

IT BCP within 1009 shall be activated and deactivated based on predefined criteria to ensure sufficient resource allocation, appropriate and timely response to restore business operations. IT BCP shall be activated when a disruption or incident poses a threat to business operations and the level of the disruption to business operations reaches predefined BCP activation threshold.

1009 shall deactivate IT BCP when IT and information assets required for business continuity are fully restored, operational stability is confirmed to be within acceptable operational level, and it is verified that no further risks persist. Before deactivation, post-incident assessment is done to ensure that all recovery steps and objectives have been met, and that IT and information assets are operational within acceptable operational level.

Continuous monitoring of key performance indicators of business operations supports the decision of both activation and deactivation, ensuring structured and controlled recovery processes. Any discrepancies identified during disruption are analyzed and recommendations for business operational resilience improvements are defined.

### Timeframes Covered by BCM Arrangements

BCM arrangements shall be structured to address the following timeframes:

- **Immediate Response (0–2 hours)** – assess the disruption and activate IT BCP if thresholds of activation may be reached, and initiate stakeholder communication.
- **Short-Term Recovery (2–8 hours)** – Restore IT and information assets within predefined Recovery Time Objectives (RTOs) to minimize business downtime.
- **Medium-Term Recovery (8–24 hours)** – Continue restoring supporting IT assets to ensure near-normal business operations.
- **Long-Term Recovery (24–72 hours)** – Achieve full recovery of all IT assets, including non-critical services, while stabilizing business operations and preventing further disruptions.

BCM timeframes align with the Company's overall BCM strategy, ensuring that recovery of IT and information assets meet RTO and RPO targets to minimize financial, operational, and reputational impact. In cases requiring prolonged recovery, contingency measures shall be detailed in the IT BCP to support critical operations for extended periods (up to 7 days or longer, as needed).

## IT BCP Testing and Review

IT BCPs shall be tested at least on an annual basis and updated based on testing results, current threat intelligence and lessons learned from previous events. Any changes in RTO and RPO and/or changes in business functions, supporting processes, IT or information assets, are considered as a basis for updating IT BCP.

These tests simulate potential disruptions to 1009 business operations and are structured as follows:

- Testing is performed based on scenarios that simulate potential disruptions, including a range of severe but plausible scenarios.
- Where applicable tests include IT services provided by third-party service providers.
- When it is feasible in the scope of business operations, IT BCP testing includes switchover scenarios from primary IT infrastructure to backup systems, redundant capacity, and alternate facilities.
- The testing process is designed to challenge the assumptions of underlying IT BCP, including governance arrangements and crisis communication plans.
- Procedures are set in place to verify the readiness of employees, third-party providers, IT assets to respond effectively to the simulated severe business disruptions.

1009 shall document all testing results. Any deficiencies identified during testing are thoroughly analysed, addressed promptly, and reported to the Management board. This process ensures that any gaps in IT BCP are effectively managed and that improvements are continuously implemented to strengthen operational resilience.

To ensure continuous operational resilience, 1009 shall conduct annual reviews of all IT business continuity arrangements, plans, procedures, and mechanisms. These reviews are distinct from testing and focus on assessing the effectiveness and adequacy of the current BCM framework based on test results, real incident outcomes, and evolving Company's needs.

## Communication

BCM governance defined within 1009 shall enable effective communication of any potential or actual risk-related information inside the Company to stakeholders and to any third-parties, including customers and the Bank of Lithuania. Information flows are designed both ways top-down and bottom-up, as well as horizontally across each functional department or unit. Furthermore 1009 shall ensure that the IT BCP aligns with the Company's crisis communication management.

For more details on crisis communication management, including during the crisis please refer to the document titled IT Business Continuity and Response Plans.

## General Provisions

Company, along with designated personnel responsible for overseeing this Policy's implementation, ensures ongoing monitoring to uphold all measures outlined in the IT Business Continuity and Response Policy. Regular updates to the Policy or any related process are coordinated with CISO. The Policy is reviewed at least annually to integrate evolving regulatory requirements and industry wide standards.