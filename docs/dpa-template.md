# Data Processing Agreement (DPA) Template
*Between iMeanTech Limited ("Processor") and Partner ("Controller")*  
*Pursuant to: Kenya Data Protection Act 2019 (KDPA), Sections 35–37*  
*Version 1.0 — October 2026*

> ⚠️ **Legal Review Required:** Have this template reviewed by a qualified Kenyan data protection lawyer before signing with any partner. Recommended: Wacuma & Reithi Advocates, Olm LLP, or Gallant Law Kenya.

---

## When to Use This Agreement

Use this DPA when Wangari processes personal data **on behalf of a business partner** (Controller), for example:
- Agricultural cooperatives that subscribe to Wangari for their members
- NGOs using Wangari to manage smallholder farmer programs
- Government agencies or county councils licensing Wangari for extension programs
- Aggregators or SACCO partners integrating via Wangari API

Where iMeanTech is collecting data from end-users directly (individual farmers), iMeanTech is the **Controller** and the Privacy Policy governs — no DPA is required.

---

## DATA PROCESSING AGREEMENT

**This Data Processing Agreement ("Agreement")** is entered into between:

**Controller:**  
Name: _______________________________  
Registration Number: ___________________  
Address: ______________________________  
Contact/DPO: __________________________  
(hereinafter "Controller")

**Processor:**  
iMeanTech Limited  
Registered in Kenya (Registration No.: ___________________)  
P.O. Box _________, Nairobi, Kenya  
Email: info@imeantech.com  
(hereinafter "Processor")

Collectively the "Parties."

---

## 1. Definitions

| Term | Meaning |
|---|---|
| **KDPA** | Kenya Data Protection Act 2019 and its Regulations |
| **Personal Data** | Any information relating to an identified or identifiable natural person processed under this Agreement |
| **Processing** | Any operation performed on Personal Data including collection, storage, use, disclosure, or deletion |
| **Data Subject** | The identified natural person whose Personal Data is processed |
| **Sub-Processor** | Any third party engaged by Processor to carry out processing on behalf of Controller |

---

## 2. Subject Matter and Duration

2.1 Processor shall process Personal Data on behalf of Controller solely for the purpose of providing the **Wangari Farm Management Platform** services as specified in the main service agreement ("Main Agreement").

2.2 This Agreement commences on the date of the Main Agreement and continues until that agreement terminates or expires, unless extended by written agreement.

---

## 3. Nature and Purpose of Processing

| Aspect | Detail |
|---|---|
| **Nature** | Digital farm management: record keeping, analytics, AI advisory, messaging |
| **Purpose** | Enabling farmers registered under Controller to use the Wangari platform |
| **Types of Personal Data** | Names, phone numbers, email addresses, farm GPS location, financial records, livestock records |
| **Categories of Data Subjects** | Smallholder farmers and farm workers registered by Controller |
| **Retention Period** | Duration of Main Agreement + 90 days, or 7 years for financial records (Kenya Income Tax Act) |

---

## 4. Obligations of Processor (iMeanTech)

The Processor shall:

4.1 Process Personal Data only on documented instructions from the Controller, including with regard to international transfers, unless required by law.

4.2 Ensure that persons authorised to process Personal Data have committed to confidentiality or are under statutory confidentiality obligations.

4.3 Implement appropriate technical and organisational measures as set out in **Annex A** (Security Measures).

4.4 Not engage a Sub-Processor without prior written authorisation of the Controller. Current authorised Sub-Processors are listed in **Annex B**.

4.5 Assist Controller in responding to Data Subject requests (access, correction, deletion, portability) within 30 days.

4.6 Assist Controller in ensuring compliance with KDPA obligations regarding security (Section 41), breach notification (Section 43), and data protection impact assessments.

4.7 At the choice of Controller, delete or return all Personal Data after the end of the provision of services.

4.8 Make available to Controller all information necessary to demonstrate compliance with this Agreement.

4.9 Notify Controller **without undue delay** (and within 48 hours) after becoming aware of a Personal Data breach affecting Controller's data subjects.

---

## 5. Obligations of Controller

The Controller shall:

5.1 Ensure there is a lawful basis for all Personal Data provided to Processor for processing.

5.2 Provide Processor with documented instructions regarding the processing of Personal Data.

5.3 Obtain all necessary consents from Data Subjects before sharing their Personal Data with Processor.

5.4 Maintain its own registration with the ODPC as a Data Controller if required by KDPA.

5.5 Respond promptly to inquiries from Processor about processing instructions.

---

## 6. Sub-Processors

