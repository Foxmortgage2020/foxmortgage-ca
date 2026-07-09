// In-memory store for bookkeeping dry-run log entries. Extracted from
// app/api/bookkeeping/dry-run-log/route.ts so the admin Status page can
// read the same store the n8n POST writes to (route files may only export
// HTTP handlers).
//
// Persistence model unchanged: module scope, per serverless instance, last
// 500 entries. A cold start or deploy resets it — the Status page says so.

export interface DryRunEntry {
  timestamp: string
  transaction_id: string
  vendor_name: string
  amount: number
  intended_account: string
  memo_tag: string
  confidence: number
  match_method: string
  would_write: boolean
}

const dryRunLog: DryRunEntry[] = []

export function addDryRunEntry(entry: DryRunEntry): void {
  dryRunLog.push(entry)
  // Keep last 500 entries
  if (dryRunLog.length > 500) dryRunLog.splice(0, dryRunLog.length - 500)
}

// Newest first.
export function listDryRunEntries(limit: number): DryRunEntry[] {
  return dryRunLog.slice(-limit).reverse()
}
