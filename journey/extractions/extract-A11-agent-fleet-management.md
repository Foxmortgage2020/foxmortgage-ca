# A-11: Managing agent fleets, cloud fan-out and grading loops
source: Most_Valuable_Skill_of_2026__Managing_AI_Agents_mp3.txt
context: Guest Ryan Carson, a US founder in Connecticut, not Canadian, selling an AI agent to divorce firms. The episode markets that startup and his X following.

## Big idea
The scarce skill is managing parallel agents, so build the review machinery before the volume.

## Patterns
- PARALLEL FAN-OUT: task list → one isolated cloud environment per task → separate branches → human reviews each thread. Isolation removes the overhead that caps parallel count.
- ATTENTION TRIAGE: many live threads → pin the few that matter today → check every 25 minutes → decide.
- SCHEDULED JOURNEY TEST: timer → agent walks the real signup flow in a browser → annotated recording → failure spawns a child fix session → alert into chat.
- DAILY ROLL-UP: yesterday's production events → agent summary on an admin page → human skims each morning. Deep links to the real record make oddities visible.
- RUBRIC-GRADED LOOP: conversation logs → daily grade against a stated rubric → below threshold spawns a fix → human ships it. Surfaces paper cuts nobody would file.
- PARENT-CHILD ROUTING: one premium planner thread → cheap fine-tuned child sessions → same work, lower spend.

## Human-in-the-loop
- He claims agents will write, review, and ship all code, yet he approves merges and makes 10 to 20 high stakes calls daily.
- Prod write keys stay in a vault, agents ask per session.
- He still walks the app himself, and admits agents fail quietly and self-fix, so alerting is hand built.

## Stack mentioned
Devin, Codex, Claude Code, Cursor, a cheap fine-tuned coding model, Slack over MCP, 1Password. Fox equivalents: Claude Code skills, n8n timers, Supabase and the Next.js admin, Zoho as record.

## Claims
All [self-reported, promoting his startup and his X reputation]: 22 to 25 PRs a day and mostly merged, sometimes 40, roughly half his work from a phone, a 50x output jump after product-market fit, probably $20k in tokens last month.

## Failure modes
- Token spend "just too much" at $20k a month, he expects about $5k per engineer.
- Heavy new UI still starts locally.
- Models still "lack this sense of obvious intelligence".

## Compliance flags
Real client records flow into third-party tools for the summary. At Fox that roll-up stays inside Zoho, Supabase, and the portal. Withholding prod write keys is the control worth copying. Presenting stays with Mike.

## Fox fit
Internal ops, not cold outbound, so nothing to park. The roll-up maps to the Today desk for POST-FUND and RENEW, each line linking to its deal room. The rubric loop can grade client comms drafts.
