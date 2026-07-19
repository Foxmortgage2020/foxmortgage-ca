# Brief B8a — The client portal grows up (foxmortgage-ca)

**Date:** 2026-07-18 · **Repo:** foxmortgage-ca (portal only; no fox-underwriting changes)
**Base:** `main` `d022480`. **Suite:** 783 → **791** (+8), tsc clean, `next build` green. **No writes, no new env, no route changes.**

Three touches on the client status page (`/portal/file/[token]`): a considered desktop layout, the missing
closing-day card fixed at the cause, and a real document checklist — all presentation over reads, the document
read riding the existing migration-0048 grant.

## New standing rule (written into CLAUDE.md alongside the render-proof pattern)

**Every client-facing surface is designed AND proven at BOTH 375px and 1280px in the same session.**
Mobile-first construction stays; desktop is a considered layout, never a stretched phone column.

## Task 1 — The desktop layout

The page moved from a centered `max-w-md` column to a composed layout. The container is
`max-w-md md:max-w-4xl` (896px). The journey is full-width with room to breathe (`md:p-8`). The closing card
becomes a wide band on desktop (label left, date + countdown right). Documents and Team sit side by side
(`md:grid md:grid-cols-2 md:gap-5`). Questions is full-width with the contact buttons wrapping into a row.
Type steps up (h1 `md:text-[40px]`, body `md:text-base`, journey step text `md:text-[15px]`).

Proven live at both widths: at 1280 the journey renders at the full 896px, documents and team are side by
side (measured same top, team right of documents), zero horizontal overflow; at 375 the page is a single
thumb-friendly column, zero horizontal overflow.

## Task 2 — The missing closing-day card (live defect, F053107) — FINDINGS FIRST

**The date was absent at the cause.** Traced via a live COQL read: F053107's Zoho `Closing_Date` is **`null`**
(the field is type `date`, but empty on this refinance). The real July 28 date lives in the **workbench**:
`deals.closing_date = '2026-07-28'` (Finmo-synced, verified live). The client page read only Zoho's empty
field, so `formatClosing(null)` never ran and the card correctly rendered nothing.

**The fix, at the cause:** `lib/client-file.ts` now sources the closing date from the workbench — it resolves
the deal by its `zoho_potential_id` (`getClientDealBrief`) and reads `deals.closing_date`, falling back to
Zoho's field only when the workbench has none. Belt-and-suspenders: `formatClosing` now `slice(0,10)`s its
input, so a full timestamp (a `datetime` field) can never break the `${iso}T00:00:00` concat again.

**After deploy, the live F053107 page renders:** a Closing day card reading **"July 28, 2026"** with the day
countdown (the workbench closing date, which was there all along).

## Task 3 — The client document checklist

The documents card grows a checklist over the synced Finmo request list (`document_index`, active and
non-withdrawn only). It shows:

- **A progress line:** "N of M done" (or "Everything's in" when all done).
- **Waiting on you** (nothing received yet): each request NAMED, in Finmo's own verbatim words (they were
  written for clients), grouped by borrower given-name when the file has 2+ borrowers, one headerless list
  otherwise. This is the only actionable part, in a soft box.
- **Received** (files in, being looked over): a count. A `for_review` status counts as received even when the
  file count has not caught up, because Finmo has the document and is reviewing it.
- **Done** (approved): a count (carried by the progress line + the "Everything's in" headline).

The upload guidance stays beneath the checklist; **the page still never hosts uploads**. If the request read
fails (workbench down, permission, network), the card falls back to the guidance text — never an error.

**Grouping** is the implementer's call per the brief: I group the waiting list by borrower given-name when the
file carries 2+ borrowers (the way the desk groups when it reads clearer), and use a single list for a
one-borrower file.

### The hard rule, guaranteed by construction

