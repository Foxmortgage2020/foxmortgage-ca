# Task 0 — Unify the Fox Mortgage phone number (2026-07-17)

## Every surface now reads 226-770-8880.

`lib/contact.ts` is the single source of truth: `226-770-8880` (display) /
`tel:+12267708880` (href), set per Michael's explicit confirmation. Every place that
renders the Fox number now reads it from that constant, and a guard test
(`tests/contact-number.test.ts`) forbids the number as a literal anywhere else, so it can
never be hand-typed out of sync again.

## What was wrong

The number lived in five places and had already drifted: `lib/contact.ts` and the demo FP
support page still said the old `519-226-8880`, while the two client PDFs already said
`226-770-8880`. A client reading a PDF and a client calling the number on a support page
would have seen different numbers.

## What changed

| File | Before | After |
|---|---|---|
| `lib/contact.ts` | `519-226-8880` / `tel:+15192268880` | **`226-770-8880` / `tel:+12267708880`** (the source of truth) |
| `app/demo/fp/support/page.tsx` | inlined `519-226-8880` | reads `CONTACT` (it dropped its self-contained copy — `CONTACT` is a plain constant, not live data, so the demo stays isolated while the number stays in sync) |
| `lib/rates-pdf.ts` | hardcoded `226-770-8880` in the footer | reads `CONTACT.phone.display` |
| `lib/savings-pdf.ts` | hardcoded `226-770-8880` in the footer and the CTA band (×2) | reads `CONTACT.phone.display` |
| `app/portal/admin/directory/page.tsx` | a comment used the real number as its formatting example | comment now uses a clearly-fictional example; the page itself only ever renders *learned* numbers, never the Fox line |

The PDF golden tests (30) still pass, so the footers render correctly through the constant.

Everywhere that already read `CONTACT` — the B5 client portal (`ClientFilePage`,
`NotFoundCard`, `client-team`), and all five role support pages (fp, investor, lawyer,
mortgage-agent, realtor, plus the generic `/portal/support`) — picked up the new number
with no change, because they were already routing through the constant.

## The guard

`tests/contact-number.test.ts` walks the code tree (`app`, `lib`, `components`, `config`;
tests, fixtures, and docs are exempt) and fails if it finds:

- The Fox number (current `2267708880` or the retired `5192268880`) as a literal anywhere
  but `lib/contact.ts`, or
- Any unrecognized real-looking phone number — one that is neither an obvious fiction (a
  `555` exchange or a run of four-plus zeros, which covers every form placeholder and demo
  fixture) nor the one explicitly-allowlisted SMM number.

Mutation-tested three ways to confirm it is not vacuous: pasting the Fox number into a
component fails it, an unrecognized real number in `lib/` fails it, and reverting
`lib/contact.ts` to the old number fails the value assertion.

## One question for Michael

**The SMM enrollment page still says `519-654-8173`** (in the "something went wrong, call
us" error message and as an input placeholder, `app/smm/enroll/page.tsx` lines 171 and
277). Left untouched per the brief, and flagged here: is `519-654-8173` an intentional
second line for SMM enrollment, or should it also be `226-770-8880`? The guard allowlists
it explicitly, so the moment you decide, it is a one-line change plus removing one line
from the allowlist.

## Untouched, and why (not the Fox line)

Form placeholders and demo fixtures are phone-shaped but are not the Fox number — they are
input-format hints and fictional sample data, so they stay as-is and the guard waves them
through: `(519) 000-0000` (the contact form's own-number placeholder),
`(416) 555-0123` (the add-referral placeholder), and the `(000) 555-010X` demo partner
numbers in `lib/demo-fixtures.ts`.

## Verification

tsc clean; full suite **684** (from 681: +3 guard tests); PDF goldens green; a repo-wide
grep for the Fox number returns only `lib/contact.ts`.
