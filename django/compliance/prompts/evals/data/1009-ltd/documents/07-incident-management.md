# 1009, LTD — IT Related Incident Management Policy

## 1. Definitions

For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

If not specified, other terms used in this document have the same meaning as specified in the applicable laws and regulations.

## 2. Context

### Purpose

The purpose of this IT Related Incident Management Policy ("Policy") is to ensure the timely detection, effective management, and proper resolution of incidents and anomalous activities that may impact 1009 operations. By applying this Policy, 1009 aims to minimize potential disruptions, safeguard IT and information assets, and maintain operational integrity in alignment with industry best practices for incident response and management.

The document is prepared under the principle of proportionality, considering the scale and complexity of the Company's operations, the nature of the activity engaged in, the types of services provided, and the corresponding IT and information security risks to 1009's processes and services.

### Scope

Its scope encompasses all aspects of IT related incidents or anomalous activities management within 1009. Policy applies to all IT and information assets within 1009, including employees, contractors, and any third-party providers.

## 3. Governance

This Policy defines roles and responsibilities for detecting and responding to IT related incidents and anomalous activities ("incidents"). All roles and responsibilities related to incident detection, response, and recovery are outlined to ensure an effective and coordinated approach to incident management.

CTO shall form the incident response team within 1009, that shall consist of Incident manager and individuals working within 1009 and with expertise in various aspects of IT and information security. The incident response team shall be formed dynamically, depending on the incident type and severity, ensuring that relevant expertise is allocated to address the issue effectively. Team shall operate under the guidance of CTO.

An incident response team within 1009 is responsible for effective incident detection, response, and recovery, as well as maintaining internal and external communication lines between employees, Senior management and any third-party service providers involved in IT assets and information security, such as those responsible for threat detection, vulnerability management, and the monitoring of anomalous activities.

An incident response team is reachable for anyone within 1009 who discovers or suspects that an incident involving the Company has occurred. Incident response team members, depending on the magnitude of the incident and availability of personnel, will then appropriately handle the incident. Incident response team analyses the underlying incident data, determines the impact of the incident, and acts appropriately to limit the damage and restore business operations to an acceptable operational level.

CTO with the assistance of CISO oversee the incident management process. CTO has following responsibilities assigned, including:

- Acting as a liaison with CISO and CEO, technical teams, and third-parties.
- Monitoring IT operations and activities of the incident response team.
- Minimizing damage and defusing crisis situations.
- Preparing post-incident reports to be presented to the Bank of Lithuania.
- Ensuring that there is necessary personnel, resources, and skills allocated to incident response team.

CISO establishes the principles for this Policy and is ultimately responsible for:

- Ensuring that the Company's IT related incident and anomalous activity management framework operates adequately and efficiently.
- Coordinating incident response among CTO, CEO and other third-parties.
- Reporting to the Bank of Lithuania, other authorities or third-parties.

CTO is ultimately responsible for ensuring that incident management activities are performed, while CISO ensures that the activities are in line and follows outlined Company's information security policies and business continuity plans. CEO is ultimately responsible for the decision making and overall control of incident management within 1009.

## 4. Incident Management Framework

The incident management framework within 1009 is designed to plan, detect, manage, and notify IT related incidents and anomalous activity in a consistent, coordinated and integrated manner. High-level steps of the incident management framework within the Company are the following:

- **Plan.** Assign responsibilities and develop documentation for all procedures and measures necessary to detect and handle an incident.
- **Detect.** Monitor 1009 IT and information assets, including the behaviour of user activities and analyse intelligence to understand if an incident has occurred.
- **Respond and Recover.** Activate the incident response plan to deal with an incident.
- **Update.** Understand which portions of the incident response plan have been effective or not and update the plan accordingly.

Tools at 1009 shall be in place to identify and generate alerts of anomalous activities and behaviours within business activities, including IT and information assets supporting critical functions. These tools include automated alerts based on predefined rules to detect anomalies that affect the completeness and integrity of data sources or log collection.

