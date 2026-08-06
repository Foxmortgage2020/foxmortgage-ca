// Roadmap: the command center build plan and its real history, so anyone
// onboarded later can see where the platform is going and what already
// shipped. Updated every session as part of the CLAUDE.md closing ritual
// (session ledger, config/changelog.ts entry, this page). Staleness here
// is a bug.

import { requirePermission } from '@/lib/authz'

export const dynamic = 'force-dynamic'

type SessionStatus = 'shipped' | 'current' | 'next' | 'planned'

const SESSIONS: {
  n: string
  title: string
  status: SessionStatus
  repo: string
  items: string[]
}[] = [
  {
    n: 'Tokens',
    title: 'The design tokens, and the board rebuilt on them',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'ONE MODULE OWNS EVERY COLOUR AND EVERY TYPE SIZE, and that matters more than any value in it. Michael iterated on mockups for a morning and approved a design, and three builds this week drifted from prose descriptions of one, each costing a session. lib/design-tokens.ts holds the values once and tests/board-tokens.test.ts fails on any hardcoded hex on the surface, walking the directory so a file nobody has written yet is covered. It deliberately does NOT own spacing: none was specified, and a second spacing system would be the drift it exists to stop',
      'THE BOARD RESTRUCTURED RATHER THAN ONLY REPAINTING. Twenty-eight stages in one row overflowed 1512 by 588px and still needed collapse arrows, and no amount of paint fixes a row that long. Phases stack down the page, each with its stages side by side in a grid that WRAPS, empty stages fold to one line at the foot of their phase and empty phases fold to their header line. Verified live: zero horizontal scroll at 1512 and at 1280, columns an even 285px, nothing overflowing anywhere',
      'BOTH URL PARAMS RETIRED. ?collapsed= existed only to survive the too-wide row, so with the row gone it only hid work, and ?phase= went with the phase bar it drove because every phase is on the screen now. Both still answer 200 and are ignored. parseCollapsed and toggleCollapsed stay exported and tested but unused, the same way DealPreview was left',
      'THE COUNTDOWN GAINED A FIFTH READING, RULED ON BY MICHAEL. The four specified states painted 75 of 97 board cards red, 59 of them funded files whose closing correctly already happened. A passed closing is an alarm only where the file has not ended, so a terminal stage reads the date in plain grey and 16 cards stay red, which is the signal the design was drawn for. It keys on the stage category from the record layer, never a stage code, so a terminal stage added later behaves correctly with no change here',
      'TWO APPROVED VALUES ARE DELIBERATELY UNAPPLIED AND BOTH WERE RULED ON. The needs-you chip keeps the existing lime rather than the approved pale sage, because two tests on the do-not-edit list pin that chip to those exact class names and redefining the token globally would repaint six protected surfaces. The approved values sit in the token module so the switch is one edit when the lime pass reaches the rest of the Command Centre',
      'THE DEBT REGISTER IS THE HONEST PART OF THE HEX TEST. The file page keeps its current appearance until its own pass, so its components are held out by name rather than the rules being softened. The two SHARED controls are on it too, because they render on both surfaces, and the consequence is stated: the Remove control still carries weight 600 where it renders on a card, which is the board\'s one live deviation from the two-weight rule',
      'THE BOARD NO LONGER SCROLLS SIDEWAYS BUT IT IS 24,000px TALL, because the funded stage alone holds 66 cards in one column. Named rather than capped: a cap is a product decision that has not been made. Counts unchanged through the read-only role at 160 = board 97 + Archive 29 + No stage 33 + Withdrawn 1',
      'Pinned in tests/board-tokens.test.ts (26 tests). The lime audit, both projection-green zone assertions, the copy gate and the write guarantee all pass UNMODIFIED. Board route JS unchanged at 438 B. No data changed',
    ],
  },
  {
    n: 'Layout',
    title: 'The checklist layout rebuild: one line per condition',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'MICHAEL CALLED THE SHIPPED LAYOUT UNREADABLE and the cause was specific rather than aesthetic. EVERY CONDITION RENDERED TWICE: the text, then the identical string again beneath it in grey quotes as the source snippet. On BRXM-F060561 the two are byte-identical on all twelve rows, so twelve conditions filled twenty-four paragraphs and the second copy read as new information. The quote now renders inside an expanded row only, and only when it says something the text does not, after whitespace and case are normalised',
      'THE ROW IS ONE LINE: a status glyph, a short label, a due date on the right, and one line of plain words underneath stating the state. Full text, findings, CONTROLS and a quiet metadata line (condition number, owner, document kind, flags, page, open source) sit behind expansion. No control renders on a collapsed row, which is asserted by test, because twelve rows of buttons is what made the old list unreadable',
      'FOUR STATES, AND THE TWO WITH NO HOME IN THEM ARE NAMED RATHER THAN FORCED: nothing on file (hollow ring), on file (solid navy dot), problems found (lime wash and lime left border, opens on arrival), and done (grey tick, struck through). waived folds into done with its own wording, three live rows carry it, and an underwriting constraint gets its own reading held out of both header figures because an adjudication is not a document chase',
      'THE INTERIM READING IS DESIGNED TO BE DELETED. Not one condition in the book carries an analysis verdict, verified live across all 49 approved rows, so the document check does not exist yet and a present document says only that it is on file. The pass and gap branches are already written against the shape the check will store, so they light up with no portal change and the interim sentence disappears on its own',
      'NEITHER satisfied NOR waived RECORDS WHO OR WHEN ON THE ROW. The conditions table carries verified_by and verified_at and nothing else, both null on all five live decided rows, and the acting human lives on the audit log entry by design. The done line points at that record rather than inventing a name. The brief asked for who and when, the column does not exist, and that is a workbench change if it is wanted',
      'HEADER: three counts and a thin navy bar. Collected, outstanding and settled partition the list exactly once each, and needs-you is a highlighted subset (an unread document, or a failed check) carrying the only lime on the line. The figures derive from the SAME states the rows render, so a count can never contradict a glyph on the same screen',
      'THE SHORT LABEL IS THE HONEST GAP AND NOTHING GENERATES ONE. It comes from the document kind where the kind names a document (set on 11 of 49 approved rows) and otherwise from the text truncated at a word boundary. The kind "other" never becomes a label, because four of BRXM-F057400 twelve carry it and it would print the same word four times down the page. A repeated label inside one group gains its condition number: the live case is two letters of employment on F060561, reading (2) and (3)',
      'NOTHING PARSES A NAME OUT OF CONDITION TEXT. Grouping keys on borrower_id alone. Coverage is thin, so the fallback matters more than the grouping: F060561 has no borrower rows at all and F053724 has two borrowers with none of its thirty-three conditions linked, and the line on screen says which of those two situations the reader is in. It goes silent the moment one row is genuinely linked, which is F057400, rendering General 7 plus two named borrower sections',
      'NO RED IN THE STATE VOCABULARY. Overdue reads navy, load-bearing is a navy chip, and the findings block was recoloured to lime for a gap and navy for a pass. Red survives on exactly two destructive controls, Reject list and Remove, plus error text, and the test enumerates every remaining red line rather than trusting the rule',
      'THE LIME AUDIT HAD A HOLE AND IT IS CLOSED. It tested the allowlist against the whole LINE, so one permitted token licensed every token beside it and a lime left border rode through unseen. It is token-wise now, the side-specific border utilities are named, and a test proves the check is not vacuous',
      'Pinned in tests/conditions-layout.test.ts (38 tests). tests/beta-file.test.ts and tests/conditions-checklist.test.ts both passed UNMODIFIED. No condition data changed: the census is identical before and after at 206 rows. Render-proved on the dev Clerk instance against the real pages, read-only, with a TEST admin created and deleted in the same session. Beta file page route JS unchanged at 2.85 kB (first load 135 to 137), room route unchanged at 21.7 kB (first load 161 to 164)',
    ],
  },
  {
    n: 'Checklist',
    title: 'The conditions checklist redesign: broker first, one at a time',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'MICHAEL\'S VERDICT DROVE THIS: after the first real re-extraction he called the checklist poor, with two instructions — solicitor conditions are not his concern, and he works conditions one at a time. The redesign is a RENDERING job on a model that already fit: the status axis existed and satisfied was already accepted by the /decision proxy. It lost its renderer when ConditionsPanel was deleted in July, so wiring Mark satisfied is an existing verb regaining a button, not a new write path. moot stays accepted and unrendered on purpose',
      'THE SPLIT: broker conditions first in the lender\'s numeric order as the working list, the two general_verification conditions flagged unassigned ownership inside it (ambiguity defaults to visibility), and everything else in "Handled at the lawyer\'s office and elsewhere" below — quieter, collapsed per owner with counts, status pills still rendering, controls tucked behind a per-row manage toggle. The pending banner sections its rows the same way, so the set reads the way it will be worked',
      'THE KNOCK-OFF: Mark satisfied on every undecided row, armed by timestamp, LATCHED after success like the Remove control and the terms buttons. Verify and Waive gained the same latch, and the banner\'s Approve and Reject latch per document. "Accepted by the lender" has no distinct state in the model — satisfied is the closest honest verb, and recording lender acceptance as its own fact is a workbench change, reported not invented',
      'THE THREE SCREEN DEFECTS: numeric sort everywhere (cond numbers are strings, may be 7a — numeric first, ties by string, unnumbered last, applied at both render sites so the fetchers\' due-date and text orders never reach the screen), the header reads "N pending your decision" while a set awaits the gate on BOTH surfaces, and Reject list is solid destructive red at equal weight with the finality line: a succeeded attempt exists, the retry gate refuses, the road back is an amendment upload',
      'FOUND LIVE DURING THE PROOF: the failed-extraction empty state rendered under twelve pending rows on F060561, where it was false — the pending set IS the extraction succeeding. The empty state is now three-way: pending beats everything ("The working checklist fills when the pending set above is approved"), then no-commitment, then extraction-failed. Fixed in the checklist default AND the beta override',
      'THE BADGE\'S FIRST REAL FIRING: the beta Conditions tab renders an amber 12 from live pending rows — the loop handoff 53 could only argue by wiring is now proven on real data',
      'The room empty state now carries the two-variant copy Michael green-lit, via the ONE authorized test rewrite. tests/beta-file.test.ts passed UNMODIFIED. tests/conditions-checklist.test.ts pins the redesign. No condition data changed: F060561 12 pending, F053724\'s four-status mix intact, F057400 still 12 of 157. Beta file page 2.73 to 2.85 kB, room route unchanged',
    ],
  },
  {
    n: 'Body fix',
    title: 'The preview body corrected live, and the two empty states',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'THE FIRST PRODUCTION PREVIEW PRESS FAILED with 422 Unrecognized key: "reason" — the route injected a fixed literal into every gate call, off a handoff brief that specified {mode, reason} for both modes. The gate only ever took reason on APPLY, and its strict schema is deliberate protection for the identity fields, so the fix was portal-side: the dry run body is {mode} and nothing else. DRY_RUN_REASON is retired and tested against returning',
      'THE PAYLOAD IS BUILT IN EXACTLY ONE PLACE: lib/gates.ts constructs mode === apply ? {mode, reason} : {mode}, so nothing the browser sends can ride through unshaped, and the gate can only ever see the two canonical bodies. That construction is the structural answer to "is anything else sending a field the gate does not accept"',
      'THE APPLY BODY WAS ESTABLISHED EMPIRICALLY rather than re-read from a brief, which is what caused the defect: probed through Michael\'s production session at F057400\'s real commitment d1af3684, the document whose succeeded attempt the gate refuses, so the probes could not write anything. The probe transcript is in the session report',
      'TWO EMPTY STATES on the beta Conditions tab now, keyed on hasRealCommitment (the guardrail-20 computation): no commitment reads "upload the commitment below", while commitment-present-zero-conditions reads that the extraction FAILED, links the Commitment tab, and says plainly "Do not upload the commitment again" — the old single sentence sent Michael toward the re-upload that once left a file carrying 157 rows',
      'The shared ConditionsChecklist gained an optional emptyState prop and nothing else: the deal room passes nothing and keeps its original sentence, asserted by test. The room carries the same ambiguous copy and that change is Michael\'s to green-light separately',
      'THE DOUBLE AMENDMENT DROPZONE IS INTENTIONAL and stays: one renders on the Commitment tab where the document lives, one inside the checklist where its effect lands, the room\'s standing empty-state-carries-its-control rule. Ruled on rather than silently removed',
    ],
  },
  {
    n: 'Re-extract',
    title: 'The retry for a failed commitment extraction, preview first',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'WHY: BRXM-F060561 has carried an approved commitment, ten approved terms and ZERO conditions since 2026-07-31, when its extraction failed once on a region bug (since fixed) and nothing could retry it, because the extractor\'s only production caller is the upload endpoint. The gate\'s retry went live in fox-underwriting; this session built the portal half of pressing it',
      'Key commitment.reextract mirrored admin-only as a cross-repo contract, and CALLED FROM DAY ONE by the control shipped in the same session — the comment says so, because the last key mirrored ahead of its control carried "nothing calls this" and had to be rewritten',
      'The proxy lives at gates/commitment-extractions/[documentId]/retry, and the segment name is deliberate: the commitments directory already carries [dealId], and two differently named dynamic segments at one level is a Next slug conflict. The route documents this so a tidy-minded session reads why before renaming. Body is {mode, reason} only; the human comes from the verified session (guardrail 19). dry_run gets a fixed literal injected by the route, apply requires a TYPED reason, never prefilled, refused over-long',
      'THE PREVIEW IS NOT OPTIONAL. The control renders the full forecast list — text, owner, category per condition — and the apply step does not exist on screen until a dry run succeeds in that mount. Apply arms by timestamp and LATCHES after success, and a conflict latches too, the exact pattern the Remove control fixed. Proven structurally by test and live at the boundary: the failure path also keeps apply hidden',
      'THE REFUSAL IS SURFACED, NEVER PREDICTED. The portal has no read on extraction attempts, so the control renders on every real commitment document (same guardrail-20 population as the uploader, synthetics and rejected uploads excluded — F057400 renders exactly ONE control for its real document, not three) and the gate answers conflict on a succeeded attempt, which renders as a reason in plain language',
      'THE PENDING SET ALREADY HAS A HOME, verified in code rather than assumed: the gate drafts gate_status=pending, getPendingCommitmentConditions filters exactly that, buildTabBadges counts it into the amber Conditions badge, and ConditionsChecklist\'s "Approve list" banner (approvals.conditions.decide) renders on both the deal room and the beta Conditions tab. The first real apply lights the badge with no further wiring, which until now has only ever been proven by forcing the count',
      'NOTHING WAS APPLIED. The dev Clerk instance mints no gates token, so the live preview press died at the boundary with no [gates] POST line in the server log, rendering its honest 401 copy with apply still hidden. Before and after census through portal_readonly are identical: F060561 at 0 conditions and 10 approved terms, book-wide pending at 0. The first real apply is Michael\'s, from production, the way the first withdrawal was',
      'Eight tabs verified on a room file and a no-room file, six surfaces at 200, suite at 1514, tsc clean, build green. File page client JS 216 B to 2.73 kB as the control crossed the boundary',
    ],
  },
  {
    n: 'The census',
    title: 'Reconcile the book: the arithmetic, and the No stage view',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'THE WHOLE BOOK COUNTED IN ONE PASS for the first time, through portal_readonly: board 98 (underwriting 24, fulfilment 74 of which Funded is 66) + Archive 29 (lost 23, cancelled 6) + No stage 33 + Withdrawn 0 = 160, every record in exactly one bucket. Exactly ONE cause of invisibility existed: a NULL stage_code. Zero deals in inactive stages, zero orphan codes',
      'TWO PRIOR REPORTS CORRECTED BY THE COUNT. "33 archived" was never true — the Archive is 29 and the 33 was the stageless population, a different set entirely. And the no-reference records overlap the stageless records NOWHERE: all 33 stageless carry file_refs (one BRXM-F0207xx import batch), while the 38 no-ref records split 34 board / 4 archive / 0 stageless. The production "24 cards" was the underwriting phase view, which is the board default, not the whole board',
      'FUNDED SITS ON THE BOARD, NOT IN THE ARCHIVE: terminal_won category with phase=fulfilment, which is why terminal-category deals number 95 while the Archive renders 29. Pinned in the partition test so nobody "fixes" one side of that split without the other',
      'lib/phase-model.ts unplacedDeals is the COMPLEMENT of board and archive, computed as not-in-either rather than by restating their rules, so the three sets partition the live book by construction and a record can never fall between two definitions. tests/phase-model.test.ts proves the partition: every record in exactly one bucket, funded on the board, reasons stated, and a new stage row moving a record out with no code change',
      'The No stage view renders every unplaced record with its reason ("No stage recorded", italic), file link, borrowers, amount and the Remove control with the live-feed posture. NO STAGE WAS INVENTED and no data was written this session at all. The handoff-50 note that said these records could not be removed from here is GONE, asserted by test. The switch reads Board | Archive 29 | No stage 33 | Withdrawn 0, the count at zero too',
      'Of the 33: 32 carry finmo_application_id (the control warns the live feed stops), 1 carries none, 0 have workbench rooms, so nothing in the view is refused. Every record in the book carries a source_id, so the control can key all 160. ODDITY: BRXM-F041381 exists twice in rec.deals, the only duplicate file_ref in the book',
      'MICHAEL\'S LIVE ROUND TRIP IS NOW PROVEN: source_decisions carries one record_withdrawn row, superseded, reason "This is a duplicate record." — withdraw and reverse both executed through the gate, and BRXM-F027822 renders back in the Archive with its control. The file page stage line reads "not recorded" for a null stage now, never "unknown"',
      'Render-proved on the dev instance: the switch row, all 33 rows with 33 Remove controls, a previously invisible record opening its file page, and six surfaces at 200. Book at close: 160 rows, zero active withdrawals, nothing deleted',
    ],
  },
  {
    n: 'Record withdrawal',
    title: 'The Remove control, the Withdrawn view, and the card click',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'THE BLOCKER HANDOFF 48 STOPPED ON WAS NEVER A MISSING GRANT. It concluded there was no way to read a withdrawal back, off a 404 on rec.source_decisions. The 404 was the missing Accept-Profile: rec header, which makes PostgREST look in the public schema and answer exactly as it would for a table nobody exposed. The table has been readable since migration 0073. lib/underwriting.ts getRecWithdrawals is the read, and it carries the decision id that is the only route to the reverse endpoint (the gates API exposes no GET on this resource at all: 405, verified live)',
      'All four filters are load-bearing and status most of all: a reversal sets the row to superseded rather than removing it, so dropping that filter would render every reversed record as withdrawn forever. Matching is on rec.deals source_system + source_id, which all 160 rows carry as their own columns, so there is no join. Routing it through rec.source_aliases would have covered 124 rows and left the rest of the board unable to show its own state',
      'THE REFUSAL KEYS ON finmo_application_id, NOT source_system, and that distinction is the whole rule. source_system=finmo is 2 of 160 records; finmo_application_id is 106, including 17 of the 38 no-reference records Michael is about to clear. A withdrawal stops the live receiver as well as the CSV loader, so keying on source_system would have stayed silent on all 17 while cutting their feed. A live feed plus an open workbench file is REFUSED outright, and enforced in the route: posted at directly with a forged hasRoom:false it still answers 409 with the same sentence the button shows',
      'ZERO of the 38 no-reference records carry a workbench room, so the refusal never blocks the sitting it was written for. It fires on the 9 room-bearing files on the board, proven on BRXM-F053724, which renders the reason with no textarea and no button rather than a disabled control',
      'A typed reason is required with no prefill and no carry-over between records, the button stays disabled until it clears the same bounds the gate enforces, and an over-long one is REFUSED rather than truncated. Proved server-side: no reason 422, two characters 422 naming the length, 2001 characters 422, unknown record 404. Arming is by timestamp at tap time, proven live: first press reads "Press again to confirm the removal" and it disarms after 4 seconds',
      'NOTHING ON THE PATH CAN DELETE ANYTHING (guardrail 21) and no human identity is ever supplied from this side (guardrail 19): instructed_by and instructed_on are structurally absent from the body, so a payload carrying them is stripped rather than honoured. A withdrawn record leaves the phase columns, the Archive and the insights and appears in the Withdrawn view alone, whose count renders beside Archive even at zero so a shrinking book can always be read against the reason it shrank',
      'THE ROUND TRIP AGAINST THE LIVE GATE IS NOT PROVEN, and cannot be from this machine: the dev Clerk instance carries zero JWT templates, so no gates token can be minted and the call returns its 401 auth copy before any network request leaves. Verified from the server log that no [gates] POST line exists. Everything up to that boundary is proven. The book is unchanged: 160 rows, 3 source_decisions all field_corrected, ZERO active withdrawals',
      'The card click now opens the file directly. The preview panel was a step between Michael and the thing he wanted every time, so it is left in the repo UNREFERENCED, with its read-only grep still pointed at it, and restoring it is one line. Board client JS 195 B to 438 B as the Remove control crossed the boundary; the file page 197 B to 216 B',
    ],
  },
  {
    n: 'Beta file tabs',
    title: 'Conditions, Commitment and Client — the first shared components',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'ConditionsChecklist, CommitmentTermsCard and CommitmentUploader are RENDERED on the Beta file page, not forked. The gate proxies are keyed on record ids rather than pages, so every card kept its existing route, permission key and browser-minted token path with zero duplication — and a fix to one is a fix to both. The deal room is untouched; the diff does not reach it',
      'The Conditions tab reads public.conditions filtered on APPROVED_CONDITION_GATE, never rec.conditions — that table has no gate_status column at all (42703), so a tab over it would rebuild handoff 44\'s defect on a new surface. F057400 reads 12 open of 12 on both surfaces; the control F053724 reads 24 open of 25 on both',
      'Tab badges: a queued decision is visible without opening the tab. The mechanism is general, but only Conditions is wired, because a badge on a tab that computes no count is a number nobody can trust. Zero pending in the book today so it renders nothing — proven by forcing a count, screenshotting the amber 13 while Overview was active, and reverting',
      'FINDING, and the brief was wrong: a purchase CAN carry an existing mortgage. BRXM-F053724 is a purchase holding a real Scotiabank 3.24% fixed maturing 2027-03-30. So the rule keys on presence first — a record present always shows, absent is silent on purchase/preapproval/unknown, and absent is a NAMED GAP on renewal/refinance where one must exist in reality',
      'Both mortgages are now labelled explicitly ("This deal\'s mortgage" / "The client\'s existing mortgage") so a populated old block can never read as the deal\'s rate on an unfunded file',
      'FINDING: the committed-terms card carries NO irreversibility copy at all — not on the button, not around it. Carried across unchanged rather than edited, because the wording is shared with the deal room; proposed wording is Michael\'s to accept',
      'The write guarantee follows the reuse: the test now scans the three shared components against a CLOSED allowlist of /api/portal/admin/gates/ plus /api/portal/admin/commitments/, the second deliberately recorded as a pre-existing gated route with a human actor that satisfies the intent without matching the path prefix',
      'Client JS crossed the boundary for the first time: 208 B route-specific, first load 94.3 kB to 128 kB. The deal room\'s own route JS FELL 31.8 kB to 21.7 kB as the shared cards moved into common chunks. The board is unchanged at 195 B',
    ],
  },
  {
    n: 'Committed terms',
    title: "The commitment's ten terms, with their provenance, behind one decision",
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'New authority key approvals.commitment_terms.decide, admin only, placed beside the twin it mirrors (approvals.conditions.decide — the other extraction off the same commitment upload). The name is a CROSS-REPO CONTRACT: the fox-underwriting gates API enforces the same key server-side on every call, so a rename needs coordinated edits in both repos and a widening on one side alone just produces 403s',
      'Ten real terms on BRXM-F060561 read live before anything was concluded: 10 rows, all gate_status pending, all confidence exact, all on one signed_commitment document. That check was the point — commitment_terms had no row-level policy for portal_readonly until 2026-08-03 and returned zero rows, and an empty card and a correct card against an empty table look identical on screen',
      'The printed string is the value and value_numeric never renders anywhere. Each row carries its page, its confidence and the verbatim snippet beside the figure, because what is being approved is evidence rather than a summary. A missing printed string is NAMED rather than backfilled from the parse',
      'The maturity is the case this was built for: the document printed 06/10/2031, the stored date is 2031-10-06, and reading it the other way round moves a renewal four months. The card shows the printed token, the resolved date spelled out as 6 October 2031, the convention, and the stored basis for it (four other dates in the document start above 12, so it writes day first). The same mechanism shows rate_type reading as "variable" off a printed "Prime Lending Rate - 0.85%"',
      'One button, not ten. The gate is keyed on the commitment DOCUMENT, so the set moves together and an amendment arrives as its own set with its own decision. No edit control exists on a term: the card carries exactly one textarea (the note) and zero inputs, selects or forms, asserted by test — a wrong value is a re-extraction, not a typed-over record that loses the link back to its page',
      'Boundary proved rather than assumed. As ops: the ten terms still render, every control is absent, and the route itself answers 403 — hiding the UI is not the only defence. As admin: malformed id 422, unknown action 422, a 2001-character note 422 (refused, never truncated), GET 405. The dev Clerk instance carries ZERO JWT templates, so getToken({template:"gates"}) throws "JWT template not found" and the call returns its 401 auth copy before any network request. No term was decided',
      'Built on a branch and verified locally with Michael watching, not pushed — this is the first portal surface that can write, so it follows the underwriting repo\'s cadence instead of the portal\'s straight-to-production one',
    ],
  },
  {
    n: 'Deals (Beta) v4',
    title: 'Projection green, the honest age tile, and the deal preview panel',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'The hatch behind projected figures is gone. Michael was right that the digits inside it were hard to read, and the reason generalises: on the practice-history chart the number sits OUTSIDE the bar so texture costs nothing, but here it sits INSIDE the fill and ran through the digits. Hatch works behind a bar, not behind type',
      'Replaced with a solid light tint of a BRX-family green (hue 152). A tint rather than full strength, because full strength needs reversed-out white digits and a row of dark-green blocks in every footer reads as alarm rather than information. NOTE: this repo carries no BRX brand hex, so the exact shade is a single constant to correct if it is wrong',
      'THE TWO-GREEN ZONE RULE, enforced by construction: the card moved into its own module and the projected figure into another, so projection green and needs-you lime are separated by a file boundary rather than by discipline. The path-keyed lime audit was repointed at the card module and now enforces "lime on cards only" for free. Verified live: zero lime outside a card, zero projection green on one',
      'The deal age tile is back, honestly. It measures days since a file first moved through a stage, not since its row was created, and is labelled for exactly that rather than as "average deal age" with a different formula underneath. It reports 58 days over 5 of 7 files and carries that coverage on its face',
      'A preview panel opens beside the board when a card is clicked: borrowers, purpose, amount, stage with its description, days in stage, blocked-by, probability, milestones and every condition on the file. It kept the page a SERVER component — selection rides searchParams like collapse does — so client JS is unchanged at 195 B. Proved the soft navigation rather than assuming it: a variable set before the click survived both open and close',
    ],
  },
  {
    n: 'Deals (Beta) v3',
    title: 'The rebuild: probability, insights, collapsing columns, tags and the Archive',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'The record layer moved a third time and the page was rebuilt on it rather than patched: advise and fund are now underwriting and fulfilment, Monitor grew from five steps to seven, and there are 28 active stages. The rename cost exactly one edit — the palette hue keys — because every other path reads codes from rec.phases and rec.deal_stages at runtime',
      'Stages carry a probability now, so Underwriting and Fulfilment columns show a footer with the stage percentage and what the column is worth weighted. Intake and Monitor carry NULL and get no footer at all rather than a zero, because null is not zero: those phases count people and 0 is what a lost deal means',
      'A projection is never drawn like an actual. Every weighted figure sits on a 45-degree hatch, the same convention the practice-history chart uses for forecast-over-funded. Raised from 0.30 to 0.42 alpha after looking at it, because at 0.30 it read on inspection but not at a glance',
      'An insights strip with the four figures that are real: total, open, closed won, and weighted pipeline over OPEN files only (a funded deal is an actual, and folding a certainty into a forecast is how forecasts start lying). Average deal age is omitted and the page says why — every row carries the same created_at, the seed date, so an age from it measures the migration',
      'FINDING: the active no_next_step tag cannot be evaluated. Its rule reads next_activity_at and rec.deals has no such column (Postgres 42703), with no activities table anywhere in rec. Treating an absent column as null would have tagged all seven files, inventing a signal from a field nobody records. It renders nothing and the page names the tag and the reason once. The three-column tag format was not extended',
      'Card tags and milestones render from rec.card_tags and rec.milestone_types. deal_milestones is empty today so nothing shows, but the rendering exists for lawyer_instructed landing on a file in Conditions. The link column is milestone_type, not milestone_code',
      'Every column header gained a collapse control, and it is the right answer to a six-column phase: 280px columns overflow by 588px at 1512, and collapsing the four empty ones brings it to zero. Collapse rides the URL so the board is still a server component at 195 B of client JS with no handler, form or drag target',
    ],
  },
  {
    n: 'Deals (Beta) v2',
    title: 'Five phases, every sub-stage, and colour that carries meaning',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'B0c moved the record layer underneath the page: five phases in rec.phases, 27 active stages, a new is_gate column, rec.phase_returns and rec.attract_sources. The shape was read live before anything was written, and the database was taken as authoritative over both the brief and the design docs (which still describe four phases)',
      'Attract joins the bar in front of Intake. It has no stages by design — rec.phases says so structurally with is_ordered false and level "source" — so it renders its five sources rather than steps, because nobody moves through a source',
      'EVERY sub-stage renders whether or not it holds anything: Intake 7, Advise 6, Fund 6, Monitor 5. An empty column is information and a missing column is a lie about the process',
      'THREE units now, never added: Attract counts arrivals, Intake and Monitor count people, Advise and Fund count files with a dollar total. phaseTotals returns null rather than zero for anything not deal-level, which makes "0 files" on a people-counting phase impossible rather than merely avoided',
      'COLOUR MEANS TWO THINGS AND NO MORE: hue says which phase (a cyan-to-magenta sweep in funnel order), depth says how far along (the accent deepens across a phase, computed from position so a new stage extends the ramp with no code change). Never one arbitrary colour per stage — that is the one thing in the Broki screenshot not worth copying',
      'Teal was tried for Monitor and rejected on looking at it: at 165 degrees it renders green-dominant, and green on this page means "this needs you". A test now enforces that no phase hue and no deal-type hue sits in the green band. Lime stays spent on the You chip alone',
      'The return rail reads rec.phase_returns and draws BOTH paths — Decided back to Advise at the strategy session, and Decided feeding Attract as a source. The first build drew only the renewal return and understated the loop',
      'An Archive view for the three terminal outcomes, which belong to no phase and so rendered nowhere before. The outcome leads each row because lost-to-a-competitor is a remarketing lead and cancelled is not. Empty today: no file has ended yet, so it lists the outcomes instead of showing a blank panel',
      'Two defects found by looking rather than by testing: the dollar total was louder than the stage name, and contact-level columns rendered an empty tray that read as "something should be here". Both fixed',
    ],
  },
  {
    n: 'Deals (Beta)',
    title: 'The four-phase board over the September record layer',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A read-only board at /portal/admin/deals-beta, nav item directly beneath the live Deals item and labelled Beta so there is never a doubt about which page is which. The live Deals area is untouched: not its route, not its code, not its behaviour',
      'A persistent four-card phase bar — Intake, Advise, Fund, Monitor. Contact-level phases are DASHED and count people; deal-level phases are SOLID and count files with a dollar total. lib/four-phase.ts deliberately exposes no function that returns a combined total, so the two units cannot be added even by accident',
      'A dashed return rail from Monitor back to Advise. A renewing client takes the 45 minute session with no application on file (JG-1), so they re-enter two thirds along rather than at the top — drawn rather than written down, so a new agent learns the loop without being told',
      'Columns come from rec.deal_stages where phase is not null, ordered by sort_order and read at runtime. No stage list is hardcoded anywhere: adding a stage row adds a column with no code change, which a test pins. Each header carries the label, count, dollar total, and the stage description as a line beneath — the one thing worth copying outright from Broki',
      'NEVER INVENT A NUMBER, enforced rather than intended. Days in stage is measured only from the event that entered the deal’s CURRENT stage. Two of seven deals have no stage history, and two more have history that stops at `submitted` while they now sit in `lender_response` — falling back to their latest event would print a real-looking figure for the wrong stage. All four show words instead, and the two states are distinguished ("no stage history" vs "stage entry not recorded")',
      'The blocked-by chip renders only for the four known values and nothing at all for null or anything unrecognised. Only You takes the attention colour, registered in the lime audit as a ninth surface with a test asserting Client, Lender and Lawyer stay quiet',
      'Read-only by construction: a server component with no client JavaScript, no form, no handler and no drag target, reading through portal_readonly, which holds SELECT and nothing else — an INSERT against rec.deals answers 403 / 42501, verified live',
      'Intake and Monitor render as honest placeholders naming what they wait on: Intake needs capture and consent fields that do not exist (rec.consents holds zero rows, read live and stated), and Monitor should embed the existing Opportunities engine rather than be rebuilt',
    ],
  },
  {
    n: 'A2',
    title: 'The Tasks page: the native task list, the Zoho exit’s tasks lane',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A Tasks page beside Today reading the workbench’s native task store through GET /api/tasks/today (fox-underwriting block A1). Four buckets — overdue, due today, the rolling seven days, no date — each headed by the TRUE count, never the length of the array that arrived',
      'That distinction is the whole point: the endpoint caps a bucket at 200 rows and names the capped ones. A1 shipped and fixed a defect where the count was computed after the cap, so 276 overdue reported as 200. The page states "showing N of M" and pulls the remainder through a paged read on the read-only role, ordered consistently and deduped, because the endpoint accepts no paging params and A2 may not modify that repo',
      'All four gate verbs on every row: complete, defer (asks for the date), dismiss (asks for the reason — dismissal sticks across re-imports, so the reason is the only record), plus create from the page',
      'Bulk triage, because 276 rows one at a time is a page that gets abandoned. Multi-select, then bulk complete or bulk dismiss calling the EXISTING per-task endpoints in sequence — no bulk endpoint invented, so every row keeps its own audit entry with the real human on it. Progress counts through, and a mixed run reports the failures first rather than assuming success. A 409 counts as already-done, never as an error',
      'tasks.view (every internal role) and tasks.manage (admin only) mirrored from fox-underwriting’s matrix. Verified live on the dev instance: an ops session reads the page and renders ZERO action controls, and the server refuses complete and create with 403 — the UI hiding a control is not the enforcement',
      'Phone first: 44px targets, nothing hover-dependent, proven at 375px and 1280px with zero horizontal overflow',
      'Nothing on this page writes to Zoho. The Zoho Tasks card on Today is a separate surface and stays live until Michael declares the flip (block A3)',
    ],
  },
  {
    n: 'N-06',
    title: 'Lender notes: the CRM write moves into the deal room',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'The n8n Lender Notes Generator had no caller in this repo at all (grep-verified at the tip: the webhook id, the workflow id, and the n8n host all return nothing for lender notes). So this was not a repoint. The native engine shipped in fox-underwriting by N-05 simply had no portal caller, and now it has one',
      'The existing Generate button is untouched. It still produces a workbench DRAFT through the gates path and still sends nothing. The new control is a separate block that runs the ported generator against the CRM file: previous notes copied to a history note, Lender_Notes overwritten, a log note appended, and each of the three reported by name so a partial run reads as partial',
      'Preview is the identical call with dry_run, so what the preview shows is exactly what a write would put on the file. Proven live against a real in-progress deal: 200 in 18.4 seconds, a 2,206 character note, all three write flags false, nothing touched',
      'Its own admin-only key (notes.crm.write) rather than notes.generate, whose label promises "draft only, nothing sent". Hidden in demo, two taps to write, and a forced second press offered when the engine skips a file noted inside the last ten minutes',
      'The browser never names the Zoho record: the card posts the workbench deal id and the route reads the Zoho and Finmo identifiers off the row through the read-only role. The bridge secret stays server-side and is the one already here for the room bridge',
      'Outstanding: the first real write is Michael’s press on a file he picks, DRAFT mode. Retiring the n8n workflow follows that press',
    ],
  },
  {
    n: 'Today v1',
    title: 'Today, the morning operating page',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Home rebuilt to answer three questions in order: what needs me, what is moving, what is at risk',
      'Your day: a live Zoho task list (closing-soon files first, deal-room links, catch-up sweep) beside today’s Microsoft calendar',
      'Waiting on you as one region: the navy Desk strip, the decision cards, and a single at-risk block that leads with the loudest thing (a file closing this week with an overdue condition); a healthy sync reads as a quiet success line',
      'What is moving: one lifecycle table (the duplicate pipeline-by-stage census deleted); Closings widened to 30 days with a readiness chip per file; The year absorbs pacing, the stat tiles, the leak line, and the groom line',
      'A portal-wide relative-date helper (lib/dates relativeDay) with urgency tinting; every file ref on Today links to its deal room; teaching empty states across empty bands',
      'Pure model in lib/today.ts, unit-tested; render-proven at 1280 and 375 in demo mode with zero real reads',
      'Task two-way (2026-07-20): the Tasks card gains a checkbox that completes the task in Zoho, with an optimistic tick, a ~10 second undo that restores the prior status, and an honest revert if Zoho does not take the write. The portal’s first Zoho write, admin only through a gated route, audited to FOXCA (task_action_events); Zoho stays the source of truth',
      'Calendar band live (2026-07-20): the Your day calendar reads today’s Microsoft calendar (Graph client-credentials, read-only, server-side, in-process token cache) and lists meetings in Toronto time with past/now/upcoming states. Fail-soft by construction: a Graph outage or missing config degrades only that card and never breaks Today. No Graph write exists anywhere in the build',
      'Lenders one-row consolidation (2026-07-20): the two stacked tab rows collapse into one — Scenario, Rates, Promos, Intel, Knowledge — with the old Lenders and All quotes merged into Rates behind a By lender / All quotes toggle. Every old URL redirects to its new home and saved scenarios still resolve. The rate book fetch is decoupled from searchParams via a short agent-keyed cache, so scenario and select changes re-read nothing (proven: zero book reads after initial load)',
      'Ask Fox truncation fix (2026-07-20): a knowledge_lookup profile was capped with JSON.parse(JSON.stringify(profile).slice(0, 6000)), which cut JSON mid-token and threw "Unterminated string at position 6000", crashing the whole turn and mislabelling it "could not reach the model". Fixed at the source with a safe cap (cappedProfile), a tool throw can no longer crash a turn, and the loop error copy now differentiates three honest cases (could not reach the model, the answer was cut off, the reply could not be read) with nothing written and no partial kept',
      'Scenario deal bar and teaching results (2026-07-20): the vertical scenario form becomes a compact horizontal bar across the top of the Scenario tab, the ranked matches take the full width below as the hero, and a new collapsed Excluded (N) section names each left-out lender with one plain-words reason (no conventional rate on file, not available in Ontario, needs a borrower profile). The reasons are a pure read over the loaded book (lenderExclusions) — matching and ranking are unchanged, no workbench or classifier change, and tier is not a scenario reason',
      'Get anywhere fast (2026-07-20): the command palette gains a Lenders jump (into the Rates by-lender view) and admin page targets including the consolidated sub-tabs (type promos, intel, or bookkeeping and land on it), while deals stay searchable by file ref or client name. And every plain-text file ref across the command centre — the deals list, Today, the approvals desk — becomes a link to its deal room, reusing the existing inline link idiom. Pure ranking only, no route or fetcher change; the Lenders group is a static gated list (no per-keystroke read), and lender names stay real in demo',
      'BDM contacts on the lender card (P1, 2026-07-20): the lender detail page in the by-lender view gains a Contacts front — approved BDM and underwriter contacts render with tap-to-call (extension and all) and tap-to-email, and an admin can add, edit, or retire a contact through the audited human gate. Portal surface over the workbench engine (W1); reads and writes ride the browser-minted gates token, contacts are canned in demo with every write blocked, and a lender with nobody saved shows a teaching prompt. The palette also reconciled two lenders (duca, meridian) that were in the rate book but unnamed. The first real contact through the card in production closes the live write proof',
    ],
  },
  {
    n: '1',
    title: 'Command center foundation',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Repo audit (docs/portal-audit-2026-07.md)',
      'Full navigation architecture with permission gating',
      'Exception-first Home with live read-only data',
      'Status page and authority matrix groundwork',
      'Read-only workbench wiring (lib/underwriting.ts)',
    ],
  },
  {
    n: '1.5',
    title: 'Hotfix: public forms were dropping submissions',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Persist-first form intake pipeline (Supabase capture, then Zoho, then Resend, then an honest response)',
      'Honeypot and validation on the public pair; attribution on the referral endpoint',
    ],
  },
  {
    n: '2',
    title: 'Gates API and read-only database role',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'Database-enforced portal_readonly role replaced the service key posture (service key deleted)',
      'Gates API for approval decisions, enforcing the same permission keys as this portal',
      'Amended guardrail: dependency points one direction only (this portal depends on fox-underwriting, never the reverse)',
    ],
  },
  {
    n: '3',
    title: 'Deals, Approvals, Audit Log',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Approvals desk live over the four gate queues with two-tap confirms and 409 reconciliation',
      'Deals list and deal room joining Zoho stages with workbench evidence, conditions, and flags',
      'Audit viewer with filters, server pagination, and capped CSV export',
      'Browser-minted gates token contract verified live and documented',
    ],
  },
  {
    n: '3.5',
    title: 'Workbench micro-sessions 1 and 2',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'Micro-session 1: shadow empty-calcs 422, token-mint contract correction, deal room grants (16-table surface), decided_by convention',
      'Micro-session 2: knowledge read endpoints, conditions decision gate, zoho_potential_id backfill for the deal rooms',
    ],
  },
  {
    n: '4',
    title: 'Rates, Intel, Knowledge, Changelog, Directory',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rates browser over the approved quote set with digest strip and promo countdowns',
      'Knowledge base pages with as-of discipline, draft and withheld-profile handling',
      'Intel feed with review outcomes; changelog; staff directory',
      'Conditions decisions in the deal room; terminal-deal filtering; form intake acknowledged path',
    ],
  },
  {
    n: '5',
    title: 'Rates v2: scenario-driven decision tool',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Describe the deal, see which lenders win it, best rate first, from Michael-approved sheets',
      'Three levels: lender results, lender drill-in, product detail with approval provenance',
      'Pin up to three products, compare side by side, export the client-ready PDF (download only)',
      'Deal room prefill: find rates for this deal, read-only',
    ],
  },
  {
    n: '5.5',
    title: 'Workbench: variable rates and parser coverage',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'rate_type, signed prime_variance, cashback_pct, program_notes on rate_quotes (migration 0029); rate nullable behind the priced check',
      'Prime reference and floating mechanism notes served on /api/knowledge/rates-reference; quote_slugs aliases published on the knowledge index',
      'Parser book 5 to 21 lenders; number_links granted as the 17th read-only table; addendum decisions on the sheet gate',
      'Left Michael a 25-sheet, 719-quote review queue',
    ],
  },
  {
    n: '6',
    title: 'Floating rates on screen, and Compliance',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rate type as identity everywhere: fixed plain, adjustable and variable badged distinctly, discount-first with effective rates computed against served prime and labeled with its as-of',
      'Cash back tiers as first-class rows with verbatim program conditions; promo offers as badged scenario results (the Scotia 60-day special)',
      'Approvals sheet cards print floating ranges and cash back tier counts for the 719-quote sitting; Directory renders the learned numbers',
      'Compliance module: credential register feeding the attention rail (60 and 14 day thresholds), complaint and incident register, versioned policy library with acknowledgments, per-file compliance cards with an honest posture rule',
    ],
  },
  {
    n: '6.5',
    title: 'Ask Fox: the practice agent (Call Prep and Call Review)',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'In-portal chat over the Anthropic API with six enumerated read tools (Zoho, workbench, the approved rate book, lender knowledge); every figure sourced, gaps named, never guessed',
      'Call Prep one-tap briefs from deal rooms; Call Review grades pasted transcripts against the versioned rubric with evidence',
      'CRM changes and tasks only as confirm cards Michael taps; no gate actions, no send capability; every conversation kept as a supervision record',
      'Needs ANTHROPIC_API_KEY on Vercel to answer; renders the honest not-configured state until then',
      'v2 (planned): Dialpad-automatic Call Review, transcripts flowing in through the existing n8n call pipeline without paste',
    ],
  },
  {
    n: '7',
    title: 'Revenue and Partners',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Commission forecast by close month: stage-weighted, recorded commissions first, comp model estimates labeled everywhere else (config/comp.ts, confirm-bps placeholders for Michael)',
      'Funded trends with mix charts that render only at real field coverage; conversion funnel with its honest method caveat; goal pacing deep view with the gap in dollars and files',
      'Partners ranked for Monday attention: health tiers (config/partner-tiers.ts), referral stats, attributed revenue, portal sign-in recency read server-side; detail pages gain referred files and cadence',
      'Business-line P&L tile renders its honest not-connected state; the exact requirements to light it are listed on the page (no production QBO path exists yet)',
      'Ask Fox v2 prompt: checks open Zoho tasks before proposing a card, references covering tasks instead of duplicating; chat gained the thinking indicator',
    ],
  },
  {
    n: '8',
    title: 'Multi-user hardening',
    status: 'shipped',
    repo: 'foxmortgage-ca + fox-underwriting',
    items: [
      'Roles live and verified: ops / underwriting-reviewer / agent baselines recorded in the authority matrix, every admin page and API gates on permission keys (zero role literals), per-role surfaces proven with dev-instance test users',
      'Settings gains the effective-access view: pick a role, see every page and action it reaches — the supervision answer to "what can your staff do"',
      'View-as formalized: picker under the portals nav, structurally read-only (controls absent + server rejection, both tested), every session logged to FOXCA and listed under Audit Log',
      'Provisioning wizard at Settings → People: staff, partner (Zoho id picked never typed), agent (workbench half via POST /api/gates/agents with setup_remaining rendered honestly); who-provisioned-whom recorded',
      'Offboarding rehearsed: one two-tap action bans and revokes sessions, a persisted checklist covers grants, partner attribution, agent scope, and compliance credentials; nothing deletes',
    ],
  },
  {
    n: '9',
    title: 'The finale — PWA, notifications, search, demo mode',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'PWA: on-brand manifest + icon set (maskable), a security-first service worker that never caches an authenticated response, an offline fallback, and polite dismissible install hints on the admin and partner shells',
      'Notification center: a bell + badge backed by a FOXCA table (per-user read state, per-category toggles) producing five categories from signals the portal already computes — including off-portal CLI gate decisions, so the desk and the terminal are one world',
      'Global search: cmd-K across deals (workbench refs + Zoho names), contacts and partners (Zoho), lender knowledge, and navigation — grouped, keyboard-driven, debounced server-side, honest when a source is slow',
      'Demo mode: an admin-only, env-fenced toggle that swaps the whole command center to fictional fixtures at the fetcher boundary — zero real reads, writes disabled, a persistent banner — the recruiting instrument with no client on screen',
      'Finale sweep: legacy mock pages removed, the Daily Deal Briefing retired (the Home rail serves it live), the partner shell made responsive, and the roadmap graduated',
    ],
  },
  {
    n: '10',
    title: 'Rates v3: tabs, lender browse, logos, and the promos board',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rates restructured into four URL-addressable tabs (Scenario default, Lenders, Promos, All quotes); the scenario lender-card click fixed with a real affordance and a scroll-to-top drill-in',
      'LenderMark: a real logo from public/lenders/ or an on-brand navy monogram fallback, everywhere a lender is named; no manifest to maintain',
      'Lenders tab: browse the approved book with honest per-class headline rates and the deepest floating discount (adjustable and variable kept apart), plus the three-state coverage map (live / awaiting approval / coverage pending)',
      'Promos tab: the offer book as its own board, soonest to expire first, each card citing its announcement; saved scenarios per user through FOXCA narrow functions',
      'A test locks the client rate PDF against ever disclosing lender compensation to a borrower',
      'Regression fix (2026-07-13 late): the database service caps every read at 1,000 rows, and when the approved-plus-superseded book outgrew one page the grid silently dropped whole lenders (11 cards, 24 false pending chips; the Opportunities board lost two act-now calls the same way). Every large workbench read now pages through the full result. Coverage-pending redefined: only a lender whose NEWEST rates-class sheet failed extraction or has no parser, with the failing sheet named on the chip; an approved lender can never chip; a live lender with a failed newest sheet gets a needs-attention badge, never a demotion. Province-excluded lenders’ sheets park out of the approval queue onto a visible auto-releasing shelf, and unattributed rates sheets (null lender guess) surface on the Lenders tab',
    ],
  },
  {
    n: '11',
    title: 'The offers desk: promotional offers become approvable',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A fifth Offers queue on the Approvals desk decides pending promos through the gate (approvals.offer.decide); each card shows priced elements as identity, expandable evidence with page citations, verbatim conditions, and the window rendered loudly',
      'A null expiry is unmistakable everywhere it appears — the approval card, the Promos board, the scenario promo chips, the lender pages, and the client PDF — never a bare dash (19 of 23 pending offers had none)',
      'Offers match a scenario permissively where eligibility could not be extracted (and say so), a winning offer sorts first, and a pinned offer carries its conditions and expiry onto the client PDF with compensation scrubbed from every field',
      'Pending offers feed the Home attention rail and the notification bell; lender_offers is the 18th granted read table',
    ],
  },
  {
    n: '15',
    title: 'Lender eligibility, client constraints, and the cost of a preference',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'The live bug: Kootenay Savings and Coast Capital are BC credit unions that cannot do an Ontario deal, yet Kootenay (deepest floating discount in the book) led almost every floating scenario and was proposed as a real client’s best comparable. Every ranking surface now filters structural eligibility first (scenario, compare tray, opportunities, rates browser Lenders and Promos, Ask Fox, every PDF). Ineligible is excluded not deprioritized; unconfirmed-province lenders show flagged internally and never on a client document (fail-closed). Ported the fox-underwriting eligibility derivation exactly (golden-test parity) because the workbench columns are unpopulated',
      'Program eligibility: the sub-4% ladder was physician-only / banking-bundle / exclusive-channel and hid the real best rate. Default results are now only what the client can definitely have; qualifier toggles unlock restricted rates, a show-restricted view reveals them with their requirement sentence, and a manual pin records a confirmation before a restricted product reaches a client PDF',
      'Transaction type determines product class (Part 1c): a monitoring client who breaks is a refinance, priced against conventional only, with an 80% LTV hard cap and a requalification line on the card and client PDF; a switch ports the original class with no penalty. Re-ran the export: 20 of 41 opportunities changed bucket. The client file that surfaced the bug had its comparable corrected from the Kootenay fantasy to First National conventional adjustable P−0.50, 3.95% effective',
      'Client lender constraints (excluded / required / preferred, each with a required reason, retired with history never deleted), kept in FOXCA, editable from the deal room, applied to eligibility (a required-but-ineligible lender yields an honest empty state). The cost of the preference is computed by the shared engine and quantified as documented suitability on the compliance card',
      'Ask Fox returns eligible lenders only and never quotes an unconfirmed-province lender to a client (prompt v3). Renewals and the rates browser inherit the filter. Adversarial review run; the client-PDF offer leak, a floating negative-rate guard, and the compliance zero-cost inflation were fixed',
      'Reported gaps: the workbench eligibility backfill has not populated the approved book (the portal derives); provinces are confirmed for only the 2 BC lenders so client PDFs withhold every comparison until Michael confirms provinces (the visible count drives it); the live cost-of-constraint readout on the scenario board is deferred',
    ],
  },
  {
    n: '14',
    title: 'Opportunities: the Strategic Mortgage Monitoring engine',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A new Opportunities section turns the monthly monitoring CSV into a call pipeline. Upload is persist-first (every raw row captured to FOXCA before any parse), then parsed with a strict sign convention (positive savings = act now, negative = costs, a dash stays uncomputed and never a zero), dollar-one placeholder detection, co-borrower collapse keeping every borrower, and lender normalization to the book. Verified against the live export: 41 mortgages from 49 rows, 1 placeholder, 0 parse failures, 0 unmapped lenders, 0 sign violations',
      'Fox’s own analysis sits beside the service’s figure: the best gate-approved comparable with its sheet date, the payment change from the validated engine, the early-break penalty framed honestly (3MI for floating; IRD-vs-3MI for fixed with the lender method named or the gap stated), break-even, and a net benefit after the penalty that buckets the board (act now / marginal / stay put / insufficient) ranked by dollars. A low rate near maturity is told to WAIT, never sold a switch; disagreement between Fox and the service is flagged',
      'Each card opens the priced scenario in one tap, preps a call, sets a portal-side status (FOXCA), and downloads a grade-six savings-analysis PDF with compensation scrubbed from every line and wait-for-maturity framing where it applies (download only, no send path)',
      'Backfill matches each file to Zoho (email, then phone, then name) and proposes filling only the EMPTY maturity dates and rates the export knows and the CRM does not — confirm one at a time or all at once, every value recomputed server-side from the persisted export and a live Zoho read (client values never trusted), each write recorded to a new FOXCA backfill audit; conflicts are shown, never overwritten; Lender_Name is a Zoho lookup so it is reported as a gap, not written',
      'The Renewals lapsed alarm now reconciles against the export: still-with-lender past maturity is a recoverable auto-renewal (the highest-value call), lender-changed is flagged won-or-lost-unknown, unmonitored is not in the export, and a retention signal is computed. Home gained an act-now opportunities rail line',
      'Payment correction (2026-07-13): the stated current payment now reconstructs the ORIGINAL schedule (original amount over the original amortization) instead of re-amortizing the current balance, which understated every seasoned mortgage. The analysis carries months elapsed and the remaining amortization, prices the comparison over the months actually left, and a reconciliation gate models the balance forward from origination; drift over 0.5% blocks the file into a Needs-review board bucket with both figures and the drift shown, and its client PDF states no figure at all',
      'Shared-identity backfill fix (2026-07-13): a match is a (contact, mortgage) pair, never a contact alone. When several export mortgages share an email, phone, or name (six groups covering 13 of the 41 live mortgages), the contact’s deals are attributed by property address then amount; a deal claimed by none or several is contested and NEVER proposed into — it goes to a needs-manual-match card where Michael binds each deal to its mortgage, with the pick recorded in the backfill audit. The empty-field-only, server-recomputed write gate is unchanged',
      'Tiers, renewals, overrides (2026-07-13, Part 1): every lender carries a paper grade (a/b/private, registry-seeded unconfirmed, program-level overrides — FN Prime a, Excalibur b); comparables are same-tier only (B prices the b_side book; private is honest-insufficient; unknown tier or a rate that contradicts the map routes to review); graduation to better paper is a flagged opportunity requiring Michael’s two-tap approval, never an automatic price. The radar detects renewals the CRM missed (feed start past deal close, lender/rate contradictions), suppresses them from action pools with the phantom delta shown, and confirms with the new Renewed With Us picklist value (exactly one field) or declines with a persisted reason. Michael can override any comparable (eligible book pick validated by construction, or a desk rate with mandatory source note and reason), POST-only, badged on board and PDF, recorded on the savings log. The log is append-only by trigger; $1 placeholders route to review and never propose backfills',
      'Final correctness pass (2026-07-13): the savings PDF states three months’ interest as a MINIMUM with the break-even penalty, and draws no positive net-benefit conclusion on ANY fixed-rate break — adversarial review strengthened this past the brief, since a documented IRD method still produces no figure (a wait conclusion at the floor stays — a larger penalty only strengthens it). The comparable is like-for-like by rate family (fixed→fixed; adjustable and variable never collapsed); the cheaper cross-family option is a labelled alternative with a quantified risk line, and headline-ing it on a client PDF takes a two-tap manage-gated approval recorded on the log. Floating ranks on the effective rate from the per-lender prime everywhere (variance is display, never sort order; convention corrected in fox-underwriting §3). Every board render and client PDF writes an append-only savings_analysis_log row (calc_version 2, inputs hash, quotes with sheet dates, figures) that replays exactly; demo writes nothing',
      'Term policy + the client report rebuilt (2026-07-13, Task 0 + Part 2): every comparable carries its TERM beside its rate (board, log, client report); the default comparable must cover the comparison horizon (months left for a break, the client’s own term at a renewal) or the projection shortens to the quote’s term — a short rate is never projected past its term, and a deliberately short-term play is a flagged strategy taking Michael’s two-tap approval, never an automatic act now. Graduation prices conventional only (better paper never inherits an insurance class). The renewal pool is funded-stage deals only with property-row children excluded by name; the three 2023 lapsed rows were verified by hand to be prior-term private-lending records, not children, listed for one-tap resolution. The savings report is rebuilt as the three-page choice document: option cards (lower payment / same payment, mortgage-free sooner), a dated rate strip with the term and never the lender’s name, drawn amortization bars, the side-by-side table at the horizon end, the penalty minimum with a drawn break-even gauge, and conditional next steps in place of any fixed-break verdict (calc_version 3; every printed figure logged and replayable)',
    ],
  },
  {
    n: '13',
    title: 'The Renewal Radar',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A new Renewals section reads every funded deal by maturity window: Lapsed (matured, no outcome, a red non-collapsible alarm sorted by amount), Action now (0-130 days), Monitoring (130-150), Watching (150+), and Resolved. Reconciles live to 18 lapsed files ($11.0M), 8 action files ($4.37M), and a $17.95M renewal book',
      'A missing-maturity block lists every funded deal with no maturity date (6, $2.96M) and persists until empty. Each renewal card carries the payment-shock preview (file rate against the best approved fixed rate with its sheet date, monthly change from the validated engine, honest where the current rate is not on file), a one-tap Ask Fox call prep, and enumerated status actions written to Zoho through the confirmed-action path, recorded with who and when in a new FOXCA audit',
      'Home gained lapsed-renewal, action-window, and missing-maturity rail alarms plus a compact five-number KPI strip; the bell fires on the crossing and lapse transitions',
      'Revenue restored the practice KPIs (funded all time, average deal, best year, years active), partner tiles by type with attributed volume and the caveat once, recent referrals, and the renewal book, all reconciled to the corrected data',
      'Investigation: the Strategic Mortgage Monitoring renewal drip does not exist as an n8n workflow, and all four renewal fields sit null across every deal, so it has never fired. Reported, nothing modified. Zoho also has no picklist value for a renewal won with us, so retention cannot be recorded yet',
    ],
  },
  {
    n: '12',
    title: 'Pipeline truth, and the Practice History chart',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A self-defending pipeline: Additional Properties stay out by stage, and any open file whose close date is more than 90 days past, or that has sat open more than 180 days without moving, drops into a visible, groomable stale bucket on Revenue that links to Zoho (activity timestamps are Finmo-synced to one value, so deal age is the reliable proxy). Nothing is deleted',
      'The active pipeline reconciles to 8 real files worth $4.71M; the weighted pipeline fell from $4.14M to $2.19M and the pace now reads honestly behind target, not ahead',
      'Both funded stage names are covered everywhere (grep-verified), and one investor-page filter that missed "Mortgage Funded" is fixed',
      'The Practice History chart is restored on Revenue: funded volume by year from 2021 with deal counts, the current year split into funded solid and weighted pipeline hatched (a projection, never an actual), the three 2026 milestones marked plainly at the right edge, and no trend device; a one-tap export renders it as a slide-ready image in the house style with the Fox mark',
    ],
  },
]

