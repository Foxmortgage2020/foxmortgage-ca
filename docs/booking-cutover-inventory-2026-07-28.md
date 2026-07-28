# Booking cutover inventory

**Written 2026-07-28, booking session four of four. Nothing in this document has
been performed. The swap is Michael's move, made when the last gate row is
green.**

Every place Fox Mortgage points a human at Zoho Bookings, what changes at swap
time, and when the Zoho Bookings account can actually be turned off.

---

## Findings first, because two of the brief's premises were wrong

**1. The swap is NOT one env value in this repo. It is one CONSTANT.**
`CONTACT.bookingUrl` in `lib/contact.ts` is a hardcoded string literal, not an
environment variable:

```ts
bookingUrl: 'https://foxmortgage.zohobookings.com/4936582000000975003',
```

Eight portal surfaces read it. Changing that one line changes all eight. There
is no `BOOKING_URL` env var to flip, and adding one is not needed: the native
booking URL is not a secret and not deployment-specific.

**2. `RENEWAL_CALENDAR_URL` is not in this repo at all. It lives in
fox-underwriting, and it has never been set.**
It is the renewal drip's `{calendar_link}` pin
(`src/skills/renewal/pins.ts`, source `config:RENEWAL_CALENDAR_URL`). It is
**UNSET by design** and the render layer HOLDS any touch that needs it
(`src/skills/renewal/render.ts`: "booking block omitted"). This is the single
most important fact in this document, because it means **the drip has never
sent a Zoho Bookings link to anybody.** The retirement question below gets much
simpler as a result.

**3. The SMM wizard does not link to Zoho Bookings.** Its "Book a Call" CTA
(`app/smm/enroll/page.tsx:634`) points at `/contact`. So do the other four
public CTAs. There is no SMM wizard repoint to undo, only an optional repoint to
make.

**4. `[CalendarLink]` appears only in `docs/JOURNEY.md`.** The real pin is named
`{calendar_link}`. Naming drift in a document, nothing to change in code.

---

## The inventory

### A. The one code change that swaps eight surfaces

| Where | Line | What it is |
|---|---|---|
| `lib/contact.ts` | 31 | `bookingUrl` constant. **THE swap.** |

Read by, and all eight change together:

| Surface | File | Note |
|---|---|---|
| Client status page | `app/portal/file/[token]/ClientFilePage.tsx:201` | "Book a time with Michael" |
| Qualification explorer | `app/portal/file/[token]/QualificationExplorer.tsx:178` | Every band's CTA |
| Support, generic | `app/portal/support/page.tsx:83` | |
| Support, financial planner | `app/portal/fp/support/page.tsx:42` | |
| Support, realtor | `app/portal/realtor/support/page.tsx:42` | |
| Support, lawyer | `app/portal/lawyer/support/page.tsx:42` | |
| Support, mortgage agent | `app/portal/mortgage-agent/support/page.tsx:42` | |
| Support, investor | `app/portal/investor/(active)/support/page.tsx:100` | |

**A SECOND, SEPARATE CHANGE, easy to miss:** four of those Support pages carry
the literal subtitle **"Schedule time via Zoho Bookings"**
(`fp`, `realtor`, `lawyer`, `mortgage-agent`, each at line 54). Swapping the URL
without swapping that string leaves four pages naming a vendor that is no longer
involved. It is client-visible copy, so it passes the gate:
**"Pick a time that works for you."**

### B. The renewal drip, in fox-underwriting

| Where | What | State |
|---|---|---|
| `src/skills/renewal/pins.ts:92` | `calendar_link` pin, `config:RENEWAL_CALENDAR_URL` | **UNSET** |
| `src/renewal/engine.ts:359` | Holds a touch when the pin is missing | Working as designed |
| `api/cron/renewal-tick.ts:50`, `scripts/renewal-tick.ts:42` | Read the env var | Pass `null` today |

