// The Desk poll: decision counts for the sidebar badges, group dots, and
// bell. Gates on deals.view (the broadest command-centre permission);
// computeDeskCounts filters each section by the caller's own permissions,
// so an ops user's badges never include queues they cannot see. Read-only.
// Logs nothing; counts only, never payloads.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { computeDeskCounts, deskBadges, deskFragments } from '@/lib/desk'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await apiPermission('deals.view')
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const counts = await computeDeskCounts(gate.user)
  return NextResponse.json({
    counts,
    fragments: deskFragments(counts),
    badges: deskBadges(counts),
  })
}
