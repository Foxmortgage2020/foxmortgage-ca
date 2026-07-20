# P1 — BDM contacts on the lender card

**Date:** 2026-07-20 · **Base:** `026af6f` · **Tests:** 944 → **952** (+8) ·
tsc clean · `next build` green · shell lime audit green · committed NOT pushed.

The lender detail page (Rates → By lender → a lender) gains a Contacts front:
approved BDM / underwriter contacts render with tap-to-call and tap-to-email,
and an admin can add, edit (supersede), or retire a contact through the human
gate. The portal is the surface over W1's workbench engine
(fox-underwriting `0e1cd07`, migrations 0051+0052); this session adds no
workbench code.

## 0. Findings first

- **How the card identifies its lender / do the slug spaces reconcile.** The
  by-lender view keys on the QUOTE slug (`rate_quotes.lender_slug`) via the
  `?lender=<slug>` param (`RatesLenders.tsx`). The workbench contact endpoints
  key contacts by whatever `lender_slug` the human enters, and the read groups
  by it — so a contact added from the MCAP card (`slug=mcap`) reads back and
  filters under `mcap`. Create and read both use the card's own quote slug, so
  they reconcile by construction.
- **STANDING QUESTION — 23 static palette names vs the book.** Queried the live
  workbench: **25 distinct approved lender slugs**. The palette's list is the
  static `HAND_WRITTEN_LENDER_SLUGS` (= `Object.keys(LENDER_NAMES)`, 23) built in
  `app/portal/admin/layout.tsx`; "lenders in the book" is
  `new Set(approved.map(q => q.lenderSlug)).size` over `getRateQuotesFull`
  (`lenders/page.tsx`). The exact gap is **`duca` + `meridian`** (every other
  static slug is in the book; no stale entries). Nothing keeps the palette
  current automatically — a human adds the slug to `LENDER_NAMES`.
  **Decision (stated loud): do NOT derive the palette from the book.** Deriving
  in the global admin layout would couple a ~1,257-row read to every admin page
  (Today, Compliance, Revenue — pages that never touch rates) and would empty
  the palette's lender jumps in demo (the book is `DEMO_AGENT_ID`-scoped and
  empty there). Both costs are disproportionate to closing a "26th lender isn't
  cmd-K-jumpable until someone adds a line" drift. Instead **reconciled now**:
  added `duca: 'DUCA'` and `meridian: 'Meridian Credit Union'` to `LENDER_NAMES`,
  so the list matches the current book of 25 and `duca` no longer title-cases to
  "Duca". A book-derived palette (with a static fallback for demo) remains a
  deferred option if the drift recurs.
- **Portal-read auth for the two GETs / dev reachability.** The workbench serves
  contacts behind a Clerk `gates`-template JWT (browser-minted, azp), exactly
  like the other `/api/knowledge/*` reads — NOT `portal_readonly`. So the portal
  proxy (`/api/portal/admin/knowledge/contacts`) forwards the browser
  `x-gates-token`. On the **dev** Clerk instance there is no `gates` template, so
  the token cannot mint and the read shows the honest "couldn't reach" state; it
  only works in **production** (the documented knowledge precedent). What dev
  cannot prove (a real read/write round trip) defers EXPLICITLY to the
  production acceptance step below — never stubbed.
- **Gates-token mint for the two writes.** The client mints
  `getToken({template:'gates'})` per action and forwards `x-gates-token`; the
  gated proxy validates then calls `lib/gates.ts`, which forwards
  `Authorization: Bearer`. Reads gate on `knowledge.view`; writes on a NEW
  admin-only CONTRACT key `knowledge.contact.manage` (mirrors the workbench).
- **Deviation from the brief's "Contacts on the grid card front."** The grid
  card is a single `<button>` (`RatesLenders.tsx`), and interactive tel:/mailto:
  controls cannot nest inside a `<button>` without restructuring a core, working
  drill-in surface. So the interactive Contacts section mounts on the **detail
  page** (`LenderPage`, a `<div>`) — the lender's front for that lender, exactly
  where the drill-in and the palette's lender jump both land. §1's "grid loads
  from the bulk read in ONE call" is honored: one bulk contacts read at the
  `RatesLenders` top feeds both a non-interactive "N contacts on file" line on
  each grid card AND the detail section — never a per-card fetch.

## 1. The card

