// Provincial availability — the SERVER-SIDE mirror of the workbench lender
// registry (fox-underwriting/knowledge/lender-registry.json, the
// provincial-availability session 2026-07-12).
//
// WHY A MIRROR: province is a workbench lender fact and the live registry
// (GET /api/knowledge/lenders, fields provinces / provinces_source /
// provinces_as_of) is AUTHORITATIVE. The portal reads it live on
// token-bearing surfaces (the Rates page and the PDF routes, which forward the
// browser-minted gates token). But the Opportunities board, the SMM analysis,
// Ask Fox, and any server render run without a gates token (the portal cannot
// mint one server-side — CLAUDE.md), so they need a server-readable copy. This
// file is that copy. lib/eligibility.ts prefers the live registry whenever it
// is passed one; this mirror is the fallback.
//
// KEEP IN LOCKSTEP with lender-registry.json. Today the registry confirms only
// the two BC credit unions; every other lender is the honest value "unknown"
// (availability not yet sourced — Michael confirms provinces from his own
// knowledge). "unknown" is NOT "available": an unknown lender shows internally
// with an "availability not confirmed" flag and never on a client-facing
// document (the fail-closed rule). The count of unknowns is surfaced on the
// Rates page so the gap stays visible and gets filled.
//
// Verified live 2026-07-12: registry has coast-capital=['BC'], kootenay=['BC'],
// all 22 others "unknown".

/** An availability fact: named provinces, all of Canada, or not-yet-sourced. */
export type Provinces = string[] | 'national' | 'unknown'

export interface ProvinceFact {
  provinces: Provinces
  source: string
  asOf: string
}

// The confirmed entries. Anything not listed defaults to 'unknown' (fail-closed).
export const PROVINCE_MIRROR: Record<string, ProvinceFact> = {
  kootenay: {
    provinces: ['BC'],
    source:
      'Kootenay Savings Credit Union, a British Columbia credit union (Trail, BC, BCFSA-regulated). Confirmed by Michael, 2026-07-12.',
    asOf: '2026-07-12',
  },
  'coast-capital': {
    provinces: ['BC'],
    source: 'Coast Capital Savings, a British Columbia credit union. Confirmed by Michael, 2026-07-12.',
    asOf: '2026-07-12',
  },
}

export const MIRROR_AS_OF = '2026-07-12'

// The default for any lender not explicitly confirmed above: unknown, honest.
export const UNKNOWN_FACT: ProvinceFact = {
  provinces: 'unknown',
  source: 'Provincial licensing not yet sourced; confirm before quoting to a client.',
  asOf: MIRROR_AS_OF,
}
