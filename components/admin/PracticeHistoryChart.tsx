// Practice History chart — a bespoke inline SVG, server-renderable, in house
// style. Funded volume by year 2021 to present with deal counts; the current
// year is split into funded-to-date (solid) and the corrected weighted
// pipeline (hatched, labeled a projection) so the two can never be confused.
// Milestones render plainly at the right edge. There is no trend line, no
// projection curve, no visual device that implies an inflection the data does
// not show — the honest reading is five flat years, then the systems arriving
// too recently to have moved anything. That restraint is the whole point.
//
// The SVG uses a fixed viewBox and scales to its container, so the same
// component serves the Revenue page (embedded) and the export view (large),
// and rasterizes cleanly for the PNG download.

import { MILESTONES, type Milestone } from '@/config/milestones'

export interface PracticeHistoryYear {
  year: number
  volume: number
  count: number
  isCurrent?: boolean
  // 2021 is flagged: the earliest funded record is April 2021, so the year
  // may be partial (no Jan-Mar history).
  partial?: boolean
}

export interface PracticeHistoryChartProps {
  years: PracticeHistoryYear[] // ascending, current year included (funded YTD)
  weightedPipeline: number // corrected weighted pipeline stacked on current year
  activeFiles: number // active-pipeline file count, for the projection label
  milestones?: Milestone[]
  asOfLabel?: string
  // 'card' trims the legend copy; 'export' shows the fuller framing.
  variant?: 'card' | 'export'
  // When set, the root <svg> is positioned/sized for nesting inside a larger
  // slide SVG (the export composition) instead of filling its container.
  nested?: { x: number; y: number; width: number; height: number }
}

