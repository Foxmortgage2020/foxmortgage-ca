# Wide extraction run, map phase, cumulative run report

Date: 2026-07-27 (session one and session two combined)
Working folder: /Users/user/Desktop/foxmortgage-ca/journey

## Headline

The map phase is **COMPLETE**. All 35 unique transcripts have an extraction file. Session one produced 13, session two produced the remaining 22 using one subagent per transcript so each was read in a disposable context.

Every one of the 35 files was verified mechanically after writing: schema headers present in the schema's order, word count at or under 450, and zero em dashes, en dashes, semicolons or exclamation points.

One file fails the word cap: **M-01, the pilot, at 635 words.** It was carried in unchanged by instruction and was not modified. See "unresolved" below, because it caused a real problem this session.

## Status table, all 35 IDs

| ID | File | Status | Words | Flags |
|---|---|---|---|---|
| M-01 | How_Chad_Wilson..._mp3.txt | done, pilot | 635 | OVER CAP, pilot, not modified by instruction |
| skip | How_Chad_Wilson..._mp3__1_.txt | skipped | n/a | byte-identical duplicate, confirmed session one |
| M-02 | 713-_You_Don_t_Need_a_Bigger_Team... | done, pilot | 355 | |
| M-03 | Celebrity__Point_Guard__or_Dentist... | done, pilot | 378 | |
| M-04 | How_Changing_Your_Business_Model... | done | 449 | |
| M-05 | How_This_Broker_Killed_Discovery_Calls... | done | 449 | speaker is Atkins, not Atkinson (found in session two) |
| M-06 | How_to_Fund__100__Million_a_year... | done | 450 | identity corrected, US speaker |
| M-07 | I_Love_Mortgage_Brokering_Ep_84... | done | 446 | two schema sections empty |
| M-08 | ILMB_Live_8__Jim_Tourloukis... | done | 450 | |
| M-09 | ILMB-P-0061.txt | done | 449 | same speaker as M-08 |
| M-10 | ILMB-P-0153_audio.txt | done | 449 | Atkin arc 1 of 5 |
| M-11 | ILMB-P-0158_Audio6xe6z.txt | done | 448 | Atkin arc 2 of 5 |
| M-12 | ILMB-P-0169.txt | done | 441 | Atkin arc 3 of 5, identity confirmed |
| M-13 | ILMB-P-0172_2.txt | done | 445 | identity corrected to Atkins |
| M-14 | ILMB-P-0178.txt | done | 446 | identity resolved to Atkins, no episode number |
| M-15 | ILMB-P-0180_1.txt | done | 444 | Atkin arc 4 of 5 |
| M-16 | Monday_Episode_07-06-269vybm.txt | done | 450 | Atkin arc 5 of 5, surname NOT in transcript |
| M-17 | What_Scaling_to_260_Deals... | done | 445 | identity corrected to Jolene |
| M-18 | When_Success_Steals_Your_Freedom... | done | 450 | transcript spells her Jerry |
| M-19 | Why_Every_Canadian_Broker...Ownwell... | done | 444 | vendor content, name corrected to McDonald |
| M-20 | You_Don_t_Have_a_Lead_Problem... | done | 444 | Peckford solo, Ep 711 unverified |
| A-01 | How_I_Use_Claude_Code_For_B2B_Outreach... | done, pilot | 393 | |
| A-02 | STOP_Building_AI_Agents... | done, pilot | 331 | |
| A-03 | AI_is_way_Underhyped... | done | 448 | US speaker |
| A-04 | A_Practical_AI_Agent_Workflow... | done | 437 | |
| A-05 | Claude_Cowork_Just_Changed_Sales_Forever... | done | 442 | nationality not stated |
| A-06 | Codex__Build_Your_Full_AI_Marketing_Team... | done | 450 | nationality not stated |
| A-07 | How_I_Built_an_AI_Sales_Agent... | done | 449 | speaker based in Asia |
| A-08 | How_to_Set_Up_an_AI_Sales_Agent... | done | 450 | vendor webinar |
| A-09 | I_Built_An__80K_Sales_Rep... | done | 449 | nationality not stated |
| A-10 | I_Built_An_Entire_AI_Sales_Team... | done | 437 | manifest title overstates, it is one agent |
| A-11 | Most_Valuable_Skill_of_2026... | done | 449 | US speaker |
| A-12 | My_Voice_AI_Agent_Negotiated_800... | done | 449 | RE-RUN, first attempt was fabricated, see below |
| A-13 | Sales_Reps_Are_Wasting_2_Hours_a_Day... | done | 448 | US speaker |
| A-14 | This_Claude_Second_Brain_Setup... | done | 442 | demo metrics are admitted fakes |
| A-15 | We_replaced_our_sales_team_with_20_AI_agents... | done | 450 | triple length source, 21,554 words |

## Identity confirmations and corrections

Corrections found in session two:

