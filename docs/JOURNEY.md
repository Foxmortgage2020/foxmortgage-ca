# JOURNEY.md, the Fox Mortgage client journey operating document

Version 1.0, written 2026-07-27. This is the standing reference for how a client moves through Fox Mortgage, what is automated, what stays human, what the evidence says, and what gets built next. It is the successor to the 47-touchpoint journey map and its gap register. New sources get triaged against this document through the intake ritual in section 10, and every verdict lands in the decision log in section 8. If a claim here conflicts with the live system, the live system wins and this file gets corrected.

Sources: 35 transcript extractions (every figure is a speaker's own account, none verified), the current-state map (live-checked Jul 27), the journey map digest, the ILMB research report, the Jul 9 portal audit, and the Jul 7 email audit reconstructed at summary level. Copy rules apply to every client-facing artifact this document governs: grade-6 voice, no em or en dash, no semicolon, no exclamation, never "broker" for Mike.

## 1. Operating thesis

Fox Mortgage runs a monitored book, not a marketed list. The default relationship is Strategic Mortgage Monitoring, contact happens only when a computed number justifies it, and Mike's hours go to exactly two conversations per file, a short discovery call and a strategy session. Everything on either side of those conversations is drafted, chased, scheduled, and watched by machines that Mike approves.

Five principles, each carried by multiple independent sources:

1. **Gates push work to the client.** Application and documents before the call. The client who won't jump the hoops self-selects out, and that is the design working. (Chad Wilson, Tourloukis, Atkins, Janes)
2. **No contact without a computed number.** Generic touches don't convert, opportunity math does. Three operators independently reinvented compute-the-saving-before-contact, and the corpus's one direct self-contradiction resolves the same way: Tourloukis touches his database 8 to 10 times a year and calls it worthless, because the 60% of his business that comes back arrives through campaigns that open with a dollar figure. The touch maintains permission. The number makes the phone ring.
3. **Two human conversations, everything else assists.** The discovery call disqualifies fast and sets the gates. The strategy session is the conversion engine and the single least automatable asset in the corpus. Declines are phone-first, always.
4. **One voice per file.** Solo makes it automatic today. Every automated message sends in Mike's voice with Mike's approval, and any future teammate, human or agent, gets introduced as better than Mike at that job, never as an assistant.
5. **Automation buys capacity and consistency, not conversion.** The only genuine retrospective in the corpus (A-15) reports output flat, efficiency up, QA permanent, and 10 to 15 hours a week of human oversight. Plan on that honesty: the drip and the engines remove the ceiling on Mike's book, and Mike's relationship minutes remain the constraint that growth eventually hits. When they saturate, that is the hiring trigger, not before.

## 2. The journey spine

Twelve stages, kept from the 47-touchpoint map. Zoho stage values in brackets are the stored values where they differ from labels, and they are load-bearing.

| # | Stage | Zoho mapping | Human moment | Machine coverage |
|---|---|---|---|---|
| 1 | Inquiry and lead | Lead, Pending | none | LIVE forms, SMM wizard, bookings. GAP welcome pair |
| 2 | Application | Application Started [Application Pending] | none | LIVE Finmo + Sync v2. DARK app chase d2/5/9 |
| 3 | Documents | Collecting Documentation | none | LIVE documents desk. DARK doc chase. Templates exist |
| 4 | Submitted | Submitted to Lender | none | GAP status touch (engine trigger exists) |
| 5 | Lender response | Conditionally Approved [Application Sent To Lender], Approved, Declined | decline call, phone first | DARK stage-update touches. GAP approval templates |
| 6 | Conditions | Satisfying Conditions, Conditions Fulfilled, Commitment Under Review | condition escalations | LIVE condition tracking. GAP cleared-progress touches |
| 7 | Commitment | Broker Complete [Ready To Close] | strategy confirmation | LIVE signing-package skill. GAP plain-English commitment mail |
| 8 | Lawyer and closing | Lawyer_Status picklist, Waiting on Sale | T-2 availability text | GAP transition briefing and T-7/2/1 countdown |
| 9 | Funded | Funded, legacy Mortgage Funded [Mortgage Closed], then Paid | personal congratulations | DARK review ask at +7d. Templates exist |
| 10 | 30-day check-in | none, timer | optional reply handling | GAP, adopt concierge ladder |
| 11 | Annual review | none, timer | none | GAP, SMM monthly report covers the touch |
| 12 | Renewal | Renewed With Us, In Discussion, Radar states | the renewal conversation | LIVE Radar + Opportunities. DARK drip. Templates exist |

Stage plan decided Jul 27, verify applied: restore Paid, Options, Commitment Under Review, Satisfying Conditions, Pre-Approved, add Waiting on Sale, add Lawyer_Status and Appraisal_Status picklists, validation rule blocking Funded without a submitted compliance package, Kanban rebuild. Collapses (Submitted pair, five loss stages to three) stay deferred until after B1.

## 3. The gates

Client-facing rules, each earning its place in the corpus and each enforceable by the system:

- **JG-1 No application, no call.** The link leads. Booking follows submission.
- **JG-2 No documents, no advance.** We do approvals, not pre-qualifications. The desk knows what Finmo holds and never re-asks.
- **JG-3 The machine chases politely, capped.** Doc chase every 3 business days, three attempts, then the file waits. Mike never chases.
- **JG-4 No contact without a computed number.** Every outbound to the book cites the client's own math.
- **JG-5 No send without approval** until a touch family graduates (section 9). Declines never automate.
- **JG-6 No switch without value.** If the bank's offer wins, say so, then load the client into monitoring. The honest no is the referral engine.

## 4. The renewal engine, reconciled

Three cadences existed. One survives.

**Canonical cadence, the drip's implemented schedule:** enrollment at T-150, touches at 150/120/90/75/60/45/30, appears-renewed suppression, plus a post-decision tail adopted from the Jul 7 audit: confirmation at signing and a T+14 settled-in touch. The old map's 120/90/60/30 is retired, its escalation tone curve is kept, early awareness into strategy into urgency into final window.

**Objective:** every touch exists to book the strategy session. The metric is contacts made and sessions booked, never list coverage. Chad Wilson's 40% is 40% of contacts made, and that is the benchmark's denominator.

**Upstream campaigns, distinct from the calendar drip:** the Opportunities engine runs computed plays against the whole monitored book. First named campaign: **the thirteen-month play** (Tourloukis). Fixed-rate clients, incumbent lender carries a six-month product, contact at 13 months, hold a rate, transfer at nine months less a day so the penalty caps at three months interest. Requires one new lender-registry fact and date arithmetic the system already does. Rate-environment dependent, the engine flags eligibility and Mike judges the market.

**The conversation itself:** honest triage first, pain points, restructure, amortization, equity. Education frame, move the client from unconsciously to consciously incompetent, five things beside rate. If the incumbent wins, coach the client to take it, then close on the monitoring load, no statement, no end of call. FSRA treats every renewal as a fresh transaction, so the suitability and disclosure artifacts ride the path natively.

**The composed thesis, resolving the corpus's three-way split:** Kaminsky and Tourloukis run renewals as the growth engine, Atkins turns most renewals away and converts the call into monitoring, Peckford says renewal-driven database marketing is dead and the database should feed wealth partners. Fox runs all three as layers because the estate already contains them: monitoring is the default relationship, computed opportunities are the only outbound trigger, and what the book can't monetize directly routes to the FP block as referrals. No lane requires beating a bank on rate to pay.

## 5. Intake, the front of the funnel

The discovery skill (unwritten, queued) encodes: a 7 to 15 minute call, always Mike, interview not pitch, open on the existing mortgage and the client's position, state the promise and the process, disqualify inside the call without apology. It triggers the two-link email, link one is the Finmo application with consent and document upload, link two books the strategy session the moment documents land. A commitment step rides intake, the corpus's recurring filter, make the client spend something first, for Fox that is the completed application and package, never a credit card.

## 6. Post-fund and the relationship layer

Adopt the concierge ladder: 7-day call, 30-day check-in, 6-month efficiency checkup, annual review. The SMM monthly report is the standing annual-review touch, disbelief at an equity figure is a feature, the reply is where the deal starts. The 7-day call carries one new question, who handles your planning and your taxes, and gaps route to the FP block. Review ask fires at funding +7 (built, dark). Referral ask is separate from the review ask and fires at the two happiest moments, approval and pre-signing, broad ask to open, narrow ask to close. Click-signers, the 70% who sign without an appointment, get a short confirmation call, cheap, human, compliance-friendly.

## 7. Benchmarks

Corpus figures are the speakers' own accounts. Vendor open-rate and click-rate claims are excluded by rule, every one traces to an interested seller.

| Metric | Corpus reference | Fox actual | Measured by |
|---|---|---|---|
| Funded deals per year | 250-300 (Wilson, 2 staff), 750-800 (Tourloukis, 2 staff) | 6 YTD at Jul 9, 5-13/yr verified range | Zoho funded stages |
| Renewal conversion, of contacts made | ~40% (Wilson) | unmeasured | drip log + outcomes, Q11 |
| Renewal retention rate, north star | n/a | unmeasured | renewal statuses |
| Strategy-session booking rate | 75-80% (Wilson) | unmeasured | bookings + drip log |
| Monitoring seats | 58 in 40 days, 53 from own files (Atkins) | 7 drip-enrolled, SMM count TBD, cap 100 | SMM platform |
| MPP uptake | ~30% (Wilson) | unknown | signing packages |
| Google reviews | 350 total, 20-25% of asks convert, 75-80% close rate on that channel (Janes) | unknown | review-ask family |
| Broker minutes per file | ~10 (Tourloukis) to ~45 (point guard) | unmeasured | not instrumented |
| Funding ratio at lender | 90-92% (Wilson, Tourloukis) | unmeasured | submission outcomes |

The table's job is to stop saying unmeasured. That is queue item Q11, and most of it is fields the system already writes.

## 8. Decision log

**Adopted Jul 27** (source IDs in brackets): docs-before-advance and application-before-call as client-facing gates [M-01, M-05, M-08, M-14, M-18]. Approvals-not-prequalifications positioning [M-01]. Two-conversation human core [M-01, M-08, M-18]. Computed-number contact rule [M-08, M-09, M-13, M-19]. SMM backfill from stored files [M-13, M-14]. Thirteen-month play as a named campaign [M-09]. Honest-no renewal triage closing on the monitoring load [M-05, M-13]. Review and referral asks at approval and signing moments [M-04, M-18, M-01]. Concierge post-close ladder [M-06, M-20]. Planning-and-taxes question at the 7-day call, partial adopt of the wealth-referral engine [M-20]. One-voice rule and elevate-the-receiver handoffs [M-02, M-12, M-15]. One agent one job, skills per stage, promote-to-schedule only after a manual pass [A-02, A-03, A-05, A-06]. Queue-as-interface with a gate at the irreversible step [A-04]. Codified extraction with confidence gaps named [A-13]. Transcript-to-structured-row and the deal-room timeline [A-10, A-12]. Playbook-plus-standing-rules over per-message edits [A-08's two transferable primitives]. Reactivation of raised hands as the highest-ROI agent job [A-15]. Permanent-QA planning posture [A-15].

**Adopted Jul 27, addendum:** native booking engine, overturning the earlier deferral. A single-host scheduler on the existing stack, branded, capturing express SMS consent with a timestamp at booking per the map's compliance section, swapped in behind RENEWAL_CALENDAR_URL and the [CalendarLink] token only after its test checklist passes. Chosen over embedding the vendor page and over self-hosting a third-party scheduler, both keep branding or data outside the stack [map Part 4, A-07 transfer].

**Confirmed Jul 27:** booking event types and buffers as seeded, 15, 45, 30, 20 minutes with 5-minute buffers.

**Confirmed Jul 28:** public booking exposes the discovery call only per JG-1, Book a Meeting CTA retargeted to the native engine. The strategy session and the signing review stay inside tokened emails, because booking follows the application for those conversations.

**Confirmed Jul 28, drip removal:** the drip's removal lever is the deal's Renewal_Status field, its terminal values both exit an active sequence and suppress re-enrollment. Three rehearsal clients exited with reasons on Jul 28. Call-driven state proposals adopted in principle, pending the Dialpad pipeline revival.

**Executed Jul 28, swap day:** the renewal drip and the SMM wizard both book on the native engine, the drip through RENEWAL_CALENDAR_URL set by Michael in fox-underwriting and the wizard through the Jul 28 CTA retarget in `9d2db8e`. The Zoho Bookings page stays live for links already sent by hand, until the retirement date of 2026-10-27, which moves out a month if that account still shows bookings in the prior 30 days. Public navigation is unchanged and no /book link was added, because the go message did not ask for one. Not swapped, still pointing at Zoho: the `CONTACT.bookingUrl` constant in `lib/contact.ts`, read by the client status page, the qualification explorer, and six portal support pages.

**Adopted Jul 28, n8n elimination:** n8n retires into owned Vercel code, piece by piece rather than in one cut. The order is the booking cron first, then Dialpad rebuilt native, then lender notes, then the Finmo receiver last, because the receiver carries the most traffic and the least tolerance for a bad swap. Each migration lands on its own and its registry row comes out when it does.

**Adopted Jul 28, Zoho attrition rules:** new builds keep their source of truth in owned tables and touch Zoho only at seams that already exist. No new Zoho surface gets built. A function cuts over once it has been natively rebuilt, and the record layer swaps last, at the platform phase.

**Adopted Jul 28, two-lane operating structure:** revenue leads and infrastructure fills in behind it. One Claude Code session per repo at a time, counted across all chats, so two sessions never share a working tree.

**Decided Jul 28, JG-1 scope:** JG-1, no application no call, governs new intake only. A renewing client can take the 45 minute strategy session with no application on file, because the relationship already exists and the call is what decides whether an application is warranted at all. JG-2 binds the instant the client decides to switch, and that is what the Ready To Renew - Sent New Application status records. This resolves an apparent conflict between JG-1 and the renewal drip, which books strategy sessions without an application.

**Locked Jul 28, the five beside rate:** section 4 names the frame but never enumerated the five. They are amortization, prepayment privileges with the penalty formula, portability and assumability, product structure, and access to equity. Composed during Q2 and ratified by Mike on Jul 28.

**Noted Jul 28, Q2 delivered outside the repo:** the renewal conversation skill ships as an installed claude.ai skill rather than as a repo artifact. Where skill sources should live in version control is undecided, and it is recorded here so it is not forgotten. Relevant context: the Fox Knowledge Base repo has no git remote configured, so it is not currently a viable home.

**Adopted Aug 1, the design-forward Zoho exit:** the Command Centre becomes the mortgage-native record layer, designed from this document and the CRM reference doc rather than from Zoho's shape. Zoho defines what migrates, never what gets built. Domains flip one at a time with a single owner per object at all times, tasks in August, records in September, timeline and remainder in October, and Zoho goes read-only per domain as each flips, with the whole bundle lapsing at the Nov 14 renewal. This supersedes one line of the Jul 28 attrition rules: the record layer no longer swaps last at an unscheduled platform phase, the platform phase is September 2026. Everything else in those rules stands, no new Zoho surface, cutover only after native rebuild. The spec session locks the object list, the flip dates, the parallel-run mechanics, and the record-layer region.

**Rejected Jul 27, with reasons, logged so they don't resurface:** cold outbound in any form, no consent basis, CASL exposure, lowest-trust channel, and last by the standing revenue ranking [A-08, A-09 outreach half, A-01 scraping half]. Unattended voice calling, CRTC and DNCL exposure, no AI disclosure, recording consent absent, and an unsupervised agent quoting numbers is presenting, which never leaves Mike [A-07 cold half, A-12 outbound half]. Generic touch cadence as a strategy, the corpus's own sends produced 2 of 140 and 0 of 3,500 [M-13, M-14, resolved against M-08 by M-09]. Subscribing to the sponsor's monitoring product, SMM occupies the slot, its mechanics are adopted, its subscription is not, and its figures stay out of the benchmarks [M-19]. The brief's don't-build list reaffirmed, no credit scoring, no OCR foundation, no borrower intake product, no rules builder yet. Salaried headcount now, the corpus's staff roles map to systems already live or dark, document specialists are the documents desk, the renewal staffer is the drip, the underwriter is the workbench in shadow, the EA is the comms engine plus booking, revisit only when Mike's conversation hours saturate [M-10 through M-18, A-15].

**Parked, with triggers:** podcast-as-filter, trigger is FoxSocial capacity pointed at the Fox Mortgage brand under the brand-separation rule [M-05, M-17]. Named AI persona, trigger is 90 days of the comms engine live plus volume [map Part 1]. Consented voice check-ins with AI disclosure, trigger is a touch family at graduation level 2 [A-07, A-12 transfer]. Full wealth-partner reciprocity machine, trigger is FP attribution fixed and the first ten routed referrals [M-20, M-06]. Dentist-model platform, existing level-3 ambition [M-03].

## 9. Autonomy graduation

The same mechanic underwriting uses, shadow exit on evidence, applied to client comms. **Level 0**, per-message approval, where every family starts. **Level 1**, per-batch approval, exit requires 25 consecutive approved sends in that family with zero edits and zero compliance-gate hits. **Level 2**, exception-only with a daily roll-up, exit requires 100 sends and 30 clean days at Level 1. Never graduates, regardless of record: presenting rates or options, committing a client, declines, identity writes, anything the human-only actions table names. Any edit or gate hit resets the family's counter. The graduation state lives beside the kill switch and is audit-logged.

## 10. The intake ritual for new sources

One source: classify M (practice) or A (automation), extract against the locked schema, Schema A or B, calibration example M-11 never M-01, 450-word cap, six-bullet target on journey practices, proof of reading required, the extractor returns two verbatim quotes of 12 words or fewer with their locations, and a run with zero tool calls is discarded on sight. Then diff the extraction against this document and log one verdict per idea in section 8, adopt, reject with reason, or park with trigger. Adopts become Zoho tasks or numbered handoffs. Batches use the fan-out pattern, disposable context per source, parent verifies mechanically, copy gate on every file. The decision log is what makes verdict fifty cheaper than verdict five.

## 11. Gap register, second generation

The original G-register's cited entry closed: G-02, document state lived in Finmo not Zoho, CLOSED by the documents desk. Current register:

| ID | Stage | Gap | Resolves at |
|---|---|---|---|
| G2-01 | 12 | Booking URL unset, blocks the drip and the [CalendarLink] token. RESOLVED 2026-07-28 on Mike's assertion, not on proof. RENEWAL_CALENDAR_URL lives in a different Vercel project and no session in this repo can verify it. Proof event is a runtime log line from the next renewal tick, expected around 2026-08-02 | Q1, proof pending 2026-08-02 |
| G2-02 | 12 | Renewal conversation undefined. CLOSED 2026-07-28, defined at Q2 | Q2 |
| G2-03 | all | 16 template bodies lack CASL opt-out copy | Q5 |
| G2-04 | 1,2,4-8,10,11 | Nine stages without production templates | Q8, Q9, Q10 |
| G2-05 | 1 | Discovery skill and intake gate artifact unwritten | Q10 |
| G2-06 | 5,7,9 | Referral ask, MPP advance-review, click-signer call unencoded | Q6 |
| G2-07 | all | Benchmarks unmeasured | Q11 |
| G2-08 | REFER | Leads module lacks FP attribution fields, six partner webhook envs absent | Q12 |
| G2-09 | 12 | Cadence conflict, resolved in section 4, config check pending | Q1 |
| G2-10 | all | Token dictionary unrecovered, naming drift risk | Q5 |
| G2-11 | spine | Stage plan decided, application unverified | Q7 |
| G2-12 | 12, LEAD | SMM backfill never run | Q3 |
| G2-13 | 12 | Six-month-product fact absent from lender registry | Q4 |
| G2-14 | ritual | M-01 over cap in the reference pack | housekeeping |
| G2-15 | 1, 12 | NARROWED 2026-07-28. Q13 is complete and the booking engine is native, but the swap is deliberately partial. `lib/contact.ts:31` still points at Zoho Bookings and eight portal surfaces read it, four of which still show a client-visible line naming Zoho Bookings. One constant plus four subtitles, matching cutover inventory section A | Mike calls the second swap, before 2026-10-27 |
| G2-16 | 12 | Enrollment sweep cannot see a sibling active deal in flight | Q14 |
| G2-17 | 12 | Enrollment sweep cannot see a paid-out or discharged mortgage | Q14 |
| G2-18 | 12, renewal lane | CRM has no field for current outstanding balance, current property value, equity, or penalty exposure. Total_Loan_Amount, Purchase_Price_Value and LTV are all origination era and are the trap, not the answer. Renewal briefs cannot compute the math from Zoho alone | Q3 for what stored files hold, Q11 for anything measured |
| G2-19 | 12 | Drip sequence state and Zoho may be two sources of truth. On deal IFMS-F002015, Renewal_Status, Renewal_Sequence_Stage and Last_Renewal_Email_Date are all blank while the drip holds that client enrolled with touch-150 skipped and T-60 and T-30 intact. Either the drip keeps sequence state in fox-underwriting's own store and never mirrors it, or the enrollment is not where it is believed to be. Anything reading Zoho alone is blind to drip state until this is settled | diagnostic in fox-underwriting, currently unqueued |
| G2-20 | all | No CASL consent basis is recorded on contact records. CASL_Consent_Date, CASL_Consent_Method and CASL_Consent_Source are blank on at least one client enrolled in the live drip. Distinct from G2-03, which is about opt-out copy in the message body. This one is about the basis for sending at all | Q5, one dated task already open ahead of the first live send |

## 12. The build queue, ranked by revenue

| # | Item | Why first-order | Effort |
|---|---|---|---|
| Q1 | **LIVE 2026-07-28.** Light the renewal drip: env via dashboard, booking URL, push, first approve clicks, unsubscribe proof. Sending on per-message approval at Level 0 | Highest-conversion lane, fully built, dark | hours |
| Q2 | **COMPLETE 2026-07-28.** Write the renewal conversation skill. The deliverable is an installed claude.ai skill named renewal-conversation, SKILL.md plus three references. It is not currently held in any repo, and the source-of-truth location for skill files is undecided | The drip books meetings, this converts them | one session |
| Q3 | SMM backfill mining from stored files, ranked candidates, Mike's opinion emails to the top 20. Note: this pass opens every stored file, and the same pass could populate the renewal fields the CRM is missing, at the cost of one extra mapping. Decide that when Q3 starts rather than after it ships | 53 of 58 seats came from own files in the corpus, direct SMM growth toward the 100 cap | 1-2 sessions |
| Q4 | Thirteen-month play: registry fact plus eligibility flag in the Radar | Named campaign with computable eligibility | small feature |
| Q5 | Light the comms engine families, CASL copy pass on the 16 templates, regenerate the token dictionary | 20 touches mint on day one, remediation is copy not plumbing | hours plus copy |
| Q6 | Referral ask, MPP advance-review, click-signer call | Three cheap encodings of the corpus's happiest-moment asks | copy |
| Q7 | Verify stage clicks applied, Kanban, validation rule | Radar truth depends on it | clicks |
| Q8 | Post-close ladder into the engine, 7d/30d/6m/1y, planning-and-taxes question | Covers stages 10 and 11, feeds SMM and the FP block | templates |
| Q9 | Middle-of-file templates, stages 4 to 8, lawyer briefing inside guardrail 13, closing countdown | The trust moments that mint referrals | copy batch |
| Q10 | Discovery skill and the two-link intake email | Encodes JG-1 and JG-2 client-facing | one session |
| Q11 | Measurement plumbing for section 7 | You can't improve unmeasured | small feature |
| Q12 | FP Leads fields, six webhook envs, attribution backfill | Stops the silent drop, makes partner reporting true | small feature |
| Q13 | **COMPLETE 2026-07-28.** Native booking engine v1, parallel track. Live, with the public discovery-call button on the site | One engine serves the drip, SMM calls, and the intake email, plus consent capture at booking | 2-4 sessions |
| Q14 | Enrollment guards: the sweep must see a sibling active deal in flight, and a paid-out or discharged mortgage, before it enrolls anyone | Stops the drip touching a client whose file already moved, closes G2-16 and G2-17 | small feature |

Q13 ran in parallel and never blocked Q1. Both are done as of 2026-07-28. The drip reads its booking destination from env and now points at the native booking URL.

Housekeeping after: recut M-01 and ship reference pack v2, install this file at docs/JOURNEY.md with a pointer line in FOXMORTGAGE.md, slim the build-ledger CLAUDE.md by progressive disclosure, complete the superseded-file sweep.

## 13. Maintenance

Update this file on every intake verdict and every queue completion. The two-lane chat structure runs revenue ahead with infrastructure filling in behind it, one Code session per repo at a time across all chats, and infrastructure decisions log in section 8 alongside the practice ones. Refresh benchmarks monthly once Q11 lands. This document loads on demand, never by default. The Jul 7 audit remains partially reconstructed, its findings register and token dictionary fold in if the file turns up, and G2-10 closes either way at Q5. Currency of every claim is its bracketed date, and the live system always outranks the page.

## 14. Verified Zoho field map

Verified against the live Zoho modules on 2026-07-28. Read this before assuming a field exists. Section 8 is a decision log and this is reference data, so it lives here instead.

**Deals carries:** Mortgage_Rate, Rate_Type, Variable_Mortgage_Rate, Maturity_Date, Payment_Amount, Payment_Frequency, Term_Type, Term_Years, Amortization_Years, Prepayment_Privileges, Lender_Name, Lender_Classification, Lender_Product_Line, Rate_Hold_Expiry_Date, Renewal_Status, Renewal_Sequence_Stage, Renewal_In_Progress, Renewal_Opted_Out, Last_Renewal_Email_Date.

**Contacts carries:** Email_Opt_Out, SMM_Status, SMM_Relationship, SMM_Intake_Form_Submitted, CASL_Consent_Date, CASL_Consent_Method, CASL_Consent_Source, CASL_Consent_Language.

**Two traps.** Amortization_Years and Term_Years are both labelled in months in the CRM despite their API names. Renewal_Opted_Out sits on the deal while Email_Opt_Out sits on the contact, so the two are never found in the same place.

**Live Renewal_Status picklist:** Attempted To Contact Once, Attempted To Contact Twice, Attempted To Contact Three Times, Renewed Elsewhere, No Longer Needs Mortgage, Ready To Renew - Sent New Application, Renewed With Us. The last four are the terminal set, and setting one removes the client from the drip.

What this map does not contain is the point of G2-18: no current outstanding balance, no current property value, no equity, no penalty exposure. The origination-era fields are not substitutes.
