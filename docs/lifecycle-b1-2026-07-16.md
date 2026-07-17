# B1 — The Lifecycle Spine (2026-07-16)

Presentation layer only. One canonical lifecycle definition (`config/lifecycle.ts`) now drives
the Underwriting board, the Today pipeline table, and a new journey stepper on every deal room.
Nothing moved: the before/after census is byte-identical, the unmapped-weight list is identical,
and every board column keeps its key and its deals.

## Findings first

1. **Live reads return `Ready To Close` verbatim.** One active file ($527,773) reads back the
   stage string `Ready To Close`, despite the documented display/actual indirection
   (config/pipeline.ts) saying that actual value displays as `Broker Complete`. It is also
   today's weight-unmapped amber flag. The brief's phase table missed it. Resolution: mapped to
   `complete_paid` in the phase model (its funnel position after Approved is unambiguous; the
   lookup is case-insensitive to absorb exactly this kind of case drift), while `STAGE_WEIGHTS`
   was deliberately left untouched (guardrail), so the weight-unmapped amber on Home and Revenue
   stands until Michael maps the stage in config/pipeline.ts.
2. **`Qualification` was missed by the brief's table.** It is a legacy stage still carried in
   `STAGE_WEIGHTS` and in a demo fixture (demo-z-7). Mapped to `intake` — without it, demo mode
   would have shown a false "phase not mapped" flag.
3. **The two stage spaces collide on `submitted`.** In Zoho display space, `Submitted` is a
   fresh application (intake). A workbench room at `submitted` is with the lender
   (underwriting). Guessing is not honest, so `journeyForStage` takes an explicit
   `space: 'display' | 'room'` and the caller declares which vocabulary it speaks.
4. **The spaces disagree on ready-to-submit.** Workbench `ready_to_submit` maps to the board's
   `ready` column (pre-existing `COLUMN_BY_STAGE`, a contract this session may not change), so
   it phases as Complete & paid — while the display stage `Ready to Submit` is Underwriting per
   the model. No live room carries the workbench value today. Recorded, not changed.
5. **The brief's table double-assigns funded terminals** (they appear under both
   `complete_paid` and `beyond_funding`). Resolved by its own Task 4 rule: per-file surfaces
   (the display map, the stepper) put funded files at Beyond funding; the board's funded column
   groups under Complete & paid.

## Census (the nothing-moves anchor)

