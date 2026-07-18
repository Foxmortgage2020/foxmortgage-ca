# B6.4 — The desk reads the verdicts

Date: 2026-07-18 · Repo: foxmortgage-ca (portal only; no fox-underwriting changes) ·
Base: `bf8ff0d` · Suite: 744 → **764** (+20) · tsc clean · `next build` green.

The last mile of the document pipeline, all on one card: request, arrival, AI
verdict, Michael's look, his decision. Presentation + read over the newly-granted
W2 tables (`document_request_reviews`, `document_request_decisions`,
`document_index.withdrawn_at`, `documents.finmo_request_id`), plus TWO gate
write-actions (approve / send back, and the Check-Finmo nudge). No Finmo writes.

## Findings first

- **Prerequisite verified live** (workbench `rnupbdmpxfwsowiqhcqv`, migration 0049):
  all three new tables carry the exact contract columns; `document_index.withdrawn_at`
  and `documents.finmo_request_id` exist; `portal_readonly` holds SELECT on all four.
  On the proof file `BRXM-F053107`: verdicts **flagged 1 / stale_cycle 5 / questions
  35 / passed 3** (44 reviews), **2 withdrawn / 19 active** requests, **0 decisions**,
  **11 request-less documents** (matching the brief's "eleven"). The reason shape is
  `{code, message, citation:{page,snippet}, severity}`; `content_dates` are typed
  (`{pay_date}` / `{issued}`); **multiple reviews share one `finmo_request_id`** (the
  two F053107 NOAs), so grouping-by-request + rank-picking is load-bearing.
- **Starting suite was 744, not the brief's "742"** — B6.3's final commit bumped it.
  No action; recorded for honesty.
- **The Approve control is navy, not lime — stated deviation, sanctioned by the
  brief.** The brief permits the decision token OR justified outline styling. The
  renewal approval desk (`RenewalDripQueue`, the brief's explicit template) styles its
  Approve button `bg-cool-800` (navy), not the decision token; the B4 lime rule
  reserves `decision` for the queued-decision *signals* (nav dots, the Desk strip,
  the ConditionsChecklist Verify tap). So Approve is `bg-navy` and Send back is an
  outline control — mirroring the sibling desk exactly, **zero lime-audit change**.
- **A verdict suppresses the B6.3 day-window advisory (no double-flag).** Once the
  workbench produced an AI verdict (review OR condition analysis), that verdict — which
  read the document's own `content_date` — is the freshness authority; the portal's
  cruder upload-date day-window advisory does NOT also fire. This is the truest sense
  of "the B6.3 day-window logic now prefers content_date": the content_date-based
  judgment supersedes the portal heuristic. The portal advisory REMAINS as the
  fallback for a received file with no verdict (a not-yet-analysed file), and `content_date`
  is surfaced on the card's date line ("issued Jan 15", "contains a pay date of …")
  regardless of verdict.

## What shipped, per task

**Task 1 — verdict chips, calibrated weight.** `lib/documents-desk.ts` normalizes the
AI verdict from either the bridging condition (preferred) or the best request review
(`flagged`>`questions`>`stale_cycle`>`passed`, one row per document → best per request).
New states `ai_questions` / `ai_stale_cycle`; the component renders `flagged` as the
only amber (plain reason on the card face, `Needs your look`, sorts first), `questions`
as a quiet gray "Worth a glance" chip + "Couldn't read everything, worth a glance" with
the specific reason in the expansion **and its own filter pill** (so 35 illegible image
IDs never swell Needs-your-look), `stale_cycle` as a navy "On file" chip + the soft
verbatim line (never amber, never demotes an approval), and `passed` as a quiet green
"Looks right". `content_date` renders on the date line.

**Task 2 — withdrawn requests.** `DocumentRequestRow.withdrawnAt`; the model partitions
withdrawn requests out of the active cards and all counts and groups them by borrower;
each section renders a quiet "Withdrawn (N)" expandable (muted, struck-through, with the
withdrawal date). A section holding only ghosts still renders (nothing lost).

**Task 3 — the residual, named.** `residualDocuments()` (pure) lists `documents` rows
with no `finmo_request_id` (real, not rejected, not already reparented) as a "Not tied
to a request (N)" block — kind, source, date — plus any statement evidence not
reparented into a card. On F053107 that is the 11 credit reports / consents.

**Task 4 — Check Finmo now.** A quiet button wired to the idempotent nudge
`POST /api/gates/deals/[dealId]/check-finmo` (`conditions.recompute`), with a busy state
and a "last checked N ago" line fed by `deals.finmo_docs_pulled_at`. `router.refresh()`
on success.

**Task 5 — approve / send back, through the gate.** Each received request's expansion
gains Approve (navy) and Send back (outline, required 5+ char reason) →
`POST /api/gates/document-requests/[requestId]/decision` (`approvals.document_request.decide`,
admin, CONTRACT key added). The gate is human-only workbench-side. A decided request
renders "Approved by you, {date}" (navy badge) or "Sent back, {date}: {reason}"
**alongside**, never replacing, the Finmo chip and the AI verdict — the three truths
side by side. An approved decision completes the card (counts to Done); a send-back
stays visible until it resolves. The decision controls are hidden in demo and refused
server-side there.

## Read/write layer

- `lib/underwriting.ts`: `getDealRequestReviews` / `getDealRequestDecisions` (paginated
  read of the two new tables); `DocumentRequestRow.withdrawnAt`, `DocumentRow.finmoRequestId`,
  `DealDetail.finmoDocsPulledAt` added to their selects.
- `lib/gates.ts`: `decideDocumentRequest` + `checkFinmoNow` (both demo-blocked).
- Two proxy routes forwarding the browser-minted `x-gates-token`, each gating on the
  right permission; the decision route also enforces the 5-char send-back reason early.
- `config/authority.ts`: `approvals.document_request.decide` (admin, labelled).
- Demo: `demoDealRequestReviews` / `demoDealRequestDecisions`, a withdrawn pair and the
  request-less residual docs, all synthetic; every verdict state + the three-truths bank
  statement + a stale_cycle NOA are represented.

## Verification

- tsc clean; `next build` green; **764 tests** (documents-desk 48, +19 for B6.4;
  demo test extended to pass reviews/decisions + assert the two new gate actions
  DemoWriteBlocked with zero fetch).
- **Demo zero-real-reads asserted**; the gate actions reject `DemoWriteBlocked` and never
  call fetch (asserted); the decision controls are hidden in demo.
- **Census untouched.** No fetcher query change to the existing surfaces, no authz change
  to existing keys, no route path change; the board/list are untouched.
- **Lime audit: zero additions** (`tests/shell.test.ts` green; the desk uses amber for
  flags and navy for the decision control, no `decision`/`-lime` classes).
- **Render proofs** (blessed pattern: dev server, dev-Clerk ephemeral TEST admin created
  and DELETED in-session, demo synthetic data only, read-only navigation, no console
  errors). Desktop: the full desk with all four verdict states, the Questions pill,
  the three-truths bank statement (Flagged + Approved in Finmo + Approved by you),
  the stale_cycle NOA soft line, the disambiguated Jordan sections, the two per-section
  Withdrawn expandables, and the "Not tied to a request (2)" residual. 375px: measured
  zero horizontal page overflow (`scrollWidth === clientWidth === 375`; the only wide
  elements are inside the pre-existing JourneyStepper's own scroll container) and a clean
  single-column stack. Screenshots referenced, not committed.
- **Live proof path.** The workbench posture (tables, columns, grants, F053107 data) was
  verified live read-only. The live UI round-trip (Check Finmo now + one Approve) needs a
  browser-minted Clerk `gates` token, which the agent cannot mint non-interactively — so
  it is **Michael's manual step**, exactly as the renewal-drip and conditions decision
  paths were handed over. The code path mirrors the live-proven renewal approve pattern
  and is unit-covered. Decisions are append-only (a re-decide upserts the one current row
  per request); no proof rows to revert.

## Adversarial review

Three dimensions (model correctness / contract-security-demo / design-copy) raised
13 findings; a refuting skeptic verified each; **9 refuted, 5 confirmed, all fixed
pre-commit** with regression tests:

- **MEDIUM — the decision controls rendered on commitment-origin cards.** `canAct`
  lacked an `origin === 'finmo'` guard, so a satisfied commitment-only condition
  (key `cond:<id>`) showed Approve / Send back; the client's `key.replace(/^req:/,'')`
  left `cond:<id>` and POSTed it as a `finmo_request_id` → a guaranteed 404. Fixed:
  `canAct` requires `card.origin === 'finmo'`. (A commitment condition is decided on
  the conditions checklist, not here.)
- **MEDIUM — request-tied statement evidence was mislabelled residual.** A statement
  document with `finmo_request_id` set but no bridging condition fell into the page's
  statement-evidence fallback and rendered under the "Not tied to a request" header —
  the common F053107 shape. Fixed two ways: a review-path card now carries the best
  review's `document_id` so its evidence reparents into ITS card, and the page's
  fallback excludes any request-tied document from the residual.
- **LOW — a commitment condition bridging a WITHDRAWN request rendered nowhere.** The
  merge-skip keyed on all request ids (withdrawn included), so the still-open
  obligation showed only as a ghost. Fixed: the skip keys on ACTIVE request ids, so
  the obligation renders as its own commitment card.
- **LOW — the Send-back disclosure toggle lacked `aria-expanded`** (added, matching
  the pills' `aria-pressed`).
- **LOW — a ghost-only borrower section showed a "0 of 0" counter** (now reads
  "withdrawn only").

Re-verified after the fixes: 764 tests green (+3 regressions), tsc clean, build green,
and a second render proof (ephemeral TEST admin, demo) confirmed the desk intact with
the residual showing exactly the two request-less documents and no console errors.

## Guardrails held

Public repo, synthetic data only (F053107 referenced by ref; demo/synthetic in code).
No Finmo writes anywhere. The only write path is the two gate actions under Michael's
verified session. Copy rules on every string (no em dashes, sentence case, plain words).
Lime rule intact (Approve is navy; zero decision/lime classes on the desk). Deviations
stated loud (Approve styling; the day-window/verdict interaction). Committed, not pushed.

## Remaining on this arc (the document pipeline is otherwise complete end to end)

- The Finmo status write-back (mirror Michael's approve into Finmo) — its own
  explicitly-approved build (W2 Task 7, investigation-only).
- The content-vs-slot classifier (a wrong-content document in the right Finmo slot reads
  `passed`) — a separate feature W2 named.
- A re-evaluation cadence (re-run the review as documents age) — W2 follow-up.