Information on all incidents and anomalous activities are recorded, registered, analysed, and evaluated both automatically and manually to facilitate effective incident management. Alerts related to critical or important functions shall be prioritized to enable timely resolution, both during and outside working hours.

### Plan

The incident response plan within 1009 shall outline step-by-step actions to manage IT-related incidents effectively. It shall be accessible even if IT assets fail, with copies stored on external systems and in print. The plan shall outline roles and responsibilities within incident response team, including an Incident manager and external support contacts.

The plan through iterative updates shall be based on experience and shall be regularly tested via tabletop exercises. Reporting procedures for potential incident related events shall be documented separately, introduced in security awareness training, and shall be made easily accessible through internal channels. Regulatory requirements and Company specific needs shall guide plan placement and structure.

The Company shall establish appropriate procedures and processes to ensure a consistent and integrated monitoring, handling and follow-up of IT-related incidents, to ensure that root causes are identified, documented and addressed in order to prevent the occurrence of such incidents in the future.

### Detect

1009 shall devote sufficient resources and capabilities to monitor user activity, the occurrence of IT anomalies and IT-related incidents, in particular cyber-attacks. Company shall establish mechanisms and multiple detection methods to promptly detect anomalous activities, including IT network performance issues and IT related incidents. These mechanisms enable 1009 to collect, monitor, and analyse various internal and external factors, including logs, inputs from business and IT functions, anti-malware tools like extended detection and response (XDR), employee security awareness training and user-reported issues.

Logs shall provide insights into potential incidents and shall require regular monitoring and analysis. Anti-malware solutions are designed to identify and flag malicious activities, while trained employees shall serve as a layer of defence by spotting and reporting suspicious incidents. System Administrator shall actively monitor these events and shall investigate promptly to confirm and address any potential incidents.

1009 shall put in place capabilities to gather information on vulnerabilities and cyber threats, IT-related incidents, in particular cyber-attacks, and analyse the impact they are likely to have on their digital operational resilience. Potential internal and external cyber threats shall be monitored by considering common threat actor scenarios and intelligence-based activities. Notifications from third-party IT service providers are incorporated to identify incidents that may affect 1009.

### Response and Recovery

The detection mechanisms employed within 1009 shall have enabled multiple layers of control, including defined alert thresholds and criteria to trigger and initiate IT-related incident response processes, including automatic alert mechanisms for the incident response team. The Company shall establish IT-related incident response procedures to mitigate impacts and ensure that services become operational and secure in a timely manner.

When an incident is reported or detected within 1009, the incident response plan is activated to manage the response and initiate recovery. The incident response team, comprising internal and external stakeholders shall execute the plan to mitigate the incident and restore operations.

The Incident manager, designated in the response plan shall oversee the process, ensuring adherence to standard operation procedures and effective communication of business impacts to Senior management. The incident manager shall be responsible for confirming the resolution of the incident.

Upon identifying a potential incident affecting 1009's services, an immediate notification shall be made to the designated incident response team to initiate an incident assessment. This initial notification is made via internal communication channels to ensure timely action, and in parallel it shall subsequently be logged using the incident management system. The criticality according to the affected services shall be considered during the assessment, the criticality determination shall be performed in line with levels established during Business Impact Assessment (BIA).

The designated incident response team member is responsible for conducting an initial assessment upon receiving notification. If the assessment determines that business operations may be disrupted beyond acceptable operational stability levels the CTO must be informed promptly. A further assessment will then be conducted to classify the incident as either "major" or "non-major" based on defined thresholds. Incidents classified as non-major remain under the monitoring and resolution responsibility of the designated incident response team member and as needed, CTO.

Recovery efforts focus on restoring services with all affected underlying IT and information assets in a timely and efficient manner. The recovery efforts shall include mitigating attack vectors, patching vulnerabilities, reverting to previous code builds or restoring from backup.

