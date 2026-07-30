# A-05: Cowork sales skills, manual run to saved skill
source: Claude_Cowork_Just_Changed_Sales_Forever_mp3.txt
context: Creator sells an AI accelerator community, and the video markets it. Nationality never stated, so not a confirmed Canadian.

## Big idea
Run a workflow manually once with Claude, correct it in flight, then save the corrected run as a skill that reruns on command or schedule.

## Patterns
- WORKFLOW TO SKILL: manual run with corrections -> markdown step file -> gate: that one pass. Fixed once, not every run.
- DORMANT RECORD MINING: dead CRM column -> research each record and its email thread -> rank against criteria -> file with comms summary -> gate: a human reads it. Old records hold relationship history.
- PARALLEL FAN OUT: long list -> batches of 15 per subagent -> merged file. One context window never carries 200 records.
- MEETING PREP BRIEF: calendar -> CRM record, email history, call transcripts, web -> brief with agenda and questions. Every source already owned.
- SCHEDULED RUN: saved skill plus fixed time -> output waiting at 7am. A habit nobody triggers.
- OUTCOME ANALYSIS: won and lost records, transcripts, email -> report on win rate, objections, differentiators, red flags. Corpus never read before.

## Human-in-the-loop
The one manual pass before a skill is saved. Outputs land as a file or Slack message a person reads, and sending stays a separate skill. Missing control: the self updating pipeline he floats has no gate.

## Stack mentioned
Cowork, Claude skills, Anthropic sales plugin, Apify, Apollo, Clay, Instantly, Unipile, Attio, Fireflies, Gmail, Slack. Fox equivalents: Zoho CRM and COQL reads, Claude Code skills, n8n schedules, native render engine, Radar approval queue.

## Claims
- 127 engagers found, 17 qualified [self-reported, sells an AI accelerator].
- 160 lost-column records researched [self-reported, same incentive].
- Win loss report "extremely insightful and pretty impressive" [self-reported, same incentive].

## Failure modes
The model qualified leads without scraping profiles until told to. Naming the exact scraper sped it. Lists of 100 to 200 need subagents requested explicitly. Stock skills read generic until customized.

## Compliance flags
Social scraping and automated LinkedIn messaging breach platform terms. Cold email is CASL territory. Third party PII, email bodies, and transcripts flow into vendors. A self updating pipeline lets a machine write record state with no gate. FSRA: presenting stays with Mike.

## Fox fit
Dormant record mining fits best, aimed at lapsed renewals and stale Zoho files instead of a lost column, serving RENEW and LEAD. Scheduled run plus prep brief already lives on Today and Ask Fox prep. Outcome analysis suits POST-FUND and REFER once transcripts accumulate. Scraping is cold-only, park it.
