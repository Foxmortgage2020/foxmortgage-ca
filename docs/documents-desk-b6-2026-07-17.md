# B6 — The documents desk: request and review at a glance

**Date:** 2026-07-17 · **Repo:** foxmortgage-ca · **Base:** `001bbd5` (main tip) · **Starting suite:** 684 tests / 45 files.
**Session type:** Build — agent-side presentation redesign of the deal room's documents area. Read-only against every external system. No fox-underwriting change, no n8n change.

---

## 1. Findings first (data-source inventory)

Before any design, an inventory of exactly what the deal room's documents area is and what feeds it today.

### 1a. The current surface

`app/portal/admin/deals/[id]/page.tsx`, the **Documents** subsection under the Underwriting phase (B2b reparented it there). Today it is:

- The **DocumentUploader** (`components/admin/DocumentUploader.tsx`) — always rendered when `canUploadDocument` (`document.upload`).
- The **CommitmentUploader** — rendered when `canUploadCommitment && !hasRealCommitment`.
- A loud red **synthetic banner** when any document carries `provenance='synthetic'` (workbench guardrail 20).
- A plain **`<table>`** of received documents: columns Document / Borrower / Source / Received / Review, one row per `DocumentRow`, the Review cell a `StatusChip` keyed off `reviewStatus`.
- On a permission refusal, a `SectionFallback` ("not granted to the portal read-only role").

There are **no per-row actions** on the documents table today — reviewing/approving a document happens on the Approvals desk and in the conditions checklist, not here. The only actions in the area are the two uploaders (collection).

### 1b. What feeds it (fields, source, freshness)

| Data | Fetcher | Source | Fields available | Freshness |
|---|---|---|---|---|
| Received documents | `getDealDocuments(agentId, dealId)` (`lib/underwriting.ts`) | workbench `documents` table via `portal_readonly` | `id, docType, source, receivedAt, reviewStatus, createdAt, provenance, borrowerId` | live read per request (200-row cap, `created_at.desc`) |
| The checklist (conditions) | `getApprovedConditions(agentId, dealId)` | workbench `conditions` table (`gate_status=approved`, checklist sources) | incl. `presence`, `presenceDetail` (jsonb), `docKind`, `borrowerId`, `dueDate`, `status`, `requirement` | live read per request |

