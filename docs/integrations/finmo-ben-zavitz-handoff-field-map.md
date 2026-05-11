# Finmo → Zoho CRM Field Mapping Gap Analysis
**Integration:** Finmo Ben Zavitz Handoff → Zoho CRM  
**n8n Workflow:** `fSKYw10qStQrbEw7` (active)  
**Webhook:** `POST https://foxmortgage.app.n8n.cloud/webhook/finmo-ben-handoff`  
**Event type:** `application_update_event`  
**Produced:** 2026-05-11 (FOX-476)  
**Status:** Draft — awaiting Mike approval before FOX-473 implementation

---

## 1. Current Mapping — Deals Module

What the workflow extracts today and where it lands in Zoho Deals:

| Finmo payload path | Extracted as | Zoho Deal field | Notes |
|---|---|---|---|
| `app.id` | `_finmoUUID` | `Finmo_Application_UUID` | UUID used as idempotency key |
| `app.finmoDealId` / `app.lendeskApplicationId` | `_finmoDealId` | `fimoextension__Finmo_ID`, `fimoextension__Finmo_Application_ID` | Legacy/extension field |
| `app.teamId` + `app.id` | `_finmoURL` | `fimoextension__Finmo_URL` | Direct link to Finmo deal |
| `app.goal` | `_transactionType` | `Finmo_Goal`, `Transaction_Type` | Mapped: purchase→Purchase, renew→Renewal, refinance→Refinance, switch→Switch/Transfer |
| `app.applicationStatus` | `_appStatus` | `Finmo_Application_Status` | Mapped: new_deal, in_progress, pre_qualified, live_deal, broker_complete, declined, submitted, funded, approved, cancelled, borrower_control |
| `app.closingDate` | `_closingDate` | `Closing_Date` | Truncated to YYYY-MM-DD |
| `app.mortgageAmountRequested` / `mortgageInfoAmount` | `_mortgageAmount` | `Amount` | Primary loan amount |
| `app.purchasePrice` | `_purchasePrice` | `Purchase_Price_Value` | |
| `app.downPayment` | `_downPayment` | `Down_Payment` | |
| `app.mortgageInfoInterestRate` | `_mortgageRate` | `Mortgage_Rate` | |
| `app.mortgageInfoInterestType` | `_rateType` | `Rate_Type` | fixed→Fixed, variable→Variable, adjustable→Adjustable |
| `app.mortgageInfoTermMonths` | `_termMonths` | `Term_Years` | **⚠️ Field name mismatch — stores months in a "Years" field** |
| `app.mortgageInfoAmortizationMonths` | `_amortMonths` | `Amortization_Years` | **⚠️ Same mismatch** |
| `app.mortgageInfoPaymentFrequency` | `_paymentFreq` | `Payment_Frequency` | |
| `app.mortgageInfoLenderName` | `_lenderNameRaw` | `Finmo_Lender_Name_Raw` | Raw string, not a lookup |
| `app.mortgageInfoGds` | `_gds` | `Finmo_GDS` | Stored as percentage (e.g. 28.50) |
| `app.mortgageInfoTds` | `_tds` | `Finmo_TDS` | Stored as percentage |
| `app.dealAgentId` | `_dealAgentId` | `Finmo_Deal_Agent_ID` | Finmo UUID of the agent |
| `prop.address.streetNumber + streetName` | `_street` | `Street` | |
| `prop.address.city` | `_city` | `City` | |
| `prop.address.state` / `province` / `app.subjectPropertyProvince` | `_province` | `Province` | |
| `prop.address.postCode` / `postalCode` | `_postalCode` | `Postal_Code` | |
| _(hardcoded)_ | — | `Deal_Name` | Auto-assigned BRX-M-NNN |
| _(hardcoded)_ | — | `Stage` | Always set to "Lead" on create |
| _(hardcoded)_ | — | `Co_Broker_External` | Always "Ben Zavitz" |
| _(hardcoded)_ | — | `Sync_Source` | Always "RestHook" |
| _(payload hash)_ | `_payloadHash` | `Finmo_Payload_Hash` | SHA-256 for idempotency |
| _(runtime)_ | — | `Finmo_Last_Synced_At` | ISO timestamp of sync |
| _(hardcoded)_ | — | `Finmo_Sync_Status` | Always "Synced" |
| _(hardcoded)_ | — | `Finmo_Last_Event_Type` | Always "application_update_event" |

---

## 2. Current Mapping — Contacts Module

