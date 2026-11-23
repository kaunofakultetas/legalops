# 1009, LTD — Backup Policy

## 1. Definitions

For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

If not specified, other terms used in this document have the same meaning as specified in the applicable laws and regulations.

## 2. Context

### Purpose

The purpose of this Backup Policy ("Policy") is to ensure the management of backups and the recovery and restoration of 1009's IT and information assets. By applying this Policy, 1009 aims to strengthen operational resilience, safeguard against data loss, ensure that business functions, including supporting IT and information assets, including critical can be restored efficiently and effectively when needed.

The document is prepared under the principle of proportionality, considering the scale and complexity of the Company's operations, the nature of the activity engaged in, the types of services provided, and the corresponding IT related risks to 1009's processes and services.

### Scope

Its scope encompasses all aspects of IT and information asset backup within 1009, including regular backup schedules, storage, and periodic testing.

Policy applies to all critical systems and data related to the operation of the crypto exchange platform, including customer databases, financial records, wallet data, transaction logs, and system configurations. It also applies to all other IT and information assets within Company's IT infrastructure, regardless of where the assets are stored on-premises, in the cloud, or on employee devices.

The Policy extends to all 1009's employees, contractors, and any third-party providers involved in maintaining, managing, or accessing backup systems and data.

### Roles and Responsibilities

This Policy is maintained and updated by the Company's CTO.

System Administrator shall be responsible for the configuration, management, and monitoring of backup systems. This includes ensuring that all scheduled backups are executed properly, and the integrity of backup data is verified.

## 3. General Requirements

Backup infrastructure shall be designed to secure IT and information assets and support business continuity within 1009. Backup infrastructure shall be implemented following Company's information security requirements on data availability, authenticity, integrity, and confidentiality. Backup infrastructure shall undergo periodic testing to validate the effectiveness of backup, restoration, and recovery procedures.

Responsibility for managing backups, monitoring backup operations, and executing recovery and restoration processes will be assigned to CTO.

1009 shall develop and document backup, restoration and recovery procedures to ensure the restoration of IT and information assets with minimum downtime, limited disruption and loss, as part of 1009's IT risk management framework and business continuity management.

Company shall maintain a robust business continuity and disaster recovery plans, allowing data to be restored within business continuity objectives. Company's backup infrastructure shall maintain sufficient resources and facilities to ensure uninterrupted services, even in disruptive events.

For more details regarding the recovery plans please refer to the document IT Business Continuity and Response Plans.

## 4. Backup Management

Company shall develop backup procedures specifying the scope of the data that is subject to the backup and the minimum frequency of the backup, based on the criticality level of business functions, including supporting IT and information assets.

Backup infrastructure within 1009 shall be set up in a way that it can be activated in accordance with the backup policy as well as restoration and recovery procedures and methods. The activation of backup infrastructure shall not jeopardise the security of 1009's network and IT and information assets or the availability, authenticity, integrity or confidentiality of data.

**Type of data to be backed up within 1009:**

- **Crypto Asset Records.** Wallet balances, transaction history, and crypto holdings.
- **System Configurations.** Server configurations, platform settings, API keys, and access credentials.
- **Transaction Logs.** Complete records of all user transactions on the exchange platform.
- **Backup of Internal Databases.** Database that includes internal administrative data and logs.

**Every backup procedure shall specify the following details to ensure consistency and effectiveness:**

