// Current-vs-history for the deal-room calc stacks (B6.2 Task 5). The workbench
// keeps every recompute of a ratio/income calc as its own row; the desk should
// show the CURRENT one full-size and fold prior recomputes behind a "History (N)"
// disclosure so a superseded, implausible value never sits beside the live one.
// Display truth only — nothing is deleted or recomputed here.

export interface CurrentAndHistory<T> {
  key: string
  current: T
  history: T[]
}

/**
 * Group rows by a natural identity key, sort each group newest-first by a
 * timestamp, and split into the current row ([0]) and its prior recomputes.
 * Groups are returned newest-current first. A distinct key (e.g. a different
 * borrower or lender) is its own group — it is a parallel current, not history.
 */
export function currentAndHistory<T>(
  rows: T[],
  keyOf: (r: T) => string,
  timeOf: (r: T) => string,
): CurrentAndHistory<T>[] {
  const byKey = new Map<string, T[]>()
  for (const r of rows) {
    const k = keyOf(r)
    const list = byKey.get(k) ?? []
    list.push(r)
    byKey.set(k, list)
  }
  const groups: CurrentAndHistory<T>[] = []
  byKey.forEach((list, key) => {
    const sorted = [...list].sort((a, b) => timeOf(b).localeCompare(timeOf(a)))
    groups.push({ key, current: sorted[0]!, history: sorted.slice(1) })
  })
  groups.sort((a, b) => timeOf(b.current).localeCompare(timeOf(a.current)))
  return groups
}
