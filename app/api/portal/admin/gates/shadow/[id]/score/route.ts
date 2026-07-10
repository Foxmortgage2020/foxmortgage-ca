// Shadow score proxy. One submission scores one dimension; disagreements
// need a 5+ character note (the API enforces it; this pre-check just gives
// the same message without burning a token mint).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  scoreShadow,
  SHADOW_DIMENSIONS,
  STATUS_BY_KIND,
  type ShadowDimension,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('shadow.score')
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
    // fall through to the dimension check
  }
  const dimension = body?.dimension as ShadowDimension
  if (!SHADOW_DIMENSIONS.includes(dimension)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Dimension must be checklist, income, ratios, or shortlist.' },
      { status: 422 },
    )
  }
  if (typeof body?.agree !== 'boolean') {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Agree must be true or false.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  if (body.agree === false && (!note || note.trim().length < 5)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'A disagreement needs a note of at least 5 characters.' },
      { status: 422 },
    )
  }
  const result = await scoreShadow(params.id, dimension, body.agree, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
