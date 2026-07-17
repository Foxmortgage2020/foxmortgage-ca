# B3 — The consistency pass: one design system, a lifecycle-shaped menu (2026-07-17)

B2b proved the design system on Deals; this session makes it the portal's design system and
gives the menu the lifecycle's shape. Presentation and routing only: every engine reparented,
never rebuilt — no fetcher, gate, authz, or write changes anywhere. Base `a8e7c8c` (B2b).

## Findings first

1. **The Task 0 example existed twice.** The B2b deal-name splitting comment
   (lib/deals-surface.ts) carried the real-client example the brief names, and the identical
   example predated it on `fileRefFromDealName` (lib/underwriting-bridge.ts, B1). Both now use
   the design cast ("FOX-1004 — Sofia Ricci"), committed alone as `f514fa1`. **Wider inventory,
   not churned here:** the same client name appears in pre-existing test fixtures
   (tests/underwriting-bridge.test.ts, tests/agent.test.ts, tests/smm-match.test.ts,
   tests/search.test.ts), two changelog entries, config/call-rubric.ts, an AgentChat
   suggestion string, and code comments in lib/underwriting.ts and lib/agent/tools.ts — all
   under the standing CLAUDE.md PII exception ("the sole named exception"). Whether that
   exception should end is Michael's call; flagged for B4.
2. **Redirect query behavior, observed live:** Next merges the incoming query into the
   destination and the destination's own `tab` wins. So `/portal/admin/rates?lender=mcap` →
   `/portal/admin/lenders?lender=mcap&tab=rates` (scenario deep links survive intact), and an
   old inner-tab bookmark like `rates?tab=promos` lands on `lenders?tab=rates` (the Rates
   tab's default view — the one small casualty). Intel filters pass through fully.
3. **The two tab layers compose because their value sets are disjoint.** The rates engine's
   own inner tabs (`scenario | lenders | promos | all`) ride the same `tab` param,
   pathname-relative; the Lenders page claims only `rates | intel | knowledge` and falls
   through to the Rates tab for anything else, which the inner engine then reads. Verified
   live: the inner tab bar works untouched under /portal/admin/lenders.
4. **Demo and lender data:** the brief asks that the merged pages render in demo "from
   fixtures with zero real reads". The borrower-side sources do (renewal fixtures, empty smm
   store, fixtured claims — asserted in tests/demo.test.ts). The approved rate book
   deliberately stays REAL in demo, unchanged: that is the standing Session 9 demo contract
   ("lender reference data is not borrower data"), and it is exactly how the standalone Rates
   page behaved in demo before the merge. Stated deviation, not a regression.
5. **A fresh live intel item surfaced during proofs:** an unidentified-lender rates sheet
   ("People's Bank Rates July 17 2026.pdf") sits in the feed — the Alterna-class null-slug
   case the Lenders tab already surfaces. Nothing for this session; noted for the
   fox-underwriting slug follow-up.

## Task 1 — The design system, extracted (`components/admin/ds/`)

- **SummaryStrip** (the B2b phase spine byte-for-byte: joined tiles on a hairline track,
  Poppins tabular numerals, wrap chips at phone width, optional sub line and caution tone),
