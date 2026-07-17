# B4 — The name sweep and the token sweep (2026-07-17)

Styling and strings only: no logic, fetcher, gate, authz, routing, env, or data change
anywhere. Base `1d04984` (B3). Two sweeps: real personal names out of the repo tip
(own commit, first), then every remaining admin surface onto the design system and the
legacy styling retired, with the lime audit made exhaustive.

## Findings first

1. **The harvest kept growing past the known list.** The B3 report named test fixtures,
   two changelog entries, the call rubric, and an Ask Fox suggestion. The sweep found
   real names in eleven more places, including a previously-unrecorded investor client
   in `lib/investor-calc.ts` worked examples, the full live open-book fixture in
   `tests/pipeline-hygiene.test.ts` (fifteen more people, first and last names), renewal
   and match fixtures (`tests/renewals.test.ts`, `tests/smm-match.test.ts`), and a
   tracked doc whose FILENAME carried the FP partner's name (renamed to
   `docs/integrations/finmo-fp-handoff-field-map.md`; the old name is in git history). Final harvest: **64 name tokens** (surnames plus
   identifying first names).
2. **Seven fixture surnames were derivations of real export surnames.** The committed
   SMM CSV fixtures used suffix-shaped names; checked against the out-of-repo export
   (locally, counts only, per the standing practice), seven traced to real client
   surnames and were re-cast to the synthetic cast, plus two first names. The re-cast
   fixtures keep every number, date, and structural edge the tests exercise.
3. **Public testimonials are a carve-out, not a sweep.** The /smm page carries two
   client-approved testimonials (first name + last initial, approved 2026-04-07) — 
   consented public marketing content, kept, and documented in the rewritten rule.
   The HOMEPAGE (`app/page.tsx`) carries two more testimonial names ("Sarah M.",
   "David K.") whose provenance this session cannot establish: if real, they are the
   same carve-out; if placeholder, they are fabricated reviews and should come off the
   public site. **Flagged for Michael — not swept blind.**
4. **One operational identifier keeps a first name.** The live n8n FP-handoff webhook
   slug is documented verbatim in the integrations doc (and only there); renaming the
   webhook is an n8n change, out of a styling session's bounds. Documented exception
   in the rule.
5. **`.qbo-history/` was never actually gitignored.** CLAUDE.md documents it as
   gitignored; it was not, and a broad `git add` during this session briefly staged the
   raw five-year QBO export before being caught and reset. `.gitignore` now carries
   `.qbo-history/`, the raw export pattern, `Terminal Saved Output.txt`,
   `.claude/worktrees/`, `supabase/.temp/`, `Lender Logos/`, and `knowledge/`.
6. **The brief's "approval-pending chips stay lime" case is vacuous in the tree.**
   Every pending-approval indicator in the rates engine is already amber (the awaiting
   dot, coverage nudges, the desk tab counts). No lime anywhere in the tree was an
   approval-pending chip, so nothing in the rates engine survives as lime.
7. **Two orphan components surfaced.** `components/admin/ConditionsPanel.tsx`
   (superseded by ConditionsChecklist in B2b) and `components/admin/StubPage.tsx`
   (Session 1 stub frame) have ZERO consumers. Both were demoted in place (styling
   only, per the guardrail); **B5 should delete them.**

## Task 1 — the name sweep (own commit)

- **The rule** (rewritten in CLAUDE.md): real personal names never appear anywhere in
  the repo — code, comments, fixtures, tests, config strings, docs, or ledger prose.
  File refs and opaque record ids are the standard reference; tests that need a name
  use the synthetic cast; Michael Fox, lenders, and companies are not PII. Two
  documented carve-outs (findings 3 and 4).
- **Mechanics:** the harvest was built from the CLAUDE.md ledger, the docs reports, and
  what the sweep itself uncovered; every hit reviewed by hand (word-boundary,
  case-insensitive — the `kerr`-in-`WorkerRegister` class of false positive is why).
  "REF — Name" deal names became the ref alone; standalone prose names became file
  refs; fixtures took the cast with stable per-file mapping. Variable names carrying
  surnames in `tests/underwriting-bridge.test.ts` were renamed deliberately (never
  mechanically). `tests/pipeline-hygiene.test.ts` needed **fourteen distinct people**
  against an eight-name cast: the eight actives took the cast; the six stale-pool
  ghosts took clearly-invented neutral names (stated deviation).
