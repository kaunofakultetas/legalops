# 1009, LTD — Operations Management Policy

## 1. Definitions

1.1. For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

1.2. If not specified, other terms used in this document have the same meaning as specified in the applicable laws and regulations.

## 2. Context

### Purpose

2.1. The purpose of this IT Operations Policy ("Policy") is to ensure the effective management, monitoring, control, and restoration of IT assets, safeguarding them against disruptions and vulnerabilities. By applying this Policy, 1009 aims to strengthen operational resilience, and adhere to the industry best practices for IT operations.

2.2. The document is prepared under the principle of proportionality, considering the scale and complexity of the Company's operations, the nature of the activity engaged in, the types of services provided, and the corresponding IT operation risks to 1009's processes and services.

### Scope

2.3. Its scope encompasses all aspects of IT operations, including the installation, maintenance, configuration, monitoring, and recovery of information and IT assets.

2.4. The Policy extends to all 1009's employees, contractors, and any third-party providers.

## 3. IT Operations Management

3.1. Company shall outline IT asset management measures required to ensure operational continuity, mitigating risks, and supporting the Company's objectives through reliable and resilient technology operations.

### IT Asset Lifecycle

#### Installation

3.2. IT assets within 1009 are installed in alignment with industry best practices and information security requirements in mind, with the authenticity of hardware and software verified through checks and reviews done with vendors. Software is downloaded only from reliable sources and official vendor sites, while hardware is bought from reliable re-sellers and official vendor stores. Only authorized software and hardware is installed on IT infrastructure and assets.

#### Maintenance

3.3. 1009 shall maintain a register of all software and hardware installations and their interdependencies within IT infrastructure. Each software / hardware has its owner and software / firmware updates are done regularly, including security patch releases and version upgrades.

3.4. Regular maintenance and updates ensure that IT assets remain secure and perform optimally. Security patches and updates are applied promptly after testing to prevent any disruptions with new version release.

3.5. Security Information and Event Management (SIEM) solutions employed enables early issue detection, while routine inspections extend IT asset lifespan and prevent failures. All maintenance activities are documented and approved.

#### Configuration

3.6. 1009 shall maintain consistency and compliance through standardised baseline settings and configuration templates. Access to settings and templates to authorized CTO. Company shall perform regular, at least annual audits to verify adherence to the baseline standards and identify unauthorized changes. All modifications of settings and templates shall be documented to ensure accountability and traceability.

#### Deinstallation

3.7. 1009 shall prioritise information security during the deinstallation of IT assets to prevent data leak, breaches and eliminate vulnerabilities. Non-public data is permanently erased following NIST SP 800-88 guidelines, access credentials to removed IT assets are revoked, documentation ensuring traceability is prepared. After deinstallation IT assets are verified as removed from the network, and the IT asset inventory is updated accordingly.

#### Legacy Assets

3.8. Legacy IT assets are identified and documented in an IT asset inventory detailing their functions, dependencies, and security vulnerabilities. Information security controls are established to mitigate associated risks, including isolating these systems from critical IT assets and applying necessary security patches. Legacy IT assets are included in regular risk and information security assessments to ensure legacy systems do not compromise overall information security within Company.

### IT Asset Security

3.9. The Company shall implement access control measures for each IT asset, tailored to its criticality and risk profile. Access to non-public information and critical IT assets to authorized personnel based on the principle of least privilege, minimizing exposure to unauthorized access. Private IT assets are held to the same information security standards as company-owned assets. More information on the measures of access control is outlined in the Company's Access Control Policy.

3.10. IT assets, whether private or company-owned, are safeguarded with additional security measures, that include:

- The deployment of endpoint management solutions that enable remote management, monitoring, and secure data wiping in case of loss or theft.
- Security configurations within the endpoint are locked down to prevent modification, removal, or circumvention by unauthorized personnel.
- The use of removable storage devices is tightly controlled and limited to scenarios within the Company's defined risk tolerance.

3.11. IT asset security is further enhanced using additional security measures, including antivirus and anti-malware solutions, intrusion detection and prevention systems (IDS/IPS), and application whitelisting. Company mandates that only authorized IT assets are used for data transfer and storage, ensuring controlled data flow within the Company.

3.12. Usage of the third-party libraries, including open-source libraries, used by IT services supporting critical and important functions are tracked. Additionally, 1009 shall monitor IT services developed internally or customized by third-party providers to ensure they remain secure and up to date.