AI verdicts, flags, freshness advisories, stale-cycle notes, and review reasons **never render client-side**.
This is not enforced by remembering to strip them — it is structural: `lib/client-checklist.ts` (pure) reads
ONLY the raw Finmo request status + received-file count, and its input type `DocumentRequestRow` carries **no
verdict field at all**. The client path calls none of the verdict fetchers (`getDealRequestReviews` /
`getDealRequestDecisions`). So there is no internal judgment in scope to leak.

`tests/client-portal.test.ts` locks this in the way it already bans internal stage names: a new
`BANNED_VERDICTS` sweep (flagged / stale / illegible / verdict / needs review / for_review / stale_cycle /
needs_input / looks right / worth a glance / requirement) runs over the client-facing sources AND the demo
checklist's runtime strings.

### What the live F053107 checklist renders (verified read-only)

19 active requests, 2 withdrawn (excluded), 15 done (approved), 4 received (`for_review`), 0 waiting;
borrowers David Mehmi + Lyntje Zinger. So the checklist reads **"15 of 19 done"** with nothing in the "still
needed from you" list — the honest state. `tests/client-checklist.test.ts` includes a fixture of this shape.

## Data flow

`getClientFileView` (Zoho-first, as before) now also, behind a `try/catch` (the workbench is a bonus, never a
blocker):

1. resolves the agent (`getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)`),
2. reads `getClientDealBrief(agentId, zohoDealId)` → the workbench deal id + `closing_date`,
3. prefers the workbench closing date over Zoho's,
4. reads `getDealDocumentRequests(agentId, dealId)` → `buildClientChecklist(...)`.

Any failure (workbench unconfigured, deal not found, read error) leaves the Zoho closing date and a null
checklist (the guidance-only documents card).

## Demo

The demo client page short-circuits to `demoClientFileView` **before any workbench read** (`page.tsx`), so
there are ZERO real reads in demo (the checklist + closing date come straight from the fixture). The three demo
files now carry checklists: all-three-states + a closing date (the full-page proof), mostly-done + a closing
date, and all-done + **no closing date** (the dateless / no-closing-card proof).

## Render proofs (blessed pattern, BOTH widths)

Local dev on the dev Clerk instance, signed in as an ephemeral TEST admin **created and DELETED in-session**,
in demo mode (synthetic design cast only), no console errors:

- **1280 (desktop):** the composed layout — greeting stepped up, journey full-width, the closing-day band
  ("September 18, 2026 · 62 days to go"), Documents and Team side by side, the checklist showing all three
  states (waiting grouped Sofia + Marco, "3 are in and being looked over", "4 are done", "4 of 12 done"),
  Questions with the single lime Call button. Zero horizontal overflow.
- **375 (mobile):** the single-column stack — the same checklist grouped by borrower, the single-lime
  Questions card. Zero horizontal overflow.
- **Dateless (funded file):** no closing-day card renders, and the documents card reads "Everything's in".

## Verification summary

- tsc clean; `next build` green; **791 tests** (+8: client-checklist 6, client-portal +2 — the verdict-ban
  sweep and the demo-checklist assertion).
- Fixtures: all-three-states, everything-done, dateless (demo files), and the F053107 shape (a checklist test).
- Demo asserts the client page renders the full checklist with zero real reads; the banned-render test proves
  no internal vocabulary or verdict reaches client markup.
- Census untouched (the additive reads do not change existing behavior; the client page's demo path is
  unchanged). Lime audit green — the client page's one lime Call button is the enumerated brand accent, zero
  additions. (The lime audit walks only the admin tree; the client page is outside it, and it added no lime.)

## Guardrails

No writes anywhere. No fox-underwriting changes (the document read rides the existing 0048 grant). No new env,
no route changes. Public repo, synthetic data only (design cast + example.com; the live client is referenced
only by ref F053107). Copy rules doubled on every new client string: grade 6, warm, contractions, no em dash,
no exclamation point, no semicolon, never an internal word. No placeholders on the client surface. Committed,
not pushed.
