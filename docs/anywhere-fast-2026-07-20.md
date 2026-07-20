# Get anywhere fast — cmd-K extension + universal deal links

**Date:** 2026-07-20 · **Base:** `a083ea1` · **Tests:** 938 → **944** (+6) ·
tsc clean · `next build` green · shell lime audit green · committed NOT pushed.

Two halves of one idea: every BRXM/IFMS reference on an admin surface links to
its deal room, and the cmd-K palette learns to jump to deals, lenders, and
admin pages (including the consolidated sub-tabs). Presentation + pure ranking
only. No route change, no new fetcher, no migration, no new authority key, no
new env var.

## 0. Findings first (loud deviations)

1. **Deals are ALREADY searchable by BRXM ref AND client name.** `rankDeals`
   (`lib/search.ts`) matches a haystack of `fileRef` + Zoho `dealName`, and a
   workbench row links straight to `/portal/admin/deals/${id}`. So that half of
   the palette brief was already done. Locked with an explicit BRXM test
   (`rankDeals` by `BRXM-F053107` and by client name both reach the same room),
   and proven live (typing `F0001` and typing `marty` both land on
   demo-deal-1).

2. **There is NO shared `<DealRefLink>` component.** The "helper" the brief says
   to reuse is an inline idiom — `<Link href={/portal/admin/deals/${id}}>{ref}</Link>`
   plus `parseDealRef` for deriving a ref from a deal name — repeated at every
   already-linked call site, with the link gated on a workbench room id existing.
   Per "reuse, never fork," the sweep uses that inline idiom (matching each
   surface's local styling), NOT a new component. A shared component is a genuine
   future refactor (it would touch ~15 already-working call sites); deferred.

3. **The Lenders palette group is client-side and static.** It ranks the 23
   hand-written lender display names (`config/lenders.ts HAND_WRITTEN_LENDER_SLUGS`)
   — zero per-keystroke network, no route change. The shell passes the list only
   when the user holds `rates.view`, so the group is simply absent for a role
   that cannot see Rates (the Partners-absent pattern). Choice: a prefetched
   client index over a live book read on every shell render. Lender names are
   public reference data, so they stay REAL in demo (the Session 9 rule) — no
   PII, no read. An unknown live slug not in the 23 does not appear in the
   palette; the Rates page itself lists the live book (the palette is a jump aid,
   not the authoritative book).

4. **The existing Knowledge palette group is untouched** (it jumps to a lender's
   knowledge page, `/portal/admin/knowledge/${slug}`). The new Lenders group
   jumps to the Rates by-lender view. Two lender lists, two distinct
   destinations, distinct labels/subtitles ("Rates · by lender" vs the slug) —
   both useful. The brief asked only to add the Rates jump; Knowledge stays.

## 1. The palette change

- **`lib/search.ts`** (pure, unit-tested): added `'lender'` to
  `SearchResultType`, a `LenderTarget { slug, name }` type, and `rankLenders`
  (name startsWith > name/slug includes, alpha tiebreak, cap 8, href
  `/portal/admin/lenders?tab=rates&view=lenders&lender=<slug>`).
- **`config/admin-nav.ts`**: added `ADMIN_SUB_PAGES` — the consolidated sub-tabs
  the palette searches alongside the top-level nav, each with its own tab
  permission: Scenario / Rates / Promos (`rates.view`), Lender intel
  (`intel.view`), Lender knowledge (`knowledge.view`), Renewals (`renewals.view`),
  Opportunities (`opportunities.view`), Bookkeeping (`bookkeeping.view`). These
  are palette-only (the tab bar on each page is their sidebar home).
- **`app/portal/admin/layout.tsx`** (server, where `can()` lives): builds
  `pageTargets` (the visible top-level pages WITH descriptions + the sub-tabs the
  user can reach) and `lenderTargets` (gated on `rates.view`), both from the same
  `visible` set the sidebar renders — palette and nav never disagree on scoping.
- **`components/admin/AdminShell.tsx`**: forwards the two new props to
  `CommandPalette` (never widens them).
- **`components/admin/CommandPalette.tsx`**: a Lenders group between Partners and
  Knowledge (client-filtered from `lenderTargets`; absent when empty); the
  non-empty "Go to" search now runs over `pageTargets` (so typing a tab name
  lands on it, and top-level pages are now searchable by description too). Icon
  `Percent` for the lender type. The `askFoxHref` / `Ask Fox: ` literals and the
  keyboard/debounce/AbortController mechanics are unchanged.

Debounce (180ms) + AbortController on the server fetch stay as they were; the
new sources are pure client-side ranking (no fetch), so the standing input rule
holds by construction.

## 2. The deal-ref link sweep

Converted the plain-text ref chips that already carry a room id (4 surfaces),
using the existing inline idiom:

| # | Surface | File | Before → After |
|---|---------|------|----------------|
| 1 | Deals list — desktop rows | `components/admin/deals/DealsList.tsx` | `<p>{fileRef}</p>` → ref wrapped in `<Link href={/deals/${roomId}}>` |
| 2 | Deals list — mobile cards | `components/admin/deals/DealsList.tsx` | same |
| 3 | Today — What's moving | `components/admin/today/WhatsMoving.tsx` | ref `<span>` → `<Link href={room}>` (room, or the underwriting fallback when un-bridged) |
| 4 | Approvals — Shadow queue heading | `components/admin/ApprovalsDesk.tsx` | `<h3>{fileRef}</h3>` → fileRef wrapped in `<Link href={/deals/${dealId}}>` (the other two queues already linked the ref) |

Already-linked (unchanged, the idiom the sweep reuses): audit log, compliance
"files reading attention", Approvals Flags + Statements cards, Deals board cards
+ unmapped list, Today Tasks / Closings / Exceptions, the Underwriting parked
list.

**Deliberately NOT linked (documented):**
- **OpportunityCard, BackfillPanel, SmmUpload parse-failures, appears-renewed
  note** — the ref appears only as a *name fallback* when a household has no
  borrower name, and these SMM surfaces carry a Zoho/household id but no resolved
  workbench room id; linking would need a new ref→room join (a feature, not "make
  the existing ref a link").
- **CommsQueue** — `fileRef` is hard-coded null; no ref is rendered on screen.
- **RenewalCard / RenewalsTab** — no distinct ref chip (the Zoho `dealName` may
  embed a ref); RenewalCard already offers a separate "Deal room" link.
- **Notifications bell external-decision item** — its embedded ref links to the
  deals list filtered by ref (which still reaches the deal), not the room;
  converting would add a ref→room DB read on every 60s bell poll.
- **Revenue stale-pipeline list** — the deal name links to Zoho CRM by design
  (grooming happens in Zoho).
- **Deal-room header chip** — self (it IS the destination); correctly plain.

## 3. Verification

- **Unit:** `tests/search.test.ts` +6 — `rankLenders` (startsWith>includes,
  slug match, href shape, cap), a sub-tab `filterNav` match, and the BRXM
  ref-OR-name lock. Full suite 944 green, tsc clean, `next build` green, shell
  lime audit green (the palette + sweep use only neutral cool/navy/ink classes;
  no lime, no decision token added).
- **Live (blessed pattern — dev Clerk ephemeral TEST admin
  `anywhere-fast+clerk_test@example.com` created via the backend API, signed in
  via Clerk JS, DELETED + confirmed gone before session end; DEMO mode, so all
  deal data is synthetic fixtures + real lender names, zero real reads):**
  - Palette Lenders group renders and jumps: `mcap` → MCAP → landed on
    `/portal/admin/lenders?tab=rates&view=lenders&lender=mcap`; `first` → First
    National + First National Excalibur.
  - Sub-tab pages: `promo` → Go to → Promos; `bookkeep` → Go to → Bookkeeping →
    landed on `/portal/admin/revenue?tab=bookkeeping`.
  - Deals: `F0001` (ref) and `marty` (name) both → "Marty McFixture — Purchase"
    (DEMO-F0001) → landed on `/portal/admin/deals/demo-deal-1`.
  - Sweep links resolve on all 4 surfaces: DealsList desktop+mobile
    (DEMO-F0001/F0002 → their rooms), Today What's-moving, Approvals Shadow
    heading (DEMO-F0002 → demo-deal-2).
  - Demo banner shown; Knowledge shows the honest "Couldn't reach Knowledge."
    (the dev Clerk instance can't mint the `gates` token — documented, expected;
    it works in production).
  - Both widths: 1280 and 375 measured **0 horizontal overflow** on the Deals
    list, Today, the Approvals shadow tab, and the palette (a full-screen sheet
    at 375).

## 4. Files touched

`lib/search.ts`, `config/admin-nav.ts`, `app/portal/admin/layout.tsx`,
`components/admin/AdminShell.tsx`, `components/admin/CommandPalette.tsx`,
`components/admin/deals/DealsList.tsx`, `components/admin/today/WhatsMoving.tsx`,
`components/admin/ApprovalsDesk.tsx`, `tests/search.test.ts`.

Guardrails held: presentation + pure ranking only; no route/fetcher/gate/authz/
migration/env change; the standing input rule holds (new sources are pure,
zero-fetch); copy rules on the new strings; PII discipline (TEST admin only +
demo synthetic data, deleted); out of scope untouched (client surfaces, the
Approvals keyboard queue, Ask Fox, no new pages).
