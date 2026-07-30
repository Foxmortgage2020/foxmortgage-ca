# Wide extraction run: 30 transcript extractions (map phase)

You are running the map phase of a map-reduce synthesis for the Fox Mortgage client journey project. A pilot already locked the method. Your job is mechanical consistency, not creativity.

## Setup
1. Work in the directory containing the 36 transcript .txt files. reference-pack.zip sits in the same directory. Unzip it if not already unzipped. It contains schema-A-mortgage-process.md and schema-B-ai-automation.md (the extraction contracts), five worked examples (extract-M01, extract-M02, extract-M03, extract-A01, extract-A02), and corpus-manifest.md (file-to-ID assignments and statuses).
2. If any reference-pack file is missing, stop and report. Never reconstruct a schema or an example from memory.
3. Create an extractions/ subdirectory. Copy the five worked examples into it unchanged.
4. Verify the transcript inventory against the manifest. If a manifest filename is missing on disk, or an extra transcript exists, record it in the run report and continue with what matches. Do not guess mappings.

## The job
Process the 30 manifest rows marked pending, one transcript at a time, in manifest order.
1. Read the transcript in full.
2. Read the matching schema in full. Schema A for M files, Schema B for A files. Re-read it for every file. Do not work from memory of it.
3. Write extractions/extract-{ID}-{short-slug}.md following the schema exactly and matching the discipline of the five worked examples: same headers, same order, bullets over prose, 450 words maximum.
4. Confirm or correct the manifest's identity guess in the header block. M-06 and M-14 are flagged as guesses.
5. Mark the row done in corpus-manifest.md.

## Hard rules
- Extraction only. No synthesis, no recommendations, no cross-file conclusions. That is a later phase in a different session.
- Only what the transcript states. No invented detail, no outside knowledge, no web lookups.
- Quotes 12 words or fewer. Paraphrase everything longer.
- Numbers keep their qualifiers. "40% of contacts made" is not "40% of the book."
- Every claim in an A-file's Claims section is tagged [self-reported] with the seller's incentive named.
- Copy gate on every file you write: no em dash, no en dash, no semicolon, no exclamation point. "Broker" is fine for guests who are brokers, never as a description of Mike. After writing each file, mechanically check it: grep for the em dash character, the en dash character, semicolons, and exclamation points, and fix before moving on. Claude tends to produce em dashes in polished prose, so the mechanical check is mandatory.
- Do not modify the two schema files or the five worked examples.
- The duplicate file How_Chad_Wilson_Closes_300_Files_a_Year_With_a_Team_of_Three_mp3__1_.txt is skipped per the manifest.
- A-15 is roughly triple normal length. Read it fully anyway. The output stays inside the 450-word cap.
- Do not ask questions mid-run. If something cannot be resolved, state it in the run report and continue.

## Special handling
- The five Nate Atkin files (M-10, M-11, M-12, M-15, M-16) are one longitudinal arc. Extract each individually per the schema, and add one line to each Tensions section noting which arc episode it is, 1 through 5, so the reduce can reassemble the sequence.
- Sponsor segments inside ILMB episodes (Ownwell, Finmo) get extracted only if they contain a mechanic worth stealing, and always with the incentive named.

## Completion report
Write extractions/run-report.md containing:
- A table of all 35 IDs: file, status, extraction word count, any flag.
- Identity confirmations or corrections for M-06 and M-14, plus any other manifest corrections.
- A "did not fit the schema" list: any transcript where a schema section was genuinely empty or the material resisted the format, one line each on why.
- A "worth flagging for the reduce" list: at most ten bullets, one line each, of the strongest tensions or surprises across files. Observations only, no recommendations.
- Anything missing or unresolved, stated plainly.

Then zip the extractions/ directory, including run-report.md, the five examples, and the updated corpus-manifest.md, into extractions-complete.zip in the working directory. Stop there. Do not begin any synthesis.
