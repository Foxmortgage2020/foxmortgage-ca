// Lender identity (Rates v3, Part 2): the display-name map and the monogram
// initials. The map's hand-written entries fix acronym casing the title-case
// fallback would mangle; the fallback keeps unknown lenders reading cleanly.

import { describe, expect, it } from 'vitest'
import {
  HAND_WRITTEN_LENDER_SLUGS,
  lenderDisplayName,
  lenderInitials,
  LENDER_NAMES,
  titleCaseSlug,
} from '@/config/lenders'

describe('lenderDisplayName', () => {
  it('uses the hand-written name where one exists (correct acronym casing)', () => {
    expect(lenderDisplayName('mcap')).toBe('MCAP')
    expect(lenderDisplayName('rfa')).toBe('RFA')
    expect(lenderDisplayName('nbc-optimum')).toBe('NBC Optimum')
    expect(lenderDisplayName('first-national')).toBe('First National')
  })

  it('falls back to a title-cased slug for anything unlisted, never throws', () => {
    expect(lenderDisplayName('some-new-lender')).toBe('Some New Lender')
    expect(lenderDisplayName(null)).toBe('Lender')
    expect(lenderDisplayName('')).toBe('Lender')
  })

  it('title-case fallback is what the map overrides for acronyms', () => {
    // Proof the hand-written entries earn their place: the fallback would
    // mangle these, which is exactly why they are listed.
    expect(titleCaseSlug('nbc-optimum')).toBe('Nbc Optimum')
    expect(titleCaseSlug('rfa')).toBe('Rfa')
    expect(LENDER_NAMES['nbc-optimum']).toBe('NBC Optimum')
    expect(HAND_WRITTEN_LENDER_SLUGS).toContain('mcap')
  })
})

describe('monogram initials — deliberate, not an error state', () => {
  it('shows a short all-caps acronym whole and derives clean initials otherwise', () => {
    expect(lenderInitials('MCAP', 'mcap')).toBe('MCAP')
    expect(lenderInitials('RFA', 'rfa')).toBe('RFA')
    expect(lenderInitials('First National', 'first-national')).toBe('FN')
    expect(lenderInitials('Haventree Bank', 'haventree')).toBe('HB')
    expect(lenderInitials('Scotiabank', 'scotia')).toBe('SC')
  })

  it('falls back to the slug when no name is given', () => {
    expect(lenderInitials('', 'kootenay')).toBe('KO')
    expect(lenderInitials('', 'strive')).toBe('ST')
  })
})
