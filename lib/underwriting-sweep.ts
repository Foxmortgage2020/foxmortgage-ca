// The sweep runner (server only): read Zoho + the workbench rooms, compute
// the pure plan (lib/underwriting-bridge.ts), post it to the fox-underwriting
// bridge endpoint. Shared by the sweep route (schedule + manual) and the
// Underwriting page load, so the page is never stale while Michael looks
// at it. Logs counts only, never payloads.

import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { computePipeline, getAllDealsSlim } from '@/lib/zoho-admin'
import { getAgentIdByEmail, getDealsSummary } from '@/lib/underwriting'
import { torontoTodayYMD } from '@/lib/dates'
import {
  bridgeConfigured,
  computeBridgePlan,
  postBridgePlan,
  type SweepResult,
} from '@/lib/underwriting-bridge'
import { isDemoMode } from '@/lib/demo'

const EMPTY: SweepResult = { ok: true, provisioned: [], funded: [], dormant: [], skipped: [] }

export async function runBridgeSweep(): Promise<SweepResult & { planned?: number }> {
  if (isDemoMode()) return { ...EMPTY }
  if (!bridgeConfigured()) return { ...EMPTY, ok: false, error: 'bridge not configured' }

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  if (!agentId) return { ...EMPTY, ok: false, error: 'workbench unavailable' }

  const [deals, roomsRes] = await Promise.all([
    getAllDealsSlim().catch(() => null),
    getDealsSummary(agentId),
  ])
  if (!deals) return { ...EMPTY, ok: false, error: 'zoho unavailable' }
  if (!(roomsRes.configured && roomsRes.ok)) {
    return { ...EMPTY, ok: false, error: 'rooms unavailable' }
  }

  const pipeline = computePipeline(deals, torontoTodayYMD())
  const plan = computeBridgePlan({
    activeDeals: pipeline.activeDeals,
    allDeals: deals,
    rooms: roomsRes.data,
  })
  const payload = [...plan.provision, ...plan.transitions]
  const result = await postBridgePlan(payload, 'bridge')
  console.log(
    `[bridge-sweep] planned=${payload.length} provisioned=${result.provisioned.length} funded=${result.funded.length} dormant=${result.dormant.length} skipped=${result.skipped.length}${result.error ? ` error=${result.error}` : ''}`,
  )
  return { ...result, planned: payload.length }
}

// Michael's "Start underwriting early": one deal, below Submitted, created
// deliberately. Same empty-container rules server-side; audited as
// provisioned_by manual.
export async function provisionEarly(zohoId: string): Promise<SweepResult> {
  if (isDemoMode()) return { ...EMPTY }
  const deals = await getAllDealsSlim().catch(() => null)
  const deal = deals?.find(d => d.id === zohoId) ?? null
  if (!deal) return { ...EMPTY, ok: false, error: 'deal not found' }
  const { fileRefFromDealName } = await import('@/lib/underwriting-bridge')
  const fileRef = fileRefFromDealName(deal.dealName)
  if (!fileRef) return { ...EMPTY, ok: false, error: 'deal name carries no file reference' }
  return postBridgePlan(
    [
      {
        zohoPotentialId: deal.id,
        fileRef,
        dealType: deal.transactionType ?? '',
        zohoStage: deal.stage,
        disposition: 'open',
        amount: deal.amount > 0 ? deal.amount : null,
        closingDate: deal.closingDate,
        finmoAppId: deal.finmoUuid ? fileRef : null,
        finmoApplicationUuid: deal.finmoUuid ?? null,
      },
    ],
    'manual',
  )
}
