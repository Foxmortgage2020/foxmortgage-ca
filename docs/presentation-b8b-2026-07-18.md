# B8b — The presentation layer: scenarios, offers, and the letter

Date: 2026-07-18 · Repo: foxmortgage-ca · Base: `c4afd9d` (B8a) → Task 0 `dfbf6c8` → this work.
Suite: **791 → 818** (green). tsc clean. `next build` green. Committed, NOT pushed.

This session grows the client status page from *status* into *value*: three surfaces Michael
composes in the deal room and **publishes** to a client's private link — Scenarios, Offers with a
disclosed grade, and the Pre-approval letter. Nothing appears by default; every client-visible
record is published deliberately.

---

## Findings first

**Base state.** HEAD was `c4afd9d` (B8a). Tracked tree clean (`deploy.sh` + `docs/design/` are
pre-existing untracked noise, left alone). Suite 791/53 green.

**Task 0 — the real closing-date inconsistency (own commit `dfbf6c8`).** B8a proved the workbench
`deals.closing_date` (Finmo-synced) is the better source than Zoho's `Closing_Date` (null on refis,
stale on some). Three readers had three answers:
- the client page (`lib/client-file.ts`) was **workbench-first** (the B8a fix),
- the underwriting list/board (`app/portal/admin/underwriting/page.tsx:95`) was **Zoho-FIRST**
  (`z?.closingDate ?? r.closingDate`) — a stale Zoho date could win over the fresh workbench date,
- the deal-room header read the **workbench date alone**, with no fallback.

`lib/closing-date.ts resolveClosingDate(workbench, zoho)` = workbench first, Zoho fallback, is the
one answer all three now share. `getDealCloseout` gained `Closing_Date` as the header's fallback.
The July 28 file (F053107: Zoho null, workbench dated) renders and sorts dated everywhere. +4 tests.

**The calc engines (reused, never re-derived).** Scenario figures compute through
`lib/mortgage-engine.ts` (`monthlyPayment` + `buildSchedule` + `paymentBreakdown`, the same
semi-annual-compounding core the public calculators use). The golden test pins the two known cent
anchors: `500000 @ 5.00 / 25yr = 2908.02`, `650000 @ 3.75 / 30yr = 2999.58`.

**The offer grade's cited-truth sources.** The quote's own fields (`lib/underwriting.ts`
`RateQuoteFullRow`: rate/primeVariance/termMonths/…), and APPROVED lender-wide knowledge claims
(`getKnowledgeClaims`, live table `lender_knowledge_claims`). The only claim topic emitted today is
`penalty_methodology`/`ird_comparison_basis` (value `{basis}`, consumed already by
`lib/knowledge-claims.ts` + `lib/lenders.ts`). So in practice **most offers grade "incomplete"**
until Michael's knowledge base carries prepayment/portability/fees/flexibility claims — the honest
state, exactly as the brief intends. The rubric reads those forward-contract topics and lights up
with zero code change when they exist.

**The publishing pattern (mirrored exactly).** `lib/client-links.ts` + `-store.ts` + the two
client-links migrations are the template: RLS deny-all, grants revoked, narrow security-definer
functions, the operator secret (B7-P) as the admin-write second factor. Reused verbatim.

---

## What shipped

### The shared publishing model — migration `20260718180000_client_presentation.sql` (applied live)

Three FOXCA tables (`client_scenarios`, `client_offers`, `client_letters`), RLS on / no policies /
grants revoked, reachable only through security-definer functions:

- **Admin writes** (`*_upsert` / `*_create` / `*_mint` / `*_set_published` / `*_delete` /
  `*_supersede` / `*_for_deal`) demand `p_operator_secret`, matched against the SAME sha256 the
  client-links functions carry (a private helper `client_presentation_secret_ok` holds it in one
  place). **No new secret** — `FOXCA_OPERATOR_SECRET` already unlocks it.
- **Client reads** (`*_for_token`) are keyed by the link **token hash**, not a deal id: each joins
  `client_links`, filters revoked/expired, and returns only PUBLISHED content. So the public anon
  key cannot enumerate a deal's published content by guessing Zoho ids — the token is the gate,
  exactly as `client_link_resolve` is the gate for the status page.

**Snapshots over references.** `figures` / `snapshot` hold what the client sees, FROZEN at publish
time. A later rate change, re-grade, or edited quote never rewrites a page a client already saw.

`lib/client-presentation-store.ts` is the FOXCA twin (operator-secret admin writes, demo-blocked;
token-hash client reads, not demo-guarded — the client page short-circuits to the fixture first).

