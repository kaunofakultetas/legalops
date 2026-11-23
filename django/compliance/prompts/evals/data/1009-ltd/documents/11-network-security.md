# 1009, LTD — Network Security Management Policy

## 1. Definitions

For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

If not specified, other terms used in this document have the same meaning as specified in the applicable laws and regulations.

## 2. Context

### Purpose

The purpose of this Network Security Policy ("Policy") is to ensure the resilience, security, and integrity of network infrastructure, protecting information assets against disruptions, cyber threats. By following these measures, 1009 ensures compliance with regulatory requirements, strengthens operational resilience, and adheres to industry best practices for network security.

The document is prepared under the principle of proportionality, considering the scale and complexity of the Company's operations, the nature of the activity engaged in, the types of services provided, and the corresponding network security risks to 1009's processes and services.

### Scope

This Policy applies to all dedicated IT infrastructure deployed to protect the network and data of 1009, including but not limited to: firewalls, malware protection systems (e.g., anti-virus, anti-spyware), intrusion detection and prevention systems, and data protection platforms (e.g., content filters, encryption).

All IT assets that store, transmit, or process 1009 information must adhere to these security measures to ensure the integrity, availability, authenticity and confidentiality of information.

The Policy extends to all 1009 employees, contractors, and any third-party.

### Network Management

The 1009's network security standards are designed to meet rigorous information security requirements, prioritizing confidentiality, integrity, availability and authenticity through industry-leading practices. 1009's network is designed with zero-trust approach in mind. All of 1009's networks are segregated. Network connections across all controlled environments are encrypted following approved information classification, risk assessments, and relevant encryption standards.

To safeguard against unauthorized access, network traffic is securely managed between internal networks, the internet, and external connections. Network boundaries are protected by dynamic firewalls configured to deny all access by default, allowing connection access only by exception with proper business justification and CISO approval. Public access to internal networks is restricted, and controls are placed on IT assets accessible externally.

Authorized staff and Third-parties requiring additional remote access may use Virtual Private Networks (VPNs). VPN gateways are set up and managed by the 1009, with strict traffic control. IT assets connected via VPN must meet all internal security policies, as these IT assets are treated as extensions of the corporate network.

### Governance

Clear roles and responsibilities are defined for each stage of network security management, covering the specification, implementation, modification and review with approval of network security rules, filters and settings.

**Roles and responsibilities of the CTO, CISO, and CEO in network security management:**

| Role | Specification | Implementation | Modification | Review |
|---|---|---|---|---|
| **CTO** | Defines technical requirements for network security configuration based on company security needs. | Oversees the implementation of network configuration within IT infrastructure. | Manages modification of network configuration in alignment with evolving technical and business requirements. | Coordinates with CISO to periodically review and optimize network configuration for information security. |
| **CISO** | Sets security standards and policies guiding network security specifications, ensuring alignment with risk assessment outcomes. | Approves changes of network configuration to ensure compliance with information security requirements and regulations. | Evaluates proposed changes to network configuration to ensure they maintain or enhance information security. | Leads periodic review of network configurations to address potential threats and verify adherence to information security policies. |
| **CEO** | — | Provides final executive approval for Policy and major decisions on network configuration or significant information security changes. | — | Ensures accountability across CTO and CISO for secure network infrastructure, aligning network security configuration with the Company's business strategy and risk tolerance. |

### Segmentation

The networks at 1009 are segmented to ensure that IT assets with similar functions, risk levels, or materiality are grouped to support secure communication and access control. Network segmentation is implemented based on the criticality and classification of information and is aligned with the risk profile of each IT asset. A separate and dedicated network is utilized for the administration of IT assets, while managed service load balancers handle public content delivery, and all other infrastructure resides securely behind firewalls within a private network.

**1009 network is divided into following segments:**

- DMZ.
- Production segment.
- Development segment.

IT assets that do not share the same group or function (i.e. development and production environments) are segregated and isolated from one another. Internal IT assets, including assets used for monitoring or other purposes that do not require direct communication between other assets, are isolated in separate private networks. Remote access to infrastructure is only available for authorized users through a tunnel via internal networks.

Demilitarized zone (DMZ) is maintained for all external facing IT assets. In DMZ all assets are protected by intrusion prevention systems that monitor events, detect attacks, and provide identification of unauthorized use.

### Configuration Management

Company shall apply standardized configuration and rules on all IT assets. A secure configuration baseline for all network components is established, with network devices hardened in accordance with vendor guidelines and industry-leading practices. When deploying or making modifications to IT assets, authorised System Administrator shall only use approved configuration documentation, which provides specific guidelines on the processes and procedures to undertake.

All incoming and outgoing traffic is encrypted, Firewall and web application firewall (WAF) rules are in place. All unnecessary protocols, ports, and services shall be explicitly prohibited by firewall and router policies. Company enforces procedures to limit, block, and terminate connection and remote sessions after a specified period of inactivity, ensuring protection against unauthorized access during idle periods.

### Monitoring and Regular Review

1009 shall maintain comprehensive documentation of all network connections and data flows across the Company. Company's network related IT assets undergo regular configuration reviews, every six months with critical IT assets and annually with other IT assets, ensuring they remain secure and effective. Together with regular reviews Company conducts common vulnerabilities and exposures (CVEs) assessment.

To identify any potential CVEs, performance and network security design review and risk assessment is conducted on a regular basis every year and after any major changes to increase architecture security posture. 1009 shall ensure that the network related IT asset configuration standards are consistent with industry-accepted hardening standards, baseline settings and all necessary configurations.

All firewall rule sets applicable to critical IT assets shall be reviewed every 6 months. There is an automated notification every 6 months to CTO and CISO for scheduling and reviewing the firewall rule sets. If a change is needed then 1009 shall follow the specification, implementation, modification and review of network connections. Every interdependency between IT assets is considered and every change of the baseline network configuration made is documented.

### Network Service Agreements

When defining network service requirements, the Company shall ensure adherence to industry standards. When defining contractual agreement, 1009 firstly identifies business needs to ensure alignment with the overarching business strategy. This includes preparing a comprehensive business case covering costs, timelines, targets, benefits, and risk analysis.

For more information on network related Service Provider evaluation and selection please refer to IT Third-Party Service Policy.

## 3. General Provisions

The Company, along with designated personnel responsible for overseeing this Policy's implementation, ensures ongoing monitoring to uphold all measures outlined in the Network Security Management Policy. Regular updates to the Policy or any related process are coordinated with CISO. The Policy is reviewed at least annually to integrate evolving regulatory requirements and industry wide standards.