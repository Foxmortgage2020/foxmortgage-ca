// The comp model (Session 7): the ONLY estimate source for revenue math.
// Every revenue figure on every page traces to either a real Zoho field
// (Total_Commission > 0, the actual) or this model — never a third source.
//
// The estimate mirrors the commission formula verified live in Part 1
// discovery (checked to the cent on three funded deals):
//   net commission = Amount x (BPS + VB_BPS)/10000 x (1 - Split_to_Brokerage_Network)
// The model supplies expected BPS by lender (classification first, then a
// default) and the expected network split. Rows marked confirmed: false
// render a "confirm bps" chip, exactly like the compliance date
// placeholders — Michael edits the numbers here and the forecast moves
// (unit-tested in tests/revenue.test.ts).
//
// Versioned like the agent prompt and the call rubric: bump the version
// with every value change and add a changelog note.

export const COMP_MODEL_VERSION = 1

export interface CompModelRow {
  label: string
  // Match keys against the deal, first match wins, top to bottom:
  // lenderName is a case-insensitive substring of Zoho Lender_Name;
  // classification is an exact Lender_Classification value.
  match: { lenderName?: string; classification?: string }
  bps: number
  // false renders the "confirm bps" chip; flip to true once Michael
  // confirms the number.
  confirmed: boolean
  note?: string
}

export interface CompModel {
  version: number
  rows: CompModelRow[]
  // Used when no row matches (most deals: Lender_Name coverage on funded
  // files was 27.3% at discovery time). Seeded near the observed median
  // of real BPS values (75 to 200 across six funded deals).
  defaultBps: { bps: number; confirmed: boolean }
  // Share of gross commission that goes to the brokerage network.
  // Observed live: 0.15 on 2026 fundings, 0.25 on some 2025 files.
  networkSplit: { value: number; confirmed: boolean }
  // Future comp-engine hook: the practice agent's share of net commission
  // once the practice has more than one agent. Multi-agent splits become
  // a config evolution (per-agent rows), not a redesign. Today: 1.0.
  agentSplit: number
}

export const COMP_MODEL: CompModel = {
  version: COMP_MODEL_VERSION,
  rows: [
    {
      label: 'Monoline lenders',
      match: { classification: 'Monoline' },
      bps: 105,
      confirmed: false,
      note: 'Observed prime monoline files ran 75 to 150 bps.',
    },
    {
      label: 'Private lenders',
      match: { classification: 'private_lender' },
      bps: 200,
      confirmed: false,
      note: 'Private files often carry a flat Brokerage_Fee instead of bps; this approximates it.',
    },
  ],
  defaultBps: { bps: 110, confirmed: false },
  networkSplit: { value: 0.15, confirmed: false },
  agentSplit: 1.0,
}