3.13. Data leak prevention (DLP) measures are implemented to safeguard endpoint devices from data leakage. These measures include full-disk encryption, file-level encryption, and role-based access controls, ensuring that non-public data remains secure during storage, transmission, and use.

### Securing Remote Connection and Private Devices

3.14. Security measures ensure that remote working and the use of private IT assets such as laptops do not compromise IT security. Whenever working remotely, employees must only use a corporate-owned device. If there is a justified business need to use an employee-owned device to access Company's information and IT assets, it must adhere to the same information security standards as Company's owned IT assets.

3.15. Whenever an employee needs to work remotely consistently, VPN access to the internal systems is mandatory and it can only be provided via a request to CTO.

### Information Security Measures on Third-parties

3.16. For IT assets managed by third-party service providers, the company shall enforce information security measures to maintain a secure operational environment and minimize risks. These measures include:

- **Implementing Vendor-Recommended Configurations.** All IT assets provided by Third-parties are configured according to the vendor-recommended security settings and hardening guidelines.
- **Defining Roles and Responsibilities.** Clear allocation of information security roles and responsibilities between the Company and third-party service providers is documented in contracts and service-level agreements (SLAs).
- **Competency Assurance.** The Third-party service providers maintain sufficient expertise and resources to manage and secure the IT assets they provide.
- **Risk Mitigation Through Best Practices.** The Company shall apply technical and organizational measures to address risks associated with Third-party infrastructure. These measures are aligned with industry-leading standards and are more briefly outlined in IT Third-Party Service Policy and Information Security Policy.

3.17. Third-party providers are mandated to implement security measures that meet or exceed minimum requirements defined by the Company. 1009 ensures their compliance through continuous monitoring, regular compliance reviews, and risk assessments.

## Controls and Monitoring of IT Systems

### Backup and Restore Requirements

3.18. To ensure the integrity and availability of IT systems 1009 shall implement robust backup and restore policies. Critical IT and information assets are backed up daily using full and incremental methods, with backups securely stored on-site and off-site in encrypted formats. Data retention complies with the Company's IT Backup and Restoration Policy to meet operational and regulatory needs.

3.19. Restore procedures are tested quarterly to ensure effectiveness and enable swift recovery from information loss or IT asset failures. Access to backups is controlled and authorized personnel. All backup and restore activities are documented, including schedules, storage locations, and test results, to ensure accountability and support audits.

### Scheduling Requirements

3.20. Maintenance, update and other IT operational activities are scheduled and structured to account for interdependencies among IT assets, ensuring seamless functionality and minimizing disruptions. Maintenance and upgrades are planned during designated low traffic windows to reduce impact on business operations.

3.21. Coordination between system administrator and relevant third-parties is essential to manage dependencies and prevent. Schedules are regularly reviewed and updated to reflect changes in IT infrastructure and business priorities. Clear communication of scheduled activities to stakeholders ensures transparency and preparedness.

3.22. All scheduled activities are documented, including timelines, affected systems, and responsible personnel, to ensure accountability, audit trails and support. Automated scheduling tools may be utilized to optimize maintenance planning and adherence to established schedules.

### Audit-Trail and System Logs

3.23. Audit trails and system logs are maintained for all IT assets to ensure accountability and support relevant analysis. Key activities, including user access, system changes, and system events, are logged in real-time. Logs are secured against unauthorized access and tampering through encryption and access controls. Regular reviews are conducted to identify and investigate suspicious activities or compliance issues. Automated tools and SIEM solutions are utilized for efficient log collection, storage, and analysis.

### Disruption Minimisation

3.24. Internal audits and testing are scheduled during off-peak hours or designated maintenance windows to minimize business disruptions. Coordination with relevant Company's employees ensures that critical operations remain unaffected. Non-intrusive testing methods are used, and audit scopes are adjusted during high-demand periods. Schedules are communicated in advance to all stakeholders, and outlined contingency plans address any unexpected disruptions promptly.

### Separation of Environments

3.25. Production environment is separated from development, testing, and other non-production environments. This separation includes distinct network, accounts, data, and connections. Access controls interactions to authorized personnel only. Regular audits verify the integrity and compliance of the separation with established standards.

3.26. Development and testing occur in environments separated from production. These environments are isolated to prevent any impact on live IT assets. Only authorized personnel have access, and the data used for the purpose of development or testing is anonymized or synthetic where possible. IT assets requiring testing in the production environment are clearly identified, justified, limited in duration, and approved by CTO.

