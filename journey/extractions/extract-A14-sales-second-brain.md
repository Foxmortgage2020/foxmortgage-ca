# A-14: Sales second brain feeding skills and a dashboard
source: This_Claude_Second_Brain_Setup_Will_Change_How_You_Do_Sales__mp3.txt
context: Creator sells a paid AI accelerator, a 10-skill Sales OS plugin, and a setup service. Nationality not stated. On-screen metrics are admitted fakes.

## Big idea
Reliable automation needs a durable, daily-refreshed intelligence store between the raw software and the AI doing the work.

## Patterns
- DURABLE CONTEXT STORE: software data → daily AI filter keeps what matters → text files per call, deal, campaign → no gate. Context compounds.
- ROUTING MAP: folder tree → a map file at root and per subfolder → AI reads it first to locate context.
- PERMANENT BUSINESS DOCS: interview → ICP, offer, positioning, tone files → read by every output. Named the highest-impact first step.
- NIGHTLY RECONCILE: 24 hours of calendar, email and transcripts → prep calls, add deals, hygiene pass, log the work → no gate.
- SYSTEM-OF-RECORD SYNC: proposal tool and CRM → clean fields, freeze won and lost, flag cold deals, snapshot metrics → no gate.
- EVENT-TRIGGERED PREP: meeting booked → brief. Meeting ended → follow-up draft and proposal → the draft is the gate.

## Human-in-the-loop
Claims near-full automation, reps "barely in the CRM anymore". Human work is the setup interview and the calls. Missing: nothing reviews what the filter promoted, and CRM edits and deal freezes need no approval.

## Stack mentioned
Attio → Zoho CRM. Fireflies, Aircall → existing n8n call pipeline. PandaDoc, Google Workspace, Slack → none needed. Obsidian file store → Supabase workbench and FOXCA. Claude skills and routines → Claude Code skills and n8n schedules. Vercel dashboard → Next.js portal. Apify, Apollo, Sales Navigator → none needed.

## Claims
- Reps barely in the CRM, dashboard "eliminated entirely the need" [self-reported, sells plugin and service].
- A few docs grew to hundreds in months [self-reported, same incentive].
- Full setup in a couple of hours [self-reported, sells the setup skill].
- Demo dashboard metrics are admitted fabrications.

## Failure modes
Scheduled tasks run only while the desktop app is open. Cloud routines survive that but are harder. Setup still takes hours. The store is thin on day one.

## Compliance flags
Scraping LinkedIn breaches platform terms. Client transcripts and lead PII flow into third-party transcription and hosting tools. Cold outreach is CASL. A generated proposal carrying figures is presenting, which stays with Mike under FSRA.

## Fox fit
Not cold-only. Store, routing map, nightly reconcile and rebuilt surface exist at Fox as the workbench, CLAUDE.md, desk loaders and Today. Worth adding: per-deal memory feeding call prep at LEAD and INTAKE, the sync pattern at POST-FUND, campaign metrics at RENEW.