**At swap time this is one env var set for the first time, in
fox-underwriting**, not a change here. Setting it to
`https://foxmortgage.ca/book/mike/strategy-session` releases every held touch
and the drip starts sending booking links. It has never sent a Zoho one.

### C. Public site CTAs, all pointing at /contact today

`app/page.tsx:40`, `app/about/page.tsx:66`, `components/footer.tsx:52`,
`app/smm/enroll/page.tsx:634`. None reference Zoho Bookings. Repointing any of
them at `/book/mike/discovery-call` is an OPTIONAL improvement, not part of the
swap. It is also the decision that puts `/book` into public navigation, which
this session's brief keeps as Michael's call recorded at swap time.

### D. Documentation only, no behaviour

`CLAUDE.md:1651`, `docs/JOURNEY.md:95,117,151`,
`docs/booking-engine-session-one-2026-07-27.md:208`,
`docs/comms-desk-b7p-2026-07-18.md:83,87,92`,
`docs/qualification-b9-2026-07-18.md:69`,
`supabase/migrations/20260727160100_booking_seed_mike.sql:11`,
`app/demo/fp/support/page.tsx:53` (a demo placeholder comment).
Update in the same pass or afterwards. Nothing breaks either way.

---

## The swap, as steps

1. **In fox-underwriting**, set `RENEWAL_CALENDAR_URL` to
   `https://foxmortgage.ca/book/mike/strategy-session` and deploy. Held renewal
   touches release on the next tick.
2. **In foxmortgage-ca**, edit `lib/contact.ts` line 31 to
   `https://foxmortgage.ca/book/mike/discovery-call`.
3. **In the same commit**, replace the four "Schedule time via Zoho Bookings"
   subtitles with "Pick a time that works for you."
4. **Optional, same commit or later:** repoint the five public "Book a Call"
   CTAs from `/contact` to `/book/mike/discovery-call`, and decide whether
   `/book` joins the public navigation.
5. Deploy. Book one call through each swapped surface before telling anyone.
6. **Do not close the Zoho Bookings account yet.** See below.

---

## The retirement rule, and a date

**The rule: a booking link keeps working until the last person who was sent one
has either used it or stopped looking at the email that carried it. Retire the
Zoho Bookings account only after that, never at swap time.**

Applying it here is unusually easy, because of finding 2 above:

- **The renewal drip has never sent a Zoho Bookings link.** `RENEWAL_CALENDAR_URL`
  has been unset since the drip was built, and touches needing it HOLD rather
  than send without it. There are no drip links in the wild to age out.
- **The Support pages and the client status page are LIVE surfaces, not sent
  messages.** They render whatever the constant currently says. The moment the
  constant changes, every one of them points at the new page. Nothing cached, no
  copies in anyone's inbox.
- **What IS in the wild:** any Zoho Bookings link Michael has pasted into an
  email, a text, or a signature by hand. That is the only population that
  outlives the swap, and only Michael knows its size.

**Recommended retirement date: 2026-10-27, three months after the swap.**

The reasoning, stated so it can be argued with:
- The drip's own longest touch cadence is the renewal sequence, which reaches a
  client at 120, 90, 60, and 30 days before maturity. A person who received a
  hand-pasted link alongside a renewal conversation could plausibly return to
  that email one full touch cycle later, which is 90 days.
- Three months therefore covers a complete renewal outreach cycle plus the tail
  of anyone sitting on an old email.
- Nothing is gained by closing it sooner. A dormant Zoho Bookings account costs
  nothing but the seat, and a dead link costs a client.

**Before closing, on 2026-10-27:** check the Zoho Bookings account for bookings
taken in the previous 30 days. If the answer is zero, close it. If it is not
zero, the links are still circulating and the date moves out another month.

---

## What this session did NOT do

No swap performed. No env vars set. No public navigation changed. The
`bookingUrl` constant still points at Zoho Bookings, and every Support page still
says so. The Availability page shipped, the gate is scored, and the last row is
Michael's to turn green.
