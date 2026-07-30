# Run report, setup phase, wide extraction run

Date: 2026-07-27
Working folder: /Users/user/Desktop/foxmortgage-ca/journey
Status: STOPPED at setup step 5. No extractions were written.

## Verdict in one line

Zero of the 36 transcript .txt files exist. Not in this folder, not anywhere on the machine. The corpus is complete, but it is still in PDF form and has never been converted to text.

## What is present and correct

reference-pack.zip unzipped cleanly into this folder. All eight expected files are here and were left unmodified:

- schema-A-mortgage-process.md
- schema-B-ai-automation.md
- extract-M01-chad-wilson.md
- extract-M02-brm-model-713.md
- extract-M03-team-models.md
- extract-A01-b2b-outreach.md
- extract-A02-skills-over-agents.md
- corpus-manifest.md

Nothing in the reference pack is missing. No schema or example had to be reconstructed.

## What is missing

All 36 transcript .txt files. Count present in the Journey folder: 0 of 36. The threshold to proceed was 30.

## Where the corpus actually is

/Users/user/Desktop/Transcripts holds exactly 36 PDF files. Every one of them maps 1 to 1 onto a manifest row, with no orphans on either side and no ambiguity. The mapping was read off the filenames, not guessed.

This corrects the assumption in the run brief. The brief expected the .txt files to be sitting in the conversion folder waiting to be moved in. They are not. The conversion step itself never ran. There is nothing to move.

Searched read only, no files outside this folder were changed: ~/Desktop, ~/Documents, ~/Downloads. Zero .txt matches for any manifest filename.

## Why conversion is not a trivial copy

Two findings from a read only probe of the PDFs:

1. Good news. The PDFs carry a real text layer. Sampled files showed 23 of 27, 24 of 28, and 43 of 47 content streams bearing text operators. These are not scanned page images, so no OCR is required.
2. Blocker. The text is written with subset fonts using custom glyph ids, so the raw stream decodes to sequences like 01, 02, 03 rather than letters. Recovering readable text requires a library that resolves the ToUnicode CMap. A regex or naive byte scrape will produce garbage.

No such tool is installed on this machine. Checked and absent: pdftotext, mutool, qpdf, pypdf, pymupdf, pdfminer. Python 3 itself is present at /opt/homebrew/bin/python3.

## What unblocks the run

One of these, then the 36 conversions, then the .txt files land in this Journey folder:

```bash
pip3 install pypdf
```

```bash
brew install poppler
```

I did not run either. Installing software and reading and writing files outside this Journey folder both sit outside the boundary set for this session, so that call is yours. If you want me to do the conversion, say so and I will, naming every file I touch.

## Full file map, 36 PDFs to 36 manifest rows

Source folder for all rows below: /Users/user/Desktop/Transcripts

### Mortgage process, Schema A

| ID | Manifest expects | PDF present |
|---|---|---|
| M-01 | How_Chad_Wilson_Closes_300_Files... .txt | How_Chad_Wilson_Closes_300_Files_a_Year_With_a_Team_of_Three.mp3.pdf |
| skip | How_Chad_Wilson... __1_.txt | How_Chad_Wilson_Closes_300_Files_a_Year_With_a_Team_of_Three.mp3 (1).pdf |
| M-02 | 713-_You_Don_t_Need_a_Bigger_Team... | 713-_You_Don_t_Need_a_Bigger_Team_You_Need_a_Better_Model9hfgr.pdf |
| M-03 | Celebrity__Point_Guard__or_Dentist... | Celebrity__Point_Guard__or_Dentist__What_s_Your_Mortgage_Tea.mp3.pdf |
| M-04 | How_Changing_Your_Business_Model... | How_Changing_Your_Business_Model_Can_Improve_Your_Business_-.mp3.pdf |
| M-05 | How_This_Broker_Killed_Discovery_Calls... | How_This_Broker_Killed_Discovery_Calls__Boosted_Trust____Clo.mp3.pdf |
| M-06 | How_to_Fund__100__Million_a_year... | How_to_Fund__100__Million_a_year_and_work_24_hours_a_week_-_.mp3.pdf |
| M-07 | I_Love_Mortgage_Brokering_Ep_84__Chad_Oyhenart... | I_Love_Mortgage_Brokering_Ep_84__Chad_Oyhenart.mp3.pdf |
| M-08 | ILMB_Live_8__How_Jim_Tourloukis_Handles_800_Deals... | ILMB_Live_8__How_Jim_Tourloukis_Handles_800_Deals_A_Year.mp3.pdf |
| M-09 | ILMB-P-0061.txt | ILMB-P-0061.pdf |
| M-10 | ILMB-P-0153_audio.txt | ILMB-P-0153_audio.pdf |
| M-11 | ILMB-P-0158_Audio6xe6z.txt | ILMB-P-0158_Audio6xe6z.pdf |
| M-12 | ILMB-P-0169.txt | ILMB-P-0169.pdf |
| M-13 | ILMB-P-0172_2.txt | ILMB-P-0172_2.pdf |
| M-14 | ILMB-P-0178.txt | ILMB-P-0178.pdf |
| M-15 | ILMB-P-0180_1.txt | ILMB-P-0180_1.pdf |
| M-16 | Monday_Episode_07-06-269vybm.txt | Monday_Episode_07-06-269vybm.pdf |
| M-17 | What_Scaling_to_260_Deals_Taught_Her... | What_Scaling_to_260_Deals_Taught_Her_About_Burning_Out_and_O.mp3.pdf |
| M-18 | When_Success_Steals_Your_Freedom_with_Geri_Janes... | When_Success_Steals_Your_Freedom_with_Geri_Janes.mp3.pdf |
| M-19 | Why_Every_Canadian_Broker_Needs_to_Know_About_Ownwell... | Why_Every_Canadian_Broker_Needs_to_Know_About_Ownwell_with_D.mp3.pdf |
| M-20 | You_Don_t_Have_a_Lead_Problem...esv2-speech... | You_Don_t_Have_a_Lead_Problem_You_Have_a_Business_Model_Problem-esv2-speech-100pbtos7.pdf |