6.1 Controller grants Processor general written authorisation to engage the Sub-Processors listed in **Annex B**.

6.2 Processor shall inform Controller of any intended changes (additions or replacements) to Sub-Processors. Controller may object within **14 days** of notification.

6.3 Processor shall impose data protection obligations on Sub-Processors equivalent to those in this Agreement.

---

## 7. Data Subject Rights

7.1 Processor shall assist Controller in fulfilling obligations to respond to Data Subject requests under KDPA Sections 26–34 (access, rectification, erasure, restriction, portability, objection).

7.2 If a Data Subject contacts Processor directly, Processor shall redirect the request to Controller within **5 business days**.

---

## 8. Security Measures

8.1 Processor shall implement the technical and organisational security measures set out in **Annex A**.

8.2 In the event of a Personal Data breach, Processor shall:
- Notify Controller within **48 hours** of becoming aware
- Provide the information required by KDPA Section 43(3)
- Cooperate with Controller's breach investigation
- Refer to the internal Incident Response Plan at `docs/incident-response.md`

---

## 9. Data Transfers

9.1 Processor shall not transfer Personal Data outside Kenya unless: (a) the destination country provides an adequate level of protection under KDPA Section 48; or (b) Controller provides written authorisation and appropriate safeguards are in place.

9.2 Current data location: IBM Cloud VPS (confirm datacenter region with iMeanTech before signing). All data stored in Nairobi/Kenya region where available.

---

## 10. Audit Rights

10.1 Controller may audit Processor's compliance with this Agreement, including by inspecting processing facilities, on **30 days** written notice, no more than once per calendar year.

10.2 Processor may satisfy audit obligations by providing Controller with an equivalent third-party audit report (e.g., SOC 2, ISO 27001).

---

## 11. Liability and Indemnification

11.1 Each Party shall be liable for the damage caused by processing that infringes the KDPA or this Agreement.

11.2 Processor shall not be liable if it proves it is not in any way responsible for the event causing the damage.

11.3 Maximum aggregate liability of Processor under this Agreement: fees paid by Controller in the preceding **12 months**.

---

## 12. Duration and Termination

12.1 This Agreement terminates automatically upon termination of the Main Agreement.

12.2 Upon termination, Processor shall, within **30 days**, at Controller's choice: (a) delete all Personal Data; or (b) return all Personal Data in machine-readable format (JSON/CSV export).

---

## 13. Governing Law

This Agreement is governed by the laws of Kenya. Disputes shall be submitted to the exclusive jurisdiction of the courts of Nairobi, Kenya.

---

## Signatures

| Controller | Processor |
|---|---|
| Name: _________________________ | Name: _________________________ |
| Title: __________________________ | Title: __________________________ |
| Signature: ______________________ | Signature: ______________________ |
| Date: ___________________________ | Date: ___________________________ |
| Stamp: __________________________ | Stamp: __________________________ |

---

## Annex A — Technical and Organisational Security Measures

| Measure | Implementation |
|---|---|
| Encryption in transit | TLS 1.2/1.3 via Let's Encrypt (nginx) |
| Encryption at rest | Confirm disk encryption with IBM Cloud |
| Access control | JWT authentication, tokenVersion revocation, IP rules |
| Password security | bcrypt hashing (minimum cost factor 12) |
| Database security | Prisma parameterised queries (no SQL injection risk) |
| Audit logging | `audit_log` table records all write operations |
| Rate limiting | express-rate-limit on all auth and API endpoints |
| Dependency security | Quarterly `npm audit` review |
| Incident response | `docs/incident-response.md` playbook |
| Backup | Daily database snapshots (verify schedule with ops team) |
| Access to production | SSH key-only, no root login, limited to authorised engineers |

---

## Annex B — Authorised Sub-Processors

| Sub-Processor | Purpose | Location | Data Shared |
|---|---|---|---|
| Paystack Inc. | Payment processing | Nigeria/International | Subscription billing data only (no card numbers) |
| Google (Gemini AI) | AI advisory feature | USA/Global | Farm query context — no persistent storage |
| [SMTP Provider — e.g. Resend/SendGrid] | Transactional email | USA/Global | Name, email address |
| IBM Cloud | Server hosting & database | Confirm region | All platform data |
| Open-Meteo | Weather data | Europe | No personal data |
| Meta (WhatsApp Cloud API) | Messaging | USA/Global | Phone number, message content (when WhatsApp active) |

---

*This template was prepared for internal use by iMeanTech Limited. Review by a qualified Kenyan ICT/data protection lawyer is required before execution.*
