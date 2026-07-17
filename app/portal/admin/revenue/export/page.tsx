// Practice History export: a clean, slide-ready view of the chart with the
// Fox Mortgage mark and house style, free of portal chrome. Two ways out:
// Download PNG (client-side raster of the self-contained slide SVG) and Print
// / Save as PDF (print CSS isolates the slide so the sidebar never appears).
// It is going on a screen in front of mortgage professionals, so it looks
// like it belongs there.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { STAGE_WEIGHTS, isFundedStage } from '@/config/pipeline'
import { weightedPipelineVolume } from '@/lib/pacing'
import { computePipeline, getAllDealsRevenue, pipelineStageVolumes } from '@/lib/zoho-admin'
import { practiceHistoryYears } from '@/lib/revenue'
import { fmtShortDate, torontoTodayYMD } from '@/lib/dates'
import PracticeHistorySlide from '@/components/admin/PracticeHistorySlide'
import PngDownloadButton from '@/components/admin/PngDownloadButton'

export const dynamic = 'force-dynamic'

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #ph-export, #ph-export * { visibility: visible !important; }
  #ph-export { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; padding: 0 !important; }
  .no-print { display: none !important; }
  @page { size: landscape; margin: 10mm; }
}
`

export default async function PracticeHistoryExportPage() {
  await requirePermission('revenue.view')

  const todayYMD = torontoTodayYMD()
  const year = Number(todayYMD.slice(0, 4))

  let deals
  try {
    deals = await getAllDealsRevenue()
  } catch {
    deals = null
  }

  if (!deals) {
    return (
      <div className="max-w-2xl">
        <Link href="/portal/admin/revenue" className="text-sm font-semibold text-navy hover:text-ink">
          &larr; Back to Revenue
        </Link>
        <div className="mt-4 bg-white border border-cool-200 rounded-xl p-5">
          <p className="text-sm text-cool-500 font-ui">
            The Zoho read failed, so the export cannot render right now. Reload in a moment; nothing
            here caches a stale figure.
          </p>
        </div>
      </div>
    )
  }

  const pipeline = computePipeline(deals, todayYMD)
  const weighted = weightedPipelineVolume(pipelineStageVolumes(pipeline), STAGE_WEIGHTS)
  const years = practiceHistoryYears(deals, isFundedStage, year)
  const asOfLabel = `as of ${fmtShortDate(todayYMD)}, ${year}`

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/portal/admin/revenue"
            className="text-sm font-semibold text-navy hover:text-ink"
          >
            &larr; Back to Revenue
          </Link>
          <p className="text-xs text-cool-400 font-ui mt-1">
            Slide-ready. Download a high-resolution PNG, or print to a landscape PDF.
          </p>
        </div>
        <PngDownloadButton
          targetId="ph-slide-svg"
          filename={`fox-mortgage-practice-history-${todayYMD}.png`}
        />
      </div>

      <div
        id="ph-export"
        className="mx-auto bg-white border border-cool-200 rounded-xl p-4 sm:p-6"
        style={{
          maxWidth: 1040,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        <PracticeHistorySlide
          svgId="ph-slide-svg"
          years={years}
          weightedPipeline={weighted}
          activeFiles={pipeline.openCount}
          asOfLabel={asOfLabel}
          variant="export"
        />
      </div>
    </div>
  )
}
