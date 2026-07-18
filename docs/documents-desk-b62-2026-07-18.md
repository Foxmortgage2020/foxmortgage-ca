# B6.2 — The request-centric documents desk (+ the F053107 header and calc-stack fixes)

**Date:** 2026-07-18 · **Repo:** foxmortgage-ca (+ one narrow fox-underwriting migration) · **Base:** `main` tip `5cf0297` · **Starting suite:** 707 tests.
**Supersedes:** B6.1 (never run). B6 rendered *documents* as the unit; the practice runs on Finmo document **requests** as the unit. This session rebuilds the desk around that noun and fixes the live F053107 header and calc-stack defects.

---

## 1. Findings first — the `document_index` data model

### 1a. What `document_index` is (fox-underwriting migration 0020)

The per-deal Finmo document **request** inventory — one row per Finmo document-request. Verbatim columns: `finmo_request_id`, `borrower_finmo_id`, `borrower_name`, `document_name`, `status`, `number_of_files`, `has_src`, `filename`, `requested_at` (Finmo createdAt), `finmo_updated_at` (Finmo updatedAt, the accepted-date proxy), `synced_at`. Natural key `(deal_id, finmo_request_id)`. Synced by the workbench's `src/intake/documentIndex.ts` from `GET /v1/document-requests?applicationId=<uuid>`.

### 1b. Was `portal_readonly` able to read it? — **No. The exception was used.**

Live check: `SELECT` on `document_index` through `portal_readonly` returned **`42501 permission denied`** (0020 enabled RLS with a `service_role`-only policy and revoked all from anon/authenticated; no `portal_readonly` grant or policy). So the pre-authorized exception was taken: **fox-underwriting migration `0048_portal_readonly_document_index.sql`** grants `select` + a `portal_readonly_select_document_index` RLS policy (the `document_pages` pattern from 0034). It is the workbench repo's **own commit**, nothing else there touched, and it was **applied live** to the workbench project (`rnupbdmpxfwsowiqhcqv`) — after which the same query returns `200`. No analysis table needed a grant: the verdict lives on `conditions.presence_detail` (already granted), and `documents` + `document_pages` (citations) are already granted.

### 1c. Status vocabulary is richer than the schema comment

Live F053107 rows show **`approved` / `for_review` / `requested`** (the 0020 comment only named `requested|approved`). `for_review` = received-and-awaiting-review. And `has_src` is mostly false even on approved rows, so **"received" is derived from `number_of_files > 0` (or `has_src`), never a status token.**

### 1d. The request → file link does not exist; the bridge is per-condition and often absent

There is **no FK, no shared id** from `document_index` (`finmo_request_id`) to `documents` (`id`). The only bridge is a commitment **condition** whose `presence_detail.matched_request_id === finmo_request_id`, which also carries `presence_detail.analysis` (verdict + `document_id`) and `presence='verified'`/`verified_at`. **F053107 has 21 requests and ZERO conditions**, so a request routinely stands on `document_index` alone — the model treats the verdict/verified overlay as optional, never assumed.

### 1e. Human-approval truth per request (Task 1 "Reviewed")

- `document_index.status='approved'` is **Finmo's** approval → rendered honestly as **"Approved"** (with the `finmo_updated_at` date), never "approved by you" (the workbench investigation was explicit that this is not the portal's human decision).
- A bridging condition `presence='verified'` (+ `verified_at`) → rendered **"Confirmed"** with the date. `verified_by` is a workbench agent id (not the Clerk human), so no human **name** is claimed.
- **W2 gap, named:** there is no portal per-request approve action, and no human-name-per-request reachable read-only. See §5.

---

## 2. What shipped

### Task 1 — the desk is request cards (`lib/documents-desk.ts`, `DocumentsDesk.tsx`)

`buildRequestsDesk(requests, conditions, borrowerInfoById)` (pure, unit-tested) is the model. Each Finmo request becomes a card; a bridging condition (matched by `matched_request_id`) adds the verdict + confirmed overlay. Card state, in lifecycle order: **Waiting on the client** (nothing received) → **Ready for your look** (received, no verdict) → **Flagged: <reason>** (a concerning verdict — amber, plain-words reason, sorts first) → **Looks right** (a passing verdict) → **Approved/Confirmed** (Finmo-approved or human-confirmed). Cards are **borrower-sectioned** (General first, then per borrower by `finmo_borrower_id`), each section with its own progress count, plus an overall "N of M complete" line and **filter pills** (All / Waiting / Needs your look / Done, with counts). Received files nest as a summary ("N files · uploaded <date> · pulled"). The two upload zones stay. `DocumentsDesk` is a client component (the pills are local state); the model is built server-side and passed in. **No lime** (an AI flag is amber).

### Task 2 — evidence reparented into the request expansion

Each request card expands (native `<details>`) to its Finmo detail + the bridging condition's **analysis** (verdict + reason + as-of, labelled "Analysis (draft)") + the **statement evidence** for the linked `documents.id` (via `analysis.document_id`). The standalone "Statement evidence" Sub is removed from the main page. **Stated deviation (findings-driven):** because the request→file link is per-condition and absent on most files, statement docs that don't link to any request render in a **residual "Statement evidence — not linked to a request" block** at the bottom of the desk, so no evidence is ever dropped. The existing evidence renderer is reparented, not rebuilt.

### Task 3 — commitment-derived requests render + cross-reference

A commitment checklist's document-conditions (a `docKind`, not `not_applicable`) render as request cards marked quietly "From the commitment". One that bridged a Finmo request is that request's overlay (not re-shown); one with no Finmo request is its own card, and one satisfied by an in-hand document (`presence='obtained'`) renders satisfied — all via the existing presence machinery, no new matching.

