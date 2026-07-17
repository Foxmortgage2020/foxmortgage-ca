// Design system (B3): the summary strip — joined white tiles on a hairline
// track at desktop, wrap chips at phone width. Extracted from the B2b Deals
// phase spine byte-for-byte; every merged page's strip is this component.
// Poppins carries the numerals (tabular), Montserrat the labels.

export interface StripTile {
  key: string
  label: string
  value: string
  sub?: string
  tone?: 'caution'
}

export default function SummaryStrip({ tiles }: { tiles: StripTile[] }) {
  return (
    <>
      {/* Desktop: joined tiles on hairline dividers. */}
      <div className="mb-4 hidden overflow-hidden rounded-[9px] border border-cool-200 bg-cool-200 md:flex md:gap-px">
        {tiles.map(t => (
          <div key={t.key} className="flex-1 bg-white px-4 py-3">
            <div
              className={`font-heading text-[21px] font-semibold leading-none tabular-nums ${
                t.tone === 'caution' ? 'text-caution' : 'text-navy'
              }`}
            >
              {t.value}
            </div>
            <div className="mt-1.5 font-ui text-xs text-cool-700">{t.label}</div>
            {t.sub && <div className="mt-0.5 font-ui text-[11px] text-cool-500">{t.sub}</div>}
          </div>
        ))}
      </div>
      {/* Phone: the same values as wrap chips. */}
      <div className="mb-3 flex flex-wrap gap-2 md:hidden">
        {tiles.map(t => (
          <div
            key={t.key}
            className="flex items-baseline gap-1.5 rounded-[7px] border border-cool-200 bg-white px-2.5 py-1.5"
          >
            <span
              className={`font-heading text-[13px] font-semibold tabular-nums ${
                t.tone === 'caution' ? 'text-caution' : 'text-navy'
              }`}
            >
              {t.value}
            </span>
            <span className="font-ui text-[10.5px] text-cool-700">{t.label}</span>
          </div>
        ))}
      </div>
    </>
  )
}
