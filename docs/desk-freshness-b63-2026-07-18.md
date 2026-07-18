# B6.3 — Freshness and attribution on the documents desk

**Date:** 2026-07-18 · **Repo:** foxmortgage-ca · **Base:** `main` tip `5d591a8` (after B6.2's push) · **Starting suite:** 720 tests.
**Presentation only.** No writes, no gate/authz change, no fox-underwriting change. The only new read is the `relationship` column on the already-granted `borrowers` table.

Two honesty gaps Michael found on the live desk: "Approved" didn't say who approved, and nothing flagged a recency-sensitive document that had aged past usefulness.

---

## Task 1 — Approval chips name their source

The desk's reviewed chip now names the system of record: `document_index.status='approved'` renders **"Approved in Finmo"** (Finmo's status token reflects Michael's accepts inside Finmo). Never a bare "Approved", and never "by you" — the desk cannot know which human clicked inside Finmo. A bridging condition Michael verified renders **"Confirmed"**. The AI verdict stays a separate, clearly-drafted line ("Analysis (draft) · …"), exactly as B6.2 built it. When the W2 per-request approve action exists, "Approved by you" becomes possible; until then the attribution is the system of record.

## Task 2 — Deterministic freshness windows

New config `config/doc-freshness.ts` — ONE place, every value a one-line edit. At render time a request with a window compares `now` against the **newest received file's honest timestamp** (`document_index.finmo_updated_at`). Over the window: an amber **"May be stale (uploaded N days ago)"** advisory, the card counts into **Needs your look**, and it sorts **just below AI-flagged**. A commitment-derived request carries no honest received timestamp, so it never flags a day-window staleness (no date, no guess). No window configured means no flag.

**Precedence, tested and load-bearing:** a staleness flag NEVER hides, replaces, or demotes an approval chip — the two render side by side ("Approved in Finmo" chip + "may be stale" line). A stale card that is approved in Finmo stays approved *and* shows the advisory *and* moves into Needs your look (it is not counted done).

### The freshness table — for Michael's sign-off

These are **drafts**. Read the table; to change a window, edit one cell in `config/doc-freshness.ts` (the value in days, or `—` for no day window). A blank window is deliberate: some documents' real freshness is a *content* rule (a tax-year cycle, a current-year requirement, an on-face expiry date), which is a later (W2) task and must never be faked with a day count.

| Document | Window (days) | Notes |
|---|---|---|
| Pay stubs | **30** | |
| Proof of pay deposit | **30** | |
| Bank / mortgage / line-of-credit statements | **60** | |
| Letters of employment | **60** | |
| CCB and benefit statements | **90** | |
| Property tax bill | **—** (no day window) | current-year logic is a content rule (W2) |
| NOA, T4, T1 | **—** (no day window) | tax-year cycle (W2) |
| Government ID | **—** (no day window) | on-face expiry date (W2) |
| Void cheque | **—** (no day window) | no natural freshness window |

A document kind the classifier does not recognise gets no window, so no flag — never a guess.

## Task 3 — Same-named borrower sections disambiguate

Where two borrower sections share a **given** name, the header adds a disambiguator: **relationship where known** ("Lyntje (spouse)"), else a neutral ordinal — never fabricated. Ported from the notes layer's precedence idea (structured field, ordinal fallback; `disambiguateBorrowerLabels` in fox-underwriting `lenderNotesSnapshot.ts`), **adapted to the desk's given-name headers and a relationship-first, per-member form** — a deliberate deviation from the notes layer's birth-year-first, all-or-nothing precedence, because `dob` is not populated on these rows (verified live: F053107's two "Lyntje Zinger" carry `dob` null and relationships **family** / **spouse**) and a friendly header reads better as "(spouse)" than "(b. 1957)". The relationship comes from `borrowers.relationship` (migration 0046), now read by `getDealBorrowers`, keyed to the section by Finmo borrower id.

On the real F053107 the two "Lyntje Zinger" sections become **"Lyntje (family)"** and **"Lyntje (spouse)"**.

---

## Verification

- **tsc** clean; **`next build`** green.
- **Full suite: 744 tests / 49 files** (from 720; new `tests/doc-freshness.test.ts`, and B6.3 cases in `tests/documents-desk.test.ts`; `tests/demo.test.ts` asserts the new desk).
- **Census untouched** — no fetcher/gate/authz/write change; the only new read is `borrowers.relationship`.
- **Demo** renders it all with **zero real reads** (asserted): an approved-and-stale card showing both truths, a no-window kind that never flags, and disambiguated "Jordan (parent)" / "Jordan (spouse)" sections.
- **Render proofs** (blessed dev-instance pattern; dev Clerk ephemeral TEST admin created + deleted; synthetic demo data only): the desk with a "Bank Statement — Approved in Finmo + May be stale (uploaded 89 days ago)" card sorted into Needs your look (just below the flagged item), pills **All 12 / Waiting 4 / Needs your look 5 / Done 3**, the two disambiguated Jordan sections, and 375px single-column with zero horizontal overflow.
- **Lime audit** green, zero additions (staleness is amber, an advisory).

Fixtures cover the brief's list: an approved-and-stale card (both truths), an unattributed-approval regression (the chip always names "in Finmo"), a no-window kind never flagging regardless of age, and same-named sections disambiguated by relationship / one-bare / ordinal fallback.

---

### Adversarial review (2 dimensions, each finding verified)

Two confirmed findings, both fixed: (1) the Task 1 attribution reached the state chip but not the request-expansion's reviewed line, which still read a bare "Approved <date>" — now "Approved in Finmo <date>"; (2) a classifier ordering bug — the broad `proof of income` pattern preceded the NOA pattern, so a compound name like "Proof of income - Notice of Assessment" wrongly earned a 30-day window (a false "may be stale" advisory on an annual tax document) — fixed by classifying the no-day-window tax kinds (NOA / T4 / T1) first and narrowing the proof-of-pay pattern to "proof of pay", with two regression tests. No other correctness, honesty, copy, or lime issue survived (the staleness line renders beside the approval chip, never replacing it; the freshness defaults match the brief; no UI em dashes; zero lime).

## W2 content-date freshness (for a future session, once B7 exists)

The day-window flags are deliberately conservative. The real freshness of several kinds is a **content** rule the portal cannot see today:

1. **Extract document-internal dates per kind** — the tax year on a NOA/T4/T1, the "current year" on a property tax bill, the expiry date on a government ID — and evaluate freshness against those, not an upload age.
2. **Re-evaluate on a schedule**, so a document that was fresh at upload but has since crossed a tax-year / current-year boundary flags without a new upload.
3. **The stale-to-chase handoff:** once the client-comms surface (B7) exists, a stale request should become a one-tap re-request to the client, closing the loop the desk only opens.

---

## Guardrails held

Public repo, synthetic data only (demo + the render proofs on `demo-deal-1`; F053107 referenced by ref only, never named in the diff — the demo uses the synthetic cast). Copy rules on every string (no em dashes, sentence case, plain words). The freshness table is config, not scattered constants. Staleness never demotes an approval (tested). Lime rule intact. Deviation named loudly (Task 3 given-name + relationship-first). Closing ritual: this report + the CLAUDE.md ledger + a changelog entry + the roadmap (W2 content-date items). Committed, not pushed.
