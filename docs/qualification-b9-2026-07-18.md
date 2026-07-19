# B9 — The qualification explorer: a form that never says no

Date: 2026-07-18. Repo: foxmortgage-ca. Base: `main` tip `6fbc001`. No fox-underwriting
changes, no Zoho writes, no sends. Suite: **823 → 859** (+36). tsc clean, `next build`
green. Migration `20260718200000_client_qualification.sql` **applied live** to FOXCA
`skfeivzhqvrefnkqjwtj`; anon posture proven; the table is empty.

## The law this surface obeys

The explorer **never tells a person no**. Michael's practice reaches alternative lenders,
private lenders, and equity and net-worth programs that no ratio form can see, so a hard
"do not qualify" would be factually wrong as well as unkind. Every band is information plus
an invitation. This is written into `config/qualification.ts` and enforced two ways:

- `tests/qualification.test.ts` sweeps every band headline + blurb, the footer, and all the
  control copy for `QUALIFICATION_NEVER_SAYS_NO` (`do not qualify`, `don't qualify`,
  `denied`, `declined`, `rejected`, `ineligible`) **plus** the shared client list
  (`declined/denied/rejected/not approved/unfortunately/qualify for`), and for the house
  copy rules (no em dash, no exclamation, no semicolon) and internal words.
- `tests/client-portal.test.ts` adds `QualificationExplorer.tsx` to `CLIENT_FACING_SOURCES`,
  so the component's own rendered strings ride the existing internal-word + verdict sweeps.

## Findings first (against the brief)

1. **The brief's minimum-down rule is stale.** The brief says "10% on the portion 500k-1M,
   20% over 1M." The repo — and current federal law as of 2026-07 — use **5% up to 500k,
   10% on the 500k-to-1.5M portion, 20% above 1.5M**, with the insured cap at $1.5M
   (`purchase-engine.ts minimumDownPayment` + `computePurchase`). B9 uses the repo's
   convention so the explorer never disagrees with the shipped purchase calculators. This is
   a deliberate, stated deviation.

2. **There is no heating estimator in the repo** — only a flat `$100/mo` UI default. Heating
   is a Michael-set locked-panel value, so B9 needs none: the proposal defaults heat to
   `$100` (source `default`) and Michael confirms it. Stated so a later reader does not
   "add" a phantom estimator.

3. **The engine already exists.** `lib/affordability-engine.ts` is the single GDS/TDS engine
   behind three shipped public tools (`debtService`, `stressRate`, `maximumMortgage`). B9
   **reuses it wholesale**; `computeQualification` folds the CMHC premium exactly as
   `computePurchase` does (`cmhcPremiumRate`) and then calls `debtService`. Nothing is
   re-derived — the standing guardrail that deterministic code calculates in one place.

4. **"Either ratio ≤ X" binds on GDS.** Because TDS = GDS numerator + debts over the same
   income, `TDS ≥ GDS` always. So the brief's "either ratio ≤ 48/60" is, literally,
   `gds <= X || tds <= X`, which reduces to `gds <= X` — the lower ratio. This is the
   deliberately **generous** reading a never-says-no surface should take (the 44 still binds
   TDS in the green band). Implemented literally, tested at every named edge, and flagged
   here so Michael can decide during co-design if he'd prefer the binding ratio (TDS) to
   drive the stretch bands — a one-line change in `config/qualification.ts`.

## What shipped

**The client's "Can I afford it?" section** (`app/portal/file/[token]/QualificationExplorer.tsx`,
a `'use client'` component rendered by `ClientFilePage.tsx` only when
`view.qualification` is set):

- Four controls: home price and down payment (slider + number field each), monthly property
  taxes, monthly condo fees (with the honest helper lines).
- The locked panel "Set by Michael from your file": yearly income, monthly debts, heating
  estimate, your rate, the stress-test rate (derived, shown read-only), amortization. A quiet
  "Reset to Michael's numbers" control.
- The live result: the estimated mortgage + monthly payment, a GDS bar ("Home costs") and a
  TDS bar ("All your costs") each with a tick at its green boundary and the two stretch marks,
  and ONE band card. The footer line always shows.
