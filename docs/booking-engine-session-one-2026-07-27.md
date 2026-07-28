# Native booking engine, session one of four

Built 2026-07-27. Base commit `8dc9f36`.

Sessions two to four are named at the bottom, with the exact remaining distance.

---

## Step 0 first: can the Graph credential create events?

**No. It is read only, and that is proven rather than assumed.**

The probe was non destructive: fetch an app only token with the existing
`MS_*` credentials and decode the `roles` claim, which is the tenant's own
statement of what the application may do. No secret was printed and nothing was
written.

```
audience: https://graph.microsoft.com
GRANTED APPLICATION ROLES: ["Calendars.Read"]
Calendars WRITE granted: false
```

So `createEvent` ships as a marked stub. The important part is that it is not a
hardcoded one: `lib/booking/outlook.ts` reads that same `roles` claim at runtime
and refuses **before** making a request when the write role is absent. The day
the grant lands, the code starts writing with no code change, no new environment
variable, and no deploy. Every booking taken in the meantime is stored with
`calendar_status = 'pending_retry'` and the reason, so session two's reconcile
job can fill the calendar in retrospectively. Nothing is lost.

This was confirmed live end to end. A real booking made through the real page
stored:

```
calendar_status: pending_retry
calendar_detail: "The calendar app can read this calendar but cannot add events
                  yet. It needs the Calendars.ReadWrite permission."
```

### The Azure grant, in plain language, for Michael

You need to be a tenant admin. This is the only part of session one that a person
has to do by hand, and it takes about two minutes.

1. Go to **portal.azure.com** and sign in.
2. Open **Microsoft Entra ID**, then **App registrations**, then **All
   applications**. Find the app whose Application (client) ID matches the
   `MS_CLIENT_ID` value in Vercel. It is the same app the Today page already uses
   to read your calendar.
3. Click **API permissions** in the left menu.
4. Click **Add a permission**, choose **Microsoft Graph**, then choose
   **Application permissions** (not Delegated).
5. Search for **Calendars**, tick **Calendars.ReadWrite**, and click
   **Add permissions**.
6. Back on the API permissions screen, click **Grant admin consent for
   [your tenant]** and confirm. **This last click is the one that actually turns
   it on.** Without it the permission sits there listed but not granted.

That is it. No deploy is needed. The app picks the new permission up on its next
token, within an hour at the outside, and bookings start writing to the calendar
on their own.

### One thing to know before you click

`Calendars.ReadWrite` at the application level is **tenant wide**. It lets the app
read and write every mailbox in the tenant, not just yours. That is how Microsoft
models application permissions and there is no narrower box to tick.

The way to narrow it afterwards is an **ApplicationAccessPolicy** in Exchange
Online, which restricts the app to named mailboxes. The existing read permission
has the same shape and the same open question, already noted in
`docs/ms-calendar-2026-07-20.md`. Doing both at once is sensible: one policy
covers read and write together.

```powershell
# Exchange Online PowerShell, as an admin. Restricts the app to one mailbox.
New-ApplicationAccessPolicy `
  -AppId <the MS_CLIENT_ID value> `
  -PolicyScopeGroupId mfox@foxmortgage.ca `
  -AccessRight RestrictAccess `
  -Description "Fox Mortgage booking engine, Michael's mailbox only"
```

I did not run any of this. No Azure change was attempted, and no secret value
appears anywhere in this document or the repository.

---

## What works end to end, today

Proven on the real page against Michael's real calendar, not a fixture.

- **The public page** at `/book/mike/strategy-session` and the other three types.
  Server rendered, in the site's design system, navy hero and lime primary action.
- **Real availability.** Days with no meetings show 30 open slots. Days with real
  meetings show 23 to 26. Jul 28 starts at 10:15 AM because a real event blocks
  that morning. Weekends and today are correctly absent. This is Graph busy data
  being subtracted, not a fixture.
- **Per event type.** The same day showed 25 open for a 45 minute strategy session
  and 28 open for a 15 minute discovery call. Duration, buffers, notice, advance,
  and per day caps all come from the event type row.
- **A real booking**, made by filling in the real form and pressing the button.
  2:00 PM Toronto stored as `18:00Z`, `local_date` correct, phone normalized to
  `+16475550142`, consent recorded with a timestamp, reschedule token stored as a
  64 character hash and never in plain text.
- **The slot then disappears.** After booking 2:00 PM, both 2:00 PM and 1:45 PM
  vanished from the public list, because the 5 minute buffer blocks the neighbour
  too. The day count dropped 28 to 25, which is exactly the three slots the
  padded interval covers.