- **M-13 and M-14 CORRECTED to Taylor Atkins**, not Atkinson. The host says Atkins. This also corrects **M-05**, written in session one under the old spelling. The M-05 file was not edited, per the instruction not to modify existing extractions, so its filename and header still read Atkinson. The reduce should treat M-05, M-13 and M-14 as one person.
- **M-14 identity RESOLVED.** The manifest guessed "likely Taylor Ep 4". The speaker is Taylor Atkins, but **no episode number is stated anywhere in the transcript**, so the Ep 4 half of the guess stays unverified.
- **M-16 PARTIAL.** The speaker is "Nate", an Ontario BRX mortgage agent, and the content sits cleanly as arc episode five. But **the transcript never states his surname and never gives an episode number**, so "Nate Atkin, Ep 728" is inference from the arc, not confirmation from the file.
- **M-17 CORRECTED to Jolene Cloutier**, not Joline.
- **M-19 CORRECTED to Dan McDonald**, not MacDonald. He is not a broker. He founded and sells Ownwell, so the entire episode is vendor content.
- **M-20 CONFIRMED** as a Peckford solo, but no episode number is stated, so Ep 711 is unverified.
- **M-12 and M-15 CONFIRMED** as Nate Atkin.

Speakers flagged non-Canadian, carried forward and new:

- **M-06** Wally Elibiary, Dallas Fort Worth, US loan officer (session one).
- **A-03** Jacob Bank, San Francisco.
- **A-07** operates from Asia on ICT time.
- **A-11** Ryan Carson, Connecticut, US.
- **A-13** US enterprise account executive.
- **A-15** Jason Lemkin, SaaStr, US.
- **A-05, A-06, A-08, A-09, A-10, A-14** nationality never stated. Recorded as not confirmed Canadian rather than assumed either way.

## Files moved to superseded/

26 hand-copied .txt files whose names are not in the manifest were moved to `superseded/`. They use a dot before mp3 (`....mp3.txt`) where the manifest set uses an underscore (`..._mp3.txt`). None were read or deleted. After the move, 36 .txt files remain in the folder, exactly matching the manifest.

AI_is_way_Underhyped._He_Runs_His_Entire_Marketing_Team_with.mp3.txt, A_Practical_AI_Agent_Workflow_For_Companies_In_2027__Guide_.mp3.txt, Celebrity__Point_Guard__or_Dentist__What_s_Your_Mortgage_Tea.mp3.txt, Claude_Cowork_Just_Changed_Sales_Forever.mp3.txt, Codex__Build_Your_Full_AI_Marketing_Team__Agents___Skills_.mp3.txt, How_Chad_Wilson_Closes_300_Files_a_Year_With_a_Team_of_Three.mp3 (1).txt, How_Chad_Wilson_Closes_300_Files_a_Year_With_a_Team_of_Three.mp3.txt, How_Changing_Your_Business_Model_Can_Improve_Your_Business_-.mp3.txt, How_I_Built_an_AI_Sales_Agent_with_Claude_Code___ElevenLabs_.mp3.txt, How_I_Use_Claude_Code_For_B2B_Outreach__35__Reply_Rate_.mp3.txt, How_This_Broker_Killed_Discovery_Calls__Boosted_Trust____Clo.mp3.txt, How_to_Fund__100__Million_a_year_and_work_24_hours_a_week_-_.mp3.txt, How_to_Set_Up_an_AI_Sales_Agent___Automate_Your_Outreach.mp3.txt, ILMB_Live_8__How_Jim_Tourloukis_Handles_800_Deals_A_Year.mp3.txt, I_Built_An_Entire_AI_Sales_Team_With_Claude_Code_In_16_Minut.mp3.txt, I_Built_An__80K_Sales_Rep_With_Claude_Code___It_s_FREE.mp3.txt, I_Love_Mortgage_Brokering_Ep_84__Chad_Oyhenart.mp3.txt, Most_Valuable_Skill_of_2026__Managing_AI_Agents.mp3.txt, My_Voice_AI_Agent_Negotiated_800__Business_Deals_in_1_Day__F.mp3.txt, STOP_Building_AI_Agents._Do_THIS_Instead..mp3.txt, Sales_Reps_Are_Wasting_2_Hours_a_Day_Without_These_AI_Workfl.mp3.txt, This_Claude_Second_Brain_Setup_Will_Change_How_You_Do_Sales_.mp3.txt, We_replaced_our_sales_team_with_20_AI_agents_here_s_what_hap.mp3.txt, What_Scaling_to_260_Deals_Taught_Her_About_Burning_Out_and_O.mp3.txt, When_Success_Steals_Your_Freedom_with_Geri_Janes.mp3.txt, Why_Every_Canadian_Broker_Needs_to_Know_About_Ownwell_with_D.mp3.txt

## Did not fit the schema, cumulative

From session one:

- **M-07, Gates empty.** Chad Oyhenart states no rule that must hold before a file advances. Recorded as "None stated" rather than manufactured.
- **M-07, Delegation map empty.** Owner-operator with five brokers under him, no support staff or task split described anywhere.
- **M-07 generally.** Recorded 21 October 2015, by far the oldest file. Its practices predate the current renewal cycle, so weight it down.
- **M-11 is a coaching episode, not a process episode.** Almost everything lands under MODEL, because the subject is hiring, not files.

From session two:

