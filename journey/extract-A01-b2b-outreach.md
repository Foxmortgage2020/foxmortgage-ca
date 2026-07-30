# A-01: Claude Code for B2B outreach, 35% reply claim
source: How_I_Use_Claude_Code_For_B2B_Outreach__35__Reply_Rate__mp3.txt
context: Creator sells LinkedIn-growth marketing services and a paid community. The video is content marketing for both. Every result is self-reported.

## Big idea
Cold outreach converts when the first message contains a finished, personalized piece of value instead of a pitch.

## Patterns
- LIST ACQUISITION: saved search → scraped export → CSV in the project. What makes it work: the list arrives with rich per-person fields to score against.
- LEAD SCORING: full list → score 1-10 against custom criteria (company size, presence, location, buying power) → hard-disqualify below threshold → human calibrates the rubric until scores match judgment. 143 of 600 cut. Attention only goes to leads that can convert.
- VALUE-FIRST ARTIFACT: examples of good output → per-person finished deliverable (redesigned banner, profile) → given away free as the opener. The gift proves capability before any ask.
- REVIEW DASHBOARD: scored list → generated HTML admin page → browse, filter, approve. The approval view is itself generated, not bought.
- 95/5 RULE: deliberately not fully automated. The last 5%, sending and judgment, stays manual.

## Human-in-the-loop
Rubric calibration and the final send. Stated reason: attention is the scarce resource, don't spend it on leads that will never convert.

## Stack mentioned
Sales Navigator, Apify scrapers, Claude Code, Cowork, image-gen API. Fox equivalents: Zoho COQL for the list, Claude scoring against Opportunities-engine criteria, native render engine for the artifact, Radar approval queue for the dashboard, n8n for the send. No scraping needed anywhere, the warm book is first-party data.

## Claims
35% reply rate [self-reported, selling services and community]. 600 connections scraped [self-reported].

## Failure modes
Scoring took iteration before scores matched his judgment. Rubric quality is the whole game.

## Compliance flags
LinkedIn scraping with session cookies breaches platform terms. Adapted to email, this is CASL territory with strangers. Third parties' PII flows through scrapers and image APIs. None of this applies when the machinery points at Mike's own book with existing consent.

## Fox fit
Strongest fit is RENEW and LEAD on the warm book: score the Strategic Mortgage Monitoring base monthly against opportunity criteria, generate a personalized renewal or equity one-pager per client from their own file, queue it in the Radar for approval, send in Mike's voice. Same three primitives, zero scraping, warmer audience.