### Task 1 — Scenarios

Michael composes named what-ifs (label + amount + rate + amortization) in the deal room. Figures
compute SERVER-SIDE through the mortgage engine (`buildScenarioSnapshot`), cited by an inputs hash;
an unpublishable computation returns `missing[]` naming what to fix and never reaches the client.
The client sees published scenarios **side by side** (plain line items: monthly payment, amount,
rate, amortization, lifetime interest), labelled estimates, no jargon.

### Task 2 — Offers with the disclosed grade

Michael selects offers from the approved quote book (a deduped best-per-lender/term/type/class pick
list, `buildOfferPickList`); the quote's figures + grade snapshot at selection, cited by quote id.
The grade (`config/offer-rubric.ts`, one config home) is deterministic and DISCLOSED — the client
sees the whole scorecard. The honesty rule holds by construction: a component with no cited truth
renders "not on file" and contributes nothing; the letter grade shows only at ≥70 gradeable points,
else "grade pending · N of 100 on file"; nothing is invented and no gap is averaged around.

**Reachable-boundary note.** Every weight is a multiple of 10, so gradeable coverage is always a
multiple of 10. The brief's "69 points withholds" is the sub-threshold illustration; the reachable
boundary is **60 (withhold) / 70 (show)**, which the golden test pins.

### Task 3 — The pre-approval letter (purchase only)

Michael enters the approved terms (max price, rate, rate-hold expiry, conditions, and an optional
client first name) and mints a deterministic PDF (`lib/preapproval-pdf.ts`, same pdf-lib habits as
the rates/savings PDFs). Append-only; re-minting supersedes. The client sees a quiet **Download**
card while the hold is live, a warm "it has expired, reach out" once it passes, and nothing once
superseded. The download route reads the FROZEN snapshot — there is no client-triggered generation.

---

## Verification

- **tsc clean**, **`next build` green**, **818 tests** (from 791): closing-date 4,
  client-presentation 16, preapproval-pdf 4, demo +3 (and the rubric golden, snapshot immutability,
  scenario cent anchors, letter validation live inside client-presentation).
- **Rubric golden-tested**: a fully-truthed offer grades exactly per the weights (100 → A); a gap
  renders "not on file" and shifts nothing (the other components byte-identical); the coverage gate
  withholds below 70 and shows at 70.
- **Snapshot immutability tested**: re-grading the same quote with later claims produces a different
  grade, but the ORIGINAL snapshot's grade is byte-identical to build time; a scenario snapshot's
  figures are plain data, unaffected by a later recompute.
- **Live posture proven as the anon role** (python + PostgREST, TEST rows created and DELETED): the
  operator-secret sha matches the migration; anon direct table select → 401; admin write without the
  secret → "operator secret required"; a published scenario reads back via `_for_token`; a WRONG
  token returns nothing (no enumeration). Presentation tables left empty (no residue).
- **Demo**: the admin lists resolve from fixtures with zero real reads; the demo client file carries
  scenarios, offers (one grade-complete A, one "grading incomplete"), and a valid letter; every
  presentation write throws `DemoWriteBlocked` (asserted). The banned-verdict sweep still green.
- **Render proof, both widths** (blessed demo pattern — dev server, forged `fox_demo` cookie under
  the local `SESSION_SECRET`, the PUBLIC client page, no real reads): the client demo page renders
  the letter card, three graded offers (First National **A** itemised 30/30…, MCAP **C**, RMG
  **Grade pending · 30 of 100 on file**), the disclosed rubric, the scenarios side by side, and the
  single-lime Call button — **zero horizontal overflow at 1280 AND 375** (measured). Screenshots
  referenced in the session, not committed.

**Adversarial review** (4 dimensions — correctness / security-privacy / scope-honesty / copy — each
finding faced a refuting verifier). No HIGH, and nothing in the correctness or security/privacy
dimensions survived. Five copy/honesty findings, **four fixed**:
1. (MED) a semicolon in the letter PDF body — removed (client copy rule).
2. (MED) "IRD"/"blend-and-extend" jargon on the offer card — softened to plain words
   ("based on the posted rate", "portable, and you can blend and extend").
3. (MED) a grade capped by missing data could read as "a weaker offer" — the disclosed-rubric copy
   now says a lower grade can just mean we are still gathering details, not that the option is weaker.
