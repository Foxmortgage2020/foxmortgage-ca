# Lenders one-row consolidation (portal lane)

Date: 2026-07-20 (Toronto). Base: `d6d8204`. Committed, not pushed.

One tab row, one story per view, names that don't collide. The two stacked tab
rows collapse into a single row — **Scenario, Rates, Promos, Intel, Knowledge** —
and the rate-book fetch is decoupled from searchParams so scenario and select
changes stop re-reading the identical ~1,257-row book.

## Findings first

- **Two stacked tab rows today.** The outer page (`app/portal/admin/lenders/page.tsx`)
  had `?tab=rates|intel|knowledge`; inside the Rates tab, `RatesTabs.tsx` (client)
  rendered a second row `?tab=scenario|lenders|promos|all`. Both read the same `tab`
  param — the values were disjoint, so they composed. Routes/params behind each:
  - `scenario` → `RatesScenario` (the "who wins this deal" form)
  - `lenders` → `RatesLenders` (where a lender sits today)
  - `promos` → `RatesPromos` (the offer board)
  - `all` → `RatesBrowser` (the dense table, with a client-fetched prime reference)
  - `intel` → `IntelTab`; `knowledge` → `KnowledgeTab`
- **Deep links that must survive:** saved scenarios (FOXCA `saved_scenarios`) store the
  scenario *dimensions* only (`scenarioToParams`; tab/from/pins/lender dropped), so they
  are unaffected by tab renames as long as `scenario` stays a valid value — it does.
  Bookmarkable tab URLs: `?tab=scenario|lenders|promos|all|intel|knowledge`, plus the
  `next.config` redirects `/portal/admin/{rates,intel,knowledge}`.
