# Schema B: AI-automation transcripts (v1)

Purpose: pull the pattern, not the build. Most of these videos describe outbound prospecting stacks aimed at strangers. Fox Mortgage's money is in a warm book. The extraction's job is to abstract each build into reusable primitives that can be pointed at the warm book, and to flag what does not transfer.

Output: one file per transcript, named `extract-A##-short-slug.md`, 450 words maximum, exactly these headers in this order.

## Header block
Title line, source filename, and 1-2 lines of video context including what the creator sells or promotes. Almost every one of these is content marketing for a course, community, or service. Name the incentive.

## Big idea
One sentence.

## Patterns
Each automation abstracted from its implementation. Grammar per bullet:

PATTERN NAME: input → transform → output → human gate (if any). One line on what makes it work.

The vendor stack is never the pattern. "Scrape Sales Navigator with Apify" is a build. "Acquire a list, score it against custom criteria, hard-disqualify below threshold" is a pattern.

## Human-in-the-loop
Where a human stays in the flow and the stated reason. If the video claims full automation, say so and note what quality control is missing.

## Stack mentioned
Tools named, for reference only, each mapped to the nearest Fox equivalent: Zoho CRM, n8n, Supabase, Next.js portal, Claude or Claude Code skills, native render engine, or "none needed." Mike's stack is fixed. New tools need an exceptional reason.

## Claims
Every result claimed, tagged [self-reported], with the seller's incentive restated in brackets. No claim from these videos is verified.

## Failure modes
What the creator admits breaks, needs iteration, or was harder than expected. These admissions are often the most useful content in the video.

## Compliance flags
Anything that touches: licensed-advice territory (FSRA: presenting and committing stay with Mike, agents may connect, discover, transition), CASL consent for commercial electronic messages, platform terms of service (scraping, session cookies), PII flowing into third-party tools. Write "None inherent" if clean.

## Fox fit
2-3 sentences. Which journey spine stages (LEAD, INTAKE, DOCS, PLAN, SUBMIT, COMMIT-TO-FUND, SIGN, POST-FUND, RENEW, REFER) this pattern could serve, warm book first. If the pattern only makes sense for cold outreach at volume, say "cold-only, park it."

## Style rules
Quotes 12 words or fewer. No em dashes, no semicolons, no exclamation points. Bullets over prose. Empty section: "None stated."
