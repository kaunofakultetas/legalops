# 1009, LTD — Access Control Policy

## 1. Definitions

1.1. For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

1.2. If not specified, other terms used in this document have the same meaning as specified in the applicable laws and regulations.

## 2. Purpose and Objectives

### Purpose

2.1. The purpose of an Access Control Policy ("Policy") is to safeguard information, protect data integrity, and ensure that access to IT assets is API based on business needs and security principles.

2.2. The document is prepared under the principle of proportionality, considering the scale and complexity of the Company's operations, the nature of the activity engaged in, the types of services provided, and the corresponding access control risks to 1009's processes and services.

### Scope

2.3. This document is designed to minimize security risks by ensuring that only authorized personnel have access to specific assets and that this access aligns with their roles and responsibilities. This Policy establishes guidelines and controls for granting, managing, and revoking access rights to systems, data, and applications.

2.4. The Policy extends to all 1009 employees, contractors, and any third-party.

### Roles and Responsibilities

2.5. This Policy is maintained and updated by the Company's CTO.

2.6. The Chief Information Security Officer (CISO) oversees the implementation and monitoring of the Access Control Policy, ensuring that it adheres to applicable laws and industry standards.

2.7. The Chief Technology Officer (CTO) coordinates periodic internal audits of access rights, including bi-annual reviews of critical systems and annual reviews of general IT assets.

2.8. CTO are responsible for maintaining accurate access records and facilitating audits by providing required documentation and logs.

2.9. Any regulatory updates or changes affecting access control are reviewed by the CISO, and necessary adjustments to the policy are implemented in collaboration with the CTO.

2.10. All updates and audit results are documented and presented to senior management for review and approval, ensuring ongoing compliance and accountability.

## 3. Access Control Management

3.1. For Company's employees, responsible CTO utilise UAC system to ensure that authorized employees have access only to necessary assets. UAC system have implemented access control mechanisms to prevent intrusion and API unauthorized data modifications. These mechanisms prevent direct access to other employee's data and the installation of unauthorized services.

3.2. Access rights are assigned according to each employee's specific business role and responsibilities, adhering to "need-to-know", "need-to-use" and "least privilege" principles.

3.3. Users are provided access solely to the systems and data required to perform their specific job functions, ensuring no unnecessary or excessive permissions. The assignment process follows a role-based access control (RBAC) model, where predefined roles determine the level of access based on job responsibilities.

3.4. All access requests must be formally documented, justified, and approved by the direct line manager or the relevant Information Asset Owner. Temporary access is permitted only when necessary and is automatically revoked upon the expiration of the defined duration, with a clear justification required for such approvals.

3.5. The use of generic or shared internal user accounts is prohibited to reinforce accountability. Every action taken by individual user account is logged, ensuring traceability and enhancing system security.

3.6. 1009 Access Control Management can further be segmented into the following:

- Access control
- Accountability
- Privileged access rights
- Emergency access management
- Access review
- Access termination

3.7. Access rights are continuously monitored, and any unauthorized access or privilege escalation is logged and reviewed to ensure compliance. Employees are trained regularly on access control principles, and awareness campaigns are conducted to reinforce the importance of secure access management.

3.8. Additional security measures, such as multi-factor authentication and access logging, are in place to monitor and control access attempts and ensure that only authorized personnel can access information and IT infrastructure.

### Access Control

3.9. Employees accessing Company information through systems are assigned access rights based on their business roles, enabling precise addition and removal of roles as needed. Access rights are assigned based on the roles and responsibilities to ensure proper alignment with job functions and responsibilities. All access requests and authorizations are systematically recorded, creating a comprehensive audit trail.

3.10. The business need for access rights is assessed and approved by the direct line manager of the employee, or by the information asset owner. Emergency or privileged access is granted only on a need-to-use basis, with a preference for dedicated accounts where feasible.

3.11. To ensure compliance with the segregation of duties principle, the responsible personnel will prevent the assignment of access rights that may allow any individual to bypass established controls.

### Accountability

3.12. 1009 shall not have any shared accounts to be used within the systems. Every employee is assigned an individual account to ensure full traceability and accountability for all actions performed within the systems.

3.13. The principle of least privilege shall also be enforced, with employees granted only the minimum access rights necessary to perform their duties, effectively limiting access to large datasets and preventing unjustified access.

