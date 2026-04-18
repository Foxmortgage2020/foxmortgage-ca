import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

// In-memory log store for dry-run entries (persists per serverless instance lifetime).
// Suitable for low-volume admin use; replace with Zoho Creator form or KV if needed.
const dryRunLog: Array<{
  timestamp: string
  transaction_id: string
  vendor_name: string
  amount: number
  intended_account: string
  memo_tag: string
  confidence: number
  match_method: string
  would_write: boolean
}> = []

function adminOnly(roles: string[]): boolean {
  return roles.includes('admin')
}

// GET /api/bookkeeping/dry-run-log — list recent dry-run entries
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10)
    return NextResponse.json({ records: dryRunLog.slice(-limit).reverse() })
  } catch (err) {
    console.error('[GET /api/bookkeeping/dry-run-log]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/bookkeeping/dry-run-log — called by n8n when WRITE_TO_QBO=false
// Body: { transaction_id, vendor_name, amount, intended_account, memo_tag,
//         confidence, match_method, would_write }
export async function POST(req: NextRequest) {
  try {
    // n8n calls this without a user session — validate via shared secret instead
    const authHeader = req.headers.get('authorization')
    const expectedSecret = process.env.BOOKKEEPING_WEBHOOK_SECRET
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const entry = {
      timestamp: new Date().toISOString(),
      transaction_id: body.transaction_id || '',
      vendor_name: body.vendor_name || '',
      amount: Number(body.amount) || 0,
      intended_account: body.intended_account || '',
      memo_tag: body.memo_tag || '',
      confidence: Number(body.confidence) || 0,
      match_method: body.match_method || 'unknown',
      would_write: Boolean(body.would_write),
    }

    dryRunLog.push(entry)
    // Keep last 500 entries
    if (dryRunLog.length > 500) dryRunLog.splice(0, dryRunLog.length - 500)

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/bookkeeping/dry-run-log]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
