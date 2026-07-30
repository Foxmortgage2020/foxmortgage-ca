# A-04: The agent queue as operating system
source: A_Practical_AI_Agent_Workflow_For_Companies_In_2027__Guide__mp3.txt
context: Creator sells Maker School, a paid 90 day automation course with a first-client guarantee. Canadian, per a Rogers account and a US residency task. Figures self-reported.

## Big idea
Put agents in the shared task queue, not the chat box, gated by written evals and human review.

## Patterns
- QUEUE AS AGENT INTERFACE: plain-words task → status change fires a webhook → agent reads knowledge base and workspace context → result posts to the card. The trail outlives the prompt.
- LOW-FRICTION CAPTURE: any thought → hotkey, phone button, voice → one queue. Used because adding costs nothing.
- GATE AT THE IRREVERSIBLE STEP: agent works → sets Waiting before publishing or touching the outside world → human approves → resumes.
- SELF-SCORING EVAL LOOP: output → scored on a written checklist, five items zero to two, under seven fails → retry until inside guardrails. The rubric is explicit.
- RENDER ACCEPTANCE CHECK: image → clean text, style, legibility, dimensions → pass or regenerate. Garbled renders never reach a human.
- FAN OUT, BATCH REVIEW: many tasks at once → async runs → review a few times daily. Ends context switching.

## Human-in-the-loop
- Scoping the brief, the guardrails, the Waiting approval, picking winners.
- Stated reason: "You can't just trust an AI agent to do everything." Verification is the bottleneck.

## Stack mentioned
Linear, webhooks, Fable, GPT, a credentials store, phone shortcuts. Fox equivalents: the approvals desk as the queue, n8n for dispatch, Claude Code skills as the runner, CLAUDE.md and the lender knowledge base for context, the portal PWA for capture. Nothing new needed.

## Claims
- On track for over $400,000 this month [self-reported, the video markets his course].
- Over 10,000 people finished Maker School [self-reported, course marketing].
- Rebuilding it costs at most 25 to 50% of a session limit [self-reported].

## Failure modes
- Output is uneven. Of five generated video ideas he liked one.
- Evals burn tokens on every retry, so he tracks a token budget.
- He calls the manual tagging flow "a very slow, naive way".

## Compliance flags
- Stored passwords for agent browser sign-in are a terms and security exposure.
- Client PII would flow into the agent runner via workspace context and CRM tasks.
- FSRA: the gate must cover presenting options or committing a client, not only publishing.

## Fox fit
Not cold-only. It points at the warm book unchanged. Strongest at RENEW, DOCS and POST-FUND: renewal drafts and document chases scored against a rubric, held until Mike approves the send.
