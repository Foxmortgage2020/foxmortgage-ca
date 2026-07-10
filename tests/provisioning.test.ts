// Provisioning wizard model — validation and the Clerk metadata each
// person type gets stamped with. The metadata keys come from
// lib/partner-types (the config the onboarding flow already trusts), so a
// partner provisioned through the wizard resolves identically to one who
// self-onboarded.

import { describe, expect, it } from 'vitest'
import {
  validateProvisionInput,
  clerkMetadataFor,
  rolesFor,
} from '../lib/provisioning'

describe('validateProvisionInput', () => {
  it('accepts a staff ops request', () => {
    const res = validateProvisionInput({
      personType: 'staff',
      name: 'Test Ops',
      email: 'Test.Ops@Example.com',
      role: 'ops',
      sendInvite: false,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value).toMatchObject({ personType: 'staff', role: 'ops', email: 'test.ops@example.com' })
    }
  })

  it('refuses staff with a non-staff role (admin is not provisionable)', () => {
    for (const role of ['admin', 'agent', 'investor', '']) {
      const res = validateProvisionInput({
        personType: 'staff',
        name: 'Test',
        email: 't@example.com',
        role,
      })
      expect(res.ok).toBe(false)
    }
  })

  it('partner requires a picked Zoho id (15+ digits, never typed prose)', () => {
    const bad = validateProvisionInput({
      personType: 'partner',
      name: 'Test Partner',
      email: 'p@example.com',
      partnerKind: 'realtor',
      zohoPartnerId: 'not-an-id',
    })
    expect(bad.ok).toBe(false)

    const good = validateProvisionInput({
      personType: 'partner',
      name: 'Test Partner',
      email: 'p@example.com',
      partnerKind: 'realtor',
      zohoPartnerId: '7112178000003669036',
      sendInvite: true,
    })
    expect(good.ok).toBe(true)
  })

  it('refuses unknown partner kinds', () => {
    const res = validateProvisionInput({
      personType: 'partner',
      name: 'Test',
      email: 't@example.com',
      partnerKind: 'accountant',
      zohoPartnerId: '7112178000003669036',
    })
    expect(res.ok).toBe(false)
  })

  it('agent requires an FSRA licence within the gates schema bounds', () => {
    expect(
      validateProvisionInput({
        personType: 'agent',
        name: 'Jane Agent',
        email: 'jane@example.com',
        fsraLicence: 'M',
      }).ok,
    ).toBe(false)
    const good = validateProvisionInput({
      personType: 'agent',
      name: 'Jane Agent',
      email: 'jane@example.com',
      fsraLicence: 'M23001234',
      officePhone: '226-555-0100',
    })
    expect(good.ok).toBe(true)
  })

  it('refuses junk emails, short names, unknown person types', () => {
    expect(validateProvisionInput({ personType: 'staff', name: 'T', email: 't@example.com', role: 'ops' }).ok).toBe(false)
    expect(validateProvisionInput({ personType: 'staff', name: 'Test', email: 'nope', role: 'ops' }).ok).toBe(false)
    expect(validateProvisionInput({ personType: 'board-member', name: 'Test', email: 't@example.com' }).ok).toBe(false)
  })
})

describe('clerkMetadataFor / rolesFor', () => {
  it('staff gets exactly the picked role', () => {
    const res = validateProvisionInput({
      personType: 'staff',
      name: 'Test Ops',
      email: 'ops@example.com',
      role: 'underwriting-reviewer',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(clerkMetadataFor(res.value)).toEqual({ roles: ['underwriting-reviewer'] })
      expect(rolesFor(res.value)).toEqual(['underwriting-reviewer'])
    }
  })

  it('partner gets the per-kind clerk role and metadata key from lib/partner-types', () => {
    const cases: [string, string, string][] = [
      ['fp', 'financial-planner', 'fp_zoho_id'],
      ['realtor', 'realtor', 'realtor_zoho_id'],
      ['lawyer', 'lawyer', 'lawyer_zoho_id'],
      ['mortgage_agent', 'mortgage_agent', 'mortgage_agent_zoho_id'],
      ['investor', 'investor', 'zoho_partner_id'],
    ]
    for (const [kind, clerkRole, metaKey] of cases) {
      const res = validateProvisionInput({
        personType: 'partner',
        name: 'Test Partner',
        email: 'p@example.com',
        partnerKind: kind,
        zohoPartnerId: '7112178000003669036',
      })
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(clerkMetadataFor(res.value)).toEqual({
          roles: [clerkRole],
          [metaKey]: '7112178000003669036',
        })
      }
    }
  })

  it('agent gets the agent role and nothing else in metadata', () => {
    const res = validateProvisionInput({
      personType: 'agent',
      name: 'Jane Agent',
      email: 'jane@example.com',
      fsraLicence: 'M23001234',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(clerkMetadataFor(res.value)).toEqual({ roles: ['agent'] })
    }
  })
})
