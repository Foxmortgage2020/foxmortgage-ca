// One policy (Session 6): GET serves its full retained version history;
// POST updates it. A content change bumps the version and keeps the old
// one; retire is a status change, never a deletion.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { listPolicyVersions, updatePolicy } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('compliance.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const res = await listPolicyVersions(params.id)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, data: res.data })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('compliance.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const body = (await req.json().catch(() => null)) as {
    title?: string
    bodyMd?: string
    effectiveOn?: string | null
    status?: string
  } | null
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const bodyMd = typeof body?.bodyMd === 'string' ? body.bodyMd.trim().slice(0, 50_000) : ''
  const status = body?.status === 'retired' ? 'retired' : 'active'
  if (!title || !bodyMd) {
    return NextResponse.json({ ok: false, message: 'Title and body are required.' }, { status: 422 })
  }
  const effectiveOn =
    typeof body?.effectiveOn === 'string' && YMD_RE.test(body.effectiveOn) ? body.effectiveOn : null
  const res = await updatePolicy({
    id: params.id,
    title,
    bodyMd,
    effectiveOn,
    status,
    actor: gate.user.email,
  })
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, data: { version: res.data } })
}