3.14. Clean Desk and Clean Screen principles are enforced across the Company to ensure information security. These principles establish requirements to prevent unauthorized personnel from accessing information, which is not public, ensuring information is only accessible to those with the appropriate authorisation.

### Privileged Access Rights

3.15. System administrator is responsible for IT infrastructure management, including the creation, updating, removal, and maintenance of IT infrastructure elements within the Company. To further secure access, only system administrator has access to the Company's logical access management system. Automated access management tools are deployed, when possible, to streamline and secure privilege allocation.

3.16. No other roles have the authorization to access or manage IT infrastructure and logical access. Senior engineers are informed of their specific responsibilities, including the types of data they may access or modify and the importance of adhering to the Company's security policies.

### Emergency Access Management

3.17. Full read and write access rights to the customer related information such as credentials, payment data are prohibited and can only be accessed in an emergency circumstances by following the emergency access procedure, which will immediately notify CEO, CTO, CISO, and system administrator.

3.18. Emergency access credentials are stored securely for use in critical situations when normal access methods fail, such as during a system outage or security incident. Credentials are kept in highly secure locations, such as encrypted vaults, password managers, or physical safes, to prevent unauthorized access.

3.19. Access control measures are integrated into the Company's incident management plan to prevent unauthorized access during incidents and ensure business continuity. In the event of an incident, access to IT assets is reassessed to identify and mitigate potential vulnerabilities.

3.20. If a critical incident requiring emergency access happens, this procedure is only to be executed by obtaining an approval of at least two employees out of CEO, CTO, CISO.

3.21. The incident management process includes regular reviews of access changes made during incidents to ensure compliance with the Company's access control policies.

### Access Review

3.22. Access rights are reviewed systematically at least once a year, and every 6 months for IT assets supporting critical business functions, to ensure alignment with current business roles and responsibilities.

3.23. Any excessive, unused, or ones that have been subject to misuse access rights are immediately terminated.

### Access Termination

3.24. Upon contract termination, direct manager of an employee shall initiate an access revocation request with system administrator. Access removal is prioritized and completed by the employees / contractors last working day, ensuring all access is suspended.

3.25. For specific details regarding the employee contract termination, please refer to the Human Resource Policy.

### Physical Access Controls

3.26. The building where 1009 office will be located shall have the security perimeter defined and secured to protect the areas where information assets are located.

3.27. Access to 1009 offices shall include the use of employee / guest badges. Visitors accessing 1009 offices shall be accompanied by authorised personnel. Visitor access shall be via a registered "Visitors Access Log" indicating the visit's time, duration, and hosting Company's employee. The log shall be assigned to an owner and maintained.

3.28. Physical access to the security operation centre to authorised 1009 employees or Third-parties whose job functions or responsibilities require such physical access. For specific details regarding physical security, please refer to the Physical and Environmental Security Policy.

## 4. Authentication Methods

4.1. The Company shall follow industry-wide standards of authentication methods, such as multi-factor authentication (MFA) and Single-sign-on (SSO) to ensure that controlled environments are accessed only by authorised employees and application services and that non-public data is always protected.

4.2. Where other authentication mechanisms are used, physical and logical controls are implemented to ensure that only the intended employee can use the mechanism to gain access.

### Multi-Factor Authentication

4.3. 1009 shall enforce that any access to the controlled environment where functionality allows is secured with MFA. All controlled IT assets entry points can only be accessed with MFA and data in transit encryption is enabled.

### Single-Sign-On Authentication

4.4. For access to the controlled environment Company shall identify and authenticate employees by assigning a unique ID. Password-only authentication is forbidden over the systems, all systems that support SSO shall utilise Platform for centralised identity and access management.

### Other Methods

4.5. In addition to MFA and SSO, the Company may deploy other authentication mechanisms, such as security tokens, smart cards, or certificates. These methods are assigned to specific employees, with physical or logical controls in place to ensure that only the intended account can use the mechanism to access controlled environments.

## 5. General Provisions

5.1. The Company, along with designated personnel responsible for overseeing this Policy's implementation, ensures ongoing monitoring to uphold all measures outlined in the Access Control Policy. Regular updates to the Policy and any related process are coordinated with the CISO. The Policy is reviewed at least annually to integrate evolving regulatory requirements and industry wide standards.