- Insured math: below 20% down the CMHC premium folds into the mortgage
  (`cmhcPremiumRate` + capitalization). At/above 20%, none. Over $1.5M with < 20% down, and
  below 5% down (LTV > 95%), there is no insurable path — the bare loan qualifies and the
  minimum-down helper flags it. Never a NaN, never a failure state.
- Every band's CTA carries the booking link (`CONTACT.bookingUrl`, phone fallback).

**The admin side** (`components/admin/QualificationBaselineCard.tsx`, in a deal-room Section):
Michael reviews the baseline the platform proposes from the file's truth (income from the
income calc rows, the Finmo-requested rate, the deal's purchase price), edits any value, and
publishes. A live preview runs the SAME engine so he sees the band the client will land on.
Per-field provenance (`from the file` / `default` / `you set this`) is admin-only. Navy +
StatusChip only (no lime, no decision token — the lime audit is unchanged).

**Storage** mirrors B8b exactly: FOXCA `client_qualification_baselines` (RLS on, no policies,
grants revoked), admin writes gated by the shared `foxca_operator_secret_ok` (no new secret),
a token-hash client read that joins `client_links` and returns only the published baseline.
Snapshots are frozen: a later file change never rewrites a panel the client already saw.
Publishing sets exactly one published baseline per deal.

## The band copy — SIGN-OFF TABLE (Michael's word-level review)

Every string is one edit in `config/qualification.ts`. Copy rules: grade 6, warm,
contractions, no em dash, no exclamation, no semicolon, no decline word.

| Band | Trigger | Tone | Headline | Blurb |
|---|---|---|---|---|
| fits | GDS ≤ 39 and TDS ≤ 44 | green | This one fits comfortably. | These numbers sit right inside what most lenders look for. A strong place to start. |
| options | either ratio ≤ 48 | amber | There are good options here. | This is a little above the usual mark, and there is room to work with. Worth a quick chat with Michael. |
| alternatives | either ratio ≤ 60 | amber | There are still paths that fit. | This one takes a closer look. Michael works with lenders whose options a standard form never shows. |
| conversation | beyond 60 | navy | Let us talk this one through. | Numbers like these need a real conversation. Some options, like equity and net-worth lending, never show up on a form. Michael can walk you through what fits. |

Footer (always): **For guidance only, not a mortgage commitment or a rate offer.**

Control + panel copy (also in config, also editable):

| Where | Text |
|---|---|
| Section title | Can I afford it? |
| Section intro | Try different prices and down payments to see how the numbers move. This is a guide, not a promise. |
| Home price helper | The price of the home you want to try. |
| Down payment helper | What you plan to put down. |
| Property taxes helper | Property taxes change from home to home, so this is a starting guess. Set it to the listing when you know it. |
| Condo fees helper | Half of your condo fees count toward the math. Leave this at zero if there are none. |
| Below-minimum helper | The smallest down payment for a home at this price is $X. |
| Insured note | This includes default mortgage insurance, added because the down payment is under 20 percent. |
| Reset | Reset to Michael's numbers |

## Verification

- tsc clean; `next build` green; **859 tests** (+36: `tests/qualification.test.ts` 31,
  `tests/demo.test.ts` +3, `tests/client-portal.test.ts` +2 the review-driven em-dash and
  never-says-no source sweeps). Engine parity golden anchors: mortgage 500,000 @ 5.00% / 25yr
  qualifies at **2908.02/mo**; 650,000 @ 3.75% / 30yr at **2999.58/mo** (the repo's existing
  cent anchors, now asserted through the qualification path).
- The four-band boundary tests (39/44, 48, 60 edges), the insured-premium fold (0 / 2.8 /
  3.1 / 4.0% + the 0.2% 30yr surcharge + the sub-5% and over-1.5M no-premium guards), the
  minimum-down helper, snapshot immutability, `validateBaseline`, and `proposeQualificationBaseline`.
- Demo: the demo client file carries a baseline; the four bands are reachable from it with
  zero real reads (asserted); every write is `DemoWriteBlocked`; the admin list returns a
  fixture with zero fetch.
