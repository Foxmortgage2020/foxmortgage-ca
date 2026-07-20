# The Scenario deal bar and teaching results (portal lane)

Date: 2026-07-20 (Toronto). Base: `38921b0`. Committed, not pushed.

Describe the deal in one horizontal line, let the answer own the page, and stop the excluded
lenders being a mystery — each names its reason in plain words.

## Findings first

- **Inputs (the `ScenarioRail`, a 290px left rail):** selects for purpose, occupancy, product
  class, term, rate type, cash back, amortization; `CommittedNumberField` (blur/Enter-committed)
  for mortgage amount + property value; checkbox groups for borrower profiles and client
  commitments; a show-restricted toggle; LTV is computed and locked. **Province is not a rail
  input** — it defaults to `ON` and is set only by a deal prefill.
- **Client-side eligibility/exclusion data today:**
  - `structuralMatch` (lib/scenario.ts) rules a quote out on `productClass` (insurability), term,
    rate type, cash back, LTV band, and rental occupancy — but returns `null` (the quote is
    silently absent, with **no reason**).
  - `scenarioExclusions` evaluates only the quotes that structurally match, then buckets the
    **eligibility** exclusions: `province_ineligible`, `channel_unavailable`,
    `transaction_mismatch`, `program_restricted`, and `province_unknown` (a flag, still ranked).
  - An `ExclusionNotes` component already named excluded lenders — but **per-reason bucket**, not
    a single per-lender "Excluded (N)", and only for the eligibility reasons (never the structural
    ones, which are the biggest source of mystery).
