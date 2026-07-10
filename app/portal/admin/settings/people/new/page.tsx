// Provisioning wizard page (Session 8). Replaces the manual Clerk ritual
// documented in CLAUDE.md: one flow per person type (staff, partner,
// agent), the exact grants shown before confirm, the Zoho partner id
// picked never typed, and the agent flow consuming POST /api/gates/agents
// with its setup_remaining rendered honestly.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { gatesConfigured } from '@/lib/gates'
import { listAllPartners } from '@/lib/zoho'
import { grantsForRoles } from '@/lib/offboarding'
import ProvisionWizard, {
  type GrantView,
  type WizardPartner,
} from '@/components/admin/ProvisionWizard'

export const dynamic = 'force-dynamic'

export default async function ProvisionPage() {
  await requirePermission('people.manage')

  let partners: WizardPartner[] = []
  let zohoOk = true
  try {
    partners = (await listAllPartners()).map(p => ({
      id: p.id,
      name: p.name ?? p.id,
      email: p.email,
      partnerType: p.partnerType,
    }))
  } catch {
    zohoOk = false
  }

  const roleGrants: Record<string, GrantView[]> = {
    ops: grantsForRoles(['ops']),
    'underwriting-reviewer': grantsForRoles(['underwriting-reviewer']),
    agent: grantsForRoles(['agent']),
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Provision someone</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Creates the Clerk user with roles stamped, sends the invitation, and records who
          provisioned whom.{' '}
          <Link href="/portal/admin/settings/people" className="text-navy underline hover:text-lime">
            Back to People
          </Link>
        </p>
      </div>

      {!zohoOk && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm font-body text-amber-800">
          The Zoho partner list could not be loaded, so the partner flow&apos;s picker is empty
          right now. Staff and agent flows are unaffected.
        </div>
      )}

      <ProvisionWizard partners={partners} roleGrants={roleGrants} gatesReady={gatesConfigured()} />
    </div>
  )
}
