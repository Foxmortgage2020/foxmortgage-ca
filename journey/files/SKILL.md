---
name: renewal-conversation
description: Prepare, run, and capture the renewal strategy session for Fox Mortgage / Michael Fox. Use this skill whenever Mike has a renewal strategy session booked or just finished one, wants a pre-call brief on a renewing client, asks how to run a renewal call, needs to decide whether a client should switch or stay, or wants the call outcome written back to Zoho. Trigger even if he just says "renewal call prep for [client]", "what do I say to [client]", "prep me for the 2pm", "brief me on [client]'s renewal", or "[client] is staying with their bank, now what". Covers the 45 minute strategy session that the renewal drip books. Does not write the client follow-up email, which is queued behind the comms engine copy pass.
---

# Renewal Conversation (Fox Mortgage / Michael Fox)

The renewal strategy session is the conversion engine of the whole book and
the single least automatable thing Fox Mortgage does. This skill does not run
the call. It puts Mike on the phone already knowing the client's own math,
gives him a shape to run inside, and captures what happened so the system
stays true afterward.

Mike is **Michael Fox, Mortgage Agent Level 2, BRX Mortgage**. Never "broker"
when describing him.

The session is 45 minutes, phone first, Mike calls the client. It is booked
by the renewal drip at `/book/mike/strategy-session`.

## What this skill covers, and what it does not

Covers three modes:

1. **Playbook.** The standing shape of the conversation. Read
   `references/playbook.md`. This does not change per client.
2. **Brief.** A one page pre-call brief built from the client's own record.
   Read `references/brief.md`.
3. **Capture.** The post-call write up, a proposed terminal status, and the
   monitoring flag. Read `references/capture.md`.

Does not cover:

- **The client follow up email.** That is a comms engine touch and it lands
  at Q5, behind the CASL copy pass on the existing sixteen templates and the
  regenerated token dictionary. Writing one here would mint a seventeenth
  template outside the gate. `references/capture.md` names the slot and
  specifies what the email must carry. It does not draft a body.
- **The signing path.** Once a client is switching, the signing package is a
  separate skill. Hand off, do not duplicate.
- **The thirteen month play.** That is an upstream campaign, not this call,
  and it needs a lender registry fact that does not exist yet.

## Voice and copy rules

Anything client facing that comes out of this skill:

- No em dashes, no en dashes, no semicolons, no exclamation points
- Contractions preferred, Grade 6 reading level
- Short paragraphs, light bullets, concrete numbers from the client's own file
- "Mortgage Agent Level 2", never "broker", when describing Mike

The brief and the write up are internal, so they can read as normal
professional prose. The copy gate on dashes, semicolons, exclamation points,
and the title still applies to them.

## The one rule that overrides everything: the number must match

Every touch in the renewal drip carries a computed number, because no contact
goes out to the book without one. The client who books a strategy session is
holding a specific dollar figure that the drip put in front of them.

**The brief must carry that exact figure forward.** If the drip said $412 a
month and the call opens at "around four hundred," the client hears a
different number than the one that made them book, and the trust the drip
built is spent in the first minute.

Every figure in the brief traces to a source Mike can name: the Zoho deal,
the drip log, the SMM record, or something Mike told you. If a figure is not
in a source, it does not go in the brief. Name the gap instead of filling it.
Never infer a rate, a balance, a maturity date, or a property value.

## The gates that bind this call

- **JG-2 No documents, no advance.** The moment the client is switching, the
  application and documents come before anything advances.
- **JG-4 No contact without a computed number.** Already satisfied by the
  drip touch that booked the call. The number is the opening.
- **JG-5 No send without approval.** Declines never automate. Nothing this
  skill produces reaches a client without Mike approving it. Autonomy is at
  Level 0, per message approval.
- **JG-6 No switch without value.** If the incumbent's offer wins, say so.
  Coach the client to take it. The honest no is the referral engine.

JG-1, no application no call, is the one gate that needs a reading. See
"Open readings" below.

## Workflow

### Step 0. Establish which mode

If Mike names a client and the call has not happened, build the brief.
If he asks how to run the call or how to handle a branch, use the playbook.
If the call has happened, run capture.
If he is unclear, ask once and then proceed.

### Step 1. Pull the record

For a brief, gather from Zoho: the deal, the current lender, rate, balance,
maturity date, payment, remaining amortization, `Renewal_Status`, the
sequence stage, and whether the client is enrolled in Strategic Mortgage
Monitoring. Then find the drip touch that booked this session and the number
it carried.

Do not proceed on a half record silently. If the maturity date or the
balance is missing, say so at the top of the brief. Mike would rather see a
short brief with two named gaps than a long one with two invented numbers.

### Step 2. Build the brief

Follow `references/brief.md`. One page. It ends with the three branch
prompts, so Mike is never mid call trying to remember what the stay path
sounds like.

### Step 3. The call

`references/playbook.md` holds the shape. Honest triage first. Education
frame. Five things beside rate. Then whichever branch the client's own
position points at.

### Step 4. Capture

Follow `references/capture.md`. Produce the write up, propose one terminal
`Renewal_Status` with the reason, and flag monitoring enrollment if JG-6
fired.

**Propose, never write.** The status change goes to Mike as a proposal with
one approve. This is the manual pass. It stays a manual pass until a family
graduates on evidence, and this family has not.

## Why capture matters more than it looks

The north star benchmark is renewal retention rate, and it currently reads
unmeasured. The measurement plumbing is queued. Plumbing measures nothing if
the outcome was never captured, and the renewal call is the exact moment the
terminal status is decided. A call that converts beautifully and never gets
written back is invisible to the benchmark that the whole lane exists to move.

The terminal status is also the drip's removal mechanism. A client who
renewed and never got their status set stays enrolled and keeps receiving
touches, which is the failure the per message gate caught three times during
the rehearsal set.

## Open readings, flagged for Mike's verdict

Two things this skill decides that JOURNEY.md does not settle. Both are
marked so they can be overruled rather than inherited silently.

**1. JG-1 and the renewal call.** JG-1 says no application, no call, and
booking follows submission. The renewal drip books strategy sessions without
an application, which looks like a conflict. The reading used here: JG-1
governs new intake, where the discovery call is the first contact with a
stranger. A renewing client is an existing monitored relationship, and the
strategy session is the call that decides whether an application is warranted
at all. JG-2 then binds immediately, so the moment the answer is "switch,"
application and documents come before any advance. That is what the
`Ready To Renew - Sent New Application` status exists to record. If Mike
reads JG-1 as binding on renewals too, this skill needs rewriting around a
pre call application step.

**2. The five things beside rate.** Section 4 names the frame, moving the
client from unconsciously to consciously incompetent on five things beside
rate, but it does not enumerate the five. The set in
`references/playbook.md` is composed, not quoted. Mike should confirm,
replace, or reorder it. Once he does, it stops being an open reading and
becomes a decision log entry.