const NAVY = '#032133'
const PROJECTION_GRAY = '#7E8E97'
const GRID = '#e5e7eb'
const INK = '#334155'
const MUTE = '#94a3b8'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
function money(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

export default function PracticeHistoryChart({
  years,
  weightedPipeline,
  activeFiles,
  milestones = MILESTONES,
  asOfLabel,
  variant = 'card',
  nested,
}: PracticeHistoryChartProps) {
  // ── Geometry ──────────────────────────────────────────────────────────────
  const W = 1200
  const H = 640
  const plotLeft = 100
  const plotRight = 880
  const plotTop = 78
  const plotBottom = 536
  const plotW = plotRight - plotLeft
  const plotH = plotBottom - plotTop

  const current = years.find(y => y.isCurrent)
  const currentFunded = current?.volume ?? 0
  const currentTotal = currentFunded + weightedPipeline

  const rawMax = Math.max(
    currentTotal,
    ...years.filter(y => !y.isCurrent).map(y => y.volume),
    1,
  )
  // Round the axis up to a clean $2M gridline above the tallest bar, leaving
  // headroom for the value label.
  const yMax = Math.ceil((rawMax * 1.06) / 2_000_000) * 2_000_000
  const yScale = (v: number) => plotBottom - (v / yMax) * plotH

  const band = plotW / years.length
  const barW = Math.min(84, band * 0.6)
  const barX = (i: number) => plotLeft + i * band + (band - barW) / 2

  // Average over COMPLETE (non-current) years — a horizontal reference, not a
  // trend. It reinforces the flat reading rather than implying movement.
  const complete = years.filter(y => !y.isCurrent)
  const avg =
    complete.length > 0 ? complete.reduce((s, y) => s + y.volume, 0) / complete.length : 0

  const gridVals: number[] = []
  for (let v = 0; v <= yMax; v += 2_000_000) gridVals.push(v)

  const currentIdx = years.findIndex(y => y.isCurrent)
  const currentBarCX = currentIdx >= 0 ? barX(currentIdx) + barW / 2 : plotRight

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      {...(nested
        ? { x: nested.x, y: nested.y, width: nested.width, height: nested.height }
        : { width: '100%' })}
      role="img"
      aria-label="Fox Mortgage funded volume by year, 2021 to present"
      style={{ fontFamily: 'var(--font-montserrat), sans-serif', maxWidth: nested ? undefined : '100%', height: nested ? undefined : 'auto' }}
    >
      <defs>
        {/* Diagonal gray hatch — the projection texture. Never a solid fill,
            so a forecast can never be mistaken for a funded actual. */}
        <pattern
          id="ph-hatch"
          patternUnits="userSpaceOnUse"
          width="9"
          height="9"
          patternTransform="rotate(45)"
        >
          <rect width="9" height="9" fill={PROJECTION_GRAY} opacity="0.14" />
          <line x1="0" y1="0" x2="0" y2="9" stroke={PROJECTION_GRAY} strokeWidth="3" />
        </pattern>
      </defs>

      {/* Gridlines + y-axis dollar labels */}
      {gridVals.map(v => (
        <g key={v}>
          <line x1={plotLeft} y1={yScale(v)} x2={plotRight} y2={yScale(v)} stroke={GRID} strokeWidth="1" />
          <text x={plotLeft - 12} y={yScale(v) + 4} textAnchor="end" fontSize="17" fill={MUTE}>
            {v === 0 ? '$0' : money(v)}
          </text>
        </g>
      ))}

      {/* Complete-years average reference (horizontal, dashed, labeled) */}
      {avg > 0 && (
        <g>
          <line
            x1={plotLeft}
            y1={yScale(avg)}
            x2={plotRight}
            y2={yScale(avg)}
            stroke={NAVY}
            strokeWidth="1.5"
            strokeDasharray="6 5"
            opacity="0.55"
          />
          <text x={plotRight - 4} y={yScale(avg) - 8} textAnchor="end" fontSize="15" fill={NAVY} opacity="0.75">
            {complete.length}-yr avg {money(avg)}
          </text>
        </g>
      )}

      {/* Bars */}
      {years.map((y, i) => {
        const x = barX(i)
        if (y.isCurrent) {
          const fundedTop = yScale(currentFunded)
          const projTop = yScale(currentTotal)
          return (
            <g key={y.year}>
              {/* Funded to date — solid, an actual */}
              <rect x={x} y={fundedTop} width={barW} height={plotBottom - fundedTop} fill={NAVY} rx="2" />
              {/* Weighted pipeline — hatched, a projection */}
              {weightedPipeline > 0 && (
                <rect
                  x={x}
                  y={projTop}
                  width={barW}
                  height={fundedTop - projTop}
                  fill="url(#ph-hatch)"
                  stroke={PROJECTION_GRAY}
                  strokeWidth="1"
                  rx="2"
                />
              )}
              {/* Funded value + count, above the funded portion */}
              <text x={x + barW / 2} y={fundedTop - 10} textAnchor="middle" fontSize="17" fontWeight="700" fill={NAVY}>
                {money(currentFunded)}
              </text>
              {/* Projection value, centered inside the hatched segment so it
                  never crowds the average line at the top of the plot. */}
              {weightedPipeline > 0 && (
                <text
                  x={x + barW / 2}
                  y={(projTop + fundedTop) / 2 + 5}
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="600"
                  fill={NAVY}
                >
                  +{money(weightedPipeline)}
                </text>
              )}
            </g>
          )
        }
        const top = yScale(y.volume)
        return (
          <g key={y.year}>
            <rect x={x} y={top} width={barW} height={plotBottom - top} fill={NAVY} rx="2" />
            <text x={x + barW / 2} y={top - 10} textAnchor="middle" fontSize="17" fontWeight="700" fill={NAVY}>
              {money(y.volume)}
            </text>
          </g>
        )
      })}

      {/* Baseline */}
      <line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke={NAVY} strokeWidth="1.5" />

      {/* X-axis: year + funded count (+ partial flag on 2021) */}
      {years.map((y, i) => {
        const cx = barX(i) + barW / 2
        return (
          <g key={y.year}>
            <text x={cx} y={plotBottom + 28} textAnchor="middle" fontSize="19" fontWeight="700" fill={NAVY} style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
              {y.year}
            </text>
            <text x={cx} y={plotBottom + 48} textAnchor="middle" fontSize="14" fill={INK}>
              {y.count} funded{y.isCurrent ? ' YTD' : ''}
            </text>
            {y.partial && (
              <text x={cx} y={plotBottom + 66} textAnchor="middle" fontSize="12" fill={MUTE}>
                partial (from Apr)
              </text>
            )}
          </g>
        )
      })}

      {/* Legend */}
      <g transform={`translate(${plotLeft}, ${plotTop - 44})`} fontSize="15" fill={INK}>
        <rect x="0" y="-12" width="16" height="16" fill={NAVY} rx="2" />
        <text x="22" y="1">Funded (actual)</text>
        <rect x="185" y="-12" width="16" height="16" fill="url(#ph-hatch)" stroke={PROJECTION_GRAY} strokeWidth="1" rx="2" />
        <text x="207" y="1">Weighted pipeline (projection, estimated)</text>
      </g>

      {/* Milestone panel at the right edge, plainly listed */}
      <g>
        {/* Connector from the current-year bar to the panel */}
        <line
          x1={currentBarCX}
          y1={yScale(currentTotal) - 6}
          x2={plotRight + 26}
          y2={plotTop + 8}
          stroke={MUTE}
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <g transform={`translate(${plotRight + 26}, ${plotTop})`}>
          <text x="0" y="0" fontSize="16" fontWeight="700" fill={NAVY} style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
            New in {current?.year ?? ''}
          </text>
          {milestones.map((m, i) => (
            <g key={`${m.month}-${m.label}`} transform={`translate(0, ${26 + i * 44})`}>
              <circle cx="6" cy="-4" r="5" fill={PROJECTION_GRAY} />
              <text x="20" y="0" fontSize="14.5" fontWeight="600" fill={NAVY}>
                {monthLabel(m.month)}
              </text>
              <text x="20" y="18" fontSize="13.5" fill={INK}>
                {m.label}
              </text>
            </g>
          ))}
          {/* Plain <text> (no foreignObject) so the slide rasterizes cleanly
              to PNG. Manually wrapped to the panel width. */}
          <text x="0" y={26 + milestones.length * 44 + 22} fontSize="12.5" fill={MUTE}>
            <tspan x="0" dy="0">Weeks old. Mortgages take 60 to 90 days,</tspan>
            <tspan x="0" dy="17">so the funded bars cannot have responded</tspan>
            <tspan x="0" dy="17">yet. The record is shown as it stands.</tspan>
          </text>
        </g>
      </g>

      {asOfLabel && (
        <text x={plotRight} y={H - 12} textAnchor="end" fontSize="13" fill={MUTE}>
          {asOfLabel}
        </text>
      )}
    </svg>
  )
}