- `components/admin/lenders/LenderContacts.tsx` (new, client): the Contacts
  section on the lender detail page. Each contact renders name, role, phone as a
  `tel:` link (the workbench's pre-built RFC-3966 href with `;ext=`, rendered
  never re-derived), email as `mailto:`, and an optional note. One bulk read
  (`useKnowledgeFetch('/api/portal/admin/knowledge/contacts')`) at the
  `RatesLenders` top, grouped by slug client-side. A teaching empty state names
  the first action in one sentence. No lime, no decision token — contacts are
  reference data, not a decision queue (verified by the shell lime audit).

## 2. The actions

- **Add** — a small form; name required and at least one of phone/email
  (`validateContactDraft`, mirroring W1's junk refusal client-side while the
  server stays authoritative). Submits through the create proxy with a
  human-minted token.
- **Edit** — supersede through the decision proxy (the workbench returns the NEW
  row id, so the card refetches rather than re-pointing).
- **Retire** — the decision proxy with a confirm step and a required reason;
  never a hard delete.
- **Honest failure** — a workbench refusal never renders as saved; one plain
  sentence says what happened (a 409 duplicate surfaces the workbench's real
  reason via `surface409`, not the generic "Already decided"). House copy, no
  semicolons.

## 3. Demo mode

Canned contacts (`demoLenderContacts()` in `lib/demo-fixtures.ts`, synthetic
cast + `example.com`, one with an extension) through the SAME `LenderContactCard`
shape. The guard lives in `getLenderContacts` (`lib/gates.ts`) — the one
demo-canned knowledge read, deliberately unlike the reference-material GETs that
stay real. Every write opens with `DemoWriteBlocked`, and the write routes
additionally return a clean 403 before any workbench touch. `tests/demo.test.ts`
asserts the canned read (zero `fetch`) + all three writes rejected.

## 4. Proofs

- **Unit:** `tests/lender-contacts.test.ts` (+8: validate + shape), demo (+1),
  authority (+ the admin-only key). 952 tests green, tsc clean, `next build`
  green, shell lime audit green.
- **Live on dev** (blessed pattern — dev-Clerk ephemeral TEST admin
  `bdm-contacts+clerk_test@example.com` created via the backend API, signed in
  via Clerk JS, DELETED + confirmed gone):
  - **Demo:** the MCAP card renders Jordan Wells (BDM) with
    `tel:+16475550142;ext=218` (display "+1 (647) 555-0142 x218") + a working
    `mailto:`, and Priya Anand (email-only); rfa shows the teaching empty state
    ("No contacts saved for this lender yet. Ask an admin…"). No write controls
    in demo. Demo writes blocked: POST create AND decision both → **403 "Demo
    mode is read-only."** Both widths measured **0 horizontal overflow** (the
    contacts section spans 359px inside a 375 viewport).
  - **Non-demo dev:** the real book renders (123 MCAP products); the contacts
    read shows the honest "Your session did not produce a token" state (no
    `gates` template on dev) with the Add button present. The Add form refuses
    junk client-side ("A contact needs a name." then "Add a phone number or an
    email."); a valid draft (name + phone) posts and fails honestly with "Your
    session did not produce a decision token. Sign in again and retry." —
    nothing rendered as saved. This is the only write behavior dev can prove.
- **PRODUCTION ACCEPTANCE (Michael, post-push):** on the deployed site, create
  the first real BDM through the card, edit one field to prove supersession, and
  tap the phone link to prove the dial handoff. That single flow closes W1's
  deferred gate-path proof and P1's write proof together.

## 5. Files

New: `lib/lender-contacts.ts`, `components/admin/lenders/LenderContacts.tsx`,
`app/api/portal/admin/knowledge/contacts/route.ts`,
`app/api/portal/admin/gates/lender-contacts/create/route.ts`,
`app/api/portal/admin/gates/lender-contacts/[contactId]/decision/route.ts`,
`tests/lender-contacts.test.ts`, this doc.
Modified: `lib/gates.ts`, `lib/demo-fixtures.ts`, `config/authority.ts`,
`config/lenders.ts`, `components/admin/RatesLenders.tsx`,
`components/admin/RatesBook.tsx`, `components/admin/lenders/RatesEngine.tsx`,
`tests/authority.test.ts`, `tests/demo.test.ts`, plus the closing-ritual files.

Guardrails: no workbench code (portal surface over W1); reads through the gates
token, writes through the gate with a human-minted token; one new CONTRACT
authority key (admin); demo canned + writes blocked; no lime; PII discipline
(synthetic cast + example.com; TEST admin deleted). No new env var, no
migration.