3.27. Access to the source code and related information controlled to prevent accidental changes and implementation of unauthorised functionalities. Automated deployment is used wherever possible to reduce human error possibilities.

3.28. If there is a business need identified and justified to perform testing in a production environment, then it can only be conducted after approved by CTO and with limitations in time and duration. During these activities, the availability, confidentiality, integrity, and authenticity of IT and information assets are maintained, and continuous monitoring is ensured.

### Error Handling

3.29. Error handling at 1009 shall ensure the timely identification, reporting, and resolution of IT asset issues. 1009 is to employ automated monitoring tools to detect anomalies and log errors in real time. Upon detection, errors are immediately reported to the designated system administrator through defined channels. Each error is assessed to determine its impact and severity, followed by the implementation of corrective actions to restore normal operations. All errors and resolution steps are documented and registered in 1009's SIEM solution to facilitate future analysis and continuous improvement. 1009 shall conduct regular reviews of error handling processes to ensure effectiveness and prevent recurrence.

### Support and Escalation

3.30. At 1009 internal support team is available 24/7 through designated support channels. External support contacts, including Service providers and Third-party vendors, are identified and accessible for critical issues that cannot be resolved within 1009. Contact information is regularly updated and easily accessible to all relevant personnel. Escalation process ensures that unresolved issues are promptly elevated to direct managers, System Administrator or CTO to minimize downtime and maintain system integrity.

### IT System Recovery

3.31. In the event of an IT asset disruption, predefined restart protocols are immediately initiated to restore IT asset functionality and verify normal operations. If restarting does not resolve the issue, rollback procedures revert IT assets to a previously stable state using version-controlled backups. Recovery procedures then restore information and baseline settings from backups, ensuring the integrity and functionality of IT assets. All restart, rollback, and recovery actions are thoroughly documented and regularly tested to ensure effectiveness. More detail regarding backups is in the Backup Policy.

## Capacity and Performance Management

### Capacity Management

3.32. 1009 shall develop, document, and implement capacity and performance management procedures to ensure optimal functioning of IT systems. The Company shall utilise capacity and performance management system, leveraging its features such as auto-scaling, load balancing, and monitoring to effectively manage and allocate resources to meet the changing needs of 1009 applications and workloads.

3.33. To identify capacity requirements, the Company shall analyse current system usage and forecast future needs based on business growth and technological advancements. Additionally, 1009 shall enhance its capacity by considering planned system deployments, user growth, IT strategy objectives, and other business development goals. Before implementing or updating any systems, the Acquisition, development and maintenance of IT Assets Management Policy must be consulted.

### Performance Management

3.34. 1009 shall continuously monitor the availability of data and IT assets' efficiency to prevent capacity shortages. This involves real-time tracking of system performance metrics, such as uptime, response times, and resource utilization, to identify inefficiencies and prevent bottlenecks.

3.35. 1009 shall adjust capacity and performance based on the complexity of Company business operations. This ensures that systems can be efficiently replaced or upgraded with minimal disruption when necessary and that Third-party evaluations, along with other security and procurement procedures, do not impede system performance management.

### Vulnerability Monitoring

3.36. To maintain awareness of emerging vulnerabilities 1009 shall identify and follow relevant and trustworthy information resources. This includes subscribing to security advisories, CVE databases, threat intelligence feeds (provided by authorities or Third-parties), and following other industry best practices to stay informed about potential threats.

### Automated Vulnerability Scanning and Assessments

3.37. Automated vulnerability scanning must be carried out at least once a week for IT assets that support critical or mission-critical functions. The frequency and scope of these activities align with the classification and the overall risk profile of each IT asset. Additionally, 1009 shall conduct regular vulnerability scanning of the IT environment and follow regular updates on CVEs. Vulnerability scanning procedures taken by 1009 allow early identification of potential IT asset vulnerabilities. All detected vulnerabilities affecting IT assets are recorded, and their resolution is actively monitored.

3.38. Scanning results enables the Company to prioritise and enhance current security measures. All identified vulnerabilities are thoroughly assessed and mitigated by ensuring that the software and firmware remain up to date, allowing both internal and external users to safely interact with 1009 IT assets. To further safeguard the operations, the Company shall employ robust mechanisms to validate the integrity and authenticity of software, firmware, and data, safeguarding them against unauthorized alterations, corruption, or tampering and ensuring their reliability for secure business operations.