### AI automation, Schema B

| ID | Manifest expects | PDF present |
|---|---|---|
| A-01 | How_I_Use_Claude_Code_For_B2B_Outreach__35__Reply_Rate... | How_I_Use_Claude_Code_For_B2B_Outreach__35__Reply_Rate_.mp3.pdf |
| A-02 | STOP_Building_AI_Agents__Do_THIS_Instead... | STOP_Building_AI_Agents._Do_THIS_Instead..mp3.pdf |
| A-03 | AI_is_way_Underhyped... | AI_is_way_Underhyped._He_Runs_His_Entire_Marketing_Team_with.mp3.pdf |
| A-04 | A_Practical_AI_Agent_Workflow_For_Companies_In_2027... | A_Practical_AI_Agent_Workflow_For_Companies_In_2027__Guide_.mp3.pdf |
| A-05 | Claude_Cowork_Just_Changed_Sales_Forever... | Claude_Cowork_Just_Changed_Sales_Forever.mp3.pdf |
| A-06 | Codex__Build_Your_Full_AI_Marketing_Team__Agents___Skills... | Codex__Build_Your_Full_AI_Marketing_Team__Agents___Skills_.mp3.pdf |
| A-07 | How_I_Built_an_AI_Sales_Agent_with_Claude_Code___ElevenLabs... | How_I_Built_an_AI_Sales_Agent_with_Claude_Code___ElevenLabs_.mp3.pdf |
| A-08 | How_to_Set_Up_an_AI_Sales_Agent___Automate_Your_Outreach... | How_to_Set_Up_an_AI_Sales_Agent___Automate_Your_Outreach.mp3.pdf |
| A-09 | I_Built_An__80K_Sales_Rep_With_Claude_Code... | I_Built_An__80K_Sales_Rep_With_Claude_Code___It_s_FREE.mp3.pdf |
| A-10 | I_Built_An_Entire_AI_Sales_Team_With_Claude_Code_In_16_Minut... | I_Built_An_Entire_AI_Sales_Team_With_Claude_Code_In_16_Minut.mp3.pdf |
| A-11 | Most_Valuable_Skill_of_2026__Managing_AI_Agents... | Most_Valuable_Skill_of_2026__Managing_AI_Agents.mp3.pdf |
| A-12 | My_Voice_AI_Agent_Negotiated_800__Business_Deals_in_1_Day... | My_Voice_AI_Agent_Negotiated_800__Business_Deals_in_1_Day__F.mp3.pdf |
| A-13 | Sales_Reps_Are_Wasting_2_Hours_a_Day_Without_These_AI_Workfl... | Sales_Reps_Are_Wasting_2_Hours_a_Day_Without_These_AI_Workfl.mp3.pdf |
| A-14 | This_Claude_Second_Brain_Setup_Will_Change_How_You_Do_Sales... | This_Claude_Second_Brain_Setup_Will_Change_How_You_Do_Sales_.mp3.pdf |
| A-15 | We_replaced_our_sales_team_with_20_AI_agents_here_s_what_hap... | We_replaced_our_sales_team_with_20_AI_agents_here_s_what_hap.mp3.pdf |

## State of this folder at stop

Created by this session: run-report-setup.md, plus the eight files unzipped from reference-pack.zip.

Not created: the extractions/ subdirectory. Setup step 6 comes after the step 5 stop, so it was not run. It costs nothing to redo on resume, since copying the five worked examples in is idempotent.

Modified: nothing. corpus-manifest.md still shows all 30 rows as pending. No schema and no worked example was touched. No git command was run.

## Unresolved

- Manifest word counts cannot be checked against the .txt files until conversion happens.
- M-06 and M-14 identities stay unconfirmed. Confirming them needs the transcript text.
- Whether the duplicate Chad Wilson PDF is byte identical to M-01 was not verified. Sizes were not compared, and the manifest already marks it skip, so it does not matter for the run.
