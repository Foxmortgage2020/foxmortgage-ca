# Schema A: mortgage-process transcripts (v1)

Purpose: turn one transcript into one comparable extraction file. The synthesis step reads only these files, never the transcripts. Comparability beats completeness. Skip generic advice ("work hard", "be consistent") entirely.

Output: one file per transcript, named `extract-M##-short-slug.md`, 450 words maximum, using exactly these headers in this order.

## Header block
Title line, source filename, and 1-2 lines of speaker context: who they are, market, annual volume, team size. This context is how the reduce step weights claims.

## Big idea
One sentence. What this episode exists to say.

## Journey practices
One bullet per concrete practice actually described in the transcript. Each bullet starts with a spine tag so practices line up across all 20 files:

LEAD, INTAKE, DOCS, PLAN, SUBMIT, COMMIT-TO-FUND, SIGN, POST-FUND, RENEW, REFER, MODEL

(MODEL is for team-structure content that spans the whole journey.)

Each bullet: what happens, what triggers it, who executes (broker, staff, or tool), timing or cadence, artifact produced. Only what the transcript states. No invented detail.

## Gates
Rules about what must be true before a file advances. Format: "No X, no Y." Gates are not stages. A gate decides, a stage describes. If the speaker enforces something before allowing progress, it goes here even if they never use the word rule.

## Numbers
Every number stated, with what it measures and a tag: [stated] if said outright, [implied] if derived. Keep qualifiers. "40% of contacts made" is not "40% of the book."

## Delegation map
What the principal personally touches versus what staff or tools handle. Principal minutes per file if stated.

## Solo translation
2-3 sentences of extractor judgment, the only opinion allowed in the file. Can a solo agent with automation replicate this. Name which staff role each automation would replace. Flag anything that must stay human.

## Tensions
Where this transcript disagrees with other episodes or common advice. Name the opposing view. Contradictions are synthesis fuel, do not smooth them over.

## Style rules
Quotes 12 words or fewer, paraphrase anything longer. No em dashes, no semicolons, no exclamation points. Bullets over prose. If a section is empty write "None stated."
