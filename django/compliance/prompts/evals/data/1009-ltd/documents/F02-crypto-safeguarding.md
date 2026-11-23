# 1009, LTD — Crypto-Asset Safeguarding & Custody Policy

## 1. Definitions

1.1. For a detailed list of term definitions used in this document, please refer to the Definitions and Abbreviations Glossary maintained by 1009, LTD.

1.2. **"Crypto-asset"** means a digital representation of a value or of a right that is able to be transferred and stored electronically using distributed ledger technology or similar technology (MiCA Art. 3(1)(5)).

1.3. **"Custody and administration of crypto-assets on behalf of clients"** means the safekeeping or controlling, on behalf of clients, of crypto-assets or of the means of access to such crypto-assets, where applicable in the form of private cryptographic keys (MiCA Art. 3(1)(17)).

1.4. **"Position book"** means the internal ledger maintained by 1009 recording each client's individual entitlement to crypto-assets held in custody.

## 2. Context

### Purpose

2.1. This Policy implements the safeguarding obligations of Article 75 of MiCA in respect of crypto-assets held by 1009 on behalf of clients. It sets the requirements for segregation, custody architecture, reconciliation, and liability that ensure clients' crypto-assets are insulated from the Company's insolvency and protected against loss, theft and operational error.

### Scope

2.2. This Policy applies to all crypto-assets and means of access (including private keys, key shards, signing devices and recovery material) that the Company holds, controls, or has the contractual power to dispose of on behalf of clients.

### Legal and Regulatory Framework

2.3. Primary anchors:

- MiCA Art. 75 — Custody and administration of crypto-assets on behalf of clients.
- MiCA Art. 70 — Safekeeping of clients' funds (see F03 for client fiat funds).
- ESMA Regulatory Technical Standards specifying the requirements for custody policies under MiCA.
- DORA Art. 6–14 — ICT risk management as it applies to the systems supporting custody.

## 3. Custody Agreement and Position Statements

3.1. The Company shall conclude a written agreement with each client receiving custody and administration services. The agreement shall include, at minimum, the elements required by MiCA Art. 75(1):

- Identification of the parties.
- Nature of the service provided.
- Means of communication.
- Description of the security systems used.
- Fees, costs and charges.
- Applicable law.

3.2. The Company shall provide each client at least quarterly, and upon the client's request, with a statement of position listing the crypto-assets recorded in the position book under the client's name.

## 4. Segregation

4.1. The Company shall hold clients' crypto-assets segregated from its own crypto-assets and from those of other clients **on the distributed ledger**, except where operationally not possible, in which case segregation shall be effected through accurate internal record-keeping in the position book (MiCA Art. 75(7)).

4.2. The Company maintains the following segregation architecture:

- **Omnibus on-chain wallets** where used, are matched to a position book that reconciles individual client entitlements at all times.
- **Segregated on-chain wallets** are offered for clients requesting individual on-chain segregation, subject to applicable fees.
- The Company's own (proprietary) crypto-assets are held in wallets that are operationally and cryptographically distinct from any client wallet.

4.3. The Company shall not, at any time, use clients' crypto-assets for its own account or for the account of any other client without the express prior written consent of the affected client and only to the extent permitted by MiCA.

## 5. Custody Architecture

5.1. The Company operates a multi-tier wallet architecture designed to minimise the volume of crypto-assets exposed to a single point of failure:

| Tier | Connectivity | Purpose | Approximate share of AUM |
|---|---|---|---|
| Cold storage | Air-gapped; offline signing | Long-term safekeeping | ≥ 90% |
| Warm storage | Periodic, controlled connectivity | Operational replenishment | ≤ 8% |
| Hot wallet | Continuous network connectivity | Day-to-day client withdrawals | ≤ 2% |

5.2. Cold and warm storage operations use multi-party computation (MPC) or multi-signature schemes such that no single individual and no single system component can authorise a movement of crypto-assets.

5.3. Hot wallet balances are subject to per-transaction and aggregate daily limits, with automated alerts on breach. Replenishment from warm storage requires dual control.

5.4. The Company's key generation, key storage, key rotation, key destruction and signing procedures are documented in a separate Key Management Procedure approved by the Information Security Officer and reviewed annually.

## 6. Reconciliation

6.1. The Company performs **continuous reconciliation** between:

- On-chain balances controlled by the Company.
- Internal position book entries aggregated across all clients.
- The sum of the Company's own crypto-assets and any in-transit balances.

6.2. Reconciliation breaks shall be investigated and resolved within one (1) business day of detection. Material or unexplained breaks shall be escalated to the Risk Officer and reported under **F08 Major ICT Incident Classification & Reporting Policy** where the relevant thresholds are met.

6.3. The Company performs and documents an end-of-day reconciliation, the results of which are reviewed by an independent control function.

## 7. Use of Third-Party Custody Providers

7.1. Where the Company entrusts the custody of clients' crypto-assets to a third-party provider, the engagement is treated as **ICT services supporting critical or important functions** under DORA Art. 28, and is governed by **F06 ICT Third-Party Risk Management Policy**.

7.2. The Company shall not entrust client crypto-assets to a third party that does not provide demonstrable evidence of:

- Equivalent segregation arrangements.
- Independent attestation of key management controls (e.g., SOC 2 Type II, ISO/IEC 27001, ISAE 3402).
- Insurance coverage adequate to the holdings entrusted.

## 8. Liability

8.1. In accordance with MiCA Art. 75(8), the Company is liable to its clients for the loss of any crypto-asset or means of access to crypto-assets as a result of an incident attributable to the Company, **up to the market value of the crypto-asset lost**.

8.2. The Company is not liable where it can demonstrate that the loss has occurred as a result of an external event beyond its reasonable control, the consequences of which would have been unavoidable despite all reasonable efforts to the contrary.

8.3. The Company maintains insurance, or holds equivalent own funds (see **F11 Prudential Safeguards & Own Funds Policy**), to cover the Article 75(8) liability.

## 9. Incident Handling

9.1. Any incident affecting the safekeeping of clients' crypto-assets — including but not limited to unauthorised key access, reconciliation breaks not closed within the prescribed window, signing failures, or third-party custody outages — is classified and reported in accordance with **F08 Major ICT Incident Classification & Reporting Policy**.

9.2. Affected clients shall be notified without undue delay where the incident is likely to have an adverse impact on their financial interests.

## 10. Record-Keeping

10.1. The Company retains, for at least five (5) years:

- The custody agreement with each client.
- Position books and statements provided to clients.
- Reconciliation records and break investigation files.
- All key-management events (generation, rotation, destruction, signing approvals).
- All approvals authorising material movements of crypto-assets.

## 11. Review

11.1. This Policy is reviewed at least annually and following any material change in the custody architecture, any major incident affecting safekeeping, or the entry into force of new Level 2 measures under MiCA Art. 75.