- **M-12, M-15, M-16 are also coaching episodes.** The same MODEL-heavy shape as M-11. Four of the five Atkin arc files describe how to build the business rather than how a file moves, so the arc contributes structure, not journey detail.
- **M-19 is vendor content, not practice.** Every "Journey practice" in that file is a product mechanic the vendor recommends, and no figure in it is observed. It is shaped like an M file but should be read as an A file with a sales incentive.
- **M-20 has no Delegation map worth the name.** A solo host episode about a business model, so the delegation content is two concierge callers and nothing else.
- **A-12 required a re-run.** See below.
- **Schema B has no Gates section**, so the A files record their control points only under Human-in-the-loop. Where a video claims full automation (A-07, A-08, A-12) that section records the absence and names the missing quality control, which is the most useful line in those three files.

## Worth flagging for the reduce

1. **Tourloukis contradicts himself across M-08 and M-09.** In M-08 his CRM touches clients 8 to 10 times a year. In M-09 he calls exactly that kind of touching worthless and contacts only when a campaign finds value.
2. **M-13 corrects the reading in M-01 and M-05 that Taylor kills renewals.** He does not. He takes about five renewal calls a month, coaches the client, tells them to take the bank offer if it wins, then converts the call into a monitoring signup.
3. **The renewal thesis now splits three ways, not two.** Kaminsky and Tourloukis run renewals as the growth engine, Atkins turns most away, and Peckford in M-20 argues renewal-driven database marketing has stopped paying entirely and the database should feed wealth partners instead.
4. **Every open-rate and click-rate figure in the corpus traces to one interested vendor.** Ownwell is a paid sponsor read in six M files and the whole subject of M-19, and its founder also supplies the $44,000 claim inside M-13. Peckford is separately a paid party in several episodes. Treat all of it as marketing.
5. **The single most computable mechanic is Tourloukis's thirteen month play.** Date arithmetic against maturity plus one lender fact, whether the incumbent carries a six month product.
6. **Compute the saving before contact, independently reinvented.** Tourloukis's spreadsheet, Atkins ranking by interest saved net of penalty, and Ownwell's equity report all open the conversation with a dollar figure the client did not ask for.
7. **The Atkins backfill is the most Fox-actionable mechanic in the corpus, and it comes with its own failure.** 53 of 58 new monitoring seats came from statements already sitting in his own files, while a 140-person mailout produced 2 referrals. Detection automates, the opinion in the email does not.
8. **Hiring order disagrees four ways.** Atkin and Peckford say underwriter first, Atkins says a second fulfilment generalist and explicitly not an underwriter, Janes hired document specialists who touch nothing before commitment, and Cloutier bought a process builder before any person.
9. **Discovery calls are contested.** Chad Wilson and the point-guard model protect them, Atkins deletes them via a podcast, Tourloukis compresses to seven minutes and disqualifies inside it, Janes runs a 30 minute fit call.
10. **Commitment filters recur in different clothes.** Tourloukis takes a credit card, Atkin puts a form step in a job posting, Janes demands a near-complete document package before she will meet, Chad Wilson refuses to chase. All make the other party spend something first.
11. **Working hours vary by a factor of three with no visible effect on volume**, and Elibiary's 24 hour week at 200 million rests on six full-time staff, so it is not a solo result.
12. **Across the A files, every claim of full automation comes with no quality control and the worst compliance posture**, while A-15, the only genuine retrospective, reports output flat with efficiency the only gain, permanent QA, and 10 to 15 hours a week of human oversight. Read A-15 as the counterweight to every headline in the other fourteen.

## Missing or unresolved, stated plainly

1. **M-01 is 635 words, 41 percent over the cap, and it was the calibration example handed to the first batch of subagents.** They matched its length, so all five came back between 463 and 806 words and needed a trim loop before they passed. Later batches were given M-11 (448 words) plus an explicit per-section word budget and landed inside the cap first time. M-01 was left unmodified as instructed, but it should be re-cut before the reduce, or at minimum never used as a calibration reference again.
2. **A-12's first extraction was fabricated.** That subagent returned a complete, plausible-looking extraction in 22 seconds having made zero tool calls, so it never opened the transcript and invented the content from the filename. It was discarded and re-dispatched with an explicit instruction to read the file first. The re-run names the actual people, product, tools and failure modes, and is the version on disk. Worth knowing that this failure mode is silent and looks like a normal result.
3. **M-16's speaker is not named in its own transcript.** The arc placement is sound but the surname is inference. If the reduce needs to assert "Nate Atkin, five episodes", that fifth attribution rests on continuity, not on the file.
4. **M-05 still carries the Atkinson spelling** in its filename and header, now known to be wrong. Not corrected here because the instruction was not to modify the 13 existing extraction files.
5. **Episode numbers are unverified for M-14, M-16 and M-20.** The manifest's guesses may be right, but none of the three transcripts states one.
6. **Nothing in this corpus is verified.** Every M-file number is a broker's own account of their own business, and every A-file claim carries a seller's incentive. The extractions tag this, but the reduce should not treat any figure as fact.
7. **The reduce has not been started.** That was out of scope for this session by instruction.
