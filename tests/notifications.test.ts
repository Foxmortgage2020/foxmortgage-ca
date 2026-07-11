// Notification center — the five PURE mappers (lib/notifications.ts).
// No DB, no network. Verifies dedupKey format, href targets, and the
// honest suppression rules (credential red/amber only, external excludes
// the portal actor, form intake silent at zero failures).

import { describe, expect, it } from 'vitest'
import {
  DECISION_ACTIONS,
  credentialExpiryNotifications,
  externalGateDecisionNotifications,
  formIntakeNotifications,
  sheetReviewNotifications,
  syncFreshnessNotifications,
} from '../lib/notifications'
import type { ComplianceCredential } from '../lib/compliance'
import type { FormIntakeFailureRow, WorkflowStatusRow } from '../lib/status'
import type { AuditEntry, SheetQueueCard } from '../lib/underwriting'

const TODAY = '2026-07-10'

function cred(over: Partial<ComplianceCredential>): ComplianceCredential {
  return {
    id: 'c1',
    name: 'FSRA Licence',
    holder: 'Michael Fox',
    expires_on: null,
    date_confirmed: true,
    notes: null,
    status: 'active',
    created_at: TODAY,
    created_by: 'mfox',
    updated_at: TODAY,
    updated_by: 'mfox',
    retired_at: null,
    retired_by: null,
    ...over,
  }
}

function audit(over: Partial<AuditEntry>): AuditEntry {
  return {
    id: 'a1',
    createdAt: '2026-07-10T12:00:00Z',
    actor: 'michael-cli',
    actorClerkId: null,
    actorEmail: 'mfox@foxmortgage.ca',
    action: 'rates.sheet_approved',
    dealId: null,
    dealRef: null,
    detail: null,
    ...over,
  }
}

describe('sheetReviewNotifications', () => {
  it('emits one per intel item with the expected dedupKey and href', () => {
    const sheets: SheetQueueCard[] = [
      { intelItemId: 'i1', lenderSlug: 'scotia', asOfDate: '2026-07-09', quotes: [{}, {}] as any },
      { intelItemId: 'i2', lenderSlug: null, asOfDate: null, quotes: [{}] as any },
    ]
    const out = sheetReviewNotifications(sheets)
    expect(out).toHaveLength(2)
    expect(out[0].dedupKey).toBe('sheet_review:i1')
    expect(out[0].category).toBe('sheet_review')
    expect(out[0].href).toBe('/portal/admin/approvals')
    expect(out[0].title).toContain('scotia')
    expect(out[1].body).toContain('1 quote')
  })
})

describe('credentialExpiryNotifications', () => {
  it('emits only red/amber active credentials, keyed by id + tone', () => {
    const creds = [
      cred({ id: 'red1', expires_on: '2026-07-15' }), // 5 days -> red
      cred({ id: 'amb1', expires_on: '2026-08-20' }), // ~41 days -> amber
      cred({ id: 'ok1', expires_on: '2027-01-01' }), // far -> ok, suppressed
      cred({ id: 'nod', expires_on: null }), // no date, suppressed
      cred({ id: 'ret', expires_on: '2026-07-12', status: 'retired' }), // retired, suppressed
    ]
    const out = credentialExpiryNotifications(creds, TODAY)
    const keys = out.map(n => n.dedupKey)
    expect(keys).toEqual(['credential_expiry:red1:red', 'credential_expiry:amb1:amber'])
    expect(out.every(n => n.href === '/portal/admin/compliance')).toBe(true)
    expect(out.every(n => n.category === 'credential_expiry')).toBe(true)
  })

  it('labels a past-due credential as past due', () => {
    const out = credentialExpiryNotifications([cred({ id: 'p', expires_on: '2026-07-01' })], TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].title).toContain('past due')
    expect(out[0].dedupKey).toBe('credential_expiry:p:red')
  })
})

describe('formIntakeNotifications', () => {
  const failures: FormIntakeFailureRow[] = [
    { id: 'f1', createdAt: '2026-07-10T00:00:00Z', source: 'contact', errorDetail: 'Zoho 500' },
    { id: 'f2', createdAt: '2026-07-10T01:00:00Z', source: 'investor-inquiry', errorDetail: null },
  ]

  it('emits nothing when zohoFailed is 0', () => {
    expect(formIntakeNotifications({ zohoFailed: 0 }, failures)).toEqual([])
  })

  it('emits nothing when zohoFailed is null', () => {
    expect(formIntakeNotifications({ zohoFailed: null }, failures)).toEqual([])
  })

  it('emits one per failure id when zohoFailed > 0', () => {
    const out = formIntakeNotifications({ zohoFailed: 2 }, failures)
    expect(out.map(n => n.dedupKey)).toEqual(['form_intake:f1', 'form_intake:f2'])
    expect(out.every(n => n.href === '/portal/admin/status')).toBe(true)
    expect(out[0].title).toContain('contact')
  })
})

describe('syncFreshnessNotifications', () => {
  function wf(over: Partial<WorkflowStatusRow>): WorkflowStatusRow {
    return {
      id: 'w1',
      name: 'Nightly Categorization',
      area: 'bookkeeping',
      active: true,
      lastExecStatus: 'success',
      lastExecAt: '2026-07-10T06:00:00Z',
      error: null,
      ...over,
    }
  }

  it('emits for an errored last run and an inactive-with-error row, skips healthy', () => {
    const rows = [
      wf({ id: 'err', lastExecStatus: 'error', lastExecAt: '2026-07-10T06:00:00Z' }),
      wf({ id: 'inact', active: false, lastExecStatus: null, lastExecAt: null, error: 'unreachable' }),
      wf({ id: 'healthy' }),
      wf({ id: 'inact-clean', active: false, error: null }), // inactive but no error -> skip
    ]
    const out = syncFreshnessNotifications(rows)
    expect(out.map(n => n.dedupKey)).toEqual([
      'sync_freshness:err:2026-07-10T06:00:00Z',
      'sync_freshness:inact:none',
    ])
    expect(out.every(n => n.href === '/portal/admin/status')).toBe(true)
  })
})

describe('externalGateDecisionNotifications', () => {
  it('excludes portal-actor decisions and non-decision actions', () => {
    const rows = [
      audit({ id: 'cli', actor: 'michael-cli', action: 'rates.sheet_approved', dealRef: 'BRXM-F1' }),
      audit({ id: 'portal', actor: 'portal', action: 'rates.sheet_approved' }),
      audit({ id: 'noise', actor: 'michael-cli', action: 'intake.something' }),
    ]
    const out = externalGateDecisionNotifications(rows, DECISION_ACTIONS)
    expect(out).toHaveLength(1)
    expect(out[0].dedupKey).toBe('gate_decision_external:cli')
    expect(out[0].title).toContain('michael-cli decided rates.sheet_approved on BRXM-F1')
    expect(out[0].href).toBe('/portal/admin/deals?ref=BRXM-F1')
  })

  it('falls back to the audit view when no dealRef is present', () => {
    const out = externalGateDecisionNotifications(
      [audit({ id: 'x', dealRef: null })],
      DECISION_ACTIONS,
    )
    expect(out[0].href).toBe('/portal/admin/audit')
  })
})
