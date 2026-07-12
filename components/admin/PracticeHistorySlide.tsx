// The export slide: one self-contained SVG that composes the Fox Mortgage
// mark, the title, the Practice History chart (nested), and a source +
// licence footer. Being a single SVG, it prints faithfully and rasterizes to
// one clean PNG with no portal chrome. House style throughout.

import PracticeHistoryChart, { type PracticeHistoryChartProps } from '@/components/admin/PracticeHistoryChart'

const NAVY = '#032133'
const LIME = '#95D600'
const MUTE = '#94a3b8'
const INK = '#334155'

// The brand mark from public/icons/icon.svg, inlined so the slide is fully
// self-contained (navy squircle + lime "F").
function FoxMark({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 512 512">
      <rect width="512" height="512" rx="112.64" ry="112.64" fill={NAVY} />
      <g fill={LIME}>
        <rect x="161.3824" y="112.64" width="68.8128" height="286.72" />
        <rect x="161.3824" y="112.64" width="189.2352" height="68.8128" />
        <rect x="161.3824" y="221.5936" width="155.172864" height="68.8128" />
      </g>
    </svg>
  )
}

export interface PracticeHistorySlideProps extends PracticeHistoryChartProps {
  svgId?: string
}

export default function PracticeHistorySlide({ svgId, ...chart }: PracticeHistorySlideProps) {
  const W = 1200
  const H = 828
  return (
    <svg
      id={svgId}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Fox Mortgage Practice History slide"
      style={{ fontFamily: 'var(--font-montserrat), sans-serif', maxWidth: '100%', height: 'auto' }}
    >
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />

      {/* Brand band */}
      <FoxMark x={40} y={26} size={56} />
      <text x={112} y={52} fontSize="32" fontWeight="700" fill={NAVY} style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
        Fox Mortgage
      </text>
      <text x={113} y={76} fontSize="14" fill={MUTE}>
        Mortgage Agent, Level 2
      </text>
      <text x={W - 40} y={46} textAnchor="end" fontSize="26" fontWeight="700" fill={NAVY} style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
        Practice History
      </text>
      <text x={W - 40} y={72} textAnchor="end" fontSize="15" fill={INK}>
        Funded volume by year, 2021 to present
      </text>
      <line x1={40} y1={98} x2={W - 40} y2={98} stroke={LIME} strokeWidth="3" />

      {/* Chart, nested. The slide footer carries the as-of, so suppress the
          chart's own copy to avoid printing it twice. */}
      <PracticeHistoryChart {...chart} asOfLabel={undefined} nested={{ x: 0, y: 108, width: W, height: 640 }} />

      {/* Footer */}
      <line x1={40} y1={H - 62} x2={W - 40} y2={H - 62} stroke="#e5e7eb" strokeWidth="1" />
      <text x={40} y={H - 38} fontSize="13.5" fill={INK}>
        Source: Zoho CRM funded deals (Mortgage Funded and Funded stages). Weighted pipeline is a
        stage-weighted estimate of the active pipeline, not funded volume.
      </text>
      <text x={40} y={H - 18} fontSize="13.5" fill={MUTE}>
        Mortgage Agent, Level 2 · BRX Mortgage · FSRA 13463{chart.asOfLabel ? ` · ${chart.asOfLabel}` : ''}
      </text>
    </svg>
  )
}
