# foxmortgage-ca Portal Audit, July 2026

Session 1 of the Admin Command Center build. Audited 2026-07-09 against branch
`admin-command-center-s1` (cut from `origin/main` at `d91df6a`). CLAUDE.md was last
updated 2026-05-22 and had drifted badly; this document is the corrected baseline.

How things were verified is stated per finding: "code" = static inspection of this
repo, "live" = an authenticated API call made during the audit (endpoint and result
quoted). Statements sourced only from CLAUDE.md are labeled as such.

## 1. Route inventory

Full inventory as of 2026-07-09. Status verdicts are from static inspection; "live
data" means the wiring is present in source, not that every path was executed.

### Public site
| Route | Status |
|---|---|
| `/`, `/about`, `/services`, `/apply`, `/smm`, `/privacy-policy`, `/terms-of-service`, `/legal/bookkeeping-agent-privacy` | works (static copy) |
| `/refinance`, `/penalty` | works (client calculators, lib engines + Bank of Canada rate) |
| `/smm/enroll` | live data (Zoho upsert + n8n + Resend) |
| `/private-lending` | RESOLVED 2026-07-09 hotfix: inquiry form was a console.log stub losing submissions; now persist-first (form_submissions table + Zoho Lead + email) |
| `/private-lending/apply` | live data (createPartner + Resend) |
| `/contact` | RESOLVED 2026-07-09 hotfix: was a console.log stub losing submissions; now persist-first (form_submissions table + Zoho Lead + email) |

### /tools (9 routes)
`/tools`, `mortgage-calculator`, `debt-service`, `maximum-mortgage`, `prepayment-penalty`,
`purchase-calculator`, `purchase-compare`, `renewal-compare`, `required-income` — all work,
client-side compute only.

### Portals
| Area | Status |
|---|---|
| `/portal/admin` + `partners/*` | live data (rebuilt this session; partners pages untouched) |
| `/portal/fp/*` (5 pages) | live data (Potentials via Referral_Partner) |
| `/portal/realtor/*`, `/portal/lawyer/*`, `/portal/mortgage-agent/*` (5 pages each) | live data; the three namespaces are clones (lawyer and mortgage-agent alias the realtor functions in lib/zoho.ts) |
| `/portal/investor/(active)/*` (7 pages) | live data (Deals via Investor_Name); `opportunities/[id]` has a hardcoded documents array |
| `/portal/bookkeeping` + `review-queue` + `projects` | live data (Zoho Creator) |
| `/portal/dashboard` | works (retired mock, now a role-dispatch redirect) |
| Legacy top-level pages: `/portal/clients` (+`[id]`), `/portal/reports` | mock data, orphaned from nav (see section 8) |
| Legacy `/portal/add-referral` | RESOLVED 2026-07-09 hotfix: now an authenticated, attributed persist-first intake |
| `/portal/training`, `/portal/assets`, `/portal/compliance`, `/portal/support` | works (static, legacy realtor surface) |

### API routes
- `admin/*` (7 routes: dashboard, partners, impersonate, invites, documents): live, admin-gated via currentUser().
- `bookkeeping/*` (13 routes): live Zoho Creator, except `chart-of-accounts` (static seed) and `dry-run-log` (in-memory; store extracted to `lib/bookkeeping-dry-run-store.ts` this session, behavior unchanged).
- `portal/{fp,realtor,lawyer,mortgage-agent}/*`: live Zoho + n8n webhooks (but see section 5, missing webhook env vars).
- `portal/investor/*` (7 routes): live Zoho via getPortalContext().
- `onboard/*` (5 routes): live (magic-link onboarding).
- Console.log stubs that lose submissions: `contact`, `investor-inquiry`, `portal/add-referral`.
  RESOLVED by the 2026-07-09 form-intake hotfix: all three now persist to the
  form_submissions table (foxmortgage-ca Supabase project skfeivzhqvrefnkqjwtj)
  before creating a Zoho Lead and emailing Michael, and return success only when
  the submission is durably held. The referral handler now also requires a
  signed-in partner session and records the partner's Zoho id.
  NEW FINDING from the same hotfix: the Leads module has NO FP_Name / FP_Firm /
  FP_Email / Referral_Goal / Referral_Partner fields (live fields API check;
  47 fields total). The FP referral n8n workflow (j17v139rGek6tjAC) POSTs those
  fields and Zoho silently drops them, so FP attribution on webhook-created
  leads has never been stored on the record. Logged, not fixed here.

## 2. Investor dashboard crash

Fixed, everywhere. Zero occurrences of Clerk `auth()` remain under `app/api/` or
`app/portal/investor/` (repo-wide grep; 37 role-check call sites all use
`currentUser()`, most via `getPortalContext()` in `lib/auth.ts`, whose header
documents the v5 sessionClaims limitation). CLAUDE.md's "Investor dashboard crashes
on load" known-issue line is stale and removed in this session's CLAUDE.md update.

## 3. Installed versions

