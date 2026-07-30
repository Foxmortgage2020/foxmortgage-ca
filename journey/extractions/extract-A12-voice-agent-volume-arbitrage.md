# A-12: Voice AI cold-calls 800 watch dealers to lowball
source: My_Voice_AI_Agent_Negotiated_800__Business_Deals_in_1_Day__F_mp3.txt
context: Greg (host, sells the Startup Empire paid membership) interviews Tony, a Startup Empire automation builder promoting his YouTube channel. Neither is stated as Canadian. Every result self-reported.

## Big idea
A voice agent placed at volume is a data-gathering machine, not a closer, and the money is in the arbitrage the harvested prices reveal.

## Patterns
- SINGLE-JOB AGENT: one persona plus one objective (find a watch, gather condition, then lowball) → scripted call → transcript. Narrow scope keeps a voice agent coherent.
- TRANSCRIPT-TO-STRUCTURED-ROW: transcript → tool call classifies engagement, offer number, accepted or counter → spreadsheet row → human reads only rows with an offer. Volume is useless until the outcome becomes fields.
- LIVE CONTEXT INJECTION: mid-call tool reads the running spreadsheet → best known price feeds the negotiation. Each call sharpens the next.
- SIMULATION-DRIVEN PROMPT REPAIR: watch real humans negotiate → replay against the agent → patch the specific misbehaviour.
- READING-LEVEL TUNING: rewrite the prompt to sixth-grade English → longer calls, more human-sounding.
- INBOUND BRAIN DUMP: caller speaks freely to a number → summarized into a Slack channel. Removes the form nobody fills in.

## Human-in-the-loop
Effectively none during calls. The human enters after the fact, reading offer rows. Nobody hears a call before it happens, and every outcome classification is itself unverified model output.

## Stack mentioned
VAPI, Twilio (numbers, SHAKEN/STIR), Cartesia, Gemini 2.0 Flash and DeepSeek, Airtable, Lindy. Fox equivalents: none needed for the voice layer. Claude for the transcript classifier, Supabase for the row store, n8n for the post-call write, Next.js portal for review.

## Claims
- Over 800 calls placed, one day of dealing [self-reported, sells a paid membership].
- A $19,000 buy resell around $22,000 for roughly three grand [self-reported, same incentive].
- Sixth-grade English gave "way longer call durations" [self-reported].

## Failure modes
- At least 300 calls went straight to voicemail before SHAKEN/STIR registration.
- DeepSeek API saturation stopped the bot responding mid-call.
- Early prompts dumped every question in the first turn, obviously AI.
- Temperature near zero makes uncommon questions get wrong answers.

## Compliance flags
Unattended outbound calls at volume. CRTC rules and the National DNCL apply, CASL covers any follow-up, there is no AI disclosure, and every call is recorded without stated consent. PII flows into four vendors. FSRA: an unsupervised agent quoting numbers is presenting, which stays with Mike.

## Fox fit
The outbound negotiation half is cold-only, park it. Transcript-to-structured-row and inbound brain dump transfer: run POST-FUND and RENEW check-ins through a consented call, classify the transcript into fields, and queue anything actionable in the Radar.
