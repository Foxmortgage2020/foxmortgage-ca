// Flag disposition proxy. Vocabulary is the contract's, unchanged:
// accepted, corrected, escalated.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  disposeFlag,
  FLAG_DISPOSITIONS,
  STATUS_BY_KIND,
  type FlagDisposition,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('flags.disposition')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the disposition check
  }
  const disposition = body?.disposition as FlagDisposition
  if (!FLAG_DISPOSITIONS.includes(disposition)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Disposition must be accepted, corrected, or escalated.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await disposeFlag(params.id, disposition, note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