- **NavyBar** (the board's navy section header: label left, count right),
- **StatusChip** (the room's four-tone chip),
- **TabBar** (new: hairline track, navy active state, Poppins labels, optional calm count
  badge — every merged page's tabs),
- **table.ts** (the table treatment as shared class constants: card frame, header row,
  hairline rows, and the tabular-nums money/ref/date cells).

The Deals list, board, and room re-mounted on them with zero visual change: the extracted
class strings are byte-identical, the census is live-identical (below), and the live list
renders exactly the B2b proofs (single lime on the top-most actionable row included).

## Task 2 — The IA and the redirects

`config/admin-nav.ts`: **Today · The book** (Deals, Approvals, Beyond funding) · **The
practice** (Lenders, Revenue, Partners, Compliance) · **System** (Directory — moved in per
the brief's list — Audit log, Changelog, Status, Users & settings, Roadmap) · Ask Fox pinned.
Eleven working destinations became eight; group keys `pipeline`/`market` became `book`/
`practice`; agent-only presentation scoping now hides System only (the can() filter still
narrows the rest — agents keep exactly Deals + Lenders-for-knowledge, their old reach).

**Redirects, all 308-permanent, all verified live** (next.config.js): renewals →
beyond?tab=renewals · opportunities → beyond?tab=opportunities · rates → lenders?tab=rates ·
intel → lenders?tab=intel · knowledge → lenders?tab=knowledge · /portal/bookkeeping →
/portal/admin/revenue?tab=bookkeeping (cross-prefix). Subroutes stay live at their own paths:
renewals/drip, opportunities/backfill, knowledge/[slug], bookkeeping/review-queue,
bookkeeping/projects.

**In-app links moved to direct destinations** (never riding redirects): the Deals list's
funded rows and the room's Beyond funding section → beyond?tab=renewals; the room's
find-rates and the Opportunities scenario prefills → /portal/admin/lenders (params intact);
Today's KPI cells, rail links, decision cards, and Rates tile; the Desk strip fragments; the
two renewal notification hrefs; Revenue's renewal-book link; the changelog's rates link; the
rates engine's own cross-tab deep links (RatesPromos, RatesLenders, LenderKnowledge). The
**manifest's Deals shortcut** now points at /portal/admin/underwriting directly (it had
ridden the B1 redirect); the Approvals shortcut was already direct. The **route-inventory
test updated deliberately**: the six redirected prefixes count as covered (their subroutes
ride them), the group assertions speak the new keys, and a new test pins the working nav to
exactly the eight labels.

## Tasks 3–5 — The merged pages

- **/portal/admin/lenders**: summary strip (approved quote count, lender count, pending
  knowledge claims — the sources the three pages already read), tabs Rates / Intel /
  Knowledge. Engines moved via `git mv` into components/admin/lenders/ and reparented
  self-fetching, gates intact (`requirePermission` per tab, plus the page's per-tab
  composition of the same three keys — a user lands on the first tab they hold; Lenders is
  keyed on knowledge.view in the nav so every role that could reach Knowledge still can).
  Intel's filter pills carry `tab=intel`.
- **/portal/admin/beyond**: summary strip (renewals to action with volume, lapsed with
  volume in caution, watching, opportunities to act on, files in review) computed from the
  same loaders the tabs read — the Home desk pattern, headline counts only (the board's
  override- and claim-aware figures live on its tab; the strip's simplified count matched
  the board's exactly on live data). Tabs Renewals / Opportunities, both engines reparented
  unchanged. **The nav badge sums what the two badges showed separately** (verified live:
  3 renewals to confirm + 15 files in review = 18 on the Beyond funding badge).
- **Revenue**: gains tabs Revenue (default) / Bookkeeping. The bookkeeping landing
  reparented as a client component under the tab, restyled onto the contract (the lime pulse
  dot became a green health dot, lime links became navy/white, yellow accents became the
  caution token, grays became cool); the tab renders only for bookkeeping.view holders (the
  standalone page's own key) and returns before any revenue data loads.

## Task 6 — Bounded polish and the lime demotions

- The merged pages' own chrome (headers, strips, tabs) is fully on the contract; the
  reparented engine bodies got the bounded sweep (cool grays, system radii, hover-lime link
  demotions) without logic changes.
- **The three flagged demotions**: ClientConstraints' preferred-chip tint and its
  record-constraint arm control (now outline ink; the armed state stays navy), and the
  roadmap page's lime highlight markers (Shipped chip, the navy-card heading, the
  map-complete callout) — all calm ink now.
- **Archivo npm dependency removed** (nothing referenced it; package.json + lockfile).
- **Left for B4, stated:** the rates engine's internals (RatesScenario's best-rate chip and
  friends), Revenue's estimate chips and chart bars, and Home's hover-limes are pre-existing
  limes on surfaces this session did not restyle — the B4 mechanical token sweep's list.

## Verification

- **tsc clean, `next build` green, suite 633** (from 631: +1 shell nav-shape test, +1 demo
  strip-sources test; every deliberate test change named above).
- **Census byte-identical** through the refactor (temp census route, removed; middleware
  diff-zero): the same 7 rooms, conditions 3 / evidence 1 / with_lender 1 / ready 1 /
  funded 1, zero fallbacks — matching B2b exactly. The live Deals list's phase spine reads
  0 / 2 / 3 / 2, the same rows, the same single lime.
- **Every redirect verified live** with exact Location headers (finding 2 for query
  behavior).
- **Lime audit updated deliberately**: the no-lime file list grew by the five ds/
  components, both new pages, the six tab components, ClientConstraints, and the roadmap
  page; the single list lime stands (asserted); the merged pages add zero.
- **Demo assertions**: the Beyond/Lenders strip sources resolve from fixtures and empty
  stores with zero real fetches (tests/demo.test.ts); the lender-book exception is finding 4.
- **Render proofs** (dev server + dev-Clerk TEST admin `B3 Proofs`, created and deleted
  in-session; read-only navigation only, no decision controls touched, per the standing
  UI-test discipline): the new sidebar with both groups and the summed Beyond badge (desktop
  and the phone drawer), Lenders on all three tabs (the Rates engine's inner tabs composing
  beneath the page tabs; Knowledge in its documented dev-instance token state), Beyond
  funding on both tabs (strip + radar; strip + board), Revenue's Bookkeeping tab on the
  contract, the phone-width Lenders page (zero horizontal scroll), and the Deals list
  identical through the refactor. The auth-gated engines cannot render on a public temp
  route, so the established dev-Clerk pattern carried the page proofs; screenshots
  in-session, never committed.

## Follow-ups

- B4: remaining surfaces onto the design system plus the mechanical token sweep (the lime
  list in Task 6, the gray sweep across the 72-file inventory, and the PII-exception
  decision from finding 1).
- B5: agent mode.
- fox-underwriting: the People's Bank null-slug intel item (finding 5) joins the Alterna
  slug follow-up.
