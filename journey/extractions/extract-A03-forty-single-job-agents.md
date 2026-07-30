# A-03: Forty single-job agents, one hands-on operator
source: AI_is_way_Underhyped__He_Runs_His_Entire_Marketing_Team_with_mp3.txt
context: Jacob Bank, CEO of Relay App, an agent-building platform. San Francisco, not Canadian. The video markets Relay App and his LinkedIn following.

## Big idea
Build many narrow single-job agents and stay the hands-on operator who coaches them, rather than one agent that does everything.

## Patterns
- ONE AGENT ONE JOB: task inventory → one agent per job → an orchestrator above them → build one at a time. Narrow scope stays debuggable.
- COACHING LOOP: own work output (call transcripts) → scored against a technique rubric → feedback per call or weekly → human acts. His own output is the training data.
- SOURCE FAN-OUT: one artifact published → derived channel pieces → human publishes. The trigger is publication, not a schedule.
- MARKET WATCH: hand-picked sources → scheduled change detection → notify. Cheap because the list stays small.
- POST-MEETING ARTIFACT: transcript → summary with named next steps → delivered where the person actually reads.
- AGENT RETIREMENT: run about ten times → judge output against real use → repurpose, pause, or kill.

## Human-in-the-loop
Two thirds of his day stays IC work, one third coordinating agents. Stated reason: you must be senior enough to see what good looks like to coach it.

## Stack mentioned
Relay App, LinkedIn, YouTube, meeting transcripts. Fox equivalents: n8n for triggers, Claude skills per narrow agent, Ask Fox call review for coaching, Zoho for the record, native render engine for artifacts.

## Claims
- 40 agents run by one marketing person [self-reported, sells an agent platform].
- One post at 1.5 million impressions after a year of no results [self-reported].
- Nine-person team that would otherwise need 15 people [self-reported].
- $500 a month AI bill against four contractors at $12,500 a month each [self-reported, the cost gap is the pitch].

## Failure modes
- One agent doing 25 things never worked.
- Nothing is set and forget, agents need constant modification.
- The follow-up Google Doc was the wrong format, caught after ten runs.
- SEO agents paused once that channel proved low value.

## Compliance flags
Transcript ingestion puts client PII into a third-party tool, and recording needs consent. Content published in Mike's name is FSRA territory the moment it names a rate, so publishing stays a human gate.

## Fox fit
Strongest fit is the coaching loop over Michael's own call transcripts, which Ask Fox half implements, and the post-meeting artifact at INTAKE and PLAN, where a discovery call becomes a summary the client reads. One agent one job is the build discipline for the warm-book spine. Fan-out serves REFER and RENEW. Nothing is cold-only.
