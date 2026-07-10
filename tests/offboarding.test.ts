// Offboarding checklist builder — the honest to-do list generated from
// what the system knows at disable time. Unknown reads say so; nothing
// silently vanishes.

import { describe, expect, it } from 'vitest'
import { buildOffboardChecklist, grantsForRoles } from '../lib/offboarding'

const base = {
  name: 'Test Person',
  roles: [] as string[],
  zohoPartnerId: null as string | null,
  referredFilesCount: null as number | null,
  isAgent: false,
  workbenchAgentId: null as string | null,
  credentialsHeld: [] as { id: string; name: string }[],
  credentialsReadable: true,
}

describe('buildOffboardChecklist', () => {
  it('always records the disable and the grant void, pre-done', () => {
    const items = buildOffboardChecklist({ ...base, roles: ['ops'] })
    const keys = items.map(i => i.key)
    expect(keys[0]).toBe('clerk_disabled')
    expect(keys[1]).toBe('grants_void')
    expect(items[0].done).toBe(true)
    expect(items[1].done).toBe(true)
    expect(items[1].detail).toContain('ops')
    expect(items[1].detail).toContain(`${grantsForRoles(['ops']).length} permission grant`)
  })

  it('a role-less account voids nothing and says so', () => {
    const items = buildOffboardChecklist(base)
    expect(items.find(i => i.key === 'grants_void')!.detail).toContain('No roles')
  })

  it('partner attribution appears only with a Zoho id, with the count honest', () => {
    expect(
      buildOffboardChecklist(base).find(i => i.key === 'partner_reassign'),
    ).toBeUndefined()

    const withCount = buildOffboardChecklist({
      ...base,
      zohoPartnerId: '7112178000003669036',
      referredFilesCount: 3,
    }).find(i => i.key === 'partner_reassign')!
    expect(withCount.done).toBe(false)
    expect(withCount.detail).toContain('3 files')

    const unreadable = buildOffboardChecklist({
      ...base,
      zohoPartnerId: '7112178000003669036',
      referredFilesCount: null,
    }).find(i => i.key === 'partner_reassign')!
    expect(unreadable.detail).toContain('could not be read')

    const zero = buildOffboardChecklist({
      ...base,
      zohoPartnerId: '7112178000003669036',
      referredFilesCount: 0,
    }).find(i => i.key === 'partner_reassign')!
    expect(zero.detail).toContain('no files')
  })

  it('agent scope adds the workbench book and the Finmo key, named from the gates contract', () => {
    const items = buildOffboardChecklist({
      ...base,
      roles: ['agent'],
      isAgent: true,
      workbenchAgentId: 'f95fe1ee-0000-0000-0000-000000000000',
    })
    const book = items.find(i => i.key === 'agent_workbench_book')!
    const finmo = items.find(i => i.key === 'agent_finmo_key')!
    expect(book.detail).toContain('f95fe1ee')
    expect(finmo.detail).toContain('FINMO_API_KEY_<AGENT>')
    expect(book.done).toBe(false)
    expect(finmo.done).toBe(false)
  })

  it('an agent with no recorded workbench id gets the honest variant', () => {
    const book = buildOffboardChecklist({ ...base, isAgent: true }).find(
      i => i.key === 'agent_workbench_book',
    )!
    expect(book.detail).toContain('No workbench agent id was recorded')
  })

  it('compliance credentials: held ones list, an unreadable register says so, none means no item', () => {
    const held = buildOffboardChecklist({
      ...base,
      credentialsHeld: [{ id: 'c1', name: 'FSRA Licence 13463' }],
    }).find(i => i.key === 'compliance_credentials')!
    expect(held.label).toContain('1 compliance credential')
    expect(held.detail).toContain('FSRA Licence 13463')

    const unreadable = buildOffboardChecklist({
      ...base,
      credentialsReadable: false,
    }).find(i => i.key === 'compliance_credentials')!
    expect(unreadable.detail).toContain('could not be read')

    expect(
      buildOffboardChecklist(base).find(i => i.key === 'compliance_credentials'),
    ).toBeUndefined()
  })
})
