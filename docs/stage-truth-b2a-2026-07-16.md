# B2a — Stage truth: the board positions from Zoho (2026-07-16)

Zoho is the system of record for stage. After this session every board card positions by the
linked Zoho deal's display stage through the lifecycle mapping, every portal read of the
Stage field canonicalizes to display space at the fetcher boundary, and the `Ready To Close`
weight amber is cleared. No Zoho writes, no workbench writes, no n8n changes.

## Task 1 verdict: Outcome B (the picklist pair is unchanged)

The live Stage picklist metadata (`GET /crm/v2/settings/fields?module=Potentials`, read with
the app's own token) shows the pair **unchanged**: display `Broker Complete` still pairs with
actual `Ready To Close` at probability 90, and no separate `Ready To Close` display entry
exists. All five documented display/actual pairs stand exactly as verified on 2026-07-14
(`Application Started`/`Application Pending`, `Underwriting In Progress`/`Underwritting In
Progress`, `Conditionally Approved`/`Application Sent To Lender`, `Broker Complete`/`Ready To
Close`, `Mortgage Funded`/`Mortgage Closed`).

So the verbatim `Ready To Close` read was a **record-level value surfacing in actual space**,
not a picklist change. Best-supported mechanism: the Finmo sync writes ACTUAL-space values by
design (its stage guard's STAGE_ORDER is actual space), and a records-API read returns what a
sync-written record stores — the 2026-07-14 "reads return display values" observation was
drawn from UI-written records. Every record the sync moves through a differing pair can
therefore read back in actual space, which is why the fix aliases **all five pairs**, not
just the one seen live.

Two side findings from the metadata:

- The current picklist has **dropped the legacy stages entirely** (Pending, Options,
  Qualification, Archive, Closed, Lost, Mortgage Lost, Additional Properties are absent from
  the 15-entry list). They live on records only now — the portal's existing legacy handling
  (weights, phase belts, staleness) is what keeps them visible.
- The pair list also carries `Declined` (probability 0), a terminal the portal's
  TERMINAL_STAGES vocabulary already handles via the bridge's CLOSED_ZOHO_STAGES.

### Report-only note for Finmo Sync v2 (no n8n change made or needed)

Under Outcome B the sync's stage guard needs **no new alias**: its STAGE_ORDER is actual
space, so a verbatim actual-space read (`Ready To Close`) matches it directly, and its
STAGE_READ_ALIASES exists to translate display-space reads into actual space — both input
spaces already canonicalize correctly. The Outcome-A alias line the brief pre-drafted is not
required.

## What shipped

- **`normalizeDisplayStage` in [config/pipeline.ts](../config/pipeline.ts)** — the read-side
  canonicalization: all five actual-space values map to their display forms, lowercase-keyed
  so case drift is absorbed; display values and unknown values pass through untouched.
  Applied at every portal Stage read-in point in lib/zoho-admin.ts: the SlimDeal mapper
  (Home, board join, closings, bridge planning), the RevenueDeal mapper, and the renewal-pool
  filter (a funded record reading back as verbatim `Mortgage Closed` can no longer silently
  fall out of the renewal pool). The Ask Fox agent tools return raw Zoho field records
  verbatim by design (grounded-or-silent) and are deliberately untouched; the FP portal's own
  fetch path is out of this brief's scope and noted here.
- **`columnForDisplayStage` in [config/lifecycle.ts](../config/lifecycle.ts)** — the total
  display-stage → board-column map at the brief's granularity (Lead/Pending/Application
  Started/Submitted → intake; Collecting Documentation/Options/Underwriting In Progress →
  evidence; Ready to Submit → packaging; Submitted to Lender → with_lender; Conditionally
  Approved/Conditions Fulfilled/Approved → conditions; Broker Complete → ready; funded
  terminals → funded; plus the Qualification and verbatim-actual belts). Boundaries are
  positions in the imported funnel order. Tested: totality, and
  `phaseForBoardColumn(columnForDisplayStage(s)) === phaseForDisplayStage(s)` for every open
  stage — funded terminals asserted separately as the documented B1 divergence (board funded
  column groups Complete & paid; per-file surfaces read Beyond funding).
- **The board positions from Zoho.** Each card's column comes from the linked deal's display
  stage through the new map. Fallback, loud: a room with no linked or fetched Zoho stage (or
  an unknown display stage) positions by the old workbench mapping (`COLUMN_BY_STAGE`, kept
  for the fallback only) and carries a quiet marker: "position from the room, not Zoho".
  The bridge sweep, dormant handling, funded-recency bound, TEST-room exclusion, and card
  contents are untouched. Subline updated: "Every live file, positioned by its Zoho stage and
  grouped by lifecycle phase."
- **STAGE_WEIGHTS and PIPELINE_STAGE_ORDER untouched** (Outcome B), and the amber clears
  anyway: the one live `Ready To Close` record now reads `Broker Complete` portal-wide, so it
  weights at Broker Complete's existing 0.9.

## Census: before → after (every move justified, zero unexplained)

All seven live rooms link to Zoho deals present in the fetch; **zero cards use the fallback**.
Six moves, one stay (BRXM-F053724 alone), each cited by the live Zoho display stage:

| File | Room stage | Old column | Live Zoho display stage | New column |
|---|---|---|---|---|
| BRXM-F053107 | in_progress | evidence | Submitted to Lender | with_lender (move) |
| BRXM-F053724 | funded | funded | Funded | funded (stay) |
| BRXM-F053725 | approved | conditions | Broker Complete (read verbatim as `Ready To Close`, normalized) | ready (move — the brief's expectation) |
| BRXM-F054033 | intake | intake | Approved | conditions (move) |
| BRXM-F056361 | intake | intake | Approved | conditions (move) |
| BRXM-F057400 | intake | intake | Approved | conditions (move — the brief's expectation) |
| BRXM-F059751 | intake | intake | Underwriting In Progress | evidence (move) |

Board totals: intake 4 → 0, evidence 1 → 1, packaging 0 → 0, with_lender 0 → 1,
conditions 1 → 3, ready 0 → 1, funded 1 → 1. The board finally shows what Zoho knows: the
practice's live work is concentrated at conditions and beyond, not in intake.

**Today page:** the same 8 active files with the same amounts and the same per-stage counts;
the one label change is the point — the `Ready To Close` row now reads `Broker Complete`
(1 file), and the unmapped-stage list is **empty** (was: Ready To Close, 1 file, $527,773).
Weighted pipeline consequently rises by 0.9 × $527,773 = **+$474,995.70** with no weights
edit — that is the amber clearing, exactly as intended.

## Demo mode

All three demo rooms link demo Zoho deals whose display stages map through
`columnForDisplayStage` (Underwriting In Progress → evidence, Conditionally Approved →
conditions, Funded → funded), so the demo board takes the Zoho path with zero fallback
markers — asserted in tests/lifecycle.test.ts; the zero-real-reads posture is the existing
demo-guarded fetcher boundary (tests/demo.test.ts).

## Verification

- tsc clean. `next build` completed (BUILD_ID verified). Suite **599 tests** (from 590:
  +9 in tests/lifecycle.test.ts covering normalization, column totality, granularity, the
  phase-consistency contract, the funded divergence, the loud null contract, and the demo
  Zoho-path assertion).
- Render proof via the temp `/preview-b2a` route on synthetic fixtures (screenshot
  in-session, not committed): cards positioned by Zoho display stage across all four phases,
  plus the fallback card carrying the quiet marker. Route deleted, middleware reverted to
  diff-zero.
- Lime audit: zero additions (no new decision-token usage anywhere; the fallback marker is
  fog/muted).

## Operational note (not code)

The machine's disk hit 100% during final verification (283 MiB free at first failure;
`npm cache clean` recovered ~1 GB to finish the build; the local `.next` was removed after
committing to hand the space back). Worth clearing before the next build session.

## Follow-ups

- B2b: the Deals redesign, on top of truthful positions.
- The room `stage` column is now display-only debt mid-pipeline (the bridge still syncs only
  funded/closed); if a future session wants rooms to carry a live stage, that is a workbench
  write path decision, not a portal read fix.