- **Deviations, loud:**
  1. The brief's "Wrong lender tier for this file" example is **not a scenario exclusion**. Tier is
     a savings-engine concept (comparables), not an `EligibilityCategory`. It is never a reason
     here.
  2. "Does not lend on uninsurable files" is a structural class mismatch that returns `null` today
     with no reason. Surfacing structural reasons per lender needs a new pure **read** over the
     loaded book. It reuses the existing filter order and verdicts, changes no matching or ranking,
     and touches neither the workbench nor the eligibility classifier — so it is within the hard
     boundary. The honest copy is **"no X rate on file"** (the book only knows what is on file, not
     a lender's full policy), not the brief's overstated "does not lend on X".

## The change

- **The deal bar** (`DealBar`, replacing `ScenarioRail`): the same inputs, handlers, and test ids,
  reflowed from a vertical rail into one compact horizontal card at the top — a responsive grid
  (`grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`) of the nine single-value inputs plus the LTV chip,
  wrapping to two rows at desktop and stacking at phone. The multi-item qualifier groups (borrower
  profile, client commitments, show restricted) tuck into a "More filters" disclosure so the bar
  stays compact. No new inputs, no new matching logic; the number fields still commit on blur or
  Enter (the standing rule).
- **Results as hero:** the two-column `[290px 1fr]` grid is gone — the ranked matches take the full
  width below the bar. Same ranking, same data, layout only.
- **Teaching** (`ExcludedLenders` + `exclusionReason`, over the new `lenderExclusions`): a collapsed
  "Excluded (N)" section under the matches. Expanded, each lender with real quotes but none in the
  ranking gets ONE plain-words reason — the first decisive filter, taken from its furthest-
  progressing quote (highest `REASON_RANK`). So a BC lender whose only quotes are the wrong class
  reads "No conventional rate on file" (class blocks before the province check ever runs), while a
  BC lender that HAS a matching-class quote reads "Not available in Ontario. Licensed in BC." The
  province-unknown flag (still-ranked lenders) stays as a separate honest note.

The pure derivation is `quoteBlockReason(q, s)` (the first filter one quote fails, in
structuralMatch's order then eligibility) and `lenderExclusions(quotes, s)` (per lender, the
furthest quote's block), both unit-tested. The tier-unconfirmed footnote from the old component was
dropped — tier is not a per-lender exclusion reason.

**Reason copy — honest by shape (hardened after the review).** Two shapes: LENDER-WIDE truths
(`class` = "No conventional rate on file"; `province` = "Not available in Ontario. Licensed in BC.")
that describe the whole book and are always true, and CLOSEST-RATE facts for a lender that HAS a
class-matching quote which fails a later filter ("The closest rate is a different term", "… is
priced for rentals", "… is not offered for a refinance"). The closest-rate wording never claims a
whole-book universal, because a lender can carry a rate of that kind in another class. A restriction
splits two ways: a NAMED restriction ("Needs a borrower profile or commitment this client does not
have") from an UNDISCLOSED / unclassified one, which no profile or commitment can unlock ("The
closest rate carries a restriction the rate sheet does not name. Confirm with the lender") — a
distinct `restricted_undisclosed` kind driven by the verdict's `undisclosedRestriction` flag.

## Adversarial review

A 4-dimension review (correctness / honesty-copy / scope-layout, with a refuting verify pass) ran
over the diff: 6 candidates raised, **5 confirmed, all fixed + tested**. Matching and ranking were
confirmed untouched; every finding was a teaching-copy honesty defect. Three distinct issues:
1. **The 'restricted' reason was false for undisclosed restrictions** (eligibility_unknown /
   unclassified) — "Needs a borrower profile or commitment" is untrue there (nothing unlocks them).
   Fixed with the `restricted_undisclosed` kind and its own line.
2. **'transaction' overstated a per-quote restriction as lender-wide policy** ("Not offered for a
   refinance"). Fixed to the closest-rate form.
3. **'occupancy' and the cash-back 'none' case asserted a whole-book universal** ("Only rental
   priced rates on file") that the furthest-quote model does not guarantee. Fixed to the
   closest-rate form; the other structural reasons (term / rate type / LTV / amortization) were
   reframed the same way for consistency.

## Out of scope (untouched)
The client qualification explorer, any workbench change, Knowledge/library links from reasons,
promos logic, cmd-K.

## Proofs

- Suite **926 → 938 tests** (+12 in `tests/scenario.test.ts`: quoteBlockReason precedence +
  province, lenderExclusions class / matched / furthest-wins / sort / skip, and the named vs
  undisclosed restriction split). `tsc` clean, `next build` green, shell + deals-surface lime audits
  green (no new lime).
- Ephemeral dev-Clerk TEST admin created and DELETED in-session.
- **Live (real book, ON conventional 5-year fixed at $650K/$850K, 76.47% LTV):** the deal bar
  renders as one horizontal card; 14 ranked matches own the page (Duca 4.54% best rate …); the
  "Excluded (11)" section expands to one true reason per lender — 9 × "No conventional rate on file"
  (B-side / insured-only lenders), Kootenay Savings "Not available in Ontario. Licensed in BC.",
  Scotiabank "Needs a borrower profile or commitment this client does not have." Each verified true
  against that lender's book fields. 14 ranked + 11 excluded = 25 lenders in the book (reconciles).
- **Input-commit intact:** typing all six digits of an amount produced ZERO navigations
  (`location.search` unchanged); a blur committed exactly once (`amount=725000`). The rate-book
  fetch is the 2-minute agent cache from the consolidation session (unchanged), so the commit
  re-render re-reads no book.
- **Demo empty state reads as teaching, not broken:** in demo the book is empty (the demo agent id
  has no rows), so the Scenario tab shows the deal bar plus "No approved quotes match this scenario.
  Widen the term, rate type, or product class …" and no excluded section (it absents itself), no
  crash.
- **Both widths, zero horizontal overflow** at 1280 and 375 (the bar reflows to two columns at
  phone; cards stack).

## Follow-ups flagged (not built — out of scope)
- Structural reasons already render (class/term/rate-type on file), but a lender's excluded reason
  is only as rich as the book. If the eligibility classifier ever emits a richer per-quote block
  reason, `quoteBlockReason` can consume it with no UI change.
- Knowledge/library links from a reason line wait for the Knowledge split (out of scope).
- Tier as a first-class scenario dimension would need a new scenario filter + the savings-engine
  tier data on the scenario path — a larger change, deliberately not attempted here.

## Closing ritual
CLAUDE.md header note + session-ledger entry, `config/changelog.ts` entry, roadmap item, and this
report. Committed, not pushed.
