// Compliance (Session 6): the module that turns the platform's
// supervision-grade records into a visible, FSRA-conscious surface. Two
// data homes, honestly split: underwriting truth (flags, conditions,
// stages) reads from the workbench through the read-only role;
// business compliance records the portal itself owns (credentials,
// complaints, policies, acknowledgments) live in the FOXCA project behind
// narrow security-definer functions. Records never delete.

import { Suspense } from 'react'
import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getComplianceAttentionDeals } from '@/lib/underwriting'
import { listComplaints, listCredentials, listPolicies, listPolicyAcks, complianceConfigured } from '@/lib/compliance'
import { COMPLIANCE_CONDITION_CATEGORIES } from '@/lib/compliance-logic'
import ComplianceModule, { type ComplianceInitial } from '@/components/admin/ComplianceModule'
import { torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export default async function CompliancePage() {
  const user = await requirePermission('compliance.view')
  const canManage = can(user, 'compliance.manage')
  const todayYMD = torontoTodayYMD()

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  const [credsR, complaintsR, policiesR, acksR, attentionR] = await Promise.all([
    listCredentials(),
    listComplaints(),
    listPolicies(),
    listPolicyAcks(),
    agentId
      ? getComplianceAttentionDeals(agentId, COMPLIANCE_CONDITION_CATEGORIES, todayYMD)
      : Promise.resolve(null),
  ])

  const storeErrors = [credsR, complaintsR, policiesR]
    .map(r => (r.configured && !r.ok ? r.error : null))
    .filter((e): e is string => Boolean(e))

  const initial: ComplianceInitial = {
    credentials: credsR.configured && credsR.ok ? credsR.data : [],
    complaints: complaintsR.configured && complaintsR.ok ? complaintsR.data : [],
    policies: policiesR.configured && policiesR.ok ? policiesR.data : [],
    acks: acksR.configured && acksR.ok ? acksR.data : [],
    attentionDeals: attentionR && attentionR.configured && attentionR.ok ? attentionR.data : [],
    storeConfigured: complianceConfigured(),
    storeError: storeErrors[0] ?? null,
    workbenchOk: Boolean(attentionR && attentionR.configured && attentionR.ok),
  }

  return (
    <div className="max-w-5xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">Compliance</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Is the practice inspection-ready, from what the system actually knows: licences and
          credentials with renewal dates, the complaint and incident register, the policy library
          with acknowledgments, and the files whose recorded signals need eyes.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-gray-400 font-body mt-6">Loading compliance…</p>}>
        <ComplianceModule initial={initial} canManage={canManage} todayYMD={todayYMD} />
      </Suspense>
    </div>
  )
}
