import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getReviewQueue, getDeferredSchedules } from '@/lib/zoho-creator'

// GET /api/bookkeeping/weekly-summary
// Returns aggregated data for the current week (Mon–Sun):
//   - Review queue pending count (from Zoho Creator — live)
//   - Deferred schedules active count (from Zoho Creator — live)
//   - QBO transaction stats (stub until QBO OAuth is wired in n8n by FOX-112)
//
// Called by the admin bookkeeping dashboard and by the n8n Weekly Summary Email workflow.
// n8n uses this endpoint as a data source, formats the results, and sends via Resend.
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!roles.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // ── Zoho Creator data (live) ────────────────────────────────────────────
    const [pendingQueue, activeSchedules] = await Promise.all([
      getReviewQueue('Pending').catch(() => [] as unknown[]),
      getDeferredSchedules('Active').catch(() => [] as unknown[]),
    ])

    // Recognized-this-week schedules: Status = "Active" or "Complete" and End_Date in current week
    const weekStart = getWeekStart()
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    // ── QBO data (stub — wired in FOX-112 once QBO OAuth is live) ──────────
    // When QBO OAuth is available, replace this block with:
    //   GET https://sandbox-quickbooks.api.intuit.com/v3/company/9341456901231490/query
    //   ?query=SELECT * FROM Transaction WHERE TxnDate >= '{weekStart}' AND TxnDate <= '{weekEnd}'
    const qboReady = false
    const qboData = {
      total_categorized: null as number | null,
      rules_matched: null as number | null,
      ai_categorized: null as number | null,
      cash_position: null as number | null,
      top_vendors_needing_rules: [] as string[],
    }

    return NextResponse.json({
      week_start: weekStart.toISOString().split('T')[0],
      week_end: weekEnd.toISOString().split('T')[0],
      qbo_ready: qboReady,
      review_queue: {
        pending_count: pendingQueue.length,
      },
      deferred_revenue: {
        active_schedules: activeSchedules.length,
      },
      qbo: qboData,
    })
  } catch (err) {
    console.error('[GET /api/bookkeeping/weekly-summary]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

function getWeekStart(): Date {
  const now = new Date()
  const day = now.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day // Monday
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}
