// Prime — the SERVER-SIDE mirror of the workbench prime reference
// (fox-underwriting/knowledge/prime.json, served by GET /api/knowledge/
// rates-reference). Same rationale as config/lender-provinces.ts: the live
// reference is authoritative on token-bearing surfaces (the Rates page computes
// effective floating rates against it live), but the Opportunities board and the
// savings PDF run server-side without a gates token, so they need a
// server-readable copy to price a floating comparable (e.g. a conventional
// adjustable at prime minus 0.50). KEEP IN LOCKSTEP with prime.json.
//
// Verified live 2026-07-12 (via the provincial-availability report): bank prime
// is 4.45% (CMLS sheet 2026-07-09, corroborated book-wide). The only per-lender
// override is Kootenay's KSCU PLR 5.50 — moot here, because Kootenay is a BC
// credit union excluded from every Ontario surface. Every effective rate the
// server prices carries this as-of so a computed figure is never mistaken for a
// printed one.

export const PRIME_MIRROR = {
  value: 4.45,
  asOf: '2026-07-09',
  source: 'CMLS rate sheet 2026-07-09, corroborated book-wide (provincial-availability report).',
} as const

/** Per-lender prime overrides (credit-union PLR). Kootenay is BC-only and
 * excluded everywhere, so this is here for completeness/lockstep only. */
export const PRIME_OVERRIDES: Record<string, number> = {
  kootenay: 5.5,
}

export function primeFor(lenderSlug: string): number {
  return PRIME_OVERRIDES[lenderSlug] ?? PRIME_MIRROR.value
}
