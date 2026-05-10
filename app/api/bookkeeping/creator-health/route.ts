import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getCreatorAppMeta } from '@/lib/zoho-creator'

// GET /api/bookkeeping/creator-health
// Admin-only diagnostic: probes the Zoho Creator app and lists what forms/reports exist.
// Use this to diagnose 404s when forms haven't been created yet (FOX-438).
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!roles.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const meta = await getCreatorAppMeta()
    return NextResponse.json(meta)
  } catch (err) {
    console.error('[GET /api/bookkeeping/creator-health]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
