/**
 * Bank of Canada posted-rate lookup.
 *
 * Fetches the 5-year conventional mortgage posted rate (BoC Valet series
 * V80691335) closest to a target date. Used by the /penalty calculator and the
 * /refinance analyzer to fill posted-rate fields without the client needing to
 * dig up the number themselves.
 *
 * Extracted from app/penalty so both pages share one implementation. Behaviour
 * is identical to the original inline version.
 */

export interface BoCRate {
  rate: number
  date: string
}

export async function fetchBoCRate(targetDate: string): Promise<BoCRate | null> {
  const d = new Date(targetDate)
  const start = new Date(d)
  start.setDate(start.getDate() - 14)
  const end = new Date(d)
  end.setDate(end.getDate() + 14)
  const fmtDate = (x: Date) => x.toISOString().slice(0, 10)
  const url = `https://www.bankofcanada.ca/valet/observations/V80691335/json?start_date=${fmtDate(start)}&end_date=${fmtDate(end)}`
  const res = await fetch(url)
  const data = await res.json()
  const obs = (data?.observations ?? []) as Array<{ d: string; V80691335: { v: string } }>
  if (obs.length === 0) return null
  let closest = obs[0]
  let minDiff = Math.abs(new Date(obs[0].d).getTime() - d.getTime())
  for (const o of obs) {
    const diff = Math.abs(new Date(o.d).getTime() - d.getTime())
    if (diff < minDiff) {
      minDiff = diff
      closest = o
    }
  }
  return { rate: parseFloat(closest.V80691335.v), date: closest.d }
}
