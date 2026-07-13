// Pipeline stage configuration for the admin command center.
//
// Sources of truth, in order:
//   1. The Daily Deal Briefing n8n workflow (dh1qIttAuctSQ7L0) proved the
//      display ordering and the original terminal-stage filter.
//   2. The live Zoho Stage picklist (verified 2026-07-09 via a grouped
//      stage count) contains stages neither CLAUDE.md vocabulary listed:
//      Pending, Options, Approved, Funded, Cancelled, Additional Properties.
//
// Two DELIBERATE additions to the briefing's terminal filter, made so the
// Home page never double-counts:
//   - 'Funded' — the stage 2026 fundings actually carry ("Mortgage Funded"
//     stopped being used after 2025). Leaving it open would show funded
//     deals as pipeline AND count them in funded YTD.
//   - 'Cancelled' — a dead-end stage; not forward pipeline.
// Recorded in docs/portal-audit-2026-07.md and CLAUDE.md.

// Display ordering proven in the Daily Deal Briefing. Open stages not in
// this list render after it, alphabetically, so new picklist values are
// never silently hidden.
export const PIPELINE_STAGE_ORDER = [
  'Pending',
  'Collecting Documentation',
  'Options',
  'Conditionally Approved',
  'Underwriting In Progress',
] as const

// Stages that end a file's forward journey. Excluded from the pipeline
// view and from weighted pipeline volume.
export const TERMINAL_STAGES = [
  'Archive',
  'Closed',
  'Lost',
  'Mortgage Funded',
  'Mortgage Lost',
  // Additive beyond the briefing filter (see header note):
  'Funded',
  'Cancelled',
] as const

// Tracking buckets, not pipeline. Shown as a summary count row only and
// excluded from volume and weighting. These are property-tracking records
// attached to other files (e.g. "64 Starview Crescent - BRXM-F020743"),
// not deals; counting them as pipeline is the single largest pollutant.
// Live count 2026-07-12: 49 records in the Additional Properties stage.
// NOTE: a related class of ~7 records is *mis-staged* under Options with a
// "... - Additional Property" name (created 2022, no close date). The
// stage filter cannot catch those; the staleness rule below does (they are
// all long dormant). See lib/pipeline-hygiene.ts.
export const SUMMARY_STAGES = ['Additional Properties'] as const

// Stages that count as funded production. Both spellings are live in Zoho:
// 'Mortgage Funded' carries the pre-2026 history (48 deals, through Oct 2025),
// 'Funded' carries 2026+ (6 deals). Every funded query MUST run through
// isFundedStage so both spellings are covered — grep-verified 2026-07-12.
export const FUNDED_STAGES = ['Mortgage Funded', 'Funded'] as const

// ─── Pipeline staleness (self-defending against un-groomed debt) ────────────
// Deals that never funded and were never marked lost accumulate in open
// stages (Options, Pending) and silently inflate every open-pipeline figure.
// At discovery (2026-07-12) 23 of 31 open deals were this class of debt: 15
// genuine 2021-2022 files with past close dates, 7 property records mis-staged
// in Options, and one 2024 file with a rolled-forward future close date.
//
// A deal in an open stage is treated as STALE (excluded from active pipeline,
// counted in a visible, groomable stale bucket) when EITHER:
//   - its Closing_Date is more than STALE_CLOSING_DAYS in the past, or
//   - it was Created more than STALE_CREATED_DAYS ago and is still open.
//
// The second arm stands in for the brief's "no activity in 180 days". A true
// last-activity signal is unavailable: Last_Activity_Time is Finmo-sync
// populated with one shared timestamp on every deal, and Stage_Modified_Time
// is null everywhere (CLAUDE.md, verified live). Deal age since creation is
// the only trustworthy proxy for a file that has sat open with no forward
// movement. Stale means surfaced-for-grooming, never deleted; a legitimately
// slow file that trips the age arm stays fully visible in the stale bucket.
// The rule reconciles the live active pipeline to exactly 8 files
// ($4,714,240), the confirmed answer. Pure predicate: lib/pipeline-hygiene.ts.
export const STALE_CLOSING_DAYS = 90
export const STALE_CREATED_DAYS = 180