### Task 4 — the refi header defect (`lib/deal-goal.ts`)

`resolveShape` (Finmo goal wins) + `headerValue`: a **purchase** shows the purchase price; a **refinance/renewal** shows **"Estimated value"** from the freshest reachable application worth (`finmoSnap.mapped.subject_property.worth`), and when none is reachable the value stat is **absent** — never a stale purchase price. An `other`/unknown shape is treated like a refi (never leaks a purchase price). The target lender joins the Lender line when a committed lender is unset. **Proven** on the live F053107 shape (deals row carries a stale `purchase_price` 1,100,000; snapshot `worth` 1,046,923) by `tests/deal-header.test.ts`, and live in demo (a refi shows "Estimated value $705,000", not the stale "$620,000").

### Task 5 — current vs history on the calc stacks (`lib/calc-history.ts`)

`currentAndHistory` groups each stack by its natural identity (a ratio by lender; an income by borrower + lender + basis), renders the current row (latest by `created_at`) full-size, and folds prior recomputes behind a muted **"History (N)"** disclosure. Display only — nothing recomputed. A superseded implausible value (e.g. LTV 1.42) sits in History, never beside the live one.

---

## 3. The F053107 non-code item (for Michael)

The file's display name flows from the **Zoho deal name**, and the main applicant changed. Renaming the deal in Zoho (to the elder **Lyntje**) is a one-minute edit; the portal follows automatically. (Live: `document_index` shows Lyntje Zinger with 12 requests and David Mehmi with 9.)

---

## 4. Verification

- **tsc** clean; **`next build`** green.
- **Full suite: 720 tests / 48 files** (from 707; new: `tests/documents-desk.test.ts` rewritten for the request model, `tests/deal-header.test.ts`, `tests/calc-history.test.ts`; `tests/demo.test.ts` asserts the new desk).
- **Lime audit** (`tests/shell.test.ts`) green, zero additions.
- **Census untouched** — no fetcher/gate/authz/write changed portal-side except the additive `getDealDocumentRequests` read + the `finmo_borrower_id` column on the existing borrowers read. The only workbench change is migration 0048 (grant only).
- **Demo** renders the full desk (3 borrowers + General, every state, a commitment-derived request, dup versions, a missing date), an expanded request with reparented evidence, and both header shapes with **zero real reads** (asserted).
- **Render proofs** (blessed dev-instance pattern; dev Clerk ephemeral TEST admin created + deleted; synthetic demo data only; screenshots referenced, not committed): the desk at desktop (sections, filter pills All 10 / Waiting 3 / Needs your look 4 / Done 3, progress "3 of 10") and at **375px single-column with zero horizontal overflow**; an expanded flagged request (red "Document is stale — Dated over 30 days ago") and an expanded approved request (green "Meets the requirement" + reparented paystub evidence with citations); the refi header showing "Estimated value $705,000" (no stale purchase price); the calc stack collapsed and expanded (superseded LTV 1.42 in History).

---

### Adversarial review (3 dimensions — model-correctness / scope-honesty / design-copy, each finding verified)

Five findings survived verification, all fixed. **One real correctness bug:** `deriveState` ranked a non-green verdict above the resolved states, so a Finmo-approved request our reader flagged (`status='approved'` + a stale analysis are orthogonal data) rendered self-contradictorily — an amber "Flagged" chip beside an "Approved <date>" line, and dropped out of the done count. Fixed twofold: a human `verified` now wins over a draft flag (it is terminal), a Finmo approval does **not** silence our flag (a flagged doc still needs a look), and the reviewed line renders only when the state is actually reviewed (no contradiction; the Finmo status stays visible in the expansion). Two copy nits (an em dash in the analysis separator; "· pulled" ingestion jargon on the card face), one a11y gap (filter pills gained `aria-pressed`), and one dropped affordance (the "N pending in Approvals" per-file shortcut, restored). Refuted: that the "done" count wrongly folds Finmo-approved with human-confirmed, and a borrower-section key edge case.

## 5. W2 workbench items (for a future fox-underwriting session)

1. **Pull-time borrower attribution.** `document_index.borrower_finmo_id`/`borrower_name` are often null (account-level requests), so those cards fall to the General section. Populating borrower attribution at sync time (from the Finmo request's borrower object when present) would section more requests correctly.
2. **A per-request approve action + human identity.** There is no stored human-approval keyed to a Finmo request, and no reachable human **name** per request (`conditions.verified_by` is an agent id; the name lives on `audit_log`). Today the desk renders Finmo's "Approved" and a condition's "Confirmed" honestly; a real "approve this request" action (writing a human decision the desk can attribute) is the natural next step and would let the desk show "Approved by you, <date>".
3. **A direct request → file link.** A `finmo_request_id` on `documents` (or the `src` key on `document_index`) would make the evidence reparent exact for every request instead of only where a commitment condition bridges it — retiring the residual block.

---

## 6. Guardrails held

Public repo, synthetic data only (the migration grants a read; every render proof used demo `demo-deal-1/2`, never a real client). No writes anywhere (the missing per-request approve action is **named, not built**). Evidence reparented, not rebuilt. Copy rules on every string (no em dashes, sentence case, plain words); lime rule intact (AI flags are amber). The exception was used and is stated loud (§1b). Deviations named (§2, Task 2 residual block; §5). Closing ritual: this report + the CLAUDE.md ledger + a changelog entry + the roadmap. Committed, not pushed.
