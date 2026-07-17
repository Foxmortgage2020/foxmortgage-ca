// View-as write protection — the server half of the structural read-only
// contract. Every partner-portal write route runs the request's
// impersonation state through viewAsWriteRejection before doing anything.

import { describe, expect, it } from 'vitest'
import { viewAsWriteRejection, VIEW_AS_REJECTION_MESSAGE } from '../lib/view-as'

describe('viewAsWriteRejection', () => {
  it('rejects any active view-as context with the contract shape', () => {
    const rejection = viewAsWriteRejection({
      role: 'fp',
      partnerId: '7112178000003669036',
      partnerName: 'Dana Okafor',
    })
    expect(rejection).not.toBeNull()
    expect(rejection!.status).toBe(403)
    expect(rejection!.body.error).toBe('ImpersonationReadOnly')
    expect(rejection!.body.message).toBe(VIEW_AS_REJECTION_MESSAGE)
  })

  it('rejects the boolean form the routes pass (isImpersonating())', () => {
    expect(viewAsWriteRejection(true)).not.toBeNull()
  })

  it('allows writes when no view-as is active', () => {
    expect(viewAsWriteRejection(null)).toBeNull()
    expect(viewAsWriteRejection(undefined)).toBeNull()
    expect(viewAsWriteRejection(false)).toBeNull()
  })

  it('the copy tells the viewer how to get out, without leaking mechanics', () => {
    expect(VIEW_AS_REJECTION_MESSAGE).toContain('Exit impersonation')
    expect(VIEW_AS_REJECTION_MESSAGE.toLowerCase()).not.toContain('cookie')
  })
})