- **Every refusal path**, exercised against the live API:

  | Attempt | Result |
  |---|---|
  | Someone else books the taken slot | refused, fresh slot list returned |
  | Same person books twice in one day | `duplicate_pending`, matched across different email casing |
  | A time not on the increment grid | refused |
  | A time outside business hours | refused |
  | A time in the past | refused |
  | Missing phone, bad email | field level errors, nothing stored |
  | Missing required intake answer | field level error, nothing stored |
  | Honeypot filled | looks like success, stores nothing |
  | Unknown host or event type | 404 |

  After all of that, the table held exactly one row: the legitimate booking. Every
  refusal stored nothing.
- **The database posture**, proven as the anon role, which is what a leaked key
  would be. All six tables refuse a direct read with `42501`. Every function
  refuses without the operator secret and answers with it.
- **Both widths.** Zero horizontal page overflow at 1280 and at 375. The day strip
  scrolls inside its own container, which is intended. No console errors.

The proof booking was deleted afterwards. The table is empty.

---

## What is stubbed, and what that means

| Piece | State | What happens today |
|---|---|---|
| **Outlook event creation** | Marked stub, capability gated | Booking saves, `calendar_status` is `pending_retry` with the reason. Lights up on its own when the Azure grant lands. |
| **Google Calendar** | Declared stub | Every method reports not connected. `capability().configured` is false so nothing pretends to work. |
| **Confirmation email and ics** | Not started | Session two. |
| **Zoho contact and deal write** | Columns and token verification exist, no write | Session two. `zoho_contact_id`, `deal_id`, `touch_id` are populated from a prefill link today. |
| **Reschedule and cancel** | Token minted and hashed, no routes | Session three. |
| **Admin availability dashboard** | Not started | Session four. Hours, overrides, and event types are editable in the database now. |

### Read this before planning a Google launch

`lib/booking/google.ts` carries the full note in the code. The short version:
Google OAuth verification for calendar scopes is a **lead time measured in weeks
to months**, not a task. It needs a verified domain, a published privacy policy, a
demonstration video, a security questionnaire, and for restricted scopes a paid
third party security assessment. Until it passes, the app is capped at 100 test
users and shows an unverified app warning, which is not survivable on a client
facing page.

**If agent two runs on Google Workspace, start the verification submission at
least a full quarter before they need to take bookings.** A domain wide delegated
service account avoids verification entirely but only works inside one Workspace
tenant.

---

## Decisions worth naming

**"Service role writes only" was met with something narrower, not weaker.**
There is no FOXCA service role key. The only credentials are the anon key, which
is shared with public form intake, and `FOXCA_OPERATOR_SECRET`. Minting a service
role key would reverse the deliberate 2026-07-09 decision that deleted the
workbench's. So this follows the ruling already written into
`20260717150000_client_links.sql`: RLS on, no policies, table grants revoked, and
a few narrow security definer functions that each demand the operator secret.
That exposes five operations rather than a schema. The public visitor never
reaches Supabase at all.

**Availability fails closed.** If Graph cannot be read, the page offers no times
and shows an honest line pointing at the phone and email. The alternative is
offering times we cannot verify are free and double booking a client onto
something already in Michael's calendar. A quiet honest line costs a booking. A
double booked client costs trust twice.

**The prefill token carries record ids only.** A signed token is signed, not
encrypted, and its payload is readable base64. Putting a name or an email in it
would put them in the URL, in browser history, in referrer headers, and in logs.
So the token carries the Zoho contact id, deal id, touch id, and an expiry, and
nothing else. A test asserts the payload keys and that no `@` appears in it.
Contact details are prefilled in session two from a server side lookup instead.

**The rate limiter is honest about being best effort.** It is in process, so a
cold start resets it and another instance does not see it. This repo already
writes down that in process state is never for correctness. The real guards are
in the database, where they cannot be evaded by hitting a different instance: one
active booking per email per event type per day, a partial unique index on
`(agent_id, starts_at)` for live rows, and the per day cap.

**Two redundant conflict checks, on purpose.** The engine re check enforces every
rule including provider busy. The SQL re check plus the unique index enforce the
two rules that must hold under concurrency. In practice a taken slot is refused
by the engine as `slot_not_offered`; `slot_taken` is reserved for the true
microsecond race, which is why both exist.

**`bookings.local_date` is an addition to the brief's column list.** It is the
host local calendar date, computed by the server in the host's zone. It makes the
per day rules correct across DST with no timezone math in SQL, forever.

