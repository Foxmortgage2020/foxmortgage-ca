// Practice milestones for the Practice History chart. Confirmed dates only;
// add a row here and it renders on the chart with no code change.
//
// These land at the RIGHT EDGE of the chart, on the current-year bar, and
// the chart renders them plainly. The honest reading is that five flat years
// precede the automation and the funded numbers cannot have responded yet:
// mortgages take 60 to 90 days and these systems are weeks old. No trend
// line, no projection, no visual device implies an inflection the data does
// not show. That restraint is the point of the chart.

export interface Milestone {
  // YYYY-MM (practice timezone). Month granularity is all the chart needs.
  month: string
  label: string
}

export const MILESTONES: Milestone[] = [
  { month: '2026-03', label: 'FoxSocial onboarded' },
  { month: '2026-07', label: 'FoxSocial at full operating capacity' },
  { month: '2026-07', label: 'AI underwriting department live' },
]

export function milestoneYear(m: Milestone): number {
  return Number(m.month.slice(0, 4))
}