| Package | Installed | CLAUDE.md claim | Drift |
|---|---|---|---|
| next | 14.2.5 | 14.2.5 | none |
| @clerk/nextjs | ^5.7.5 | 5.7.5 (do not upgrade) | none |
| tailwindcss | ^3.4.1 | Tailwind CSS | none |
| typescript | ^5 | n/a | n/a |
| Added this session | vitest ^4.1.10 (devDependency, `npm test`) | n/a | new |

Also present and in use, undocumented in CLAUDE.md: `lru-cache`, `lucide-react`,
`recharts`, `resend`.

## 4. Zoho module: Deals vs Potentials, resolved

Both CLAUDE.md claims are half-right; they describe the SAME module.

- Live check (2026-07-09, COQL via the MCP connector): `select ... from Deals` returns
  records; `select ... from Potentials` returns `INVALID_QUERY: module name given is
  not supported`. COQL accepts only the canonical name `Deals`.
- Code: `lib/zoho.ts` uses BOTH names against the REST records API and both work in
  production: `/Deals/search` for the investor surface (getInvestorPositions,
  getInvestorOpportunities, getInvestorDeal) and `/Potentials/...` for FP, realtor,
  lawyer, mortgage-agent, and the admin dashboard pull. Zoho's REST v2 records API
  treats `Potentials` as a legacy alias of `Deals`.
- Same records on both paths: the deal names returned by a Deals-stage COQL query
  (BRXM-F053724 Gianna Reinders, etc.) are the same files the FP portal reads through
  Potentials.
- Note: the production refresh token does NOT hold `ZohoCRM.coql.READ`, so app code
  must keep using the records API regardless of name (documented in lib/zoho.ts at the
  admin-dashboard section; the new `lib/zoho-admin.ts` follows the same rule).

Answer recorded: one module; `Deals` is the canonical API name (works in REST and
COQL), `Potentials` is a REST-only alias this codebase widely uses. No migration
needed; prefer `Deals` for new code once the COQL scope is ever added.

## 5. Env vars: code references vs Vercel

Verified live via `vercel env ls` on project `michaels-projects-7685fd8d/foxmortgage-ca`
(2026-07-09). Names only.

Referenced in code AND present in Vercel (Production):
`SESSION_SECRET`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`,
`ZOHO_ORG_ID` (present but unused by code), `ZOHO_CREATOR_CLIENT_ID`,
`ZOHO_CREATOR_CLIENT_SECRET`, `ZOHO_CREATOR_REFRESH_TOKEN`, `RESEND_API_KEY`,
`BOOKKEEPING_WEBHOOK_SECRET`, `FP_REFERRAL_WEBHOOK_URL`, `FP_MESSAGE_WEBHOOK_URL`,
plus the Clerk pair (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) consumed
by the SDK, and the new `UW_SUPABASE_URL`, `UW_SUPABASE_SERVICE_ROLE_KEY` (added by
Michael 2026-07-09, Preview + Production).

Referenced in code but ABSENT from Vercel (finding, not fixed this session):
- `REALTOR_REFERRAL_WEBHOOK_URL`, `REALTOR_MESSAGE_WEBHOOK_URL`
- `LAWYER_REFERRAL_WEBHOOK_URL`, `LAWYER_MESSAGE_WEBHOOK_URL`
- `MORTGAGE_AGENT_REFERRAL_WEBHOOK_URL`, `MORTGAGE_AGENT_MESSAGE_WEBHOOK_URL`
- `N8N_BASE_URL` (smm-enroll; harmless, falls back to the hardcoded n8n cloud URL)

If the six partner webhook vars are truly unset in Production, realtor, lawyer, and
mortgage-agent referral and message submissions fail there. Not runtime-verified
(posting would create side effects). Michael: add via dashboard or REST API.

Added to Vercel during this session (REST API, type encrypted, production+preview):
`N8N_API_URL`, `N8N_API_KEY` (values from the existing Paperclip agent config) so the
new Status page can report workflow health.

Env var findings, resolved live on 2026-07-09 after the deploy:
- `UW_SUPABASE_SERVICE_ROLE_KEY` is type=sensitive (verified via the Vercel REST
  API). Empirically it IS runtime-readable in production: the deployed Status page
  reached PostgREST past the API-key gateway check. The 2026-05-15 sensitive-type
  footgun (CLAUDE.md) remains real for `vercel env pull` visibility, which returns
  it empty, but production reads worked here.
- `UW_SUPABASE_URL` had been entered WITH the REST path
  (`https://rnupbdmpxfwsowiqhcqv.supabase.co/rest/v1/`), which doubled the path in
  the read wrapper and produced HTTP 404 on first production contact. Fixed two
  ways the same day: the env var was upserted to the bare project URL via the
  Vercel REST API, and lib/underwriting.ts now strips a trailing `/rest/v1` so
  either form works.

## 6. ZOHO_REFRESH_TOKEN rotation status

