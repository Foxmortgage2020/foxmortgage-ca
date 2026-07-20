# The Today calendar band goes live (Microsoft Graph, read-only)

Date: 2026-07-20 (Toronto). Base: `18b79f1`. Committed, not pushed.

The calendar card in "Your day" stops being a connect state and renders Mike's
real day from his Microsoft calendar. Read-only, server-side, fail-soft. No
Graph write exists anywhere in this build.

## Findings first

- **The calendar card was a teaching connect state** (`components/admin/today/YourDay.tsx`
  `CalendarCard`): one sentence plus a disabled "Connect your Microsoft calendar"
  button and a "Coming soon" chip. No data was fetched.
- **No prior Microsoft/Graph plumbing existed anywhere in the repo** — greenfield.
  Confirmed by a repo-wide grep for `graph.microsoft` / `login.microsoftonline` /
  `MS_TENANT` / `calendarView`.
- **Server-only secret convention.** The repo has no `server-only` npm package
  (only comments reference it). The convention is a header comment
  (`lib/foxca-secret.ts`: "Server-only. Never NEXT_PUBLIC.") plus the module being
  imported by server code only. This build follows that convention **and** adds a
  static test (below), so the guarantee is enforced, not just documented.
- **All four env vars are present locally** (`MS_TENANT_ID`, `MS_CLIENT_ID`,
  `MS_CLIENT_SECRET`, `MS_CALENDAR_UPN`). Two of them (`MS_TENANT_ID`,
  `MS_CLIENT_SECRET`) carried a stray leading space in `.env.local`; a space inside
  a tenant id or secret silently breaks the token request, so `msEnv()` `.trim()`s
  every value.
- **Live probe (2026-07-20).** A read-only probe confirmed the credentials work
  (token `expires_in` 3599) and locked the exact Graph JSON shape: with
  `Prefer: outlook.timezone="America/Toronto"`, `calendarView` returns `start`/`end`
  as **naive Toronto wall-clock** strings (`"2026-07-20T11:00:00.0000000"`, timeZone
  `America/Toronto`). The whole mapper is built on that fact. Today carried one real
  event (an 11:00–11:50 meeting), which drove the live render proof.

No load-bearing wrong assumption in the brief. One small copy change to the connect
state: "Coming soon" → "Ask your admin to set it up", because the build is now live
and connecting is an env/admin task, not a user "coming soon" feature.

## The integration — `lib/ms-calendar.ts`

Server-only. The four secrets and the UPN are read here and nowhere else.

- **Auth.** Client-credentials against
  `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, scope
  `https://graph.microsoft.com/.default`. The token is cached in-process
  (`{ token, expMs }`) and refreshed 60s before expiry. It never leaves the module
  and is never logged.
- **Read.** `GET /v1.0/users/{UPN}/calendarView` with `startDateTime`/`endDateTime`
  set to the exact Toronto day as **UTC instants** (`torontoDayStartISO(todayYMD)` →
  next day; DST-correct). This is load-bearing: Graph reads an offset-less
  calendarView datetime as UTC and the `Prefer` header only sets response
  rendering, so an offset-less window would query a UTC day and miss this
  evening's events (see the review note below). `$orderby=start/dateTime`, `$top=50`,
  `$select=subject,start,end,location,isAllDay,isOnlineMeeting,onlineMeeting`. Header
  `Prefer: outlook.timezone="America/Toronto"`. Mapped to a slim shape
  (`GraphEventLite`): subject, naive start/end, isAllDay, location displayName,
  online hint. **No attendee lists, no bodies, no join URLs** (an online meeting is a
  hint only).
- **Revalidate.** A 60s in-process cache of the raw lites (the "short revalidate"
  the brief asks for) absorbs a burst of Today renders into one Graph call. Statuses
  (past/now/upcoming) are re-derived from a fresh clock on every render — only the
  network read is cached — and failures are never cached (only the success path
  `.set`s, matching `lib/cache.ts` doctrine).
- **The pure mapper** (`mapCalendarEvents`, `localMinutes`, `localOffsetMinutes`,
  `fmtClock`, `torontoNowMinutes`) is fully deterministic and unit-tested. Status and
  sort use **date-aware** minutes-relative-to-today (`localOffsetMinutes`), so a
  cross-midnight or multi-day timed event is placed correctly; the displayed labels
  use the event's own wall clock. Events render time-ordered (all-day first, then by
  start); an in-progress event reads as `now`, a finished one reads `past` (muted),
  the rest `upcoming`; all-day reads neutral. The "now in Toronto" helper is DST-safe
  (proven against a July and a January instant).

## The band — `components/admin/today/YourDay.tsx`

The card renders four states from a `CalendarResult`:

1. `{ configured: false }` (absent env) → the teaching **connect state**.
2. `{ ok: false }` (runtime failure) → one quiet line, "Calendar is not available
   right now." The rest of the page is unaffected.
3. `{ ok: true, events: [] }` (connected, nothing booked) → a teaching empty state.
4. `{ ok: true, events }` → the time-ordered list. Each row: time (tabular), subject,
   and a location or "Online" hint. A past event is muted; an in-progress event gets
   an ink-navy left accent and a small "now" marker. No lime anywhere (status urgency
   is never a queued decision; the shell audit walks this file).

## Fail-soft (load-bearing)

`getTodayCalendar` never throws to the page: missing env returns
`{ configured: false }`, and the token/Graph calls are wrapped so any failure returns
`{ configured: true, ok: false }`. It is added to the page's `Promise.all` safely
because it resolves a result rather than rejecting. A Graph outage or a bad credential
degrades the one card and leaves everything else on Today intact — proven live below.

## Security

