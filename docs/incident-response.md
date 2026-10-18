# Wangari — Data Breach & Cybersecurity Incident Response Plan

*Entity: iMeanTech Limited, Nairobi, Kenya*  
*Applies to: wangari.imeantech.com, API, database, and messaging infrastructure*  
*Statutory Compliance: Kenya Data Protection Act 2019 (KDPA Section 43) & Computer Misuse and Cybercrimes Act 2018 (CMCA)*

---

## 1. Objectives & Guiding Principles

This plan establishes the mandatory protocol when a suspected or confirmed data compromise, unauthorized access, or cybersecurity incident occurs on the Wangari platform.

1. **Protect Customer Data First:** Immediate containment takes priority over normal uptime.
2. **72-Hour Legal Window:** In compliance with KDPA Section 43, the Office of the Data Protection Commissioner (ODPC) and affected data subjects must be notified within 72 hours of becoming aware of a breach involving personal data.
3. **No Evidence Tampering:** Preserve logs and database snapshots before taking destructive recovery actions.

---

## 2. Six-Step Incident Response Lifecycle

### STEP 1: DETECT & TRIAGE (Within 30 Minutes)
* **Automated Indicators:**
  - Sentry critical error spikes or unexpected authentication failure rate surges.
  - Nginx 5xx / 4xx bursts on `/api/auth` or `/api/paystack`.
  - PM2 cluster restarts or unexpected CPU/memory saturation.
  - Automated database connection failures.
* **Manual Indicators:**
  - Security vulnerability report sent to `info@imeantech.com`.
  - Farmer reporting unauthorized changes to flock, sales, or banking details.
* **Initial Classification:**
  - **SEV-1 (Critical):** Confirmed exfiltration or unauthorized exposure of user personal data, database compromise, or credential leakage.
  - **SEV-2 (High):** Unauthorized administrative attempt, IP bypass, or denial-of-service affecting availability.
  - **SEV-3 (Medium):** Isolated rate-limit anomaly or failed credential stuffing against single user.

---

### STEP 2: CONTAIN & ISOLATE (Within 1 Hour)
For any SEV-1 or SEV-2 security breach:

1. **Sever Exposure:**
   ```bash
   ssh vps
   # If API is actively leaking data:
   pm2 stop wangari-api
   ```
2. **Revoke Active Sessions Instantly:**
   Bump every user's `tokenVersion` so existing JWTs become immediately invalid:
   ```sql
   UPDATE "users" SET "token_version" = "token_version" + 1;
   ```
3. **Rotate Secrets in Production `.env` (`/home/saasapp/app/.env`):**
   - Rotate `JWT_SECRET`
   - Rotate `ADMIN_JWT_SECRET`
   - Rotate database password if host is suspected compromised
4. **Preserve Forensic Evidence:**
   Capture active log state and take a database snapshot before making code edits:
   ```bash
   cp /home/saasapp/app/server/server.log /home/saasapp/app/server/incident-$(date +%F-%H%M).log
   pg_dump -U postgres wangari > /home/saasapp/db-incident-snapshot-$(date +%F-%H%M).sql
   ```

---

### STEP 3: ASSESS SCOPE & IMPACT (Within 6 Hours)
Identify precisely what occurred:
1. **Which users were affected?** Query `audit_logs` for requests made during the incident window.
2. **Was financial data accessed?** Verify if Paystack customer tokens, invoice totals, or bank codes were exposed.
3. **Was data altered or only viewed?** Verify database table checksums and audit trails.
4. **Determine Root Cause:**
   - Vulnerable dependency (npm audit)
   - Misconfigured route permissions (missing `farmId` filter)
   - Stolen operator credentials or compromised SSH key

---

### STEP 4: MANDATORY STATUTORY NOTIFICATION (Within 72 Hours)

#### A. Regulatory Notification to the ODPC (Kenya)
Under Section 43 of the Kenya Data Protection Act 2019, if personal data has been accessed or acquired by an unauthorized person:
- **Authority:** Office of the Data Protection Commissioner (ODPC)
- **Portal:** [dataportal.odpc.go.ke](https://dataportal.odpc.go.ke/)
- **Official Email:** `complaints@odpc.go.ke` / `info@odpc.go.ke`
- **Notice Contents Required:**
  1. Nature of the personal data breach.
  2. Categories and approximate number of data subjects concerned.
  3. Likely consequences of the breach.
  4. Measures taken or proposed to address and mitigate its effects.
  5. Name and contact details of iMeanTech's Data Protection Lead.

#### B. Direct Notification to Affected Farmers
- Notify farmers via verified email and SMS/WhatsApp in plain language (English & Kiswahili).
- Explain:
  - What happened and what data was involved.
  - What iMeanTech has done to stop it.
  - Recommended actions (e.g. resetting account password/PIN).
  - Support contact: `info@imeantech.com`.

#### C. Notification to Financial Sub-Processors
- If payment transactions were involved, notify Paystack Security team immediately.

---

### STEP 5: REMEDIATE & RECOVER
1. Develop fix in git on a dedicated security branch.
2. Verify with unit and integration tests.
3. Merge to `main` and deploy via approved runbook procedure:
   ```bash
   ssh vps
   cd /home/saasapp/app && bash deploy/update.sh
   curl -s http://localhost:8010/health  # Verify 200 OK
   ```
4. Verify system integrity and monitor real-time error logs.

---

### STEP 6: POST-MORTEM & AUDIT (Within 7 Days)
1. Complete written Post-Incident Review document detailing timeline, root cause, impact, and preventive actions.
2. Submit follow-up report to ODPC if requested.
3. Update `AGENTS.md` and automated tests to permanently guard against regression.

---

## 3. Emergency Contacts

| Role | Contact |
|---|---|
| iMeanTech Incident Commander | info@imeantech.com |
| ODPC Data Protection Portal | https://dataportal.odpc.go.ke |
| National Cybercrimes Center (NC4) | info@nc4.go.ke |
| Paystack Security & Compliance | support@paystack.com |