Not rotated, on the available evidence. The `.env.local.save` leak was removed in
commit `7fb0d11` on 2026-03-27 23:26 EDT. `vercel env ls` (2026-07-09) shows
`ZOHO_REFRESH_TOKEN` in all three environments created "104d ago", which is
2026-03-27, the incident day itself, with no later update. The token works (live
check: token refresh + a 1-record Potentials read returned 200 during the audit).
Recommendation stands: rotate it. Report only; nothing was rotated in this session.

## 7. FOX-114 bookkeeping write-mode status

- Live n8n read (2026-07-09, workflow `Uu6fsZ2A2gTn0gBs` "Bookkeeping — Nightly
  Transaction Categorization"): Workflow Config node has `WRITE_TO_QBO=false` and
  `QBO_REALM_ID=9341456901231490` (sandbox). Workflow is active.
- Docs (CLAUDE.md 2026-05-22): three-night gate met, pending Mike sign-off + board
  approval before flipping to true. Consistent with the live value.
- Repo code carries no WRITE_TO_QBO flag; the only reference is a comment in the
  dry-run-log route.
- NEW FINDING: the workflow's most recent nightly execution FAILED,
  status=error at 2026-07-09T06:00:00Z (02:00 Toronto). Something has regressed since
  the clean-run streak ended 2026-05-22. Triage before any write-mode decision. Also:
  `dh1qIttAuctSQ7L0` (Daily Deal Briefing) is inactive, though CLAUDE.md marks it
  active; and inactive `IFDRp2BGHAbzKpHH` (Finmo Sync v2) shows last status "crashed".

## 8. Dead code, unused pages, broken links

- Legacy realtor surface superseded by per-role namespaces and orphaned from nav:
  `/portal/clients` + `/portal/clients/[id]` (hardcoded client array),
  `/portal/reports` (hardcoded stats), `/portal/add-referral` (posts to a stub API).
  `/portal/training`, `assets`, `compliance`, `support` are static but still linked
  from the generic partner nav. Candidate cleanup, not touched this session.
- The old admin dashboard's "View All" pointed at the mock `/portal/clients`; resolved
  incidentally by this session's Home rebuild.
- Submission-losing stub APIs (see section 1): `contact`, `investor-inquiry`,
  `portal/add-referral`. RESOLVED by the 2026-07-09 form-intake hotfix.
- `/portal/investor/(active)/opportunities/[id]` renders a hardcoded documents array.
- `.claude/worktrees/angry-brahmagupta-e098d4/` holds a full stale duplicate of the
  tree (Claude Code worktree artifact); untracked, ignorable.
- Zoho task backlog observed while wiring the Tasks widget: 139 open tasks due on or
  before 2026-07-09, oldest from late May. Data, not a bug, but the widget will show
  a large overdue count until the backlog is groomed.

## Session-1 build decisions recorded here for traceability

- Funded-volume field: `Amount` (fallback `Total_Loan_Amount`). Live sample of 2026
  funded deals shows `Total_Loan_Amount` null on recent records while `Amount` is
  populated; on older records the two are equal.
- Funded-stage duality: 2026 fundings carry Stage `Funded`; `Mortgage Funded` stopped
  after 2025. Both count as funded production (`config/pipeline.ts FUNDED_STAGES`).
- Terminal-stage filter: the Daily Deal Briefing's proven set (Archive, Closed, Lost,
  Mortgage Funded, Mortgage Lost) PLUS `Funded` and `Cancelled`. Without the additions
  the six 2026-funded deals would appear as open pipeline and double-count against
  funded YTD in the pacing widget. Deviation is deliberate and marked in config.
- Stage weights: the brief's eight seed weights, plus additive mappings for live
  picklist stages the seed vocabulary predates (Pending 0.05, Qualification 0.05,
  Options 0.30, Approved 0.75). Unweighted stages contribute zero to pacing but stay
  visible in the pipeline table.
- Live Stage picklist observed (grouped count, 2026-07-09): Pending 8, Collecting
  Documentation 1, Options 14, Conditionally Approved 3, Underwriting In Progress 1,
  Application Started 3, Approved 1, Additional Properties 49, Mortgage Funded 48,
  Funded 6, Archive 33, Closed 9, Lost 4, Mortgage Lost 19, Cancelled 6.
- Zoho Tasks search rejects `not_equal` on Status; the tasks widget filters on
  `Due_Date less_equal today` and drops Completed client-side, with a plain-list
  fallback if search fails.
- Old admin page content dropped in the Home rebuild: all-time KPI tiles, partner
  by-type tiles, Recent Referrals list, Practice History by-year chart (earmarked for
  Revenue in Session 6), Practice Summary strip, and the various hardcoded Coming
  Soon panels. `/api/admin/dashboard` and `getAdminDashboardPayload` remain in place
  (the partners admin pages and any future Revenue work can reuse them); the route is
  currently consumer-less.
- A dev-instance Clerk test admin (`admin-test@foxmortgage.ca`) was created in the
  pk_test instance for local verification of the gated pages. Production Clerk was
  not touched.