**Durations are the brief's and are unverified.** Browsing to
`foxmortgage.zohobookings.com` is blocked by this environment's policy, so
Michael's live Zoho Bookings types could not be read. The four seeded types use
the brief's durations. **Michael should confirm or correct them**, and from
session four they are editable in the dashboard rather than in a migration.

---

## Migrations

Both applied live to FOXCA `skfeivzhqvrefnkqjwtj`. Neither touches an existing
migration or an existing table.

| File | What it does |
|---|---|
| `supabase/migrations/20260727160000_booking_engine.sql` | Six tables, indexes, RLS, grant revokes, five security definer functions |
| `supabase/migrations/20260727160100_booking_seed_mike.sql` | Michael as host `mike`, the Outlook connection recorded as `read_only`, four event types, Monday to Friday 9 to 5 |

Every table is keyed by `agent_id` from the first migration. `agent_id` is
`a0000000-0000-4000-8000-000000000001`, Michael's canonical workbench `agents.id`,
resolved live by email. It is a value copied in, never a cross project join, so
the booking engine has no runtime dependency on the workbench.

### Seeded event types

| Slug | Name | Duration | Buffer after | Notice | Per day | Intake |
|---|---|---|---|---|---|---|
| `discovery-call` | Discovery call | 15 min | 5 min | 4 h | 8 | none |
| `strategy-session` | Strategy session | 45 min | 10 min | 12 h | 4 | one required select |
| `smm-strategy-call` | Monitoring strategy call | 30 min | 10 min | 12 h | 5 | one optional text |
| `signing-review` | Signing review | 20 min | 5 min | 4 h | 6 | none |

The Outlook connection row is seeded with `status = 'read_only'` and
`write_calendar_id = NULL`. That is the Step 0 finding written into the data
rather than into a comment. When the grant lands, move it to `connected`.

---

## Files

**Pure, unit tested, no I/O**
- `lib/booking/time.ts` — timezone math, hand rolled because this repo vendors no
  date library. The only place a wall clock becomes an instant.
- `lib/booking/availability.ts` — the slot engine. Shared by the display path and
  the confirm path, so they cannot disagree about a rule.
- `lib/booking/validate.ts` — form rules and every client facing refusal sentence.
- `lib/booking/tokens.ts` — prefill signing, reschedule token minting and hashing.
- `lib/booking/types.ts` — a leaf module importing nothing, so everything else can
  share shapes without a cycle.

**Server only**
- `lib/booking/calendar.ts` — the three method provider interface.
- `lib/booking/outlook.ts` — Graph. Busy is real, event creation is capability gated.
- `lib/booking/google.ts` — declared stub plus the verification lead time note.
- `lib/booking/store.ts` — the FOXCA twin, the only thing holding the operator secret.
- `lib/booking/engine.ts` — the service layer both routes call.
- `lib/booking/rate-limit.ts` — best effort, and says so.

**Surface**
- `app/book/[host]/[eventType]/page.tsx` and `BookingFlow.tsx`
- `app/api/book/slots/route.ts`, `app/api/book/confirm/route.ts`
- `middleware.ts` — five new public route entries

**Tests** — 1042 total, up from 1000.
- `tests/booking-time.test.ts` — DST round trips across both transitions, proven
  non vacuous by asserting the offset actually moves inside the range.
- `tests/booking-availability.test.ts` — every rule, plus fail closed, plus a DST
  regression proving a 9am slot stays 9am across the March change.
- `tests/booking-tokens.test.ts` — including the assertion that the prefill
  payload holds no personal data.
- `tests/booking-validate.test.ts` — validation, the copy gate over every visible
  string, and four architectural sweeps.

---

## The distance to session two

Session two is confirmation email with ics, signed reschedule and cancel links,
the T-24h n8n reminder, the booking notification to Michael, Zoho linkage with
consent flow through to CASL fields, and the calendar write reconcile job.

What session one leaves ready for it:

- `booking_get(id, secret)` already returns everything an email template needs,
  including the host timezone and display name.
- The reschedule token is already minted and hashed at booking time, and already
  deliberately withheld from the browser response, so it can go straight into the
  email without a schema change.
- `bookings.calendar_status = 'pending_retry'` plus a partial index on it is the
  reconcile job's work queue, already populated correctly.
- `zoho_contact_id`, `deal_id`, and `touch_id` are already written from a prefill
  link, so the Zoho work is a write, not a plumbing exercise.
- `sms_consent` and `consented_at` are already captured and proven.

What session two has to build from nothing: the Resend template and its ics
attachment, the two token routes, the n8n reminder workflow, and the Zoho write.

**Blocking on a person, not on code:** the Azure grant above. Until it lands every
booking is real but its calendar entry is not, which is exactly what
`pending_retry` records.
