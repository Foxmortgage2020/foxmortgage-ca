# foxmortgage.ca — Claude Code Build Context

## Last Updated: May 22, 2026 (FOX-113 D2 AI Fallback published live; FOX-114 three-night gate met)

---

## Current Status (April 18, 2026)

### Financial Planner Portal
- **Phase 1** ✅ live (commit `8ce7976`) — all 6 routes with static/mock data; Clerk role: `financial-planner`
- **Phase 2** ✅ complete (FOX-48) — live Zoho data, n8n webhooks active, Vercel env vars set
  - `FP_REFERRAL_WEBHOOK_URL` → `https://foxmortgage.app.n8n.cloud/webhook/fp-portal-referral`
    n8n workflow ID: `j17v139rGek6tjAC`, webhookId: `df8d9aaa-fc15-4ddf-b951-4af788a17feb`
  - `FP_MESSAGE_WEBHOOK_URL` → `https://foxmortgage.app.n8n.cloud/webhook/fp-portal-message`
    n8n workflow ID: `1jl45sF4HfvxO5L8`, webhookId: `b8c42e1f-9d31-47ae-a762-6f5e9c830d44`
  - Both webhooks verified 200 OK in production (executions 4574, 4575)
  - NOTE: If webhooks stop working after an API update, the fix is: deactivate workflow,
    PUT the full workflow JSON with `webhookId` set on the webhook node, then reactivate.
- **Phase 3** ❌ not started — DialPad integration (pending FOX-8 board approval)

### Investor Portal
- Dashboard crashes on load — fix: use `currentUser()` not `auth()` in API routes

### Bookkeeping Agent — Phase 1 Infrastructure (FOX-111 series)

