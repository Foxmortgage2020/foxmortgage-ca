// The record-withdrawal gate proxy (handoff 50, 2026-08-05).
//
// A WITHDRAWAL IS A DECISION, NEVER A DELETE. Nothing on this path removes a
// row. The gate writes to rec.source_decisions, the rec.deals row stays exactly
// where it is, and the loader reads the decision and declines to recreate the
// record on its next run.
//
// The authority key is enforced here BEFORE any token is minted or forwarded,
// and again server-side by the gates API on every call. `rec.withdraw` is a
// cross-repo contract name and is admin only on both sides, so a widening here
// without one there just produces 403s from the gate.
//
// THE REFUSAL IS ENFORCED HERE, NOT ONLY ON THE BUTTON. A record with a live
// Finmo feed AND an open workbench file is refused, because withdrawing it
// would switch that feed off on a file somebody is working. Putting that check
// only in the component would mean the rule holds until somebody posts to this
// route directly, which is not a rule. The room is computed on the SERVER from
// the workbench read through the same resolveRoom the file page uses; the
// browser sends an id and nothing else, and could not assert "no room" if it
// tried.
//
// TENANT SCOPING IS NOT OPTIONAL. The body carries a source id, so the record
// is looked up in this agent's own rec.deals before anything is forwarded. An
// id that names no record of Michael's is a 404 here rather than a decision
// written against a stranger's row.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { STATUS_BY_KIND, withdrawRecRecord } from '@/lib/gates'
import { getAgentIdByEmail, getDealsSummary, getRecDeals } from '@/lib/underwriting'
import { resolveRoom } from '@/lib/beta-file'
import {
  WITHDRAW_ENTITY_TYPE,
  checkReason,
  feedPosture,
  isSourceId,
  postureNotice,
} from '@/lib/rec-withdrawal'

export const dynamic = 'force-dynamic'

function bad(message: string, status = 422, kind = 'validation') {
  return NextResponse.json({ ok: false, kind, message }, { status })
}

export async function POST(req: Request) {
  const gate = await apiPermission('rec.withdraw')
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
    // fall through to the field checks, which say what is missing
  }

  const sourceId = typeof body?.source_id === 'string' ? body.source_id.trim() : ''
  if (!isSourceId(sourceId)) {
    return bad('That record id is missing or not a valid id.')
  }

  // Checked BEFORE the workbench reads: a missing reason is the most common
  // refusal and it should cost nothing. The failure is legible on purpose,
  // never a silent no-op.
  const reason = checkReason(body?.reason)
  if (!reason.ok) return bad(reason.message)

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!agentRes.configured || !agentRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        kind: 'unavailable',
        message: 'The record layer is not reachable right now, so this cannot be checked before it is sent.',
      },
      { status: 503 },
    )
  }
  const agentId = agentRes.data

  const [dealsRes, roomsRes] = await Promise.all([getRecDeals(agentId), getDealsSummary(agentId)])
  if (!dealsRes.configured || !dealsRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        kind: 'unavailable',
        message: 'The record layer did not answer, so this record could not be checked. Retry in a moment.',
      },
      { status: 503 },
    )
  }

  const record = dealsRes.data.find(d => (d.source_id ?? '').trim() === sourceId)
  if (!record) {
    return NextResponse.json(
      { ok: false, kind: 'not-found', message: 'Not found or not yours.' },
      { status: 404 },
    )
  }

  // A workbench read that fails FAILS THE REQUEST rather than defaulting to
  // "no room". Treating an outage as an absent room would turn the refusal off
  // exactly when the portal cannot see what it is refusing.
  if (!roomsRes.configured || !roomsRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        kind: 'unavailable',
        message:
          'The workbench did not answer, so whether this record has an open file could not be checked. Nothing was withdrawn. Retry in a moment.',
      },
      { status: 503 },
    )
  }

  const room = resolveRoom(
    { id: record.id, file_ref: record.file_ref, workbench_deal_id: record.workbench_deal_id },
    roomsRes.data.map(r => ({ id: r.id, file_ref: r.fileRef ?? null })),
  )
  const posture = feedPosture({
    finmoApplicationId: record.finmo_application_id,
    hasRoom: room !== null,
  })
  if (posture === 'refused') {
    // 409, not 403: the caller has the permission, the record is in a state
    // that refuses. The copy is the same sentence the button shows, so a person
    // who somehow reaches this by another door reads the same reason.
    return NextResponse.json(
      { ok: false, kind: 'conflict', message: postureNotice(posture) },
      { status: 409 },
    )
  }

  const result = await withdrawRecRecord(
    {
      source_system: record.source_system ?? undefined,
      source_id: sourceId,
      entity_type: WITHDRAW_ENTITY_TYPE,
      reason: reason.reason,
    },
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
