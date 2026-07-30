# A-07: Voice agent qualifies and books, built with Claude Code
source: How_I_Built_an_AI_Sales_Agent_with_Claude_Code___ElevenLabs__mp3.txt
context: Mike of Dynaflow, an AI automation consultancy, not Canadian, based in Asia on ICT time. The video sells a free AI audit and build work.

## Big idea
A voice agent can run qualify-and-book end to end, with the coding agent as builder, not runtime.

## Patterns
- VOICE QUALIFIER: contact record -> scripted call opening broad then narrowing to one bottleneck -> structured answers -> no gate. It asks what eats time before naming a service.
- AVAILABILITY READ: agent request -> calendar API scoped to one event type -> three spoken slots -> person picks. Read-only access, small blast radius.
- BOOKING WRITE-BACK: slot, name, email, timezone -> webhook -> workflow -> calendar write and confirmation email. The agent never writes the calendar.
- DOCS-TO-CONNECTOR: vendor API docs pasted into the coding agent -> generated integration and the call prompt. He states he wrote neither.
- BRAIN PER FUNCTION: rules, skills and notes foldered per business area, dictated by voice -> separate agent contexts. Stops one repo becoming everything.

## Human-in-the-loop
- None claimed. "Zero human involvement, all AI." Missing: no review of what the agent said, no check on the captured email, no disqualification threshold, no AI disclosure.

## Stack mentioned
ElevenLabs voice, Claude Sonnet as call model, n8n, Cal.com, Google Calendar, Claude Code in Cursor, MCP, Whisper Flow dictation. Fox equivalents: n8n, Zoho Bookings, Claude Code skills, a gated portal route for the write-back. Voice: none needed.

## Claims
- "cut 80% of your sales admin" [self-reported, selling audits and build work].
- Consulted over 100 businesses on AI [self-reported, same incentive].
- One unattended call booked a real meeting on his calendar [self-reported, same].

## Failure modes
- Email capture over voice is unreliable. He suggests SMS instead.
- Timezone must pass explicitly or the booking lands wrong.
- MCP setup is required before the coding agent reaches the voice platform.
- His stated number one failure: skipping the process audit, jumping to tools.

## Compliance flags
- Outbound calls raise CASL and telemarketing consent. An undisclosed AI caller and call recording add Ontario exposure.
- A voice agent discussing a mortgage strays into licensed advice. FSRA keeps presenting and committing with Mike. An agent may connect, discover, transition.
- Name, email, and whatever a borrower volunteers reach the voice vendor and the call model.

## Fox fit
Booking and availability transfer, fitting RENEW and POST-FUND on the warm book where consent exists: a call confirming interest in a renewal talk, dropped into Mike's booking link. Unattended qualification of strangers is cold-only, park it. The safe version books, never advises.
