# 1009, LTD — Physical and Environmental Security Policy

## 1. Definitions

1.1. For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

1.2. If not specified, other terms used in this document have the same meaning as specified in the applicable laws and regulations.

## 2. Context

### Purpose

2.1. The purpose of this Physical and Environmental Security Policy ("Policy") is to ensure safeguards to preserve the availability, authenticity, integrity, and confidentiality of 1009's assets. This Policy is designed in accordance with cyber threat landscape and relevant physical and environmental risks to Company's assets. By applying this Policy, 1009 aims to strengthen operational resilience, and adhere to the industry best practice for physical and environmental security.

2.2. The document is prepared under the principle of proportionality, considering the scale and complexity of the Company's operations, the nature of the activity engaged in, the types of services provided, and the corresponding physical and environmental security risks to 1009's processes and services.

### Scope

2.3. This Policy encompasses both on-premises and off-premises environments where 1009's IT and information assets are managed.

2.4. The Policy extends to all 1009's employees, contractors, and any third-party providers.

## 3. Security of Premises

3.1. 1009 shall primarily operate on a cloud-based infrastructure which shall be compliant with industry leading standards such as NIS2, PCI DSS, NIST, ISO/IEC, SOC and others. Additionally, 1009 shall further implement security measures to protect IT and information assets on and off Company premises, including restricted areas to protect from attacks, accidents, and environmental threats.

3.2. The measures to protect from environmental threats and hazards shall be commensurate with the importance of the premises, data centres, sensitive designated areas, and the criticality of the operations or IT assets located therein.

### Perimeter Security and Access Control

3.3. To prevent physical breaches and safeguard non-public assets from threats such as unauthorized entry, theft, tampering, or environmental hazards 1009 shall define security perimeter around non-public areas.

3.4. Physical access control mechanisms, such as employee and visitor badges, shall be deployed to control and authorize entry to non-public areas. Visitor access shall be logged in a visitor access log that records names, purpose, time, and duration, with oversight by an assigned log owner and accompanying employee. Visitors shall be always accompanied by an authorized employee.

3.5. Physical access control measures are aligned with the access controls outlined in the Access Management and Control Policy. For detailed description on access assignment, monitoring, and revocation, refer to the Access Management and Control Policy.

### Protection from External Threats and Environmental Hazards

3.6. The building's landlord, in collaboration with 1009, shall be responsible for maintaining physical perimeter security measures, including access control logs, CCTV surveillance, fire alarms, fire extinguishers, and conducting regular fire drills per legal requirements. 1009 shall provide physical security specifications to ensure that comprehensive protection measures align with Company's policies and information security requirements.

3.7. Measures shall be in place to protect premises and data centres from physical threats such as fire, flood, earthquake, and explosion. Environmental control systems, including fire suppression, climate regulation, and uninterruptible power supplies (UPS) shall be installed in designated areas to prevent asset damage and ensure uninterrupted IT asset availability.

3.8. Power and telecommunications cabling carrying data shall be protected from interception and damage. These cables are securely housed and monitored to prevent disruptions and unauthorized access.

### Monitoring of Premises

3.9. Surveillance systems shall be in place to monitor non-public areas, with real-time intrusion alarms allowing to detect unauthorized access to Company premises, data centres, and non-public areas where IT and information assets or both reside. Automated mechanisms shall alert system administrator in the event of a potential intrusion, allowing for immediate response and incident management.

3.10. The Company shall outline incident response procedures to effectively respond and secure affected areas in case of an environmental threat or security breach. System administrator shall be promptly informed of all related events to assess the impact on non-public assets and coordinate appropriate response actions. For more details on IT business continuity management please refer to IT Business Continuity Policy and Plans.

## 4. Security of Assets

4.1. To mitigate unauthorized access, environmental threats, and potential tampering 1009 implements control measures to secure IT and information assets both within and outside its premises. The level of control measures for specific IT and information assets are defined and implemented following IT risk assessment.

### Assets on Company Premises

4.2. IT assets, such as endpoint devices, shall be strategically positioned within facilities to reduce exposure to physical and environmental hazards and minimize opportunities for unauthorized access. Devices shall be physically secured with appropriate locking mechanisms where possible, and computer cases shall be locked to prevent tampering or theft of internal components. Standard desktops and laptops shall be equipped with security software to ensure secure access to 1009 assets, with configurations centrally managed for compliance with Company's policies and information security requirements.

4.3. Hard copy documents, when necessary, shall be stored in cabinets in designated areas and locked with a key. Non-public printed materials shall be promptly removed from printers to prevent unauthorized access and ensure information confidentiality. If the material is no longer needed, it shall be securely destroyed and disposed of following established 1009 standards to prevent data breaches.

### Assets off Company Premises

4.4. For off-premises use, IT assets are configured with encryption, multi-factor authentication, and remote wipe capabilities to protect data in case of loss or theft. Hard copy documents and non-public printed material shall not be taken outside of the Company premises, unless required by the business role or authorised by CISO.

