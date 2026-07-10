// POST /api/portal/admin/people/offboard/check (Session 8)
//
// Toggles one checklist item on a persisted offboarding record. Gated on
// people.manage. The row updates in place with updated_by stamped;
// nothing deletes.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { checkOffboardingItem } from '@/lib/people-store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('people.manage')
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 })
  }
  const { id, itemKey, done } = (body ?? {}) as {
    id?: unknown
    itemKey?: unknown
    done?: unknown
  }
  if (typeof id !== 'string' || !id || typeof itemKey !== 'string' || !itemKey) {
    return NextResponse.json({ error: 'id and itemKey are required.' }, { status: 422 })
  }

  const result = await checkOffboardingItem({
    id,
    itemKey,
    done: done === true,
    actor: gate.user.email,
  })
  if (!result.configured) {
    return NextResponse.json({ error: 'The FOXCA store is not connected.' }, { status: 503 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  if (result.data !== true) {
    return NextResponse.json({ error: 'No offboarding record with that id.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
