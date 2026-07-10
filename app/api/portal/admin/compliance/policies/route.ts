// Policy library routes (Session 6): versioned documents with full
// history retained. GET serves policies plus every acknowledgment so the
// list can show coverage; POST creates version 1.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { createPolicy, listPolicies, listPolicyAcks } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET() {
  const gate = await apiPermission('compliance.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const [policies, acks] = await Promise.all([listPolicies(), listPolicyAcks()])
  if (!policies.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!policies.ok) return NextResponse.json({ ok: false, message: policies.error }, { status: 502 })
  return NextResponse.json({
    ok: true,
    data: {
      policies: policies.data,
      acks: acks.configured && acks.ok ? acks.data : [],
    },
  })
}

export async function POST(req: Request) {
  const gate = await apiPermission('compliance.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const body = (await req.json().catch(() => null)) as {
    title?: string
    bodyMd?: string
    effectiveOn?: string | null
  } | null
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const bodyMd = typeof body?.bodyMd === 'string' ? body.bodyMd.trim().slice(0, 50_000) : ''
  if (!title || !bodyMd) {
    return NextResponse.json({ ok: false, message: 'Title and body are required.' }, { status: 422 })
  }
  const effectiveOn =
    typeof body?.effectiveOn === 'string' && YMD_RE.test(body.effectiveOn) ? body.effectiveOn : null
  const res = await createPolicy({ title, bodyMd, effectiveOn, actor: gate.user.email })
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, data: { id: res.data } })
}
