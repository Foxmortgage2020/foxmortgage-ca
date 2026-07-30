# Post call capture

Runs after the call. Produces three things and proposes a fourth. Writes
nothing to Zoho without one approve from Mike.

## 1. The write up

Two to four sentences, in Mike's voice, internal. What the client's position
turned out to be, what was decided, and why. It goes on the deal so that the
next person reading the file, including Mike in eleven months, knows what
happened without listening to anything.

Facts only. If Mike said the client sounded hesitant, that is a fact he
reported and it can go in. Do not manufacture sentiment from a summary.

## 2. The proposed terminal status

One value from the verified `Renewal_Status` picklist. Propose exactly one,
with the reason in a clause, and wait.

| Call outcome | Proposed value |
|---|---|
| Switching, application going out | `Ready To Renew - Sent New Application` |
| Staying, and Mike arranged it with the existing lender | `Renewed With Us` |
| Renewed direct with the incumbent, Mike had no hand in it | `Renewed Elsewhere` |
| Sold, paid out, discharged, no financing needed | `No Longer Needs Mortgage` |
| Reached, but no decision yet, another touch is due | leave the status alone |

The `Renewed With Us` versus `Renewed Elsewhere` line is the one that gets
mis set, because both often mean the client kept the same lender. The test is
not which lender. The test is whether Mike arranged it. If he did, it is a
retention win and it belongs in the north star. The precedent is the Woods
file, set to `Renewed With Us` after Mike arranged the renewal with the
existing lender.

Two consent levers sit beside the status and are never set as a side effect
of a call outcome. `Renewal_Opted_Out` and `Email_Opt_Out` get set only when
the client actually asked to stop hearing from Fox Mortgage. A client who
renewed elsewhere has not opted out of anything.

**Setting a terminal value removes the client from the drip.** That is the
removal mechanism, so getting it right is what stops a renewed client from
receiving a T-30 touch three weeks later.

## 3. The monitoring flag

If branch B fired, the incumbent won and the close was the monitoring load.
Flag the client for Strategic Mortgage Monitoring enrollment and note whether
consent is already on file or needs capturing.

Always "Strategic Mortgage Monitoring", never a vendor name.

This flag is the whole economic point of the honest no. A branch B call that
converts nothing and enrolls nobody has produced a lost client. A branch B
call that enrolls a monitored seat has produced an asset that compounds.

## 4. The follow up email, slot only

**Do not draft a body here.** The client facing renewal follow up is a comms
engine touch and it belongs to the queue item that lights those families
behind the CASL copy pass. Sixteen template bodies currently lack opt out
copy, and the token dictionary is being regenerated in that same pass. A
seventeenth template written here would sit outside both.

What the slot must carry when it is written, so the spec is ready:

- The decision, in the client's own words back to them
- The number, matching what was said on the call, which matches the drip
- What happens next and by when, with one clear action if any
- The CASL opt out block that the copy pass defines
- Mike's signature block, name, then brokerage, then phone, then email
- Grade 6, no em dash, no semicolon, no exclamation point

Until that pass lands, hand Mike the decision and the number and let him send
in his own words if the call needs a same day follow up.

## What gets handed off, not done here

If branch A fired and a commitment arrives later, the signing package skill
takes it from there. Do not begin assembling disclosure answers in this skill.
The two workflows stay separate.

## The approve ritual

Present the write up, the proposed status with its reason, and the monitoring
flag together. One message, one approve. If Mike changes the status, apply his
value and do not argue the original.

Autonomy for this family is Level 0, per message approval, and it stays there.
Graduation requires 25 consecutive approved actions with zero edits and zero
gate hits, and any edit resets the counter. Do not propose batching. Mike has
said he wants to feel the cadence at per message approval before anything
graduates.