4. (MED) the prepayment scorer stated an absent sub-feature as "0%" (fabricating a value) — the
   detail now names only the sub-features on file; the absent one earns no credit (the same
   conservative cap as a missing component), never a fabricated 0%.

**One accepted residual** (LOW): the letter's "purchase only" rule is enforced in the authoring UI
(the mint form renders only when the deal shape is a purchase) but not re-checked server-side — the
route's actor is a trusted admin holding `client.presentation.manage`, and server enforcement would
add a deal-type read to the mint path. Deferred as a low-risk follow-up; a letter minted on a
non-purchase file is a data-quality quirk, not a breach.

**What is Michael's manual step (honest).** The ADMIN authoring card's *visual* proof needs a
dev-Clerk admin session (the deal room is not public); it is verified by build + the demo authoring
rows rendering, with the visual proof deferred to Michael the same way B6.4 deferred its live UI
round-trip. The pure logic behind every control is unit-tested.

---

## The letter template — for Michael's word-level sign-off

Every sentence below is a one-line edit in `lib/preapproval-pdf.ts`. The structure is fixed.

> **FOX MORTGAGE — Mortgage pre-approval**
> Prepared {date} · File {ref}
>
> Dear {first name},
>
> This letter confirms that, based on the information reviewed so far, you are pre-approved for a
> mortgage toward a home purchase, on the terms set out below.
>
> | | |
> |---|---|
> | Maximum purchase price | ${max price} |
> | Rate | {rate}% |
> | Rate held until | {expiry} |
> | Conditions | {your conditions line} |
>
> A pre-approval is not a final commitment to lend. It is subject to a satisfactory property,
> updated documents, and full lender approval at the time you make an offer. The rate above is held
> until the date shown; after that date it may change.
>
> Please reach out with any questions. I am glad to walk through what this means for your search.
>
> Michael Fox
> Mortgage Agent, Level 2, BRX Mortgage, FSRA 13463
> {phone} | {email} | foxmortgage.ca
>
> *This pre-approval is valid until {expiry}.*

---

## The rubric scales — for Michael's sign-off (DRAFT defaults in `config/offer-rubric.ts`)

The **weights** (rate 30 / prepayment 20 / penalty 20 / portability 10 / fees 10 / flexibility 10)
and the **letter thresholds** (A≥85 / B≥70 / C≥55 / D) and the **coverage gate** (≥70) are DECIDED
per the brief. The per-component quality scales below are DRAFTS — each is a one-line edit:

| Component | Scale (draft) |
|---|---|
| Rate → 0–30 | linear: 4.00% earns 30, 6.50% earns 0 |
| Penalty basis → 0–20 | three-month interest 20 · IRD vs discounted/contract 12 · IRD vs posted 4 |
| Prepayment → 0–20 | up to 10 for annual lump % (20% = full) + up to 10 for payment-increase % (20% = full) |
| Portability → 0–10 | portable + blend-and-extend 10 · portable 7 · not portable 0 |
| Fees → 0–10 | none 10 · low 6 · moderate 4 · high 2 (or $0 = 10, scaled to 0 by $500) |
| Flexibility → 0–10 | a 0–1 feature score × 10 |

**Forward contract with the knowledge extractor** (the claim topics the rubric reads): penalty is
`penalty_methodology`/`ird_comparison_basis` (live today); prepayment `prepayment_privileges`,
portability `portability`, fees `lender_fees`, flexibility `product_flexibility` (not emitted yet →
"not on file" until they are).

---

## Deploy flags & guardrails

- **DEPLOY:** the migration is applied live to FOXCA (`skfeivzhqvrefnkqjwtj`) and is additive +
  inert until published. `FOXCA_OPERATOR_SECRET` is already set (B7-P) — no new secret. No Vercel
  change is required for the feature to work once this code deploys; before it deploys, the client
  page degrades gracefully (the presentation reads catch/empty).
- No Zoho writes. No sends. No fox-underwriting changes (the knowledge-claims contract is consumed
  as-is; no new portal_readonly grant was needed). Deterministic figures only, cited, everywhere; no
  AI prose in any client-facing figure or grade. No placeholders on the client surface. Census
  untouched (the deal room gained reads + one card; the client page gained sections). Lime audit
  green (the client page is outside the admin audit scope; its single lime is the brand Call action;
  the admin card uses navy + StatusChip). Public repo, synthetic data only (design cast +
  example.com; F053107 by ref; the raw operator secret never committed). Committed, not pushed.

Next: B9 (qualification explorer, co-designed with Michael), then B10 (agent mode).
