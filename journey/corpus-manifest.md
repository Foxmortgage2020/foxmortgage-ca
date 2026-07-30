# Corpus manifest, 36 files, 35 unique
186,600 words total. Schema A for M files, Schema B for A files. Status: done = pilot extraction exists.

## Mortgage-process (Schema A), 20 unique

| ID | File | Words | Identified as | Status |
|---|---|---|---|---|
| M-01 | How_Chad_Wilson_Closes_300_Files... .txt | 6,745 | Chad Wilson, Ep 730 | done |
| skip | How_Chad_Wilson... __1_.txt | 6,745 | exact duplicate of M-01 | skip |
| M-02 | 713-_You_Don_t_Need_a_Bigger_Team... | 1,656 | Peckford solo, Ep 713 BRM model | done |
| M-03 | Celebrity__Point_Guard__or_Dentist... | 2,373 | Peckford solo, team models | done |
| M-04 | How_Changing_Your_Business_Model... | 6,091 | Meredith Kaminsky | done |
| M-05 | How_This_Broker_Killed_Discovery_Calls... | 7,408 | Taylor Atkinson, podcast-as-filter | done |
| M-06 | How_to_Fund__100__Million_a_year_and_work_24_hours... | 7,206 | CORRECTED: Wally Elibiary, Dallas Fort Worth, US | done |
| M-07 | I_Love_Mortgage_Brokering_Ep_84__Chad_Oyhenart... | 5,285 | Chad Oyhenart, Ep 84 | done |
| M-08 | ILMB_Live_8__How_Jim_Tourloukis_Handles_800_Deals... | 8,130 | Jim Tourloukis, Live 8 | done |
| M-09 | ILMB-P-0061.txt | 6,419 | Tourloukis renewal replay, Ep 592/436 | done |
| M-10 | ILMB-P-0153_audio.txt | 10,870 | Nate Atkin $100M Journey Ep 1 | done |
| M-11 | ILMB-P-0158_Audio6xe6z.txt | 9,957 | Nate Atkin, hire an underwriter, Ep 2 | done |
| M-12 | ILMB-P-0169.txt | 8,504 | Nate Atkin, bottleneck and when to hire | pending |
| M-13 | ILMB-P-0172_2.txt | 6,735 | Taylor Atkinson series Ep 3, hidden leads | pending |
| M-14 | ILMB-P-0178.txt | 7,614 | complicated-files episode, likely Taylor Ep 4 | pending |
| M-15 | ILMB-P-0180_1.txt | 6,541 | Nate Atkin, delegation (cutting your own grass) | pending |
| M-16 | Monday_Episode_07-06-269vybm.txt | 6,382 | Nate Atkin Ep 5, $40M pipeline, Ep 728 | pending |
| M-17 | What_Scaling_to_260_Deals_Taught_Her... | 6,821 | Joline Cloutier | pending |
| M-18 | When_Success_Steals_Your_Freedom_with_Geri_Janes... | 5,602 | Geri Janes | pending |
| M-19 | Why_Every_Canadian_Broker_Needs_to_Know_About_Ownwell... | 5,615 | Dan MacDonald, Ownwell | pending |
| M-20 | You_Don_t_Have_a_Lead_Problem...esv2-speech... | 3,436 | Peckford solo, Ep 711 | pending |

## AI-automation (Schema B), 15 unique

| ID | File | Words | Status |
|---|---|---|---|
| A-01 | How_I_Use_Claude_Code_For_B2B_Outreach__35__Reply_Rate... | 2,227 | done |
| A-02 | STOP_Building_AI_Agents__Do_THIS_Instead... | 2,337 | done |
| A-03 | AI_is_way_Underhyped__He_Runs_His_Entire_Marketing_Team... | 3,376 | pending |
| A-04 | A_Practical_AI_Agent_Workflow_For_Companies_In_2027... | 4,508 | pending |
| A-05 | Claude_Cowork_Just_Changed_Sales_Forever... | 3,152 | pending |
| A-06 | Codex__Build_Your_Full_AI_Marketing_Team__Agents___Skills... | 9,288 | pending |
| A-07 | How_I_Built_an_AI_Sales_Agent_with_Claude_Code___ElevenLabs... | 3,805 | pending |
| A-08 | How_to_Set_Up_an_AI_Sales_Agent___Automate_Your_Outreach... | 8,820 | pending |
| A-09 | I_Built_An__80K_Sales_Rep_With_Claude_Code... | 3,329 | pending |
| A-10 | I_Built_An_Entire_AI_Sales_Team_With_Claude_Code_In_16_Minut... | 3,119 | pending |
| A-11 | Most_Valuable_Skill_of_2026__Managing_AI_Agents... | 7,514 | pending |
| A-12 | My_Voice_AI_Agent_Negotiated_800__Business_Deals_in_1_Day... | 3,784 | pending |
| A-13 | Sales_Reps_Are_Wasting_2_Hours_a_Day_Without_These_AI_Workfl... | 3,480 | pending |
| A-14 | This_Claude_Second_Brain_Setup_Will_Change_How_You_Do_Sales... | 5,408 | pending |
| A-15 | We_replaced_our_sales_team_with_20_AI_agents_here_s_what_hap... | 21,554 | pending |

## Notes for the wide run
- A-15 is triple normal length, budget accordingly.
- M-06 and M-14 identities are best guesses from openings, confirm in the extraction header.
- Five Nate Atkin episodes (M-10, M-11, M-12, M-15, M-16) form one arc. Extract individually, but the reduce step should treat them as one longitudinal case study.
- Ownwell appears as sponsor content in several M files and as the full subject of M-19. Tag sponsor segments with the incentive every time.
