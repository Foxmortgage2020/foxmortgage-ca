// Business-line P&L access (Session 7). The Part 1 discovery answer: NO
// server-side QBO path exists in this repo. The bookkeeping pipeline's
// QBO OAuth credential lives in n8n and covers the SANDBOX realm only;
// production API access waits on the Intuit app assessment, and sandbox
// numbers would be dishonest on a business P&L, so nothing here fakes it.
//
// What lights the tile, attempt-and-fallback style (zero portal changes
// once the path exists): set N8N_QBO_PNL_WEBHOOK_URL to a read-only n8n
// webhook that serves the JSON contract below from the production realm
// (once the Intuit assessment approves), or a future session adds direct
// QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_REFRESH_TOKEN / QBO_REALM_ID
// support here. WRITE_TO_QBO is untouched by all of this; the portal
// never writes to the books.
//
// Webhook JSON contract:
//   {
//     "generated_at": "2026-07-10T12:00:00Z",
//     "months": [
//       { "month": "2026-05", "classes": [
//         { "name": "Fox Mortgage", "revenue": 12000, "expenses": 3000, "net": 9000 }
//       ]}
//     ]
//   }

export interface PnlClassRow {
  name: string
  revenue: number
  expenses: number
  net: number
}

export interface PnlMonth {
  month: string
  classes: PnlClassRow[]
}

export type PnlResult =
  | { state: 'not-connected'; requirements: string[] }
  | { state: 'error'; message: string }
  | { state: 'ok'; months: PnlMonth[]; generatedAt: string | null }

export const PNL_REQUIREMENTS = [
  'An n8n read-only webhook serving P&L by QBO class for the trailing 3 months (JSON contract in lib/pnl.ts), plus N8N_QBO_PNL_WEBHOOK_URL on Vercel pointing at it.',
  'That webhook needs a production-realm QBO credential (realm 9341456900727321), which waits on the Intuit app assessment. The n8n credential that exists today is sandbox only.',
  'Alternative: direct QBO OAuth here (QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REFRESH_TOKEN, QBO_REALM_ID) — a future session wires it into this module.',
]

// Pure and unit-tested: a malformed payload returns null rather than a
// half-rendered tile.
export function parsePnlPayload(json: unknown): PnlMonth[] | null {
  if (!json || typeof json !== 'object') return null
  const months = (json as { months?: unknown }).months
  if (!Array.isArray(months) || months.length === 0) return null
  const out: PnlMonth[] = []
  for (const m of months) {
    if (!m || typeof m !== 'object') return null
    const month = (m as { month?: unknown }).month
    const classes = (m as { classes?: unknown }).classes
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) return null
    if (!Array.isArray(classes)) return null
    const rows: PnlClassRow[] = []
    for (const c of classes) {
      const name = (c as { name?: unknown })?.name
      const revenue = Number((c as { revenue?: unknown })?.revenue)
      const expenses = Number((c as { expenses?: unknown })?.expenses)
      const net = Number((c as { net?: unknown })?.net)
      if (typeof name !== 'string' || !Number.isFinite(revenue) || !Number.isFinite(expenses) || !Number.isFinite(net)) {
        return null
      }
      rows.push({ name, revenue, expenses, net })
    }
    out.push({ month, classes: rows })
  }
  return out
}

export async function getBusinessLinePnl(): Promise<PnlResult> {
  const url = process.env.N8N_QBO_PNL_WEBHOOK_URL
  if (!url) {
    return { state: 'not-connected', requirements: PNL_REQUIREMENTS }
  }
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    if (!res.ok) {
      return { state: 'error', message: `The P&L webhook answered HTTP ${res.status}.` }
    }
    const json = await res.json()
    const months = parsePnlPayload(json)
    if (!months) {
      return { state: 'error', message: 'The P&L webhook answered with a shape this tile does not recognize.' }
    }
    const generatedAt = typeof (json as { generated_at?: unknown }).generated_at === 'string'
      ? (json as { generated_at: string }).generated_at
      : null
    return { state: 'ok', months, generatedAt }
  } catch {
    return { state: 'error', message: 'The P&L webhook did not answer.' }
  }
}
