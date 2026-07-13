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
import { SMM_LENDER_ALIASES } from '@/config/smm-lender-aliases'
import { TIER_MIRROR } from '@/config/lender-tiers'

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

// The two hand-written tier maps must never drift (the exact failure mode
// that caused the duplicate classifier): a feed string whose slug carries a
// tier in the quote-side mirror must state the SAME tier, and a book slug
// deliberately absent from the mirror (b2b: prime AND alternative programs)
// must be tier-unknown on the feed side too.
describe('tier maps stay in lockstep', () => {
  it('every slugged feed alias agrees with TIER_MIRROR, unknowns included', () => {
    for (const [key, alias] of Object.entries(SMM_LENDER_ALIASES)) {
      if (!alias.slug || !alias.inBook) continue // feed-only lenders carry their own judgment
      const mirror = TIER_MIRROR[alias.slug]?.tier ?? null
      expect(`${key} -> ${alias.tier}`).toBe(`${key} -> ${mirror}`)
    }
    expect(TIER_MIRROR['b2b']).toBeUndefined()
    expect(SMM_LENDER_ALIASES['b2b bank'].tier).toBeNull()
  })
})
