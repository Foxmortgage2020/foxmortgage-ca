// Pure helpers for the lender knowledge pages. Isomorphic: no fetches, no
// Clerk, no env. The as-of discipline lives here: stale knowledge is worse
// than no knowledge, so anything older than the threshold gets flagged
// visibly, and no figure ever renders stripped of its date.

export const KNOWLEDGE_STALE_DAYS = 90

function ymdToUTC(ymd: string): number | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function daysBetweenYMD(fromYMD: string, toYMD: string): number | null {
  const a = ymdToUTC(fromYMD)
  const b = ymdToUTC(toYMD)
  if (a === null || b === null) return null
  return Math.round((b - a) / 86_400_000)
}

// A profile with no as_of date is the deliberately-withheld case, handled
// separately; staleness only applies to dated profiles.
export function isStaleAsOf(
  asOf: string | null | undefined,
  todayYMD: string,
  thresholdDays: number = KNOWLEDGE_STALE_DAYS,
): boolean {
  if (!asOf) return false
  const days = daysBetweenYMD(asOf, todayYMD)
  if (days === null) return false
  return days > thresholdDays
}

// ─── Structured figure extraction ────────────────────────────────────────────
// Profiles nest figure objects shaped { value, source, as_of, md_evidence }.
// The walker collects them with their dotted path so the lender page can
// render every figure beside its as-of date and source. Plain scalar leaves
// render too (as context rows without a date). Meta keys are skipped.

export interface FigureRow {
  path: string
  value: string
  asOf: string | null
  source: string | null
}

const META_KEYS = new Set(['slug', 'name', 'source_files', 'as_of', 'status', 'known_gaps'])

const isFigureNode = (o: unknown): o is Record<string, unknown> =>
  typeof o === 'object' && o !== null && !Array.isArray(o) && 'value' in (o as Record<string, unknown>)

function fmtLeaf(v: unknown): string {
  if (v === null || v === undefined) return 'not recorded'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function profileFigureRows(profile: Record<string, unknown> | null): FigureRow[] {
  if (!profile) return []
  const rows: FigureRow[] = []
  const walk = (node: unknown, path: string[], depth: number) => {
    if (depth > 6 || node === null || node === undefined) return
    if (isFigureNode(node)) {
      rows.push({
        path: path.join(' · ').replace(/_/g, ' '),
        value: fmtLeaf(node.value),
        asOf: typeof node.as_of === 'string' ? node.as_of : null,
        source: typeof node.source === 'string' ? node.source : null,
      })
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, [...path, String(i + 1)], depth + 1))
      return
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (depth === 0 && META_KEYS.has(k)) continue
        walk(v, [...path, k], depth + 1)
      }
      return
    }
    // Scalar leaf without figure wrapping: context, no date of its own.
    rows.push({ path: path.join(' · ').replace(/_/g, ' '), value: fmtLeaf(node), asOf: null, source: null })
  }
  walk(profile, [], 0)
  return rows
}

export function profileKnownGaps(profile: Record<string, unknown> | null): string[] {
  if (!profile) return []
  const gaps = profile.known_gaps
  if (!Array.isArray(gaps)) return []
  return gaps.map(g => (typeof g === 'string' ? g : JSON.stringify(g)))
}