- Lime audit green (the admin card is navy + StatusChip; the client explorer's colors are
  outside the audited admin tree; the page's one lime stays the Call button).

**Live anon posture** (proven as the anon role via PostgREST, a TEST link + baseline created
and then DELETED, table left empty): direct table select → 401 (42501); admin write without
the secret → 42501 "operator secret required"; with the secret → succeeds; a published
baseline reads back via `client_qualification_for_token`; a WRONG token hash returns nothing
(no enumeration); the admin list without the secret → 42501.

**Render proofs** (blessed pattern: dev server, forged `fox_demo` cookie under the local
SESSION_SECRET, the PUBLIC demo client page, zero real reads; no console errors) at BOTH
widths per the standing rule:

- Desktop 1280: all four bands — green *fits* (GDS 38.0 / TDS 43.0), amber *options* (43.0 /
  48.0, insured $566,947 with the premium note), amber *alternatives* (54.0 / 59.0, insured),
  navy *conversation* (68.0 / 73.0). Zero horizontal overflow at each.
- Mobile 375: the single-column stacked layout (controls, locked panel, result), and the
  minimum-down helper ("$35,000") with the band still computing on a below-minimum down
  payment. Zero horizontal overflow.

**Deferred (honest):** the ADMIN baseline card's visual proof needs a dev-Clerk admin session
(the deal room is not public), so it is deferred to Michael — verified by the build, the demo
authoring row rendering, the unit tests, and the card's live preview running the same engine.
The B6.4 / B8b precedent.

## Adversarial review

Ran four dimensions (correctness / security-privacy / scope-honesty / copy), each finding
independently verified by a refuting skeptic. Result below.

**8 findings raised, 2 CONFIRMED (both LOW), 6 refuted.** Both confirmed, fixed pre-commit
with regression coverage:

- LOW (correctness) — the down-payment number field had no upper clamp: typing a down payment
  above the price showed "117%" and a $0 mortgage (no crash — `Math.max(0, price - down)`
  guards it — but nonsensical). Same class: the price field accepted 0 despite the slider
  minimum. FIXED: the typed down payment clamps to `Math.min(v, price)`, and the typed price
  floors to the slider minimum (with the down payment kept within it).
- LOW (copy) — a literal em dash in the client `pct()` fallback (`return '—'` when a ratio is
  non-finite). Unreachable today (a published baseline always has income > 0), but a banned
  character on the client render path, and — the real gap — uncaught by every sweep (the
  qualification punctuation sweep reads config only; the source sweep bans internal/verdict
  words, not punctuation, and skips 1-char strings). FIXED: the fallback is now `'-'`, and
  `tests/client-portal.test.ts` gained a comment-stripped em-dash sweep over
  `CLIENT_FACING_SOURCES` (any-length strings) plus a decline-word ("never says no") sweep
  over the same sources, so the brief's law is now enforced over the component, not just the
  config. The admin card's identical `pct` fallback was tidied to `'-'` too.

Refuted (each verified against the code): the upsert not re-checking `p_id` against the deal
(operator-secret gated, and the only caller derives the id from the same deal's rows); no DB
uniqueness for single-published (benign — `set_published` unpublishes siblings and the client
read is `limit 1`); the generous "either ratio" reading showing `options` for an extreme-debt
case (the intended, stated design); `qualifyingMortgage` re-expressing `computePurchase`'s
insurable gate rather than importing it (it uses the same `cmhcPremiumRate`; `computePurchase`
also does closing-cost roll-up B9 does not need — a stated, small mirror); and the admin-card
em dash (admin copy is not grade-6-restricted, tidied anyway).

## Guardrails held

Public repo, synthetic data only (the design cast + example.com; the demo baseline is
fictional). Copy rules doubled on every client string. No client placeholders. `REVIEW_URL`
untouched (still the empty placeholder). No fox-underwriting changes, no Zoho writes, no
sends. The one migration applied live with its posture proven. Census untouched (the deal
room gained one loader read + one card; the client page gained one gated section). Committed,
not pushed.
