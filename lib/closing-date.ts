// One closing-date truth (B8b Task 0, 2026-07-18).
//
// B8a proved the workbench `deals.closing_date` (Finmo-synced) is the better
// source than Zoho's `Closing_Date`: Zoho's field is null on a refinance and
// can carry a stale purchase date, while the workbench holds the real day
// (F053107 closes July 28; Zoho said nothing; the workbench knew).
//
// Before this helper there were THREE readers with THREE answers:
//   - the client page (lib/client-file.ts) was workbench-first (the B8a fix),
//   - the underwriting list/board (app/portal/admin/underwriting) was
//     Zoho-FIRST — a stale Zoho date would win over a fresh workbench one,
//   - the deal-room header read the workbench date alone, with no fallback.
// A file could therefore sort and render on one date in the list and a
// different date on the client's own page. This is the one answer they share.
//
// The rule: the workbench date when present, the Zoho date only as a fallback.
// Pure, so it tests in node.
export function resolveClosingDate(
  workbenchClosing: string | null | undefined,
  zohoClosing: string | null | undefined,
): string | null {
  const w = typeof workbenchClosing === 'string' && workbenchClosing.trim() ? workbenchClosing : null
  const z = typeof zohoClosing === 'string' && zohoClosing.trim() ? zohoClosing : null
  return w ?? z
}
