// Set the client-comms settings (comms.decide, admin): the master kill switch,
// the per-client caps, and the CASL mailing address. The kill switch is the
// permanent master control under Michael's hand; the workbench upsert CREATES
// the settings row on the first flip, defaulting comms_enabled to false so the
// switch's first true state is always an explicit human action.
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { setCommsSettings, STATUS_BY_KIND, type CommsSettingsInput } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('comms.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try { body = await req.json() } catch { /* validated below */ }
  const input: CommsSettingsInput = {}
  if (typeof body?.comms_enabled === 'boolean') input.comms_enabled = body.comms_enabled
  if (typeof body?.comms_mailing_address === 'string' && body.comms_mailing_address.trim()) {
    // The workbench CommsSettingsBody bounds the CASL address at 6..300 chars.
    const addr = body.comms_mailing_address.trim()
    if (addr.length < 6 || addr.length > 300) {
      return NextResponse.json({ ok: false, kind: 'validation', message: 'A mailing address needs 6 to 300 characters.' }, { status: 422 })
    }
    input.comms_mailing_address = addr
  }
  if (typeof body?.comms_max_per_client_per_day === 'number' && Number.isFinite(body.comms_max_per_client_per_day)) {
    input.comms_max_per_client_per_day = Math.max(0, Math.min(10, Math.round(body.comms_max_per_client_per_day)))
  }
  if (typeof body?.comms_max_per_client_per_week === 'number' && Number.isFinite(body.comms_max_per_client_per_week)) {
    input.comms_max_per_client_per_week = Math.max(0, Math.min(30, Math.round(body.comms_max_per_client_per_week)))
  }
  if (Object.keys(input).length === 0) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'Nothing to change.' }, { status: 422 })
  }
  const result = await setCommsSettings(input, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