- **Zoho record ids, file refs, and amounts are untouched** — identity lives in Zoho
  and Clerk, not in the repo.
- **Acceptance:** the final repo-wide case-insensitive word-boundary scan over all 64
  harvested tokens returns **zero hits in tracked files** outside the enumerated
  carve-outs (`app/smm/page.tsx` testimonials, `app/page.tsx` testimonials pending
  Michael's call, the webhook slug in the integrations doc).
- **Reality note, verbatim honesty:** this cleans the browsable tip. **Git history
  still contains the names**; only making the repo private or rewriting history fixes
  that, and it stays Michael's open decision (also recorded in the rule).
- Tests were updated deliberately where fixture names were functional (search ranking,
  name-index matching, the short-form-vs-full-form retry now speaks "Jo Wells" vs
  "Jordan Wells"). Suite green at 633 at the Task 1 commit.

## Task 3 — the lime classification (every ruling)

Legacy lime is extinct in the admin tree. Every surviving "lime" is the `decision`
token, and only on a queued human decision. The full classification:

**Converted to the decision token (queued human decisions — join the audit's allowed list):**

| Surface | Role |
|---|---|
| components/admin/ApprovalsDesk.tsx | The armed queue decide buttons (approve / agree confirm) |
| components/admin/AgentChat.tsx | The confirm-card execute tap (the agent's only write path) |
| components/admin/deals/DealsList.tsx | The single-lime action button (desktop + phone branches) |

(Already on the token, unchanged: AdminShell dots/badges/dark focus ring, DeskStrip
fragments, NotificationBell badge + Decide dot, Today's decision cards,
ConditionsChecklist's needs-input pill + Verify tap.)

**Demoted (decorative), by group:**

- **Hover accents** — 45 `hover:text-lime`, 1 `group-hover:text-lime`,
  2 `hover:border-lime` across 20 files (Home's section links, audit/changelog/
  directory/settings links, rates engine links, AppearsRenewedCard, LenderKnowledge
  markdown links) → `hover:text-ink` / `hover:border-navy`.
- **Primary buttons that are actions, not queued decisions** — Ask Fox send, New
  conversation, Provision someone, partner-page CTA, knowledge upload, scenario PDF
  button, DemoToggle enter, ProvisionWizard confirm → `bg-navy text-white
  hover:bg-navy-light`.
- **Arm controls** — OpportunityCard's grad-approve outline (B3 ClientConstraints
  precedent) → outline ink (`border-cool-300 hover:border-navy`).
- **Informational chips and tints** — opportunity status, renewal in-progress, people
  list, promos condition chips, StubPage tag, scenario summary/notes, ProvisionWizard
  selected row → cool-100/cool-200 treatments.
- **Semantic states that were lime but mean "healthy/approved"** — RatesLenders live
  dot → `bg-green-500` (the B3 BookkeepingTab precedent); partner Active tier, funded
  stage chip, view-as active session, partner doc Approved → StatusChip green tones.
- **Emphasis cards** — the scenario winning-offer card + badge, the best-rate chip →
  navy emphasis (`border-navy` / `bg-navy text-white`).
- **Progress/pacing fills** — BackfillPanel progress, Home pacing bar, Revenue mix +
  lead-source bars (and the `barClass` default) → `bg-navy` (the second Revenue series
  was already `bg-navy/70`, so the series palette is navy + navy/70 on cool track).
- **The Revenue/Practice History chart** — the projection hatch, its legend swatch, and
  the milestone dots → `PROJECTION_GRAY` `#7E8E97` (cool-600); solid actuals stay navy.
  The chart stays honest: hatch = projection, solid = actual, now in navy + gray.
- **Demo mode chrome** — the banner and toggle are mode indicators, not decisions:
  banner → `bg-caution text-white` (still unmissable), toggle active panel →
  caution-bg, buttons → navy.
- **LenderMark monogram ring** → `ring-cool-300` (brand avatar, not attention).
- **Orphans** (finding 7) — ConditionsPanel decide button and StubPage demoted in
  place, flagged for B5 deletion.

**The one brand-mark exception:** `components/admin/PracticeHistorySlide.tsx` draws the
Fox mark (navy squircle + lime F) and the masthead rule on the client-facing EXPORT
slide — brand identity on a client artifact, exactly like the PDFs' masthead. It keeps
the brand hex in SVG fills only (no lime classes), and the audit enumerates it.

## Task 3 — the mechanical token pass

Across `app/portal/admin/**` + `components/admin/**` (68 files):

- **1,174** `gray-N` → `cool-N` (no gray-900 existed in scope; the map is 1:1).
- **42** `slate-N` → `cool-N` (slate-900 → cool-800).
- **821** `font-body` → `font-ui` (both resolve to Montserrat; the admin tree now
  speaks the ds alias everywhere).
- **2** `accent-[#032133]` → `accent-navy`.
- The six inline `fontFamily` declarations are the chart/slide SVG font attributes —
  already on the brand font vars and FUNCTIONAL (SVG text and the PNG export cannot
  take Tailwind classes); they and the two SVG `NAVY` hex consts stay, noted here.
- Raw amber/red/green classes are the StatusChip vocabulary and semantic health states
  — deliberately untouched (they are the system, not debt).

## Task 2 — remaining surfaces onto the design system

Four parallel build agents carried the surface migrations on disjoint file sets, each
gating on tsc + the related suites; every diff reviewed at integration (className-only,
handlers, hrefs, test ids, and aria byte-identical, zero lime or decision additions):

- **Today + the deal room** — StatusChip on the attention rail, `CELL_MONEY` on
  Pipeline-by-stage, `CELL_DATE` on the Documents table, seven Today frames + the
  KpiCell/SectionCard/AttentionCard helpers onto the card contract, header rows onto
  the type contract, tabular-nums across pacing stats, KPI values, closings, and the
  room's provenance/timestamp lines. The decision cards above the fold: untouched.
- **Approvals + the room cards** — ApprovalsDesk's local Chip now delegates to
  StatusChip (about 30 call sites), nine frames onto the card contract, the client-state
  tab pills restyled to the ds tab look (buttons + handlers kept, the amber count
  variant kept), tabular-nums on every date/figure/badge; ConditionsChecklist group
  labels + AnalysisBlock recency line onto the contract (its sanctioned decision pill
  left verbatim); DocumentUploader, CommitmentUploader, and LenderNotesCard headings,
  readiness rows, and counters onto the contract.
- **Partners + Compliance** — StatusChip for partner tiers (active green / cooling
  amber / dormant gray), doc statuses, the compliance posture chip, and thirteen
  ComplianceModule chip sites via a delegating Chip; sixteen ComplianceModule frames +
  ten partner-detail frames onto the card contract; both tables onto the header +
  hairline treatment; `CELL_REF` on the partner-id column; the Compliance client-state
  tabs restyled to the ds look (handlers + test ids byte-identical).
- **System + Ask Fox** — all ten System pages plus PeopleList, ProvisionWizard,
  NotificationSettings, and the AgentChat chrome: StatusChip adopted five times
  (view-as session state, Status health labels, people active/disabled, history
  capped), roughly forty frames onto the card contract, real-table header rows onto
  the type contract, tabular timestamps throughout; three stray `#7ab800` (lime-dark)
  checkmarks caught and demoted to `text-green-600`, plus a fourth in
  OffboardChecklist at integration.

Where a REAL `<table>` element's cell rhythm resists the div-grid `TABLE_*` constants
(their px-5 padding and hidden-md phone-card pattern), the contract's typography,
hairline, and frame classes were applied in place — the brief's sanctioned fallback.
Chat bubbles keep the chat idiom (rounded-2xl); they are not card frames.

Client-state tab bars (ApprovalsDesk, ComplianceModule) keep their button + setState
mechanics — behavior outranks component reuse — restyled to the ds tab look. A
client-side TabBar variant is a B5 candidate if the duplication grates.

## Task 4 — the audit is exhaustive

`tests/shell.test.ts` now walks EVERY `.ts/.tsx` under `app/portal/admin/**` +
`components/admin/**` and enforces: zero legacy lime classes anywhere; zero raw lime
hex outside the enumerated brand-mark slide; the `decision` token only in the eight
allowed surfaces, each restricted to its documented role regex. The allowed list:

1. `components/admin/AdminShell.tsx` — nav dots, badges, dark focus ring
2. `components/admin/DeskStrip.tsx` — Waiting-on-you fragment links
3. `components/admin/NotificationBell.tsx` — decision badge + Decide-lane dot
4. `app/portal/admin/page.tsx` — decision cards (top border + underline)
5. `components/admin/ConditionsChecklist.tsx` — needs-input pill + Verify tap
6. `components/admin/ApprovalsDesk.tsx` — armed decide buttons
7. `components/admin/AgentChat.tsx` — confirm-card execute tap
8. `components/admin/deals/DealsList.tsx` — the single-lime button

The B2b deals-surface audit was updated to the same vocabulary (DealsList's single
lime is asserted as the decision token on exactly the two gated branches).

## Verification

- `npx tsc --noEmit` clean. `next build` green on a clean `.next` (BUILD_ID minted).
- Suite **634 tests, 43 files, all green** (started at 633; +1 is the exhaustive
  audit's tree-sanity test; the two audit rewrites replaced their predecessors
  deliberately, named above).
- **Name scan:** all 64 harvested tokens return zero hits in tracked files outside the
  three carve-out files (`app/smm/page.tsx`, `app/page.tsx` pending finding 3, the
  webhook slug in the integrations doc).
- **Census untouched by construction:** the Tasks 2–4 diff contains zero `lib/`,
  `next.config.js`, or `middleware.ts` changes (verified by diff); nothing in this
  session moves or refetches anything. The deals-surface suite (census model + single-
  lime rule) is green.
- **Redirects untouched:** next.config.js not in the diff; the seven-redirect test
  green in the suite.
- **Demo:** tests/demo.test.ts green — every surface still renders from fixtures with
  zero real reads.
- **Render proofs** (dev server + dev-Clerk TEST admin "B4 Proofs", created and
  deleted in-session; read-only navigation only per the standing UI-test discipline —
  no decision control touched; screenshots in-session, never committed): Today desktop
  (Desk strip + decision cards + phase-grouped pipeline on the ds treatment), Today at
  375px (zero horizontal scroll, decision badge on the bell), Approvals (ds tab bar,
  amber counts, ds frames), Partners (StatusChip tiers, tabular money columns),
  Compliance (ds tabs, health-dot tiles, file refs only), Status (ds panels, StatusChip
  health labels), and Revenue (the Practice History chart drawing its projection hatch
  and milestone dots in gray beside solid navy actuals). The sign-in used the
  documented dev-instance path (the custom form stops at the enforced second factor;
  Clerk JS carried it with the fixed dev code).

## Deviations, stated

- `tests/pipeline-hygiene.test.ts` needed fourteen distinct people; the stale pool
  uses six neutral invented names beyond the eight-name cast.
- The homepage testimonial names were flagged, not swept (finding 3).
- The webhook slug stays (finding 4).
- Client-state tab bars style-match TabBar rather than mounting it (behavior guardrail).
- The lib/deals-surface `DealRow.lime` FIELD name stays (it names the single-lime
  rule, renders the decision token; renaming a model field is not a styling change).

## For B5

- Delete the two orphans (ConditionsPanel, StubPage).
- Decide the homepage testimonials (finding 3).
- A client-state TabBar variant, if wanted.
- ApprovalsDesk quote-detail rows want a real ds table treatment (layout change).
- ConditionsChecklist's "added by hand" (blue) and "edited" (purple) chips have no ds
  tone equivalent — needs a ds ruling; same question for sky/violet rate-type badges
  (the documented house convention) and StatusChip's lack of tabular-nums.
- LenderNotesCard readiness dots ride `bg-amber-400` rather than the caution token.
- PartnersHealthTable has no phone card fallback (horizontal scroll only);
  ComplianceModule's SummaryTiles cannot adopt SummaryStrip as-is (tone dots + onOpen).
- The investor mortgages status-badge class map lives in `lib/investor-calc.ts` and is
  shared with the investor portal — out of the admin sweep's scope, off-token there.
- Status page's n8n table is cramped in its panel; the audit log's flex-wrap rows wrap
  awkwardly at mid widths; the directory's sub-tiles and the deal room's nested item
  cards suggest an ITEM_CARD ds constant; the settings matrix crowds under scroll.
