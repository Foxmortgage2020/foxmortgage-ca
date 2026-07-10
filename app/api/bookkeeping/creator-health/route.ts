import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getCreatorAppMeta } from '@/lib/zoho-creator'

// GET /api/bookkeeping/creator-health
// Admin-only diagnostic: probes the Zoho Creator app and lists what forms/reports exist.
// Use this to diagnose 404s when forms haven't been created yet (FOX-438).
export async function GET() {
  try {
    // Session 8: permission key, not a role literal (bookkeeping.view is
    // admin-only in the shipped baseline).
    const gate = await apiPermission('bookkeeping.view')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

    const meta = await getCreatorAppMeta()
    return NextResponse.json(meta)
  } catch (err) {
    console.error('[GET /api/bookkeeping/creator-health]', err)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