#### Architecture Overview
Three n8n workflows + Zoho Creator forms + Next.js proxy routes:
1. **Nightly Categorization** — there are TWO workflows in this lineage. They coexist on purpose: the dry-run cut validates the auth/pipeline plumbing in sandbox; the full pipeline is the eventual production target.

   **1a. FOX-112 dry-run validation cut — `Uu6fsZ2A2gTn0gBs`** ("Bookkeeping — Nightly Transaction Categorization")
   - Cron: 2:00 AM daily (`0 2 * * *`), active=false (manually triggerable via MCP)
   - **16 nodes (as of 2026-05-22, D2 AI Fallback live):** Schedule trigger → Workflow Config (Set) → Load Categorization Rules → Fetch Uncategorized QBO Transactions → Rules Engine → Rule Matched? → [true] Check Write Mode → Write Stub / Log Dry Run; [false] Build AI Prompt → Call OpenRouter → Parse AI Response → AI Auto Route? / AI Review Route? → Submit to Review Queue / Skip — Low Confidence. Active version: `ee34c1f9`.
   - QBO realm: **sandbox `9341456901231490`** (correct).
   - Logs to `/api/bookkeeping/dry-run-log` when WRITE_TO_QBO=false (currently false).
   - **As of 2026-05-15: first clean dry-run end-to-end ✅.** Workflow execution `8247` (2026-05-15) ran all 7 active nodes green: Trigger → Workflow Config (`WRITE_TO_QBO=false`, `QBO_REALM_ID=9341456901231490`) → Load Categorization Rules (HTTP 200, empty `{"records":[]}`) → Fetch Uncategorized QBO Transactions (HTTP 200, 6 Purchases) → Rules Engine — Match Transactions (1 item passed the new uncategorized filter) → Check Write Mode (routed to false branch since `WRITE_TO_QBO=false`; the Write-Stub branch is intentionally idle here) → Log Dry Run to API (HTTP 200, body `{"ok":true}`). One Purchase (id `182`, DocNumber `FOX-112-DRY-RUN-SEED`, $99.99) was seeded into the sandbox via a one-off API call during validation; safe to delete once Mike confirms.
   - **FOX-114 three-night gate MET (2026-05-22).** 7 consecutive clean nightly runs confirmed (2026-05-16 through 2026-05-22). Pending Mike sign-off + board approval before `WRITE_TO_QBO` can be flipped to `true`.
   - **Master_Bookkeeping_Rules form** in Zoho Creator: ✅ exists (created by Mike 2026-05-15) with the 6 required field link-names (`Vendor_Regex`, `Account_Name`, `Memo_Tag`, `Confidence`, `Active`, `Hit_Count`) and the auto-generated `All_Master_Bookkeeping_Rules` report. Form is empty (zero rules seeded). Rules engine emits `match_method: 'no_match'` for every transaction until rules are added — that's expected dry-run behavior.
   - **QBO sandbox OAuth2 credential**: `1RTFGz2TrFtUtu97` "QuickBooks Online account" (sandbox environment, realm `9341456901231490`). Bound to the "Fetch Uncategorized QBO Transactions" node via `predefinedCredentialType` + `nodeCredentialType: "quickBooksOAuth2Api"`. Confirmed working with Intuit's sandbox API.
   - **Uncategorized-line filter in Rules Engine:** the JS code now scans every Purchase's `Line[]` for at least one line where `DetailType === 'AccountBasedExpenseLineDetail'` AND `AccountBasedExpenseLineDetail.AccountRef.name === 'Uncategorized Expense'`; Purchases with no such line are skipped (`continue`). Needed because QBO QueryAPI rejects nested-property filters on the `Purchase` entity (see Known Footguns below). Date filter at query level (`TxnDate >= '2026-04-01'`) bounds the result set.
   - **2026-05-15 — Rules seeded from 5-year historical analysis.** `Master_Bookkeeping_Rules` now contains **51 active vendor-regex rules** seeded via direct Zoho Creator API. Source: 5-year QBO Transaction Detail by Account export (production realm 9341456900727321, 2021-01-11 → 2025-12-31, 8,218 rows total, 2,034 expense rows, 1,336 with vendor names, 185 unique normalized vendors). Analysis pipeline + draft files live in `~/Desktop/foxmortgage-ca/.qbo-history/` (gitignored — raw vendor data never commits). Coverage baseline: **the 51 rules cover ~58.1% of historical expense dollars over the 5-year period.** Memo_Tag distribution: 19 FOXM, 1 PHUB, 31 OVHD; zero FSOC/TLB (the early history pre-dates Fox Social and Left Bench operating cost streams). Workflow execution `8248` (2026-05-15, post-seed) verified all 8 nodes green with the seeded rules loaded by Load Categorization Rules. Cross-reference to QBO live Chart of Accounts at seed time: all 19 unique `Account_Name` values matched exactly (note: both `Repair & Maintenance` (sub of Automobile) and `Repair and maintenance` (top-level) exist as separate accounts and are referenced as separate rules — not a typo).
   - **2026-05-15 — Description_Pattern schema extension shipped (FOX-112 complete).** `Master_Bookkeeping_Rules` form has a new optional `Description_Pattern` field (Multi Line text) added manually in Zoho Creator UI by Mike (Zoho Creator API v2 doesn't support form-schema mutations). `lib/zoho-creator.ts` (`getBookkeepingRules`) now returns a typed `BookkeepingRule[]` with `Description_Pattern` normalized to `""` for older records (commit `505da8b`). Rules Engine in workflow `Uu6fsZ2A2gTn0gBs` was extended to match in two phases: **Phase 1 (vendor-regex match)** runs only when both `Vendor_Regex` is set AND vendor name is non-empty. **Phase 2 (description-pattern match)** runs only when Phase 1 returned no match AND the transaction has any text in PrivateNote / Memo / per-line Description. **Precedence: vendor wins** — a vendor-regex match short-circuits description checks even if a description rule would also match (this is intentional; vendor regex is more specific). Empty regex strings are treated as "field not set" (skip). Output now includes `description_text` (concatenated PrivateNote + Memo + per-line Description for debugging) and `match_method: "vendor" | "description" | "no_match"`. Workflow executions `8249` (backward-compat, all 51 vendor rules behave identically) and `8253` (description-match test with one POSTed test rule + one seeded Purchase with empty vendor and INTERAC E-TRANSFER FEE memo) both ran green end-to-end. Test description rule deactivated post-validation (ID `4890667000000930087`, Active=false).
   - **2026-05-15 — 15 description-pattern rules seeded (FOX-112 fully complete).** Followed today's vendor-rule pattern: pattern-mined the 698 vendor-less expense rows from the same 5-year QBO export (`~/Desktop/foxmortgage-ca/.qbo-history/`), produced 15 candidate `^prefix\s+token` regexes via greedy shortest-discriminating-prefix algorithm, Mike reviewed and approved all 15 (some with refined Memo_Tag and narrowed patterns vs the auto-generated draft). Tag distribution: 12 OVHD, 3 FOXM, 0 PHUB/FSOC/TLB. Account distribution: Bank charges, Dues and Subscriptions, Interest expense, Meals and entertainment, Software Subscriptions, Telephone — all 6 cross-referenced against live QBO Chart of Accounts (matched exactly). Workflow execution `8254` (post-seed) confirmed Load Categorization Rules now returns 66 active records (51 vendor + 15 description); both seed Purchases (id=182, id=183) correctly returned `match_method: "no_match"` because their PrivateNote text doesn't match any of the 15 seeded description patterns (correct semantic behavior — `^Interest` doesn't match "INTERAC E-TRANSFER FEE", `^INTERAC` is not in the seeded set). **Final combined coverage: 73.3% of total 5-year expense dollars** = $190,059.99 of $259,338.73. Breakdown: vendor rules cover $150,577.39 (58.1%), description rules cover $39,482.60 (15.2% absolute, 64.6% of vendor-less subset). Remaining ~26.7% is genuine long-tail (singleton vendors + singleton descriptions + 1 empty-description row). FOX-112 is now fully complete: schema extension shipped, both rule classes seeded, end-to-end auth + matching pipeline verified.
   - **FOX-114 three-night clean-run counter:** Mike enabled the workflow's schedule trigger at close-out 2026-05-15. **First night counts at 02:00 AM Toronto time 2026-05-16** (tonight). Need 3 consecutive clean nights before WRITE_TO_QBO can flip to true (with board approval).
   - **Intentional exclusions from the rule seed:**
     - **"Fox" vendor** — not seeded. Mixed-use (some Fox-related charges are intercompany Printhub.CA, some are personal). The review queue handles these case-by-case; a single regex rule would mis-categorize the non-dominant share.
     - **Ford-prefix rules** — seeded with `Account_Name=Vehicle Lease` and `Confidence=0.8`. **Pre-payout only.** When the Ford lease pays out and Mike transitions vehicle accounting (purchase vs new lease vs sold), the Ford rule will start mis-routing. Lease transition handling is a future task — update `Account_Name` or deactivate the rule then.
     - **698 vendor-less expense rows** (bank fees, interest charges, e-Transfer service charges) cannot be matched by vendor-regex rules at all. These need either (a) description-based rule pattern support (schema change), (b) QBO bank rules at source, or (c) a separate description-classifier pass when Vendor is empty. Out of scope for FOX-112; flagged for future iteration.

   **1b. Full-pipeline future production — `Rupc79GeJ8s6bbJa`** ("QBO Nightly Transaction Categorization")
   - Built April 18, 2026, **INACTIVE**, never executed.
   - 13 nodes: cron 7:00 UTC → Fetch QBO Classes → Query QBO Purchases → Rules Engine → Needs AI? → AI Categorize Transaction (OpenRouter Claude Haiku) → Parse AI Response → High Confidence? → Update QBO Transaction OR Submit to Review Queue. Plus a separate Monday 14:00 UTC cron → Send Weekly Bookkeeping Summary (Resend email).
   - Native QBO ClassRef (QBO Plus) instead of memo-tag prefixes.
   - Pulls uncategorized QBO transactions → fetches Classes → rules engine → AI fallback → routes by confidence.
   - QBO Classes fetched dynamically each run from `SELECT * FROM Class WHERE Active=true`.
   - High-confidence → `ClassRef` + `AccountRef` written to QBO line items (PrivateNote untouched).
   - Low-confidence → submitted to `/api/bookkeeping/review-queue` on foxmortgage.ca.
   - **⚠️ PRE-ACTIVATION: QBO Realm Must Be Switched to Sandbox First (audited 2026-05-04, still applies)**
     All 3 QBO nodes in `Rupc79GeJ8s6bbJa` currently have **production realm `9341456900727321`** hardcoded.
     Before attaching credentials, Michael must instruct Dev agent to update those URLs to sandbox realm `9341456901231490`.
     Do NOT activate against production QBO until Intuit App Assessment is approved.
   - Requires 3 consecutive clean dry-run nights (via 1a, not 1b) before flipping `WRITE_TO_QBO=true` here.
   - Board approval required before WRITE_TO_QBO is ever set to true.
   - **Activation checklist for `Rupc79GeJ8s6bbJa`:**
     0. (Michael instructs Dev) Update QBO realm in Fetch QBO Classes, Query QBO Purchases, Update QBO Transaction → `9341456901231490`
     1. Create `Master_Bookkeeping_Rules` + `Deferred_Revenue_Schedule` forms in Zoho Creator UI **— still outstanding; this is what blocks `Uu6fsZ2A2gTn0gBs` from returning 200 today.**
     2. Set `BOOKKEEPING_WEBHOOK_SECRET` in Vercel env vars ✅ **done 2026-05-15** (encrypted type, Production scope)
     3. In n8n `Rupc79GeJ8s6bbJa`: attach credentials to nodes:
        - "Fetch QBO Classes", "Query QBO Purchases", "Update QBO Transaction" → QuickBooks OAuth2 credential
        - "AI Categorize Transaction" → OpenRouter Header Auth credential
        - "Submit to Review Queue" → Header Auth: use the same **Fox Bookkeeping API** credential created for `Uu6fsZ2A2gTn0gBs` (id `6rVxjMhbq2zLOqqj`)
        - "Send Weekly Bookkeeping Summary" → `Resend API Paperclip` Header Auth credential
     4. Activate workflow in n8n UI

   **Bookkeeping service-account auth — FOX-112 implementation notes (2026-05-15):**
   - `BOOKKEEPING_WEBHOOK_SECRET` is set in Vercel Production with `type: "encrypted"`. **Do not use `vercel env add` from a pipe to set this** — the CLI stores piped values as `type: "sensitive"` which is write-only and silently presents as empty to `vercel env pull`. Use the Vercel REST API directly: `POST /v10/projects/{id}/env` with `{"type":"encrypted","target":["production"],"value":"<plaintext>"}`.
   - n8n credential **Fox Bookkeeping API** (id `6rVxjMhbq2zLOqqj`, project `JTCIC344s4l5JCyv`) is a Header Auth credential. **Name** field = `Authorization`, **Value** field = literal `Bearer <secret>` (the literal string `Bearer ` + the plaintext secret pasted directly). n8n Header Auth Value does **NOT** expand env expressions like `{{$env.FOO}}` — that pattern silently sends `{{$env.FOO}}` as the literal header value.
   - The `httpHeaderAuth` credential schema in the n8n public API requires an `allowedDomains` field. When creating via API, set it to `"https://www.foxmortgage.ca, https://foxmortgage.ca"`.
   - `middleware.ts` exempts `/api/bookkeeping/rules` and `/api/bookkeeping/dry-run-log` from Clerk's `authMiddleware` (commit `effbdb3`). Before this fix, Clerk intercepted unauthenticated service-account requests and returned `null` body 401 before the route handler's `isServiceAccount()` Bearer check could run. Any future bookkeeping route that wants service-account access must be added to `publicRoutes` alongside its own Bearer enforcement.
2. **Monthly Deferred Recognition** (FOX-113, in_progress) — 1st of each month, 3:00 AM America/Toronto
   - n8n workflow ID: `1iR3tvhFATxwFnj7` ("Bookkeeping — Monthly Deferred Revenue Recognition") — built 2026-05-17, INACTIVE
   - Cron: `0 3 1 * *`, active=false (manually enable once credential is attached)
   - 8 nodes: Schedule Trigger → Workflow Config (WRITE_TO_QBO=false, sandbox realm 9341456901231490) → Fetch Active Deferred Schedules → Recognition Engine (straight-line / per-session / percentage-of-completion) → Check Write Mode → Write QBO Stub (disabled) / Log Dry Run to API
   - **Credential setup required:** Attach existing "Fox Bookkeeping API" Header Auth credential (id `6rVxjMhbq2zLOqqj`) to "Fetch Active Deferred Schedules" and "Log Dry Run to API" nodes in n8n UI. This cannot be done via API (the credential was created by SDK placeholder `newCredential()`).
   - **D2 AI Fallback live (2026-05-22):** `Uu6fsZ2A2gTn0gBs` extended to 16 nodes with OpenRouter AI fallback for unmatched transactions. Active version `ee34c1f9`. Confidence routing: ≥0.85 → dry-log, 0.50–0.84 → review queue, <0.50 → skip. WRITE_TO_QBO still false.
   - Admin UI (D6) already live: `app/portal/bookkeeping/page.tsx`, `review-queue/page.tsx`, `projects/page.tsx`
3. **Weekly Summary Email** (FOX-114) — Mondays 7:00 AM America/Toronto
   - Aggregates QBO stats + review queue + deferred schedules → Resend email to mfox@foxmortgage.ca
   - n8n workflow ID: TBD (pending FOX-114 completion)

#### QBO Realms
- **Sandbox:** `9341456901231490` — all dev/test here
- **Production:** `9341456900727321` — DO NOT touch until Intuit App Assessment approved

#### Zoho Creator
- **App:** `creator.zoho.com/2802551ontarioinc/bookkeeping`
- **Forms:** Bookkeeping_Review, Production_Projects, Production_Milestones, Master_Bookkeeping_Rules, Deferred_Revenue_Schedule
- **Creator utility:** `lib/zoho-creator.ts` — uses isolated `ZOHO_CREATOR_*` env vars (NOT the CRM token)
- **Env vars (Vercel):** `ZOHO_CREATOR_CLIENT_ID`, `ZOHO_CREATOR_CLIENT_SECRET`, `ZOHO_CREATOR_REFRESH_TOKEN`
  - Scopes: `ZohoCreator.report.READ`, `ZohoCreator.form.CREATE`, `ZohoCreator.report.UPDATE`, `ZohoCreator.meta.READ`
  - These are Creator-specific — completely isolated from CRM `ZOHO_REFRESH_TOKEN`

#### Proxy Routes (`/api/bookkeeping/*`)
| Route | Method(s) | Data source | Status |
|---|---|---|---|
| `/review-queue` | GET | Zoho Creator — Bookkeeping_Review | ✅ live |
| `/projects` | GET, POST, PATCH | Zoho Creator — Production_Projects | ✅ live |
| `/milestones` | GET, POST | Zoho Creator — Production_Milestones | ✅ live |
| `/rules` | GET, POST, PATCH | Zoho Creator — Master_Bookkeeping_Rules | ✅ live |
| `/schedules` | GET, POST, PATCH | Zoho Creator — Deferred_Revenue_Schedule | ✅ live |
| `/deferred-schedules` | GET | Zoho Creator — Deferred_Revenue_Schedule | ✅ live |
| `/chart-of-accounts` | GET, POST | Static seeded list (QBO OAuth pending) | ✅ live |
| `/dry-run-log` | GET, POST | In-memory (n8n calls POST when WRITE_TO_QBO=false) | ✅ live |
| `/weekly-summary` | GET | Zoho Creator (live) + QBO (stub until FOX-112 QBO OAuth) | ✅ live |

#### Known Footguns (Bookkeeping pipeline / Vercel infra)

- **Vercel CLI `vercel env add` poisons env vars as `type=sensitive`.** When you `vercel env add <NAME> <env>` and pipe a value via stdin (or paste it interactively), the CLI silently creates the var with `type: "sensitive"`. Sensitive-type vars are write-only from the API: `vercel env pull` returns them as empty strings, and the Next.js runtime can sometimes read them as `undefined` even though the CLI says "Added". **Never use `vercel env add` from CLI for service-account secrets or any non-sensitive values.** Hit this bug twice on 2026-05-15: once with `BOOKKEEPING_WEBHOOK_SECRET` (FOX-112 first 401 cascade), once with `ZOHO_CREATOR_CLIENT_ID` / `ZOHO_CREATOR_CLIENT_SECRET` / `ZOHO_CREATOR_REFRESH_TOKEN` (FOX-112 503 cascade after the first fix). Use the Vercel dashboard UI or POST directly to the REST API:
  ```
  curl -X POST "https://api.vercel.com/v10/projects/{projectId}/env?teamId={teamId}" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"key":"NAME","value":"plaintext","type":"encrypted","target":["production"]}'
  ```
  Encrypted-type vars ARE readable via `vercel env pull` (returns plaintext) and visible to the runtime. Recovery procedure when you find a poisoned sensitive-type var: pull the value from another scope (often Development still has the working `type=encrypted` copy via `vercel env pull --environment development`), DELETE the poisoned Production entry by id, POST a new entry with `type:"encrypted"`. Same pattern used to recover both incidents.

- **QBO Query Language footgun: nested-property filters not supported on the `Purchase` entity.** `SELECT * FROM Purchase WHERE AccountRef.name = 'X'` is rejected by Intuit with `QueryValidationError: Property AccountRef.name not found for Entity Purchase` (code 4001). QBO's SQL-like dialect only allows filtering on top-level properties of an entity. On `Purchase`, the `AccountRef` field refers to the bank/cash account the Purchase was drawn from (top-level — and queryable as `AccountRef`), while the expense category lives at `Line[].AccountBasedExpenseLineDetail.AccountRef`, which is nested and NOT queryable. For Purchase queries, filter at the top level (`TxnDate`, `DocNumber`, `TotalAmt`, top-level `AccountRef = '<id>'`) and apply line-level filters in JavaScript after fetching. Same principle applies to other transaction entities that have `Line[]` collections (Bill, Invoice, JournalEntry, etc.).

- **Zoho Creator returns HTTP 404 + `{"code":3100,"message":"No records found"}` for empty reports, not `200` + `{"data":[]}`.** All read-side functions in `lib/zoho-creator.ts` must treat 404 as `[]`, not throw. Pattern is documented in `getReviewQueue` and now applied to all four other read functions as of commit `6b9c0ac`. If a future engineer adds a fifth read function, copy the 404→[] guard.

- **n8n public API can't read or update credential data.** `GET /api/v1/credentials/{id}` returns 403, `PATCH` doesn't exist. The only way to update a credential's stored secret is DELETE then POST a new one — which orphans existing workflow-node bindings until each workflow is re-PUT with the new credential id. When rotating an n8n credential, plan to PUT every workflow that referenced the old id.

- **n8n `httpHeaderAuth` credentials require `allowedDomains`.** When creating via the public API: `POST /api/v1/credentials` body must include `data.allowedDomains` (string, comma-separated list of allowed origins) or the call returns 400 `request.body.data requires property "allowedDomains"`. UI creation handles this silently.

#### Admin UI (`/portal/bookkeeping/*`)
- `/portal/bookkeeping` — landing page with queue count, quick actions
- `/portal/bookkeeping/review-queue` — inline approve/correct/reject
- `/portal/bookkeeping/projects` — production contracts + milestones
- Auth: Clerk admin role check (same as `/portal/admin/*`)

#### QBO Class Tracking (business line attribution — QBO Plus)
**SUPERSEDES memo-tag convention.** QBO upgraded to Plus April 18, 2026. Native classes replace memo-tag prefixes.
- `Fox Mortgage` — commissions, FSRA licences, legal
- `Printhub` — shipping, courier, production costs
- `Fox Social` — SaaS revenue, email services
- `Left Bench` — coaching, video conferencing
- `Overhead` — utilities, software, insurance, bank charges
- Classes are assigned via `ClassRef` on each `AccountBasedExpenseLineDetail` line item
- PrivateNote (Memo) field is LEFT UNCHANGED — original vendor description preserved
- `Suggested_Memo_Tag` field in Zoho Creator Bookkeeping_Review now stores QBO class name (string)
- Run QBO Class reports for business line P&L breakdowns natively in QuickBooks

#### n8n Field Names (Submit to Review Queue node)
`Transaction_ID`, `Vendor_Name`, `Amount`, `Transaction_Date`, `Suggested_Account`, `Suggested_Memo_Tag` (stores QBO class name), `Confidence_Score`, `Match_Method`, `AI_Notes`

#### QBO Projects (Research Finding — April 18, 2026)
- QBO Projects available on Plus tier via `ProjectRef` on transactions
- Does NOT support percentage-of-completion natively — tracks actual vs. estimated costs only
- Decision: Keep Zoho Creator `Production_Projects` + `Production_Milestones` for revenue recognition scheduling
- QBO Projects may be added as Phase 1b enhancement for Printhub job cost grouping in QBO reports
- When added: link Printhub transactions to a QBO Project via `ProjectRef` field alongside `ClassRef: Printhub`

#### Dry-Run Safety Procedure
1. `WRITE_TO_QBO=false` in n8n workflow variables → logs to `/api/bookkeeping/dry-run-log`
2. Run 3 consecutive clean nights
3. Post dry-run log summary to FOX-111 for Michael's review
4. Michael signs off → request board approval → flip `WRITE_TO_QBO=true`

#### QBO Account IDs (Sandbox)
| ID | Name | Purpose |
|---|---|---|
| 1150040000 | Fox Social - Subscription Revenue | FSOC recognized revenue |
| 1150040001 | Left Bench - Coaching Revenue | TLB per-session revenue |
| 1150040002 | Left Bench - Platform Revenue | TLB subscription revenue |
| 1150040003 | Deferred Revenue | Unearned revenue parking lot |
| 1150040004 | Printhub - Product Revenue | PHUB product sales |
| 1150040005 | Fox Mortgage - Commission Income | FOXM commissions |

### Pending Webhooks for Agents
- SMM leads webhook — agents need this to check new SMM enrollments
- Investor deals webhook — agents need this to check deal/position status

---

---

## foxmortgage.ca Portal

### Stack
- Next.js 14.2.5, TypeScript, Tailwind CSS
- @clerk/nextjs@5.7.5 (v7 incompatible with Next 14 — do NOT upgrade)
- Vercel auto-deploy on push to main
- GitHub: Foxmortgage2020/foxmortgage-ca
- Live: foxmortgage-ca.vercel.app

### Brand
- Navy: #032133, Lime: #95D600
- font-heading (Poppins Bold), font-body (Montserrat)
- Never: "broker/advisor" → always "Mortgage Agent, Level 2"
- Never: "Ownwell" → always "Strategic Mortgage Monitoring"
- BRX Mortgage in footer/compliance only

### Clerk Auth
- Instance: Fox Mortgage Portal (app_3BY7FSpczB6qgnzpRdoExVjxMiw)
- Middleware: authMiddleware from @clerk/nextjs/server (NOT clerkMiddleware — v5 API)
- Public routes: /, /about, /services, /smm, /contact, /apply, /private-lending, /portal/sign-in, /portal/sign-in/(.*)
- ClerkProvider: afterSignInUrl="/portal" afterSignUpUrl="/portal" (hardcoded literals — NOT env vars)
- currentUser() for server-side metadata access (NOT auth() — sessionClaims don't include publicMetadata in v5)

### Role System (Clerk publicMetadata)
- Admin: { "roles": ["admin"] } → /portal/admin
- Investor only: { "roles": ["investor"] } → /portal/investor/dashboard
- Realtor: { "roles": ["realtor"] } → /portal/dashboard
- Multi-role: { "roles": ["realtor", "investor"] } → /portal/dashboard + switcher
- Always use roles[] array, never role string alone

### Portal Routes
- /portal → redirect hub (reads Clerk metadata, routes to correct portal)
- /portal/admin → admin KPI dashboard
- /portal/dashboard → realtor + financial planner portal (9 pages)
- /portal/investor/dashboard → investor portal (9 pages)
- /portal/(auth)/sign-in/[[...sign-in]] → Clerk SignIn component, no sidebar

### Zoho CRM Integration
- Module: Deals (NOT Potentials — that module doesn't exist)
- Org ID: 906105026
- OAuth client: 1000.MK2DFJKKFZGXXFRULONF16GW8TI81I
- Env vars: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID
- CRM utility: lib/zoho.ts — getZohoCRMToken(), getInvestorPositions(), getInvestorOpportunities(), getInvestorDeal()
- Investor fields: Investor_Name (lookup→Partners module), Investor_Amount, Investor_Rate, Deal_Status_Investor
- Investor linked via zoho_partner_id in Clerk publicMetadata

### Test Users
- Admin: mfox@foxmortgage.ca (user_3BYB3x4imxXSRxxWmMpOnmiAcv6)
- Live investor partner: tersignicorp@gmail.com — Dominic Tersigni
  zoho_partner_id: 7112178000001393118
  Production Clerk record exists (do not reference dev-pool userId).
  Clerk metadata shape: {roles: "investor", zoho_partner_id: "..."}
  Note: Clerk has display name "Domenic" (with e); Zoho has "Dominic" (with i). Zoho is canonical — banner will show "Dominic".
  Two real Zoho positions: IFMS-F002684 (Hamilton, $500K, 12%) + BRXM-F024629 (Thorndale, $85K, 12%)

### Resend Configuration
- Verified domain: app.foxmortgage.ca (verified, North Virginia us-east-1)
- foxmortgage.ca is NOT verified — never use as from address
- All outgoing emails must use @app.foxmortgage.ca
- Sending address: michael@app.foxmortgage.ca
- n8n credential: "Resend API Paperclip" (Header Auth)
  - Name field: Authorization
  - Value field: Bearer re_[key]
- SMM welcome emails: use existing "Resend API" credential
- Paperclip briefing emails: use "Resend API Paperclip" credential

### Paperclip & Automation

**Paperclip** is the Fox Mortgage AI operations platform running locally at `http://localhost:3100`.

#### Infrastructure
- **launchd service:** `ca.foxmortgage.paperclip` — starts on macOS login, auto-restarts on crash
  - Manage: `launchctl start|stop|unload ca.foxmortgage.paperclip`
  - Logs: `~/.paperclip/logs/launchd.log` / `launchd-error.log`
- **Company ID:** `eebfd2ee-304a-49c0-8e20-909291d01583`
- **API:** `http://localhost:3100/api` (no auth in local_trusted mode)

#### Agents
| Agent | Role | Daily Schedule |
|---|---|---|
| CEO | Strategy & board briefings | 6:00 AM |
| CMO | Content & social monitoring | 7:00 AM |
| Client Success Manager | Enrollment check | 9:00 AM |
| Investor Relations Manager | Deal monitoring | 10:00 AM |

All 4 agents have direct n8n MCP access via `--mcp-config /Users/user/.paperclip/mcp/n8n.json`.

#### Email Routing (Paperclip → n8n → Resend)
All agent emails route through n8n webhook `fox-briefing-and-alerts` → Resend API.
- **From address:** `michael@app.foxmortgage.ca` (verified domain only)
- **Credential in n8n:** `Resend API Paperclip` (ID: `iJa8AHPr58GmNMda`)
- **Briefing workflow:** `dceYGLjOIRQAuS0p` (built, awaiting activation by Michael)

#### n8n Webhooks (foxmortgage.ca routes)
- `FP_REFERRAL_WEBHOOK_URL` ✅ — `https://foxmortgage.app.n8n.cloud/webhook/fp-portal-referral` (active)
- `FP_MESSAGE_WEBHOOK_URL` ✅ — `https://foxmortgage.app.n8n.cloud/webhook/fp-portal-message` (active)
- SMM leads webhook — for agents to check new SMM enrollments (not yet built)
- Investor deals webhook — for agents to check deal/position status (not yet built)

### n8n Workflow Status (audited 2026-05-04)
- `dceYGLjOIRQAuS0p` Fox Mortgage — Daily Briefing & Alerts ✅ active
- `CZ1zh0gKvkQuTBMc` Fox Mortgage — SMM Lead Monitor ✅ active (since 2026-04-21)
- `Rupc79GeJ8s6bbJa` QBO Nightly Transaction Categorization (FOX-107 full pipeline, AI + review queue + weekly summary) ❌ inactive — production realm still hardcoded; needs Zoho forms + sandbox realm migration before activation
- `Uu6fsZ2A2gTn0gBs` Bookkeeping — Nightly Transaction Categorization ✅ active, 16 nodes, D2 AI Fallback live (published 2026-05-22, active version `ee34c1f9`). WRITE_TO_QBO=false. Three-night gate met; pending Mike sign-off + board approval to flip write mode.
- `dh1qIttAuctSQ7L0` Daily Deal Briefing ✅ active (built 2026-04-07)

### Known Issues / In Progress
- Investor dashboard crashes on load — API fix in progress (use currentUser() not auth())
- Paperclip DB missing `pg_trgm` PostgreSQL extension — Paperclip API write operations (PATCH/POST) return 500. Read-only works. Needs Paperclip infrastructure fix.
- Zoho credential leak: .env.local.save was accidentally committed and removed. Consider rotating ZOHO_REFRESH_TOKEN.
- CLAUDE.md needs update after each session

### API Route Pattern
All investor API routes use currentUser() from @clerk/nextjs:
```
const user = await currentUser()
const metadata = user.publicMetadata as { zoho_partner_id?: string, roles?: string[] }
```

### What NOT to do
- Never install @clerk/nextjs v7+ (breaks Next 14)
- Never use auth() for publicMetadata — use currentUser()
- Never hardcode blogId or investor data — always from Zoho
- Never use MOCK_USER_ROLES — always read from real Clerk user

---

## Session Update — March 28, 2026

### Domain & Production
- Live at foxmortgage.ca (A record → 216.150.1.1)
- www.foxmortgage.ca (CNAME → cname.vercel-dns.com)
- Clerk switched to Production instance (pk_live_ keys active)
- No "Development mode" banner — fully production

### Zoho — New Custom Fields on Deals Module
Three new fields added — use these as source of truth:
- Investor_Status (Picklist): "Active" | "Renewal In Progress" | "Renewed" | "Paid Out" | "Legal"
- Investor_Payout_Date (Date): exact date principal returned to investor
- Renewal_In_Progress (Boolean): true when past maturity but continuing

### Income Calculation Rules (CRITICAL)
Always use Investor_Status as source of truth:
- "Active" | "Renewal In Progress" | "Renewed" → income continues to today
- "Paid Out" → income stops at Investor_Payout_Date (fallback: Maturity_Date)
- "Legal" → income stops at Maturity_Date

Helper functions (copy to any new page):
```
const isIncomeActive = (p) =>
  ['Active', 'Renewal In Progress', 'Renewed'].includes(p.Investor_Status)
  || (!p.Investor_Status && p.Deal_Status_Investor !== 'Matured')

const getIncomeEndDate = (p) => {
  const today = new Date()
  if (p.Investor_Status === 'Paid Out') {
    if (p.Investor_Payout_Date) return new Date(p.Investor_Payout_Date)
    if (p.Maturity_Date) return new Date(p.Maturity_Date)
  }
  if (p.Investor_Status === 'Legal') {
    if (p.Maturity_Date) return new Date(p.Maturity_Date)
  }
  return today
}
```

### Status Badge System
- Active (within 90 days of maturity) → "Maturing Soon" yellow
- Active → "Performing" green
- Renewal In Progress → "Renewal Pending" blue
- Renewed → "Performing" green
- Paid Out → "Paid Out" gray
- Legal → "In Legal" red

### Opportunities System
- Deal_Status_Investor = "Available" → appears on Opportunities page
- When investor commits → change to "Committed"
- Opportunities API handles empty Zoho response (204) gracefully

### Adding New Investors (Process)
1. Create Partners record in Zoho CRM → note record ID
2. Link their deals in Zoho: set Investor_Name, Investor_Amount, Investor_Rate, Investor_Status, Lender_Fee
3. Create Clerk account in Production instance
4. Set publicMetadata: { "roles": ["investor"], "zoho_partner_id": "ZOHO_PARTNER_RECORD_ID" }
5. Investor can log in immediately — all data flows automatically

### Pages Rebuilt This Session
All investor portal pages rewritten with live Zoho data:
- /portal/sign-in → custom form with background image, forgot password
- /portal/investor/dashboard → full rebuild with chart, insights, opportunities, cash flow timeline, Investor_Status-driven KPIs
- /portal/investor/portfolio → My Investments with correct status badges
- /portal/investor/portfolio/[id] → Investment Details with Investment Snapshot, What Happens Next, dynamic notes
- /portal/investor/statements → renamed to "Reports", computed from real deal data, annual summary, request-based PDFs
- /portal/investor/profile → Profile Completion bar, Account Status cards, real Clerk name/email, banking info removed
- /portal/investor/support → Clerk auto-fill, action shortcuts, success state

### Domenic Tersigni — Current Deal Status
- Hamilton IFMS-F002684: Paid Out, payout Aug 13 2024, no lender fee
- Millgrove BRXM-F024213: Renewal In Progress, $500K, 12%, $10K fee
- Thorndale BRXM-F024629: Paid Out, payout May 15 2025, $85K, $1.7K fee
- Active monthly income: $4,167/month (Millgrove only)

### Zoho Fields Required in getInvestorPositions() query
Deal_Name, Amount, Investor_Amount, Investor_Rate, Investor_Name,
Deal_Status_Investor, Investor_Status, Investor_Payout_Date,
Renewal_In_Progress, Mortgage_Type, Mortgage_Rate, Payment_Amount,
Payment_Frequency, Street, City, Province, Purchase_Price_Value,
Maturity_Date, Stage, Rate_Type, Term_Type, Exit_Strategy,
Lender_Notes, First_Payment_Date, Total_Loan_Amount, LTV,
Closing_Date, Lender_Fee

### Pending (Next Session)
- Opportunities page review and cleanup
- Documents page review
- Private lender onboarding flow (Zoho Sign KYC)
- Investor_Status data model prompt still pending (income logic fix across all pages)
- Send Domenic his portal invite

## Financial Planner Partner Portal (FOX-8)

### Routes
All FP portal routes live under /portal/fp/:
- /portal/fp/dashboard
- /portal/fp/clients
- /portal/fp/clients/[id]
- /portal/fp/add-referral
- /portal/fp/messages
- /portal/fp/support

API routes live under /api/portal/fp/.

### Auth
- Clerk role key: financial-planner
- Added to publicMetadata.roles[] array
- Always use currentUser() for FP identity and publicMetadata — never auth()
- Clerk publicMetadata fields: fp_name, fp_firm, fp_zoho_id, fp_zoho_contact_id

### Zoho
- Deals filtered by FP_Email field matching logged-in FP's Clerk email
- Custom fields on Leads: FP_Name, FP_Firm, FP_Email, Referral_Goal, Best_Contact_Time, Property_Value, Annual_Income
- Custom fields on Deals: FP_Email, Next_Review_Date, Savings_Identified
- Messages stored as Zoho Activity Notes — never in a separate DB
- Per-client messages: Note_Type = FP_Message on Deal record
- General inbox messages: Note_Type = FP_General_Message on FP Contact record

### n8n Webhooks
- FP_REFERRAL_WEBHOOK_URL — workflow "FP Portal — Referral Submission"
  Triggers: Zoho Lead creation + 3 emails (Michael, FP confirmation, referred client welcome)
- FP_MESSAGE_WEBHOOK_URL — workflow "FP Portal — Messaging"
  Handles two types via IF branch: client_message (Note on Deal) and general_message (Note on Contact)

### Resend in n8n
- Credential name: "Resend API Paperclip" (Header Auth type)
- The Authorization header already contains the full Bearer token
- Select this credential on HTTP Request nodes — do not manually set Authorization header

### Stage Mapping (Zoho Deal Stage → 9-stage UI tracker)
- Qualification → 1. Inquiry
- Needs Analysis → 2. Application
- Value Proposition → 3. Documents
- Id. Decision Makers → 4. Appraisal
- Perception Analysis → 5. Lender Submission
- Proposal/Price Quote → 6. Commitment
- Negotiation/Review → 7. Conditions
- Lawyer → 8. Lawyer
- Closed Won → 9. Funded
- Closed Lost → N/A (closed badge)

### FP Provisioning (manual)
Michael assigns financial-planner role manually in Clerk dashboard.
Set publicMetadata: { "roles": ["financial-planner"], "fp_name": "...", "fp_firm": "...", "fp_zoho_id": "...", "fp_zoho_contact_id": "..." }
To revoke: remove financial-planner from roles array.

### Phase Status
- Phase 1: Complete — all 6 routes live with mock data (commit 8ce7976)
- Phase 2: In progress — live Zoho data wiring + n8n webhooks (FOX-48)
- Phase 3: Pending — DialPad webhook integration

## SMM Page — /smm (FOX-49)

**Status:** Complete — April 7, 2026
**File:** `app/smm/page.tsx`
**Final commit:** c935cdb

### Key facts baked into the page
- Enrolled count: 73 mortgages monitored (update this number as enrollment grows)
- Client touchpoint: monthly homeownership report
- Proactive contact: only when a savings opportunity exists
- No Google reviews yet — star rating omitted until collected
- Testimonials: Ian C. (Guelph) and Joe J. (Guelph) — approved April 7, 2026

### Design decisions
- One conversion action only — both CTAs link to /smm/enroll
- No exit ramps — "Book a Call" and "View Report" removed
- Em dashes prohibited in all body copy on this page
- Three deliberate em dash exceptions (do not remove):
  1. Hero CTA button: "Enroll Free — Takes 2 Minutes →"
  2. Supporting proof line below testimonials
  3. Testimonials section comment
- Video: Wistia embed, media-id kaon6ntu81, hosted externally
- Narrative section uses lime green divider (w-16 h-px bg-[#95D600]) between problem setup and payoff line

### Page section order
1. Hero (H1, subheadline, CTA, trust bar)
2. Narrative ("Most mortgage advice shows up at the transaction")
3. Video (Wistia embed kaon6ntu81)
4. How It Works (3 navy cards, steps 01/02/03)
5. What We Watch (navy section, 2x2 grid)
6. Testimonials (Ian C. and Joe J.)
7. FAQ (accordion, React useState, no external library)
8. Final CTA with curiosity line above button
9. Compliance footer strip

### Wistia embed notes
- media-id: kaon6ntu81
- Loaded via next/script with strategy="afterInteractive"
- TypeScript global declaration added for wistia-player custom element
- Hydration warning on inline style block is pre-existing and benign — do not attempt to fix

### Next actions on this page
- Update enrolled count (currently 73) as SMM grows
- Add Google rating to trust bar once reviews are collected
- Add additional testimonials as collected — see comment in file above testimonials section
- BRX Mortgage compliance review before driving paid or significant organic traffic to this page

## Deal Briefing & Email Monitor Workflows

### Michael — Daily Deal Briefing
- **Workflow ID:** `dh1qIttAuctSQ7L0`
- **n8n instance:** foxmortgage.app.n8n.cloud
- **Status:** Built and tested, currently INACTIVE — Michael to activate from n8n UI after reviewing the two test emails (Resend message IDs `7af9d757-76fb-4e6b-873c-03fc05afe770` and `23135620-a400-434d-9fe0-9fa6c844c9ff`, both sent 2026-04-07 to mfox@foxmortgage.ca)
- **Schedule when activated:** 5:45 AM America/Toronto daily (cron `45 5 * * *`), plus a manual-test webhook at `POST https://foxmortgage.app.n8n.cloud/webhook/deal-briefing-test`
- **Credentials used:**
  - Zoho: `zohoOAuth2Api` id `z1jUVqbuGO3MSJUE` name "Zoho account" (the working Fox Mortgage credential, not "260126-1439-Zoho" from the brief — that credential name does not exist; closest match is "260126-1257-AEST-Zoho" id `a053GmNoQPrMyYAS` but it is `oAuth2Api` generic, not `zohoOAuth2Api` predefined)
  - Resend: `httpHeaderAuth` id `iJa8AHPr58GmNMda` name "Resend API Paperclip"
- **From/To:** michael@app.foxmortgage.ca → mfox@foxmortgage.ca
- **Current report sections:** (1) Tasks Due Today, (2) Pipeline By Stage (ordered: Pending → Collecting Documentation → Options → Conditionally Approved → Underwriting In Progress → Additional Properties-as-summary), (3) Renewals Within 90 Days
- **Sections from the brief that were DROPPED and why:**
  - "Needs Action Today / Stalled Deals" — `Last_Activity_Time` on this Zoho instance is auto-populated by the Finmo sync (every deal shares the same timestamp `2026-04-01T06:06:47-04:00`), so stall detection would flag all 109 open deals every day. No reliable per-deal activity signal exists. Note included at bottom of email. Re-introduce once activity is tracked via Notes or Tasks.
  - "Emails Awaiting Reply" — Zoho CRM's Emails API is per-record only, not queryable in bulk. The brief's assumption of a filterable Emails module with a `Replied` boolean does not match Zoho's data model. Scope explicitly dropped by user.
  - "Days in current stage" warnings — `Stage_Modified_Time` is null on every deal. Brief's stage-age threshold flags would be meaningless.
- **Terminal stages filtered out of pipeline view:** Archive, Closed, Lost, Mortgage Funded, Mortgage Lost (118 deals filtered, 76 kept as open)
- **Zoho fields confirmed working:** Deal_Name, Stage, Contact_Name, Closing_Date, Modified_Time. `Next_Step` and `FP_Email` were requested by the brief but not verified — code tolerates them being absent.

### Inbound Email Monitor
- **NOT BUILT.** Scope explicitly dropped by user because Zoho CRM's Emails API does not support bulk querying of inbound messages with date filters. The brief's every-30-minute polling approach would require per-deal email fetches against a 200-calls/minute rate limit and would not have a reliable way to detect "unanswered" without walking every email thread. Revisit when we have a real mail pipeline (Gmail API, Outlook/Graph API, or Resend inbound routing).

---

## FP Portal — Financial Planner Setup (April 9, 2026)

### Ben Zavitz — First FP Partner
- Name: Ben Zavitz
- Firm: Wealth Labs
- Real email: hello@wealthlabs.ca
- Zoho Partner record ID: 7112178000003669036
- Clerk user ID (Fox Mortgage Portal production): user_3C8vdzYzbfqsdhhoBl6KHHw7VCN
- Clerk instance: ins_3BajmGzbhbmTjTaZDpsx0ozeU6x (Fox Mortgage Portal production sk_live_)
- Role: financial-planner
- Referred files: BRXM-F053675 (Melissa Cohoe), BRXM-F053724 (Gianna Reinders), BRXM-F053725 (Tyler Bannerman)
- Portal access: foxmortgage.ca/portal
- Invitation sent: April 9, 2026

### Zoho CRM — FP Portal Architecture
- FP partners linked to mortgage files via Referral_Partner lookup field
- Referral_Partner.id = Zoho Partner record ID = fp_zoho_id in Clerk publicMetadata
- FP_Email field does NOT exist on Potentials module — use Referral_Partner instead
- Portal queries: criteria=(Referral_Partner:equals:{fp_zoho_id})
- Module: Potentials (API name) = Mortgages (UI name)

### Clerk publicMetadata for FP role
{
  "roles": ["financial-planner"],
  "fp_name": "Ben Zavitz",
  "fp_firm": "Wealth Labs",
  "fp_zoho_id": "7112178000003669036",
  "fp_zoho_contact_id": "7112178000003669036"
}

### FP Portal Routes
- /portal/fp/dashboard — stats filtered by Referral_Partner ID
- /portal/fp/clients — client list filtered by Referral_Partner ID
- /portal/fp/clients/[id] — client detail with progress bar, mortgage details, activity tabs
- /portal/fp/messages — general messages (uses email lookup — update when real email is set)
- /portal/fp/add-referral — referral submission form

### Stage Mapping — Zoho → FP Portal Progress Bar
| Zoho Stage | Milestone # |
|---|---|
| Lead | 1 |
| Application Started | 2 |
| Collecting Documentation | 3 |
| Underwriting In Progress | 4 |
| Ready to Submit | 5 |
| Submitted to Lender | 6 |
| Conditionally Approved | 7 |
| Broker Complete | 8 |
| Mortgage Funded | 9 |
| Mortgage Lost | 0 (Closed badge) |

### FP Portal Confirmed Zoho Fields (Potentials module)
Working: Deal_Name, Contact_Name, Amount, Mortgage_Rate, Stage,
Closing_Date, Mortgage_Type, Referral_Partner, Street, City,
Province, Zip_Code, LTV, Total_Loan_Amount, Purchase_Price_Value
Not working / don't exist: FP_Email, Next_Review_Date,
Savings_Identified, Last_Activity_Time, Term_Years

### Dialpad Integration (Pending)
- Dialpad → Zoho CRM native connection exists but needs verification
- Call summaries not yet appearing in Zoho
- FP portal has Activity tab stubbed with "Call summaries will
  appear here once Dialpad is connected"
- Build this in a future session

### Adding Future FP Partners
1. Create Partner record in Zoho CRM → note record ID from URL
2. Create Clerk user in Fox Mortgage Portal production instance
   (NOT Content OS instance — different Clerk instance)
3. Set publicMetadata with roles, fp_name, fp_firm, fp_zoho_id
4. Link their referred mortgage files via Referral_Partner field in Zoho
5. Send portal invite email