### Update

The update phase shall focus on improving the incident response plan and processes based on lessons learned from incidents, tabletop exercises, and regular reviews. Feedback from those involved in recent responses shall be analysed to identify areas for improvement. Changes to the incident response plan and standard operating procedure shall be documented, communicated, and incorporated into employee training on information security.

Data collected during incident response shall be handled in accordance with the data classification requirements within 1009, ensuring proper management. If applicable, data shall be documented in the custodial chain of evidence to maintain accountability.

## 5. Indicators of Compromise

1009 shall establish the criteria for early warning indicators triggering incident detection and response processes. These criteria include indications of potential malicious activity or compromise ("IoC") of IT systems or networks, detection of data loss affecting the availability, authenticity, integrity, or confidentiality of data, adverse impacts on the Company's transactions and operations, and unavailability of IT systems or networks.

1009 shall define, monitor and regularly update the prevailing threat landscape. The main categories defined by 1009 include:

- Network traffic anomalies, including IT systems' and network unavailability.
- Data losses detected in relation to the availability, authenticity, integrity, and confidentiality of data.
- Adverse impact detected on Company's transactions and operations.
- Indications that malicious activity may have been carried out in an IT system or network, or that such IT system or network may have been compromised:
- Unusual sign-in attempts.
- Privilege account irregularities.
- Changes to systems configurations.
- Unexpected software installations or updates.
- Numerous requests for the same file.
- Unusual Domain Name Systems (DNS) requests.

1009 shall implement necessary tools for IoC monitoring, including event logging, extended detection and response (XDR), and security information and event management (SIEM) solutions. As part of this continuous monitoring, 1009 shall implement measures for detecting and reporting physical or logical intrusion as well as breaches of confidentiality, integrity and availability of the information assets.

During an incident management, 1009 shall identify and triage the threat, as well as mitigate the damage. After recovery, it shall be evaluated by 1009 to better understand what happened, so that the security would be strengthened, and the risk of similar incidents be reduced.

## 6. Classification of Incidents

1009 shall establish procedures to identify, track, log, categorise and classify IT-related incidents according to their priority and severity and according to the criticality of the services impacted.

The Company shall classify and determine the materiality of incidents based on defined criteria, including the number of customers affected, downtime, geographical spread, economic impact, criticality of services affected and potential data loss. Company shall classify cyber threats as significant based on the criticality of the services at risk, including the 1009's transactions and operations, number and/or relevance of clients or financial counterparts targeted and the geographical spread of the areas at risk.

IT incidents can be classified as major, or non-major. Classification shall be assigned by evaluating materiality within defined criteria. The materiality of incidents shall be determined based on the following criteria:

- The number and/or relevance of customers or financial counterparts affected and, where applicable, the amount or number of transactions affected by the IT related incident, and whether the IT related incident has caused reputational impact.
- The duration of the IT related incident, including the service downtime.
- The geographical spread with regard to the areas affected by the IT related incident, particularly if it affects more than two European Union Member States.
- The data losses that the IT related incident entails, in relation to availability, authenticity, integrity or confidentiality of data.
- The criticality of the services affected, including the financial entity's transactions and operations.
- The economic impact, in particular direct and indirect costs and losses, of the IT related incident in both absolute and relative terms.

### Affected Customers, Financial Counterparts and Transactions

The number of customers affected by the incident shall include the number of all affected customers, whether natural or legal persons, that are or were unable to make use of the service provided by 1009 during the incident or that were adversely impacted by the incident.

### Reputational Impact

For the purposes of determining the reputational impact of the incident 1009 shall consider that a reputational impact has occurred where at least one of the following criteria is met:

- The incident has been reflected in the media.
- The incident has resulted in repetitive complaints from different customers or financial counterparts on client-facing services or critical business relationships.
- The Company will not be able to or is likely not to be able to meet regulatory requirements as a result of the incident.
- The Company will or is likely to lose customers or financial counterparts with a material impact on its business as a result of the incident.