- Secrets and the UPN live in env only, are read only in `lib/ms-calendar.ts`, are
  never `NEXT_PUBLIC`, and are never logged (logs carry status codes only, e.g.
  `[ms-calendar] token HTTP 401`) or placed in a query string.
- The module is imported only by the server page and — **type-only** — by
  `lib/demo-fixtures.ts` (the `GraphEventLite` type is erased at build, so
  `ms-calendar` runtime-importing `demoCalendarLites` creates no cycle and no client
  bundle ever pulls the secret code). The band component receives already-mapped
  events as props.
- `tests/ms-calendar.test.ts` **asserts** this: the module carries no `'use client'`
  and no client-exposed env read, no `'use client'` file imports `@/lib/ms-calendar`,
  and no `NEXT_PUBLIC_MS_` name exists anywhere in `app`/`components`/`lib`/`config`.
- **Hardening note for Mike (later pass):** the app permission is tenant-wide
  `Calendars.Read` at the application level. A Microsoft
  **ApplicationAccessPolicy** (`New-ApplicationAccessPolicy` in Exchange Online
  PowerShell) can scope the app registration so it can read only Mike's mailbox rather
  than every mailbox in the tenant. Recommended before this is used beyond a single
  operator.

## Demo mode

`getTodayCalendar`'s first line is the demo guard: in demo it returns canned
synthetic events (`demoCalendarLites`, in `lib/demo-fixtures.ts`) run through the SAME
pure mapper — zero real reads. The events are obviously fictional (Team offsite,
Underwriting sync, Client call with Marty McFixture) and cover all four states during
the workday. `tests/demo.test.ts` asserts the demo path returns events with the fetch
spy never called.

## Adversarial review

A 4-dimension review (correctness / security / fail-soft-honesty / integration) with a
refuting verify pass ran over the diff: 5 candidates raised, **2 confirmed, both fixed +
regression-tested**, 3 refuted.

1. **HIGH, correctness — the query window was UTC, not Toronto.** `startDateTime`/
   `endDateTime` were offset-less (`todayYMD T00:00:00`); Graph reads those as UTC and
   the `Prefer` header only affects response rendering. So the window was the UTC day,
   shifted 4–5h — today's evening events would drop off and yesterday's late events
   would leak in as stale rows. A daytime test can't reveal it (all of today's
   00:00–20:00 EDT events sit inside the shifted window), which is why the live probe
   passed. **Fixed:** the window is sent as UTC instants of the Toronto day
   (`torontoDayStartISO`, DST-correct); verified live that the corrected window returns
   today's event with no stale leak.
2. **MED, correctness — cross-midnight events were mis-placed.** `localMinutes`
   discarded the date, so a timed event spanning midnight (e.g. 10 PM → 1 AM) got a
   wrong status, sort, and could read `past` while in progress. **Fixed:** status and
   sort now use `localOffsetMinutes` (minutes relative to today's midnight, date-aware);
   labels keep the event's own wall clock. Regression tests cover the overnight and
   multi-day cases from today's view and tomorrow's.

Refuted: a claimed secret-in-URL, a claimed import cycle, and a claimed cache leak — all
checked against the code and found not to hold.

## Proofs

- Suite **897 → 914 tests** (+17: `tests/ms-calendar.test.ts` 16, `tests/demo.test.ts`
  +1). `tsc --noEmit` clean. `next build` green. Shell lime audit green (no new lime).
- **Ephemeral dev-Clerk TEST admin** (`mscal-proof+clerk_test@example.com`, admin)
  created via the Clerk backend API, signed in through Clerk JS (password + email-code
  2FA, dev code 424242), and **DELETED before session end** (deleted: true).
- **Live (real events), both widths.** Today rendered the real event
  "11:00 AM · Recurring Mortgage Meeting" in the calendar card, correct Toronto time,
  correct order, zero console errors, zero horizontal overflow at 1280 and 375.
- **Demo (multi-state), both widths.** All-day + past (muted) + now (ink-navy accent
  and "now" marker) + upcoming rendered; zero overflow at 1280 and 375.
- **Both failure paths proven end-to-end.** With `MS_TENANT_ID` blanked and the dev
  server restarted, the card showed the connect state and the rest of Today was intact.
  With a bad `MS_CLIENT_SECRET`, the card showed "Calendar is not available right now.",
  the server logged `[ms-calendar] token HTTP 401` (the catch genuinely fired), and the
  rest of Today was intact. `.env.local` was backed up and restored to a clean state
  (verified: no proof markers, all four vars present), and real events returned.
- **Post-fix verification.** The render proofs above are of the pre-review code; the
  two correctness fixes change only the query bounds and the date-aware status/sort, so
  the rendering of same-day daytime events (what the screenshots show) is unchanged.
  The fixes are covered by the new unit tests and by a live probe confirming the
  corrected UTC-instant window is accepted by Graph and returns today's event with no
  stale leak.

## Deviations, stated

- The demo "now" event was widened to a mid-morning block (9:30–11:30) so the demo
  reliably demonstrates the in-progress state during the workday. Statuses are still
  time-dependent (a real calendar has no "now" at 8pm either) — inherent, not a bug.
- The connect state's "Coming soon" copy became "Ask your admin to set it up" (the
  build is live; connecting is an admin/env task). The rest of the connect state is
  unchanged, per the brief.

## Closing ritual

CLAUDE.md header note + session-ledger entry, `config/changelog.ts` entry, the roadmap
"Today v1" item, and this report. The `docs/input-commit-2026-07-18.md → -2026-07-20.md`
rename was already completed in the prior (task two-way) session — verified no stale
`input-commit-2026-07-18` reference remains. Committed, not pushed.
