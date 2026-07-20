import { describe, expect, it } from 'vitest'
import { shapeContactDraft, validateContactDraft } from '../lib/lender-contacts'

describe('validateContactDraft', () => {
  it('refuses a draft with no name', () => {
    expect(validateContactDraft({ name: '   ', phone: '6475551234' })).toBe('A contact needs a name.')
  })

  it('refuses a draft with a name but no way to reach them', () => {
    expect(validateContactDraft({ name: 'Jordan Wells' })).toBe('Add a phone number or an email.')
    expect(validateContactDraft({ name: 'Jordan Wells', phone: '  ', email: '' })).toBe(
      'Add a phone number or an email.',
    )
  })

  it('accepts a name with a phone', () => {
    expect(validateContactDraft({ name: 'Jordan Wells', phone: '6475551234' })).toBeNull()
  })

  it('accepts a name with an email', () => {
    expect(validateContactDraft({ name: 'Priya Anand', email: 'priya@example.com' })).toBeNull()
  })
})

describe('shapeContactDraft', () => {
  it('trims strings and drops empties', () => {
    const d = shapeContactDraft({ name: '  Jordan Wells ', title: '', email: 'JW@example.com ', note: '   ' })
    expect(d.name).toBe('Jordan Wells')
    expect(d.title).toBeUndefined()
    expect(d.email).toBe('JW@example.com')
    expect(d.note).toBeUndefined()
  })

  it('ignores non-string fields and bounds long values', () => {
    const d = shapeContactDraft({ name: 12345, phone: '6475551234', extension: '218', note: 'x'.repeat(5000) })
    expect(d.name).toBe('') // a non-string name becomes empty, which validateContactDraft then refuses
    expect(d.phone).toBe('6475551234')
    expect(d.extension).toBe('218')
    expect(d.note?.length).toBe(1000)
  })

  it('a shaped junk body is caught by validate (name required)', () => {
    expect(validateContactDraft(shapeContactDraft({ phone: '6475551234' }))).toBe('A contact needs a name.')
  })
})