// The forward list once the original nine-session map is complete: the
// side-quests and follow-ups decided along the way. Kept honest and current.
const BACKLOG: { title: string; note: string }[] = [
  { title: 'Command Centre Phase B: page interiors + the client portal (B1 through B9 shipped)', note: 'The 2026-07-14 shell redesign (Phase A) shipped the grouped sidebar, the Desk strip, decision badges, and the lime-as-decisions rule. B1 (the lifecycle spine) shipped ONE canonical lifecycle definition (config/lifecycle.ts). B2a (stage truth) made Zoho the position source: every board card sits where its Zoho display stage says (six of seven live files moved to their true columns). B2b (Direction 2, "the control room") made the surface Deals: the list-first daily driver with exactly one lime on the top-most actionable row, the board behind a per-user toggle, the phase-led deal room with the read-only compliance package card, the website type pair, and the new-version toast (which shipped mute: the served worker’s bytes never changed and nothing asked the browser to look, so it could not fire until the 2026-07-17 toast fix). B3 (the consistency pass, 2026-07-17) extracted the design system into components/admin/ds/ and gave the menu the lifecycle\u2019s shape: eight working destinations across The book and The practice, the three market pages merged into Lenders (rates, intel, knowledge tabs), Renewals and Opportunities merged into Beyond funding with one summed badge, Bookkeeping folded into Revenue, every old path redirecting permanently, and the flagged decorative limes (ClientConstraints, the roadmap markers) demoted to calm ink. B4 (2026-07-17) shipped both finishing sweeps: real client names left the repo tip entirely (the standing PII exception is ended; the rewritten rule and its two carve-outs live in CLAUDE.md), the remaining admin surfaces moved onto the shared design system, the mechanical token pass retired the legacy lime, navy-hex, gray, and font classes, and the lime audit now walks the whole admin tree so a decorative lime anywhere fails the suite. B5 (2026-07-17) shipped the first CLIENT-FACING surface: a private status page at /portal/file/[token] that shows a client where their mortgage stands, in their own words, from the same lifecycle truth the admin reads, with no internal word and no other client\u2019s data, and it never tells a person no. It reuses nothing from the magic-link machinery (that lives in Zoho, plaintext, one token per record); links are opaque, hashed, 90-day, revocable FOXCA rows created and killed from a deal-room card, and a public-route PII leak on /onboard/expired was fixed along the way. B6 (2026-07-17) shipped the documents desk: the deal room’s document area, once one long table, is now compact per-document cards grouped into Needs your eyes, Waiting on the client, and Done, so a whole file’s document state reads in one glance; where the workbench has a per-document verdict (reachable read-only through the condition analysis’ document_id), the card carries it as a named draft, and it is all presentation over reads the page already made (no fetcher, gate, or write changed). B6.2 (2026-07-18) rebuilt that desk around the right noun — the Finmo document REQUEST — reading the synced request list (document_index, newly granted to portal_readonly by fox-underwriting migration 0048, the one pre-authorized exception) and reporting borrower-sectioned by state (waiting on the client / needs your look, AI-flagged first / done), with the evidence and verdict reparented into each request’s expansion; it also fixed two live defects Michael found on F053107 — a refinance header that showed a stale purchase price (now the fresh estimated value, or nothing) and a calc stack that stacked superseded recomputes (now current full-size, prior behind History). W2 workbench follow-ups: pull-time borrower attribution, and a per-request approve action so the desk can show “Approved by you”. B6.3 (2026-07-18) added freshness and attribution: an approval names its source (“Approved in Finmo”, never bare, never “by you”); a per-doc-kind freshness table (config/doc-freshness.ts, Michael-adjustable) flags an aged document with an amber “may be stale” advisory that counts into needs-your-look and sorts below AI flags but NEVER demotes the approval chip; and same-given-name sections disambiguate by relationship (“Lyntje (spouse)”). B6.4 (2026-07-18) closed the loop end to end: the desk now READS the AI verdict the workbench writes when a document meets it at the door (document_request_reviews, granted by fox-underwriting migration 0049) — flagged in amber with the reason, an unreadable scan quietly in its own Questions pile, an annual document from last year’s cycle as a soft "newer one available" note, a clean read as "looks right" — and carries content dates onto the card; a request deleted in Finmo tucks under a per-borrower "withdrawn" line; documents with no request link show in a "not tied to a request" residual so nothing collected is invisible; a "Check Finmo now" button pulls the latest on the spot; and Michael can Approve a request or Send it back with a reason through the gate under his verified session (document_request_decisions), shown beside the Finmo status and the AI read as three truths, never touching Finmo. The document pipeline is now complete end to end. Remaining on this arc: the Finmo status write-back (mirror Michael’s approve into Finmo), its own explicitly-approved build; and the content-vs-slot classifier W2 named (a right-slot wrong-content document still reads passed). B7 (2026-07-18) shipped client comms: B7-W built the workbench engine (four touch families — stage updates, application nudges, document chases, and a post-funding review request — on the renewal chassis, shipped DARK, every send individually human-approved, with CASL and one-click unsubscribe), and B7-P shipped this portal’s desk over it: a Client comms queue in the Approvals area (each pending message shown in full, grouped by client, with approve / edit / reject and an amber flag for send dates that have slipped), a quiet per-deal comms card, and a Settings surface carrying the master kill switch (fail-closed: dark until Michael flips it, and the very first ON is an explicit act), the per-client caps, the mailing address, and the permanent unsubscribe list. No send ever originates here — the portal approves, the workbench sends. Alongside it, a security fix (Task 0) put an operator secret in front of the admin client-link functions so the shared FOXCA anon key can no longer mint or revoke a client link on its own, and the client file page gained a booking link. Comms is complete pending Michael’s first live approved sends. B8a (2026-07-18) grew the client status page up: a considered desktop layout (a wider frame, the journey given room, documents and team side by side, type stepped up) proven at both 375px and 1280px under a new standing rule that every client surface is designed and proven at both widths; the missing closing-day card, a live defect on F053107 where Zoho’s closing date was empty on a refinance while the real July 28 date lived in the workbench, now sourced from the workbench; and a real document checklist that reads Finmo’s request list and shows a progress line plus three plain client states (still needed from you, named and grouped by borrower; received; done), never leaking a verdict, flag, or freshness note, with the upload guidance still beneath. B8b (2026-07-18) shipped the presentation layer: three surfaces Michael composes in the deal room and PUBLISHES to a client’s own page, nothing appearing by default. Scenarios are named what-ifs computed by the existing mortgage engine (never re-derived), shown side by side as plain line items. Offers are lender options picked from the approved book, each carrying a disclosed A-to-D grade over a one-config-home rubric (rate 30, prepayment 20, penalty method 20, portability 10, fees 10, flexibility 10); the honesty rule is the point — a component with no cited truth (the quote’s own fields or an approved lender-knowledge claim) scores "not on file" and nothing else, and the letter grade only shows once at least 70 of 100 points are on file, so nothing is inflated and no gap is averaged around. The pre-approval letter (purchase files only) is a deterministic PDF Michael mints from the entered terms, append-only, that the client downloads while its rate-hold is live. All three store frozen SNAPSHOTS in FOXCA (migration 20260718180000, operator-secret admin writes, token-hash client reads so the public anon key cannot enumerate), so a later data change never rewrites a page a client already saw; the render is proven at both widths, and Task 0 unified the closing date on one workbench-first source across the deal list, board, and client page. B9 (2026-07-18) shipped the qualification explorer: a "Can I afford it?" tool the client opens on their own page and drives with four controls (price, down payment, property taxes, condo fees), every figure computed by the SAME affordability engine the public tools use (GDS/TDS, the B20 stress rate, the CMHC premium fold below 20 percent down, the tiered minimum-down helper) \u2014 never re-derived, golden-tested to the cent. The law of the surface is that it never tells a person no: the result is always one of four warm bands (fits / options exist / alternative paths / let us talk this through), because the practice reaches alternative, private, and equity and net-worth lenders no ratio form can see; a test bans every decline word from the band copy. Michael reviews a baseline the deal room proposes from the file (income from the calc rows, the Finmo-requested rate, the price), edits any value, and publishes it; only a published, frozen baseline reaches the client page, so a later file change never rewrites a panel the client already saw. Storage mirrors B8b exactly (FOXCA table client_qualification_baselines, operator-secret admin writes, token-hash client read; migration 20260718200000 applied live, anon posture proven). Rides the presentation authoring key (client.presentation.manage); the admin card is navy + StatusChip (lime audit unchanged). NEXT: agent mode with per-agent partners and compliance scoping (B10). A persisted backfill-scan result would also light the Desk strip\u2019s manual-match fragment; a rate limiter on the client token page (the one anonymous Zoho-touching route) is a near-term follow-up. Two post-B9 patches (2026-07-18): the qualification stretch bands now drive on TDS (the client’s whole debt picture; green still needs both ratios inside standard limits), and the Rates scenario’s amount/value inputs commit on blur or Enter instead of re-searching per keystroke — establishing the standing input-commit rule (no keystroke ever triggers a network call or heavy recompute; commit on blur/Enter, or debounce 600ms+ with in-flight cancellation).' },
  { title: 'Hold province-excluded extractions at the source', note: 'fox-underwriting: land new extractions from registry-province-excluded lenders as status held with held_reason province_ineligible (extraction pipeline, or a hold action on the rate-sheets gate), audited. The portal parks them out of the queue meanwhile (lib/sheet-park.ts), but the park is presentation, not a recorded hold.' },
  { title: 'Assign the alterna intel slug', note: "fox-underwriting: the ingest has no 'alterna' slug, so Alterna Savings sheets arrive with a null lender guess (item b1cfd0c1, 2026-07-13). Add the slug and backfill the guess; the portal surfaces null-slug rates items on the Lenders tab meanwhile." },
  { title: 'Collapse mirror 2: provinces', note: 'config/lender-provinces.ts mirrors the workbench lender registry. Make the registry server-readable (a portal_readonly-granted table is the cheapest path), read it live everywhere, and delete the mirror. A fetch failure must fall back to last-known-good with its as-of, never to empty, or every lender silently downgrades to unknown.' },
  { title: 'Collapse mirror 3: prime', note: 'config/prime.ts mirrors the workbench prime reference for server surfaces that cannot mint a gates token. Same fix shape as provinces, and more urgent: prime moves, and a stale mirror misprices every floating effective rate. Collapse before the next prime change.' },
  { title: 'Collapse mirror 4: the calculation engine', note: 'lib/mortgage-engine.ts and the workbench calc engine are parallel code. The dependency rule puts the engine in fox-underwriting, published as a package the portal consumes; interim containment is a shared golden-vector file asserted on both sides.' },
  { title: 'Parser history backfill', note: 'Backfill the rate-quote parser over the full sheet history so superseded books read complete.' },
  { title: 'Five compliance workbench fields + penalty methodology', note: 'fox-underwriting to add suitability, exit-strategy, identity-verification, disclosure-delivered, and package-state fields, plus a penalty-methodology field on machine profiles (the compare tray lights up when it lands).' },
  { title: 'Fox Grade', note: 'A single practice-health grade rolling up pacing, pipeline, compliance posture, and partner health.' },
  { title: 'Dialpad-automatic Call Review', note: "Ask Fox's v2: transcripts flowing in through the existing n8n call pipeline, no paste." },
  { title: 'RLS-per-user before direct credentials', note: 'Per-user row-level security on the FOXCA stores before any partner gets a direct (non-service) key.' },
  { title: 'Pipeline agent scoping', note: 'Scope the ingest/intel CLI paths off agent 1 before a second agent’s deals flow (from the gates setup_remaining contract).' },
  { title: 'Identity-linkage columns', note: 'A holder id on compliance credentials and a Clerk id on the workbench agents row, so offboarding matches exactly instead of by name/email.' },
  { title: 'MFA second factor', note: 'A second-factor step on the custom sign-in form for when production turns MFA on.' },
  { title: 'Reinstate path', note: 'A decision + UI for un-disabling an offboarded person (today one-way; reinstate is a Clerk-dashboard action).' },
]