Captured live before any change and re-captured after the build with the same script
(the pages' own loaders and logic). The two JSON captures diff byte-identical.

**Board — live rooms per column (7 rooms, parked 0):**

| Column | Before | After |
|---|---|---|
| intake | 4 | 4 |
| evidence | 1 | 1 |
| packaging | 0 | 0 |
| with_lender | 0 | 0 |
| conditions | 1 | 1 |
| ready | 0 | 0 |
| funded | 1 | 1 |

**Today — active pipeline by stage (8 files):**

| Stage | Before | After |
|---|---|---|
| Application Started | 2 | 2 |
| Underwriting In Progress | 1 | 1 |
| Submitted to Lender | 1 | 1 |
| Approved | 3 | 3 |
| Ready To Close | 1 | 1 |

**Unmapped-weight list:** `Ready To Close` (1 file, $527,773) — identical before and after.

## What shipped

- **`config/lifecycle.ts`** — the single source. Five phases with plain-words descriptions;
  `phaseForDisplayStage` derives from `PIPELINE_STAGE_ORDER` positions (segment boundaries,
  never a restated stage list; unknown or dead-end stages return null, rendered loudly);
  `phaseForBoardColumn` total over the seven column keys; `boardPhaseGroups`; `groupByPhase`
  with the trailing loud "Phase not mapped" group; `PHASE_STEPS` per phase per deal shape
  with `live | manual | planned` status and a note on every non-live step (the dashboard
  doubles as the SOP); `stepShapeFor` through the house deal-shape mapper (the Finmo goal wins
  a conflict — the header chip's own honesty rule); `journeyForStage`.
- **Board** — the same seven columns under four phase headers (Intake / Underwriting /
  Fulfilment / Complete & paid), calm uppercase labels with hairlines, no lime. Columns
  relabelled (keys stable): Evidence → "Documents & review", Packaging → "Package & submit",
  With lender → "With the lender", Commitment · conditions → "Conditions". On wide screens the
  sections keep the columns' 1 : 3 : 1 : 2 relative widths; below xl the board stacks phase by
  phase, which reads better on mobile than the old arbitrary seven-column wrap.
- **Today** — the compact pipeline table groups rows under quiet phase group rows in lifecycle
  order. Group rows were chosen over per-row chips: a chip would put a second pill on every row
  and repeat each phase word once per file; four group rows say it once each, in the same words
  as the board. Closing-date order holds within each group. An unmapped stage renders under an
  amber "Phase not mapped" group row, never forced into a phase.
- **Deal room** — `components/admin/JourneyStepper.tsx` mounts under the title strip, display
  only, zero reads. Five phases in one row (muted check past, ink-navy current, gray future,
  hover shows the phase description), the current phase's steps beneath in the training-deck
  words shaped to the file (purchase carries the pre-approval letter and shopping steps,
  refinance/renewal/switch run the compressed set, unknown gets the neutral set). Manual and
  planned steps render gray with a small marker and the one-sentence note on hover. Funded
  files show Beyond funding with an "Open renewals" link. Dormant or closed rooms show no
  journey (a dead file has no current phase). The two mandated planned placeholders shipped:
  intake "Application chase" (waits on the intake drip build) and purchase-only
  "Pre-approved · shopping" (waits on a shopping signal — no detection invented).

## Removals and demotions (the clutter pass, board page)

- The page sub-line shrank from two machinery sentences to one plain sentence ("Every live
  file, grouped by lifecycle phase. The board keeps itself in step with Zoho.").
- A single-column phase no longer repeats its own name — the intake section stacked
  "INTAKE / INTAKE" (phase header + identical column label); the column label text is
  suppressed when it matches its phase header, the count and card alignment stay.
- Considered and kept: the per-column "Empty." captions (they confirm a column rendered) and
  the sweep's "just created N rooms" note (a real signal).
- Card contents were frozen by the brief and are byte-identical.

## Bounded visual sweep (the three touched surfaces)

- Board: h1 moved to the shell face and ink token (`font-ui text-ink-navy`).
- Deal-room header: both h1s and the back link moved to the shell face and ink tokens; the
  back link now says "← Underwriting" (the list it actually goes to); the "Find rates for this
  deal" button lost its legacy `bg-lime` — a navigation affordance is not a queued decision —
  for a quiet white/hairline secondary style. Test ids unchanged.
- Today's compact pipeline card was already on tokens; it gained only the group rows.

## Verification

- `tsc` clean. `next build` green. Suite **590 tests** (from 567: +23 in
  `tests/lifecycle.test.ts`; the underwriting-bridge label assertion updated to the new
  labels; `tests/shell.test.ts` lime audit now also walks JourneyStepper as audited-but-not-
  decision-allowed — zero additions to the decision-allowed set, as expected).
- Census before/after byte-identical (tables above).
- Render proofs captured on synthetic fixtures via a temporary public `/preview-b1` route,
  screenshotted in-session (screenshots referenced, not committed), then the route was deleted
  and the middleware entry reverted (middleware diffs clean against main): (a) the board under
  phase headers, (b) the Today table grouped with the amber unmapped group, (c) the stepper on
  a purchase shape showing the planned shopping step and its note, (d) the same stepper on a
  refi shape (compressed), plus the funded Beyond-funding state and the loud unmapped state.
- The live click-through is Michael's.

## Visual debt inventory (read-only audit, feeds B2/B3)

Scripted sweep over `app/portal/admin/**` + `components/admin/**` (81 files): **72 files**
carry off-token usage. Totals: **150 legacy lime classes** (`*-lime`), **728 legacy navy
token uses** (`*-navy`), **1,321 raw gray-palette classes** (`gray-N`), **561 raw
amber/red/green palette classes**, **1,010 `font-heading`/`font-body`** (Poppins/Montserrat)
uses where the shell face is Archivo.

Heaviest files (worth whole-surface passes in B2):

| File | Off-token classes |
|---|---|
| components/admin/RatesScenario.tsx | 278 (incl. 18 lime) |
| components/admin/ConditionsChecklist.tsx | 205 |
| components/admin/ApprovalsDesk.tsx | 185 (7 lime) |
| components/admin/ComplianceModule.tsx | 177 |
| app/portal/admin/partners/[partnerId]/page.tsx | 174 (8 lime) |
| app/portal/admin/revenue/page.tsx | 162 (8 lime) |
| app/portal/admin/deals/[id]/page.tsx (interior) | 132 |
| components/admin/LenderKnowledge.tsx | 128 |
| app/portal/admin/renewals/page.tsx | 127 |
| app/portal/admin/page.tsx (below the fold) | 124 (9 lime) |

Notable specifics for B2 judgment calls:

- 44 files carry legacy lime classes, almost all `hover:text-lime` link accents and
  `bg-lime` primary buttons that predate the Phase A rule (e.g. the Home section-card
  "→" links, the Rates scenario controls, the roadmap status chip). Each is a candidate for
  ink-token replacement; none is a queued-decision surface.
- `components/admin/LenderNotesCard.tsx` uses lime on "Generate Lender Notes" deliberately
  (recorded in the 2026-07-15 ledger as "the human action") — that stands in tension with the
  Phase A queued-decision rule and deserves an explicit call in B2 rather than a silent fix.
- The Home page below the fold still runs on the old SectionCard/AttentionCard styles
  (gray-200 borders, font-heading titles, hover:text-lime links) while everything above the
  fold speaks Phase A — the single most visible seam in the app today.
- The deal-room interior (Section/Chip/Muted helpers) is gray-palette and Poppins throughout —
  B2's stated territory.
- Orphan/superseded-looking surfaces: `components/admin/StubPage.tsx` (3 lime; the session-tag
  stub frame from Session 1 — check for remaining consumers), and the pre-shell
  `TONE_STYLES`/`KpiCell` helpers duplicated inside app/portal/admin/page.tsx rather than
  shared.

## Deviations from the brief

- The brief's shape list names `switch` as a distinct step-set key; the house mapper
  (`lib/deal-goal.ts dealShapeOf`, deliberately not re-derived) folds switch/transfer into
  renewal, so the `switch` key exists in `PHASE_STEPS` (same compressed set) but is reachable
  only if that mapper ever splits them. Recorded in code.
- `phaseForDisplayStage` maps funded terminals to `beyond_funding` (finding 5 above).
- The census detail (per-room column assignments) was written to the session scratchpad
  outside the repo; this report carries counts only (public-repo PII rule — no live file
  refs).

## Follow-ups handed forward

- Map `Ready To Close` in `config/pipeline.ts` (STAGE_WEIGHTS + PIPELINE_STAGE_ORDER) so the
  weight amber clears — Michael's call on the weight value (it sits beside Broker Complete's
  0.9).
- B2: the deal room laid out phase-aware, plus the inventory above. B3: agent mode.