### Duration and Service Downtime

1009 shall measure the duration of an incident from the moment the incident occurs until the moment when it is resolved. The Company shall measure the service downtime of an incident from the moment the service is fully or partially unavailable to customers, financial counterparts or other internal or external users to the moment when regular activities or operations have been restored.

### Geographical Spread

For the purpose of determining the geographical spread with regard to the areas affected by the incident 1009 shall assess whether the incident has or had an impact in other Member State, and in particular the significance of the impact in relation to customers and financial counterparts in other Member States, or financial market infrastructures or third-party providers.

### Data Losses

1009 for the purpose of determining the data losses that the incident entails shall take into account the availability, authenticity, integrity, and confidentiality of data.

### Criticality of Services Affected

1009 for the purpose of determining the criticality of the services affected shall assess whether the incident:

- Affects or has affected IT assets that support critical or important functions of the Company.
- Affects or has affected financial services provided by the Company that require authorisation, registration or that are supervised by competent authorities.
- Constitutes or has constituted a successful, malicious and unauthorised access to the IT assets of the Company.

### Economic Impact

1009 for the purpose of determining the economic impact of the incident Company shall take into account direct and indirect costs and losses including: expropriated funds or financial assets, costs for replacement or relocation of software/hardware, employee costs, non-compliance fees, customer compensation, forgone revenues, communication costs, and advisory costs.

## 7. Major Incidents

An incident within 1009 shall be considered a major incident where it has affected critical services and where either the materiality threshold is met, or two or more of the other materiality thresholds are met.

Recurring incidents that individually are not considered a major incident shall be considered as one major incident where they meet all of the following conditions:

- They have occurred at least twice within 6 months.
- They have the same apparent root cause.
- They collectively fulfil the criteria for being considered a major incident.

1009 shall assess the existence of recurring incidents on a monthly basis.

1009 shall put in place post IT-related incident reviews after a major IT-related incident disrupts its core activities, analysing the causes of disruption and identifying required improvements to the IT operations or within the Business Continuity Policy.

### Materiality Thresholds for Determining Major Incidents

The materiality threshold for the criterion 'clients, financial counterparts and transactions' is met where any of the following conditions are fulfilled:

- The number of affected clients is higher than 10% of all clients using the affected service.
- The number of affected clients using the affected service is higher than 100,000.
- The number of affected financial counterparts is higher than 30% of all financial counterparts.
- The number of affected transactions is higher than 10% of the daily average.
- The amount of affected transactions is higher than 10% of the daily average value.

The materiality threshold for 'duration and service downtime' is met where:

- The duration of the incident is longer than 24 hours.
- The service downtime is longer than 2 hours for IT services that support critical or important functions.

The materiality threshold for 'geographical spread' is met where the incident has an impact in 2 or more Member States.

## 8. Disruption Scenarios

Incidents may lead to disruption scenarios that impact 1009's activities and IT and information assets. The disruption scenarios below are identified as having a significant potential impact on 1009's operations or critical functions:

- Communication services malfunctions or outage.
- Political and social instability.
- Impact of climate change and environmental degradation related events, natural disasters, pandemics, and physical attacks, including intrusions and terrorist attacks.
- The non-availability of a critical number of staff.
- Partial or total failure of premises, including office and business premises, and data centres.
- Switchovers between the primary IT infrastructure and the redundant capacity, backups, and redundant facilities.
- Power outage.
- Software outage.
- Hardware failure.
- Cyber-attacks, data compromise, DoS attacks, malicious code, unauthorized access, including insider attacks.
- Loss of data.
- Service of IT service provider is unacceptable or unavailable.
- Unlawful actions of employees or other procedural breaches.