const STATUS_CHIP: Record<SessionStatus, { label: string; cls: string }> = {
  shipped: { label: 'Shipped', cls: 'bg-cool-100 text-navy border border-cool-250' },
  current: { label: 'In progress', cls: 'bg-navy text-white' },
  next: { label: 'Next', cls: 'bg-navy/80 text-white' },
  planned: { label: 'Planned', cls: 'bg-cool-100 text-cool-600' },
}

export default async function RoadmapPage() {
  await requirePermission('roadmap.view')

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Roadmap</h1>
        <p className="text-cool-500 font-ui text-sm mt-1">
          The command center build: what shipped, what is in progress, and what follows. This page
          updates every session alongside the ledger and the changelog; the interstitial rows are
          hotfixes and workbench micro-sessions, kept so the history reads true.
        </p>
      </div>

      {/* Architecture primer */}
      <div className="bg-navy text-white rounded-[9px] p-5 mb-6">
        <h2 className="font-heading font-bold text-white text-base mb-2">Three-layer architecture</h2>
        <ul className="text-sm font-ui text-cool-300 space-y-1.5">
          <li>
            <span className="text-white font-semibold">Zoho CRM</span> stays the system of record
            for relationships, stages, and tasks.
          </li>
          <li>
            <span className="text-white font-semibold">fox-underwriting workbench</span> (separate
            repo and Supabase project) is the system of record for underwriting truth: evidence,
            calcs, conditions, flags, reviews, audit log.
          </li>
          <li>
            <span className="text-white font-semibold">This portal</span> reads both through a
            database-enforced read-only role. Every decision write flows through the gates API;
            workbench logic is never re-implemented here.
          </li>
        </ul>
      </div>

      <div className="space-y-4">
        {SESSIONS.map(s => (
          <div key={s.n} className="bg-white border border-cool-200 rounded-[9px] p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-heading text-navy font-bold">Session {s.n}</span>
              <span className="font-ui text-cool-700">{s.title}</span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[s.status].cls}`}
              >
                {STATUS_CHIP[s.status].label}
              </span>
              <span className="text-[11px] text-cool-500 ml-auto">{s.repo}</span>
            </div>
            <ul className="mt-2 text-sm font-ui text-cool-600 list-disc pl-5 space-y-1">
              {s.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-cool-50 border border-cool-200 rounded-[9px] p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-navy font-bold text-lg">&#10003;</span>
          <h2 className="font-heading text-navy font-bold text-base">The original map is complete.</h2>
        </div>
        <p className="text-sm font-ui text-cool-600">
          Nine sessions (plus the hotfix and the workbench micro-sessions) took the command center
          from an audit to an installable, multi-user, demo-ready operations platform. What follows
          is the living forward list — the side-quests and follow-ups decided along the way.
        </p>
      </div>

      <div className="mt-6 bg-white border border-cool-200 rounded-[9px] p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Forward backlog</h2>
        <ul className="space-y-3">
          {BACKLOG.map(b => (
            <li key={b.title} className="text-sm font-ui">
              <span className="text-navy font-semibold">{b.title}</span>
              <span className="text-cool-500"> — {b.note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 pt-3 border-t border-cool-100 text-xs text-cool-500">
          Tracked as decided; this page updates each session. Section names in the sidebar are
          stable; a rename requires a CLAUDE.md note.
        </p>
      </div>
    </div>
  )
}
