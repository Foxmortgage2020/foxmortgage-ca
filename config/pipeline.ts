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
// excluded from volume and weighting (49 property-tracking records live
// under Additional Properties).
export const SUMMARY_STAGES = ['Additional Properties'] as const

// Stages that count as funded production. Both spellings are live in Zoho:
// 'Mortgage Funded' carries the pre-2026 history, 'Funded' carries 2026+.
export const FUNDED_STAGES = ['Mortgage Funded', 'Funded'] as const

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

export function isSummaryStage(stage: string): boolean {
  return (SUMMARY_STAGES as readonly string[]).includes(stage)
}

export function isFundedStage(stage: string): boolean {
  return (FUNDED_STAGES as readonly string[]).includes(stage)
}