- **Category of backup.** Specifying whether the backup is manual (manually initiated) or automatic (system scheduled). Automatic backups are preferred for ensuring consistency and reducing human error.
- **Frequency of backup.** This may include daily, weekly, monthly, or other time intervals that align with the business continuity objectives. Following backups shall be performed:
- **Daily Backups.** Transaction logs, customer data, and critical records shall be backed up on a daily basis.
- **Weekly Backups.** Full system backups of servers, applications, and database snapshots shall be performed weekly.
- **Monthly Backups.** Full platform backups shall be stored as monthly snapshots.
- **Schedule.** Clearly outline the schedule for backup operations, ensuring that critical business functions, including supporting IT and information assets are backed up more frequently to minimize potential data loss.
- **Type of backup.** Defining the type of backup being performed (e.g., full, incremental, differential, or image-based) ensures that the appropriate strategy is applied to meet recovery time and point objectives as well as storage efficiency requirements.
- **Retention considerations.** Retention requirements shall be guided by business continuity objectives to ensure that data is available within defined recovery point and business continuity objectives and is securely disposed of when no longer needed. Following retention periods is outlined:
- **Daily Backups.** Shall be retained for a period of 7 days before being overwritten or archived.
- **Weekly Backups.** Shall be retained for 30 days.
- **Monthly Backups.** Shall be retained for a minimum of 1 year.
- **Storage medium.** Whether backup is stored on physical media (e.g., external drives) or in cloud storage. The storage medium shall follow information security requirements appropriate to the data's classification. Following storage mediums are employed:
- **On-Site Backups.** Backups of essential system files and configuration data shall be stored on local servers, ensuring quick recovery in case of system failure. Raid Z solution shall be employed for on-site backups.
- **Off-Site Backups.** All critical data and backups shall be replicated to an off-site location to safeguard against local disasters (fire, theft, etc.). Off-site backups shall be securely encrypted and stored in a separate geographic region to ensure resilience. All data shall be transferred to the DR server over IPSec VPN.
- **Cloud Backups.** Backup data will also be stored in a secure, reputable cloud environment to ensure scalability and remote accessibility. All cloud backups shall be encrypted and stored in compliance with industry standards (e.g., AES-256). Cloud secure connection complies with GDPR requirements.
- **Backup location.** Backups shall be stored at a location separate from the original data source, such as a disaster recovery site or different cloud regions. This shall ensure resilience in case of physical or regional disaster.
- **Data backup owner.** Each data backup shall have its owner assigned.
- **Data restoration testing plan.** Testing shall be conducted periodically to verify the integrity of the backups and ensure that data can be restored within defined business continuity objectives.
- **Recovery of backup data documentation.**

All backup data, whether stored on-site, off-site, or in the cloud, will be encrypted using industry-standard encryption protocols (e.g., AES-256). Encryption keys shall be securely stored and managed according to the best practices. Backups transmitted over the network will be encrypted in transit using secure channels (e.g., TLS 1.2+).

## 5. Recovery and Restoration

1009 shall develop restoration and recovery procedures covering methods for recovering and restoring data from backups, including recovery priorities and testing protocols to validate data integrity and functionality.

Company shall maintain redundant IT capacities equipped with resources, capabilities and functions that are adequate to ensure business continuity objectives. Backup data within 1009 shall be recoverable with minimal disruption to 1009's business operations. Restoration efforts shall prioritize critical business functions, including supporting IT and information assets to ensure that critical or important functions are restored first, and the accepted service levels are met.

When restoring backup data using own infrastructure, 1009 shall use infrastructure that is physically and logically segregated from the data source infrastructure. The infrastructure dedicated for restoring backup data shall be securely protected from any unauthorised access or IT corruption and shall have capabilities to restore IT assets required for backup processes within business continuity objectives.

During incident recovery, 1009 shall conduct data integrity and consistency checks, including reconciliations, to maintain highest data integrity and accuracy standards. Data reconstructed from external stakeholders shall undergo consistency checks to ensure alignment across IT assets.

## 6. Testing and Validation

1009 shall perform regular testing and audits of backup, restoration and recovery procedures to verify preparedness and mitigate risks associated with data loss or corruption. Recovery and restoration procedures shall be tested at least once per quarter and each time there are major infrastructure changes or updates to the Company's assets to ensure that data can be restored quickly and effectively in case of an emergency.

These tests will involve restoring a random sample of backup data to validate the integrity and completeness of the backup files. Each backup will be verified for integrity to ensure no corruption during the backup process. Automated tools will be used to monitor and validate backups after each completion.

## 7. General Provisions

Company, along with designated personnel responsible for overseeing this Policy's implementation, ensures ongoing monitoring to uphold all measures outlined in the Information Security Policy. Regular updates to the Policy or any related process are coordinated with CISO. The Policy is reviewed at least annually to integrate evolving regulatory requirements and industry wide standards.