| Finmo payload path | Zoho Contact field | Notes |
|---|---|---|
| `mainBorrower.firstName` | `First_Name` | |
| `mainBorrower.lastName` | `Last_Name` | Defaults to "Unknown" if blank |
| `mainBorrower.email` | `Email` | Used as dedup key |
| `mainBorrower.phone` / `phoneNumber` | `Phone` | |
| `mainBorrower.id` | `Finmo_Borrower_ID` | Finmo UUID |
| _(hardcoded)_ | `Finmo_Is_Primary_Applicant` | Always true for main borrower |
| _(hardcoded)_ | `Lead_Source` | Always "Ben Zavitz Referral" |

---

## 3. Fields Available in Finmo Payload — NOT Currently Mapped

These fields exist in the Finmo `application_update_event` payload but are not extracted or written to Zoho.

### 3a. Application-level gaps

| Finmo field | Type | Recommended Zoho destination | Priority | Notes |
|---|---|---|---|---|
| `app.insured` | boolean | `CMHC_Insured` (new field needed) | High | Critical underwriting flag |
| `app.ltv` | decimal | `LTV` | High | Already exists on Deals |
| `app.mortgageInfoMaturityDate` | date | `Maturity_Date` | High | Already exists on Deals |
| `app.occupancyType` | enum | `Occupancy_Type` (new field needed) | Medium | owner_occupied / rental / vacation_home |
| `app.propertyType` | enum | `Property_Type` | Medium | detached / semi / condo / townhouse |
| `app.mortgageInfoCompoundPeriod` | enum | `Compound_Period` (new field needed) | Low | semi_annually / monthly |
| `app.referralSource` | string | `Lead_Source` (Contacts) | Low | May conflict with hardcoded "Ben Zavitz Referral" |
| `app.heatingCosts` | decimal | _no current field_ | Low | Useful for file review, not CRM-critical |
| `app.condoFees` | decimal | _no current field_ | Low | Same |
| `app.propertyTax` | decimal | _no current field_ | Low | Same |
| `app.numberOfUnits` | integer | _no current field_ | Low | Relevant for multi-unit properties |
| `app.applicationSentDate` | date | _no current field_ | Low | Audit trail |
| `app.liveDate` | date | _no current field_ | Low | Audit trail |

### 3b. Subject property gaps

| Finmo field | Type | Recommended Zoho destination | Priority |
|---|---|---|---|
| `prop.propertyValue` / `estimatedValue` | decimal | `Purchase_Price_Value` (already mapped via purchasePrice, verify) | Medium |
| `prop.propertyType` | enum | Duplicate of app.propertyType above | Medium |
| `prop.occupancyType` | enum | Duplicate of above | Medium |
| `prop.yearBuilt` | integer | _no current field_ | Low |

### 3c. Co-borrower gap (significant)

Co-borrower data IS extracted (`_coBorrowerFirst`, `_coBorrowerLast`, `_coBorrowerEmail`, `_coBorrowerFinmoId`) but is **never written to Zoho**. The co-borrower contact is silently dropped.

| Finmo field | Recommended action | Priority |
|---|---|---|
| `coBorrower.firstName/lastName` | Create second Contact record, link to same Deal | High |
| `coBorrower.email` | Dedup by email same as main borrower | High |
| `coBorrower.phone` | Include in Contact create | Medium |
| `coBorrower.id` | Set `Finmo_Borrower_ID` on co-borrower Contact | Medium |

### 3d. Borrower detail gaps

| Finmo field | Recommended Zoho destination | Priority | Notes |
|---|---|---|---|
| `borrower.dateOfBirth` | _no current field_ | Low | Useful for identity verification |
| `borrower.maritalStatus` | _no current field_ | Low | |
| `borrower.employmentType` | _no current field_ | Low | |
| `borrower.sin` | **DO NOT MAP** | — | Security risk — never store SIN in Zoho |

---

## 4. Zoho Deal Fields Populated Elsewhere — Verify Not Overwritten

These fields exist on Deals and may already be set by Mike or other integrations. The Finmo sync should not blindly overwrite them.

| Zoho field | Set by | Risk |
|---|---|---|
| `Stage` | Finmo sets "Lead" on create only; updates don't change Stage | Low — update path skips Stage ✅ |
| `Contact_Name` | Set in Link Contact step after create/update | OK — this is intentional ✅ |
| `Lender_Notes` | Set manually by Mike | **Not overwritten** — Finmo doesn't write this |
| `Referral_Partner` | Should be Ben Zavitz's Zoho Partner ID | **Gap — not set anywhere in workflow** |
| `FP_Email` | FP portal uses this, but confirmed non-existent on Deals (use Referral_Partner) | N/A |
| `Investor_Name`, `Investor_Amount`, `Investor_Rate` | Investor portal — unrelated to Finmo | Low |

---