// Probability weights for the goal pacing widget's weighted pipeline.
// Open-stage volume times weight approximates expected funded volume.
export const STAGE_WEIGHTS: Record<string, number> = {
  // Seed defaults from the Session 1 brief:
  'Lead': 0.05,
  'Application Started': 0.1,
  'Collecting Documentation': 0.2,
  'Underwriting In Progress': 0.35,
  'Ready to Submit': 0.45,
  'Submitted to Lender': 0.55,
  'Conditionally Approved': 0.75,
  'Broker Complete': 0.9,
  // Additive mappings for live picklist stages the seed list predates.
  // Values keep the funnel monotonic; tune in place as real conversion
  // data accumulates.
  'Pending': 0.05,
  'Qualification': 0.05,
  'Options': 0.3,
  'Approved': 0.75,
}

export function isTerminalStage(stage: string): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(stage)
}

// ─── Workbench-side terminal semantics (Session 4) ──────────────────────────
// The workbench deals table carries its own stage vocabulary (lowercase,
// e.g. 'funded', 'underwriting') and a status column ('active' vs markers
// like 'superseded'). A terminal workbench deal stays fully visible in the
// deal list and deal room but never feeds urgency surfaces: the Home
// Needs Attention rail and the Approvals badge counts.

export const WORKBENCH_TERMINAL_STAGES = [
  'funded',
  'closed',
  'lost',
  'cancelled',
  'archived',
] as const

export function isTerminalWorkbenchDeal(deal: {
  status?: string | null
  stage?: string | null
}): boolean {
  if (deal.status && deal.status !== 'active') return true
  const stage = deal.stage?.toLowerCase() ?? ''
  return (WORKBENCH_TERMINAL_STAGES as readonly string[]).includes(stage)
}

export function isSummaryStage(stage: string): boolean {
  return (SUMMARY_STAGES as readonly string[]).includes(stage)
}

export function isFundedStage(stage: string): boolean {
  return (FUNDED_STAGES as readonly string[]).includes(stage)
}

// ─── Additional Properties CHILD records (property rows, never mortgages) ────
// The org attaches property-tracking rows to files under two NAME conventions
// (live vocabulary, 2026-07-13): "<Contact> - Additional Property" and
// "<address> - BRXM-Fxxxxx[ - first/second Mortgage]". Most sit in the
// Additional Properties stage (caught by isSummaryStage), but the class is
// one mis-stage away from any stage-filtered pool — 7 sit in Options today,
// and two children of a lost deal (BRXM-F021892) carry amounts and past
// maturity dates. Any pool that means "mortgages" must exclude them by NAME
// as well as by stage (Task 0c). Bare file-reference names ("BRXM-F024213",
// "IFMS - 109501") never match.
export function isAdditionalPropertyRecord(dealName: string): boolean {
  const name = dealName.trim()
  if (/additional propert/i.test(name)) return true
  if (/\s-\s*(first|second|third)\s+mortgage\s*$/i.test(name)) return true
  // An address-prefixed file reference ("22 Birch Ave - BRXM-F020729") is the
  // property-row naming convention; a real deal is the bare reference.
  if (/\S\s+-\s*(BRXM|IFMS)\s*-?\s*F?\d+/i.test(name) && !/^(BRXM|IFMS)\b/i.test(name)) return true
  return false
}

/** The renewal-pool membership rule (Task 0c): the Renewal Radar's pools —
 * lapsed included — derive from FUNDED-stage deals only (both legacy stage
 * spellings) and never from Additional Properties child records, whatever
 * stage a property row was left in. */
export function isRenewalPoolDeal(stage: string, dealName: string): boolean {
  return isFundedStage(stage) && !isAdditionalPropertyRecord(dealName)
}
