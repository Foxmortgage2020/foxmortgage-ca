# Scenario input commit — the match engine stops firing per keystroke (2026-07-18)

Base: `main` tip `5f3ac1a`. Config/component/test + the standing house rule. Suite
860 → **865** (+5), tsc clean, `next build` green. Committed, not pushed.

## The defect

On the admin Rates scenario view (`/portal/admin/lenders?tab=rates` →
`RatesScenario.tsx`), the two `type="number"` inputs — **Mortgage amount** and
**Property value** — called `setScenario` on every `onChange`, and `setScenario`
does `router.replace(...)`. So typing `1500000` wrote `amount=1`, `amount=15`,
`amount=150`, … to the URL — seven navigations, seven searches.

Each navigation is doubly expensive: the mounting page
`app/portal/admin/lenders/page.tsx` is `export const dynamic = 'force-dynamic'`
and reads searchParams, so `router.replace` triggers a fresh RSC render that
refetches `getRateQuotesFull` (the ~1257-row approved+superseded book, paged at
1000 rows = 2 PostgREST round trips) **twice** (strip tiles + RatesTab), plus
`getPendingSheetReviews` / `getIntelItems` / `getSheetProvenance`; and the client
recomputes `lenderResults` / `scenarioExclusions` / `winningOffer` over the whole
book.

## Findings first

- **The ONLY per-keystroke defect is these two number inputs.** Every other
  candidate is clean:
  - **The client qualification explorer** (B9) does NOT share the defect: its
    inputs drive a pure, O(1), in-render `computeQualification` (a couple of
    `monthlyPayment` calls) with NO network, NO router, NO fetch. Live feedback
    there is the intended UX and costs nothing. Left unchanged, by design.
  - **cmd-K global search** is already debounced (180ms) with an AbortController +
    a cancelled flag. Not a defect.
  - **Ask Fox chat** submits on Enter / form-submit, not per keystroke.
  - **RatesBrowser / RatesLenders filters, Partners search, Provision-wizard
    search** are client-side `useMemo` filters over already-loaded props — no
    network. Fine even per keystroke.
  - The RatesScenario **selects and checkboxes** (purpose, occupancy, class,
    term, rate type, cash back, amortization, qualifiers) also call
    `setScenario` → `router.replace`, but a `<select>`/checkbox fires ONCE per
    deliberate selection — not a keystroke. Left as-is.
- **LOAD-BEARING WRONG-ASSUMPTION IN THE BRIEF (stated loudly):** the server
  refetch does NOT depend on the scenario searchParams. `getRateQuotesFull` is
  agent-scoped only — the amount/value/scenario dimensions never reach the query.
  So each keystroke re-read the *identical* ~1257 rows: the scenario matching is
  entirely client-side (`lenderResults` over the `quotes` prop), and the
  per-keystroke server refetch bought nothing. The blur-commit fix removes the
  waste from the number inputs; the same wasteful (data-independent) refetch on
  every *select* change is a separate, pre-existing inefficiency, out of this
  patch's scope but noted as a follow-up (decouple the quotes fetch from
  searchParams, or memoize the segment).
- **No debounce/commit helper existed** in the repo. The commit-on-Enter
  precedent is the saved-scenario name input; the debounce precedent is cmd-K.

## The change

- `lib/input-commit.ts` — `commitNumericInput(raw): number | null`, the pure
  blur/Enter parser (tolerant of `1,500,000` / `$928,000`; empty or nonsense →
  null, never NaN). Unit-tested (`tests/input-commit.test.ts`, 5 cases).
- `components/admin/CommittedNumberField.tsx` — a numeric input that keeps local
  text state while typing (nothing navigates), commits the parsed value on blur
  or Enter, and resyncs when the committed `value` changes externally (a recalled
  scenario, a prefill, a reset) via React's store-previous-render pattern.
- `RatesScenario.tsx` — the two number inputs now use `CommittedNumberField`,
  each guarded so a blur with no change never re-searches
  (`if (v !== scenario.amount) setScenario(...)`).
- No currency formatting-while-typing issue exists (these are `type="number"`
  inputs — no commas mid-typing); the parser normalizes a pasted comma figure on
  commit.

## The standing rule (added to CLAUDE.md)

> No keystroke ever triggers a network call or heavy recompute. Inputs commit on
> blur or Enter, or debounce at 600ms or more with in-flight cancellation.

Scoped in CLAUDE.md to inputs that drive matching/fetching; it does NOT force
blur-commit on a pure, local, O(1) live recompute (the qualification explorer's
sliders).

## Proof (live, dev Clerk instance)

Ephemeral TEST admin (`commit-proof+clerk_test@example.com`, a Clerk test email so
the dev code 424242 clears the email-code second factor) created via the Clerk
backend API, signed in through Clerk JS, and **deleted before the session ended**
(0 remaining). Navigated to the real Rates scenario view; typed `1500000` into
the Mortgage amount field digit by digit while capturing the network log:

- **During typing (7 keystrokes): zero navigations.** `location.search` stayed
  `?tab=scenario` after every keystroke, and the RSC network log contains NO
  request carrying a partial amount (`amount=1`, `amount=15`, … all absent). The
  field held the local text `1500000`.
- **On blur: exactly one commit.** One RSC request fired,
  `/portal/admin/lenders?tab=scenario&…&amount=1500000&_rsc=…`, and the scenario
  summary updated to `$1.5M`. Before the fix this path was seven RSC round trips.
- **Stale results never land.** The fix commits on blur/Enter (no debounced
  in-flight fetch to race), and Next aborts superseded RSC fetches on a newer
  navigation (observed `net::ERR_ABORTED` on superseded `_rsc` requests), so a
  later commit always wins.

(The Rates page is admin-gated, so this used the blessed dev-Clerk pattern rather
than the public demo route. A leftover `fox_demo` cookie from an earlier proof put
the page in demo mode, which is orthogonal — the input-commit behavior and the
RSC-navigation mechanism are data-independent.)

## Verification

- tsc clean, `next build` green, **865 tests** (+5, `tests/input-commit.test.ts`).
  The shell lime test stays green (the new admin component uses no lime/decision
  classes).

## Guardrails

No fox-underwriting changes, no Zoho writes, no migration, no new surface. Census
untouched (the two inputs swap one component for another; the URL-as-state model
is unchanged, just committed on blur). Committed, not pushed.