## 5. Existing Zoho Custom Fields Used — Confirm Exist

These field API names are written by the workflow. Confirm they exist before FOX-473 adds new ones (PRECEDENT INVENTORY per FOX-477).

| Field API name | Module | Status |
|---|---|---|
| `Finmo_Application_UUID` | Deals | Must exist — used as idempotency lookup key |
| `Finmo_Payload_Hash` | Deals | Must exist |
| `Finmo_Application_Status` | Deals | Must exist |
| `Finmo_Goal` | Deals | Must exist |
| `Finmo_Lender_Name_Raw` | Deals | Must exist |
| `Finmo_GDS` | Deals | Must exist |
| `Finmo_TDS` | Deals | Must exist |
| `Finmo_Deal_Agent_ID` | Deals | Must exist |
| `Finmo_Last_Synced_At` | Deals | Must exist |
| `Finmo_Sync_Status` | Deals | Must exist |
| `Finmo_Last_Event_Type` | Deals | Must exist |
| `fimoextension__Finmo_ID` | Deals | Extension-prefixed — confirm namespace |
| `fimoextension__Finmo_URL` | Deals | Extension-prefixed — confirm namespace |
| `fimoextension__Finmo_Application_ID` | Deals | Extension-prefixed — confirm namespace |
| `Down_Payment` | Deals | Must exist (not in CLAUDE.md inventory) |
| `Co_Broker_External` | Deals | Must exist |
| `Sync_Source` | Deals | Must exist |
| `Postal_Code` | Deals | Must exist |
| `Finmo_Borrower_ID` | Contacts | Must exist |
| `Finmo_Is_Primary_Applicant` | Contacts | Must exist |

---

## 6. Bugs Identified

| # | Location | Bug | Impact |
|---|---|---|---|
| B1 | Update Deal / Create Deal nodes | `Term_Years` stores months value (e.g. 60 for 5-year term). Field name says "Years" but receives months. | Medium — misleading data in Zoho |
| B2 | Update Deal / Create Deal nodes | `Amortization_Years` same issue — stores months not years | Medium |
| B3 | Verify Finmo Signature node | Uses RSA-PSS padding (`RSA_PKCS1_PSS_PADDING`) but comment says "Finmo uses RSA-PSS" — verify this is correct for current Finmo prod. Code comment above it says PKCS#1 v1.5 was tried and fixed. This is the current working state. | Low — working, just confusing comment |
| B4 | Workflow-wide | Co-borrower extracted but silently dropped — no Contact created for co-borrower | High |
| B5 | Create Deal / Update Deal | `Referral_Partner` never set — Ben Zavitz's Zoho Partner ID (`7112178000003669036`) not linked | High — FP portal queries by Referral_Partner; Ben won't see his own deals |

---

## 7. Recommended Additions for FOX-473

**High priority (blocking usability):**
1. Set `Referral_Partner: { id: "7112178000003669036" }` on every Deal (both create and update paths) — this is Ben's Zoho Partner record ID
2. Create co-borrower Contact + link to Deal (same pattern as main borrower)
3. Add `LTV` from `app.ltv` — field already exists on Deals
4. Add `Maturity_Date` from `app.mortgageInfoMaturityDate` — field already exists

**Medium priority:**
5. Fix `Term_Years` / `Amortization_Years` naming confusion — either rename the Zoho fields to `_Months` or convert `/12` before writing
6. Add `CMHC_Insured` from `app.insured` — new field needed in Zoho Deals

**Low priority / deferred:**
7. `Occupancy_Type`, `Property_Type` — useful for file review but not urgent
8. Co-borrower borrower-level fields (DOB, employment) — not needed for initial CRM view

---

## 8. Open Questions for Mike

Before FOX-473 implementation can begin:

| # | Question | Needed for |
|---|---|---|
| Q1 | Confirm `Referral_Partner` is the correct Zoho field to link Ben Zavitz (Partner ID `7112178000003669036`) | B5 fix |
| Q2 | Should `Term_Years` / `Amortization_Years` be renamed to `_Months` in Zoho, or should the workflow divide by 12? | B1/B2 fix |
| Q3 | Should a new Zoho field `CMHC_Insured` (checkbox) be created? | Item 6 above |
| Q4 | Should co-borrower Contact be created in all cases, or only when co-borrower email is present? | B4 fix |
| Q5 | When the Finmo sync creates a Deal at Stage="Lead", does Mike want a notification (email, Zoho Task, or n8n alert)? | Nice to have |
| Q6 | Confirm the 3 `fimoextension__` field namespaces exist in Mike's Zoho org — these look like they may require the Finmo-Zoho native integration to be installed | Risk |
