# A-02: Stop building agents, build skills
source: STOP_Building_AI_Agents__Do_THIS_Instead__mp3.txt
context: Creator sells an AI-agency community, video promotes a free GitHub repo and the paid community. Framing borrowed from Anthropic's skills release.

## Big idea
One general agent loading modular domain playbooks beats a separate agent per use case.

## Patterns
- SKILLS OVER AGENTS: general agent + folder of domain playbooks → expertise loaded on demand → expert-level output without per-use-case agents. Intelligence is not expertise, the playbook supplies the expertise.
- SOP-AS-FILE: written playbook (steps, tone, structure, watch-outs) → markdown file in a folder → agent behaves like a trained employee. Five minutes to create the simple version, can grow scripts and templates.
- PROGRESSIVE DISCLOSURE: many skills installed → agent sees only titles until a task matches → loads full instructions for that one. Hundreds of skills without overload.
- FAN-OUT AUDIT: one skill → five parallel sub-agent specialists → merged scored report with a prioritized action plan. His demo is a website audit sold as a client deliverable.
- MCP AS HANDS, SKILLS AS EXPERTISE: connections fetch the world, skills decide what to do with what's fetched.

## Human-in-the-loop
Implicit only. Human triggers the run and reviews the report. No approval gates described.

## Stack mentioned
Claude Code, skills folders, MCP servers. Fox equivalent: this is Mike's existing architecture, lender-notes, signing-package, and opl-scouting skills are already live examples.

## Claims
No numbers. Charge clients for the report [aspirational, selling community].

## Failure modes
Agent-per-use-case sprawl named as the anti-pattern that doesn't scale.

## Compliance flags
None inherent. The FSRA boundary is unaffected, a skill can prepare a presentation, only Mike presents.

## Fox fit
Validates the architecture Mike already runs and the Track C discovery skill directly. Journey translation: each journey stage gets a skill, intake call prep, renewal conversation, compliance package, loaded by one agent rather than a separate agent per stage. The fan-out pattern fits the back-sweep and file-audit jobs, parallel checkers producing one approval report.
