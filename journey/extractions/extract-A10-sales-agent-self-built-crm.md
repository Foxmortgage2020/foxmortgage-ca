# A-10: One sales agent over a self-built CRM
source: I_Built_An_Entire_AI_Sales_Team_With_Claude_Code_In_16_Minut_mp3.txt
context: Agency owner promoting his AI-native agency and a free repo. Manifest says sales team. Correction: one agent, six skills, one local HTML CRM. Nationality never stated.

## Big idea
A client record capturing every touch in structured form makes the next conversation a prepared one.

## Patterns
- OWNED RECORD STORE: agent writes structured client files, a generated HTML dashboard reads them, human reloads to view. The schema is his, not a vendor's.
- TRANSCRIPT TO RECORD: pasted transcript, extract pain points, objections, buying signals, scores, write to the record, human approves the save. Parsing was the only missing piece.
- CHANNEL MERGE: WhatsApp, email, website, socials, one per-client context so nothing is lost between touches.
- TIMELINE AS MEMORY: each interaction, a dated entry with a one-line headline, future drafts cite it.
- PREP ARTIFACT: stage plus record, word-by-word script and question set, human reads it live on the call.
- STAGE ADVANCE ON EVIDENCE: new transcript, discovery to qualified to pitched, agent offers the next artifact.

## Human-in-the-loop
Human pastes every transcript, fills fields the agent cannot infer, approves each write, reads the script on the call, sends every email himself. No automated send anywhere. Missing control: the scores and deal probability are model output, never calibrated against outcomes.

## Stack mentioned
Claude Code, Claude skills, GitHub repo, local index.html CRM, Fathom, Calendly, WhatsApp. Fox equivalents: Zoho is the record store, Claude skills for extraction, the admin portal for the dashboard, native render engine for decks. No new tools needed.

## Claims
Three months converting the agency to AI native [self-reported, promoting agency and repo]. Used on a few real clients [self-reported]. One call scored engagement 8 of 10, deal probability 55%, later 50% [self-reported, model-generated, unverified].

## Failure modes
Generated deck files would not open until a second pass fixed them. The dashboard needs a manual reload. The agent had to ask for details it could not infer. Value decays without the human "updating it day by day."

## Compliance flags
Transcripts and client PII sit in files and a shareable dashboard with no access control mentioned. Recording calls needs consent. Scripted closing and generated decks are presenting and committing, which stays with Mike under FSRA. Cold follow-up email is CASL territory.

## Fox fit
Transfers, not cold-only. Strongest at INTAKE, PLAN and RENEW: parse the call, write the structured record, keep a dated timeline in the deal room, prep the next conversation from the client's own file. Ask Fox already covers prep and review, so the gap is the timeline entry.