1009 shall have an incident response team in place to efficiently handle disruptions on Company's business operation and security incidents. The team shall operate 24/7 and assigned members shall be trained to secure all IT and information assets within the Company.

## 9. Post-Incident Analysis and Data Retention

1009 shall establish and implement mechanisms to analyse significant or recurring threats, and patterns in the number and occurrence of the incidents. The information collected is used to facilitate the identification and investigation of anomalous activities that have been detected in the provision of services.

All incidents and anomalous activities shall be registered in 1009's operational risk historical data logging system, with date and time of the incident or activity, as well as date and time of the detection being recorded.

All evidence relating to incidents are secured to prevent unauthorised modification or deletion and retained for a period required by the criticality of the affected business functions, supporting processes and IT and information assets.

## 10. Communication and Reporting

A communication strategy and plans for IT-related incidents shall be implemented within 1009 to include procedures for disclosures and ensure accurate and transparent communication with internal and external stakeholders, including media and customers. CISO shall be tasked with implementing the communication strategy for IT-related incidents and fulfil the public and media function for that purpose.

### Internal Reporting

In all cases, regardless of the incident's classification the details of the incident shall be recorded in the Incident Management System where the incident was initially logged for tracking and documentation purposes.

Once the incident is completely resolved and eradicated a post-mortem activity shall be started by the incident response team with a summary of the incident, timeline, lessons learned, and recommendations to further prevent it from re-occurring.

### External Reporting

Where a major IT related incident occurs and has an impact on the Company's interests of customers, 1009 shall, without undue delay inform customers about the major IT related incident and about the measures that have been taken to mitigate the adverse effects of such incident. In the event of a significant cyber threat where customers can take protective measures to mitigate potential impacts, the Company shall promptly inform them of the recommended actions.

CTO is accountable for ensuring that the report is prepared to be presented to any external party with required details about the incident. In the absence of CTO, CISO or CEO assumes responsibility for filing the report to ensure continuity.

Affected and potentially affected customers shall be respectively informed via direct email communication and 1009's public status page, as well as social media if applicable. Incidents are also reported to the Bank of Lithuania and other authorities whenever required following the required time to notify.

1009 may voluntarily notify the Bank of Lithuania, National Cyber Security Centre and other relevant authorities of identified significant cyber threat when the threat is deemed to pose a risk to the financial system, service users, or customers.

### Content of the Voluntary Notification

- General information about the reporting entity.
- Date and time of detection of the significant cyber threat.
- Description of the significant cyber threat.
- Information about the potential impact of the cyber threat on 1009, its customers and/or financial counterparts.
- The classification criteria that would have triggered a major incident report, if the cyber threat had materialised.
- Information about the status of the cyber threat and any changes in the threat activity.
- Description of the actions taken by 1009 to prevent the materialisation of the significant cyber threats.
- Information about notification of the cyber threat to other financial entities or authorities.
- Information on indicators of compromise, where applicable.
- Other relevant information, where available.

### Information in Initial Notification

1009 shall provide at least the following information: incident reference code, date and time of detection and classification, description of the incident, classification criteria, Members States impacted, how the incident was discovered, origin of the incident, whether a business continuity plan has been activated, and reclassification status.

### Information in Intermediate Report

Incident reference code, date and time of occurrence and restoration, classification criteria, type of incident, threats and techniques used, affected functional areas and business processes, affected infrastructure components, impact on financial interest of clients, reporting to other authorities, temporary actions/measures taken, and indicators of compromise.

### Information in Final Report

Root causes of the incident, dates and times of resolution, information on the incident resolution, direct and indirect costs and losses, financial recoveries, and recurring incidents information.

## 11. General Provisions

Company, along with designated personnel responsible for overseeing this Policy's implementation, ensures ongoing monitoring to uphold all measures outlined in the IT related Incident Management Policy. Regular updates to the Policy or any related process are coordinated with CISO. The Policy is reviewed at least annually to integrate evolving regulatory requirements and industry wide standards.