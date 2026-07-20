// Input-commit helpers (2026-07-18). The house rule: no keystroke ever triggers
// a network call or a heavy recompute. Numeric inputs that drive matching or
// fetching commit on blur or Enter (this parser), or debounce at 600ms or more
// with in-flight cancellation. See the house rule in CLAUDE.md.
//
// Pure, so it tests in node.

/**
 * Parse the raw text of a numeric input at commit time (blur / Enter). Tolerant
 * of the ways a person types a dollar figure (commas, spaces, a leading $) so a
 * pasted "1,500,000" commits cleanly. Empty or non-numeric commits to null (the
 * field's "not set" state); a negative or non-finite value is rejected to null.
 */
export function commitNumericInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s,$]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}