3.39. 1009 shall require IT Third-party service providers to conduct and share their vulnerability assessments and mitigation efforts. Where relevant, vulnerability handling is incorporated into service agreements and requires Third-parties to regularly report on vulnerabilities, along with statistics and trends, in a timely manner.

### Responsible Disclosure

3.40. Procedures for the responsible disclosure of vulnerabilities to clients, counterparties, and the public are established. These procedures ensure that vulnerabilities are communicated appropriately and managed in a way that minimizes risk and maintains trust.

### Patch Management

3.41. 1009 shall identify and evaluate available software and hardware patches and updates using automated tools. This process ensures that all relevant patches are assessed for their applicability and importance to the Company's IT environment.

3.42. Patches and mitigation measures within 1009's IT assets are prioritized based on the criticality of the vulnerability, the classification of the IT asset, and its risk profile. This prioritization ensures that the most significant vulnerabilities are addressed first to protect essential IT assets and information.

3.43. Remediation of identified vulnerabilities is monitored and verified to ensure resolution and effective management. This includes tracking the status of patch fixes and confirming that implemented measures adequately mitigate the associated risks.

3.44. Escalation procedures for patching and updating IT assets are established to address critical vendor-reported vulnerabilities or where the deadlines of swift patching cannot be met. These procedures allow for rapid response to threats that pose immediate risks to the Company's operations and data security.

### Patch Testing and Deployment

3.45. Software and hardware patches, as well as updates are tested and deployed systematically. Testing ensures that freshly released patches do not disrupt system functionality, while deployment follows a controlled process to maintain system stability and security.

3.46. 1009 shall establish deadlines for the installation of software and hardware patches and updates based on the severity and criticality of the vulnerabilities they address.

### Logging

3.47. All access to systems and data is continuously monitored using internal security information and event management solutions, enabling real-time alerting and allows to document and manage all activities, exceptions, faults, and other relevant events, including:

- Creation, modification, and deletion of user accounts.
- Access right modifications.
- Access to non-public information resources.
- External vendor activities.
- Operation logs.
- Real-time session information.

3.48. Alerts are triggered for suspicious events such as privilege escalations, unauthorized access attempts, misuse of access privileges, anomalous activity patterns, and potential threats. Alerts are prioritized for rapid response based on the severity and context of the incident. Comprehensive system access and change logs are retained for a minimum of 5 years, ensuring compliance with regulatory requirements and supporting forensic investigations when needed.

### Event Identification and Log Management

3.49. 1009 shall identify events to be logged, establish retention periods based on business, security and legal objectives, and shall secure log data according to their purpose. Retention periods are considered based on audibility, compliance, and IT risk assessments.

3.50. To ensure logs provide sufficient information for identifying and investigating security incidents, the Company shall ensure that logs are designed to capture critical information that enables the rapid detection, analysis, and mitigation of security incidents. This includes detailed metadata such as user identifiers, source and destination IP addresses, timestamps, action types, and affected system components.

3.51. Events related to logical and physical access control, identity management, capacity management, change management, IT operations, and network traffic activities, including network performance are logged.

### Log Protection Measures

3.52. Access logs are secured to prevent unauthorised modification or deletion and retained for a minimum period of 5 years. Other type of logs collected are retained based on the criticality of the identified business functions, supporting processes and information assets.

3.53. Automated monitoring systems are in place to detect any failures or gaps in the logging infrastructure, with real-time alerts triggered for log anomalies or system malfunctions. In case of breaches or suspicious activity, immediate notifications are sent to Data Protection Officer (DPO), Chief Technology Officer (CTO) and Chief Information Security Officer (CISO).

3.54. Regular reviews are conducted to verify the effectiveness of the logging and monitoring systems, ensuring continuous protection of log data integrity.

### Time Synchronization

3.55. All IT asset clocks are synchronized using a Network Time Protocol (NTP) or Precision Time Protocol (PTP), with a documented reliable time reference, such as GPS or atomic clocks, ensuring accurate timestamping of log entries.

3.56. This enables precise correlation of events across IT assets and supports the identification and investigation of anomalous activities, facilitating effective incident response and forensic analysis of security breaches and service disruptions.

## 4. General Provisions

4.1. Company, along with designated personnel responsible for overseeing this Policy's implementation, ensures ongoing monitoring to uphold all measures outlined in the IT Operations Policy. Regular updates to the Policy or any related process are coordinated with CISO. The Policy is reviewed at least annually to integrate evolving regulatory requirements and industry wide standards.