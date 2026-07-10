// Provisioning wizard model (Session 8). Pure — validation, the Clerk
// metadata each person type gets stamped with, and the grant preview the
// wizard shows before confirm. Unit-tested in tests/provisioning.test.ts.
//
// Three person types, one flow each:
//   staff   — ops or underwriting-reviewer, admin-area access per the
//             authority matrix baseline.
//   partner — realtor / FP / lawyer / mortgage agent / investor; the
//             Zoho partner id is picked from a search, never typed, and
//             lands in the per-kind Clerk metadata key from
//             lib/partner-types (the config the onboarding flow already
//             trusts).
//   agent   — the recruiting future: Clerk user with the agent role plus
//             the workbench half through POST /api/gates/agents.

import {
  PARTNER_TYPE_CONFIGS,
  getPartnerConfigByKind,
  type PartnerKind,
} from '@/lib/partner-types'

export const STAFF_ROLES = ['ops', 'underwriting-reviewer'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const PARTNER_KINDS = Object.keys(PARTNER_TYPE_CONFIGS) as PartnerKind[]

export type ProvisionInput =
  | { personType: 'staff'; name: string; email: string; role: StaffRole; sendInvite: boolean }
  | {
      personType: 'partner'
      name: string
      email: string
      partnerKind: PartnerKind
      zohoPartnerId: string
      sendInvite: boolean
    }
  | {
      personType: 'agent'
      name: string
      email: string
      fsraLicence: string
      officePhone?: string
      sendInvite: boolean
    }

export type ValidationResult =
  | { ok: true; value: ProvisionInput }
  | { ok: false; message: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Zoho record ids are 18-digit numeric strings; loose >=15 like the
// impersonate route.
const ZOHO_ID_RE = /^\d{15,}$/

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function validateProvisionInput(body: unknown): ValidationResult {
  const b = (body ?? {}) as Record<string, unknown>
  const personType = str(b.personType)
  const name = str(b.name)
  const email = str(b.email).toLowerCase()
  const sendInvite = b.sendInvite === true

  if (name.length < 2 || name.length > 120) {
    return { ok: false, message: 'Name must be 2–120 characters.' }
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { ok: false, message: 'A valid email address is required.' }
  }

  if (personType === 'staff') {
    const role = str(b.role)
    if (!STAFF_ROLES.includes(role as StaffRole)) {
      return { ok: false, message: 'Staff role must be ops or underwriting-reviewer.' }
    }
    return { ok: true, value: { personType, name, email, role: role as StaffRole, sendInvite } }
  }

  if (personType === 'partner') {
    const partnerKind = str(b.partnerKind) as PartnerKind
    if (!PARTNER_KINDS.includes(partnerKind)) {
      return { ok: false, message: 'Partner type is not one we support.' }
    }
    const zohoPartnerId = str(b.zohoPartnerId)
    if (!ZOHO_ID_RE.test(zohoPartnerId)) {
      return {
        ok: false,
        message: 'Pick the partner from the Zoho search — the id is selected, never typed.',
      }
    }
    return { ok: true, value: { personType, name, email, partnerKind, zohoPartnerId, sendInvite } }
  }

  if (personType === 'agent') {
    const fsraLicence = str(b.fsraLicence)
    if (fsraLicence.length < 2 || fsraLicence.length > 40) {
      return { ok: false, message: 'FSRA licence must be 2–40 characters.' }
    }
    const officePhone = str(b.officePhone)
    if (officePhone && (officePhone.length < 7 || officePhone.length > 30)) {
      return { ok: false, message: 'Office phone must be 7–30 characters when provided.' }
    }
    return {
      ok: true,
      value: {
        personType,
        name,
        email,
        fsraLicence,
        officePhone: officePhone || undefined,
        sendInvite,
      },
    }
  }

  return { ok: false, message: 'personType must be staff, partner, or agent.' }
}

/** The exact Clerk publicMetadata block each person type is stamped with. */
export function clerkMetadataFor(input: ProvisionInput): Record<string, unknown> {
  if (input.personType === 'staff') {
    return { roles: [input.role] }
  }
  if (input.personType === 'partner') {
    const config = getPartnerConfigByKind(input.partnerKind)
    return { roles: [config.clerkRole], [config.clerkMetadataKey]: input.zohoPartnerId }
  }
  return { roles: ['agent'] }
}

/** The roles[] the person will carry — used for the FOXCA record. */
export function rolesFor(input: ProvisionInput): string[] {
  const md = clerkMetadataFor(input)
  return md.roles as string[]
}