- **The collision, resolved.** `?tab=rates` was *never a durable URL*: the old inner
  shell's `useEffect` always client-rewrote a non-inner `tab` value to `?tab=scenario`.
  So no durable bookmark relied on `?tab=rates` meaning Scenario — `rates` is a free
  value for the new merged tab. Only three producers of `?tab=rates` existed (the
  `next.config` redirect, a changelog link, the page's own TabBar hrefs), all repointed.
- **The coupled fetch.** `getRateQuotesFull(agentId)` (`lib/underwriting.ts`) had **no
  cache** — every server re-render (each scenario/select navigation on a `force-dynamic`
  page) paginated ~1,257 rows again. It is agent-scoped and identical across all scenario
  and select params. Decoupling approach: a short in-process cache keyed by `agentId`.

No load-bearing wrong assumption in the brief.

## The change

### Single tab row
`lib/lenders-tabs.ts` (new, pure, unit-tested) holds the tab keys, the permission map,
and `resolveLendersTab`. The page renders ONE `TabBar` — Scenario · Rates · Promos ·
Intel · Knowledge — filtered per-tab by permission (scenario/rates/promos → `rates.view`;
intel → `intel.view`; knowledge → `knowledge.view`), landing each user on the first tab
they can see (agents still reach Knowledge). `RatesTabs.tsx` is deleted; its bar moved to
the page and its All-quotes reference-fetch wrapper moved into `RatesBook`.
`components/admin/lenders/RatesTab.tsx` → renamed `RatesEngine.tsx`, now rendering the
active rate tab (scenario/rates/promos) with per-tab fetching.

### Rates: one dataset, a toggle
`components/admin/RatesBook.tsx` (new, client) merges the old **Lenders** and **All
quotes** into one Rates tab behind a **By lender / All quotes** toggle (`?view=lenders|all`,
default lenders). Same rows, grouped or flat — no data or pricing logic changed. The view
lives in the URL so it is shareable and the redirected old `?tab=lenders`/`?tab=all` land
right. No name collision: the page is Lenders, and the inner control is "By lender," not
"Lenders." No lime.

### Redirects (nothing 404s)
- `next.config.js`: `/portal/admin/rates` → `/portal/admin/lenders?tab=scenario` (the old
  Rates page's effective landing). `/portal/admin/intel` and `/portal/admin/knowledge`
  unchanged.
- In-page (`resolveLendersTab` → `redirect()`), preserving every other param:
  `?tab=lenders → ?tab=rates&view=lenders`, `?tab=all → ?tab=rates&view=all`.
- Relinked: the changelog rate-sheet link stays `?tab=rates` (now the valid merged view —
  a better home for a rate-sheet event than the scenario form); `RatesPromos` "Open lender"
  `?tab=lenders → ?tab=rates`; the deal-room find-rates prefill `/portal/admin/rates?… →
  /portal/admin/lenders?tab=scenario&…` (direct).

### Fetch decoupling
`getRateQuotesFull` gains a 2-minute agent-keyed in-process cache (the house norm —
`slimDealsCache`/`partnersCache`), so a page visit reads the book once and every
param-driven re-render (scenario edit, select change, tab switch, view toggle, the 60s
bell poll) is a cache hit. Failures are never cached. Matching stays client-side over the
loaded `quotes` prop (unchanged). The old inner-tab session memory is dropped (default =
Scenario), which also removes an extra on-load navigation.

## Out of scope (untouched)
The horizontal deal bar, why-matched/why-excluded teaching, the Knowledge split, cmd-K,
promos logic.

## Deviations, stated
- **Demo mode.** In demo, `getRateQuotesFull` is scoped to the demo agent id
  (`DEMO_AGENT_ID`), which has no rows in `rate_quotes`, so the book renders **empty** —
  no real lender data reaches a demo screen. The pending-sheets / intel / knowledge-claims
  reads are demo-guarded and resolve from fixtures (the render shows "Sample Bank awaiting
  approval"). So the brief's "demo asserting zero real reads" holds for lender *data* (none
  shows) and for all borrower data (there is none on this page); `getRateQuotesFull` still
  issues one real Supabase read scoped to the non-existent demo agent — existing pre-change
  behavior, not introduced here. The All-quotes prime reference stays real per the Session 9
  contract.
- **Session tab memory dropped.** The old inner shell remembered the last inner tab within
  a session; the consolidated page defaults to Scenario. Minor, and it removes an on-load
  navigation.

## Proofs
- Suite **914 → 921 tests** (+7: `lenders-tabs` 6, `rate-quotes-cache` 1). `tsc` clean,
  `next build` green, shell lime audit green (no new lime; the deals-surface lime audit's
  hardcoded file list updated for the rename + `RatesBook`).
- Ephemeral dev-Clerk TEST admin created and DELETED in-session.
- **Single row proven:** `Scenario · Rates · Promos · Intel · Knowledge` on one row,
  default Scenario; the Rates tab shows the **By lender / All quotes** toggle
  (`?view` deep-linkable), lender cards and the dense table.
- **Redirects proven live:** `/portal/admin/rates → ?tab=scenario`; `?tab=lenders&lender=mcap
  → ?tab=rates&view=lenders&lender=mcap` (param preserved); `?tab=all → ?tab=rates&view=all`;
  `/portal/admin/intel → ?tab=intel`. A saved-scenario-style deep link
  (`?tab=scenario&amount=500000&…`) resolves on Scenario with the amount applied.
- **Network proof (server-observable):** with a temporary cache-miss log (removed before
  commit) on a cold-started server, the initial load produced 3 book DB reads (the
  concurrent page + notification-bell + desk requests hitting the empty cache at once), and
  a subsequent scripted sequence of scenario amount edits, a class/rate-type select change,
  a tab switch to Rates, and the All-quotes view toggle produced **0 additional book DB
  reads**. The book loads once per visit; param changes re-read nothing. Also proven by the
  deterministic `rate-quotes-cache` unit test (three calls → one DB read).
- **Both widths, zero horizontal overflow** at 1280 and 375; demo render clean, banner
  present, no crash.

## Closing ritual
CLAUDE.md header note + session-ledger entry, `config/changelog.ts` entry, the roadmap
Lenders/consolidation item, and this report. Committed, not pushed.
