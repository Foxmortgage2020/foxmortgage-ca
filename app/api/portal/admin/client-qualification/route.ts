// Client qualification-baseline authoring (B9). POST only, one route with an
// action. House order: gate → demo refusal → validate → act. The baseline is
// validated and the citation hash is computed SERVER-SIDE; publishing a baseline
// that would not compute is refused. Rides the same authority key as the client
// presentation layer (client.presentation.manage): both decide what a client
// sees on their own page.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { presentationHash } from '@/lib/client-presentation'
import {
  validateBaseline,
  QUALIFICATION_CALC_VERSION,
  type QualificationSources,
  type FieldSource,
} from '@/lib/qualification'
import {
  upsertQualificationBaseline,
  setQualificationPublished,
  deleteQualificationBaseline,
} from '@/lib/qualification-store'

export const dynamic = 'force-dynamic'

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const BASELINE_FIELDS = [
  'annualIncome',
  'monthlyDebts',
  'heatMonthly',
  'contractRatePct',
  'stressMode',
  'amortizationMonths',
  'condoInclusionRate',
  'gdsLimit',
  'tdsLimit',
  'compounding',
  'defaultPrice',
  'defaultDownPayment',
  'defaultPropertyTaxMonthly',
  'defaultCondoMonthly',
] as const

const SOURCE_VALUES = new Set<FieldSource>(['file', 'default', 'edited'])

// The card sends per-field provenance; keep only known fields and known values.
function sanitizeSources(raw: unknown): QualificationSources {
  const out: QualificationSources = {}
  if (raw && typeof raw === 'object') {
    for (const f of BASELINE_FIELDS) {
      const v = (raw as Record<string, unknown>)[f]
      if (typeof v === 'string' && SOURCE_VALUES.has(v as FieldSource)) out[f] = v as FieldSource
    }
  }
  return out
}

export async function POST(req: Request) {
  const gate = await apiPermission('client.presentation.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode())
    return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Malformed request.' }, { status: 400 })
  }

  const action = str(body.action)
  const zohoDealId = str(body.zohoDealId)
  if (!/^\S+$/.test(zohoDealId)) {
    return NextResponse.json({ ok: false, message: 'A valid deal is required.' }, { status: 422 })
  }
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null

  if (action === 'upsert') {
    const validated = validateBaseline({
      annualIncome: num(body.annualIncome),
      monthlyDebts: num(body.monthlyDebts),
      heatMonthly: num(body.heatMonthly),
      contractRatePct: num(body.contractRatePct),
      stressMode: body.stressMode === 'contract' ? 'contract' : 'b20',
      amortizationMonths: num(body.amortizationMonths),
      condoInclusionRate: num(body.condoInclusionRate),
      gdsLimit: num(body.gdsLimit),
      tdsLimit: num(body.tdsLimit),
      compounding: body.compounding === 'monthly' ? 'monthly' : 'semi-annual',
      defaultPrice: num(body.defaultPrice),
      defaultDownPayment: num(body.defaultDownPayment),
      defaultPropertyTaxMonthly: num(body.defaultPropertyTaxMonthly),
      defaultCondoMonthly: num(body.defaultCondoMonthly),
    })
    if (!validated.ok) {
      return NextResponse.json(
        { ok: false, message: `This baseline needs ${validated.missing.join(', ')}.` },
        { status: 422 },
      )
    }
    const baseline = validated.baseline
    const baselineHash = presentationHash({ v: QUALIFICATION_CALC_VERSION, baseline })
    const res = await upsertQualificationBaseline({
      id,
      zohoDealId,
      fileRef: str(body.fileRef) || null,
      baseline,
      sources: sanitizeSources(body.sources),
      baselineHash,
      calcVersion: QUALIFICATION_CALC_VERSION,
      createdBy: gate.user.email,
    })
    return storeResponse(res)
  }

  if (action === 'publish') {
    if (!id) return NextResponse.json({ ok: false, message: 'Which baseline?' }, { status: 422 })
    const res = await setQualificationPublished(id, body.published === true)
    return storeResponse(res)
  }

  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, message: 'Which baseline?' }, { status: 422 })
    const res = await deleteQualificationBaseline(id)
    return storeResponse(res)
  }

  return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 })
}

function storeResponse(res: { configured: boolean; ok?: boolean; data?: unknown; error?: string }) {
  if (!res.configured)
    return NextResponse.json({ ok: false, message: 'The store is not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, id: res.data ?? null })
}
