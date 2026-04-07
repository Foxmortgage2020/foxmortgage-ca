# foxmortgage.ca — Claude Code Build Context

## Last Updated: April 4, 2026

---

## Current Status (April 4, 2026)

### Financial Planner Portal
- **Phase 1** ✅ live (commit `8ce7976`) — all 6 routes with static/mock data; Clerk role: `financial-planner`
- **Phase 2** ⏳ pending — requires two n8n webhooks not yet built:
  - `FP_REFERRAL_WEBHOOK_URL` — Financial Planner submits a referral
  - `FP_MESSAGE_WEBHOOK_URL` — Financial Planner sends a message
- **Zoho custom fields to create before Phase 2:**
  - Leads module: `FP_Name`, `FP_Firm`, `FP_Email`, `Referral_Goal`
  - Deals module: `Next_Review_Date`, `Savings_Identified`, `FP_Email`
- **Phase 3** ❌ not started — DialPad integration (pending FOX-8 board approval)

### Investor Portal
- Dashboard crashes on load — fix: use `currentUser()` not `auth()` in API routes

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
- Test investor: info@justsigns.ca — Domenic Tersigni (user_3BYZ7HAhZmLoXk2XPa8j4xJyT3A)
  zoho_partner_id: 7112178000001393118
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

#### Pending n8n Webhooks (for foxmortgage.ca routes)
- `FP_REFERRAL_WEBHOOK_URL` — Financial Planner portal referral submit (not yet built)
- `FP_MESSAGE_WEBHOOK_URL` — Financial Planner portal message submit (not yet built)
- SMM leads webhook — for agents to check new SMM enrollments (not yet built)
- Investor deals webhook — for agents to check deal/position status (not yet built)

### Known Issues / In Progress
- Investor dashboard crashes on load — API fix in progress (use currentUser() not auth())
- Zoho credential leak: .env.local.save was accidentally committed and removed. Consider rotating ZOHO_REFRESH_TOKEN.
- Double arrow → → on homepage card links (cosmetic, fix next session)
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