**Both reads already happen on the deal page** (`condsR` and `documentsR` in the page's `Promise.all`). The desk is presentation over these two existing reads — **no new fetcher, no new field, no gate, no authz, no write.**

`reviewStatus` observed vocabulary across the repo: `approved`, `reviewed`, `pending`, `rejected` (workbench-owned; unknown values are surfaced, never silently filed as done).

### 1c. Is the document-intelligence verdict reachable read-only today? — **Yes.**

The B5 work put a per-document analysis on **conditions**: `condition.presenceDetail.analysis` is an object carrying `verdict` (`meets` / `short` / `stale` / `rule_unmet` / `needs_review` / `kind_mismatch`), `extracted`, `requirement`, `delta`, `as_of`, `value_citation`, and — critically — **`document_id`** (the analyzed document's id). `ConditionsChecklist.tsx` already renders it (`AnalysisBlock`, `VERDICT_TONE`).

So the verdict is reachable read-only from data the deal page already fetches, and it can be attributed to a **specific document card by a hard id join** (`analysis.document_id === document.id`). The desk renders it, named as a draft ("Analysis (draft)"), with its as-of date. **No cross-repo plumbing was needed.**

### 1d. Findings that shaped the design (deviations named loudly)

1. **"Requested" documents are not rows in the `documents` table.** That table only holds documents that have *arrived* (uploaded / Finmo / generated). The "requested-but-not-received" state — the brief's **Waiting on the client** group — lives on **conditions** (an open condition with a `docKind` and `presence` in `needs_input`/`requested`). The desk therefore draws its three groups from **two** existing reads: received documents (Needs your eyes + Done) and outstanding document-requests (Waiting on the client). The brief's own language ("requested vs received vs reviewed", "the relevant date (requested or received)") confirms requested-state cards are intended. **Deviation from a documents-table-only reading, made deliberately and stated here.**
2. **The waiting cards are a read-only glance, and they overlap the conditions checklist.** The checklist (under Fulfilment) remains the working surface for document-chase conditions (add / edit / verify / waive). The desk shows the same outstanding requests as calm read-only cards so the "one glance" is complete. Two lenses on one truth, by design.
3. **`analysis.document_id` is not always stamped.** B5 recorded that the requirement/evidence linkage is still being completed on the workbench. In the demo fixture the field was `null`. So the join has a **safe fallback**: an analysis without a `document_id` is attributed to a document by `(docKind, borrowerId)` **only when that pairing is unambiguous** (exactly one candidate analysis and exactly one matching document); otherwise no attribution (never guessed). Hard join is always preferred.
4. **`review_status` vocabulary is workbench-owned.** The desk treats `{approved, reviewed, accepted}` as done-positive and `rejected` as done-negative; any *other* value routes to Needs your eyes so an unknown status is surfaced for a look, never silently filed as done.

---

## 2. The design

### 2a. Model — `lib/documents-desk.ts` (pure, unit-tested)

`buildDocumentsDesk(documents, conditions)` → `{ needsEyes, waiting, done, counts, isEmpty }`.

**Grouping**

- **Received document** (from `documents`):
  - `approved` / `reviewed` / `accepted` → **Done**, green "✓ …".
  - `rejected` → **Done**, red "Rejected".
  - `synthetic` provenance → **Needs your eyes**, loud red "Synthetic" + a stand-in warning (never approvable — guardrail 20).
  - otherwise (pending / unknown) → **Needs your eyes**. Its state chip is **amber "Needs attention"** when a concerning draft verdict (a red gap or an amber needs-review) is attached, else a calm **navy-outline "In review"**.
- **Requested document** (from `conditions` with `docKind`, open, `presence` `needs_input`/`requested`) → **Waiting on the client**, gray "Requested", date = due date (or bare "Requested"). Suppressed when a document of the same `(docKind, borrowerId)` has already arrived (no double-show).

**Analysis join** — hard by `analysis.document_id`; unique `(docKind, borrowerId)` fallback otherwise; ambiguity → no attribution. Verdict → tone/label mirrors `ConditionsChecklist`'s `VERDICT_TONE` (one vocabulary).

**Sort** — Needs your eyes: synthetic → gaps (red) → needs-review (amber) → plain, newest received within a tier. Waiting: soonest due first. Done: newest received first.

### 2b. Component — `components/admin/deals/DocumentsDesk.tsx` (server, presentation)

Three groups in order (Needs your eyes / Waiting on the client / Done), each a ds-style header (`font-heading`, navy, count) over a responsive card grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`; single column at phone). Each card: name (Poppins, capitalized), borrower · source line, a state chip, an optional analysis chip (verdict + "Analysis (draft)" + as-of), a date line, and the loud synthetic warning when applicable. Empty state: the muted "No documents recorded on this file yet." line. **No lime** (reviewing is work, not a queued decision); StatusChip for green/amber/red/gray, an inline navy-outline span for received-pending.

### 2c. Page wiring

The `<table>` block was replaced with `<DocumentsDesk desk={buildDocumentsDesk(documents.data, conds)} borrowerNameById={…} />`. The uploaders, synthetic banner, `SectionFallback`, and every permission gate are **unchanged**. The now-unused `CELL_DATE` import was dropped.

---

## 3. The workbench read contract (for a future workbench session)

The verdict is reachable today, so no integration is *blocking*. Two refinements the workbench could make so the desk's analysis chip covers more documents, more precisely (named here per the brief):

1. **Always stamp `analysis.document_id`.** The desk prefers the hard id join; where the workbench leaves `document_id` null, the desk falls back to a `(docKind, borrowerId)` match and *declines to attribute when ambiguous*. Stamping the id on every analysis removes the ambiguity gap. (Contract: `conditions.presence_detail.analysis.document_id : uuid` = the `documents.id` the verdict was computed against; freshness = recomputed with presence.)
2. **A per-document review verdict on the `documents` row itself.** Today the only document-intelligence verdict is condition-side (value-bearing kinds with a numeric requirement — income/value/ccb). A document with no requirement-bearing condition (an ID, a void cheque) has no verdict at all. If the workbench ever exposes a per-document `analysis`/`review_verdict` column on `documents` (keyed by `documents.id`, freshness = on index/recompute), the desk's analysis-chip slot renders it with **zero design change** — the card already accommodates the chip whether or not a verdict is present.

---

## 4. Verification

- **tsc** clean.
- **`next build`** green.
- **Full suite: 707 tests / 46 files** (was 684; +23 — 22 in `tests/documents-desk.test.ts`, +1 in `tests/demo.test.ts`).
- **Lime audit** (`tests/shell.test.ts`) green, **zero additions** to the decision-allowed map (the new component is lime-free).
- **Census untouched.** No fetcher, gate, authz, route, or write changed. Diff is `lib/documents-desk.ts` (new) + `DocumentsDesk.tsx` (new) + the page's Documents subsection + demo fixtures + tests.
- **Demo mode:** `tests/demo.test.ts` asserts the desk renders all three groups + the amber state from fixtures with **zero real `fetch` calls**.

### Adversarial review (3 dimensions — correctness, scope/honesty, design/copy — each finding independently verified)

Three findings survived verification, all fixed. Two copy-rule nits — an em dash in the desk's synthetic-warning string (`DocumentsDesk.tsx`) and one in the synthetic banner line the diff had touched (`page.tsx`). One low-severity **correctness** bug: a synthetic (or rejected) document wrongly suppressed an open **Waiting** request for the same document kind, because it was counted as "arrived" in the dedup set — but a synthetic stand-in has not arrived (the client still owes the real document, guardrail 20) and a rejection leaves the request open. Fixed so only a **real, non-rejected** document suppresses a Waiting card, with two regression tests. Every other candidate was refuted on inspection — notably that `reviewed → Done (green)` is a deliberate improvement over the old table's neutral-gray treatment, and that the raw `as_of` rendering matches the canonical `ConditionsChecklist` sibling. No scope defect found.

### Render proofs (blessed dev-instance pattern; dev Clerk, ephemeral TEST admin created and deleted in-session; synthetic demo data only; screenshots referenced, not committed)

- **Desktop, all three groups + amber** (`/portal/admin/deals/demo-deal-1`): Needs your eyes (T4 Noa — amber "Needs attention" + red "Short of the requirement · Analysis (draft) · as of 2026-07-01"; Void Cheque — navy-outline "In review"), Waiting on the client (Fire Insurance Binder — gray "Requested" · Due Jul 18), Done (Pay Stub — green "✓ Reviewed").
- **375px mobile:** single column, all three groups, **zero horizontal overflow** (`documentElement.scrollWidth - clientWidth === 0`).
- **Empty state** (`/portal/admin/deals/demo-deal-2`): "No documents recorded on this file yet."

TEST admin `user_3Geu…` created and **deleted**; demo mode entered and **exited**; dev server stopped.

---

## 5. Guardrails held

Public repo, synthetic data only (demo fixtures + test factories; the render proofs used demo `demo-deal-1/2`, never a real client). Presentation over existing reads — no fetcher / gate / authz / write / route / env change. Copy rules on every new UI string (no em dashes, sentence case, plain words). Lime rule intact. Closing ritual done (this report + the CLAUDE.md ledger + a changelog entry + the roadmap). Committed, not pushed.