4.5. Employees are instructed to secure these devices when unattended, storing them in locked locations when possible, and to avoid exposing devices to high-risk environments. Security configurations are centrally managed to ensure compliance with 1009 policies and information security requirements.

## 5. Maintenance of Assets

5.1. To maintain the availability, authenticity, integrity, and confidentiality of IT assets, information assets, and physical access control devices, 1009 shall enforce appropriate maintenance stages that includes routine review, checks, testing, and monitoring.

5.2. IT assets shall be maintained on a regular basis, including scheduled software updates, hardware inspections, and functionality testing to ensure continued availability and reliability. Backup and restore processes shall also be routinely conducted to test that in the event of data loss or IT asset failure data can be restored promptly. Maintenance activities shall be logged, and only authorized personnel is allowed to perform maintenance.

5.3. IT asset authenticity checks shall be performed routinely to identify any unauthorised or unrevoked rogue IT assets or access points, if any are identified System Administrator shall immediately revokes them and drops them out of Company's network.

5.4. Physical access control devices, such as badge readers shall undergo regular testing and calibration to confirm their functionality, preserving the integrity and reliability of access controls. Maintenance includes checking logs for any discrepancies and ensuring that the devices operate as expected.

## 6. Security of Data

6.1. 1009 shall apply information security policies to ensure the availability, authenticity, integrity, and confidentiality of non-public data throughout Company's assets.

### Availability Ensurance

6.2. Data availability shall be maintained through regular backups of information, with storage infrastructure provided by cloud-based infrastructure. Cloud-based infrastructure enables 1009 to enforce robust Recovery point objective (RPO) and Recovery objective time (RTO) requirements for IT operations. Backups are performed regularly at a predefined backup policy to ensure that non-public data remains accessible and can be restored quickly in case of data loss or IT asset failure.

6.3. For detailed description on backup and restore measures, please refer to the Backup and Restore Policy.

### Authenticity Ensurance

6.4. To ensure the authenticity of data, all access requests and authorizations to IT assets within 1009 shall be logged, creating a complete audit trail. Access rights shall be aligned with each employee's and third-parties business roles and responsibilities, adhering to strict "need-to-know" and "least privilege" principles. Only authorized employees and third-parties are associated with their account credentials, authentication devices, and software to prevent impersonation and unauthorized access.

### Integrity Ensurance

6.6. 1009 shall enforce data protection at all stages — in transit, in use, and at rest — ensuring the integrity of the Company's data. Personalised security credentials are masked upon display and are not stored in plain text. Cryptographic materials are safeguarded from unauthorized disclosure. All cryptographic solutions are approved and regularly reviewed by the CISO to maintain compliance with information security requirements with Company.

### Confidentiality Ensurance

6.8. Access to data and IT assets, including critical within 1009 is governed by the principles of "need-to-know" and "least privilege." To maintain confidentiality employees shall be granted access rights strictly by their business roles, and these rights are regularly reviewed and adjusted to ensure that unnecessary access rights are promptly revoked. Everyone who handles the Company's non-public data shall be required to sign confidentiality agreements.

## 7. Clear Desk Policy

7.1. The Clear desk policy aims to protect non-public information by ensuring documents and materials are not left unattended. Employees shall securely store all non-public documents, devices, and temporary notes when not in use. At the end of each day or when away, materials shall be securely stored, and any unnecessary items should be shredded using 1009's approved disposal methods. Employees shall follow this Policy, report any breaches to CISO or direct manager, and support routine workspace inspections to ensure compliance. Exceptions require prior written approval from direct manager or CISO and must include documentation to justify and mitigate associated risks.

## 8. Clear Screen Policy

8.1. The Clear screen policy shall be designed to protect non-public information displayed on screens from unauthorized access and maintain data confidentiality within 1009, including information processing facilities. Employees shall secure information on screens and devices, particularly in shared or open environments.

8.2. All devices shall be set to automatically lock after 5 minutes of inactivity, with screen-locking functions enabled and unauthorized adjustments prohibited. Employees are required to manually lock screens when stepping away, even briefly, and should use privacy screens in public areas.

8.3. Portable devices shall be set to require authentication to be accessed and stored securely when unattended, following similar screen-lock settings as desktops. Employees responsible for compliance, must report any violations to direct manager or CISO, and are expected to support routine workspace inspections. Exceptions require prior written approval from direct manager or CISO with documentation to justify and mitigate associated risks.

## 9. General Provisions

9.1. The Company, along with designated personnel responsible for overseeing this Policy's implementation, ensure ongoing monitoring to uphold all measures outlined in the Physical and Environmental Security Policy. Regular updates to the Policy or any related process shall be coordinated with CISO. The Policy is reviewed at least annually to integrate evolving regulatory requirements and industry wide standards.