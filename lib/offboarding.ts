// Offboarding checklist builder (Session 8). Pure — generates the
// honest to-do list from what the system actually knows about the person
// at disable time: their roles (grants now void), their partner
// attribution (referred files to reassign), their agent scope (workbench
// book, Finmo key — named from the gates setup_remaining contract), and
// any compliance credentials held by them. Unknowns say so plainly
// ("could not read") instead of vanishing. Unit-tested in
// tests/offboarding.test.ts.

import {
  PERMISSIONS,
  PERMISSION_LABELS,
  roleCan,
  type Permission,
} from '@/config/authority'
import type { OffboardChecklistItem } from '@/lib/people-store'

export interface OffboardChecklistInput {
  name: string
  roles: string[]
  /** Zoho partner id from Clerk metadata (any of the per-kind keys). */
  zohoPartnerId: string | null
  /** Files carrying them as Referral_Partner; null = could not read Zoho. */
  referredFilesCount: number | null
  /** True when the person carried the agent role. */
  isAgent: boolean
  /** Workbench agents row id from the provisioning record, if recorded. */
  workbenchAgentId: string | null
  /** Compliance credentials naming them as holder. */
  credentialsHeld: { id: string; name: string }[]
  /** False when the compliance register could not be read. */
  credentialsReadable: boolean
}

export function grantsForRoles(roles: string[]): { key: Permission; label: string }[] {
  return (Object.keys(PERMISSIONS) as Permission[])
    .filter(key => roleCan(roles, key))
    .map(key => ({ key, label: PERMISSION_LABELS[key] }))
}

export function buildOffboardChecklist(input: OffboardChecklistInput): OffboardChecklistItem[] {
  const items: OffboardChecklistItem[] = []
  const displayName = input.name || 'this person'

  // 1. The disable itself — recorded done because the offboard route only
  // persists a checklist after the ban succeeded.
  items.push({
    key: 'clerk_disabled',
    label: 'Portal access disabled',
    detail:
      'Clerk user banned and live sessions revoked. Sign-in is refused from this moment; nothing was deleted.',
    done: true,
  })

  // 2. Grants void — derived from the authority matrix at offboard time.
  const grants = grantsForRoles(input.roles)
  items.push({
    key: 'grants_void',
    label: 'Role grants void',
    detail:
      input.roles.length > 0
        ? `Held role${input.roles.length === 1 ? '' : 's'} ${input.roles.join(', ')} carrying ${grants.length} permission grant${grants.length === 1 ? '' : 's'} (${grants
            .slice(0, 6)
            .map(g => g.key)
            .join(', ')}${grants.length > 6 ? ', …' : ''}). All void with the account disabled.`
        : 'No roles were stamped on the account; nothing granted, nothing to void.',
    done: true,
  })

  // 3. Partner attribution to reassign.
  if (input.zohoPartnerId) {
    items.push({
      key: 'partner_reassign',
      label: 'Reassign partner attribution in Zoho',
      detail:
        input.referredFilesCount === null
          ? `Zoho partner ${input.zohoPartnerId} — the referred-file count could not be read at offboard time. Check Referral_Partner on their files in Zoho.`
          : input.referredFilesCount === 0
            ? `Zoho partner ${input.zohoPartnerId} carries no files as Referral_Partner today. Nothing to reassign; the partner record itself stays.`
            : `Zoho partner ${input.zohoPartnerId} is Referral_Partner on ${input.referredFilesCount} file${input.referredFilesCount === 1 ? '' : 's'}. Decide who inherits the relationship on each.`,
      done: false,
    })
  }

  // 4 + 5. Agent scope — book and Finmo key, named from the gates
  // setup_remaining contract (micro-session 4).
  if (input.isAgent) {
    items.push({
      key: 'agent_workbench_book',
      label: 'Review the workbench agent book',
      detail: input.workbenchAgentId
        ? `Workbench agent ${input.workbenchAgentId}: their deals, conditions, and flags stay under their agent id. Decide reassignment workbench-side; the portal never writes the workbench.`
        : 'No workbench agent id was recorded at provisioning. If a workbench agents row exists for their email, review its book workbench-side.',
      done: false,
    })
    items.push({
      key: 'agent_finmo_key',
      label: 'Revoke the Finmo API key',
      detail:
        'The per-agent FINMO key is env-and-pipeline configuration (FINMO_API_KEY_<AGENT> plus pipeline wiring, per the gates setup_remaining contract). Revoke it in Finmo and remove the env var via dashboard or REST.',
      done: false,
    })
  }

  // 6. Compliance credentials held by them.
  if (!input.credentialsReadable) {
    items.push({
      key: 'compliance_credentials',
      label: 'Check the compliance register',
      detail:
        'The compliance register could not be read at offboard time. Check whether any credentials name them as holder; retire or reassign those.',
      done: false,
    })
  } else if (input.credentialsHeld.length > 0) {
    items.push({
      key: 'compliance_credentials',
      label: `Retire or reassign ${input.credentialsHeld.length} compliance credential${input.credentialsHeld.length === 1 ? '' : 's'}`,
      detail: `The register names ${displayName} as holder of: ${input.credentialsHeld
        .map(c => c.name)
        .join(', ')}. Credentials retire with history; nothing deletes.`,
      done: false,
    })
  }

  return items
}
